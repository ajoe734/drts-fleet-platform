import { describe, expect, it } from "vitest";
import type { CallSessionRecord, CallbackTaskRecord } from "@drts/contracts";
import {
  deriveDispatchPresentation,
  deriveTtsPresentation,
  filterSessionsByBrandAuthorization,
  applyRecordingAuthorization,
  buildCallbackActionsForRecord,
  buildAiSessionActions,
  isNormalAiCallSession,
  type ExtendedCallSessionRecord,
} from "../../app/callcenter/callcenter-ai-exceptions";

describe("callcenter-ai-exceptions domain helpers", () => {
  describe("deriveDispatchPresentation (Acceptance: 不把 matching 當已派)", () => {
    it("returns isDispatched: false when dispatch state is matching", () => {
      const pres = deriveDispatchPresentation("matching");
      expect(pres.isDispatched).toBe(false);
      expect(pres.displayText).toContain("媒合選車中");
      expect(pres.rawState).toBe("matching");
    });

    it("returns isDispatched: false when dispatch state is offered or retrying", () => {
      const offered = deriveDispatchPresentation("offered");
      expect(offered.isDispatched).toBe(false);

      const retrying = deriveDispatchPresentation("retrying");
      expect(retrying.isDispatched).toBe(false);
    });

    it("returns isDispatched: true only when accepted or arrived", () => {
      const accepted = deriveDispatchPresentation("accepted", {
        driverName: "張司機",
        licensePlate: "ABC-1234",
        etaMinutes: 5,
      });
      expect(accepted.isDispatched).toBe(true);
      expect(accepted.driverName).toBe("張司機");
      expect(accepted.licensePlate).toBe("ABC-1234");
      expect(accepted.etaMinutes).toBe(5);

      const arrived = deriveDispatchPresentation("arrived");
      expect(arrived.isDispatched).toBe(true);
    });
  });

  describe("deriveTtsPresentation (Acceptance: 不把 generated TTS 當已播)", () => {
    it("returns isPlayed: false when TTS state is generated", () => {
      const pres = deriveTtsPresentation("generated");
      expect(pres.isPlayed).toBe(false);
      expect(pres.displayText).toContain("尚未播放");
      expect(pres.rawState).toBe("generated");
    });

    it("returns isPlayed: false when TTS state is generating or playing", () => {
      expect(deriveTtsPresentation("generating").isPlayed).toBe(false);
      expect(deriveTtsPresentation("playing").isPlayed).toBe(false);
    });

    it("returns isPlayed: true only when TTS state is played", () => {
      const pres = deriveTtsPresentation("played");
      expect(pres.isPlayed).toBe(true);
      expect(pres.displayText).toContain("已播放");
    });
  });

  describe("filterSessionsByBrandAuthorization (Acceptance: 未授權品牌不呈現)", () => {
    const sessions = [
      { callId: "CALL-1", brandId: "brand-a" },
      { callId: "CALL-2", brandId: "brand-b" },
      { callId: "CALL-3", brandId: null },
      { callId: "CALL-4", brandId: "brand-c" },
    ];

    it("filters out sessions for brands not in the authorized list", () => {
      const filtered = filterSessionsByBrandAuthorization(sessions, ["brand-a", "brand-c"]);
      expect(filtered.map((s) => s.callId)).toEqual(["CALL-1", "CALL-3", "CALL-4"]);
      expect(filtered.find((s) => s.brandId === "brand-b")).toBeUndefined();
    });

    it("returns all sessions if authorizedBrandIds is null or empty", () => {
      expect(filterSessionsByBrandAuthorization(sessions, null)).toHaveLength(4);
      expect(filterSessionsByBrandAuthorization(sessions, [])).toHaveLength(4);
    });
  });

  describe("applyRecordingAuthorization (Acceptance: 未授權錄音資料不呈現)", () => {
    const baseSession: CallSessionRecord = {
      callId: "CALL-REC-001",
      callType: "booking",
      callerPhone: "0912345678",
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "active",
      agentId: null,
      agentIdentityAnnounced: true,
      agentIdentityAnnouncedAt: null,
      flags: ["recording_bound"],
      recordingId: "REC-999",
      providerRecordingRef: "PROV-REC-888",
      recordingUrl: "https://recordings.example.com/REC-999.wav",
      recordingState: "ready",
      callbackTask: null,
      linkedOrderId: null,
      linkedCaseNo: null,
      lastEtaQuotedMinutes: null,
      lastEtaQuotedAt: null,
    };

    it("preserves recording details when authorized", () => {
      const authorized = applyRecordingAuthorization(baseSession, true);
      expect(authorized.recordingId).toBe("REC-999");
      expect(authorized.providerRecordingRef).toBe("PROV-REC-888");
      expect(authorized.recordingUrl).toBe("https://recordings.example.com/REC-999.wav");
      expect(authorized.recordingState).toBe("ready");
    });

    it("masks recording data and flags recording_unauthorized when not authorized", () => {
      const masked = applyRecordingAuthorization(baseSession, false);
      expect(masked.recordingId).toBeNull();
      expect(masked.providerRecordingRef).toBeNull();
      expect(masked.recordingUrl).toBeNull();
      expect(masked.recordingState).toBe("missing");
      expect(masked.flags).toContain("recording_unauthorized");
      expect(masked.flags).not.toContain("recording_bound");
    });
  });

  describe("buildCallbackActionsForRecord (Acceptance: closed call 仍可 claim/contact/close callback)", () => {
    const pendingTask: CallbackTaskRecord = {
      callbackTaskId: "CB-001",
      callId: "CALL-CLOSED-1",
      callerPhone: "0912345678",
      agentId: null,
      linkedOrderId: null,
      linkedCaseNo: null,
      dueAt: new Date().toISOString(),
      note: "Customer requested callback",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it("keeps claim, contact, complete, and cancel enabled on a CLOSED call session", () => {
      const actions = buildCallbackActionsForRecord(pendingTask, true /* isCallClosed */);
      
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

    it("disables actions when callback task is in terminal status", () => {
      const completedTask: CallbackTaskRecord = {
        ...pendingTask,
        status: "completed",
      };
      const actions = buildCallbackActionsForRecord(completedTask, false);

      expect(actions.find((a) => a.action === "claim_callback")?.enabled).toBe(false);
      expect(actions.find((a) => a.action === "contact_callback")?.enabled).toBe(false);
      expect(actions.find((a) => a.action === "complete_callback")?.enabled).toBe(false);
      expect(actions.find((a) => a.action === "cancel_callback")?.enabled).toBe(false);
    });

    it("returns disabled actions with callback_missing reason if task is null", () => {
      const actions = buildCallbackActionsForRecord(null, false);
      expect(actions).toHaveLength(4);
      for (const action of actions) {
        expect(action.enabled).toBe(false);
        expect(action.disabledReasonCode).toBe("callback_missing");
      }
    });
  });

  describe("buildAiSessionActions and isNormalAiCallSession", () => {
    const baseAiSession: ExtendedCallSessionRecord = {
      callId: "CALL-AI-001",
      callType: "booking",
      callerPhone: "0988776655",
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "active",
      agentId: null,
      agentIdentityAnnounced: true,
      agentIdentityAnnouncedAt: null,
      flags: ["ai_session"],
      recordingId: null,
      providerRecordingRef: null,
      recordingUrl: null,
      recordingState: "ready",
      callbackTask: null,
      linkedOrderId: null,
      linkedCaseNo: null,
      lastEtaQuotedMinutes: null,
      lastEtaQuotedAt: null,
      aiMetadata: {
        voiceSessionId: "VOICE-SESS-1",
        controlOwner: "ai",
        step: "confirming",
        language: "zh-TW",
        providerVersion: "gemini-live-v1",
        routeProfileVersion: 2,
        hasException: false,
        requiresApprovalGate: false,
      },
    };

    it("identifies a normal AI call session with no approval gate", () => {
      expect(isNormalAiCallSession(baseAiSession)).toBe(true);
      expect(baseAiSession.aiMetadata?.requiresApprovalGate).toBe(false);
    });

    it("identifies an exception AI call session", () => {
      const exceptionSession: ExtendedCallSessionRecord = {
        ...baseAiSession,
        flags: ["ai_session", "exception"],
        aiMetadata: {
          ...baseAiSession.aiMetadata!,
          hasException: true,
          exceptionDetails: {
            category: "location_unresolved",
            reason: "Ambiguous landmark query",
            nextResponsibleParty: "human_operator",
          },
        },
      };
      expect(isNormalAiCallSession(exceptionSession)).toBe(false);
    });

    it("builds takeover action when controlOwner is ai", () => {
      const actions = buildAiSessionActions(baseAiSession, baseAiSession.aiMetadata);
      const takeover = actions.find((a) => a.action === "takeover_ai_session");
      expect(takeover?.enabled).toBe(true);
    });

    it("disables takeover action when call is closed", () => {
      const closedSession: ExtendedCallSessionRecord = {
        ...baseAiSession,
        status: "closed",
      };
      const actions = buildAiSessionActions(closedSession, closedSession.aiMetadata);
      const takeover = actions.find((a) => a.action === "takeover_ai_session");
      expect(takeover?.enabled).toBe(false);
      expect(takeover?.disabledReasonCode).toBe("session_closed");
    });
  });
});
