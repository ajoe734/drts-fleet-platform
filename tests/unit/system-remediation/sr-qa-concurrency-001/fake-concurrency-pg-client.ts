import { randomUUID } from "node:crypto";
import type { QueryResult, QueryResultRow } from "pg";

export type FakeRow = Record<string, unknown>;

export interface PgQueryError extends Error {
  code: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

export function createPgError(
  code: string,
  message: string,
  options: { table?: string; constraint?: string; detail?: string } = {},
): PgQueryError {
  const err = new Error(message) as PgQueryError;
  err.code = code;
  err.table = options.table;
  err.constraint = options.constraint;
  err.detail = options.detail;
  return err;
}

export class FakeConcurrencyPgClient {
  readonly tables = new Map<string, FakeRow[]>();
  private activeTransaction = false;
  private transactionSnapshots: Map<string, FakeRow[]> | null = null;
  private lockedKeys = new Set<string>();

  getTable(name: string): FakeRow[] {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = [];
      this.tables.set(name, rows);
    }
    return rows;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    const trimmed = sql.trim();

    // Transaction controls
    if (/^BEGIN\b/i.test(trimmed)) {
      this.activeTransaction = true;
      this.transactionSnapshots = new Map();
      for (const [tbl, rows] of this.tables.entries()) {
        this.transactionSnapshots.set(
          tbl,
          rows.map((r) => ({ ...r })),
        );
      }
      return this.makeResult<T>([]);
    }

    if (/^COMMIT\b/i.test(trimmed)) {
      this.activeTransaction = false;
      this.transactionSnapshots = null;
      this.lockedKeys.clear();
      return this.makeResult<T>([]);
    }

    if (/^ROLLBACK\b/i.test(trimmed)) {
      if (this.transactionSnapshots) {
        this.tables.clear();
        for (const [tbl, rows] of this.transactionSnapshots.entries()) {
          this.tables.set(tbl, rows);
        }
      }
      this.activeTransaction = false;
      this.transactionSnapshots = null;
      this.lockedKeys.clear();
      return this.makeResult<T>([]);
    }

    // SELECT queries
    if (/^SELECT\b/i.test(trimmed)) {
      return this.handleSelect<T>(trimmed, params);
    }

    // INSERT queries
    if (/^INSERT\s+INTO\b/i.test(trimmed)) {
      return this.handleInsert<T>(trimmed, params);
    }

    // UPDATE queries
    if (/^UPDATE\b/i.test(trimmed)) {
      return this.handleUpdate<T>(trimmed, params);
    }

    // DELETE queries
    if (/^DELETE\s+FROM\b/i.test(trimmed)) {
      return this.handleDelete<T>(trimmed, params);
    }

    throw new Error(`FakeConcurrencyPgClient: unsupported query:\n${trimmed}`);
  }

  private handleSelect<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[],
  ): QueryResult<T> {
    // 1. ops.idempotency_records
    if (sql.includes("ops.idempotency_records")) {
      const scope = params[0] as string;
      const key = params[1] as string;
      const rows = this.getTable("ops.idempotency_records").filter(
        (r) => r.scope === scope && r.idempotency_key === key,
      );
      return this.makeResult<T>(rows as unknown as T[]);
    }

    // 2. ops.dispatch_resource_reservations
    if (sql.includes("ops.dispatch_resource_reservations")) {
      let rows = this.getTable("ops.dispatch_resource_reservations");
      if (sql.includes("WHERE assignment_id = $1")) {
        const assignmentId = params[0] as string;
        rows = rows.filter((r) => r.assignment_id === assignmentId);
      } else if (sql.includes("WHERE order_id = $1")) {
        const orderId = params[0] as string;
        rows = rows.filter((r) => r.order_id === orderId);
      }
      return this.makeResult<T>(rows as unknown as T[]);
    }

    // 3. ops.phase1_dispatch_assignments FOR UPDATE
    if (sql.includes("ops.phase1_dispatch_assignments")) {
      const assignmentId = params[0] as string;
      const rows = this.getTable("ops.phase1_dispatch_assignments").filter(
        (r) => r.assignment_id === assignmentId,
      );
      if (sql.includes("FOR UPDATE")) {
        this.lockedKeys.add(`assignment:${assignmentId}`);
      }
      return this.makeResult<T>(rows as unknown as T[]);
    }

    // 4. ops.phase1_driver_tasks FOR UPDATE
    if (sql.includes("ops.phase1_driver_tasks")) {
      const taskId = params[0] as string;
      const rows = this.getTable("ops.phase1_driver_tasks").filter(
        (r) => r.task_id === taskId,
      );
      if (sql.includes("FOR UPDATE")) {
        this.lockedKeys.add(`task:${taskId}`);
      }
      return this.makeResult<T>(rows as unknown as T[]);
    }

    return this.makeResult<T>([]);
  }

  private handleInsert<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[],
  ): QueryResult<T> {
    // 1. ops.idempotency_records (with ON CONFLICT DO NOTHING)
    if (sql.includes("ops.idempotency_records")) {
      const scope = params[0] as string;
      const idempotencyKey = params[1] as string;
      const tenantId = (params[2] as string | null) ?? null;
      const actorId = (params[3] as string | null) ?? null;
      const requestPath = (params[4] as string | null) ?? null;
      const payloadHash = params[5] as string;

      const table = this.getTable("ops.idempotency_records");
      const existing = table.find(
        (r) => r.scope === scope && r.idempotency_key === idempotencyKey,
      );

      if (existing) {
        if (sql.includes("ON CONFLICT")) {
          // DO NOTHING returns 0 rows
          return this.makeResult<T>([]);
        }
        throw createPgError(
          "23505",
          "duplicate key value violates unique constraint",
          {
            table: "ops.idempotency_records",
            constraint: "uq_idempotency_scope_key",
          },
        );
      }

      const now = new Date().toISOString();
      const newRow: FakeRow = {
        record_id: randomUUID(),
        scope,
        idempotency_key: idempotencyKey,
        tenant_id: tenantId,
        actor_id: actorId,
        request_path: requestPath,
        payload_hash: payloadHash,
        status: "processing",
        status_code: null,
        response_body: null,
        action_receipt: null,
        error_message: null,
        created_at: now,
        updated_at: now,
        expires_at: null,
      };

      table.push(newRow);
      return this.makeResult<T>([newRow as unknown as T]);
    }

    // 2. ops.dispatch_resource_reservations
    if (sql.includes("ops.dispatch_resource_reservations")) {
      const resourceType = params[0] as string;
      const resourceId = params[1] as string;
      const orderId = params[2] as string;
      const assignmentId = (params[3] as string | null) ?? null;
      const reservationGroupId = params[4] as string;
      const expiresAt = (params[5] as string | null) ?? null;

      const table = this.getTable("ops.dispatch_resource_reservations");

      // Unique partial index check:
      // (resource_type, resource_id) WHERE status IN ('held', 'occupied')
      const activeCollision = table.find(
        (r) =>
          r.resource_type === resourceType &&
          r.resource_id === resourceId &&
          (r.status === "held" || r.status === "occupied"),
      );

      if (activeCollision) {
        throw createPgError(
          "23505",
          `duplicate key value violates unique constraint "uq_dispatch_resource_active" (resource_type=${resourceType}, resource_id=${resourceId})`,
          {
            table: "ops.dispatch_resource_reservations",
            constraint: "uq_dispatch_resource_active",
            detail: `Key (resource_type, resource_id)=(${resourceType}, ${resourceId}) already exists.`,
          },
        );
      }

      const now = new Date().toISOString();
      const newRow: FakeRow = {
        reservation_id: `res-${randomUUID()}`,
        resource_type: resourceType,
        resource_id: resourceId,
        order_id: orderId,
        assignment_id: assignmentId,
        reservation_group_id: reservationGroupId,
        status: "held",
        expires_at: expiresAt,
        version: 1,
        created_at: now,
        updated_at: now,
      };

      table.push(newRow);
      return this.makeResult<T>([newRow as unknown as T]);
    }

    // 3. ops.phase1_dispatch_assignments
    if (sql.includes("ops.phase1_dispatch_assignments")) {
      const assignmentId = params[0] as string;
      const orderId = params[1] as string;
      const record = params[2];
      const table = this.getTable("ops.phase1_dispatch_assignments");
      const newRow: FakeRow = {
        assignment_id: assignmentId,
        order_id: orderId,
        record: typeof record === "string" ? JSON.parse(record) : record,
        created_at: new Date().toISOString(),
      };
      table.push(newRow);
      return this.makeResult<T>([newRow as unknown as T]);
    }

    throw new Error(
      `FakeConcurrencyPgClient: unsupported INSERT statement:\n${sql}`,
    );
  }

  private handleUpdate<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[],
  ): QueryResult<T> {
    // 1. ops.idempotency_records complete:
    // WHERE scope = $1 AND idempotency_key = $2
    if (
      sql.includes("ops.idempotency_records") &&
      sql.includes("status = 'completed'")
    ) {
      const scope = params[0] as string;
      const key = params[1] as string;
      const statusCode = params[2] as number;
      const responseBody = params[3]
        ? typeof params[3] === "string"
          ? JSON.parse(params[3])
          : params[3]
        : null;
      const actionReceipt = params[4]
        ? typeof params[4] === "string"
          ? JSON.parse(params[4])
          : params[4]
        : null;

      const table = this.getTable("ops.idempotency_records");
      const row = table.find(
        (r) => r.scope === scope && r.idempotency_key === key,
      );
      if (!row) {
        return this.makeResult<T>([]);
      }

      row.status = "completed";
      row.status_code = statusCode;
      row.response_body = responseBody;
      row.action_receipt = actionReceipt;
      row.error_message = null;
      row.updated_at = new Date().toISOString();

      return this.makeResult<T>([row as unknown as T]);
    }

    // 2. ops.idempotency_records fail:
    if (
      sql.includes("ops.idempotency_records") &&
      sql.includes("status = 'failed'")
    ) {
      const scope = params[0] as string;
      const key = params[1] as string;
      const errorMessage = (params[2] as string | null) ?? null;

      const table = this.getTable("ops.idempotency_records");
      const row = table.find(
        (r) => r.scope === scope && r.idempotency_key === key,
      );
      if (row) {
        row.status = "failed";
        row.error_message = errorMessage;
        row.updated_at = new Date().toISOString();
      }
      return this.makeResult<T>(row ? [row as unknown as T] : []);
    }

    // 3. ops.dispatch_resource_reservations release
    if (
      sql.includes("ops.dispatch_resource_reservations") &&
      sql.includes("status = 'released'")
    ) {
      const assignmentId = params[0] as string;
      const table = this.getTable("ops.dispatch_resource_reservations");
      const updated: FakeRow[] = [];
      for (const row of table) {
        if (
          row.assignment_id === assignmentId &&
          (row.status === "held" || row.status === "occupied")
        ) {
          row.status = "released";
          row.version = Number(row.version ?? 1) + 1;
          row.updated_at = new Date().toISOString();
          updated.push(row);
        }
      }
      return this.makeResult<T>(updated as unknown as T[], updated.length);
    }

    // 4. ops.dispatch_resource_reservations occupy
    if (
      sql.includes("ops.dispatch_resource_reservations") &&
      sql.includes("status = 'occupied'")
    ) {
      const assignmentId = params[0] as string;
      const table = this.getTable("ops.dispatch_resource_reservations");
      const updated: FakeRow[] = [];
      for (const row of table) {
        if (row.assignment_id === assignmentId && row.status === "held") {
          row.status = "occupied";
          row.version = Number(row.version ?? 1) + 1;
          row.updated_at = new Date().toISOString();
          updated.push(row);
        }
      }
      return this.makeResult<T>(updated as unknown as T[], updated.length);
    }

    // 5. ops.phase1_dispatch_assignments update
    if (sql.includes("ops.phase1_dispatch_assignments")) {
      const assignmentId = params[0] as string;
      const record = params[1];
      const table = this.getTable("ops.phase1_dispatch_assignments");
      const row = table.find((r) => r.assignment_id === assignmentId);
      if (row) {
        row.record = typeof record === "string" ? JSON.parse(record) : record;
        row.updated_at = new Date().toISOString();
        return this.makeResult<T>([row as unknown as T]);
      }
      return this.makeResult<T>([]);
    }

    throw new Error(
      `FakeConcurrencyPgClient: unsupported UPDATE statement:\n${sql}`,
    );
  }

  private handleDelete<T extends QueryResultRow>(
    sql: string,
    params: readonly unknown[],
  ): QueryResult<T> {
    if (sql.includes("ops.idempotency_records")) {
      const scope = params[0] as string;
      const key = params[1] as string;
      const table = this.getTable("ops.idempotency_records");
      const index = table.findIndex(
        (r) => r.scope === scope && r.idempotency_key === key,
      );
      if (index !== -1) {
        table.splice(index, 1);
        return this.makeResult<T>([], 1);
      }
      return this.makeResult<T>([], 0);
    }

    throw new Error(
      `FakeConcurrencyPgClient: unsupported DELETE statement:\n${sql}`,
    );
  }

  private makeResult<T extends QueryResultRow>(
    rows: T[],
    rowCount = rows.length,
  ): QueryResult<T> {
    return {
      rows,
      command: "QUERY",
      rowCount,
      oid: 0,
      fields: [],
    };
  }
}

/**
 * Handle presenting a FakeConcurrencyPgClient as a DatabaseService
 */
export class FakeDatabaseServiceHandle {
  constructor(
    readonly client: FakeConcurrencyPgClient = new FakeConcurrencyPgClient(),
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    return this.client.query<T>(text, values);
  }

  async connect(): Promise<{
    query: (
      text: string,
      values?: readonly unknown[],
    ) => Promise<QueryResult<QueryResultRow>>;
    release: () => void;
  }> {
    return {
      query: (text: string, values?: readonly unknown[]) =>
        this.client.query(text, values),
      release: () => {},
    };
  }

  async withTransaction<T>(
    operation: (client: {
      query: (
        text: string,
        values?: readonly unknown[],
      ) => Promise<QueryResult<QueryResultRow>>;
    }) => Promise<T>,
  ): Promise<T> {
    await this.client.query("BEGIN");
    try {
      const result = await operation({
        query: (text, values) => this.client.query(text, values),
      });
      await this.client.query("COMMIT");
      return result;
    } catch (err) {
      await this.client.query("ROLLBACK");
      throw err;
    }
  }
}
