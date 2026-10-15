import { vi } from "vitest";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";

// SQL boundary double only: stores the JSON passed by the production repository.
// No schema/SQL/business rules are reimplemented; PostgreSQL checks are hosted.
export function persistenceHarness() {
  let records = new Map<string, Map<string, unknown>>();
  let transaction: typeof records | undefined;
  let insertCount = 0;
  let rejectInsert: number | undefined;
  let loseCommitAck = false;
  let beforeCommit: (() => Promise<void>) | undefined;
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    if (sql === "BEGIN") {
      transaction = structuredClone(records);
      insertCount = 0;
    }
    if (sql === "ROLLBACK") transaction = undefined;
    if (sql === "COMMIT") {
      await beforeCommit?.();
      records = transaction!;
      transaction = undefined;
      if (loseCommitAck) {
        loseCommitAck = false;
        throw new Error("COMMIT ACK lost");
      }
    }
    const table = /(?:INSERT INTO|FROM)\s+([\w.]+)/.exec(sql)?.[1];
    if (table && sql.includes("INSERT INTO")) {
      if (++insertCount === rejectInsert) {
        rejectInsert = undefined;
        throw new Error("SQL rejected");
      }
      const record = JSON.parse(values.at(-1) as string) as Record<
        string,
        unknown
      >;
      const state = transaction ?? records;
      const rows = state.get(table) ?? new Map<string, unknown>();
      // First SQL parameter is the repository's row key. Quota uses a composite.
      const key = table.endsWith("quota_policies")
        ? JSON.stringify(values.slice(0, 3))
        : String(values[0]);
      rows.set(key, record);
      state.set(table, rows);
    }
    return {
      rows:
        table && sql.includes("SELECT")
          ? [...(records.get(table)?.values() ?? [])].map((record) => ({
              record: structuredClone(record),
            }))
          : [],
      rowCount: 0,
    };
  });
  const client = { query, release: vi.fn() };
  const repository = new TenantPartnerRepository({
    isEnabled: () => true,
    query,
    connect: async () => client,
  } as never);
  return {
    repository,
    query,
    failInsert: (n: number) => {
      rejectInsert = n;
    },
    loseCommitAck: () => {
      loseCommitAck = true;
    },
    holdCommit: (gate?: () => Promise<void>) => {
      beforeCommit = gate;
    },
  };
}
