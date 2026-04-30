import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../src/modules/complaint/complaint.controller";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { IncidentController } from "../../src/modules/incident/incident.controller";
import { IncidentService } from "../../src/modules/incident/incident.service";

function createServices() {
  const auditNotificationService = new AuditNotificationService();
  const complaintService = new ComplaintService(auditNotificationService);
  const incidentService = new IncidentService(auditNotificationService);
  return {
    auditNotificationService,
    complaintService,
    incidentService,
    complaintController: new ComplaintController(
      complaintService,
      incidentService,
    ),
    incidentController: new IncidentController(
      incidentService,
      complaintService,
    ),
  };
}

describe("Complaint → Incident escalation", () => {
  it("escalates a complaint to a new incident and links both directions", () => {
    const { complaintService, incidentService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Driver reported unsafe conditions on route.",
    });
    expect(complaint.relatedIncidentId).toBeNull();

    const incident = incidentService.createIncident({
      title: "Unsafe route conditions",
      description: `Escalated from complaint ${complaint.caseNo}`,
      category: "safety",
      severity: "high",
      reportedBy: "ops-agent-001",
      relatedOrderId: complaint.relatedOrderId ?? undefined,
    });

    const escalatedComplaint = complaintService.escalateToIncident(
      complaint.caseNo,
      incident.incidentId,
      "Safety concern requires full incident investigation.",
    );
    expect(escalatedComplaint.relatedIncidentId).toBe(incident.incidentId);

    const linkedIncident = incidentService.linkComplaint(
      incident.incidentId,
      complaint.caseNo,
    );
    expect(linkedIncident.relatedComplaintCaseNo).toBe(complaint.caseNo);

    const timeline = complaintService.getComplaintTimeline(complaint.caseNo);
    const escalationEntry = timeline.find(
      (entry) => entry.action === "escalated_to_incident",
    );
    expect(escalationEntry).toBeDefined();
    expect(escalationEntry!.note).toContain(incident.incidentId);
  });

  it("prevents double escalation of the same complaint", () => {
    const { complaintService, incidentService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "phone",
      category: "driver_service",
      severity: "normal",
      description: "Driver behaviour complaint from passenger.",
    });

    const incident = incidentService.createIncident({
      title: "Driver behaviour investigation",
      description: "Escalated from complaint",
      category: "operational",
      severity: "medium",
      reportedBy: "ops-agent-001",
    });

    complaintService.escalateToIncident(
      complaint.caseNo,
      incident.incidentId,
      "Requires investigation",
    );

    expect(() =>
      complaintService.escalateToIncident(
        complaint.caseNo,
        "INC-999999",
        "Second escalation attempt",
      ),
    ).toThrowError(ApiRequestError);
  });

  it("links an existing incident to a complaint without escalation", () => {
    const { complaintService, incidentService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "web",
      category: "fare_dispute",
      severity: "normal",
      description: "Passenger disputes fare amount.",
    });

    const incident = incidentService.createIncident({
      title: "Fare system anomaly",
      description: "Automated fare calculation produced incorrect result.",
      category: "operational",
      severity: "low",
      reportedBy: "system",
    });

    const linked = complaintService.linkIncident(complaint.caseNo, {
      incidentId: incident.incidentId,
    });
    expect(linked.relatedIncidentId).toBe(incident.incidentId);

    const timeline = complaintService.getComplaintTimeline(complaint.caseNo);
    const linkEntry = timeline.find(
      (entry) => entry.action === "incident_linked",
    );
    expect(linkEntry).toBeDefined();
    expect(linkEntry!.note).toContain(incident.incidentId);
  });

  it("keeps complaint and incident links in sync from the complaint endpoint", () => {
    const { complaintController, complaintService, incidentService } =
      createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Ops needs to associate this with an existing incident.",
    });
    const incident = incidentService.createIncident({
      title: "Linked investigation",
      description: "Created independently before complaint linkage.",
      category: "operational",
      severity: "medium",
      reportedBy: "ops-agent-010",
    });

    complaintController.linkIncident(
      complaint.caseNo,
      { incidentId: incident.incidentId },
      "req-link-complaint-incident-001",
    );

    expect(
      complaintService.getComplaintCase(complaint.caseNo).relatedIncidentId,
    ).toBe(incident.incidentId);
    expect(
      incidentService.getIncident(incident.incidentId).relatedComplaintCaseNo,
    ).toBe(complaint.caseNo);
  });

  it("keeps complaint and incident links in sync from the incident endpoint", () => {
    const { complaintService, incidentController, incidentService } =
      createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "web",
      category: "fare_dispute",
      severity: "normal",
      description: "Complaint created before incident linkage.",
    });
    const incident = incidentService.createIncident({
      title: "Fare investigation",
      description: "Investigate prior complaint.",
      category: "operational",
      severity: "low",
      reportedBy: "ops-agent-011",
    });

    incidentController.linkComplaint(
      incident.incidentId,
      { complaintCaseNo: complaint.caseNo },
      "req-link-incident-complaint-001",
    );

    expect(
      incidentService.getIncident(incident.incidentId).relatedComplaintCaseNo,
    ).toBe(complaint.caseNo);
    expect(
      complaintService.getComplaintCase(complaint.caseNo).relatedIncidentId,
    ).toBe(incident.incidentId);
  });

  it("assigns escalated incidents to the current complaint owner", () => {
    const { complaintController, complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Safety concern with explicit specialist ownership.",
    });
    complaintService.assignComplaintCase(complaint.caseNo, {
      assigneeId: "ops-specialist-007",
    });

    const response = complaintController.escalateToIncident(
      complaint.caseNo,
      {
        title: "Escalated safety investigation",
        severity: "critical",
        reason: "Escalate to ROC for safety handling.",
      },
      "req-escalate-owner-001",
    );

    expect(response.data.incident.assignedTo).toBe("ops-specialist-007");
  });

  it("does not create an orphan incident when the complaint is already escalated", () => {
    const { complaintController, complaintService, incidentService } =
      createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Complaint already linked to an incident.",
    });

    const firstResponse = complaintController.escalateToIncident(
      complaint.caseNo,
      {
        title: "Primary incident",
        severity: "high",
        reason: "Initial escalation.",
      },
      "req-escalate-primary-001",
    );

    expect(() =>
      complaintController.escalateToIncident(
        complaint.caseNo,
        {
          title: "Unexpected duplicate incident",
          severity: "critical",
          reason: "Should be rejected before incident creation.",
        },
        "req-escalate-duplicate-001",
      ),
    ).toThrowError(ApiRequestError);

    expect(incidentService.listIncidents()).toHaveLength(1);
    expect(
      complaintService.getComplaintCase(complaint.caseNo).relatedIncidentId,
    ).toBe(firstResponse.data.incident.incidentId);
  });

  it("does not mutate the complaint when linking to a missing incident", () => {
    const { complaintController, complaintService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "web",
      category: "fare_dispute",
      severity: "normal",
      description: "Keep complaint untouched on failed link.",
    });

    expect(() =>
      complaintController.linkIncident(
        complaint.caseNo,
        { incidentId: "INC-404404" },
        "req-link-missing-incident-001",
      ),
    ).toThrowError(ApiRequestError);

    expect(
      complaintService.getComplaintCase(complaint.caseNo).relatedIncidentId,
    ).toBeNull();
  });

  it("does not mutate the incident when linking to a missing complaint", () => {
    const { incidentController, incidentService } = createServices();

    const incident = incidentService.createIncident({
      title: "Standalone incident",
      description: "Should remain unlinked when complaint is missing.",
      category: "operational",
      severity: "medium",
      reportedBy: "ops-agent-404",
    });

    expect(() =>
      incidentController.linkComplaint(
        incident.incidentId,
        { complaintCaseNo: "C-20260430-404404" },
        "req-link-missing-complaint-001",
      ),
    ).toThrowError(ApiRequestError);

    expect(
      incidentService.getIncident(incident.incidentId).relatedComplaintCaseNo,
    ).toBeNull();
  });

  it("rejects relinking a complaint or incident to a different counterpart", () => {
    const {
      complaintController,
      complaintService,
      incidentController,
      incidentService,
    } = createServices();

    const complaintA = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "First complaint in the link pair.",
    });
    const complaintB = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Second complaint should not steal the link.",
    });
    const incidentA = incidentService.createIncident({
      title: "First incident",
      description: "Primary link target.",
      category: "operational",
      severity: "medium",
      reportedBy: "ops-agent-200",
    });
    const incidentB = incidentService.createIncident({
      title: "Second incident",
      description: "Should not replace the existing complaint link.",
      category: "operational",
      severity: "medium",
      reportedBy: "ops-agent-201",
    });

    complaintController.linkIncident(
      complaintA.caseNo,
      { incidentId: incidentA.incidentId },
      "req-link-primary-pair-001",
    );

    expect(() =>
      complaintController.linkIncident(
        complaintA.caseNo,
        { incidentId: incidentB.incidentId },
        "req-link-complaint-reassign-001",
      ),
    ).toThrowError(ApiRequestError);
    expect(() =>
      incidentController.linkComplaint(
        incidentA.incidentId,
        { complaintCaseNo: complaintB.caseNo },
        "req-link-incident-reassign-001",
      ),
    ).toThrowError(ApiRequestError);

    expect(
      complaintService.getComplaintCase(complaintA.caseNo).relatedIncidentId,
    ).toBe(incidentA.incidentId);
    expect(
      complaintService.getComplaintCase(complaintB.caseNo).relatedIncidentId,
    ).toBeNull();
    expect(
      incidentService.getIncident(incidentA.incidentId).relatedComplaintCaseNo,
    ).toBe(complaintA.caseNo);
    expect(
      incidentService.getIncident(incidentB.incidentId).relatedComplaintCaseNo,
    ).toBeNull();
  });

  it("generates audit trail for escalation actions", () => {
    const { auditNotificationService, complaintService, incidentService } =
      createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "vehicle_condition",
      severity: "normal",
      description: "Vehicle reported with damage.",
    });

    const incident = incidentService.createIncident({
      title: "Vehicle damage report",
      description: "Escalated from complaint",
      category: "vehicle_damage",
      severity: "medium",
      reportedBy: "ops-agent-002",
    });

    complaintService.escalateToIncident(
      complaint.caseNo,
      incident.incidentId,
      "Vehicle damage needs incident tracking.",
      "req-escalate-001",
    );

    const auditLogs = auditNotificationService.listAuditLogs();
    const escalationAudit = auditLogs.find(
      (log) => log.actionName === "escalate_to_incident",
    );
    expect(escalationAudit).toBeDefined();
    expect(escalationAudit!.moduleName).toBe("complaint");
    expect(escalationAudit!.resourceId).toBe(complaint.caseNo);
    expect(escalationAudit!.newValuesSummary).toMatchObject({
      relatedIncidentId: incident.incidentId,
    });
  });

  it("produces correct export view with escalation data", () => {
    const { complaintService, incidentService } = createServices();

    const complaint = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Safety concern during trip.",
    });

    const incident = incidentService.createIncident({
      title: "Safety incident",
      description: "Escalated from complaint",
      category: "safety",
      severity: "critical",
      reportedBy: "ops-agent-003",
    });

    complaintService.escalateToIncident(
      complaint.caseNo,
      incident.incidentId,
      "Critical safety issue.",
    );

    const exportView = complaintService.getComplaintExportView(
      complaint.caseNo,
    );
    expect(exportView.complaintCase.relatedIncidentId).toBe(
      incident.incidentId,
    );
    expect(
      exportView.timeline.some(
        (entry) => entry.action === "escalated_to_incident",
      ),
    ).toBe(true);
  });
});
