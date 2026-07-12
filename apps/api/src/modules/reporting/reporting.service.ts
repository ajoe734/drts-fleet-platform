import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import type {
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
  SixMonthOperationsSummary,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { ComplaintService } from "../complaint/complaint.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../vehicle-eligibility/vehicle-eligibility.service";
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

@Injectable()
export class ReportingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportingService.name);
  private dailyDispatchRecords: DispatchDailyRecord[] = [];
  private dispatchableSupplySnapshots: DispatchableSupplySnapshotRecord[] = [];
  private monthlyOperationsSummaries: MonthlyOperationsSummaryRecord[] = [];
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

    const records = source.orders
      .map((order) =>
        this.buildDispatchDailyRecord(
          order,
          source.dispatchJobs,
          source.dispatchAssignments,
          source.driverTasks,
          source.dispatchTraceLogs,
          vehiclePlateById,
          complaintCountByOrderId,
          generatedAt,
        ),
      )
      .filter((record) => this.matchesQuery(record, query))
      .sort(
        (left, right) =>
          right.requestedAt.localeCompare(left.requestedAt) ||
          right.orderId.localeCompare(left.orderId),
      );

    if (this.reportingRepository?.isEnabled()) {
      try {
        await this.reportingRepository.upsertDailyDispatchRecords(records);
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "upsert dispatch daily records",
        );
      }
    } else {
      this.dailyDispatchRecords = this.mergeRecords(
        this.dailyDispatchRecords,
        records,
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
      try {
        const records =
          await this.reportingRepository.listDailyDispatchRecords(query);
        if (records.length > 0) {
          return records;
        }
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "list dispatch daily records",
        );
      }
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
  ): Promise<MonthlyOperationsSummaryRebuildResult> {
    const generatedAt = new Date().toISOString();
    const source = await this.loadDailyDispatchRecordSource();
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
    );

    if (this.reportingRepository?.isEnabled()) {
      try {
        await this.reportingRepository.upsertMonthlyOperationsSummaries(
          records,
        );
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "upsert monthly operations summaries",
        );
      }
    } else {
      this.monthlyOperationsSummaries = this.mergeMonthlyOperationsSummaries(
        this.monthlyOperationsSummaries,
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
      try {
        const records =
          await this.reportingRepository.listMonthlyOperationsSummaries(query);
        if (records.length > 0) {
          return records;
        }
      } catch (error) {
        this.reportingRepository.reportPersistenceFailure(
          error,
          "list monthly operations summaries",
        );
      }
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
    const { periodMonthFrom, periodMonthTo } =
      this.resolveSummaryMonthBounds(query);
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

    await this.rebuildMonthlyOperationsSummaries(monthlyQuery);

    const monthly = await this.listMonthlyOperationsSummaries(monthlyQuery);
    const grouped = new Map<string, SixMonthOperationsSummary>();
    for (const record of monthly) {
      const key = `${record.businessArea}:${record.serviceProductCode}`;
      const current = grouped.get(key) ?? {
        from: query.from ?? `${periodMonthFrom}-01`,
        to:
          query.to ??
          this.endOfMonthIso(`${periodMonthTo}-01T00:00:00.000Z`).slice(0, 10),
        businessArea: record.businessArea,
        serviceProductCode: record.serviceProductCode,
        demandRequestCount: 0,
        actualDispatchCount: 0,
        completedTripCount: 0,
        cancelledOrderCount: 0,
        averageDispatchableVehicleCount: 0,
        validSnapshotCount: 0,
        expectedSnapshotCount: 0,
        snapshotCoverageRate: 0,
        complaintCount: 0,
        complaintsByCategory: {},
        generatedAt: record.generatedAt,
      };
      current.demandRequestCount += record.demandRequestCount;
      current.actualDispatchCount += record.actualDispatchCount;
      current.completedTripCount += record.completedTripCount;
      current.cancelledOrderCount += record.cancelledOrderCount;
      current.averageDispatchableVehicleCount +=
        record.averageDispatchableVehicleCount * record.validSnapshotCount;
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

    return Array.from(grouped.values())
      .map((summary) => ({
        ...summary,
        averageDispatchableVehicleCount:
          summary.validSnapshotCount > 0
            ? this.roundTo(
                summary.averageDispatchableVehicleCount /
                  summary.validSnapshotCount,
                2,
              )
            : 0,
        snapshotCoverageRate:
          summary.expectedSnapshotCount > 0
            ? this.roundTo(
                summary.validSnapshotCount / summary.expectedSnapshotCount,
                4,
              )
            : 0,
        complaintsByCategory: { ...summary.complaintsByCategory },
      }))
      .sort(
        (left, right) =>
          (left.businessArea ?? "").localeCompare(right.businessArea ?? "") ||
          (left.serviceProductCode ?? "").localeCompare(
            right.serviceProductCode ?? "",
          ),
      );
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
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const orderAssignments = dispatchAssignments
      .filter((assignment) => assignment.orderId === order.orderId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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

    const firstDispatch = orderDispatchJobs[0] ?? null;
    const firstAssignment = orderAssignments[0] ?? null;
    const finalAssignment = orderAssignments.at(-1) ?? null;
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
        finalTask?.completedAt ?? null,
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
    return (order.reservationWindowStart ?? order.createdAt).slice(0, 10);
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
      merged.set(`${record.serviceDate}:${record.orderId}`, { ...record });
    }
    for (const record of next) {
      merged.set(`${record.serviceDate}:${record.orderId}`, { ...record });
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
  ): MonthlyOperationsSummaryRecord[] {
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

    const recordsByOrderId = new Map<string, DispatchDailyRecord>();
    const dimensionByOrderId = new Map<
      string,
      { periodMonth: string; businessArea: string; serviceProductCode: string }
    >();
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
      const periodMonth = record.serviceDate.slice(0, 7);
      if (!periods.includes(periodMonth)) {
        continue;
      }
      const businessArea = this.resolveOrderBusinessArea(
        order,
        source.dispatchAssignments,
        vehicleAreaById,
      );
      if (
        (query.businessArea && businessArea !== query.businessArea) ||
        (query.serviceProductCode &&
          record.serviceProductCode !== query.serviceProductCode)
      ) {
        continue;
      }
      recordsByOrderId.set(order.orderId, record);
      dimensionByOrderId.set(order.orderId, {
        periodMonth,
        businessArea,
        serviceProductCode: record.serviceProductCode,
      });
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
      const periodMonth = snapshot.snapshotAt.slice(0, 7);
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
        group.averageDispatchableVehicleCount +=
          snapshot.dispatchableVehicleCount;
      }
    }

    for (const complaintCase of source.complaintCases) {
      const relatedOrderId = complaintCase.relatedOrderId;
      if (!relatedOrderId) {
        continue;
      }
      const dimension = dimensionByOrderId.get(relatedOrderId);
      if (!dimension) {
        continue;
      }
      if (complaintCase.createdAt.slice(0, 7) !== dimension.periodMonth) {
        continue;
      }
      const group = ensureGroup(
        dimension.periodMonth,
        dimension.businessArea,
        dimension.serviceProductCode,
      );
      group.complaintCount += 1;
      group.complaintsByCategory[complaintCase.category] =
        (group.complaintsByCategory[complaintCase.category] ?? 0) + 1;
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        averageDispatchableVehicleCount:
          group.validSnapshotCount > 0
            ? this.roundTo(
                group.averageDispatchableVehicleCount /
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
  ) {
    if (query.periodMonth) {
      return {
        periodMonthFrom: query.periodMonth,
        periodMonthTo: query.periodMonth,
      };
    }

    const fromMonth = query.from?.slice(0, 7) ?? query.periodMonthFrom;
    const toMonth = query.to?.slice(0, 7) ?? query.periodMonthTo;
    if (fromMonth && toMonth) {
      return { periodMonthFrom: fromMonth, periodMonthTo: toMonth };
    }

    const today = new Date();
    const latest = today.toISOString().slice(0, 7);
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1),
    )
      .toISOString()
      .slice(0, 7);
    return {
      periodMonthFrom: fromMonth ?? start,
      periodMonthTo: toMonth ?? latest,
    };
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
