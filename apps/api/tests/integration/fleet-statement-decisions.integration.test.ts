import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  FleetPartnerStatementRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import type { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { ComplaintRepository } from "../../src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { FleetPartnerCaseService } from "../../src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerRepository } from "../../src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";
import {
  FleetStatementDecisionRepository,
  statementDecisionLockKey,
} from "../../src/modules/fleet-partner/fleet-statement-decision.repository";
import type { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import type { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

// The ordinary hosted integration job applies the real migrations before this
// suite. Missing PostgreSQL or V0117 must fail, never silently skip these cases.
const DATABASE_URL = process.env.DATABASE_URL;
const PERIOD_MONTH = "2099-10";
const FIXTURE_AT = "2099-10-31T12:00:00.000Z";

type Fixture = {
  fleetPartnerId: string;
  actorId: string;
  statement: FleetPartnerStatementRecord;
};

class FailAfterComplaintWrites extends ComplaintRepository {
  wroteCaseAndTimeline = false;

  override async persistChanges(
    ...args: Parameters<ComplaintRepository["persistChanges"]>
  ) {
    await super.persistChanges(...args);
    const [changes, transaction] = args;
    if (!transaction) throw new Error("Expected the decision transaction");
    const caseNo = changes.complaintCases?.[0]?.caseNo;
    const cases = await transaction.query(
      "SELECT 1 FROM crm.phase1_complaint_cases WHERE case_no = $1",
      [caseNo],
    );
    const timeline = await transaction.query(
      "SELECT 1 FROM crm.phase1_complaint_timelines WHERE case_no = $1",
      [caseNo],
    );
    this.wroteCaseAndTimeline = cases.rowCount === 1 && timeline.rowCount === 1;
    throw new Error("FLEET_DECISION_INJECTED_AFTER_COMPLAINT_WRITES");
  }
}

describe("fleet statement decisions against migrated PostgreSQL", () => {
  const databases: DatabaseService[] = [];
  const fleetPartnerIds = new Set<string>();

  function database() {
    const instance = new DatabaseService();
    databases.push(instance);
    return instance;
  }

  function decisions(db: DatabaseService) {
    return new FleetStatementDecisionRepository(
      db,
      new ComplaintRepository(db),
    );
  }

  async function seed(
    db: DatabaseService,
    payoutStatus: FleetPartnerStatementRecord["payoutStatus"] = "pending",
  ): Promise<Fixture> {
    const id = randomUUID();
    const fleetPartnerId = `fleet-decision-pg-${id}`;
    fleetPartnerIds.add(fleetPartnerId);
    const money = (amountMinor: number) => ({ amountMinor, currency: "TWD" });
    const statement: FleetPartnerStatementRecord = {
      statementId: `statement-pg-${id}`,
      fleetPartnerId,
      periodMonth: PERIOD_MONTH,
      payoutStatus,
      grossEarningBasis: money(120_000),
      driverNetAmountBasis: money(96_000),
      shareAmount: money(12_000),
      sponsorFundedTripCount: 0,
      sponsorFundedGrossEarningBasis: money(0),
      sponsorFundedShareAmount: money(0),
      reimbursementAmount: money(0),
      lines: [
        {
          lineId: `line-pg-${id}`,
          ruleId: `rule-pg-${id}`,
          formula: "percent_of_gross",
          orderId: null,
          driverId: null,
          affiliationId: null,
          grossEarning: money(120_000),
          driverNetAmount: money(96_000),
          shareAmount: money(12_000),
          completedAt: FIXTURE_AT,
          metadata: {
            appliesTo: "all_trips",
            serviceProduct: null,
            tenantServiceProgramId: null,
            sourcePlatform: null,
            driverGroupId: null,
            orderSource: null,
            settlementChannelKey: "owned_internal",
            sponsorFunded: false,
            partnerId: null,
            partnerProgramId: null,
            benefitReference: null,
            issuerAuthorizationRef: null,
            reimbursementAmount: null,
          },
        },
      ],
      createdAt: FIXTURE_AT,
      updatedAt: FIXTURE_AT,
    };
    await new FleetPartnerRepository(db).persistChanges({
      fleetPartners: [
        {
          fleetPartnerId,
          legalName: "Statement integration fixture",
          displayName: "Statement integration fixture",
          businessRegistrationNo: "TEST-ONLY",
          contactName: "Integration fixture",
          contactPhone: "0000000000",
          active: true,
          partnershipType: "fleet_management",
        },
      ],
      statements: [statement],
    });
    return { fleetPartnerId, actorId: `actor-pg-${id}`, statement };
  }

  async function rowsFor(db: DatabaseService, fixture: Fixture) {
    const [statement, decision, cases, timeline] = await Promise.all([
      db.query(
        "SELECT * FROM billing.phase1_fleet_partner_statements WHERE statement_id = $1",
        [fixture.statement.statementId],
      ),
      db.query(
        "SELECT * FROM billing.phase1_fleet_statement_decisions WHERE fleet_partner_id = $1 ORDER BY statement_id",
        [fixture.fleetPartnerId],
      ),
      db.query<{ record: ComplaintCaseRecord }>(
        "SELECT * FROM crm.phase1_complaint_cases WHERE record->>'fleetPartnerId' = $1 ORDER BY case_no",
        [fixture.fleetPartnerId],
      ),
      db.query<{ record: ComplaintTimelineEntry }>(
        `SELECT t.* FROM crm.phase1_complaint_timelines t
         JOIN crm.phase1_complaint_cases c ON c.case_no = t.case_no
         WHERE c.record->>'fleetPartnerId' = $1 ORDER BY t.entry_id`,
        [fixture.fleetPartnerId],
      ),
    ]);
    return {
      statement: statement.rows,
      decision: decision.rows,
      cases: cases.rows,
      timeline: timeline.rows,
    };
  }

  // Queue both real database backends behind one transaction lock, observing
  // their wait state before releasing it. This avoids a timing-only "race".
  async function race<T>(statementId: string, calls: (() => Promise<T>)[]) {
    const monitor = database();
    const gate = await database().connect();
    let pending: Promise<PromiseSettledResult<T>[]> | undefined;
    try {
      await gate.query("BEGIN");
      await gate.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [statementDecisionLockKey(statementId)],
      );
      const pid = await gate.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      pending = Promise.allSettled(calls.map((call) => call()));
      const deadline = Date.now() + 5_000;
      let blocked = 0;
      while (Date.now() < deadline) {
        const result = await monitor.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM pg_stat_activity
           WHERE $1 = ANY(pg_blocking_pids(pid))`,
          [pid.rows[0]!.pid],
        );
        blocked = result.rows[0]!.count;
        if (blocked >= calls.length) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(
        blocked,
        "Both independent pools must reach the database lock",
      ).toBe(calls.length);
      await gate.query("COMMIT");
      return await pending;
    } finally {
      try {
        await gate.query("ROLLBACK");
      } finally {
        gate.release();
      }
      // Never leave unobserved work holding connections if an assertion fails.
      await pending;
    }
  }

  beforeEach(() => {
    expect(
      DATABASE_URL,
      "Hosted PostgreSQL is required for this suite",
    ).toBeTruthy();
  });

  afterEach(async () => {
    try {
      if (DATABASE_URL && fleetPartnerIds.size > 0) {
        const cleanup = database();
        const ids = [...fleetPartnerIds];
        // Only UUID-scoped rows owned by this test are removed. Decisions must
        // be removed before cases because V0117 enforces the real case FK.
        await cleanup.query(
          "DELETE FROM billing.phase1_fleet_statement_decisions WHERE fleet_partner_id = ANY($1::text[])",
          [ids],
        );
        await cleanup.query(
          `DELETE FROM crm.phase1_complaint_timelines t
           USING crm.phase1_complaint_cases c
           WHERE t.case_no = c.case_no
             AND c.record->>'fleetPartnerId' = ANY($1::text[])`,
          [ids],
        );
        await cleanup.query(
          "DELETE FROM crm.phase1_complaint_cases WHERE record->>'fleetPartnerId' = ANY($1::text[])",
          [ids],
        );
        await cleanup.query(
          "DELETE FROM billing.phase1_fleet_partner_statements WHERE fleet_partner_id = ANY($1::text[])",
          [ids],
        );
        await cleanup.query(
          "DELETE FROM admin.phase1_fleet_partners WHERE fleet_partner_id = ANY($1::text[])",
          [ids],
        );
      }
    } finally {
      fleetPartnerIds.clear();
      await Promise.all(databases.splice(0).map((db) => db.onModuleDestroy()));
    }
  });

  it("uses the production decision and CRM tables installed by migrations", async () => {
    const result = await database().query<{
      decisions: string | null;
      cases: string | null;
      timeline: string | null;
    }>(
      `SELECT to_regclass('billing.phase1_fleet_statement_decisions')::text AS decisions,
              to_regclass('crm.phase1_complaint_cases')::text AS cases,
              to_regclass('crm.phase1_complaint_timelines')::text AS timeline`,
    );
    expect(result.rows[0]).toEqual({
      decisions: "billing.phase1_fleet_statement_decisions",
      cases: "crm.phase1_complaint_cases",
      timeline: "crm.phase1_complaint_timelines",
    });
  });

  it("persists confirmation for a fresh instance and returns the original actor/time on retry", async () => {
    const db = database();
    const fixture = await seed(db);
    const before = await rowsFor(db, fixture);
    const result = await decisions(db).decide(
      fixture.fleetPartnerId,
      fixture.statement.statementId,
      fixture.actorId,
      "confirmed",
      "  Totals checked  ",
    );
    expect(result).toMatchObject({
      ...fixture.statement,
      decisionStatus: "confirmed",
      confirmNote: "Totals checked",
      confirmedBy: fixture.actorId,
      confirmedAt: expect.any(String),
      disputeCaseId: null,
    });
    const fresh = decisions(database());
    expect(
      await fresh.listDecisions(fixture.fleetPartnerId, PERIOD_MONTH),
    ).toEqual([result]);
    expect(
      await fresh.decide(
        fixture.fleetPartnerId,
        fixture.statement.statementId,
        "different-retry-actor",
        "confirmed",
        "Totals checked",
      ),
    ).toEqual(result);
    const after = await rowsFor(db, fixture);
    expect(after.statement).toEqual(before.statement);
    expect(after.decision).toHaveLength(1);
    expect(after.cases).toEqual([]);
    expect(after.timeline).toEqual([]);
  });

  it("allows a confirmation without a note and rejects changing its saved payload", async () => {
    const db = database();
    const fixture = await seed(db);
    const repository = decisions(db);
    const result = await repository.decide(
      fixture.fleetPartnerId,
      fixture.statement.statementId,
      fixture.actorId,
      "confirmed",
      undefined,
    );
    expect(result.confirmNote).toBe("");
    const beforeRetry = await rowsFor(db, fixture);
    await expect(
      decisions(database()).decide(
        fixture.fleetPartnerId,
        fixture.statement.statementId,
        fixture.actorId,
        "confirmed",
        "Changed after confirming",
      ),
    ).rejects.toMatchObject({ code: "STATEMENT_DECISION_CONFLICT" });
    expect(await rowsFor(db, fixture)).toEqual(beforeRetry);
  });

  it("retains the reviewed snapshot after real monthly replacement and removal", async () => {
    const db = database();
    const fixture = await seed(db);
    const confirmed = await decisions(db).decide(
      fixture.fleetPartnerId,
      fixture.statement.statementId,
      fixture.actorId,
      "confirmed",
      "Original amounts approved",
    );
    const replacement = {
      ...fixture.statement,
      shareAmount: { currency: "TWD", amountMinor: 99_999 },
      updatedAt: "2099-11-01T00:00:00.000Z",
    };
    const rebuild = new FleetPartnerRepository(database());
    await rebuild.replaceStatementsForPeriodMonth(
      PERIOD_MONTH,
      [replacement],
      fixture.fleetPartnerId,
    );
    expect((await rowsFor(db, fixture)).statement[0]?.record).toEqual(
      replacement,
    );
    expect(
      await decisions(database()).listDecisions(fixture.fleetPartnerId),
    ).toEqual([confirmed]);
    await rebuild.replaceStatementsForPeriodMonth(
      PERIOD_MONTH,
      [],
      fixture.fleetPartnerId,
    );
    expect((await rowsFor(db, fixture)).statement).toEqual([]);
    const fresh = decisions(database());
    expect(await fresh.listDecisions(fixture.fleetPartnerId)).toEqual([
      confirmed,
    ]);
    expect(
      await fresh.decide(
        fixture.fleetPartnerId,
        fixture.statement.statementId,
        fixture.actorId,
        "confirmed",
        "Original amounts approved",
      ),
    ).toEqual(confirmed);
  });

  it("commits one dispute case and initial timeline, replays it, and refuses conflicting retries", async () => {
    const db = database();
    const fixture = await seed(db);
    const before = await rowsFor(db, fixture);
    const result = await decisions(db).decide(
      fixture.fleetPartnerId,
      fixture.statement.statementId,
      fixture.actorId,
      "disputed",
      "  Missing completed trip  ",
    );
    expect(result).toMatchObject({
      ...fixture.statement,
      decisionStatus: "disputed",
      disputeReason: "Missing completed trip",
      disputedBy: fixture.actorId,
      disputedAt: expect.any(String),
      disputeCaseId: expect.any(String),
    });
    const committed = await rowsFor(db, fixture);
    expect(committed.statement).toEqual(before.statement);
    expect(committed.decision).toHaveLength(1);
    expect(committed.cases).toHaveLength(1);
    expect(committed.timeline).toHaveLength(1);
    const complaint = committed.cases[0]!.record;
    expect(complaint).toMatchObject({
      caseNo: result.disputeCaseId,
      fleetPartnerId: fixture.fleetPartnerId,
      relatedStatementId: fixture.statement.statementId,
      category: "settlement_dispute",
      severity: "normal",
      status: "new",
      description: "Missing completed trip",
      createdAt: result.disputedAt,
    });
    expect(
      Date.parse(complaint.slaDueAt) - Date.parse(complaint.createdAt),
    ).toBe(48 * 60 * 60 * 1_000);
    expect(committed.timeline[0]!.record).toMatchObject({
      caseNo: result.disputeCaseId,
      action: "case_created",
      createdAt: result.disputedAt,
    });
    const fresh = decisions(database());
    expect(await fresh.listDecisions(fixture.fleetPartnerId)).toEqual([result]);
    expect(
      await fresh.decide(
        fixture.fleetPartnerId,
        fixture.statement.statementId,
        fixture.actorId,
        "disputed",
        "Missing completed trip",
      ),
    ).toEqual(result);
    for (const [action, note] of [
      ["disputed", "Different reason"],
      ["confirmed", undefined],
    ] as const) {
      await expect(
        fresh.decide(
          fixture.fleetPartnerId,
          fixture.statement.statementId,
          fixture.actorId,
          action,
          note,
        ),
      ).rejects.toMatchObject({ code: "STATEMENT_DECISION_CONFLICT" });
    }
    expect(await rowsFor(db, fixture)).toEqual(committed);
  });

  it("shows a later authoritative paid status without changing reviewed amounts or the decision", async () => {
    const db = database();
    const fixture = await seed(db);
    const confirmed = await decisions(db).decide(
      fixture.fleetPartnerId,
      fixture.statement.statementId,
      fixture.actorId,
      "confirmed",
      "Reviewed before payout",
    );
    const decisionBefore = (await rowsFor(db, fixture)).decision;
    // Keep the old JSON status to prove the authoritative payout column wins.
    await db.query(
      "UPDATE billing.phase1_fleet_partner_statements SET payout_status = 'paid' WHERE statement_id = $1",
      [fixture.statement.statementId],
    );
    const beforeRead = await rowsFor(db, fixture);
    const fresh = decisions(database());
    const expected = { ...confirmed, payoutStatus: "paid" };
    expect(await fresh.listDecisions(fixture.fleetPartnerId)).toEqual([
      expected,
    ]);
    expect(
      await fresh.decide(
        fixture.fleetPartnerId,
        fixture.statement.statementId,
        fixture.actorId,
        "confirmed",
        "Reviewed before payout",
      ),
    ).toEqual(expected);
    expect((await rowsFor(db, fixture)).decision).toEqual(decisionBefore);
    expect(await rowsFor(db, fixture)).toEqual(beforeRead);

    // Exercise the production GET-with-period service and its real database
    // rebuild. Only upstream billing inputs are empty fixtures; persistence,
    // decision overlay and the paid-status source are production code.
    const billingInputs = {
      generateDriverStatements: async () => ({
        items: [],
        reimbursementBatchIds: [],
      }),
      listDriverStatements: () => [],
      listSettlementTripsForPeriodMonth: async () => [],
    } as unknown as BillingSettlementService;
    const readerDb = database();
    const reader = new FleetPartnerService(
      billingInputs,
      {} as OwnedMobilityService,
      {} as RegulatoryRegistryService,
      new FleetPartnerRepository(readerDb),
      decisions(readerDb),
    );
    await reader.onModuleInit();
    expect(
      await reader.listFleetPartnerStatements(
        fixture.fleetPartnerId,
        PERIOD_MONTH,
      ),
    ).toEqual([expected]);
    expect(await rowsFor(db, fixture)).toEqual(beforeRead);
  });

  it("refreshes a running Fleet case service with another replica's committed dispute", async () => {
    const db = database();
    const fixture = await seed(db);
    const other = await seed(db);
    const complaints = new ComplaintService(
      new AuditNotificationService(),
      new ComplaintRepository(db),
    );
    await complaints.onModuleInit();
    const cases = new FleetPartnerCaseService(complaints);
    const result = await decisions(database()).decide(
      fixture.fleetPartnerId,
      fixture.statement.statementId,
      fixture.actorId,
      "disputed",
      "Case created by another API replica",
    );
    expect(result.disputeCaseId).toBeTruthy();
    const caseId = result.disputeCaseId!;
    expect(await cases.listCases(fixture.fleetPartnerId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: caseId,
          fleetPartnerId: fixture.fleetPartnerId,
          cat: "settlement_dispute",
          desc: "Case created by another API replica",
        }),
      ]),
    );
    expect(
      (await cases.listCases(other.fleetPartnerId)).some(
        (item) => item.id === caseId,
      ),
    ).toBe(false);
    const timeline = await cases.getCaseTimeline(
      fixture.fleetPartnerId,
      caseId,
    );
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      caseId,
      body: expect.stringContaining("Case created by another API replica"),
    });
    await expect(
      cases.getCaseTimeline(other.fleetPartnerId, caseId),
    ).rejects.toMatchObject({
      code: "CASE_NOT_FLEET_SCOPED",
    });
  });

  it("serializes a monthly rebuild with a concurrent decision on its statement", async () => {
    const db = database();
    const fixture = await seed(db);
    const repository = decisions(db);
    const rebuild = new FleetPartnerRepository(database());
    const replacement = {
      ...fixture.statement,
      shareAmount: { currency: "TWD", amountMinor: 24_000 },
      updatedAt: "2099-11-01T00:00:00.000Z",
    };
    const results = await race<unknown>(fixture.statement.statementId, [
      () =>
        repository.decide(
          fixture.fleetPartnerId,
          fixture.statement.statementId,
          fixture.actorId,
          "confirmed",
          "Concurrent rebuild",
        ),
      () =>
        rebuild.replaceStatementsForPeriodMonth(
          PERIOD_MONTH,
          [replacement],
          fixture.fleetPartnerId,
        ),
    ]);
    expect(results.map((item) => item.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    const saved = await decisions(database()).listDecisions(
      fixture.fleetPartnerId,
    );
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      statementId: fixture.statement.statementId,
      decisionStatus: "confirmed",
      confirmNote: "Concurrent rebuild",
    });
    const decisionRows = (await rowsFor(db, fixture)).decision;
    expect(decisionRows).toHaveLength(1);
    expect([fixture.statement, replacement]).toContainEqual(
      decisionRows[0]!.statement_snapshot,
    );
  }, 15_000);

  it("deduplicates simultaneous identical disputes from two independent pools", async () => {
    const db = database();
    const fixture = await seed(db);
    const repositories = [decisions(db), decisions(database())];
    const results = await race(
      fixture.statement.statementId,
      repositories.map(
        (repository) => () =>
          repository.decide(
            fixture.fleetPartnerId,
            fixture.statement.statementId,
            fixture.actorId,
            "disputed",
            "One missing trip",
          ),
      ),
    );
    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]).toEqual(results[0]);
    const persisted = await rowsFor(db, fixture);
    expect(persisted.decision).toHaveLength(1);
    expect(persisted.cases).toHaveLength(1);
    expect(persisted.timeline).toHaveLength(1);
  }, 15_000);

  it("chooses one immutable outcome when confirmation races a dispute", async () => {
    const db = database();
    const fixture = await seed(db);
    const repositoryA = decisions(db);
    const repositoryB = decisions(database());
    const results = await race(fixture.statement.statementId, [
      () =>
        repositoryA.decide(
          fixture.fleetPartnerId,
          fixture.statement.statementId,
          fixture.actorId,
          "confirmed",
          undefined,
        ),
      () =>
        repositoryB.decide(
          fixture.fleetPartnerId,
          fixture.statement.statementId,
          fixture.actorId,
          "disputed",
          "Amount does not match",
        ),
    ]);
    const winners = results.filter((result) => result.status === "fulfilled");
    const losers = results.filter((result) => result.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]!.reason).toMatchObject({
      code: "STATEMENT_DECISION_CONFLICT",
    });
    const winner = winners[0]!.value;
    const persisted = await rowsFor(db, fixture);
    expect(persisted.decision).toHaveLength(1);
    expect(persisted.cases).toHaveLength(
      winner.decisionStatus === "disputed" ? 1 : 0,
    );
    expect(persisted.timeline).toHaveLength(persisted.cases.length);
    expect(
      await decisions(database()).listDecisions(fixture.fleetPartnerId),
    ).toEqual([winner]);
  }, 15_000);

  it("rolls back actual complaint writes when their transaction fails, then permits a clean retry", async () => {
    const db = database();
    const fixture = await seed(db);
    const before = await rowsFor(db, fixture);
    const complaints = new FailAfterComplaintWrites(db);
    const repository = new FleetStatementDecisionRepository(db, complaints);
    await expect(
      repository.decide(
        fixture.fleetPartnerId,
        fixture.statement.statementId,
        fixture.actorId,
        "disputed",
        "Retry after a transient transaction failure",
      ),
    ).rejects.toThrow("FLEET_DECISION_INJECTED_AFTER_COMPLAINT_WRITES");
    expect(complaints.wroteCaseAndTimeline).toBe(true);
    expect(await rowsFor(database(), fixture)).toEqual(before);
    await decisions(database()).decide(
      fixture.fleetPartnerId,
      fixture.statement.statementId,
      fixture.actorId,
      "disputed",
      "Retry after a transient transaction failure",
    );
    const retried = await rowsFor(db, fixture);
    expect(retried.decision).toHaveLength(1);
    expect(retried.cases).toHaveLength(1);
    expect(retried.timeline).toHaveLength(1);
    expect(retried.statement).toEqual(before.statement);
  });

  it("rolls back case and timeline if PostgreSQL rejects the decision insert", async () => {
    const db = database();
    const fixture = await seed(db);
    const before = await rowsFor(db, fixture);
    await expect(
      decisions(db).decide(
        fixture.fleetPartnerId,
        fixture.statement.statementId,
        "a".repeat(256), // Exceeds V0117's decided_by varchar(255).
        "disputed",
        "Database insert failure after the linked case was written",
      ),
    ).rejects.toMatchObject({ code: "22001" });
    expect(await rowsFor(database(), fixture)).toEqual(before);
  });

  it.each(["confirmed", "disputed"] as const)(
    "rejects a new %s decision on a paid statement without any writes",
    async (action) => {
      const db = database();
      const fixture = await seed(db, "paid");
      const before = await rowsFor(db, fixture);
      await expect(
        decisions(db).decide(
          fixture.fleetPartnerId,
          fixture.statement.statementId,
          fixture.actorId,
          action,
          "Paid statement must remain unchanged",
        ),
      ).rejects.toMatchObject({ code: "STATEMENT_ALREADY_PAID" });
      expect(await rowsFor(database(), fixture)).toEqual(before);
    },
  );

  it("scopes reads and decisions to the owning fleet and requested month", async () => {
    const db = database();
    const own = await seed(db);
    const other = await seed(db);
    const repository = decisions(db);
    const ownDecision = await repository.decide(
      own.fleetPartnerId,
      own.statement.statementId,
      own.actorId,
      "disputed",
      "Only this fleet can see this dispute",
    );
    const otherDecision = await repository.decide(
      other.fleetPartnerId,
      other.statement.statementId,
      other.actorId,
      "confirmed",
      undefined,
    );
    const before = await rowsFor(db, own);
    const fresh = decisions(database());
    expect(await fresh.listDecisions(own.fleetPartnerId, PERIOD_MONTH)).toEqual(
      [ownDecision],
    );
    expect(
      await fresh.listDecisions(other.fleetPartnerId, PERIOD_MONTH),
    ).toEqual([otherDecision]);
    expect(await fresh.listDecisions(own.fleetPartnerId, "2099-09")).toEqual(
      [],
    );
    await expect(
      fresh.decide(
        other.fleetPartnerId,
        own.statement.statementId,
        other.actorId,
        "disputed",
        "Only this fleet can see this dispute",
      ),
    ).rejects.toMatchObject({ code: "STATEMENT_NOT_FOUND" });
    expect(await rowsFor(db, own)).toEqual(before);
  });
});
