import { describe, it, expect, vi } from "vitest";
import { PassengerClient } from "../../../packages/passenger-client/src/client.js";

describe("PassengerClient", () => {
  it("should call getAccount properly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        account: {
          drtsPassengerId: "123",
          contactPhoneVerified: true,
          status: "active",
          createdAt: "2026-01-01T00:00:00Z"
        }
      }),
    });
    const client = new PassengerClient({
      baseUrl: "http://localhost",
      fetchFn: mockFetch,
    });
    const account = await client.getAccount();

    expect(account.drtsPassengerId).toBe("123");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost/api/passenger-app/me",
      expect.any(Object),
    );
  });

  it("should call login properly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: "logged_in", accessToken: "a", refreshToken: "b" }),
    });
    const client = new PassengerClient({
      baseUrl: "http://localhost",
      fetchFn: mockFetch,
    });
    const reqBody = { target: "+123", code: "123456", provider: "phone" as const, challenge: "c1" };
    const res = await client.login(reqBody);

    expect(res.result).toBe("logged_in");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost/api/passenger-app/auth/otp/verify",
      expect.objectContaining({ method: "POST", body: JSON.stringify(reqBody) }),
    );
  });

  it("should call logout properly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const client = new PassengerClient({
      baseUrl: "http://localhost",
      fetchFn: mockFetch,
    });
    await client.logout();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost/api/passenger-app/auth/logout",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("PassengerClient SessionStatus", () => {
  it("should update and clear sessionStatus properly", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes("logout")) return { ok: true, status: 200, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ account: { drtsPassengerId: "123", contactPhoneVerified: true, status: "active", createdAt: "2026-01-01T00:00:00Z" } })
      };
    });
    const client = new PassengerClient({ baseUrl: "http://localhost", fetchFn: mockFetch });
    
    // Check initial state
    expect(client.sessionStatus.isActive).toBe(false);
    
    // Login or getSessionStatus populates it
    await client.getSessionStatus();
    expect(client.sessionStatus.isActive).toBe(true);
    expect(client.sessionStatus.account?.drtsPassengerId).toBe("123");
    
    // Logout clears it
    await client.logout();
    expect(client.sessionStatus.isActive).toBe(false);
    expect(client.sessionStatus.account).toBeUndefined();
  });
});
