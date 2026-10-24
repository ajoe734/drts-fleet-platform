// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  DRIVER_MONTHLY_RATING_COACHING_THRESHOLD,
  DRIVER_MONTHLY_RATING_TERMINATION_CONSECUTIVE_MONTHS,
  DRIVER_MONTHLY_RATING_TERMINATION_THRESHOLD,
  REFERRAL_MONTHLY_COACHING_THRESHOLD,
  REFERRAL_MONTHLY_NO_DATA_STREAK_RULE,
  REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS,
  REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
  type RecordReferralMonthlyGovernanceOutcomeCommand,
  type ReferralMonthlyRatingGovernanceRecord,
} from "@drts/contracts";
import { ApiClient } from "@drts/api-client";
import { getPlatformAdminClient } from "../../../apps/platform-admin-web/lib/platform-admin-client-factory";
import { ReferralMonthlyRatings } from "../../../apps/platform-admin-web/app/p5-ratings/referral-monthly/report";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { SnakeCaseInterceptor } from "../../../apps/api/src/common/snake-case.interceptor";
import { SnakeCaseExceptionFilter } from "../../../apps/api/src/common/snake-case.exception-filter";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ReportingRepository } from "../../../apps/api/src/modules/reporting/reporting.repository";
import { ReferralMonthlyRatingService } from "../../../apps/api/src/modules/reporting/referral-monthly-rating.service";
import { ReferralMonthlyRatingController } from "../../../apps/api/src/modules/reporting/referral-monthly-rating.controller";

const requireApi = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
);
requireApi("reflect-metadata");
const {
  firstValueFrom,
  from,
}: typeof import("../../../apps/api/node_modules/rxjs") = requireApi("rxjs");

const clientState = vi.hoisted(() => ({
  client: null as ApiClient | null,
}));

vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => clientState.client,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

afterEach(async () => {
  await React.act(async () => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function ratingBundle(
  orderId: string,
  score: number,
  submittedAt: string,
  driverId: string,
) {
  const order = {
    orderId,
    orderNo: `NO-${orderId}`,
    orderSource: "partner",
    orderDomain: "owned",
    status: "completed",
    tenantId: "tenant-r04",
    partnerId: "partner-r04",
    partnerProgramId: "program-r04",
    partnerEntrySlug: "entry-r04",
    referralPassengerLifecycle: {
      rating: {
        orderId,
        score,
        tags: ["準時", "車況佳"],
        comment: `評論-${orderId}`,
        submittedAt,
        contactRequested: false,
        complaintCaseNo: null,
      },
    },
  };
  const task = {
    taskId: `task-${orderId}`,
    orderId,
    assignmentId: `assign-${orderId}`,
    dispatchJobId: `job-${orderId}`,
    driverId,
    vehicleId: `veh-${driverId}`,
    status: "completed",
    completedAt: submittedAt,
  };
  const assignment = {
    assignmentId: task.assignmentId,
    taskId: task.taskId,
    orderId,
    dispatchJobId: task.dispatchJobId,
    driverId,
    vehicleId: task.vehicleId,
    status: "completed",
  };
  return {
    orders: [order],
    driverTasks: [task],
    dispatchAssignments: [assignment],
  };
}

function mergeSources(...items: ReturnType<typeof ratingBundle>[]) {
  return {
    orders: items.flatMap((i) => i.orders),
    driverTasks: items.flatMap((i) => i.driverTasks),
    dispatchAssignments: items.flatMap((i) => i.dispatchAssignments),
  };
}

function makeIdentity(
  overrides: Partial<BootstrapRequestIdentity> = {},
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "platform_admin",
    actorId: "admin-r04-actor",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: ["reports:read", "reports:write"],
    requestId: "req-r04",
    ...overrides,
  };
}

function createHarness(source: ReturnType<typeof mergeSources>) {
  vi.stubEnv("DATABASE_URL", "");
  const database = new DatabaseService();
  vi.spyOn(database, "isEnabled").mockReturnValue(true);

  const persistedGovernanceRows = new Map<string, Record<string, unknown>>();
  const sqlCalls: { sql: string; values: readonly unknown[] }[] = [];

  const querySpy = vi
    .spyOn(database, "query")
    .mockImplementation(async (sql: string, values?: readonly unknown[]) => {
      sqlCalls.push({ sql, values: values ?? [] });

      if (sql.includes("WITH selected_orders AS")) {
        return {
          rows: [{ record: structuredClone(source) }],
          rowCount: 1,
          command: "SELECT",
          oid: 0,
          fields: [],
        } as never;
      }

      if (
        sql.includes(
          "INSERT INTO reporting.referral_monthly_rating_governance_records",
        )
      ) {
        const [
          recordId,
          driverId,
          periodMonth,
          ruleType,
          threshold,
          averageRating,
          ratingCount,
          consecutiveLowMonths,
          triggeredMonthsJson,
          monthlyBreakdownJson,
          nowIso,
        ] = values ?? [];
        const uniqueKey = `${driverId}::${periodMonth}::${ruleType}`;
        const existing = persistedGovernanceRows.get(uniqueKey);
        const unchanged =
          existing &&
          Number(existing.average_rating) === Number(averageRating) &&
          Number(existing.rating_count) === Number(ratingCount) &&
          Number(existing.consecutive_low_months) ===
            Number(consecutiveLowMonths) &&
          existing.triggered_months === triggeredMonthsJson &&
          existing.monthly_breakdown === monthlyBreakdownJson;

        const row = existing
          ? {
              ...existing,
              threshold: Number(threshold).toFixed(2),
              average_rating: Number(averageRating).toFixed(2),
              rating_count: Number(ratingCount),
              consecutive_low_months: Number(consecutiveLowMonths),
              triggered_months: String(triggeredMonthsJson),
              monthly_breakdown: String(monthlyBreakdownJson),
              updated_at: unchanged ? existing.updated_at : String(nowIso),
            }
          : {
              record_id: String(recordId),
              driver_id: String(driverId),
              period_month: String(periodMonth),
              rule_type: String(ruleType),
              threshold: Number(threshold).toFixed(2),
              average_rating: Number(averageRating).toFixed(2),
              rating_count: Number(ratingCount),
              consecutive_low_months: Number(consecutiveLowMonths),
              triggered_months: String(triggeredMonthsJson),
              monthly_breakdown: String(monthlyBreakdownJson),
              status: "pending",
              outcome: null,
              outcome_reason: null,
              handled_by_actor_id: null,
              handled_at: null,
              audit_id: null,
              created_at: String(nowIso),
              updated_at: String(nowIso),
            };
        persistedGovernanceRows.set(uniqueKey, row);
        return {
          rows: [structuredClone(row)],
          rowCount: 1,
          command: "INSERT",
          oid: 0,
          fields: [],
        } as never;
      }

      if (
        sql.includes(
          "SELECT\n              record_id,\n              driver_id",
        ) &&
        sql.includes(
          "FROM reporting.referral_monthly_rating_governance_records",
        )
      ) {
        let rows = [...persistedGovernanceRows.values()];
        if (sql.includes("WHERE record_id = $1")) {
          rows = rows.filter((r) => r.record_id === values?.[0]);
        } else if (sql.includes("WHERE driver_id = $1 AND period_month = $2")) {
          rows = rows.filter(
            (r) =>
              r.driver_id === values?.[0] &&
              r.period_month === values?.[1] &&
              (!values?.[2] || r.rule_type === values[2]),
          );
        }
        return {
          rows: structuredClone(rows),
          rowCount: rows.length,
          command: "SELECT",
          oid: 0,
          fields: [],
        } as never;
      }

      if (
        sql.includes(
          "UPDATE reporting.referral_monthly_rating_governance_records",
        )
      ) {
        const [recordId, outcome, reason, actorId, handledAt, auditId] =
          values ?? [];
        const entry = [...persistedGovernanceRows.entries()].find(
          ([, row]) => row.record_id === recordId,
        );
        if (!entry) {
          return {
            rows: [],
            rowCount: 0,
            command: "UPDATE",
            oid: 0,
            fields: [],
          } as never;
        }
        const [key, existing] = entry;
        const updated = {
          ...existing,
          status: String(outcome),
          outcome: String(outcome),
          outcome_reason: String(reason),
          handled_by_actor_id: String(actorId),
          handled_at: String(handledAt),
          audit_id: String(auditId),
          updated_at: String(handledAt),
        };
        persistedGovernanceRows.set(key, updated);
        return {
          rows: [structuredClone(updated)],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        } as never;
      }

      throw new Error(`Unexpected SQL in test harness: ${sql}`);
    });

  const auditService = new AuditNotificationService();
  const repo = new ReportingRepository(database);
  const service = new ReferralMonthlyRatingService(
    repo,
    database,
    auditService,
  );
  const controller = new ReferralMonthlyRatingController(service);

  return {
    database,
    querySpy,
    sqlCalls,
    persistedGovernanceRows,
    auditService,
    repo,
    service,
    controller,
  };
}

describe("Bureau R04: monthly driver rating coaching (< 4.0) and consecutive low rating termination (< 3.5 for 3 months)", () => {
  it("exports named threshold constants matching the bureau specification and defines the PostgreSQL governance migration", () => {
    expect(REFERRAL_MONTHLY_COACHING_THRESHOLD).toBe(4.0);
    expect(DRIVER_MONTHLY_RATING_COACHING_THRESHOLD).toBe(4.0);
    expect(REFERRAL_MONTHLY_TERMINATION_THRESHOLD).toBe(3.5);
    expect(DRIVER_MONTHLY_RATING_TERMINATION_THRESHOLD).toBe(3.5);
    expect(REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS).toBe(3);
    expect(DRIVER_MONTHLY_RATING_TERMINATION_CONSECUTIVE_MONTHS).toBe(3);
    expect(REFERRAL_MONTHLY_NO_DATA_STREAK_RULE).toBe(
      "no_data_breaks_consecutive_calendar_months",
    );

    const migrationSql = readFileSync(
      resolve(
        process.cwd(),
        "infra/migrations/V0130__referral_monthly_rating_governance.sql",
      ),
      "utf8",
    );
    expect(migrationSql).toContain(
      "CREATE TABLE IF NOT EXISTS reporting.referral_monthly_rating_governance_records",
    );
    expect(migrationSql).toContain("UNIQUE (driver_id, period_month, rule_type)");
    expect(migrationSql).toContain(
      "CHECK (rule_type IN ('coaching', 'termination_review'))",
    );
    expect(migrationSql).toContain(
      "CHECK (status IN ('pending', 'coached', 'terminated', 'dismissed'))",
    );
  });

  it("flags avg < 4.0 for coaching and 3 consecutive Taipei months < 3.5 for termination review, while keeping >= 4.0 unflagged", async () => {
    // driver-ok: 2026-10 average = 4.00 (not < 4.0)
    // driver-coach-only: 2026-08 avg 3.0, 2026-09 avg 3.5 (not < 3.5), 2026-10 avg 3.8 (< 4.0)
    // driver-term: 2026-08 avg 3.2, 2026-09 avg 3.4, 2026-10 avg 3.0 (all 3 consecutive < 3.5)
    const source = mergeSources(
      ratingBundle("ok-1", 4, "2026-10-10T02:00:00.000Z", "driver-ok"),
      ratingBundle("c-aug", 3, "2026-08-15T02:00:00.000Z", "driver-coach-only"),
      ratingBundle("c-sep-1", 3, "2026-09-15T02:00:00.000Z", "driver-coach-only"),
      ratingBundle("c-sep-2", 4, "2026-09-16T02:00:00.000Z", "driver-coach-only"),
      ratingBundle("c-oct-1", 3, "2026-10-15T02:00:00.000Z", "driver-coach-only"),
      ratingBundle("c-oct-2", 4, "2026-10-16T02:00:00.000Z", "driver-coach-only"),
      ratingBundle("c-oct-3", 4, "2026-10-17T02:00:00.000Z", "driver-coach-only"),
      ratingBundle("t-aug", 3, "2026-08-12T02:00:00.000Z", "driver-term"),
      ratingBundle("t-sep", 3, "2026-09-12T02:00:00.000Z", "driver-term"),
      ratingBundle("t-oct", 3, "2026-10-12T02:00:00.000Z", "driver-term"),
    );

    const h = createHarness(source);
    const gov = await h.service.evaluateGovernance({ periodMonth: "2026-10" });

    expect(gov.evaluatedWindowMonths).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(gov.flaggedDrivers.map((d) => d.driverId)).toEqual([
      "driver-coach-only",
      "driver-term",
    ]);

    const coachOnly = gov.flaggedDrivers.find(
      (d) => d.driverId === "driver-coach-only",
    )!;
    expect(coachOnly).toMatchObject({
      driverId: "driver-coach-only",
      periodMonth: "2026-10",
      averageRating: 3.67,
      coachingRequired: true,
      terminationReviewRequired: false,
      consecutiveMonthsBelow35: 0,
      triggeredMonths: ["2026-10"],
    });
    expect(coachOnly.records).toHaveLength(1);
    expect(coachOnly.records[0]).toMatchObject({
      ruleType: "coaching",
      threshold: 4.0,
      triggeredMonths: ["2026-10"],
      status: "pending",
    });

    const termDriver = gov.flaggedDrivers.find(
      (d) => d.driverId === "driver-term",
    )!;
    expect(termDriver).toMatchObject({
      driverId: "driver-term",
      periodMonth: "2026-10",
      averageRating: 3,
      coachingRequired: true,
      terminationReviewRequired: true,
      consecutiveMonthsBelow35: 3,
      triggeredMonths: ["2026-08", "2026-09", "2026-10"],
    });
    expect(termDriver.records.map((r) => r.ruleType)).toEqual([
      "coaching",
      "termination_review",
    ]);
    const termRecord = termDriver.records.find(
      (r) => r.ruleType === "termination_review",
    )!;
    expect(termRecord).toMatchObject({
      driverId: "driver-term",
      periodMonth: "2026-10",
      ruleType: "termination_review",
      threshold: 3.5,
      consecutiveLowMonths: 3,
      triggeredMonths: ["2026-08", "2026-09", "2026-10"],
      status: "pending",
    });
  });

  it("treats months with no ratings as 'no_data' (averageRating: null, never 0) and breaks consecutive < 3.5 streaks across an unrated month", async () => {
    // driver-gap has ratings < 3.5 in 2026-08 and 2026-10, but NO ratings in 2026-09
    const source = mergeSources(
      ratingBundle("gap-aug", 2, "2026-08-10T04:00:00.000Z", "driver-gap"),
      ratingBundle("gap-oct", 2, "2026-10-10T04:00:00.000Z", "driver-gap"),
    );
    const h = createHarness(source);

    // 1. Evaluating 2026-09 (the month with no ratings) must NOT treat 0 ratings as score 0
    const sepGov = await h.service.evaluateGovernance({
      periodMonth: "2026-09",
      driverId: "driver-gap",
    });
    expect(sepGov.flaggedDrivers).toEqual([]);
    expect(sepGov.records).toEqual([]);
    expect(sepGov.driverStreaks[0]).toMatchObject({
      driverId: "driver-gap",
      periodMonth: "2026-09",
      consecutiveMonthsBelow35: 0,
      coachingRequired: false,
      terminationReviewRequired: false,
      triggeredMonths: [],
    });
    const sepMonthBreakdown = sepGov.driverStreaks[0]!.monthlyBreakdown.find(
      (m) => m.periodMonth === "2026-09",
    )!;
    expect(sepMonthBreakdown).toEqual({
      periodMonth: "2026-09",
      ratingCount: 0,
      averageRating: null,
      status: "no_data",
      belowCoachingThreshold: false,
      belowTerminationThreshold: false,
    });

    // 2. Evaluating 2026-10 must see 2026-09 as 'no_data', breaking the consecutive < 3.5 streak
    const octGov = await h.service.evaluateGovernance({
      periodMonth: "2026-10",
      driverId: "driver-gap",
    });
    expect(octGov.flaggedDrivers).toHaveLength(1);
    expect(octGov.flaggedDrivers[0]).toMatchObject({
      driverId: "driver-gap",
      periodMonth: "2026-10",
      coachingRequired: true,
      terminationReviewRequired: false,
      consecutiveMonthsBelow35: 1,
      triggeredMonths: ["2026-10"],
    });
    expect(octGov.records).toHaveLength(1);
    expect(octGov.records[0]!.ruleType).toBe("coaching");
    expect(octGov.records[0]!.monthlyBreakdown).toEqual([
      {
        periodMonth: "2026-08",
        ratingCount: 1,
        averageRating: 2,
        status: "rated",
        belowCoachingThreshold: true,
        belowTerminationThreshold: true,
      },
      {
        periodMonth: "2026-09",
        ratingCount: 0,
        averageRating: null,
        status: "no_data",
        belowCoachingThreshold: false,
        belowTerminationThreshold: false,
      },
      {
        periodMonth: "2026-10",
        ratingCount: 1,
        averageRating: 2,
        status: "rated",
        belowCoachingThreshold: true,
        belowTerminationThreshold: true,
      },
    ]);
  });

  it("is idempotent per driver+month across repeated evaluations and preserves recorded outcomes", async () => {
    const source = mergeSources(
      ratingBundle("idem-aug", 3, "2026-08-05T03:00:00.000Z", "driver-idem"),
      ratingBundle("idem-sep", 2, "2026-09-05T03:00:00.000Z", "driver-idem"),
      ratingBundle("idem-oct", 3, "2026-10-05T03:00:00.000Z", "driver-idem"),
    );
    const h = createHarness(source);

    const first = await h.service.evaluateGovernance({
      periodMonth: "2026-10",
    });
    expect(first.records).toHaveLength(2);
    expect(h.persistedGovernanceRows.size).toBe(2);

    const second = await h.service.evaluateGovernance({
      periodMonth: "2026-10",
    });
    expect(second.records).toEqual(first.records);
    expect(h.persistedGovernanceRows.size).toBe(2);

    // Record 'coached' on the coaching record and 'terminated' on the termination_review record
    const identity = makeIdentity({ actorId: "ops-reviewer-1", realm: "ops" });
    const coached = await h.service.recordOutcome(
      {
        driverId: "driver-idem",
        periodMonth: "2026-10",
        ruleType: "coaching",
        outcome: "coached",
        reason: "已完成服務禮儀與路線規劃輔導",
      },
      identity,
      "req-idem-coach",
    );
    expect(coached).toMatchObject({
      driverId: "driver-idem",
      periodMonth: "2026-10",
      ruleType: "coaching",
      status: "coached",
      outcome: "coached",
      outcomeReason: "已完成服務禮儀與路線規劃輔導",
      handledByActorId: "ops-reviewer-1",
      auditId: expect.any(String),
    });

    // Re-evaluating the same month must preserve the recorded outcome
    const third = await h.service.evaluateGovernance({
      periodMonth: "2026-10",
    });
    const thirdCoaching = third.records.find((r) => r.ruleType === "coaching")!;
    expect(thirdCoaching).toEqual(coached);
  });

  it("enforces auth boundaries, validates outcome & reason, and writes an audit trail for every outcome action", async () => {
    const source = mergeSources(
      ratingBundle("a-aug", 2, "2026-08-05T03:00:00.000Z", "driver-audit"),
      ratingBundle("a-sep", 2, "2026-09-05T03:00:00.000Z", "driver-audit"),
      ratingBundle("a-oct", 2, "2026-10-05T03:00:00.000Z", "driver-audit"),
    );
    const h = createHarness(source);

    // Route auth policy checks
    const getPolicy = resolveRouteAuthPolicy(
      "GET",
      "/api/reports/referral-monthly-ratings/governance?periodMonth=2026-10",
    );
    expect(getPolicy?.requiredScopes).toEqual(["reports:read"]);
    expect(getPolicy?.allowedRealms).toEqual(["system", "platform", "ops"]);

    const postPolicy = resolveRouteAuthPolicy(
      "POST",
      "/api/reports/referral-monthly-ratings/governance/outcomes",
    );
    expect(postPolicy?.requiredScopes).toEqual(["reports:write"]);
    expect(postPolicy?.allowedRealms).toEqual(["system", "platform", "ops"]);

    // 1. Unauthenticated caller rejected with 401
    await expect(
      h.controller.recordOutcome(
        {
          driverId: "driver-audit",
          periodMonth: "2026-10",
          ruleType: "coaching",
          outcome: "coached",
          reason: "valid reason",
        },
        null,
      ),
    ).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });

    // 2. Unauthorized realm (tenant) rejected with 403
    await expect(
      h.controller.recordOutcome(
        {
          driverId: "driver-audit",
          periodMonth: "2026-10",
          ruleType: "coaching",
          outcome: "coached",
          reason: "valid reason",
        },
        makeIdentity({ realm: "tenant" }),
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

    // 3. Read-only scope without reports:write rejected with 403
    await expect(
      h.controller.recordOutcome(
        {
          driverId: "driver-audit",
          periodMonth: "2026-10",
          ruleType: "coaching",
          outcome: "coached",
          reason: "valid reason",
        },
        makeIdentity({ scopes: ["reports:read"] }),
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

    // 4. Empty reason rejected with 400
    await expect(
      h.controller.recordOutcome(
        {
          driverId: "driver-audit",
          periodMonth: "2026-10",
          ruleType: "coaching",
          outcome: "coached",
          reason: "   ",
        },
        makeIdentity(),
      ),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    // 5. Authorised platform admin records 'terminated' and 'dismissed' outcomes; all audited
    const terminatedEnv = await h.controller.recordOutcome(
      {
        driverId: "driver-audit",
        periodMonth: "2026-10",
        ruleType: "termination_review",
        outcome: "terminated",
        reason: "連續三個月平均低於 3.5，依規定終止派遣合作",
      },
      makeIdentity({ actorId: "platform-gov-admin" }),
      "req-term-1",
    );
    expect(terminatedEnv.data).toMatchObject({
      driverId: "driver-audit",
      periodMonth: "2026-10",
      ruleType: "termination_review",
      triggeredMonths: ["2026-08", "2026-09", "2026-10"],
      status: "terminated",
      outcome: "terminated",
      outcomeReason: "連續三個月平均低於 3.5，依規定終止派遣合作",
      handledByActorId: "platform-gov-admin",
      auditId: expect.any(String),
    });

    const dismissedEnv = await h.controller.recordOutcomeByRecordId(
      "r04-gov:driver-audit:2026-10:coaching",
      {
        outcome: "dismissed",
        reason: "已併入連續三個月低分終止案處理",
      },
      makeIdentity({ actorId: "platform-gov-admin" }),
      "req-dismiss-1",
    );
    expect(dismissedEnv.data).toMatchObject({
      recordId: "r04-gov:driver-audit:2026-10:coaching",
      status: "dismissed",
      outcome: "dismissed",
      outcomeReason: "已併入連續三個月低分終止案處理",
      handledByActorId: "platform-gov-admin",
      auditId: expect.any(String),
    });

    const audits = h.service.getGovernanceAuditLogs();
    expect(audits).toHaveLength(2);
    expect(audits.map((a) => a.actionName)).toEqual([
      "referral_monthly_rating_governance.dismissed",
      "referral_monthly_rating_governance.terminated",
    ]);
    expect(audits[1]).toMatchObject({
      actorId: "platform-gov-admin",
      moduleName: "reporting",
      resourceType: "referral_monthly_rating_governance_record",
      resourceId: "r04-gov:driver-audit:2026-10:termination_review",
      requestId: "req-term-1",
      newValuesSummary: expect.objectContaining({
        outcome: "terminated",
        outcomeReason: "連續三個月平均低於 3.5，依規定終止派遣合作",
        triggeredMonths: ["2026-08", "2026-09", "2026-10"],
      }),
    });
  });

  it("renders flagged drivers, triggered months, and records outcomes through the platform-admin UI and wire serializer", async () => {
    const source = mergeSources(
      ratingBundle("ui-aug", 2, "2026-08-10T01:00:00.000Z", "driver-low-3m"),
      ratingBundle("ui-sep", 3, "2026-09-10T01:00:00.000Z", "driver-low-3m"),
      ratingBundle("ui-oct", 2, "2026-10-10T01:00:00.000Z", "driver-low-3m"),
    );
    const h = createHarness(source);
    const serializer = new SnakeCaseInterceptor();
    const exceptionFilter = new SnakeCaseExceptionFilter();
    const adminIdentity = makeIdentity({ actorId: "ui-platform-admin" });

    const fetchBoundary = vi.fn(async (url: string, init: RequestInit) => {
      const u = new URL(url, "https://socket-free.invalid");
      const headers = new Headers(init.headers);
      const reqId = headers.get("X-Request-Id") ?? "ui-req";
      let wire: unknown;
      let status = 200;

      const invokeController = async () => {
        if (
          u.pathname === "/control-plane-proxy/reports/referral-monthly-ratings" &&
          init.method === "GET"
        ) {
          return h.controller.read(
            {
              ...Object.fromEntries(u.searchParams),
              periodMonth: u.searchParams.get("periodMonth") ?? "",
            },
            reqId,
          );
        }
        if (
          u.pathname ===
            "/control-plane-proxy/reports/referral-monthly-ratings/governance" &&
          init.method === "GET"
        ) {
          return h.controller.readGovernance(
            {
              ...Object.fromEntries(u.searchParams),
              periodMonth: u.searchParams.get("periodMonth") ?? "",
            },
            adminIdentity,
            reqId,
          );
        }
        if (
          u.pathname ===
            "/control-plane-proxy/reports/referral-monthly-ratings/governance/outcomes" &&
          init.method === "POST"
        ) {
          const body = JSON.parse(
            String(init.body ?? "{}"),
          ) as RecordReferralMonthlyGovernanceOutcomeCommand;
          return h.controller.recordOutcome(body, adminIdentity, reqId);
        }
        throw new Error(`Unhandled test route: ${init.method} ${u.pathname}`);
      };

      try {
        wire = await firstValueFrom(
          serializer.intercept(
            {} as Parameters<SnakeCaseInterceptor["intercept"]>[0],
            {
              handle: () => from(invokeController()),
            },
          ),
        );
      } catch (err) {
        exceptionFilter.catch(err, {
          switchToHttp: () => ({
            getResponse: () => ({
              status: (code: number) => {
                status = code;
                return {
                  json: (body: unknown) => {
                    wire = body;
                  },
                };
              },
            }),
          }),
        } as Parameters<SnakeCaseExceptionFilter["catch"]>[1]);
      }

      return new Response(JSON.stringify(wire), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchBoundary);
    clientState.client = getPlatformAdminClient("/control-plane-proxy");

    render(<ReferralMonthlyRatings />);
    fireEvent.change(screen.getByLabelText("月份"), {
      target: { value: "2026-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查詢／重新整理" }));

    await screen.findByText(/評價數：1；平均：2.00/);

    // Load multi-month governance records (coaching + 3-month termination review)
    fireEvent.click(
      screen.getByRole("button", { name: "評估／載入跨月輔導與終止紀錄" }),
    );

    const govTable = within(
      await screen.findByRole("table", {
        name: "司機月評分輔導與終止處理紀錄",
      }),
    );
    await govTable.findByText("2026-08、2026-09、2026-10");
    expect(govTable.getByText("連續 3 個月低於 3.5 要終止")).toBeTruthy();
    expect(govTable.getByText("月平均低於 4.0 要輔導")).toBeTruthy();

    // Record 'terminated' outcome on the termination_review row
    fireEvent.change(
      screen.getByLabelText("處置結果 driver-low-3m termination_review"),
      { target: { value: "terminated" } },
    );
    fireEvent.change(
      screen.getByLabelText("處置原因 driver-low-3m termination_review"),
      { target: { value: "連續三個月低於3.5分，經交通局規則審議終止合作" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "儲存處置 driver-low-3m termination_review",
      }),
    );

    await govTable.findByText(
      /已終止 \(terminated\)｜原因：連續三個月低於3.5分，經交通局規則審議終止合作｜處理人：ui-platform-admin/,
    );
    expect(h.service.getGovernanceAuditLogs()).toHaveLength(1);
  });
});
