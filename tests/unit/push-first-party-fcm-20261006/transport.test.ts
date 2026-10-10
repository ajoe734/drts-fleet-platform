import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FirstPartyNotificationTransport,
  FirstPartyPushFailure,
} from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
const route = {
  orderId: "ord1",
  drtsPassengerId: "p1",
  passengerSubjectRef: "subject1",
  tenantId: "t1",
  appId: "app1",
  rideRef: "ride1",
};
function request(attemptCount = 1, eventType = "eta_changed") {
  return {
    providerName: "first_party_app",
    message: {
      outboxId: "o1",
      orderId: "ord1",
      passengerSubjectRef: "subject1",
      attemptCount,
      eventType,
      assignmentVersion: 1,
      createdAt: new Date().toISOString(),
      payload: { eventSequence: 1, phone: "forbidden" },
    },
    context: { fenceToken: 1 },
  } as any;
}
function context() {
  return {
    outboxId: "o1",
    orderId: "ord1",
    tenantId: "t1",
    routeSnapshot: route,
    targetDevices: [
      { deviceId: "d1", tokenSha256: "hash1" },
      { deviceId: "d2", tokenSha256: "hash2" },
    ],
    deviceOutcomes: [],
    retryPolicySnapshot: {
      maxAttempts: 5,
      initialDelaySeconds: 30,
      backoffMultiplier: 2,
      maxDelaySeconds: 600,
    },
    expiresAt: new Date(Date.now() + 7200000).toISOString(),
    wireMessage: { data: {} },
    deliveryTarget: "first_party_device",
  } as any;
}
describe("first-party production transport", () => {
  let repo: any,
    devices: any,
    provider: any,
    transport: FirstPartyNotificationTransport,
    stored: any;
  beforeEach(() => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
    stored = context();
    repo = {
      findFirstPartyNotificationContextAndTokens: vi.fn(async () =>
        stored ? { context: stored } : null,
      ),
      findOrderFirstPartyNotificationRoute: vi.fn(async () => route),
      findPartnerNotificationRelevance: vi.fn(async () => ({
        status: "active",
        assignmentVersion: 1,
      })),
      prepareFirstPartyNotificationContext: vi.fn(async (c) => {
        stored = {
          ...c,
          createdAt: new Date().toISOString(),
          deliveredAt: null,
        };
        return stored;
      }),
      findFirstPartyNotificationDeviceToken: vi.fn(
        async (_c, target) => `synthetic-token-${target.deviceId}`,
      ),
    };
    devices = {
      resolveActiveDevices: vi.fn(async () => [
        {
          deviceId: "d1",
          tokenSha256: "hash1",
          appId: "app1",
          token: "secret1",
        },
        {
          deviceId: "other-app",
          tokenSha256: "otherhash",
          appId: "another-app",
          token: "secret2",
        },
      ]),
      invalidateDevice: vi.fn(),
    };
    provider = {
      isConfigured: vi.fn(() => true),
      send: vi.fn(async () => ({
        kind: "accepted",
        messageId: "projects/test/messages/real-1",
      })),
    };
    transport = new FirstPartyNotificationTransport(repo, devices, provider);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it.each([false, true])(
    "default-off/missing config (%s) has zero repository/provider IO",
    async (flag) => {
      vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", String(flag));
      provider.isConfigured.mockReturnValue(false);
      await expect(transport.send(request())).rejects.toMatchObject({
        failure: {
          failureReason: "configuration_blocked",
          retryDisposition: "configuration_blocked",
        },
      });
      expect(
        repo.findFirstPartyNotificationContextAndTokens,
      ).not.toHaveBeenCalled();
      expect(provider.send).not.toHaveBeenCalled();
    },
  );
  it("prepares token-free route, devices, policy and exact wire payload once", async () => {
    stored = null;
    const receipt = await transport.send(request());
    const [snapshot, fence] =
      repo.prepareFirstPartyNotificationContext.mock.calls[0];
    expect(fence).toBe(1);
    expect(snapshot.routeSnapshot).toEqual(route);
    expect(snapshot.targetDevices).toEqual([
      { deviceId: "d1", tokenSha256: "hash1" },
    ]);
    expect(snapshot.retryPolicySnapshot.maxAttempts).toBe(5);
    expect(Object.keys(snapshot.wireMessage.data).sort()).toEqual(
      [
        "notification_id",
        "event",
        "ride_ref",
        "event_sequence",
        "expires_at",
      ].sort(),
    );
    expect(snapshot.wireMessage.data.event).toBe("passenger.eta_changed.v1");
    expect(JSON.stringify(receipt)).not.toMatch(
      /secret1|secret2|synthetic-token|forbidden/,
    );
    await transport.send(request(2));
    expect(devices.resolveActiveDevices).toHaveBeenCalledOnce();
  });
  it("records accepted plus invalid results and invalidates captured token only", async () => {
    provider.send.mockResolvedValueOnce({
      kind: "invalid",
      errorCode: "UNREGISTERED",
    });
    const receipt = await transport.send(request());
    expect(receipt.deliveryContext.deviceOutcomes).toEqual([
      {
        deviceId: "d1",
        kind: "invalid",
        messageId: null,
        errorCode: "UNREGISTERED",
      },
      {
        deviceId: "d2",
        kind: "accepted",
        messageId: "projects/test/messages/real-1",
        errorCode: null,
      },
    ]);
    expect(receipt.deliveryContext.deliveryStage).toBe("provider_accepted");
    expect(devices.invalidateDevice).toHaveBeenCalledWith(
      "d1",
      "provider_invalid",
      "hash1",
    );
  });
  it.each(["no devices", "all invalid", "all ineligible"])(
    "terminalizes %s",
    async (scenario) => {
      if (scenario === "no devices") stored.targetDevices = [];
      if (scenario === "all invalid")
        provider.send.mockResolvedValue({ kind: "invalid" });
      if (scenario === "all ineligible")
        repo.findFirstPartyNotificationDeviceToken.mockResolvedValue(null);
      await expect(transport.send(request())).rejects.toMatchObject({
        failure: {
          failureReason: "no_active_device",
          retryDisposition: "terminal",
        },
      });
    },
  );
  it("retry excludes invalid/accepted and newly registered devices", async () => {
    stored.deviceOutcomes = [
      {
        deviceId: "d1",
        kind: "invalid",
        messageId: null,
        errorCode: "UNREGISTERED",
      },
    ];
    devices.resolveActiveDevices.mockResolvedValue([
      { deviceId: "new-device" },
    ]);
    await transport.send(request(2));
    expect(provider.send).toHaveBeenCalledOnce();
    expect(provider.send.mock.calls[0][1].deviceId).toBe("d2");
    expect(devices.resolveActiveDevices).not.toHaveBeenCalled();
  });
  it("invalid plus transient retries only the unchanged remaining device", async () => {
    provider.send
      .mockResolvedValueOnce({ kind: "invalid" })
      .mockResolvedValueOnce({ kind: "transient" });
    const failure = await transport.send(request()).catch((e) => e);
    expect(failure).toBeInstanceOf(FirstPartyPushFailure);
    stored = failure.deliveryContext;
    expect(failure.failure.retryDisposition).toBe("automatic");
    provider.send.mockClear();
    await transport.send(request(2));
    expect(provider.send).toHaveBeenCalledOnce();
    expect(provider.send.mock.calls[0][1].deviceId).toBe("d2");
  });
  it.each([1, 3600])(
    "honors provider minimum %s alongside frozen backoff",
    async (delay) => {
      vi.useFakeTimers();
      provider.send.mockResolvedValue({
        kind: "transient",
        retryAfterSeconds: delay,
      });
      stored.retryPolicySnapshot.initialDelaySeconds = 45;
      const error = await transport.send(request(2)).catch((e) => e);
      expect(
        Date.parse(error.failure.suggestedNextAttemptAt) - Date.now(),
      ).toBe(Math.max(90, delay) * 1000);
    },
  );
  it.each([5, 6])(
    "never schedules beyond final attempt %s",
    async (attempt) => {
      provider.send.mockResolvedValue({ kind: "transient" });
      await expect(transport.send(request(attempt))).rejects.toMatchObject({
        failure: { retryDisposition: "terminal", suggestedNextAttemptAt: null },
      });
      if (attempt === 6) expect(provider.send).not.toHaveBeenCalled();
    },
  );
  it("does not schedule beyond expiry", async () => {
    stored.expiresAt = new Date(Date.now() + 20000).toISOString();
    provider.send.mockResolvedValue({ kind: "transient" });
    await expect(transport.send(request())).rejects.toMatchObject({
      failure: {
        failureReason: "notification_expired",
        retryDisposition: "terminal",
      },
    });
  });
  it.each(["credential_rejected", "configuration_blocked"])(
    "configuration failure %s is not automatic",
    async (kind) => {
      provider.send.mockResolvedValue({ kind });
      await expect(transport.send(request())).rejects.toMatchObject({
        failure: {
          failureReason: kind,
          retryDisposition: "configuration_blocked",
        },
      });
    },
  );
  it.each(["trip_cancelled", "receipt_ready"])(
    "allows %s on cancelled order",
    async (event) => {
      repo.findPartnerNotificationRelevance.mockResolvedValue({
        status: "cancelled",
        assignmentVersion: 2,
      });
      expect(
        (await transport.send(request(1, event))).deliveryContext.deliveryStage,
      ).toBe("provider_accepted");
    },
  );
  it.each([
    ["cancelled", 1, "notification_obsolete"],
    ["active", 2, "notification_superseded"],
  ])("stops stale relevance %s %s", async (status, version, reason) => {
    repo.findPartnerNotificationRelevance.mockResolvedValue({
      status,
      assignmentVersion: version,
    });
    await expect(transport.send(request())).rejects.toMatchObject({
      failure: { failureReason: reason },
    });
    expect(provider.send).not.toHaveBeenCalled();
  });
  it("rechecks relevance immediately before IO", async () => {
    repo.findPartnerNotificationRelevance
      .mockResolvedValueOnce({ status: "active", assignmentVersion: 1 })
      .mockResolvedValue({ status: "cancelled", assignmentVersion: 1 });
    await expect(transport.send(request())).rejects.toMatchObject({
      failure: { failureReason: "notification_obsolete" },
    });
    expect(provider.send).not.toHaveBeenCalled();
  });
  it("rejects changed passenger owner", async () => {
    repo.findOrderFirstPartyNotificationRoute.mockResolvedValue({
      ...route,
      drtsPassengerId: "someone-else",
    });
    await expect(transport.send(request())).rejects.toMatchObject({
      failure: { failureReason: "owner_changed" },
    });
    expect(provider.send).not.toHaveBeenCalled();
  });
});
