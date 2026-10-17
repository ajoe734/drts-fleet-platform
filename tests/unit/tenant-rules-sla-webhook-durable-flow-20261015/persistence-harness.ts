import { vi } from "vitest";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";

// SQL boundary double only: stores the JSON passed by the production repository.
// No schema/SQL/business rules are reimplemented; PostgreSQL checks are hosted.
export function persistenceHarness() {
  let records = new Map<string, Map<string, unknown>>();
  type Session = {
    transaction?: typeof records | undefined;
    insertCount: number;
  };
  let rejectInsert: number | undefined;
  let loseCommitAck = false;
  let rejectReadback = false;
  let beforeCommit: (() => Promise<void>) | undefined;
  const query = vi.fn(
    async (
      sql: string,
      values: readonly unknown[] = [],
      session: Session = { insertCount: 0 },
    ) => {
      if (rejectReadback && sql.includes("SELECT")) {
        throw new Error("canonical readback unavailable");
      }
      if (sql === "BEGIN") {
        session.transaction = structuredClone(records);
        session.insertCount = 0;
      }
      if (sql === "ROLLBACK") session.transaction = undefined;
      if (sql === "COMMIT") {
        await beforeCommit?.();
        records = session.transaction!;
        session.transaction = undefined;
        if (loseCommitAck) {
          loseCommitAck = false;
          throw new Error("COMMIT ACK lost");
        }
      }
      const table = /(?:INSERT INTO|FROM)\s+([\w.]+)/.exec(sql)?.[1];
      if (table && sql.includes("INSERT INTO")) {
        if (++session.insertCount === rejectInsert) {
          rejectInsert = undefined;
          throw new Error("SQL rejected");
        }
        const record = JSON.parse(values.at(-1) as string) as Record<
          string,
          unknown
        >;
        const state = session.transaction ?? records;
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
    },
  );
  const repository = new TenantPartnerRepository({
    isEnabled: () => true,
    query,
    connect: async () => {
      const session: Session = { insertCount: 0 };
      return {
        query: (sql: string, values?: readonly unknown[]) =>
          query(sql, values, session),
        release: vi.fn(),
      };
    },
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
    rejectReadbacks: (reject = true) => {
      rejectReadback = reject;
    },
    holdCommit: (gate?: () => Promise<void>) => {
      beforeCommit = gate;
    },
  };
}
