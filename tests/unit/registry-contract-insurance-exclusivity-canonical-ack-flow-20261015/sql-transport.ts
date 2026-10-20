import type { RegulatoryRegistryState } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
export function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
/** Socketfree SQL transport SIM: stores actual repository JSON rows, stages
 * transactions and holds row locks. No lifecycle/eligibility decisions here. */
export class CommandSqlTransport {
  enabled = false;
  tables = new Map<string, Map<string, unknown>>();
  queries: { sql: string; values: readonly unknown[]; client: number }[] = [];
  writeGate: ReturnType<typeof gate> | undefined;
  writeEntered = gate();
  failWriteTable: string | undefined;
  rejectCommit = false;
  commitRejectCode = "40001";
  failBegin = false;
  failRollback = false;
  failRelease = false;
  loseCommitAck = false;
  failRead = false;
  failReadAfterLostAck = false;
  lockQueued = gate();
  private clients = 0;
  private locks = new Map<string, Promise<void>>();
  isEnabled() {
    return this.enabled;
  }
  seed(
    state: Pick<
      RegulatoryRegistryState,
      | "vehicles"
      | "drivers"
      | "contracts"
      | "policies"
      | "exclusivities"
      | "supplyPairs"
    >,
  ) {
    for (const [name, records] of Object.entries(state)) {
      const rows = new Map<string, unknown>();
      for (const record of records) {
        const r = record as unknown as Record<string, unknown>;
        const id =
          name === "supplyPairs"
            ? `${r.vehicleId}:${r.driverId}`
            : r[
                (
                  {
                    vehicles: "vehicleId",
                    drivers: "driverId",
                    contracts: "contractId",
                    policies: "policyId",
                    exclusivities: "vehicleId",
                  } as Record<string, string>
                )[name]!
              ];
        rows.set(String(id), structuredClone(record));
      }
      this.tables.set(
        `reg.phase1_registry_${name === "supplyPairs" ? "supply_pairs" : name}`,
        rows,
      );
    }
  }
  records<T>(table: string): T[] {
    return [
      ...(this.tables.get(`reg.phase1_registry_${table}`)?.values() ?? []),
    ].map((r) => structuredClone(r) as T);
  }
  query<T extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ) {
    return this.execute<T>(sql, values, 0);
  }
  async connect() {
    const id = ++this.clients;
    let writes = new Map<string, Map<string, unknown>>();
    const unlocks: (() => void)[] = [];
    return {
      release: () => {
        for (const unlock of unlocks.splice(0)) unlock();
        if (this.failRelease) {
          this.failRelease = false;
          throw new Error("SIM release failed");
        }
      },
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values: readonly unknown[] = [],
      ) => {
        this.queries.push({ sql, values, client: id });
        if (sql === "BEGIN") {
          if (this.failBegin) {
            this.failBegin = false;
            throw new Error("SIM BEGIN failed");
          }
          return { rows: [] as T[] };
        }
        if (sql === "ROLLBACK") {
          writes.clear();
          if (this.failRollback) {
            this.failRollback = false;
            throw new Error("SIM ROLLBACK failed");
          }
          return { rows: [] as T[] };
        }
        if (sql === "COMMIT") {
          if (this.rejectCommit) {
            this.rejectCommit = false;
            throw Object.assign(new Error("SIM COMMIT rejected"), {
              code: this.commitRejectCode,
            });
          }
          for (const [table, rows] of writes) {
            const target = this.tables.get(table) ?? new Map<string, unknown>();
            for (const [key, record] of rows)
              target.set(key, structuredClone(record));
            this.tables.set(table, target);
          }
          writes = new Map();
          if (this.loseCommitAck) {
            this.loseCommitAck = false;
            this.failRead = this.failReadAfterLostAck;
            throw new Error("SIM COMMIT applied, ACK lost");
          }
          return { rows: [] as T[] };
        }
        if (
          /FOR UPDATE/.test(sql) &&
          sql.includes("phase1_registry_vehicles")
        ) {
          const key = String(values[0]);
          const prior = this.locks.get(key) ?? Promise.resolve();
          const next = gate();
          if (this.locks.has(key)) this.lockQueued.resolve();
          this.locks.set(
            key,
            prior.then(() => next.promise),
          );
          await prior;
          unlocks.push(next.resolve);
        }
        return this.execute<T>(sql, values, id, writes);
      },
    };
  }
  private async execute<T extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[],
    client: number,
    writes?: Map<string, Map<string, unknown>>,
  ): Promise<{ rows: T[] }> {
    if (!client) this.queries.push({ sql, values, client });
    const match = sql.match(/(?:FROM|INTO)\s+(reg\.[a-z_0-9]+)/i);
    const table = match?.[1];
    if (
      /INSERT INTO/.test(sql) &&
      table?.startsWith("reg.phase1_registry_") &&
      values.length
    ) {
      this.writeEntered.resolve();
      if (this.writeGate) await this.writeGate.promise;
      if (this.failWriteTable === table)
        throw new Error(`SIM write rejected ${table}`);
      const record = JSON.parse(String(values[values.length - 1]));
      const target = writes ?? this.tables;
      const rows = target.get(table) ?? new Map<string, unknown>();
      rows.set(String(values[0]), record);
      target.set(table, rows);
      return { rows: [] };
    }
    if (/SELECT/.test(sql)) {
      if (this.failRead) throw new Error("SIM canonical read unavailable");
      if (!table) return { rows: [] };
      const merged = new Map(this.tables.get(table));
      for (const [key, value] of writes?.get(table) ?? [])
        merged.set(key, value);
      let records = [...merged.values()] as Record<string, unknown>[];
      const key = sql.match(
        /WHERE\s+(vehicle_id|contract_id|policy_id|driver_id)\s*=\s*\$1/i,
      )?.[1];
      if (key)
        records = records.filter(
          (r) =>
            r[
              (
                {
                  vehicle_id: "vehicleId",
                  contract_id: "contractId",
                  policy_id: "policyId",
                  driver_id: "driverId",
                } as Record<string, string>
              )[key]!
            ] === values[0],
        );
      return {
        rows: records.map(
          (record) => ({ record: structuredClone(record) }) as unknown as T,
        ),
      };
    }
    return { rows: [] };
  }
}
