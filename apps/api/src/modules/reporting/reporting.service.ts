import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";

import type {
  ComplaintCaseRecord,
  DispatchAssignmentRecord,
  DispatchDailyRecord,
  DispatchJobRecord,
  DispatchableSupplySnapshotRecord,
  DispatchTraceLogRecord,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
  Phase1ServiceBucket,
  ServiceProductType,
  SixMonthMonthlyOperationsSummary,
  SixMonthOperationsSummary,
  VehicleRegistryRecord,
} from "@drts/contracts";

import {
  COMPLAINT_STATISTICS_TIME_ZONE,
  LATE_ARRIVAL_THRESHOLD_MINUTES,
} from "@drts/contracts";

import { ComplaintService } from "../complaint/complaint.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../vehicle-eligibility/vehicle-eligibility.service";
import {
  addTripPunctuality,
  buildComplaintMonthlyStatistics,
  emptyPunctualityMetrics,
  sortPunctualityMetrics,
  toTaipeiMonth,
  totalComplaintMonthlyStatistics,
  type ComplaintStatisticsSource,
} from "./operations-metrics";
import {
  ReportingRepository,
  type DailyDispatchRecordQuery,
  type DispatchableSupplySnapshotQuery,
  type DispatchDailyRecordSource,
  type MonthlyOperationsSummaryQuery,
  type MonthlyOperationsSummaryRecord,
} from "./reporting.repository";

type DispatchDailyRecordRebuildResult = {
  rebuiltCount: number;
  generatedAt: string;
  records: DispatchDailyRecord[];
};

type DispatchableSupplySnapshotCaptureResult = {
  snapshotAt: string;
  generatedAt: string;
  records: DispatchableSupplySnapshotRecord[];
};

type MonthlyOperationsSummaryRebuildResult = {
  rebuiltCount: number;
  generatedAt: string;
  records: MonthlyOperationsSummaryRecord[];
};

type OrderReportingDimension = {
  order: OwnedOrderRecord;
  record: DispatchDailyRecord;
  periodMonth: string;
  businessArea: string;
  serviceProductCode: string;
};

type SnapshotEligibilityPair = {
  vehicleId: string;
  driverId: string;
  businessArea: string;
  serviceProductCode: ServiceProductType;
  locationState: DispatchableSupplySnapshotRecord["sourceHealth"];
};

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const LOCATION_FRESHNESS_WINDOW_MS = 90 * 1000;
const LOCATION_ACCURACY_THRESHOLD_METERS = 100;

const TAIPEI_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  timeZone: COMPLAINT_STATISTICS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toTaipeiDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null;
  }
  const parts = TAIPEI_DATE_FORMATTER.formatToParts(new Date(time));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

@Injectable()
export class ReportingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportingService.name);
  private dailyDispatchRecords: DispatchDailyRecord[] = [];
  private dispatchableSupplySnapshots: DispatchableSupplySnapshotRecord[] = [];
  private monthlyOperationsSummaries: MonthlyOperationsSummaryRecord[] = [];
  private readonly snapshotSchedulerEnabled =
    process.env.REPORTING_SNAPSHOT_SCHEDULER_ENABLED !== "false";
  private snapshotScheduleDelay: ReturnType<typeof setTimeout> | null = null;
  private snapshotScheduleInterval: ReturnType<typeof setInterval> | null =
    null;

  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly complaintService: ComplaintService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    @Optional()
    private readonly vehicleEligibilityService?: VehicleEligibilityService,
    @Optional() private readonly reportingRepository?: ReportingRepository,
  ) {}

  onModuleInit() {
    if (!this.snapshotSchedulerEnabled) {
      return;
    }
    this.startDispatchableSupplySnapshotScheduler();
  }

  onModuleDestroy() {
    this.clearDispatchableSupplySnapshotScheduler();
  }

  async rebuildDailyDispatchRecords(
    query: DailyDispatchRecordQuery = {},
  ): Promise<DispatchDailyRecordRebuildResult> {
    const generatedAt = new Date().toISOString();
    const source = await this.loadDailyDispatchRecordSource();
    const vehiclePlateById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle.plateNo] as const),
    );
    const complaintCountByOrderId = new Map<string, number>();
    for (const complaintCase of source.complaintCases) {
      if (!complaintCase.relatedOrderId) {
        continue;
      }
      complaintCountByOrderId.set(
        complaintCase.relatedOrderId,
        (complaintCountByOrderId.get(complaintCase.relatedOrderId) ?? 0) + 1,
      );
    }

    const allBuilt = source.orders.map((order) => {
      const record = this.buildDispatchDailyRecord(
        order,
        source.dispatchJobs,
        source.dispatchAssignments,
        source.driverTasks,
        source.dispatchTraceLogs,
        vehiclePlateById,
        complaintCountByOrderId,
        generatedAt,
      );
      const legacyUtcDate = (
        order.reservationWindowStart ?? order.createdAt
      ).slice(0, 10);
      return { record, legacyUtcDate };
    });

    const records = allBuilt
      .map(({ record }) => record)
      .filter((record) => this.matchesQuery(record, query))
      .sort(
        (left, right) =>
          right.requestedAt.localeCompare(left.requestedAt) ||
          right.orderId.localeCompare(left.orderId),
      );

    const recordsToPersist = allBuilt
      .filter(
        ({ record, legacyUtcDate }) =>
          this.matchesQuery(record, query) ||
          (legacyUtcDate !== record.serviceDate &&
            this.matchesQuery(
              { ...record, serviceDate: legacyUtcDate },
              query,
            )),
      )
      .map(({ record }) => record)
      .sort(
        (left, right) =>
          right.requestedAt.localeCompare(left.requestedAt) ||
          right.orderId.localeCompare(left.orderId),
      );

    if (this.reportingRepository?.isEnabled()) {
      try {
        await this.reportingRepository.upsertDailyDispatchRecords(
          recordsToPersist,
        );
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "upsert dispatch daily records",
        );
        throw new ApiRequestError(
          503,
          "REPORT_REBUILD_FAILED",
          "Daily dispatch records could not be rebuilt.",
        );
      }
    } else {
      this.dailyDispatchRecords = this.mergeRecords(
        this.dailyDispatchRecords,
        recordsToPersist,
      );
    }

    return {
      rebuiltCount: records.length,
      generatedAt,
      records: records.map((record) => ({ ...record })),
    };
  }

  async listDailyDispatchRecords(
    query: DailyDispatchRecordQuery = {},
  ): Promise<DispatchDailyRecord[]> {
    if (this.reportingRepository?.isEnabled()) {
      let records: DispatchDailyRecord[];
      try {
        records =
          await this.reportingRepository.listDailyDispatchRecords(query);
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "list dispatch daily records",
        );
        throw new ApiRequestError(
          503,
          "REPORT_READ_FAILED",
          "Daily dispatch records could not be loaded.",
        );
      }
      if (records.length > 0) {
        return records.map((record) => ({
          ...record,
          serviceDate:
            toTaipeiDate(record.reservationTime ?? record.requestedAt) ??
            this.normalizeServiceDate(record.serviceDate),
        }));
      }
      return (await this.rebuildDailyDispatchRecords(query)).records.map(
        (record) => ({ ...record }),
      );
    }

    let rebuiltRecords: DispatchDailyRecord[] | null = null;
    if (this.dailyDispatchRecords.length === 0) {
      rebuiltRecords = (
        await this.rebuildDailyDispatchRecords(query)
      ).records.map((record) => ({ ...record }));
    }

    if (rebuiltRecords) {
      return rebuiltRecords;
    }

    this.dailyDispatchRecords = this.mergeRecords(
      [],
      this.dailyDispatchRecords.map((record) => {
        const expectedDate = toTaipeiDate(
          record.reservationTime ?? record.requestedAt,
        );
        return expectedDate && expectedDate !== record.serviceDate
          ? { ...record, serviceDate: expectedDate }
          : record;
      }),
    );

    return this.dailyDispatchRecords
      .filter((record) => this.matchesQuery(record, query))
      .map((record) => ({ ...record }))
      .sort(
        (left, right) =>
          right.requestedAt.localeCompare(left.requestedAt) ||
          right.orderId.localeCompare(left.orderId),
      );
  }

  async captureDispatchableSupplySnapshot(
    capturedAt = new Date(),
  ): Promise<DispatchableSupplySnapshotCaptureResult> {
    const snapshotAt = this.floorToSnapshotBoundary(capturedAt).toISOString();
    const generatedAt = new Date().toISOString();
    const records = this.buildDispatchableSupplySnapshots(
      snapshotAt,
      generatedAt,
    );

    if (this.reportingRepository?.isEnabled()) {
      try {
        await this.reportingRepository.upsertDispatchableSupplySnapshots(
          records,
        );
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "upsert dispatchable supply snapshots",
        );
      }
    } else {
      this.dispatchableSupplySnapshots = this.mergeDispatchableSupplySnapshots(
        this.dispatchableSupplySnapshots,
        records,
      );
    }

    this.dispatchableSupplySnapshots = this.mergeDispatchableSupplySnapshots(
      this.dispatchableSupplySnapshots,
      records,
    );

    return {
      snapshotAt,
      generatedAt,
      records: records.map((record) => ({ ...record })),
    };
  }

  async listDispatchableSupplySnapshots(
    query: DispatchableSupplySnapshotQuery = {},
  ): Promise<DispatchableSupplySnapshotRecord[]> {
    if (this.reportingRepository?.isEnabled()) {
      try {
        const records =
          await this.reportingRepository.listDispatchableSupplySnapshots(query);
        if (records.length > 0) {
          return records;
        }
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "list dispatchable supply snapshots",
        );
      }
    }

    if (this.dispatchableSupplySnapshots.length === 0) {
      await this.captureDispatchableSupplySnapshot();
    }

    return this.dispatchableSupplySnapshots
      .filter((record) => this.matchesSnapshotQuery(record, query))
      .map((record) => ({ ...record }))
      .sort(
        (left, right) =>
          right.snapshotAt.localeCompare(left.snapshotAt) ||
          left.businessArea.localeCompare(right.businessArea) ||
          left.serviceProductCode.localeCompare(right.serviceProductCode),
      );
  }

  async rebuildMonthlyOperationsSummaries(
    query: MonthlyOperationsSummaryQuery = {},
    preloadedSource?: DispatchDailyRecordSource,
    rawSnapshotVehicleSumByKey?: Map<string, number>,
  ): Promise<MonthlyOperationsSummaryRebuildResult> {
    const generatedAt = new Date().toISOString();
    const source =
      preloadedSource ?? (await this.loadDailyDispatchRecordSource());
    const snapshots = await this.loadDispatchableSupplySnapshots();
    const periods = this.resolveRequestedMonths(query);
    const vehicleAreaById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle.operatingArea] as const),
    );
    const records = this.buildMonthlyOperationsSummaries(
      source,
      periods,
      vehicleAreaById,
      generatedAt,
      query,
      snapshots,
      rawSnapshotVehicleSumByKey,
    );

    if (this.reportingRepository?.isEnabled()) {
      try {
        await this.reportingRepository.replaceMonthlyOperationsSummaries(
          records,
          periods,
          query,
        );
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "replace monthly operations summaries",
        );
        throw new ApiRequestError(
          503,
          "REPORT_REBUILD_FAILED",
          "Monthly operations summaries could not be rebuilt.",
        );
      }
    } else {
      const retained = this.monthlyOperationsSummaries.filter(
        (record) =>
          !periods.includes(record.periodMonth) ||
          (query.businessArea
            ? record.businessArea !== query.businessArea
            : false) ||
          (query.serviceProductCode
            ? record.serviceProductCode !== query.serviceProductCode
            : false),
      );
      this.monthlyOperationsSummaries = this.mergeMonthlyOperationsSummaries(
        retained,
        records,
      );
    }

    return {
      rebuiltCount: records.length,
      generatedAt,
      records: records.map((record) => ({
        ...record,
        complaintsByCategory: { ...record.complaintsByCategory },
      })),
    };
  }

  async listMonthlyOperationsSummaries(
    query: MonthlyOperationsSummaryQuery = {},
  ): Promise<MonthlyOperationsSummaryRecord[]> {
    if (this.reportingRepository?.isEnabled()) {
      let records: MonthlyOperationsSummaryRecord[];
      try {
        records =
          await this.reportingRepository.listMonthlyOperationsSummaries(query);
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "list monthly operations summaries",
        );
        throw new ApiRequestError(
          503,
          "REPORT_READ_FAILED",
          "Monthly operations summaries could not be loaded.",
        );
      }
      if (records.length > 0) {
        return records;
      }
      return (await this.rebuildMonthlyOperationsSummaries(query)).records
        .filter((record) => this.matchesMonthlySummaryQuery(record, query))
        .map((record) => ({
          ...record,
          complaintsByCategory: { ...record.complaintsByCategory },
        }))
        .sort(
          (left, right) =>
            right.periodMonth.localeCompare(left.periodMonth) ||
            left.businessArea.localeCompare(right.businessArea) ||
            left.serviceProductCode.localeCompare(right.serviceProductCode),
        );
    }

    if (this.monthlyOperationsSummaries.length === 0) {
      await this.rebuildMonthlyOperationsSummaries(query);
    }

    return this.monthlyOperationsSummaries
      .filter((record) => this.matchesMonthlySummaryQuery(record, query))
      .map((record) => ({
        ...record,
        complaintsByCategory: { ...record.complaintsByCategory },
      }))
      .sort(
        (left, right) =>
          right.periodMonth.localeCompare(left.periodMonth) ||
          left.businessArea.localeCompare(right.businessArea) ||
          left.serviceProductCode.localeCompare(right.serviceProductCode),
      );
  }

  async previewSixMonthOperationsSummary(
    query: MonthlyOperationsSummaryQuery & {
      from?: string;
      to?: string;
    } = {},
  ): Promise<SixMonthOperationsSummary[]> {
    const { periodMonthFrom, periodMonthTo } = this.resolveSummaryMonthBounds(
      query,
      { maxMonths: 6 },
    );
    const periods = this.enumerateMonths(periodMonthFrom, periodMonthTo);
    const monthlyQuery: MonthlyOperationsSummaryQuery = {
      periodMonthFrom,
      periodMonthTo,
    };
    if (query.businessArea) {
      monthlyQuery.businessArea = query.businessArea;
    }
    if (query.serviceProductCode) {
      monthlyQuery.serviceProductCode = query.serviceProductCode;
    }

    const source = await this.loadDailyDispatchRecordSource();
    // One canonical source read feeds both the rebuilt monthly read model and
    // the derived R09/R10 figures below. Use rebuild.records directly rather
    // than re-querying PG so stale monthly rows can never mix with the new
    // six-month totals in the same response.
    const rawSnapshotVehicleSumByKey = new Map<string, number>();
    const rebuild = await this.rebuildMonthlyOperationsSummaries(
      monthlyQuery,
      source,
      rawSnapshotVehicleSumByKey,
    );
    const monthly = rebuild.records
      .filter((record) => this.matchesMonthlySummaryQuery(record, monthlyQuery))
      .sort(
        (left, right) =>
          left.periodMonth.localeCompare(right.periodMonth) ||
          left.businessArea.localeCompare(right.businessArea) ||
          left.serviceProductCode.localeCompare(right.serviceProductCode),
      );
    const grouped = new Map<string, SixMonthOperationsSummary>();
    const weightedVehicleSumByKey = new Map<string, number>();
    const monthlyRecordByKey = new Map<
      string,
      MonthlyOperationsSummaryRecord
    >();
    const complaintStatisticsAsOf = new Date().toISOString();
    const canonicalFrom = `${periodMonthFrom}-01`;
    const canonicalTo = this.endOfMonthIso(
      `${periodMonthTo}-01T00:00:00.000Z`,
    ).slice(0, 10);
    const createSummary = (
      businessArea: string,
      serviceProductCode: string,
      generatedAt: string,
    ): SixMonthOperationsSummary => ({
      from: canonicalFrom,
      to: canonicalTo,
      businessArea,
      serviceProductCode,
      demandRequestCount: 0,
      actualDispatchCount: 0,
      completedTripCount: 0,
      cancelledOrderCount: 0,
      averageDispatchableVehicleCount: null,
      validSnapshotCount: 0,
      expectedSnapshotCount: 0,
      snapshotCoverageRate: 0,
      complaintCount: 0,
      complaintsByCategory: {},
      lateArrivalThresholdMinutes: LATE_ARRIVAL_THRESHOLD_MINUTES,
      onTimeTripCount: 0,
      lateTripCount: 0,
      noShowTripCount: 0,
      punctualityUnknownTripCount: 0,
      complaintCreatedLowRatingAutoCount: 0,
      complaintCreatedManualCount: 0,
      complaintClosedLowRatingAutoCount: 0,
      complaintClosedManualCount: 0,
      complaintOverdueLowRatingAutoCount: 0,
      complaintOverdueManualCount: 0,
      complaintStatisticsAsOf,
      monthlySummaries: [],
      drilldown: {
        punctuality: emptyPunctualityMetrics(),
        complaintMonthlyStatistics: [],
        monthlySummaries: [],
      },
      generatedAt,
    });
    for (const record of monthly) {
      const key = `${record.businessArea}:${record.serviceProductCode}`;
      monthlyRecordByKey.set(`${key}:${record.periodMonth}`, record);
      const current =
        grouped.get(key) ??
        createSummary(
          record.businessArea,
          record.serviceProductCode,
          record.generatedAt,
        );
      current.demandRequestCount += record.demandRequestCount;
      current.actualDispatchCount += record.actualDispatchCount;
      current.completedTripCount += record.completedTripCount;
      current.cancelledOrderCount += record.cancelledOrderCount;
      const rawMonthVehicleSum =
        rawSnapshotVehicleSumByKey.get(
          `${record.periodMonth}:${record.businessArea}:${record.serviceProductCode}`,
        ) ??
        (record.averageDispatchableVehicleCount ?? 0) *
          record.validSnapshotCount;
      weightedVehicleSumByKey.set(
        key,
        (weightedVehicleSumByKey.get(key) ?? 0) + rawMonthVehicleSum,
      );
      current.validSnapshotCount += record.validSnapshotCount;
      current.expectedSnapshotCount += record.expectedSnapshotCount;
      current.complaintCount += record.complaintCount;
      current.generatedAt =
        current.generatedAt.localeCompare(record.generatedAt) >= 0
          ? current.generatedAt
          : record.generatedAt;
      for (const [category, count] of Object.entries(
        record.complaintsByCategory,
      )) {
        current.complaintsByCategory[category] =
          (current.complaintsByCategory[category] ?? 0) + count;
      }
      grouped.set(key, current);
    }

    const monthlyPunctualityByKey = await this.attachOperationsMetrics(
      grouped,
      source,
      periods,
      monthlyQuery,
      complaintStatisticsAsOf,
      (businessArea, serviceProductCode) =>
        createSummary(
          businessArea,
          serviceProductCode,
          rebuild.generatedAt || complaintStatisticsAsOf,
        ),
    );

    return Array.from(grouped.values())
      .map((summary) => this.withOperationsMetricTotals(summary))
      .map((summary) => {
        const key = `${summary.businessArea ?? ""}:${summary.serviceProductCode ?? ""}`;
        const weightedVehicleSum = weightedVehicleSumByKey.get(key) ?? 0;
        const statisticsByMonth = new Map(
          (summary.drilldown?.complaintMonthlyStatistics ?? []).map((item) => [
            item.periodMonth,
            item,
          ]),
        );
        const monthlySummaries: SixMonthMonthlyOperationsSummary[] =
          periods.map((periodMonth) => {
            const baseRecord = monthlyRecordByKey.get(`${key}:${periodMonth}`);
            const monthPunctuality = sortPunctualityMetrics(
              monthlyPunctualityByKey.get(`${key}:${periodMonth}`) ??
                emptyPunctualityMetrics(),
            );
            const monthComplaintStat = statisticsByMonth.get(periodMonth);
            const expectedSnapshotCount =
              baseRecord?.expectedSnapshotCount ??
              this.expectedSnapshotsForMonth(periodMonth);
            const validSnapshotCount = baseRecord?.validSnapshotCount ?? 0;
            const snapshotCoverageRate =
              baseRecord?.snapshotCoverageRate ??
              (expectedSnapshotCount > 0
                ? this.roundTo(validSnapshotCount / expectedSnapshotCount, 4)
                : 0);
            return {
              periodMonth,
              from: `${periodMonth}-01`,
              to: this.endOfMonthIso(`${periodMonth}-01T00:00:00.000Z`).slice(
                0,
                10,
              ),
              businessArea: summary.businessArea,
              serviceProductCode: summary.serviceProductCode,
              demandRequestCount: baseRecord?.demandRequestCount ?? 0,
              actualDispatchCount: baseRecord?.actualDispatchCount ?? 0,
              completedTripCount: baseRecord?.completedTripCount ?? 0,
              cancelledOrderCount: baseRecord?.cancelledOrderCount ?? 0,
              averageDispatchableVehicleCount:
                validSnapshotCount > 0
                  ? (baseRecord?.averageDispatchableVehicleCount ?? 0)
                  : null,
              validSnapshotCount,
              expectedSnapshotCount,
              snapshotCoverageRate,
              complaintCount: baseRecord?.complaintCount ?? 0,
              complaintsByCategory: {
                ...(baseRecord?.complaintsByCategory ?? {}),
              },
              lateArrivalThresholdMinutes:
                monthPunctuality.lateArrivalThresholdMinutes,
              onTimeTripCount: monthPunctuality.onTimeTripCount,
              lateTripCount: monthPunctuality.lateTripCount,
              noShowTripCount: monthPunctuality.noShowTripCount,
              punctualityUnknownTripCount: monthPunctuality.unknownTripCount,
              complaintCreatedLowRatingAutoCount:
                monthComplaintStat?.lowRatingAuto.createdCount ?? 0,
              complaintCreatedManualCount:
                monthComplaintStat?.manual.createdCount ?? 0,
              complaintClosedLowRatingAutoCount:
                monthComplaintStat?.lowRatingAuto.closedCount ?? 0,
              complaintClosedManualCount:
                monthComplaintStat?.manual.closedCount ?? 0,
              complaintOverdueLowRatingAutoCount:
                monthComplaintStat?.lowRatingAuto.overdueCount ?? 0,
              complaintOverdueManualCount:
                monthComplaintStat?.manual.overdueCount ?? 0,
              complaintStatisticsAsOf,
              generatedAt: summary.generatedAt,
            };
          });
        const expectedSnapshotCount =
          summary.expectedSnapshotCount > 0
            ? summary.expectedSnapshotCount
            : monthlySummaries.reduce(
                (acc, item) => acc + item.expectedSnapshotCount,
                0,
              );
        const nextSummary: SixMonthOperationsSummary = {
          ...summary,
          expectedSnapshotCount,
          averageDispatchableVehicleCount:
            summary.validSnapshotCount > 0
              ? this.roundTo(weightedVehicleSum / summary.validSnapshotCount, 2)
              : null,
          snapshotCoverageRate:
            expectedSnapshotCount > 0
              ? this.roundTo(
                  summary.validSnapshotCount / expectedSnapshotCount,
                  4,
                )
              : 0,
          complaintsByCategory: { ...summary.complaintsByCategory },
          monthlySummaries,
          ...(summary.drilldown
            ? {
                drilldown: {
                  ...summary.drilldown,
                  monthlySummaries,
                },
              }
            : {}),
        };
        return nextSummary;
      })
      .sort(
        (left, right) =>
          (left.businessArea ?? "").localeCompare(right.businessArea ?? "") ||
          (left.serviceProductCode ?? "").localeCompare(
            right.serviceProductCode ?? "",
          ),
      );
  }

  private withOperationsMetricTotals(
    summary: SixMonthOperationsSummary,
  ): SixMonthOperationsSummary {
    const punctuality = sortPunctualityMetrics(
      summary.drilldown?.punctuality ?? emptyPunctualityMetrics(),
    );
    const complaintMonthlyStatistics =
      summary.drilldown?.complaintMonthlyStatistics ?? [];
    return {
      ...summary,
      lateArrivalThresholdMinutes: punctuality.lateArrivalThresholdMinutes,
      onTimeTripCount: punctuality.onTimeTripCount,
      lateTripCount: punctuality.lateTripCount,
      noShowTripCount: punctuality.noShowTripCount,
      punctualityUnknownTripCount: punctuality.unknownTripCount,
      ...totalComplaintMonthlyStatistics(complaintMonthlyStatistics),
      drilldown: { punctuality, complaintMonthlyStatistics },
    };
  }

  /**
   * Bureau R10 / R09 figures for the previewed window. They reuse the same
   * order dimensions and window months as the existing monthly summary and
   * never modify its persisted figures.
   */
  private async attachOperationsMetrics(
    grouped: Map<string, SixMonthOperationsSummary>,
    source: DispatchDailyRecordSource,
    periods: readonly string[],
    query: MonthlyOperationsSummaryQuery,
    asOf: string,
    createSummary: (
      businessArea: string,
      serviceProductCode: string,
    ) => SixMonthOperationsSummary,
  ) {
    const vehicleAreaById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle.operatingArea] as const),
    );
    const dimensions = this.buildOrderReportingDimensions(
      source,
      vehicleAreaById,
      asOf,
    );
    const matchesQuery = (businessArea: string, serviceProductCode: string) =>
      (!query.businessArea || businessArea === query.businessArea) &&
      (!query.serviceProductCode ||
        serviceProductCode === query.serviceProductCode);
    const ensure = (businessArea: string, serviceProductCode: string) => {
      const key = `${businessArea}:${serviceProductCode}`;
      let summary = grouped.get(key);
      if (!summary) {
        summary = createSummary(businessArea, serviceProductCode);
        grouped.set(key, summary);
      }
      return summary;
    };

    const monthlyPunctualityByKey = new Map<
      string,
      ReturnType<typeof emptyPunctualityMetrics>
    >();
    for (const dimension of dimensions.values()) {
      if (
        !periods.includes(dimension.periodMonth) ||
        !matchesQuery(dimension.businessArea, dimension.serviceProductCode)
      ) {
        continue;
      }
      const tripInput = {
        record: dimension.record,
        dispatchSemantics: dimension.order.dispatchSemantics,
      };
      addTripPunctuality(
        ensure(dimension.businessArea, dimension.serviceProductCode).drilldown!
          .punctuality,
        tripInput,
      );
      const monthKey = `${dimension.businessArea}:${dimension.serviceProductCode}:${dimension.periodMonth}`;
      let monthPunctuality = monthlyPunctualityByKey.get(monthKey);
      if (!monthPunctuality) {
        monthPunctuality = emptyPunctualityMetrics();
        monthlyPunctualityByKey.set(monthKey, monthPunctuality);
      }
      addTripPunctuality(monthPunctuality, tripInput);
    }

    // Same case attribution as the existing complaint count: the related
    // order's dimensions, else explicit unassigned/unknown.
    const casesByKey = new Map<
      string,
      {
        businessArea: string;
        serviceProductCode: string;
        cases: ComplaintCaseRecord[];
      }
    >();
    const seenCases = new Set<string>();
    for (const complaintCase of source.complaintCases) {
      if (seenCases.has(complaintCase.caseNo)) continue;
      seenCases.add(complaintCase.caseNo);
      const dimension = complaintCase.relatedOrderId
        ? dimensions.get(complaintCase.relatedOrderId)
        : undefined;
      const businessArea = dimension?.businessArea ?? "unassigned";
      const serviceProductCode = dimension?.serviceProductCode ?? "unknown";
      if (!matchesQuery(businessArea, serviceProductCode)) continue;
      const key = `${businessArea}:${serviceProductCode}`;
      const entry = casesByKey.get(key) ?? {
        businessArea,
        serviceProductCode,
        cases: [],
      };
      entry.cases.push(complaintCase);
      casesByKey.set(key, entry);
    }
    const statisticsSource = await this.loadComplaintStatisticsSource(source);
    for (const entry of casesByKey.values()) {
      const statistics = buildComplaintMonthlyStatistics(
        entry.cases,
        statisticsSource,
        periods,
        asOf,
      );
      const hasFigures = statistics.some(
        (month) =>
          month.lowRatingAuto.createdCount +
            month.lowRatingAuto.closedCount +
            month.lowRatingAuto.overdueCount +
            month.manual.createdCount +
            month.manual.closedCount +
            month.manual.overdueCount >
          0,
      );
      const key = `${entry.businessArea}:${entry.serviceProductCode}`;
      if (!hasFigures && !grouped.has(key)) continue;
      ensure(
        entry.businessArea,
        entry.serviceProductCode,
      ).drilldown!.complaintMonthlyStatistics = statistics;
    }
    for (const summary of grouped.values()) {
      if (summary.drilldown!.complaintMonthlyStatistics.length === 0) {
        summary.drilldown!.complaintMonthlyStatistics =
          buildComplaintMonthlyStatistics([], statisticsSource, periods, asOf);
      }
    }
    return monthlyPunctualityByKey;
  }

  private async loadComplaintStatisticsSource(
    source: DispatchDailyRecordSource,
  ): Promise<ComplaintStatisticsSource> {
    if (this.reportingRepository?.isEnabled()) {
      try {
        return await this.reportingRepository.loadComplaintStatisticsSource();
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "load complaint statistics source",
        );
      }
    }

    // In-memory runtime: closures from the complaint timelines and low-rating
    // links recorded on the Referral rating itself.
    const closures: ComplaintStatisticsSource["closures"] = [];
    for (const complaintCase of source.complaintCases) {
      let timeline: ReturnType<ComplaintService["getComplaintTimeline"]> = [];
      try {
        timeline = this.complaintService.getComplaintTimeline(
          complaintCase.caseNo,
        );
      } catch {
        continue;
      }
      for (const entry of timeline) {
        if (entry.action === "case_closed") {
          closures.push({ caseNo: entry.caseNo, closedAt: entry.createdAt });
        }
      }
    }
    const lowRatingCaseNos = source.orders
      .map((order) => order.referralPassengerLifecycle?.rating?.complaintCaseNo)
      .filter((caseNo): caseNo is string => Boolean(caseNo));
    return { closures, lowRatingCaseNos };
  }

  /** Canonical per-order record and summary dimensions for every order. */
  private buildOrderReportingDimensions(
    source: DispatchDailyRecordSource,
    vehicleAreaById: ReadonlyMap<string, string>,
    generatedAt: string,
  ) {
    const vehiclePlateById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle.plateNo] as const),
    );
    const complaintCountByOrderId = new Map<string, number>();
    for (const complaintCase of source.complaintCases) {
      if (!complaintCase.relatedOrderId) {
        continue;
      }
      complaintCountByOrderId.set(
        complaintCase.relatedOrderId,
        (complaintCountByOrderId.get(complaintCase.relatedOrderId) ?? 0) + 1,
      );
    }
    const dimensions = new Map<string, OrderReportingDimension>();
    for (const order of source.orders) {
      const record = this.buildDispatchDailyRecord(
        order,
        source.dispatchJobs,
        source.dispatchAssignments,
        source.driverTasks,
        source.dispatchTraceLogs,
        vehiclePlateById,
        complaintCountByOrderId,
        generatedAt,
      );
      // SA §7.4 defines order demand/dispatch event timing from the scheduled
      // reservation window start or order creation timestamp; SA §7.4 does not
      // name a time zone, so R10 followthrough aligns order month attribution
      // with the accepted R09 Asia/Taipei calendar month helper.
      const orderEventTimestamp =
        order.reservationWindowStart ?? order.createdAt;
      dimensions.set(order.orderId, {
        order,
        record,
        periodMonth:
          toTaipeiMonth(orderEventTimestamp) ?? record.serviceDate.slice(0, 7),
        businessArea: this.resolveOrderBusinessArea(
          order,
          source.dispatchAssignments,
          vehicleAreaById,
        ),
        serviceProductCode: record.serviceProductCode,
      });
    }
    return dimensions;
  }

  private buildDispatchDailyRecord(
    order: OwnedOrderRecord,
    dispatchJobs: readonly DispatchJobRecord[],
    dispatchAssignments: readonly DispatchAssignmentRecord[],
    driverTasks: readonly DriverTaskRecord[],
    dispatchTraceLogs: readonly DispatchTraceLogRecord[],
    vehiclePlateById: ReadonlyMap<string, string>,
    complaintCountByOrderId: ReadonlyMap<string, number>,
    generatedAt: string,
  ): DispatchDailyRecord {
    const orderDispatchJobs = dispatchJobs
      .filter((job) => job.orderId === order.orderId)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.createdAt.localeCompare(left.createdAt),
      );
    const orderAssignments = dispatchAssignments
      .filter((assignment) => assignment.orderId === order.orderId)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.createdAt.localeCompare(left.createdAt),
      );
    const orderTasks = driverTasks
      .filter((task) => task.orderId === order.orderId)
      .sort((left, right) => {
        const leftAt =
          left.completedAt ?? left.startedAt ?? left.acceptedAt ?? "";
        const rightAt =
          right.completedAt ?? right.startedAt ?? right.acceptedAt ?? "";
        return leftAt.localeCompare(rightAt);
      });
    const orderTraceLogs = dispatchTraceLogs.filter(
      (traceLog) => traceLog.orderId === order.orderId,
    );
    const sortedOrderTraceLogs = orderTraceLogs
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const firstDispatch = orderDispatchJobs.at(-1) ?? null;
    const firstAssignment = orderAssignments.at(-1) ?? null;
    const finalDispatch = orderDispatchJobs[0] ?? null;
    const finalAssignment =
      (finalDispatch
        ? orderAssignments.find(
            (assignment) =>
              assignment.dispatchJobId === finalDispatch.dispatchJobId,
          )
        : null) ??
      orderAssignments[0] ??
      null;
    const finalTask =
      (finalAssignment
        ? orderTasks.find(
            (task) => task.assignmentId === finalAssignment.assignmentId,
          )
        : null) ??
      orderTasks.at(-1) ??
      null;

    return {
      serviceDate: this.resolveServiceDate(order),
      orderId: order.orderId,
      orderNo: order.orderNo,
      orderSource: this.normalizeOrderSource(order),
      tenantId: order.tenantId,
      partnerId: order.partnerId,
      serviceProductCode: this.resolveServiceProductCode(order),
      requestedAt: order.createdAt,
      reservationTime: order.reservationWindowStart,
      pickupAddressSnapshot: order.pickup.address,
      dropoffAddressSnapshot: order.dropoff.address,
      firstDispatchAt: firstDispatch?.createdAt ?? null,
      firstAssignedAt: firstAssignment?.createdAt ?? null,
      finalDriverId: finalAssignment?.driverId ?? null,
      finalVehicleId: finalAssignment?.vehicleId ?? null,
      finalPlateNo: finalAssignment
        ? (vehiclePlateById.get(finalAssignment.vehicleId) ?? null)
        : null,
      etaSecondsAtAssignment: firstDispatch?.latestEtaMinutes
        ? firstDispatch.latestEtaMinutes * 60
        : null,
      arrivedPickupAt: this.resolveEventTimestamp(
        sortedOrderTraceLogs,
        "driver.arrived_pickup",
        finalTask?.arrivedPickupAt ?? null,
        finalTask?.taskId,
      ),
      tripStartedAt: this.resolveEventTimestamp(
        sortedOrderTraceLogs,
        "driver.started_trip",
        finalTask?.startedAt ?? null,
        finalTask?.taskId,
        true,
      ),
      tripCompletedAt: this.resolveEventTimestamp(
        sortedOrderTraceLogs,
        "driver.completed_trip",
        // Cancellation also records task closure in completedAt. Only a
        // completed trip may use that field as the reporting fallback.
        finalTask?.status === "completed" ? finalTask.completedAt : null,
        finalTask?.taskId,
        true,
      ),
      finalStatus: order.status,
      redispatchCount: orderTraceLogs.filter(
        (traceLog) => traceLog.eventType === "dispatch.redispatch_required",
      ).length,
      cancellationReason: order.cancelReason,
      complaintCount: complaintCountByOrderId.get(order.orderId) ?? 0,
      generatedAt,
    };
  }

  private resolveServiceDate(order: OwnedOrderRecord) {
    const raw = order.reservationWindowStart ?? order.createdAt;
    return toTaipeiDate(raw) ?? raw.slice(0, 10);
  }

  private normalizeServiceDate(value: string | Date): string {
    if (value instanceof Date) {
      const year = String(value.getFullYear()).padStart(4, "0");
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return String(value).slice(0, 10);
  }

  private async loadDailyDispatchRecordSource(): Promise<DispatchDailyRecordSource> {
    if (this.reportingRepository?.isEnabled()) {
      try {
        return await this.reportingRepository.loadDailyDispatchRecordSource();
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "load dispatch daily record source",
        );
        throw new ApiRequestError(
          503,
          "REPORT_SOURCE_UNAVAILABLE",
          "Canonical reporting source could not be loaded.",
        );
      }
    }

    const snapshot = this.ownedMobilityService.getReportingSnapshot();
    return {
      orders: snapshot.orders,
      dispatchJobs: snapshot.dispatchJobs,
      dispatchAssignments: snapshot.dispatchAssignments,
      driverTasks: snapshot.driverTasks,
      dispatchTraceLogs: snapshot.dispatchTraceLogs,
      complaintCases: this.complaintService.listComplaintCases(),
    };
  }

  private normalizeOrderSource(order: OwnedOrderRecord) {
    switch (order.orderSource) {
      case "phone":
        return "phone";
      case "portal":
        return "tenant_portal";
      case "api":
        return "api";
      case "concierge":
        return "ops_console";
      case "app":
      case "web":
        return "third_party_platform";
      default:
        return order.orderSource;
    }
  }

  private resolveServiceProductCode(order: OwnedOrderRecord): string {
    if (order.businessDispatchSubtype) {
      return order.businessDispatchSubtype;
    }
    if (order.serviceBucket === "standard_taxi") {
      return order.dispatchSemantics === "reservation"
        ? "taxi_reservation"
        : "taxi_realtime";
    }
    if (order.serviceBucket === "business_dispatch") {
      return "enterprise_dispatch";
    }
    return order.serviceBucket;
  }

  private buildDispatchableSupplySnapshots(
    snapshotAt: string,
    generatedAt: string,
  ): DispatchableSupplySnapshotRecord[] {
    if (!this.vehicleEligibilityService) {
      return [];
    }

    const vehiclesById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle] as const),
    );
    const driversById = new Map(
      this.regulatoryRegistryService
        .listDrivers()
        .map((driver) => [driver.driverId, driver] as const),
    );
    const locationsByDriverId = new Map(
      this.regulatoryRegistryService
        .listLatestDriverLocations()
        .map((location) => [location.driverId, location] as const),
    );
    const supplyPairs = this.regulatoryRegistryService.listSupplyPairs();
    const activeProducts =
      this.vehicleEligibilityService.listActiveServiceProducts();
    const businessAreas = [
      ...new Set(
        Array.from(vehiclesById.values())
          .map((vehicle) => vehicle.operatingArea)
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort((left, right) => left.localeCompare(right));

    if (businessAreas.length === 0 || activeProducts.length === 0) {
      return [];
    }

    const pairs = activeProducts.flatMap((product) =>
      supplyPairs
        .map((pair) =>
          this.buildSnapshotEligibilityPair(
            pair.vehicleId,
            pair.driverId,
            product.serviceProduct,
            product.serviceBucket,
            vehiclesById,
            driversById,
            locationsByDriverId,
            snapshotAt,
          ),
        )
        .filter((pair): pair is SnapshotEligibilityPair => pair !== null),
    );

    return businessAreas.flatMap((businessArea) =>
      activeProducts.map((product) => {
        const areaProductPairs = pairs.filter(
          (pair) =>
            pair.businessArea === businessArea &&
            pair.serviceProductCode === product.serviceProduct,
        );
        const freshPairs = areaProductPairs.filter(
          (pair) => pair.locationState === "complete",
        );

        return {
          snapshotAt,
          businessArea,
          serviceProductCode: product.serviceProduct,
          dispatchableVehicleCount: new Set(
            freshPairs.map((pair) => pair.vehicleId),
          ).size,
          availableDriverCount: new Set(freshPairs.map((pair) => pair.driverId))
            .size,
          sourceHealth: this.resolveSnapshotSourceHealth(areaProductPairs),
          generatedAt,
        };
      }),
    );
  }

  private buildSnapshotEligibilityPair(
    vehicleId: string,
    driverId: string,
    serviceProductCode: ServiceProductType,
    serviceBucket: Phase1ServiceBucket,
    vehiclesById: ReadonlyMap<string, VehicleRegistryRecord>,
    driversById: ReadonlyMap<string, DriverRegistryRecord>,
    locationsByDriverId: ReadonlyMap<string, DriverLocationSnapshot>,
    snapshotAt: string,
  ): SnapshotEligibilityPair | null {
    const vehicle = vehiclesById.get(vehicleId);
    const driver = driversById.get(driverId);
    if (!vehicle || !driver) {
      return null;
    }

    if (
      !vehicle.supplyLifecycle.dispatch.eligible ||
      !vehicle.supportedServiceBuckets.includes(serviceBucket)
    ) {
      return null;
    }
    if (
      !driver.dispatchEligible ||
      !driver.supportedServiceBuckets.includes(serviceBucket)
    ) {
      return null;
    }
    if (
      !this.vehicleEligibilityService?.isVehicleEligibleForExactServiceProduct(
        vehicle.vehicleId,
        serviceProductCode,
      )
    ) {
      return null;
    }

    return {
      vehicleId: vehicle.vehicleId,
      driverId: driver.driverId,
      businessArea: vehicle.operatingArea,
      serviceProductCode,
      locationState: this.classifySnapshotLocationHealth(
        locationsByDriverId.get(driver.driverId) ?? null,
        snapshotAt,
      ),
    };
  }

  private classifySnapshotLocationHealth(
    location: DriverLocationSnapshot | null,
    snapshotAt: string,
  ): DispatchableSupplySnapshotRecord["sourceHealth"] {
    if (!location) {
      return "location_missing";
    }
    if (
      location.accuracyM !== null &&
      location.accuracyM > LOCATION_ACCURACY_THRESHOLD_METERS
    ) {
      return "location_low_accuracy";
    }
    if (
      Date.parse(snapshotAt) - Date.parse(location.recordedAt) >
      LOCATION_FRESHNESS_WINDOW_MS
    ) {
      return "location_stale";
    }
    return "complete";
  }

  private resolveSnapshotSourceHealth(
    pairs: readonly SnapshotEligibilityPair[],
  ): DispatchableSupplySnapshotRecord["sourceHealth"] {
    if (pairs.some((pair) => pair.locationState === "location_missing")) {
      return "location_missing";
    }
    if (pairs.some((pair) => pair.locationState === "location_stale")) {
      return "location_stale";
    }
    if (pairs.some((pair) => pair.locationState === "location_low_accuracy")) {
      return "location_low_accuracy";
    }
    return "complete";
  }

  private matchesQuery(
    record: DispatchDailyRecord,
    query: DailyDispatchRecordQuery,
  ) {
    const afterFrom =
      !query.serviceDateFrom || record.serviceDate >= query.serviceDateFrom;
    const beforeTo =
      !query.serviceDateTo || record.serviceDate <= query.serviceDateTo;
    return (
      (!query.serviceDate || record.serviceDate === query.serviceDate) &&
      afterFrom &&
      beforeTo &&
      (!query.orderId || record.orderId === query.orderId) &&
      (!query.orderSource || record.orderSource === query.orderSource) &&
      (!query.tenantId || record.tenantId === query.tenantId) &&
      (!query.partnerId || record.partnerId === query.partnerId) &&
      (!query.serviceProductCode ||
        record.serviceProductCode === query.serviceProductCode) &&
      (!query.finalStatus || record.finalStatus === query.finalStatus)
    );
  }

  private matchesSnapshotQuery(
    record: DispatchableSupplySnapshotRecord,
    query: DispatchableSupplySnapshotQuery,
  ) {
    const afterFrom =
      !query.snapshotAtFrom || record.snapshotAt >= query.snapshotAtFrom;
    const beforeTo =
      !query.snapshotAtTo || record.snapshotAt <= query.snapshotAtTo;
    return (
      (!query.snapshotAt || record.snapshotAt === query.snapshotAt) &&
      afterFrom &&
      beforeTo &&
      (!query.businessArea || record.businessArea === query.businessArea) &&
      (!query.serviceProductCode ||
        record.serviceProductCode === query.serviceProductCode) &&
      (!query.sourceHealth || record.sourceHealth === query.sourceHealth)
    );
  }

  private matchesMonthlySummaryQuery(
    record: MonthlyOperationsSummaryRecord,
    query: MonthlyOperationsSummaryQuery,
  ) {
    const afterFrom =
      !query.periodMonthFrom || record.periodMonth >= query.periodMonthFrom;
    const beforeTo =
      !query.periodMonthTo || record.periodMonth <= query.periodMonthTo;
    return (
      (!query.periodMonth || record.periodMonth === query.periodMonth) &&
      afterFrom &&
      beforeTo &&
      (!query.businessArea || record.businessArea === query.businessArea) &&
      (!query.serviceProductCode ||
        record.serviceProductCode === query.serviceProductCode)
    );
  }

  private mergeRecords(
    existing: readonly DispatchDailyRecord[],
    next: readonly DispatchDailyRecord[],
  ) {
    const merged = new Map<string, DispatchDailyRecord>();
    for (const record of existing) {
      const prior = merged.get(record.orderId);
      if (!prior || prior.generatedAt <= record.generatedAt) {
        merged.set(record.orderId, { ...record });
      }
    }
    for (const record of next) {
      const prior = merged.get(record.orderId);
      if (!prior || prior.generatedAt <= record.generatedAt) {
        merged.set(record.orderId, { ...record });
      }
    }
    return Array.from(merged.values());
  }

  private mergeDispatchableSupplySnapshots(
    existing: readonly DispatchableSupplySnapshotRecord[],
    next: readonly DispatchableSupplySnapshotRecord[],
  ) {
    const merged = new Map<string, DispatchableSupplySnapshotRecord>();
    for (const record of existing) {
      merged.set(
        `${record.snapshotAt}:${record.businessArea}:${record.serviceProductCode}`,
        { ...record },
      );
    }
    for (const record of next) {
      merged.set(
        `${record.snapshotAt}:${record.businessArea}:${record.serviceProductCode}`,
        { ...record },
      );
    }
    return Array.from(merged.values());
  }

  private mergeMonthlyOperationsSummaries(
    existing: readonly MonthlyOperationsSummaryRecord[],
    next: readonly MonthlyOperationsSummaryRecord[],
  ) {
    const merged = new Map<string, MonthlyOperationsSummaryRecord>();
    for (const record of existing) {
      merged.set(
        `${record.periodMonth}:${record.businessArea}:${record.serviceProductCode}`,
        {
          ...record,
          complaintsByCategory: { ...record.complaintsByCategory },
        },
      );
    }
    for (const record of next) {
      merged.set(
        `${record.periodMonth}:${record.businessArea}:${record.serviceProductCode}`,
        {
          ...record,
          complaintsByCategory: { ...record.complaintsByCategory },
        },
      );
    }
    return Array.from(merged.values());
  }

  private buildMonthlyOperationsSummaries(
    source: DispatchDailyRecordSource,
    periods: readonly string[],
    vehicleAreaById: ReadonlyMap<string, string>,
    generatedAt: string,
    query: MonthlyOperationsSummaryQuery,
    snapshots: readonly DispatchableSupplySnapshotRecord[],
    rawSnapshotVehicleSumByKey?: Map<string, number>,
  ): MonthlyOperationsSummaryRecord[] {
    const recordsByOrderId = new Map<string, DispatchDailyRecord>();
    // A complaint can be filed after its trip's service month. Keep the
    // canonical order dimensions even when that trip is outside this period.
    const dimensionByOrderId = this.buildOrderReportingDimensions(
      source,
      vehicleAreaById,
      generatedAt,
    );
    for (const [
      orderId,
      { record, periodMonth, businessArea },
    ] of dimensionByOrderId) {
      if (
        !periods.includes(periodMonth) ||
        (query.businessArea && businessArea !== query.businessArea) ||
        (query.serviceProductCode &&
          record.serviceProductCode !== query.serviceProductCode)
      ) {
        continue;
      }
      recordsByOrderId.set(orderId, record);
    }

    const groups = new Map<string, MonthlyOperationsSummaryRecord>();
    const ensureGroup = (
      periodMonth: string,
      businessArea: string,
      serviceProductCode: string,
    ) => {
      const key = `${periodMonth}:${businessArea}:${serviceProductCode}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          periodMonth,
          businessArea,
          serviceProductCode,
          demandRequestCount: 0,
          actualDispatchCount: 0,
          completedTripCount: 0,
          cancelledOrderCount: 0,
          averageDispatchableVehicleCount: 0,
          validSnapshotCount: 0,
          expectedSnapshotCount: this.expectedSnapshotsForMonth(periodMonth),
          snapshotCoverageRate: 0,
          complaintCount: 0,
          complaintsByCategory: {},
          generatedAt,
        };
        groups.set(key, group);
      }
      return group;
    };

    for (const [orderId, record] of recordsByOrderId.entries()) {
      const dimension = dimensionByOrderId.get(orderId);
      if (!dimension) {
        continue;
      }
      const group = ensureGroup(
        dimension.periodMonth,
        dimension.businessArea,
        dimension.serviceProductCode,
      );
      group.demandRequestCount += 1;
      if (record.firstAssignedAt) {
        group.actualDispatchCount += 1;
      }
      if (record.finalStatus === "completed") {
        group.completedTripCount += 1;
      }
      if (record.finalStatus === "cancelled") {
        group.cancelledOrderCount += 1;
      }
    }

    for (const snapshot of snapshots) {
      const periodMonth =
        toTaipeiMonth(snapshot.snapshotAt) ?? snapshot.snapshotAt.slice(0, 7);
      if (!periods.includes(periodMonth)) {
        continue;
      }
      if (
        (query.businessArea && snapshot.businessArea !== query.businessArea) ||
        (query.serviceProductCode &&
          snapshot.serviceProductCode !== query.serviceProductCode)
      ) {
        continue;
      }
      const group = ensureGroup(
        periodMonth,
        snapshot.businessArea,
        snapshot.serviceProductCode,
      );
      if (snapshot.sourceHealth === "complete") {
        group.validSnapshotCount += 1;
        const nextRawVehicleSum =
          (group.averageDispatchableVehicleCount ?? 0) +
          snapshot.dispatchableVehicleCount;
        group.averageDispatchableVehicleCount = nextRawVehicleSum;
        rawSnapshotVehicleSumByKey?.set(
          `${periodMonth}:${snapshot.businessArea}:${snapshot.serviceProductCode}`,
          nextRawVehicleSum,
        );
      }
    }

    // SA §7.4: distinct cases CREATED in the requested period, grouped by
    // their actual category. Neither an earlier service month nor no linked
    // order makes a submitted case disappear from the unfiltered total.
    // Attribute complaint creation month using the accepted R09 Asia/Taipei
    // calendar month helper so R10 and R09 agree on cross-month boundaries.
    const countedComplaintCases = new Set<string>();
    for (const complaintCase of source.complaintCases) {
      const periodMonth =
        toTaipeiMonth(complaintCase.createdAt) ??
        complaintCase.createdAt.slice(0, 7);
      if (
        !periods.includes(periodMonth) ||
        countedComplaintCases.has(complaintCase.caseNo)
      ) {
        continue;
      }
      const dimension = complaintCase.relatedOrderId
        ? dimensionByOrderId.get(complaintCase.relatedOrderId)
        : undefined;
      // Unknown dimensions are explicit; never attribute an unlinked case to
      // a selected service product or a convenient fleet/business area.
      const businessArea = dimension?.businessArea ?? "unassigned";
      const serviceProductCode = dimension?.serviceProductCode ?? "unknown";
      if (
        (query.businessArea && businessArea !== query.businessArea) ||
        (query.serviceProductCode &&
          serviceProductCode !== query.serviceProductCode)
      ) {
        continue;
      }
      countedComplaintCases.add(complaintCase.caseNo);
      const group = ensureGroup(periodMonth, businessArea, serviceProductCode);
      group.complaintCount += 1;
      group.complaintsByCategory[complaintCase.category] =
        (group.complaintsByCategory[complaintCase.category] ?? 0) + 1;
    }

    // Coverage is for the requested interval, including months with no
    // orders/cases/samples. Keep the observed dimensions and existing month
    // expectation; do not fabricate a valid sample or change its weighted mean.
    const dimensions = new Map<
      string,
      { businessArea: string; serviceProductCode: string }
    >();
    for (const group of groups.values()) {
      dimensions.set(
        JSON.stringify([group.businessArea, group.serviceProductCode]),
        {
          businessArea: group.businessArea,
          serviceProductCode: group.serviceProductCode,
        },
      );
    }
    for (const dimension of dimensions.values()) {
      for (const periodMonth of periods) {
        ensureGroup(
          periodMonth,
          dimension.businessArea,
          dimension.serviceProductCode,
        );
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        averageDispatchableVehicleCount:
          group.validSnapshotCount > 0
            ? this.roundTo(
                (group.averageDispatchableVehicleCount ?? 0) /
                  group.validSnapshotCount,
                2,
              )
            : 0,
        snapshotCoverageRate:
          group.expectedSnapshotCount > 0
            ? this.roundTo(
                group.validSnapshotCount / group.expectedSnapshotCount,
                4,
              )
            : 0,
        complaintsByCategory: { ...group.complaintsByCategory },
      }))
      .sort(
        (left, right) =>
          left.periodMonth.localeCompare(right.periodMonth) ||
          left.businessArea.localeCompare(right.businessArea) ||
          left.serviceProductCode.localeCompare(right.serviceProductCode),
      );
  }

  private resolveRequestedMonths(query: MonthlyOperationsSummaryQuery) {
    const { periodMonthFrom, periodMonthTo } =
      this.resolveSummaryMonthBounds(query);
    return this.enumerateMonths(periodMonthFrom, periodMonthTo);
  }

  private resolveSummaryMonthBounds(
    query: MonthlyOperationsSummaryQuery & {
      from?: string;
      to?: string;
    },
    options?: { maxMonths?: number },
  ) {
    if (query.periodMonth !== undefined && query.periodMonth !== "") {
      const periodMonth = this.parseCalendarMonth(
        query.periodMonth,
        "periodMonth",
      );
      return {
        periodMonthFrom: periodMonth,
        periodMonthTo: periodMonth,
      };
    }

    const parsedPeriodFrom =
      query.periodMonthFrom !== undefined && query.periodMonthFrom !== ""
        ? this.parseCalendarMonth(query.periodMonthFrom, "periodMonthFrom")
        : undefined;
    const parsedPeriodTo =
      query.periodMonthTo !== undefined && query.periodMonthTo !== ""
        ? this.parseCalendarMonth(query.periodMonthTo, "periodMonthTo")
        : undefined;
    const parsedFrom =
      query.from !== undefined && query.from !== ""
        ? this.parseSummaryBoundaryMonth(query.from, "from")
        : undefined;
    const parsedTo =
      query.to !== undefined && query.to !== ""
        ? this.parseSummaryBoundaryMonth(query.to, "to")
        : undefined;

    if (parsedPeriodFrom && parsedFrom && parsedPeriodFrom !== parsedFrom) {
      throw new ApiRequestError(
        400,
        "REPORT_QUERY_INVALID",
        "from and periodMonthFrom must refer to the same calendar month.",
      );
    }
    if (parsedPeriodTo && parsedTo && parsedPeriodTo !== parsedTo) {
      throw new ApiRequestError(
        400,
        "REPORT_QUERY_INVALID",
        "to and periodMonthTo must refer to the same calendar month.",
      );
    }

    const fromMonth = parsedPeriodFrom ?? parsedFrom;
    const toMonth = parsedPeriodTo ?? parsedTo;

    const today = new Date();
    const latest =
      toTaipeiMonth(today.toISOString()) ?? today.toISOString().slice(0, 7);
    const periodMonthTo =
      toMonth ??
      (fromMonth && fromMonth > latest
        ? fromMonth
        : fromMonth
          ? this.minCalendarMonth(latest, this.shiftCalendarMonth(fromMonth, 5))
          : latest);
    const periodMonthFrom =
      fromMonth ?? this.shiftCalendarMonth(periodMonthTo, -5);

    if (periodMonthFrom > periodMonthTo) {
      throw new ApiRequestError(
        400,
        "REPORT_QUERY_INVALID",
        "periodMonthFrom must not be after periodMonthTo.",
      );
    }

    if (options?.maxMonths !== undefined) {
      const span = this.calendarMonthSpan(periodMonthFrom, periodMonthTo);
      if (span < 1 || span > options.maxMonths) {
        throw new ApiRequestError(
          400,
          "REPORT_WINDOW_TOO_LARGE",
          `Operations summary window must not exceed ${options.maxMonths} calendar months.`,
        );
      }
    }

    return {
      periodMonthFrom,
      periodMonthTo,
    };
  }

  private parseCalendarMonth(value: string, field: string): string {
    const trimmed = value.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
      throw new ApiRequestError(
        400,
        "REPORT_QUERY_INVALID",
        `Invalid ${field} parameter (expected YYYY-MM).`,
      );
    }
    return trimmed;
  }

  private parseSummaryBoundaryMonth(
    value: string,
    boundary: "from" | "to",
  ): string {
    const trimmed = value.trim();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
      return trimmed;
    }
    const datePrefix = trimmed.slice(0, 10);
    if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(datePrefix)) {
      throw new ApiRequestError(
        400,
        "REPORT_QUERY_INVALID",
        `Invalid ${boundary} parameter (expected YYYY-MM or full calendar month boundary).`,
      );
    }
    const periodMonth = datePrefix.slice(0, 7);
    const expectedDate =
      boundary === "from"
        ? `${periodMonth}-01`
        : this.endOfMonthIso(`${periodMonth}-01T00:00:00.000Z`).slice(0, 10);
    if (datePrefix !== expectedDate) {
      throw new ApiRequestError(
        400,
        "REPORT_QUERY_INVALID",
        `${boundary} must be a calendar month (YYYY-MM) or the exact ${boundary === "from" ? "first" : "last"} day of that month (${expectedDate}); arbitrary mid-month dates are not supported for monthly operations summaries.`,
      );
    }
    return periodMonth;
  }

  private shiftCalendarMonth(periodMonth: string, deltaMonths: number): string {
    const [yearText, monthText] = periodMonth.split("-");
    const shifted = new Date(
      Date.UTC(Number(yearText), Number(monthText) - 1 + deltaMonths, 1),
    );
    return shifted.toISOString().slice(0, 7);
  }

  private minCalendarMonth(left: string, right: string): string {
    return left <= right ? left : right;
  }

  private calendarMonthSpan(fromMonth: string, toMonth: string): number {
    const [fromYear, fromM] = fromMonth.split("-").map(Number);
    const [toYear, toM] = toMonth.split("-").map(Number);
    return (toYear! - fromYear!) * 12 + (toM! - fromM!) + 1;
  }

  private enumerateMonths(from: string, to: string) {
    const months: string[] = [];
    let cursor = new Date(`${from}-01T00:00:00.000Z`);
    const end = new Date(`${to}-01T00:00:00.000Z`);
    while (cursor <= end) {
      months.push(cursor.toISOString().slice(0, 7));
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
    }
    return months;
  }

  private expectedSnapshotsForMonth(periodMonth: string) {
    const monthStart = new Date(`${periodMonth}-01T00:00:00.000Z`);
    const monthEnd = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    );
    return monthEnd.getUTCDate() * 24 * 12;
  }

  private resolveOrderBusinessArea(
    order: OwnedOrderRecord,
    dispatchAssignments: readonly DispatchAssignmentRecord[],
    vehicleAreaById: ReadonlyMap<string, string>,
  ) {
    const assignments = dispatchAssignments
      .filter((assignment) => assignment.orderId === order.orderId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const assignment of assignments.slice().reverse()) {
      const area = vehicleAreaById.get(assignment.vehicleId);
      if (area) {
        return area;
      }
    }

    const uniqueAreas = [...new Set(vehicleAreaById.values())];
    if (uniqueAreas.length === 1) {
      return uniqueAreas[0]!;
    }
    return "unassigned";
  }

  private readDispatchableSupplySnapshots(
    query: DispatchableSupplySnapshotQuery = {},
  ) {
    return this.dispatchableSupplySnapshots.filter((record) =>
      this.matchesSnapshotQuery(record, query),
    );
  }

  private async loadDispatchableSupplySnapshots(
    query: DispatchableSupplySnapshotQuery = {},
  ) {
    if (this.reportingRepository?.isEnabled()) {
      try {
        const records =
          await this.reportingRepository.listDispatchableSupplySnapshots(query);
        if (records.length > 0) {
          this.dispatchableSupplySnapshots =
            this.mergeDispatchableSupplySnapshots(
              this.dispatchableSupplySnapshots,
              records,
            );
          return records;
        }
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "load dispatchable supply snapshots",
        );
      }
    }

    return this.readDispatchableSupplySnapshots(query);
  }

  private roundTo(value: number, digits: number) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  private endOfMonthIso(iso: string) {
    const date = new Date(iso);
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59),
    ).toISOString();
  }

  private floorToSnapshotBoundary(value: Date) {
    const floored = new Date(value);
    floored.setUTCSeconds(0, 0);
    floored.setUTCMinutes(
      floored.getUTCMinutes() - (floored.getUTCMinutes() % 5),
    );
    return floored;
  }

  private startDispatchableSupplySnapshotScheduler() {
    if (!this.vehicleEligibilityService) {
      return;
    }

    this.clearDispatchableSupplySnapshotScheduler();
    const now = Date.now();
    const nextBoundary =
      Math.floor(now / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS +
      SNAPSHOT_INTERVAL_MS;
    const delayMs = Math.max(nextBoundary - now, 0);
    this.snapshotScheduleDelay = setTimeout(() => {
      void this.runScheduledDispatchableSupplySnapshot();
      this.snapshotScheduleInterval = setInterval(() => {
        void this.runScheduledDispatchableSupplySnapshot();
      }, SNAPSHOT_INTERVAL_MS);
    }, delayMs);
  }

  private clearDispatchableSupplySnapshotScheduler() {
    if (this.snapshotScheduleDelay) {
      clearTimeout(this.snapshotScheduleDelay);
      this.snapshotScheduleDelay = null;
    }
    if (this.snapshotScheduleInterval) {
      clearInterval(this.snapshotScheduleInterval);
      this.snapshotScheduleInterval = null;
    }
  }

  private async runScheduledDispatchableSupplySnapshot() {
    try {
      await this.captureDispatchableSupplySnapshot(new Date());
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Dispatchable supply snapshot scheduler skipped: ${detail}`,
      );
    }
  }

  private resolveEventTimestamp(
    traceLogs: readonly DispatchTraceLogRecord[],
    eventType: string,
    timestamp: string | null,
    taskId?: string,
    allowSnapshotFallback = false,
  ) {
    const matchingLog =
      traceLogs.find(
        (traceLog) =>
          traceLog.eventType === eventType &&
          (taskId === undefined ||
            traceLog.details?.taskId === taskId ||
            traceLog.details?.taskId === undefined),
      ) ?? null;

    if (matchingLog) {
      return timestamp ?? matchingLog.createdAt;
    }

    return allowSnapshotFallback ? timestamp : null;
  }
}
