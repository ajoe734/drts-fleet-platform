// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { waitFor, fireEvent, getByRole } from "@testing-library/dom";
import { renderToString } from "react-dom/server";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ children, href, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});
import {
  BookScreen,
  PassengerEmbed,
} from "../../../apps/referral-embed-web/components/passenger-embed";

const context = {
  entry: {
    entrySlug: "quote-entry",
    displayName: "測試社區",
    entryHost: "partner.example.test",
    brandingMetadata: {},
  },
  session: {
    handoffId: "handoff",
    recoveryScope: "opaque-scope-a",
    identityActive: true,
    partnerEntrySlug: "quote-entry",
    entryHost: "partner.example.test",
  },
  state: "handoff",
  screen: "book",
  requestedScreen: "book",
  handoff: { apiKey: null, partnerUserRef: null },
  decision: { requestedEntryHost: "partner.example.test", block: false },
  accent: "#123456",
  strings: {
    appName: "社區",
    displayName: "測試社區",
    supportPhone: "0800-000-000",
  },
  issues: [],
  fallbackEntry: null,
};
let root: Root | undefined;
afterEach(() => {
  root?.unmount();
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(node));
  return host;
}
function quote(
  quoteId = "quote-a",
  expiresAt = new Date(Date.now() + 900000).toISOString(),
) {
  return {
    quoteId,
    fixedPrice: false,
    isGuaranteed: false,
    estimatedMin: 265,
    estimatedMax: 340,
    expiresAt,
    quotedFareRuleVersion: "published-taxi-v1",
  };
}
function ok(data: unknown) {
  return Response.json({ ok: true, data });
}
function submit(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>(
    '[data-drt-operation="referral-create"]',
  )!;
}
function navigationPort() {
  const assign = vi.fn(),
    testWindow = Object.create(window);
  Object.defineProperty(testWindow, "location", {
    value: { assign },
    configurable: true,
  });
  vi.stubGlobal("window", testWindow);
  return assign;
}

it("keeps the mounted booking disabled while its authorized quote has not arrived", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  flushSync(() => root!.render(<BookScreen context={context as never} />));
  await waitFor(() =>
    expect(
      host.querySelector<HTMLInputElement>('[aria-label="上車地點"]')?.disabled,
    ).toBe(false),
  );
  expect(
    host.querySelector<HTMLButtonElement>(
      '[data-drt-operation="referral-create"]',
    )?.disabled,
  ).toBe(true);
  expect(host.textContent).not.toContain("約 NT$ 290");
});

it("retains disabled booking controls in the actual SSR output", () => {
  const node = document.createElement("div");
  node.innerHTML = renderToString(<BookScreen context={context as never} />);
  expect(
    node.querySelector<HTMLButtonElement>(
      '[data-drt-operation="referral-create"]',
    )?.disabled,
  ).toBe(true);
});

it("ignores a late quote for the old route and only enables the matching current quote", async () => {
  const requests: Array<{ body: any; finish: (r: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, init) =>
        new Promise<Response>((finish) =>
          requests.push({ body: JSON.parse(init.body), finish }),
        ),
    ),
  );
  const host = mount(<BookScreen context={context as never} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.change(host.querySelector('[aria-label="上車地點"]')!, {
    target: { value: "changed real pickup" },
  });
  await waitFor(() => expect(requests).toHaveLength(2));
  requests[0]!.finish(ok(quote("old-route")));
  await Promise.resolve();
  expect(submit(host).disabled).toBe(true);
  requests[1]!.finish(ok(quote("current-route")));
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  expect(requests[1]!.body.pickupAddress).toBe("changed real pickup");
});

it("preserves exact original key/body over a lost booking ACK, reload and original quote expiry", async () => {
  const commands: any[] = [],
    assign = navigationPort();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      if (url === "/api/referral/quote") return ok(quote());
      commands.push({ body: JSON.parse(init.body), headers: init.headers });
      if (commands.length === 1)
        throw new Error("controlled ACK lost after commit");
      return ok({
        orderId: "same-order-a",
        quote: { quoteId: commands[0].body.quoteId },
        confirmedAt: "2026-10-20T02:00:00Z",
      });
    }),
  );
  let host = mount(<BookScreen context={context as never} />);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  fireEvent.click(submit(host));
  await waitFor(() => expect(host.textContent).toContain("重送原叫車要求"));
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="上車地點"]')?.disabled,
  ).toBe(true);
  const key = "referral.booking.recovery.v1:opaque-scope-a";
  const original = JSON.parse(sessionStorage.getItem(key)!);
  expect(original.command).toEqual(commands[0].body);
  flushSync(() => root!.unmount());
  root = undefined;
  host.remove();
  host = mount(<BookScreen context={context as never} />);
  await waitFor(() =>
    expect(submit(host).textContent).toContain("重送原叫車要求"),
  );
  fireEvent.click(submit(host));
  await waitFor(() => expect(assign).toHaveBeenCalledOnce());
  expect(commands[1]).toEqual(commands[0]);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(assign.mock.calls[0]![0]).toContain("orderId=same-order-a");
});

it("never sends another account's pending command and rejects malformed local recovery without granting authority", async () => {
  sessionStorage.setItem(
    "referral.booking.recovery.v1:opaque-scope-a",
    JSON.stringify({
      scope: "opaque-scope-a",
      command: {
        entrySlug: "quote-entry",
        quoteId: "old-subject-quote",
        idempotencyKey: "old-subject-key",
      },
      form: { pickupAddress: { untrusted: true } },
    }),
  );
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => ok(quote()),
  );
  vi.stubGlobal("fetch", fetch);
  const b = {
    ...context,
    session: { ...context.session, recoveryScope: "opaque-scope-b" },
  };
  const host = mount(<BookScreen context={b as never} />);
  await waitFor(() => expect(submit(host).disabled).toBe(false));
  expect(host.textContent).not.toContain("重送原叫車要求");
  expect(fetch.mock.calls.every(([url]) => url === "/api/referral/quote")).toBe(
    true,
  );
});

it("shows a recoverable Chinese error and keeps submit disabled when quote storage is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          ok: false,
          error: {
            code: "FARE_QUOTE_UNAVAILABLE",
            message: "unsafe upstream details",
          },
        },
        { status: 503 },
      ),
    ),
  );
  const host = mount(<BookScreen context={context as never} />);
  await waitFor(() => expect(host.textContent).toContain("目前無法試算車資"));
  expect(submit(host).disabled).toBe(true);
  expect(host.textContent).not.toContain("FARE_QUOTE_");
  expect(host.textContent).not.toContain("unsafe upstream");
  expect(getByRole(host, "button", { name: "重新試算" })).toBeTruthy();
});

it.each(["account-switch", "unmount"])(
  "retires a late booking ACK after %s while keeping the original uncertain intent",
  async (mode) => {
    let finish!: (r: Response) => void;
    const assign = navigationPort(),
      calls: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (url === "/api/referral/quote") return ok(quote());
        calls.push(JSON.parse(init.body));
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const host = mount(<BookScreen context={context as never} />);
    await waitFor(() => expect(submit(host).disabled).toBe(false));
    fireEvent.click(submit(host));
    await waitFor(() => expect(calls).toHaveLength(1));
    if (mode === "unmount") {
      flushSync(() => root!.unmount());
      root = undefined;
    } else
      flushSync(() =>
        root!.render(
          <BookScreen
            context={
              {
                ...context,
                entry: { ...context.entry, entrySlug: "other-entry" },
                session: {
                  ...context.session,
                  partnerEntrySlug: "other-entry",
                  recoveryScope: "other-subject-scope",
                },
              } as never
            }
          />,
        ),
      );
    finish(
      ok({
        orderId: "old-scope-order",
        quote: { quoteId: calls[0].quoteId },
        confirmedAt: "2026-10-20T02:00:00Z",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(assign).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        sessionStorage.getItem("referral.booking.recovery.v1:opaque-scope-a")!,
      ).command,
    ).toEqual(calls[0]);
    if (mode === "account-switch") {
      expect(host.textContent).not.toContain("old-scope-order");
      await waitFor(() => expect(submit(host).disabled).toBe(false));
    }
  },
);

function completedData(status = "completed") {
  return {
    selectedOrderId: "owned-order",
    activeTrip: null,
    receipt: null,
    history: {
      items: [
        {
          orderId: "owned-order",
          orderNo: "OWNED-1",
          status,
          pickupAddress: "Owned origin",
          dropoffAddress: "Owned destination",
          fareTotal: null,
          formattedFare: "實際車資待確認",
          createdAt: "2026-10-20T01:00:00Z",
          completedAt: status === "completed" ? "2026-10-20T02:00:00Z" : null,
        },
      ],
    },
  };
}
it("uses a default-ON native low-rating switch, explicit opt-out and same-order CRM receipt", async () => {
  const fetch = vi.fn(async (_url, init) => {
    const c = JSON.parse(init.body);
    return ok({
      ...c,
      complaintCaseNo: "PAX-owned",
      submittedAt: "2026-10-20T02:00:00Z",
    });
  });
  vi.stubGlobal("fetch", fetch);
  const host = mount(
    <PassengerEmbed
      context={{ ...context, screen: "completed" } as never}
      liveData={completedData() as never}
    />,
  );
  flushSync(() =>
    fireEvent.click(getByRole(host, "button", { name: "評分 2 星" })),
  );
  const control = getByRole(host, "switch", {
    name: "需要客服聯絡",
  }) as HTMLInputElement;
  expect(control.checked).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  flushSync(() => fireEvent.click(control));
  expect(control.checked).toBe(false);
  flushSync(() =>
    fireEvent.click(getByRole(host, "button", { name: "送出評分" })),
  );
  await waitFor(() => expect(host.textContent).toContain("PAX-owned"));
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
    orderId: "owned-order",
    score: 2,
    contactRequested: false,
  });
  expect(control.disabled).toBe(true);
  expect(host.textContent).not.toContain("社區月結");
});
it("keeps an uncertain rating's original payload/key across remount and disables changing its contact choice", async () => {
  const calls: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const c = JSON.parse(init.body);
      calls.push(c);
      if (calls.length === 1) throw new Error("controlled lost ACK");
      return ok({
        ...c,
        complaintCaseNo: "PAX-original",
        submittedAt: "2026-10-20T02:00:00Z",
      });
    }),
  );
  let host = mount(
    <PassengerEmbed
      context={{ ...context, screen: "completed" } as never}
      liveData={completedData() as never}
    />,
  );
  flushSync(() =>
    fireEvent.click(getByRole(host, "button", { name: "評分 1 星" })),
  );
  flushSync(() =>
    fireEvent.click(getByRole(host, "button", { name: "送出評分" })),
  );
  await waitFor(() => expect(host.textContent).toContain("重送原評分"));
  expect(
    (getByRole(host, "switch", { name: "需要客服聯絡" }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  flushSync(() => root!.unmount());
  root = undefined;
  host.remove();
  host = mount(
    <PassengerEmbed
      context={{ ...context, screen: "completed" } as never}
      liveData={completedData() as never}
    />,
  );
  await waitFor(() =>
    expect(getByRole(host, "button", { name: "重送原評分" })).toBeTruthy(),
  );
  fireEvent.click(getByRole(host, "button", { name: "重送原評分" }));
  await waitFor(() => expect(host.textContent).toContain("PAX-original"));
  expect(calls[1]).toEqual(calls[0]);
});
it("does not enable rating or fabricate a completed trip from a completed screen query", () => {
  const host = mount(
    <PassengerEmbed
      context={{ ...context, screen: "completed" } as never}
      liveData={completedData("confirmed") as never}
    />,
  );
  expect(host.querySelector('[data-drt-operation="referral-rate"]')).toBeNull();
  expect(host.textContent).not.toContain("為這趟行程評分");
});
