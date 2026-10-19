import { afterEach, describe, expect, it, vi } from "vitest";
import { Reflector } from "../../../apps/api/node_modules/@nestjs/core";
import type { ExecutionContext } from "../../../apps/api/node_modules/@nestjs/common";
import type {
  IdentityContext,
  OwnedOrderRecord,
  DriverTaskRecord,
} from "../../../packages/contracts/src";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
import {
  loadReferralDashboard,
  loadReferralStatements,
  loadReferralUsage,
  loadReferralStatementDetail,
} from "../../../apps/channel-partner-portal-web/lib/channel-portal-data.server";
import type { QueryResult, QueryResultRow } from "pg";
import type { PartnerChannelEntryRecord } from "../../../packages/contracts/src";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";

const services: TenantPartnerService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.onModuleDestroy();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const clone = <T>(value: T): T => structuredClone(value);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Explicit SIM database transport only. Real repositories own SQL, transactions,
 * row selection and JSON serialization; no service/controller/rate resolver mocks. */
class SqlBoundary {
  entries: Map<string, PartnerChannelEntryRecord>;
  sql: { text: string; values: readonly unknown[] }[] = [];
  commitGate: ReturnType<typeof deferred> | null = null;
  rejectCommit = false;
  commitEntered = deferred();
  records = new Map<string, unknown[]>();
  liveRows: {
    order_record: OwnedOrderRecord;
    task_record: DriverTaskRecord;
  }[] = [];
  constructor(entries: PartnerChannelEntryRecord[]) {
    this.entries = new Map(
      entries.map((entry) => [entry.entrySlug, clone(entry)]),
    );
  }
  isEnabled() {
    return true;
  }
  async query<T extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.execute<T>(this.entries, text, values);
  }
  private async execute<T extends QueryResultRow>(
    entries: Map<string, PartnerChannelEntryRecord>,
    text: string,
    values: readonly unknown[],
  ): Promise<QueryResult<T>> {
    this.sql.push({ text, values: clone(values) });
    let rows: unknown[] = [];
    if (
      /SELECT.*record|SELECT\s+record/is.test(text) &&
      text.includes("admin.phase1_partner_channel_entries")
    ) {
      rows = [...entries.values()]
        .filter(
          (entry) =>
            !text.includes("WHERE entry_slug") || entry.entrySlug === values[0],
        )
        .map((record) => ({ record: clone(record) }));
    } else if (text.includes("FROM ops.phase1_driver_tasks AS tasks")) {
      const eligible = this.liveRows.filter(
        ({ order_record: order, task_record: task }) =>
          task.status === "completed" &&
          order.tenantId === values[0] &&
          (text.includes("SELECT DISTINCT")
            ? order.partnerEntrySlug === values[1]
            : Boolean(
                task.completedAt &&
                task.completedAt >= String(values[1]) &&
                task.completedAt <= String(values[2]),
              )),
      );
      rows = text.includes("SELECT DISTINCT")
        ? [
            ...new Set(
              eligible.map(({ task_record: task }) =>
                task.completedAt!.slice(0, 7),
              ),
            ),
          ].map((period_month) => ({ period_month }))
        : clone(eligible);
    } else if (
      text.startsWith("UPDATE admin.phase1_partner_channel_entries") &&
      text.includes("referralRevenueShareRules")
    ) {
      const entry = entries.get(String(values[0]));
      if (entry)
        entries.set(entry.entrySlug, {
          ...entry,
          referralRevenueShareRules: JSON.parse(String(values[1])),
        } as PartnerChannelEntryRecord);
    } else if (
      text.includes("INSERT INTO admin.phase1_partner_channel_entries")
    ) {
      const entry = JSON.parse(String(values[8])) as PartnerChannelEntryRecord;
      const prior = entries.get(entry.entrySlug) as
        | (PartnerChannelEntryRecord & { referralRevenueShareRules?: unknown })
        | undefined;
      entries.set(
        entry.entrySlug,
        text.includes("jsonb_set(EXCLUDED.record") &&
          prior?.referralRevenueShareRules
          ? ({
              ...entry,
              referralRevenueShareRules: clone(prior.referralRevenueShareRules),
            } as PartnerChannelEntryRecord)
          : entry,
      );
    } else if (/SELECT\s+record\s+FROM/i.test(text)) {
      const table = text.match(/FROM\s+([a-z0-9_.]+)/i)![1]!;
      rows = (this.records.get(table) ?? []).map((record) => ({
        record: clone(record),
      }));
    } else if (/INSERT INTO billing\./i.test(text)) {
      const table = text.match(/INSERT INTO\s+([a-z0-9_.]+)/i)![1]!;
      const record = JSON.parse(String(values[values.length - 1])) as unknown;
      this.records.set(table, [...(this.records.get(table) ?? []), record]);
    } else if (!/^\s*(SELECT|INSERT|UPDATE|DELETE)/.test(text)) {
      throw new Error(`Unsupported SIM SQL: ${text}`);
    }
    return {
      rows: rows as T[],
      rowCount: rows.length,
      command: "SIM",
      oid: 0,
      fields: [],
    };
  }
  async connect() {
    let pending = clone(this.entries);
    return {
      query: async <T extends QueryResultRow>(
        text: string,
        values: readonly unknown[] = [],
      ): Promise<QueryResult<T>> => {
        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) {
          this.sql.push({ text, values: [] });
          if (text === "COMMIT") {
            this.commitEntered.resolve();
            await this.commitGate?.promise;
            if (this.rejectCommit) throw new Error("SIM rejected commit");
            this.entries = clone(pending);
          }
          if (text === "ROLLBACK") pending = clone(this.entries);
          return { rows: [], rowCount: 0, command: text, oid: 0, fields: [] };
        }
        return this.execute<T>(pending, text, values);
      },
      release() {},
    };
  }
  asDatabase() {
    return this as unknown as DatabaseService;
  }
}
async function setup(boundary?: SqlBoundary) {
  const audit = new AuditNotificationService();
  const seed = new TenantPartnerService(audit);
  services.push(seed);
  const initialRates = await seed.listReferralRevenueShareRules();
  const db =
    boundary ??
    new SqlBoundary(
      seed.listPlatformPartnerEntries().map((entry) => ({
        ...entry,
        referralRevenueShareRules: initialRates.filter(
          (rule) => rule.partnerEntrySlug === entry.entrySlug,
        ),
      })),
    );
  // Explicit pre-existing canonical 15% SQL fixture; the enabled writer never imports demo rates.
  const service = new TenantPartnerService(
    audit,
    new TenantPartnerRepository(db.asDatabase()),
  );
  services.push(service);
  const billing = new BillingSettlementService(
    audit,
    new BillingSettlementRepository(db.asDatabase()),
  );
  const controller = new TenantPartnerController(
    service,
    billing,
    undefined!,
    undefined!,
    undefined!,
  );
  return { audit, db, service, billing, controller };
}
const command = {
  partnerEntrySlug: "yuhe-residence",
  rateType: "percent" as const,
  value: 20,
  effectiveFrom: "2026-06-01T00:00:00.000Z",
};

describe("canonical referral-rate actual producer", () => {
  it("configured 20 reaches the actual Billing resolver and an unissued June statement", async () => {
    const { controller, billing } = await setup();
    await controller.upsertReferralRevenueShareRule(
      command,
      "rate-before-consumer",
    );
    expect(
      (
        await billing.resolveReferralRevenueShareRule(
          "yuhe-residence",
          "2026-06-04T08:15:00Z",
        )
      )?.value,
    ).toBe(20);
    const statement = await billing.getReferralStatement(
      "yuhe-residence",
      "2026-06",
    );
    expect(statement.totals.gmv.amountMinor).toBe(150000);
    expect(statement.totals.shareTotal.amountMinor).toBe(30000);
  });
  it("enabled write stays unpublished until its real repository COMMIT ACK", async () => {
    const { controller, audit, db } = await setup();
    db.commitGate = deferred();
    let completed = false;
    const write = Promise.resolve(
      controller.upsertReferralRevenueShareRule(command, "rate-before-ack"),
    ).then(() => {
      completed = true;
    });
    try {
      await db.commitEntered.promise;
      expect(completed).toBe(false);
      expect(
        audit
          .listAuditLogs()
          .filter((log) => log.resourceType === "referral_revenue_share_rule"),
      ).toEqual([]);
      expect(
        (await controller.listReferralRevenueShareRules("yuhe-residence")).data
          .items[0]?.value,
      ).toBe(15);
    } finally {
      db.commitGate.resolve();
      await write;
    }
    expect(completed).toBe(true);
    expect(
      (await controller.listReferralRevenueShareRules("yuhe-residence")).data
        .items[0]?.value,
    ).toBe(20);
    expect(
      audit
        .listAuditLogs()
        .filter((log) => log.resourceType === "referral_revenue_share_rule"),
    ).toHaveLength(1);
    expect(db.sql.some((query) => query.text.endsWith("FOR UPDATE"))).toBe(
      true,
    );
    expect(db.sql.some((query) => query.text === "COMMIT")).toBe(true);
  });
  it("fresh real repository/service readback restores the acknowledged configured rate", async () => {
    const first = await setup();
    await first.controller.upsertReferralRevenueShareRule(
      command,
      "rate-before-restore",
    );
    const fresh = await setup(first.db);
    await fresh.service.onModuleInit();
    expect(
      (await fresh.controller.listReferralRevenueShareRules("yuhe-residence"))
        .data.items[0]?.value,
    ).toBe(20);
  });
});

function partnerIdentity(entry: PartnerChannelEntryRecord): IdentityContext {
  return {
    actorType: "partner_api_key",
    actorId: entry.partnerId,
    realm: "partner",
    authMode: "bootstrap_headers",
    roleFamilies: ["partner"],
    roles: ["partner"],
    scopes: ["billing:read"],
    tenantId: entry.tenantId,
    partnerId: entry.partnerId,
    partnerProgramId: entry.programId,
    partnerEntrySlug: entry.entrySlug,
    supportedExecutionModes: ["discussion_planning"],
  };
}
async function csvBytes(
  controller: TenantPartnerController,
  identity: IdentityContext,
) {
  const file = await controller.getPartnerReferralStatementArtifact(
    identity,
    "2026-06",
  );
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function guardContext(headers: Record<string, string>): ExecutionContext {
  const request = {
    method: "POST",
    originalUrl: "/api/platform-admin/referral-rates",
    headers,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () =>
      TenantPartnerController.prototype.upsertReferralRevenueShareRule,
    getClass: () => TenantPartnerController,
  } as unknown as ExecutionContext;
}

describe("canonical referral history, callers and original boundaries", () => {
  it("rejects a failed commit without publishing and retries normally, preserving unrelated entry data", async () => {
    const { controller, service, billing, db, audit } = await setup();
    const other = clone(db.entries.get("bank-demo-alpha-airport"));
    const entry = clone(db.entries.get(command.partnerEntrySlug)!);
    db.rejectCommit = true;
    await expect(
      controller.upsertReferralRevenueShareRule(command),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      (await controller.listReferralRevenueShareRules(command.partnerEntrySlug))
        .data.items[0]?.value,
    ).toBe(15);
    expect(
      (
        await billing.resolveReferralRevenueShareRule(
          command.partnerEntrySlug,
          "2026-06-10T00:00:00Z",
        )
      )?.value,
    ).toBe(15);
    expect(
      audit
        .listAuditLogs()
        .filter((log) => log.resourceType === "referral_revenue_share_rule"),
    ).toEqual([]);
    expect(db.entries.get(command.partnerEntrySlug)).toEqual(entry);
    db.rejectCommit = false;
    await controller.upsertReferralRevenueShareRule(command);
    expect(db.entries.get("bank-demo-alpha-airport")).toEqual(other);
    expect(service.getPartnerEntry(command.partnerEntrySlug).entryHost).toBe(
      entry.entryHost,
    );
    expect(
      (await billing.getReferralStatement(command.partnerEntrySlug, "2026-06"))
        .totals.shareTotal.amountMinor,
    ).toBe(30000);
  });

  it("actual platform guard admits its existing scope and rejects wrong realm/scope before the command", async () => {
    vi.stubEnv("APP_ENV", "test");
    const { controller, db } = await setup();
    const guard = new BootstrapAuthGuard(new Reflector());
    const valid = {
      "x-actor-type": "platform_admin",
      "x-actor-id": "rate-admin",
      "x-realm": "platform",
      "x-role-families": "platform",
      "x-roles": "platform_admin",
      "x-scopes": "foundation:write",
    };
    await expect(
      Promise.resolve().then(() =>
        guard.canActivate(
          guardContext({ ...valid, "x-scopes": "foundation:read" }),
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      Promise.resolve().then(() =>
        guard.canActivate(guardContext({ ...valid, "x-realm": "tenant" })),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.sql).toEqual([]);
    expect(await guard.canActivate(guardContext(valid))).toBe(true);
    await controller.upsertReferralRevenueShareRule(command);
    expect(
      (await controller.listReferralRevenueShareRules(command.partnerEntrySlug))
        .data.items[0]?.value,
    ).toBe(20);
  });

  it.each(["missing", "inactive", "revoked", "other-partner", "bank"])(
    "keeps canonical %s entry denial without a write or success audit",
    async (condition) => {
      const { controller, db, audit } = await setup();
      let attempted = {
        ...command,
        partnerId: db.entries.get(command.partnerEntrySlug)!.partnerId,
      };
      if (condition === "missing") attempted.partnerEntrySlug = "unknown-entry";
      if (condition === "inactive")
        db.entries.get(command.partnerEntrySlug)!.activeFlag = false;
      if (condition === "revoked")
        db.entries.get(command.partnerEntrySlug)!.status = "revoked";
      if (condition === "other-partner")
        attempted.partnerId = "partner-foreign";
      if (condition === "bank")
        attempted = {
          ...attempted,
          partnerEntrySlug: "bank-demo-alpha-airport",
          partnerId: db.entries.get("bank-demo-alpha-airport")!.partnerId,
        };
      const prior = clone(db.entries);
      await expect(
        controller.upsertReferralRevenueShareRule(attempted),
      ).rejects.toMatchObject({ status: condition === "missing" ? 404 : 403 });
      expect(db.entries).toEqual(prior);
      expect(
        db.sql.some((query) =>
          query.text.startsWith("UPDATE admin.phase1_partner_channel_entries"),
        ),
      ).toBe(false);
      expect(
        audit
          .listAuditLogs()
          .filter((log) => log.resourceType === "referral_revenue_share_rule"),
      ).toEqual([]);
    },
  );

  it("keeps percent, per_trip MINOR units, zero and the original inclusive completion-time boundaries across fresh instances", async () => {
    const { controller, billing, db } = await setup();
    const percent = (await controller.upsertReferralRevenueShareRule(command))
      .data;
    const flat = (
      await controller.upsertReferralRevenueShareRule({
        ...command,
        rateType: "per_trip",
        value: 123,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveUntil: "2026-07-31T23:59:59.999Z",
      })
    ).data;
    await controller.upsertReferralRevenueShareRule({
      ...command,
      value: 0,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
    });
    expect(flat.ruleId).not.toBe(percent.ruleId);
    expect(
      (
        await billing.resolveReferralRevenueShareRule(
          command.partnerEntrySlug,
          "2026-06-30T23:59:59.999Z",
        )
      )?.value,
    ).toBe(20);
    expect(
      (
        await billing.resolveReferralRevenueShareRule(
          command.partnerEntrySlug,
          "2026-07-01T00:00:00.000Z",
        )
      )?.value,
    ).toBe(123);
    expect(
      (
        await billing.resolveReferralRevenueShareRule(
          command.partnerEntrySlug,
          "2026-07-31T23:59:59.999Z",
        )
      )?.value,
    ).toBe(123);
    expect(
      (
        await billing.resolveReferralRevenueShareRule(
          command.partnerEntrySlug,
          "2026-08-01T00:00:00.000Z",
        )
      )?.value,
    ).toBe(0);
    expect(
      await billing.resolveReferralRevenueShareRule(
        command.partnerEntrySlug,
        "2000-01-01T00:00:00.000Z",
      ),
    ).toBeNull();
    const fresh = await setup(db);
    await fresh.service.onModuleInit();
    const history = (
      await fresh.controller.listReferralRevenueShareRules(
        command.partnerEntrySlug,
      )
    ).data.items;
    expect(history.map((rule) => rule.value)).toEqual([20, 123, 0]);
    expect(
      (
        await fresh.billing.getReferralStatement(
          command.partnerEntrySlug,
          "2026-06",
        )
      ).totals.shareTotal.amountMinor,
    ).toBe(30000);
    expect(
      (
        await billing.resolveReferralRevenueShareRule(
          command.partnerEntrySlug,
          "2026-06-04T08:15:00Z",
        )
      )?.ruleId,
    ).toBe(percent.ruleId);
  });

  it("updates the existing effective version with original currency defaults and keeps other versions", async () => {
    const { controller } = await setup();
    const first = (await controller.upsertReferralRevenueShareRule(command))
      .data;
    await controller.upsertReferralRevenueShareRule({
      ...command,
      effectiveFrom: "2026-07-01T00:00:00.000Z",
    });
    const same = (
      await controller.upsertReferralRevenueShareRule({ ...command, value: 0 })
    ).data;
    expect(same.ruleId).toBe(first.ruleId);
    expect(same.createdAt).toBe(first.createdAt);
    expect(same.currency).toBe("TWD");
    expect(
      (await controller.listReferralRevenueShareRules(command.partnerEntrySlug))
        .data.items,
    ).toHaveLength(2);
  });

  it("fresh Billing real SQL trip read and completed-event caller consume canonical rate without crossing entry/tenant", async () => {
    const { controller, billing, db, audit } = await setup();
    await controller.upsertReferralRevenueShareRule({
      ...command,
      rateType: "per_trip",
      value: 123,
      effectiveFrom: "2026-07-01T00:00:00.000Z",
    });
    const owned = new OwnedMobilityService(
      undefined!,
      audit,
      undefined!,
      undefined!,
    );
    const entry = db.entries.get(command.partnerEntrySlug)!;
    const order: OwnedOrderRecord = {
      ...owned.listOrders()[0]!,
      orderId: "rate-live-order",
      tenantId: entry.tenantId,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      partnerEntrySlug: entry.entrySlug,
      orderSource: "portal",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "enterprise_dispatch",
    };
    const task: DriverTaskRecord = {
      ...owned.listDriverTasks()[0]!,
      taskId: "rate-live-task",
      driverId: "drv-demo-002",
      orderId: order.orderId,
      status: "completed",
      completedAt: "2026-07-10T08:00:00.000Z",
      fare: { currency: "TWD", amountMinor: 10001 },
    };
    db.liveRows = [
      { order_record: order, task_record: task },
      {
        order_record: {
          ...order,
          orderId: "foreign-tenant",
          tenantId: "foreign",
        },
        task_record: { ...task, orderId: "foreign-tenant" },
      },
      {
        order_record: {
          ...order,
          orderId: "foreign-entry",
          partnerEntrySlug: "referral-demo-community",
        },
        task_record: { ...task, orderId: "foreign-entry" },
      },
    ];
    const fromSql = await billing.getReferralStatement(
      entry.entrySlug,
      "2026-07",
    );
    expect(fromSql.lines.map((line) => line.tripId)).toEqual([order.orderId]);
    expect(fromSql.totals.gmv.amountMinor).toBe(10001);
    expect(fromSql.totals.shareTotal.amountMinor).toBe(123);
    expect(
      (await billing.listReferralStatements(entry.entrySlug)).map(
        (statement) => statement.period,
      ),
    ).toContain("2026-07");
    const joined = db.sql.find((query) =>
      query.text.includes("orders.record AS order_record"),
    );
    expect(joined?.values).toEqual([
      entry.tenantId,
      "2026-07-01T00:00:00.000Z",
      "2026-07-31T23:59:59.999Z",
    ]);
    expect(joined?.text).toContain("tasks.status = 'completed'");
    await controller.upsertReferralRevenueShareRule({
      ...command,
      value: 0,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
    });
    await billing.handleOwnedMobilityTripCompleted({
      tenantId: entry.tenantId,
      driverId: task.driverId,
      orderId: "rate-event-order",
      bookingId: "rate-event-booking",
      completedAt: "2026-08-10T08:00:00.000Z",
      grossEarning: { currency: "TWD", amountMinor: 10001 },
      orderSource: "portal",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "enterprise_dispatch",
      costCenterCode: null,
      riderId: null,
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      partnerEntrySlug: entry.entrySlug,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: null,
      benefitReference: null,
      serviceProduct: "enterprise_dispatch",
      tenantServiceProgramId: null,
      sourcePlatform: "portal",
    });
    const zero = await billing.getReferralStatement(entry.entrySlug, "2026-08");
    expect(zero.totals.tripCount).toBe(1);
    expect(zero.totals.shareTotal.amountMinor).toBe(0);
  });

  it("actual portal controller/client mappers and drained CSV agree with the configured canonical rate", async () => {
    const { controller, db } = await setup();
    await controller.upsertReferralRevenueShareRule(command);
    const identity = partnerIdentity(db.entries.get(command.partnerEntrySlug)!);
    const detail = (
      await controller.getPartnerReferralStatement(identity, "2026-06")
    ).data;
    expect(detail.totals.shareTotal.amountMinor).toBe(30000);
    const csv = await csvBytes(controller, identity);
    expect(csv.toString("utf8")).toContain('"percent","20"');
    vi.stubEnv("DRTS_API_URL", "http://in-process-rate-boundary.test");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    vi.stubGlobal("fetch", async (input: Request | string | URL) => {
      const path = new URL(input.toString()).pathname;
      const result = path.endsWith("/dashboard")
        ? await controller.getPartnerReferralDashboard(identity, "2026-06")
        : path.endsWith("/usage")
          ? await controller.listPartnerReferralUsage(identity)
          : path.endsWith("/revenue")
            ? await controller.listPartnerReferralRevenue(identity)
            : path.endsWith("/statements")
              ? await controller.listPartnerReferralStatements(identity)
              : await controller.getPartnerReferralStatement(
                  identity,
                  "2026-06",
                );
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    });
    expect(
      (await loadReferralStatementDetail("2026-06")).statement?.share,
    ).toBe("NT$ 300");
    expect((await loadReferralStatements()).rows[0]?.share).toBe("NT$ 300");
    expect(
      (await loadReferralUsage()).tripRows.reduce(
        (sum, row) => sum + Number(row.share.replace(/[^0-9.]/g, "")),
        0,
      ),
    ).toBe(300);
    expect(
      (await loadReferralDashboard("2026-06")).summary.estimatedShare,
    ).toBe("NT$ 300");
    expect(
      (await controller.listPartnerReferralRevenue(identity)).data.items[0]
        ?.shareAmount.amountMinor,
    ).toBe(30000);
    const artifactBefore = clone(detail.artifactRef);
    await controller.upsertReferralRevenueShareRule({
      ...command,
      value: 99,
      effectiveFrom: "2026-07-01T00:00:00.000Z",
    });
    expect(
      (await controller.getPartnerReferralStatement(identity, "2026-06")).data
        .artifactRef,
    ).toEqual(artifactBefore);
    expect(await csvBytes(controller, identity)).toEqual(csv);
  });

  it.each([
    "realm",
    "tenant",
    "partner",
    "program",
    "entry",
    "unknown",
    "inactive",
    "revoked",
  ])(
    "preserves portal %s denial against canonical identity",
    async (condition) => {
      const { service, billing, db } = await setup();
      await service.onModuleInit();
      const identity = partnerIdentity(
        db.entries.get(command.partnerEntrySlug)!,
      );
      if (condition === "realm") identity.realm = "tenant";
      if (condition === "tenant") identity.tenantId = "tenant-foreign";
      if (condition === "partner") identity.partnerId = "partner-foreign";
      if (condition === "program")
        identity.partnerProgramId = "program-foreign";
      if (condition === "entry")
        identity.partnerEntrySlug = "referral-demo-community";
      if (condition === "unknown") identity.partnerEntrySlug = "unknown";
      if (condition === "inactive" || condition === "revoked") {
        const entry = db.entries.get(command.partnerEntrySlug)!;
        entry.status = condition === "inactive" ? "inactive" : "revoked";
        await service.onModuleInit();
      }
      await expect(
        service.getPartnerReferralDashboard(identity, billing, "2026-06"),
      ).rejects.toMatchObject({ status: condition === "unknown" ? 404 : 403 });
    },
  );
});

describe("original attribution and issued financial snapshot regressions", () => {
  it("post-change actual handoff keeps the original passenger/consent/tenant attribution and earlier payload immutable", async () => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("JWT_SECRET", "partner-rate-socketfree-test-secret");
    vi.stubEnv("JWT_ISSUER", "rate-tests");
    vi.stubEnv("JWT_AUDIENCE", "drts-api");
    vi.stubEnv("PARTNER_INGRESS_KEY_YUHE_RESIDENCE", "rate-test-yuhe-key");
    const { service, billing, controller } = await setup();
    const jwt = new JwtAuthService();
    const ingress = new TenantPartnerController(
      service,
      billing,
      undefined!,
      jwt,
      undefined!,
    );
    const payload = {
      entrySlug: command.partnerEntrySlug,
      apiKey: "rate-test-yuhe-key",
      partnerUserRef: "rate-actual-partner-user",
      consentScope: "referral_attribution" as const,
    };
    const before = await ingress.issuePartnerIngressHandoff(payload);
    const prior = JSON.stringify(before.data);
    await controller.upsertReferralRevenueShareRule(command);
    const after = await ingress.issuePartnerIngressHandoff(payload);
    expect(after.data.drtsPassengerId).toBe(before.data.drtsPassengerId);
    expect(after.data.identity).toEqual(before.data.identity);
    expect(jwt.verify(after.data.accessToken)).toMatchObject({
      partnerEntrySlug: command.partnerEntrySlug,
      tenantId: "tenant-demo-001",
      partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
      partnerProgramId: "program-referral-community",
    });
    expect(JSON.stringify(before.data)).toBe(prior);
    expect(
      (await billing.getReferralStatement(command.partnerEntrySlug, "2026-06"))
        .totals.shareTotal.amountMinor,
    ).toBe(30000);
  });

  it("canonical rate edits preserve real issued driver statement, PDF bytes/hash and immutable order quote/PD snapshots after repository reload", async () => {
    const { controller, db, audit } = await setup();
    const store = new InMemoryDocumentArtifactStore();
    // Existing explicit noDB issuance produces the historical document; only the
    // external SQL/storage transport is SIM, no fixture PDF or private renderer.
    const issuer = new BillingSettlementService(
      audit,
      undefined,
      undefined,
      undefined,
      store,
    );
    issuer.publishDriverFeePlan({
      planName: "original-rate-test-plan",
      version: "2026-03",
      serviceFeeBps: 1000,
      reimbursementMode: "platform_funded",
    });
    const issued = (
      await issuer.generateDriverStatements({ periodMonth: "2026-03" })
    ).items;
    expect(issued.length).toBeGreaterThan(0);
    const statement = issued[0]!;
    const file = await store.get("report", statement.statementId);
    expect(file?.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const repository = new BillingSettlementRepository(db.asDatabase());
    await repository.persistChanges({ driverStatements: issued });
    const reader = new BillingSettlementService(
      audit,
      repository,
      undefined,
      undefined,
      store,
    );
    await reader.onModuleInit();
    expect(reader.getDriverStatement(statement.statementId)).toEqual(statement);
    const owned = new OwnedMobilityService(
      undefined!,
      audit,
      undefined!,
      undefined!,
    );
    const snapshots = JSON.stringify(owned.listOrders());
    await controller.upsertReferralRevenueShareRule(command);
    const fresh = new BillingSettlementService(
      audit,
      new BillingSettlementRepository(db.asDatabase()),
      undefined,
      undefined,
      store,
    );
    await fresh.onModuleInit();
    expect(
      (
        await fresh.resolveReferralRevenueShareRule(
          command.partnerEntrySlug,
          "2026-06-04T08:15:00Z",
        )
      )?.value,
    ).toBe(20);
    expect(fresh.getDriverStatement(statement.statementId)).toEqual(statement);
    expect(await store.get("report", statement.statementId)).toEqual(file);
    expect(JSON.stringify(owned.listOrders())).toBe(snapshots);
  });

  it("unrelated stale entry governance writes retain committed rate history while changing their own fields", async () => {
    const { controller, db } = await setup();
    const stale = clone(db.entries.get(command.partnerEntrySlug)!);
    await controller.upsertReferralRevenueShareRule(command);
    const configured = clone(
      (await controller.listReferralRevenueShareRules(command.partnerEntrySlug))
        .data.items,
    );
    await new TenantPartnerRepository(db.asDatabase()).persistChanges({
      partnerEntries: [{ ...stale, displayName: "原入口名稱更新" }],
    });
    expect(db.entries.get(command.partnerEntrySlug)?.displayName).toBe(
      "原入口名稱更新",
    );
    expect(
      (await controller.listReferralRevenueShareRules(command.partnerEntrySlug))
        .data.items,
    ).toEqual(configured);
  });
});
