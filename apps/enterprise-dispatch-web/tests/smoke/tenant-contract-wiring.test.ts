import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnterpriseDispatchTenantClient } from "@/lib/api-client";
import { ENTERPRISE_DISPATCH_TENANT_API_GAP_MAP } from "@/lib/tenant-api-gap-map";
import {
  enterpriseDispatchBookingFixture,
  enterpriseDispatchBookingRecord,
  tenantConsoleBookingLink,
} from "../fixtures/dispatch-booking-fixture";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("enterprise dispatch tenant contract wiring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts booking fixtures through POST /api/tenant/bookings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          bookingId: "booking-001",
          orderId: "order-001",
        },
        meta: {
          requestId: "req-001",
          timestamp: "2026-06-12T08:00:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createEnterpriseDispatchTenantClient(
      "http://api.test",
      "tenant-001",
      "dispatch-agent-001",
    );
    await expect(
      client.createBookingFromFixture(enterpriseDispatchBookingFixture),
    ).resolves.toMatchObject({
      bookingId: "booking-001",
      orderId: "order-001",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/tenant/bookings");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "x-actor-type": "tenant_admin",
      "x-actor-id": "dispatch-agent-001",
      "x-tenant-id": "tenant-001",
      "x-realm": "tenant",
    });
    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        businessDispatchSubtype: "enterprise_dispatch",
        costCenter: "OPS-001",
      }),
    );
  });

  it("reads booking gate state back from GET /api/tenant/bookings/:bookingId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: enterpriseDispatchBookingRecord,
        meta: {
          requestId: "req-002",
          timestamp: "2026-06-12T08:05:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createEnterpriseDispatchTenantClient(
      "http://api.test",
      "tenant-001",
    );

    await expect(client.getBookingGateSnapshot("booking-001")).resolves.toEqual(
      expect.objectContaining({
        blockingCount: 1,
        primaryGateType: "eligibility",
      }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/tenant/bookings/booking-001");
    expect(init.method).toBe("GET");
  });

  it("publishes the gap map and keeps embed mode in deep-link fallback", () => {
    const client = createEnterpriseDispatchTenantClient(
      "http://api.test",
      "tenant-001",
    );

    expect(client.getGapMap()).toEqual(ENTERPRISE_DISPATCH_TENANT_API_GAP_MAP);
    expect(client.getEmbedDisposition(tenantConsoleBookingLink)).toEqual(
      expect.objectContaining({
        reasonCode: "PHASE1_DEEP_LINK_ONLY",
        fallbackHref:
          "https://tenant-console.dev.example/bookings/booking-001",
      }),
    );
  });
});
