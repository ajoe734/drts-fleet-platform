import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IncidentService } from "../../../../apps/api/src/modules/incident/incident.service";

function setupService() {
  const auditService = new AuditNotificationService();
  const incidentService = new IncidentService(auditService);
  return { auditService, incidentService };
}

function buildOpsManagerIdentity(): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "ops_user",
    actorId: "ops-mgr-01",
    realm: "ops",
    tenantId: null,
    roleFamilies: ["ops"],
    roles: ["ops_manager"],
    scopes: ["incident:write", "incident:read"],
    requestId: "req-ops-mgr-01",
  };
}

describe("C046: Incident Matching Suppression & Service Recovery (SR-QA-CALL-001)", () => {
  describe("Positive workflows: incident creation, automatic supply suppression, extension, recovery actions, and lifting", () => {
    it("activates driver matching suppression upon incident creation and records timeline", () => {
      const { incidentService } = setupService();

      const incident = incidentService.createIncident({
        title: "Vehicle collision on highway 1",
        description: "Front bumper damage, vehicle currently halted on shoulder",
        category: "vehicle_damage",
        severity: "critical",
        reportedBy: "agent-01",
        relatedDriverId: "drv-qa-c046-01",
        relatedVehicleId: "veh-qa-c046-01",
        relatedOrderId: "ord-qa-c046-01",
      });

      expect(incident.incidentId).toMatch(/^INC-\d{6}$/);
      expect(incident.status).toBe("open");
      expect(incident.relatedDriverId).toBe("drv-qa-c046-01");

      // Verify automatic matching suppression activation
      expect(incident.matchingSuppression).toBeDefined();
      expect(incident.matchingSuppression?.active).toBe(true);
      expect(incident.matchingSuppression?.reasonCode).toBe("incident");
      expect(incident.matchingSuppression?.sourceIncidentId).toBe(incident.incidentId);
      expect(incident.matchingSuppression?.liftedAt).toBeNull();

      // Verify timeline action recorded
      const timeline = incidentService.getTimeline(incident.incidentId);
      expect(timeline.some((e) => e.action === "matching_suppression_activated")).toBe(true);

      // Verify readback from getIncident
      const fetched = incidentService.getIncident(incident.incidentId);
      expect(fetched.matchingSuppression?.active).toBe(true);
    });

    it("extends active matching suppression with authorized ops_manager identity", () => {
      const { incidentService } = setupService();
      const opsManagerIdentity = buildOpsManagerIdentity();

      const incident = incidentService.createIncident({
        title: "Driver physical altercation with passenger",
        description: "Investigation ongoing with police report",
        category: "safety",
        severity: "critical",
        reportedBy: "ops-supervisor",
        relatedDriverId: "drv-qa-c046-02",
      });

      const originalExpiry = new Date(incident.matchingSuppression!.expiresAt).getTime();

      // Extend suppression by 48 hours
      const extended = incidentService.extendMatchingSuppression(
        incident.incidentId,
        {
          extendByHours: 48,
          reason: "Pending formal police report and medical clearance",
        },
        opsManagerIdentity,
        "req-extend-01",
      );

      const newExpiry = new Date(extended.matchingSuppression!.expiresAt).getTime();
      expect(newExpiry).toBeGreaterThan(originalExpiry);

      // Timeline entry verification
      const timeline = incidentService.getTimeline(incident.incidentId);
      const extendEntry = timeline.find((e) => e.action === "matching_suppression_extended");
      expect(extendEntry).toBeDefined();
      expect(extendEntry?.note).toContain("police report");
    });

    it("records multiple service recovery actions and preserves complete versioned history", () => {
      const { incidentService } = setupService();

      const incident = incidentService.createIncident({
        title: "Passenger left phone in vehicle after abrupt stop",
        description: "Minor passenger grievance requiring recovery",
        category: "passenger_injury",
        severity: "medium",
        reportedBy: "agent-02",
        relatedDriverId: "drv-qa-c046-03",
      });

      // Action 1: passenger_recontact
      const action1 = incidentService.recordServiceRecoveryAction(
        incident.incidentId,
        {
          actionType: "passenger_recontact",
          note: "Called passenger, confirmed welfare and verified item retrieval schedule.",
          actor: "ops-support-lin",
        },
        "req-sra-01",
      );
      expect(action1.actionType).toBe("passenger_recontact");

      // Action 2: fare_adjustment
      const action2 = incidentService.recordServiceRecoveryAction(
        incident.incidentId,
        {
          actionType: "fare_adjustment",
          note: "Waived ride fare and applied NT$200 apology credit.",
          actor: "ops-support-lin",
        },
        "req-sra-02",
      );
      expect(action2.actionType).toBe("fare_adjustment");

      // Action 3: driver_reassigned
      const action3 = incidentService.recordServiceRecoveryAction(
        incident.incidentId,
        {
          actionType: "driver_reassigned",
          note: "Assigned alternative driver for passenger's return trip.",
          actor: "ops-support-lin",
        },
        "req-sra-03",
      );
      expect(action3.actionType).toBe("driver_reassigned");

      // Verify incident decoration and readback contains all 3 recovery actions
      const updatedIncident = incidentService.getIncident(incident.incidentId);
      expect(updatedIncident.serviceRecoveryActions).toHaveLength(3);
      expect(updatedIncident.serviceRecoveryActions?.[0]?.actionType).toBe("passenger_recontact");
      expect(updatedIncident.serviceRecoveryActions?.[1]?.actionType).toBe("fare_adjustment");
      expect(updatedIncident.serviceRecoveryActions?.[2]?.actionType).toBe("driver_reassigned");

      // Timeline entries check
      const timeline = incidentService.getTimeline(incident.incidentId);
      const recoveryEntries = timeline.filter((e) => e.action === "service_recovery_action");
      expect(recoveryEntries).toHaveLength(3);
    });

    it("lifts matching suppression automatically when incident is resolved or closed", () => {
      const { incidentService } = setupService();

      const incident = incidentService.createIncident({
        title: "Temporary vehicle inspection hold",
        description: "Tire pressure sensor triggered warning",
        category: "vehicle_damage",
        severity: "low",
        reportedBy: "driver-self-report",
        relatedDriverId: "drv-qa-c046-04",
      });

      expect(incident.matchingSuppression?.active).toBe(true);

      // Resolve incident after inspection passes
      const resolved = incidentService.updateIncident(
        incident.incidentId,
        {
          status: "resolved",
          resolutionNotes: "Tire inspected and pressure calibrated, safe for operations.",
        },
        "req-resolve-incident",
      );

      // Verify suppression is lifted and driver capability is restored
      expect(resolved.status).toBe("resolved");
      expect(resolved.matchingSuppression?.active).toBe(false);
      expect(resolved.matchingSuppression?.liftedAt).toBeDefined();

      const timeline = incidentService.getTimeline(incident.incidentId);
      expect(timeline.some((e) => e.action === "matching_suppression_lifted")).toBe(true);

      // Readback check
      const fetched = incidentService.getIncident(incident.incidentId);
      expect(fetched.matchingSuppression?.active).toBe(false);
      expect(fetched.matchingSuppression?.liftedAt).not.toBeNull();
    });
  });

  describe("Negative & boundary cases: unauthorized extension, inactive suppression, invalid action types", () => {
    it("rejects suppression extension when requested by non-ops_manager identity with 403", () => {
      const { incidentService } = setupService();

      const incident = incidentService.createIncident({
        title: "Test incident for authorization",
        description: "Test description",
        category: "safety",
        severity: "high",
        reportedBy: "agent-01",
        relatedDriverId: "drv-qa-c046-05",
      });

      const unauthorizedIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "ops_user",
        actorId: "ops-junior-01",
        realm: "ops",
        tenantId: null,
        roleFamilies: ["ops"],
        roles: ["ops_operator"], // NOT ops_manager
        scopes: ["incident:read"],
        requestId: "req-unauth-ext",
      };

      expect(() => {
        incidentService.extendMatchingSuppression(
          incident.incidentId,
          { extendByHours: 24, reason: "Unauthorized attempt" },
          unauthorizedIdentity,
        );
      }).toThrowError(ApiRequestError);

      try {
        incidentService.extendMatchingSuppression(
          incident.incidentId,
          { extendByHours: 24, reason: "Unauthorized attempt" },
          unauthorizedIdentity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("OPS_MANAGER_REQUIRED");
      }
    });

    it("rejects suppression extension on an incident without an active suppression with 409", () => {
      const { incidentService } = setupService();
      const opsManagerIdentity = buildOpsManagerIdentity();

      // Incident without relatedDriverId has no suppression
      const incidentWithoutDriver = incidentService.createIncident({
        title: "General road blockage",
        description: "No specific driver involved",
        category: "traffic",
        severity: "low",
        reportedBy: "ops-monitoring",
      });
      expect(incidentWithoutDriver.matchingSuppression).toBeNull();

      expect(() => {
        incidentService.extendMatchingSuppression(
          incidentWithoutDriver.incidentId,
          { extendByHours: 24, reason: "Should fail" },
          opsManagerIdentity,
        );
      }).toThrowError(ApiRequestError);

      try {
        incidentService.extendMatchingSuppression(
          incidentWithoutDriver.incidentId,
          { extendByHours: 24, reason: "Should fail" },
          opsManagerIdentity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(409);
        expect(err.code).toBe("MATCHING_SUPPRESSION_NOT_ACTIVE");
      }
    });

    it("rejects recording service recovery action with invalid action type", () => {
      const { incidentService } = setupService();

      const incident = incidentService.createIncident({
        title: "Action type test incident",
        description: "Test description",
        category: "operational",
        severity: "low",
        reportedBy: "agent-01",
      });

      expect(() => {
        incidentService.recordServiceRecoveryAction(incident.incidentId, {
          actionType: "invalid_action_type" as any,
          note: "Invalid type note",
          actor: "ops-actor",
        });
      }).toThrowError(ApiRequestError);

      try {
        incidentService.recordServiceRecoveryAction(incident.incidentId, {
          actionType: "invalid_action_type" as any,
          note: "Invalid type note",
          actor: "ops-actor",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("VALIDATION_ERROR");
      }
    });

    it("rejects retrieval of non-existent incident with 404", () => {
      const { incidentService } = setupService();

      try {
        incidentService.getIncident("INC-999999");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiRequestError);
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("NOT_FOUND");
      }
    });
  });
});
