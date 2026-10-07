// PUSH-FIRST-PARTY-FCM-20261006 — push-first-party-fcm_transport_and_error_mapping
// D6's error-mapping table, exercised against the real FcmHttpV1PushProvider
// with an injected fetch stub (no real network call ever made). Every FCM
// response code the design doc names is covered: 200, 404 UNREGISTERED,
// 400 INVALID_ARGUMENT, 403 SENDER_ID_MISMATCH, 403 other, 401,
// THIRD_PARTY_AUTH_ERROR, 429 + Retry-After, 500, 503, and a request timeout.
import { describe, expect, it, vi } from "vitest";
import type { FirstPartyPushMessage } from "@drts/contracts";
import {
  classifyFcmErrorResponse,
  FcmHttpV1PushProvider,
} from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";

const message: FirstPartyPushMessage = {
  notification: { title: "DRTS 乘車通知", body: "司機已抵達，請回行程查看。" },
  data: {
    notification_id: "outbox-1",
    event: "passenger.driver_arrived.v1",
    ride_ref: "ride-1",
    event_sequence: "1",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

const options = {
  projectId: "drts-passenger-push",
  ttlSeconds: 3600,
  collapseKey: "driver_arrived:outbox-1",
  expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + 60,
};

function stubTokens(accessToken = "fake-access-token") {
  return { accessToken: vi.fn(async () => accessToken), identityToken: vi.fn() };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("push-first-party-fcm_transport_and_error_mapping — classifyFcmErrorResponse (pure)", () => {
  it.each([
    ["404 UNREGISTERED", 404, { error: { status: "UNREGISTERED" } }, "invalid"],
    ["400 INVALID_ARGUMENT", 400, { error: { status: "INVALID_ARGUMENT" } }, "invalid"],
    ["403 SENDER_ID_MISMATCH", 403, { error: { status: "SENDER_ID_MISMATCH" } }, "invalid"],
    ["403 other", 403, { error: { status: "PERMISSION_DENIED" } }, "credential_rejected"],
    ["401", 401, { error: { status: "UNAUTHENTICATED" } }, "credential_rejected"],
    [
      "THIRD_PARTY_AUTH_ERROR (any http status)",
      400,
      { error: { status: "THIRD_PARTY_AUTH_ERROR" } },
      "credential_rejected",
    ],
    ["500 INTERNAL", 500, { error: { status: "INTERNAL" } }, "transient"],
    ["503 UNAVAILABLE", 503, { error: { status: "UNAVAILABLE" } }, "transient"],
    ["429 QUOTA_EXCEEDED", 429, { error: { status: "RESOURCE_EXHAUSTED" } }, "transient"],
    ["unrecognised status", 418, { error: { status: "TEAPOT" } }, "transient"],
  ])("%s -> %s", (_label, status, body, expectedOutcome) => {
    expect(classifyFcmErrorResponse(status, body, null).outcome).toBe(expectedOutcome);
  });
});

describe("push-first-party-fcm_transport_and_error_mapping — FcmHttpV1PushProvider.send", () => {
  it("200 with a real message name -> accepted, never a synthesized receipt", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { name: "projects/p/messages/real-fcm-message-42" }),
    );
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    const result = await provider.send("device-token-raw", message, options);
    expect(result).toEqual({ outcome: "accepted", messageName: "projects/p/messages/real-fcm-message-42" });
  });

  it("200 without a message name is never treated as accepted", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    const result = await provider.send("device-token-raw", message, options);
    expect(result.outcome).toBe("transient");
  });

  it("404 UNREGISTERED -> invalid", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: { status: "UNREGISTERED" } }));
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({ outcome: "invalid" });
  });

  it("400 INVALID_ARGUMENT -> invalid", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { error: { status: "INVALID_ARGUMENT" } }));
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({ outcome: "invalid" });
  });

  it("403 SENDER_ID_MISMATCH -> invalid (device-specific, not credential)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403, { error: { status: "SENDER_ID_MISMATCH" } }));
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({ outcome: "invalid" });
  });

  it("401 -> credential_rejected", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: { status: "UNAUTHENTICATED" } }));
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({ outcome: "credential_rejected" });
  });

  it("THIRD_PARTY_AUTH_ERROR -> credential_rejected", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { status: "THIRD_PARTY_AUTH_ERROR" } }),
    );
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({ outcome: "credential_rejected" });
  });

  it("429 QUOTA_EXCEEDED respects Retry-After", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } }, { "retry-after": "30" }),
    );
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({
      outcome: "transient",
      retryAfterSeconds: 30,
    });
  });

  it("500 INTERNAL -> transient", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, { error: { status: "INTERNAL" } }));
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({
      outcome: "transient",
      retryAfterSeconds: null,
    });
  });

  it("503 UNAVAILABLE -> transient", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { error: { status: "UNAVAILABLE" } }));
    const provider = new FcmHttpV1PushProvider(stubTokens(), fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({
      outcome: "transient",
      retryAfterSeconds: null,
    });
  });

  it("a request timeout -> transient, never invalid/credential_rejected", async () => {
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => reject(new Error("should never resolve in time")), 50);
        }),
    );
    const provider = new FcmHttpV1PushProvider(
      stubTokens(),
      fetchImpl as unknown as typeof fetch,
      5,
    );
    expect(await provider.send("t", message, options)).toEqual({
      outcome: "transient",
      retryAfterSeconds: null,
    });
  });

  it("a token-acquisition failure -> transient, not a device/credential verdict", async () => {
    const tokens = { accessToken: vi.fn(async () => { throw new Error("metadata unavailable"); }), identityToken: vi.fn() };
    const fetchImpl = vi.fn();
    const provider = new FcmHttpV1PushProvider(tokens, fetchImpl as unknown as typeof fetch);
    expect(await provider.send("t", message, options)).toEqual({
      outcome: "transient",
      retryAfterSeconds: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the raw token only inside the FCM request body, with the required envelope fields, and never logs it", async () => {
    const logSpy = vi.spyOn(console, "log");
    const errorSpy = vi.spyOn(console, "error");
    const fetchImpl = vi.fn(async () => jsonResponse(200, { name: "projects/p/messages/42" }));
    const provider = new FcmHttpV1PushProvider(stubTokens("bearer-xyz"), fetchImpl as unknown as typeof fetch);
    await provider.send("super-secret-raw-token", message, options);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      `https://fcm.googleapis.com/v1/projects/${options.projectId}/messages:send`,
    );
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBe("Bearer bearer-xyz");
    const body = JSON.parse(init.body as string);
    expect(body.message.token).toBe("super-secret-raw-token");
    expect(body.message.notification).toEqual(message.notification);
    expect(body.message.data).toEqual(message.data);
    expect(body.message.android).toEqual({ ttl: "3600s", collapse_key: options.collapseKey });
    expect(body.message.apns.headers["apns-expiration"]).toBe(
      String(options.expiresAtEpochSeconds),
    );
    expect(body.message.apns.headers["apns-collapse-id"]).toBe(options.collapseKey);

    const loggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join("\n");
    expect(loggedText).not.toContain("super-secret-raw-token");
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
