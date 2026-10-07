import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FirstPartyNotificationTransport, FirstPartyPushFailure } from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";

describe("FirstPartyNotificationTransport", () => {
  let transport: FirstPartyNotificationTransport;
  let mockRepo: any;
  let mockDeviceResolver: any;
  let mockProvider: any;
  let oldEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    oldEnv = { ...process.env };
    process.env.PASSENGER_PUSH_FIRST_PARTY_ENABLED = "true";

    mockRepo = {
      findFirstPartyNotificationContextAndTokens: vi.fn().mockResolvedValue(null),
      findOrderFirstPartyNotificationRoute: vi.fn().mockResolvedValue({ drtsPassengerId: "p1", tenantId: "t1", rideRef: "r1" }),
      findPartnerNotificationRelevance: vi.fn().mockResolvedValue({ status: "active", assignmentVersion: 1 }),
      prepareFirstPartyNotificationContext: vi.fn().mockResolvedValue({ targetDevices: [], expiresAt: new Date(Date.now() + 100000).toISOString() }),
    };

    mockDeviceResolver = {
      resolveActiveDevices: vi.fn().mockResolvedValue([]),
      invalidateDevice: vi.fn().mockResolvedValue(undefined),
    };

    mockProvider = {
      isConfigured: vi.fn().mockReturnValue(true),
      send: vi.fn().mockResolvedValue({ kind: "accepted", messageId: "msg1" }),
    };

    transport = new FirstPartyNotificationTransport(mockRepo as any, mockDeviceResolver as any, mockProvider as any);
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  const createReq = (attemptCount = 1) => ({
    message: { outboxId: "o1", orderId: "ord1", attemptCount, payload: { eventSequence: 1 } },
    context: { fenceToken: "f1" }
  } as any);

  it("throws configuration_blocked if not enabled", async () => {
    process.env.PASSENGER_PUSH_FIRST_PARTY_ENABLED = "false";
    try {
      await transport.send(createReq());
      expect.fail();
    } catch(e: any) {
      expect(e).toBeInstanceOf(FirstPartyPushFailure);
      expect(e.failure.retryDisposition).toBe("configuration_blocked");
    }
  });

  it("handles multiple devices, partial failure and invalidation", async () => {
    mockDeviceResolver.resolveActiveDevices.mockResolvedValue([
      { deviceId: "d1", tokenSha256: "sha1" },
      { deviceId: "d2", tokenSha256: "sha2" },
    ]);
    mockRepo.prepareFirstPartyNotificationContext.mockResolvedValue({
      targetDevices: [{ deviceId: "d1" }, { deviceId: "d2" }],
      expiresAt: new Date(Date.now() + 100000).toISOString(),
      wireMessage: { data: {} }
    });
    mockRepo.findFirstPartyNotificationContextAndTokens.mockResolvedValue({
      context: {
        targetDevices: [{ deviceId: "d1" }, { deviceId: "d2" }],
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        wireMessage: { data: {} }
      },
      tokensByDeviceId: new Map([["d1", "tok1"], ["d2", "tok2"]])
    });
    mockProvider.send.mockImplementation(async (msg: any, target: any) => {
      if (target.deviceId === "d1") return { kind: "invalid" };
      return { kind: "accepted", messageId: "msg-d2" };
    });

    const res = await transport.send(createReq());
    expect(res.providerMessageRef).toBe("msg-d2");
    expect(mockDeviceResolver.invalidateDevice).toHaveBeenCalledWith("d1", "provider_invalid");
  });

  it("throws transient error when provider fails transiently", async () => {
    mockDeviceResolver.resolveActiveDevices.mockResolvedValue([
      { deviceId: "d1", tokenSha256: "sha1" },
    ]);
    mockRepo.prepareFirstPartyNotificationContext.mockResolvedValue({
      targetDevices: [{ deviceId: "d1" }],
      expiresAt: new Date(Date.now() + 100000).toISOString(),
      wireMessage: { data: {} }
    });
    mockRepo.findFirstPartyNotificationContextAndTokens.mockResolvedValue({
      context: {
        targetDevices: [{ deviceId: "d1" }],
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        wireMessage: { data: {} }
      },
      tokensByDeviceId: new Map([["d1", "tok1"]])
    });
    mockProvider.send.mockResolvedValue({ kind: "transient", retryAfterSeconds: 5 });

    try {
      await transport.send(createReq());
      expect.fail("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(FirstPartyPushFailure);
      expect(e.failure.failureReason).toBe("provider_transient_error");
      expect(e.failure.retryDisposition).toBe("automatic");
    }
  });

  it("re-uses context on retry", async () => {
    mockRepo.findFirstPartyNotificationContextAndTokens.mockResolvedValue({
      context: {
        targetDevices: [{ deviceId: "d1" }],
        expiresAt: new Date(Date.now() + 100000).toISOString(),
        wireMessage: { data: {} }
      },
      tokensByDeviceId: new Map([["d1", "tok1"]])
    });
    
    await transport.send(createReq(2));
    expect(mockRepo.prepareFirstPartyNotificationContext).not.toHaveBeenCalled();
    expect(mockDeviceResolver.resolveActiveDevices).not.toHaveBeenCalled();
    expect(mockProvider.send).toHaveBeenCalled();
  });
});
