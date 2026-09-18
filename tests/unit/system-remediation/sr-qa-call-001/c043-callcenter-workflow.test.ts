import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { ComplaintService } from "../../../../apps/api/src/modules/complaint/complaint.service";
import { IncidentService } from "../../../../apps/api/src/modules/incident/incident.service";

function setupServices() {
  const auditService = new AuditNotificationService();
  const complaintService = new ComplaintService(auditService);
  const incidentService = new IncidentService(auditService);
  const callcenterService = new CallcenterService(auditService);

  return { auditService, complaintService, incidentService, callcenterService };
}

describe("C043: Callcenter Workflow & Order/Case Linking (SR-QA-CALL-001)", () => {
  describe("Positive workflows: call session creation, caller lookup, order and complaint correlation", () => {
    it("creates a call session with caller phone, announces agent identity, and records audit logs", () => {
      const { auditService, callcenterService } = setupServices();

      const session = callcenterService.openCallSession(
        {
          callType: "booking",
          callerPhone: "0912345678",
          agentId: "agent-tw-01",
          agentIdentityAnnounced: false,
        },
        "req-c043-01",
      );

      expect(session.callId).toMatch(/^CALL-\d{8}-\d{6}$/);
      expect(session.callerPhone).toBe("0912345678");
      expect(session.agentId).toBe("agent-tw-01");
      expect(session.status).toBe("active");
      expect(session.recordingState).toBe("pending");
      expect(session.flags).toContain("recording_pending");
      expect(session.agentIdentityAnnounced).toBe(false);

      // Caller lookup / session retrieval
      const fetched = callcenterService.getCallSession(session.callId);
      expect(fetched.callId).toBe(session.callId);
      expect(fetched.callerPhone).toBe("0912345678");

      // Agent identity announcement
      const announced = callcenterService.announceAgentIdentity(
        session.callId,
        {
          agentId: "agent-tw-01",
        },
        "req-c043-02",
      );

      expect(announced.agentIdentityAnnounced).toBe(true);
      expect(announced.agentIdentityAnnouncedAt).toBeDefined();

      // Verify audit logs recorded both actions
      const logs = auditService.listAuditLogs();
      expect(logs.some((l) => l.actionName === "open_call_session")).toBe(true);
      expect(logs.some((l) => l.actionName === "announce_agent_identity")).toBe(
        true,
      );
    });

    it("links an order to the call session and synchronizes callback task order ref", async () => {
      const { callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0922334455",
        agentId: "agent-tw-02",
      });

      // Create an associated callback task before order linking
      const callbackTask = callcenterService.createCallbackTask(
        session.callId,
        {
          dueAt: "2026-09-10T22:00:00Z",
          note: "Customer inquiry during peak hour",
        },
      );
      expect(callbackTask.linkedOrderId).toBeNull();

      // Link order to the existing call session
      const linkedSession = await callcenterService.linkOrderToExistingSession(
        session.callId,
        {
          orderId: "order-test-9901",
        },
        "req-c043-link-order",
      );

      expect(linkedSession.linkedOrderId).toBe("order-test-9901");
      expect(linkedSession.flags).toContain("recording_pending");

      // Verify callback task receives synchronized linkedOrderId
      const updatedCallback = callcenterService
        .listCallbackTasks()
        .find((cb) => cb.callbackTaskId === callbackTask.callbackTaskId);
      expect(updatedCallback?.linkedOrderId).toBe("order-test-9901");

      // Re-read session to ensure persistence in memory
      const reloaded = callcenterService.getCallSession(session.callId);
      expect(reloaded.linkedOrderId).toBe("order-test-9901");
      expect(reloaded.callbackTask?.linkedOrderId).toBe("order-test-9901");
    });

    it("links a complaint case to the same call ID and verifies bidirectional correlation", () => {
      const { complaintService, callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "general_inquiry",
        callerPhone: "0933445566",
        agentId: "agent-tw-03",
      });

      // Create complaint referencing the callId
      const complaintCase = complaintService.createComplaintCase(
        {
          caseSource: "phone",
          relatedOrderId: "order-ref-1002",
          relatedCallId: session.callId,
          category: "driver_service",
          severity: "normal",
          description: "乘客投訴司機未依預約時間抵達",
        },
        "req-c043-complaint",
      );

      expect(complaintCase.relatedCallId).toBe(session.callId);
      expect(complaintCase.caseNo).toMatch(/^C-\d{8}-\d{6}$/);

      // Link the case to the call session
      const linkedSession = callcenterService.linkCaseToCallSession(
        session.callId,
        complaintCase.caseNo,
        "req-c043-link-case",
      );

      expect(linkedSession.linkedCaseNo).toBe(complaintCase.caseNo);

      // Verify bidirectional readback
      const reloadedSession = callcenterService.getCallSession(session.callId);
      const reloadedComplaint = complaintService.getComplaintCase(
        complaintCase.caseNo,
      );

      expect(reloadedSession.linkedCaseNo).toBe(reloadedComplaint.caseNo);
      expect(reloadedComplaint.relatedCallId).toBe(reloadedSession.callId);
    });

    it("transfers a call session to an incident and records incident link and flag", () => {
      const { incidentService, callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "general_inquiry",
        callerPhone: "0988776655",
        agentId: "agent-tw-04",
      });

      const incident = incidentService.createIncident({
        title: "Vehicle breakdown during passenger ride",
        description: "Engine overheating on highway",
        category: "vehicle_damage",
        severity: "high",
        reportedBy: "agent-tw-04",
      });

      const transferredSession = callcenterService.recordIncidentTransfer(
        session.callId,
        incident.incidentId,
        "req-c043-transfer-incident",
      );

      expect(transferredSession.flags).toContain("incident_transferred");

      const reloaded = callcenterService.getCallSession(session.callId);
      expect(reloaded.flags).toContain("incident_transferred");
    });
  });

  describe("Negative & boundary cases: duplicate prevention, missing resources, immutable callerPhone", () => {
    it("rejects call session opening with invalid or empty phone numbers", () => {
      const { callcenterService } = setupServices();

      expect(() => {
        callcenterService.openCallSession({
          callType: "booking",
          callerPhone: "",
        });
      }).toThrowError(ApiRequestError);

      expect(() => {
        callcenterService.openCallSession({
          callType: "booking",
          callerPhone: "   ",
        });
      }).toThrowError(ApiRequestError);

      try {
        callcenterService.openCallSession({
          callType: "booking",
          callerPhone: "",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("CALLER_PHONE_REQUIRED");
      }
    });

    it("rejects retrieval of a non-existent call session with 404", () => {
      const { callcenterService } = setupServices();

      try {
        callcenterService.getCallSession("CALL-NON-EXISTENT-999");
        throw new Error("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiRequestError);
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("CALL_SESSION_NOT_FOUND");
      }
    });

    it("rejects linking an order to a non-existent call session", () => {
      const { callcenterService } = setupServices();

      expect(() => {
        callcenterService.linkOrderToExistingSession("CALL-GHOST-001", {
          orderId: "order-999",
        });
      }).toThrowError(ApiRequestError);
    });

    it("rejects linking an empty or whitespace case number to a call session", () => {
      const { callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "general_inquiry",
        callerPhone: "0911000222",
      });

      expect(() => {
        callcenterService.linkCaseToCallSession(session.callId, "");
      }).toThrowError(ApiRequestError);

      try {
        callcenterService.linkCaseToCallSession(session.callId, "   ");
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("CASE_NO_REQUIRED");
      }
    });

    it("preserves original asserted callerPhone immutably upon subsequent updates (SD §6.4)", () => {
      const { callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0912345678",
      });

      // Attempt to link order with a different phone via linkOrderToCallSession
      const linked = callcenterService.linkOrderToCallSession({
        callId: session.callId,
        callType: "booking",
        callerPhone: "0987654321", // Different phone attempt
        agentId: "agent-01",
        linkedOrderId: "order-immutability-check",
        recordingId: null,
      });

      // Original asserted callerPhone must remain intact
      expect(linked.callerPhone).toBe("0912345678");
      const readback = callcenterService.getCallSession(session.callId);
      expect(readback.callerPhone).toBe("0912345678");
    });
  });
});
