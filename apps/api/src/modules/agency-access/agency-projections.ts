import type {
  AgencyComplaintCounts,
  AgencyComplaintMonthlyStatisticsView,
  AgencyDailyDispatchRecordView,
  AgencyDriverQualificationView,
  AgencyExpiryStatus,
  AgencyMonthlyOperationsSummaryView,
  AgencyOperationsSummaryView,
  AgencyPage,
  AgencyTripRecordView,
  AgencyVehicleQualificationView,
  ComplaintMonthlyCounts,
  ComplaintMonthlyStatistic,
  DispatchDailyRecord,
  DriverRegistryRecord,
  InsurancePolicyRecord,
  MultiTaxiTripOperationalAdminView,
  MultiTaxiTripOperationalExportRow,
  SixMonthOperationsSummary,
  VehicleRegistryRecord,
} from "@drts/contracts";

import {
  maskAddress,
  maskName,
  maskOpaqueToken,
} from "../../common/sensitive-data-policy";
import type { MonthlyOperationsSummaryRecord } from "../reporting/reporting.repository";

/**
 * BUREAU-R13 §4 allowlist projections. Every function builds its output
 * field by field from the authoritative record; a field not listed here never
 * reaches an agency. Missing source values stay `null` (UI: 未提供) and are
 * never replaced by zero or a default.
 */

export const AGENCY_PAGE_SIZE_MAX = 200;
export const AGENCY_DEFAULT_PAGE_SIZE = 50;
export const AGENCY_EXPIRY_WINDOW_DEFAULT_DAYS = 30;
export const AGENCY_EXPIRY_WINDOW_MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Two-calendar-year retention boundary: `retainUntil` (>= two calendar years from completion) >= now. */
export function isWithinAgencyRetention(
  retainUntil: string | null | undefined,
  nowMs: number,
): boolean {
  if (!retainUntil) return false;
  const retainUntilMs = Date.parse(retainUntil);
  return Number.isFinite(retainUntilMs) && retainUntilMs >= nowMs;
}

export function projectAgencyTripRecord(
  record: MultiTaxiTripOperationalAdminView,
): AgencyTripRecordView {
  const rawPlate = record.plateNo?.trim() ?? "";
  const plateNo =
    rawPlate && rawPlate !== "—" && rawPlate !== "UNRECORDED" ? rawPlate : null;
  const paymentStatus = record.paymentStatus ?? "unknown";
  const collectedFareMinor =
    record.collectedFareMinor !== undefined
      ? record.collectedFareMinor
      : paymentStatus === "captured"
        ? record.actualFareMinor
        : paymentStatus === "refunded"
          ? 0
          : null;
  const tollSource =
    record.tollSource ??
    (record.tollMinor !== undefined && record.tollMinor !== null
      ? record.tollMinor > 0
        ? "driver_proof"
        : "none"
      : "unavailable");
  const tollMinor = tollSource === "unavailable" ? null : record.tollMinor;

  return {
    recordId: record.recordId,
    orderId: record.orderId,
    tripId: record.tripId,
    orderNoMasked: maskOpaqueToken(record.orderNo, 3, 2),
    plateNo,
    plateNoMasked: maskOpaqueToken(plateNo, 2, 2),
    reservedAt: record.reservedAt,
    pickupAt: record.pickupAt ?? null,
    dropoffAt: record.dropoffAt ?? null,
    route: {
      routeSummary: record.route?.routeSummary ?? null,
      source: record.route?.source ?? "unavailable",
      distanceMeters: record.route?.distanceMeters ?? null,
      durationSeconds: record.route?.durationSeconds ?? null,
    },
    payableFareMinor: record.payableFareMinor,
    actualFareMinor: record.actualFareMinor,
    collectedFareMinor,
    paymentStatus,
    tollMinor,
    tollSource,
    currency: record.currency,
    farePolicyVersion: record.farePolicyVersion,
    chargingMode: record.chargingMode,
    generatedAt: record.generatedAt,
    retainUntil: record.retainUntil,
    legalHold: { state: record.legalHold?.state ?? "unavailable" },
  };
}

/** Export rows preserve full statutory R11 fields and provenance within the 2-year retention window. */
export function filterAgencyExportRows(
  rows: readonly MultiTaxiTripOperationalExportRow[],
  nowMs: number,
): MultiTaxiTripOperationalExportRow[] {
  return rows
    .filter((row) => isWithinAgencyRetention(row.retainUntil, nowMs))
    .map((row) => ({ ...row }));
}

export function normalizeAgencyPage(
  page: unknown,
  pageSize: unknown,
): { page: number; pageSize: number } {
  const parsedPage = Number(page);
  const parsedSize = Number(pageSize);
  return {
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isSafeInteger(parsedSize) && parsedSize > 0
        ? Math.min(parsedSize, AGENCY_PAGE_SIZE_MAX)
        : AGENCY_DEFAULT_PAGE_SIZE,
  };
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): AgencyPage<T> {
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

function projectSummaryFigures(
  summary: Pick<
    SixMonthOperationsSummary,
    | "businessArea"
    | "serviceProductCode"
    | "demandRequestCount"
    | "actualDispatchCount"
    | "completedTripCount"
    | "cancelledOrderCount"
    | "averageDispatchableVehicleCount"
    | "validSnapshotCount"
    | "expectedSnapshotCount"
    | "snapshotCoverageRate"
    | "complaintCount"
    | "complaintsByCategory"
    | "generatedAt"
  >,
) {
  return {
    businessArea: summary.businessArea ?? null,
    serviceProductCode: summary.serviceProductCode ?? null,
    demandRequestCount: summary.demandRequestCount,
    actualDispatchCount: summary.actualDispatchCount,
    completedTripCount: summary.completedTripCount,
    cancelledOrderCount: summary.cancelledOrderCount,
    averageDispatchableVehicleCount: summary.averageDispatchableVehicleCount,
    validSnapshotCount: summary.validSnapshotCount,
    expectedSnapshotCount: summary.expectedSnapshotCount,
    // §4.2: with no expected snapshot the rate is 未提供, never 0%.
    snapshotCoverageRate:
      summary.expectedSnapshotCount > 0 ? summary.snapshotCoverageRate : null,
    complaintCount: summary.complaintCount,
    complaintsByCategory: { ...summary.complaintsByCategory },
    generatedAt: summary.generatedAt,
  };
}

/** §4.2: aggregate figures only; punctuality/complaint drilldown ids are dropped. */
export function projectAgencyOperationsSummary(
  summary: SixMonthOperationsSummary,
): AgencyOperationsSummaryView {
  return {
    from: summary.from,
    to: summary.to,
    ...projectSummaryFigures(summary),
  };
}

export function projectAgencyMonthlyOperationsSummary(
  record: MonthlyOperationsSummaryRecord,
): AgencyMonthlyOperationsSummaryView {
  return {
    periodMonth: record.periodMonth,
    ...projectSummaryFigures(record),
  };
}

const CANCELLATION_REASON_CODE = /^[a-z][a-z0-9_]{2,63}$/;

/** §4.3 masked daily dispatch projection. */
export function projectAgencyDailyDispatchRecord(
  record: DispatchDailyRecord,
): AgencyDailyDispatchRecordView {
  return {
    serviceDate: record.serviceDate,
    orderNoMasked: maskOpaqueToken(record.orderNo, 3, 2),
    orderSource: record.orderSource,
    serviceProductCode: record.serviceProductCode,
    requestedAt: record.requestedAt,
    reservationTime: record.reservationTime ?? null,
    pickupAddressMasked: maskAddress(record.pickupAddressSnapshot),
    dropoffAddressMasked: maskAddress(record.dropoffAddressSnapshot),
    firstDispatchAt: record.firstDispatchAt ?? null,
    firstAssignedAt: record.firstAssignedAt ?? null,
    finalDriverIdMasked: maskOpaqueToken(record.finalDriverId, 3, 2),
    finalPlateNoMasked: maskOpaqueToken(record.finalPlateNo, 2, 2),
    etaSecondsAtAssignment: record.etaSecondsAtAssignment ?? null,
    arrivedPickupAt: record.arrivedPickupAt ?? null,
    tripStartedAt: record.tripStartedAt ?? null,
    tripCompletedAt: record.tripCompletedAt ?? null,
    finalStatus: record.finalStatus,
    redispatchCount: record.redispatchCount,
    // The source column also carries free text (e.g. exception-hold notes);
    // only a reason code is disclosed, anything else is withheld.
    cancellationReason:
      record.cancellationReason &&
      CANCELLATION_REASON_CODE.test(record.cancellationReason)
        ? record.cancellationReason
        : null,
    complaintCount: record.complaintCount,
  };
}

function projectComplaintCounts(
  counts: ComplaintMonthlyCounts | null | undefined,
): AgencyComplaintCounts | null {
  if (!counts) return null;
  // Counts only: createdCaseNos / closedCaseNos / overdueCaseNos are dropped.
  return {
    createdCount: counts.createdCount,
    closedCount: counts.closedCount,
    overdueCount: counts.overdueCount,
  };
}

/** R09 metrics without an authoritative aggregate (D7); shown as 未提供. */
export const AGENCY_COMPLAINT_UNAVAILABLE_METRICS = [
  "resolvedCount",
  "slaBreachCount",
] as const;

/**
 * §4.4 / D7: per-month complaint counts from the monthly read model plus the
 * accepted R09 created/closed/overdue counts for the same month and
 * dimension. No case numbers or case detail leave this function.
 */
export function projectAgencyComplaintMonthlyStatistics(
  monthly: readonly MonthlyOperationsSummaryRecord[],
  previews: readonly SixMonthOperationsSummary[],
): AgencyComplaintMonthlyStatisticsView[] {
  const statisticsByKey = new Map<string, ComplaintMonthlyStatistic>();
  for (const summary of previews) {
    for (const statistic of summary.drilldown?.complaintMonthlyStatistics ??
      []) {
      statisticsByKey.set(
        `${summary.businessArea ?? ""}|${summary.serviceProductCode ?? ""}|${statistic.periodMonth}`,
        statistic,
      );
    }
  }
  return monthly
    .map((record) => {
      const statistic = statisticsByKey.get(
        `${record.businessArea}|${record.serviceProductCode}|${record.periodMonth}`,
      );
      return {
        periodMonth: record.periodMonth,
        businessArea: record.businessArea,
        serviceProductCode: record.serviceProductCode,
        complaintCount: record.complaintCount,
        complaintsByCategory: { ...record.complaintsByCategory },
        lowRatingAuto: projectComplaintCounts(statistic?.lowRatingAuto),
        manual: projectComplaintCounts(statistic?.manual),
        manualByCategory: (statistic?.manualByCategory ?? []).map(
          (category) => ({
            category: category.category,
            ...projectComplaintCounts(category)!,
          }),
        ),
      };
    })
    .sort(
      (left, right) =>
        right.periodMonth.localeCompare(left.periodMonth) ||
        left.businessArea.localeCompare(right.businessArea) ||
        left.serviceProductCode.localeCompare(right.serviceProductCode),
    );
}

export function normalizeExpiryWindowDays(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return AGENCY_EXPIRY_WINDOW_DEFAULT_DAYS;
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > AGENCY_EXPIRY_WINDOW_MAX_DAYS
  ) {
    return null;
  }
  return parsed;
}

/**
 * §4.5: expired (< now), expiring (now <= date <= now + window, inclusive,
 * same bounds as listExpiringDriverLicenses/listExpiringPolicies), valid
 * (> now + window), unavailable (missing or unparseable).
 */
export function computeExpiryStatus(
  value: string | null | undefined,
  nowMs: number,
  windowDays: number,
): AgencyExpiryStatus {
  if (!value) return "unavailable";
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return "unavailable";
  if (dateMs < nowMs) return "expired";
  if (dateMs <= nowMs + windowDays * DAY_MS) return "expiring";
  return "valid";
}

export function projectAgencyVehicleQualification(
  vehicle: VehicleRegistryRecord,
  policiesById: ReadonlyMap<string, InsurancePolicyRecord>,
  nowMs: number,
  windowDays: number,
): AgencyVehicleQualificationView {
  const insurance = vehicle.supplyLifecycle?.insurance;
  const policy = insurance?.policyId
    ? policiesById.get(insurance.policyId)
    : undefined;
  return {
    plateNoMasked: maskOpaqueToken(vehicle.plateNo, 2, 2),
    licenseType: vehicle.licenseType ?? null,
    operatingArea: vehicle.operatingArea,
    dispatchableFlag: vehicle.dispatchableFlag,
    insuranceStatus: vehicle.insuranceStatus,
    dispatchEligible: vehicle.supplyLifecycle?.dispatch?.eligible ?? null,
    dispatchBlockedReasons: [
      ...(vehicle.supplyLifecycle?.dispatch?.blockedReasons ?? []),
    ],
    offboardingStatus: vehicle.supplyLifecycle?.offboarding?.status ?? null,
    insuranceEndAt: insurance?.endAt ?? null,
    insuranceLifecycleStatus: insurance?.lifecycleStatus ?? null,
    insuranceExpiryStatus: computeExpiryStatus(
      insurance?.endAt,
      nowMs,
      windowDays,
    ),
    policyNoMasked: policy ? maskOpaqueToken(policy.policyNo, 2, 2) : null,
    inspectionDueAt: null,
    inspectionExpiryStatus: "unavailable",
  };
}

export function projectAgencyDriverQualification(
  driver: DriverRegistryRecord,
  nowMs: number,
  windowDays: number,
): AgencyDriverQualificationView {
  return {
    driverIdMasked: maskOpaqueToken(driver.driverId, 3, 2),
    nameMasked: maskName(driver.name),
    licensesValid: driver.licensesValid,
    licenseExpiry: driver.licenseExpiry ?? null,
    licenseExpiryStatus: computeExpiryStatus(
      driver.licenseExpiry,
      nowMs,
      windowDays,
    ),
    professionalDriverLicenseExpiry:
      driver.professionalDriverLicenseExpiry ?? null,
    professionalDriverLicenseExpiryStatus: computeExpiryStatus(
      driver.professionalDriverLicenseExpiry,
      nowMs,
      windowDays,
    ),
    taxiDriverRegistrationExpiry: driver.taxiDriverRegistrationExpiry ?? null,
    taxiDriverRegistrationExpiryStatus: computeExpiryStatus(
      driver.taxiDriverRegistrationExpiry,
      nowMs,
      windowDays,
    ),
    lifecycleStatus: driver.lifecycleStatus,
    dispatchEligible: driver.dispatchEligible,
    eligibilityBlockedReasons: [...driver.eligibilityBlockedReasons],
  };
}

export function vehicleMatchesExpiryStatus(
  view: AgencyVehicleQualificationView,
  status: AgencyExpiryStatus,
): boolean {
  return (
    view.insuranceExpiryStatus === status ||
    view.inspectionExpiryStatus === status
  );
}

export function driverMatchesExpiryStatus(
  view: AgencyDriverQualificationView,
  status: AgencyExpiryStatus,
): boolean {
  return [
    view.licenseExpiryStatus,
    view.professionalDriverLicenseExpiryStatus,
    view.taxiDriverRegistrationExpiryStatus,
  ].includes(status);
}
