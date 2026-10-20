// @vitest-environment jsdom
import React from "react";
import {
  render as renderComponent,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PassengerPaymentMethod } from "@drts/contracts";
import {
  PassengerPaymentClient,
  PassengerClient,
} from "../../../packages/passenger-client/src/index";
import { PaymentMethodsScreen } from "../../../apps/passenger-app-web/components/payment/payment-methods-screen";
import {
  PaymentMethodChoice,
  PassengerPaymentStatus,
  UnpaidPaymentNotice,
} from "../../../apps/passenger-app-web/components/payment/payment-summary";
import { createSyntheticPaymentFields } from "../../../apps/passenger-app-web/lib/payment/synthetic-fields";
import { paymentFieldsForRuntime } from "../../../apps/passenger-app-web/lib/payment/runtime-fields";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import {
  apiWireResponse,
  me,
} from "../pax-web-shell-20261009/api-wire-fixtures";
import Home from "../../../apps/passenger-app-web/app/page";
import PaymentMethodsPage from "../../../apps/passenger-app-web/app/account/payment-methods/page";
import { paymentMethodExpired } from "../../../packages/passenger-client/src/payment/state";
import { bookingFixture } from "../pax-web-booking-ui-20261009/fixture";

// Root declares no SDK dependency. Resolve its exact public source entry,
// preserving every actual producer; production uses the app's declared package.
vi.mock(
  "@drts/passenger-client",
  async () => import("../../../packages/passenger-client/src/index"),
);
vi.mock(
  "@drts/ui-web",
  async () => import("../../../packages/ui-web/src/index"),
);
const navigation = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
// Use the actual context from the app's declared Next dependency, not a
// different root peer instance or a reloaded/global router mock.
const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const render = (element: React.ReactElement) =>
  renderComponent(
    <AppRouterContext.Provider value={navigation}>
      {element}
    </AppRouterContext.Provider>,
  );
const origin = "https://ride.example.test";
const first: PassengerPaymentMethod = {
  paymentMethodId: "synthetic_method_alpha",
  cardType: "SYNTHETIC",
  last4: "0001",
  expiryMonth: "12",
  expiryYear: "2031",
  isDefault: true,
};
const second: PassengerPaymentMethod = {
  ...first,
  paymentMethodId: "synthetic_method_beta",
  last4: "0002",
  isDefault: false,
};
let methods: PassengerPaymentMethod[];
let actor: string;
let commands: Array<{ method: string; path: string; body: unknown }>;
let reply:
  | ((
      method: string,
      path: string,
      body: unknown,
    ) => Response | Promise<Response> | undefined)
  | undefined;
async function externalHttp(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (url.startsWith("/api/passenger-app/")) {
    const method = (init?.method ?? "GET") as "GET" | "POST" | "PUT" | "DELETE";
    return bff[method](
      new NextRequest(new URL(url, origin), {
        ...init,
        method,
        headers: {
          ...(init?.headers as Record<string, string>),
          cookie: "pax_session=synthetic_session",
          origin,
        },
      }),
      {
        params: Promise.resolve({
          path: url
            .replace("/api/passenger-app/", "")
            .split("/")
            .map(decodeURIComponent),
        }),
      },
    );
  }
  const path = new URL(url).pathname;
  const method = init?.method ?? "GET";
  let body: unknown;
  if (init?.body) {
    const text =
      typeof init.body === "string"
        ? init.body
        : new TextDecoder().decode(init.body as ArrayBuffer);
    if (text.length > 0) body = JSON.parse(text);
  }
  if (path.endsWith("/me"))
    return apiWireResponse({
      ...me,
      account: { ...me.account, drtsPassengerId: actor },
    });
  commands.push({ method, path, body });
  const custom = await reply?.(method, path, body);
  if (custom) return custom;
  if (method === "GET") {
    return apiWireResponse({ methods });
  }
  if (method === "POST") {
    const saved = {
      ...second,
      paymentMethodId: "synthetic_bound_method",
      last4: "0003",
    };
    methods = [...methods, saved];
    return apiWireResponse({ status: "completed", method: saved });
  }
  if (method === "PUT") {
    const id = path.split("/").at(-2)!;
    methods = methods.map((row) => ({
      ...row,
      isDefault: row.paymentMethodId === id,
    }));
    return apiWireResponse({
      status: "completed",
      method: methods.find((row) => row.paymentMethodId === id),
    });
  }
  if (method === "DELETE") {
    const id = path.split("/").at(-1)!;
    methods = methods.filter((row) => row.paymentMethodId !== id);
    return apiWireResponse({ success: true });
  }
  throw new Error("unexpected_external_boundary");
}
function mount(
  fields = true,
  extra: Partial<React.ComponentProps<typeof PaymentMethodsScreen>> = {},
) {
  const fetchFn = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => externalHttp(url, init);
  return render(
    <PaymentMethodsScreen
      client={new PassengerPaymentClient({ baseUrl: "", fetchFn })}
      accountClient={new PassengerClient({ baseUrl: "", fetchFn })}
      {...(fields
        ? {
            fields: {
              status: "ready" as const,
              port: createSyntheticPaymentFields({
                runtime: "nonproduction",
                issueSyntheticNonce: () => "synthetic_field_alpha",
              }),
            },
          }
        : {})}
      {...extra}
    />,
  );
}
async function loaded() {
  await screen.findByText("SYNTHETIC •••• 0001");
}
async function add() {
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "新增信用卡" }));
  await screen.findByRole("button", { name: "綁定卡片" });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_API_URL", "https://api.example.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  methods = [{ ...first }, { ...second }];
  actor = "synthetic_actor_alpha";
  commands = [];
  reply = undefined;
  navigation.push.mockReset();
  vi.stubGlobal("fetch", externalHttp);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("R1 actual provider lifetime at asynchronous binding boundaries", () => {
  async function holdAccount(stage: "before_collect" | "before_send") {
    const previousFetch = globalThis.fetch;
    let accountReads = 0;
    let resolveAccount!: (value: Response) => void;
    const accountReply = new Promise<Response>((resolve) => {
      resolveAccount = resolve;
    });
    const blockedRead = stage === "before_collect" ? 3 : 4;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (
        String(url).startsWith("https://api.example.test") &&
        new URL(String(url)).pathname.endsWith("/me")
      ) {
        accountReads += 1;
        if (accountReads === blockedRead) return accountReply;
      }
      return previousFetch(url, init);
    });
    const port = {
      kind: "hosted" as const,
      collectCredential: vi.fn(async () => ({
        providerToken: "synthetic_original_provider_credential",
      })),
      dispose: vi.fn(),
    };
    const view = render(
      <PaymentMethodsScreen
        fields={{ status: "ready", port }}
        hostedFieldsView={<div>synthetic external hosted provider</div>}
      />,
    );
    await add();
    fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
    await waitFor(() => expect(accountReads).toBe(blockedRead));
    expect(port.collectCredential).toHaveBeenCalledTimes(
      stage === "before_collect" ? 0 : 1,
    );
    return {
      view,
      port,
      release: () =>
        resolveAccount(
          apiWireResponse({
            ...me,
            account: { ...me.account, drtsPassengerId: actor },
          }),
        ),
    };
  }
  function renderProvider(
    view: ReturnType<typeof render>,
    fields: React.ComponentProps<typeof PaymentMethodsScreen>["fields"],
  ) {
    view.rerender(
      <AppRouterContext.Provider value={navigation}>
        <PaymentMethodsScreen
          {...(fields ? { fields } : {})}
          hostedFieldsView={<div>synthetic external hosted provider</div>}
        />
      </AppRouterContext.Provider>,
    );
  }
  async function settledWithoutBinding() {
    await waitFor(() => {
      const back = screen.queryByRole("button", {
        name: "返回卡片清單",
      }) as HTMLButtonElement | null;
      expect(back === null || !back.disabled).toBe(true);
    });
    expect(commands.filter((row) => row.method === "POST")).toHaveLength(0);
    expect(screen.queryByText("SYNTHETIC •••• 0003")).toBeNull();
  }
  it.each([
    ["before_collect", "unavailable"],
    ["before_collect", "replaced"],
    ["before_send", "unavailable"],
    ["before_send", "replaced"],
  ] as const)(
    "R1 %s: %s provider neither submits old credential nor auto-collects replacement",
    async (stage, availability) => {
      const f = await holdAccount(stage);
      f.port.dispose();
      const replacement = {
        kind: "hosted" as const,
        collectCredential: vi.fn(async () => ({
          providerToken: "synthetic_replacement_provider_credential",
        })),
        dispose: vi.fn(),
      };
      renderProvider(
        f.view,
        availability === "unavailable"
          ? { status: "unavailable" }
          : { status: "ready", port: replacement },
      );
      f.release();
      await settledWithoutBinding();
      expect(f.port.collectCredential).toHaveBeenCalledTimes(
        stage === "before_collect" ? 0 : 1,
      );
      expect(replacement.collectCredential).not.toHaveBeenCalled();
    },
  );
  it("R1 detached then reattached old port does not revive an in-flight credential", async () => {
    const f = await holdAccount("before_send");
    f.port.dispose();
    renderProvider(f.view, { status: "unavailable" });
    renderProvider(f.view, { status: "ready", port: f.port });
    f.release();
    await settledWithoutBinding();
    expect(f.port.collectCredential).toHaveBeenCalledTimes(1);
  });
  it("R1 lawful same live port still binds exactly once after the final account read", async () => {
    const f = await holdAccount("before_send");
    f.release();
    await screen.findByText("SYNTHETIC •••• 0003");
    expect(commands.filter((row) => row.method === "POST")).toEqual([
      {
        method: "POST",
        path: "/api/passenger-app/payment-methods",
        body: { providerToken: "synthetic_original_provider_credential" },
      },
    ]);
    expect(f.port.dispose).not.toHaveBeenCalled();
    expect(f.port.collectCredential).toHaveBeenCalledTimes(1);
  });
});
describe("actual A20-A21 component → client → bounded BFF → serializer; external HTTP/field/navigation only", () => {
  it("lists masked brand/last4/expiry and actual default, not credentials", async () => {
    mount();
    await loaded();
    expect(screen.getAllByText("到期 12/2031")).toHaveLength(2);
    expect(screen.getByText("預設付款卡片")).toBeTruthy();
    expect(
      document.querySelectorAll(
        'input[type="number"],input[type="password"],input[type="text"]',
      ),
    ).toHaveLength(0);
    expect(document.body.textContent).not.toContain(
      "synthetic_credential_field__alpha",
    );
  });
  it("actual PUT/default acknowledged and reloads authority before reflecting new default", async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "設為預設" }));
    await waitFor(() =>
      expect(
        methods.find((row) => row.paymentMethodId === second.paymentMethodId)
          ?.isDefault,
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        within(
          screen.getByText("SYNTHETIC •••• 0002").parentElement!,
        ).getByText("預設付款卡片"),
      ).toBeTruthy(),
    );
    expect(commands.find((row) => row.method === "PUT")?.body).toEqual({
      paymentMethodId: second.paymentMethodId,
    });
  });
  it("delete cancellation has zero mutating calls; confirmed deletion uses DELETE and durable-read boundary", async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "刪除" })[1]!);
    await screen.findByRole("heading", { name: "確定要刪除這張卡片嗎？" });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(commands.filter((row) => row.method === "DELETE")).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "刪除" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "確定刪除" }));
    await waitFor(() =>
      expect(screen.queryByText("SYNTHETIC •••• 0002")).toBeNull(),
    );
    expect(commands.filter((row) => row.method === "DELETE")).toHaveLength(1);
  });
  it("DELETE success:false cannot falsely remove a method", async () => {
    reply = (verb) =>
      verb === "DELETE" ? apiWireResponse({ success: false }) : undefined;
    mount();
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "刪除" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "確定刪除" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("SYNTHETIC •••• 0001")).toBeTruthy();
  });
  it("actual synthetic field port binds only opaque command then verifies actual list", async () => {
    mount();
    await add();
    fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
    await screen.findByText("SYNTHETIC •••• 0003");
    expect(commands.find((row) => row.method === "POST")?.body).toEqual({
      providerToken: "synthetic_credential_field__alpha",
    });
    expect(document.body.textContent).not.toContain(
      "synthetic_credential_field__alpha",
    );
  });
  it("missing contracted fields is disabled, not an implicit successful fake", async () => {
    mount(false);
    await add();
    expect(
      (screen.getByRole("button", { name: "綁定卡片" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
    expect(commands.some((row) => row.method === "POST")).toBe(false);
  });
  it("explicit decline remains failure with a real corrective action", async () => {
    reply = (verb) =>
      verb === "POST"
        ? Response.json({ error: { code: "card_declined" } }, { status: 400 })
        : undefined;
    mount();
    await add();
    fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
    await screen.findByText("綁定失敗或發卡行拒絕，請改用其他卡片。");
    expect(
      (screen.getByRole("button", { name: "綁定卡片" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.queryByText("SYNTHETIC •••• 0003")).toBeNull();
  });
  it.each(["pending", "network", "503", "invalid"])(
    "unknown/pending %s never clears into new credential/binding",
    async (outcome) => {
      reply = (verb) => {
        if (verb !== "POST") return;
        if (outcome === "network") throw new Error("synthetic_private");
        if (outcome === "503")
          return Response.json(
            { error: { code: "unavailable" } },
            { status: 503 },
          );
        return apiWireResponse(
          outcome === "pending" ? { status: "pending" } : {},
        );
      };
      mount();
      await add();
      fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
      await waitFor(() =>
        expect(
          (
            screen.getByRole("button", {
              name: "綁定卡片",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true),
      );
      await screen.findByText("聯絡客服 (02-2944-0985)");
      fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
      expect(commands.filter((row) => row.method === "POST")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "返回卡片清單" }));
      expect(
        (
          screen.getByRole("button", {
            name: "新增信用卡",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(document.body.textContent).not.toContain("synthetic_private");
    },
  );
  it.each([true, false])(
    "3DS action is not completion; origin approved=%s",
    async (approved) => {
      reply = (verb) =>
        verb === "POST"
          ? apiWireResponse({
              status: "action_required",
              nextActionUrl: "https://synthetic-psp.example.invalid/action",
            })
          : undefined;
      mount(true, {
        approvedActionOrigins: approved
          ? ["https://synthetic-psp.example.invalid"]
          : [],
      });
      await add();
      fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
      await screen.findByText("此卡片需要付款商的安全驗證，尚未完成綁定。");
      expect(
        screen.queryByRole("link", { name: "前往付款商安全驗證" }) !== null,
      ).toBe(approved);
      expect(screen.queryByText("SYNTHETIC •••• 0003")).toBeNull();
      expect(
        (screen.getByRole("button", { name: "綁定卡片" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    },
  );
  it("401 clears owned metadata and routes login", async () => {
    reply = (verb) =>
      verb === "GET"
        ? Response.json({ error: { code: "unauthorized" } }, { status: 401 })
        : undefined;
    mount();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("SYNTHETIC •••• 0001")).toBeNull();
  });
  it("account switch during fields collection fences mutation and old methods", async () => {
    let release!: (value: { providerToken: string }) => void;
    const result = new Promise<{ providerToken: string }>((resolve) => {
      release = resolve;
    });
    const dispose = vi.fn();
    const collect = vi.fn(() => result);
    mount(true, {
      fields: {
        status: "ready",
        port: { kind: "hosted", collectCredential: collect, dispose },
      },
      hostedFieldsView: <div>synthetic hosted provider boundary</div>,
    });
    await add();
    fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
    await waitFor(() => expect(collect).toHaveBeenCalledTimes(1));
    actor = "synthetic_actor_beta";
    release({ providerToken: "synthetic_delayed" });
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/login"));
    expect(commands.filter((row) => row.method === "POST")).toHaveLength(0);
    expect(dispose).toHaveBeenCalled();
    expect(screen.queryByText("SYNTHETIC •••• 0001")).toBeNull();
  });
  it("late field reply after unmount cannot bind", async () => {
    let release!: (value: { providerToken: string }) => void;
    const result = new Promise<{ providerToken: string }>((resolve) => {
      release = resolve;
    });
    const collect = vi.fn(() => result);
    const view = mount(true, {
      fields: {
        status: "ready",
        port: { kind: "hosted", collectCredential: collect, dispose: vi.fn() },
      },
      hostedFieldsView: <div>synthetic hosted provider</div>,
    });
    await add();
    fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
    await waitFor(() => expect(collect).toHaveBeenCalledTimes(1));
    view.unmount();
    release({ providerToken: "synthetic_late" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(commands.filter((row) => row.method === "POST")).toHaveLength(0);
  });
  it.each([403, 500])(
    "read HTTP%s is failure, not an empty owned list",
    async (status) => {
      reply = (verb) =>
        verb === "GET"
          ? Response.json({ error: { code: "unavailable" } }, { status })
          : undefined;
      mount();
      await screen.findByText("目前無法確認付款方式，請重新查詢。");
      expect(screen.queryByText("尚未設定付款卡片")).toBeNull();
      expect(
        (
          screen.getByRole("button", {
            name: "新增信用卡",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    },
  );
  it("delete unpaid refusal preserves the method and offers only real CS", async () => {
    reply = (verb) =>
      verb === "DELETE"
        ? Response.json(
            { error: { code: "pending_payment_block" } },
            { status: 409 },
          )
        : undefined;
    mount();
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "刪除" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "確定刪除" }));
    await screen.findByText(/更新卡片不代表款項已結清/);
    expect(
      screen
        .getByRole("link", { name: "聯絡客服 (02-2944-0985)" })
        .getAttribute("href"),
    ).toBe("tel:02-2944-0985");
    expect(methods).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("SYNTHETIC •••• 0001")).toBeTruthy();
  });
  it("completed bind without owned readback stays unknown and cannot rebind", async () => {
    reply = (verb) =>
      verb === "POST"
        ? apiWireResponse({
            status: "completed",
            method: { ...second, paymentMethodId: "synthetic_unobserved" },
          })
        : undefined;
    mount();
    await add();
    fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
    await screen.findByText(
      "付款操作結果尚未確認，請勿重複綁定；請聯絡客服確認。",
    );
    expect(
      (screen.getByRole("button", { name: "綁定卡片" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByText("SYNTHETIC •••• 0003")).toBeNull();
  });
  it("completed default without authoritative readback cannot change default UI", async () => {
    reply = (verb) =>
      verb === "PUT"
        ? apiWireResponse({
            status: "completed",
            method: { ...second, isDefault: true },
          })
        : undefined;
    mount();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "設為預設" }));
    await screen.findByText("付款方式尚未完成更新，請重新查詢或聯絡客服。");
    expect(
      within(screen.getByText("SYNTHETIC •••• 0001").parentElement!).getByText(
        "預設付款卡片",
      ),
    ).toBeTruthy();
    expect(
      within(
        screen.getByText("SYNTHETIC •••• 0002").parentElement!,
      ).queryByText("預設付款卡片"),
    ).toBeNull();
  });
  it("duplicate bind clicks cannot collect or POST twice", async () => {
    let release!: (command: { providerToken: string }) => void;
    const result = new Promise<{ providerToken: string }>((resolve) => {
      release = resolve;
    });
    const collect = vi.fn(() => result);
    mount(true, {
      fields: {
        status: "ready",
        port: { kind: "hosted", collectCredential: collect, dispose: vi.fn() },
      },
      hostedFieldsView: <div>synthetic hosted fields</div>,
    });
    await add();
    const button = screen.getByRole("button", { name: "綁定卡片" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(collect).toHaveBeenCalledTimes(1));
    expect(commands.filter((row) => row.method === "POST")).toHaveLength(0);
    release({ providerToken: "synthetic_duplicate_guard" });
    await screen.findByText("SYNTHETIC •••• 0003");
    expect(commands.filter((row) => row.method === "POST")).toHaveLength(1);
  });
  it("account switching across owned-list readback clears old metadata", async () => {
    reply = (verb) => {
      if (verb !== "GET") return;
      actor = "synthetic_actor_beta";
      return apiWireResponse({ methods });
    };
    mount();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("SYNTHETIC •••• 0001")).toBeNull();
    expect(commands.filter((row) => row.method !== "GET")).toHaveLength(0);
  });
  it("explicit nonproduction page survives actual StrictMode port lifecycle", async () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER", "synthetic");
    render(
      <React.StrictMode>
        <PaymentMethodsPage />
      </React.StrictMode>,
    );
    await add();
    fireEvent.click(screen.getByRole("button", { name: "綁定卡片" }));
    await screen.findByText("SYNTHETIC •••• 0003");
    expect(commands.filter((row) => row.method === "POST")).toHaveLength(1);
    expect(
      (
        commands.find((row) => row.method === "POST")?.body as {
          providerToken: string;
        }
      ).providerToken,
    ).toMatch(/^synthetic_credential_[A-Za-z_-]+$/);
  });
  it("delete confirmation focus and cancel restore the actual list heading", async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getAllByRole("button", { name: "刪除" })[0]!);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "刪除卡片確認" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "付款方式" }),
      ),
    );
    expect(commands.some((row) => row.method === "DELETE")).toBe(false);
  });
  it("expired methods remain visible but cannot become default", async () => {
    methods[1] = { ...second, expiryYear: "2001" };
    mount();
    await loaded();
    expect(screen.getByText("到期 12/2001 · 已到期")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "設為預設" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("explicit empty list is not a fabricated method or enabled booking", async () => {
    methods = [];
    mount();
    await screen.findByText("尚未設定付款卡片");
    expect(screen.queryByText("SYNTHETIC •••• 0001")).toBeNull();
  });
});
async function rootConfirmation() {
  await screen.findByLabelText("預約時間");
  for (const [index, name] of ["上車", "下車"].entries()) {
    const input =
      screen.getAllByPlaceholderText("請輸入街道、地點或地標")[index]!;
    const picker = input.closest("[data-address-map-picker]") as HTMLElement;
    fireEvent.change(input, { target: { value: name } });
    fireEvent.click(within(picker).getByRole("button", { name: "搜尋" }));
    fireEvent.click(
      await within(picker).findByRole("button", { name: new RegExp(name) }),
    );
    await waitFor(() =>
      expect(
        within(picker).queryByRole("button", { name: "清除選點" }),
      ).not.toBeNull(),
    );
  }
  fireEvent.change(screen.getByLabelText("預約時間"), {
    target: { value: "2099-10-11T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "試算車資" }));
  await screen.findByLabelText("我已確認費用與優惠說明");
  return screen.getByRole("dialog");
}
function rootFixture() {
  const f = bookingFixture();
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => {
    const target = new URL(String(url), origin);
    if (
      target.origin === "https://api.example.test" &&
      target.pathname.endsWith("/payment-methods")
    )
      return Promise.resolve(apiWireResponse({ methods }));
    return original(url, init);
  });
  return f;
}
describe("actual root Book + opaque payment composition, not a placeholder", () => {
  it("real default and changed radio flow into exact existing Book create command", async () => {
    const f = rootFixture();
    render(<Home />);
    const dialog = await rootConfirmation();
    await within(dialog).findByRole("radio", { name: /SYNTHETIC.*0001/ });
    fireEvent.click(within(dialog).getAllByRole("radio")[1]!);
    fireEvent.click(screen.getByLabelText("我已確認費用與優惠說明"));
    fireEvent.click(screen.getByRole("button", { name: "確認叫車" }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/ride?rideId=synthetic-owned-order",
      ),
    );
    expect(
      f.calls.find((row) => row.path.endsWith("/rides"))?.body.paymentMethodId,
    ).toBe(second.paymentMethodId);
  });
  it("no owned method cannot create and guides actual add-card route", async () => {
    methods = [];
    const f = rootFixture();
    render(<Home />);
    const dialog = await rootConfirmation();
    await within(dialog).findByText("請先設定付款卡片才能預約叫車");
    fireEvent.click(screen.getByLabelText("我已確認費用與優惠說明"));
    expect(
      (screen.getByRole("button", { name: "確認叫車" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "新增信用卡" }));
    expect(navigation.push).toHaveBeenCalledWith("/account/payment-methods");
    expect(f.calls.some((row) => row.path.endsWith("/rides"))).toBe(false);
  });
  it("actual pending-payment refusal is visible inside active modal and prevents a new create", async () => {
    const f = rootFixture();
    f.errors.set("POST /api/passenger-app/rides", {
      status: 409,
      code: "pending_payment_block",
    });
    render(<Home />);
    const dialog = await rootConfirmation();
    await within(dialog).findByRole("radio", { name: /SYNTHETIC.*0001/ });
    fireEvent.click(screen.getByLabelText("我已確認費用與優惠說明"));
    fireEvent.click(screen.getByRole("button", { name: "確認叫車" }));
    await within(dialog).findByText(
      "更新卡片不代表款項已結清；原未付款行程請聯絡客服處理。",
    );
    expect(
      within(dialog)
        .getByRole("link", { name: "聯絡客服 (02-2944-0985)" })
        .getAttribute("href"),
    ).toBe("tel:02-2944-0985");
    expect(
      (screen.getByRole("button", { name: "確認叫車" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(f.calls.filter((row) => row.path.endsWith("/rides"))).toHaveLength(
      1,
    );
  });
});
describe("A22/A23 actual reusable selector and truthful payment status", () => {
  it("actual radio selection preserves opaque ID and inherited native fieldset disables controls", () => {
    const select = vi.fn();
    render(
      <fieldset disabled>
        <PaymentMethodChoice
          methods={[first, second]}
          selectedId={first.paymentMethodId}
          onSelect={select}
        />
      </fieldset>,
    );
    expect(
      (screen.getAllByRole("radio")[0] as HTMLInputElement).matches(
        ":disabled",
      ),
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", { name: "新增信用卡" }) as HTMLButtonElement
      ).matches(":disabled"),
    ).toBe(true);
    expect(select).not.toHaveBeenCalled();
  });
  it("actual enabled selector hands only an owned-list method to caller", () => {
    const select = vi.fn();
    render(<PaymentMethodChoice methods={[first, second]} onSelect={select} />);
    fireEvent.click(screen.getAllByRole("radio")[1]!);
    expect(select).toHaveBeenCalledWith(second);
  });
  it("empty selector guides actual add-card route", () => {
    render(<PaymentMethodChoice methods={[]} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "新增信用卡" }));
    expect(navigation.push).toHaveBeenCalledWith("/account/payment-methods");
  });
  it.each([
    "not_selected",
    "authorized",
    "captured",
    "failed",
    "refunded",
    "manual_recovery",
    undefined,
    "unknown",
  ])("status%s never defaults to paid", (status) => {
    render(
      <PassengerPaymentStatus {...(status === undefined ? {} : { status })} />,
    );
    const node = screen.getByRole("status");
    expect(node.textContent === "付款完成").toBe(status === "captured");
  });
  it("unpaid recovery offers CS, not new charge/refund or invented settlement", () => {
    render(<UnpaidPaymentNotice />);
    expect(
      screen
        .getByRole("link", { name: "聯絡客服 (02-2944-0985)" })
        .getAttribute("href"),
    ).toBe("tel:02-2944-0985");
    expect(
      screen.getByText(
        "更新卡片不代表款項已結清；原未付款行程請聯絡客服處理。",
      ),
    ).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it.each(["bad", "13", "00"])(
    "malformed expiry month%s fails closed",
    (month) => {
      expect(
        paymentMethodExpired(
          { ...first, expiryMonth: month },
          new Date("2026-10-11T00:00:00Z"),
        ),
      ).toBe(true);
    },
  );
  it("current expiry month remains valid until next month; invalid clock fails closed", () => {
    expect(
      paymentMethodExpired(
        { ...first, expiryMonth: "10", expiryYear: "2026" },
        new Date("2026-10-11T00:00:00Z"),
      ),
    ).toBe(false);
    expect(
      paymentMethodExpired(
        { ...first, expiryMonth: "09", expiryYear: "2026" },
        new Date("2026-10-11T00:00:00Z"),
      ),
    ).toBe(true);
    expect(paymentMethodExpired(first, new Date("invalid"))).toBe(true);
  });
  it("runtime missing provider is unavailable and production synthetic fails before issuer", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER", "");
    expect(paymentFieldsForRuntime()).toEqual({ status: "unavailable" });
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER", "synthetic");
    vi.stubEnv("NODE_ENV", "production");
    expect(paymentFieldsForRuntime).toThrow("forbidden");
  });
});
