import { describe, it, expect, vi } from "vitest";
import { PassengerClient } from "../../../packages/passenger-client/src/client.js";
import {
  apiWireResponse,
  fares,
  me,
  providers,
  quote,
  quoteCommand,
} from "./api-wire-fixtures";

const baseUrl = "https://ride.smarttransport.tw";
const loginCommand = {
  target: "passenger@example.test",
  code: "123456",
  provider: "email" as const,
  challenge: "challenge-123",
};

describe("PassengerClient formal API wire (R17)", () => {
  it("unwraps /me and decodes the account's serialized fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue(apiWireResponse(me));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    const account = await client.getAccount();

    expect(account).toEqual(me.account);
    expect(account.drtsPassengerId).toBe("pax-account-123");
    expect(account.contactPhoneVerified).toBe(true);
    expect(account.verifiedEmail).toBe("passenger@example.test");
    expect(account.status).toBe("active");
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
      `${baseUrl}/api/passenger-app/me`,
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("unwraps the configured providers from the formal envelope", async () => {
    const mockFetch = vi.fn().mockResolvedValue(apiWireResponse(providers));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    expect(await client.getProviders()).toEqual(providers);
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
      `${baseUrl}/api/passenger-app/auth/providers`,
      expect.any(Object),
    );
  });

  it("posts a snake_case quote command and decodes the quote values", async () => {
    const mockFetch = vi.fn().mockResolvedValue(apiWireResponse(quote));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    const result = await client.getFareQuote(quoteCommand);

    expect(result).toEqual(quote);
    expect(result.serviceAreaResult).toBe("serviceable");
    expect(result).toMatchObject({
      estimatedMin: 85,
      estimatedMax: 100,
      fareSnapshotId: "quote-snapshot-123",
    });
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
      `${baseUrl}/api/passenger-app/quotes`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          origin_lat: 25.01,
          origin_lng: 121.51,
          destination_lat: 25.02,
          destination_lng: 121.52,
          scheduled_at: "2026-10-12T01:00:00Z",
        }),
      }),
    );
  });

  it("retains the not_serviceable quote variant", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        apiWireResponse({ serviceAreaResult: "not_serviceable" }),
      );
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    expect(await client.getFareQuote(quoteCommand)).toEqual({
      serviceAreaResult: "not_serviceable",
    });
  });

  it("unwraps fares and recursively decodes the current version", async () => {
    const mockFetch = vi.fn().mockResolvedValue(apiWireResponse(fares));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    const result = await client.getFares();

    expect(result).toEqual(fares);
    expect(result.currentVersion.baseFare).toBe(85);
    expect(result.currentVersion.distanceIncrementMeters).toBe(200);
    expect(result.currentVersion.nightSurchargeWindowStart).toBe("23:00");
    expect(result.currentVersion.additionalFees).toEqual({ holiday: 10 });
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
      `${baseUrl}/api/passenger-app/fares`,
      expect.any(Object),
    );
  });

  it("logs in with a token-free BFF response, then loads /me into active session state", async () => {
    // The browser receives only the redacted result; /me is a distinct response.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(apiWireResponse({ result: "logged_in" }))
      .mockResolvedValueOnce(apiWireResponse(me));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    const result = await client.login(loginCommand);

    expect(result).toEqual({ result: "logged_in" });
    expect(result).not.toHaveProperty("accessToken");
    expect(result).not.toHaveProperty("refreshToken");
    expect(result).not.toHaveProperty("access_token");
    expect(result).not.toHaveProperty("refresh_token");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${baseUrl}/api/passenger-app/auth/otp/verify`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(loginCommand),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/api/passenger-app/me`,
      expect.any(Object),
    );
    expect(client.sessionStatus).toEqual({
      isActive: true,
      account: me.account,
    });
  });

  it("hydrates session status from /me and clears it on logout", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(apiWireResponse(me))
      .mockResolvedValueOnce(apiWireResponse({ success: true }));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    expect(client.sessionStatus).toEqual({ isActive: false });
    expect(await client.getSessionStatus()).toEqual({
      isActive: true,
      account: me.account,
    });
    await client.logout();
    expect(client.sessionStatus).toEqual({ isActive: false });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${baseUrl}/api/passenger-app/auth/logout`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("PassengerClient session failure boundaries", () => {
  it.each([401, 403])(
    "clears an existing account when /me rejects with %i",
    async (status) => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(apiWireResponse(me))
        .mockResolvedValueOnce(new Response(null, { status }));
      const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

      await client.getSessionStatus();
      expect(client.sessionStatus.account).toEqual(me.account);
      expect(await client.getSessionStatus()).toEqual({ isActive: false });
      expect(client.sessionStatus.account).toBeUndefined();
    },
  );

  it("does not retain the previous account if post-login /me fails", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(apiWireResponse(me))
      .mockResolvedValueOnce(apiWireResponse({ result: "logged_in" }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    await client.getSessionStatus();
    expect(await client.login(loginCommand)).toEqual({ result: "logged_in" });
    expect(client.sessionStatus).toEqual({ isActive: false });
  });

  it("clears local session state even if logout fails", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(apiWireResponse(me))
      .mockRejectedValueOnce(new Error("network failure"));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    await client.getSessionStatus();
    await expect(client.logout()).rejects.toThrow("network failure");
    expect(client.sessionStatus).toEqual({ isActive: false });
  });

  it("refreshes through the BFF without exposing session tokens", async () => {
    const mockFetch = vi.fn().mockResolvedValue(apiWireResponse({}));
    const client = new PassengerClient({ baseUrl, fetchFn: mockFetch });

    await expect(client.refreshSession()).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
      `${baseUrl}/api/passenger-app/auth/refresh`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
