type Row = Record<string, unknown>;
type Result = { rows: unknown[]; rowCount: number };
type Runner = (
  sql: string,
  values: readonly unknown[],
  target: Map<string, Row>,
) => Promise<Result>;

/** Controlled PG transaction/storage semantics only. Production repository
 * executes its complete statements; no report calculation is replaced. */
export function transactionalMonthlyPort(
  monthly: Map<string, Row>,
  runQuery: Runner,
) {
  const events: string[] = [];
  const faults = { connect: false, delete: false, insertAt: 0, commit: false };
  const holds: { afterDelete?: () => Promise<void> } = {};
  let tail = Promise.resolve();
  let serial = 0;
  async function connect() {
    if (faults.connect)
      throw new Error("controlled reporting connection unavailable");
    const id = ++serial;
    events.push(`${id}:connect`);
    let target: Map<string, Row> | undefined;
    let unlock: (() => void) | undefined;
    let inserts = 0;
    let released = false;
    const releaseLock = () => {
      unlock?.();
      unlock = undefined;
    };
    return {
      async query(
        sql: string,
        values: readonly unknown[] = [],
      ): Promise<Result> {
        if (released) throw new Error("Query after controlled client release");
        if (sql === "BEGIN") {
          events.push(`${id}:begin`);
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("pg_advisory_xact_lock")) {
          const prior = tail;
          tail = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          await prior;
          target = new Map(
            [...monthly].map(([key, row]) => [key, structuredClone(row)]),
          );
          events.push(`${id}:writer-turn`);
          return { rows: [], rowCount: 0 };
        }
        if (sql === "ROLLBACK") {
          events.push(`${id}:rollback`);
          target = undefined;
          releaseLock();
          return { rows: [], rowCount: 0 };
        }
        if (sql === "COMMIT") {
          events.push(`${id}:commit`);
          if (faults.commit)
            throw new Error("controlled reporting commit failure");
          if (!target)
            throw new Error("Missing complete controlled transaction");
          monthly.clear();
          for (const [key, row] of target)
            monthly.set(key, structuredClone(row));
          target = undefined;
          releaseLock();
          return { rows: [], rowCount: 0 };
        }
        if (!target)
          throw new Error("Derived report write outside writer transaction");
        if (
          sql.startsWith("DELETE FROM reporting.monthly_operations_summaries")
        ) {
          events.push(`${id}:delete`);
          if (faults.delete)
            throw new Error("controlled reporting delete failure");
          const periods = values[0];
          if (!Array.isArray(periods))
            throw new Error("Actual normalized monthly period array required");
          const filters = [
            ...sql.matchAll(/(business_area|service_product_code) = \$(\d+)/g),
          ];
          let removed = 0;
          for (const [key, row] of target)
            if (
              periods.includes(row.period_month) &&
              filters.every(
                ([, field, position]) =>
                  row[field!] === values[Number(position) - 1],
              )
            ) {
              target.delete(key);
              removed++;
            }
          await holds.afterDelete?.();
          return { rows: [], rowCount: removed };
        }
        if (
          sql.includes("INSERT INTO reporting.monthly_operations_summaries")
        ) {
          events.push(`${id}:insert`);
          inserts++;
          if (faults.insertAt === inserts)
            throw new Error("controlled reporting insert failure");
        }
        return runQuery(sql, values, target);
      },
      release() {
        if (!released) {
          released = true;
          events.push(`${id}:release`);
          releaseLock();
        }
      },
    };
  }
  return { connect, events, faults, holds };
}
