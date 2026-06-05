import { describe, expect, it, vi } from "vitest";

import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { FleetPartnerController } from "../../src/modules/fleet-partner/fleet-partner.controller";

function platformAdminIdentity(
  actorId = "platform-admin-ctl-001",
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "platform_admin",
    actorId,
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: [],
    requestId: null,
  };
}

describe("FleetPartnerController", () => {
  it("wraps list responses in the standard success envelope", () => {
    const fleetPartnerService = {
      listFleetPartners: vi.fn(() => [
        {
          fleetPartnerId: "fleet-demo-001",
          displayName: "Demo Fleet One",
        },
      ]),
    };
    const controller = new FleetPartnerController(fleetPartnerService as never);

    const response = controller.listFleetPartners("req-fleet-list-001");

    expect(fleetPartnerService.listFleetPartners).toHaveBeenCalled();
    expect(response).toEqual({
      data: {
        items: [
          {
            fleetPartnerId: "fleet-demo-001",
            displayName: "Demo Fleet One",
          },
        ],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 1,
          totalPages: 1,
        },
      },
      meta: {
        requestId: "req-fleet-list-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("passes admin identity through for fleet affiliation writes", () => {
    const fleetPartnerService = {
      createDriverFleetAffiliation: vi.fn(() => ({
        affiliationId: "dfa-new-001",
        driverId: "drv-demo-001",
      })),
    };
    const controller = new FleetPartnerController(fleetPartnerService as never);

    const response = controller.createDriverFleetAffiliation(
      "drv-demo-001",
      {
        fleetPartnerId: "fleet-demo-001",
        affiliationType: "managed_by",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
      },
      platformAdminIdentity("platform-admin-ctl-099"),
      "req-fleet-affiliation-ctl-001",
    );

    expect(
      fleetPartnerService.createDriverFleetAffiliation,
    ).toHaveBeenCalledWith(
      "drv-demo-001",
      {
        fleetPartnerId: "fleet-demo-001",
        affiliationType: "managed_by",
        effectiveFrom: "2026-06-01T00:00:00.000Z",
      },
      {
        actorId: "platform-admin-ctl-099",
        actorType: "platform_admin",
        tenantId: null,
      },
      "req-fleet-affiliation-ctl-001",
    );
    expect(response).toEqual({
      data: {
        affiliationId: "dfa-new-001",
        driverId: "drv-demo-001",
      },
      meta: {
        requestId: "req-fleet-affiliation-ctl-001",
        timestamp: expect.any(String),
      },
    });
  });
});
