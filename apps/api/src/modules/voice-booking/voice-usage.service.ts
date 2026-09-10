import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";

import { ApiRequestError } from "../../common/api-envelope";
import { VoiceBookingRepository } from "./voice-booking.repository";

export const DEFAULT_RATE_CARD_IDS = {
  TWM_ASR_REALTIME: "e4a50001-0000-4000-8000-000000000001",
  TWM_TTS: "e4a50001-0000-4000-8000-000000000002",
  CTI_TELEPHONY: "e4a50001-0000-4000-8000-000000000003",
  LLM_DIALOGUE: "e4a50001-0000-4000-8000-000000000004",
  STORAGE: "e4a50001-0000-4000-8000-000000000005",
  HUMAN_OPERATOR: "e4a50001-0000-4000-8000-000000000006",
} as const;

export function ensureUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) {
    return id;
  }
  const hash = createHash("sha256").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

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
  unverifiedReasons?: string[] | undefined;
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
  unverifiedReasons?: string[] | undefined;
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
  llmProvider?: string | undefined;
  usageTimestamp?: string | Date | undefined;
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
  totalEstimatedCostInBaseCurrency?: number | undefined;
  baseCurrency?: string | undefined;
  currency: string;
  currencyTotals?: Record<string, number> | undefined;
  hasMixedCurrencies?: boolean | undefined;
  hasUnverifiedCosts: boolean;
  unverified?: boolean | undefined;
  unverifiedReasons?: string[] | undefined;
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
export class VoiceUsageService implements OnModuleInit {
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

  private isRepoEnabled(): boolean {
    if (!this.voiceRepo) return false;
    return typeof this.voiceRepo.isEnabled === "function"
      ? this.voiceRepo.isEnabled()
      : true;
  }

  async onModuleInit(): Promise<void> {
    await this.hydrateFromRepository();
  }

  public async hydrateFromRepository(): Promise<void> {
    if (!this.isRepoEnabled() || !this.voiceRepo) {
      return;
    }
    try {
      const persistedCards = await this.voiceRepo.listRateCards();
      for (const card of persistedCards) {
        const cond = (card.conditions as RateCardCondition) ?? {};
        const serviceType = (cond.serviceType as VoiceUsageServiceType) ?? "asr";
        const record: VoiceRateCardRecord = {
          rateCardId: card.rateCardId,
          version: card.version,
          provider: card.provider,
          serviceType,
          currency: card.currency,
          taxInclusive: card.taxInclusive,
          unitPrice: card.unitPrice,
          billingUnit: card.billingUnit as BillingUnit,
          effectiveFrom: card.effectiveFrom,
          effectiveUntil: card.effectiveUntil ?? undefined,
          roundingRule: (card.roundingRule as RoundingRule) ?? "none",
          minimumCharge: card.minimumCharge ?? undefined,
          conditions: cond,
          unverified: Boolean(cond.unverified),
          unverifiedReasons: cond.unverifiedReasons as string[] | undefined,
          reconciliationStatus: (card.reconciliationStatus as "draft" | "published" | "reconciled") ?? "published",
          createdAt: card.createdAt,
        };
        const key = `${record.rateCardId}#${record.version}`;
        this.rateCards.set(key, record);
        const curLatest = this.rateCardLatestVersion.get(record.rateCardId) ?? 0;
        if (record.version > curLatest) {
          this.rateCardLatestVersion.set(record.rateCardId, record.version);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to hydrate rate cards from repository: ${err}`);
    }

    try {
      const persistedUsage = await this.voiceRepo.listUsageRecords();
      for (const u of persistedUsage) {
        if (!this.usageRecords.has(u.usageId)) {
          const rec: VoiceUsageRecord = {
            usageId: u.usageId,
            providerAccountId: u.providerAccountId,
            providerUsageRef: u.providerUsageRef ?? undefined,
            admissionId: u.admissionId ?? undefined,
            voiceSessionId: u.voiceSessionId ?? undefined,
            provider: u.provider,
            serviceType: "telephony",
            model: u.model ?? undefined,
            modelVersion: u.modelVersion ?? undefined,
            billingUnit: u.billingUnit as BillingUnit,
            quantity: u.quantity,
            currency: u.currency,
            rateCardId: u.rateCardId ?? undefined,
            rateCardVersion: u.rateCardVersion ?? undefined,
            estimatedCost: u.estimatedCost ?? 0,
            actualCost: u.actualCost ?? undefined,
            invoiceRef: u.invoiceRef ?? undefined,
            reconciliationStatus: (u.actualCost !== null && u.actualCost !== undefined ? "reconciled" : "estimated") as any,
            reconciliationAdjustment:
              u.actualCost !== null && u.actualCost !== undefined && u.estimatedCost !== null && u.estimatedCost !== undefined
                ? Number((u.actualCost - u.estimatedCost).toFixed(6))
                : undefined,
            brandId: u.brandId ?? undefined,
            usageDate: u.usageDate,
            createdAt: u.createdAt,
            unverified: false,
          };
          this.usageRecords.set(rec.usageId, rec);
          if (rec.providerUsageRef) {
            const key = `${rec.providerAccountId}#${rec.providerUsageRef}`;
            this.providerRefIndex.set(key, rec.usageId);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to hydrate usage records from repository: ${err}`);
    }
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
      rateCardId: DEFAULT_RATE_CARD_IDS.TWM_ASR_REALTIME,
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
      rateCardId: DEFAULT_RATE_CARD_IDS.TWM_TTS,
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
      rateCardId: DEFAULT_RATE_CARD_IDS.CTI_TELEPHONY,
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
      rateCardId: DEFAULT_RATE_CARD_IDS.LLM_DIALOGUE,
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
      rateCardId: DEFAULT_RATE_CARD_IDS.STORAGE,
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
      rateCardId: DEFAULT_RATE_CARD_IDS.HUMAN_OPERATOR,
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
    const uuid = ensureUuid(rateCardId);
    if (uuid !== rateCardId) {
      this.rateCards.set(`${uuid}#${nextVersion}`, record);
      this.rateCardLatestVersion.set(uuid, nextVersion);
    }

    if (this.isRepoEnabled() && this.voiceRepo && typeof this.voiceRepo.insertRateCard === "function") {
      try {
        const p = this.voiceRepo.insertRateCard({
          rateCardId: ensureUuid(record.rateCardId),
          version: record.version,
          provider: record.provider,
          currency: record.currency,
          taxInclusive: record.taxInclusive,
          unitPrice: record.unitPrice,
          billingUnit: record.billingUnit,
          effectiveFrom: record.effectiveFrom,
          effectiveUntil: record.effectiveUntil ?? null,
          roundingRule: record.roundingRule ?? null,
          minimumCharge: record.minimumCharge ?? null,
          conditions: {
            ...record.conditions,
            serviceType: record.serviceType,
            unverified: record.unverified,
            unverifiedReasons: record.unverifiedReasons,
          },
          reconciliationStatus: record.reconciliationStatus,
        });
        if (p && typeof (p as Promise<any>).catch === "function") {
          (p as Promise<any>).catch((err) => {
            this.logger.error(`Failed to persist rate card ${rateCardId}#${nextVersion}: ${err}`);
          });
        }
      } catch (err) {
        this.logger.error(`Failed to call insertRateCard: ${err}`);
      }
    }

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
      const found = this.rateCards.get(`${rateCardId}#${version}`);
      if (found) return found;
      const uuid = ensureUuid(rateCardId);
      return this.rateCards.get(`${uuid}#${version}`) ?? null;
    }
    const latestVersion = this.rateCardLatestVersion.get(rateCardId);
    if (latestVersion) {
      return this.rateCards.get(`${rateCardId}#${latestVersion}`) ?? null;
    }
    const uuid = ensureUuid(rateCardId);
    const uuidLatest = this.rateCardLatestVersion.get(uuid);
    if (!uuidLatest) return null;
    return this.rateCards.get(`${uuid}#${uuidLatest}`) ?? null;
  }

  public findRateCardForService(
    provider: string,
    serviceType: VoiceUsageServiceType,
    atTime?: string | Date,
  ): VoiceRateCardRecord | null {
    const targetTime = atTime ? new Date(atTime).getTime() : Date.now();
    let latestCard: VoiceRateCardRecord | null = null;
    for (const card of this.rateCards.values()) {
      if (
        card.provider.toLowerCase() === provider.toLowerCase() &&
        card.serviceType === serviceType &&
        card.reconciliationStatus === "published"
      ) {
        const effFrom = new Date(card.effectiveFrom).getTime();
        const effUntil = card.effectiveUntil
          ? new Date(card.effectiveUntil).getTime()
          : Infinity;
        if (targetTime >= effFrom && targetTime <= effUntil) {
          if (!latestCard || card.version > latestCard.version) {
            latestCard = card;
          }
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
  public recordUsage(input: VoiceUsageRecordInput, persistAsync = true): VoiceUsageRecord {
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
      rateCard = this.findRateCardForService(
        input.provider,
        input.serviceType,
        input.usageDate,
      );
    }

    let isUnverified = input.unverified;
    const unverifiedReasons: string[] = [];
    if (input.unverifiedReasons) {
      unverifiedReasons.push(...input.unverifiedReasons);
    }

    if (estimatedCost === undefined) {
      if (rateCard) {
        estimatedCost = this.computeEstimatedCostFromRateCard(
          rateCard,
          input.quantity,
        );
        if (isUnverified === undefined) {
          isUnverified = rateCard.unverified;
        }
      } else {
        // SD §14.3: "未知欄位標 unverified，不能默認為免費。"
        // Rate card missing entirely: cannot default to zero/free without unverified flag!
        estimatedCost = input.estimatedCost ?? 0;
        isUnverified = true;
        unverifiedReasons.push("missing_rate_card_pricing_unverified");
      }
    } else if (isUnverified === undefined) {
      isUnverified = rateCard ? rateCard.unverified : false;
    }

    const usageId = input.usageId ?? randomUUID();

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
      unverified: isUnverified ?? false,
      metadata: sanitizedMetadata,
      createdAt: new Date().toISOString(),
    };

    this.usageRecords.set(usageId, record);
    if (record.providerUsageRef) {
      const dedupKey = `${record.providerAccountId}#${record.providerUsageRef}`;
      this.providerRefIndex.set(dedupKey, usageId);
    }

    if (persistAsync && this.isRepoEnabled() && this.voiceRepo) {
      try {
        const p = this.voiceRepo.insertUsageRecord({
          usageId: record.usageId,
          providerAccountId: record.providerAccountId,
          providerUsageRef: record.providerUsageRef ?? null,
          admissionId: record.admissionId ?? null,
          voiceSessionId: record.voiceSessionId ?? null,
          provider: record.provider,
          model: record.model ?? null,
          modelVersion: record.modelVersion ?? null,
          billingUnit: record.billingUnit,
          quantity: record.quantity,
          currency: record.currency,
          rateCardId: record.rateCardId ? ensureUuid(record.rateCardId) : null,
          rateCardVersion: record.rateCardVersion ?? null,
          estimatedCost: record.estimatedCost,
          actualCost: record.actualCost ?? null,
          invoiceRef: record.invoiceRef ?? null,
          brandId: record.brandId ?? null,
          usageDate: record.usageDate,
        });
        if (p && typeof (p as Promise<any>).catch === "function") {
          (p as Promise<any>).catch((err) => {
            this.logger.error(`Failed to persist usage record ${usageId}: ${err}`);
          });
        }
      } catch (err) {
        this.logger.error(`Failed to call insertUsageRecord: ${err}`);
      }
    }

    return record;
  }

  public async recordUsageAsync(input: VoiceUsageRecordInput): Promise<VoiceUsageRecord> {
    const record = this.recordUsage(input, false);
    if (this.isRepoEnabled() && this.voiceRepo) {
      try {
        const persisted = await this.voiceRepo.insertUsageRecord({
          usageId: record.usageId,
          providerAccountId: record.providerAccountId,
          providerUsageRef: record.providerUsageRef ?? null,
          admissionId: record.admissionId ?? null,
          voiceSessionId: record.voiceSessionId ?? null,
          provider: record.provider,
          model: record.model ?? null,
          modelVersion: record.modelVersion ?? null,
          billingUnit: record.billingUnit,
          quantity: record.quantity,
          currency: record.currency,
          rateCardId: record.rateCardId ? ensureUuid(record.rateCardId) : null,
          rateCardVersion: record.rateCardVersion ?? null,
          estimatedCost: record.estimatedCost,
          actualCost: record.actualCost ?? null,
          invoiceRef: record.invoiceRef ?? null,
          brandId: record.brandId ?? null,
          usageDate: record.usageDate,
        });
        if (persisted.usageId !== record.usageId) {
          record.usageId = persisted.usageId;
          this.usageRecords.set(persisted.usageId, record);
        }
      } catch (err) {
        this.logger.error(`Failed to persist voice usage record ${record.usageId}: ${err}`);
      }
    }
    return record;
  }

  public getUsageRecord(usageId: string): VoiceUsageRecord | null {
    return this.usageRecords.get(usageId) ?? null;
  }

  public findUsageByProviderRef(
    providerAccountId: string,
    providerUsageRef: string,
  ): VoiceUsageRecord | null {
    const key = `${providerAccountId}#${providerUsageRef}`;
    const usageId = this.providerRefIndex.get(key);
    if (!usageId) return null;
    return this.usageRecords.get(usageId) ?? null;
  }

  public listUsageRecords(filter?: {
    voiceSessionId?: string | undefined;
    admissionId?: string | undefined;
    brandId?: string | undefined;
    provider?: string | undefined;
    serviceType?: VoiceUsageServiceType | undefined;
    usageDate?: string | undefined;
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
    const unverifiedReasons: string[] = [];

    // 1. Telephony legs
    const telephonySeconds = input.durationSeconds ?? 0;
    if (telephonySeconds > 0) {
      const provider = input.provider ?? "twm-telephony";
      let ctiCard = this.findRateCardForService(provider, "telephony", input.usageTimestamp);
      if (!ctiCard && !input.provider) {
        ctiCard = this.findRateCardForService("twm-telephony", "telephony", input.usageTimestamp);
      }
      const isMissing = !ctiCard;
      const billedMinutes = Math.ceil(telephonySeconds / 60);
      const legCount = Math.max(1, input.telephonyLegCount ?? 1);
      const unitPrice = ctiCard?.unitPrice ?? 0.60;
      const legCost = billedMinutes * unitPrice * legCount;
      const itemUnverified = isMissing || (ctiCard?.unverified ?? false);
      items.push({
        serviceType: "telephony",
        provider: ctiCard?.provider ?? provider,
        quantity: billedMinutes * legCount,
        billingUnit: "minute",
        unitPrice,
        currency: ctiCard?.currency ?? "TWD",
        cost: Number(legCost.toFixed(6)),
        unverified: itemUnverified,
      });
      totalCost += legCost;
      if (itemUnverified) {
        hasUnverified = true;
        if (isMissing) {
          unverifiedReasons.push(`Telephony: missing active rate card for provider ${provider}`);
        }
      }
    }

    // 2. ASR (Realtime ASR)
    const asrSecs = input.asrSeconds ?? 0;
    if (asrSecs > 0) {
      const provider = input.provider ?? "twm";
      let asrCard = this.findRateCardForService(
        provider,
        "asr",
        input.usageTimestamp,
      );
      if (!asrCard && !input.provider) {
        asrCard = this.findRateCardForService("twm", "asr", input.usageTimestamp);
      }
      const isMissing = !asrCard;
      const asrMinutes = Math.ceil(asrSecs / 60);
      const unitPrice = asrCard?.unitPrice ?? 0.74;
      const asrCost = asrMinutes * unitPrice;
      const itemUnverified = isMissing || (asrCard?.unverified ?? false);
      items.push({
        serviceType: "asr",
        provider: asrCard?.provider ?? provider,
        quantity: asrMinutes,
        billingUnit: "minute",
        unitPrice,
        currency: asrCard?.currency ?? "TWD",
        cost: Number(asrCost.toFixed(6)),
        unverified: itemUnverified,
      });
      totalCost += asrCost;
      if (itemUnverified) {
        hasUnverified = true;
        if (isMissing) {
          unverifiedReasons.push(`ASR: missing active rate card for provider ${provider}`);
        }
      }
    }

    // 3. TTS
    const ttsChars = input.ttsCharacters ?? 0;
    if (ttsChars > 0) {
      const provider = input.provider ?? "twm";
      let ttsCard = this.findRateCardForService(
        provider,
        "tts",
        input.usageTimestamp,
      );
      if (!ttsCard && !input.provider) {
        ttsCard = this.findRateCardForService("twm", "tts", input.usageTimestamp);
      }
      const isMissing = !ttsCard;
      const unitPrice = ttsCard?.unitPrice ?? 625 / 1_000_000;
      const ttsCost = ttsChars * unitPrice;
      const itemUnverified = isMissing || (ttsCard?.unverified ?? false);
      items.push({
        serviceType: "tts",
        provider: ttsCard?.provider ?? provider,
        quantity: ttsChars,
        billingUnit: "character",
        unitPrice,
        currency: ttsCard?.currency ?? "TWD",
        cost: Number(ttsCost.toFixed(6)),
        unverified: itemUnverified,
      });
      totalCost += ttsCost;
      if (itemUnverified) {
        hasUnverified = true;
        if (isMissing) {
          unverifiedReasons.push(`TTS: missing active rate card for provider ${provider}`);
        }
      }
    }

    // 4. LLM
    const totalTokens =
      (input.llmInputTokens ?? 0) + (input.llmOutputTokens ?? 0);
    if (totalTokens > 0) {
      const provider = input.llmProvider ?? "gemini";
      let llmCard = this.findRateCardForService(provider, "llm", input.usageTimestamp);
      if (!llmCard && provider === "gemini") {
        llmCard = this.findRateCardForService("openai", "llm", input.usageTimestamp);
      }
      const isMissing = !llmCard;
      const unitPrice = llmCard?.unitPrice ?? 0.00015;
      const llmCost = totalTokens * unitPrice;
      const itemUnverified = isMissing || (llmCard?.unverified ?? false);
      items.push({
        serviceType: "llm",
        provider: llmCard?.provider ?? provider,
        quantity: totalTokens,
        billingUnit: "token",
        unitPrice,
        currency: llmCard?.currency ?? "TWD",
        cost: Number(llmCost.toFixed(6)),
        unverified: itemUnverified,
      });
      totalCost += llmCost;
      if (itemUnverified) {
        hasUnverified = true;
        if (isMissing) {
          unverifiedReasons.push(`LLM: missing active rate card for provider ${provider}`);
        }
      }
    }

    // 5. Storage
    const storageMb = input.storageMegabytes ?? 0;
    if (storageMb > 0) {
      const storageCard = this.findRateCardForService(
        "gcp-cloud-storage",
        "storage",
        input.usageTimestamp,
      );
      const isMissing = !storageCard;
      const unitPrice = storageCard?.unitPrice ?? 0.05;
      const storageCost = storageMb * unitPrice;
      const itemUnverified = isMissing || (storageCard?.unverified ?? false);
      items.push({
        serviceType: "storage",
        provider: storageCard?.provider ?? "gcp-cloud-storage",
        quantity: storageMb,
        billingUnit: "megabyte",
        unitPrice,
        currency: storageCard?.currency ?? "TWD",
        cost: Number(storageCost.toFixed(6)),
        unverified: itemUnverified,
      });
      totalCost += storageCost;
      if (itemUnverified) {
        hasUnverified = true;
      }
    }

    // 6. Human operator time allocation (for transfers / callback handling)
    const operatorSecs = input.humanOperatorSeconds ?? 0;
    if (operatorSecs > 0) {
      const opCard = this.findRateCardForService(
        "drts-internal-ops",
        "human_operator",
        input.usageTimestamp,
      );
      const isMissing = !opCard;
      const unitPrice = opCard?.unitPrice ?? 300 / 3600;
      const opCost = operatorSecs * unitPrice;
      const itemUnverified = isMissing || (opCard?.unverified ?? false);
      items.push({
        serviceType: "human_operator",
        provider: opCard?.provider ?? "drts-internal-ops",
        quantity: operatorSecs,
        billingUnit: "second",
        unitPrice,
        currency: opCard?.currency ?? "TWD",
        cost: Number(opCost.toFixed(6)),
        unverified: itemUnverified,
      });
      totalCost += opCost;
      if (itemUnverified) {
        hasUnverified = true;
      }
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

    // Currency analysis and conversion (SD §14.3: 另設版本化 rate card，包括 currency... 已核對匯率日期。未知欄位標 unverified，不能默認為免費)
    const currencyTotals: Record<string, number> = {};
    for (const item of items) {
      currencyTotals[item.currency] = Number(
        ((currencyTotals[item.currency] ?? 0) + item.cost).toFixed(6),
      );
    }
    const currencyKeys = Object.keys(currencyTotals);
    const hasMixedCurrencies = currencyKeys.length > 1;

    let totalEstimatedCost = 0;
    let totalEstimatedCostInBaseCurrency = 0;
    let finalCurrency = "TWD";

    if (hasMixedCurrencies) {
      let convertedTotal = 0;
      for (const item of items) {
        if (item.currency === "TWD") {
          convertedTotal += item.cost;
        } else {
          const card = this.findRateCardForService(item.provider, item.serviceType, input.usageTimestamp);
          const rate = card?.conditions?.exchangeRateToTwd ?? (item.currency === "USD" ? 32.0 : undefined);
          if (typeof rate === "number" && rate > 0) {
            convertedTotal += item.cost * rate;
          } else {
            hasUnverified = true;
            unverifiedReasons.push(
              `Currency conversion: missing exchange rate for ${item.currency} (${item.provider}/${item.serviceType})`,
            );
          }
        }
      }
      totalEstimatedCostInBaseCurrency = Number(convertedTotal.toFixed(6));
      totalEstimatedCost = totalEstimatedCostInBaseCurrency;
      finalCurrency = "MIXED";
    } else {
      finalCurrency = currencyKeys.length === 1 && currencyKeys[0] ? currencyKeys[0] : "TWD";
      totalEstimatedCost = Number(totalCost.toFixed(6));
      totalEstimatedCostInBaseCurrency = totalEstimatedCost;
    }

    return {
      voiceSessionId: input.voiceSessionId,
      callId: input.callId,
      providerCallId: input.providerCallId,
      admissionId: input.admissionId,
      brandId: input.brandId,
      language: input.language,
      outcome: input.outcome,
      items,
      totalEstimatedCost,
      totalEstimatedCostInBaseCurrency,
      baseCurrency: "TWD",
      currency: finalCurrency,
      currencyTotals,
      hasMixedCurrencies,
      hasUnverifiedCosts: hasUnverified,
      unverified: hasUnverified,
      unverifiedReasons: unverifiedReasons.length > 0 ? unverifiedReasons : undefined,
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
    persistAsync = true,
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

        if (persistAsync && this.isRepoEnabled() && this.voiceRepo) {
          try {
            const p = this.voiceRepo.updateUsageRecordReconciliation(
              matchedRecord.usageId,
              line.billedCost,
              invoiceRef,
            );
            if (p && typeof (p as Promise<any>).catch === "function") {
              (p as Promise<any>).catch((err) => {
                this.logger.error(`Failed to update usage reconciliation in DB: ${err}`);
              });
            }
          } catch (err) {
            this.logger.error(`Failed to call updateUsageRecordReconciliation: ${err}`);
          }
        }

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

        if (persistAsync && this.isRepoEnabled() && this.voiceRepo) {
          try {
            const p = this.voiceRepo.insertUsageRecord({
              usageId: newRecord.usageId,
              providerAccountId: newRecord.providerAccountId,
              providerUsageRef: newRecord.providerUsageRef ?? null,
              admissionId: null,
              voiceSessionId: null,
              provider: newRecord.provider,
              model: null,
              modelVersion: null,
              billingUnit: newRecord.billingUnit,
              quantity: newRecord.quantity,
              currency: newRecord.currency,
              rateCardId: null,
              rateCardVersion: null,
              estimatedCost: newRecord.estimatedCost,
              actualCost: newRecord.actualCost ?? null,
              invoiceRef: newRecord.invoiceRef ?? null,
              brandId: null,
              usageDate: newRecord.usageDate,
            });
            if (p && typeof (p as Promise<any>).catch === "function") {
              (p as Promise<any>).catch((err) => {
                this.logger.error(`Failed to persist un-estimated invoice line in DB: ${err}`);
              });
            }
          } catch (err) {
            this.logger.error(`Failed to call insertUsageRecord: ${err}`);
          }
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

  public async reconcileInvoiceAsync(
    invoiceRef: string,
    providerAccountId: string,
    invoiceLines: ProviderInvoiceLineItem[],
  ): Promise<InvoiceReconciliationReport> {
    if (this.isRepoEnabled() && this.voiceRepo) {
      for (const line of invoiceLines) {
        if (line.providerUsageRef) {
          const key = `${providerAccountId}#${line.providerUsageRef}`;
          if (!this.providerRefIndex.has(key)) {
            const durable = await this.voiceRepo.findUsageRecordByProviderRef(
              providerAccountId,
              line.providerUsageRef,
            );
            if (durable) {
              const rec: VoiceUsageRecord = {
                usageId: durable.usageId,
                providerAccountId: durable.providerAccountId,
                providerUsageRef: durable.providerUsageRef ?? undefined,
                admissionId: durable.admissionId ?? undefined,
                voiceSessionId: durable.voiceSessionId ?? undefined,
                provider: durable.provider,
                serviceType: "telephony",
                model: durable.model ?? undefined,
                modelVersion: durable.modelVersion ?? undefined,
                billingUnit: durable.billingUnit as BillingUnit,
                quantity: durable.quantity,
                currency: durable.currency,
                rateCardId: durable.rateCardId ?? undefined,
                rateCardVersion: durable.rateCardVersion ?? undefined,
                estimatedCost: durable.estimatedCost ?? 0,
                actualCost: durable.actualCost ?? undefined,
                invoiceRef: durable.invoiceRef ?? undefined,
                reconciliationStatus: (durable.actualCost !== null ? "reconciled" : "estimated") as any,
                reconciliationAdjustment:
                  durable.actualCost !== null && durable.estimatedCost !== null
                    ? Number((durable.actualCost - durable.estimatedCost).toFixed(6))
                    : undefined,
                brandId: durable.brandId ?? undefined,
                usageDate: durable.usageDate,
                createdAt: durable.createdAt,
                unverified: false,
              };
              this.usageRecords.set(rec.usageId, rec);
              this.providerRefIndex.set(key, rec.usageId);
            }
          }
        }
      }
    }
    const report = this.reconcileInvoice(invoiceRef, providerAccountId, invoiceLines, false);
    if (this.isRepoEnabled() && this.voiceRepo) {
      for (const adj of report.adjustments) {
        if (adj.actualCost !== undefined) {
          try {
            await this.voiceRepo.updateUsageRecordReconciliation(
              adj.usageId,
              adj.actualCost,
              invoiceRef,
            );
          } catch (err) {
            this.logger.error(`Failed to await usage reconciliation in DB: ${err}`);
          }
        }
      }
    }
    return report;
  }

  // ============================================================================
  // Helpers
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
