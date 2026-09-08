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

/**
 * Thrown when a compare-and-swap write against `ops.phase1_owned_orders`
 * does not match the caller's `expectedVersion` (SD §7.5: "voice aggregate
 * 以 DB row 與單調 aggregateVersion 為權威"). Covers both a genuinely stale
 * snapshot (someone else committed in between) and the order simply not
 * existing -- callers that need to tell those apart should re-read the row.
 */
export class OwnedOrderVersionConflictError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly expectedVersion: number,
  ) {
    super(
      `Owned order ${orderId} was not at expected aggregate version ${expectedVersion} (stale snapshot or missing row).`,
    );
    this.name = "OwnedOrderVersionConflictError";
  }
}

/**
 * Thrown when creating a voice-linked order collides with an existing
 * `voice_intent_id` or `call_id` (SD §7.2/§7.5 unique constraints on
 * `ops.phase1_owned_orders`). Distinguishes "another writer already handled
 * this exact intent/call" from a generic DB error.
 */
export class OwnedOrderDuplicateVoiceLinkError extends Error {
  constructor(
    public readonly orderId: string,
    cause: unknown,
  ) {
    super(
      `Owned order ${orderId} conflicts with an existing voice_intent_id or call_id.`,
    );
    this.name = "OwnedOrderDuplicateVoiceLinkError";
    this.cause = cause;
  }
}

export type DriverCompletionOutboxEffectType =
  | "tenant_order_completed_webhook"
  | "owned_mobility_trip_completed"
  | "multi_taxi_certificate"
  | "completion_audit_bundle"
  | "driver_task_updated"
  | "ops_dispatch_job_updated";

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

export type DriverCompletionOutboxClaimResult =
  | { action: "dispatch"; record: DriverCompletionOutboxRecord }
  | { action: "dead_letter"; record: DriverCompletionOutboxRecord };

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
  dispatchJob: DispatchJobRecord;
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
      // SD §7.1/§7.5: "transaction 內無網路或長運算...DB transaction 設
      // lock／statement deadline". Every owned-mobility transaction only ever
      // does row locks and short reads/writes against Postgres itself, so a
      // stuck lock or a runaway statement is always a bug, never expected
      // load -- fail fast instead of holding row locks indefinitely.
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '8s'");
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

  /**
   * Locks and returns the current authoritative row for CAS-protected order
   * mutations (SD §7.1 fixed lock order: "...→ order" is the last lock taken
   * before commit). Must be called inside a transaction opened by
   * `withTransaction`; the `FOR UPDATE` lock is held until that transaction
   * commits or rolls back.
   */
  async findOrderForUpdate(
    executor: OwnedMobilityQueryExecutor,
    orderId: string,
  ): Promise<{ order: OwnedOrderRecord; aggregateVersion: number } | null> {
    const result = await executor.query<
      JsonRecordRow & { aggregate_version: number }
    >(
      `
        SELECT record, aggregate_version
        FROM ops.phase1_owned_orders
        WHERE order_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [orderId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const order = this.parseRecord<OwnedOrderRecord>(
      row.record,
      "ops.phase1_owned_orders",
    );
    return {
      order: { ...order, aggregateVersion: row.aggregate_version },
      aggregateVersion: row.aggregate_version,
    };
  }

  /**
   * Inserts a brand-new order row for the pure-prepare voice command path.
   * Unlike `persistOrderWorkflow`'s blind `ON CONFLICT ... DO UPDATE` upsert
   * (used by legacy fire-and-forget writers), this never overwrites an
   * existing `order_id` -- a collision there, or on the partial unique
   * `voice_intent_id`/`call_id` indexes from V0088, means another writer
   * already handled this exact intent and this call must not clobber it.
   */
  async insertVoiceOrder(
    executor: OwnedMobilityQueryExecutor,
    order: OwnedOrderRecord,
  ): Promise<number> {
    const record = { ...order, aggregateVersion: order.aggregateVersion ?? 1 };
    try {
      const result = await executor.query<{ aggregate_version: number }>(
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
          ON CONFLICT (order_id) DO NOTHING
          RETURNING aggregate_version
        `,
        [
          record.orderId,
          record.orderNo,
          record.status,
          record.orderSource,
          record.serviceBucket,
          record.dispatchSemantics,
          record.runtimeProfileCode ?? null,
          record.serviceProductCode ?? null,
          record.acquisitionMode ?? null,
          record.timingMode ?? null,
          record.operatingAuthorizationId ?? null,
          record.queueMode ?? null,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new OwnedOrderVersionConflictError(record.orderId, 0);
      }
      return row.aggregate_version;
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new OwnedOrderDuplicateVoiceLinkError(record.orderId, error);
      }
      throw error;
    }
  }

  /**
   * Compare-and-swap update of an existing order row. Fails closed
   * (`OwnedOrderVersionConflictError`) when `expectedVersion` no longer
   * matches the stored `aggregate_version` -- either the row does not exist
   * or someone else committed a newer snapshot first (SD §7.5: two instances
   * writing the same stale snapshot must have one of them rejected). Callers
   * must have obtained `expectedVersion` from `findOrderForUpdate` in the
   * same transaction so the row lock and the version check agree.
   */
  async updateOrderWithCas(
    executor: OwnedMobilityQueryExecutor,
    order: OwnedOrderRecord,
    expectedVersion: number,
  ): Promise<number> {
    const record = {
      ...order,
      aggregateVersion: expectedVersion + 1,
    };
    const result = await executor.query<{ aggregate_version: number }>(
      `
        UPDATE ops.phase1_owned_orders SET
          order_no = $2,
          status = $3,
          order_source = $4,
          service_bucket = $5,
          dispatch_semantics = $6,
          runtime_profile_code = $7,
          service_product_code = $8,
          acquisition_mode = $9,
          timing_mode = $10,
          operating_authorization_id = $11,
          queue_mode = $12,
          updated_at = $13,
          record = $14::jsonb
        WHERE order_id = $1
          AND aggregate_version = $15
        RETURNING aggregate_version
      `,
      [
        record.orderId,
        record.orderNo,
        record.status,
        record.orderSource,
        record.serviceBucket,
        record.dispatchSemantics,
        record.runtimeProfileCode ?? null,
        record.serviceProductCode ?? null,
        record.acquisitionMode ?? null,
        record.timingMode ?? null,
        record.operatingAuthorizationId ?? null,
        record.queueMode ?? null,
        record.updatedAt,
        JSON.stringify(record),
        expectedVersion,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new OwnedOrderVersionConflictError(record.orderId, expectedVersion);
    }
    return row.aggregate_version;
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

    const dispatchJobResult = await executor.query<JsonRecordRow>(
      `
        SELECT record
        FROM ops.phase1_dispatch_jobs
        WHERE dispatch_job_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [assignment.dispatchJobId],
    );
    const dispatchJobRow = dispatchJobResult.rows[0];
    if (!dispatchJobRow) {
      throw new Error(
        `Dispatch job ${assignment.dispatchJobId} missing for driver task ${taskId}.`,
      );
    }
    const dispatchJob = this.parseRecord<DispatchJobRecord>(
      dispatchJobRow.record,
      "ops.phase1_dispatch_jobs",
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

    return { order, dispatchJob, assignment, task };
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
    for (const entry of entries) {
      await executor.query(
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
      );
    }
  }

  async claimNextRecoverableDriverCompletionOutbox(
    executor: OwnedMobilityQueryExecutor,
    leaseToken: string,
    leasedUntil: string,
    now: string,
    maxAttempts: number,
  ): Promise<DriverCompletionOutboxClaimResult | null> {
    const result = await executor.query<DriverCompletionOutboxRow>(
      `
        WITH candidate AS (
          SELECT outbox_id
          FROM ops.driver_completion_outbox
          WHERE delivered_at IS NULL
            AND status IN ('pending', 'processing')
            AND next_attempt_at <= $3::timestamptz
            AND (
              lease_token IS NULL
              OR leased_until IS NULL
              OR leased_until <= $3::timestamptz
            )
            AND (
              (status = 'pending' AND attempt_count < $4)
              OR status = 'processing'
            )
          ORDER BY next_attempt_at ASC, created_at ASC, task_id ASC, outbox_id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ops.driver_completion_outbox AS outbox
        SET
          status = CASE
            WHEN outbox.attempt_count >= $4 THEN 'dead_letter'
            ELSE 'processing'
          END,
          attempt_count = CASE
            WHEN outbox.attempt_count >= $4 THEN outbox.attempt_count
            ELSE outbox.attempt_count + 1
          END,
          lease_token = CASE
            WHEN outbox.attempt_count >= $4 THEN NULL
            ELSE $1::uuid
          END,
          leased_until = CASE
            WHEN outbox.attempt_count >= $4 THEN NULL
            ELSE $2::timestamptz
          END,
          last_error = CASE
            WHEN outbox.attempt_count >= $4 THEN
              left(
                COALESCE(
                  outbox.last_error,
                  'Lease expired after the final delivery attempt before acknowledgement.'
                ),
                2000
              )
            ELSE outbox.last_error
          END
        FROM candidate
        WHERE outbox.outbox_id = candidate.outbox_id
        RETURNING
          outbox.outbox_id,
          outbox.task_id,
          outbox.order_id,
          outbox.effect_type,
          outbox.request_id,
          outbox.payload,
          outbox.status,
          outbox.attempt_count,
          outbox.next_attempt_at,
          outbox.lease_token,
          outbox.leased_until,
          outbox.last_error,
          outbox.created_at,
          outbox.delivered_at
      `,
      [leaseToken, leasedUntil, now, maxAttempts],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      action: row.status === "dead_letter" ? "dead_letter" : "dispatch",
      record: this.mapDriverCompletionOutbox(row),
    };
  }

  async markDriverCompletionOutboxDelivered(
    executor: OwnedMobilityQueryExecutor,
    outboxId: string,
    leaseToken: string,
    deliveredAt: string,
  ) {
    const result = await executor.query(
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
    return (result.rowCount ?? 0) > 0;
  }

  async releaseDriverCompletionOutbox(
    executor: OwnedMobilityQueryExecutor,
    outboxId: string,
    leaseToken: string,
    nextAttemptAt: string,
    maxAttempts: number,
    lastError: string,
  ) {
    const result = await executor.query(
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
    return (result.rowCount ?? 0) > 0;
  }

  private async persistChangesWithExecutor(
    executor: OwnedMobilityQueryExecutor,
    changes: PersistOwnedMobilityChanges,
  ) {
    const writes: Array<() => Promise<unknown>> = [];

    for (const order of changes.orders ?? []) {
      writes.push(() =>
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
      writes.push(() =>
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
      writes.push(() =>
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
      writes.push(() =>
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
      writes.push(() =>
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
      writes.push(() =>
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
      writes.push(() =>
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
      writes.push(() =>
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

    for (const write of writes) {
      await write();
    }
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
