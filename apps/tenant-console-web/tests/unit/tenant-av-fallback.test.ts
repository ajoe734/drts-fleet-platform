import type { SandboxFulfillmentProjectionView } from "@drts/contracts";
import { describe, expect, it } from "vitest";
import {
  resolveTenantAvFallbackStage,
  resolveTenantMessageCode,
  supportsTenantAvFallbackDetail,
} from "../../lib/tenant-av-fallback";

function buildProjection(
  overrides: Partial<SandboxFulfillmentProjectionView> = {},
): SandboxFulfillmentProjectionView {
  return {
    bookingId: "bk_123",
    orderId: "ord_123",
    sandboxTripId: "ord_123",
    audience: "tenant",
    fulfillmentMode: "human_fallback",
    state: "assigned",
    statusCode: "human_fallback_assigned",
    messages: [
      {
        messageCode: "sandbox_fulfillment.human_fallback_active",
        category: "info",
      },
    ],
    etaMinutes: 9,
    extraChargeDisclosed: false,
    providerBrandDisclosed: false,
    updatedAt: "2026-06-28T08:00:00.000Z",
    ...overrides,
  };
}

describe("tenant AV fallback helpers", () => {
  it("maps a public vehicle-change status code to the vehicle-change stage", () => {
    expect(
      resolveTenantAvFallbackStage(
        buildProjection({ statusCode: "vehicle_change_in_progress" }),
      ),
    ).toBe("vehicle_change_in_progress");
  });

  it("marks in-trip fallback as service continuing", () => {
    expect(
      resolveTenantAvFallbackStage(buildProjection({ state: "in_trip" })),
    ).toBe("service_continuing");
  });

  it("only exposes the dedicated detail route for fallback projections", () => {
    expect(supportsTenantAvFallbackDetail(buildProjection())).toBe(true);
    expect(
      supportsTenantAvFallbackDetail(
        buildProjection({
          fulfillmentMode: "tesla_av",
          statusCode: "tesla_av_active",
        }),
      ),
    ).toBe(false);
  });

  it("falls back to the tenant-safe default message code when none is published", () => {
    expect(
      resolveTenantMessageCode(buildProjection({ messages: [] })),
    ).toBe("sandbox_fulfillment.status_update_available");
  });
});
