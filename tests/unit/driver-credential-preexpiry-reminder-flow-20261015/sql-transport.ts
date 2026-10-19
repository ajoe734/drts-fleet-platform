import { ExpirySqlTransport } from "../registry-expiry-backlog-intent-recovery-20261015/sql-transport";

export function gate<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
/** The accepted transport owns original staged transactions/row locks. Only
 * external SQL rows/faults are controlled; Registry selection/identity/lifecycle
 * and notification decisions remain production code. This is not real PG. */
export class ReminderSqlTransport extends ExpirySqlTransport {
  commitGate: ReturnType<typeof gate<void>> | undefined;
  commitEntered: ReturnType<typeof gate<void>> | undefined;
  rejectCommit = false;
  loseCommitAck = false;
  rejectLinks = 0;
  override async connect() {
    const client = await super.connect();
    let reminderWrite = false;
    return {
      release: client.release,
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: readonly unknown[] = [],
      ) => {
        if (
          sql.includes("INSERT INTO reg.phase1_registry_expiry_events") &&
          String(values[4]).startsWith("preexpiry:")
        )
          reminderWrite = true;
        if (
          sql.includes("UPDATE reg.phase1_registry_expiry_delivery_intents") &&
          values[1] &&
          this.rejectLinks > 0
        ) {
          this.rejectLinks--;
          throw Object.assign(new Error("SIM receipt link rejected"), {
            code: "40001",
          });
        }
        if (sql === "COMMIT" && reminderWrite) {
          this.commitEntered?.resolve();
          if (this.commitGate) await this.commitGate.promise;
          if (this.rejectCommit) {
            this.rejectCommit = false;
            throw Object.assign(
              new Error("SIM commit rejected before application"),
              { code: "40001" },
            );
          }
          const result = await client.query<T>(sql, values);
          if (this.loseCommitAck) {
            this.loseCommitAck = false;
            throw Object.assign(new Error("SIM commit applied, ACK lost"), {
              code: "ECONNRESET",
            });
          }
          return result;
        }
        return client.query<T>(sql, values);
      },
    };
  }
  override query<T extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ) {
    let rows: unknown[] | undefined;
    if (sql.includes("/* preexpiry-source */")) {
      // Intentionally overinclusive: production must recheck every source date
      // under its real transaction lock, including outside-window/expired rows.
      rows = [...this.drivers.values()]
        .filter(
          (d) =>
            (values[2] == null || d.driverId > String(values[2])) &&
            (values[3] == null || d.driverId <= String(values[3])),
        )
        .sort((a, b) =>
          a.driverId < b.driverId ? -1 : a.driverId > b.driverId ? 1 : 0,
        )
        .slice(0, Number(values[1]))
        .map((record) => ({ record: structuredClone(record) }));
    } else if (
      /SELECT record\s+FROM reg\.phase1_registry_drivers\s+ORDER BY/.test(sql)
    ) {
      rows = [...this.drivers.values()].map((record) => ({
        record: structuredClone(record),
      }));
    } else if (
      /SELECT record\s+FROM reg\.phase1_registry_(vehicles|supply_pairs|contracts|policies|exclusivities)\s+ORDER BY/.test(
        sql,
      ) ||
      /SELECT vehicle_id, license_class\s+FROM reg\.vehicles/.test(sql) ||
      /SELECT \*\s+FROM reg\.(vehicle_passenger_disclosure_profiles|driver_public_registration_credentials)\s+ORDER BY/.test(
        sql,
      ) ||
      sql.includes("FROM ops.phase1_driver_locations") ||
      (sql.includes("INSERT INTO reg.driver_public_registration_credentials") &&
        sql.includes("FROM reg.drivers")) ||
      sql.includes("UPDATE fleet.supply_submissions s")
    ) {
      // Unrelated startup bootstrap/read I/O, explicitly no rows in this fixture.
      rows = [];
    }
    if (rows) {
      this.calls.push({ sql, values, tx: 0 });
      return Promise.resolve({ rows: structuredClone(rows) as T[] });
    }
    return super.query<T>(sql, values);
  }
}
