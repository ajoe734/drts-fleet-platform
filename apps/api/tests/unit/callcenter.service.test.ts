import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";

describe("CallcenterService evidence access", () => {
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
});
