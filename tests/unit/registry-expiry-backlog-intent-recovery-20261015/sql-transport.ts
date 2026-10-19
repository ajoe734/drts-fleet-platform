import type {
  DriverRegistryRecord,
  InsurancePolicyRecord,
} from "../../../packages/contracts/src/index";
import type {
  RegistryExpiryEventRow,
  RegistryExpiryDeliveryIntentRow,
} from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";

type Row = Record<string, unknown>;
type Pending = {
  events: Map<string, RegistryExpiryEventRow>;
  intents: Map<string, RegistryExpiryDeliveryIntentRow>;
  release: Array<() => void>;
  id: number;
};
/** Controlled database transport, not an expiry/retry decision implementation.
 * Actual Repository SQL chooses predicates, transactions and locks. No socket/PG.
 */
export class ExpirySqlTransport {
  drivers = new Map<string, DriverRegistryRecord>();
  policies = new Map<string, InsurancePolicyRecord>();
  events = new Map<string, RegistryExpiryEventRow>();
  intents = new Map<string, RegistryExpiryDeliveryIntentRow>();
  calls: Array<{ sql: string; values: readonly unknown[]; tx: number }> = [];
  rejectIntentWrites = 0;
  private locks = new Map<string, Promise<void>>();
  private next = 0;
  isEnabled() {
    return true;
  }
  async connect() {
    const tx: Pending = {
      events: new Map(),
      intents: new Map(),
      release: [],
      id: ++this.next,
    };
    return {
      query: <T extends Row>(sql: string, values: readonly unknown[] = []) =>
        this.execute<T>(sql, values, tx),
      release: () => {},
    };
  }
  query<T extends Row>(sql: string, values: readonly unknown[] = []) {
    return this.execute<T>(sql, values);
  }
  private async acquire(key: string, tx: Pending) {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((done) => {
      release = done;
    });
    this.locks.set(
      key,
      previous.then(() => held),
    );
    await previous;
    tx.release.push(release);
  }
  private async execute<T extends Row>(
    sql: string,
    v: readonly unknown[],
    tx?: Pending,
  ): Promise<{ rows: T[] }> {
    this.calls.push({ sql, values: v, tx: tx?.id ?? 0 });
    const events = () => new Map([...this.events, ...(tx?.events ?? [])]);
    const intents = () => new Map([...this.intents, ...(tx?.intents ?? [])]);
    const putEvent = (e: RegistryExpiryEventRow) =>
      (tx?.events ?? this.events).set(e.event_id, structuredClone(e));
    const putIntent = (i: RegistryExpiryDeliveryIntentRow) =>
      (tx?.intents ?? this.intents).set(i.intent_id, structuredClone(i));
    const joined = (e: RegistryExpiryEventRow): Row => {
      const i = [...intents().values()].find((i) => i.event_id === e.event_id);
      return {
        ...e,
        intent_id: i?.intent_id ?? null,
        intent_scope: i?.scope,
        idempotency_key: i?.idempotency_key,
        tenant_id: i?.tenant_id,
        recipient_email: i?.recipient_email,
        from_email: i?.from_email,
        subject: i?.subject,
        body: i?.body,
        delivery_status: i?.delivery_status,
        outbox_delivery_id: i?.outbox_delivery_id,
        intent_last_error: i?.last_error,
        enqueued_at: i?.enqueued_at,
        intent_created_at: i?.created_at,
        intent_updated_at: i?.updated_at,
      };
    };
    const now = new Date().toISOString();
    let rows: unknown[] = [];
    if (/^BEGIN/.test(sql)) return { rows: [] };
    if (/^COMMIT|^ROLLBACK/.test(sql)) {
      if (/^COMMIT/.test(sql) && tx) {
        for (const e of tx.events.values()) this.events.set(e.event_id, e);
        for (const i of tx.intents.values()) this.intents.set(i.intent_id, i);
      }
      tx?.release.splice(0).forEach((r) => r());
      return { rows: [] };
    }
    if (sql.includes("MAX(driver_id)")) {
      rows = [
        {
          driver_id: [...this.drivers.keys()].sort().at(-1) ?? null,
          policy_id: [...this.policies.keys()].sort().at(-1) ?? null,
        },
      ];
    } else if (sql.includes("SELECT d.record") && sql.includes("LIMIT $2")) {
      rows = [...this.drivers.values()]
        .filter((d) =>
          [
            d.licenseExpiry,
            d.professionalDriverLicenseExpiry,
            d.taxiDriverRegistrationExpiry,
          ].some((s) => s && Date.parse(s) <= Date.parse(String(v[0]))),
        )
        .filter(
          (d) =>
            (v[2] == null || d.driverId > String(v[2])) &&
            (v[3] == null || d.driverId <= String(v[3])),
        )
        .sort((a, b) => a.driverId.localeCompare(b.driverId))
        .slice(0, Number(v[1]))
        .map((record) => ({ record }));
    } else if (
      sql.includes("FROM reg.phase1_registry_policies") &&
      sql.includes("LIMIT $2")
    ) {
      rows = [...this.policies.values()]
        .filter(
          (p) =>
            p.status !== "cancelled" &&
            Date.parse(p.startAt) <= Date.parse(String(v[0])) &&
            Date.parse(p.endAt) < Date.parse(String(v[0])),
        )
        .filter(
          (p) =>
            (v[2] == null || p.policyId > String(v[2])) &&
            (v[3] == null || p.policyId <= String(v[3])),
        )
        .sort((a, b) => a.policyId.localeCompare(b.policyId))
        .slice(0, Number(v[1]))
        .map((record) => ({ record }));
    } else if (sql.includes("SELECT record FROM reg.phase1_registry_drivers")) {
      if (tx && sql.includes("FOR UPDATE"))
        await this.acquire("driver:" + v[0], tx);
      const record = this.drivers.get(String(v[0]));
      rows = record ? [{ record }] : [];
    } else if (
      sql.includes("SELECT record FROM reg.phase1_registry_policies")
    ) {
      if (tx && sql.includes("FOR UPDATE"))
        await this.acquire("policy:" + v[0], tx);
      const record = this.policies.get(String(v[0]));
      rows = record ? [{ record }] : [];
    } else if (sql.includes("INSERT INTO reg.phase1_registry_drivers")) {
      this.drivers.set(String(v[0]), JSON.parse(String(v[5])));
    } else if (sql.includes("INSERT INTO reg.phase1_registry_expiry_events")) {
      const existing = [...events().values()].find(
        (e) => e.source_fingerprint === v[5],
      );
      const e: RegistryExpiryEventRow = existing ?? {
        event_id: String(v[0]),
        scope: String(v[1]),
        entity_type: v[2] as "driver" | "policy",
        entity_id: String(v[3]),
        credential_type: String(v[4]),
        source_fingerprint: String(v[5]),
        source_expiry_at: new Date(String(v[6])),
        status: v[7] as "pending",
        attempt: 0,
        run_after: now,
        lease_token: 0,
        leased_until: null,
        worker_id: null,
        last_error: null,
        superseded_by_event_id: null,
        superseded_at: null,
        created_at: now,
        updated_at: now,
      };
      putEvent(e);
      rows = [e];
    } else if (
      sql.includes("INSERT INTO reg.phase1_registry_expiry_delivery_intents")
    ) {
      const existing = [...intents().values()].find(
        (i) => i.idempotency_key === v[3],
      );
      const i: RegistryExpiryDeliveryIntentRow = existing ?? {
        intent_id: String(v[0]),
        event_id: String(v[1]),
        scope: String(v[2]),
        idempotency_key: String(v[3]),
        tenant_id: String(v[4]),
        recipient_email: String(v[5]),
        from_email: String(v[6]),
        subject: String(v[7]),
        body: String(v[8]),
        delivery_status: "pending",
        outbox_delivery_id: null,
        last_error: null,
        enqueued_at: null,
        created_at: now,
        updated_at: now,
      };
      putIntent(i);
      rows = [i];
    } else if (
      sql.includes("LEFT JOIN reg.phase1_registry_expiry_delivery_intents")
    ) {
      let es = [...events().values()];
      if (sql.includes("WHERE e.event_id = $1"))
        es = es.filter((e) => e.event_id === v[0]);
      for (const [name, field] of [
        ["scope", "scope"],
        ["entity_type", "entity_type"],
        ["status", "status"],
      ] as const) {
        const m = sql.match(new RegExp("e\\." + name + " = \\$(\\d+)"));
        if (m) es = es.filter((e) => e[field] === v[Number(m[1]) - 1]);
      }
      rows = es.map(joined);
    } else if (sql.includes("SELECT event_id") && sql.includes("FOR UPDATE")) {
      if (tx) await this.acquire("event:" + v[0], tx);
      rows = events().has(String(v[0])) ? [{ event_id: v[0] }] : [];
    } else if (
      sql.includes("SELECT * FROM reg.phase1_registry_expiry_events")
    ) {
      rows = [...events().values()].filter((e) =>
        sql.includes("source_fingerprint = $1")
          ? e.source_fingerprint === v[0]
          : e.entity_type === v[0] &&
            e.entity_id === v[1] &&
            ["pending", "leased", "completed"].includes(e.status) &&
            (!v[2] || e.credential_type === v[2]),
      );
    } else if (sql.includes("UPDATE reg.phase1_registry_expiry_events")) {
      if (sql.includes("ANY($2::uuid[])")) {
        for (const id of v[1] as string[]) {
          const e = events().get(id);
          if (e)
            putEvent({
              ...e,
              status: "superseded",
              superseded_at: now,
              superseded_by_event_id: v[0] as string | null,
            });
        }
      } else {
        const e = events().get(String(v[1]));
        if (
          e &&
          (!sql.includes("status <> 'superseded'") ||
            e.status !== "superseded" ||
            v[0] === "superseded")
        )
          putEvent({ ...e, status: v[0] as RegistryExpiryEventRow["status"] });
      }
    } else if (
      sql.includes("UPDATE reg.phase1_registry_expiry_delivery_intents")
    ) {
      if (sql.includes("ANY($1::uuid[])")) {
        for (const i of intents().values())
          if (
            (v[0] as string[]).includes(i.event_id) &&
            (sql.includes("<> 'superseded'")
              ? i.delivery_status !== "superseded"
              : i.delivery_status === "pending")
          )
            putIntent({ ...i, delivery_status: "superseded" });
      } else {
        if (this.rejectIntentWrites-- > 0)
          throw Object.assign(
            new Error("controlled Registry link storage failure"),
            { code: "40001" },
          );
        const i = intents().get(String(v[3]));
        if (
          i &&
          (!v[1] || !i.outbox_delivery_id || i.outbox_delivery_id === v[1])
        ) {
          const superseded =
            sql.includes("event.status = 'superseded'") &&
            (i.delivery_status === "superseded" ||
              events().get(i.event_id)?.status === "superseded");
          const updated = {
            ...i,
            delivery_status: superseded
              ? ("superseded" as const)
              : (v[0] as RegistryExpiryDeliveryIntentRow["delivery_status"]),
            outbox_delivery_id: i.outbox_delivery_id ?? (v[1] as string | null),
            last_error: v[4] ? (v[2] as string) : i.last_error,
            enqueued_at:
              v[0] === "enqueued" ? (i.enqueued_at ?? now) : i.enqueued_at,
          };
          putIntent(updated);
          rows = [updated];
        }
      }
    } else if (
      sql.includes("FROM reg.phase1_registry_expiry_delivery_intents")
    ) {
      rows = [...intents().values()].filter(
        (i) =>
          !sql.includes("delivery_status = 'pending'") ||
          i.delivery_status === "pending",
      );
      if (sql.includes("LIMIT $1")) rows = rows.slice(0, Number(v[0]));
    } else throw new Error("Uncontrolled SQL boundary: " + sql.slice(0, 120));
    return { rows: structuredClone(rows) as T[] };
  }
}
