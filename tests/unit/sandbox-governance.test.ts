import { describe, expect, it } from "vitest";
import type {
  SafetyOperatorQualificationRecord,
  VehicleEnrollmentRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { SandboxGovernanceRepository } from "../../apps/api/src/modules/sandbox-governance/sandbox-governance.repository";
import { SandboxGovernanceService } from "../../apps/api/src/modules/sandbox-governance/sandbox-governance.service";

function createService() {
  return new SandboxGovernanceService(
    new AuditNotificationService(),
    new SandboxGovernanceRepository(),
  );
}

describe("sandbox governance service", () => {
  it("matches a point inside the approved operating area fixture", async () => {
    const service = createService();

    const result = await service.validatePointInApprovedArea({
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      point: {
        lat: 25.0476,
        lng: 121.5256,
      },
      asOf: "2026-06-26T08:00:00.000Z",
    });

    expect(result.inApprovedArea).toBe(true);
    expect(result.matches.map((item) => item.areaId)).toContain(
      "pickup-zone-main-station",
    );
  });

  it("matches a candidate path that stays on the approved route fixture", async () => {
    const service = createService();

    const result = await service.validateRouteContainment({
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      candidatePath: {
        type: "MultiLineString",
        coordinates: [
          [
            [121.5221, 25.0441],
            [121.5261, 25.0471],
            [121.5291, 25.0501],
          ],
        ],
      },
      asOf: "2026-06-26T08:00:00.000Z",
      toleranceMeters: 35,
    });

    expect(result.contained).toBe(true);
    expect(result.routeIds).toContain("route-downtown-loop");
  });

  it("rejects invalid vehicle enrollment lifecycle transitions", () => {
    const service = createService();

    const existing = service.listVehicleEnrollments()[0] as VehicleEnrollmentRecord;
    expect(existing.status).toBe("active");

    expect(() =>
      service.updateVehicleEnrollments(
        {
          items: [
            {
              ...existing,
              status: "pending",
              updatedAt: "2026-06-26T09:00:00.000Z",
            },
          ],
        },
        {
          actorId: "admin-001",
          actorType: "platform_admin",
          tenantId: null,
        },
      ),
    ).toThrowError(ApiRequestError);
  });

  it("allows suspended safety operators to be re-qualified", () => {
    const service = createService();

    const existing =
      service.listSafetyOperatorQualifications()[0] as SafetyOperatorQualificationRecord;
    const suspended: SafetyOperatorQualificationRecord = {
      ...existing,
      status: "suspended",
      updatedAt: "2026-06-26T09:00:00.000Z",
    };

    service.updateSafetyOperatorQualifications(
      { items: [suspended] },
      {
        actorId: "admin-001",
        actorType: "platform_admin",
        tenantId: null,
      },
    );

    const restored = service.updateSafetyOperatorQualifications(
      {
        items: [
          {
            ...suspended,
            status: "qualified",
            updatedAt: "2026-06-26T10:00:00.000Z",
          },
        ],
      },
      {
        actorId: "admin-001",
        actorType: "platform_admin",
        tenantId: null,
      },
    );

    expect(restored[0]?.status).toBe("qualified");
  });
});
