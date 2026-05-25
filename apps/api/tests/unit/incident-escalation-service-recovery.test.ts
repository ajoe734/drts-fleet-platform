import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { IncidentService } from "../../src/modules/incident/incident.service";

function createServices() {
  const auditNotificationService = new AuditNotificationService();
  const incidentService = new IncidentService(auditNotificationService);
  return { auditNotificationService, incidentService };
}

describe("Incident escalation, service recovery, and dispatch-exception handoff", () => {
  describe("createFromDispatchException", () => {
    it("creates an incident from a dispatch exception with order trace", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createFromDispatchException({
        orderId: "ORD-12345",
        exceptionReasonCode: "no_eligible_supply",
        exceptionNote: "No drivers available in zone A.",
        severity: "high",
        escalationTarget: "dispatch_manager",
        reportedBy: "ops-user-001",
      });

      expect(incident.incidentId).toMatch(/^INC-/);
      expect(incident.relatedOrderId).toBe("ORD-12345");
      expect(incident.sourceDispatchExceptionOrderId).toBe("ORD-12345");
      expect(incident.severity).toBe("high");
      expect(incident.escalationTarget).toBe("dispatch_manager");
      expect(incident.category).toBe("operational");
      expect(incident.status).toBe("open");
      expect(incident.title).toContain("no_eligible_supply");
      expect(incident.title).toContain("ORD-12345");
      expect(incident.description).toContain("No drivers available in zone A.");
      expect(incident.driverMatchingSuppression).toMatchObject({
        active: true,
        reasonCode: "incident",
        sourceIncidentId: incident.incidentId,
        liftedAt: null,
      });
      expect(
        new Date(incident.driverMatchingSuppression!.expiresAt).getTime() -
          new Date(incident.createdAt).getTime(),
      ).toBe(24 * 60 * 60 * 1000);
    });

    it("creates a timeline entry for dispatch exception handoff", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createFromDispatchException({
        orderId: "ORD-99999",
        exceptionReasonCode: "confirmation_timeout",
        severity: "medium",
        reportedBy: "ops-user-002",
      });

      const timeline = incidentService.getTimeline(incident.incidentId);
      expect(timeline).toHaveLength(2);
      expect(timeline[0].action).toBe("dispatch_exception_handoff");
      expect(timeline[0].note).toContain("ORD-99999");
      expect(timeline[0].note).toContain("confirmation_timeout");
      expect(timeline[1].action).toBe("matching_suppression_created");
    });

    it("creates an audit record for dispatch exception creation", () => {
      const { incidentService, auditNotificationService } = createServices();

      incidentService.createFromDispatchException({
        orderId: "ORD-AUDIT-001",
        exceptionReasonCode: "driver_rejected",
        severity: "low",
        reportedBy: "ops-user-003",
      });

      const auditLogs = auditNotificationService.listAuditLogs();
      const dispatchAudit = auditLogs.find(
        (log) => log.actionName === "create_from_dispatch_exception",
      );
      expect(dispatchAudit).toBeDefined();
      expect(dispatchAudit!.moduleName).toBe("incident");
      expect(dispatchAudit!.newValuesSummary).toMatchObject({
        orderId: "ORD-AUDIT-001",
        exceptionReasonCode: "driver_rejected",
      });
    });

    it("rejects invalid severity", () => {
      const { incidentService } = createServices();

      expect(() =>
        incidentService.createFromDispatchException({
          orderId: "ORD-001",
          exceptionReasonCode: "test",
          severity: "invalid" as any,
          reportedBy: "ops-user-001",
        }),
      ).toThrowError(ApiRequestError);
    });

    it("rejects blank orderId", () => {
      const { incidentService } = createServices();

      expect(() =>
        incidentService.createFromDispatchException({
          orderId: "  ",
          exceptionReasonCode: "test",
          severity: "high",
          reportedBy: "ops-user-001",
        }),
      ).toThrowError(ApiRequestError);
    });

    it("rejects invalid escalation target", () => {
      const { incidentService } = createServices();

      expect(() =>
        incidentService.createFromDispatchException({
          orderId: "ORD-001",
          exceptionReasonCode: "test",
          severity: "high",
          escalationTarget: "invalid_target" as any,
          reportedBy: "ops-user-001",
        }),
      ).toThrowError(ApiRequestError);
    });
  });

  describe("escalation target", () => {
    it("sets escalation target on incident update", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Test escalation",
        description: "Needs escalation target.",
        category: "operational",
        severity: "medium",
        reportedBy: "ops-user-001",
      });

      expect(incident.escalationTarget).toBeNull();

      const updated = incidentService.updateIncident(incident.incidentId, {
        escalationTarget: "safety_officer",
      });
      expect(updated.escalationTarget).toBe("safety_officer");

      const timeline = incidentService.getTimeline(incident.incidentId);
      const escalationEntry = timeline.find(
        (entry) => entry.action === "escalation_target_set",
      );
      expect(escalationEntry).toBeDefined();
      expect(escalationEntry!.note).toContain("safety_officer");
    });

    it("clears escalation target", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createFromDispatchException({
        orderId: "ORD-CLEAR-001",
        exceptionReasonCode: "test",
        severity: "high",
        escalationTarget: "roc_duty",
        reportedBy: "ops-user-001",
      });
      expect(incident.escalationTarget).toBe("roc_duty");

      const updated = incidentService.updateIncident(incident.incidentId, {
        escalationTarget: null,
      });
      expect(updated.escalationTarget).toBeNull();
    });

    it("rejects invalid escalation target on update", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Test",
        description: "Test",
        category: "operational",
        severity: "low",
        reportedBy: "ops-user-001",
      });

      expect(() =>
        incidentService.updateIncident(incident.incidentId, {
          escalationTarget: "bogus" as any,
        }),
      ).toThrowError(ApiRequestError);
    });
  });

  describe("driver matching suppression", () => {
    it("extends suppression only for ops_manager", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Suppression extension",
        description: "Ops needs more time.",
        category: "operational",
        severity: "high",
        reportedBy: "ops-user-001",
      });

      const originalExpiresAt = incident.driverMatchingSuppression!.expiresAt;
      const extendedExpiresAt = new Date(
        new Date(originalExpiresAt).getTime() + 2 * 60 * 60 * 1000,
      ).toISOString();

      expect(() =>
        incidentService.updateIncident(incident.incidentId, {
          matchingSuppression: {
            action: "extend",
            expiresAt: extendedExpiresAt,
          },
        }),
      ).toThrowError(ApiRequestError);

      const updated = incidentService.updateIncident(
        incident.incidentId,
        {
          matchingSuppression: {
            action: "extend",
            expiresAt: extendedExpiresAt,
          },
        },
        undefined,
        {
          authMode: "bootstrap_headers",
          actorType: "ops_user",
          actorId: "ops-manager-001",
          realm: "ops",
          tenantId: null,
          roleFamilies: ["ops"],
          roles: ["ops_manager"],
          scopes: [],
          requestId: null,
        },
      );

      expect(updated.driverMatchingSuppression!.expiresAt).toBe(
        extendedExpiresAt,
      );
      expect(updated.driverMatchingSuppression!.active).toBe(true);
      expect(
        incidentService
          .getTimeline(incident.incidentId)
          .some((entry) => entry.action === "matching_suppression_extended"),
      ).toBe(true);
    });

    it("lifts suppression automatically when the incident resolves", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Resolve suppression",
        description: "Lifecycle test.",
        category: "safety",
        severity: "critical",
        reportedBy: "ops-user-001",
      });

      const updated = incidentService.updateIncident(incident.incidentId, {
        status: "resolved",
      });

      expect(updated.driverMatchingSuppression).toMatchObject({
        active: false,
      });
      expect(updated.driverMatchingSuppression!.liftedAt).toBeTruthy();
      expect(
        incidentService
          .getTimeline(incident.incidentId)
          .some((entry) => entry.action === "matching_suppression_lifted"),
      ).toBe(true);
    });

    it("does not allow extend to reactivate suppression after lifecycle lift", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Resolved suppression",
        description: "Lifecycle must win over extension.",
        category: "safety",
        severity: "high",
        reportedBy: "ops-user-001",
      });

      const originalExpiresAt = incident.driverMatchingSuppression!.expiresAt;
      const extendedExpiresAt = new Date(
        new Date(originalExpiresAt).getTime() + 2 * 60 * 60 * 1000,
      ).toISOString();

      expect(() =>
        incidentService.updateIncident(
          incident.incidentId,
          {
            status: "resolved",
            matchingSuppression: {
              action: "extend",
              expiresAt: extendedExpiresAt,
            },
          },
          undefined,
          {
            authMode: "bootstrap_headers",
            actorType: "ops_user",
            actorId: "ops-manager-001",
            realm: "ops",
            tenantId: null,
            roleFamilies: ["ops"],
            roles: ["ops_manager"],
            scopes: [],
            requestId: null,
          },
        ),
      ).toThrowError(ApiRequestError);

      const updated = incidentService.getIncident(incident.incidentId);
      expect(updated.status).toBe("open");
      expect(updated.driverMatchingSuppression!.active).toBe(true);
      expect(updated.driverMatchingSuppression!.liftedAt).toBeNull();
      expect(updated.driverMatchingSuppression!.expiresAt).toBe(
        originalExpiresAt,
      );
      expect(
        incidentService
          .getTimeline(incident.incidentId)
          .filter(
            (entry) =>
              entry.action === "status_changed" ||
              entry.action === "matching_suppression_lifted",
          ),
      ).toHaveLength(0);
    });

    it("commits status and lifecycle lift together after validation passes", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Resolved after validation",
        description: "Successful lifecycle update.",
        category: "safety",
        severity: "high",
        reportedBy: "ops-user-001",
      });

      const updated = incidentService.updateIncident(incident.incidentId, {
        status: "resolved",
      });

      expect(updated.status).toBe("resolved");
      const timeline = incidentService.getTimeline(incident.incidentId);
      expect(
        timeline.filter((entry) => entry.action === "status_changed"),
      ).toHaveLength(1);
      expect(
        timeline.filter(
          (entry) => entry.action === "matching_suppression_lifted",
        ),
      ).toHaveLength(1);
    });

    it("builds incident list/detail read models with refresh, health, and available actions", () => {
      const { incidentService, auditNotificationService } = createServices();

      const incident = incidentService.createIncident({
        title: "Read model incident",
        description: "Read model verification.",
        category: "operational",
        severity: "medium",
        reportedBy: "ops-user-001",
      });

      incidentService.recordServiceRecoveryAction(incident.incidentId, {
        actionType: "other",
        note: "Kept passenger informed.",
        actor: "ops-user-002",
      });

      const identity = {
        authMode: "bootstrap_headers" as const,
        actorType: "ops_user" as const,
        actorId: "ops-manager-001",
        realm: "ops" as const,
        tenantId: null,
        roleFamilies: ["ops"],
        roles: ["ops_manager"],
        scopes: [],
        requestId: null,
      };

      const list = incidentService.listIncidentReadModel(identity);
      expect(list.health.status).toBe("healthy");
      expect(list.refresh.dataFreshness).toBe("fresh");
      expect(list.items[0].driverMatchingSuppression?.active).toBe(true);
      expect(
        list.items[0].availableActions.some(
          (action) => action.action === "extend_matching_suppression",
        ),
      ).toBe(true);

      const detail = incidentService.getIncidentDetail(
        incident.incidentId,
        identity,
      );
      expect(detail.timeline.length).toBeGreaterThan(0);
      expect(detail.serviceRecoveryActions).toHaveLength(1);
      expect(
        detail.auditLogs.some((log) => log.resourceId === incident.incidentId),
      ).toBe(true);
      expect(
        auditNotificationService.getAuditLogsSnapshot().length,
      ).toBeGreaterThan(0);
    });
  });

  describe("severity escalation", () => {
    it("tracks severity changes in the timeline", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Severity test",
        description: "Will be escalated.",
        category: "safety",
        severity: "medium",
        reportedBy: "ops-user-001",
      });

      const updated = incidentService.updateIncident(incident.incidentId, {
        severity: "critical",
      });
      expect(updated.severity).toBe("critical");

      const timeline = incidentService.getTimeline(incident.incidentId);
      const severityEntry = timeline.find(
        (entry) => entry.action === "severity_escalated",
      );
      expect(severityEntry).toBeDefined();
      expect(severityEntry!.note).toContain("medium");
      expect(severityEntry!.note).toContain("critical");
    });

    it("does not create timeline entry when severity is unchanged", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "No change",
        description: "Same severity.",
        category: "operational",
        severity: "high",
        reportedBy: "ops-user-001",
      });

      incidentService.updateIncident(incident.incidentId, {
        severity: "high",
      });

      const timeline = incidentService.getTimeline(incident.incidentId);
      const severityEntries = timeline.filter(
        (entry) => entry.action === "severity_escalated",
      );
      expect(severityEntries).toHaveLength(0);
    });
  });

  describe("service recovery actions", () => {
    it("records a service recovery action on an incident", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Service recovery test",
        description: "Needs recovery actions.",
        category: "operational",
        severity: "high",
        reportedBy: "ops-user-001",
      });

      const action = incidentService.recordServiceRecoveryAction(
        incident.incidentId,
        {
          actionType: "passenger_recontact",
          note: "Called passenger to confirm alternative transport.",
          actor: "ops-agent-001",
        },
      );

      expect(action.actionId).toBeTruthy();
      expect(action.actionType).toBe("passenger_recontact");
      expect(action.incidentId).toBe(incident.incidentId);
      expect(action.note).toBe(
        "Called passenger to confirm alternative transport.",
      );
      expect(action.actor).toBe("ops-agent-001");
    });

    it("lists service recovery actions for an incident", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Multi-action test",
        description: "Multiple recovery steps.",
        category: "safety",
        severity: "critical",
        reportedBy: "ops-user-001",
      });

      incidentService.recordServiceRecoveryAction(incident.incidentId, {
        actionType: "passenger_recontact",
        note: "Initial contact.",
        actor: "ops-agent-001",
      });

      incidentService.recordServiceRecoveryAction(incident.incidentId, {
        actionType: "voucher_issued",
        note: "Issued TWD 500 voucher.",
        actor: "ops-agent-002",
      });

      const actions = incidentService.getServiceRecoveryActions(
        incident.incidentId,
      );
      expect(actions).toHaveLength(2);
      expect(actions[0].actionType).toBe("passenger_recontact");
      expect(actions[1].actionType).toBe("voucher_issued");
    });

    it("adds service recovery to the timeline", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Timeline recovery test",
        description: "Check timeline.",
        category: "operational",
        severity: "medium",
        reportedBy: "ops-user-001",
      });

      incidentService.recordServiceRecoveryAction(incident.incidentId, {
        actionType: "fare_adjustment",
        note: "Refunded 50% of fare.",
        actor: "finance-user-001",
      });

      const timeline = incidentService.getTimeline(incident.incidentId);
      const recoveryEntry = timeline.find(
        (entry) => entry.action === "service_recovery_action",
      );
      expect(recoveryEntry).toBeDefined();
      expect(recoveryEntry!.note).toContain("fare_adjustment");
      expect(recoveryEntry!.note).toContain("Refunded 50% of fare.");
      expect(recoveryEntry!.actor).toBe("finance-user-001");
    });

    it("updates incident record with recovery actions", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Record update test",
        description: "Check record.",
        category: "operational",
        severity: "medium",
        reportedBy: "ops-user-001",
      });
      expect(incident.serviceRecoveryActions).toHaveLength(0);

      incidentService.recordServiceRecoveryAction(incident.incidentId, {
        actionType: "apology_sent",
        note: "Sent apology email.",
        actor: "cs-agent-001",
      });

      const updated = incidentService.getIncident(incident.incidentId);
      expect(updated.serviceRecoveryActions).toHaveLength(1);
      expect(updated.serviceRecoveryActions[0].actionType).toBe("apology_sent");
    });

    it("rejects invalid action type", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Invalid action type",
        description: "Test.",
        category: "operational",
        severity: "low",
        reportedBy: "ops-user-001",
      });

      expect(() =>
        incidentService.recordServiceRecoveryAction(incident.incidentId, {
          actionType: "invalid_type" as any,
          note: "Should fail.",
          actor: "ops-user-001",
        }),
      ).toThrowError(ApiRequestError);
    });

    it("rejects service recovery on non-existent incident", () => {
      const { incidentService } = createServices();

      expect(() =>
        incidentService.recordServiceRecoveryAction("INC-999999", {
          actionType: "other",
          note: "Should fail.",
          actor: "ops-user-001",
        }),
      ).toThrowError(ApiRequestError);
    });

    it("produces audit record for service recovery action", () => {
      const { incidentService, auditNotificationService } = createServices();

      const incident = incidentService.createIncident({
        title: "Audit test",
        description: "Test.",
        category: "operational",
        severity: "medium",
        reportedBy: "ops-user-001",
      });

      incidentService.recordServiceRecoveryAction(
        incident.incidentId,
        {
          actionType: "redispatch_ordered",
          note: "Ordered a replacement vehicle.",
          actor: "ops-user-005",
        },
        "req-recovery-audit-001",
      );

      const auditLogs = auditNotificationService.listAuditLogs();
      const recoveryAudit = auditLogs.find(
        (log) => log.actionName === "record_service_recovery_action",
      );
      expect(recoveryAudit).toBeDefined();
      expect(recoveryAudit!.moduleName).toBe("incident");
      expect(recoveryAudit!.resourceId).toBe(incident.incidentId);
      expect(recoveryAudit!.newValuesSummary).toMatchObject({
        actionType: "redispatch_ordered",
      });
    });
  });

  describe("new fields on standard incident creation", () => {
    it("initializes escalationTarget and sourceDispatchExceptionOrderId as null", () => {
      const { incidentService } = createServices();

      const incident = incidentService.createIncident({
        title: "Standard incident",
        description: "No dispatch exception source.",
        category: "vehicle_damage",
        severity: "low",
        reportedBy: "ops-user-001",
      });

      expect(incident.escalationTarget).toBeNull();
      expect(incident.sourceDispatchExceptionOrderId).toBeNull();
      expect(incident.serviceRecoveryActions).toEqual([]);
      expect(incident.driverMatchingSuppression?.active).toBe(true);
    });
  });
});
