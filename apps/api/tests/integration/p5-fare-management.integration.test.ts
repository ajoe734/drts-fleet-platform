import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreatePlatformFareVersionCommand } from "@drts/contracts";
import type { DatabaseService } from "../../src/common/db";
import { FareVersionController } from "../../src/modules/multi-taxi/fare-versions/fare-version.controller";
import { FareVersionRepository } from "../../src/modules/multi-taxi/fare-versions/fare-version.repository";
import { FareVersionService } from "../../src/modules/multi-taxi/fare-versions/fare-version.service";
import type { FareCommandInput } from "../../src/modules/multi-taxi/fare-versions/fare-version.types";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { PassengerFareRepository } from "../../src/modules/passenger-app/fare/passenger-fare.repository";
import { estimateFare } from "../../src/modules/passenger-app/fare/fare.engine";
import type { FareQuoteSnapshot } from "../../src/modules/passenger-app/fare/fare.types";

// Hosted PostgreSQL only. A private random database keeps these actual schema,
// immediate-activation and rollback probes from changing other suites' prices.
// Missing DATABASE_URL/migrations fail this suite, rather than count as a skip.
const DATABASE_URL = process.env.DATABASE_URL;
const migrations = new URL("../../../../infra/migrations/", import.meta.url);
const SEED = "taipei-20230401";
const F20 = "2199-10-20T00:00:00.000Z";
const F25 = "2199-10-25T00:00:00.000Z";
const F15 = "2199-10-15T00:00:00.000Z";
const identity: BootstrapRequestIdentity = {
  authMode: "bootstrap_headers",
  actorId: randomUUID(),
  actorType: "platform_admin",
  realm: "platform",
  tenantId: null,
  roles: ["platform_admin"],
  roleFamilies: ["platform"],
  scopes: ["foundation:read", "foundation:write"],
  requestId: null,
};
function adapter(pool: Pool): DatabaseService {
  return {
    isEnabled: () => true,
    query: pool.query.bind(pool),
    connect: pool.connect.bind(pool),
  } as unknown as DatabaseService;
}
function controller(db: DatabaseService, repo = new FareVersionRepository(db)) {
  return new FareVersionController(new FareVersionService(repo));
}

class FailAfterReceipt extends FareVersionRepository {
  observedAllWrites = false;
  protected override async insertReceipt(
    client: PoolClient,
    input: FareCommandInput,
    hash: string,
    auditId: string,
    at: string,
  ) {
    await super.insertReceipt(client, input, hash, auditId, at);
    const fare = await client.query(
      "SELECT status FROM passenger.fare_versions WHERE version=$1",
      [input.version],
    );
    const receipt = await client.query(
      "SELECT 1 FROM passenger.fare_version_command_receipts WHERE actor_id=$1 AND operation=$2 AND idempotency_key=$3",
      [input.actorId, input.operation, input.idempotencyKey],
    );
    const audit = await client.query(
      "SELECT 1 FROM admin.audit_logs WHERE audit_id=$1",
      [auditId],
    );
    this.observedAllWrites =
      fare.rows[0]?.status === "published" &&
      receipt.rowCount === 1 &&
      audit.rowCount === 1;
    throw new Error("P5_INJECTED_AFTER_FARE_AUDIT_AND_RECEIPT");
  }
}

describe.sequential(
  "public fare management actual PostgreSQL authority",
  () => {
    const dbName = `p5_fare_${randomUUID().replaceAll("-", "")}`;
    let admin: Pool | undefined;
    let pool: Pool;
    let second: Pool;
    let created = false;
    let pristine: Record<string, unknown>;
    let db: DatabaseService;
    let db2: DatabaseService;
    let api: FareVersionController;
    let reader: PassengerFareRepository;
    beforeAll(async () => {
      if (!DATABASE_URL)
        throw new Error("P5 hosted PostgreSQL tests require DATABASE_URL");
      admin = new Pool({ connectionString: DATABASE_URL });
      await admin.query(`CREATE DATABASE ${dbName}`);
      created = true;
      const url = new URL(DATABASE_URL);
      url.pathname = `/${dbName}`;
      pool = new Pool({ connectionString: url.toString() });
      second = new Pool({ connectionString: url.toString() });
      // Actual prerequisite migrations plus immutable V0112 and new V0118.
      const names = readdirSync(migrations)
        .filter(
          (name) =>
            /^V000[1-9]__/.test(name) ||
            /^V0109__|^V0112__|^V0118__/.test(name),
        )
        .sort();
      expect(names.some((x) => x.startsWith("V0118__"))).toBe(true);
      for (const name of names)
        await pool.query(readFileSync(new URL(name, migrations), "utf8"));
      pristine = (
        await pool.query(
          "SELECT to_jsonb(f) AS record FROM passenger.fare_versions f WHERE version=$1",
          [SEED],
        )
      ).rows[0].record;
      db = adapter(pool);
      db2 = adapter(second);
      api = controller(db);
      reader = new PassengerFareRepository(db2);
    }, 60000);
    beforeEach(async () => {
      await pool.query(
        "TRUNCATE passenger.fare_version_command_receipts,passenger.fare_version_management,passenger.fare_quote_snapshots,passenger.fare_versions,admin.audit_logs",
      );
      await pool.query(
        "INSERT INTO passenger.fare_versions SELECT (jsonb_populate_record(NULL::passenger.fare_versions,$1::jsonb)).*",
        [JSON.stringify(pristine)],
      );
    });
    afterAll(async () => {
      if (pool) await pool.end();
      if (second) await second.end();
      if (created) await admin!.query(`DROP DATABASE ${dbName}`);
      await admin?.end();
    });
    async function draft(
      id: string,
      extra: Partial<CreatePlatformFareVersionCommand> = {},
    ) {
      const current = (await api.get(SEED)).data;
      const input: CreatePlatformFareVersionCommand = {
        fareVersionId: id,
        displayName: `Test proposed ${id}`,
        publicSummary: "Isolated PostgreSQL fixture; not an official fare",
        sourceReference: "test-fixture-source",
        effectiveFrom: F20,
        tariff: current.tariff,
        ...extra,
      };
      return (await api.create(input, identity, `create-${id}`)).data;
    }
    async function filed(id: string) {
      const row = await draft(id);
      return (
        await api.file(
          id,
          {
            expectedRevision: row.revision,
            authorityFilingRef: `TEST-ONLY-${id}`,
            filingEvidenceReference: `test://evidence/${id}`,
          },
          identity,
          `file-${id}`,
        )
      ).data;
    }
    async function publish(id: string, at: string | null) {
      const row = await filed(id);
      return (
        await api.schedule(
          id,
          { expectedRevision: row.revision, effectiveFrom: at },
          identity,
          `schedule-${id}`,
        )
      ).data;
    }
    async function fresh() {
      return (await controller(db2).list()).data;
    }
    async function count(
      table: string,
      condition = "true",
      values: unknown[] = [],
    ) {
      return Number(
        (
          await second.query(
            `SELECT count(*)::int AS n FROM ${table} WHERE ${condition}`,
            values,
          )
        ).rows[0].n,
      );
    }
    async function intervals() {
      return (
        await second.query(
          "SELECT version,status,effective_at,effective_until FROM passenger.fare_versions WHERE status='published' ORDER BY effective_at",
        )
      ).rows;
    }

    it("applies actual migrations without altering approved seed or inventing legal metadata", async () => {
      const row = (await fresh()).items[0]!;
      expect(row).toMatchObject({
        fareVersionId: SEED,
        status: "active",
        authorityFilingRef: null,
        revision: 0,
        tariff: {
          baseFare: 85,
          baseDistanceMeters: 1250,
          distanceRate: 5,
          distanceIncrementMeters: 200,
          delayRate: 5,
          delayIncrementSeconds: 60,
          nightSurchargeAmount: 20,
        },
        nightSurchargeUnit: "TWD_per_trip",
      });
      expect(
        (await reader.publishedTariff(new Date().toISOString()))?.version,
      ).toBe(SEED);
    });
    it("persists draft/edit/full fee identifiers across an independent pool while active seed remains", async () => {
      const original = (await api.get(SEED)).data;
      const row = await draft("draft", {
        tariff: {
          ...original.tariff,
          additionalFees: { airport_fee: 60, 中文費目: 5 },
        },
      });
      await api.update(
        "draft",
        {
          expectedRevision: row.revision,
          displayName: "Edited",
          publicSummary: row.publicSummary,
          sourceReference: row.sourceReference,
          effectiveFrom: F20,
          tariff: { ...row.tariff, baseFare: 90 },
        },
        identity,
        "edit",
      );
      expect((await controller(db2).get("draft")).data).toMatchObject({
        status: "draft",
        displayName: "Edited",
        tariff: {
          baseFare: 90,
          additionalFees: { airport_fee: 60, 中文費目: 5 },
        },
      });
      expect(
        (await reader.publishedTariff(new Date().toISOString()))?.baseFare,
      ).toBe(85);
    });
    it("records actual manual filing metadata durably without publishing before schedule", async () => {
      const row = await filed("filed");
      expect(row).toMatchObject({
        status: "filed",
        publicationScheduled: false,
        filedBy: identity.actorId,
      });
      expect((await controller(db2).get("filed")).data.authorityFilingRef).toBe(
        "TEST-ONLY-filed",
      );
      expect((await fresh()).activeFareVersionId).toBe(SEED);
    });
    it("future publication splits coverage at exact boundary and public reader does not use it early", async () => {
      await publish("future", F20);
      expect(
        (await reader.publishedTariff("2199-10-19T23:59:59.999Z"))?.version,
      ).toBe(SEED);
      expect((await reader.publishedTariff(F20))?.version).toBe("future");
      expect(
        (await reader.publishedTariff("2200-01-01T00:00:00.000Z"))?.version,
      ).toBe("future");
      expect((await controller(db2).get("future")).data).toMatchObject({
        status: "filed",
        publicationScheduled: true,
        scheduledFor: F20,
      });
      expect((await fresh()).activeFareVersionId).toBe(SEED);
    });
    it("inserts earlier and later future versions without gaps, overlaps or historical retirement", async () => {
      await publish("B", F20);
      await publish("C", F25);
      await publish("D", F15);
      expect((await intervals()).map((x) => [x.version, x.status])).toEqual([
        [SEED, "published"],
        ["D", "published"],
        ["B", "published"],
        ["C", "published"],
      ]);
      for (const [at, id] of [
        ["2025-01-01T00:00:00.000Z", SEED],
        [F15, "D"],
        [F20, "B"],
        [F25, "C"],
      ])
        expect((await reader.publishedTariff(at!))?.version).toBe(id);
    });
    it("serializes two independent-pool schedules into one coherent timeline", async () => {
      const b = await filed("B"),
        c = await filed("C");
      const other = controller(db2);
      const result = await Promise.all([
        api.schedule(
          "B",
          { expectedRevision: b.revision, effectiveFrom: F20 },
          identity,
          "B",
        ),
        other.schedule(
          "C",
          { expectedRevision: c.revision, effectiveFrom: F25 },
          identity,
          "C",
        ),
      ]);
      expect(result).toHaveLength(2);
      expect((await reader.publishedTariff(F20))?.version).toBe("B");
      expect((await reader.publishedTariff(F25))?.version).toBe("C");
      const rows = await intervals();
      expect(rows[0].effective_until.toISOString()).toBe(F20);
      expect(rows[1].effective_until.toISOString()).toBe(F25);
    });
    it("concurrent equal-time schedules commit one version and reject the other without coverage corruption", async () => {
      const b = await filed("B"),
        c = await filed("C");
      const result = await Promise.allSettled([
        api.schedule(
          "B",
          { expectedRevision: b.revision, effectiveFrom: F20 },
          identity,
          "B",
        ),
        controller(db2).schedule(
          "C",
          { expectedRevision: c.revision, effectiveFrom: F20 },
          identity,
          "C",
        ),
      ]);
      expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(result.filter((x) => x.status === "rejected")).toHaveLength(1);
      const rejected = result.find(
        (x) => x.status === "rejected",
      ) as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({
        code: "fare_effective_time_conflict",
      });
      expect(await intervals()).toHaveLength(2);
      expect(
        await count(
          "passenger.fare_version_command_receipts",
          "operation='schedule'",
        ),
      ).toBe(1);
      expect(await reader.publishedTariff(F20)).not.toBeNull();
    });
    it("concurrent same logical command yields one mutation, receipt and audit", async () => {
      const row = await filed("same");
      const input = { expectedRevision: row.revision, effectiveFrom: F20 };
      const result = await Promise.all([
        api.schedule("same", input, identity, "same-key"),
        controller(db2).schedule("same", input, identity, "same-key"),
      ]);
      expect(result[0].data).toEqual(result[1].data);
      expect(
        await count(
          "passenger.fare_version_command_receipts",
          "operation='schedule'",
        ),
      ).toBe(1);
      expect(
        await count(
          "admin.audit_logs",
          "action_name='schedule_public_fare_version'",
        ),
      ).toBe(1);
    });
    it("replays old schedule after a later successor to current interval without altering history or duplicating audit", async () => {
      const b = await filed("B");
      const input = { expectedRevision: b.revision, effectiveFrom: F20 };
      await api.schedule("B", input, identity, "B");
      await publish("C", F25);
      const rows = await intervals();
      const audits = await count("admin.audit_logs");
      const replay = (await controller(db2).schedule("B", input, identity, "B"))
        .data;
      expect(replay.effectiveUntil).toBe(F25);
      expect(await intervals()).toEqual(rows);
      expect(await count("admin.audit_logs")).toBe(audits);
    });
    it("rolls back predecessor, target, metadata, audit and receipt after observed late failure, then same-key retry really commits", async () => {
      const row = await filed("rollback");
      const before = await intervals();
      const audits = await count("admin.audit_logs");
      const failing = new FailAfterReceipt(db);
      const input = { expectedRevision: row.revision, effectiveFrom: F20 };
      await expect(
        controller(db, failing).schedule(
          "rollback",
          input,
          identity,
          "retry-key",
        ),
      ).rejects.toMatchObject({ code: "fare_management_unavailable" });
      expect(failing.observedAllWrites).toBe(true);
      expect(await intervals()).toEqual(before);
      expect((await controller(db2).get("rollback")).data).toMatchObject({
        status: "filed",
        revision: row.revision,
        publicationScheduled: false,
      });
      expect(
        await count(
          "passenger.fare_version_command_receipts",
          "operation='schedule'",
        ),
      ).toBe(0);
      expect(await count("admin.audit_logs")).toBe(audits);
      expect(
        (
          await controller(db2).schedule(
            "rollback",
            input,
            identity,
            "retry-key",
          )
        ).data.publicationScheduled,
      ).toBe(true);
      expect((await reader.publishedTariff(F20))?.version).toBe("rollback");
    });
    it("does not overwrite real edits with a stale revision from another instance", async () => {
      const row = await draft("revision");
      const command = {
        expectedRevision: row.revision,
        displayName: "First",
        publicSummary: row.publicSummary,
        sourceReference: row.sourceReference,
        effectiveFrom: F20,
        tariff: row.tariff,
      };
      await api.update("revision", command, identity, "first");
      await expect(
        controller(db2).update(
          "revision",
          { ...command, displayName: "Stale" },
          identity,
          "stale",
        ),
      ).rejects.toMatchObject({ code: "fare_revision_conflict" });
      expect((await controller(db2).get("revision")).data.displayName).toBe(
        "First",
      );
    });
    it("rejects changed payload under committed key without moving either interval", async () => {
      const row = await filed("key");
      await api.schedule(
        "key",
        { expectedRevision: row.revision, effectiveFrom: F20 },
        identity,
        "key",
      );
      const before = await intervals();
      await expect(
        controller(db2).schedule(
          "key",
          { expectedRevision: row.revision, effectiveFrom: F25 },
          identity,
          "key",
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
      expect(await intervals()).toEqual(before);
    });
    it("activates at post-lock database clock and exposes expired predecessor as retired without losing historic read", async () => {
      const activated = await publish("now", null);
      expect(activated.status).toBe("active");
      expect((await fresh()).activeFareVersionId).toBe("now");
      const predecessor = (await controller(db2).get(SEED)).data;
      expect(predecessor.status).toBe("retired");
      await api.retire(
        SEED,
        {
          expectedRevision: predecessor.revision,
          reason: "Replacement published",
        },
        identity,
        "history-retire",
      );
      expect(
        (await reader.publishedTariff("2025-01-01T00:00:00.000Z"))?.version,
      ).toBe(SEED);
      expect((await intervals())[0].status).toBe("published");
    });
    it("rejects current/future retirement without leaving passenger pricing gap, and retires only unscheduled drafts", async () => {
      await expect(
        api.retire(
          SEED,
          { expectedRevision: 0, reason: "Unilateral stop" },
          identity,
          "stop",
        ),
      ).rejects.toMatchObject({ code: "fare_replacement_required" });
      const future = await publish("future", F20);
      await expect(
        api.retire(
          "future",
          { expectedRevision: future.revision, reason: "Cancel" },
          identity,
          "cancel",
        ),
      ).rejects.toMatchObject({ code: "fare_replacement_required" });
      const draftRow = await draft("retire-draft");
      await api.retire(
        "retire-draft",
        { expectedRevision: draftRow.revision, reason: "Withdraw proposal" },
        identity,
        "retire",
      );
      expect((await controller(db2).get("retire-draft")).data.status).toBe(
        "retired",
      );
      expect(
        (await reader.publishedTariff(new Date().toISOString()))?.version,
      ).toBe(SEED);
      expect((await reader.publishedTariff(F20))?.version).toBe("future");
    });
    it("keeps existing actual quote snapshot bytes and tariff amounts immutable after future schedule", async () => {
      const passengerId = `p5-snapshot-${randomUUID()}`;
      await pool.query(
        "INSERT INTO passenger.accounts(drts_passenger_id) VALUES($1)",
        [passengerId],
      );
      const now = new Date();
      const tariff = (await reader.publishedTariff(F20))!;
      const snapshot: FareQuoteSnapshot = {
        fareSnapshotId: randomUUID(),
        drtsPassengerId: passengerId,
        origin: { lat: 25.03, lng: 121.56 },
        destination: { lat: 25.04, lng: 121.57 },
        scheduledAt: F20,
        route: {
          provider: "test-fixture",
          distanceMeters: 1250,
          durationSeconds: 0,
          encodedPolyline: null,
          generatedAt: now.toISOString(),
        },
        tariffSnapshot: tariff,
        ...estimateFare(tariff, {
          distanceMeters: 1250,
          durationSeconds: 0,
          scheduledAt: F20,
        }),
        serviceAreaEvaluation: {
          decision: "serviceable",
          serviceProductType: "taxi_reservation",
          evaluatedAt: now.toISOString(),
          stops: [],
          serviceAreaCodes: [],
          geometryVersionRefs: [],
          reasonCodes: [],
          reasonMessages: [],
        },
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 600000).toISOString(),
      };
      await reader.insertSnapshot(snapshot);
      const before = (
        await second.query(
          "SELECT to_jsonb(s)::text AS record FROM passenger.fare_quote_snapshots s WHERE fare_snapshot_id=$1",
          [snapshot.fareSnapshotId],
        )
      ).rows[0].record;
      await publish("later", F20);
      const after = (
        await second.query(
          "SELECT to_jsonb(s)::text AS record FROM passenger.fare_quote_snapshots s WHERE fare_snapshot_id=$1",
          [snapshot.fareSnapshotId],
        )
      ).rows[0].record;
      expect(after).toBe(before);
      expect(
        (await reader.findOwnedSnapshot(snapshot.fareSnapshotId, passengerId))
          ?.tariffSnapshot.baseFare,
      ).toBe(85);
      expect((await reader.publishedTariff(F20))?.version).toBe("later");
    });
    it("commits audit with actual actor and intervals once for activation and retirement", async () => {
      await publish("audit", null);
      const history = (await api.get(SEED)).data;
      await api.retire(
        SEED,
        { expectedRevision: history.revision, reason: "Superseded" },
        identity,
        "retire",
      );
      const rows = (
        await second.query(
          "SELECT actor_id,old_value,new_value FROM admin.audit_logs WHERE action_name='schedule_public_fare_version'",
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBe(identity.actorId);
      expect(
        rows[0].new_value.versions.some((x: unknown) =>
          JSON.stringify(x).includes('"dbStatus":"published"'),
        ),
      ).toBe(true);
      expect(
        await count(
          "admin.audit_logs",
          "action_name='retire_public_fare_version'",
        ),
      ).toBe(1);
    });
    it("rejects backdated, unfiled and missing-evidence transitions without any schedule receipt", async () => {
      const row = await draft("unfiled");
      await expect(
        api.schedule(
          "unfiled",
          { expectedRevision: row.revision, effectiveFrom: F20 },
          identity,
          "unfiled",
        ),
      ).rejects.toMatchObject({ code: "fare_lifecycle_conflict" });
      await expect(
        api.file(
          "unfiled",
          {
            expectedRevision: row.revision,
            authorityFilingRef: "",
            filingEvidenceReference: "",
          },
          identity,
          "missing",
        ),
      ).rejects.toMatchObject({ code: "fare_filing_metadata_required" });
      const f = await filed("past");
      await expect(
        api.schedule(
          "past",
          {
            expectedRevision: f.revision,
            effectiveFrom: "2020-01-01T00:00:00.000Z",
          },
          identity,
          "past",
        ),
      ).rejects.toMatchObject({ code: "fare_effective_time_conflict" });
      expect(
        await count(
          "passenger.fare_version_command_receipts",
          "operation='schedule'",
        ),
      ).toBe(0);
      expect((await fresh()).activeFareVersionId).toBe(SEED);
    });
  },
);
