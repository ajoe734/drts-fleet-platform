import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { SandboxWebhookAdapter } from "../../../../apps/api/src/modules/callcenter/sandbox-webhook.adapter";
import { applyRecordingAuthorization } from "../../../../apps/ops-console-web/app/callcenter/callcenter-ai-exceptions";

function setupServices() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const webhookAdapter = new SandboxWebhookAdapter(callcenterService);

  return { auditService, callcenterService, webhookAdapter };
}

describe("C044: CTI Recording Callback, Late Ingestion & Playback Authorization (SR-QA-CALL-001)", () => {
  describe("Positive workflows: CTI webhook trunking, recording attachment, late recording, and authorized playback", () => {
    it("ingests CTI call.started webhook and binds incoming trunk call to active session", () => {
      const { webhookAdapter, callcenterService } = setupServices();

      const result = webhookAdapter.ingest(
        {
          event_type: "call.started",
          provider_call_id: "CTI-TRUNK-2026-001",
          caller_phone: "0955112233",
          agent_extension: "EXT-801",
          started_at: "2026-09-10T20:00:00Z",
          call_type: "booking",
        },
        "req-cti-start-01",
      );

      expect(result.accepted).toBe(true);
      expect(result.callId).toBe("CTI-TRUNK-2026-001");
      expect(result.session.callerPhone).toBe("0955112233");
      expect(result.session.agentId).toBe("EXT-801");
      expect(result.session.status).toBe("active");
      expect(result.session.recordingState).toBe("pending");
      expect(result.session.flags).toContain("recording_pending");

      // Verify readback from callcenter service
      const session = callcenterService.getCallSession("CTI-TRUNK-2026-001");
      expect(session.callId).toBe("CTI-TRUNK-2026-001");
    });

    it("attaches recording callback to active call session and transitions state to ready", () => {
      const { callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0912111222",
        agentId: "agent-01",
      });
      expect(session.recordingState).toBe("pending");
      expect(session.flags).toContain("recording_pending");

      const updated = callcenterService.attachRecordingCallback(
        session.callId,
        {
          recordingId: "REC-20260910-001",
          providerRecordingRef: "PROV-REC-AWS-S3-001",
          recordingUrl: "https://recordings.drts.example/20260910/rec-001.mp3",
          agentId: "agent-01",
          startedAt: "2026-09-10T20:01:00Z",
          endedAt: "2026-09-10T20:05:00Z",
        },
        "req-rec-attach-01",
      );

      expect(updated.recordingId).toBe("REC-20260910-001");
      expect(updated.providerRecordingRef).toBe("PROV-REC-AWS-S3-001");
      expect(updated.recordingUrl).toBe(
        "https://recordings.drts.example/20260910/rec-001.mp3",
      );
      expect(updated.recordingState).toBe("ready");
      expect(updated.flags).toContain("recording_bound");
      expect(updated.flags).not.toContain("recording_pending");
      expect(updated.flags).not.toContain("recording_missing");
    });

    it("handles late recording arrival on an already closed call session without dropping links", () => {
      const { callcenterService } = setupServices();

      // 1. Open session and link order
      const session = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0977665544",
        agentId: "agent-02",
      });
      callcenterService.linkOrderToCallSession({
        callId: session.callId,
        callType: "booking",
        callerPhone: session.callerPhone,
        agentId: "agent-02",
        linkedOrderId: "order-late-rec-01",
        recordingId: null,
      });

      // 2. Call ends and closes before recording finishes processing
      const closed = callcenterService.closeCallSession(
        session.callId,
        { endedAt: "2026-09-10T20:10:00Z" },
        "req-close-before-rec",
      );
      expect(closed.status).toBe("closed");
      expect(closed.recordingState).toBe("missing");
      expect(closed.linkedOrderId).toBe("order-late-rec-01");

      // 3. Late recording arrives 15 minutes later from PSTN/CTI recorder pipeline
      const lateAttached = callcenterService.attachRecordingCallback(
        session.callId,
        {
          recordingId: "REC-LATE-9999",
          providerRecordingRef: "PROV-LATE-PSTN-9999",
          recordingUrl: "https://recordings.drts.example/late/rec-9999.wav",
          agentId: "agent-02",
        },
        "req-late-rec-arrival",
      );

      // Verify closed status and linked order are preserved, while recording state is updated to ready
      expect(lateAttached.status).toBe("closed");
      expect(lateAttached.recordingId).toBe("REC-LATE-9999");
      expect(lateAttached.recordingState).toBe("ready");
      expect(lateAttached.flags).toContain("recording_bound");
      expect(lateAttached.linkedOrderId).toBe("order-late-rec-01");

      // Verify persistence readback
      const reloaded = callcenterService.getCallSession(session.callId);
      expect(reloaded.recordingState).toBe("ready");
      expect(reloaded.linkedOrderId).toBe("order-late-rec-01");
      expect(reloaded.recordingId).toBe("REC-LATE-9999");
    });

    it("enforces role-based recording authorization and masks recording data for unauthorized users", () => {
      const { callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0933112233",
        agentId: "agent-sec-01",
        ...({ brandId: "brand-alpha" } as any),
      });

      callcenterService.attachRecordingCallback(session.callId, {
        recordingId: "REC-CONFIDENTIAL-01",
        providerRecordingRef: "REF-S3-CONFIDENTIAL",
        recordingUrl: "https://secure-media.drts.example/calls/confidential-01.wav",
      });

      // Authorized Identity: Ops Operator with call_recording privilege
      const authorizedIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "ops_user",
        actorId: "ops-authorized-01",
        realm: "ops",
        tenantId: "brand-alpha",
        roleFamilies: ["ops"],
        roles: ["ops_operator"],
        scopes: ["call_recording:read"],
        requestId: "req-auth-read",
      };

      const authorizedRead = callcenterService.getCallSession(
        session.callId,
        undefined,
        authorizedIdentity,
      );
      expect(authorizedRead.recordingId).toBe("REC-CONFIDENTIAL-01");
      expect(authorizedRead.recordingUrl).toBe(
        "https://secure-media.drts.example/calls/confidential-01.wav",
      );
      expect(authorizedRead.recordingState).toBe("ready");

      // Unauthorized Identity: Guest viewer without recording authorization (backend mask)
      const unauthorizedIdentity: BootstrapRequestIdentity = {
        authMode: "bootstrap_headers",
        actorType: "ops_user",
        actorId: "guest-01",
        realm: "ops",
        tenantId: "brand-alpha",
        roleFamilies: ["ops"],
        roles: ["guest_viewer"],
        scopes: [],
        requestId: "req-unauth-read",
      };

      const backendMasked = callcenterService.getCallSession(
        session.callId,
        undefined,
        unauthorizedIdentity,
      );
      expect(backendMasked.recordingId).toBeNull();
      expect(backendMasked.recordingUrl).toBeNull();
      expect(backendMasked.providerRecordingRef).toBeNull();
      expect(backendMasked.recordingState).toBe("missing");

      // UV-019 Client Presentation masking verification
      const frontendMasked = applyRecordingAuthorization(session, false);
      expect(frontendMasked.recordingId).toBeNull();
      expect(frontendMasked.recordingUrl).toBeNull();
      expect(frontendMasked.providerRecordingRef).toBeNull();
      expect(frontendMasked.recordingState).toBe("missing");
      expect(frontendMasked.flags).toContain("recording_unauthorized");
      expect(frontendMasked.flags).not.toContain("recording_bound");
    });
  });

  describe("Negative & boundary cases: recording failure, invalid payloads, unsupported webhook events", () => {
    it("reports recording failure callback and marks recording state as missing with recording_missing flag", () => {
      const { webhookAdapter, callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0966778899",
      });

      // Webhook ingests recording.failed event
      const result = webhookAdapter.ingest({
        event_type: "recording.failed",
        provider_call_id: session.callId,
        error_code: "RECORDING_STORAGE_DISK_FULL",
        error_message: "Media storage worker ran out of disk space.",
      });

      expect(result.accepted).toBe(true);
      expect(result.session.recordingState).toBe("missing");
      expect(result.session.flags).toContain("recording_missing");
      expect(result.session.flags).not.toContain("recording_bound");

      const readback = callcenterService.getCallSession(session.callId);
      expect(readback.recordingState).toBe("missing");
      expect(readback.flags).toContain("recording_missing");
    });

    it("rejects recording attachment when recordingId is missing or empty with 400", () => {
      const { callcenterService } = setupServices();

      const session = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0911223344",
      });

      expect(() => {
        callcenterService.attachRecordingCallback(session.callId, {
          recordingId: "",
        });
      }).toThrowError(ApiRequestError);

      try {
        callcenterService.attachRecordingCallback(session.callId, {
          recordingId: "   ",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("RECORDING_ID_REQUIRED");
      }
    });

    it("rejects recording attachment on non-existent call session with 404", () => {
      const { callcenterService } = setupServices();

      expect(() => {
        callcenterService.attachRecordingCallback("CALL-NON-EXISTENT-REC", {
          recordingId: "REC-VALID-123",
        });
      }).toThrowError(ApiRequestError);

      try {
        callcenterService.attachRecordingCallback("CALL-NON-EXISTENT-REC", {
          recordingId: "REC-VALID-123",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("CALL_SESSION_NOT_FOUND");
      }
    });

    it("rejects webhook ingestion with unsupported event_type", () => {
      const { webhookAdapter } = setupServices();

      expect(() => {
        webhookAdapter.ingest({
          event_type: "unsupported.custom.event" as any,
          provider_call_id: "CTI-001",
        });
      }).toThrowError(ApiRequestError);

      try {
        webhookAdapter.ingest({
          event_type: "unknown.type" as any,
          provider_call_id: "CTI-001",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("SANDBOX_EVENT_TYPE_UNSUPPORTED");
      }
    });

    it("rejects webhook ingestion with missing provider_call_id", () => {
      const { webhookAdapter } = setupServices();

      expect(() => {
        webhookAdapter.ingest({
          event_type: "call.started",
          provider_call_id: "",
        });
      }).toThrowError(ApiRequestError);

      try {
        webhookAdapter.ingest({
          event_type: "call.started",
          provider_call_id: "   ",
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(400);
        expect(err.code).toBe("PROVIDER_CALL_ID_REQUIRED");
      }
    });
  });
});
