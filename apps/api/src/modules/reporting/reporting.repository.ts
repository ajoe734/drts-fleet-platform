import { Injectable, Logger, Optional } from "@nestjs/common";

import type { DispatchDailyRecord } from "@drts/contracts";

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
      requestedAt: row.requested_at,
      reservationTime: row.reservation_time,
      pickupAddressSnapshot: row.pickup_address_snapshot,
      dropoffAddressSnapshot: row.dropoff_address_snapshot,
      firstDispatchAt: row.first_dispatch_at,
      firstAssignedAt: row.first_assigned_at,
      finalDriverId: row.final_driver_id,
      finalVehicleId: row.final_vehicle_id,
      finalPlateNo: row.final_plate_no,
      etaSecondsAtAssignment: row.eta_seconds_at_assignment,
      arrivedPickupAt: row.arrived_pickup_at,
      tripStartedAt: row.trip_started_at,
      tripCompletedAt: row.trip_completed_at,
      finalStatus: row.final_status,
      redispatchCount: row.redispatch_count,
      cancellationReason: row.cancellation_reason,
      complaintCount: row.complaint_count,
      generatedAt: row.generated_at,
    };
  }
}
