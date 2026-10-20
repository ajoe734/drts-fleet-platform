import { describe, it, expect, vi, afterEach } from "vitest";
import { PassengerPaymentClient } from "../../../packages/passenger-client/src/payment/client";
import { approvedPaymentActionUrl } from "../../../apps/passenger-app-web/lib/payment/action-url";
import { createSyntheticPaymentFields } from "../../../apps/passenger-app-web/lib/payment/synthetic-fields";
import { paymentFieldsForRuntime } from "../../../apps/passenger-app-web/lib/payment/runtime-fields";
import { FakePaymentProvider } from "../../../apps/api/src/modules/passenger-app/payment/fake-payment-provider";
import type { FetchFn } from "../../../packages/passenger-client/src/client";

const method = {
  payment_method_id: "pm_OPAQUE_under-score",
  last4: "0001",
  card_type: "SYNTHETIC",
  expiry_month: "12",
  expiry_year: "2031",
  is_default: true,
};
function fixture(data: unknown, status = 200) {
  const calls: Array<{ url: string; options: Parameters<FetchFn>[1] }> = [];
  const fetchFn: FetchFn = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () =>
        status < 400
          ? { data, meta: { request_id: "synthetic_REQUEST" } }
          : data,
    };
  };
  return {
    calls,
    client: new PassengerPaymentClient({ baseUrl: "", fetchFn }),
  };
}
function onlyCall(f: ReturnType<typeof fixture>) {
  expect(f.calls).toHaveLength(1);
  const call = f.calls[0];
  if (!call) throw new Error("expected_actual_client_call");
  return call;
}
afterEach(() => vi.unstubAllEnvs());
describe("actual portable Payment client, external HTTP only", () => {
  it("decodes formal snake_case fields without rewriting opaque values", async () => {
    const f = fixture({ methods: [method] });
    expect(await f.client.getMethods()).toEqual({
      methods: [
        {
          paymentMethodId: method.payment_method_id,
          last4: "0001",
          cardType: "SYNTHETIC",
          expiryMonth: "12",
          expiryYear: "2031",
          isDefault: true,
        },
      ],
    });
    expect(f.calls[0]).toMatchObject({
      url: "/api/passenger-app/payment-methods",
      options: { method: "GET" },
    });
  });
  it("accepts a truthful empty list without synthesizing a default method", async () =>
    expect(await fixture({ methods: [] }).client.getMethods()).toEqual({
      methods: [],
    }));
  it("sends only the exact opaque bind command, excluding extraneous provider data", async () => {
    const f = fixture({ status: "completed", method });
    expect(
      (
        await f.client.bindMethod({
          providerToken: "synthetic_OPAQUE_token",
          ignored: "synthetic_extra",
        } as { providerToken: string })
      ).status,
    ).toBe("completed");
    expect(JSON.parse(onlyCall(f).options!.body!)).toEqual({
      providerToken: "synthetic_OPAQUE_token",
    });
  });
  it("retains pending without reporting a completed method", async () =>
    expect(
      await fixture({ status: "pending" }).client.bindMethod({
        providerToken: "synthetic_one_use",
      }),
    ).toEqual({ status: "pending" }));
  it("decodes action_required but never navigates automatically", async () =>
    expect(
      await fixture({
        status: "action_required",
        next_action_url: "https://synthetic-psp.example.invalid/action",
      }).client.bindMethod({ providerToken: "synthetic_one_use" }),
    ).toEqual({
      status: "action_required",
      nextActionUrl: "https://synthetic-psp.example.invalid/action",
    }));
  it("uses real PUT/default and preserves the opaque ID in the typed body", async () => {
    const f = fixture({ status: "completed", method });
    await f.client.setDefault("pm:OPAQUE_under-score");
    expect(onlyCall(f).url).toBe(
      "/api/passenger-app/payment-methods/pm%3AOPAQUE_under-score/default",
    );
    expect(onlyCall(f).options).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ paymentMethodId: "pm:OPAQUE_under-score" }),
    });
  });
  it.each([true, false])(
    "retains actual delete success=%s without fabricated success",
    async (success) => {
      const f = fixture({ success });
      expect(await f.client.removeMethod("synthetic_method")).toEqual({
        success,
      });
      expect(onlyCall(f).options).toMatchObject({ method: "DELETE" });
      expect(onlyCall(f).options?.body).toBeUndefined();
    },
  );
  it.each([
    null,
    { methods: {} },
    { methods: [{ ...method, is_default: "true" }] },
    { methods: [{ ...method, last4: "invalid" }] },
    { methods: [{ ...method, expiry_month: "13" }] },
    { methods: [method, method] },
    { methods: [method, { ...method, payment_method_id: "synthetic_other" }] },
    { methods: [{ ...method, paymentMethodId: "different" }] },
  ])("rejects malformed/ambiguous method response %j", async (data) => {
    await expect(fixture(data).client.getMethods()).rejects.toMatchObject({
      code: "invalid_payment_response",
    });
  });
  it.each([400, 401, 403, 409, 503])(
    "retains status%s and canonical error code, not upstream sensitive details",
    async (status) => {
      const f = fixture(
        {
          error: {
            code: "pending_payment_block",
            message: "synthetic_PRIVATE",
            details: { value: "synthetic_PRIVATE" },
          },
        },
        status,
      );
      try {
        await f.client.getMethods();
        throw new Error("unexpected success");
      } catch (error) {
        expect(error).toMatchObject({
          status,
          code: "pending_payment_block",
          details: {},
        });
        expect((error as Error).message).not.toContain("synthetic_PRIVATE");
      }
    },
  );
  it("does not expose external network error text or auto-retry a lost acknowledgement", async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockRejectedValue(new Error("synthetic_PRIVATE"));
    const client = new PassengerPaymentClient({ baseUrl: "", fetchFn });
    await expect(
      client.bindMethod({ providerToken: "synthetic_one_use" }),
    ).rejects.toMatchObject({ status: 503, code: "unavailable" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("rejects missing credentials before external HTTP", async () => {
    const f = fixture({ status: "pending" });
    await expect(
      f.client.bindMethod({ providerToken: " " }),
    ).rejects.toMatchObject({ code: "invalid_payment_credential" });
    expect(f.calls).toHaveLength(0);
  });
  it("rejects a success response without an explicit bind status", async () => {
    await expect(
      fixture({ method }).client.bindMethod({
        providerToken: "synthetic_one_use",
      }),
    ).rejects.toMatchObject({ code: "invalid_payment_response" });
  });
});
describe("3DS authorization boundary, no browser/provider call", () => {
  it("allows only explicitly approved HTTPS origins", () =>
    expect(
      approvedPaymentActionUrl(
        "https://synthetic-psp.example.invalid/action?opaque=synthetic",
        ["https://synthetic-psp.example.invalid"],
      ),
    ).toBe("https://synthetic-psp.example.invalid/action?opaque=synthetic"));
  it.each([
    "https://synthetic-psp.example.invalid/action",
    "https://foreign.example.invalid/action",
    "http://synthetic-psp.example.invalid/action",
    "javascript:alert('synthetic')",
    "//synthetic-psp.example.invalid/action",
    "https://user:synthetic@synthetic-psp.example.invalid/action",
  ])("denies missing approval/unsafe URL %s", (url) =>
    expect(approvedPaymentActionUrl(url, [])).toBeNull(),
  );
  it("denies embedded credentials even on an approved origin", () =>
    expect(
      approvedPaymentActionUrl(
        "https://user:synthetic@synthetic-psp.example.invalid/action",
        ["https://synthetic-psp.example.invalid"],
      ),
    ).toBeNull());
});
describe("replaceable one-use field port, synthetic nonproduction only", () => {
  it("never invokes issuer when explicit production is configured", () => {
    const issueSyntheticNonce = vi.fn();
    expect(() =>
      createSyntheticPaymentFields({
        runtime: "production",
        issueSyntheticNonce,
      }),
    ).toThrow("forbidden");
    expect(issueSyntheticNonce).not.toHaveBeenCalled();
  });
  it("actual production build environment refuses synthetic despite a caller flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    const issueSyntheticNonce = vi.fn();
    expect(() =>
      createSyntheticPaymentFields({
        runtime: "nonproduction",
        issueSyntheticNonce,
      }),
    ).toThrow("forbidden");
    expect(issueSyntheticNonce).not.toHaveBeenCalled();
  });
  it("issues only explicit synthetic opaque credentials and disposal prevents reuse", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const issueSyntheticNonce = vi
      .fn()
      .mockReturnValue("synthetic_field_alpha");
    const port = createSyntheticPaymentFields({
      runtime: "nonproduction",
      issueSyntheticNonce,
    });
    expect(await port.collectCredential()).toEqual({
      providerToken: "synthetic_credential_field__alpha",
    });
    port.dispose();
    await expect(port.collectCredential()).rejects.toThrow("unavailable");
    expect(issueSyntheticNonce).toHaveBeenCalledTimes(1);
  });
  it("refuses an unmarked issuer result without exposing it", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const port = createSyntheticPaymentFields({
      runtime: "nonproduction",
      issueSyntheticNonce: () => "invalid",
    });
    await expect(port.collectCredential()).rejects.toThrow(
      "synthetic_payment_fields_invalid",
    );
  });
  it("preserves digit and underscore nonce distinctions through the actual fake provider", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const provider = new FakePaymentProvider({ DRTS_ENV: "test" });
    const nonces = [
      "synthetic_12345678-1234-4234-8234-123456789abc",
      "synthetic_12345678-1234-4234-8234-123456789abd",
      "synthetic_0",
      "synthetic_a",
      "synthetic__a",
      "synthetic___a",
    ];
    const credentials: string[] = [];
    for (const nonce of nonces) {
      const port = createSyntheticPaymentFields({
        runtime: "nonproduction",
        issueSyntheticNonce: () => nonce,
      });
      const { providerToken } = await port.collectCredential();
      credentials.push(providerToken);
      expect(await provider.bind(providerToken, `bind-${nonce}`)).toMatchObject(
        {
          status: "completed",
          card: { cardType: "synthetic", last4: "0000" },
        },
      );
      port.dispose();
    }
    expect(new Set(credentials).size).toBe(nonces.length);
  });
  it("runtime UUID credentials bind with the actual fake provider on successive requests", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER", "synthetic");
    const fields = paymentFieldsForRuntime();
    expect(fields.status).toBe("ready");
    if (fields.status !== "ready") throw new Error("expected_synthetic_fields");
    const first = await fields.port.collectCredential();
    const second = await fields.port.collectCredential();
    expect(first.providerToken).not.toBe(second.providerToken);
    const provider = new FakePaymentProvider({ DRTS_ENV: "test" });
    expect(
      await provider.bind(first.providerToken, "first-bind"),
    ).toMatchObject({ status: "completed" });
    expect(
      await provider.bind(second.providerToken, "second-bind"),
    ).toMatchObject({ status: "completed" });
    fields.port.dispose();
  });
});
