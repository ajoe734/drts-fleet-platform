import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { IncidentController } from "../../src/modules/incident/incident.controller";
import { IncidentService } from "../../src/modules/incident/incident.service";

function createController() {
  const auditNotificationService = new AuditNotificationService();
  const complaintService = new ComplaintService(auditNotificationService);
  const incidentService = new IncidentService(auditNotificationService);
  return {
    incidentService,
    controller: new IncidentController(incidentService, complaintService),
  };
}

describe("IncidentController", () => {
  it("returns the incident list inside the UI read-model envelope", () => {
    const { controller, incidentService } = createController();

    const incident = incidentService.createIncident({
      title: "Driver investigation",
      description: "Incident with driver suppression state.",
      category: "safety",
      severity: "high",
      reportedBy: "ops-user-001",
      relatedDriverId: "DRV-201",
    });

    const response = controller.listIncidents("req-incident-list-001");

    expect(response).toEqual({
      data: {
        items: [
          expect.objectContaining({
            incidentId: incident.incidentId,
            matchingSuppression: expect.objectContaining({
              active: true,
              sourceIncidentId: incident.incidentId,
            }),
          }),
        ],
        refresh: {
          generatedAt: expect.any(String),
          staleAfterMs: 15_000,
          dataFreshness: "fresh",
          source: "live",
        },
      },
      meta: {
        requestId: "req-incident-list-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("returns a single incident inside the UI read-model resource envelope", () => {
    const { controller, incidentService } = createController();

    const incident = incidentService.createIncident({
      title: "Single incident resource",
      description: "Read-model resource response should wrap the item.",
      category: "operational",
      severity: "medium",
      reportedBy: "ops-user-002",
    });

    const response = controller.getIncident(
      incident.incidentId,
      "req-incident-get-001",
    );

    expect(response).toEqual({
      data: {
        item: expect.objectContaining({
          incidentId: incident.incidentId,
        }),
        refresh: {
          generatedAt: expect.any(String),
          staleAfterMs: 15_000,
          dataFreshness: "fresh",
          source: "live",
        },
      },
      meta: {
        requestId: "req-incident-get-001",
        timestamp: expect.any(String),
      },
    });
  });

  it("extends driver matching suppression through the controller for ops_manager", () => {
    const { controller, incidentService } = createController();

    const identity = {
      authMode: "bootstrap_headers" as const,
      actorType: "ops_user" as const,
      actorId: "ops-manager-001",
      realm: "ops" as const,
      tenantId: null,
      roleFamilies: ["ops"] as const,
      roles: ["ops_manager"],
      scopes: ["incident:write"],
      requestId: "req-incident-extend-identity-001",
    };

    const incident = incidentService.createIncident(
      {
        title: "Controller suppression extension",
        description: "Controller should surface the updated suppression.",
        category: "safety",
        severity: "critical",
        reportedBy: "ops-user-003",
        relatedDriverId: "DRV-202",
      },
      undefined,
      identity,
    );

    const originalExpiry = incident.matchingSuppression!.expiresAt;
    const response = controller.extendMatchingSuppression(
      incident.incidentId,
      {
        reason: "Extended review window.",
        extendByHours: 4,
      },
      "req-incident-extend-001",
      identity,
    );

    expect(response.data.matchingSuppression?.expiresAt).not.toBe(originalExpiry);
    expect(response.data.availableActions?.[0]).toMatchObject({
      action: "extend_matching_suppression",
      enabled: true,
    });
    expect(response.meta).toEqual({
      requestId: "req-incident-extend-001",
      timestamp: expect.any(String),
    });
  });
});
