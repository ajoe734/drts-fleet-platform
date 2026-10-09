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
});
