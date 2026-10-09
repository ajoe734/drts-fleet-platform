import { describe, it, expect, vi } from "vitest";
import { PassengerClient } from "../../../packages/passenger-client/src/client.js";

describe("PassengerClient", () => {
  it("should call getAccount properly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "123",
        displayName: "Test",
        verifiedPhone: null,
        verifiedEmail: null,
        status: "active",
      }),
    });
    const client = new PassengerClient({
      baseUrl: "http://localhost",
      fetchFn: mockFetch,
    });
    const account = await client.getAccount();

    expect(account.id).toBe("123");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost/api/passenger-app/account",
      expect.any(Object),
    );
  });

  it("should call login properly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    const client = new PassengerClient({
      baseUrl: "http://localhost",
      fetchFn: mockFetch,
    });
    const res = await client.login({ challengeId: "c1", otp: "123456" });

    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost/api/passenger-app/auth/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ challengeId: "c1", otp: "123456" }) }),
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
