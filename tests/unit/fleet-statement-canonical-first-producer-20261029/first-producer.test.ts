import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts/in-memory-document-artifact-store";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetStatementDecisionRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-statement-decision.repository";

/** Explicit external SQL IO SIM. Original repositories issue their actual SQL;
 * no Fleet, billing, decision, CRM or PDF business implementation is replaced. */
class SqlBoundarySIM {
  tables = new Map<string, Map<string, Record<string, unknown>>>();
  queries: string[] = [];
  isEnabled() {
    return true;
  }
  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
  async query(text: string, args: readonly unknown[] = []) {
    const sql = text.replace(/\s+/g, " ").trim();
    this.queries.push(sql);
    const out = (
      rows: Record<string, unknown>[] = [],
      rowCount = rows.length,
    ) => ({ rows: structuredClone(rows), rowCount });
    if (
      ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) ||
      sql.startsWith("SELECT pg_advisory_xact_lock(")
    )
      return out();
    const table = sql.match(
      /(?:FROM|INTO) ((?:admin|billing|crm)\.phase1_[a-z_]+)/,
    )?.[1];
    if (!table) throw Error("Unmapped actual SQL SIM: " + sql);
    const records =
      this.tables.get(table) ?? new Map<string, Record<string, unknown>>();
    this.tables.set(table, records);
    if (sql.startsWith("INSERT INTO")) {
      if (table === "billing.phase1_fleet_statement_decisions") {
        records.set(String(args[0]), {
          statement_id: args[0],
          fleet_partner_id: args[1],
          period_month: args[2],
          decision_status: args[3],
          decision_note: args[4],
          decided_by: args[5],
          decided_at: args[6],
          dispute_case_id: args[7],
          statement_snapshot: JSON.parse(String(args[8])),
        });
        return out([], 1);
      }
      const record = JSON.parse(String(args.at(-1))) as Record<string, unknown>;
      records.set(String(args[0]), {
        record,
        ...(table.endsWith("_statements")
          ? {
              statement_id: args[0],
              fleet_partner_id: args[1],
              period_month: args[2],
              payout_status: args[3],
            }
          : {}),
      });
      return out([], 1);
    }
    let rows = [...records.values()];
    if (sql.startsWith("SELECT")) {
      if (table === "billing.phase1_fleet_statement_decisions") {
        rows = rows.filter((x) =>
          sql.includes("WHERE d.statement_id = $1")
            ? x.statement_id === args[0] && x.fleet_partner_id === args[1]
            : x.fleet_partner_id === args[0] &&
              (args[1] === null || x.period_month === args[1]),
        );
        rows = rows.map((x) => ({
          ...x,
          current_payout_status: this.tables
            .get("billing.phase1_fleet_partner_statements")
            ?.get(String(x.statement_id))?.payout_status,
        }));
      } else if (table.endsWith("_statements")) {
        if (sql.includes("WHERE fleet_partner_id = $1"))
          rows = rows.filter(
            (x) =>
              x.fleet_partner_id === args[0] &&
              (args[1] === null || x.period_month === args[1]),
          );
        else if (sql.includes("WHERE period_month = $1"))
          rows = rows.filter(
            (x) =>
              x.period_month === args[0] &&
              (args[1] === null || x.fleet_partner_id === args[1]),
          );
        else if (sql.includes("WHERE statement_id = $1"))
          rows = rows.filter(
            (x) => x.statement_id === args[0] && x.fleet_partner_id === args[1],
          );
      } else if (sql.includes("WHERE fleet_partner_id = $1"))
        rows = rows.filter(
          (x) =>
            (x.record as Record<string, unknown>).fleetPartnerId === args[0],
        );
      return out(rows);
    }
    if (sql.startsWith("DELETE FROM") && table.endsWith("_statements")) {
      for (const [key, row] of records)
        if (
          row.period_month === args[0] &&
          (!args[1] || row.fleet_partner_id === args[1]) &&
          row.payout_status !== "paid"
        )
          records.delete(key);
      return out();
    }
    throw Error("Unmapped actual SQL SIM: " + sql);
  }
}
const fleet = "fleet-demo-001",
  rule = "fleet-rule-demo-001",
  month = "2026-03";
const identity = {
  realm: "partner",
  actorType: "partner_user",
  actorId: "SIM-fleet-finance",
  partnerId: fleet,
} as BootstrapRequestIdentity;
afterEach(() => vi.restoreAllMocks());
async function makeWorld() {
  const sql = new SqlBoundarySIM();
  const artifactsA = new InMemoryDocumentArtifactStore(),
    artifactsB = new InMemoryDocumentArtifactStore();
  const billingA = new BillingSettlementService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      artifactsA,
    ),
    billingB = new BillingSettlementService(
      new AuditNotificationService(),
      undefined,
      undefined,
      undefined,
      artifactsB,
    );
  for (const billing of [billingA, billingB]) {
    await billing.onModuleInit();
    await billing.publishDriverFeePlan({
      planName: "SIM C068 original fee engine",
      version: "SIM-C068-fee",
      serviceFeeBps: 1300,
      reimbursementMode: "platform_funded",
    });
  }
  const repository = new FleetPartnerRepository(sql as never);
  const complaints = new ComplaintRepository(sql as never);
  const decisions = new FleetStatementDecisionRepository(
    sql as never,
    complaints,
  );
  const a = new FleetPartnerService(
      billingA,
      {} as never,
      {} as never,
      repository,
      decisions,
    ),
    b = new FleetPartnerService(
      billingB,
      {} as never,
      {} as never,
      repository,
      decisions,
    );
  await a.onModuleInit();
  await b.onModuleInit();
  const ca = new FleetPartnerController(
      a,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
    cb = new FleetPartnerController(
      b,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  expect(a.getRevenueShareRule(fleet, rule).rateBps).toBe(800);
  expect(b.getRevenueShareRule(fleet, rule).rateBps).toBe(800);
  ca.updateRevenueShareRule(
    fleet,
    rule,
    { rateBps: 1600 },
    "SIM-original-config-update",
  );
  const committed = (await repository.loadState()).revenueShareRules.find(
    (x) => x.ruleId === rule,
  )!;
  expect(committed.rateBps).toBe(1600);
  expect(await repository.loadStatements(fleet, month)).toEqual([]);
  return {
    sql,
    repository,
    complaints,
    decisions,
    a,
    b,
    ca,
    cb,
    billingA,
    billingB,
    artifactsA,
    artifactsB,
  };
}
async function world(reader: "A" | "B") {
  const x = await makeWorld();
  const result = await (
    reader === "A" ? x.ca : x.cb
  ).listPortalFleetPartnerStatements(fleet, month, "SIM-first-producer");
  const stored = await x.repository.loadStatements(fleet, month);
  expect(stored).toHaveLength(1);
  expect(result.data.items).toEqual(stored);
  expect(stored[0]!.lines.length).toBeGreaterThan(0);
  return {
    reader,
    committedRate: 1600,
    statementId: stored[0]!.statementId,
    shareMinor: stored[0]!.shareAmount.amountMinor,
    lines: stored[0]!.lines.map((line) => ({
      orderId: line.orderId,
      driverId: line.driverId,
      grossMinor: line.grossEarning?.amountMinor,
      shareMinor: line.shareAmount.amountMinor,
    })),
    queries: x.sql.queries.length,
  };
}
describe("C068 same canonical original Fleet rule, ordinary first-period producer; SQL boundary SIM", () => {
  it("already started B first normal period GET uses A committed original rate, matching A first normal GET in an otherwise identical separate SQL authority", async () => {
    const reference = await world("A");
    const warm = await world("B");
    writeFileSync(
      process.env.C068_OBSERVATION ?? "C068-first-producer-observation.json",
      JSON.stringify(
        {
          reference,
          warm,
          scope:
            "Two isolated equal SQL SIM authorities; each normal update commits before its first ordinary statement generation. No already issued/decided statement repricing, no real PSP or PG.",
        },
        null,
        2,
      ) + "\n",
    );
    expect(warm.statementId).toBe(reference.statementId);
    expect(warm.lines.map((line) => line.orderId)).toEqual(
      reference.lines.map((line) => line.orderId),
    );
    expect(warm.shareMinor).toBe(reference.shareMinor);
  });
  it("uses a normally committed later affiliation and existing driver-group rule with original precedence at first generation", async () => {
    const x = await makeWorld();
    const affiliation = await x.ca.createDriverFleetAffiliation(
      "drv-demo-001",
      {
        fleetPartnerId: fleet,
        affiliationType: "managed_by",
        effectiveFrom: "2026-03-01T00:00:00.000Z",
        driverGroupId: "SIM-new-group",
      },
    );
    const configured = x.ca.createRevenueShareRule(fleet, {
      appliesTo: "driver_group",
      driverGroupId: "SIM-new-group",
      formula: "fixed_per_trip",
      fixedAmountMinor: 12345,
      effectiveFrom: "2026-03-01T00:00:00.000Z",
    }).data;
    const result = (await x.cb.listPortalFleetPartnerStatements(fleet, month))
      .data.items[0]!;
    const lines = result.lines.filter(
      (line) => line.driverId === "drv-demo-001",
    );
    expect(lines).toHaveLength(2);
    for (const line of lines)
      expect(line).toMatchObject({
        affiliationId: affiliation.data.affiliationId,
        ruleId: configured.ruleId,
        shareAmount: { currency: "TWD", amountMinor: 12345 },
      });
    expect(
      result.lines.filter((line) => line.driverId === "drv-demo-002"),
    ).toHaveLength(1);
    expect(
      result.lines.find((line) => line.driverId === "drv-demo-002")?.ruleId,
    ).toBe(rule);
  });
  it("propagates either canonical input read failure before billing generation or Fleet statement persistence", async () => {
    for (const method of [
      "loadRevenueShareRules",
      "loadDriverAffiliations",
    ] as const) {
      const x = await makeWorld();
      const generate = vi.spyOn(x.billingB, "generateDriverStatements");
      const replace = vi.spyOn(x.repository, "replaceStatementsForPeriodMonth");
      vi.spyOn(x.repository, method).mockRejectedValue(
        new Error("SIM canonical source unavailable"),
      );
      await expect(
        x.cb.listPortalFleetPartnerStatements(fleet, month),
      ).rejects.toThrow("SIM canonical source unavailable");
      expect(generate).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(await x.repository.loadStatements(fleet, month)).toEqual([]);
    }
  });
  it("retains original explicit zero-share exclusion and fixed-per-trip minor amount behavior", async () => {
    const x = await makeWorld();
    x.ca.updateRevenueShareRule(fleet, rule, {
      formula: "fixed_per_trip",
      fixedAmountMinor: 0,
    });
    expect(
      (await x.cb.listPortalFleetPartnerStatements(fleet, month)).data.items,
    ).toEqual([]);
    expect(await x.repository.loadStatements(fleet, month)).toEqual([]);
    x.ca.updateRevenueShareRule(fleet, rule, { fixedAmountMinor: 12345 });
    const statement = (
      await x.cb.listPortalFleetPartnerStatements(fleet, month)
    ).data.items[0]!;
    expect(statement.lines).toHaveLength(3);
    expect(statement.shareAmount.amountMinor).toBe(37035);
    for (const line of statement.lines)
      expect(line.shareAmount.amountMinor).toBe(12345);
  });
  it("keeps future and expired higher-affinity rules outside their original effective periods", async () => {
    const x = await makeWorld();
    for (const period of [
      { effectiveFrom: "2027-01-01T00:00:00.000Z" },
      {
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: "2026-02-28T23:59:59.000Z",
      },
    ])
      x.ca.createRevenueShareRule(fleet, {
        appliesTo: "driver_group",
        driverGroupId: "demo-core-drivers",
        formula: "fixed_per_trip",
        fixedAmountMinor: 99999,
        ...period,
      });
    const statement = (
      await x.cb.listPortalFleetPartnerStatements(fleet, month)
    ).data.items[0]!;
    expect(statement.shareAmount.amountMinor).toBe(56000);
    expect(statement.lines.every((line) => line.ruleId === rule)).toBe(true);
  });
  it("does not hydrate producer caches from a delayed rule snapshot over a normal local writer", async () => {
    const x = await makeWorld();
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
      }),
      released = new Promise<void>((resolve) => {
        release = resolve;
      });
    const read = x.repository.loadRevenueShareRules.bind(x.repository);
    let hold = true;
    vi.spyOn(x.repository, "loadRevenueShareRules").mockImplementation(
      async () => {
        const rows = await read();
        if (hold) {
          hold = false;
          enter();
          await released;
        }
        return rows;
      },
    );
    const old = x.cb.listPortalFleetPartnerStatements(fleet, month);
    await entered;
    try {
      x.cb.updateRevenueShareRule(fleet, rule, { rateBps: 2400 });
      expect(
        (await x.repository.loadState()).revenueShareRules.find(
          (value) => value.ruleId === rule,
        )?.rateBps,
      ).toBe(2400);
    } finally {
      release();
    }
    expect((await old).data.items[0]?.shareAmount.amountMinor).toBe(56000);
    expect(x.b.getRevenueShareRule(fleet, rule).rateBps).toBe(2400);
    expect((await read()).find((value) => value.ruleId === rule)?.rateBps).toBe(
      2400,
    );
  });
  it("treats empty committed rule or affiliation sets as empty instead of resurrecting original seed cache", async () => {
    for (const table of [
      "billing.phase1_fleet_partner_revenue_share_rules",
      "admin.phase1_driver_fleet_affiliations",
    ]) {
      const x = await makeWorld();
      x.sql.tables.get(table)!.clear(); // External SQL-boundary cleanup SIM, not a claimed new delete API.
      expect(x.b.listRevenueShareRules(fleet)).not.toHaveLength(0);
      expect(x.b.listFleetPartnerDrivers(fleet)).not.toHaveLength(0);
      expect(
        (await x.cb.listPortalFleetPartnerStatements(fleet, month)).data.items,
      ).toEqual([]);
      expect(await x.repository.loadStatements(fleet, month)).toEqual([]);
    }
  });
  it("preserves original confirmed decision snapshot and the already produced driver PDF bytes on normal later reads", async () => {
    const x = await makeWorld();
    const first = (await x.cb.listPortalFleetPartnerStatements(fleet, month))
      .data.items[0]!;
    const driver = x.billingB.listDriverStatements(month)[0]!;
    const original = await x.artifactsB.get("report", driver.statementId);
    expect(original?.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(original!.record.sha256).toBe(
      createHash("sha256").update(original!.bytes).digest("hex"),
    );
    const confirmed = (
      await x.ca.confirmPortalStatement(
        fleet,
        undefined,
        first.statementId,
        {},
        "SIM-confirm",
        identity,
      )
    ).data;
    expect(confirmed.decisionStatus).toBe("confirmed");
    x.ca.updateRevenueShareRule(fleet, rule, { rateBps: 2400 });
    const later = (await x.cb.listPortalFleetPartnerStatements(fleet, month))
      .data.items[0]!;
    expect(later.shareAmount).toEqual(first.shareAmount);
    expect(later.lines).toEqual(first.lines);
    expect(later.decisionStatus).toBe("confirmed");
    expect(
      (
        await x.ca.confirmPortalStatement(
          fleet,
          undefined,
          first.statementId,
          {},
          "SIM-confirm-replay",
          identity,
        )
      ).data,
    ).toEqual(later);
    const reread = await x.artifactsB.get("report", driver.statementId);
    expect(reread!.bytes.equals(original!.bytes)).toBe(true);
    expect(reread!.record.sha256).toBe(original!.record.sha256);
    writeFileSync(
      "C068-confirmed-PDF-preservation-observation.json",
      JSON.stringify(
        {
          statementId: first.statementId,
          driverStatementId: driver.statementId,
          pdfBytes: original!.bytes.length,
          pdfHash: original!.record.sha256,
          decisionStatus: later.decisionStatus,
          shareAmount: later.shareAmount,
          scope:
            "Actual original PDF bytes and original decision snapshot, private memory storage/SQL SIM; no real payout.",
        },
        null,
        2,
      ) + "\n",
    );
  });
  it("retains original normal dispute, one same-statement CRM case, replay and conflicting-decision behavior", async () => {
    const x = await makeWorld();
    const first = (await x.cb.listPortalFleetPartnerStatements(fleet, month))
      .data.items[0]!;
    const decided = (
      await x.ca.disputePortalStatement(
        fleet,
        undefined,
        first.statementId,
        { reason: "SIM same statement totals review" },
        "SIM-dispute",
        identity,
      )
    ).data;
    expect(decided.decisionStatus).toBe("disputed");
    expect(decided.disputeCaseId).toBeTruthy();
    const crm = await x.complaints.loadState();
    expect(crm.complaintCases).toHaveLength(1);
    expect(crm.complaintCases[0]).toMatchObject({
      caseNo: decided.disputeCaseId,
      fleetPartnerId: fleet,
      relatedStatementId: first.statementId,
      category: "settlement_dispute",
    });
    expect(crm.complaintTimelines).toHaveLength(1);
    expect(
      (await x.cb.listPortalFleetPartnerStatements(fleet)).data.items[0],
    ).toEqual(decided);
    expect(
      (
        await x.cb.disputePortalStatement(
          fleet,
          undefined,
          first.statementId,
          { reason: "SIM same statement totals review" },
          "SIM-replay",
          identity,
        )
      ).data,
    ).toEqual(decided);
    await expect(
      x.cb.confirmPortalStatement(
        fleet,
        undefined,
        first.statementId,
        {},
        "SIM-conflict",
        identity,
      ),
    ).rejects.toMatchObject({ code: "STATEMENT_DECISION_CONFLICT" });
    expect((await x.complaints.loadState()).complaintCases).toHaveLength(1);
  });
  it("retains disabled-database original local generation and original missing-fleet error", async () => {
    const billing = new BillingSettlementService(
      new AuditNotificationService(),
    );
    await billing.onModuleInit();
    await billing.publishDriverFeePlan({
      planName: "SIM C068 original no-DB fee engine",
      version: "SIM-C068-local-fee",
      serviceFeeBps: 1300,
      reimbursementMode: "platform_funded",
    });
    const service = new FleetPartnerService(billing, {} as never, {} as never);
    const controller = new FleetPartnerController(
      service,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    controller.updateRevenueShareRule(fleet, rule, { rateBps: 1600 });
    expect(
      (await controller.listPortalFleetPartnerStatements(fleet, month)).data
        .items[0]?.shareAmount.amountMinor,
    ).toBe(56000);
    await expect(
      controller.listPortalFleetPartnerStatements("SIM-no-fleet", month),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await new FleetPartnerRepository().loadRevenueShareRules()).toEqual(
      [],
    );
  });
});
