import {
  COMPLAINT_STATISTICS_TIME_ZONE,
  LATE_ARRIVAL_THRESHOLD_MINUTES,
  OPERATIONS_PUNCTUALITY_DEFINITION_VERSION,
} from "@drts/contracts";
import type {
  ComplaintCaseRecord,
  ComplaintMonthlyCategoryCounts,
  ComplaintMonthlyCounts,
  ComplaintMonthlyStatistic,
  DispatchDailyRecord,
  DispatchSemantics,
  OperationsPunctualityMetrics,
  OperationsPunctualityOutcome,
} from "@drts/contracts";

/** One trip of the window with the dispatch semantics of its canonical order. */
export type PunctualityTrip = {
  record: Pick<
    DispatchDailyRecord,
    | "orderId"
    | "reservationTime"
    | "firstAssignedAt"
    | "etaSecondsAtAssignment"
    | "arrivedPickupAt"
    | "finalStatus"
  >;
  dispatchSemantics: DispatchSemantics;
};

export type ComplaintClosureEntry = {
  caseNo: string;
  closedAt: string;
};

export type ComplaintStatisticsSource = {
  /** `case_closed` timeline entries; one case may close again after a reopen. */
  closures: ComplaintClosureEntry[];
  /** Cases created by the low-rating hooks (rating consent / referral rating). */
  lowRatingCaseNos: string[];
};

const LATE_ARRIVAL_THRESHOLD_MS = LATE_ARRIVAL_THRESHOLD_MINUTES * 60 * 1000;

const parseTime = (value: string | null | undefined) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/**
 * Bureau R10. Only orders with a recorded first assignment are classified.
 * Scheduled = `reservation` dispatch semantics (reference: reservation window
 * start); every other semantics is immediate (reference: first assignment +
 * ETA committed at assignment). Missing timestamps yield `unknown`.
 */
export function classifyTripPunctuality(
  trip: PunctualityTrip,
): OperationsPunctualityOutcome | null {
  const { record } = trip;
  const assignedAt = parseTime(record.firstAssignedAt);
  if (assignedAt === null) return null;
  const arrivedAt = parseTime(record.arrivedPickupAt);
  if (arrivedAt === null) {
    // No arrival on record: a cancelled assignment is 未到; anything else
    // (in progress, or completed without an arrival event) is unknown.
    return record.finalStatus === "cancelled" ? "no_show" : "unknown";
  }
  let referenceAt: number | null;
  if (trip.dispatchSemantics === "reservation") {
    referenceAt = parseTime(record.reservationTime);
  } else {
    const etaSeconds = record.etaSecondsAtAssignment;
    referenceAt =
      typeof etaSeconds === "number" && Number.isFinite(etaSeconds)
        ? assignedAt + etaSeconds * 1000
        : null;
  }
  if (referenceAt === null) return "unknown";
  return arrivedAt - referenceAt > LATE_ARRIVAL_THRESHOLD_MS
    ? "late"
    : "on_time";
}

export function emptyPunctualityMetrics(): OperationsPunctualityMetrics {
  return {
    definitionVersion: OPERATIONS_PUNCTUALITY_DEFINITION_VERSION,
    lateArrivalThresholdMinutes: LATE_ARRIVAL_THRESHOLD_MINUTES,
    assignedTripCount: 0,
    onTimeTripCount: 0,
    lateTripCount: 0,
    noShowTripCount: 0,
    unknownTripCount: 0,
    onTimeOrderIds: [],
    lateOrderIds: [],
    noShowOrderIds: [],
    unknownOrderIds: [],
  };
}

export function addTripPunctuality(
  metrics: OperationsPunctualityMetrics,
  trip: PunctualityTrip,
) {
  const outcome = classifyTripPunctuality(trip);
  if (outcome === null) return;
  const orderId = trip.record.orderId;
  metrics.assignedTripCount += 1;
  switch (outcome) {
    case "on_time":
      metrics.onTimeTripCount += 1;
      metrics.onTimeOrderIds.push(orderId);
      break;
    case "late":
      metrics.lateTripCount += 1;
      metrics.lateOrderIds.push(orderId);
      break;
    case "no_show":
      metrics.noShowTripCount += 1;
      metrics.noShowOrderIds.push(orderId);
      break;
    case "unknown":
      metrics.unknownTripCount += 1;
      metrics.unknownOrderIds.push(orderId);
      break;
  }
}

export function sortPunctualityMetrics(
  metrics: OperationsPunctualityMetrics,
): OperationsPunctualityMetrics {
  const sorted = (ids: string[]) => [...ids].sort((a, b) => a.localeCompare(b));
  return {
    ...metrics,
    onTimeOrderIds: sorted(metrics.onTimeOrderIds),
    lateOrderIds: sorted(metrics.lateOrderIds),
    noShowOrderIds: sorted(metrics.noShowOrderIds),
    unknownOrderIds: sorted(metrics.unknownOrderIds),
  };
}

const taipeiCalendar = new Intl.DateTimeFormat("en", {
  timeZone: COMPLAINT_STATISTICS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

/** YYYY-MM of an instant in the Asia/Taipei calendar; null when unparseable. */
export function toTaipeiMonth(value: string | null | undefined) {
  const time = parseTime(value);
  if (time === null) return null;
  const parts = taipeiCalendar.formatToParts(new Date(time));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : null;
}

type CountSets = {
  created: Set<string>;
  closed: Set<string>;
  overdue: Set<string>;
};

const emptyCountSets = (): CountSets => ({
  created: new Set(),
  closed: new Set(),
  overdue: new Set(),
});

const toCounts = (sets: CountSets): ComplaintMonthlyCounts => {
  const sorted = (ids: Set<string>) =>
    [...ids].sort((a, b) => a.localeCompare(b));
  return {
    createdCount: sets.created.size,
    closedCount: sets.closed.size,
    overdueCount: sets.overdue.size,
    createdCaseNos: sorted(sets.created),
    closedCaseNos: sorted(sets.closed),
    overdueCaseNos: sorted(sets.overdue),
  };
};

/**
 * Bureau R09. Per Asia/Taipei month of `periods`: created (case createdAt),
 * closed (`case_closed` timeline entry), overdue (SLA due in that month, at or
 * before `asOf`, and the case is not closed at `asOf`). Each figure is split
 * into low-rating automatic cases and manual cases (also per category).
 */
export function buildComplaintMonthlyStatistics(
  cases: readonly ComplaintCaseRecord[],
  source: ComplaintStatisticsSource,
  periods: readonly string[],
  asOf: string,
): ComplaintMonthlyStatistic[] {
  const lowRating = new Set(source.lowRatingCaseNos);
  const asOfTime = parseTime(asOf);
  const months = new Map(
    periods.map((periodMonth) => [
      periodMonth,
      {
        lowRatingAuto: emptyCountSets(),
        manual: emptyCountSets(),
        manualByCategory: new Map<string, CountSets>(),
      },
    ]),
  );
  const casesByNo = new Map<string, ComplaintCaseRecord>();
  for (const complaintCase of cases) {
    if (!casesByNo.has(complaintCase.caseNo)) {
      casesByNo.set(complaintCase.caseNo, complaintCase);
    }
  }
  const add = (
    complaintCase: ComplaintCaseRecord,
    month: string | null,
    key: keyof CountSets,
  ) => {
    const bucket = month ? months.get(month) : undefined;
    if (!bucket) return;
    if (lowRating.has(complaintCase.caseNo)) {
      bucket.lowRatingAuto[key].add(complaintCase.caseNo);
      return;
    }
    bucket.manual[key].add(complaintCase.caseNo);
    let category = bucket.manualByCategory.get(complaintCase.category);
    if (!category) {
      category = emptyCountSets();
      bucket.manualByCategory.set(complaintCase.category, category);
    }
    category[key].add(complaintCase.caseNo);
  };

  for (const complaintCase of casesByNo.values()) {
    add(complaintCase, toTaipeiMonth(complaintCase.createdAt), "created");
    const dueAt = parseTime(complaintCase.slaDueAt);
    if (
      asOfTime !== null &&
      dueAt !== null &&
      dueAt <= asOfTime &&
      complaintCase.status !== "closed"
    ) {
      add(complaintCase, toTaipeiMonth(complaintCase.slaDueAt), "overdue");
    }
  }
  for (const closure of source.closures) {
    const complaintCase = casesByNo.get(closure.caseNo);
    if (complaintCase) {
      add(complaintCase, toTaipeiMonth(closure.closedAt), "closed");
    }
  }

  return periods.map((periodMonth) => {
    const bucket = months.get(periodMonth)!;
    return {
      periodMonth,
      timeZone: COMPLAINT_STATISTICS_TIME_ZONE,
      lowRatingAuto: toCounts(bucket.lowRatingAuto),
      manual: toCounts(bucket.manual),
      manualByCategory: [...bucket.manualByCategory.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([category, sets]): ComplaintMonthlyCategoryCounts => ({
            category,
            ...toCounts(sets),
          }),
        ),
    };
  });
}

/** Distinct-case window totals of the monthly statistics (R09 export columns). */
export function totalComplaintMonthlyStatistics(
  statistics: readonly ComplaintMonthlyStatistic[],
) {
  const union = (
    origin: "lowRatingAuto" | "manual",
    key: "createdCaseNos" | "closedCaseNos" | "overdueCaseNos",
  ) => new Set(statistics.flatMap((month) => month[origin][key])).size;
  return {
    complaintCreatedLowRatingAutoCount: union(
      "lowRatingAuto",
      "createdCaseNos",
    ),
    complaintCreatedManualCount: union("manual", "createdCaseNos"),
    complaintClosedLowRatingAutoCount: union("lowRatingAuto", "closedCaseNos"),
    complaintClosedManualCount: union("manual", "closedCaseNos"),
    complaintOverdueLowRatingAutoCount: union(
      "lowRatingAuto",
      "overdueCaseNos",
    ),
    complaintOverdueManualCount: union("manual", "overdueCaseNos"),
  };
}
