import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FcmFirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/fcm-push.provider";

describe("FirstPartyNotification FCM Transport", () => {
  let provider: FcmFirstPartyPushProvider;
  let mockFetch: any;
  let mockTokens: any;
  let oldEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    oldEnv = { ...process.env };
    process.env.PASSENGER_PUSH_FCM_PROJECT_ID = "test-project-id";
    process.env.PASSENGER_PUSH_FIRST_PARTY_ENABLED = "true";
    mockFetch = vi.fn();
    mockTokens = {
      accessToken: vi.fn().mockResolvedValue("mock-access-token"),
    };
    provider = new FcmFirstPartyPushProvider(mockTokens, mockFetch as any);
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  describe("FcmFirstPartyPushProvider", () => {
    const mockMessage: any = {
      notification: { title: "Test", body: "Test" },
      data: { ride_ref: "123", expires_at: new Date().toISOString() },
    };
    const mockTarget = { deviceId: "d1", token: "fcm-token-123" };

    it("returns configuration_blocked if PASSENGER_PUSH_FCM_PROJECT_ID is missing", async () => {
      delete process.env.PASSENGER_PUSH_FCM_PROJECT_ID;
      expect(provider.isConfigured()).toBe(false);
      const result = await provider.send(mockMessage, mockTarget);
      expect(result).toEqual({ kind: "configuration_blocked" });
    });

    it("returns accepted when 200 OK with name", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ name: "projects/test/messages/123" }),
      });
      const result = await provider.send(mockMessage, mockTarget);
      expect(result).toEqual({ kind: "accepted", messageId: "projects/test/messages/123" });
    });

    it("returns invalid on 404 UNREGISTERED", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({ error: { status: "UNREGISTERED" } }),
      });
      const result = await provider.send(mockMessage, mockTarget);
      expect(result).toEqual({ kind: "invalid" });
    });

    it("returns invalid on 400 INVALID_ARGUMENT", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: { status: "INVALID_ARGUMENT" } }),
      });
      const result = await provider.send(mockMessage, mockTarget);
      expect(result).toEqual({ kind: "invalid" });
    });

    it("returns credential_rejected on 401 THIRD_PARTY_AUTH_ERROR", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: { status: "THIRD_PARTY_AUTH_ERROR" } }),
      });
      const result = await provider.send(mockMessage, mockTarget);
      expect(result).toEqual({ kind: "credential_rejected" });
    });

    it("returns transient on 429 with Retry-After", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: vi.fn().mockReturnValue("120") },
        json: vi.fn().mockResolvedValue({}),
      });
      const result = await provider.send(mockMessage, mockTarget);
      expect(result).toEqual({ kind: "transient", retryAfterSeconds: 120 });
    });

    it("returns transient on 500", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue({}),
      });
      const result = await provider.send(mockMessage, mockTarget);
      expect(result).toEqual({ kind: "transient" });
    });

    it("returns transient on fetch error (timeout)", async () => {
      mockFetch.mockRejectedValue(new Error("timed out"));
      const result = await provider.send(mockMessage, mockTarget);
      expect(result).toEqual({ kind: "transient" });
    });
  });

  // Further transport logic testing would go here
});
