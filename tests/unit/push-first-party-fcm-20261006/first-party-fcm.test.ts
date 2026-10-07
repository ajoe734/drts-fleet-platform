import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirstPartyPushMessage } from "@drts/contracts";
import { FcmFirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/fcm-push.provider";

const NOW = Date.parse("2030-01-01T00:00:00Z");
const FCM = "type.googleapis.com/google.firebase.fcm.v1.FcmError";
const BAD = "type.googleapis.com/google.rpc.BadRequest";
const message: FirstPartyPushMessage = {
  notification: { title: "乘車通知", body: "請查看最新乘車資訊" },
  data: {
    notification_id: "o1",
    event: "passenger.driver_arrived.v1",
    ride_ref: "r1",
    event_sequence: "1",
    expires_at: new Date(NOW + 60_000).toISOString(),
  },
};
const target = { deviceId: "d1", token: "synthetic-device-token-not-real" };
const ack = { name: "projects/test-project/messages/0:123%abc" };
function errorResponse(
  status: number,
  code?: string,
  details: unknown[] = [],
  retryAfter?: string,
) {
  return Response.json(
    { error: { status: code, message: target.token, details } },
    {
      status,
      ...(retryAfter === undefined ? {} : { headers: { "Retry-After": retryAfter } }),
    },
  );
}
function fcm(errorCode: string) {
  return { "@type": FCM, errorCode };
}
function bad(field: string) {
  return {
    "@type": BAD,
    fieldViolations: [{ field, description: target.token }],
  };
}

describe("actual FCM provider: bounded, dormant, token-specific mapping", () => {
  const tokens = { accessToken: vi.fn(), identityToken: vi.fn() };
  const fetchMock = vi.fn<typeof fetch>();
  let provider: FcmFirstPartyPushProvider;
  beforeEach(() => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
    vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", "test-project");
    tokens.accessToken.mockReset().mockResolvedValue("synthetic-access-token");
    fetchMock.mockReset().mockResolvedValue(Response.json(ack));
    provider = new FcmFirstPartyPushProvider(tokens, fetchMock, () => NOW);
    // A mistaken use of global fetch must fail rather than contacting anything.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Real network prohibited");
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([undefined, "false", "TRUE", "1"])(
    "flag %s is default-disabled even with a project",
    async (flag) => {
      vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", flag);
      expect(provider.isConfigured()).toBe(false);
      expect(await provider.send(message, target)).toEqual({
        kind: "configuration_blocked",
      });
      expect(tokens.accessToken).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "", "project/evil", "https://other.invalid"])(
    "missing/unsafe project %s does no I/O",
    async (project) => {
      vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", project);
      expect(await provider.send(message, target)).toEqual({
        kind: "configuration_blocked",
      });
      expect(tokens.accessToken).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("accepts only a real structured message name and isolates payload allowlist/TTL", async () => {
    const extra = {
      ...message,
      data: { ...message.data, phone: "prohibited", token: target.token },
    };
    expect(await provider.send(extra, target)).toEqual({
      kind: "accepted",
      messageId: ack.name,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://fcm.googleapis.com/v1/projects/test-project/messages:send",
    );
    expect(init?.redirect).toBe("error");
    const payload = JSON.parse(String(init?.body)).message;
    expect(payload.data).toEqual(message.data);
    expect(payload.android).toEqual({ ttl: "60s", collapse_key: "r1" });
    expect(payload.apns.headers).toEqual({
      "apns-expiration": String((NOW + 60_000) / 1000),
      "apns-collapse-id": "r1",
    });
  });
  it.each([
    {},
    { name: {} },
    { name: "" },
    { name: "   " },
    { name: "projects/other/messages/a" },
    { name: "projects/test-project/messages/" },
  ])("rejects malformed 200 ack %j without synthetic receipt", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    expect(await provider.send(message, target)).toEqual({
      kind: "internal_error",
    });
  });
  it("bounds and releases oversized success bodies", async () => {
    const response = Response.json({
      name: ack.name,
      padding: "x".repeat(17 * 1024),
    });
    fetchMock.mockResolvedValue(response);
    expect(await provider.send(message, target)).toEqual({
      kind: "internal_error",
    });
    expect(response.body?.locked).toBe(false);
  });
  it.each([
    [404, "NOT_FOUND", [fcm("UNREGISTERED")], "invalid"],
    [404, "NOT_FOUND", [], "internal_error"],
    [400, "INVALID_ARGUMENT", [fcm("INVALID_ARGUMENT")], "invalid"],
    [400, "INVALID_ARGUMENT", [bad("message.token")], "invalid"],
    [400, "INVALID_ARGUMENT", [bad("message.data")], "internal_error"],
    [400, "INVALID_ARGUMENT", [], "internal_error"],
    [403, "PERMISSION_DENIED", [fcm("SENDER_ID_MISMATCH")], "invalid"],
    [403, "PERMISSION_DENIED", [], "credential_rejected"],
    [401, "UNAUTHENTICATED", [], "credential_rejected"],
    [
      401,
      "UNAUTHENTICATED",
      [fcm("THIRD_PARTY_AUTH_ERROR")],
      "credential_rejected",
    ],
    [
      400,
      "INVALID_ARGUMENT",
      [fcm("THIRD_PARTY_AUTH_ERROR")],
      "credential_rejected",
    ],
    [429, "RESOURCE_EXHAUSTED", [], "transient"],
    [500, "INTERNAL", [], "transient"],
    [503, "UNAVAILABLE", [], "transient"],
  ] as const)(
    "HTTP %i/%s typed details -> %s",
    async (status, code, details, expected) => {
      const response = errorResponse(status, code, [...details]);
      fetchMock.mockResolvedValue(response);
      const result = await provider.send(message, target);
      expect(result).toEqual({ kind: expected });
      expect(JSON.stringify(result)).not.toContain(target.token);
      expect(response.body?.locked).toBe(false);
    },
  );
  it.each([
    ["120", 120],
    [new Date(NOW + 3_600_000).toUTCString(), 3600],
  ])(
    "respects Retry-After %s without a 600s provider cap",
    async (value, seconds) => {
      fetchMock.mockResolvedValue(
        errorResponse(429, "RESOURCE_EXHAUSTED", [], String(value)),
      );
      expect(await provider.send(message, target)).toEqual({
        kind: "transient",
        retryAfterSeconds: seconds,
      });
    },
  );
  it("retains transient classification for non-JSON 503 and disposes body", async () => {
    const response = new Response("not JSON", {
      status: 503,
      headers: { "Retry-After": "3600" },
    });
    fetchMock.mockResolvedValue(response);
    expect(await provider.send(message, target)).toEqual({
      kind: "transient",
      retryAfterSeconds: 3600,
    });
    expect(response.body?.locked).toBe(false);
  });
  it("does not send expired contexts", async () => {
    expect(
      await provider.send(
        {
          ...message,
          data: { ...message.data, expires_at: new Date(NOW).toISOString() },
        },
        target,
      ),
    ).toEqual({ kind: "internal_error" });
    expect(tokens.accessToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rechecks TTL after metadata acquisition", async () => {
    let now = NOW;
    provider = new FcmFirstPartyPushProvider(tokens, fetchMock, () => now);
    tokens.accessToken.mockImplementation(async () => {
      now += 60_000;
      return "synthetic-access-token";
    });
    expect(await provider.send(message, target)).toEqual({
      kind: "internal_error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds a stalled request to 10s without exposing exception text", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const result = provider.send(message, target);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await result).toEqual({ kind: "transient" });
  });
  it("redacts unexpected exception message/stack/cause", async () => {
    fetchMock.mockRejectedValue(
      new Error(target.token, { cause: "synthetic-access-token" }),
    );
    expect(await provider.send(message, target)).toEqual({ kind: "transient" });
  });
});
