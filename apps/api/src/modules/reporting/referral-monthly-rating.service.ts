import { randomUUID } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import {
  DRIVER_MONTHLY_RATING_COACHING_THRESHOLD,
  DRIVER_MONTHLY_RATING_TERMINATION_CONSECUTIVE_MONTHS,
  DRIVER_MONTHLY_RATING_TERMINATION_THRESHOLD,
  REFERRAL_MONTHLY_COACHING_THRESHOLD,
  REFERRAL_MONTHLY_GOVERNANCE_OUTCOMES,
  REFERRAL_MONTHLY_GOVERNANCE_RULE_TYPES,
  REFERRAL_MONTHLY_NO_DATA_STREAK_RULE,
  REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS,
  REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
  type AuditLogRecord,
  type RecordReferralMonthlyGovernanceOutcomeCommand,
  type ReferralMonthlyDriverMonthScore,
  type ReferralMonthlyDriverStreakSummary,
  type ReferralMonthlyFlaggedDriverSummary,
  type ReferralMonthlyGovernanceOutcome,
  type ReferralMonthlyGovernanceRuleType,
  type ReferralMonthlyGovernanceStatus,
  type ReferralMonthlyRatingGovernanceRecord,
  type ReferralMonthlyRatingGovernanceReport,
  type ReferralMonthlyRatingQuery,
  type ReferralMonthlyRatingReport,
  type ReferralMonthlyRatingRow,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { DatabaseService } from "../../common/db";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { ReportingRepository } from "./reporting.repository";

export {
  DRIVER_MONTHLY_RATING_COACHING_THRESHOLD,
  DRIVER_MONTHLY_RATING_TERMINATION_CONSECUTIVE_MONTHS,
  DRIVER_MONTHLY_RATING_TERMINATION_THRESHOLD,
  REFERRAL_MONTHLY_COACHING_THRESHOLD,
  REFERRAL_MONTHLY_GOVERNANCE_OUTCOMES,
  REFERRAL_MONTHLY_GOVERNANCE_RULE_TYPES,
  REFERRAL_MONTHLY_NO_DATA_STREAK_RULE,
  REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS,
  REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
};

type GovernanceDbRow = {
  record_id: string;
  driver_id: string;
  period_month: string;
  rule_type: ReferralMonthlyGovernanceRuleType;
  threshold: string | number;
  average_rating: string | number;
  rating_count: number;
  consecutive_low_months: number;
  triggered_months: string[] | string;
  monthly_breakdown: ReferralMonthlyDriverMonthScore[] | string;
  status: ReferralMonthlyGovernanceStatus;
  outcome: ReferralMonthlyGovernanceOutcome | null;
  outcome_reason: string | null;
  handled_by_actor_id: string | null;
  handled_at: string | Date | null;
  audit_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const PERIOD_MONTH_PATTERN = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;

export function shiftTaipeiPeriodMonth(
  periodMonth: string,
  deltaMonths: number,
): string {
  const year = Number(periodMonth.slice(0, 4));
  const monthIndex = Number(periodMonth.slice(5, 7)) - 1;
  const totalMonths = year * 12 + monthIndex + deltaMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  if (targetYear < 1) {
    return `0001-01`;
  }
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}`;
}

@Injectable()
export class ReferralMonthlyRatingService {
  private readonly fallbackAuditService = new AuditNotificationService();
  private readonly memoryGovernanceRecords = new Map<
    string,
    ReferralMonthlyRatingGovernanceRecord
  >();

  constructor(
    private readonly repository: ReportingRepository,
    @Optional() private readonly databaseService?: DatabaseService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
  ) {}

  async read(
    query: ReferralMonthlyRatingQuery,
  ): Promise<ReferralMonthlyRatingReport> {
    this.validateQuery(query);
    // Taiwan rating reviews already use submittedAt in the Asia/Taipei calendar.
    const year = Number(query.periodMonth.slice(0, 4));
    const month = Number(query.periodMonth.slice(5, 7));
    const from = `${query.periodMonth}-01`;
    const nextMonth =
      month === 12
        ? `${String(year + 1).padStart(4, "0")}-01`
        : `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
    const source = await this.repository.loadReferralMonthlyRatingSource(
      query,
      from,
      `${nextMonth}-01`,
    );
    const rows = this.extractCanonicalRatingRows(source, query, (ratingMonth) =>
      ratingMonth === query.periodMonth,
    );
    const groups = new Map<
      string,
      [ReferralMonthlyRatingRow, ...ReferralMonthlyRatingRow[]]
    >();
    for (const row of rows) {
      if (row.driverId === null) continue;
      const group = groups.get(row.driverId);
      if (group) group.push(row);
      else groups.set(row.driverId, [row]);
    }
    return {
      periodMonth: query.periodMonth,
      timeZone: "Asia/Taipei",
      ratingCount: rows.length,
      averageRating: rows.length ? this.average(rows) : null,
      unattributedRatingCount: rows.filter((row) => row.driverId === null)
        .length,
      drivers: [...groups]
        .map(([driverId, items]) => ({
          driverId,
          ratingCount: items.length,
          averageRating: this.average(items),
          lastRatedAt: items[0].submittedAt,
        }))
        .sort((a, b) => a.driverId.localeCompare(b.driverId)),
      rows,
    };
  }

  async evaluateGovernance(
    query: ReferralMonthlyRatingQuery,
    options?: {
      identity?: BootstrapRequestIdentity | null;
      requestId?: string;
      auditEvaluation?: boolean;
    },
  ): Promise<ReferralMonthlyRatingGovernanceReport> {
    this.validateQuery(query);

    const evaluatedWindowMonths: string[] = [];
    for (
      let offset = -(REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS - 1);
      offset <= 0;
      offset++
    ) {
      evaluatedWindowMonths.push(
        shiftTaipeiPeriodMonth(query.periodMonth, offset),
      );
    }
    const windowSet = new Set(evaluatedWindowMonths);
    const fromInclusive = `${evaluatedWindowMonths[0]!}-01`;
    const toExclusive = `${shiftTaipeiPeriodMonth(query.periodMonth, 1)}-01`;

    const source = await this.repository.loadReferralMonthlyRatingSource(
      query,
      fromInclusive,
      toExclusive,
    );

    const rowsWithMonths = this.extractCanonicalRatingRowsWithMonth(
      source,
      query,
      (ratingMonth) => windowSet.has(ratingMonth),
    );

    const ratingsByDriverAndMonth = new Map<
      string,
      Map<string, ReferralMonthlyRatingRow[]>
    >();
    const driverIdSet = new Set<string>();
    if (query.driverId !== undefined) {
      driverIdSet.add(query.driverId);
    }

    for (const { row, ratingMonth } of rowsWithMonths) {
      if (row.driverId === null) continue;
      driverIdSet.add(row.driverId);
      let byMonth = ratingsByDriverAndMonth.get(row.driverId);
      if (!byMonth) {
        byMonth = new Map<string, ReferralMonthlyRatingRow[]>();
        ratingsByDriverAndMonth.set(row.driverId, byMonth);
      }
      const list = byMonth.get(ratingMonth);
      if (list) list.push(row);
      else byMonth.set(ratingMonth, [row]);
    }

    const sortedDrivers = [...driverIdSet].sort((a, b) => a.localeCompare(b));
    const driverStreaks: ReferralMonthlyDriverStreakSummary[] = [];
    const flaggedDrivers: ReferralMonthlyFlaggedDriverSummary[] = [];
    const allRecords: ReferralMonthlyRatingGovernanceRecord[] = [];

    for (const driverId of sortedDrivers) {
      const byMonth = ratingsByDriverAndMonth.get(driverId);
      const monthlyBreakdown: ReferralMonthlyDriverMonthScore[] =
        evaluatedWindowMonths.map((month) => {
          const items = byMonth?.get(month) ?? [];
          if (items.length === 0) {
            return {
              periodMonth: month,
              ratingCount: 0,
              averageRating: null,
              status: "no_data",
              belowCoachingThreshold: false,
              belowTerminationThreshold: false,
            };
          }
          const avg = this.average(items);
          return {
            periodMonth: month,
            ratingCount: items.length,
            averageRating: avg,
            status: "rated",
            belowCoachingThreshold: avg < REFERRAL_MONTHLY_COACHING_THRESHOLD,
            belowTerminationThreshold:
              avg < REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
          };
        });

      // Consecutive-month streak rule: walk backwards from target periodMonth.
      // Months with no ratings ('no_data') have averageRating = null (never 0)
      // and break a consecutive calendar-month < 3.5 streak.
      let consecutiveMonthsBelow35 = 0;
      const consecutiveLowMonthsList: string[] = [];
      for (let i = monthlyBreakdown.length - 1; i >= 0; i--) {
        const monthScore = monthlyBreakdown[i]!;
        if (
          monthScore.status === "rated" &&
          monthScore.averageRating !== null &&
          monthScore.belowTerminationThreshold
        ) {
          consecutiveMonthsBelow35 += 1;
          consecutiveLowMonthsList.unshift(monthScore.periodMonth);
        } else {
          break;
        }
      }

      const targetMonthScore = monthlyBreakdown[monthlyBreakdown.length - 1]!;
      const coachingRequired =
        targetMonthScore.status === "rated" &&
        targetMonthScore.averageRating !== null &&
        targetMonthScore.belowCoachingThreshold;
      const terminationReviewRequired =
        consecutiveMonthsBelow35 >=
        REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS;

      const triggeredMonths = terminationReviewRequired
        ? [...consecutiveLowMonthsList]
        : coachingRequired
          ? [query.periodMonth]
          : [];

      driverStreaks.push({
        driverId,
        periodMonth: query.periodMonth,
        consecutiveMonthsBelow35,
        coachingRequired,
        terminationReviewRequired,
        triggeredMonths,
        monthlyBreakdown,
      });

      const driverRecords: ReferralMonthlyRatingGovernanceRecord[] = [];
      if (coachingRequired && targetMonthScore.averageRating !== null) {
        const coachingRecord = await this.upsertGovernanceRecord({
          driverId,
          periodMonth: query.periodMonth,
          ruleType: "coaching",
          threshold: REFERRAL_MONTHLY_COACHING_THRESHOLD,
          averageRating: targetMonthScore.averageRating,
          ratingCount: targetMonthScore.ratingCount,
          consecutiveLowMonths: consecutiveMonthsBelow35,
          triggeredMonths: [query.periodMonth],
          monthlyBreakdown,
        });
        driverRecords.push(coachingRecord);
        allRecords.push(coachingRecord);
      }

      if (
        terminationReviewRequired &&
        targetMonthScore.averageRating !== null
      ) {
        const terminationRecord = await this.upsertGovernanceRecord({
          driverId,
          periodMonth: query.periodMonth,
          ruleType: "termination_review",
          threshold: REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
          averageRating: targetMonthScore.averageRating,
          ratingCount: targetMonthScore.ratingCount,
          consecutiveLowMonths: consecutiveMonthsBelow35,
          triggeredMonths: [...consecutiveLowMonthsList],
          monthlyBreakdown,
        });
        driverRecords.push(terminationRecord);
        allRecords.push(terminationRecord);
      }

      if (
        (coachingRequired || terminationReviewRequired) &&
        targetMonthScore.averageRating !== null
      ) {
        flaggedDrivers.push({
          driverId,
          periodMonth: query.periodMonth,
          ratingCount: targetMonthScore.ratingCount,
          averageRating: targetMonthScore.averageRating,
          coachingRequired,
          terminationReviewRequired,
          consecutiveMonthsBelow35,
          triggeredMonths,
          monthlyBreakdown,
          records: driverRecords,
        });
      }
    }

    if (options?.auditEvaluation && options.identity?.actorId) {
      this.getAuditService().recordAuditLog({
        actorId: options.identity.actorId,
        actorType:
          (options.identity.actorType as
            | AuditLogRecord["actorType"]
            | undefined) ?? "platform_admin",
        tenantId: options.identity.tenantId ?? null,
        moduleName: "reporting",
        actionName: "referral_monthly_rating_governance.evaluate",
        resourceType: "referral_monthly_rating_governance_report",
        resourceId: query.periodMonth,
        newValuesSummary: {
          periodMonth: query.periodMonth,
          driverId: query.driverId ?? null,
          evaluatedWindowMonths,
          flaggedDriverCount: flaggedDrivers.length,
          recordCount: allRecords.length,
        },
        ...(options.requestId ? { requestId: options.requestId } : {}),
      });
    }

    return {
      periodMonth: query.periodMonth,
      timeZone: "Asia/Taipei",
      evaluatedWindowMonths,
      coachingThreshold: REFERRAL_MONTHLY_COACHING_THRESHOLD,
      terminationThreshold: REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
      terminationConsecutiveMonths:
        REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS,
      noDataStreakRule: REFERRAL_MONTHLY_NO_DATA_STREAK_RULE,
      flaggedDrivers,
      records: allRecords,
      driverStreaks,
    };
  }

  async recordOutcome(
    command: RecordReferralMonthlyGovernanceOutcomeCommand,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ReferralMonthlyRatingGovernanceRecord> {
    if (!identity?.actorId || !identity.actorId.trim()) {
      throw new ApiRequestError(
        401,
        "AUTH_REQUIRED",
        "Authenticated operator identity is required to record monthly rating governance outcomes.",
      );
    }
    if (
      identity.realm !== "platform" &&
      identity.realm !== "ops" &&
      identity.realm !== "system"
    ) {
      throw new ApiRequestError(
        403,
        "FORBIDDEN",
        "Only platform or ops realm identities may record monthly rating governance outcomes.",
      );
    }
    if (
      Array.isArray(identity.scopes) &&
      identity.scopes.length > 0 &&
      !identity.scopes.includes("reports:write")
    ) {
      throw new ApiRequestError(
        403,
        "FORBIDDEN",
        "reports:write scope is required to record monthly rating governance outcomes.",
      );
    }

    if (
      !command ||
      typeof command.outcome !== "string" ||
      !(REFERRAL_MONTHLY_GOVERNANCE_OUTCOMES as readonly string[]).includes(
        command.outcome,
      )
    ) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        `outcome must be one of: ${REFERRAL_MONTHLY_GOVERNANCE_OUTCOMES.join(", ")}.`,
      );
    }

    if (typeof command.reason !== "string" || !command.reason.trim()) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        "reason must be a non-empty string.",
      );
    }

    if (
      command.ruleType !== undefined &&
      !(REFERRAL_MONTHLY_GOVERNANCE_RULE_TYPES as readonly string[]).includes(
        command.ruleType,
      )
    ) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        `ruleType must be one of: ${REFERRAL_MONTHLY_GOVERNANCE_RULE_TYPES.join(", ")}.`,
      );
    }

    const recordId = command.recordId?.trim();
    const driverId = command.driverId?.trim();
    const periodMonth = command.periodMonth?.trim();

    if (!recordId && (!driverId || !periodMonth)) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        "Either recordId or both driverId and periodMonth must be provided.",
      );
    }

    if (periodMonth && !PERIOD_MONTH_PATTERN.test(periodMonth)) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        "periodMonth must be YYYY-MM.",
      );
    }

    let existing = await this.findGovernanceRecord({
      recordId,
      driverId,
      periodMonth,
      ruleType: command.ruleType,
      preferredOutcome: command.outcome,
    });

    if (!existing && driverId && periodMonth && this.repository.isEnabled()) {
      await this.evaluateGovernance({ periodMonth, driverId });
      existing = await this.findGovernanceRecord({
        recordId,
        driverId,
        periodMonth,
        ruleType: command.ruleType,
        preferredOutcome: command.outcome,
      });
    }

    if (!existing) {
      throw new ApiRequestError(
        404,
        "GOVERNANCE_RECORD_NOT_FOUND",
        "Monthly rating governance record not found.",
      );
    }

    const trimmedReason = command.reason.trim();
    const handledAt = new Date().toISOString();
    const auditId = `audit-${randomUUID()}`;

    const auditLog = this.getAuditService().recordAuditLog({
      auditId,
      actorId: identity.actorId,
      actorType:
        (identity.actorType as AuditLogRecord["actorType"] | undefined) ??
        "platform_admin",
      tenantId: identity.tenantId ?? null,
      moduleName: "reporting",
      actionName: `referral_monthly_rating_governance.${command.outcome}`,
      resourceType: "referral_monthly_rating_governance_record",
      resourceId: existing.recordId,
      oldValuesSummary: {
        driverId: existing.driverId,
        periodMonth: existing.periodMonth,
        ruleType: existing.ruleType,
        status: existing.status,
        outcome: existing.outcome,
        outcomeReason: existing.outcomeReason,
        handledByActorId: existing.handledByActorId,
        handledAt: existing.handledAt,
      },
      newValuesSummary: {
        driverId: existing.driverId,
        periodMonth: existing.periodMonth,
        ruleType: existing.ruleType,
        threshold: existing.threshold,
        averageRating: existing.averageRating,
        triggeredMonths: existing.triggeredMonths,
        status: command.outcome,
        outcome: command.outcome,
        outcomeReason: trimmedReason,
        handledByActorId: identity.actorId,
        handledAt,
      },
      ...(requestId ? { requestId } : {}),
    });

    const updated: ReferralMonthlyRatingGovernanceRecord = {
      ...existing,
      status: command.outcome,
      outcome: command.outcome,
      outcomeReason: trimmedReason,
      handledByActorId: identity.actorId,
      handledAt,
      auditId: auditLog.auditId,
      updatedAt: handledAt,
    };

    const db = this.resolveDatabase();
    if (db?.isEnabled()) {
      const result = await db.query<GovernanceDbRow>(
        `
          UPDATE reporting.referral_monthly_rating_governance_records
          SET
            status = $2,
            outcome = $2,
            outcome_reason = $3,
            handled_by_actor_id = $4,
            handled_at = $5::timestamptz,
            audit_id = $6,
            updated_at = $5::timestamptz
          WHERE record_id = $1
          RETURNING
            record_id,
            driver_id,
            period_month,
            rule_type,
            threshold,
            average_rating,
            rating_count,
            consecutive_low_months,
            triggered_months,
            monthly_breakdown,
            status,
            outcome,
            outcome_reason,
            handled_by_actor_id,
            handled_at,
            audit_id,
            created_at,
            updated_at
        `,
        [
          existing.recordId,
          command.outcome,
          trimmedReason,
          identity.actorId,
          handledAt,
          auditLog.auditId,
        ],
      );
      if (this.isGovernanceDbRow(result?.rows?.[0])) {
        const mapped = this.mapGovernanceDbRow(result.rows[0]);
        this.memoryGovernanceRecords.set(
          this.memoryKey(mapped.driverId, mapped.periodMonth, mapped.ruleType),
          mapped,
        );
        return mapped;
      }
    }

    this.memoryGovernanceRecords.set(
      this.memoryKey(updated.driverId, updated.periodMonth, updated.ruleType),
      updated,
    );
    return structuredClone(updated);
  }

  getGovernanceAuditLogs(): AuditLogRecord[] {
    return this.getAuditService()
      .getAuditLogsSnapshot()
      .filter(
        (log) =>
          log.moduleName === "reporting" &&
          (log.resourceType === "referral_monthly_rating_governance_record" ||
            log.resourceType === "referral_monthly_rating_governance_report"),
      );
  }

  private validateQuery(query: ReferralMonthlyRatingQuery) {
    if (
      !query ||
      typeof query.periodMonth !== "string" ||
      !PERIOD_MONTH_PATTERN.test(query.periodMonth)
    ) {
      throw new ApiRequestError(
        400,
        "VALIDATION_ERROR",
        "periodMonth must be YYYY-MM.",
      );
    }
    for (const key of [
      "driverId",
      "tenantId",
      "partnerId",
      "partnerProgramId",
      "entrySlug",
    ] as const) {
      if (
        query[key] !== undefined &&
        (typeof query[key] !== "string" || !query[key]!.trim())
      ) {
        throw new ApiRequestError(
          400,
          "VALIDATION_ERROR",
          `${key} must be non-empty.`,
        );
      }
    }
    if (!this.repository.isEnabled()) {
      throw new ApiRequestError(
        503,
        "REPORT_SOURCE_UNAVAILABLE",
        "Canonical Referral ratings are unavailable.",
      );
    }
  }

  private extractCanonicalRatingRows(
    source: Awaited<
      ReturnType<ReportingRepository["loadReferralMonthlyRatingSource"]>
    >,
    query: ReferralMonthlyRatingQuery,
    monthFilter: (ratingMonth: string) => boolean,
  ): ReferralMonthlyRatingRow[] {
    return this.extractCanonicalRatingRowsWithMonth(
      source,
      query,
      monthFilter,
    ).map((entry) => entry.row);
  }

  private extractCanonicalRatingRowsWithMonth(
    source: Awaited<
      ReturnType<ReportingRepository["loadReferralMonthlyRatingSource"]>
    >,
    query: ReferralMonthlyRatingQuery,
    monthFilter: (ratingMonth: string) => boolean,
  ): { row: ReferralMonthlyRatingRow; ratingMonth: string }[] {
    const calendar = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
    });
    const entries: { row: ReferralMonthlyRatingRow; ratingMonth: string }[] =
      [];
    for (const order of source.orders) {
      const rating = order.referralPassengerLifecycle?.rating;
      if (!rating || order.status !== "completed") continue;
      if (
        rating.orderId !== order.orderId ||
        !Number.isInteger(rating.score) ||
        rating.score < 1 ||
        rating.score > 5 ||
        !Array.isArray(rating.tags) ||
        rating.tags.some((tag) => typeof tag !== "string")
      ) {
        throw new Error("Invalid canonical Referral rating record.");
      }
      const submitted = Date.parse(rating.submittedAt);
      if (!Number.isFinite(submitted))
        throw new Error("Invalid canonical rating submittedAt.");
      const parts = calendar.formatToParts(new Date(submitted));
      const ratingMonth = `${parts.find((part) => part.type === "year")!.value.padStart(4, "0")}-${parts.find((part) => part.type === "month")!.value}`;
      if (!monthFilter(ratingMonth)) continue;
      if (
        (query.tenantId !== undefined && order.tenantId !== query.tenantId) ||
        (query.partnerId !== undefined &&
          order.partnerId !== query.partnerId) ||
        (query.partnerProgramId !== undefined &&
          order.partnerProgramId !== query.partnerProgramId) ||
        (query.entrySlug !== undefined &&
          order.partnerEntrySlug !== query.entrySlug)
      )
        continue;
      const completed = source.driverTasks.filter(
        (task) =>
          task.orderId === order.orderId &&
          task.status === "completed" &&
          task.completedAt &&
          source.dispatchAssignments.some(
            (assignment) =>
              assignment.assignmentId === task.assignmentId &&
              assignment.taskId === task.taskId &&
              assignment.orderId === order.orderId &&
              assignment.dispatchJobId === task.dispatchJobId &&
              assignment.driverId === task.driverId &&
              assignment.vehicleId === task.vehicleId &&
              assignment.status === "completed",
          ),
      );
      const task = completed.length === 1 ? completed[0] : undefined;
      if (query.driverId !== undefined && task?.driverId !== query.driverId)
        continue;
      entries.push({
        ratingMonth,
        row: {
          orderId: order.orderId,
          orderNo: order.orderNo,
          tenantId: order.tenantId,
          partnerId: order.partnerId,
          partnerProgramId: order.partnerProgramId,
          entrySlug: order.partnerEntrySlug,
          score: rating.score,
          tags: [...rating.tags],
          comment: rating.comment ?? null,
          submittedAt: rating.submittedAt,
          contactRequested: rating.contactRequested ?? null,
          complaintCaseNo: rating.complaintCaseNo ?? null,
          driverId: task?.driverId ?? null,
          taskId: task?.taskId ?? null,
          assignmentId: task?.assignmentId ?? null,
          completedAt: task?.completedAt ?? null,
          attribution: task ? "completed_task" : "unavailable",
        },
      });
    }
    entries.sort(
      (a, b) =>
        Date.parse(b.row.submittedAt) - Date.parse(a.row.submittedAt) ||
        a.row.orderId.localeCompare(b.row.orderId),
    );
    return entries;
  }

  private average(items: ReferralMonthlyRatingRow[]): number {
    return (
      Math.round(
        (items.reduce((sum, row) => sum + row.score, 0) / items.length) * 100,
      ) / 100
    );
  }

  private memoryKey(
    driverId: string,
    periodMonth: string,
    ruleType: ReferralMonthlyGovernanceRuleType,
  ): string {
    return `${driverId}::${periodMonth}::${ruleType}`;
  }

  private deterministicRecordId(
    driverId: string,
    periodMonth: string,
    ruleType: ReferralMonthlyGovernanceRuleType,
  ): string {
    return `r04-gov:${driverId}:${periodMonth}:${ruleType}`;
  }

  private async upsertGovernanceRecord(input: {
    driverId: string;
    periodMonth: string;
    ruleType: ReferralMonthlyGovernanceRuleType;
    threshold: number;
    averageRating: number;
    ratingCount: number;
    consecutiveLowMonths: number;
    triggeredMonths: string[];
    monthlyBreakdown: ReferralMonthlyDriverMonthScore[];
  }): Promise<ReferralMonthlyRatingGovernanceRecord> {
    const key = this.memoryKey(
      input.driverId,
      input.periodMonth,
      input.ruleType,
    );
    const existingMem = this.memoryGovernanceRecords.get(key);
    const now = new Date().toISOString();
    const recordId =
      existingMem?.recordId ??
      this.deterministicRecordId(
        input.driverId,
        input.periodMonth,
        input.ruleType,
      );

    const db = this.resolveDatabase();
    if (db?.isEnabled()) {
      const result = await db.query<GovernanceDbRow>(
        `
          INSERT INTO reporting.referral_monthly_rating_governance_records (
            record_id,
            driver_id,
            period_month,
            rule_type,
            threshold,
            average_rating,
            rating_count,
            consecutive_low_months,
            triggered_months,
            monthly_breakdown,
            status,
            outcome,
            outcome_reason,
            handled_by_actor_id,
            handled_at,
            audit_id,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
            'pending', NULL, NULL, NULL, NULL, NULL, $11::timestamptz, $11::timestamptz
          )
          ON CONFLICT (driver_id, period_month, rule_type) DO UPDATE SET
            threshold = EXCLUDED.threshold,
            average_rating = EXCLUDED.average_rating,
            rating_count = EXCLUDED.rating_count,
            consecutive_low_months = EXCLUDED.consecutive_low_months,
            triggered_months = EXCLUDED.triggered_months,
            monthly_breakdown = EXCLUDED.monthly_breakdown,
            updated_at = CASE
              WHEN reporting.referral_monthly_rating_governance_records.average_rating IS DISTINCT FROM EXCLUDED.average_rating
                OR reporting.referral_monthly_rating_governance_records.rating_count IS DISTINCT FROM EXCLUDED.rating_count
                OR reporting.referral_monthly_rating_governance_records.consecutive_low_months IS DISTINCT FROM EXCLUDED.consecutive_low_months
                OR reporting.referral_monthly_rating_governance_records.triggered_months IS DISTINCT FROM EXCLUDED.triggered_months
                OR reporting.referral_monthly_rating_governance_records.monthly_breakdown IS DISTINCT FROM EXCLUDED.monthly_breakdown
              THEN EXCLUDED.updated_at
              ELSE reporting.referral_monthly_rating_governance_records.updated_at
            END
          RETURNING
            record_id,
            driver_id,
            period_month,
            rule_type,
            threshold,
            average_rating,
            rating_count,
            consecutive_low_months,
            triggered_months,
            monthly_breakdown,
            status,
            outcome,
            outcome_reason,
            handled_by_actor_id,
            handled_at,
            audit_id,
            created_at,
            updated_at
        `,
        [
          recordId,
          input.driverId,
          input.periodMonth,
          input.ruleType,
          input.threshold,
          input.averageRating,
          input.ratingCount,
          input.consecutiveLowMonths,
          JSON.stringify(input.triggeredMonths),
          JSON.stringify(input.monthlyBreakdown),
          now,
        ],
      );
      if (this.isGovernanceDbRow(result?.rows?.[0])) {
        const mapped = this.mapGovernanceDbRow(result.rows[0]);
        this.memoryGovernanceRecords.set(key, mapped);
        return structuredClone(mapped);
      }
    }

    const unchanged =
      existingMem &&
      existingMem.averageRating === input.averageRating &&
      existingMem.ratingCount === input.ratingCount &&
      existingMem.consecutiveLowMonths === input.consecutiveLowMonths &&
      JSON.stringify(existingMem.triggeredMonths) ===
        JSON.stringify(input.triggeredMonths) &&
      JSON.stringify(existingMem.monthlyBreakdown) ===
        JSON.stringify(input.monthlyBreakdown);

    const nextRecord: ReferralMonthlyRatingGovernanceRecord = {
      recordId,
      driverId: input.driverId,
      periodMonth: input.periodMonth,
      ruleType: input.ruleType,
      threshold: input.threshold,
      averageRating: input.averageRating,
      ratingCount: input.ratingCount,
      consecutiveLowMonths: input.consecutiveLowMonths,
      triggeredMonths: [...input.triggeredMonths],
      monthlyBreakdown: structuredClone(input.monthlyBreakdown),
      status: existingMem?.status ?? "pending",
      outcome: existingMem?.outcome ?? null,
      outcomeReason: existingMem?.outcomeReason ?? null,
      handledByActorId: existingMem?.handledByActorId ?? null,
      handledAt: existingMem?.handledAt ?? null,
      auditId: existingMem?.auditId ?? null,
      createdAt: existingMem?.createdAt ?? now,
      updatedAt: unchanged ? existingMem.updatedAt : now,
    };
    this.memoryGovernanceRecords.set(key, nextRecord);
    return structuredClone(nextRecord);
  }

  private async findGovernanceRecord(filter: {
    recordId?: string | undefined;
    driverId?: string | undefined;
    periodMonth?: string | undefined;
    ruleType?: ReferralMonthlyGovernanceRuleType | undefined;
    preferredOutcome?: ReferralMonthlyGovernanceOutcome | undefined;
  }): Promise<ReferralMonthlyRatingGovernanceRecord | null> {
    const db = this.resolveDatabase();
    if (db?.isEnabled()) {
      if (filter.recordId) {
        const res = await db.query<GovernanceDbRow>(
          `
            SELECT
              record_id,
              driver_id,
              period_month,
              rule_type,
              threshold,
              average_rating,
              rating_count,
              consecutive_low_months,
              triggered_months,
              monthly_breakdown,
              status,
              outcome,
              outcome_reason,
              handled_by_actor_id,
              handled_at,
              audit_id,
              created_at,
              updated_at
            FROM reporting.referral_monthly_rating_governance_records
            WHERE record_id = $1
            LIMIT 1
          `,
          [filter.recordId],
        );
        if (this.isGovernanceDbRow(res?.rows?.[0])) {
          const mapped = this.mapGovernanceDbRow(res.rows[0]);
          this.memoryGovernanceRecords.set(
            this.memoryKey(mapped.driverId, mapped.periodMonth, mapped.ruleType),
            mapped,
          );
          return mapped;
        }
      } else if (filter.driverId && filter.periodMonth) {
        const values: unknown[] = [filter.driverId, filter.periodMonth];
        const ruleClause = filter.ruleType ? `AND rule_type = $3` : "";
        if (filter.ruleType) values.push(filter.ruleType);
        const res = await db.query<GovernanceDbRow>(
          `
            SELECT
              record_id,
              driver_id,
              period_month,
              rule_type,
              threshold,
              average_rating,
              rating_count,
              consecutive_low_months,
              triggered_months,
              monthly_breakdown,
              status,
              outcome,
              outcome_reason,
              handled_by_actor_id,
              handled_at,
              audit_id,
              created_at,
              updated_at
            FROM reporting.referral_monthly_rating_governance_records
            WHERE driver_id = $1 AND period_month = $2 ${ruleClause}
            ORDER BY CASE WHEN rule_type = 'termination_review' THEN 0 ELSE 1 END
          `,
          values,
        );
        const validRows = (res?.rows ?? []).filter((r) =>
          this.isGovernanceDbRow(r),
        );
        if (validRows.length > 0) {
          const mappedRows = validRows.map((r) => this.mapGovernanceDbRow(r));
          for (const m of mappedRows) {
            this.memoryGovernanceRecords.set(
              this.memoryKey(m.driverId, m.periodMonth, m.ruleType),
              m,
            );
          }
          return this.selectMatchingRecord(mappedRows, filter);
        }
      }
    }

    if (filter.recordId) {
      for (const record of this.memoryGovernanceRecords.values()) {
        if (record.recordId === filter.recordId) {
          return structuredClone(record);
        }
      }
      return null;
    }

    if (filter.driverId && filter.periodMonth) {
      const candidates = [...this.memoryGovernanceRecords.values()].filter(
        (record) =>
          record.driverId === filter.driverId &&
          record.periodMonth === filter.periodMonth &&
          (!filter.ruleType || record.ruleType === filter.ruleType),
      );
      return this.selectMatchingRecord(candidates, filter);
    }

    return null;
  }

  private selectMatchingRecord(
    candidates: ReferralMonthlyRatingGovernanceRecord[],
    filter: {
      ruleType?: ReferralMonthlyGovernanceRuleType | undefined;
      preferredOutcome?: ReferralMonthlyGovernanceOutcome | undefined;
    },
  ): ReferralMonthlyRatingGovernanceRecord | null {
    if (candidates.length === 0) return null;
    if (filter.ruleType) {
      const exact = candidates.find((c) => c.ruleType === filter.ruleType);
      return exact ? structuredClone(exact) : null;
    }
    if (filter.preferredOutcome === "terminated") {
      const term = candidates.find((c) => c.ruleType === "termination_review");
      if (term) return structuredClone(term);
    }
    if (filter.preferredOutcome === "coached") {
      const coach = candidates.find((c) => c.ruleType === "coaching");
      if (coach) return structuredClone(coach);
    }
    const pending = candidates.find((c) => c.status === "pending");
    return structuredClone(pending ?? candidates[0]!);
  }

  private isGovernanceDbRow(row: unknown): row is GovernanceDbRow {
    return (
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as GovernanceDbRow).record_id === "string" &&
      typeof (row as GovernanceDbRow).driver_id === "string" &&
      typeof (row as GovernanceDbRow).period_month === "string"
    );
  }

  private mapGovernanceDbRow(
    row: GovernanceDbRow,
  ): ReferralMonthlyRatingGovernanceRecord {
    const triggeredMonths =
      typeof row.triggered_months === "string"
        ? (JSON.parse(row.triggered_months) as string[])
        : row.triggered_months;
    const monthlyBreakdown =
      typeof row.monthly_breakdown === "string"
        ? (JSON.parse(
            row.monthly_breakdown,
          ) as ReferralMonthlyDriverMonthScore[])
        : row.monthly_breakdown;
    const toIso = (val: string | Date | null): string | null => {
      if (val === null || val === undefined) return null;
      return val instanceof Date ? val.toISOString() : String(val);
    };
    return {
      recordId: row.record_id,
      driverId: row.driver_id,
      periodMonth: row.period_month,
      ruleType: row.rule_type,
      threshold: Number(row.threshold),
      averageRating: Number(row.average_rating),
      ratingCount: Number(row.rating_count),
      consecutiveLowMonths: Number(row.consecutive_low_months),
      triggeredMonths: Array.isArray(triggeredMonths)
        ? [...triggeredMonths]
        : [],
      monthlyBreakdown: Array.isArray(monthlyBreakdown)
        ? structuredClone(monthlyBreakdown)
        : [],
      status: row.status,
      outcome: row.outcome,
      outcomeReason: row.outcome_reason,
      handledByActorId: row.handled_by_actor_id,
      handledAt: toIso(row.handled_at),
      auditId: row.audit_id,
      createdAt: toIso(row.created_at)!,
      updatedAt: toIso(row.updated_at)!,
    };
  }

  private resolveDatabase():
    | Pick<DatabaseService, "isEnabled" | "query">
    | undefined {
    if (this.databaseService) {
      return this.databaseService;
    }
    return (
      this.repository as unknown as {
        databaseService?: Pick<DatabaseService, "isEnabled" | "query">;
      }
    ).databaseService;
  }

  private getAuditService(): AuditNotificationService {
    return this.auditNotificationService ?? this.fallbackAuditService;
  }
}
