import { describe, expect, it } from "vitest";
import {
  VoicePolicyService,
  DEFAULT_VOICE_POLICY_VERSION,
} from "../../apps/api/src/modules/voice-booking/voice-policy.service";
import { VoiceRetentionService } from "../../apps/api/src/modules/voice-booking/voice-retention.service";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { getEvidenceRetentionPolicy } from "../../apps/api/src/common/evidence-governance";
import type { EvidenceAccessIdentity } from "../../apps/api/src/common/evidence-governance";

describe("UV-EXEC-021 Data Retention, Access Audit, Versioning & Emergency Suspension", () => {
  // ============================================================================
  // Suite 1: Disclosure, Refusal Alternative Flows & Versioning (UV-FR-001, UV-AC-026)
  // ============================================================================
  describe("1. Disclosure, Refusal Alternative Flows & Versioning (UV-FR-001, UV-AC-026)", () => {
    it("provides versioned disclosure prompts declaring AI identity and recording across languages", () => {
      const policyService = new VoicePolicyService();

      const mandarin = policyService.getDisclosurePolicy("zh-TW");
      expect(mandarin.policyVersion).toBe(DEFAULT_VOICE_POLICY_VERSION);
      expect(mandarin.aiIdentityText).toContain("智慧語音叫車助理");
      expect(mandarin.aiIdentityText).toContain("AI 提供服務");
      expect(mandarin.recordingDisclosureText).toContain("通話全程錄音");

      const taiwanese = policyService.getDisclosurePolicy("nan");
      expect(taiwanese.policyVersion).toBe(DEFAULT_VOICE_POLICY_VERSION);
      expect(taiwanese.aiIdentityText).toContain("智慧語音叫車助手");

      const hakka = policyService.getDisclosurePolicy("hak");
      expect(hakka.policyVersion).toBe(DEFAULT_VOICE_POLICY_VERSION);
      expect(hakka.aiIdentityText).toContain("智慧語音叫車助理");
    });

    it("accepts consent and allows normal recording booking flow", () => {
      const policyService = new VoicePolicyService();
      const result = policyService.evaluateDisclosureConsent(true);

      expect(result.acknowledged).toBe(true);
      expect(result.refusalType).toBe("none");
      expect(result.alternativeWorkflow).toBe("none");
      expect(result.auditPayload.recordingPermitted).toBe(true);
      expect(result.policyVersion).toBe(DEFAULT_VOICE_POLICY_VERSION);
    });

    it("handles recording refusal by routing to approved alternative flow without recording", () => {
      const policyService = new VoicePolicyService();
      const result = policyService.evaluateDisclosureConsent(false, "refuse_recording");

      expect(result.acknowledged).toBe(false);
      expect(result.refusalType).toBe("recording_refused");
      expect(result.alternativeWorkflow).toBe("transfer_human_unrecorded");
      expect(result.policyVersion).toBe(DEFAULT_VOICE_POLICY_VERSION);
      expect(result.auditPayload.recordingPermitted).toBe(false);
      expect(result.auditPayload.decision).toBe("recording_refused");
      expect(result.customerMessage).toContain("停止自動錄音");
      expect(result.customerMessage).toContain("轉接值班客服人員");
    });

    it("handles AI service refusal by transferring to human agent with audit version", () => {
      const policyService = new VoicePolicyService();
      const result = policyService.evaluateDisclosureConsent(false, "refuse_ai");

      expect(result.acknowledged).toBe(false);
      expect(result.refusalType).toBe("ai_service_refused");
      expect(result.alternativeWorkflow).toBe("transfer_human_unrecorded");
      expect(result.auditPayload.recordingPermitted).toBe(false);
      expect(result.customerMessage).toContain("轉接真人專人服務");
    });
  });

  // ============================================================================
  // Suite 2: Sensitive Data Masking & General Log Sanitization (UV-FR-024, UV-AC-026)
  // ============================================================================
  describe("2. Sensitive Data Masking & General Log Sanitization (UV-FR-024, UV-AC-026, pii_access_negative_evidence)", () => {
    it("redacts spoken payment card numbers (13-19 digits)", () => {
      const policyService = new VoicePolicyService();

      const visaInput = "我的信用卡號是 4111222233334444 請幫我扣款";
      const maskedVisa = policyService.maskSensitiveData(visaInput);
      expect(maskedVisa.containsSensitive).toBe(true);
      expect(maskedVisa.detectedTypes).toContain("payment_card");
      expect(maskedVisa.maskedText).not.toContain("4111222233334444");
      expect(maskedVisa.maskedText).toContain("****-****-****-4444");

      const spokenCard = "卡號： 5500 0000 1234 5678";
      const maskedSpoken = policyService.maskSensitiveData(spokenCard);
      expect(maskedSpoken.containsSensitive).toBe(true);
      expect(maskedSpoken.maskedText).not.toContain("5500 0000 1234 5678");
    });

    it("redacts spoken CVV security codes, passwords, PINs, and OTPs", () => {
      const policyService = new VoicePolicyService();

      const cvvInput = "卡片後面的安全碼是 892";
      const maskedCvv = policyService.maskSensitiveData(cvvInput);
      expect(maskedCvv.containsSensitive).toBe(true);
      expect(maskedCvv.detectedTypes).toContain("cvv_code");
      expect(maskedCvv.maskedText).not.toContain("892");
      expect(maskedCvv.maskedText).toContain("[REDACTED_CVV]");

      const pinInput = "我的提款密碼 123456 不要給別人";
      const maskedPin = policyService.maskSensitiveData(pinInput);
      expect(maskedPin.containsSensitive).toBe(true);
      expect(maskedPin.detectedTypes).toContain("password_pin");
      expect(maskedPin.maskedText).not.toContain("123456");
      expect(maskedPin.maskedText).toContain("[REDACTED_SECRET]");

      const otpInput = "剛收到的簡訊驗證碼 748291";
      const maskedOtp = policyService.maskSensitiveData(otpInput);
      expect(maskedOtp.containsSensitive).toBe(true);
      expect(maskedOtp.detectedTypes).toContain("otp_code");
      expect(maskedOtp.maskedText).not.toContain("748291");
      expect(maskedOtp.maskedText).toContain("[REDACTED_OTP]");
    });

    it("intervenes with policy warning when sensitive credentials are spoken in conversational turns", () => {
      const policyService = new VoicePolicyService();
      const result = policyService.evaluateSpokenTurnForSensitiveData(
        "我要報卡號 4111 2222 3333 4444 安全碼 123",
      );

      expect(result.hasSensitiveData).toBe(true);
      expect(result.policyAction).toBe("warn_and_redirect");
      expect(result.warningAnnouncement).toContain("不會在電話中要求您提供信用卡卡號或個人密碼");
      expect(result.warningAnnouncement).toContain("請勿在通話中口述敏感付款資訊");
      expect(result.maskedText).not.toContain("4111 2222 3333 4444");
    });

    it("sanitizes general logs completely so sensitive card and password data are never logged", () => {
      const policyService = new VoicePolicyService();

      const logPayload = {
        sessionId: "sess-123",
        event: "turn_finalized",
        userUtterance: "卡號是 4111222233334444 密碼 9876",
        meta: {
          cardNumber: "4111222233334444",
          cvv: "123",
          password: "mySecretPassword",
          pin: "9876",
          otp: "112233",
          passengerName: "王大明",
        },
      };

      const sanitized = policyService.sanitizeGeneralLog(logPayload) as typeof logPayload;

      expect(sanitized.userUtterance).not.toContain("4111222233334444");
      expect(sanitized.userUtterance).not.toContain("9876");
      expect(sanitized.meta.cardNumber).toBe("[REDACTED_SENSITIVE_FIELD]");
      expect(sanitized.meta.cvv).toBe("[REDACTED_SENSITIVE_FIELD]");
      expect(sanitized.meta.password).toBe("[REDACTED_SENSITIVE_FIELD]");
      expect(sanitized.meta.pin).toBe("[REDACTED_SENSITIVE_FIELD]");
      expect(sanitized.meta.otp).toBe("[REDACTED_SENSITIVE_FIELD]");
      expect(sanitized.meta.passengerName).toBe("王大明");
    });
  });

  // ============================================================================
  // Suite 3: Retention Governance & Expiry ("未定義保存期限不能默認永久")
  // ============================================================================
  describe("3. Retention Governance & Invariants (SD §9.2, UV-FR-032, UV-AC-028)", () => {
    it("publishes all voice evidence families with explicit, bounded retention periods", () => {
      const retentionService = new VoiceRetentionService();
      const catalog = retentionService.getPolicyCatalog();

      const voiceFamilies = [
        "voice_booking_evidence",
        "voice_transcript",
        "voice_recording_audio",
        "voice_live_buffer",
        "voice_telemetry",
      ];

      for (const family of voiceFamilies) {
        const policy = catalog.policies.find((p) => p.family === family);
        expect(policy).toBeDefined();
        expect(policy?.hotRetentionDays).toBeGreaterThan(0);
        expect(policy?.authorityModule).toBe("voice-booking");
      }
    });

    it("enforces statutory ceilings: transcripts capped at 180 days, audio capped at 180 days", () => {
      const retentionService = new VoiceRetentionService();

      const transcriptPolicy = retentionService.assertRetentionDefined("voice_transcript");
      expect(transcriptPolicy.hotRetentionDays + (transcriptPolicy.archiveRetentionDays ?? 0)).toBe(180);

      const audioPolicy = retentionService.assertRetentionDefined("voice_recording_audio");
      expect(audioPolicy.hotRetentionDays + (audioPolicy.archiveRetentionDays ?? 0)).toBe(180);

      const evidencePolicy = retentionService.assertRetentionDefined("voice_booking_evidence");
      expect(evidencePolicy.hotRetentionDays + (evidencePolicy.archiveRetentionDays ?? 0)).toBe(730);

      const liveBufferPolicy = retentionService.assertRetentionDefined("voice_live_buffer");
      expect(liveBufferPolicy.hotRetentionDays).toBe(1);
      expect(liveBufferPolicy.archiveTier).toBe("hot_only");
    });

    it("evaluates retention expiry accurately based on record age", () => {
      const retentionService = new VoiceRetentionService();

      const now = Date.now();
      // Record created 200 days ago (older than 180 days transcript policy)
      const agedDate = new Date(now - 200 * 24 * 60 * 60 * 1000);
      const evalAged = retentionService.evaluateRecordRetention({
        family: "voice_transcript",
        createdAt: agedDate,
        subjectRef: "turn-aged-001",
      });

      expect(evalAged.isExpired).toBe(true);
      expect(evalAged.eligibleForPurge).toBe(true);

      // Record created 10 days ago (fresh)
      const freshDate = new Date(now - 10 * 24 * 60 * 60 * 1000);
      const evalFresh = retentionService.evaluateRecordRetention({
        family: "voice_transcript",
        createdAt: freshDate,
        subjectRef: "turn-fresh-001",
      });

      expect(evalFresh.isExpired).toBe(false);
      expect(evalFresh.eligibleForPurge).toBe(false);
    });

    it("allows brand custom retention to shorten transcript window, but not exceed 180-day ceiling", () => {
      const retentionService = new VoiceRetentionService();

      const now = Date.now();
      // Brand configured 60 days retention
      const evalCustom = retentionService.evaluateRecordRetention({
        family: "voice_transcript",
        createdAt: new Date(now - 70 * 24 * 60 * 60 * 1000),
        subjectRef: "turn-custom-001",
        customRetentionDays: 60,
      });

      expect(evalCustom.retentionDays).toBe(60);
      expect(evalCustom.isExpired).toBe(true);

      // Brand attempt to exceed ceiling (e.g. 365 days) is clamped to 180
      const evalExcess = retentionService.evaluateRecordRetention({
        family: "voice_transcript",
        createdAt: new Date(),
        subjectRef: "turn-excess-001",
        customRetentionDays: 365,
      });
      expect(evalExcess.retentionDays).toBe(180);
    });
  });

  // ============================================================================
  // Suite 4: Legal Hold & Purge Execution (retention_hold_delete_evidence)
  // ============================================================================
  describe("4. Legal Hold & Purge Execution (retention_hold_delete_evidence)", () => {
    it("places a legal hold that successfully suppresses purge on expired records", () => {
      const retentionService = new VoiceRetentionService();

      const hold = retentionService.placeLegalHold({
        caseNumber: "CASE-2026-09-001",
        evidenceFamily: "voice_transcript",
        subjectRef: "turn-held-001",
        reasonCode: "complaint_escalation",
        placedBy: "ops-auditor-01",
        notes: "Passenger disputed pickup location and billing",
      });

      expect(hold.status).toBe("active");
      expect(hold.caseNumber).toBe("CASE-2026-09-001");
      expect(retentionService.isSubjectUnderHold("voice_transcript", "turn-held-001")).toBe(true);

      // Record is 200 days old (past 180 days threshold)
      const now = Date.now();
      const agedDate = new Date(now - 200 * 24 * 60 * 60 * 1000);

      const evalResult = retentionService.evaluateRecordRetention({
        family: "voice_transcript",
        createdAt: agedDate,
        subjectRef: "turn-held-001",
      });

      expect(evalResult.isExpired).toBe(true);
      expect(evalResult.isHeld).toBe(true);
      expect(evalResult.eligibleForPurge).toBe(false); // Held records cannot be purged!
    });

    it("rejects legal hold release when attempted by unauthorized role", () => {
      const retentionService = new VoiceRetentionService();

      const hold = retentionService.placeLegalHold({
        caseNumber: "CASE-2026-09-002",
        evidenceFamily: "voice_recording_audio",
        subjectRef: "audio-held-001",
        reasonCode: "regulatory_inquiry",
        placedBy: "ops-auditor-01",
      });

      // ops_user attempting to release must be rejected (only platform_admin can release)
      expect(() =>
        retentionService.releaseLegalHold({
          holdId: hold.holdId,
          releasedBy: "ops-user-01",
          releasedByRole: "ops_user",
        }),
      ).toThrowError(
        expect.objectContaining({
          code: "LEGAL_HOLD_RELEASE_FORBIDDEN",
        }),
      );

      // Hold remains active
      expect(retentionService.isSubjectUnderHold("voice_recording_audio", "audio-held-001")).toBe(true);
    });

    it("allows platform_admin to release legal hold, restoring purge eligibility", () => {
      const retentionService = new VoiceRetentionService();

      const hold = retentionService.placeLegalHold({
        caseNumber: "CASE-2026-09-003",
        evidenceFamily: "voice_recording_audio",
        subjectRef: "audio-held-002",
        reasonCode: "settlement_dispute",
        placedBy: "platform-admin-01",
      });

      const released = retentionService.releaseLegalHold({
        holdId: hold.holdId,
        releasedBy: "platform-admin-01",
        releasedByRole: "platform_admin",
        notes: "Settlement finalized and closed",
      });

      expect(released.status).toBe("released");
      expect(retentionService.isSubjectUnderHold("voice_recording_audio", "audio-held-002")).toBe(false);
    });

    it("executes purge sweep correctly skipping held records and recording audit evidence", () => {
      const retentionService = new VoiceRetentionService();

      const now = Date.now();
      const expiredDate = new Date(now - 200 * 24 * 60 * 60 * 1000);
      const freshDate = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Place hold on one expired record
      retentionService.placeLegalHold({
        caseNumber: "CASE-SWEEP-01",
        evidenceFamily: "voice_transcript",
        subjectRef: "turn-held-sweep",
        reasonCode: "internal_investigation",
        placedBy: "platform-admin-01",
      });

      const candidateRecords = [
        { subjectRef: "turn-expired-1", createdAt: expiredDate },
        { subjectRef: "turn-expired-2", createdAt: expiredDate },
        { subjectRef: "turn-held-sweep", createdAt: expiredDate }, // Under hold
        { subjectRef: "turn-fresh-1", createdAt: freshDate }, // Not expired
      ];

      // 1. Dry run
      const dryRunReport = retentionService.executePurge({
        family: "voice_transcript",
        candidateRecords,
        operatorId: "ops-worker-sweep",
        dryRun: true,
      });

      expect(dryRunReport.mode).toBe("dry-run");
      expect(dryRunReport.totalExamined).toBe(4);
      expect(dryRunReport.purgedCount).toBe(0);
      expect(dryRunReport.skippedHeldCount).toBe(1);

      // 2. Apply run
      const applyReport = retentionService.executePurge({
        family: "voice_transcript",
        candidateRecords,
        operatorId: "ops-worker-sweep",
        dryRun: false,
      });

      expect(applyReport.mode).toBe("apply");
      expect(applyReport.purgedCount).toBe(2);
      expect(applyReport.skippedHeldCount).toBe(1);
      expect(applyReport.results.find((r) => r.subjectRef === "turn-held-sweep")?.action).toBe("skipped_held");
      expect(applyReport.results.find((r) => r.subjectRef === "turn-fresh-1")?.action).toBe("not_expired");

      // Verify audit trail exists
      const history = retentionService.getPurgeHistory("voice_transcript");
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // Suite 5: Audited Access & Negative Permissions (pii_access_negative_evidence)
  // ============================================================================
  describe("5. Audited Access & Negative Permissions (pii_access_negative_evidence)", () => {
    it("denies access to voice recordings and transcripts for unauthorized identities", () => {
      const retentionService = new VoiceRetentionService();

      const tenantIdentity: EvidenceAccessIdentity = {
        actorType: "tenant_admin",
        actorId: "tenant-001",
        realm: "tenant",
        scopes: [],
        tenantId: "tenant-a",
      };

      // Tenant admin cannot access internal voice recordings
      expect(() =>
        retentionService.authorizeEvidenceAccess({
          family: "voice_recording_audio",
          action: "download",
          identity: tenantIdentity,
          subjectRef: "audio-rec-999",
        }),
      ).toThrowError(ApiRequestError);

      // Partner user cannot access internal voice booking evidence
      const partnerIdentity: EvidenceAccessIdentity = {
        actorType: "partner_user",
        actorId: "partner-001",
        realm: "partner",
        scopes: [],
      };

      expect(() =>
        retentionService.authorizeEvidenceAccess({
          family: "voice_booking_evidence",
          action: "read",
          identity: partnerIdentity,
          subjectRef: "cmd-proof-999",
        }),
      ).toThrowError(ApiRequestError);
    });

    it("authorizes platform_admin / ops_user and issues 15-minute signed download URL with audit", () => {
      const retentionService = new VoiceRetentionService();

      const adminIdentity: EvidenceAccessIdentity = {
        actorType: "platform_admin",
        actorId: "admin-audit-01",
        realm: "platform",
        scopes: [],
      };

      const result = retentionService.authorizeEvidenceAccess({
        family: "voice_recording_audio",
        action: "download",
        identity: adminIdentity,
        subjectRef: "audio-rec-101",
      });

      expect(result.authorized).toBe(true);
      expect(result.signedUrl).toBeDefined();
      expect(result.signedUrl).toContain("https://storage.drts.internal/download/voice_recording_audio/audio-rec-101");
      expect(result.signedUrl).toContain("token=");
      expect(result.expiresAt).toBeDefined();

      // Access audit record is emitted
      const auditTrail = retentionService.getAccessAuditHistory("voice_recording_audio", "audio-rec-101");
      expect(auditTrail.length).toBe(1);
      expect(auditTrail[0]?.action).toBe("download");
      expect(auditTrail[0]?.operatorId).toBe("admin-audit-01");
      expect(auditTrail[0]?.signedUrlIssued).toBe(true);
      expect(auditTrail[0]?.ttlMinutes).toBe(15);
    });
  });

  // ============================================================================
  // Suite 6: Immutable Route Profile (SD §9.1, §15.2, UV-FR-026)
  // ============================================================================
  describe("6. Immutable Route Profile (SD §9.1, §15.2, UV-FR-026)", () => {
    it("publishes immutable route profile and prevents overwriting existing versions", async () => {
      const policyService = new VoicePolicyService();

      const profileId = "11111111-2222-3333-4444-555555555555";
      const profile = await policyService.publishRouteProfile({
        profileId,
        version: 1,
        models: { asr: "twm-v3", llm: "gemini-flash", tts: "twm-tts-v2" },
        languages: ["zh-TW", "nan"],
        retryPolicy: { maxAttempts: 2 },
        capabilities: { speechBooking: true },
        recordingPolicy: { dualChannel: true },
        humanFallback: { queue: "general" },
      });

      expect(profile.profileId).toBe(profileId);
      expect(profile.version).toBe(1);

      // Attempting to republish the exact same version throws 409 ROUTE_PROFILE_IMMUTABLE
      await expect(
        policyService.publishRouteProfile({
          profileId,
          version: 1,
          models: { asr: "different-model" },
          languages: ["zh-TW"],
          retryPolicy: {},
          capabilities: {},
          recordingPolicy: {},
          humanFallback: {},
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: "ROUTE_PROFILE_IMMUTABLE",
        }),
      );

      // Publishing version 2 succeeds
      const v2 = await policyService.publishRouteProfile({
        profileId,
        version: 2,
        models: { asr: "twm-v3.22", llm: "gemini-flash-2", tts: "twm-tts-v2" },
        languages: ["zh-TW", "nan", "hak"],
        retryPolicy: { maxAttempts: 3 },
        capabilities: { speechBooking: true, dtmfBooking: true },
        recordingPolicy: { dualChannel: true },
        humanFallback: { queue: "priority" },
      });
      expect(v2.version).toBe(2);
    });

    it("pins route profile version for active sessions and rejects mid-session mutation", () => {
      const policyService = new VoicePolicyService();
      const sessionId = "session-test-pin-001";
      const profileId = "profile-uuid-001";

      // Session pins version 1
      policyService.pinSessionRouteProfile(sessionId, profileId, 1);

      // Asserting identical profile succeeds
      expect(() =>
        policyService.assertSessionRouteProfilePinned(sessionId, profileId, 1),
      ).not.toThrow();

      // Attempting to switch session to version 2 mid-flight is rejected
      expect(() =>
        policyService.assertSessionRouteProfilePinned(sessionId, profileId, 2),
      ).toThrowError(
        expect.objectContaining({
          status: 409,
          code: "SESSION_ROUTE_PROFILE_PINNED",
        }),
      );
    });
  });

  // ============================================================================
  // Suite 7: Unverified Provider Gate (SD §16.2, pii_access_negative_evidence)
  // ============================================================================
  describe("7. Unverified Provider Gate (SD §16.2, pii_access_negative_evidence)", () => {
    it("rejects live passenger routing to providers with unverified compliance conditions", () => {
      const policyService = new VoicePolicyService();

      policyService.registerProviderCompliance({
        providerId: "unverified-ai-vendor",
        verified: false,
        dataResidencyVerified: false,
        trainingOptOutVerified: false,
        slaAgreementVerified: false,
        dataRetentionCompliant: false,
        unverifiedReasons: [
          "Vendor permits training on customer audio",
          "Data residency outside Taiwan not approved",
        ],
      });

      expect(() =>
        policyService.verifyProviderDataTerms("unverified-ai-vendor"),
      ).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "PROVIDER_DATA_TERMS_UNVERIFIED",
        }),
      );

      // Unregistered provider also fails closed
      expect(() =>
        policyService.verifyProviderDataTerms("totally-unknown-provider"),
      ).toThrowError(
        expect.objectContaining({
          status: 403,
          code: "PROVIDER_DATA_TERMS_UNVERIFIED",
        }),
      );
    });

    it("allows verified provider that meets all compliance terms", () => {
      const policyService = new VoicePolicyService();
      const verified = policyService.verifyProviderDataTerms("twm-telephony-v1");
      expect(verified.verified).toBe(true);
      expect(verified.trainingOptOutVerified).toBe(true);
      expect(verified.dataResidencyVerified).toBe(true);
    });
  });

  // ============================================================================
  // Suite 8: Admission Kill Switch & In-Flight Preservation (kill_switch_pending_recovery_evidence)
  // ============================================================================
  describe("8. Admission Kill Switch & In-Flight Preservation (kill_switch_pending_recovery_evidence)", () => {
    it("suspends new admissions when global kill switch is active, recording overflow for CTI billing reconciliation", async () => {
      const policyService = new VoicePolicyService();

      policyService.activateKillSwitch({
        scope: "global",
        reason: "Severe network latency on CTI trunk",
        activatedBy: "ops-commander",
        fallbackRoute: "backup_human_queue",
      });

      const admission = await policyService.evaluateCallAdmission({
        providerAccountId: "twm-acc-01",
        providerCallId: "call-inbound-999",
        dnis: "0800000123",
      });

      expect(admission.admitted).toBe(false);
      expect(admission.outcome).toBe("overflow");
      expect(admission.reason).toBe("KILL_SWITCH_ACTIVE");
      expect(admission.fallbackRoute).toBe("backup_human_queue");
      expect(admission.admissionRecord.outcome).toBe("overflow");
      expect(admission.admissionRecord.reason).toContain("Severe network latency");

      // Deactivating restores admission
      policyService.deactivateKillSwitch("global");
      const admittedAfter = await policyService.evaluateCallAdmission({
        providerAccountId: "twm-acc-01",
        providerCallId: "call-inbound-1000",
        dnis: "0800000123",
      });
      expect(admittedAfter.admitted).toBe(true);
      expect(admittedAfter.outcome).toBe("admitted");
    });

    it("supports granular brand/language kill switches", async () => {
      const policyService = new VoicePolicyService();

      // Deactivate Hakka language due to TTS model degradation
      policyService.activateKillSwitch({
        scope: "language",
        scopeId: "hakka",
        reason: "Hakka TTS voice degradation under investigation",
        activatedBy: "quality-team",
        fallbackRoute: "transfer_hakka_agent",
      });

      // Mandarin admission succeeds
      const mandarinAdmission = await policyService.evaluateCallAdmission({
        providerAccountId: "twm-acc-01",
        providerCallId: "call-cmn",
        dnis: "0800000123",
        language: "cmn",
      });
      expect(mandarinAdmission.admitted).toBe(true);

      // Hakka admission triggers overflow to backup route
      const hakkaAdmission = await policyService.evaluateCallAdmission({
        providerAccountId: "twm-acc-01",
        providerCallId: "call-hak",
        dnis: "0800000123",
        language: "hakka",
      });
      expect(hakkaAdmission.admitted).toBe(false);
      expect(hakkaAdmission.outcome).toBe("overflow");
      expect(hakkaAdmission.fallbackRoute).toBe("transfer_hakka_agent");
    });

    it("preserves in-flight sessions and pending command receipts even when admission kill switch is engaged", () => {
      const policyService = new VoicePolicyService();

      // Engage global kill switch
      policyService.activateKillSwitch({
        scope: "global",
        reason: "Emergency maintenance",
        activatedBy: "platform-ops",
      });

      // Simulated pending commands from active sessions
      const inFlightCommands = [
        {
          commandId: "cmd-uuid-001",
          voiceSessionId: "sess-001",
          status: "pending",
          orderId: null,
          intentId: "intent-001",
        },
        {
          commandId: "cmd-uuid-002",
          voiceSessionId: "sess-002",
          status: "succeeded",
          orderId: "order-assigned-102",
          intentId: "intent-002",
        },
      ];

      // Reconciling pending commands completes successfully and is not dropped
      const reconciled = policyService.reconcilePendingCommandsUnderKillSwitch(inFlightCommands);

      expect(reconciled.length).toBe(2);
      expect(reconciled[0]?.commandId).toBe("cmd-uuid-001");
      expect(reconciled[0]?.reconciled).toBe(true);
      expect(reconciled[0]?.status).toBe("succeeded");
      expect(reconciled[0]?.orderId).toBeDefined();

      expect(reconciled[1]?.commandId).toBe("cmd-uuid-002");
      expect(reconciled[1]?.reconciled).toBe(true);
      expect(reconciled[1]?.status).toBe("succeeded");
      expect(reconciled[1]?.orderId).toBe("order-assigned-102");
    });
  });
});
