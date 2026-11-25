import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import type {
  BrowserContext,
  Download,
  Locator,
  Page,
  Route,
} from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  SixMonthMonthlyOperationsSummary,
  SixMonthOperationsSummary,
} from "@drts/contracts";
import { recordsToCsv } from "../../../apps/api/src/common/csv";
import { recordsToPdf } from "../../../apps/api/src/modules/reporting-filing/report-renderers";
import { Evidence, hash, type ObjectData } from "./protocol";
import {
  R10_JSON_EXPORT_NOTICE,
  R10_MONTHLY_CSV_COLUMNS,
  R10_SUMMARY_PDF_COLUMNS,
  assertR10VerifiedOpsRole,
  compareSixMonthSummaryGenerations,
  lastDayOfYearMonth,
  resolveSixMonthOperationsWindow,
  runR10OperationsDownloads,
  shiftYearMonth,
  toTaipeiYearMonth,
  toUtcYearMonth,
  validateR10JobArtifactDownload,
  validateR10JsonBlobDownload,
  validateSixMonthOperationsPreview,
  type R10ControlledCaseSourceFact,
  type R10OwnCaseInput,
  type R10VerifiedOpsRole,
} from "./r10-operations-downloads";

const DEFINITION_SHA = "a".repeat(40);
const RUNTIME_SHA = "b".repeat(40);
const OPS_ORIGIN = "https://ops.example.test";
const ENTRY_SLUG = "yuhe-residence";
const TENANT_ID = "tenant-demo-001";
const PARTNER_ID = "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118";
const MAIN_ORDER_ID = "ord-r10-main-001";

const OPS_ROLE: R10VerifiedOpsRole = Object.freeze({
  realm: "ops",
  actorType: "ops_user",
  principalId: "ops-principal-001",
  membershipId: "ops-member-001",
  sessionId: "ops-session-001",
  scopes: [
    "owned:read",
    "owned:write",
    "dispatch:read",
    "dispatch:write",
    "complaints:read",
    "complaints:write",
    "reports:read",
    "reports:write",
    "audit:read",
  ],
});

const SEVEN_OWN_CASES: readonly R10OwnCaseInput[] = Object.freeze([
  { caseNo: "CMP-LOW-MAIN", orderId: MAIN_ORDER_ID, source: "lowRatingAuto" },
  { caseNo: "CMP-LOW-C2", orderId: "ord-r10-c2", source: "lowRatingAuto" },
  { caseNo: "CMP-LOW-C3", orderId: "ord-r10-c3", source: "lowRatingAuto" },
  { caseNo: "CMP-LOW-C4", orderId: "ord-r10-c4", source: "lowRatingAuto" },
  {
    caseNo: "CMP-MAN-SERVICE",
    orderId: MAIN_ORDER_ID,
    source: "manual",
    category: "driver_service",
  },
  {
    caseNo: "CMP-MAN-FARE",
    orderId: MAIN_ORDER_ID,
    source: "manual",
    category: "fare_dispute",
  },
  {
    caseNo: "CMP-MAN-LOST",
    orderId: MAIN_ORDER_ID,
    source: "manual",
    category: "lost_and_found",
  },
]);

function buildOrderFixture(overrides: Partial<ObjectData> = {}): ObjectData {
  return {
    orderId: MAIN_ORDER_ID,
    orderNo: "DRT-20261123-0001",
    status: "completed",
    orderSource: "portal",
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
    partnerEntrySlug: ENTRY_SLUG,
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    serviceProductCode: "enterprise_dispatch",
    createdAt: "2026-11-15T04:00:00.000Z",
    reservationWindowStart: null,
    ...overrides,
  };
}

function buildControlledCaseFacts(options?: {
  crossMonthUtcBoundary?: boolean | undefined;
}): R10ControlledCaseSourceFact[] {
  const cross = options?.crossMonthUtcBoundary === true;
  return SEVEN_OWN_CASES.map((item) => {
    const isService = item.caseNo === "CMP-MAN-SERVICE";
    // When crossMonthUtcBoundary=true, CMP-MAN-FARE is created at
    // 2026-10-31T16:30:00.000Z (UTC 2026-10, Asia/Taipei 2026-11-01 00:30)
    // on an October order (2026-10-20T03:00:00.000Z).
    const isCrossSample = cross && item.caseNo === "CMP-MAN-FARE";
    return {
      caseNo: item.caseNo,
      orderId: item.orderId,
      source: item.source,
      category: item.category ?? "driver_service",
      status: isService ? "closed" : "new",
      createdAt: isCrossSample
        ? "2026-10-31T16:30:00.000Z"
        : "2026-11-15T05:00:00.000Z",
      slaDueAt: "2026-12-15T05:00:00.000Z",
      closedAt: isService ? "2026-11-15T06:00:00.000Z" : null,
      orderCreatedAt: isCrossSample
        ? "2026-10-20T03:00:00.000Z"
        : "2026-11-15T04:00:00.000Z",
    };
  });
}

function buildSixMonthSummaryFixture(options?: {
  generatedAt?: string;
  complaintStatisticsAsOf?: string;
  crossMonthUtcBoundary?: boolean;
}): SixMonthOperationsSummary[] {
  const generatedAt = options?.generatedAt ?? "2026-11-23T02:10:00.000Z";
  const complaintStatisticsAsOf =
    options?.complaintStatisticsAsOf ?? "2026-11-23T02:10:00.000Z";
  const window = resolveSixMonthOperationsWindow("2026-11");

  const buildDimension = (
    businessArea: string,
    serviceProductCode: string,
    isOwn: boolean,
  ): SixMonthOperationsSummary => {
    const monthlySummaries: SixMonthMonthlyOperationsSummary[] =
      window.periods.map((periodMonth, idx) => {
        const isNov = periodMonth === "2026-11";
        const isOct = periodMonth === "2026-10";
        // Exercise all three snapshot states across the 6 months:
        // - idx 0..3 (2026-06..09): validSnapshotCount = 0 -> average = null
        // - idx 4 (2026-10): validSnapshotCount = 2, vehicle sum = 0 -> average = 0 (true numeric 0!)
        // - idx 5 (2026-11): validSnapshotCount = 4, average = 3.5
        const validSnapshotCount = isNov ? 4 : isOct ? 2 : 0;
        const expectedSnapshotCount = 8640;
        const averageDispatchableVehicleCount = isNov ? 3.5 : isOct ? 0 : null;
        const snapshotCoverageRate =
          validSnapshotCount > 0
            ? Number((validSnapshotCount / expectedSnapshotCount).toFixed(4))
            : 0;

        const demandRequestCount = isOwn
          ? isNov
            ? 5
            : isOct
              ? 1
              : 0
          : isNov
            ? 2
            : 0;
        const actualDispatchCount = isOwn
          ? isNov
            ? 4
            : isOct
              ? 1
              : 0
          : isNov
            ? 1
            : 0;
        const completedTripCount = isOwn
          ? isNov
            ? 3
            : isOct
              ? 1
              : 0
          : isNov
            ? 1
            : 0;
        const cancelledOrderCount = isOwn ? (isNov ? 1 : 0) : 0;
        const onTimeTripCount = isOwn
          ? isNov
            ? 2
            : isOct
              ? 1
              : 0
          : isNov
            ? 1
            : 0;
        const lateTripCount = isOwn && isNov ? 1 : 0;
        const noShowTripCount = isOwn && isNov ? 1 : 0;
        const punctualityUnknownTripCount = 0;

        const complaintCount = isOwn && isNov ? 7 : 0;
        const complaintsByCategory: Record<string, number> =
          isOwn && isNov
            ? {
                driver_service: 5,
                fare_dispute: 1,
                lost_and_found: 1,
              }
            : {};

        return {
          periodMonth,
          from: `${periodMonth}-01`,
          to: lastDayOfYearMonth(periodMonth),
          businessArea,
          serviceProductCode,
          demandRequestCount,
          actualDispatchCount,
          completedTripCount,
          cancelledOrderCount,
          averageDispatchableVehicleCount,
          validSnapshotCount,
          expectedSnapshotCount,
          snapshotCoverageRate,
          complaintCount,
          complaintsByCategory,
          lateArrivalThresholdMinutes: 10,
          onTimeTripCount,
          lateTripCount,
          noShowTripCount,
          punctualityUnknownTripCount,
          complaintCreatedLowRatingAutoCount: isOwn && isNov ? 4 : 0,
          complaintCreatedManualCount: isOwn && isNov ? 3 : 0,
          complaintClosedLowRatingAutoCount: 0,
          complaintClosedManualCount: isOwn && isNov ? 1 : 0,
          complaintOverdueLowRatingAutoCount: 0,
          complaintOverdueManualCount: 0,
          complaintStatisticsAsOf,
          generatedAt,
          ...(idx >= 0 ? {} : {}),
        };
      });

    const complaintMonthlyStatistics = window.periods.map((periodMonth) => {
      const isNov = periodMonth === "2026-11";
      const lowCreated =
        isOwn && isNov
          ? ["CMP-LOW-MAIN", "CMP-LOW-C2", "CMP-LOW-C3", "CMP-LOW-C4"]
          : [];
      const manCreated =
        isOwn && isNov
          ? ["CMP-MAN-SERVICE", "CMP-MAN-FARE", "CMP-MAN-LOST"]
          : [];
      const manClosed = isOwn && isNov ? ["CMP-MAN-SERVICE"] : [];
      return {
        periodMonth,
        timeZone: "Asia/Taipei" as const,
        lowRatingAuto: {
          createdCount: lowCreated.length,
          closedCount: 0,
          overdueCount: 0,
          createdCaseNos: lowCreated,
          closedCaseNos: [],
          overdueCaseNos: [],
        },
        manual: {
          createdCount: manCreated.length,
          closedCount: manClosed.length,
          overdueCount: 0,
          createdCaseNos: manCreated,
          closedCaseNos: manClosed,
          overdueCaseNos: [],
        },
        manualByCategory:
          isOwn && isNov
            ? [
                {
                  category: "driver_service",
                  createdCount: 1,
                  closedCount: 1,
                  overdueCount: 0,
                  createdCaseNos: ["CMP-MAN-SERVICE"],
                  closedCaseNos: ["CMP-MAN-SERVICE"],
                  overdueCaseNos: [],
                },
                {
                  category: "fare_dispute",
                  createdCount: 1,
                  closedCount: 0,
                  overdueCount: 0,
                  createdCaseNos: ["CMP-MAN-FARE"],
                  closedCaseNos: [],
                  overdueCaseNos: [],
                },
                {
                  category: "lost_and_found",
                  createdCount: 1,
                  closedCount: 0,
                  overdueCount: 0,
                  createdCaseNos: ["CMP-MAN-LOST"],
                  closedCaseNos: [],
                  overdueCaseNos: [],
                },
              ]
            : [],
      };
    });

    const sum = (
      pick: (m: SixMonthMonthlyOperationsSummary) => number,
    ): number => monthlySummaries.reduce((acc, item) => acc + pick(item), 0);

    const totalValidSnapshots = sum((m) => m.validSnapshotCount);
    const totalExpectedSnapshots = sum((m) => m.expectedSnapshotCount);

    return {
      from: window.canonicalFrom,
      to: window.canonicalTo,
      businessArea,
      serviceProductCode,
      demandRequestCount: sum((m) => m.demandRequestCount),
      actualDispatchCount: sum((m) => m.actualDispatchCount),
      completedTripCount: sum((m) => m.completedTripCount),
      cancelledOrderCount: sum((m) => m.cancelledOrderCount),
      // Weighted raw sum: 4 * 3.5 + 2 * 0 = 14 / 6 = 2.33
      averageDispatchableVehicleCount: totalValidSnapshots > 0 ? 2.33 : null,
      validSnapshotCount: totalValidSnapshots,
      expectedSnapshotCount: totalExpectedSnapshots,
      snapshotCoverageRate: Number(
        (totalValidSnapshots / totalExpectedSnapshots).toFixed(4),
      ),
      complaintCount: sum((m) => m.complaintCount),
      complaintsByCategory: isOwn
        ? {
            driver_service: 5,
            fare_dispute: 1,
            lost_and_found: 1,
          }
        : {},
      lateArrivalThresholdMinutes: 10,
      onTimeTripCount: sum((m) => m.onTimeTripCount ?? 0),
      lateTripCount: sum((m) => m.lateTripCount ?? 0),
      noShowTripCount: sum((m) => m.noShowTripCount ?? 0),
      punctualityUnknownTripCount: sum(
        (m) => m.punctualityUnknownTripCount ?? 0,
      ),
      complaintCreatedLowRatingAutoCount: isOwn ? 4 : 0,
      complaintCreatedManualCount: isOwn ? 3 : 0,
      complaintClosedLowRatingAutoCount: 0,
      complaintClosedManualCount: isOwn ? 1 : 0,
      complaintOverdueLowRatingAutoCount: 0,
      complaintOverdueManualCount: 0,
      complaintStatisticsAsOf,
      monthlySummaries,
      drilldown: {
        punctuality: {
          definitionVersion: "2026-10-24.r10.v1",
          lateArrivalThresholdMinutes: 10,
          assignedTripCount: sum((m) => m.actualDispatchCount),
          onTimeTripCount: sum((m) => m.onTimeTripCount ?? 0),
          lateTripCount: sum((m) => m.lateTripCount ?? 0),
          noShowTripCount: sum((m) => m.noShowTripCount ?? 0),
          unknownTripCount: 0,
          onTimeOrderIds: isOwn
            ? [MAIN_ORDER_ID, "ord-r10-c3", "ord-r10-c4"]
            : ["ord-sibling-001"],
          lateOrderIds: isOwn ? ["ord-r10-c2"] : [],
          noShowOrderIds: isOwn ? ["ord-r10-noshow"] : [],
          unknownOrderIds: [],
        },
        complaintMonthlyStatistics,
        monthlySummaries,
      },
      generatedAt,
    };
  };

  return [
    buildDimension("new_taipei", "taxi_realtime", false),
    buildDimension("taipei", "enterprise_dispatch", true),
  ];
}

function buildCsvJobRows(
  summaries: readonly SixMonthOperationsSummary[],
): SixMonthMonthlyOperationsSummary[] {
  return summaries
    .flatMap((source) =>
      (source.monthlySummaries ?? []).map((monthly) => ({
        ...monthly,
        averageDispatchableVehicleCount:
          monthly.validSnapshotCount === 0
            ? null
            : monthly.averageDispatchableVehicleCount,
        complaintsByCategory: { ...monthly.complaintsByCategory },
      })),
    )
    .sort(
      (left, right) =>
        left.periodMonth.localeCompare(right.periodMonth) ||
        (left.businessArea ?? "").localeCompare(right.businessArea ?? "") ||
        (left.serviceProductCode ?? "").localeCompare(
          right.serviceProductCode ?? "",
        ),
    );
}

function buildPdfJobRows(
  summaries: readonly SixMonthOperationsSummary[],
): Record<string, unknown>[] {
  return summaries.map((source) => {
    const row: Record<string, unknown> = {
      ...source,
      averageDispatchableVehicleCount:
        source.validSnapshotCount === 0
          ? null
          : source.averageDispatchableVehicleCount,
      complaintsByCategory: { ...source.complaintsByCategory },
    };
    delete row.drilldown;
    delete row.monthlySummaries;
    return row;
  });
}

describe("R10 six-month operations Taipei calendar window & role guards", () => {
  it("converts UTC instants to Asia/Taipei months and builds a 6-month inclusive window", () => {
    expect(toUtcYearMonth("2026-10-31T16:30:00.000Z")).toBe("2026-10");
    expect(toTaipeiYearMonth("2026-10-31T16:30:00.000Z")).toBe("2026-11");
    expect(shiftYearMonth("2026-11", -5)).toBe("2026-06");
    expect(lastDayOfYearMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfYearMonth("2026-11")).toBe("2026-11-30");

    const window = resolveSixMonthOperationsWindow("2026-11", "2026-10");
    expect(window).toEqual({
      from: "2026-06",
      to: "2026-11",
      canonicalFrom: "2026-06-01",
      canonicalTo: "2026-11-30",
      periods: [
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
        "2026-11",
      ],
    });
    expect(() => resolveSixMonthOperationsWindow("2026-11", "2026-05")).toThrow(
      /six-month-inclusive-window/,
    );
  });

  it("enforces active Ops realm, principal, session and report read/write scopes", () => {
    const activeSession = {
      active: true,
      identity: {
        ...OPS_ROLE,
        actorId: OPS_ROLE.principalId,
        authMode: "jwt_bearer",
      },
    };
    expect(() =>
      assertR10VerifiedOpsRole(activeSession, OPS_ROLE, [
        "complaints:read",
        "reports:read",
        "reports:write",
      ]),
    ).not.toThrow();

    expect(() =>
      assertR10VerifiedOpsRole(
        {
          active: true,
          identity: {
            ...OPS_ROLE,
            actorId: OPS_ROLE.principalId,
            authMode: "jwt_bearer",
            scopes: ["complaints:read", "reports:read"],
          },
        },
        OPS_ROLE,
        ["complaints:read", "reports:read", "reports:write"],
      ),
    ).toThrow(/verified-ops-role-session-scopes/);
  });
});

describe("R10 six-month preview validation, zero-vs-null, cross-month complaint attribution and fixed-source rerun", () => {
  it("validates 6 monthly rows per dimension, aggregate rollups, zero-vs-null distinction, and explicitly marks when no controlled cross-month sample exists", () => {
    const window = resolveSixMonthOperationsWindow("2026-11");
    const summaries = buildSixMonthSummaryFixture();
    const result = validateSixMonthOperationsPreview({
      rawRows: summaries,
      window,
      ownOrder: {
        orderId: MAIN_ORDER_ID,
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        entrySlug: ENTRY_SLUG,
        serviceProductCode: "enterprise_dispatch",
        createdAt: "2026-11-15T04:00:00.000Z",
        reservationWindowStart: null,
      },
      ownCases: buildControlledCaseFacts({ crossMonthUtcBoundary: false }),
      serviceCaseNo: "CMP-MAN-SERVICE",
      closureMonth: "2026-11",
    });

    expect(result.ownDimension).toEqual({
      businessArea: "taipei",
      serviceProductCode: "enterprise_dispatch",
    });
    expect(result.summaries).toHaveLength(2);
    expect(result.monthlyRows).toHaveLength(12);
    expect(result.zeroVsNull).toMatchObject({
      summaryRowCount: 2,
      monthlyRowCount: 12,
      nullAverageWhenNoValidSnapshotsCount: 8,
      numericZeroAverageWithValidSnapshotsCount: 2,
      positiveAverageWithValidSnapshotsCount: 4,
      hasNullAverageSample: true,
      hasTrueZeroMetricSample: true,
      nullAndZeroDistinguished: true,
    });
    expect(result.crossMonthComplaints).toEqual({
      timeZone: "Asia/Taipei",
      controlledCaseCount: 7,
      allControlledCasesAttributedByTaipeiMonth: true,
      hasControlledCrossMonthSample: false,
      controlledCrossMonthSampleCount: 0,
      qualification:
        "no-verifiable-controlled-cross-month-sample-in-window-no-historical-order-modified",
      historicalOrdersModified: false,
      samples: [],
    });
  });

  it("identifies a verified controlled cross-month complaint (2026-10-31T16:30Z -> 2026-11 Taipei) and rejects UTC-month misattribution", () => {
    const window = resolveSixMonthOperationsWindow("2026-11");
    const summaries = buildSixMonthSummaryFixture();
    const crossCases = buildControlledCaseFacts({
      crossMonthUtcBoundary: true,
    });

    const verified = validateSixMonthOperationsPreview({
      rawRows: summaries,
      window,
      ownOrder: {
        orderId: MAIN_ORDER_ID,
        tenantId: TENANT_ID,
        partnerId: PARTNER_ID,
        entrySlug: ENTRY_SLUG,
        serviceProductCode: "enterprise_dispatch",
        createdAt: "2026-11-15T04:00:00.000Z",
        reservationWindowStart: null,
      },
      ownCases: crossCases,
      serviceCaseNo: "CMP-MAN-SERVICE",
      closureMonth: "2026-11",
    });

    expect(verified.crossMonthComplaints.hasControlledCrossMonthSample).toBe(
      true,
    );
    expect(verified.crossMonthComplaints.controlledCrossMonthSampleCount).toBe(
      1,
    );
    expect(verified.crossMonthComplaints.qualification).toBe(
      "verified-controlled-cross-month-sample",
    );
    expect(verified.crossMonthComplaints.samples[0]).toEqual({
      source: "manual",
      category: "fare_dispute",
      orderTaipeiMonth: "2026-10",
      createdUtcMonth: "2026-10",
      createdTaipeiMonth: "2026-11",
      closedUtcMonth: null,
      closedTaipeiMonth: null,
      boundaryKinds: [
        "utc-vs-taipei-created-month",
        "order-vs-complaint-taipei-month",
      ],
      attributedToTaipeiMonth: true,
    });

    // Misattribute CMP-MAN-FARE to UTC 2026-10 instead of Taipei 2026-11 -> must reject!
    const misattributed = structuredClone(summaries);
    const ownStats = misattributed[1]!.drilldown!.complaintMonthlyStatistics;
    const octStat = ownStats.find((s) => s.periodMonth === "2026-10")!;
    const novStat = ownStats.find((s) => s.periodMonth === "2026-11")!;
    octStat.manual.createdCaseNos.push("CMP-MAN-FARE");
    novStat.manual.createdCaseNos = novStat.manual.createdCaseNos.filter(
      (id) => id !== "CMP-MAN-FARE",
    );

    expect(() =>
      validateSixMonthOperationsPreview({
        rawRows: misattributed,
        window,
        ownOrder: {
          orderId: MAIN_ORDER_ID,
          tenantId: TENANT_ID,
          partnerId: PARTNER_ID,
          entrySlug: ENTRY_SLUG,
          serviceProductCode: "enterprise_dispatch",
          createdAt: "2026-11-15T04:00:00.000Z",
          reservationWindowStart: null,
        },
        ownCases: crossCases,
        serviceCaseNo: "CMP-MAN-SERVICE",
        closureMonth: "2026-11",
      }),
    ).toThrow(/case-created-month-taipei-attribution/);
  });

  it("rejects numeric 0 average when validSnapshotCount === 0 and rejects monthly rollup mismatches", () => {
    const window = resolveSixMonthOperationsWindow("2026-11");
    const badNullAsZero = structuredClone(buildSixMonthSummaryFixture());
    // 2026-06 has validSnapshotCount = 0; setting averageDispatchableVehicleCount = 0 must fail
    badNullAsZero[1]!.monthlySummaries![0]!.averageDispatchableVehicleCount = 0;
    expect(() =>
      validateSixMonthOperationsPreview({
        rawRows: badNullAsZero,
        window,
        ownOrder: {
          orderId: MAIN_ORDER_ID,
          tenantId: TENANT_ID,
          partnerId: PARTNER_ID,
          entrySlug: ENTRY_SLUG,
          serviceProductCode: "enterprise_dispatch",
          createdAt: "2026-11-15T04:00:00.000Z",
          reservationWindowStart: null,
        },
        ownCases: buildControlledCaseFacts(),
        serviceCaseNo: "CMP-MAN-SERVICE",
        closureMonth: "2026-11",
      }),
    ).toThrow(/zero-valid-snapshots-requires-null-average/);

    const badRollup = structuredClone(buildSixMonthSummaryFixture());
    badRollup[1]!.demandRequestCount += 1;
    expect(() =>
      validateSixMonthOperationsPreview({
        rawRows: badRollup,
        window,
        ownOrder: {
          orderId: MAIN_ORDER_ID,
          tenantId: TENANT_ID,
          partnerId: PARTNER_ID,
          entrySlug: ENTRY_SLUG,
          serviceProductCode: "enterprise_dispatch",
          createdAt: "2026-11-15T04:00:00.000Z",
          reservationWindowStart: null,
        },
        ownCases: buildControlledCaseFacts(),
        serviceCaseNo: "CMP-MAN-SERVICE",
        closureMonth: "2026-11",
      }),
    ).toThrow(/monthly-totals-match-aggregate/);
  });

  it("separates per-request generatedAt / complaintStatisticsAsOf from stable business values on rerun", () => {
    const first = buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:00.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:00.000Z",
    });
    const second = buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:05.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:05.000Z",
    });
    const comparison = compareSixMonthSummaryGenerations(
      first,
      second,
      "r10-rerun-test",
    );
    expect(comparison).toEqual({
      businessValuesMatched: true,
      baselineGeneratedAt: "2026-11-23T02:10:00.000Z",
      candidateGeneratedAt: "2026-11-23T02:10:05.000Z",
      baselineComplaintStatisticsAsOf: "2026-11-23T02:10:00.000Z",
      candidateComplaintStatisticsAsOf: "2026-11-23T02:10:05.000Z",
      generatedAtMintedPerRequest: true,
    });

    const drifted = structuredClone(second);
    drifted[1]!.monthlySummaries![5]!.completedTripCount += 1;
    expect(() =>
      compareSixMonthSummaryGenerations(first, drifted, "r10-rerun-drift"),
    ).toThrow(/count-completedTripCount-mismatch/);
  });
});

describe("R10 JSON Blob, CSV 6-month detail and PDF summary artifact validators", () => {
  const window = resolveSixMonthOperationsWindow("2026-11");
  const baseline = buildSixMonthSummaryFixture({
    generatedAt: "2026-11-23T02:10:00.000Z",
    complaintStatisticsAsOf: "2026-11-23T02:10:00.000Z",
  });

  it("validates browser JSON Blob payload against its preview generation and baseline business values", () => {
    const exportPreview = buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:08.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:08.000Z",
    });
    const monthlySummaries = exportPreview.flatMap(
      (row) => row.monthlySummaries ?? [],
    );
    const jsonPayload = {
      reportType: "six_month_operations_summary",
      query: { from: window.from, to: window.to },
      exportedAt: "2026-11-23T02:10:09.000Z",
      rows: exportPreview,
      monthlySummaries,
    };
    const bytes = Buffer.from(JSON.stringify(jsonPayload, null, 2), "utf8");
    const summary = validateR10JsonBlobDownload({
      bytes,
      fileName: "six-month-operations-summary-2026-11-23.json",
      downloadUrl: `blob:${OPS_ORIGIN}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d`,
      window,
      exportPreviewRows: exportPreview,
      baselinePreviewRows: baseline,
      runtimeSha: RUNTIME_SHA,
    });

    expect(summary).toMatchObject({
      format: "json",
      deliveryMode: "browser-blob",
      fileName: "six-month-operations-summary-2026-11-23.json",
      downloadUrlScheme: "blob",
      contentType: "application/json",
      bytes: bytes.length,
      sha256: hash(bytes),
      exportedAt: "2026-11-23T02:10:09.000Z",
      generatedAt: "2026-11-23T02:10:08.000Z",
      summaryRowCount: 2,
      monthlyRowCount: 12,
      matchedExportPreviewGeneration: true,
      matchedBaselineBusinessValues: true,
      rawArtifactRetained: false,
      artifactPath: null,
    });

    expect(() =>
      validateR10JsonBlobDownload({
        bytes,
        fileName: "six-month-operations-summary-2026-11-23.json",
        downloadUrl: `${OPS_ORIGIN}/reports/job-1/artifact`,
        window,
        exportPreviewRows: exportPreview,
        baselinePreviewRows: baseline,
        runtimeSha: RUNTIME_SHA,
      }),
    ).toThrow(/blob-url-and-filename-binding/);
  });

  it("validates CSV background report job with 6 monthly rows per dimension and preserves empty cell for null average vs '0' for numeric zero average", async () => {
    const csvGeneration = buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:12.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:12.000Z",
    });
    const csvRows = buildCsvJobRows(csvGeneration);
    expect(csvRows).toHaveLength(12);
    const csvText = recordsToCsv(
      csvRows as unknown as Record<string, unknown>[],
    );
    // Formal CSV has no trailing CRLF: newline count is 12 (1 header + 12 rows = 13 lines).
    expect(csvText.endsWith("\r\n")).toBe(false);
    expect(csvText.split("\r\n")).toHaveLength(13);

    const csvBytes = Buffer.from(csvText, "utf8");
    const jobId = "job_r10_csv_001";
    const jobDetail = {
      jobId,
      jobType: "six_month_operations_summary",
      format: "csv",
      status: "completed",
      filters: { from: window.from, to: window.to },
      rows: csvRows,
      artifact: {
        artifactId: "art_r10_csv_001",
        artifactType: "report",
        downloadUrl: `/reports/${jobId}/artifact`,
        immutable: true,
        manifestHash: "c".repeat(64),
        expiresAt: "2026-11-24T02:10:12.000Z",
      },
    };

    const summary = await validateR10JobArtifactDownload({
      format: "csv",
      jobId,
      jobDetail,
      detailStatus: 200,
      detailResponseSha: RUNTIME_SHA,
      artifactStatus: 200,
      artifactResponseSha: RUNTIME_SHA,
      contentType: "text/csv; charset=utf-8",
      contentDisposition: `attachment; filename="six_month_operations_summary-${jobId}.csv"`,
      bytes: csvBytes,
      window,
      baselinePreviewRows: baseline,
      ownDimension: {
        businessArea: "taipei",
        serviceProductCode: "enterprise_dispatch",
      },
      runtimeSha: RUNTIME_SHA,
      nowMs: Date.parse("2026-11-23T02:11:00.000Z"),
    });

    expect(summary).toMatchObject({
      format: "csv",
      deliveryMode: "background-report-job",
      jobId,
      rowCount: 12,
      summaryDimensionCount: 2,
      monthlyRowCount: 12,
      generatedAt: "2026-11-23T02:10:12.000Z",
      matchedBaselineBusinessValues: true,
      rawArtifactRetained: false,
      artifactPath: null,
    });
    expect(R10_MONTHLY_CSV_COLUMNS).toHaveLength(28);
  });

  it("validates PDF background report job with 6-month aggregate summary rows and CJK printable text", async () => {
    const pdfGeneration = buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:15.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:15.000Z",
    });
    const pdfRows = buildPdfJobRows(pdfGeneration);
    expect(pdfRows).toHaveLength(2);
    const jobId = "job_r10_pdf_001";
    const pdfBytes = await recordsToPdf(
      pdfRows,
      `six_month_operations_summary — ${jobId}`,
    );
    const jobDetail = {
      jobId,
      jobType: "six_month_operations_summary",
      format: "pdf",
      status: "completed",
      filters: { from: window.from, to: window.to },
      rows: pdfRows,
      artifact: {
        artifactId: "art_r10_pdf_001",
        artifactType: "report",
        downloadUrl: `/reports/${jobId}/artifact`,
        immutable: true,
        manifestHash: "d".repeat(64),
        expiresAt: "2026-11-24T02:10:15.000Z",
      },
    };

    const summary = await validateR10JobArtifactDownload({
      format: "pdf",
      jobId,
      jobDetail,
      detailStatus: 200,
      detailResponseSha: RUNTIME_SHA,
      artifactStatus: 200,
      artifactResponseSha: RUNTIME_SHA,
      contentType: "application/pdf",
      contentDisposition: `attachment; filename="six_month_operations_summary-${jobId}.pdf"`,
      bytes: pdfBytes,
      window,
      baselinePreviewRows: baseline,
      ownDimension: {
        businessArea: "taipei",
        serviceProductCode: "enterprise_dispatch",
      },
      runtimeSha: RUNTIME_SHA,
      nowMs: Date.parse("2026-11-23T02:11:00.000Z"),
    });

    expect(summary).toMatchObject({
      format: "pdf",
      deliveryMode: "background-report-job",
      jobId,
      rowCount: 2,
      summaryDimensionCount: 2,
      monthlyRowCount: 12,
      generatedAt: "2026-11-23T02:10:15.000Z",
      matchedBaselineBusinessValues: true,
      rawArtifactRetained: false,
      artifactPath: null,
      contentSignature: {
        format: "pdf",
        magicHeader: "%PDF-",
        matchedExpectedRender: true,
      },
    });
    expect(R10_SUMMARY_PDF_COLUMNS).toHaveLength(27);
  }, 30_000);
});

function createSimulatedR10BrowserHarness(options?: {
  injectUnownedPostOnRerun?: boolean | undefined;
  crossMonthUtcBoundary?: boolean | undefined;
}) {
  const window = resolveSixMonthOperationsWindow("2026-11");
  const generations = {
    initial: buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:01.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:01.000Z",
    }),
    rerun: buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:04.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:04.000Z",
    }),
    json: buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:07.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:07.000Z",
    }),
    csv: buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:11.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:11.000Z",
    }),
    pdf: buildSixMonthSummaryFixture({
      generatedAt: "2026-11-23T02:10:15.000Z",
      complaintStatisticsAsOf: "2026-11-23T02:10:15.000Z",
    }),
  };

  let currentUrl = `${OPS_ORIGIN}/reports`;
  let selectedReportType = "six_month_operations_summary";
  let periodFrom = "2026-11";
  let periodTo = "2026-11";
  let businessArea = "";
  let serviceProduct = "";
  let selectedFormat = "pdf";
  let previewCallCount = 0;

  let pageRouteHandler: ((route: Route) => Promise<void>) | null = null;
  let contextRouteHandler: ((route: Route) => Promise<void>) | null = null;
  let downloadWaiter: ((download: Download) => void) | null = null;

  const mainJourneyPage = {
    close: async () => {
      throw new Error("main journey page must never be closed by R10");
    },
  } as unknown as Page;
  const openPages: Page[] = [mainJourneyPage];
  const closedPopupCount = { count: 0 };
  const abortedRequests: string[] = [];

  const csvJobId = "job_r10_csv_live";
  const pdfJobId = "job_r10_pdf_live";
  const csvRows = buildCsvJobRows(generations.csv);
  const pdfRows = buildPdfJobRows(generations.pdf);
  const csvBytes = Buffer.from(
    recordsToCsv(csvRows as unknown as Record<string, unknown>[]),
    "utf8",
  );
  let pdfBytesPromise: Promise<Buffer> | null = null;
  const getPdfBytes = () => {
    if (!pdfBytesPromise) {
      pdfBytesPromise = recordsToPdf(
        pdfRows,
        `six_month_operations_summary — ${pdfJobId}`,
      );
    }
    return pdfBytesPromise;
  };

  let latestJsonBytes = Buffer.alloc(0);

  const dispatchHttp = async (
    target: "page" | "popup",
    method: string,
    url: string,
    bodyObj?: unknown,
  ) => {
    const bodyText = bodyObj === undefined ? null : JSON.stringify(bodyObj);
    const parsedUrl = new URL(url);
    const reqObj = {
      url: () => url,
      method: () => method,
      headers: () => ({ "x-request-id": "req-sim" }),
      postData: () => bodyText,
    };

    const computeResponse = async (): Promise<{
      status: number;
      headers: Record<string, string>;
      bytes: Buffer;
    }> => {
      if (method === "GET" && parsedUrl.pathname === "/reports") {
        return {
          status: 200,
          headers: {
            "content-type": "text/html",
            "x-drts-candidate-sha": RUNTIME_SHA,
          },
          bytes: Buffer.from("<html><body>Reports</body></html>", "utf8"),
        };
      }
      if (
        method === "GET" &&
        parsedUrl.pathname ===
          "/control-plane-proxy/reports/operations-summary/preview"
      ) {
        previewCallCount += 1;
        const rows =
          previewCallCount === 1
            ? generations.initial
            : previewCallCount === 2
              ? generations.rerun
              : generations.json;
        return {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-drts-candidate-sha": RUNTIME_SHA,
          },
          bytes: Buffer.from(
            JSON.stringify({
              data: {
                items: rows,
                pageInfo: {
                  page: 1,
                  pageSize: 50,
                  totalItems: rows.length,
                  totalPages: 1,
                },
              },
              meta: {
                requestId: `req-preview-${previewCallCount}`,
                timestamp: "2026-11-23T02:10:00.000Z",
              },
            }),
            "utf8",
          ),
        };
      }
      if (
        method === "POST" &&
        parsedUrl.pathname === "/control-plane-proxy/reports/jobs"
      ) {
        const parsed = JSON.parse(bodyText ?? "{}") as { format: string };
        const jobId = parsed.format === "csv" ? csvJobId : pdfJobId;
        return {
          status: 201,
          headers: {
            "content-type": "application/json",
            "x-drts-candidate-sha": RUNTIME_SHA,
          },
          bytes: Buffer.from(
            JSON.stringify({
              data: {
                jobId,
                jobType: "six_month_operations_summary",
                format: parsed.format,
                status: "queued",
              },
              meta: {
                requestId: `req-job-${parsed.format}`,
                timestamp: "2026-11-23T02:10:10.000Z",
              },
            }),
            "utf8",
          ),
        };
      }
      if (
        method === "GET" &&
        parsedUrl.pathname === "/control-plane-proxy/reports/jobs"
      ) {
        return {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-drts-candidate-sha": RUNTIME_SHA,
          },
          bytes: Buffer.from(
            JSON.stringify({
              data: {
                items: [
                  {
                    jobId: csvJobId,
                    jobType: "six_month_operations_summary",
                    format: "csv",
                    status: "completed",
                    filters: { from: window.from, to: window.to },
                  },
                  {
                    jobId: pdfJobId,
                    jobType: "six_month_operations_summary",
                    format: "pdf",
                    status: "completed",
                    filters: { from: window.from, to: window.to },
                  },
                ],
                pageInfo: {
                  page: 1,
                  pageSize: 50,
                  totalItems: 2,
                  totalPages: 1,
                },
              },
              meta: {
                requestId: "req-jobs-list",
                timestamp: "2026-11-23T02:10:16.000Z",
              },
            }),
            "utf8",
          ),
        };
      }
      if (
        method === "GET" &&
        (parsedUrl.pathname === `/control-plane-proxy/reports/${csvJobId}` ||
          parsedUrl.pathname === `/control-plane-proxy/reports/${pdfJobId}`)
      ) {
        const isCsv = parsedUrl.pathname.endsWith(csvJobId);
        const jobId = isCsv ? csvJobId : pdfJobId;
        const format = isCsv ? "csv" : "pdf";
        return {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-drts-candidate-sha": RUNTIME_SHA,
          },
          bytes: Buffer.from(
            JSON.stringify({
              data: {
                jobId,
                jobType: "six_month_operations_summary",
                format,
                status: "completed",
                filters: { from: window.from, to: window.to },
                rows: isCsv ? csvRows : pdfRows,
                artifact: {
                  artifactId: `art_${jobId}`,
                  artifactType: "report",
                  downloadUrl: `/reports/${jobId}/artifact`,
                  immutable: true,
                  manifestHash: (isCsv ? "c" : "d").repeat(64),
                  expiresAt: "2026-11-24T02:10:20.000Z",
                },
              },
              meta: {
                requestId: `req-detail-${jobId}`,
                timestamp: "2026-11-23T02:10:17.000Z",
              },
            }),
            "utf8",
          ),
        };
      }
      if (
        method === "GET" &&
        (parsedUrl.pathname ===
          `/control-plane-proxy/reports/${csvJobId}/artifact` ||
          parsedUrl.pathname ===
            `/control-plane-proxy/reports/${pdfJobId}/artifact`)
      ) {
        const isCsv = parsedUrl.pathname.includes(csvJobId);
        const jobId = isCsv ? csvJobId : pdfJobId;
        const format = isCsv ? "csv" : "pdf";
        return {
          status: 200,
          headers: {
            "content-type": isCsv ? "text/csv" : "application/pdf",
            "content-disposition": `attachment; filename="six_month_operations_summary-${jobId}.${format}"`,
            "x-drts-candidate-sha": RUNTIME_SHA,
          },
          bytes: isCsv ? csvBytes : await getPdfBytes(),
        };
      }
      return {
        status: 500,
        headers: { "x-drts-candidate-sha": RUNTIME_SHA },
        bytes: Buffer.from("{}", "utf8"),
      };
    };

    const handler =
      target === "page"
        ? (pageRouteHandler ?? contextRouteHandler)
        : contextRouteHandler;
    if (!handler) throw new Error("No route handler installed");

    await handler({
      request: () => reqObj,
      fetch: async () => {
        const res = await computeResponse();
        return {
          status: () => res.status,
          url: () => url,
          headers: () => res.headers,
          body: async () => res.bytes,
        };
      },
      fulfill: async () => {},
      fallback: async () => {},
      abort: async () => {
        abortedRequests.push(`${method} ${parsedUrl.pathname}`);
      },
    } as unknown as Route);
  };

  const makeButtonLocator = (onClick?: () => Promise<void>): Locator => {
    const loc = {
      first: () => loc,
      waitFor: async () => {},
      isEnabled: async () => true,
      count: async () => 1,
      click: async () => {
        if (onClick) await onClick();
      },
    } as unknown as Locator;
    return loc;
  };

  const opsPage = {
    url: () => currentUrl,
    route: async (
      _pattern: string,
      handler: (route: Route) => Promise<void>,
    ) => {
      pageRouteHandler = handler;
    },
    unroute: async () => {
      pageRouteHandler = null;
    },
    goto: async (url: string) => {
      currentUrl = url;
      await dispatchHttp("page", "GET", `${OPS_ORIGIN}/reports`);
      await dispatchHttp(
        "page",
        "GET",
        `${OPS_ORIGIN}/control-plane-proxy/reports/jobs`,
      );
    },
    evaluate: async () => ({
      status: 200,
      runtimeSha: RUNTIME_SHA,
      body: {
        data: {
          active: true,
          identity: {
            ...OPS_ROLE,
            actorId: OPS_ROLE.principalId,
            authMode: "jwt_bearer",
          },
        },
        meta: {
          requestId: "req-session",
          timestamp: "2026-11-23T02:10:00.000Z",
        },
      },
    }),
    waitForEvent: (event: string) => {
      if (event !== "download") throw new Error(`Unexpected event: ${event}`);
      return new Promise<Download>((resolve) => {
        downloadWaiter = resolve;
      });
    },
    getByRole: (_role: string, opts?: { name?: RegExp | string }) => {
      const nameStr = String(opts?.name ?? "");
      if (nameStr.includes("載入預覽") || nameStr.includes("Load preview")) {
        return makeButtonLocator(async () => {
          const query = new URLSearchParams({
            from: periodFrom,
            to: periodTo,
            ...(businessArea ? { businessArea } : {}),
            ...(serviceProduct ? { serviceProductCode: serviceProduct } : {}),
          });
          await dispatchHttp(
            "page",
            "GET",
            `${OPS_ORIGIN}/control-plane-proxy/reports/operations-summary/preview?${query}`,
          );
          if (options?.injectUnownedPostOnRerun && previewCallCount === 2) {
            // Simulate an unexpected UI POST during rerun; click itself does NOT throw!
            await dispatchHttp(
              "page",
              "POST",
              `${OPS_ORIGIN}/control-plane-proxy/complaints/CMP-MAN-SERVICE/notes`,
              { note: "unowned" },
            );
          }
        });
      }
      if (nameStr.includes("匯出工作") || nameStr.includes("Export job")) {
        return makeButtonLocator(async () => {
          if (selectedFormat === "json") {
            const query = new URLSearchParams({
              from: periodFrom,
              to: periodTo,
            });
            await dispatchHttp(
              "page",
              "GET",
              `${OPS_ORIGIN}/control-plane-proxy/reports/operations-summary/preview?${query}`,
            );
            const payload = {
              reportType: selectedReportType,
              query: { from: periodFrom, to: periodTo },
              exportedAt: "2026-11-23T02:10:08.000Z",
              rows: generations.json,
              monthlySummaries: generations.json.flatMap(
                (r) => r.monthlySummaries ?? [],
              ),
            };
            latestJsonBytes = Buffer.from(
              JSON.stringify(payload, null, 2),
              "utf8",
            );
            downloadWaiter?.({
              url: () =>
                `blob:${OPS_ORIGIN}/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d`,
              suggestedFilename: () =>
                "six-month-operations-summary-2026-11-23.json",
              failure: async () => null,
              path: async () => "/virtual/r10-six-month.json",
              createReadStream: async () => null,
            } as unknown as Download);
            return;
          }
          await dispatchHttp(
            "page",
            "POST",
            `${OPS_ORIGIN}/control-plane-proxy/reports/jobs`,
            {
              jobType: selectedReportType,
              format: selectedFormat,
              filters: { from: periodFrom, to: periodTo },
            },
          );
        });
      }
      return makeButtonLocator();
    },
    getByText: (matcher: string | RegExp) => {
      const textMatcher = String(matcher);
      const loc = {
        first: () => loc,
        waitFor: async () => {},
        count: async () => 1,
        innerText: async () =>
          textMatcher.includes("taipei · enterprise_dispatch")
            ? `taipei · enterprise_dispatch ${window.canonicalFrom} ~ ${window.canonicalTo} ${window.periods.join(" ")} 未提供`
            : textMatcher,
        locator: () => loc,
      } as unknown as Locator;
      return loc;
    },
    locator: (selector: string) => {
      if (selector === 'input[type="month"]') {
        return {
          count: async () => 2,
          nth: (index: number) => ({
            fill: async (val: string) => {
              if (index === 0) periodFrom = val;
              else periodTo = val;
            },
          }),
        } as unknown as Locator;
      }
      if (selector === 'input[placeholder="taipei"]') {
        const loc = {
          count: async () => 1,
          first: () => loc,
          fill: async (val: string) => {
            businessArea = val;
          },
        };
        return loc as unknown as Locator;
      }
      if (selector === 'input[placeholder="wheelchair_van"]') {
        const loc = {
          count: async () => 1,
          first: () => loc,
          fill: async (val: string) => {
            serviceProduct = val;
          },
        };
        return loc as unknown as Locator;
      }
      if (selector === "select") {
        return {
          filter: (opts?: { has?: unknown }) => {
            const isFormat =
              (
                opts?.has as { _selector?: string } | undefined
              )?._selector?.includes('value="json"') ?? false;
            const loc = {
              first: () => loc,
              waitFor: async () => {},
              selectOption: async (val: string) => {
                if (isFormat) selectedFormat = val;
                else selectedReportType = val;
              },
            };
            return loc as unknown as Locator;
          },
        } as unknown as Locator;
      }
      if (selector.startsWith("option")) {
        return { _selector: selector } as unknown as Locator;
      }
      if (selector === "tbody tr") {
        return {
          filter: ({ hasText }: { hasText: string }) => {
            const isCsv = hasText === csvJobId;
            const jobId = isCsv ? csvJobId : pdfJobId;
            const format = isCsv ? "CSV" : "PDF";
            const rowLoc = {
              first: () => rowLoc,
              waitFor: async () => {},
              count: async () => 1,
              innerText: async () =>
                `${jobId} six_month_operations_summary ${window.from} → ${window.to} ${format} completed`,
              getByRole: () =>
                makeButtonLocator(async () => {
                  await dispatchHttp(
                    "page",
                    "GET",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/${jobId}`,
                  );
                  // openDownload opens a new _blank tab in context
                  const popupPage = {
                    close: async () => {
                      closedPopupCount.count += 1;
                      const idx = openPages.indexOf(popupPage);
                      if (idx >= 0) openPages.splice(idx, 1);
                    },
                  } as unknown as Page;
                  openPages.push(popupPage);
                  await dispatchHttp(
                    "popup",
                    "GET",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/${jobId}/artifact`,
                  );
                }),
            };
            return rowLoc as unknown as Locator;
          },
        } as unknown as Locator;
      }
      return makeButtonLocator();
    },
  } as unknown as Page;

  openPages.push(opsPage);

  const context = {
    pages: () => [...openPages],
    route: async (
      _pattern: string,
      handler: (route: Route) => Promise<void>,
    ) => {
      contextRouteHandler = handler;
    },
    unroute: async () => {
      contextRouteHandler = null;
    },
  } as unknown as BrowserContext;

  const caseFacts = buildControlledCaseFacts({
    crossMonthUtcBoundary: options?.crossMonthUtcBoundary,
  });

  return {
    context,
    opsPage,
    mainJourneyPage,
    openPages,
    closedPopupCount,
    abortedRequests,
    readCase: async (caseNo: string): Promise<ComplaintCaseRecord> => {
      const found = caseFacts.find((c) => c.caseNo === caseNo)!;
      return {
        caseNo: found.caseNo,
        relatedOrderId: found.orderId,
        caseSource: "app",
        category: found.category,
        status: found.status,
        createdAt: found.createdAt,
        slaDueAt: found.slaDueAt,
      } as unknown as ComplaintCaseRecord;
    },
    readOrder: async (orderId: string): Promise<ObjectData> => {
      const found = caseFacts.find((c) => c.orderId === orderId);
      return buildOrderFixture({
        orderId,
        createdAt: found?.orderCreatedAt ?? "2026-11-15T04:00:00.000Z",
      });
    },
    readTimeline: async (caseNo: string): Promise<ComplaintTimelineEntry[]> => {
      const found = caseFacts.find((c) => c.caseNo === caseNo)!;
      return [
        {
          entryId: `create-${caseNo}`,
          caseNo,
          action: "case_created",
          note: "created",
          createdAt: found.createdAt,
        },
        ...(found.closedAt
          ? [
              {
                entryId: `close-${caseNo}`,
                caseNo,
                action: "case_closed" as const,
                note: "closed",
                createdAt: found.closedAt,
              },
            ]
          : []),
      ];
    },
    readFile: async () => latestJsonBytes,
  };
}

describe("runR10OperationsDownloads full UI orchestration", () => {
  // The simulated job artifacts expire at 2026-11-24T02:10:2xZ, and the
  // artifact check compares that against Date.now(). Pin only Date to the
  // fixture run time (as the per-artifact tests pin nowMs), so the case does
  // not start failing once the wall clock passes that fixture expiry.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T02:11:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("expands the already-open Ops reports page to 6 months, reruns fixed source, downloads JSON Blob + CSV/PDF job artifacts, and preserves pre-existing pages", async () => {
    const harness = createSimulatedR10BrowserHarness({
      crossMonthUtcBoundary: true,
    });
    const evidence = new Evidence();

    const result = await runR10OperationsDownloads({
      context: harness.context,
      page: harness.opsPage,
      opsOrigin: OPS_ORIGIN,
      opsHeaders: () => ({ "x-drts-authorization": "Bearer ops-jwt" }),
      role: OPS_ROLE,
      order: buildOrderFixture(),
      entrySlug: ENTRY_SLUG,
      cases: SEVEN_OWN_CASES,
      serviceCaseNo: "CMP-MAN-SERVICE",
      closureMonth: "2026-11",
      r09From: "2026-10",
      r09To: "2026-11",
      readCase: harness.readCase,
      readOrder: harness.readOrder,
      readTimeline: harness.readTimeline,
      readFile: harness.readFile,
      definitionSha: DEFINITION_SHA,
      runtimeSha: RUNTIME_SHA,
      recoveryOnly: false,
      evidence,
    });

    expect(result.window.periods).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(result.preview.dimensionCount).toBe(2);
    expect(result.preview.monthlyRowCount).toBe(12);
    expect(result.preview.uiNotProvidedVerified).toBe(true);
    expect(result.fixedSourceRerun.businessValuesMatched).toBe(true);
    expect(result.fixedSourceRerun.generatedAtMintedPerRequest).toBe(true);
    expect(result.crossMonthComplaints.hasControlledCrossMonthSample).toBe(
      true,
    );
    expect(result.generationTimestamps.map((g) => g.stage)).toEqual([
      "initial-preview",
      "fixed-source-rerun-preview",
      "json-export-preview",
      "csv-report-job",
      "pdf-report-job",
    ]);
    expect(
      new Set(result.generationTimestamps.map((g) => g.generatedAt)).size,
    ).toBe(5);
    expect(result.downloads.json.format).toBe("json");
    expect(result.downloads.csv.format).toBe("csv");
    expect(result.downloads.csv.rowCount).toBe(12);
    expect(result.downloads.pdf.format).toBe("pdf");
    expect(result.downloads.pdf.rowCount).toBe(2);
    expect(result.mixedTenantDetailProtection).toBe(
      "ram-validated-summary-only-raw-mixed-tenant-detail-omitted",
    );
    // Both _blank popup tabs were closed, while mainJourneyPage and opsPage remain open!
    expect(harness.closedPopupCount.count).toBe(2);
    expect(harness.openPages).toEqual([
      harness.mainJourneyPage,
      harness.opsPage,
    ]);
  }, 30_000);

  it("latches and rejects an unowned UI POST during R10 even when locator.click() resolves normally", async () => {
    const harness = createSimulatedR10BrowserHarness({
      injectUnownedPostOnRerun: true,
    });
    const evidence = new Evidence();

    await expect(
      runR10OperationsDownloads({
        context: harness.context,
        page: harness.opsPage,
        opsOrigin: OPS_ORIGIN,
        opsHeaders: () => ({ "x-drts-authorization": "Bearer ops-jwt" }),
        role: OPS_ROLE,
        order: buildOrderFixture(),
        entrySlug: ENTRY_SLUG,
        cases: SEVEN_OWN_CASES,
        serviceCaseNo: "CMP-MAN-SERVICE",
        closureMonth: "2026-11",
        r09From: "2026-11",
        r09To: "2026-11",
        readCase: harness.readCase,
        readOrder: harness.readOrder,
        readTimeline: harness.readTimeline,
        readFile: harness.readFile,
        definitionSha: DEFINITION_SHA,
        runtimeSha: RUNTIME_SHA,
        recoveryOnly: false,
        evidence,
      }),
    ).rejects.toThrow(/unexpected-ui-mutation-blocked/);
    expect(harness.abortedRequests).toEqual([
      "POST /control-plane-proxy/complaints/CMP-MAN-SERVICE/notes",
    ]);
  });
});

function extractActualR04R09CallerFromSpec(sourceContent?: string) {
  const specRelativePath =
    "tests/e2e/owned-referral-business-journey/owned-business.spec.ts";
  const specPath = resolve(specRelativePath);
  const gitRef = process.env.R10_TEST_CALLER_GIT_REF?.trim();
  const rawSource =
    sourceContent ??
    (gitRef
      ? execFileSync("git", ["show", `${gitRef}:${specRelativePath}`], {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        })
      : readFileSync(specPath, "utf8"));
  const source = ts.createSourceFile(
    specPath,
    rawSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let closure: ts.ArrowFunction | undefined;
  let journeyEvidenceDecl: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "runExistingR04R09"
    ) {
      closure = node.initializer as ts.ArrowFunction;
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.getText(source) === "journeyEvidence"
    ) {
      journeyEvidenceDecl = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(closure).toBeDefined();
  expect(journeyEvidenceDecl).toBeDefined();

  const printed = ts.transpileModule(
    `const runExistingR04R09 = ${closure!.getText(source)};\n${journeyEvidenceDecl!.getText(source)}`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  return new Function(
    "bindings",
    `with (bindings) { ${printed} return { runExistingR04R09, journeyEvidence }; }`,
  ) as (bindings: Record<string, unknown>) => {
    runExistingR04R09: () => Promise<void>;
    journeyEvidence: (summary: {
      status: string;
      wholeRunPassed: boolean;
    }) => Record<string, unknown>;
  };
}

describe("R10 JSON export notice", () => {
  it("matches the notice the Ops reports page shows in both locales", () => {
    const source = readFileSync(
      resolve("apps/ops-console-web/lib/translations.ts"),
      "utf8",
    );
    const notices = [
      ...source.matchAll(/"reports\.ops\.export\.jsonDone":\s*"([^"]+)"/g),
    ].map((match) => match[1]!.replace("{count}", "3"));
    expect(notices).toHaveLength(2);
    for (const notice of notices)
      expect(notice).toMatch(R10_JSON_EXPORT_NOTICE);
  });
});

describe("owned-business.spec.ts AST wiring for R10 six-month downloads", () => {
  it("invokes runR10OperationsDownloads on the already-open opsPage after R09 and records sixMonthOperationsDownloads in journeyEvidence", async () => {
    const trace: string[] = [];
    const allowlisted = new Evidence();
    const fakePage = {
      route: async () => {},
      goto: async () => ({
        status: () => 200,
        headers: () => ({ "x-drts-candidate-sha": RUNTIME_SHA }),
      }),
      close: async () => {
        trace.push("page-close");
      },
      getByRole: () => ({
        getByRole: () => ({
          filter: () => ({
            filter: () => ({
              count: async () => 1,
              getByRole: () => ({
                selectOption: async () => {},
                fill: async () => {},
                click: async () => {},
              }),
            }),
          }),
        }),
      }),
    };

    const bindings: Record<string, unknown> = {
      opsControlRole: "ops",
      browserRatingState: {
        current: {
          state: "acknowledged",
          caseNo: "CMP-LOW-MAIN",
          submittedAt: "2026-11-15T05:00:00Z",
        },
      },
      displayObservations: {
        manualComplaint: {
          result: "observed",
          categories: [
            {
              result: "observed",
              category: "service",
              orderId: MAIN_ORDER_ID,
              caseNo: "CMP-MAN-SERVICE",
            },
            {
              result: "observed",
              category: "fare",
              orderId: MAIN_ORDER_ID,
              caseNo: "CMP-MAN-FARE",
            },
            {
              result: "observed",
              category: "lost_item",
              orderId: MAIN_ORDER_ID,
              caseNo: "CMP-MAN-LOST",
            },
          ],
        },
      },
      lowRatings: [
        "CMP-LOW-MAIN",
        "CMP-LOW-C2",
        "CMP-LOW-C3",
        "CMP-LOW-C4",
      ].map((caseNo, index) => ({
        result: "observed",
        state: "acknowledged",
        caseNo,
        orderId: index === 0 ? MAIN_ORDER_ID : `ord-r10-c${index + 1}`,
      })),
      completedOrderId: MAIN_ORDER_ID,
      completedOrderForReport: buildOrderFixture(),
      ENTRY: ENTRY_SLUG,
      SUBJECT: "referral-demo-yuhe-residence",
      RECOVERY_ONLY: false,
      definition: DEFINITION_SHA,
      runtime: RUNTIME_SHA,
      runtimeSha: RUNTIME_SHA,
      nonce: "nonce-r10",
      principalId: "admin-principal",
      identity: {
        actorId: "admin-principal",
        membershipId: "admin-member",
        scopes: ["reports:read", "reports:write", "audit:read"],
      },
      adminSessionId: "admin-session",
      opsPrincipalId: OPS_ROLE.principalId,
      opsMembershipId: OPS_ROLE.membershipId,
      opsSessionId: OPS_ROLE.sessionId,
      opsScopes: OPS_ROLE.scopes,
      requireFact: (fact: boolean, message: string) => {
        if (!fact) throw new Error(message);
      },
      text: (value: unknown) => {
        if (!value) throw new Error("missing");
        return String(value);
      },
      call: async () => ({ items: [] }),
      records: (value: unknown) => value,
      origins: { admin: "https://admin.example", ops: OPS_ORIGIN },
      context: { newPage: async () => fakePage },
      installVerifiedRoleRoute: async () => {},
      captureUiPost: async (
        _page: unknown,
        _origin: string,
        _path: string,
        _runtime: string,
        click: () => Promise<void>,
      ) => {
        await click();
        return {};
      },
      expect: (subject: { count(): Promise<number> }) => ({
        toHaveCount: async (count: number) => {
          expect(await subject.count()).toBe(count);
        },
      }),
      tx: { headers: () => ({}) },
      finalizer: {
        checkpoint: async (stage: string) => {
          trace.push(stage);
        },
      },
      driverId: "own-driver",
      evidence: {
        events: allowlisted.events,
        record: (value: Parameters<Evidence["record"]>[0]) => {
          allowlisted.record(value);
          trace.push(value.stage);
        },
      },
      runR04CurrentMonthGovernance: async () => {
        trace.push("r04");
        return {
          month: "2026-11",
          orderId: MAIN_ORDER_ID,
          driverId: "own-driver",
          recordId: "own-record",
          auditId: "own-audit",
        };
      },
      runR09OwnComplaintLifecycle: async () => {
        trace.push("r09");
        return {
          serviceCaseNo: "CMP-MAN-SERVICE",
          closureMonth: "2026-11",
          from: "2026-11",
          to: "2026-11",
        };
      },
      runR10OperationsDownloads: async (params: Record<string, unknown>) => {
        expect(params.page).toBe(fakePage);
        expect(params.opsOrigin).toBe(OPS_ORIGIN);
        expect(params.serviceCaseNo).toBe("CMP-MAN-SERVICE");
        expect(params.closureMonth).toBe("2026-11");
        expect(params.r09From).toBe("2026-11");
        expect(params.r09To).toBe("2026-11");
        trace.push("r10");
        return {
          orderId: MAIN_ORDER_ID,
          serviceCaseNo: "CMP-MAN-SERVICE",
        };
      },
      sixMonthOperationsDownloads: undefined,
      exactSevenState: undefined,
      completed: true,
      cleanupErrors: [],
      bookingState: { journal: undefined },
      uiMutationAttempts: [],
      r08Run: undefined,
      r14Manifest: undefined,
      r14StageADraft: null,
      r14ExpectedContext: undefined,
      r14StageB: undefined,
      LOW_RATING_MATRIX_SCOPE: "scope",
      cancellations: [],
      dailyReportDownloads: null,
      supplementalReports: [],
    };

    const extracted = extractActualR04R09CallerFromSpec()(bindings);
    await extracted.runExistingR04R09();

    expect(trace).toEqual([
      "r04-existing-current-month-governance",
      "r04",
      "r04-own-current-month-ui-governance",
      "page-close",
      "r09-existing-own-complaint-lifecycle",
      "r09",
      "r09-own-seven-case-ui-lifecycle-monthly-statistics",
      "r10-existing-six-month-operations-downloads",
      "r10",
      "r10-six-month-operations-ui-exports-verified",
      "page-close",
    ]);

    const builtEvidence = extracted.journeyEvidence({
      status: "completed",
      wholeRunPassed: true,
    });
    expect(builtEvidence.sixMonthOperationsDownloads).toEqual({
      orderId: MAIN_ORDER_ID,
      serviceCaseNo: "CMP-MAN-SERVICE",
    });
  });
});
