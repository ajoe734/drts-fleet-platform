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

  const persistedGovernanceRows = new Map<string, Record<string, unknown>>();
  const txSnapshots: Map<string, Record<string, unknown>>[] = [];
  const savepointSnapshots = new Map<
    string,
    Map<string, Record<string, unknown>>
  >();
  const sqlCalls: { sql: string; values: readonly unknown[] }[] = [];

  const cloneRows = (src: Map<string, Record<string, unknown>>) =>
    new Map([...src.entries()].map(([k, v]) => [k, structuredClone(v)]));
  const restoreRows = (snapshot: Map<string, Record<string, unknown>>) => {
    persistedGovernanceRows.clear();
    for (const [k, v] of snapshot.entries()) {
      persistedGovernanceRows.set(k, structuredClone(v));
    }
  };

  const executeSql = async (sql: string, values?: readonly unknown[]) => {
    sqlCalls.push({ sql, values: values ?? [] });
    const normalized = sql.trim();

    if (/^BEGIN\b/i.test(normalized)) {
      txSnapshots.push(cloneRows(persistedGovernanceRows));
      return {
        rows: [],
        rowCount: 0,
        command: "BEGIN",
        oid: 0,
        fields: [],
      } as never;
    }

    if (/^COMMIT\b/i.test(normalized)) {
      txSnapshots.pop();
      return {
        rows: [],
        rowCount: 0,
        command: "COMMIT",
        oid: 0,
        fields: [],
      } as never;
    }

    if (/^ROLLBACK TO SAVEPOINT\s+(\S+)/i.test(normalized)) {
      const sp = /^ROLLBACK TO SAVEPOINT\s+(\S+)/i.exec(normalized)![1]!;
      const snap = savepointSnapshots.get(sp);
      if (snap) {
        restoreRows(snap);
      }
      return {
        rows: [],
        rowCount: 0,
        command: "ROLLBACK",
        oid: 0,
        fields: [],
      } as never;
    }

    if (/^SAVEPOINT\s+(\S+)/i.test(normalized)) {
      const sp = /^SAVEPOINT\s+(\S+)/i.exec(normalized)![1]!;
      savepointSnapshots.set(sp, cloneRows(persistedGovernanceRows));
      return {
        rows: [],
        rowCount: 0,
        command: "SAVEPOINT",
        oid: 0,
        fields: [],
      } as never;
    }

    if (/^RELEASE SAVEPOINT\s+(\S+)/i.test(normalized)) {
      const sp = /^RELEASE SAVEPOINT\s+(\S+)/i.exec(normalized)![1]!;
      savepointSnapshots.delete(sp);
      return {
        rows: [],
        rowCount: 0,
        command: "RELEASE",
        oid: 0,
        fields: [],
      } as never;
    }

    if (/^ROLLBACK\b/i.test(normalized)) {
      const snap = txSnapshots.pop();
      if (snap) {
        restoreRows(snap);
      }
      savepointSnapshots.clear();
      return {
        rows: [],
        rowCount: 0,
        command: "ROLLBACK",
        oid: 0,
        fields: [],
      } as never;
    }

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
  };

  const mockClient = {
    query: (sql: string, values?: readonly unknown[]) =>
      executeSql(sql, values),
    release: vi.fn(),
  };
  const mockPool = {
    connect: vi.fn(async () => mockClient),
    query: (sql: string, values?: readonly unknown[]) =>
      executeSql(sql, values),
    end: vi.fn(async () => undefined),
  };

  const database = new DatabaseService(mockPool as never);
  const querySpy = vi.spyOn(database, "query");

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
    expect(audits).toHaveLength(3);
    expect(audits.map((a) => a.actionName)).toEqual([
      "referral_monthly_rating_governance.dismissed",
      "referral_monthly_rating_governance.terminated",
      "referral_monthly_rating_governance.evaluate",
    ]);
    expect(dismissedEnv.data.auditId).toBe(audits[0]!.auditId);
    expect(terminatedEnv.data.auditId).toBe(audits[1]!.auditId);
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
    expect(audits[2]).toMatchObject({
      actorId: "platform-gov-admin",
      moduleName: "reporting",
      actionName: "referral_monthly_rating_governance.evaluate",
      resourceType: "referral_monthly_rating_governance_report",
      resourceId: "2026-10",
      requestId: "req-term-1",
      newValuesSummary: expect.objectContaining({
        periodMonth: "2026-10",
        driverId: "driver-audit",
        flaggedDriverCount: 1,
        recordCount: 2,
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
            "/control-plane-proxy/reports/referral-monthly-ratings/governance/evaluate" &&
          init.method === "POST"
        ) {
          const body = JSON.parse(String(init.body ?? "{}")) as Partial<{
            periodMonth: string;
            driverId: string;
          }>;
          return h.controller.evaluateGovernance(
            body,
            Object.fromEntries(u.searchParams),
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
    // Initial GET is read-only preview; no DB rows persisted yet
    expect(h.persistedGovernanceRows.size).toBe(0);

    // Clicking '評估／載入跨月輔導與終止紀錄' calls POST /governance/evaluate and persists flagged records in DB
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
    expect(
      fetchBoundary.mock.calls.some(([calledUrl, calledInit]) => {
        const parsed = new URL(
          String(calledUrl),
          "https://socket-free.invalid",
        );
        return (
          parsed.pathname ===
            "/control-plane-proxy/reports/referral-monthly-ratings/governance/evaluate" &&
          calledInit?.method === "POST"
        );
      }),
    ).toBe(true);
    expect(h.persistedGovernanceRows.size).toBe(2);
    expect(
      h.persistedGovernanceRows.get("driver-low-3m::2026-10::coaching"),
    ).toMatchObject({
      record_id: "r04-gov:driver-low-3m:2026-10:coaching",
      status: "pending",
      outcome: null,
    });
    expect(
      h.persistedGovernanceRows.get(
        "driver-low-3m::2026-10::termination_review",
      ),
    ).toMatchObject({
      record_id: "r04-gov:driver-low-3m:2026-10:termination_review",
      status: "pending",
      outcome: null,
    });
    expect(
      h.service.getGovernanceAuditLogs().map((a) => a.actionName),
    ).toEqual(["referral_monthly_rating_governance.evaluate"]);

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
    expect(
      h.service.getGovernanceAuditLogs().map((a) => a.actionName),
    ).toEqual([
      "referral_monthly_rating_governance.terminated",
      "referral_monthly_rating_governance.evaluate",
    ]);

    // Reloading the same month via '查詢／重新整理' must immediately display the persisted handled state
    // rather than fabricating a pending coaching/termination row
    fireEvent.click(screen.getByRole("button", { name: "查詢／重新整理" }));
    const reloadedGovTable = within(
      await screen.findByRole("table", {
        name: "司機月評分輔導與終止處理紀錄",
      }),
    );
    await reloadedGovTable.findByText(
      /已終止 \(terminated\)｜原因：連續三個月低於3.5分，經交通局規則審議終止合作｜處理人：ui-platform-admin/,
    );
  });

  it("evaluates exact near-threshold averages (799/200 < 4.0 and 699/200 < 3.5) without round-before-threshold loss", async () => {
    const near4Bundles = Array.from({ length: 200 }, (_, i) =>
      ratingBundle(
        `near4-${i}`,
        i === 0 ? 3 : 4,
        "2026-06-15T00:00:00.000Z",
        "driver-near4",
      ),
    );
    const near35Bundles = ["2026-04", "2026-05", "2026-06"].flatMap((m) =>
      Array.from({ length: 200 }, (_, i) =>
        ratingBundle(
          `${m}-${i}`,
          i < 99 ? 4 : 3,
          `${m}-15T00:00:00.000Z`,
          "driver-near35",
        ),
      ),
    );

    const h = createHarness(mergeSources(...near4Bundles, ...near35Bundles));
    const r = await h.service.evaluateGovernance({ periodMonth: "2026-06" });

    const near4Streak = r.driverStreaks.find(
      (s) => s.driverId === "driver-near4",
    )!;
    expect(near4Streak.coachingRequired).toBe(true);
    expect(near4Streak.terminationReviewRequired).toBe(false);

    const near35Streak = r.driverStreaks.find(
      (s) => s.driverId === "driver-near35",
    )!;
    expect(near35Streak.coachingRequired).toBe(true);
    expect(near35Streak.terminationReviewRequired).toBe(true);
    expect(near35Streak.consecutiveMonthsBelow35).toBe(3);
  });

  it("keeps reports:read governance GET read-only and rejects zero-row DB updates or failed persistent audit appends", async () => {
    const source = ratingBundle(
      "b-1",
      3,
      "2026-06-15T00:00:00.000Z",
      "driver-boundary",
    );
    const h = createHarness(source);

    // 1. reports:read GET must not issue INSERT INTO reporting.referral_monthly_rating_governance_records
    await h.controller.readGovernance(
      { periodMonth: "2026-06" },
      makeIdentity({ scopes: ["reports:read"] }),
      "req-readonly-get",
    );
    const insertCallsAfterGet = h.sqlCalls.filter((c) =>
      c.sql.includes(
        "INSERT INTO reporting.referral_monthly_rating_governance_records",
      ),
    );
    expect(insertCallsAfterGet).toHaveLength(0);

    // 2. Warm record with DB SELECT missing (0 rows) must NOT fall back to memoryGovernanceRecords on GET or POST
    const coachedWarm = await h.service.recordOutcome(
      {
        driverId: "driver-boundary",
        periodMonth: "2026-06",
        ruleType: "coaching",
        outcome: "coached",
        reason: "初次完成輔導",
      },
      makeIdentity(),
      "req-warm-coach",
    );
    expect(coachedWarm).toMatchObject({
      recordId: "r04-gov:driver-boundary:2026-06:coaching",
      status: "coached",
      outcome: "coached",
      auditId: expect.any(String),
    });
    h.persistedGovernanceRows.clear();

    // PROBE_F3_GET: after DB rows are cleared, GET /governance must NOT return stale 'coached' or stale auditId from memory cache
    const previewAfterDbCleared = await h.controller.readGovernance(
      { periodMonth: "2026-06" },
      makeIdentity({ scopes: ["reports:read"] }),
      "req-probe-f3-get",
    );
    expect(previewAfterDbCleared.data.records).toHaveLength(1);
    expect(previewAfterDbCleared.data.records[0]).toMatchObject({
      recordId: "r04-gov:driver-boundary:2026-06:coaching",
      status: "pending",
      outcome: null,
      outcomeReason: null,
      handledByActorId: null,
      handledAt: null,
      auditId: null,
    });

    await expect(
      h.service.recordOutcome(
        {
          recordId: coachedWarm.recordId,
          outcome: "coached",
          reason: "已完成輔導",
        },
        makeIdentity(),
      ),
    ).rejects.toMatchObject({
      status: 404,
      code: "GOVERNANCE_RECORD_NOT_FOUND",
    });

    // 3. Failed persistent audit append must reject and roll back the DB UPDATE so row remains pending
    const hAuditFail = createHarness(source);
    vi.spyOn(
      hAuditFail.auditService,
      "recordAuditLogAsync",
    ).mockRejectedValueOnce(new Error("injected-audit-storage-unavailable"));
    const evalForAudit = await hAuditFail.service.evaluateGovernance({
      periodMonth: "2026-06",
    });
    await expect(
      hAuditFail.service.recordOutcome(
        {
          recordId: evalForAudit.records[0]!.recordId,
          outcome: "coached",
          reason: "已完成輔導",
        },
        makeIdentity(),
      ),
    ).rejects.toThrow("injected-audit-storage-unavailable");

    expect(
      hAuditFail.persistedGovernanceRows.get(
        "driver-boundary::2026-06::coaching",
      ),
    ).toMatchObject({
      record_id: evalForAudit.records[0]!.recordId,
      status: "pending",
      outcome: null,
      outcome_reason: null,
      handled_by_actor_id: null,
      handled_at: null,
      audit_id: null,
    });
    expect(hAuditFail.service.getGovernanceAuditLogs()).toEqual([]);
    const afterFailedOutcomeRead = await hAuditFail.service.readGovernance({
      periodMonth: "2026-06",
    });
    expect(afterFailedOutcomeRead.records[0]).toMatchObject({
      recordId: evalForAudit.records[0]!.recordId,
      status: "pending",
      outcome: null,
      outcomeReason: null,
      handledByActorId: null,
      handledAt: null,
      auditId: null,
    });

    // 4. Failed outcome audit during auto-materialized recordOutcome rolls back both auto-INSERT and UPDATE
    const hAutoAuditFail = createHarness(source);
    const originalRecordAuditAsync =
      hAutoAuditFail.auditService.recordAuditLogAsync.bind(
        hAutoAuditFail.auditService,
      );
    vi.spyOn(
      hAutoAuditFail.auditService,
      "recordAuditLogAsync",
    ).mockImplementation(async (input) => {
      if (input.actionName === "referral_monthly_rating_governance.coached") {
        throw new Error("injected-auto-outcome-audit-failure");
      }
      return originalRecordAuditAsync(input);
    });
    await expect(
      hAutoAuditFail.service.recordOutcome(
        {
          driverId: "driver-boundary",
          periodMonth: "2026-06",
          ruleType: "coaching",
          outcome: "coached",
          reason: "已完成輔導",
        },
        makeIdentity(),
        "req-auto-fail",
      ),
    ).rejects.toThrow("injected-auto-outcome-audit-failure");
    expect(hAutoAuditFail.persistedGovernanceRows.size).toBe(0);
    expect(hAutoAuditFail.service.getGovernanceAuditLogs()).toEqual([]);
  });
});
