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
  private snapshotScheduleDelay: ReturnType<typeof setTimeout> | null = null;
  private snapshotScheduleInterval: ReturnType<typeof setInterval> | null = null;

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
      .sort((left, right) =>
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
        const records = await this.reportingRepository.listDailyDispatchRecords(
          query,
        );
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
      .sort((left, right) =>
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
        await this.reportingRepository.upsertDispatchableSupplySnapshots(records);
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
      .sort((left, right) =>
        right.snapshotAt.localeCompare(left.snapshotAt) ||
        left.businessArea.localeCompare(right.businessArea) ||
        left.serviceProductCode.localeCompare(right.serviceProductCode),
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
        const leftAt = left.completedAt ?? left.startedAt ?? left.acceptedAt ?? "";
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
      serviceProductCode:
        order.businessDispatchSubtype ?? order.serviceBucket ?? "unknown",
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
      tripStartedAt:
        this.resolveEventTimestamp(
          sortedOrderTraceLogs,
          "driver.started_trip",
          finalTask?.startedAt ?? null,
          finalTask?.taskId,
          true,
        ),
      tripCompletedAt:
        this.resolveEventTimestamp(
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
    const activeProducts = this.vehicleEligibilityService.listActiveServiceProducts();
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
          availableDriverCount: new Set(
            freshPairs.map((pair) => pair.driverId),
          ).size,
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
    const beforeTo = !query.snapshotAtTo || record.snapshotAt <= query.snapshotAtTo;
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
