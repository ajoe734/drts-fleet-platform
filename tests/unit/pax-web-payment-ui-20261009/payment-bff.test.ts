import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PassengerPaymentMethod } from "@drts/contracts";
import { PassengerPaymentClient } from "../../../packages/passenger-client/src/payment/client";
import type { FetchOptions } from "../../../packages/passenger-client/src/client";
import * as bff from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";

const origin = "https://ride.example.test";
const method: PassengerPaymentMethod = {
  paymentMethodId: "synthetic_METHOD_opaque",
  cardType: "SYNTHETIC",
  last4: "0001",
  expiryMonth: "12",
  expiryYear: "2031",
  isDefault: true,
};
let upstream: ReturnType<
  typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>
>;
function request(
  path: string[],
  verb: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  options: { cookie?: string; origin?: string; body?: string } = {},
) {
  const input = new NextRequest(
    `${origin}/api/passenger-app/${path.join("/")}`,
    {
      method: verb,
      headers: {
        ...(options.cookie === undefined
          ? { cookie: "pax_session=synthetic_session" }
          : options.cookie
            ? { cookie: options.cookie }
            : {}),
        origin: options.origin ?? origin,
        "content-type": "application/json",
      },
      ...(options.body === undefined ? {} : { body: options.body }),
    },
  );
  return bff[verb](input, { params: Promise.resolve({ path }) });
}
function throughBff(url: string, options?: FetchOptions) {
  const target = new URL(url, origin);
  return request(
    target.pathname
      .replace("/api/passenger-app/", "")
      .split("/")
      .map(decodeURIComponent),
    (options?.method ?? "GET") as "GET" | "POST" | "PUT" | "DELETE",
    options?.body === undefined ? {} : { body: options.body },
  );
}
beforeEach(() => {
  vi.stubEnv("DRTS_API_URL", "https://api.example.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  upstream = vi.fn(async () => apiWireResponse({ methods: [method] }));
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("actual Payment client → actual bounded BFF → actual API envelope/serializer", () => {
  it("GET lists actual masked metadata, server cookie only, no client-supplied auth", async () => {
    const client = new PassengerPaymentClient({
      baseUrl: "",
      fetchFn: throughBff,
    });
    expect(await client.getMethods()).toEqual({ methods: [method] });
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe(
      "https://api.example.test/api/passenger-app/payment-methods",
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer synthetic_session",
    );
  });
  it("POST sends only synthetic opaque credential through the real body forwarding path", async () => {
    upstream.mockImplementation(async () =>
      apiWireResponse({ status: "completed", method }),
    );
    const client = new PassengerPaymentClient({
      baseUrl: "",
      fetchFn: throughBff,
    });
    expect(
      await client.bindMethod({ providerToken: "synthetic_one_use" }),
    ).toEqual({ status: "completed", method });
    const init = upstream.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(
      JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer)),
    ).toEqual({ providerToken: "synthetic_one_use" });
  });
  it("PUT/default uses actual controller verb and formal snake-case result", async () => {
    upstream.mockImplementation(async () =>
      apiWireResponse({ status: "completed", method }),
    );
    const client = new PassengerPaymentClient({
      baseUrl: "",
      fetchFn: throughBff,
    });
    expect((await client.setDefault(method.paymentMethodId)).status).toBe(
      "completed",
    );
    expect(upstream.mock.calls[0]![0]).toBe(
      `https://api.example.test/api/passenger-app/payment-methods/${method.paymentMethodId}/default`,
    );
    expect(upstream.mock.calls[0]![1]!.method).toBe("PUT");
  });
  it("DELETE retains actual failure without removing locally as a success", async () => {
    upstream.mockImplementation(async () =>
      apiWireResponse({ success: false }),
    );
    const client = new PassengerPaymentClient({
      baseUrl: "",
      fetchFn: throughBff,
    });
    expect(await client.removeMethod(method.paymentMethodId)).toEqual({
      success: false,
    });
    expect(upstream.mock.calls[0]![1]!.method).toBe("DELETE");
  });
  it.each(["pending", "action_required"])(
    "formal %s is not completed",
    async (status) => {
      upstream.mockImplementation(async () =>
        apiWireResponse({
          status,
          ...(status === "action_required"
            ? { nextActionUrl: "https://synthetic-psp.example.invalid/action" }
            : {}),
        }),
      );
      const result = await new PassengerPaymentClient({
        baseUrl: "",
        fetchFn: throughBff,
      }).bindMethod({ providerToken: "synthetic_one_use" });
      expect(result.status).toBe(status);
      expect(result).not.toHaveProperty("method");
    },
  );
  it.each([400, 401, 403, 409, 503])(
    "retains actual upstream failure %s",
    async (status) => {
      upstream.mockImplementation(async () =>
        Response.json({ error: { code: "pending_payment_block" } }, { status }),
      );
      await expect(
        new PassengerPaymentClient({
          baseUrl: "",
          fetchFn: throughBff,
        }).getMethods(),
      ).rejects.toMatchObject({ status, code: "pending_payment_block" });
    },
  );
  it.each(["GET", "POST", "PUT", "DELETE"] as const)(
    "requires passenger cookie before %s upstream/metadata operations",
    async (verb) => {
      const path =
        verb === "PUT"
          ? ["payment-methods", method.paymentMethodId, "default"]
          : verb === "DELETE"
            ? ["payment-methods", method.paymentMethodId]
            : ["payment-methods"];
      expect(
        (
          await request(path, verb, {
            cookie: "",
            ...(verb === "POST" || verb === "PUT" ? { body: "{}" } : {}),
          })
        ).status,
      ).toBe(401);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each(["POST", "PUT", "DELETE"] as const)(
    "preserves CSRF before %s",
    async (verb) => {
      const path =
        verb === "PUT"
          ? ["payment-methods", method.paymentMethodId, "default"]
          : verb === "DELETE"
            ? ["payment-methods", method.paymentMethodId]
            : ["payment-methods"];
      expect(
        (await request(path, verb, { origin: "https://foreign.example.test" }))
          .status,
      ).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it.each([
    {
      verb: "PATCH",
      path: ["payment-methods", method.paymentMethodId, "default"],
    },
    {
      verb: "POST",
      path: ["payment-methods", method.paymentMethodId, "default"],
    },
    { verb: "GET", path: ["payment-methods", method.paymentMethodId] },
    { verb: "PUT", path: ["payment-methods", method.paymentMethodId] },
    { verb: "DELETE", path: ["payment-methods"] },
    { verb: "GET", path: ["payment-methods", "extra", "list"] },
    { verb: "GET", path: ["payment-methods-extra"] },
    { verb: "DELETE", path: ["payment-methods", "%252e%252e"] },
    { verb: "DELETE", path: ["payment-methods", "synthetic%252fadmin"] },
    {
      verb: "PUT",
      path: ["payment-methods", method.paymentMethodId, "default", "extra"],
    },
  ] as Array<{
    verb: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string[];
  }>)("denies wrong/extra/unsafe $verb $path", async ({ verb, path }) => {
    expect((await request(path, verb)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
