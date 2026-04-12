import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterRepository } from "../../apps/api/src/modules/callcenter/callcenter.repository";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";

describe("callcenter service", () => {
  it("opens, fetches, and closes a call session", () => {
    const auditService = new AuditNotificationService();
    const callcenterService = new CallcenterService(auditService);

    const session = callcenterService.openCallSession(
      {
        callType: "booking",
        callerPhone: "0911222333",
        agentId: "AGENT-0021",
      },
      "request-open",
    );

    expect(session.status).toBe("active");
    expect(session.flags).toContain("recording_pending");
    expect(callcenterService.getCallSession(session.callId).callId).toBe(
      session.callId,
    );

    const closedSession = callcenterService.closeCallSession(
      session.callId,
      {
        endedAt: "2026-04-10T10:20:00Z",
      },
      "request-close",
    );

    expect(closedSession.status).toBe("closed");
    expect(closedSession.endedAt).toBe("2026-04-10T10:20:00Z");
    expect(closedSession.flags).toContain("closed");
  });

  it("attaches a recording callback to a linked call session", () => {
    const auditService = new AuditNotificationService();
    const callcenterService = new CallcenterService(auditService);

    const session = callcenterService.linkOrderToCallSession({
      callId: "CALL-20260410-000501",
      callType: "booking",
      callerPhone: "0911222333",
      agentId: "AGENT-0021",
      linkedOrderId: "order-demo-001",
      recordingId: null,
    });

    const attached = callcenterService.attachRecordingCallback(
      session.callId,
      {
        recordingId: "REC-20260410-000501",
        providerRecordingRef: "cti-ref-501",
        recordingUrl: "https://recordings.example.com/REC-20260410-000501",
        startedAt: "2026-04-10T09:00:00Z",
        endedAt: "2026-04-10T09:20:00Z",
        agentId: "AGENT-0021",
      },
      "request-recording",
    );

    expect(attached.recordingId).toBe("REC-20260410-000501");
    expect(attached.flags).toContain("recording_bound");
    expect(attached.flags).not.toContain("recording_pending");
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "attach_recording_callback",
    );
  });

  it("rehydrates persisted sessions and writes new sessions through the repository", async () => {
    const auditService = new AuditNotificationService();
    const upsertSession = vi.fn(async () => undefined);
    const repository = {
      loadSessions: vi.fn(async () => [
        {
          callId: "CALL-20260410-000099",
          callType: "booking",
          callerPhone: "0900111222",
          agentId: "AGENT-0099",
          status: "active",
          startedAt: "2026-04-10T09:00:00Z",
          endedAt: null,
          recordingId: null,
          providerRecordingRef: null,
          recordingUrl: null,
          linkedOrderId: "order-demo-099",
          linkedCaseNo: null,
          flags: ["recording_pending"],
        },
      ]),
      upsertSession,
      reportPersistenceFailure: vi.fn(),
    } as unknown as CallcenterRepository;

    const callcenterService = new CallcenterService(auditService, repository);

    await callcenterService.onModuleInit();

    expect(
      callcenterService.getCallSession("CALL-20260410-000099").linkedOrderId,
    ).toBe("order-demo-099");

    const session = callcenterService.openCallSession({
      callType: "dispatch_support",
      callerPhone: "0911000222",
      agentId: "AGENT-0100",
    });

    await Promise.resolve();

    expect(session.callId).toBe("CALL-20260410-000100");
    expect(upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "CALL-20260410-000100",
        callerPhone: "0911000222",
      }),
    );
  });
});
