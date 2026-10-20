import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type {
  OwnedOrderRecord,
  ReferralPassengerFareQuoteRecord,
} from "@drts/contracts";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { PartnerUserIdentityLinkRepository } from "../../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { ReferralEmbedHandoffRepository } from "../../../apps/api/src/modules/tenant-partner/referral-embed-handoff.repository";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import { ServiceAreaService } from "../../../apps/api/src/modules/service-area/service-area.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";

export const tariffRow = {
  version: "unit-published-taxi-v1",
  effective_at: "2023-04-01T00:00:00Z",
  effective_until: null,
  base_fare: 85,
  base_distance_meters: 1250,
  distance_rate: 5,
  distance_increment_meters: 200,
  delay_rate: 5,
  delay_increment_seconds: 60,
  night_surcharge_amount: 20,
  night_window_start: "23:00",
  night_window_end: "06:00",
  additional_fees: {},
  distance_rounding: "ceil",
  delay_rounding: "ceil",
  total_rounding: "ceil",
  total_increment: 1,
  night_application: "pickup",
  source_reference: "unit-approved-tariff",
};

/** Socket-free SQL wire port. Production repositories execute their original SQL;
 * only storage/clock/transaction outcomes are controlled. This is not PG lock proof. */
export class ReferralSqlPort {
  tables = new Map<string, Map<string, any>>();
  calls: Array<{
    sql: string;
    values: readonly unknown[];
    transaction: number | null;
  }> = [];
  tariffs: any[] = [tariffRow];
  failSql: RegExp | null = null;
  commitAckLost = false;
  clock: string | null = null;
  afterQuoteLock?: () => void;
  private nextTransaction = 0;
  isEnabled() {
    return true;
  }
  table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }
  query = (sql: string, values: readonly unknown[] = []) =>
    this.execute(sql, values, null);
  async connect() {
    const transaction = ++this.nextTransaction;
    let snapshot: typeof this.tables | null = null;
    let committed = false;
    return {
      query: async (sql: string, values: readonly unknown[] = []) => {
        const verb = sql.trim();
        if (verb === "BEGIN") snapshot = structuredClone(this.tables);
        if (verb === "ROLLBACK" && snapshot && !committed)
          this.tables = snapshot;
        if (verb === "COMMIT") {
          committed = true;
          if (this.commitAckLost) {
            this.commitAckLost = false;
            throw new Error("controlled lost COMMIT ACK");
          }
        }
        return this.execute(sql, values, transaction);
      },
      release: vi.fn(),
    };
  }
  private async execute(
    raw: string,
    v: readonly unknown[],
    transaction: number | null,
  ): Promise<any> {
    const sql = raw.replace(/\s+/g, " ").trim();
    this.calls.push({ sql, values: structuredClone(v), transaction });
    if (this.failSql?.test(sql))
      throw new Error("controlled storage write failure");
    const result = (rows: any[] = []) => ({
      rows: structuredClone(rows),
      rowCount: rows.length,
      command: "",
      oid: 0,
      fields: [],
    });
    if (
      /^(BEGIN|COMMIT|ROLLBACK|SET LOCAL|SAVEPOINT|RELEASE SAVEPOINT)/.test(
        sql,
      ) ||
      sql.startsWith("SELECT pg_advisory")
    )
      return result();
    if (sql.includes("FROM passenger.fare_versions"))
      return result(this.tariffs);
    if (sql === "SELECT clock_timestamp() AS now")
      return result([{ now: this.clock ?? new Date().toISOString() }]);
    const quotes = this.table("ops.phase1_referral_fare_quote_snapshots");
    if (
      sql.startsWith(
        "SELECT quote_id FROM ops.phase1_referral_fare_quote_snapshots",
      )
    ) {
      this.afterQuoteLock?.();
      return result(quotes.has(String(v[0])) ? [{ quote_id: v[0] }] : []);
    }
    if (
      sql.startsWith(
        "SELECT record FROM ops.phase1_referral_fare_quote_snapshots",
      )
    )
      return result(
        quotes.has(String(v[0])) ? [{ record: quotes.get(String(v[0])) }] : [],
      );
    if (sql.startsWith("UPDATE ops.phase1_referral_fare_quote_snapshots")) {
      const q = quotes.get(String(v[0])) as
        | ReferralPassengerFareQuoteRecord
        | undefined;
      if (
        !q ||
        q.consumedByOrderId ||
        Date.parse(q.expiresAt) <= Date.parse(String(v[7])) ||
        [
          q.tenantId,
          q.partnerId,
          q.partnerProgramId,
          q.entrySlug,
          q.drtsPassengerId,
        ].some((x, i) => x !== v[i + 1])
      )
        return result();
      const next = { ...q, consumedByOrderId: v[6], consumedAt: v[7] };
      quotes.set(q.quoteId, next);
      return result([{ record: next }]);
    }
    if (sql.includes("complaint_case_snapshot ORDER BY")) {
      const c = this.table("crm.phase1_complaint_cases").get(String(v[0]));
      return result([
        ...(c ? [{ kind: "case", record: c }] : []),
        ...[...this.table("crm.phase1_complaint_timelines").values()]
          .filter((t) => t.caseNo === v[0])
          .map((t) => ({ kind: "timeline", record: t })),
      ]);
    }
    if (sql.startsWith("UPDATE ops.consumer_notification_outbox SET payload")) {
      const row = this.table("ops.consumer_notification_outbox").get(
        String(v[0]),
      );
      if (row)
        row.payload = {
          ...(typeof row.payload === "string"
            ? JSON.parse(row.payload)
            : row.payload),
          eventSequence: Number(v[1]),
        };
      return result(row ? [row] : []);
    }
    if (
      sql.startsWith("UPDATE mobility.phase1_partner_notification_sequences")
    ) {
      const row = this.table(
        "mobility.phase1_partner_notification_sequences",
      ).get(String(v[0]));
      if (!row) return result();
      const sequence = row.next_sequence ?? 1;
      row.next_sequence = sequence + 1;
      return result([{ event_sequence: sequence }]);
    }
    if (sql.includes("FROM core.phase1_tenant_quota_ledger"))
      return result(
        [...this.table("core.phase1_tenant_quota_ledger").values()]
          .filter((r) => r.tenantId === v[0] && r.bookingId === v[1])
          .map((record) => ({ record })),
      );
    if (sql.startsWith("INSERT INTO")) {
      const match = /^INSERT INTO ([\w.]+) \((.*?)\) VALUES \((.*?)\)/.exec(
        sql,
      );
      if (!match) throw new Error(`Unsupported unit SQL insert: ${sql}`);
      const [, table, rawColumns, rawParams] = match;
      const columns = rawColumns!.split(",").map((x) => x.trim());
      const params = rawParams!.split(",").map((x) => x.trim());
      const row: Record<string, any> = {};
      columns.forEach((c, i) => {
        const n = /^\$(\d+)/.exec(params[i] ?? "");
        row[c] = n
          ? v[Number(n[1]) - 1]
          : /^'/.test(params[i] ?? "")
            ? params[i]!.split("'")[1]
            : /^-?\d+$/.test(params[i] ?? "")
              ? Number(params[i])
              : null;
      });
      if (table === "ops.dispatch_resource_reservations")
        Object.assign(row, {
          reservation_id: randomUUID(),
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      const record =
        typeof row.record === "string" ? JSON.parse(row.record) : row;
      const key = String(
        table === "ops.dispatch_resource_reservations"
          ? row.reservation_id
          : row[columns[0]!],
      );
      if (this.table(table!).has(key) && /ON CONFLICT.*DO NOTHING/.test(sql))
        return result();
      this.table(table!).set(key, record);
      return result(
        sql.includes("RETURNING")
          ? [{ ...row, aggregate_version: record.aggregateVersion ?? 1 }]
          : [],
      );
    }
    if (sql.startsWith("UPDATE ops.phase1_owned_orders SET")) {
      const old = this.table("ops.phase1_owned_orders").get(String(v[0]));
      if (!old || (old.aggregateVersion ?? 1) !== v[14]) return result();
      const next = JSON.parse(String(v[13]));
      this.table("ops.phase1_owned_orders").set(String(v[0]), next);
      return result([{ aggregate_version: next.aggregateVersion }]);
    }
    if (sql.startsWith("UPDATE ops.dispatch_resource_reservations")) {
      const changed = [
        ...this.table("ops.dispatch_resource_reservations").values(),
      ].filter(
        (r) =>
          r.assignment_id === v[0] && ["held", "occupied"].includes(r.status),
      );
      changed.forEach((r) => {
        r.status = sql.includes("'released'") ? "released" : "occupied";
        r.version++;
      });
      return result(changed);
    }
    if (sql.includes("FROM ops.phase1_owned_orders")) {
      let rows = [
        ...this.table("ops.phase1_owned_orders").values(),
      ] as OwnedOrderRecord[];
      if (sql.includes("WHERE tenant_id=$1"))
        rows = rows.filter(
          (o) =>
            o.tenantId === v[0] &&
            o.partnerId === v[1] &&
            o.partnerProgramId === v[2] &&
            o.partnerEntrySlug === v[3] &&
            o.passenger.passengerId === v[4] &&
            o.referralPassengerLifecycle?.bookingIdempotencyKey === v[5],
        );
      else if (sql.includes("order_id = $1"))
        rows = rows.filter((o) => o.orderId === v[0]);
      return result(
        rows.map((record) => ({
          record,
          aggregate_version: record.aggregateVersion ?? 1,
        })),
      );
    }
    const select = /FROM ([\w.]+)/.exec(sql);
    if (
      select &&
      [
        "ops.phase1_driver_tasks",
        "ops.phase1_dispatch_assignments",
        "ops.phase1_dispatch_jobs",
        "ops.phase1_dispatch_trace_logs",
        "mobility.phase1_order_first_party_notification_routes",
        "mobility.phase1_order_partner_notification_routes",
      ].includes(select[1]!)
    ) {
      let rows = [...this.table(select[1]!).values()];
      const projection = (record: any): Record<string, any> => ({
        record,
        ...Object.fromEntries(
          Object.entries(record).map(([k, value]) => [
            k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
            value,
          ]),
        ),
      });
      const conditions = [
        ...sql.matchAll(/(?:WHERE|AND) ([a-z_]+) = \$(\d+)/g),
      ];
      rows = rows.filter((r) =>
        conditions.every(
          ([, key, index]) => projection(r)[key!] === v[Number(index) - 1],
        ),
      );
      if (sql.includes("status IN ('assigned', 'accepted')"))
        rows = rows.filter((r) => ["assigned", "accepted"].includes(r.status));
      if (sql.includes("status <> 'closed'"))
        rows = rows.filter((r) => r.status !== "closed");
      if (sql.startsWith("SELECT count(*)"))
        return result([{ count: String(rows.length) }]);
      return result(rows.map(projection));
    }
    throw new Error(`Unsupported unit SQL: ${sql}`);
  }
}

export async function domainFixture() {
  const db = new ReferralSqlPort();
  const audit = new AuditNotificationService();
  const links = new PartnerUserIdentityLinkRepository();
  const handoffs = new ReferralEmbedHandoffRepository();
  const partner = new TenantPartnerService(
    audit,
    new TenantPartnerRepository(),
    undefined,
    undefined,
    undefined,
    links,
    handoffs,
  );
  const entry = partner.getPartnerEntry("yuhe-residence");
  const identities = new Map<string, any>();
  async function identity(alias = "unit-referral") {
    if (identities.has(alias)) return identities.get(alias);
    const link = await links.resolveOrCreate({
      entrySlug: entry.entrySlug,
      partnerUserRef: alias,
    });
    const artifact = randomUUID();
    const h = await handoffs.issue({
      artifact,
      entrySlug: entry.entrySlug,
      entryHost: entry.entryHost!,
      partnerUserRef: alias,
      drtsPassengerId: link.drtsPassengerId,
      tenantId: entry.tenantId,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      consentRequired: true,
      consentBundleVersion: null,
      consentGrantedAt: null,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    });
    await handoffs.consume({
      artifact,
      entrySlug: entry.entrySlug,
      entryHost: entry.entryHost!,
    });
    await partner.recordReferralEmbedConsent({
      handoffId: h.handoffId,
      entrySlug: entry.entrySlug,
      entryHost: entry.entryHost!,
      currentDrtsPassengerId: link.drtsPassengerId,
      currentPartnerEntrySlug: entry.entrySlug,
      consentBundle: {
        bundleVersion: "unit-v1",
        grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
        grantedAt: new Date().toISOString(),
      },
    });
    const value = {
      actorType: "referral_passenger",
      actorId: link.drtsPassengerId,
      drtsPassengerId: link.drtsPassengerId,
      realm: "partner",
      tenantId: entry.tenantId,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      partnerEntrySlug: entry.entrySlug,
      scopes: ["partner:book"],
    };
    identities.set(alias, value);
    return value;
  }
  const registry = {
    prepareMatchingSuppressions: () => undefined,
    assertCurrentMatchingSuppressionClear: () => undefined,
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "driver-referral-001",
        vehicleId: "vehicle-referral-001",
        etaMinutes: 5,
        operatingArea: "taipei",
        serviceBuckets: ["business_dispatch"],
      },
    ]),
    getVehicleDispatchability: () => true,
    getDriverAvailability: () => true,
    listDrivers: () => [],
    listVehicles: () => [],
  };
  const callcenter = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  const events = { emit: vi.fn() } as never;
  // Explicit published unit policy; the default airport area covers a different
  // product and must not silently be treated as enterprise coverage.
  const area = new ServiceAreaService({
    loadState: async () => ({
      serviceAreas: [
        {
          serviceAreaId: "unit-enterprise-area",
          areaCode: "UNIT_ENTERPRISE",
          displayName: "Controlled published enterprise boundary",
          status: "active",
          geometry: {
            type: "polygon",
            coordinates: [
              { lat: 24.9, lng: 121.1 },
              { lat: 24.9, lng: 121.7 },
              { lat: 25.2, lng: 121.7 },
              { lat: 25.2, lng: 121.1 },
            ],
          },
          serviceProductTypes: ["enterprise_dispatch"],
          effectiveFrom: "2020-01-01T00:00:00Z",
          effectiveUntil: null,
          version: 1,
          metadata: { source: "unit-port" },
          createdAt: "2020-01-01T00:00:00Z",
          updatedAt: "2020-01-01T00:00:00Z",
        },
      ],
      stopPolicies: [],
    }),
  } as never);
  await area.onModuleInit();
  const geo = {
    resolve: vi.fn(
      async ({
        addressText,
        selectedByActorId,
      }: {
        addressText: string;
        selectedByActorId?: string;
      }) => ({
        address: {
          address: addressText,
          lat: addressText.includes("Airport") ? 25.08 : 25.06,
          lng: addressText.includes("Airport") ? 121.24 : 121.52,
          coordinateSource: "google_geocoding",
          selectedByActorId,
          resolvedAt: new Date().toISOString(),
        },
      }),
    ),
    route: vi.fn(async () => ({
      distanceMeters: 8400,
      durationSeconds: 900,
      provider: "google_routes",
      computedAt: new Date().toISOString(),
    })),
  };
  const repository = new OwnedMobilityRepository(db as never);
  const complaints = new ComplaintService(
    audit,
    new ComplaintRepository(db as never),
  );
  const args = Array(27).fill(undefined);
  Object.assign(args, {
    0: registry,
    1: audit,
    2: callcenter,
    3: new OwnedMobilityTaskEventsService(events),
    4: new OpsDispatchEventsService(events),
    5: repository,
    6: partner,
    13: area,
    19: links,
    24: geo,
    25: new PassengerFareRepository(db as never),
    26: complaints,
  });
  function newService() {
    const instanceArgs = [...args];
    instanceArgs[5] = new OwnedMobilityRepository(db as never);
    instanceArgs[26] = new ComplaintService(
      audit,
      new ComplaintRepository(db as never),
    );
    return Reflect.construct(
      OwnedMobilityService,
      instanceArgs,
    ) as OwnedMobilityService;
  }
  const service = Reflect.construct(
    OwnedMobilityService,
    args,
  ) as OwnedMobilityService;
  const route = {
    entrySlug: entry.entrySlug,
    pickupAddress: "Taipei Main Station",
    dropoffAddress: "Taoyuan Airport T2",
  };
  async function command(
    who = identities.get("unit-referral"),
    overrides: Record<string, unknown> = {},
  ) {
    who ??= await identity();
    const quote = await service.quoteReferralPassengerFare(route, who);
    return {
      ...route,
      quoteId: quote.quoteId,
      passengerName: "Unit passenger",
      passengerPhone: "0912345678",
      idempotencyKey: randomUUID(),
      ...overrides,
    };
  }
  return {
    db,
    service,
    newService,
    repository,
    partner,
    links,
    handoffs,
    audit,
    geo,
    area,
    complaints,
    entry,
    identity,
    command,
    route,
  };
}
