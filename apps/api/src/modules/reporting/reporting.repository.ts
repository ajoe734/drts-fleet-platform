import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  ComplaintCaseRecord,
  DispatchAssignmentRecord,
  DispatchDailyRecord,
  DispatchJobRecord,
  DispatchableSupplySnapshotRecord,
  DispatchTraceLogRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
  SixMonthOperationsSummary,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type DispatchDailyRecordRow = {
  service_date: string;
  order_id: string;
  order_no: string;
  order_source: string;
  tenant_id: string | null;
  partner_id: string | null;
  service_product_code: string;
  requested_at: string;
  reservation_time: string | null;
  pickup_address_snapshot: string;
  dropoff_address_snapshot: string | null;
  first_dispatch_at: string | null;
  first_assigned_at: string | null;
  final_driver_id: string | null;
  final_vehicle_id: string | null;
  final_plate_no: string | null;
  eta_seconds_at_assignment: number | null;
  arrived_pickup_at: string | null;
  trip_started_at: string | null;
  trip_completed_at: string | null;
  final_status: string;
  redispatch_count: number;
  cancellation_reason: string | null;
  complaint_count: number;
  generated_at: string;
};

type JsonRecordRow = {
  record: unknown;
};

type DispatchableSupplySnapshotRow = {
  snapshot_at: string;
  business_area: string;
  service_product_code: string;
  dispatchable_vehicle_count: number;
  available_driver_count: number;
  source_health: DispatchableSupplySnapshotRecord["sourceHealth"];
  generated_at: string;
};

type MonthlyOperationsSummaryRow = {
  period_month: string;
  business_area: string;
  service_product_code: string;
  demand_request_count: number;
  actual_dispatch_count: number;
  completed_trip_count: number;
  cancelled_order_count: number;
  average_dispatchable_vehicle_count: string | number;
  valid_snapshot_count: number;
  expected_snapshot_count: number;
  snapshot_coverage_rate: string | number;
  complaint_count: number;
  complaints_by_category: Record<string, number> | string;
  generated_at: string;
};

export type DailyDispatchRecordQuery = {
  serviceDate?: string;
  serviceDateFrom?: string;
  serviceDateTo?: string;
  orderId?: string;
  orderSource?: string;
  tenantId?: string;
  partnerId?: string;
  serviceProductCode?: string;
  finalStatus?: string;
};

export type DispatchableSupplySnapshotQuery = {
  snapshotAt?: string;
  snapshotAtFrom?: string;
  snapshotAtTo?: string;
  businessArea?: string;
  serviceProductCode?: string;
  sourceHealth?: DispatchableSupplySnapshotRecord["sourceHealth"];
};

export type MonthlyOperationsSummaryRecord = Omit<
  SixMonthOperationsSummary,
  "from" | "to" | "businessArea" | "serviceProductCode"
> & {
  periodMonth: string;
  businessArea: string;
  serviceProductCode: string;
};

export type MonthlyOperationsSummaryQuery = {
  periodMonth?: string;
  periodMonthFrom?: string;
  periodMonthTo?: string;
  businessArea?: string;
  serviceProductCode?: string;
};

export type DispatchDailyRecordSource = {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  dispatchAssignments: DispatchAssignmentRecord[];
  driverTasks: DriverTaskRecord[];
  dispatchTraceLogs: DispatchTraceLogRecord[];
  complaintCases: ComplaintCaseRecord[];
};

@Injectable()
export class ReportingRepository {
  private readonly logger = new Logger(ReportingRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async upsertDailyDispatchRecords(records: readonly DispatchDailyRecord[]) {
    if (!this.isEnabled() || records.length === 0) {
      return;
    }

    await Promise.all(
      records.map((record) =>
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
              generated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25
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
            record.generatedAt,
          ],
        ),
      ),
    );
  }

  async upsertDispatchableSupplySnapshots(
    records: readonly DispatchableSupplySnapshotRecord[],
  ) {
    if (!this.isEnabled() || records.length === 0) {
      return;
    }

    await Promise.all(
      records.map((record) =>
        this.databaseService!.query(
          `
            INSERT INTO reporting.dispatchable_supply_snapshots (
              snapshot_at,
              business_area,
              service_product_code,
              dispatchable_vehicle_count,
              available_driver_count,
              source_health,
              generated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (snapshot_at, business_area, service_product_code)
            DO UPDATE SET
              dispatchable_vehicle_count = EXCLUDED.dispatchable_vehicle_count,
              available_driver_count = EXCLUDED.available_driver_count,
              source_health = EXCLUDED.source_health,
              generated_at = EXCLUDED.generated_at
          `,
          [
            record.snapshotAt,
            record.businessArea,
            record.serviceProductCode,
            record.dispatchableVehicleCount,
            record.availableDriverCount,
            record.sourceHealth,
            record.generatedAt,
          ],
        ),
      ),
    );
  }

  async upsertMonthlyOperationsSummaries(
    records: readonly MonthlyOperationsSummaryRecord[],
  ) {
    if (!this.isEnabled() || records.length === 0) {
      return;
    }

    await Promise.all(
      records.map((record) =>
        this.databaseService!.query(
          `
            INSERT INTO reporting.monthly_operations_summaries (
              period_month,
              business_area,
              service_product_code,
              demand_request_count,
              actual_dispatch_count,
              completed_trip_count,
              cancelled_order_count,
              average_dispatchable_vehicle_count,
              valid_snapshot_count,
              expected_snapshot_count,
              snapshot_coverage_rate,
              complaint_count,
              complaints_by_category,
              generated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13::jsonb, $14
            )
            ON CONFLICT (period_month, business_area, service_product_code)
            DO UPDATE SET
              demand_request_count = EXCLUDED.demand_request_count,
              actual_dispatch_count = EXCLUDED.actual_dispatch_count,
              completed_trip_count = EXCLUDED.completed_trip_count,
              cancelled_order_count = EXCLUDED.cancelled_order_count,
              average_dispatchable_vehicle_count =
                EXCLUDED.average_dispatchable_vehicle_count,
              valid_snapshot_count = EXCLUDED.valid_snapshot_count,
              expected_snapshot_count = EXCLUDED.expected_snapshot_count,
              snapshot_coverage_rate = EXCLUDED.snapshot_coverage_rate,
              complaint_count = EXCLUDED.complaint_count,
              complaints_by_category = EXCLUDED.complaints_by_category,
              generated_at = EXCLUDED.generated_at
          `,
          [
            record.periodMonth,
            record.businessArea,
            record.serviceProductCode,
            record.demandRequestCount,
            record.actualDispatchCount,
            record.completedTripCount,
            record.cancelledOrderCount,
            record.averageDispatchableVehicleCount,
            record.validSnapshotCount,
            record.expectedSnapshotCount,
            record.snapshotCoverageRate,
            record.complaintCount,
            JSON.stringify(record.complaintsByCategory),
            record.generatedAt,
          ],
        ),
      ),
    );
  }

  async loadDailyDispatchRecordSource(): Promise<DispatchDailyRecordSource> {
    if (!this.isEnabled()) {
      return {
        orders: [],
        dispatchJobs: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
        complaintCases: [],
      };
    }

    const [
      ordersResult,
      dispatchJobsResult,
      dispatchAssignmentsResult,
      driverTasksResult,
      dispatchTraceLogsResult,
      complaintCasesResult,
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
    ]);

    return {
      orders: ordersResult.rows.map((row) =>
        this.parseRecord<OwnedOrderRecord>(
          row.record,
          "ops.phase1_owned_orders",
        ),
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
    };
  }

  async listDailyDispatchRecords(
    query: DailyDispatchRecordQuery = {},
  ): Promise<DispatchDailyRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const whereClauses: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.serviceDate) {
      whereClauses.push(`service_date = ${bind(query.serviceDate)}`);
    } else {
      if (query.serviceDateFrom) {
        whereClauses.push(`service_date >= ${bind(query.serviceDateFrom)}`);
      }
      if (query.serviceDateTo) {
        whereClauses.push(`service_date <= ${bind(query.serviceDateTo)}`);
      }
    }
    if (query.orderId) {
      whereClauses.push(`order_id = ${bind(query.orderId)}`);
    }
    if (query.orderSource) {
      whereClauses.push(`order_source = ${bind(query.orderSource)}`);
    }
    if (query.tenantId) {
      whereClauses.push(`tenant_id = ${bind(query.tenantId)}`);
    }
    if (query.partnerId) {
      whereClauses.push(`partner_id = ${bind(query.partnerId)}`);
    }
    if (query.serviceProductCode) {
      whereClauses.push(
        `service_product_code = ${bind(query.serviceProductCode)}`,
      );
    }
    if (query.finalStatus) {
      whereClauses.push(`final_status = ${bind(query.finalStatus)}`);
    }

    const where =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const result = await this.databaseService!.query<DispatchDailyRecordRow>(
      `
        SELECT
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
          generated_at
        FROM reporting.dispatch_daily_records
        ${where}
        ORDER BY service_date DESC, requested_at DESC, order_id DESC
      `,
      values,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async listDispatchableSupplySnapshots(
    query: DispatchableSupplySnapshotQuery = {},
  ): Promise<DispatchableSupplySnapshotRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const whereClauses: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.snapshotAt) {
      whereClauses.push(`snapshot_at = ${bind(query.snapshotAt)}`);
    } else {
      if (query.snapshotAtFrom) {
        whereClauses.push(`snapshot_at >= ${bind(query.snapshotAtFrom)}`);
      }
      if (query.snapshotAtTo) {
        whereClauses.push(`snapshot_at <= ${bind(query.snapshotAtTo)}`);
      }
    }
    if (query.businessArea) {
      whereClauses.push(`business_area = ${bind(query.businessArea)}`);
    }
    if (query.serviceProductCode) {
      whereClauses.push(
        `service_product_code = ${bind(query.serviceProductCode)}`,
      );
    }
    if (query.sourceHealth) {
      whereClauses.push(`source_health = ${bind(query.sourceHealth)}`);
    }

    const where =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const result =
      await this.databaseService!.query<DispatchableSupplySnapshotRow>(
        `
          SELECT
            snapshot_at,
            business_area,
            service_product_code,
            dispatchable_vehicle_count,
            available_driver_count,
            source_health,
            generated_at
          FROM reporting.dispatchable_supply_snapshots
          ${where}
          ORDER BY snapshot_at DESC, business_area ASC, service_product_code ASC
        `,
        values,
      );

    return result.rows.map((row) => this.mapSnapshotRow(row));
  }

  async listMonthlyOperationsSummaries(
    query: MonthlyOperationsSummaryQuery = {},
  ): Promise<MonthlyOperationsSummaryRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const whereClauses: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (query.periodMonth) {
      whereClauses.push(`period_month = ${bind(query.periodMonth)}`);
    } else {
      if (query.periodMonthFrom) {
        whereClauses.push(`period_month >= ${bind(query.periodMonthFrom)}`);
      }
      if (query.periodMonthTo) {
        whereClauses.push(`period_month <= ${bind(query.periodMonthTo)}`);
      }
    }
    if (query.businessArea) {
      whereClauses.push(`business_area = ${bind(query.businessArea)}`);
    }
    if (query.serviceProductCode) {
      whereClauses.push(
        `service_product_code = ${bind(query.serviceProductCode)}`,
      );
    }

    const where =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const result =
      await this.databaseService!.query<MonthlyOperationsSummaryRow>(
        `
          SELECT
            period_month,
            business_area,
            service_product_code,
            demand_request_count,
            actual_dispatch_count,
            completed_trip_count,
            cancelled_order_count,
            average_dispatchable_vehicle_count,
            valid_snapshot_count,
            expected_snapshot_count,
            snapshot_coverage_rate,
            complaint_count,
            complaints_by_category,
            generated_at
          FROM reporting.monthly_operations_summaries
          ${where}
          ORDER BY period_month DESC, business_area ASC, service_product_code ASC
        `,
        values,
      );

    return result.rows.map((row) => this.mapMonthlySummaryRow(row));
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Reporting persistence skipped during ${context}: ${detail}`,
    );
  }

  private mapRow(row: DispatchDailyRecordRow): DispatchDailyRecord {
    return {
      serviceDate: row.service_date,
      orderId: row.order_id,
      orderNo: row.order_no,
      orderSource: row.order_source,
      tenantId: row.tenant_id,
      partnerId: row.partner_id,
      serviceProductCode: row.service_product_code,
      requestedAt: this.toIsoString(row.requested_at),
      reservationTime: this.toOptionalIsoString(row.reservation_time),
      pickupAddressSnapshot: row.pickup_address_snapshot,
      dropoffAddressSnapshot: row.dropoff_address_snapshot,
      firstDispatchAt: this.toOptionalIsoString(row.first_dispatch_at),
      firstAssignedAt: this.toOptionalIsoString(row.first_assigned_at),
      finalDriverId: row.final_driver_id,
      finalVehicleId: row.final_vehicle_id,
      finalPlateNo: row.final_plate_no,
      etaSecondsAtAssignment: row.eta_seconds_at_assignment,
      arrivedPickupAt: this.toOptionalIsoString(row.arrived_pickup_at),
      tripStartedAt: this.toOptionalIsoString(row.trip_started_at),
      tripCompletedAt: this.toOptionalIsoString(row.trip_completed_at),
      finalStatus: row.final_status,
      redispatchCount: row.redispatch_count,
      cancellationReason: row.cancellation_reason,
      complaintCount: row.complaint_count,
      generatedAt: this.toIsoString(row.generated_at),
    };
  }

  private mapSnapshotRow(
    row: DispatchableSupplySnapshotRow,
  ): DispatchableSupplySnapshotRecord {
    return {
      snapshotAt: this.toIsoString(row.snapshot_at),
      businessArea: row.business_area,
      serviceProductCode: row.service_product_code,
      dispatchableVehicleCount: row.dispatchable_vehicle_count,
      availableDriverCount: row.available_driver_count,
      sourceHealth: row.source_health,
      generatedAt: this.toIsoString(row.generated_at),
    };
  }

  private mapMonthlySummaryRow(
    row: MonthlyOperationsSummaryRow,
  ): MonthlyOperationsSummaryRecord {
    const complaintsByCategory =
      typeof row.complaints_by_category === "string"
        ? (JSON.parse(row.complaints_by_category) as Record<string, number>)
        : row.complaints_by_category;

    return {
      periodMonth: row.period_month,
      businessArea: row.business_area,
      serviceProductCode: row.service_product_code,
      demandRequestCount: row.demand_request_count,
      actualDispatchCount: row.actual_dispatch_count,
      completedTripCount: row.completed_trip_count,
      cancelledOrderCount: row.cancelled_order_count,
      averageDispatchableVehicleCount: Number(
        row.average_dispatchable_vehicle_count,
      ),
      validSnapshotCount: row.valid_snapshot_count,
      expectedSnapshotCount: row.expected_snapshot_count,
      snapshotCoverageRate: Number(row.snapshot_coverage_rate),
      complaintCount: row.complaint_count,
      complaintsByCategory,
      generatedAt: this.toIsoString(row.generated_at),
    };
  }

  private toIsoString(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
  }

  private toOptionalIsoString(value: string | Date | null): string | null {
    if (value === null) {
      return null;
    }

    return this.toIsoString(value);
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
