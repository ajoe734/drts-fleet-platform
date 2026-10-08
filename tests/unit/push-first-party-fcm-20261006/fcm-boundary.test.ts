import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FcmFirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/fcm-push.provider";

const fcmError = (errorCode: string) => ({
  "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
  errorCode,
});
const badField = (field: string) => ({
  "@type": "type.googleapis.com/google.rpc.BadRequest",
  fieldViolations: [{ field }],
});
const target = { deviceId: "d1", token: "synthetic-private-device-token" };
const name = "projects/test-project/messages/message-123";
function message() {
  return {
    notification: { title: "乘車通知", body: "請查看最新乘車資訊" },
    data: {
      notification_id: "n1",
      event: "passenger.eta_changed.v1",
      ride_ref: "r1",
      event_sequence: "1",
      expires_at: new Date(Date.now() + 60000).toISOString(),
    },
  } as any;
}
describe("FCM production provider boundary", () => {
  let fetchStub: ReturnType<typeof vi.fn>;
  let accessToken: ReturnType<typeof vi.fn>;
  let provider: FcmFirstPartyPushProvider;
  beforeEach(() => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
    vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", "test-project");
    fetchStub = vi.fn().mockResolvedValue(Response.json({ name }));
    accessToken = vi.fn().mockResolvedValue("synthetic-access-token");
    provider = new FcmFirstPartyPushProvider(
      { accessToken } as any,
      fetchStub as any,
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it.each([undefined, "false"])(
    "flag %s blocks metadata and HTTP",
    async (flag) => {
      vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", flag);
      expect(
        await provider.send(message(), target, async () => true),
      ).toMatchObject({
        kind: "configuration_blocked",
      });
      expect(accessToken).not.toHaveBeenCalled();
      expect(fetchStub).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, "", " "])(
    "missing project %s blocks all IO",
    async (project) => {
      vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", project);
      expect(
        await provider.send(message(), target, async () => true),
      ).toMatchObject({
        kind: "configuration_blocked",
      });
      expect(accessToken).not.toHaveBeenCalled();
      expect(fetchStub).not.toHaveBeenCalled();
    },
  );
  it("uses remaining TTL, exact allowlist and redirect error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
    const input = message();
    input.data.phone = "forbidden";
    expect(await provider.send(input, target, async () => true)).toMatchObject({
      kind: "accepted",
      messageId: name,
    });
    const [url, request] = fetchStub.mock.calls[0]!;
    const body = JSON.parse(request.body).message;
    expect(url).toBe(
      "https://fcm.googleapis.com/v1/projects/test-project/messages:send",
    );
    expect(request.redirect).toBe("error");
    expect(body.android.ttl).toBe("60s");
    expect(body.apns.headers["apns-expiration"]).toBe(
      String(Date.parse(input.data.expires_at) / 1000),
    );
    expect(Object.keys(body.data).sort()).toEqual(
      [
        "notification_id",
        "event",
        "ride_ref",
        "event_sequence",
        "expires_at",
      ].sort(),
    );
  });
  it("never sends expired messages", async () => {
    const input = message();
    input.data.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(
      (await provider.send(input, target, async () => true)).kind,
    ).not.toBe("accepted");
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it.each([
    [404, "NOT_FOUND", [fcmError("UNREGISTERED")], "invalid"],
    [404, "NOT_FOUND", [], "configuration_blocked"],
    [400, "INVALID_ARGUMENT", [fcmError("INVALID_ARGUMENT")], "invalid"],
    [400, "INVALID_ARGUMENT", [badField("message.token")], "invalid"],
    [
      400,
      "INVALID_ARGUMENT",
      [badField("message.data[0].value")],
      "configuration_blocked",
    ],
    [
      400,
      "INVALID_ARGUMENT",
      [fcmError("INVALID_ARGUMENT"), badField("message.data")],
      "configuration_blocked",
    ],
    [403, "PERMISSION_DENIED", [fcmError("SENDER_ID_MISMATCH")], "invalid"],
    [403, "PERMISSION_DENIED", [], "credential_rejected"],
    [401, "UNAUTHENTICATED", [], "credential_rejected"],
    [
      401,
      "UNAUTHENTICATED",
      [fcmError("THIRD_PARTY_AUTH_ERROR")],
      "credential_rejected",
    ],
    [429, "RESOURCE_EXHAUSTED", [fcmError("QUOTA_EXCEEDED")], "transient"],
    [500, "INTERNAL", [], "transient"],
    [503, "UNAVAILABLE", [], "transient"],
  ])("maps %s %s %j to %s", async (status, code, details, kind) => {
    fetchStub.mockResolvedValue(
      Response.json(
        { error: { status: code, message: target.token, details } },
        { status: status as number },
      ),
    );
    const result = await provider.send(message(), target, async () => true);
    expect(result.kind).toBe(kind);
    expect(JSON.stringify(result)).not.toContain(target.token);
  });
  it.each(["1", "3600", "Wed, 07 Oct 2026 01:00:00 GMT"])(
    "honors Retry-After %s",
    async (header) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
      fetchStub.mockResolvedValue(
        Response.json({}, { status: 503, headers: { "Retry-After": header } }),
      );
      expect(
        await provider.send(message(), target, async () => true),
      ).toMatchObject({
        kind: "transient",
        retryAfterSeconds: header === "1" ? 1 : 3600,
      });
    },
  );
  it.each([
    {},
    { name: " " },
    { name: {} },
    { name: "fake" },
    { name: "projects/test/messages/" },
  ])("rejects malformed ack %j", async (body) => {
    fetchStub.mockResolvedValue(Response.json(body));
    expect(
      (await provider.send(message(), target, async () => true)).kind,
    ).toBe("internal_error");
  });
  it("cancels oversized response body", async () => {
    const cancel = vi.fn();
    fetchStub.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(17000));
          },
          cancel,
        }),
      ),
    );
    expect(
      (await provider.send(message(), target, async () => true)).kind,
    ).toBe("internal_error");
    expect(cancel).toHaveBeenCalled();
  });
  it("bounds an actual stalled request at ten seconds without exposing tokens", async () => {
    vi.useFakeTimers();
    fetchStub.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new Error(target.token)),
          ),
        ),
    );
    const pending = provider.send(message(), target, async () => true);
    await vi.advanceTimersByTimeAsync(10001);
    const result = await pending;
    expect(result.kind).toBe("transient");
    expect(JSON.stringify(result)).not.toContain(target.token);
  });
});
