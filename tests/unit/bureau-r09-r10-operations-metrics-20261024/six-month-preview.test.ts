import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPLAINT_STATISTICS_TIME_ZONE,
  LATE_ARRIVAL_THRESHOLD_MINUTES,
  type SixMonthOperationsSummary,
} from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ReportingFilingService } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import {
  AREA,
  PRODUCT,
  buildSource,
  closedEntry,
  complaintCase,
  memoryService,
  persistedService,
  type TripSpec,
} from "./fixture";

// 2026-08-10, reservation start 02:00Z; immediate assignments at 03:00Z with a
// 10 minute committed ETA (reference 03:10Z).
const TRIPS: TripSpec[] = [
  {
    orderId: "syn-order-on-time-exact",
    semantics: "reservation",
    status: "completed",
    createdAt: "2026-08-10T02:00:00.000Z",
    assignedAt: "2026-08-10T01:30:00.000Z",
    arrivedAt: "2026-08-10T02:05:00.000Z",
  },
  {
    orderId: "syn-order-late-scheduled",
    semantics: "reservation",
    status: "completed",
    createdAt: "2026-08-10T02:00:00.000Z",
    assignedAt: "2026-08-10T01:30:00.000Z",
    arrivedAt: "2026-08-10T02:05:01.000Z",
  },
  {
    orderId: "syn-order-immediate-exact",
    semantics: "realtime",
    status: "completed",
    createdAt: "2026-08-10T03:00:00.000Z",
    assignedAt: "2026-08-10T03:00:00.000Z",
    etaMinutes: 10,
    arrivedAt: "2026-08-10T03:15:00.000Z",
  },
  {
    orderId: "syn-order-immediate-late",
    semantics: "realtime",
    status: "completed",
    createdAt: "2026-08-10T03:00:00.000Z",
    assignedAt: "2026-08-10T03:00:00.000Z",
    etaMinutes: 10,
    arrivedAt: "2026-08-10T03:15:01.000Z",
  },
  {
    orderId: "syn-order-no-show",
    semantics: "realtime",
    status: "cancelled",
    createdAt: "2026-08-10T04:00:00.000Z",
    assignedAt: "2026-08-10T04:00:00.000Z",
    etaMinutes: 8,
    cancelReason: "synthetic free-text reason",
  },
  {
    orderId: "syn-order-passenger-cancel-after-arrival",
    semantics: "realtime",
    status: "cancelled",
    createdAt: "2026-08-10T05:00:00.000Z",
    assignedAt: "2026-08-10T05:00:00.000Z",
    etaMinutes: 8,
    arrivedAt: "2026-08-10T05:06:00.000Z",
  },
  {
    orderId: "syn-order-unknown-no-arrival",
    semantics: "realtime",
    status: "completed",
    createdAt: "2026-08-10T06:00:00.000Z",
    assignedAt: "2026-08-10T06:00:00.000Z",
    etaMinutes: 8,
  },
  {
    orderId: "syn-order-unknown-no-eta",
    semantics: "realtime",
    status: "completed",
    createdAt: "2026-08-10T07:00:00.000Z",
    assignedAt: "2026-08-10T07:00:00.000Z",
    etaMinutes: null,
    arrivedAt: "2026-08-10T09:00:00.000Z",
  },
  {
    orderId: "syn-order-unknown-no-reservation",
    semantics: "reservation",
    status: "completed",
    createdAt: "2026-08-10T08:00:00.000Z",
    reservationStart: null,
    assignedAt: "2026-08-10T08:00:00.000Z",
    arrivedAt: "2026-08-10T09:00:00.000Z",
  },
  {
    orderId: "syn-order-never-assigned",
    semantics: "realtime",
    status: "cancelled",
    createdAt: "2026-08-10T09:00:00.000Z",
  },
  {
    orderId: "syn-order-low-rating-referral",
    semantics: "realtime",
    status: "completed",
    createdAt: "2026-08-11T03:00:00.000Z",
    assignedAt: "2026-08-11T03:00:00.000Z",
    etaMinutes: 5,
    arrivedAt: "2026-08-11T03:04:00.000Z",
    referralRatingCaseNo: "C-20260805-000003",
  },
];

const TRIPS_WITHOUT_REFERRAL_RATING = TRIPS.map((trip) => {
  const copy = { ...trip };
  delete copy.referralRatingCaseNo;
  return copy;
});

// Asia/Taipei is UTC+8: 2026-07-31T16:30Z is 2026-08-01 00:30 in Taipei and
// 2026-08-31T16:30Z is 2026-09-01 00:30 in Taipei.
const CASES = [
  complaintCase("C-20260801-000001", {
    createdAt: "2026-07-31T16:30:00.000Z",
    slaDueAt: "2026-09-30T00:00:00.000Z",
  }),
  complaintCase("C-20260901-000002", {
    createdAt: "2026-08-31T16:30:00.000Z",
    slaDueAt: "2026-09-30T00:00:00.000Z",
  }),
  complaintCase("C-20260805-000003", {
    relatedOrderId: "syn-order-low-rating-referral",
    category: "driver_service",
    createdAt: "2026-08-05T02:00:00.000Z",
    status: "closed",
    slaDueAt: "2026-08-06T02:00:00.000Z",
  }),
  complaintCase("C-20260720-000004", {
    category: "fare_dispute",
    createdAt: "2026-07-20T02:00:00.000Z",
    status: "assigned",
    slaDueAt: "2026-08-02T02:00:00.000Z",
  }),
  complaintCase("C-20260812-000005", {
    category: "fare_dispute",
    createdAt: "2026-08-12T02:00:00.000Z",
    status: "closed",
    slaDueAt: "2026-08-20T02:00:00.000Z",
  }),
  complaintCase("C-20260913-000006", {
    createdAt: "2026-09-13T02:00:00.000Z",
    status: "under_investigation",
    slaDueAt: "2026-09-20T02:00:00.000Z",
  }),
];

const TIMELINES = [
  closedEntry("C-20260805-000003", "2026-08-06T01:00:00.000Z"),
  // Closed after its SLA due: counted as closed in September (Taipei), and no
  // longer overdue because it is closed at the report time.
  closedEntry("C-20260812-000005", "2026-08-31T17:00:00.000Z"),
];

const QUERY = { periodMonthFrom: "2026-08", periodMonthTo: "2026-09" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Minimal RFC 4180 reader for the rendered artifact (quoted cells). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function only(rows: SixMonthOperationsSummary[]) {
  expect(rows).toHaveLength(1);
  const [row] = rows;
  expect(row).toMatchObject({
    businessArea: AREA,
    serviceProductCode: PRODUCT,
  });
  return row!;
}

function expectPunctuality(row: SixMonthOperationsSummary) {
  expect(row.lateArrivalThresholdMinutes).toBe(LATE_ARRIVAL_THRESHOLD_MINUTES);
  expect(LATE_ARRIVAL_THRESHOLD_MINUTES).toBe(5);
  expect(row.drilldown?.punctuality).toEqual({
    definitionVersion: "bureau-r10-v1",
    lateArrivalThresholdMinutes: 5,
    assignedTripCount: 10,
    onTimeTripCount: 4,
    lateTripCount: 2,
    noShowTripCount: 1,
    unknownTripCount: 3,
    onTimeOrderIds: [
      "syn-order-immediate-exact",
      "syn-order-low-rating-referral",
      "syn-order-on-time-exact",
      "syn-order-passenger-cancel-after-arrival",
    ],
    lateOrderIds: ["syn-order-immediate-late", "syn-order-late-scheduled"],
    noShowOrderIds: ["syn-order-no-show"],
    unknownOrderIds: [
      "syn-order-unknown-no-arrival",
      "syn-order-unknown-no-eta",
      "syn-order-unknown-no-reservation",
    ],
  });
  expect(row).toMatchObject({
    onTimeTripCount: 4,
    lateTripCount: 2,
    noShowTripCount: 1,
    punctualityUnknownTripCount: 3,
  });
  // Existing definitions are unchanged; the outcomes partition the
  // existing actual dispatch count.
  expect(row.demandRequestCount).toBe(11);
  expect(row.actualDispatchCount).toBe(10);
  expect(row.cancelledOrderCount).toBe(3);
  expect(
    (row.onTimeTripCount ?? NaN) +
      (row.lateTripCount ?? NaN) +
      (row.noShowTripCount ?? NaN) +
      (row.punctualityUnknownTripCount ?? NaN),
  ).toBe(row.actualDispatchCount);
}

function expectComplaintStatistics(row: SixMonthOperationsSummary) {
  const [august, september] = row.drilldown!.complaintMonthlyStatistics;
  expect(august).toMatchObject({
    periodMonth: "2026-08",
    timeZone: COMPLAINT_STATISTICS_TIME_ZONE,
  });
  expect(august!.lowRatingAuto).toEqual({
    createdCount: 1,
    closedCount: 1,
    overdueCount: 0,
    createdCaseNos: ["C-20260805-000003"],
    closedCaseNos: ["C-20260805-000003"],
    overdueCaseNos: [],
  });
  expect(august!.manual).toEqual({
    createdCount: 2,
    closedCount: 0,
    overdueCount: 1,
    // UTC July 31 16:30 is already August in Taipei.
    createdCaseNos: ["C-20260801-000001", "C-20260812-000005"],
    closedCaseNos: [],
    overdueCaseNos: ["C-20260720-000004"],
  });
  expect(august!.manualByCategory).toEqual([
    {
      category: "driver_service",
      createdCount: 1,
      closedCount: 0,
      overdueCount: 0,
      createdCaseNos: ["C-20260801-000001"],
      closedCaseNos: [],
      overdueCaseNos: [],
    },
    {
      category: "fare_dispute",
      createdCount: 1,
      closedCount: 0,
      overdueCount: 1,
      createdCaseNos: ["C-20260812-000005"],
      closedCaseNos: [],
      overdueCaseNos: ["C-20260720-000004"],
    },
  ]);
  expect(september).toMatchObject({ periodMonth: "2026-09" });
  expect(september!.lowRatingAuto.createdCount).toBe(0);
  expect(september!.manual).toEqual({
    createdCount: 2,
    closedCount: 1,
    // C-…000006 is due 2026-09-20, after the report time: not overdue yet.
    overdueCount: 0,
    createdCaseNos: ["C-20260901-000002", "C-20260913-000006"],
    closedCaseNos: ["C-20260812-000005"],
    overdueCaseNos: [],
  });
  expect(row).toMatchObject({
    complaintCreatedLowRatingAutoCount: 1,
    complaintCreatedManualCount: 4,
    complaintClosedLowRatingAutoCount: 1,
    complaintClosedManualCount: 1,
    complaintOverdueLowRatingAutoCount: 0,
    complaintOverdueManualCount: 1,
    complaintStatisticsAsOf: "2026-09-15T00:00:00.000Z",
  });
}

describe("bureau-r10_late_and_no_show_metrics", () => {
  it("classifies the boundary, late, no-show and unknown trips through the six-month preview", async () => {
    const service = memoryService(buildSource(TRIPS, CASES), TIMELINES);
    const row = only(await service.previewSixMonthOperationsSummary(QUERY));
    expectPunctuality(row);
  });
});

describe("bureau-r09_monthly_complaint_statistics", () => {
  it("groups created / closed / overdue by Asia/Taipei month and splits low-rating auto from manual", async () => {
    const service = memoryService(buildSource(TRIPS, CASES), TIMELINES);
    const row = only(await service.previewSixMonthOperationsSummary(QUERY));
    expectComplaintStatistics(row);
    // The existing complaint count keeps its original (UTC created-month)
    // definition: the case created 2026-07-31T16:30Z is not in it.
    expect(row.complaintCount).toBe(4);
  });

  it("reads closures and low-rating provenance from canonical storage in the persisted runtime", async () => {
    const source = buildSource(TRIPS_WITHOUT_REFERRAL_RATING, CASES);
    const { service, statements } = persistedService(source, {
      closures: TIMELINES.map((entry) => ({
        caseNo: entry.caseNo,
        closedAt: entry.createdAt,
      })),
      // Supplied by a rating-consent row, not by the order record.
      lowRatingCaseNos: ["C-20260805-000003"],
    });
    const row = only(await service.previewSixMonthOperationsSummary(QUERY));
    expectPunctuality(row);
    expectComplaintStatistics(row);
    const provenanceSql = statements.find((sql) =>
      sql.includes("'lowRatingCaseNos'"),
    );
    expect(provenanceSql).toBeDefined();
    for (const authority of [
      "crm.phase1_complaint_timelines",
      "t.action = 'case_closed'",
      "passenger.rating_consents",
      "ops.passenger_ride_rating_consents",
      "{referralPassengerLifecycle,rating,complaintCaseNo}",
    ]) {
      expect(provenanceSql).toContain(authority);
    }
  });

  it("reports a case as manual when no canonical low-rating link exists, keeping its id auditable", async () => {
    const service = memoryService(
      buildSource(TRIPS_WITHOUT_REFERRAL_RATING, CASES),
      TIMELINES,
    );
    const row = only(await service.previewSixMonthOperationsSummary(QUERY));
    // Without any canonical low-rating link the case is reported as manual,
    // and its id is still listed so the classification can be audited.
    expect(row.complaintCreatedLowRatingAutoCount).toBe(0);
    expect(
      row.drilldown!.complaintMonthlyStatistics[0]!.manual.createdCaseNos,
    ).toContain("C-20260805-000003");
  });
});

describe("export through the existing six-month report job", () => {
  it("carries the new scalar figures in CSV and keeps drill-down ids on the preview API", async () => {
    const service = memoryService(buildSource(TRIPS, CASES), TIMELINES);
    const filing = new ReportingFilingService(new AuditNotificationService());
    filing.registerSixMonthOperationsSummaryProvider((filters) =>
      service.previewSixMonthOperationsSummary(filters),
    );
    const accepted = filing.createReportJob({
      jobType: "six_month_operations_summary",
      format: "csv",
      filters: { from: "2026-08-01", to: "2026-09-30" },
    });
    // Only Date is faked, so the report job's own timers still run; the job
    // keeps the 2026-09-15 report time for `overdue`.
    await vi.waitFor(
      () => {
        if (filing.getReportJob(accepted.jobId).status !== "completed")
          throw new Error("report job still pending");
      },
      { timeout: 2000, interval: 5 },
    );
    const artifact = await filing.renderReportArtifact(accepted.jobId);
    const [columns, values] = parseCsv(
      artifact.buffer.toString("utf8").replace(/^\uFEFF/, ""),
    );
    const cell = (name: string) => values![columns!.indexOf(name)];
    for (const column of [
      "lateArrivalThresholdMinutes",
      "onTimeTripCount",
      "lateTripCount",
      "noShowTripCount",
      "punctualityUnknownTripCount",
      "complaintCreatedLowRatingAutoCount",
      "complaintCreatedManualCount",
      "complaintClosedLowRatingAutoCount",
      "complaintClosedManualCount",
      "complaintOverdueLowRatingAutoCount",
      "complaintOverdueManualCount",
      "complaintStatisticsAsOf",
    ]) {
      expect(columns).toContain(column);
    }
    expect(columns).not.toContain("drilldown");
    expect(values).toHaveLength(columns!.length);
    expect(cell("lateArrivalThresholdMinutes")).toBe("5");
    expect(cell("lateTripCount")).toBe("2");
    expect(cell("noShowTripCount")).toBe("1");
    expect(cell("punctualityUnknownTripCount")).toBe("3");
    expect(cell("complaintCreatedLowRatingAutoCount")).toBe("1");
    expect(cell("complaintOverdueManualCount")).toBe("1");
  });
});
