/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestPassengerRideAction } from "../../../apps/passenger-app-web/lib/ride/passenger-live";

describe("account passenger ride contact transport", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("sends the ride contact command and returns the backend contact option", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              mode: "masked_call",
              contact_uri: "tel:0000000000",
              expires_at: "2026-10-17T01:00:00.000Z",
              unavailable_reason: null,
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await requestPassengerRideAction(
      "same-account-order",
      "contact",
      {},
      false,
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/passenger-app/rides/same-account-order/contact",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({
      mode: "masked_call",
      contactUri: "tel:0000000000",
      expiresAt: "2026-10-17T01:00:00.000Z",
      unavailableReason: null,
    });
  });

  it("keeps provider absence and a null contact URI from the actual response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                mode: "unavailable",
                contact_uri: null,
                expires_at: null,
                unavailable_reason: "masked_call_provider_not_configured",
              },
            }),
            { status: 201 },
          ),
      ),
    );
    await expect(
      requestPassengerRideAction("same-account-order", "contact", {}, false),
    ).resolves.toEqual({
      mode: "unavailable",
      contactUri: null,
      expiresAt: null,
      unavailableReason: "masked_call_provider_not_configured",
    });
  });

  it("preserves backend contact errors for retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "PASSENGER_CONTACT_NOT_AVAILABLE",
                message: "Ride is cancelled",
              },
            }),
            { status: 409 },
          ),
      ),
    );
    await expect(
      requestPassengerRideAction("same-account-order", "contact", {}, false),
    ).rejects.toMatchObject({
      status: 409,
      code: "PASSENGER_CONTACT_NOT_AVAILABLE",
    });
  });

  it("retains the existing token contact path and option decoding", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              mode: "support_fallback",
              contact_uri: "tel:0000000000",
              expires_at: null,
              unavailable_reason: "masked_call_provider_not_configured",
            },
          }),
          { status: 201 },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await requestPassengerRideAction(
      "original-token",
      "contact",
      {},
      true,
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/passenger-rides/original-token/contact",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toMatchObject({
      mode: "support_fallback",
      contactUri: "tel:0000000000",
    });
  });
});
