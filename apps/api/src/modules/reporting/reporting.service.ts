import { Injectable, Optional } from "@nestjs/common";

import type {
  DispatchAssignmentRecord,
  DispatchDailyRecord,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
} from "@drts/contracts";

import { ComplaintService } from "../complaint/complaint.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import {
  ReportingRepository,
  type DailyDispatchRecordQuery,
  type DispatchDailyRecordSource,
} from "./reporting.repository";

type DispatchDailyRecordRebuildResult = {
  rebuiltCount: number;
  generatedAt: string;
  records: DispatchDailyRecord[];
};

@Injectable()
export class ReportingService {
  private dailyDispatchRecords: DispatchDailyRecord[] = [];

  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly complaintService: ComplaintService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    @Optional() private readonly reportingRepository?: ReportingRepository,
  ) {}

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
