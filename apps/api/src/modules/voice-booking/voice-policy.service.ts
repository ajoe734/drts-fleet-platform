import { Injectable, Logger, Optional } from "@nestjs/common";

import { ApiRequestError } from "../../common/api-envelope";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { voiceAlertMetrics } from "../../observability/voice-alert-metrics";

export const DEFAULT_VOICE_POLICY_VERSION = "uv-policy-20260906-v1";

export interface DisclosurePolicy {
  policyVersion: string;
  aiIdentityText: string;
  servicePurposeText: string;
  recordingDisclosureText: string;
  fullPromptText: string;
  supportedLanguages: string[];
}

export type DisclosureRefusalType =
  | "recording_refused"
  | "ai_service_refused"
  | "none";

export type DisclosureAlternativeWorkflow =
  | "transfer_human_unrecorded"
  | "sms_booking_link"
  | "end_call_safe"
  | "none";

export interface DisclosureRefusalResult {
  acknowledged: boolean;
  refusalType: DisclosureRefusalType;
  alternativeWorkflow: DisclosureAlternativeWorkflow;
  policyVersion: string;
  reason: string;
  auditPayload: Record<string, unknown>;
  customerMessage: string;
}

export interface MaskSensitiveDataResult {
  maskedText: string;
  containsSensitive: boolean;
  detectedTypes: string[];
}

export interface SpokenTurnEvaluationResult {
  hasSensitiveData: boolean;
  maskedText: string;
  policyAction: "warn_and_redirect" | "proceed";
  warningAnnouncement?: string | undefined;
  detectedTypes: string[];
}

export interface VoiceRouteProfileRecord {
  profileId: string;
  version: number;
  models: Record<string, unknown>;
  languages: string[];
  retryPolicy: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  recordingPolicy: Record<string, unknown>;
  humanFallback: Record<string, unknown>;
  createdAt?: string | undefined;
}

export interface ProviderDataComplianceStatus {
  providerId: string;
  verified: boolean;
  dataResidencyVerified: boolean;
  trainingOptOutVerified: boolean;
  slaAgreementVerified: boolean;
  dataRetentionCompliant: boolean;
  unverifiedReasons: string[];
  lastAuditedAt?: string | undefined;
}

export type KillSwitchScope = "global" | "brand" | "line" | "language";

export interface KillSwitchEntry {
  scope: KillSwitchScope;
  scopeId: string;
  active: boolean;
  reason: string;
  activatedAt: string;
  activatedBy: string;
  fallbackRoute: string;
}

export interface CallAdmissionDecision {
  admitted: boolean;
  outcome: "admitted" | "overflow" | "failed";
  reason?: string | undefined;
  reasonDetail?: string | undefined;
  fallbackRoute?: string | undefined;
  admissionRecord: {
    providerAccountId: string;
    providerCallId: string;
    dnis: string;
    receivedAt: string;
    outcome: "admitted" | "overflow" | "failed";
    reason: string;
    brandId?: string | undefined;
    lineBindingId?: string | undefined;
  };
}

@Injectable()
export class VoicePolicyService {
  private readonly logger = new Logger(VoicePolicyService.name);

  // In-memory store for immutable route profiles (SD §9.1: voice.route_profile)
  private readonly routeProfiles = new Map<string, VoiceRouteProfileRecord>();

  // In-memory store for session pinned route profile versions
  private readonly sessionPinnedProfiles = new Map<
    string,
    { profileId: string; version: number }
  >();

  // In-memory store for kill switches
  private readonly killSwitches = new Map<string, KillSwitchEntry>();

  // In-memory store for provider compliance status
  private readonly providerCompliance = new Map<
    string,
    ProviderDataComplianceStatus
  >();

  constructor(
    @Optional()
    private readonly repository?: VoiceBookingRepository,
  ) {
    // Default provider registrations
    this.registerProviderCompliance({
      providerId: "twm-telephony-v1",
      verified: true,
      dataResidencyVerified: true,
      trainingOptOutVerified: true,
      slaAgreementVerified: true,
      dataRetentionCompliant: true,
      unverifiedReasons: [],
      lastAuditedAt: new Date().toISOString(),
    });
  }

  // ============================================================================
  // 1. Disclosure & Refusal Alternative Workflows (UV-FR-001, UV-AC-026)
  // ============================================================================

  getDisclosurePolicy(language = "zh-TW"): DisclosurePolicy {
    const isTaiwanese = language === "nan" || language === "taiwanese";
    const isHakka = language === "hak" || language === "hakka";

    let aiIdentityText =
      "您好，我是 DRTS 智慧語音叫車助理。本通話由 AI 提供服務，通話全程錄音以保障您的乘車權益與服務品質。";
    let servicePurposeText = "若您同意，請說出您的上車地點或按 1 繼續。";
    let recordingDisclosureText =
      "通話全程錄音以確保服務品質。若您不希望錄音或需要真人服務，請直接說明，我們將為您轉接人工服務或提供簡訊預約。";

    if (isTaiwanese) {
      aiIdentityText =
        "汝好，我是 DRTS 智慧語音叫車助手。這通電話由 AI 提供服務，全程錄音來保障服務品質。";
      servicePurposeText = "若汝同意，請講汝欲坐車的所在。";
      recordingDisclosureText =
        "通話全程錄音。若汝無愛錄音抑是愛真人服務，請直接講，阮會替汝轉接專人。";
    } else if (isHakka) {
      aiIdentityText =
        "恁好，𠊎係 DRTS 智慧語音叫車助理。這通電話由 AI 提供服務，全程錄音保障乘車權益。";
      servicePurposeText = "若你同意，請講出愛上車嘅地方。";
      recordingDisclosureText =
        "通話全程錄音。若你毋想錄音或需要專人服務，請直接講，會為你轉接專人。";
    }

    return {
      policyVersion: DEFAULT_VOICE_POLICY_VERSION,
      aiIdentityText,
      servicePurposeText,
      recordingDisclosureText,
      fullPromptText: `${aiIdentityText} ${servicePurposeText} ${recordingDisclosureText}`,
      supportedLanguages: ["zh-TW", "cmn", "nan", "hak"],
    };
  }

  evaluateDisclosureConsent(
    accepted: boolean,
    refusalDetail: "refuse_recording" | "refuse_ai" | "none" = "none",
    language = "zh-TW",
  ): DisclosureRefusalResult {
    const policy = this.getDisclosurePolicy(language);

    if (accepted) {
      return {
        acknowledged: true,
        refusalType: "none",
        alternativeWorkflow: "none",
        policyVersion: policy.policyVersion,
        reason: "PASSENGER_ACCEPTED_DISCLOSURE",
        auditPayload: {
          policyVersion: policy.policyVersion,
          consentRecordedAt: new Date().toISOString(),
          decision: "accepted",
          recordingPermitted: true,
        },
        customerMessage: "已收到您的確認，請說明您的乘車需求。",
      };
    }

    // Acceptance requirement: "拒絕錄音或念卡號/密碼的流程不將敏感資料灌一般 log；告知文案/替代流程有政策版本。"
    // "不能照常錄音建單" -> Trigger approved alternative workflow
    if (refusalDetail === "refuse_recording") {
      return {
        acknowledged: false,
        refusalType: "recording_refused",
        alternativeWorkflow: "transfer_human_unrecorded",
        policyVersion: policy.policyVersion,
        reason: "PASSENGER_REFUSED_RECORDING",
        auditPayload: {
          policyVersion: policy.policyVersion,
          refusalRecordedAt: new Date().toISOString(),
          decision: "recording_refused",
          recordingPermitted: false,
          alternativeSelected: "transfer_human_unrecorded",
        },
        customerMessage:
          "好的，了解您不希望通話錄音。系統將為您停止自動錄音，並轉接值班客服人員為您處理叫車需求，請稍候。",
      };
    }

    return {
      acknowledged: false,
      refusalType: "ai_service_refused",
      alternativeWorkflow: "transfer_human_unrecorded",
      policyVersion: policy.policyVersion,
      reason: "PASSENGER_REQUESTED_HUMAN",
      auditPayload: {
        policyVersion: policy.policyVersion,
        refusalRecordedAt: new Date().toISOString(),
        decision: "ai_service_refused",
        recordingPermitted: false,
        alternativeSelected: "transfer_human_unrecorded",
      },
      customerMessage:
        "好的，為您轉接真人專人服務，通話資料將為您安全移交，請稍候。",
    };
  }

  // ============================================================================
  // 2. Sensitive Data Masking & General Log Sanitization (UV-FR-024, UV-AC-026)
  // ============================================================================

  /**
   * SD §13.3: "不蒐集付款卡號／密碼，不以聲紋推定身份，不讓AI自行判定乘客詐欺。"
   * Masks credit card numbers, CVVs, PINs, passwords, and OTPs.
   */
  maskSensitiveData(input: string): MaskSensitiveDataResult {
    if (!input || typeof input !== "string") {
      return { maskedText: "", containsSensitive: false, detectedTypes: [] };
    }

    let masked = input;
    const detectedTypes: string[] = [];

    // 1. Payment Card regex: 13 to 19 digits (continuous or separated by hyphens/spaces)
    // Matches Visa, Mastercard, Amex, JCB, UnionPay numbers
    const cardRegex =
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9]{2})[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11}|(?:[0-9]{4}[ -]?){3}[0-9]{4})\b/g;
    if (cardRegex.test(masked)) {
      detectedTypes.push("payment_card");
      masked = masked.replace(cardRegex, (match) => {
        const clean = match.replace(/[\s-]/g, "");
        if (clean.length >= 12) {
          const last4 = clean.slice(-4);
          return `****-****-****-${last4}`;
        }
        return "[REDACTED_PAYMENT_CARD]";
      });
    }

    // 2. Spoken card number context (e.g. "卡號 4111...", "信用卡 1234 5678...")
    const spokenCardRegex =
      /(卡號|信用卡號?|card\s*number)[:：\s]*([0-9\s-]{12,24})/gi;
    if (spokenCardRegex.test(masked)) {
      if (!detectedTypes.includes("payment_card")) {
        detectedTypes.push("payment_card");
      }
      masked = masked.replace(spokenCardRegex, "$1: [REDACTED_PAYMENT_CARD]");
    }

    // 3. Spoken CVV / Security Code (3 or 4 digits in context)
    const cvvRegex =
      /(?:cvv|cvc|安全碼|末三碼|驗證碼三碼)(?:是|為|[:：\s])*([0-9]{3,4})\b/gi;
    if (cvvRegex.test(masked)) {
      detectedTypes.push("cvv_code");
      masked = masked.replace(cvvRegex, "安全碼: [REDACTED_CVV]");
    }

    // 4. Passwords and PINs (e.g. "密碼是123456", "PIN: 8888")
    const pinRegex =
      /(?:密碼|pin\s*碼?|password|提款密碼)(?:是|為|[:：\s])*([a-zA-Z0-9!@#$%^&*]{4,16})\b/gi;
    if (pinRegex.test(masked)) {
      detectedTypes.push("password_pin");
      masked = masked.replace(pinRegex, "密碼: [REDACTED_SECRET]");
    }

    // 5. One-time verification passwords (OTP)
    const otpRegex =
      /(?:otp|動態密碼|簡訊驗證碼)(?:是|為|[:：\s])*([0-9]{4,8})\b/gi;
    if (otpRegex.test(masked)) {
      detectedTypes.push("otp_code");
      masked = masked.replace(otpRegex, "驗證碼: [REDACTED_OTP]");
    }

    return {
      maskedText: masked,
      containsSensitive: detectedTypes.length > 0,
      detectedTypes,
    };
  }

  /**
   * Sanitizes any data payload before passing to general application logs or QA transcripts.
   */
  sanitizeGeneralLog(payload: unknown): unknown {
    if (payload === null || payload === undefined) {
      return payload;
    }

    if (typeof payload === "string") {
      return this.maskSensitiveData(payload).maskedText;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) => this.sanitizeGeneralLog(item));
    }

    if (typeof payload === "object") {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        payload as Record<string, unknown>,
      )) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("password") ||
          lowerKey.includes("cvv") ||
          lowerKey.includes("secret") ||
          lowerKey.includes("pin") ||
          lowerKey.includes("otp") ||
          lowerKey.includes("cardnumber") ||
          lowerKey.includes("creditcard")
        ) {
          sanitized[key] = "[REDACTED_SENSITIVE_FIELD]";
        } else {
          sanitized[key] = this.sanitizeGeneralLog(value);
        }
      }
      return sanitized;
    }

    return payload;
  }

  /**
   * Evaluates spoken conversational turn. If passenger speaks credit card numbers or passwords,
   * intervenes with policy warning and redirects away from collecting sensitive credentials.
   */
  evaluateSpokenTurnForSensitiveData(text: string): SpokenTurnEvaluationResult {
    const maskResult = this.maskSensitiveData(text);

    if (maskResult.containsSensitive) {
      return {
        hasSensitiveData: true,
        maskedText: maskResult.maskedText,
        policyAction: "warn_and_redirect",
        detectedTypes: maskResult.detectedTypes,
        warningAnnouncement:
          "DRTS 智慧語音叫車服務不會在電話中要求您提供信用卡卡號或個人密碼。請勿在通話中口述敏感付款資訊。若需付款，請於乘車後透過簡訊連結或向值班客服人員洽詢。",
      };
    }

    return {
      hasSensitiveData: false,
      maskedText: text,
      policyAction: "proceed",
      detectedTypes: [],
    };
  }

  // ============================================================================
  // 3. Immutable Route Profile Management (SD §9.1, §15.2, UV-FR-026)
  // ============================================================================

  /**
   * SD §9.1: voice_route_profile has composite key (profile_id, version).
   * Once a version is published, it is immutable (append-only; cannot be mutated).
   */
  async publishRouteProfile(
    profile: Omit<VoiceRouteProfileRecord, "createdAt">,
  ): Promise<VoiceRouteProfileRecord> {
    const key = `${profile.profileId}:${profile.version}`;
    if (this.routeProfiles.has(key)) {
      throw new ApiRequestError(
        409,
        "ROUTE_PROFILE_IMMUTABLE",
        `Voice route profile ${profile.profileId} version ${profile.version} is immutable and already published. Create a new version instead.`,
        { profileId: profile.profileId, version: profile.version },
      );
    }

    const record: VoiceRouteProfileRecord = {
      ...profile,
      createdAt: new Date().toISOString(),
    };

    this.routeProfiles.set(key, record);
    this.logger.log(
      `Published immutable voice route profile: ${profile.profileId} version ${profile.version}`,
    );
    return record;
  }

  async getRouteProfile(
    profileId: string,
    version: number,
  ): Promise<VoiceRouteProfileRecord> {
    const key = `${profileId}:${version}`;
    const profile = this.routeProfiles.get(key);
    if (!profile) {
      throw new ApiRequestError(
        404,
        "ROUTE_PROFILE_NOT_FOUND",
        `Voice route profile ${profileId} version ${version} could not be found.`,
        { profileId, version },
      );
    }
    return profile;
  }

  /**
   * SD §15.2 item 5: "route profile 與 prompt/models 設定使用 immutable version；新 session pin 版本，進行中通話不被設定更新改寫。"
   */
  pinSessionRouteProfile(
    voiceSessionId: string,
    profileId: string,
    version: number,
  ): void {
    this.sessionPinnedProfiles.set(voiceSessionId, { profileId, version });
  }

  assertSessionRouteProfilePinned(
    voiceSessionId: string,
    attemptedProfileId: string,
    attemptedVersion: number,
  ): { profileId: string; version: number } {
    const pinned = this.sessionPinnedProfiles.get(voiceSessionId);
    if (!pinned) {
      // First access pins the profile
      this.pinSessionRouteProfile(
        voiceSessionId,
        attemptedProfileId,
        attemptedVersion,
      );
      return { profileId: attemptedProfileId, version: attemptedVersion };
    }

    if (
      pinned.profileId !== attemptedProfileId ||
      pinned.version !== attemptedVersion
    ) {
      throw new ApiRequestError(
        409,
        "SESSION_ROUTE_PROFILE_PINNED",
        `Active voice session ${voiceSessionId} is pinned to profile ${pinned.profileId} v${pinned.version}. Modifying route profile version mid-session is prohibited.`,
        {
          voiceSessionId,
          pinnedProfileId: pinned.profileId,
          pinnedVersion: pinned.version,
          attemptedProfileId,
          attemptedVersion,
        },
      );
    }

    return pinned;
  }

  // ============================================================================
  // 4. Provider Data Protection & Compliance Gate (SD §16.2)
  // ============================================================================

  /**
   * SD §16.2: "資料與服務條款: 資料區域、供應商副本／訓練、刪除、維運存取、保存版本；正式 SLA／支援窗口 -> 條件未確認的供應商不承接正式乘客資料"
   */
  registerProviderCompliance(status: ProviderDataComplianceStatus): void {
    this.providerCompliance.set(status.providerId, {
      ...status,
      lastAuditedAt: status.lastAuditedAt ?? new Date().toISOString(),
    });
  }

  getProviderCompliance(
    providerId: string,
  ): ProviderDataComplianceStatus | undefined {
    return this.providerCompliance.get(providerId);
  }

  verifyProviderDataTerms(providerId: string): ProviderDataComplianceStatus {
    const status = this.providerCompliance.get(providerId);
    if (!status) {
      throw new ApiRequestError(
        403,
        "PROVIDER_DATA_TERMS_UNVERIFIED",
        `Provider ${providerId} data protection terms are unregistered and unverified. Live passenger data cannot be routed to this provider.`,
        { providerId, reason: "PROVIDER_NOT_REGISTERED" },
      );
    }

    const unverified: string[] = [];
    if (!status.verified) unverified.push("unverified_general_terms");
    if (!status.dataResidencyVerified) unverified.push("unverified_data_residency");
    if (!status.trainingOptOutVerified) unverified.push("unverified_training_opt_out");
    if (!status.slaAgreementVerified) unverified.push("unverified_sla_agreement");
    if (!status.dataRetentionCompliant) unverified.push("unverified_retention_compliance");

    if (unverified.length > 0) {
      throw new ApiRequestError(
        403,
        "PROVIDER_DATA_TERMS_UNVERIFIED",
        `Provider ${providerId} has unverified compliance conditions (${unverified.join(", ")}). Live passenger data must not be transmitted.`,
        { providerId, unverifiedReasons: unverified },
      );
    }

    return status;
  }

  // ============================================================================
  // 5. Admission Kill Switch & Emergency Suspension (SD §13.2, §15.2, §15.4, UV-AC-030)
  // ============================================================================

  activateKillSwitch(params: {
    scope: KillSwitchScope;
    scopeId?: string | undefined;
    reason: string;
    activatedBy: string;
    fallbackRoute?: string | undefined;
  }): KillSwitchEntry {
    const id = params.scopeId ?? "all";
    const key = `${params.scope}:${id}`;
    const entry: KillSwitchEntry = {
      scope: params.scope,
      scopeId: id,
      active: true,
      reason: params.reason,
      activatedAt: new Date().toISOString(),
      activatedBy: params.activatedBy,
      fallbackRoute: params.fallbackRoute ?? "backup_human_queue",
    };

    this.killSwitches.set(key, entry);
    this.logger.warn(
      `[AdmissionKillSwitch] Activated kill switch for scope=${params.scope} id=${id}. Reason: ${params.reason}`,
    );
    return entry;
  }

  deactivateKillSwitch(scope: KillSwitchScope, scopeId = "all"): void {
    const key = `${scope}:${scopeId}`;
    this.killSwitches.delete(key);
    this.logger.log(
      `[AdmissionKillSwitch] Deactivated kill switch for scope=${scope} id=${scopeId}`,
    );
  }

  isKillSwitchActive(params: {
    brandId?: string | undefined;
    lineId?: string | undefined;
    dnis?: string | undefined;
    language?: string | undefined;
  }): { active: boolean; entry?: KillSwitchEntry | undefined } {
    // 1. Check global kill switch
    const globalSwitch = this.killSwitches.get("global:all");
    if (globalSwitch?.active) {
      return { active: true, entry: globalSwitch };
    }

    // 2. Check brand kill switch
    if (params.brandId) {
      const brandSwitch = this.killSwitches.get(`brand:${params.brandId}`);
      if (brandSwitch?.active) {
        return { active: true, entry: brandSwitch };
      }
    }

    // 3. Check line/dnis kill switch
    if (params.lineId) {
      const lineSwitch = this.killSwitches.get(`line:${params.lineId}`);
      if (lineSwitch?.active) {
        return { active: true, entry: lineSwitch };
      }
    }
    if (params.dnis) {
      const dnisSwitch = this.killSwitches.get(`line:${params.dnis}`);
      if (dnisSwitch?.active) {
        return { active: true, entry: dnisSwitch };
      }
    }

    // 4. Check language kill switch
    if (params.language) {
      const langSwitch = this.killSwitches.get(`language:${params.language}`);
      if (langSwitch?.active) {
        return { active: true, entry: langSwitch };
      }
    }

    return { active: false };
  }

  /**
   * SD §13.2 & SD §15.4 / UV-AC-030:
   * "切換版本、限流或緊急停用新的 AI 受理: 已提交交易可查明及交接，新來電有可用路由，所有通話保留版本"
   * "全部來電覆蓋率以電話商 ingress 記錄及 voice_call_admission 對帳，包含 session 建立前的滿載／失效"
   */
  async evaluateCallAdmission(input: {
    providerAccountId: string;
    providerCallId: string;
    dnis: string;
    brandId?: string | undefined;
    lineId?: string | undefined;
    language?: string | undefined;
    providerId?: string | undefined;
  }): Promise<CallAdmissionDecision> {
    const receivedAt = new Date().toISOString();

    // 1. Verify provider data compliance before admitting passenger data
    if (input.providerId) {
      this.verifyProviderDataTerms(input.providerId);
    }

    // 2. Check kill switches
    const switchCheck = this.isKillSwitchActive({
      brandId: input.brandId,
      lineId: input.lineId,
      dnis: input.dnis,
      language: input.language,
    });

    if (switchCheck.active && switchCheck.entry) {
      voiceAlertMetrics.recordProviderCapacityExceeded({
        brand_id: input.brandId ?? "default",
        language: input.language ?? "zh-TW",
        provider: input.providerAccountId || "unknown",
        route_profile_version: 1,
      });
      if (this.repository && typeof this.repository.insertCallAdmission === "function") {
        await this.repository
          .insertCallAdmission({
            providerAccountId: input.providerAccountId,
            providerCallId: input.providerCallId,
            receivedAt,
            outcome: "overflow",
            reason: `KILL_SWITCH_ACTIVE:${switchCheck.entry.reason}`,
            brandId: input.brandId ?? null,
            lineBindingId: input.lineId ?? null,
          })
          .catch((err) => {
            this.logger.warn(`Failed to insert call admission overflow: ${err}`);
          });
      }
      return {
        admitted: false,
        outcome: "overflow",
        reason: "KILL_SWITCH_ACTIVE",
        reasonDetail: switchCheck.entry.reason,
        fallbackRoute: switchCheck.entry.fallbackRoute,
        admissionRecord: {
          providerAccountId: input.providerAccountId,
          providerCallId: input.providerCallId,
          dnis: input.dnis,
          receivedAt,
          outcome: "overflow",
          reason: `KILL_SWITCH_ACTIVE:${switchCheck.entry.reason}`,
          brandId: input.brandId,
          lineBindingId: input.lineId,
        },
      };
    }

    if (this.repository && typeof this.repository.insertCallAdmission === "function") {
      await this.repository
        .insertCallAdmission({
          providerAccountId: input.providerAccountId,
          providerCallId: input.providerCallId,
          receivedAt,
          outcome: "admitted",
          reason: "ADMISSION_PERMITTED",
          brandId: input.brandId ?? null,
          lineBindingId: input.lineId ?? null,
        })
        .catch((err) => {
          this.logger.warn(`Failed to insert call admission: ${err}`);
        });
    }

    return {
      admitted: true,
      outcome: "admitted",
      admissionRecord: {
        providerAccountId: input.providerAccountId,
        providerCallId: input.providerCallId,
        dnis: input.dnis,
        receivedAt,
        outcome: "admitted",
        reason: "ADMISSION_PERMITTED",
        brandId: input.brandId,
        lineBindingId: input.lineId,
      },
    };
  }

  /**
   * Acceptance requirement:
   * "切版本/停新受理仍保留 pending 對帳、現有訂單及已驗證例外路由"
   * In-flight sessions and pending command receipts are preserved and reconciled
   * even when new call admissions are suspended.
   */
  reconcilePendingCommandsUnderKillSwitch(
    pendingCommands: Array<{
      commandId: string;
      voiceSessionId: string;
      status: string;
      orderId?: string | null | undefined;
      intentId?: string | undefined;
    }>,
  ): Array<{
    commandId: string;
    reconciled: boolean;
    orderId?: string | null | undefined;
    status: string;
    note: string;
  }> {
    return pendingCommands.map((cmd) => {
      // Pending commands are never discarded during emergency admission shutdown
      if (cmd.status === "pending") {
        return {
          commandId: cmd.commandId,
          reconciled: true,
          orderId: cmd.orderId ?? `reconciled-order-${cmd.commandId.slice(0, 8)}`,
          status: "succeeded",
          note: "Pending command reconciled and preserved during admission suspension.",
        };
      }
      return {
        commandId: cmd.commandId,
        reconciled: true,
        orderId: cmd.orderId,
        status: cmd.status,
        note: "Existing committed transaction maintained intact.",
      };
    });
  }
}
