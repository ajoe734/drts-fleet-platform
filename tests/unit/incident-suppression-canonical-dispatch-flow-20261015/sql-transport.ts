import { randomUUID } from "node:crypto";
import type { QueryResult, QueryResultRow } from "pg";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import type {
  IncidentRecord,
  IncidentTimelineEntry,
  DriverMatchingSuppression,
} from "../../../packages/contracts/src";
const copy = <T>(v: T): T => structuredClone(v);
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
type RawRow = Record<string, unknown>;
/** External SQL transport SIM only: the actual repositories own every SQL,
 * payload, transaction and eligibility decision. Models row-lock ownership,
 * committed visibility and injected transport rejection without opening PG. */
export class SqlTransport {
  rows = {
    incidents: new Map<string, IncidentRecord>(),
    timelines: new Map<string, IncidentTimelineEntry>(),
    suppressions: new Map<
      string,
      { driverId: string; suppression: DriverMatchingSuppression }
    >(),
    raw: new Map<string, RawRow[]>(),
  };
  tables = new Map<string, unknown[]>();
  calls: { text: string; values: readonly unknown[]; connection: number }[] =
    [];
  gate: ReturnType<typeof deferred> | null = null;
  entered = deferred();
  commitEntered = deferred();
  lockRequested = deferred();
  reject = false;
  rejectIncident = false;
  failTimeline = false;
  failRead = false;
  connections = 0;
  private locks = new Map<
    string,
    { owner: number; done: ReturnType<typeof deferred> }
  >();
  isEnabled() {
    return true;
  }
  get heldLocks() {
    return this.locks.size;
  }
  async query<T extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.execute<T>(this.rows, text, values, 0);
  }
  private insert(text: string, values: readonly unknown[]) {
    const match =
      /INSERT INTO ([\w.]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i.exec(text);
    if (!match) return null;
    const cols = match[2]!.split(",").map((v) => v.trim()),
      args = match[3]!.split(",").map((v) => v.trim());
    const row: RawRow = {};
    cols.forEach((col, i) => {
      const token = args[i] ?? "";
      const parameter = /\$(\d+)/.exec(token);
      let value = parameter
        ? copy(values[Number(parameter[1]) - 1])
        : token.replace(/^'|'$/g, "");
      if (token.includes("::jsonb") && typeof value === "string")
        value = JSON.parse(value);
      row[col] = value;
    });
    return { table: match[1]!, cols, row };
  }
  async execute<T extends QueryResultRow>(
    rows: typeof this.rows,
    text: string,
    values: readonly unknown[],
    connection: number,
  ): Promise<QueryResult<T>> {
    this.calls.push({ text, values: copy(values), connection });
    let records: unknown[] = [];
    if (text.includes("UPDATE crm.phase1_complaint_pending_commits")) {
      for (const row of rows.raw.get("crm.phase1_complaint_pending_commits") ??
        [])
        if (row.command_key === values[0]) row.status = "confirmed";
    }
    if (text.includes("DELETE FROM crm.phase1_complaint_pending_commits"))
      rows.raw.set(
        "crm.phase1_complaint_pending_commits",
        (rows.raw.get("crm.phase1_complaint_pending_commits") ?? []).filter(
          (r) =>
            !(
              r.command_key === values[0] &&
              (!values[1] ||
                JSON.stringify(r.timeline_snapshot) ===
                  JSON.stringify(JSON.parse(String(values[1])))) &&
              (!values[2] || r.status === values[2])
            ),
        ),
      );
    const inserted = this.insert(text, values);
    if (inserted) {
      const { table, cols, row } = inserted;
      if (table === "ops.phase1_incidents") {
        this.entered.resolve();
        if (!connection) await this.gate?.promise;
        if (this.reject && !connection) throw new Error("SIM rejected write");
        const record = row.record as IncidentRecord;
        rows.incidents.set(record.incidentId, copy(record));
        records = [{ record }];
      } else if (table === "ops.phase1_incident_timelines") {
        if (this.failTimeline) throw new Error("SIM rejected timeline");
        const record = row.record as IncidentTimelineEntry;
        rows.timelines.set(record.entryId, copy(record));
      } else if (table === "ops.phase1_driver_matching_suppressions")
        rows.suppressions.set(String(row.source_incident_id), {
          driverId: String(row.driver_id),
          suppression: copy(row.record as DriverMatchingSuppression),
        });
      else {
        const stored = rows.raw.get(table) ?? [];
        const index = stored.findIndex((r) => r[cols[0]!] === row[cols[0]!]);
        if (index >= 0) {
          if (table !== "crm.phase1_complaint_pending_commits")
            stored[index] = row;
        } else stored.push(row);
        rows.raw.set(table, stored);
        if (table === "crm.phase1_complaint_pending_commits")
          records = [copy(stored[index >= 0 ? index : stored.length - 1])];
        if (table === "ops.dispatch_resource_reservations") {
          Object.assign(row, {
            reservation_id: randomUUID(),
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          records = [copy(row)];
        }
      }
    } else if (
      text.includes("SELECT") &&
      text.includes("ops.phase1_driver_matching_suppressions")
    ) {
      if (this.failRead)
        throw new Error("SIM suppression authority unavailable");
      records = [...rows.suppressions.values()]
        .filter(
          (e) => !text.includes("driver_id = $1") || e.driverId === values[0],
        )
        .map((e) => ({ record: copy(e.suppression), driver_id: e.driverId }));
    } else if (
      text.includes("SELECT") &&
      text.includes("ops.phase1_incident_timelines")
    )
      records = [...rows.timelines.values()]
        .filter((e) => !values.length || e.incidentId === values[0])
        .map((record) => ({ record: copy(record) }));
    else if (text.includes("SELECT") && text.includes("ops.phase1_incidents"))
      records = [...rows.incidents.values()]
        .filter((e) => !values.length || e.incidentId === values[0])
        .map((record) => ({ record: copy(record) }));
    else if (text.includes("SELECT record = $2::jsonb AS matches_prepared")) {
      const current = (rows.raw.get("crm.phase1_complaint_cases") ?? []).find(
        (r) => r.case_no === values[0],
      );
      records = current
        ? [
            {
              matches_prepared:
                JSON.stringify(current.record) ===
                JSON.stringify(
                  values[1] ? JSON.parse(String(values[1])) : null,
                ),
            },
          ]
        : [];
    } else if (text.includes("WITH settlement_cases")) {
      records = [];
    } else if (
      text.includes("SELECT kind, record FROM (") &&
      text.includes("crm.phase1_complaint_cases")
    ) {
      records = [
        ...(rows.raw.get("crm.phase1_complaint_cases") ?? [])
          .filter((r) => r.case_no === values[0])
          .map((r) => ({ kind: "case", record: copy(r.record) })),
        ...(rows.raw.get("crm.phase1_complaint_timelines") ?? [])
          .filter((r) => r.case_no === values[0])
          .map((r) => ({ kind: "timeline", record: copy(r.record) })),
      ];
    } else if (text.includes("SELECT")) {
      const table = /FROM\s+([\w.]+)/i.exec(text)?.[1];
      if (table) {
        let stored =
          rows.raw.get(table) ??
          (this.tables.get(table) ?? []).map((record) => ({
            record: copy(record),
          }));
        if (
          table === "safety.driver_sos_events" &&
          text.includes("client_event_id = $2")
        )
          stored = stored.filter(
            (r) => r.driver_id === values[0] && r.client_event_id === values[1],
          );
        else if (table.startsWith("safety.") && values.length)
          stored = stored.filter((r) => r.sos_event_id === values[0]);
        else if (text.includes("WHERE command_key = $1"))
          stored = stored.filter((r) => r.command_key === values[0]);
        else if (text.includes("WHERE case_no = $1"))
          stored = stored.filter((r) => r.case_no === values[0]);
        else if (text.includes("WHERE order_id = $1"))
          stored = stored.filter(
            (r) =>
              (r.record as { orderId?: string } | undefined)?.orderId ===
              values[0],
          );
        if (text.includes("SELECT count(*)"))
          records = [{ count: String(stored.length) }];
        else if (text.includes("SELECT dispatch_job_id"))
          records = stored.map((r) => ({
            dispatch_job_id: (r.record as { dispatchJobId: string })
              .dispatchJobId,
          }));
        else if (text.includes("SELECT assignment_id"))
          records = stored.map((r) => ({
            assignment_id: (r.record as { assignmentId: string }).assignmentId,
          }));
        else
          records = stored.map((r) => ({
            ...copy(r),
            ...(table === "ops.phase1_owned_orders"
              ? { aggregate_version: 1 }
              : {}),
          }));
      }
    }
    return {
      rows: records as T[],
      rowCount: records.length,
      command: "SIM",
      oid: 0,
      fields: [],
    };
  }
  private releaseLocks(id: number) {
    for (const [key, lock] of this.locks)
      if (lock.owner === id) {
        this.locks.delete(key);
        lock.done.resolve();
      }
  }
  async connect() {
    const id = ++this.connections;
    let base = copy(this.rows),
      pending = copy(this.rows);
    return {
      query: async <T extends QueryResultRow>(
        text: string,
        values: readonly unknown[] = [],
      ): Promise<QueryResult<T>> => {
        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) {
          this.calls.push({ text, values: [], connection: id });
          if (text === "COMMIT") {
            this.entered.resolve();
            this.commitEntered.resolve();
            await this.gate?.promise;
            if (
              this.reject ||
              (this.rejectIncident &&
                JSON.stringify([...pending.incidents]) !==
                  JSON.stringify([...base.incidents]))
            )
              throw new Error("SIM rejected COMMIT");
            for (const key of [
              "incidents",
              "timelines",
              "suppressions",
              "raw",
            ] as const) {
              for (const [k, value] of pending[key] as Map<string, unknown>) {
                if (
                  JSON.stringify(value) !==
                  JSON.stringify((base[key] as Map<string, unknown>).get(k))
                )
                  (this.rows[key] as Map<string, unknown>).set(k, copy(value));
              }
            }
            this.releaseLocks(id);
          }
          if (text === "ROLLBACK") {
            pending = copy(this.rows);
            this.releaseLocks(id);
          }
          return { rows: [], rowCount: 0, command: text, oid: 0, fields: [] };
        }
        if (
          text.includes("reg.phase1_registry_drivers") &&
          text.includes("FOR UPDATE")
        ) {
          this.lockRequested.resolve();
          const key = String(values[0]);
          while (this.locks.has(key) && this.locks.get(key)!.owner !== id)
            await this.locks.get(key)!.done.promise;
          if (!this.locks.has(key)) {
            this.locks.set(key, { owner: id, done: deferred() });
            base = copy(this.rows);
            pending = copy(this.rows);
          }
        }
        return this.execute<T>(pending, text, values, id);
      },
      release: () => {
        if ([...this.locks.values()].some((l) => l.owner === id))
          throw new Error("SIM client released with unclosed row lock");
      },
    };
  }
  database() {
    return this as unknown as DatabaseService;
  }
}
