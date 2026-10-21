import type { DatabaseService } from "../../../apps/api/src/common/db";

type Row = Record<string, unknown>;
type Tables = Map<string, Row[]>;
const copy = <T>(value: T): T => structuredClone(value);

/** Socket-free SQL transport, not a repository or grant-policy replacement.
 * Seed records must come from actual invitation/OIDC repository production.
 * Unknown SQL fails. COMMIT/ROLLBACK operate on client-local staged rows. */
export class ControlledIdentityStorage {
  private tables: Tables = new Map();
  readonly calls: string[] = [];
  private transactionActive = false;
  fault: "grant-write" | "required-audit" | null = null;
  seed(table: string, records: object[]) {
    this.tables.set(
      table,
      records.map((record) => {
        const columns = Object.fromEntries(
          Object.entries(record).map(([key, value]) => [
            key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
            value,
          ]),
        );
        return { ...columns, record: copy(record) };
      }),
    );
  }
  readonly database = {
    isEnabled: () => true,
    query: async (sql: string, values: readonly unknown[] = []) => {
      if (this.transactionActive)
        throw new Error("transaction escaped to pool query");
      return this.execute(this.tables, sql, values);
    },
    connect: async () => {
      if (this.transactionActive)
        throw new Error("second lease during existing governance transaction");
      let transaction: Tables | null = null;
      let released = false;
      return {
        query: async (sql: string, values: readonly unknown[] = []) => {
          if (released) throw new Error("released controlled client");
          if (sql === "BEGIN") {
            this.calls.push(sql);
            transaction = copy(this.tables);
            this.transactionActive = true;
            return { rows: [] };
          }
          if (sql === "COMMIT") {
            this.calls.push(sql);
            if (!transaction) throw new Error("no transaction");
            this.tables = transaction;
            transaction = null;
            this.transactionActive = false;
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            this.calls.push(sql);
            transaction = null;
            this.transactionActive = false;
            return { rows: [] };
          }
          return this.execute(transaction ?? this.tables, sql, values);
        },
        release: () => {
          if (transaction)
            throw new Error("release with unfinished transaction");
          released = true;
        },
      };
    },
  } as unknown as DatabaseService;

  private execute(tables: Tables, sql: string, values: readonly unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.calls.push(normalized);
    if (normalized.startsWith("SELECT pg_advisory_xact_lock"))
      return { rows: [] };
    const insert = /INSERT INTO ([\w.]+)\s*\(([^)]+)\)/.exec(normalized);
    if (insert) {
      const table = insert[1]!;
      if (
        table === "iam.privileged_role_grants" &&
        this.fault === "grant-write"
      )
        throw new Error("SIM_STORAGE_GRANT_WRITE_REJECTED");
      if (table === "admin.security_events") {
        if (
          this.fault === "required-audit" &&
          values[2] === "privileged_role.approved"
        )
          throw new Error("SIM_REQUIRED_AUDIT_REJECTED");
        const rows = tables.get(table) ?? [];
        rows.push({ values: copy(values) });
        tables.set(table, rows);
        return { rows: [] };
      }
      const columns = insert[2]!.split(",").map((c) => c.trim());
      const row = Object.fromEntries(
        columns.map((column, index) => [
          column,
          ["record", "device_summary", "risk_summary"].includes(column)
            ? (JSON.parse(values[index] as string) as unknown)
            : values[index],
        ]),
      );
      const rows = tables.get(table) ?? [];
      const index = rows.findIndex(
        (existing) => existing[columns[0]!] === row[columns[0]!],
      );
      if (index < 0) rows.push(row);
      else rows[index] = row;
      tables.set(table, rows);
      return { rows: [copy(row)] };
    }
    if (normalized.startsWith("UPDATE iam.identity_sessions")) {
      const rows = tables.get("iam.identity_sessions") ?? [];
      const affected = rows.filter(
        (row) =>
          (row.principal_id === values[0] ||
            (row.record as Row).actorId === values[0]) &&
          row.status === "active",
      );
      for (const row of affected) {
        Object.assign(row, {
          status: "revoked",
          revoked_at: values[1],
          revoked_by_principal_id: values[2],
          revoke_reason: values[3],
          updated_at: values[1],
        });
        Object.assign(row.record as Row, {
          status: "revoked",
          revokedAt: values[1],
          revokedByPrincipalId: values[2],
          revokeReason: values[3],
          updatedAt: values[1],
        });
      }
      return { rows: affected.map((row) => ({ session_id: row.session_id })) };
    }
    if (normalized.startsWith("UPDATE iam.identity_refresh_families")) {
      const ids = values[0] as string[];
      for (const row of tables.get("iam.identity_refresh_families") ?? []) {
        if (ids.includes(row.session_id as string) && row.status === "active") {
          row.status = "revoked";
          Object.assign(row.record as Row, {
            status: "revoked",
            updatedAt: values[1],
          });
        }
      }
      return { rows: [] };
    }
    const select = /SELECT (?:\*|record) FROM ([\w.]+) WHERE (.+)/.exec(
      normalized,
    );
    if (select) {
      const table = select[1]!;
      let rows = tables.get(table) ?? [];
      if (select[2]!.startsWith("($1::text IS NULL OR tenant_id = $1::text)"))
        rows = rows.filter(
          (row) => values[0] == null || row.tenant_id === values[0],
        );
      else {
        const key = /^(\w+) = \$1/.exec(select[2]!);
        if (!key) throw new Error(`Unhandled controlled WHERE: ${normalized}`);
        rows = rows.filter((row) => row[key[1]!] === values[0]);
      }
      return { rows: copy(rows) };
    }
    throw new Error(`Unhandled controlled SQL: ${normalized}`);
  }
}
