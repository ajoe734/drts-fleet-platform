import { Injectable, Logger, Optional } from "@nestjs/common";

import type {
  DispatchAssignmentRecord,
  DispatchAttemptRecord,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type OwnedMobilityState = {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  dispatchAttempts: DispatchAttemptRecord[];
  dispatchAssignments: DispatchAssignmentRecord[];
  driverTasks: DriverTaskRecord[];
  dispatchTraceLogs: DispatchTraceLogRecord[];
};

type PersistOwnedMobilityChanges = {
  orders?: readonly OwnedOrderRecord[];
  dispatchJobs?: readonly DispatchJobRecord[];
  dispatchAttempts?: readonly DispatchAttemptRecord[];
  dispatchAssignments?: readonly DispatchAssignmentRecord[];
  driverTasks?: readonly DriverTaskRecord[];
  dispatchTraceLogs?: readonly DispatchTraceLogRecord[];
};

@Injectable()
export class OwnedMobilityRepository {
  private readonly logger = new Logger(OwnedMobilityRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
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
      };
    }

    const [
      ordersResult,
      dispatchJobsResult,
      dispatchAttemptsResult,
      dispatchAssignmentsResult,
      driverTasksResult,
      dispatchTraceLogsResult,
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
    };
  }

  async persistChanges(changes: PersistOwnedMobilityChanges) {
    if (!this.isEnabled()) {
      return;
    }

    const writes: Promise<unknown>[] = [];

    for (const order of changes.orders ?? []) {
      writes.push(
        this.databaseService!.query(
          `
            INSERT INTO ops.phase1_owned_orders (
              order_id,
              order_no,
              status,
              order_source,
              service_bucket,
              dispatch_semantics,
              created_at,
              updated_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
            )
            ON CONFLICT (order_id) DO UPDATE SET
              order_no = EXCLUDED.order_no,
              status = EXCLUDED.status,
              order_source = EXCLUDED.order_source,
              service_bucket = EXCLUDED.service_bucket,
              dispatch_semantics = EXCLUDED.dispatch_semantics,
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
            order.createdAt,
            order.updatedAt,
            JSON.stringify(order),
          ],
        ),
      );
    }

    for (const job of changes.dispatchJobs ?? []) {
      writes.push(
        this.databaseService!.query(
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
        this.databaseService!.query(
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
        this.databaseService!.query(
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
        this.databaseService!.query(
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
        this.databaseService!.query(
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
}
