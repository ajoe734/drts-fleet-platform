import { describe, expect, it } from "vitest";

import { DRIVER_MATCHING_SUPPRESSION_DEFAULT_TTL_HOURS } from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverMatchingSuppressionService } from "../../src/modules/incident/driver-matching-suppression.service";
import { IncidentService } from "../../src/modules/incident/incident.service";

const TTL_MS = DRIVER_MATCHING_SUPPRESSION_DEFAULT_TTL_HOURS * 60 * 60 * 1000;

function createSuppressionService() {
  const auditNotificationService = new AuditNotificationService();
  const suppressionService = new DriverMatchingSuppressionService(
    auditNotificationService,
  );
  return { auditNotificationService, suppressionService };
}

function createIncidentServices() {
  const auditNotificationService = new AuditNotificationService();
  const suppressionService = new DriverMatchingSuppressionService(
    auditNotificationService,
  );
  const incidentService = new IncidentService(
    auditNotificationService,
    undefined,
    suppressionService,
  );
  return { auditNotificationService, suppressionService, incidentService };
}

describe("DriverMatchingSuppression (Q-OPS09)", () => {
  describe("suppressForIncident", () => {
    it("creates an active suppression with the 24h default TTL", () => {
      const { suppressionService } = createSuppressionService();
      const now = new Date("2026-05-29T00:00:00.000Z");

      const suppression = suppressionService.suppressForIncident({
        driverId: "DRV-001",
        incidentId: "INC-000001",
        actor: "ops-user-001",
        now,
      });

      expect(suppression.suppressionId).toMatch(/^dms-/);
      expect(suppression.driverId).toBe("DRV-001");
      expect(suppression.active).toBe(true);
      expect(suppression.reasonCode).toBe("incident");
      expect(suppression.sourceIncidentId).toBe("INC-000001");
      expect(suppression.liftedAt).toBeNull();
      expect(suppression.createdBy).toBe("ops-user-001");
      expect(new Date(suppression.expiresAt).getTime()).toBe(
        now.getTime() + TTL_MS,
      );
    });

    it("is idempotent for the same driver and incident while still active", () => {
      const { suppressionService } = createSuppressionService();
      const now = new Date("2026-05-29T00:00:00.000Z");

      const first = suppressionService.suppressForIncident({
        driverId: "DRV-002",
        incidentId: "INC-000002",
        now,
      });
      const second = suppressionService.suppressForIncident({
        driverId: "DRV-002",
        incidentId: "INC-000002",
        now: new Date(now.getTime() + 60_000),
      });

      expect(second.suppressionId).toBe(first.suppressionId);
      expect(
        suppressionService.listSuppressions({ driverId: "DRV-002" }),
      ).toHaveLength(1);
    });

    it("records an audit log when suppressing", () => {
      const { suppressionService, auditNotificationService } =
        createSuppressionService();

      suppressionService.suppressForIncident(
        { driverId: "DRV-003", incidentId: "INC-000003", actor: "ops-user-9" },
        "req-suppress-001",
      );

      const audit = auditNotificationService
        .listAuditLogs()
        .find((log) => log.actionName === "suppress_driver_matching");
      expect(audit).toBeDefined();
      expect(audit!.moduleName).toBe("incident");
      expect(audit!.newValuesSummary).toMatchObject({
        driverId: "DRV-003",
        reasonCode: "incident",
        sourceIncidentId: "INC-000003",
      });
    });

    it("rejects a blank driverId", () => {
      const { suppressionService } = createSuppressionService();
      expect(() =>
        suppressionService.suppressForIncident({
          driverId: "  ",
          incidentId: "INC-000004",
        }),
      ).toThrowError(ApiRequestError);
    });

    it("rejects an invalid reason code", () => {
      const { suppressionService } = createSuppressionService();
      expect(() =>
        suppressionService.suppressForIncident({
          driverId: "DRV-005",
          incidentId: "INC-000005",
          reasonCode: "bogus" as any,
        }),
      ).toThrowError(ApiRequestError);
    });
  });

  describe("auto-expiry", () => {
    it("treats a suppression as inactive once the TTL elapses", () => {
      const { suppressionService } = createSuppressionService();
      const now = new Date("2026-05-29T00:00:00.000Z");

      suppressionService.suppressForIncident({
        driverId: "DRV-006",
        incidentId: "INC-000006",
        now,
      });

      const beforeExpiry = new Date(now.getTime() + TTL_MS - 1);
      const afterExpiry = new Date(now.getTime() + TTL_MS + 1);

      expect(
        suppressionService.isDriverMatchingSuppressed("DRV-006", beforeExpiry),
      ).toBe(true);
      expect(
        suppressionService.isDriverMatchingSuppressed("DRV-006", afterExpiry),
      ).toBe(false);
    });

    it("activeOnly filter hides expired suppressions", () => {
      const { suppressionService } = createSuppressionService();
      const now = new Date("2026-05-29T00:00:00.000Z");

      suppressionService.suppressForIncident({
        driverId: "DRV-007",
        incidentId: "INC-000007",
        now,
      });

      const afterExpiry = new Date(now.getTime() + TTL_MS + 1);
      expect(
        suppressionService.listSuppressions({
          activeOnly: true,
          now: afterExpiry,
        }),
      ).toHaveLength(0);
      expect(
        suppressionService.listSuppressions({ now: afterExpiry }),
      ).toHaveLength(1);
    });
  });

  describe("liftForIncident", () => {
    it("lifts active suppressions tied to a resolved incident", () => {
      const { suppressionService } = createSuppressionService();
      const now = new Date("2026-05-29T00:00:00.000Z");

      suppressionService.suppressForIncident({
        driverId: "DRV-008",
        incidentId: "INC-000008",
        now,
      });

      const lifted = suppressionService.liftForIncident(
        "INC-000008",
        { reason: "incident_resolved", now: new Date(now.getTime() + 1000) },
        "req-lift-001",
      );

      expect(lifted).toHaveLength(1);
      expect(lifted[0]!.active).toBe(false);
      expect(lifted[0]!.liftedAt).not.toBeNull();
      expect(lifted[0]!.liftReason).toBe("incident_resolved");
      expect(
        suppressionService.isDriverMatchingSuppressed(
          "DRV-008",
          new Date(now.getTime() + 2000),
        ),
      ).toBe(false);
    });

    it("returns an empty array when no suppression matches", () => {
      const { suppressionService } = createSuppressionService();
      expect(suppressionService.liftForIncident("INC-NONE")).toEqual([]);
    });

    it("does not re-lift an already-lifted suppression", () => {
      const { suppressionService } = createSuppressionService();
      const now = new Date("2026-05-29T00:00:00.000Z");
      suppressionService.suppressForIncident({
        driverId: "DRV-009",
        incidentId: "INC-000009",
        now,
      });
      suppressionService.liftForIncident("INC-000009", { now });
      expect(suppressionService.liftForIncident("INC-000009", { now })).toEqual(
        [],
      );
    });
  });

  describe("extendSuppression", () => {
    function seed() {
      const ctx = createSuppressionService();
      const now = new Date("2026-05-29T00:00:00.000Z");
      const suppression = ctx.suppressionService.suppressForIncident({
        driverId: "DRV-010",
        incidentId: "INC-000010",
        now,
      });
      return { ...ctx, now, suppression };
    }

    it("lets an ops_manager extend the window beyond the current expiry", () => {
      const { suppressionService, suppression, now } = seed();
      const newExpiry = new Date(now.getTime() + TTL_MS + 12 * 60 * 60 * 1000);

      const extended = suppressionService.extendSuppression(
        suppression.suppressionId,
        {
          expiresAt: newExpiry.toISOString(),
          requestedBy: "mgr-001",
          actorRole: "ops_manager",
          note: "ongoing investigation",
        },
        "req-extend-001",
      );

      expect(new Date(extended.expiresAt).getTime()).toBe(newExpiry.getTime());
      expect(extended.extendedBy).toBe("mgr-001");
      expect(extended.active).toBe(true);
    });

    it("forbids non-ops_manager roles from extending", () => {
      const { suppressionService, suppression, now } = seed();
      const newExpiry = new Date(now.getTime() + TTL_MS + 60_000);
      try {
        suppressionService.extendSuppression(suppression.suppressionId, {
          expiresAt: newExpiry.toISOString(),
          requestedBy: "ops-user-001",
          actorRole: "ops_user",
        });
        throw new Error("expected extension to be forbidden");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        expect((error as ApiRequestError).getStatus()).toBe(403);
      }
    });

    it("rejects an expiry that is not later than the current one", () => {
      const { suppressionService, suppression } = seed();
      expect(() =>
        suppressionService.extendSuppression(suppression.suppressionId, {
          expiresAt: suppression.expiresAt,
          requestedBy: "mgr-001",
          actorRole: "ops_manager",
        }),
      ).toThrowError(ApiRequestError);
    });

    it("rejects extending a lifted suppression", () => {
      const { suppressionService, suppression, now } = seed();
      suppressionService.liftForIncident("INC-000010", { now });
      const newExpiry = new Date(now.getTime() + TTL_MS + 60_000);
      expect(() =>
        suppressionService.extendSuppression(suppression.suppressionId, {
          expiresAt: newExpiry.toISOString(),
          requestedBy: "mgr-001",
          actorRole: "ops_manager",
        }),
      ).toThrowError(ApiRequestError);
    });

    it("throws NOT_FOUND for an unknown suppression", () => {
      const { suppressionService } = createSuppressionService();
      expect(() =>
        suppressionService.extendSuppression("dms-missing", {
          expiresAt: new Date().toISOString(),
          requestedBy: "mgr-001",
          actorRole: "ops_manager",
        }),
      ).toThrowError(ApiRequestError);
    });
  });

  describe("incident lifecycle integration", () => {
    it("suppresses driver matching when an incident is opened against a driver", () => {
      const { incidentService, suppressionService } = createIncidentServices();

      const incident = incidentService.createIncident({
        title: "Driver safety concern",
        description: "Reported reckless driving.",
        category: "safety",
        severity: "high",
        reportedBy: "ops-user-001",
        relatedDriverId: "DRV-100",
      });

      const suppressions = suppressionService.listSuppressions({
        driverId: "DRV-100",
      });
      expect(suppressions).toHaveLength(1);
      expect(suppressions[0]!.sourceIncidentId).toBe(incident.incidentId);
      expect(suppressionService.isDriverMatchingSuppressed("DRV-100")).toBe(
        true,
      );
    });

    it("does not suppress when no driver is related to the incident", () => {
      const { incidentService, suppressionService } = createIncidentServices();

      incidentService.createIncident({
        title: "Vehicle damage",
        description: "Scratched bumper.",
        category: "vehicle_damage",
        severity: "low",
        reportedBy: "ops-user-001",
      });

      expect(suppressionService.listSuppressions()).toHaveLength(0);
    });

    it("lifts the suppression when the incident is resolved", () => {
      const { incidentService, suppressionService } = createIncidentServices();

      const incident = incidentService.createIncident({
        title: "Driver issue",
        description: "Under review.",
        category: "safety",
        severity: "medium",
        reportedBy: "ops-user-001",
        relatedDriverId: "DRV-101",
      });
      expect(suppressionService.isDriverMatchingSuppressed("DRV-101")).toBe(
        true,
      );

      incidentService.updateIncident(incident.incidentId, {
        status: "resolved",
      });

      expect(suppressionService.isDriverMatchingSuppressed("DRV-101")).toBe(
        false,
      );
      const lifted = suppressionService.listSuppressions({
        driverId: "DRV-101",
      })[0]!;
      expect(lifted.active).toBe(false);
      expect(lifted.liftReason).toBe("incident_resolved");
    });

    it("lifts the suppression when the incident is closed", () => {
      const { incidentService, suppressionService } = createIncidentServices();

      const incident = incidentService.createIncident({
        title: "Driver issue",
        description: "Under review.",
        category: "safety",
        severity: "medium",
        reportedBy: "ops-user-001",
        relatedDriverId: "DRV-102",
      });

      incidentService.updateIncident(incident.incidentId, {
        status: "closed",
      });

      expect(suppressionService.isDriverMatchingSuppressed("DRV-102")).toBe(
        false,
      );
    });
  });
});
