import { Injectable } from "@nestjs/common";

import type {
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  OwnedOrderRecord,
} from "@drts/contracts";

import {
  ReportingRepository,
  type DispatchDailyRecordMaterialized,
  type ReportingSourceState,
} from "./reporting.repository";

const REDISPATCH_TRACE_EVENT_TYPES = new Set([
  "dispatch.reassigned",
  "dispatch.redispatch_required",
]);

@Injectable()
export class DispatchDailyRecordBuilderService {
  constructor(private readonly reportingRepository: ReportingRepository) {}

  async rebuildForServiceDate(
    serviceDate: string,
  ): Promise<DispatchDailyRecordMaterialized[]> {
    const sourceState =
      await this.reportingRepository.loadDispatchDailyRecordSourceState();
    const records = this.materializeDispatchDailyRecords(
      serviceDate,
      sourceState,
    );

    try {
      await this.reportingRepository.upsertDispatchDailyRecords(records);
    } catch (error) {
      this.reportingRepository.reportPersistenceFailure(
        error,
        `rebuild ${serviceDate}`,
      );
      throw error;
    }

    return records;
  }

  materializeDispatchDailyRecords(
    serviceDate: string,
    sourceState: ReportingSourceState,
    generatedAt = new Date().toISOString(),
  ): DispatchDailyRecordMaterialized[] {
    const complaintsByOrderId = new Map<string, number>();
    for (const complaintCase of sourceState.complaintCases) {
      if (!complaintCase.relatedOrderId) {
        continue;
      }
      complaintsByOrderId.set(
        complaintCase.relatedOrderId,
        (complaintsByOrderId.get(complaintCase.relatedOrderId) ?? 0) + 1,
      );
    }

    const vehiclesById = new Map(
      sourceState.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]),
    );
    const dispatchJobsByOrderId = this.groupBy(
      sourceState.dispatchJobs,
      (dispatchJob) => dispatchJob.orderId,
    );
    const dispatchAssignmentsByOrderId = this.groupBy(
      sourceState.dispatchAssignments,
      (assignment) => assignment.orderId,
    );
    const driverTasksByAssignmentId = new Map(
      sourceState.driverTasks.map((task) => [task.assignmentId, task]),
    );
    const dispatchTracesByOrderId = this.groupBy(
      sourceState.dispatchTraceLogs,
      (traceLog) => traceLog.orderId,
    );

    return sourceState.orders
      .filter((order) => this.resolveServiceDate(order) === serviceDate)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((order) => {
        const dispatchJobs = this.sortByCreatedAt(
          dispatchJobsByOrderId.get(order.orderId) ?? [],
        );
        const assignments = this.sortByCreatedAt(
          dispatchAssignmentsByOrderId.get(order.orderId) ?? [],
        );
        const traceLogs = this.sortByCreatedAt(
          dispatchTracesByOrderId.get(order.orderId) ?? [],
        );

        const firstDispatchAt = this.resolveFirstDispatchAt(
          dispatchJobs,
          traceLogs,
        );
        const firstAssignedAt = assignments[0]?.createdAt ?? null;
        const finalAssignment = this.resolveFinalAssignment(assignments);
        const finalTask = finalAssignment
          ? (driverTasksByAssignmentId.get(finalAssignment.assignmentId) ?? null)
          : null;
        const qualityFlags: string[] = [];
        const hasArrivedPickupTrace =
          finalTask !== null &&
          traceLogs.some(
            (traceLog) =>
              traceLog.eventType === "driver.arrived_pickup" &&
              traceLog.details?.taskId === finalTask.taskId,
          );
        const arrivedPickupAt = hasArrivedPickupTrace
          ? finalTask?.arrivedPickupAt ?? null
          : null;

        if (finalTask && !hasArrivedPickupTrace) {
          qualityFlags.push("ARRIVAL_EVENT_MISSING");
        }

        const finalVehicleId =
          finalAssignment?.vehicleId ?? finalTask?.vehicleId ?? null;

        return {
          serviceDate,
          orderId: order.orderId,
          orderNo: order.orderNo,
          orderSource: order.orderSource,
          tenantId: order.tenantId,
          partnerId: order.partnerId,
          serviceProductCode: this.resolveServiceProductCode(order),
          requestedAt: order.createdAt,
          reservationTime: order.reservationWindowStart,
          pickupAddressSnapshot: order.pickup.address,
          dropoffAddressSnapshot: order.dropoff.address ?? null,
          firstDispatchAt,
          firstAssignedAt,
          finalDriverId: finalAssignment?.driverId ?? finalTask?.driverId ?? null,
          finalVehicleId,
          finalPlateNo: finalVehicleId
            ? (vehiclesById.get(finalVehicleId)?.plateNo ?? null)
            : null,
          etaSecondsAtAssignment:
            dispatchJobs.at(-1)?.latestEtaMinutes != null
              ? dispatchJobs.at(-1)!.latestEtaMinutes! * 60
              : null,
          arrivedPickupAt,
          tripStartedAt: finalTask?.startedAt ?? null,
          tripCompletedAt: finalTask?.completedAt ?? null,
          finalStatus: order.status,
          redispatchCount: traceLogs.filter((traceLog) =>
            REDISPATCH_TRACE_EVENT_TYPES.has(traceLog.eventType),
          ).length,
          cancellationReason: order.cancelReason,
          complaintCount: complaintsByOrderId.get(order.orderId) ?? 0,
          qualityFlags,
          generatedAt,
        };
      });
  }

  private resolveServiceDate(order: OwnedOrderRecord) {
    return (order.reservationWindowStart ?? order.createdAt).slice(0, 10);
  }

  private resolveServiceProductCode(order: OwnedOrderRecord) {
    if (order.businessDispatchSubtype) {
      return order.businessDispatchSubtype;
    }
    if (order.serviceBucket === "standard_taxi") {
      return order.dispatchSemantics === "reservation"
        ? "taxi_reservation"
        : "taxi_realtime";
    }
    return "enterprise_dispatch";
  }

  private resolveFirstDispatchAt(
    dispatchJobs: readonly DispatchJobRecord[],
    traceLogs: readonly DispatchTraceLogRecord[],
  ) {
    const traceDispatchAt =
      traceLogs.find((traceLog) => traceLog.eventType.startsWith("dispatch."))
        ?.createdAt ?? null;
    return dispatchJobs[0]?.createdAt ?? traceDispatchAt;
  }

  private resolveFinalAssignment(
    assignments: readonly DispatchAssignmentRecord[],
  ) {
    return (
      [...assignments]
        .reverse()
        .find((assignment) => assignment.status !== "rejected") ?? null
    );
  }

  private sortByCreatedAt<T extends { createdAt: string }>(items: readonly T[]) {
    return [...items].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  private groupBy<T>(items: readonly T[], key: (item: T) => string) {
    const grouped = new Map<string, T[]>();
    for (const item of items) {
      const itemKey = key(item);
      const existing = grouped.get(itemKey) ?? [];
      existing.push(item);
      grouped.set(itemKey, existing);
    }
    return grouped;
  }
}
