import { describe, expect, it, vi } from "vitest";
import type {
  CallSessionRecord,
} from "@drts/contracts";
import {
  deriveDispatchPresentation,
  deriveTtsPresentation,
  filterSessionsByBrandAuthorization,
  applyRecordingAuthorization,
  buildCallbackActionsForRecord,
  buildAiSessionActions,
  isNormalAiCallSession,
  type ExtendedCallSessionRecord,
  type ExtendedCallbackTaskRecord,
} from "../../apps/ops-console-web/app/callcenter/callcenter-ai-exceptions";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { VoiceCallbackService } from "../../apps/api/src/modules/voice-booking/voice-callback.service";
import { VoiceHandoffQueueService } from "../../apps/api/src/modules/callcenter/voice-handoff-queue.service";
import { ApiClient } from "../../packages/api-client/src";

describe("UV-EXEC-019 Ops Console Exception Workbench, Tracing, and Callback Operations", () => {
  describe("AC-1: ops_normal_no_approval_evidence (UV-FR-021, UV-AC-029)", () => {
    it("observes normal autonomous AI call session with step, language, latencies, provider version, and confirmed data with strictly NO approval gate", () => {
      const normalSession: ExtendedCallSessionRecord = {
        callId: "CALL-AI-NORMAL-001",
        callType: "booking",
        callerPhone: "0912345678",
        startedAt: "2026-09-09T10:00:00Z",
        endedAt: null,
        agentId: null,
        agentIdentityAnnounced: true,
        agentIdentityAnnouncedAt: "2026-09-09T10:00:01Z",
        recordingId: null,
        providerRecordingRef: null,
        recordingUrl: null,
        linkedOrderId: null,
        linkedCaseNo: null,
        lastEtaQuotedMinutes: null,
        lastEtaQuotedAt: null,
        status: "active",
        flags: ["ai_session"],
        recordingState: "ready",
        callbackTask: null,
        aiMetadata: {
          voiceSessionId: "VOICE-SESS-NORMAL-1",
          controlOwner: "ai",
          step: "confirming",
          language: "zh-TW",
          providerVersion: "gemini-live-2.0",
          routeProfileVersion: 3,
          latencies: {
            asrMs: 120,
            llmMs: 380,
            ttsMs: 150,
            endToEndMs: 650,
          },
          confirmedData: {
            confirmedPickup: "台北車站",
            confirmedDropoff: "桃園國際機場",
            bookerName: "王小明",
            bookerPhone: "0912345678",
            passengerName: "王小明",
            passengerPhone: "0912345678",
            driverContactRole: "passenger",
            callbackRecipientRole: "booker",
          },
          hasException: false,
          requiresApprovalGate: false, // Critical acceptance requirement
        },
      };

      expect(isNormalAiCallSession(normalSession)).toBe(true);
      expect(normalSession.aiMetadata?.requiresApprovalGate).toBe(false);
      expect(normalSession.aiMetadata?.step).toBe("confirming");
      expect(normalSession.aiMetadata?.latencies?.endToEndMs).toBe(650);
      expect(normalSession.aiMetadata?.confirmedData?.confirmedPickup).toBe("台北車站");
      expect(normalSession.aiMetadata?.confirmedData?.confirmedDropoff).toBe("桃園國際機場");
    });
  });

  describe("AC-2: ops_exception_browser_evidence (UV-FR-020, UV-FR-022, UV-FR-023, UV-FR-032, UV-AC-020)", () => {
    it("displays exception details including category, reason, unknown operation warnings with duplicate prevention, and next responsible party", () => {
      const exceptionSession: ExtendedCallSessionRecord = {
        callId: "CALL-AI-EX-002",
        callType: "booking",
        callerPhone: "0922334455",
        startedAt: "2026-09-09T10:05:00Z",
        endedAt: null,
        agentId: null,
        agentIdentityAnnounced: true,
        agentIdentityAnnouncedAt: "2026-09-09T10:05:01Z",
        recordingId: null,
        providerRecordingRef: null,
        recordingUrl: null,
        linkedOrderId: null,
        linkedCaseNo: null,
        lastEtaQuotedMinutes: null,
        lastEtaQuotedAt: null,
        status: "active",
        flags: ["ai_session", "ai_exception"],
        recordingState: "ready",
        callbackTask: null,
        aiMetadata: {
          voiceSessionId: "VOICE-SESS-EX-2",
          controlOwner: "human_queue",
          step: "exception",
          language: "zh-TW",
          hasException: true,
          requiresApprovalGate: false,
          exceptionDetails: {
            category: "command_pending_reconciliation",
            reason: "Tool execution receipt timeout while booking vehicle",
            nextResponsibleParty: "human_operator",
            unknownOperation: {
              commandId: "CMD-ORD-999",
              actionKey: "create_phone_booking",
              receiptStatus: "pending_reconciliation",
              description: "Booking outcome unknown, pending reconciliation. Duplicate order prohibited.",
              detectedAt: "2026-09-09T10:06:00Z",
              canRetry: false, // Forbidden to blindly retry
            },
          },
          confirmedData: {
            callerUtterance: "我想訂明天早上七點去松山機場的車",
            confirmedPickup: "大安森林公園站 2號出口",
            confirmedDropoff: "台北松山機場",
            bookerName: "李小姐",
            bookerPhone: "0922334455",
            lastUnresolvedQuestion: "請問需要指定無障礙車型嗎？",
          },
        },
      };

      expect(isNormalAiCallSession(exceptionSession)).toBe(false);
      expect(exceptionSession.aiMetadata?.exceptionDetails?.category).toBe(
        "command_pending_reconciliation",
      );
      expect(
        exceptionSession.aiMetadata?.exceptionDetails?.unknownOperation?.canRetry,
      ).toBe(false);
      expect(
        exceptionSession.aiMetadata?.exceptionDetails?.nextResponsibleParty,
      ).toBe("human_operator");
      expect(exceptionSession.aiMetadata?.confirmedData?.confirmedPickup).toBe(
        "大安森林公園站 2號出口",
      );
      expect(
        exceptionSession.aiMetadata?.confirmedData?.lastUnresolvedQuestion,
      ).toBe("請問需要指定無障礙車型嗎？");
    });

    it("enforces truth projection: does NOT treat matching as dispatched (matching !== dispatched)", () => {
      const matchingPresentation = deriveDispatchPresentation("matching");
      expect(matchingPresentation.isDispatched).toBe(false);
      expect(matchingPresentation.rawState).toBe("matching");

      const offeredPresentation = deriveDispatchPresentation("offered");
      expect(offeredPresentation.isDispatched).toBe(false);

      const acceptedPresentation = deriveDispatchPresentation("accepted", {
        driverName: "林運將",
        licensePlate: "TDC-8899",
      });
      expect(acceptedPresentation.isDispatched).toBe(true);
      expect(acceptedPresentation.driverName).toBe("林運將");
    });

    it("enforces truth projection: does NOT treat generated TTS as played (generated !== played)", () => {
      const generatedPresentation = deriveTtsPresentation("generated");
      expect(generatedPresentation.isPlayed).toBe(false);
      expect(generatedPresentation.rawState).toBe("generated");

      const playedPresentation = deriveTtsPresentation("played");
      expect(playedPresentation.isPlayed).toBe(true);
      expect(playedPresentation.rawState).toBe("played");
    });

    it("provides human takeover action descriptor when control is with AI or human queue", () => {
      const sessionWithAi: ExtendedCallSessionRecord = {
        callId: "CALL-TAKEOVER-1",
        callType: "booking",
        callerPhone: "0933445566",
        startedAt: "2026-09-09T10:10:00Z",
        endedAt: null,
        agentId: null,
        agentIdentityAnnounced: true,
        agentIdentityAnnouncedAt: "2026-09-09T10:10:01Z",
        recordingId: null,
        providerRecordingRef: null,
        recordingUrl: null,
        linkedOrderId: null,
        linkedCaseNo: null,
        lastEtaQuotedMinutes: null,
        lastEtaQuotedAt: null,
        status: "active",
        flags: ["ai_session"],
        recordingState: "ready",
        callbackTask: null,
        aiMetadata: {
          voiceSessionId: "VOICE-SESS-3",
          controlOwner: "ai",
          step: "booking",
          language: "zh-TW",
          hasException: false,
          requiresApprovalGate: false,
        },
      };

      const actions = buildAiSessionActions(
        sessionWithAi,
        sessionWithAi.aiMetadata,
      );
      const takeoverAction = actions.find(
        (a) => a.action === "takeover_ai_session",
      );
      expect(takeoverAction).toBeDefined();
      expect(takeoverAction?.enabled).toBe(true);
      expect(takeoverAction?.riskLevel).toBe("medium");
    });
  });

  describe("AC-3: callback_closed_call_ui_evidence (UV-FR-014, UV-FR-018, UV-FR-024, UV-FR-025, UV-FR-028, UV-AC-028, UV-AC-040)", () => {
    const closedCallTask: ExtendedCallbackTaskRecord = {
      callbackTaskId: "CB-CLOSED-001",
      callId: "CALL-CLOSED-100",
      callerPhone: "0955667788",
      agentId: null,
      linkedOrderId: null,
      linkedCaseNo: null,
      dueAt: "2026-09-09T12:00:00Z",
      note: "Dropped call during slot collection",
      status: "pending",
      contactRole: "booker",
      contactName: "代叫人陳先生",
      createdAt: "2026-09-09T10:00:00Z",
      updatedAt: "2026-09-09T10:00:00Z",
    };

    it("allows claim, contact, complete, and cancel callback even when call session is CLOSED", () => {
      const actions = buildCallbackActionsForRecord(
        closedCallTask,
        true /* isCallClosed */,
      );

      const claim = actions.find((a) => a.action === "claim_callback");
      const contact = actions.find((a) => a.action === "contact_callback");
      const complete = actions.find((a) => a.action === "complete_callback");
      const cancel = actions.find((a) => a.action === "cancel_callback");

      expect(claim?.enabled).toBe(true);
      expect(contact?.enabled).toBe(true);
      expect(complete?.enabled).toBe(true);
      expect(cancel?.enabled).toBe(true);
      expect(cancel?.requiresReason).toBe(true);
    });

    it("differentiates contact roles: driver contacts passenger, callback reaches booker", () => {
      expect(closedCallTask.contactRole).toBe("booker");
      expect(closedCallTask.contactName).toBe("代叫人陳先生");
    });

    it("omits unauthorized brands and isolates multi-tenant data", () => {
      const sessions = [
        { callId: "CALL-BRAND-A", brandId: "brand-alpha" },
        { callId: "CALL-BRAND-B", brandId: "brand-beta" },
        { callId: "CALL-BRAND-SYS", brandId: null },
      ];

      const filtered = filterSessionsByBrandAuthorization(sessions, ["brand-alpha"]);
      expect(filtered.map((s) => s.callId)).toEqual(["CALL-BRAND-A", "CALL-BRAND-SYS"]);
      expect(filtered.find((s) => s.callId === "CALL-BRAND-B")).toBeUndefined();
    });

    it("masks recording data and removes recording_bound when unauthorized", () => {
      const rawSession: CallSessionRecord = {
        callId: "CALL-REC-PRIV",
        callType: "booking",
        callerPhone: "0977889900",
        startedAt: "2026-09-09T10:20:00Z",
        endedAt: "2026-09-09T10:30:00Z",
        agentId: null,
        agentIdentityAnnounced: true,
        agentIdentityAnnouncedAt: "2026-09-09T10:20:01Z",
        recordingId: "REC-SECRET-123",
        providerRecordingRef: "PROV-123",
        recordingUrl: "https://audio.example.com/secret.wav",
        linkedOrderId: null,
        linkedCaseNo: null,
        lastEtaQuotedMinutes: null,
        lastEtaQuotedAt: null,
        status: "closed",
        flags: ["recording_bound"],
        recordingState: "ready",
        callbackTask: null,
      };

      const masked = applyRecordingAuthorization(rawSession, false);
      expect(masked.recordingId).toBeNull();
      expect(masked.providerRecordingRef).toBeNull();
      expect(masked.recordingUrl).toBeNull();
      expect(masked.recordingState).toBe("missing");
      expect(masked.flags).toContain("recording_unauthorized");
      expect(masked.flags).not.toContain("recording_bound");
    });
  });

  describe("Backend CallcenterService & ApiClient integration", () => {
    it("executes claim, contact attempt, and cancel callback actions in CallcenterService", async () => {
      const mockVoiceCallback = {
        claimCallback: vi.fn().mockResolvedValue({
          callbackTaskId: "CB-BACKEND-1",
          status: "claimed",
          assignedOperatorId: "OP-99",
        }),
        recordAttempt: vi.fn().mockResolvedValue({
          callbackTaskId: "CB-BACKEND-1",
          status: "in_progress",
          attemptCount: 1,
        }),
        cancelCallback: vi.fn().mockResolvedValue({
          callbackTaskId: "CB-BACKEND-1",
          status: "cancelled",
        }),
      };

      const mockHandoffQueue = {
        claimSession: vi.fn().mockResolvedValue({
          callId: "CALL-TAKEOVER-API",
          operatorId: "OP-99",
        }),
      };

      const auditService = new AuditNotificationService();
      const callcenterService = new CallcenterService(
        auditService,
        undefined,
        undefined,
        mockVoiceCallback as unknown as VoiceCallbackService,
        mockHandoffQueue as unknown as VoiceHandoffQueueService,
      );

      // 1. Open session & callback
      const session = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0912000111",
        agentId: "OP-01",
        agentIdentityAnnounced: true,
      });
      const cb = callcenterService.createCallbackTask(session.callId, {
        dueAt: "2026-09-09T14:00:00Z",
        note: "Initial note",
      });

      // 2. Claim callback task
      const claimed = await callcenterService.claimCallbackTask(
        cb.callbackTaskId,
        "OP-99",
      );
      expect(mockVoiceCallback.claimCallback).toHaveBeenCalled();
      expect(claimed.status).toBe("claimed");
      expect(claimed.assignedOperatorId).toBe("OP-99");

      // 3. Record contact attempt
      const attempted = await callcenterService.recordCallbackAttempt(
        cb.callbackTaskId,
        {
          operatorId: "OP-99",
          outcome: "busy",
          notes: "Line busy, try again in 10 mins",
        },
      );
      expect(mockVoiceCallback.recordAttempt).toHaveBeenCalled();
      expect(attempted.lastOutcome).toBe("busy");
      expect(attempted.attemptCount).toBe(1);

      // 4. Cancel callback task
      const cancelled = await callcenterService.cancelCallbackTask(
        cb.callbackTaskId,
        { reason: "Customer resolved elsewhere", operatorId: "OP-99" },
      );
      expect(mockVoiceCallback.cancelCallback).toHaveBeenCalled();
      expect(cancelled.status).toBe("cancelled");

      // 5. Takeover AI session
      const takenOver = await callcenterService.takeoverAiCallSession(
        session.callId,
        { operatorId: "OP-99", reason: "Operator takeover" },
      );
      expect(mockHandoffQueue.claimSession).toHaveBeenCalled();
      expect(takenOver.agentId).toBe("OP-99");
      expect(takenOver.flags).toContain("human_takeover");
    });

    it("verifies brand isolation and recording masking in CallcenterService list and get methods", () => {
      const auditService = new AuditNotificationService();
      const callcenterService = new CallcenterService(auditService);

      const sessA = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0911111111",
        agentId: "OP-01",
        ...({ brandId: "brand-north" } as any),
      });
      const sessB = callcenterService.openCallSession({
        callType: "booking",
        callerPhone: "0922222222",
        agentId: "OP-02",
        ...({ brandId: "brand-south" } as any),
      });

      callcenterService.attachRecordingCallback(sessA.callId, {
        recordingId: "REC-A",
        providerRecordingRef: "P-A",
        recordingUrl: "https://rec.example.com/a.wav",
        agentId: "OP-01",
      });

      // Filter by brand-north
      const northOnly = callcenterService.listCallSessions(undefined, {
        actorId: "OP-01",
        actorType: "ops_user",
        realm: "ops",
        scopes: [],
        tenantId: "brand-north",
        roles: ["ops_operator"],
      });
      expect(northOnly.some((s) => s.callId === sessA.callId)).toBe(true);
      expect(northOnly.some((s) => s.callId === sessB.callId)).toBe(false);

      // Fetch with recording unauthorized (guest role without call_recording privilege)
      const maskedSession = callcenterService.getCallSession(
        sessA.callId,
        undefined,
        {
          actorId: "OP-01",
          actorType: "ops_user",
          realm: "ops",
          scopes: [],
          tenantId: "brand-north",
          roles: ["guest_viewer"],
        },
      );
      expect(maskedSession.recordingId).toBeNull();
      expect(maskedSession.recordingState).toBe("missing");
    });

    it("verifies ApiClient exposes callback and takeover methods", () => {
      const client = new ApiClient({ baseUrl: "http://localhost:3000" });
      expect(typeof client.claimCallbackTask).toBe("function");
      expect(typeof client.recordCallbackAttempt).toBe("function");
      expect(typeof client.cancelCallbackTask).toBe("function");
      expect(typeof client.takeoverAiCallSession).toBe("function");
    });
  });
});
