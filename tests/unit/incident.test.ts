import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IncidentRepository } from "../../apps/api/src/modules/incident/incident.repository";
import { IncidentService } from "../../apps/api/src/modules/incident/incident.service";

function createService() {
  const auditService = new AuditNotificationService();
  const repository = new IncidentRepository();
  const service = new IncidentService(auditService, repository);

  return { auditService, repository, service };
}

describe("incident service", () => {
  it("creates an incident with valid category and severity", () => {
    const { auditService, service } = createService();

    const incident = service.createIncident({
      title: "Vehicle collision at intersection",
      description: "Minor collision during passenger drop-off",
      category: "vehicle_damage",
      severity: "medium",
      reportedBy: "driver-001",
      relatedOrderId: "order-001",
      location: "Main St & 5th Ave",
    });

    expect(incident.incidentId).toMatch(/^INC-\d{6}$/);
    expect(incident.status).toBe("open");
    expect(incident.category).toBe("vehicle_damage");
    expect(incident.severity).toBe("medium");
    expect(incident.reportedBy).toBe("driver-001");
    expect(incident.relatedOrderId).toBe("order-001");
    expect(incident.location).toBe("Main St & 5th Ave");

    expect(service.listIncidents()).toHaveLength(1);
    expect(auditService.listAuditLogs()[0]?.actionName).toBe("create_incident");
  });

  it("lists and retrieves individual incidents", () => {
    const { service } = createService();

    service.createIncident({
      title: "Safety concern",
      description: "Brake issue reported",
      category: "safety",
      severity: "high",
      reportedBy: "driver-002",
    });

    const incidents = service.listIncidents();
    expect(incidents).toHaveLength(1);

    const found = service.getIncident(incidents[0]!.incidentId);
    expect(found.incidentId).toBe(incidents[0]!.incidentId);
  });

  it("accepts safety-critical SOS incidents from the driver app path", () => {
    const { service } = createService();

    const incident = service.createIncident({
      title: "Driver SOS emergency",
      description: "SOS alert triggered from the driver app.",
      category: "safety",
      severity: "critical",
      reportedBy: "driver",
    });

    expect(incident.category).toBe("safety");
    expect(incident.severity).toBe("critical");
    expect(incident.status).toBe("open");
  });

  it("updates incident status and assignment", () => {
    const { service } = createService();

    const incident = service.createIncident({
      title: "Traffic delay",
      description: "Heavy traffic causing delays",
      category: "traffic",
      severity: "low",
      reportedBy: "driver-003",
    });

    const updated = service.updateIncident(incident.incidentId, {
      status: "investigating",
      assignedTo: "ops-user-001",
    });

    expect(updated.status).toBe("investigating");
    expect(updated.assignedTo).toBe("ops-user-001");
  });

  it("links a complaint case to an incident", () => {
    const { service } = createService();

    const incident = service.createIncident({
      title: "Passenger injury",
      description: "Passenger reported minor injury",
      category: "passenger_injury",
      severity: "high",
      reportedBy: "driver-004",
    });

    const updated = service.linkComplaint(
      incident.incidentId,
      "C-20260411-000001",
    );
    expect(updated.relatedComplaintCaseNo).toBe("C-20260411-000001");

    const timeline = service.getTimeline(incident.incidentId);
    expect(timeline.some((e) => e.action === "complaint_linked")).toBe(true);
  });

  it("rejects invalid incident category", () => {
    const { service } = createService();

    expect(() =>
      service.createIncident({
        title: "Test",
        description: "Test",
        category: "invalid_category" as any,
        severity: "low",
        reportedBy: "driver-001",
      }),
    ).toThrow("Api Request Error");
  });

  it("rejects blank title", () => {
    const { service } = createService();

    expect(() =>
      service.createIncident({
        title: "",
        description: "Test",
        category: "safety",
        severity: "low",
        reportedBy: "driver-001",
      }),
    ).toThrow("Api Request Error");
  });

  it("returns 404 for nonexistent incident", () => {
    const { service } = createService();

    expect(() => service.getIncident("INC-999999")).toThrow(
      "Api Request Error",
    );
  });

  it("generates timeline entries for status changes", () => {
    const { service } = createService();

    const incident = service.createIncident({
      title: "Operational issue",
      description: "GPS not working",
      category: "operational",
      severity: "medium",
      reportedBy: "driver-005",
    });

    service.updateIncident(incident.incidentId, {
      status: "resolved",
      resolutionNote: "Fixed GPS unit",
    });

    const timeline = service.getTimeline(incident.incidentId);
    expect(timeline.length).toBeGreaterThanOrEqual(2);
    expect(timeline.some((e) => e.action === "status_changed")).toBe(true);
  });
});
