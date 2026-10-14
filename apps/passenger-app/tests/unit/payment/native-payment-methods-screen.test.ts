import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PassengerPaymentMethod } from "@drts/contracts";
import {
  PassengerPaymentClient,
  type FetchOptions,
  type FetchResponse,
  type PassengerPaymentFieldsAvailability,
} from "@drts/passenger-client";

vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T>(styles: T) => styles },
}));
import {
  NativePaymentMethodsScreen,
  type NativePaymentMethodsScreenProps,
} from "../../../components/payment/native-payment-methods-screen";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
interface TreeNode {
  props: Record<string, unknown>;
  children: Array<TreeNode | string>;
  findByProps(props: Record<string, unknown>): TreeNode;
  findAllByProps(props: Record<string, unknown>): TreeNode[];
}
interface Rendered {
  root: TreeNode;
  update(node: React.ReactNode): void;
  unmount(): void;
}
const mounted: Rendered[] = [];
afterEach(async () => {
  await act(() => {
    for (const r of mounted.splice(0)) r.unmount();
  });
});
const origin = "https://api.example.invalid";
function method(id = "CARD-A", isDefault = true): PassengerPaymentMethod {
  return {
    paymentMethodId: id,
    last4: id === "CARD-A" ? "1111" : "2222",
    cardType: "VISA",
    expiryMonth: "12",
    expiryYear: "2035",
    isDefault,
  };
}
function wire(m: PassengerPaymentMethod) {
  return {
    payment_method_id: m.paymentMethodId,
    last4: m.last4,
    card_type: m.cardType,
    expiry_month: m.expiryMonth,
    expiry_year: m.expiryYear,
    is_default: m.isDefault,
  };
}
function reply(status: number, data: unknown): FetchResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function ok(data: unknown) {
  return reply(200, { data });
}
function fault(code: string, status = 409) {
  return reply(status, {
    error: { code, message: "captured upstream details" },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
type State = { methods: PassengerPaymentMethod[] };
type Handler = (
  url: string,
  options: FetchOptions,
  state: State,
) => Promise<FetchResponse | undefined>;
function fixture(initial: PassengerPaymentMethod[] = [], handler?: Handler) {
  const state: State = { methods: initial.map((m) => ({ ...m })) };
  const calls: Array<{ url: string; options: FetchOptions }> = [];
  const fetchFn = async (url: string, options: FetchOptions = {}) => {
    calls.push({ url, options });
    const controlled = await handler?.(url, options, state);
    if (controlled) return controlled;
    if (options.method === "GET" && url.endsWith("/payment-methods"))
      return ok({ methods: state.methods.map(wire) });
    throw new Error("Unexpected fixture route");
  };
  const client = new PassengerPaymentClient({ baseUrl: origin, fetchFn });
  const collectCredential = vi.fn(async () => ({
    providerToken: "synthetic-one-use-credential",
  }));
  const dispose = vi.fn();
  const fields: PassengerPaymentFieldsAvailability = {
    status: "ready",
    port: { kind: "synthetic", collectCredential, dispose },
  };
  const openAction = vi.fn(
    async (): Promise<{ type: "returned" | "cancelled" }> => ({
      type: "returned",
    }),
  );
  const browser: NativePaymentMethodsScreenProps["browser"] = {
    status: "ready",
    kind: "synthetic",
    port: { openAction },
  };
  const onSupport = vi.fn(async () => {});
  return {
    state,
    calls,
    client,
    collectCredential,
    dispose,
    fields,
    openAction,
    browser,
    onSupport,
  };
}
async function mount(
  f: ReturnType<typeof fixture>,
  overrides: Partial<NativePaymentMethodsScreenProps> = {},
) {
  const props: NativePaymentMethodsScreenProps = {
    client: f.client,
    fields: f.fields,
    browser: f.browser,
    onSupport: f.onSupport,
    ...overrides,
  };
  let r!: Rendered;
  await act(async () => {
    r = create(
      React.createElement(NativePaymentMethodsScreen, props),
    ) as unknown as Rendered;
  });
  mounted.push(r);
  return { r, props };
}
function exists(r: Rendered, id: string) {
  return r.root.findAllByProps({ testID: id }).length > 0;
}
function text(r: Rendered, id: string) {
  return r.root.findByProps({ testID: id }).children.join("");
}
function button(r: Rendered, id: string) {
  return r.root.findByProps({ testID: id }).props as {
    disabled: boolean;
    onPress(): void | Promise<void>;
  };
}
async function press(r: Rendered, id: string) {
  await act(async () => {
    await button(r, id).onPress();
  });
}
const sent = (f: ReturnType<typeof fixture>, verb: string) =>
  f.calls.filter((c) => c.options.method === verb);

describe("Native payment methods actual SDK and rendered actions with external boundaries injected", () => {
  it("renders loading while the actual GET is pending and then displays the captured server card", async () => {
    const gate = deferred<FetchResponse>();
    const f = fixture([], async (_url, options) =>
      options.method === "GET" ? gate.promise : undefined,
    );
    const { r } = await mount(f);
    expect(exists(r, "payment-loading")).toBe(true);
    expect(button(r, "payment-add").disabled).toBe(true);
    await act(async () => {
      gate.resolve(ok({ methods: [wire(method())] }));
    });
    expect(text(r, "payment-label-CARD-A")).toBe("VISA •••• 1111");
    expect(exists(r, "payment-default-CARD-A")).toBe(true);
    expect(exists(r, "payment-loading")).toBe(false);
  });
  it("loads masked methods through the real snake-case decoder and disables an expired default choice", async () => {
    const expired = { ...method("CARD-B", false), expiryYear: "2020" };
    const f = fixture([method(), expired]);
    const { r } = await mount(f);
    expect(sent(f, "GET")[0]?.url).toBe(
      `${origin}/api/passenger-app/payment-methods`,
    );
    expect(text(r, "payment-label-CARD-B")).toBe("VISA •••• 2222");
    expect(button(r, "payment-set-default-CARD-B").disabled).toBe(true);
    expect(r.root.findAllByProps({ accessibilityLabel: "卡號" })).toHaveLength(
      0,
    );
  });
  it("retries a failed initial GET and shows an empty authority list without fabricating a card", async () => {
    let attempts = 0;
    const f = fixture([], async (_url, options) =>
      options.method === "GET" && ++attempts === 1
        ? fault("unavailable", 503)
        : undefined,
    );
    const { r } = await mount(f);
    expect(exists(r, "payment-error")).toBe(true);
    expect(button(r, "payment-add").disabled).toBe(true);
    await press(r, "payment-refresh");
    expect(exists(r, "payment-empty")).toBe(true);
    expect(button(r, "payment-add").disabled).toBe(false);
    expect(attempts).toBe(2);
  });
  it("shows unavailable collection as a skipped step and cannot send a binding command", async () => {
    const f = fixture();
    const { r } = await mount(f, {
      fields: { status: "unavailable" },
      browser: { status: "unavailable" },
    });
    await press(r, "payment-add");
    expect(text(r, "payment-fields-unavailable")).toContain("此步驟略過");
    expect(button(r, "payment-bind").disabled).toBe(true);
    await press(r, "payment-bind");
    expect(sent(f, "POST")).toHaveLength(0);
    expect(exists(r, "payment-demo-notice")).toBe(false);
  });
  it("requires the actual hosted collection view before a hosted port can bind", async () => {
    const f = fixture();
    const fields: PassengerPaymentFieldsAvailability = {
      status: "ready",
      port: {
        kind: "hosted",
        collectCredential: f.collectCredential,
        dispose: f.dispose,
      },
    };
    const { r } = await mount(f, {
      fields,
      browser: { status: "unavailable" },
    });
    await press(r, "payment-add");
    expect(button(r, "payment-bind").disabled).toBe(true);
    expect(exists(r, "payment-fields-unavailable")).toBe(true);
    await press(r, "payment-bind");
    expect(f.collectCredential).not.toHaveBeenCalled();
  });
  it("uses the injected hosted view, actual bindMethod command and GET readback before success", async () => {
    const f = fixture([], async (_url, options, state) => {
      if (options.method !== "POST") return;
      state.methods = [method()];
      return ok({ status: "completed", method: wire(method()) });
    });
    const fields: PassengerPaymentFieldsAvailability = {
      status: "ready",
      port: {
        kind: "hosted",
        collectCredential: f.collectCredential,
        dispose: f.dispose,
      },
    };
    const { r } = await mount(f, {
      fields,
      hostedFieldsView: React.createElement(
        "Text",
        { testID: "external-fields-view" },
        "Provider-owned view",
      ),
      browser: { status: "unavailable" },
    });
    await press(r, "payment-add");
    expect(exists(r, "external-fields-view")).toBe(true);
    await press(r, "payment-bind");
    expect(JSON.parse(sent(f, "POST")[0]?.options.body ?? "{}")).toEqual({
      providerToken: "synthetic-one-use-credential",
    });
    expect(sent(f, "GET")).toHaveLength(2);
    expect(exists(r, "payment-success")).toBe(true);
    expect(exists(r, "payment-default-CARD-A")).toBe(true);
    expect(exists(r, "payment-demo-notice")).toBe(false);
  });
  it("labels synthetic collection visibly and still executes the real client instead of fake success", async () => {
    const f = fixture([], async (_url, options, state) => {
      if (options.method !== "POST") return;
      state.methods = [method()];
      return ok({ status: "completed", method: wire(method()) });
    });
    const { r } = await mount(f);
    expect(text(r, "payment-demo-notice")).toContain("未實際扣款");
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(f.collectCredential).toHaveBeenCalledTimes(1);
    expect(sent(f, "POST")).toHaveLength(1);
    expect(exists(r, "payment-method-CARD-A")).toBe(true);
  });
  it("retains a completed binding as unconfirmed when GET lacks its card and resolves only after a later GET", async () => {
    const f = fixture([], async (_url, options) =>
      options.method === "POST"
        ? ok({ status: "completed", method: wire(method()) })
        : undefined,
    );
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(exists(r, "payment-success")).toBe(false);
    expect(exists(r, "payment-pending")).toBe(true);
    expect(button(r, "payment-bind").disabled).toBe(true);
    await press(r, "payment-bind");
    f.state.methods = [method()];
    await press(r, "payment-refresh");
    expect(exists(r, "payment-pending")).toBe(false);
    expect(exists(r, "payment-success")).toBe(true);
    expect(sent(f, "POST")).toHaveLength(1);
  });
  it("does not repeat a pending bind and allows readback to resolve a newly materialized method", async () => {
    const f = fixture([], async (_url, options) =>
      options.method === "POST" ? ok({ status: "pending" }) : undefined,
    );
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    await press(r, "payment-bind");
    expect(sent(f, "POST")).toHaveLength(1);
    expect(text(r, "payment-pending")).toContain("請勿重複送出");
    f.state.methods = [method()];
    await press(r, "payment-refresh");
    expect(exists(r, "payment-success")).toBe(true);
    expect(exists(r, "payment-pending")).toBe(false);
  });
  it("opens exactly the captured action_required URL and reads the real methods after browser return", async () => {
    const url = "https://provider.example.invalid/action/123";
    const f = fixture([], async (_url, options) =>
      options.method === "POST"
        ? ok({ status: "action_required", next_action_url: url })
        : undefined,
    );
    f.openAction.mockImplementation(async () => {
      f.state.methods = [method()];
      return { type: "returned" };
    });
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(exists(r, "payment-success")).toBe(false);
    await press(r, "payment-verify");
    expect(f.openAction).toHaveBeenCalledWith(url);
    expect(sent(f, "GET")).toHaveLength(2);
    expect(exists(r, "payment-success")).toBe(true);
    expect(sent(f, "POST")).toHaveLength(1);
  });
  it("does not treat browser return as payment success when server authority has not changed", async () => {
    const f = fixture([], async (_url, options) =>
      options.method === "POST"
        ? ok({
            status: "action_required",
            nextActionUrl: "https://provider.example.invalid/action",
          })
        : undefined,
    );
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    await press(r, "payment-verify");
    expect(text(r, "payment-error")).toContain("仍待確認");
    expect(exists(r, "payment-success")).toBe(false);
    expect(button(r, "payment-bind").disabled).toBe(true);
    expect(exists(r, "payment-pending")).toBe(true);
  });
  it("retains action_required after browser cancellation without inventing a completed method", async () => {
    const f = fixture([], async (_url, options) =>
      options.method === "POST"
        ? ok({
            status: "action_required",
            nextActionUrl: "https://provider.example.invalid/action",
          })
        : undefined,
    );
    f.openAction.mockResolvedValue({ type: "cancelled" });
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    await press(r, "payment-verify");
    expect(text(r, "payment-error")).toContain("已取消驗證");
    expect(exists(r, "payment-pending")).toBe(true);
    expect(sent(f, "GET")).toHaveLength(1);
    expect(exists(r, "payment-success")).toBe(false);
  });
  it("visibly skips missing external verification and keeps manual readback available", async () => {
    const f = fixture([], async (_url, options) =>
      options.method === "POST"
        ? ok({
            status: "action_required",
            nextActionUrl: "https://provider.example.invalid/action",
          })
        : undefined,
    );
    const { r } = await mount(f, { browser: { status: "unavailable" } });
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(text(r, "payment-browser-unavailable")).toContain("此步驟略過");
    expect(exists(r, "payment-verify")).toBe(false);
    expect(button(r, "payment-refresh").disabled).toBe(false);
    expect(f.openAction).not.toHaveBeenCalled();
  });
  it("retries a failed verification port using the captured URL without another bind POST", async () => {
    const f = fixture([], async (_url, options) =>
      options.method === "POST"
        ? ok({
            status: "action_required",
            nextActionUrl: "https://provider.example.invalid/action",
          })
        : undefined,
    );
    f.openAction.mockRejectedValueOnce(new Error("browser unavailable"));
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    await press(r, "payment-verify");
    expect(text(r, "payment-error")).toContain("外部驗證未完成");
    f.state.methods = [method()];
    await press(r, "payment-verify");
    expect(exists(r, "payment-success")).toBe(true);
    expect(f.openAction).toHaveBeenCalledTimes(2);
    expect(sent(f, "POST")).toHaveLength(1);
  });
  it("retries collection failure before sending a command and never manufactures a credential", async () => {
    const f = fixture([], async (_url, options, state) => {
      if (options.method !== "POST") return;
      state.methods = [method()];
      return ok({ status: "completed", method: wire(method()) });
    });
    f.collectCredential.mockRejectedValueOnce(new Error("fields unavailable"));
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(sent(f, "POST")).toHaveLength(0);
    expect(button(r, "payment-bind").disabled).toBe(false);
    await press(r, "payment-bind");
    expect(exists(r, "payment-success")).toBe(true);
    expect(sent(f, "POST")).toHaveLength(1);
  });
  it("keeps captured card_declined as retryable binding failure and then obtains a new credential", async () => {
    let attempt = 0;
    const f = fixture([], async (_url, options, state) => {
      if (options.method !== "POST") return;
      if (++attempt === 1) return fault("card_declined", 422);
      state.methods = [method()];
      return ok({ status: "completed", method: wire(method()) });
    });
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(text(r, "payment-error")).toContain("卡片綁定未完成");
    expect(exists(r, "payment-pending")).toBe(false);
    await press(r, "payment-bind");
    expect(f.collectCredential).toHaveBeenCalledTimes(2);
    expect(exists(r, "payment-success")).toBe(true);
  });
  it("keeps an unknown sent binding unresolved and rereads methods instead of repeating the POST", async () => {
    const f = fixture([], async (_url, options) => {
      if (options.method === "POST")
        throw new Error("connection lost after send");
      return undefined;
    });
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(exists(r, "payment-pending")).toBe(true);
    await press(r, "payment-bind");
    f.state.methods = [method()];
    await press(r, "payment-refresh");
    expect(sent(f, "POST")).toHaveLength(1);
    expect(exists(r, "payment-success")).toBe(true);
  });
  it("sets a default using the actual encoded SDK URL/body and shows only the readback default", async () => {
    const id = "CARD/B";
    const f = fixture(
      [method(), method(id, false)],
      async (_url, options, state) => {
        if (options.method !== "PUT") return;
        state.methods = [method("CARD-A", false), method(id, true)];
        return ok({ status: "completed", method: wire(method(id, true)) });
      },
    );
    const { r } = await mount(f);
    await press(r, `payment-set-default-${id}`);
    expect(sent(f, "PUT")[0]?.url).toBe(
      `${origin}/api/passenger-app/payment-methods/CARD%2FB/default`,
    );
    expect(JSON.parse(sent(f, "PUT")[0]?.options.body ?? "{}")).toEqual({
      paymentMethodId: id,
    });
    expect(exists(r, `payment-default-${id}`)).toBe(true);
    expect(exists(r, "payment-default-CARD-A")).toBe(false);
  });
  it("allows collecting again after the actual client locally rejects an empty credential before HTTP", async () => {
    const f = fixture([], async (_url, options, state) => {
      if (options.method !== "POST") return;
      state.methods = [method()];
      return ok({ status: "completed", method: wire(method()) });
    });
    f.collectCredential.mockResolvedValueOnce({ providerToken: "" });
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(sent(f, "POST")).toHaveLength(0);
    expect(text(r, "payment-error")).toContain("尚未取得付款憑證");
    expect(exists(r, "payment-pending")).toBe(false);
    expect(button(r, "payment-bind").disabled).toBe(false);
    await press(r, "payment-bind");
    expect(sent(f, "POST")).toHaveLength(1);
    expect(exists(r, "payment-success")).toBe(true);
  });
  it("retains the exact completed binding ID across a failed GET and never confirms a different card", async () => {
    let reads = 0;
    const f = fixture([], async (_url, options) => {
      if (options.method === "POST")
        return ok({ status: "completed", method: wire(method("CARD-A")) });
      if (options.method === "GET" && ++reads === 2)
        return fault("unavailable", 503);
      return undefined;
    });
    const { r } = await mount(f);
    await press(r, "payment-add");
    await press(r, "payment-bind");
    expect(exists(r, "payment-pending")).toBe(true);
    expect(exists(r, "payment-success")).toBe(false);
    f.state.methods = [method("CARD-B")];
    await press(r, "payment-refresh");
    expect(exists(r, "payment-pending")).toBe(true);
    expect(exists(r, "payment-success")).toBe(false);
    f.state.methods = [method("CARD-A")];
    await press(r, "payment-refresh");
    expect(exists(r, "payment-success")).toBe(true);
    expect(sent(f, "POST")).toHaveLength(1);
  });
  it("retains a completed default change as pending until the target is truly default in GET", async () => {
    const f = fixture(
      [method(), method("CARD-B", false)],
      async (_url, options) =>
        options.method === "PUT"
          ? ok({ status: "completed", method: wire(method("CARD-B", true)) })
          : undefined,
    );
    const { r } = await mount(f);
    await press(r, "payment-set-default-CARD-B");
    expect(exists(r, "payment-default-CARD-A")).toBe(true);
    expect(exists(r, "payment-default-CARD-B")).toBe(false);
    expect(exists(r, "payment-success")).toBe(false);
    expect(button(r, "payment-remove-CARD-A").disabled).toBe(true);
    f.state.methods = [method("CARD-A", false), method("CARD-B", true)];
    await press(r, "payment-refresh");
    expect(exists(r, "payment-default-CARD-B")).toBe(true);
    expect(sent(f, "PUT")).toHaveLength(1);
  });
  it("blocks duplicate pending default commands while allowing authority refresh", async () => {
    const f = fixture(
      [method(), method("CARD-B", false)],
      async (_url, options) =>
        options.method === "PUT" ? ok({ status: "pending" }) : undefined,
    );
    const { r } = await mount(f);
    await press(r, "payment-set-default-CARD-B");
    await press(r, "payment-set-default-CARD-B");
    expect(sent(f, "PUT")).toHaveLength(1);
    expect(button(r, "payment-add").disabled).toBe(true);
    f.state.methods = [method("CARD-A", false), method("CARD-B", true)];
    await press(r, "payment-refresh");
    expect(exists(r, "payment-pending")).toBe(false);
  });
  it("requires removal confirmation and cancellation sends no DELETE", async () => {
    const f = fixture([method()]);
    const { r } = await mount(f);
    await press(r, "payment-remove-CARD-A");
    expect(text(r, "payment-remove-question")).toContain("1111");
    expect(sent(f, "DELETE")).toHaveLength(0);
    await press(r, "payment-back");
    expect(exists(r, "payment-method-CARD-A")).toBe(true);
    expect(sent(f, "DELETE")).toHaveLength(0);
  });
  it("removes through the actual client and only clears the card after GET confirms its absence", async () => {
    const f = fixture([method()], async (_url, options, state) => {
      if (options.method !== "DELETE") return;
      state.methods = [];
      return ok({ success: true });
    });
    const { r } = await mount(f);
    await press(r, "payment-remove-CARD-A");
    await press(r, "payment-confirm-remove");
    expect(sent(f, "DELETE")[0]?.url).toBe(
      `${origin}/api/passenger-app/payment-methods/CARD-A`,
    );
    expect(exists(r, "payment-empty")).toBe(true);
    expect(exists(r, "payment-success")).toBe(true);
    expect(sent(f, "GET")).toHaveLength(2);
  });
  it("retains the removal target when the actual API returns success false", async () => {
    const f = fixture([method()], async (_url, options) =>
      options.method === "DELETE" ? ok({ success: false }) : undefined,
    );
    const { r } = await mount(f);
    await press(r, "payment-remove-CARD-A");
    await press(r, "payment-confirm-remove");
    expect(text(r, "payment-error")).toContain("尚未移除");
    expect(exists(r, "payment-remove-question")).toBe(true);
    expect(exists(r, "payment-success")).toBe(false);
    expect(button(r, "payment-confirm-remove").disabled).toBe(false);
  });
  it("keeps an acknowledged removal pending when GET still contains the target and retries only GET", async () => {
    const f = fixture([method()], async (_url, options) =>
      options.method === "DELETE" ? ok({ success: true }) : undefined,
    );
    const { r } = await mount(f);
    await press(r, "payment-remove-CARD-A");
    await press(r, "payment-confirm-remove");
    expect(exists(r, "payment-pending")).toBe(true);
    expect(exists(r, "payment-success")).toBe(false);
    await press(r, "payment-confirm-remove");
    f.state.methods = [];
    await press(r, "payment-refresh");
    expect(sent(f, "DELETE")).toHaveLength(1);
    expect(exists(r, "payment-empty")).toBe(true);
  });
  it("renders captured unpaid-removal error and preserves the original card", async () => {
    const f = fixture([method()], async (_url, options) =>
      options.method === "DELETE" ? fault("pending_payment_block") : undefined,
    );
    const { r } = await mount(f);
    await press(r, "payment-remove-CARD-A");
    await press(r, "payment-confirm-remove");
    expect(text(r, "payment-error")).toContain("尚有未付款行程");
    expect(exists(r, "payment-success")).toBe(false);
    await press(r, "payment-back");
    expect(exists(r, "payment-method-CARD-A")).toBe(true);
  });
  it("coalesces actual double presses while the external collector is pending", async () => {
    const gate = deferred<{ providerToken: string }>();
    const f = fixture([], async (_url, options, state) => {
      if (options.method !== "POST") return;
      state.methods = [method()];
      return ok({ status: "completed", method: wire(method()) });
    });
    f.collectCredential.mockImplementation(() => gate.promise);
    const { r } = await mount(f);
    await press(r, "payment-add");
    let running!: void | Promise<void>;
    await act(async () => {
      const callback = button(r, "payment-bind").onPress;
      running = callback();
      await callback();
    });
    expect(f.collectCredential).toHaveBeenCalledTimes(1);
    expect(exists(r, "payment-loading")).toBe(true);
    await act(async () => {
      gate.resolve({ providerToken: "captured-collected-credential" });
      await running;
    });
    expect(sent(f, "POST")).toHaveLength(1);
    expect(exists(r, "payment-success")).toBe(true);
  });
  it("does not send a collected credential after its fields interface becomes unavailable", async () => {
    const gate = deferred<{ providerToken: string }>();
    const f = fixture();
    f.collectCredential.mockImplementation(() => gate.promise);
    const { r, props } = await mount(f);
    await press(r, "payment-add");
    let running!: void | Promise<void>;
    await act(async () => {
      running = button(r, "payment-bind").onPress();
    });
    await act(async () => {
      r.update(
        React.createElement(NativePaymentMethodsScreen, {
          ...props,
          fields: { status: "unavailable" },
        }),
      );
    });
    await act(async () => {
      gate.resolve({ providerToken: "detached-credential" });
      await running;
    });
    expect(sent(f, "POST")).toHaveLength(0);
    expect(text(r, "payment-error")).toContain("介面已停用");
  });
  it("does not continue a detached collection after the actual component unmounts", async () => {
    const gate = deferred<{ providerToken: string }>();
    const f = fixture();
    f.collectCredential.mockImplementation(() => gate.promise);
    const { r } = await mount(f);
    await press(r, "payment-add");
    let running!: void | Promise<void>;
    await act(async () => {
      running = button(r, "payment-bind").onPress();
    });
    await act(() => {
      r.unmount();
    });
    mounted.splice(mounted.indexOf(r), 1);
    await act(async () => {
      gate.resolve({ providerToken: "detached-credential" });
      await running;
    });
    expect(sent(f, "POST")).toHaveLength(0);
    expect(f.dispose).not.toHaveBeenCalled();
  });
  it("keeps the current client list when an old client GET resolves after replacement", async () => {
    const gate = deferred<FetchResponse>();
    const old = fixture([], async () => gate.promise);
    const next = fixture([method("CARD-B", true)]);
    const { r, props } = await mount(old);
    await act(async () => {
      r.update(
        React.createElement(NativePaymentMethodsScreen, {
          ...props,
          client: next.client,
        }),
      );
    });
    expect(exists(r, "payment-method-CARD-B")).toBe(true);
    await act(async () => {
      gate.resolve(ok({ methods: [wire(method())] }));
    });
    expect(exists(r, "payment-method-CARD-B")).toBe(true);
    expect(exists(r, "payment-method-CARD-A")).toBe(false);
  });
  it("calls the real support callback and shows the existing support number when the platform port fails", async () => {
    const f = fixture();
    f.onSupport.mockRejectedValue(new Error("phone unavailable"));
    const { r } = await mount(f);
    await press(r, "payment-support");
    expect(f.onSupport).toHaveBeenCalledTimes(1);
    expect(text(r, "payment-error")).toContain("02-2944-0985");
  });
});
