import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import type {
  DispatchAssignmentRecord,
  DispatchAttemptRecord,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverRatingSummary,
  DriverTaskRecord,
  ConsumerNotificationOutboxRecord,
  OwnedOrderRecord,
  PassengerDispatchDisclosureSnapshot,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type DriverRatingSummaryRow = QueryResultRow & {
  driver_id: string;
  display_state: DriverRatingSummary["displayState"];
  average_rating: string | number | null;
  rating_count: number;
  last_rated_at: Date | string | null;
  aggregate_version: number;
  calculated_at: Date | string;
};

export type OwnedMobilityQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

export type DriverCompletionOutboxEffectType =
  | "tenant_order_completed_webhook"
  | "owned_mobility_trip_completed"
  | "multi_taxi_certificate";

export type DriverCompletionOutboxStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "dead_letter";

export type DriverCompletionOutboxRecord = {
  outboxId: string;
  taskId: string;
  orderId: string;
  effectType: DriverCompletionOutboxEffectType;
  requestId: string | null;
  payload: Record<string, unknown>;
  status: DriverCompletionOutboxStatus;
  attemptCount: number;
  nextAttemptAt: string;
  leaseToken: string | null;
  leasedUntil: string | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

type OwnedMobilityState = {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  dispatchAttempts: DispatchAttemptRecord[];
  dispatchAssignments: DispatchAssignmentRecord[];
  driverTasks: DriverTaskRecord[];
  dispatchTraceLogs: DispatchTraceLogRecord[];
  passengerDisclosureSnapshots: PassengerDispatchDisclosureSnapshot[];
  consumerNotificationOutbox: ConsumerNotificationOutboxRecord[];
};

type PersistOwnedMobilityChanges = {
  orders?: readonly OwnedOrderRecord[];
  dispatchJobs?: readonly DispatchJobRecord[];
  dispatchAttempts?: readonly DispatchAttemptRecord[];
  dispatchAssignments?: readonly DispatchAssignmentRecord[];
  driverTasks?: readonly DriverTaskRecord[];
  dispatchTraceLogs?: readonly DispatchTraceLogRecord[];
  passengerDisclosureSnapshots?: readonly PassengerDispatchDisclosureSnapshot[];
  consumerNotificationOutbox?: readonly ConsumerNotificationOutboxRecord[];
};

export type DriverTaskCompletionBundleRecord = {
  order: OwnedOrderRecord;
  assignment: DispatchAssignmentRecord;
  task: DriverTaskRecord;
};

type DriverCompletionOutboxRow = QueryResultRow & {
  outbox_id: string;
  task_id: string;
  order_id: string;
  effect_type: DriverCompletionOutboxEffectType;
  request_id: string | null;
  payload: unknown;
  status: DriverCompletionOutboxStatus;
  attempt_count: number;
  next_attempt_at: Date | string;
  lease_token: string | null;
  leased_until: Date | string | null;
  last_error: string | null;
  created_at: Date | string;
  delivered_at: Date | string | null;
};

@Injectable()
export class OwnedMobilityRepository {
  private readonly logger = new Logger(OwnedMobilityRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async findOrderById(orderId: string): Promise<OwnedOrderRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_owned_orders
        WHERE order_id = $1
        LIMIT 1
      `,
      [orderId],
    );
    const row = result.rows[0];
    return row
      ? this.parseRecord<OwnedOrderRecord>(
          row.record,
          "ops.phase1_owned_orders",
        )
      : null;
  }

  async findOrderByBookingId(
    bookingId: string,
    tenantId: string,
  ): Promise<OwnedOrderRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_owned_orders
        WHERE booking_id = $1
          AND tenant_id = $2
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [bookingId, tenantId],
    );
    const row = result.rows[0];
    return row
      ? this.parseRecord<OwnedOrderRecord>(
          row.record,
          "ops.phase1_owned_orders",
        )
      : null;
  }

  async loadState(): Promise<OwnedMobilityState> {
    if (!this.isEnabled()) {
      return {
        orders: [],
        dispatchJobs: [],
        dispatchAttempts: [],
        dispatchAssignments: [],
        driverTasks: [],
        dispatchTraceLogs: [],
        passengerDisclosureSnapshots: [],
        consumerNotificationOutbox: [],
      };
    }

    const [
      ordersResult,
      dispatchJobsResult,
      dispatchAttemptsResult,
      dispatchAssignmentsResult,
      driverTasksResult,
      dispatchTraceLogsResult,
      passengerDisclosureSnapshotsResult,
      consumerNotificationOutboxResult,
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
          FROM ops.phase1_dispatch_attempts
          ORDER BY sequence DESC, created_at DESC
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
          FROM ops.passenger_dispatch_disclosure_snapshots
          ORDER BY assignment_version DESC, created_at DESC
        `,
      ),
      this.databaseService!.query<JsonRecordRow>(
        `
          SELECT jsonb_build_object(
            'outboxId', outbox_id,
            'orderId', order_id,
            'passengerSubjectRef', passenger_subject_ref,
            'eventType', event_type,
            'assignmentVersion', assignment_version,
            'payload', payload,
            'status', status,
            'attemptCount', attempt_count,
            'nextAttemptAt', next_attempt_at,
            'createdAt', created_at,
            'deliveredAt', delivered_at
          ) AS record
          FROM ops.consumer_notification_outbox
          ORDER BY created_at DESC
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
      dispatchAttempts: dispatchAttemptsResult.rows.map((row) =>
        this.parseRecord<DispatchAttemptRecord>(
          row.record,
          "ops.phase1_dispatch_attempts",
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
      passengerDisclosureSnapshots: passengerDisclosureSnapshotsResult.rows.map(
        (row) =>
          this.parseRecord<PassengerDispatchDisclosureSnapshot>(
            row.record,
            "ops.passenger_dispatch_disclosure_snapshots",
          ),
      ),
      consumerNotificationOutbox: consumerNotificationOutboxResult.rows.map(
        (row) =>
          this.parseRecord<ConsumerNotificationOutboxRecord>(
            row.record,
            "ops.consumer_notification_outbox",
          ),
      ),
    };
  }

  async persistChanges(changes: PersistOwnedMobilityChanges) {
    if (!this.isEnabled()) {
      return;
    }

    await this.persistChangesWithExecutor(this.databaseService!, changes);
  }

  async withTransaction<T>(work: (executor: PoolClient) => Promise<T>) {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.warn(
          `Owned-mobility transaction rollback failed: ${
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError)
          }`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async persistOrderWorkflow(
    executor: OwnedMobilityQueryExecutor,
    changes: PersistOwnedMobilityChanges,
  ) {
    await this.persistChangesWithExecutor(executor, changes);
  }

  async isActiveMultiTaxiAuthorizedVehicle(
    executor: OwnedMobilityQueryExecutor,
    authorizationId: string,
    vehicleId: string,
  ) {
    const result = await executor.query<{ allowed: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM reg.multi_taxi_authorized_vehicles
          WHERE authorization_id = $1
            AND vehicle_id = $2
            AND status = 'active'
            AND effective_from <= now()
            AND (effective_until IS NULL OR effective_until > now())
        ) AS allowed
      `,
      [authorizationId, vehicleId],
    );
    return result.rows[0]?.allowed === true;
  }

  async getOrInitializeDriverRatingSummary(
    executor: OwnedMobilityQueryExecutor,
    driverId: string,
    calculatedAt: string,
  ): Promise<DriverRatingSummary> {
    const result = await executor.query<DriverRatingSummaryRow>(
      `
        INSERT INTO ops.driver_rating_summaries (
          driver_id,
          display_state,
          average_rating,
          rating_count,
          last_rated_at,
          aggregate_version,
          calculated_at
        ) VALUES ($1, 'new_driver', NULL, 0, NULL, 1, $2)
        ON CONFLICT (driver_id) DO UPDATE SET
          driver_id = EXCLUDED.driver_id
        RETURNING *
      `,
      [driverId, calculatedAt],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Driver rating authority unavailable for ${driverId}`);
    }
    return {
      driverId: row.driver_id,
      displayState: row.display_state,
      averageRating:
        row.average_rating === null ? null : Number(row.average_rating),
      ratingCount: row.rating_count,
      lastRatedAt: row.last_rated_at
        ? new Date(row.last_rated_at).toISOString()
        : null,
      aggregateVersion: row.aggregate_version,
      calculatedAt: new Date(row.calculated_at).toISOString(),
    };
  }

  async loadDriverTaskCompletionBundleForUpdate(
    executor: OwnedMobilityQueryExecutor,
    taskId: string,
  ): Promise<DriverTaskCompletionBundleRecord | null> {
    const taskResult = await executor.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_driver_tasks
        WHERE task_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [taskId],
    );
    const taskRow = taskResult.rows[0];
    if (!taskRow) {
      return null;
    }
    const task = this.parseRecord<DriverTaskRecord>(
      taskRow.record,
      "ops.phase1_driver_tasks",
    );

    const assignmentResult = await executor.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_dispatch_assignments
        WHERE assignment_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [task.assignmentId],
    );
    const assignmentRow = assignmentResult.rows[0];
    if (!assignmentRow) {
      throw new Error(
        `Dispatch assignment ${task.assignmentId} missing for driver task ${taskId}.`,
      );
    }
    const assignment = this.parseRecord<DispatchAssignmentRecord>(
      assignmentRow.record,
      "ops.phase1_dispatch_assignments",
    );

    const orderResult = await executor.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_owned_orders
        WHERE order_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [task.orderId],
    );
    const orderRow = orderResult.rows[0];
    if (!orderRow) {
      throw new Error(
        `Owned order ${task.orderId} missing for driver task ${taskId}.`,
      );
    }
    const order = this.parseRecord<OwnedOrderRecord>(
      orderRow.record,
      "ops.phase1_owned_orders",
    );

    return { order, assignment, task };
  }

  async hasDriverTaskTraceRequestId(
    executor: OwnedMobilityQueryExecutor,
    orderId: string,
    taskId: string,
    eventType: string,
    requestId: string,
  ) {
    const result = await executor.query<{ matched: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM ops.phase1_dispatch_trace_logs
          WHERE order_id = $1
            AND event_type = $2
            AND record -> 'details' ->> 'taskId' = $3
            AND record -> 'details' ->> 'requestId' = $4
        ) AS matched
      `,
      [orderId, eventType, taskId, requestId],
    );
    return result.rows[0]?.matched === true;
  }

  async persistDriverCompletionOutbox(
    executor: OwnedMobilityQueryExecutor,
    entries: readonly DriverCompletionOutboxRecord[],
  ) {
    await Promise.all(
      entries.map((entry) =>
        executor.query(
          `
            INSERT INTO ops.driver_completion_outbox (
              outbox_id,
              task_id,
              order_id,
              effect_type,
              request_id,
              payload,
              status,
              attempt_count,
              next_attempt_at,
              lease_token,
              leased_until,
              last_error,
              created_at,
              delivered_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14
            )
            ON CONFLICT (task_id, effect_type) DO NOTHING
          `,
          [
            entry.outboxId,
            entry.taskId,
            entry.orderId,
            entry.effectType,
            entry.requestId,
            JSON.stringify(entry.payload),
            entry.status,
            entry.attemptCount,
            entry.nextAttemptAt,
            entry.leaseToken,
            entry.leasedUntil,
            entry.lastError,
            entry.createdAt,
            entry.deliveredAt,
          ],
        ),
      ),
    );
  }

  async claimNextDriverCompletionOutbox(
    executor: OwnedMobilityQueryExecutor,
    taskId: string,
    leaseToken: string,
    leasedUntil: string,
    now: string,
    maxAttempts: number,
  ): Promise<DriverCompletionOutboxRecord | null> {
    const result = await executor.query<DriverCompletionOutboxRow>(
      `
        WITH candidate AS (
          SELECT outbox_id
          FROM ops.driver_completion_outbox
          WHERE task_id = $1
            AND delivered_at IS NULL
            AND status IN ('pending', 'processing')
            AND attempt_count < $5
            AND next_attempt_at <= $4::timestamptz
            AND (
              lease_token IS NULL
              OR leased_until IS NULL
              OR leased_until <= $4::timestamptz
            )
          ORDER BY next_attempt_at ASC, created_at ASC, outbox_id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ops.driver_completion_outbox AS outbox
        SET
          status = 'processing',
          attempt_count = outbox.attempt_count + 1,
          lease_token = $2::uuid,
          leased_until = $3::timestamptz
        FROM candidate
        WHERE outbox.outbox_id = candidate.outbox_id
        RETURNING
          outbox_id,
          task_id,
          order_id,
          effect_type,
          request_id,
          payload,
          status,
          attempt_count,
          next_attempt_at,
          lease_token,
          leased_until,
          last_error,
          created_at,
          delivered_at
      `,
      [taskId, leaseToken, leasedUntil, now, maxAttempts],
    );
    const row = result.rows[0];
    return row ? this.mapDriverCompletionOutbox(row) : null;
  }

  async claimNextRecoverableDriverCompletionOutbox(
    executor: OwnedMobilityQueryExecutor,
    leaseToken: string,
    leasedUntil: string,
    now: string,
    maxAttempts: number,
  ): Promise<DriverCompletionOutboxRecord | null> {
    const result = await executor.query<DriverCompletionOutboxRow>(
      `
        WITH candidate AS (
          SELECT outbox_id
          FROM ops.driver_completion_outbox
          WHERE delivered_at IS NULL
            AND status IN ('pending', 'processing')
            AND attempt_count < $4
            AND next_attempt_at <= $3::timestamptz
            AND (
              lease_token IS NULL
              OR leased_until IS NULL
              OR leased_until <= $3::timestamptz
            )
          ORDER BY next_attempt_at ASC, created_at ASC, task_id ASC, outbox_id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ops.driver_completion_outbox AS outbox
        SET
          status = 'processing',
          attempt_count = outbox.attempt_count + 1,
          lease_token = $1::uuid,
          leased_until = $2::timestamptz
        FROM candidate
        WHERE outbox.outbox_id = candidate.outbox_id
        RETURNING
          outbox_id,
          task_id,
          order_id,
          effect_type,
          request_id,
          payload,
          status,
          attempt_count,
          next_attempt_at,
          lease_token,
          leased_until,
          last_error,
          created_at,
          delivered_at
      `,
      [leaseToken, leasedUntil, now, maxAttempts],
    );
    const row = result.rows[0];
    return row ? this.mapDriverCompletionOutbox(row) : null;
  }

  async markDriverCompletionOutboxDelivered(
    executor: OwnedMobilityQueryExecutor,
    outboxId: string,
    leaseToken: string,
    deliveredAt: string,
  ) {
    await executor.query(
      `
        UPDATE ops.driver_completion_outbox
        SET
          status = 'delivered',
          delivered_at = $3::timestamptz,
          lease_token = NULL,
          leased_until = NULL,
          last_error = NULL
        WHERE outbox_id = $1
          AND lease_token = $2::uuid
      `,
      [outboxId, leaseToken, deliveredAt],
    );
  }

  async releaseDriverCompletionOutbox(
    executor: OwnedMobilityQueryExecutor,
    outboxId: string,
    leaseToken: string,
    nextAttemptAt: string,
    maxAttempts: number,
    lastError: string,
  ) {
    await executor.query(
      `
        UPDATE ops.driver_completion_outbox
        SET
          status = CASE
            WHEN attempt_count >= $4 THEN 'dead_letter'
            ELSE 'pending'
          END,
          next_attempt_at = CASE
            WHEN attempt_count >= $4 THEN next_attempt_at
            ELSE $3::timestamptz
          END,
          lease_token = NULL,
          leased_until = NULL,
          last_error = left($5, 2000)
        WHERE outbox_id = $1
          AND lease_token = $2::uuid
      `,
      [outboxId, leaseToken, nextAttemptAt, maxAttempts, lastError],
    );
  }

  private async persistChangesWithExecutor(
    executor: OwnedMobilityQueryExecutor,
    changes: PersistOwnedMobilityChanges,
  ) {
    const writes: Promise<unknown>[] = [];

    for (const order of changes.orders ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO ops.phase1_owned_orders (
              order_id,
              order_no,
              status,
              order_source,
              service_bucket,
              dispatch_semantics,
              runtime_profile_code,
              service_product_code,
              acquisition_mode,
              timing_mode,
              operating_authorization_id,
              queue_mode,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15::jsonb
            )
            ON CONFLICT (order_id) DO UPDATE SET
              order_no = EXCLUDED.order_no,
              status = EXCLUDED.status,
              order_source = EXCLUDED.order_source,
              service_bucket = EXCLUDED.service_bucket,
              dispatch_semantics = EXCLUDED.dispatch_semantics,
              runtime_profile_code = EXCLUDED.runtime_profile_code,
              service_product_code = EXCLUDED.service_product_code,
              acquisition_mode = EXCLUDED.acquisition_mode,
              timing_mode = EXCLUDED.timing_mode,
              operating_authorization_id = EXCLUDED.operating_authorization_id,
              queue_mode = EXCLUDED.queue_mode,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            order.orderId,
            order.orderNo,
            order.status,
            order.orderSource,
            order.serviceBucket,
            order.dispatchSemantics,
            order.runtimeProfileCode ?? null,
            order.serviceProductCode ?? null,
            order.acquisitionMode ?? null,
            order.timingMode ?? null,
            order.operatingAuthorizationId ?? null,
            order.queueMode ?? null,
            order.createdAt,
            order.updatedAt,
            JSON.stringify(order),
          ],
        ),
      );
    }

    for (const job of changes.dispatchJobs ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO ops.phase1_dispatch_jobs (
              dispatch_job_id,
              order_id,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6::jsonb
            )
            ON CONFLICT (dispatch_job_id) DO UPDATE SET
              order_id = EXCLUDED.order_id,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            job.dispatchJobId,
            job.orderId,
            job.status,
            job.createdAt,
            job.updatedAt,
            JSON.stringify(job),
          ],
        ),
      );
    }

    for (const attempt of changes.dispatchAttempts ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO ops.phase1_dispatch_attempts (
              attempt_id,
              dispatch_job_id,
              order_id,
              sequence,
              outcome,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            ON CONFLICT (attempt_id) DO UPDATE SET
              dispatch_job_id = EXCLUDED.dispatch_job_id,
              order_id = EXCLUDED.order_id,
              sequence = EXCLUDED.sequence,
              outcome = EXCLUDED.outcome,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            attempt.attemptId,
            attempt.dispatchJobId,
            attempt.orderId,
            attempt.sequence,
            attempt.outcome,
            attempt.createdAt,
            JSON.stringify(attempt),
          ],
        ),
      );
    }

    for (const assignment of changes.dispatchAssignments ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO ops.phase1_dispatch_assignments (
              assignment_id,
              dispatch_job_id,
              order_id,
              task_id,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb
            )
            ON CONFLICT (assignment_id) DO UPDATE SET
              dispatch_job_id = EXCLUDED.dispatch_job_id,
              order_id = EXCLUDED.order_id,
              task_id = EXCLUDED.task_id,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            assignment.assignmentId,
            assignment.dispatchJobId,
            assignment.orderId,
            assignment.taskId,
            assignment.status,
            assignment.createdAt,
            assignment.updatedAt,
            JSON.stringify(assignment),
          ],
        ),
      );
    }

    for (const task of changes.driverTasks ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO ops.phase1_driver_tasks (
              task_id,
              order_id,
              dispatch_job_id,
              assignment_id,
              status,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb
            )
            ON CONFLICT (task_id) DO UPDATE SET
              order_id = EXCLUDED.order_id,
              dispatch_job_id = EXCLUDED.dispatch_job_id,
              assignment_id = EXCLUDED.assignment_id,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              record = EXCLUDED.record
          `,
          [
            task.taskId,
            task.orderId,
            task.dispatchJobId,
            task.assignmentId,
            task.status,
            this.resolveTaskCreatedAt(task),
            this.resolveTaskUpdatedAt(task),
            JSON.stringify(task),
          ],
        ),
      );
    }

    for (const traceLog of changes.dispatchTraceLogs ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO ops.phase1_dispatch_trace_logs (
              trace_id,
              order_id,
              event_type,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5::jsonb
            )
            ON CONFLICT (trace_id) DO UPDATE SET
              order_id = EXCLUDED.order_id,
              event_type = EXCLUDED.event_type,
              created_at = EXCLUDED.created_at,
              record = EXCLUDED.record
          `,
          [
            traceLog.traceId,
            traceLog.orderId,
            traceLog.eventType,
            traceLog.createdAt,
            JSON.stringify(traceLog),
          ],
        ),
      );
    }

    for (const snapshot of changes.passengerDisclosureSnapshots ?? []) {
      writes.push(
        executor.query(
          `
            WITH superseded AS (
              UPDATE ops.passenger_dispatch_disclosure_snapshots
              SET
                superseded_at = $7,
                record = jsonb_set(
                  record,
                  '{supersededAt}',
                  to_jsonb($7::text),
                  true
                )
              WHERE order_id = $2
                AND superseded_at IS NULL
                AND assignment_version < $5
            )
            INSERT INTO ops.passenger_dispatch_disclosure_snapshots (
              snapshot_id,
              order_id,
              dispatch_job_id,
              assignment_id,
              assignment_version,
              record,
              created_at,
              superseded_at
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
            ON CONFLICT (assignment_id, assignment_version) DO NOTHING
          `,
          [
            snapshot.snapshotId,
            snapshot.orderId,
            snapshot.dispatchJobId,
            snapshot.assignmentId,
            snapshot.assignmentVersion,
            JSON.stringify(snapshot),
            snapshot.createdAt,
            snapshot.supersededAt,
          ],
        ),
      );
    }

    for (const outbox of changes.consumerNotificationOutbox ?? []) {
      writes.push(
        executor.query(
          `
            INSERT INTO ops.consumer_notification_outbox (
              outbox_id,
              order_id,
              passenger_subject_ref,
              event_type,
              assignment_version,
              payload,
              status,
              attempt_count,
              next_attempt_at,
              created_at,
              delivered_at
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
            ON CONFLICT (outbox_id) DO NOTHING
          `,
          [
            outbox.outboxId,
            outbox.orderId,
            outbox.passengerSubjectRef,
            outbox.eventType,
            outbox.assignmentVersion,
            JSON.stringify(outbox.payload),
            outbox.status,
            outbox.attemptCount,
            outbox.nextAttemptAt,
            outbox.createdAt,
            outbox.deliveredAt,
          ],
        ),
      );
    }

    await Promise.all(writes);
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Owned mobility persistence skipped during ${context}: ${detail}`,
    );
  }

  private resolveTaskCreatedAt(task: DriverTaskRecord) {
    return (
      task.acceptedAt ??
      task.departedAt ??
      task.arrivedPickupAt ??
      task.startedAt ??
      task.completedAt ??
      new Date().toISOString()
    );
  }

  private resolveTaskUpdatedAt(task: DriverTaskRecord) {
    return (
      task.completedAt ??
      task.startedAt ??
      task.arrivedPickupAt ??
      task.departedAt ??
      task.acceptedAt ??
      this.resolveTaskCreatedAt(task)
    );
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }

  private mapDriverCompletionOutbox(
    row: DriverCompletionOutboxRow,
  ): DriverCompletionOutboxRecord {
    return {
      outboxId: row.outbox_id,
      taskId: row.task_id,
      orderId: row.order_id,
      effectType: row.effect_type,
      requestId: row.request_id,
      payload: this.parseRecord<Record<string, unknown>>(
        row.payload,
        "ops.driver_completion_outbox.payload",
      ),
      status: row.status,
      attemptCount: row.attempt_count,
      nextAttemptAt: new Date(row.next_attempt_at).toISOString(),
      leaseToken: row.lease_token,
      leasedUntil: row.leased_until
        ? new Date(row.leased_until).toISOString()
        : null,
      lastError: row.last_error,
      createdAt: new Date(row.created_at).toISOString(),
      deliveredAt: row.delivered_at
        ? new Date(row.delivered_at).toISOString()
        : null,
    };
  }
}
