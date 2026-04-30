import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";

describe("CallcenterService evidence access", () => {
  it("derives ready, pending, and missing recording states from the same workflow", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new CallcenterService(auditNotificationService);

    const pendingSession = service.openCallSession({
      callType: "booking",
      callerPhone: "0911000001",
      agentId: "ops-001",
    });
    expect(service.getCallSession(pendingSession.callId).recordingState).toBe(
      "pending",
    );

    service.attachRecordingCallback(pendingSession.callId, {
      recordingId: "recording-ready-001",
      agentId: "ops-001",
    });
    expect(service.getCallSession(pendingSession.callId).recordingState).toBe(
      "ready",
    );

    const missingSession = service.openCallSession({
      callType: "booking",
      callerPhone: "0911000002",
      agentId: "ops-002",
    });
    service.closeCallSession(missingSession.callId);
    service.linkOrderToExistingSession(missingSession.callId, {
      orderId: "ORD-MISSING-001",
    });

    const missingDetail = service.getCallSession(missingSession.callId);
    expect(missingDetail.recordingState).toBe("missing");
    expect(missingDetail.flags).toContain("recording_missing");
  });

  it("allows ops to read recording evidence and rejects tenant identities", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new CallcenterService(auditNotificationService);

    const session = service.openCallSession(
      {
        callType: "booking",
        callerPhone: "0911222333",
        agentId: "ops-001",
        agentIdentityAnnounced: true,
      },
      "req-call-open-001",
    );
    service.attachRecordingCallback(
      session.callId,
      {
        recordingId: "recording-demo-001",
        recordingUrl: "https://cti.example/recordings/recording-demo-001",
        agentId: "ops-001",
      },
      "req-call-recording-001",
    );

    const opsIdentity = {
      actorType: "ops_user" as const,
      actorId: "ops-001",
      realm: "ops" as const,
      scopes: [],
      tenantId: null,
    };
    const tenantIdentity = {
      actorType: "tenant_admin" as const,
      actorId: "tenant-admin-001",
      realm: "tenant" as const,
      scopes: ["reports:read"],
      tenantId: "tenant-demo-001",
    };

    const detail = service.getCallSession(
      session.callId,
      "req-call-read-001",
      opsIdentity,
    );
    expect(detail.recordingState).toBe("ready");
    expect(detail.recordingId).toBe("recording-demo-001");
    expect(detail.recordingUrl).toContain("recording-demo-001");

    expect(() =>
      service.getCallSession(
        session.callId,
        "req-call-read-002",
        tenantIdentity,
      ),
    ).toThrowError(ApiRequestError);

    const accessAudit = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "view_call_recording_evidence");
    expect(accessAudit?.actorType).toBe("ops_user");
    expect(accessAudit?.newValuesSummary).toMatchObject({
      evidenceFamily: "call_recording",
      accessAction: "read",
      hasRecordingId: true,
      hasRecordingUrl: true,
    });
  });

  it("closes sessions even when the caller sends no explicit close payload", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new CallcenterService(auditNotificationService);

    const session = service.openCallSession(
      {
        callType: "callback",
        callerPhone: "0922333444",
        agentId: "ops-002",
      },
      "req-call-open-002",
    );

    const closed = service.closeCallSession(session.callId);

    expect(closed.status).toBe("closed");
    expect(closed.endedAt).not.toBeNull();
    expect(closed.flags).toContain("closed");
  });

  it("records an auditable call-to-incident transfer", () => {
    const auditNotificationService = new AuditNotificationService();
    const service = new CallcenterService(auditNotificationService);

    const session = service.openCallSession(
      {
        callType: "booking",
        callerPhone: "0933444555",
        agentId: "ops-roc-001",
      },
      "req-call-open-003",
    );
    service.linkOrderToExistingSession(
      session.callId,
      { orderId: "ORD-ROC-001" },
      "req-call-link-order-003",
    );

    const updated = service.recordIncidentTransfer(
      session.callId,
      "INC-000321",
      "req-call-incident-transfer-001",
    );

    expect(updated.flags).toContain("incident_transferred");
    const transferAudit = auditNotificationService
      .listAuditLogs()
      .find((entry) => entry.actionName === "transfer_call_to_incident");
    expect(transferAudit?.resourceId).toBe(session.callId);
    expect(transferAudit?.newValuesSummary).toMatchObject({
      incidentId: "INC-000321",
      linkedOrderId: "ORD-ROC-001",
    });
  });
});
