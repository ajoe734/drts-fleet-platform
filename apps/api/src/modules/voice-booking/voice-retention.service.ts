import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  EvidenceAccessAction,
  EvidenceRetentionFamily,
  EvidenceRetentionPolicyRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  assertEvidenceAccess,
  getEvidenceGovernanceCatalog,
  getEvidenceRetentionPolicy,
  type EvidenceAccessIdentity,
} from "../../common/evidence-governance";
import { VoiceBookingRepository } from "./voice-booking.repository";

export type LegalHoldReasonCode =
  | "complaint_escalation"
  | "regulatory_inquiry"
  | "settlement_dispute"
  | "internal_investigation"
  | "other";

export interface LegalHoldRecord {
  holdId: string;
  caseNumber: string;
  evidenceFamily: EvidenceRetentionFamily;
  subjectRef: string;
  reasonCode: LegalHoldReasonCode;
  notes?: string | undefined;
  status: "active" | "released";
  placedBy: string;
  placedAt: string;
  releasedBy?: string | undefined;
  releasedAt?: string | undefined;
}

export interface RetentionEvaluationResult {
  family: EvidenceRetentionFamily;
  subjectRef: string;
  isExpired: boolean;
  isHeld: boolean;
  eligibleForPurge: boolean;
  expiresAt: string;
  retentionDays: number;
  policyVersion: string;
  holdDetails?: LegalHoldRecord | undefined;
}

export interface PurgeItemResult {
  subjectRef: string;
  action: "purged" | "skipped_held" | "not_expired" | "eligible_to_purge";
  reason?: string | undefined;
}

export interface PurgeExecutionReport {
  executionId: string;
  family: EvidenceRetentionFamily;
  mode: "dry-run" | "apply";
  retentionDays: number;
  totalExamined: number;
  purgedCount: number;
  skippedHeldCount: number;
  operatorId: string;
  executedAt: string;
  policyVersion: string;
  results: PurgeItemResult[];
}

export interface EvidenceAccessAuditRecord {
  auditId: string;
  family: EvidenceRetentionFamily;
  action: EvidenceAccessAction;
  subjectRef: string;
  operatorId: string;
  realm: string;
  actorType: string;
  policyVersion: string;
  timestamp: string;
  signedUrlIssued: boolean;
  ttlMinutes?: number | undefined;
}

export interface EvidenceAccessResult {
  authorized: boolean;
  policy: EvidenceRetentionPolicyRecord;
  signedUrl?: string | undefined;
  expiresAt?: string | undefined;
  auditId: string;
  policyVersion: string;
}

@Injectable()
export class VoiceRetentionService {
  private readonly logger = new Logger(VoiceRetentionService.name);

  // In-memory legal holds store: holdId -> LegalHoldRecord
  private readonly legalHolds = new Map<string, LegalHoldRecord>();

  // In-memory index for active legal holds: `${family}:${subjectRef}` -> holdId
  private readonly activeHoldIndex = new Map<string, string>();

  // In-memory access audit trail
  private readonly accessAuditHistory: EvidenceAccessAuditRecord[] = [];

  // In-memory retention purge execution logs
  private readonly purgeHistory: PurgeExecutionReport[] = [];

  constructor(
    @Optional()
    private readonly repository?: VoiceBookingRepository,
  ) {}

  // ============================================================================
  // 1. Retention Policy Authority & Invariants
  // ============================================================================

  /**
   * SD §9.2: "未定義保存期限不能默認永久"
   * All voice and platform evidence families must have explicit, finite retention windows.
   */
  assertRetentionDefined(family: EvidenceRetentionFamily): EvidenceRetentionPolicyRecord {
    const policy = getEvidenceRetentionPolicy(family);
    if (!policy.hotRetentionDays || policy.hotRetentionDays <= 0) {
      throw new ApiRequestError(
        500,
        "UNDEFINED_RETENTION_PERIOD_REJECTED",
        `Evidence family ${family} has undefined or non-positive retention days. Indefinite retention is strictly prohibited.`,
        { family, policy },
      );
    }
    return policy;
  }

  getPolicyCatalog() {
    return getEvidenceGovernanceCatalog();
  }

  evaluateRecordRetention(params: {
    family: EvidenceRetentionFamily;
    createdAt: Date | string;
    subjectRef: string;
    customRetentionDays?: number | undefined;
  }): RetentionEvaluationResult {
    const policy = this.assertRetentionDefined(params.family);
    const catalog = this.getPolicyCatalog();

    // Determine retention days: custom override cannot exceed policy maximum for transcripts (180 days)
    let retentionDays = policy.hotRetentionDays;
    if (params.family === "voice_transcript" && params.customRetentionDays) {
      // SD §9.2: "詳細逐字稿／對話及交接摘要 本版建議上限 180 天且可按品牌縮短"
      retentionDays = Math.min(params.customRetentionDays, 180);
    }

    const createdTime = new Date(params.createdAt).getTime();
    const expiryTime = createdTime + retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const isExpired = now >= expiryTime;

    const activeHold = this.getActiveHold(params.family, params.subjectRef);
    const isHeld = activeHold !== undefined;
    const eligibleForPurge = isExpired && !isHeld;

    return {
      family: params.family,
      subjectRef: params.subjectRef,
      isExpired,
      isHeld,
      eligibleForPurge,
      expiresAt: new Date(expiryTime).toISOString(),
      retentionDays,
      policyVersion: catalog.version,
      holdDetails: activeHold,
    };
  }

  // ============================================================================
  // 2. Legal Hold Management (UV-FR-032, UV-AC-028)
  // ============================================================================

  placeLegalHold(command: {
    caseNumber: string;
    evidenceFamily: EvidenceRetentionFamily;
    subjectRef: string;
    reasonCode: LegalHoldReasonCode;
    placedBy: string;
    notes?: string | undefined;
  }): LegalHoldRecord {
    const policy = this.assertRetentionDefined(command.evidenceFamily);
    if (!policy.legalHold.supported) {
      throw new ApiRequestError(
        400,
        "LEGAL_HOLD_NOT_SUPPORTED",
        `Evidence family ${command.evidenceFamily} does not support legal hold.`,
        { family: command.evidenceFamily },
      );
    }

    const indexKey = `${command.evidenceFamily}:${command.subjectRef}`;
    const existingHoldId = this.activeHoldIndex.get(indexKey);
    if (existingHoldId) {
      const existing = this.legalHolds.get(existingHoldId);
      if (existing && existing.status === "active") {
        this.logger.log(
          `Subject ${command.subjectRef} is already under active legal hold ${existingHoldId}`,
        );
        return existing;
      }
    }

    const holdId = randomUUID();
    const record: LegalHoldRecord = {
      holdId,
      caseNumber: command.caseNumber,
      evidenceFamily: command.evidenceFamily,
      subjectRef: command.subjectRef,
      reasonCode: command.reasonCode,
      notes: command.notes,
      status: "active",
      placedBy: command.placedBy,
      placedAt: new Date().toISOString(),
    };

    this.legalHolds.set(holdId, record);
    this.activeHoldIndex.set(indexKey, holdId);
    this.logger.warn(
      `[LegalHold] Placed legal hold ${holdId} on ${command.evidenceFamily}:${command.subjectRef} by ${command.placedBy} (Case: ${command.caseNumber})`,
    );

    return record;
  }

  releaseLegalHold(command: {
    holdId: string;
    releasedBy: string;
    releasedByRole: string;
    notes?: string | undefined;
  }): LegalHoldRecord {
    const hold = this.legalHolds.get(command.holdId);
    if (!hold) {
      throw new ApiRequestError(
        404,
        "LEGAL_HOLD_NOT_FOUND",
        `Legal hold ${command.holdId} was not found.`,
        { holdId: command.holdId },
      );
    }

    if (hold.status === "released") {
      return hold;
    }

    // SD §9.2 / Runbook §4: "Only platform_admin can release a hold."
    if (command.releasedByRole !== "platform_admin") {
      throw new ApiRequestError(
        403,
        "LEGAL_HOLD_RELEASE_FORBIDDEN",
        `Identity with role '${command.releasedByRole}' is forbidden from releasing legal hold. Only 'platform_admin' can release legal holds.`,
        { holdId: command.holdId, releasedBy: command.releasedBy, role: command.releasedByRole },
      );
    }

    hold.status = "released";
    hold.releasedBy = command.releasedBy;
    hold.releasedAt = new Date().toISOString();
    if (command.notes) {
      hold.notes = hold.notes
        ? `${hold.notes}; Release note: ${command.notes}`
        : command.notes;
    }

    const indexKey = `${hold.evidenceFamily}:${hold.subjectRef}`;
    if (this.activeHoldIndex.get(indexKey) === command.holdId) {
      this.activeHoldIndex.delete(indexKey);
    }

    this.logger.log(
      `[LegalHold] Released legal hold ${command.holdId} by ${command.releasedBy}`,
    );
    return hold;
  }

  isSubjectUnderHold(
    evidenceFamily: EvidenceRetentionFamily,
    subjectRef: string,
  ): boolean {
    const indexKey = `${evidenceFamily}:${subjectRef}`;
    const holdId = this.activeHoldIndex.get(indexKey);
    if (!holdId) return false;
    const hold = this.legalHolds.get(holdId);
    return hold !== undefined && hold.status === "active";
  }

  getActiveHold(
    evidenceFamily: EvidenceRetentionFamily,
    subjectRef: string,
  ): LegalHoldRecord | undefined {
    const indexKey = `${evidenceFamily}:${subjectRef}`;
    const holdId = this.activeHoldIndex.get(indexKey);
    if (!holdId) return undefined;
    const hold = this.legalHolds.get(holdId);
    return hold?.status === "active" ? hold : undefined;
  }

  listActiveHolds(family?: EvidenceRetentionFamily): LegalHoldRecord[] {
    const results: LegalHoldRecord[] = [];
    for (const hold of this.legalHolds.values()) {
      if (hold.status === "active") {
        if (!family || hold.evidenceFamily === family) {
          results.push(hold);
        }
      }
    }
    return results;
  }

  // ============================================================================
  // 3. Purge Execution (到期刪除與結果可追查)
  // ============================================================================

  executePurge(params: {
    family: EvidenceRetentionFamily;
    candidateRecords: Array<{ subjectRef: string; createdAt: Date | string }>;
    operatorId: string;
    dryRun?: boolean | undefined;
  }): PurgeExecutionReport {
    const policy = this.assertRetentionDefined(params.family);
    const catalog = this.getPolicyCatalog();
    const isDryRun = params.dryRun ?? false;

    let purgedCount = 0;
    let skippedHeldCount = 0;
    const results: PurgeItemResult[] = [];

    for (const record of params.candidateRecords) {
      const evalResult = this.evaluateRecordRetention({
        family: params.family,
        createdAt: record.createdAt,
        subjectRef: record.subjectRef,
      });

      if (!evalResult.isExpired) {
        results.push({
          subjectRef: record.subjectRef,
          action: "not_expired",
          reason: `Record is within retention window (${evalResult.retentionDays} days; expires at ${evalResult.expiresAt})`,
        });
        continue;
      }

      if (evalResult.isHeld) {
        skippedHeldCount++;
        results.push({
          subjectRef: record.subjectRef,
          action: "skipped_held",
          reason: `Record is under active legal hold ${evalResult.holdDetails?.holdId} (Case: ${evalResult.holdDetails?.caseNumber})`,
        });
        continue;
      }

      // Expired and not held: eligible for purge
      if (isDryRun) {
        results.push({
          subjectRef: record.subjectRef,
          action: "eligible_to_purge",
          reason: "Dry run: record past retention period with no legal hold.",
        });
      } else {
        purgedCount++;
        results.push({
          subjectRef: record.subjectRef,
          action: "purged",
          reason: "Aged evidence purged in accordance with retention policy.",
        });
      }
    }

    const report: PurgeExecutionReport = {
      executionId: randomUUID(),
      family: params.family,
      mode: isDryRun ? "dry-run" : "apply",
      retentionDays: policy.hotRetentionDays,
      totalExamined: params.candidateRecords.length,
      purgedCount,
      skippedHeldCount,
      operatorId: params.operatorId,
      executedAt: new Date().toISOString(),
      policyVersion: catalog.version,
      results,
    };

    this.purgeHistory.push(report);
    this.logger.log(
      `[RetentionPurge] Executed ${report.mode} purge on ${params.family}. Examined: ${report.totalExamined}, Purged: ${report.purgedCount}, Skipped Held: ${report.skippedHeldCount}`,
    );

    return report;
  }

  getPurgeHistory(family?: EvidenceRetentionFamily): PurgeExecutionReport[] {
    if (!family) return [...this.purgeHistory];
    return this.purgeHistory.filter((r) => r.family === family);
  }

  // ============================================================================
  // 4. Access & Download Authorization with Mandatory Auditing
  // ============================================================================

  authorizeEvidenceAccess(params: {
    family: EvidenceRetentionFamily;
    action: EvidenceAccessAction;
    identity: EvidenceAccessIdentity;
    subjectRef: string;
    clientIp?: string | undefined;
  }): EvidenceAccessResult {
    // Assert authorization via standard evidence governance rule engine
    const policy = assertEvidenceAccess({
      family: params.family,
      identity: params.identity,
      tenantId: params.identity.tenantId,
    });

    const catalog = this.getPolicyCatalog();
    const auditId = randomUUID();
    let signedUrl: string | undefined;
    let expiresAt: string | undefined;

    // For download requests, issue 15-minute signed token URL
    if (params.action === "download") {
      const ttlMinutes = policy.downloadControl?.ttlMinutes ?? 15;
      const expiry = new Date(Date.now() + ttlMinutes * 60 * 1000);
      expiresAt = expiry.toISOString();
      const signedToken = Buffer.from(
        JSON.stringify({
          sub: params.subjectRef,
          family: params.family,
          op: params.identity.actorId,
          exp: Math.floor(expiry.getTime() / 1000),
          audId: auditId,
        }),
      ).toString("base64url");

      signedUrl = `https://storage.drts.internal/download/${params.family}/${params.subjectRef}?token=${signedToken}&exp=${Math.floor(expiry.getTime() / 1000)}`;
    }

    // Mandatory access auditing (SD §9.2 / Runbook §3)
    const auditRecord: EvidenceAccessAuditRecord = {
      auditId,
      family: params.family,
      action: params.action,
      subjectRef: params.subjectRef,
      operatorId: params.identity.actorId ?? "unknown",
      realm: params.identity.realm,
      actorType: params.identity.actorType,
      policyVersion: catalog.version,
      timestamp: new Date().toISOString(),
      signedUrlIssued: params.action === "download",
      ttlMinutes: params.action === "download" ? (policy.downloadControl?.ttlMinutes ?? 15) : undefined,
    };

    this.accessAuditHistory.push(auditRecord);
    this.logger.log(
      `[EvidenceAccessAudit] Audited ${params.action} on ${params.family}:${params.subjectRef} by ${params.identity.actorType}:${auditRecord.operatorId}`,
    );

    return {
      authorized: true,
      policy,
      signedUrl,
      expiresAt,
      auditId,
      policyVersion: catalog.version,
    };
  }

  getAccessAuditHistory(
    family?: EvidenceRetentionFamily,
    subjectRef?: string,
  ): EvidenceAccessAuditRecord[] {
    let list = this.accessAuditHistory;
    if (family) {
      list = list.filter((r) => r.family === family);
    }
    if (subjectRef) {
      list = list.filter((r) => r.subjectRef === subjectRef);
    }
    return [...list];
  }
}
