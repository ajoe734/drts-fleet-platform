import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  ComplaintCaseRecord,
  DispatchAssignmentRecord,
  DispatchDailyRecord,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

export type DispatchDailyRecordMaterialized = DispatchDailyRecord & {
  qualityFlags: string[];
};

export type ReportingSourceState = {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  dispatchAssignments: DispatchAssignmentRecord[];
  driverTasks: DriverTaskRecord[];
  dispatchTraceLogs: DispatchTraceLogRecord[];
  complaintCases: ComplaintCaseRecord[];
  vehicles: VehicleRegistryRecord[];
};

@Injectable()
export class ReportingRepository {
  private readonly logger = new Logger(ReportingRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async loadDispatchDailyRecordSourceState(): Promise<ReportingSourceState> {
    if (!this.isEnabled()) {
      return {
        orders: [],
        dispatchJobs: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
        complaintCases: [],
        vehicles: [],
      };
    }

    const [
      ordersResult,
      dispatchJobsResult,
      dispatchAssignmentsResult,
      driverTasksResult,
      dispatchTraceLogsResult,
      complaintCasesResult,
      vehiclesResult,
    ] = await Promise.all([
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_owned_orders
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_dispatch_jobs
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_dispatch_assignments
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_driver_tasks
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM ops.phase1_dispatch_trace_logs
          ORDER BY created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM crm.phase1_complaint_cases
          ORDER BY updated_at DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT record
          FROM reg.phase1_registry_vehicles
          ORDER BY updated_at DESC, plate_no ASC
        `,
      ),
    ]);

    return {
      orders: ordersResult.rows.map((row) =>
        this.parseRecord<OwnedOrderRecord>(row.record, "ops.phase1_owned_orders"),
      ),
      dispatchJobs: dispatchJobsResult.rows.map((row) =>
        this.parseRecord<DispatchJobRecord>(
          row.record,
          "ops.phase1_dispatch_jobs",
        ),
      ),
      dispatchAssignments: dispatchAssignmentsResult.rows.map((row) =>
        this.parseRecord<DispatchAssignmentRecord>(
          row.record,
          "ops.phase1_dispatch_assignments",
        ),
      ),
      driverTasks: driverTasksResult.rows.map((row) =>
        this.parseRecord<DriverTaskRecord>(
          row.record,
          "ops.phase1_driver_tasks",
        ),
      ),
      dispatchTraceLogs: dispatchTraceLogsResult.rows.map((row) =>
        this.parseRecord<DispatchTraceLogRecord>(
          row.record,
          "ops.phase1_dispatch_trace_logs",
        ),
      ),
      complaintCases: complaintCasesResult.rows.map((row) =>
        this.parseRecord<ComplaintCaseRecord>(
          row.record,
          "crm.phase1_complaint_cases",
        ),
      ),
      vehicles: vehiclesResult.rows.map((row) =>
        this.parseRecord<VehicleRegistryRecord>(
          row.record,
          "reg.phase1_registry_vehicles",
        ),
      ),
    };
  }

  async upsertDispatchDailyRecords(
    records: readonly DispatchDailyRecordMaterialized[],
  ) {
    if (!this.isEnabled() || records.length === 0) {
      return;
    }

    const writes = records.map((record) =>
      this.databaseService!.query(
        `
          INSERT INTO reporting.dispatch_daily_records (
            service_date,
            order_id,
            order_no,
            order_source,
            tenant_id,
            partner_id,
            service_product_code,
            requested_at,
            reservation_time,
            pickup_address_snapshot,
            dropoff_address_snapshot,
            first_dispatch_at,
            first_assigned_at,
            final_driver_id,
            final_vehicle_id,
            final_plate_no,
            eta_seconds_at_assignment,
            arrived_pickup_at,
            trip_started_at,
            trip_completed_at,
            final_status,
            redispatch_count,
            cancellation_reason,
            complaint_count,
            quality_flags,
            generated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25::jsonb, $26
          )
          ON CONFLICT (service_date, order_id) DO UPDATE SET
            order_no = EXCLUDED.order_no,
            order_source = EXCLUDED.order_source,
            tenant_id = EXCLUDED.tenant_id,
            partner_id = EXCLUDED.partner_id,
            service_product_code = EXCLUDED.service_product_code,
            requested_at = EXCLUDED.requested_at,
            reservation_time = EXCLUDED.reservation_time,
            pickup_address_snapshot = EXCLUDED.pickup_address_snapshot,
            dropoff_address_snapshot = EXCLUDED.dropoff_address_snapshot,
            first_dispatch_at = EXCLUDED.first_dispatch_at,
            first_assigned_at = EXCLUDED.first_assigned_at,
            final_driver_id = EXCLUDED.final_driver_id,
            final_vehicle_id = EXCLUDED.final_vehicle_id,
            final_plate_no = EXCLUDED.final_plate_no,
            eta_seconds_at_assignment = EXCLUDED.eta_seconds_at_assignment,
            arrived_pickup_at = EXCLUDED.arrived_pickup_at,
            trip_started_at = EXCLUDED.trip_started_at,
            trip_completed_at = EXCLUDED.trip_completed_at,
            final_status = EXCLUDED.final_status,
            redispatch_count = EXCLUDED.redispatch_count,
            cancellation_reason = EXCLUDED.cancellation_reason,
            complaint_count = EXCLUDED.complaint_count,
            quality_flags = EXCLUDED.quality_flags,
            generated_at = EXCLUDED.generated_at
        `,
        [
          record.serviceDate,
          record.orderId,
          record.orderNo,
          record.orderSource,
          record.tenantId,
          record.partnerId,
          record.serviceProductCode,
          record.requestedAt,
          record.reservationTime,
          record.pickupAddressSnapshot,
          record.dropoffAddressSnapshot,
          record.firstDispatchAt,
          record.firstAssignedAt,
          record.finalDriverId,
          record.finalVehicleId,
          record.finalPlateNo,
          record.etaSecondsAtAssignment,
          record.arrivedPickupAt,
          record.tripStartedAt,
          record.tripCompletedAt,
          record.finalStatus,
          record.redispatchCount,
          record.cancellationReason,
          record.complaintCount,
          JSON.stringify(record.qualityFlags),
          record.generatedAt,
        ],
      ),
    );

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Dispatch daily record persistence skipped during ${context}: ${detail}`,
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
