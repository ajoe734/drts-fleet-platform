import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { ApiRequestError } from "../../common/api-envelope";
import { VoiceBookingRepository } from "./voice-booking.repository";

export type VoiceUsageServiceType =
  | "telephony"
  | "asr"
  | "llm"
  | "tts"
  | "orchestration"
  | "storage"
  | "notification"
  | "human_operator";

export type BillingUnit =
  | "second"
  | "minute"
  | "character"
  | "token"
  | "call"
  | "hour"
  | "megabyte";

export type RoundingRule =
  | "ceil_minute"
  | "exact_second"
  | "ceil_6s"
  | "ceil_token"
  | "none";

export interface RateCardCondition {
  silenceRatePerMinute?: number;
  dualChannelMultiplier?: number;
  transferLegRatePerMinute?: number;
  tierDiscounts?: Array<{
    minQuantity: number;
    maxQuantity?: number;
    discountRate: number;
  }>;
  exchangeRateDate?: string;
  exchangeRateToTwd?: number;
  unverifiedFields?: Record<string, boolean>;
  offlineAsrRatePerMinute?: number;
  [key: string]: unknown;
}

export interface VoiceRateCardRecord {
  rateCardId: string;
  version: number;
  provider: string;
  serviceType: VoiceUsageServiceType;
  currency: string;
  taxInclusive: boolean;
  unitPrice: number;
  billingUnit: BillingUnit;
  effectiveFrom: string;
  effectiveUntil?: string | undefined;
  roundingRule: RoundingRule;
  minimumCharge?: number | undefined;
  conditions?: RateCardCondition | undefined;
  unverified: boolean;
  unverifiedReasons?: string[] | undefined;
  reconciliationStatus: "draft" | "published" | "reconciled";
  createdAt: string;
}

export interface PublishRateCardInput {
  rateCardId?: string | undefined;
  provider: string;
  serviceType: VoiceUsageServiceType;
  currency?: string | undefined;
  taxInclusive?: boolean | undefined;
  unitPrice: number;
  billingUnit: BillingUnit;
  effectiveFrom?: string | undefined;
  effectiveUntil?: string | undefined;
  roundingRule?: RoundingRule | undefined;
  minimumCharge?: number | undefined;
  conditions?: RateCardCondition | undefined;
  unverified?: boolean | undefined;
  unverifiedReasons?: string[] | undefined;
}

export interface VoiceUsageRecordInput {
  usageId?: string | undefined;
  providerAccountId: string;
  providerUsageRef?: string | undefined;
  admissionId?: string | undefined;
  voiceSessionId?: string | undefined;
  legId?: string | undefined;
  brandId?: string | undefined;
  language?: string | undefined;
  provider: string;
  serviceType: VoiceUsageServiceType;
  model?: string | undefined;
  modelVersion?: string | undefined;
  billingUnit: BillingUnit;
  quantity: number;
  currency?: string | undefined;
  rateCardId?: string | undefined;
  rateCardVersion?: number | undefined;
  estimatedCost?: number | undefined;
  actualCost?: number | undefined;
  invoiceRef?: string | undefined;
  reconciliationStatus?: "estimated" | "invoiced" | "reconciled" | "disputed" | undefined;
  reconciliationAdjustment?: number | undefined;
  usageDate?: string | undefined;
  unverified?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface VoiceUsageRecord {
  usageId: string;
  providerAccountId: string;
  providerUsageRef?: string | undefined;
  admissionId?: string | undefined;
  voiceSessionId?: string | undefined;
  legId?: string | undefined;
  brandId?: string | undefined;
  language?: string | undefined;
  provider: string;
  serviceType: VoiceUsageServiceType;
  model?: string | undefined;
  modelVersion?: string | undefined;
  billingUnit: BillingUnit;
  quantity: number;
  currency: string;
  rateCardId?: string | undefined;
  rateCardVersion?: number | undefined;
  estimatedCost: number;
  actualCost?: number | undefined;
  invoiceRef?: string | undefined;
  reconciliationStatus: "estimated" | "invoiced" | "reconciled" | "disputed";
  reconciliationAdjustment?: number | undefined;
  usageDate: string;
  unverified: boolean;
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
}

export interface FullCallCostInput {
  voiceSessionId?: string | undefined;
  callId?: string | undefined;
  providerCallId?: string | undefined;
  admissionId?: string | undefined;
  brandId?: string | undefined;
  language?: string | undefined;
  outcome?: string | undefined;
  durationSeconds?: number | undefined;
  telephonyLegCount?: number | undefined;
  asrSeconds?: number | undefined;
  ttsCharacters?: number | undefined;
  llmInputTokens?: number | undefined;
  llmOutputTokens?: number | undefined;
  storageMegabytes?: number | undefined;
  notificationCount?: number | undefined;
  humanOperatorSeconds?: number | undefined;
  provider?: string | undefined;
  isAdmissionFailure?: boolean | undefined;
  isNoCarOrDrop?: boolean | undefined;
}

export interface CostItem {
  serviceType: VoiceUsageServiceType;
  provider: string;
  model?: string | undefined;
  quantity: number;
  billingUnit: BillingUnit;
  unitPrice: number;
  currency: string;
  cost: number;
  unverified: boolean;
}

export interface FullCallCostBreakdown {
  voiceSessionId?: string | undefined;
  callId?: string | undefined;
  providerCallId?: string | undefined;
  admissionId?: string | undefined;
  brandId?: string | undefined;
  language?: string | undefined;
  outcome?: string | undefined;
  items: CostItem[];
  totalEstimatedCost: number;
  currency: string;
  hasUnverifiedCosts: boolean;
  isFailedCallOrAdmission: boolean;
}

export interface ProviderInvoiceLineItem {
  providerAccountId: string;
  providerUsageRef?: string | undefined;
  serviceType: VoiceUsageServiceType;
  quantity: number;
  billingUnit: BillingUnit;
  billedCost: number;
  currency: string;
  invoiceRef: string;
  invoiceDate: string;
}

export interface InvoiceReconciliationAdjustment {
  usageId: string;
  providerUsageRef?: string | undefined;
  serviceType: VoiceUsageServiceType;
  estimatedCost: number;
  actualCost: number;
  variance: number;
  note: string;
}

export interface InvoiceReconciliationReport {
  invoiceRef: string;
  providerAccountId: string;
  matchedCount: number;
  unmatchedInvoiceLines: number;
  unmatchedUsageRecords: number;
  totalEstimatedCost: number;
  totalBilledCost: number;
  netVariance: number;
  unverifiedCostIncluded: number;
  status: "reconciled" | "variance_flagged" | "disputed";
  adjustments: InvoiceReconciliationAdjustment[];
}

/**
 * SD §14.3 Voice Usage & Cost Ledger Service
 *
 * Implements:
 * 1. Append-only, versioned Rate Cards (retains currency, tax_inclusive, granularity, validity, and unverified flags).
 * 2. Raw metering & usage record persistence with provider dedup (uq_voice_usage_record_provider_ref).
 * 3. PII sanitization: strictly blocks transcripts / customer dialogue in billing rows.
 * 4. Multi-leg, full-call cost calculation:
 *    telephony + ASR + LLM + TTS + orchestration + storage + notification + human operator time.
 *    Admission failures, no car, hangups, transfers, vendor failures MUST enter cost ledger.
 * 5. Invoice reconciliation: compares invoices with estimated ledger, records adjustments and variances
 *    WITHOUT overwriting estimated cost records ("估計不覆蓋帳單").
 */
@Injectable()
export class VoiceUsageService {
  private readonly logger = new Logger(VoiceUsageService.name);

  // In-memory published rate card catalog: key = `${rateCardId}#${version}`
  private readonly rateCards = new Map<string, VoiceRateCardRecord>();
  // Latest version index: key = rateCardId, value = latestVersion
  private readonly rateCardLatestVersion = new Map<string, number>();

  // In-memory usage records: key = usageId
  private readonly usageRecords = new Map<string, VoiceUsageRecord>();
  // Provider dedup index: key = `${providerAccountId}#${providerUsageRef}` -> usageId
  private readonly providerRefIndex = new Map<string, string>();

  constructor(
    @Optional()
    private readonly voiceRepo?: VoiceBookingRepository,
  ) {
    this.seedDefaultRateCards();
  }

  /**
   * Seed standard rates from SA §12.1 and SD §14.3:
   * TWM Realtime ASR: 0.74 TWD / min (tax inclusive quote from user)
   * TWM Offline ASR: 0.19 TWD / min
   * TWM TTS: 625 TWD / 1,000,000 chars
   * Telephony CTI trunk: 0.60 TWD / min
   * Standard LLM: 0.00015 TWD / token
   * Storage: 0.05 TWD / MB-month
   * Human Operator time: 300 TWD / hour (5 TWD / min)
   */
  private seedDefaultRateCards(): void {
    // TWM ASR (Realtime)
    this.publishRateCard({
      rateCardId: "rc-twm-asr-realtime-default",
      provider: "twm",
      serviceType: "asr",
      currency: "TWD",
      taxInclusive: true,
      unitPrice: 0.74,
      billingUnit: "minute",
      roundingRule: "ceil_minute",
      unverified: false,
      conditions: {
        offlineAsrRatePerMinute: 0.19,
        silenceRatePerMinute: 0.74, // Note: per SA §12.1 silence billing is not yet confirmed by vendor
        unverifiedFields: { silenceBillingUnverified: true },
      },
    });

    // TWM TTS
    this.publishRateCard({
      rateCardId: "rc-twm-tts-default",
      provider: "twm",
      serviceType: "tts",
      currency: "TWD",
      taxInclusive: true,
      unitPrice: 625 / 1_000_000, // 0.000625 TWD per character
      billingUnit: "character",
      roundingRule: "none",
      unverified: false,
    });

    // Telephony Ingress Leg
    this.publishRateCard({
      rateCardId: "rc-cti-telephony-default",
      provider: "twm-telephony",
      serviceType: "telephony",
      currency: "TWD",
      taxInclusive: true,
      unitPrice: 0.60,
      billingUnit: "minute",
      roundingRule: "ceil_minute",
      unverified: false,
      conditions: {
        transferLegRatePerMinute: 0.60,
      },
    });

    // LLM Dialogue Engine
    this.publishRateCard({
      rateCardId: "rc-llm-dialogue-default",
      provider: "gemini",
      serviceType: "llm",
      currency: "TWD",
      taxInclusive: false,
      unitPrice: 0.00015, // approx 0.15 TWD per 1k tokens
      billingUnit: "token",
      roundingRule: "ceil_token",
      unverified: false,
    });

    // Storage / Audio Evidence
    this.publishRateCard({
      rateCardId: "rc-storage-default",
      provider: "gcp-cloud-storage",
      serviceType: "storage",
      currency: "TWD",
      taxInclusive: false,
      unitPrice: 0.05,
      billingUnit: "megabyte",
      roundingRule: "none",
      unverified: false,
    });

    // Human Operator / Callback Time Allocation
    this.publishRateCard({
      rateCardId: "rc-human-operator-default",
      provider: "drts-internal-ops",
      serviceType: "human_operator",
      currency: "TWD",
      taxInclusive: true,
      unitPrice: 300 / 3600, // ~0.0833 TWD / second (300 TWD/hour)
      billingUnit: "second",
      roundingRule: "exact_second",
      unverified: false,
    });
  }

  // ============================================================================
  // Rate Card Management (Append-only versioning per SD §14.3 / V0086)
  // ============================================================================

  /**
   * Publish a rate card version.
   * If rateCardId already exists, increments the version number.
   * Rate cards are strictly append-only; an existing version cannot be mutated.
   */
  public publishRateCard(input: PublishRateCardInput): VoiceRateCardRecord {
    const rateCardId = input.rateCardId ?? randomUUID();
    const currentLatest = this.rateCardLatestVersion.get(rateCardId) ?? 0;
    const nextVersion = currentLatest + 1;

    // SA §12.1 / SD §14.3: Unverified fields check
    // "未知欄位標 unverified，不能默認為免費"
    const isUnverified = input.unverified ?? false;
    if (isUnverified && input.unitPrice === 0) {
      throw new ApiRequestError(
        400,
        "UNVERIFIED_PRICE_CANNOT_BE_FREE",
        "Unverified rate card fields cannot default to zero or free cost (SD §14.3).",
      );
    }

    const record: VoiceRateCardRecord = {
      rateCardId,
      version: nextVersion,
      provider: input.provider,
      serviceType: input.serviceType,
      currency: input.currency ?? "TWD",
      taxInclusive: input.taxInclusive ?? false,
      unitPrice: input.unitPrice,
      billingUnit: input.billingUnit,
      effectiveFrom: input.effectiveFrom ?? new Date().toISOString(),
      effectiveUntil: input.effectiveUntil,
      roundingRule: input.roundingRule ?? "none",
      minimumCharge: input.minimumCharge,
      conditions: input.conditions,
      unverified: isUnverified,
      unverifiedReasons: input.unverifiedReasons,
      reconciliationStatus: "published",
      createdAt: new Date().toISOString(),
    };

    const key = `${rateCardId}#${nextVersion}`;
    this.rateCards.set(key, record);
    this.rateCardLatestVersion.set(rateCardId, nextVersion);

    this.logger.log(
      `[RateCard] Published rate card ${rateCardId} v${nextVersion} (${record.provider}/${record.serviceType}) @ ${record.unitPrice} ${record.currency}/${record.billingUnit}`,
    );

    return record;
  }

  public getRateCard(
    rateCardId: string,
    version?: number,
  ): VoiceRateCardRecord | null {
    if (version !== undefined) {
      return this.rateCards.get(`${rateCardId}#${version}`) ?? null;
    }
    const latestVersion = this.rateCardLatestVersion.get(rateCardId);
    if (!latestVersion) return null;
    return this.rateCards.get(`${rateCardId}#${latestVersion}`) ?? null;
  }

  public findRateCardForService(
    provider: string,
    serviceType: VoiceUsageServiceType,
  ): VoiceRateCardRecord | null {
    let latestCard: VoiceRateCardRecord | null = null;
    for (const card of this.rateCards.values()) {
      if (
        card.provider.toLowerCase() === provider.toLowerCase() &&
        card.serviceType === serviceType &&
        card.reconciliationStatus === "published"
      ) {
        if (!latestCard || card.version > latestCard.version) {
          latestCard = card;
        }
      }
    }
    return latestCard;
  }

  public listRateCards(): VoiceRateCardRecord[] {
    return Array.from(this.rateCards.values());
  }

  // ============================================================================
  // Usage Recording & PII Sanitization (SD §14.3: 敏感逐字稿不放帳務 row)
  // ============================================================================

  /**
   * Record raw usage entry with provider dedup & PII sanitization.
   *
   * Dedup rule: If providerUsageRef is supplied, checks for duplicate
   * (providerAccountId, providerUsageRef). Retried callbacks return existing record.
   */
  public recordUsage(input: VoiceUsageRecordInput): VoiceUsageRecord {
    // 1. PII Sanitization (SD §14.3: "敏感逐字稿不放帳務 row")
    const sanitizedMetadata = this.sanitizeBillingMetadata(input.metadata);

    // 2. Dedup against provider's line ref
    if (input.providerUsageRef) {
      const dedupKey = `${input.providerAccountId}#${input.providerUsageRef}`;
      const existingId = this.providerRefIndex.get(dedupKey);
      if (existingId) {
        const existing = this.usageRecords.get(existingId);
        if (existing) {
          this.logger.debug(
            `[UsageRecord] Dedup hit for provider ref ${input.providerUsageRef}; returning existing record ${existingId}`,
          );
          return existing;
        }
      }
    }

    // 3. Resolve rate card & compute estimated cost if not specified
    let estimatedCost = input.estimatedCost;
    let rateCard =
      input.rateCardId && input.rateCardVersion
        ? this.getRateCard(input.rateCardId, input.rateCardVersion)
        : null;

    if (!rateCard) {
      rateCard = this.findRateCardForService(input.provider, input.serviceType);
    }

    if (estimatedCost === undefined) {
      if (rateCard) {
        estimatedCost = this.computeEstimatedCostFromRateCard(
          rateCard,
          input.quantity,
        );
      } else {
        estimatedCost = 0;
      }
    }

    const usageId = input.usageId ?? randomUUID();
    const isUnverified =
      input.unverified ?? (rateCard ? rateCard.unverified : false);

    const record: VoiceUsageRecord = {
      usageId,
      providerAccountId: input.providerAccountId,
      providerUsageRef: input.providerUsageRef,
      admissionId: input.admissionId,
      voiceSessionId: input.voiceSessionId,
      legId: input.legId,
      brandId: input.brandId,
      language: input.language,
      provider: input.provider,
      serviceType: input.serviceType,
      model: input.model,
      modelVersion: input.modelVersion,
      billingUnit: input.billingUnit,
      quantity: input.quantity,
      currency: input.currency ?? (rateCard ? rateCard.currency : "TWD"),
      rateCardId: rateCard?.rateCardId,
      rateCardVersion: rateCard?.version,
      estimatedCost,
      actualCost: input.actualCost,
      invoiceRef: input.invoiceRef,
      reconciliationStatus:
        input.reconciliationStatus ??
        (input.actualCost !== undefined ? "invoiced" : "estimated"),
      reconciliationAdjustment: input.reconciliationAdjustment,
      usageDate: input.usageDate ?? new Date().toISOString().slice(0, 10),
      unverified: isUnverified,
      metadata: sanitizedMetadata,
      createdAt: new Date().toISOString(),
    };

    this.usageRecords.set(usageId, record);
    if (record.providerUsageRef) {
      const dedupKey = `${record.providerAccountId}#${record.providerUsageRef}`;
      this.providerRefIndex.set(dedupKey, usageId);
    }

    return record;
  }

  public getUsageRecord(usageId: string): VoiceUsageRecord | null {
    return this.usageRecords.get(usageId) ?? null;
  }

  public listUsageRecords(filter?: {
    voiceSessionId?: string;
    admissionId?: string;
    brandId?: string;
    provider?: string;
    serviceType?: VoiceUsageServiceType;
    usageDate?: string;
  }): VoiceUsageRecord[] {
    let list = Array.from(this.usageRecords.values());
    if (filter) {
      if (filter.voiceSessionId) {
        list = list.filter((r) => r.voiceSessionId === filter.voiceSessionId);
      }
      if (filter.admissionId) {
        list = list.filter((r) => r.admissionId === filter.admissionId);
      }
      if (filter.brandId) {
        list = list.filter((r) => r.brandId === filter.brandId);
      }
      if (filter.provider) {
        list = list.filter(
          (r) => r.provider.toLowerCase() === filter.provider?.toLowerCase(),
        );
      }
      if (filter.serviceType) {
        list = list.filter((r) => r.serviceType === filter.serviceType);
      }
      if (filter.usageDate) {
        list = list.filter((r) => r.usageDate === filter.usageDate);
      }
    }
    return list;
  }

  /**
   * Strictly sanitize metadata before storing in billing ledger.
   * Strips all transcript, audio text, customer utterance, and PII.
   */
  private sanitizeBillingMetadata(
    metadata?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    const sanitized: Record<string, unknown> = {};
    const prohibitedSubstrings = [
      "transcript",
      "utterance",
      "dialogue",
      "speechtext",
      "prompttext",
      "callertext",
      "asrtext",
      "cardnumber",
      "cvv",
      "password",
    ];

    for (const [k, v] of Object.entries(metadata)) {
      const lower = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      const isProhibited = prohibitedSubstrings.some((p) => lower.includes(p));
      if (!isProhibited) {
        sanitized[k] = v;
      } else {
        this.logger.warn(
          `[UsageSanitize] Prohibited key "${k}" removed from billing record metadata (SD §14.3)`,
        );
      }
    }
    return sanitized;
  }

  // ============================================================================
  // Per-Call Cost Formula (SD §14.3)
  // 電話與多 leg + ASR + LLM/原生語音 + TTS + 編排平台 + 計算/錄音儲存 + 通知 + 分攤真人例外工時
  // ============================================================================

  /**
   * Calculate full multi-component cost for a voice call.
   * All failure modes (admission failures, no car, hangups, transfers, vendor failures)
   * must be included and accounted for.
   */
  public calculateCallCost(input: FullCallCostInput): FullCallCostBreakdown {
    const items: CostItem[] = [];
    let totalCost = 0;
    let hasUnverified = false;

    // 1. Telephony legs
    const telephonySeconds = input.durationSeconds ?? 0;
    if (telephonySeconds > 0) {
      const ctiCard = this.findRateCardForService("twm-telephony", "telephony");
      const billedMinutes = Math.ceil(telephonySeconds / 60);
      const legCount = Math.max(1, input.telephonyLegCount ?? 1);
      const unitPrice = ctiCard?.unitPrice ?? 0.60;
      const legCost = billedMinutes * unitPrice * legCount;
      items.push({
        serviceType: "telephony",
        provider: ctiCard?.provider ?? "twm-telephony",
        quantity: billedMinutes * legCount,
        billingUnit: "minute",
        unitPrice,
        currency: ctiCard?.currency ?? "TWD",
        cost: Number(legCost.toFixed(6)),
        unverified: ctiCard?.unverified ?? false,
      });
      totalCost += legCost;
      if (ctiCard?.unverified) hasUnverified = true;
    }

    // 2. ASR (Realtime ASR)
    const asrSecs = input.asrSeconds ?? 0;
    if (asrSecs > 0) {
      const asrCard = this.findRateCardForService(
        input.provider ?? "twm",
        "asr",
      );
      const asrMinutes = Math.ceil(asrSecs / 60);
      const unitPrice = asrCard?.unitPrice ?? 0.74;
      const asrCost = asrMinutes * unitPrice;
      items.push({
        serviceType: "asr",
        provider: asrCard?.provider ?? (input.provider ?? "twm"),
        quantity: asrMinutes,
        billingUnit: "minute",
        unitPrice,
        currency: asrCard?.currency ?? "TWD",
        cost: Number(asrCost.toFixed(6)),
        unverified: asrCard?.unverified ?? false,
      });
      totalCost += asrCost;
      if (asrCard?.unverified) hasUnverified = true;
    }

    // 3. TTS
    const ttsChars = input.ttsCharacters ?? 0;
    if (ttsChars > 0) {
      const ttsCard = this.findRateCardForService(
        input.provider ?? "twm",
        "tts",
      );
      const unitPrice = ttsCard?.unitPrice ?? 625 / 1_000_000;
      const ttsCost = ttsChars * unitPrice;
      items.push({
        serviceType: "tts",
        provider: ttsCard?.provider ?? (input.provider ?? "twm"),
        quantity: ttsChars,
        billingUnit: "character",
        unitPrice,
        currency: ttsCard?.currency ?? "TWD",
        cost: Number(ttsCost.toFixed(6)),
        unverified: ttsCard?.unverified ?? false,
      });
      totalCost += ttsCost;
      if (ttsCard?.unverified) hasUnverified = true;
    }

    // 4. LLM
    const totalTokens =
      (input.llmInputTokens ?? 0) + (input.llmOutputTokens ?? 0);
    if (totalTokens > 0) {
      const llmCard = this.findRateCardForService("gemini", "llm");
      const unitPrice = llmCard?.unitPrice ?? 0.00015;
      const llmCost = totalTokens * unitPrice;
      items.push({
        serviceType: "llm",
        provider: llmCard?.provider ?? "gemini",
        quantity: totalTokens,
        billingUnit: "token",
        unitPrice,
        currency: llmCard?.currency ?? "TWD",
        cost: Number(llmCost.toFixed(6)),
        unverified: llmCard?.unverified ?? false,
      });
      totalCost += llmCost;
      if (llmCard?.unverified) hasUnverified = true;
    }

    // 5. Storage
    const storageMb = input.storageMegabytes ?? 0;
    if (storageMb > 0) {
      const storageCard = this.findRateCardForService(
        "gcp-cloud-storage",
        "storage",
      );
      const unitPrice = storageCard?.unitPrice ?? 0.05;
      const storageCost = storageMb * unitPrice;
      items.push({
        serviceType: "storage",
        provider: storageCard?.provider ?? "gcp-cloud-storage",
        quantity: storageMb,
        billingUnit: "megabyte",
        unitPrice,
        currency: storageCard?.currency ?? "TWD",
        cost: Number(storageCost.toFixed(6)),
        unverified: storageCard?.unverified ?? false,
      });
      totalCost += storageCost;
      if (storageCard?.unverified) hasUnverified = true;
    }

    // 6. Human operator time allocation (for transfers / callback handling)
    const operatorSecs = input.humanOperatorSeconds ?? 0;
    if (operatorSecs > 0) {
      const opCard = this.findRateCardForService(
        "drts-internal-ops",
        "human_operator",
      );
      const unitPrice = opCard?.unitPrice ?? 300 / 3600;
      const opCost = operatorSecs * unitPrice;
      items.push({
        serviceType: "human_operator",
        provider: opCard?.provider ?? "drts-internal-ops",
        quantity: operatorSecs,
        billingUnit: "second",
        unitPrice,
        currency: opCard?.currency ?? "TWD",
        cost: Number(opCost.toFixed(6)),
        unverified: opCard?.unverified ?? false,
      });
      totalCost += opCost;
      if (opCard?.unverified) hasUnverified = true;
    }

    // 7. Notification (SMS)
    const notifCount = input.notificationCount ?? 0;
    if (notifCount > 0) {
      const notifCost = notifCount * 0.8; // 0.8 TWD / SMS
      items.push({
        serviceType: "notification",
        provider: "twm-sms",
        quantity: notifCount,
        billingUnit: "call",
        unitPrice: 0.8,
        currency: "TWD",
        cost: Number(notifCost.toFixed(6)),
        unverified: false,
      });
      totalCost += notifCost;
    }

    const isFailed =
      input.isAdmissionFailure === true ||
      input.isNoCarOrDrop === true ||
      input.outcome === "technical_failure" ||
      input.outcome === "overflow" ||
      input.outcome === "auto_no_service";

    return {
      voiceSessionId: input.voiceSessionId,
      callId: input.callId,
      providerCallId: input.providerCallId,
      admissionId: input.admissionId,
      brandId: input.brandId,
      language: input.language,
      outcome: input.outcome,
      items,
      totalEstimatedCost: Number(totalCost.toFixed(6)),
      currency: "TWD",
      hasUnverifiedCosts: hasUnverified,
      isFailedCallOrAdmission: isFailed,
    };
  }

  // ============================================================================
  // Invoice Reconciliation (SD §14.3: 估計不覆蓋帳單，差異保留可追溯調整)
  // ============================================================================

  /**
   * Reconcile a provider invoice batch against existing estimated usage records.
   *
   * Crucial invariants:
   * 1. `estimatedCost` is NEVER overwritten!
   * 2. `actualCost` is set from invoice line item.
   * 3. `reconciliationAdjustment` = actualCost - estimatedCost.
   * 4. Retains audit trace of net variance and unverified cost items.
   */
  public reconcileInvoice(
    invoiceRef: string,
    providerAccountId: string,
    invoiceLines: ProviderInvoiceLineItem[],
  ): InvoiceReconciliationReport {
    let matchedCount = 0;
    let unmatchedLines = 0;
    let totalEstimated = 0;
    let totalBilled = 0;
    let unverifiedCost = 0;
    const adjustments: InvoiceReconciliationAdjustment[] = [];

    for (const line of invoiceLines) {
      totalBilled += line.billedCost;

      // Find matching usage record
      let matchedRecord: VoiceUsageRecord | undefined;
      if (line.providerUsageRef) {
        const key = `${providerAccountId}#${line.providerUsageRef}`;
        const usageId = this.providerRefIndex.get(key);
        if (usageId) {
          matchedRecord = this.usageRecords.get(usageId);
        }
      }

      if (matchedRecord) {
        matchedCount++;
        totalEstimated += matchedRecord.estimatedCost;
        const variance = line.billedCost - matchedRecord.estimatedCost;

        if (matchedRecord.unverified) {
          unverifiedCost += line.billedCost;
        }

        // Update record with actual invoice details WITHOUT overwriting estimatedCost!
        matchedRecord.actualCost = line.billedCost;
        matchedRecord.invoiceRef = invoiceRef;
        matchedRecord.reconciliationStatus = "reconciled";
        matchedRecord.reconciliationAdjustment = Number(variance.toFixed(6));

        adjustments.push({
          usageId: matchedRecord.usageId,
          providerUsageRef: matchedRecord.providerUsageRef,
          serviceType: matchedRecord.serviceType,
          estimatedCost: matchedRecord.estimatedCost,
          actualCost: line.billedCost,
          variance: Number(variance.toFixed(6)),
          note:
            variance === 0
              ? "Exact match"
              : variance > 0
                ? `Actual billed exceeds estimate by ${variance.toFixed(4)} ${line.currency}`
                : `Actual billed lower than estimate by ${Math.abs(variance).toFixed(4)} ${line.currency}`,
        });
      } else {
        unmatchedLines++;
        // Create an un-estimated invoiced row to ensure ledger completeness
        const usageId = randomUUID();
        const unverified = true;
        unverifiedCost += line.billedCost;

        const newRecord: VoiceUsageRecord = {
          usageId,
          providerAccountId,
          providerUsageRef: line.providerUsageRef,
          provider: line.serviceType,
          serviceType: line.serviceType,
          billingUnit: line.billingUnit,
          quantity: line.quantity,
          currency: line.currency,
          estimatedCost: 0, // Un-estimated inbound invoice line
          actualCost: line.billedCost,
          invoiceRef,
          reconciliationStatus: "invoiced",
          reconciliationAdjustment: line.billedCost,
          usageDate: line.invoiceDate.slice(0, 10),
          unverified,
          createdAt: new Date().toISOString(),
        };

        this.usageRecords.set(usageId, newRecord);
        if (line.providerUsageRef) {
          this.providerRefIndex.set(
            `${providerAccountId}#${line.providerUsageRef}`,
            usageId,
          );
        }

        adjustments.push({
          usageId,
          providerUsageRef: line.providerUsageRef,
          serviceType: line.serviceType,
          estimatedCost: 0,
          actualCost: line.billedCost,
          variance: line.billedCost,
          note: "Unmatched invoice line item added to ledger without prior estimate",
        });
      }
    }

    const netVariance = Number((totalBilled - totalEstimated).toFixed(6));
    const status =
      Math.abs(netVariance) > 0.001 ? "variance_flagged" : "reconciled";

    return {
      invoiceRef,
      providerAccountId,
      matchedCount,
      unmatchedInvoiceLines: unmatchedLines,
      unmatchedUsageRecords: 0,
      totalEstimatedCost: Number(totalEstimated.toFixed(6)),
      totalBilledCost: Number(totalBilled.toFixed(6)),
      netVariance,
      unverifiedCostIncluded: Number(unverifiedCost.toFixed(6)),
      status,
      adjustments,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private computeEstimatedCostFromRateCard(
    card: VoiceRateCardRecord,
    quantity: number,
  ): number {
    let effectiveQty = quantity;

    // Apply rounding rule
    if (card.roundingRule === "ceil_minute") {
      effectiveQty = Math.ceil(effectiveQty / 60);
    } else if (card.roundingRule === "ceil_6s") {
      effectiveQty = Math.ceil(effectiveQty / 6) * 6;
    } else if (card.roundingRule === "ceil_token") {
      effectiveQty = Math.ceil(effectiveQty);
    }

    let cost = effectiveQty * card.unitPrice;

    // Apply minimum charge if present
    if (card.minimumCharge !== undefined && cost < card.minimumCharge) {
      cost = card.minimumCharge;
    }

    return Number(cost.toFixed(6));
  }
}
