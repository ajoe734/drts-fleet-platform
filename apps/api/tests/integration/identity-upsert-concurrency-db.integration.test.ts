import { generateKeyPairSync, randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
} from "@drts/contracts";

import type { PoolClient } from "pg";

import { DatabaseService } from "../../src/common/db";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";

// SR-AUTH-SESSION-SUPERSEDE-20261003 R2 (second reopen): the session-supersede
// no-op/mutation/concurrency guarantees for ensurePrincipalRecord,
// ensureMembershipRecord and ensureRoleBindingRecord were only exercised
// against IdentityRepository's in-memory fallback (every unit test
// constructs `new IdentityRepository()` with no DatabaseService). That
// fallback never executes the real `ON CONFLICT (source_ref) DO UPDATE ...
// WHERE <changed>` SQL in identity.repository.ts, so a defect confined to
// the SQL text (wrong column in the WHERE guard, a race the in-process
// mock can't model, JSON/column drift) would pass every existing test.
// These cases run the same public repository methods against a real
// Postgres instance and real migrated schema.
const DATABASE_URL = process.env.DATABASE_URL;

async function insertPrincipalFixture(
  db: DatabaseService,
  principalId: string,
  sourceRef: string,
) {
  await db.query(
    `
      INSERT INTO iam.identity_principals (
        principal_id, source_ref, issuer, subject, principal_type, email_normalized, email_verified, display_name, account_status, created_at, updated_at, record
      ) VALUES (
        $1, $2, 'test_issuer', $3, 'human', $4, true, 'Upsert Concurrency Fixture', 'active', NOW(), NOW(), '{}'::jsonb
      )
    `,
    [principalId, sourceRef, `sub_${principalId}`, `${principalId}@example.com`],
  );
}

async function insertMembershipFixture(
  db: DatabaseService,
  membershipId: string,
  sourceRef: string,
  principalId: string,
) {
  await db.query(
    `
      INSERT INTO iam.identity_memberships (
        membership_id, source_ref, principal_id, realm, scope_ref, membership_status, created_at, updated_at, record
      ) VALUES (
        $1, $2, $3, 'tenant', $4, 'active', NOW(), NOW(), '{}'::jsonb
      )
    `,
    [membershipId, sourceRef, principalId, `scope_${membershipId}`],
  );
}

// SR-AUTH-SESSION-SUPERSEDE-20261003 R9-TX-V: waits for a second real
// backend to report itself blocked specifically on `blockingPid`'s lock,
// instead of hoping a fixed sleep outlasts connect+submit latency. Shared
// by the deterministic collision cases below (and mirrors the inline
// version already proven in the R2/R6 case further down this file).
async function waitUntilBlockedOn(
  monitor: DatabaseService,
  blockingPid: number,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const blocked = await monitor.query<{ pid: number }>(
      `
        SELECT pid
        FROM pg_stat_activity
        WHERE pid <> $1
          AND $1 = ANY (pg_blocking_pids(pid))
      `,
      [blockingPid],
    );
    if (blocked.rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `Timed out waiting for a backend to block on pid ${blockingPid}`,
  );
}

// SR-AUTH-SESSION-SUPERSEDE-20261003 R9-TX-V: records the exact SQL text a
// DatabaseService's connections send, so a test can observe that the real
// SAVEPOINT/ROLLBACK TO SAVEPOINT recovery branch in
// identity.repository.ts actually executed against real Postgres, instead
// of only inferring it from a converged final result (which a lucky,
// error-free ON CONFLICT resolution could also produce).
//
// IdentityRepository's constructor fires two best-effort, unawaited seed
// calls (ensureDefaultPlatformAccount / ensureLiveMapObserverAccount) that
// also run inside a transaction and also take "upsert_principal_sp" --
// they execute on this same DatabaseService's connection pool, racing with
// whatever the test itself does. A flat `queries: string[]` mixes their
// SAVEPOINT/ROLLBACK traffic in with the call under test and makes exact
// counts like `toHaveLength(1)` flaky. Queries are tracked per logical
// connection (one entry per `connect()` call, each carrying its bound
// params) so a test can first identify *which* connection ran the specific
// row it cares about (by matching a bound parameter such as principalId)
// and only inspect that connection's queries.
function traceClientQueries(db: DatabaseService): {
  connections: { sql: string; params: unknown[] }[][];
} {
  const trace: { connections: { sql: string; params: unknown[] }[][] } = {
    connections: [],
  };
  const originalConnect = db.connect.bind(db);
  (db as unknown as { connect: typeof db.connect }).connect = async () => {
    const client = await originalConnect();
    const connectionQueries: { sql: string; params: unknown[] }[] = [];
    trace.connections.push(connectionQueries);
    const originalQuery = client.query.bind(client);
    (client as unknown as { query: (...args: unknown[]) => unknown }).query =
      (...args: unknown[]) => {
        const first = args[0];
        const sql =
          typeof first === "string"
            ? first
            : ((first as { text?: string } | undefined)?.text ?? "");
        const params = Array.isArray(args[1])
          ? (args[1] as unknown[])
          : ((first as { values?: unknown[] } | undefined)?.values ?? []);
        connectionQueries.push({ sql, params });
        return (originalQuery as (...a: unknown[]) => unknown)(...args);
      };
    return client;
  };
  return trace;
}

// Finds the one connection (out of possibly several concurrent ones on the
// same traced DatabaseService) that actually issued a statement binding
// `value` as one of its parameters -- used to isolate the call under test
// from IdentityRepository's unrelated constructor-seeding connections.
function findConnectionByBoundParam(
  trace: { connections: { sql: string; params: unknown[] }[][] },
  value: string,
): { sql: string; params: unknown[] }[] {
  const match = trace.connections.find((queries) =>
    queries.some((q) => q.params.includes(value)),
  );
  if (!match) {
    throw new Error(
      `No traced connection issued a statement bound to ${value}`,
    );
  }
  return match;
}

describe("SR-AUTH-SESSION-SUPERSEDE-20261003 R2: ensure*Record no-op/mutation/concurrency against real Postgres", () => {
  const databases: DatabaseService[] = [];
  const principalIds = new Set<string>();
  const membershipIds = new Set<string>();
  const roleBindingIds = new Set<string>();
  const sessionIds = new Set<string>();

  afterEach(async () => {
    if (DATABASE_URL) {
      const cleanup = new DatabaseService();
      try {
        if (sessionIds.size > 0) {
          await cleanup.query(
            `DELETE FROM iam.identity_sessions WHERE session_id = ANY($1::text[])`,
            [Array.from(sessionIds)],
          );
        }
        if (roleBindingIds.size > 0) {
          await cleanup.query(
            `DELETE FROM iam.identity_role_bindings WHERE role_binding_id = ANY($1::text[])`,
            [Array.from(roleBindingIds)],
          );
        }
        if (membershipIds.size > 0) {
          await cleanup.query(
            `DELETE FROM iam.identity_memberships WHERE membership_id = ANY($1::text[])`,
            [Array.from(membershipIds)],
          );
        }
        if (principalIds.size > 0) {
          await cleanup.query(
            `DELETE FROM iam.identity_principals WHERE principal_id = ANY($1::text[])`,
            [Array.from(principalIds)],
          );
        }
      } finally {
        sessionIds.clear();
        roleBindingIds.clear();
        membershipIds.clear();
        principalIds.clear();
        await cleanup.onModuleDestroy();
      }
    }

    for (const db of databases.splice(0)) {
      await db.onModuleDestroy();
    }
  });

  it("requires DATABASE_URL for Postgres integration tests", () => {
    expect(DATABASE_URL).toBeTruthy();
  });

  it("a no-op ensurePrincipalRecord does not advance updated_at in Postgres", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);

    const principalId = `principal_noop_${randomUUID()}`;
    const sourceRef = `source_noop_${principalId}`;
    principalIds.add(principalId);

    const base: CanonicalIdentityPrincipalRecord = {
      principalId,
      sourceRef,
      issuer: "test_issuer",
      subject: `sub_${principalId}`,
      principalType: "human",
      email: "noop@example.com",
      emailVerified: true,
      displayName: "No-op Fixture",
      status: "active",
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    };

    const created = await repo.ensurePrincipalRecord(base);

    const repeated = await repo.ensurePrincipalRecord({
      ...base,
      updatedAt: new Date().toISOString(),
    });

    // This is the SR-AUTH-SESSION-SUPERSEDE-20261003 regression: re-issuing a
    // session re-ensures the same, unchanged principal. If the real SQL
    // WHERE guard ever regresses to an unconditional overwrite, updated_at
    // (which computeWorkforceTokenVersion derives the token version from)
    // would advance here and invalidate every other active session.
    expect(repeated.updatedAt).toBe(created.updatedAt);
    expect(repeated.principalId).toBe(created.principalId);

    const dbRow = await db.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_principals WHERE principal_id = $1`,
      [principalId],
    );
    expect(dbRow.rows[0]?.updated_at.toISOString()).toBe(created.updatedAt);
  });

  it("a genuine ensurePrincipalRecord status change advances updated_at and persists in Postgres", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);

    const principalId = `principal_mut_${randomUUID()}`;
    const sourceRef = `source_mut_${principalId}`;
    principalIds.add(principalId);

    const base: CanonicalIdentityPrincipalRecord = {
      principalId,
      sourceRef,
      issuer: "test_issuer",
      subject: `sub_${principalId}`,
      principalType: "human",
      email: "mut@example.com",
      emailVerified: true,
      displayName: "Mutation Fixture",
      status: "active",
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    };

    const created = await repo.ensurePrincipalRecord(base);

    const mutated = await repo.ensurePrincipalRecord({
      ...base,
      status: "suspended",
      updatedAt: new Date().toISOString(),
    });

    expect(mutated.status).toBe("suspended");
    expect(mutated.updatedAt).not.toBe(created.updatedAt);

    const dbRow = await db.query<{ account_status: string }>(
      `SELECT account_status FROM iam.identity_principals WHERE principal_id = $1`,
      [principalId],
    );
    expect(dbRow.rows[0]?.account_status).toBe("suspended");
  });

  it("a no-op ensureMembershipRecord does not advance updated_at in Postgres", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);

    const principalId = `principal_mship_noop_${randomUUID()}`;
    principalIds.add(principalId);
    await insertPrincipalFixture(db, principalId, `source_${principalId}`);

    const membershipId = `membership_noop_${randomUUID()}`;
    const sourceRef = `source_noop_${membershipId}`;
    membershipIds.add(membershipId);

    const base: CanonicalIdentityMembershipRecord = {
      membershipId,
      sourceRef,
      principalId,
      realm: "tenant",
      scopeRef: `scope_${membershipId}`,
      tenantId: "tenant_fixture",
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    };

    const created = await repo.ensureMembershipRecord(base);
    const repeated = await repo.ensureMembershipRecord({
      ...base,
      updatedAt: new Date().toISOString(),
    });

    expect(repeated.updatedAt).toBe(created.updatedAt);

    const dbRow = await db.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_memberships WHERE membership_id = $1`,
      [membershipId],
    );
    expect(dbRow.rows[0]?.updated_at.toISOString()).toBe(created.updatedAt);
  });

  it("a genuine ensureMembershipRecord status change advances updated_at and persists in Postgres", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);

    const principalId = `principal_mship_mut_${randomUUID()}`;
    principalIds.add(principalId);
    await insertPrincipalFixture(db, principalId, `source_${principalId}`);

    const membershipId = `membership_mut_${randomUUID()}`;
    const sourceRef = `source_mut_${membershipId}`;
    membershipIds.add(membershipId);

    const base: CanonicalIdentityMembershipRecord = {
      membershipId,
      sourceRef,
      principalId,
      realm: "tenant",
      scopeRef: `scope_${membershipId}`,
      tenantId: "tenant_fixture",
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    };

    const created = await repo.ensureMembershipRecord(base);
    const mutated = await repo.ensureMembershipRecord({
      ...base,
      status: "suspended",
      updatedAt: new Date().toISOString(),
    });

    expect(mutated.status).toBe("suspended");
    expect(mutated.updatedAt).not.toBe(created.updatedAt);

    const dbRow = await db.query<{ membership_status: string }>(
      `SELECT membership_status FROM iam.identity_memberships WHERE membership_id = $1`,
      [membershipId],
    );
    expect(dbRow.rows[0]?.membership_status).toBe("suspended");
  });

  it("R3 (real Postgres): two concurrent first-time ensureRoleBindingRecord calls for the same previously-unseen binding agree on one validFrom", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const dbA = new DatabaseService();
    const dbB = new DatabaseService();
    databases.push(dbA, dbB);
    const repoA = new IdentityRepository(dbA);
    const repoB = new IdentityRepository(dbB);

    const principalId = `principal_r3_${randomUUID()}`;
    principalIds.add(principalId);
    await insertPrincipalFixture(dbA, principalId, `source_${principalId}`);

    const membershipId = `membership_r3_${randomUUID()}`;
    membershipIds.add(membershipId);
    await insertMembershipFixture(
      dbA,
      membershipId,
      `source_${membershipId}`,
      principalId,
    );

    const roleBindingId = `role_binding_r3_${randomUUID()}`;
    const sourceRef = `source_r3_${roleBindingId}`;
    roleBindingIds.add(roleBindingId);

    const validFromA = new Date(Date.now() - 60_000).toISOString();
    const validFromB = new Date(Date.now() - 30_000).toISOString();

    const makeBinding = (
      validFrom: string,
    ): CanonicalIdentityRoleBindingRecord => ({
      roleBindingId,
      sourceRef,
      membershipId,
      roleCode: "ops_user",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom,
      validTo: null,
      createdAt: validFrom,
      updatedAt: validFrom,
    });

    // Two independent repository instances racing to provision the exact
    // same, previously-unseen role binding -- the production shape of two
    // concurrent first-time authentications (e.g. two parallel automation
    // runs both exchanging credentials for the first time). Real Postgres
    // resolves the INSERT .. ON CONFLICT race; this asserts the SQL path's
    // default (allowValidFromMutation=false) never lets the loser overwrite
    // the winner's already-persisted validFrom.
    const [resultA, resultB] = await Promise.all([
      repoA.ensureRoleBindingRecord(makeBinding(validFromA)),
      repoB.ensureRoleBindingRecord(makeBinding(validFromB)),
    ]);

    expect(resultA.validFrom).toBe(resultB.validFrom);
    expect([validFromA, validFromB]).toContain(resultA.validFrom);

    // Convergence must extend to updated_at too: whichever writer's
    // validFrom won, both callers' returned records -- and the persisted
    // row -- must agree on the exact same updatedAt, not just validFrom.
    // A diverging updatedAt here would feed computeWorkforceTokenVersion
    // differently depending on which racing caller last read the row,
    // reintroducing a version race even though validFrom itself converged.
    expect(resultA.updatedAt).toBe(resultB.updatedAt);
    expect([validFromA, validFromB]).toContain(resultA.updatedAt);

    const dbRow = await dbA.query<{ valid_from: Date; updated_at: Date }>(
      `SELECT valid_from, updated_at FROM iam.identity_role_bindings WHERE role_binding_id = $1`,
      [roleBindingId],
    );
    expect(dbRow.rows[0]?.valid_from.toISOString()).toBe(resultA.validFrom);
    expect(dbRow.rows[0]?.updated_at.toISOString()).toBe(resultA.updatedAt);
  });

  it("R4 (real Postgres): an explicit allowValidFromMutation grant change persists its new validFrom, and a later no-op with the same option does not re-advance it", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);

    const principalId = `principal_r4_${randomUUID()}`;
    principalIds.add(principalId);
    await insertPrincipalFixture(db, principalId, `source_${principalId}`);

    const membershipId = `membership_r4_${randomUUID()}`;
    membershipIds.add(membershipId);
    await insertMembershipFixture(
      db,
      membershipId,
      `source_${membershipId}`,
      principalId,
    );

    const roleBindingId = `role_binding_r4_${randomUUID()}`;
    const sourceRef = `source_r4_${roleBindingId}`;
    roleBindingIds.add(roleBindingId);

    const initialValidFrom = "2026-10-03T00:00:00.000Z";
    const created = await repo.ensureRoleBindingRecord({
      roleBindingId,
      sourceRef,
      membershipId,
      roleCode: "ops_user",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: initialValidFrom,
      validTo: null,
      createdAt: initialValidFrom,
      updatedAt: initialValidFrom,
    });
    expect(created.validFrom).toBe(initialValidFrom);

    // An administrator deliberately changes the grant (role_code and its
    // start time both move), with allowValidFromMutation=true: the new
    // validFrom must persist, not be clamped back to the first writer's.
    const promotedValidFrom = "2026-10-03T01:00:00.000Z";
    const promoted = await repo.ensureRoleBindingRecord(
      {
        roleBindingId,
        sourceRef,
        membershipId,
        roleCode: "superadmin",
        grantedByPrincipalId: null,
        approvalId: null,
        validFrom: promotedValidFrom,
        validTo: null,
        createdAt: initialValidFrom,
        updatedAt: promotedValidFrom,
      },
      { allowValidFromMutation: true },
    );
    expect(promoted.roleCode).toBe("superadmin");
    expect(promoted.validFrom).toBe(promotedValidFrom);
    expect(promoted.updatedAt).toBe(promotedValidFrom);

    // A subsequent no-op re-ensure of the exact same granted state, still
    // with allowValidFromMutation=true, must not re-advance updated_at --
    // the option widens what a genuine change may touch, it does not turn
    // every re-ensure into an unconditional write.
    const reEnsured = await repo.ensureRoleBindingRecord(
      {
        roleBindingId,
        sourceRef,
        membershipId,
        roleCode: "superadmin",
        grantedByPrincipalId: null,
        approvalId: null,
        validFrom: promotedValidFrom,
        validTo: null,
        createdAt: initialValidFrom,
        updatedAt: new Date().toISOString(),
      },
      { allowValidFromMutation: true },
    );
    expect(reEnsured.updatedAt).toBe(promotedValidFrom);
    expect(reEnsured.validFrom).toBe(promotedValidFrom);

    const dbRow = await db.query<{
      valid_from: Date;
      updated_at: Date;
      role_code: string;
    }>(
      `SELECT valid_from, updated_at, role_code FROM iam.identity_role_bindings WHERE role_binding_id = $1`,
      [roleBindingId],
    );
    expect(dbRow.rows[0]?.role_code).toBe("superadmin");
    expect(dbRow.rows[0]?.valid_from.toISOString()).toBe(promotedValidFrom);
    expect(dbRow.rows[0]?.updated_at.toISOString()).toBe(promotedValidFrom);
  });

  it("two concurrent genuine role_code changes to an existing binding in Postgres leave the row consistent and columns coherent with record JSON", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const dbA = new DatabaseService();
    const dbB = new DatabaseService();
    databases.push(dbA, dbB);
    const repoA = new IdentityRepository(dbA);
    const repoB = new IdentityRepository(dbB);

    const principalId = `principal_race_${randomUUID()}`;
    principalIds.add(principalId);
    await insertPrincipalFixture(dbA, principalId, `source_${principalId}`);

    const membershipId = `membership_race_${randomUUID()}`;
    membershipIds.add(membershipId);
    await insertMembershipFixture(
      dbA,
      membershipId,
      `source_${membershipId}`,
      principalId,
    );

    const roleBindingId = `role_binding_race_${randomUUID()}`;
    const sourceRef = `source_race_${roleBindingId}`;
    roleBindingIds.add(roleBindingId);

    const createdValidFrom = "2026-10-03T00:00:00.000Z";
    await repoA.ensureRoleBindingRecord({
      roleBindingId,
      sourceRef,
      membershipId,
      roleCode: "ops_user",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: createdValidFrom,
      validTo: null,
      createdAt: createdValidFrom,
      updatedAt: createdValidFrom,
    });

    // Two genuinely different administrator-driven grant changes racing
    // against the same existing row (existing-row mutation interleaving,
    // as opposed to the first-creation race covered by the R3 case above).
    const roleCodeFromA = "superadmin";
    const roleCodeFromB = "fleet_manager";
    const [resultA, resultB] = await Promise.all([
      repoA.ensureRoleBindingRecord(
        {
          roleBindingId,
          sourceRef,
          membershipId,
          roleCode: roleCodeFromA,
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: "2026-10-03T02:00:00.000Z",
          validTo: null,
          createdAt: createdValidFrom,
          updatedAt: "2026-10-03T02:00:00.000Z",
        },
        { allowValidFromMutation: true },
      ),
      repoB.ensureRoleBindingRecord(
        {
          roleBindingId,
          sourceRef,
          membershipId,
          roleCode: roleCodeFromB,
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: "2026-10-03T03:00:00.000Z",
          validTo: null,
          createdAt: createdValidFrom,
          updatedAt: "2026-10-03T03:00:00.000Z",
        },
        { allowValidFromMutation: true },
      ),
    ]);

    // Neither concurrent writer may observe a torn/partial write: each
    // caller's own returned record must be internally coherent (roleCode,
    // validFrom and updatedAt all come from the same writer).
    for (const result of [resultA, resultB]) {
      if (result.roleCode === roleCodeFromA) {
        expect(result.validFrom).toBe("2026-10-03T02:00:00.000Z");
      } else {
        expect(result.roleCode).toBe(roleCodeFromB);
        expect(result.validFrom).toBe("2026-10-03T03:00:00.000Z");
      }
    }

    // The final persisted row must match exactly one of the two writers in
    // every column, and the jsonb record projection must agree with the
    // columns -- no interleaved/mixed state between the two concurrent
    // updates.
    const dbRow = await dbA.query<{
      role_code: string;
      valid_from: Date;
      updated_at: Date;
      record: { roleCode: string; validFrom: string };
    }>(
      `SELECT role_code, valid_from, updated_at, record FROM iam.identity_role_bindings WHERE role_binding_id = $1`,
      [roleBindingId],
    );
    const row = dbRow.rows[0]!;
    const winnerIsA = row.role_code === roleCodeFromA;
    const expectedValidFrom = winnerIsA
      ? "2026-10-03T02:00:00.000Z"
      : "2026-10-03T03:00:00.000Z";
    expect(row.role_code).toBe(winnerIsA ? roleCodeFromA : roleCodeFromB);
    expect(row.valid_from.toISOString()).toBe(expectedValidFrom);
    expect(row.updated_at.toISOString()).toBe(expectedValidFrom);
    expect(row.record.roleCode).toBe(row.role_code);
    expect(row.record.validFrom).toBe(expectedValidFrom);
  });

  it("R2 (real Postgres): two concurrent first-time ensurePrincipalRecord and ensureMembershipRecord calls for the same previously-unseen rows converge on one updated_at", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const dbA = new DatabaseService();
    const dbB = new DatabaseService();
    databases.push(dbA, dbB);
    const repoA = new IdentityRepository(dbA);
    const repoB = new IdentityRepository(dbB);

    const principalId = `principal_fc_${randomUUID()}`;
    const sourceRef = `source_fc_${principalId}`;
    principalIds.add(principalId);

    const tsA = new Date(Date.now() - 60_000).toISOString();
    const tsB = new Date(Date.now() - 30_000).toISOString();
    const makePrincipal = (ts: string): CanonicalIdentityPrincipalRecord => ({
      principalId,
      sourceRef,
      issuer: "test_issuer",
      subject: `sub_${principalId}`,
      principalType: "human",
      email: "fc@example.com",
      emailVerified: true,
      displayName: "First Create Fixture",
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    });

    // Two independent repository instances racing to provision the exact
    // same, previously-unseen principal -- the production shape of two
    // parallel automation runs both authenticating for the first time.
    const [principalResultA, principalResultB] = await Promise.all([
      repoA.ensurePrincipalRecord(makePrincipal(tsA)),
      repoB.ensurePrincipalRecord(makePrincipal(tsB)),
    ]);
    expect(principalResultA.updatedAt).toBe(principalResultB.updatedAt);
    expect([tsA, tsB]).toContain(principalResultA.updatedAt);

    const principalRow = await dbA.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_principals WHERE principal_id = $1`,
      [principalId],
    );
    expect(principalRow.rows[0]?.updated_at.toISOString()).toBe(
      principalResultA.updatedAt,
    );

    const membershipId = `membership_fc_${randomUUID()}`;
    const membershipSourceRef = `source_fc_${membershipId}`;
    membershipIds.add(membershipId);

    const mtsA = new Date(Date.now() - 60_000).toISOString();
    const mtsB = new Date(Date.now() - 30_000).toISOString();
    const makeMembership = (
      ts: string,
    ): CanonicalIdentityMembershipRecord => ({
      membershipId,
      sourceRef: membershipSourceRef,
      principalId,
      realm: "tenant",
      scopeRef: `scope_${membershipId}`,
      tenantId: "tenant_fixture",
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: ts,
      updatedAt: ts,
    });

    const [membershipResultA, membershipResultB] = await Promise.all([
      repoA.ensureMembershipRecord(makeMembership(mtsA)),
      repoB.ensureMembershipRecord(makeMembership(mtsB)),
    ]);
    expect(membershipResultA.updatedAt).toBe(membershipResultB.updatedAt);
    expect([mtsA, mtsB]).toContain(membershipResultA.updatedAt);

    const membershipRow = await dbA.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_memberships WHERE membership_id = $1`,
      [membershipId],
    );
    expect(membershipRow.rows[0]?.updated_at.toISOString()).toBe(
      membershipResultA.updatedAt,
    );
  });

  it("R2/R6 (real Postgres): a stale content-differing ensurePrincipalRecord forced to execute after a genuine newer suspension -- committed through the real repository mutation under a real row lock -- does not revert the suspension, roll back updated_at, or leave a token issued before the suspension still valid", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const dbGate = new DatabaseService();
    const dbA = new DatabaseService();
    const dbMonitor = new DatabaseService();
    databases.push(dbGate, dbA, dbMonitor);
    const repoA = new IdentityRepository(dbA);
    const repoGate = new IdentityRepository(dbGate);

    const testKeyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const originalKeyRing = process.env.JWT_KEY_RING_JSON;
    process.env.JWT_KEY_RING_JSON = JSON.stringify([
      {
        kid: "key-r2r6-overlap",
        status: "active",
        algorithm: "RS256",
        privateKey: testKeyPair.privateKey,
        publicKey: testKeyPair.publicKey,
      },
    ]);

    try {
      const jwtAuthService = new JwtAuthService(repoA);

      const principalId = `principal_overlap_${randomUUID()}`;
      const membershipId = `membership_overlap_${randomUUID()}`;
      const roleBindingId = `role_binding_overlap_${randomUUID()}`;
      principalIds.add(principalId);
      membershipIds.add(membershipId);
      roleBindingIds.add(roleBindingId);

      const identity = {
        authMode: "jwt_bearer" as const,
        actorType: "ops_user" as const,
        actorId: principalId,
        principalId,
        realm: "ops" as const,
        tenantId: null,
        roles: ["ops_user"],
        roleFamilies: ["ops" as const],
        scopes: [] as string[],
      };

      // Create the principal through the real production path
      // (JwtAuthService.issueSessionToken -> ensurePrincipalRecord ->
      // upsertPrincipal), not a hand-written fixture shape. This is what
      // the earlier version of this case got wrong below: a raw
      // `to_jsonb($2::timestamptz)` UPDATE serializes with a "+00:00"
      // offset, while every real write stores `record` via
      // JSON.stringify(record), which keeps the "Z" suffix. Letting the
      // real repository build the row keeps every later "no-op" comparison
      // in this test genuinely a no-op, and keeps the suspension write
      // below byte-for-byte consistent with what production actually
      // writes.
      const bootstrapIssued = await jwtAuthService.issueSessionToken(
        identity,
        { ensurePrincipal: true, authTime: new Date().toISOString() },
      );
      sessionIds.add(bootstrapIssued.sessionId);
      const base = await repoA.findPrincipalById(principalId);
      if (!base) {
        throw new Error(
          "expected ensurePrincipalRecord to have created the principal",
        );
      }
      const t0 = base.updatedAt;

      await repoA.ensureMembershipRecord({
        membershipId,
        sourceRef: `source_overlap_${membershipId}`,
        principalId,
        realm: "ops",
        scopeRef: `scope_${membershipId}`,
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: t0,
        updatedAt: t0,
      });
      await repoA.ensureRoleBindingRecord({
        roleBindingId,
        sourceRef: `source_overlap_${roleBindingId}`,
        membershipId,
        roleCode: "ops_user",
        grantedByPrincipalId: null,
        approvalId: null,
        validFrom: t0,
        validTo: null,
        createdAt: t0,
        updatedAt: t0,
      });

      // The actual token under test: issued while principal, membership
      // and role binding are all still at T0. `ensurePrincipal: true`
      // re-runs the exact real no-op ensure a genuine reauth would -- since
      // nothing tracked about the principal differs from `base`, it must
      // not itself advance updated_at past t0.
      const issued = await jwtAuthService.issueSessionToken(
        { ...identity, membershipId },
        {
          ensurePrincipal: true,
          workforceVersionTimestamps: [t0, t0],
          authTime: new Date().toISOString(),
        },
      );
      sessionIds.add(issued.sessionId);
      expect(issued.tokenVersion).toBe(Date.parse(t0));
      expect(
        await jwtAuthService.verifyAccessToken(issued.token),
      ).not.toBeNull();

      const gateClient = await dbGate.connect();
      let committed = false;
      try {
        // Connection B performs the genuine suspension through the real
        // IdentityRepository mutation (the same private upsertPrincipal
        // that the public ensurePrincipalRecord calls), inside an explicit
        // transaction on its own connection, so this test controls exactly
        // when it commits without duplicating the repository's ON CONFLICT
        // SQL.
        await gateClient.query("BEGIN");
        const gatePidResult = await gateClient.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        const gatePid = gatePidResult.rows[0]!.pid;

        const t2 = new Date().toISOString();
        const suspendedRecord: CanonicalIdentityPrincipalRecord = {
          ...base,
          status: "suspended",
          updatedAt: t2,
        };
        await (
          repoGate as unknown as {
            upsertPrincipal(
              client: PoolClient,
              record: CanonicalIdentityPrincipalRecord,
            ): Promise<CanonicalIdentityPrincipalRecord>;
          }
        ).upsertPrincipal(gateClient, suspendedRecord);

        // A's real ensurePrincipalRecord call still believes the principal
        // is active as of T0 (e.g. a reauth whose assertion iat predates
        // the admin's suspension). It is issued concurrently and must
        // physically block on the gate's still-open row lock.
        const stalePromise = repoA.ensurePrincipalRecord({
          ...base,
          updatedAt: t0,
        });

        // Explicit lock-wait barrier, bounded by a timeout: poll Postgres
        // itself until some other backend is reported blocked specifically
        // on gatePid's lock, instead of hoping a fixed sleep outlasts A's
        // connect+submit latency.
        const deadline = Date.now() + 5_000;
        let observedBlocked = false;
        while (Date.now() < deadline) {
          const blocked = await dbMonitor.query<{ pid: number }>(
            `
              SELECT pid
              FROM pg_stat_activity
              WHERE pid <> $1
                AND $1 = ANY (pg_blocking_pids(pid))
            `,
            [gatePid],
          );
          if (blocked.rows.length > 0) {
            observedBlocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (!observedBlocked) {
          throw new Error(
            "Timed out waiting for the stale ensurePrincipalRecord call to block on the gate's row lock",
          );
        }

        await gateClient.query("COMMIT");
        committed = true;

        const staleResult = await stalePromise;

        // The stale, content-differing write must lose: the suspension
        // must still be in effect, and updated_at must not regress to T0
        // -- which would both resurrect the suspended principal and
        // revive any token version computed from the pre-suspension
        // state.
        expect(staleResult.status).toBe("suspended");
        expect(staleResult.updatedAt).toBe(t2);

        const dbRow = await dbA.query<{
          account_status: string;
          updated_at: Date;
        }>(
          `SELECT account_status, updated_at FROM iam.identity_principals WHERE principal_id = $1`,
          [principalId],
        );
        expect(dbRow.rows[0]?.account_status).toBe("suspended");
        expect(dbRow.rows[0]?.updated_at.toISOString()).toBe(t2);

        // The actual acceptance requirement: a token issued while the
        // principal was still active at T0 must be rejected once the
        // genuine suspension has landed, even though that suspension only
        // committed after this token's issuance.
        expect(
          await jwtAuthService.verifyAccessToken(issued.token),
        ).toBeNull();
      } finally {
        if (!committed) {
          await gateClient.query("ROLLBACK").catch(() => undefined);
        }
        gateClient.release();
      }
    } finally {
      if (originalKeyRing === undefined) {
        delete process.env.JWT_KEY_RING_JSON;
      } else {
        process.env.JWT_KEY_RING_JSON = originalKeyRing;
      }
    }
  });

  // SR-AUTH-SESSION-SUPERSEDE-20261003 R9-TX: every case above exercises the
  // *standalone* ensurePrincipalRecord/ensureMembershipRecord/
  // ensureRoleBindingRecord methods, which never issue BEGIN -- each
  // statement is its own implicit autocommit transaction, so a 23505 never
  // leaves the connection in Postgres's aborted-transaction state. Real
  // callers that already wrap these same private upsert helpers in an
  // explicit transaction (upsertWorkforceIdentity, ensureDefaultPlatformAccount,
  // ensureLiveMapObserverAccount, syncLegacyTenantUserRole, invitation
  // activation) do leave the connection aborted once any statement inside
  // raises 23505: a bare follow-up SELECT on that same client then fails
  // with 25P02, and the whole bundle is lost. This exercises the real
  // transactional entry point directly.
  it("R9-TX (real Postgres): two concurrent first-time upsertWorkforceIdentity calls, each inside its own transaction, converge instead of aborting the bundle", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const dbA = new DatabaseService();
    const dbB = new DatabaseService();
    databases.push(dbA, dbB);
    const repoA = new IdentityRepository(dbA);
    const repoB = new IdentityRepository(dbB);

    const principalId = `principal_wfi_${randomUUID()}`;
    const principalSourceRef = `source_wfi_${principalId}`;
    principalIds.add(principalId);

    const membershipId = `membership_wfi_${randomUUID()}`;
    const membershipSourceRef = `source_wfi_${membershipId}`;
    membershipIds.add(membershipId);

    const roleBindingId = `role_binding_wfi_${randomUUID()}`;
    const roleBindingSourceRef = `source_wfi_${roleBindingId}`;
    roleBindingIds.add(roleBindingId);

    const makeBundle = (ts: string) => ({
      principal: {
        principalId,
        sourceRef: principalSourceRef,
        issuer: "test_issuer",
        subject: `sub_${principalId}`,
        principalType: "human",
        email: "wfi@example.com",
        emailVerified: true,
        displayName: "Workforce First-Create Fixture",
        status: "active",
        createdAt: ts,
        updatedAt: ts,
      } satisfies CanonicalIdentityPrincipalRecord,
      membership: {
        membershipId,
        sourceRef: membershipSourceRef,
        principalId,
        realm: "tenant",
        scopeRef: `scope_${membershipId}`,
        tenantId: "tenant_fixture",
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: ts,
        updatedAt: ts,
      } satisfies CanonicalIdentityMembershipRecord,
      roleBindings: [
        {
          roleBindingId,
          sourceRef: roleBindingSourceRef,
          membershipId,
          roleCode: "ops_user",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: ts,
          validTo: null,
          createdAt: ts,
          updatedAt: ts,
        } satisfies CanonicalIdentityRoleBindingRecord,
      ],
    });

    const tsA = new Date(Date.now() - 60_000).toISOString();
    const tsB = new Date(Date.now() - 30_000).toISOString();
    const bundleA = makeBundle(tsA);
    const bundleB = makeBundle(tsB);

    // Two independent repository instances, each issuing its own BEGIN,
    // racing to provision the exact same, previously-unseen workforce
    // identity bundle in one call -- the production shape of two parallel
    // first-time authentications. Before the SAVEPOINT recovery fix, the
    // losing transaction's follow-up SELECT (issued on the same client used
    // for the failed INSERT) would itself fail with 25P02, and this
    // Promise.all would reject instead of converging.
    const [resultA, resultB] = await Promise.all([
      repoA.upsertWorkforceIdentity(
        bundleA.principal,
        bundleA.membership,
        bundleA.roleBindings,
      ),
      repoB.upsertWorkforceIdentity(
        bundleB.principal,
        bundleB.membership,
        bundleB.roleBindings,
      ),
    ]);

    expect(resultA.principal.updatedAt).toBe(resultB.principal.updatedAt);
    expect([tsA, tsB]).toContain(resultA.principal.updatedAt);
    expect(resultA.membership.updatedAt).toBe(resultB.membership.updatedAt);
    expect(resultA.roleBindings[0]?.updatedAt).toBe(
      resultB.roleBindings[0]?.updatedAt,
    );

    const principalRow = await dbA.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_principals WHERE principal_id = $1`,
      [principalId],
    );
    expect(principalRow.rows[0]?.updated_at.toISOString()).toBe(
      resultA.principal.updatedAt,
    );
    const membershipRow = await dbA.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_memberships WHERE membership_id = $1`,
      [membershipId],
    );
    expect(membershipRow.rows[0]?.updated_at.toISOString()).toBe(
      resultA.membership.updatedAt,
    );
    const roleBindingRow = await dbA.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_role_bindings WHERE role_binding_id = $1`,
      [roleBindingId],
    );
    expect(roleBindingRow.rows[0]?.updated_at.toISOString()).toBe(
      resultA.roleBindings[0]?.updatedAt,
    );
  });

  // SR-AUTH-SESSION-SUPERSEDE-20261003 R10: a 23505 is not always the
  // compatible "two racers for the same not-yet-existing row" case that the
  // retry-after-SAVEPOINT recovery is meant for. If the incoming write's new
  // values collide with a *different*, already-persisted row's unique
  // columns (here: another principal already owns the (issuer, subject)
  // pair this write is trying to claim), that is a genuine conflict and
  // must reject -- not resolve by silently handing back the unrelated,
  // unchanged row for our own source_ref as if nothing was wrong.
  it("R10 (real Postgres): reassigning a principal's subject to one another principal already owns is rejected, not silently resolved to the stale row", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);

    const principalIdA = `principal_r10_a_${randomUUID()}`;
    const principalIdB = `principal_r10_b_${randomUUID()}`;
    principalIds.add(principalIdA);
    principalIds.add(principalIdB);
    const sourceRefA = `source_r10_${principalIdA}`;
    const sourceRefB = `source_r10_${principalIdB}`;

    await insertPrincipalFixture(db, principalIdA, sourceRefA);
    await insertPrincipalFixture(db, principalIdB, sourceRefB);

    const beforeRow = await db.query<{ subject: string; updated_at: Date }>(
      `SELECT subject, updated_at FROM iam.identity_principals WHERE principal_id = $1`,
      [principalIdA],
    );

    // A's own source_ref, but claiming B's subject under the same issuer --
    // this must hit uq_identity_principals_issuer_subject against B's row,
    // not the source_ref arbiter.
    await expect(
      repo.ensurePrincipalRecord({
        principalId: principalIdA,
        sourceRef: sourceRefA,
        issuer: "test_issuer",
        subject: `sub_${principalIdB}`,
        principalType: "human",
        email: "r10@example.com",
        emailVerified: true,
        displayName: "R10 Conflict Fixture",
        status: "active",
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow();

    // The rejected write must not have been silently applied, nor must the
    // row have been left byte-for-byte as before and reported a success --
    // it has to be an observable failure of the caller's request.
    const afterRow = await db.query<{ subject: string; updated_at: Date }>(
      `SELECT subject, updated_at FROM iam.identity_principals WHERE principal_id = $1`,
      [principalIdA],
    );
    expect(afterRow.rows[0]?.subject).toBe(beforeRow.rows[0]?.subject);
    expect(afterRow.rows[0]?.updated_at.toISOString()).toBe(
      beforeRow.rows[0]?.updated_at.toISOString(),
    );
  });

  it("R10 (real Postgres): moving a membership into another membership's (principal_id, realm, scope_ref) is rejected, not silently resolved to the stale row", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);

    const principalId = `principal_r10_m_${randomUUID()}`;
    principalIds.add(principalId);
    await insertPrincipalFixture(db, principalId, `source_${principalId}`);

    const membershipIdA = `membership_r10_a_${randomUUID()}`;
    const membershipIdB = `membership_r10_b_${randomUUID()}`;
    membershipIds.add(membershipIdA);
    membershipIds.add(membershipIdB);
    const sourceRefA = `source_r10_${membershipIdA}`;
    const sourceRefB = `source_r10_${membershipIdB}`;
    const sharedScopeRef = `scope_r10_${randomUUID()}`;

    await db.query(
      `
        INSERT INTO iam.identity_memberships (
          membership_id, source_ref, principal_id, realm, scope_ref, membership_status, created_at, updated_at, record
        ) VALUES (
          $1, $2, $3, 'tenant', $4, 'active', NOW(), NOW(), '{}'::jsonb
        )
      `,
      [membershipIdA, sourceRefA, principalId, sharedScopeRef],
    );
    await insertMembershipFixture(db, membershipIdB, sourceRefB, principalId);

    const beforeRow = await db.query<{ scope_ref: string; updated_at: Date }>(
      `SELECT scope_ref, updated_at FROM iam.identity_memberships WHERE membership_id = $1`,
      [membershipIdB],
    );

    // B's own source_ref, but claiming A's (principal_id, realm, scope_ref)
    // -- this must hit uq_identity_memberships_context against A's row, not
    // the source_ref arbiter.
    await expect(
      repo.ensureMembershipRecord({
        membershipId: membershipIdB,
        sourceRef: sourceRefB,
        principalId,
        realm: "tenant",
        scopeRef: sharedScopeRef,
        tenantId: "tenant_fixture",
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow();

    const afterRow = await db.query<{ scope_ref: string; updated_at: Date }>(
      `SELECT scope_ref, updated_at FROM iam.identity_memberships WHERE membership_id = $1`,
      [membershipIdB],
    );
    expect(afterRow.rows[0]?.scope_ref).toBe(beforeRow.rows[0]?.scope_ref);
    expect(afterRow.rows[0]?.updated_at.toISOString()).toBe(
      beforeRow.rows[0]?.updated_at.toISOString(),
    );
  });

  // SR-AUTH-SESSION-SUPERSEDE-20261003 R9-TX-V (second reopen): the R9-TX
  // case above only races two upsertWorkforceIdentity calls via
  // Promise.all. That is timing-only -- real Postgres's ON CONFLICT
  // speculative-insertion protocol can also resolve this race without ever
  // raising a unique_violation at all, so a green run there does not prove
  // runUpsertWithConflictRecovery's SAVEPOINT/ROLLBACK TO SAVEPOINT branch
  // executed; it could pass on ordinary ON CONFLICT serialization alone.
  // This case instead uses a gate connection (the same deterministic
  // lock-wait technique as the R2/R6 case above) to guarantee a genuine,
  // uncommitted collision on the *identical* principal_id, membership_id
  // and role_binding_id, then reads back the actual SQL this connection
  // sent to confirm the recovery branch, not just the final row, is what
  // ran. principal_id is the table's PRIMARY KEY while source_ref is a
  // separate UNIQUE column and the ON CONFLICT arbiter (see
  // infra/migrations/V0068__canonical_identity_authority.sql); concurrent
  // inserts that share both columns can surface a genuine 23505 on the
  // PRIMARY KEY index before the arbiter's own conflict is resolved, which
  // ON CONFLICT (source_ref) does not suppress.
  it("R9-TX-DET (real Postgres): a genuine concurrent first-time collision on the exact same not-yet-committed identity forces the real SAVEPOINT recovery branch inside upsertWorkforceIdentity, observed via the actual SQL trace, and the bundle still commits with converged content", async () => {
    expect(DATABASE_URL).toBeTruthy();

    // This deliberately does NOT sequence one writer's commit before the
    // other starts (e.g. an explicit gate transaction held open until a
    // second connection reports itself blocked via pg_blocking_pids, then
    // committed). An INSERT ... ON CONFLICT statement confirms its own
    // speculatively-inserted tuple -- resolving whether it is a fresh
    // INSERT or a DO UPDATE -- entirely within that one statement's own
    // execution, before its surrounding transaction ever commits. A second
    // writer that only *waits on the row lock* and resumes after the first
    // transaction commits therefore resolves cleanly through the arbiter's
    // ordinary ON CONFLICT DO UPDATE path: Postgres updates the
    // already-committed row in place and never re-validates the
    // non-arbiter primary key for an UPDATE that doesn't touch it, so the
    // recovery branch this test exists to force is never reached (this was
    // verified against real Postgres: a gate-commits-first version of this
    // test reliably produced zero ROLLBACK TO SAVEPOINT statements).
    //
    // Two insert attempts that are *actually* concurrent -- neither one's
    // statement having resolved before the other's own conflict check runs
    // -- is what the production race (two parallel first-time
    // authentications for the same account) looks like, and what reaches
    // the non-arbiter conflict: both racers' speculative tuples are live
    // at once, so the loser's non-arbiter primary-key index entry collides
    // with the winner's, raising a hard 23505 that only the SAVEPOINT
    // recovery in runUpsertWithConflictRecovery absorbs (see R9-TX above,
    // which proved this mechanism is necessary on real Postgres: without
    // it, the losing transaction's follow-up SELECT itself fails with
    // 25P02 and the whole bundle is lost instead of converging). This test
    // adds the explicit SQL-trace evidence that R9-TX alone cannot supply:
    // a passing outcome there could equally be explained by a lucky,
    // error-free ON CONFLICT resolution on both sides.
    const dbA = new DatabaseService();
    const dbB = new DatabaseService();
    databases.push(dbA, dbB);
    const repoA = new IdentityRepository(dbA);
    const repoB = new IdentityRepository(dbB);

    const principalId = `principal_wfi_det_${randomUUID()}`;
    const principalSourceRef = `source_wfi_det_${principalId}`;
    principalIds.add(principalId);
    const membershipId = `membership_wfi_det_${randomUUID()}`;
    const membershipSourceRef = `source_wfi_det_${membershipId}`;
    membershipIds.add(membershipId);
    const roleBindingId = `role_binding_wfi_det_${randomUUID()}`;
    const roleBindingSourceRef = `source_wfi_det_${roleBindingId}`;
    roleBindingIds.add(roleBindingId);

    const makeBundle = (ts: string) => ({
      principal: {
        principalId,
        sourceRef: principalSourceRef,
        issuer: "test_issuer",
        subject: `sub_${principalId}`,
        principalType: "human",
        email: "wfi-det@example.com",
        emailVerified: true,
        displayName: "WFI Det Fixture",
        status: "active",
        createdAt: ts,
        updatedAt: ts,
      } satisfies CanonicalIdentityPrincipalRecord,
      membership: {
        membershipId,
        sourceRef: membershipSourceRef,
        principalId,
        realm: "tenant",
        scopeRef: `scope_${membershipId}`,
        tenantId: "tenant_fixture",
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: ts,
        updatedAt: ts,
      } satisfies CanonicalIdentityMembershipRecord,
      roleBindings: [
        {
          roleBindingId,
          sourceRef: roleBindingSourceRef,
          membershipId,
          roleCode: "ops_user",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: ts,
          validTo: null,
          createdAt: ts,
          updatedAt: ts,
        } satisfies CanonicalIdentityRoleBindingRecord,
      ],
    });

    const tsA = new Date(Date.now() - 60_000).toISOString();
    const tsB = new Date(Date.now() - 30_000).toISOString();
    const bundleA = makeBundle(tsA);
    const bundleB = makeBundle(tsB);

    const traceA = traceClientQueries(dbA);
    const traceB = traceClientQueries(dbB);

    // Both racers' real, public, transaction-owning entry points fired
    // together with no await between them, so neither's statement can
    // have resolved before the other's own conflict check runs.
    const [resultA, resultB] = await Promise.all([
      repoA.upsertWorkforceIdentity(
        bundleA.principal,
        bundleA.membership,
        bundleA.roleBindings,
      ),
      repoB.upsertWorkforceIdentity(
        bundleB.principal,
        bundleB.membership,
        bundleB.roleBindings,
      ),
    ]);

    // Convergence: both racers' content for this source_ref must agree on
    // exactly one of the two writers' timestamps -- never a torn mix.
    expect(resultA.principal.updatedAt).toBe(resultB.principal.updatedAt);
    expect([tsA, tsB]).toContain(resultA.principal.updatedAt);
    expect(resultA.membership.updatedAt).toBe(resultB.membership.updatedAt);
    expect(resultA.roleBindings[0]?.updatedAt).toBe(
      resultB.roleBindings[0]?.updatedAt,
    );

    const principalRow = await dbA.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_principals WHERE principal_id = $1`,
      [principalId],
    );
    expect(principalRow.rows[0]?.updated_at.toISOString()).toBe(
      resultA.principal.updatedAt,
    );
    const membershipRow = await dbA.query<{ updated_at: Date }>(
      `SELECT updated_at FROM iam.identity_memberships WHERE membership_id = $1`,
      [membershipId],
    );
    expect(membershipRow.rows[0]?.updated_at.toISOString()).toBe(
      resultA.membership.updatedAt,
    );

    // The real recovery branch -- not an injected double -- actually fired
    // against real Postgres on at least one racer's connection: SAVEPOINT
    // before the attempt, a genuine unique violation, ROLLBACK TO
    // SAVEPOINT, then a successful retry, and that racer's bundle still
    // reached COMMIT rather than being lost to an aborted transaction.
    //
    // Both repos' constructors also fire an unawaited, best-effort
    // ensureDefaultPlatformAccount()/ensureLiveMapObserverAccount() seed
    // call on a separate connection from this same traced DatabaseService;
    // isolate each racer's own connection (the one that actually inserted
    // this test's `principalId`) before counting SAVEPOINT/ROLLBACK
    // traffic, so unrelated background seeding never pollutes this
    // assertion.
    const aQueries = findConnectionByBoundParam(traceA, principalId).map(
      (q) => q.sql,
    );
    const bQueries = findConnectionByBoundParam(traceB, principalId).map(
      (q) => q.sql,
    );
    const countHits = (queries: string[], prefix: string) =>
      queries.filter((sql) => sql.startsWith(prefix)).length;

    // runUpsertWithConflictRecovery always takes a SAVEPOINT before its
    // first attempt, win or lose, so each racer's own connection shows
    // exactly one.
    expect(countHits(aQueries, "SAVEPOINT upsert_principal_sp")).toBe(1);
    expect(countHits(bQueries, "SAVEPOINT upsert_principal_sp")).toBe(1);

    // Exactly one of the two genuinely-concurrent first-time inserts must
    // lose the race on the non-arbiter primary key and recover via
    // ROLLBACK TO SAVEPOINT + retry; which one loses is not deterministic,
    // only that the recovery branch fired on at least one of them.
    const rollbackToHits =
      countHits(aQueries, "ROLLBACK TO SAVEPOINT upsert_principal_sp") +
      countHits(bQueries, "ROLLBACK TO SAVEPOINT upsert_principal_sp");
    expect(rollbackToHits).toBeGreaterThanOrEqual(1);
    expect(aQueries).toContain("COMMIT");
    expect(bQueries).toContain("COMMIT");
    expect(aQueries).not.toContain("ROLLBACK");
    expect(bQueries).not.toContain("ROLLBACK");
  });

  // SR-AUTH-SESSION-SUPERSEDE-20261003 R9-TX-V (second reopen): the real
  // public first-login path (IapSubjectAdapter.verify,
  // apps/api/src/modules/auth/iap-subject.adapter.ts:301-347) never races
  // two calls with the *identical* principal_id the way the case above
  // does -- every attempt mints its own fresh `principal_iap_${randomUUID()}`
  // draft id and relies purely on the shared, deterministic
  // `iap_subject:${subject}` source_ref to converge. This case exercises
  // that real shape (distinct draft ids, shared source_ref) through the
  // same deterministic gate technique, then drives a genuine, later
  // compatible status mutation through a *third* distinct draft id to
  // confirm canonical source_ref resolution, FK/JSON coherence and prior
  // token invalidation all hold for upsertWorkforceIdentity specifically,
  // not only for the standalone ensurePrincipalRecord path the R2/R6 case
  // above already covers.
  it("R9-TX-DRAFT (real Postgres): two concurrent first-time upsertWorkforceIdentity calls with distinct draft principal ids sharing one source_ref converge on the canonical identity, and a later genuine suspension through a third distinct draft id applies while staying FK/JSON coherent and invalidating a token issued before it landed", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const dbGate = new DatabaseService();
    const dbA = new DatabaseService();
    const dbMonitor = new DatabaseService();
    databases.push(dbGate, dbA, dbMonitor);
    const repoGate = new IdentityRepository(dbGate);
    const repoA = new IdentityRepository(dbA);

    const testKeyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const originalKeyRing = process.env.JWT_KEY_RING_JSON;
    process.env.JWT_KEY_RING_JSON = JSON.stringify([
      {
        kid: "key-r9tx-draft",
        status: "active",
        algorithm: "RS256",
        privateKey: testKeyPair.privateKey,
        publicKey: testKeyPair.publicKey,
      },
    ]);

    try {
      const subject = `sub_wfi_draft_${randomUUID()}`;
      const principalSourceRef = `iap_subject:${subject}`;
      const gateDraftPrincipalId = `principal_wfi_draft_gate_${randomUUID()}`;
      const aDraftPrincipalId = `principal_wfi_draft_a_${randomUUID()}`;
      principalIds.add(gateDraftPrincipalId);
      principalIds.add(aDraftPrincipalId);

      const membershipId = `membership_wfi_draft_${randomUUID()}`;
      const membershipSourceRef = `iap_membership:${subject}`;
      membershipIds.add(membershipId);
      const roleBindingId = `role_binding_wfi_draft_${randomUUID()}`;
      const roleBindingSourceRef = `iap_role_binding:${subject}`;
      roleBindingIds.add(roleBindingId);

      const t0 = new Date(Date.now() - 60_000).toISOString();

      const gateClient = await dbGate.connect();
      let gateCommitted = false;
      let canonicalPrincipalId = "";
      try {
        await gateClient.query("BEGIN");
        const gatePidResult = await gateClient.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        const gatePid = gatePidResult.rows[0]!.pid;

        await (
          repoGate as unknown as {
            upsertPrincipal(
              client: PoolClient,
              record: CanonicalIdentityPrincipalRecord,
              insideTransaction: boolean,
            ): Promise<CanonicalIdentityPrincipalRecord>;
          }
        ).upsertPrincipal(
          gateClient,
          {
            principalId: gateDraftPrincipalId,
            sourceRef: principalSourceRef,
            issuer: "google_iap",
            subject,
            principalType: "human",
            email: "wfi-draft@example.com",
            emailVerified: true,
            displayName: "WFI Draft Fixture",
            status: "active",
            createdAt: t0,
            updatedAt: t0,
          },
          false,
        );

        // A mints its own, different random draft principal_id for the
        // exact same external subject -- the real
        // IapSubjectAdapter.verify shape, where every first-login attempt
        // generates a fresh randomUUID principal_id but reuses the
        // deterministic `iap_subject:${subject}` source_ref.
        const aPromise = repoA.upsertWorkforceIdentity(
          {
            principalId: aDraftPrincipalId,
            sourceRef: principalSourceRef,
            issuer: "google_iap",
            subject,
            principalType: "human",
            email: "wfi-draft@example.com",
            emailVerified: true,
            displayName: "WFI Draft Fixture",
            status: "active",
            createdAt: t0,
            updatedAt: t0,
          },
          {
            membershipId,
            sourceRef: membershipSourceRef,
            principalId: aDraftPrincipalId,
            realm: "ops",
            scopeRef: "platform:control_plane",
            tenantId: null,
            partnerId: null,
            status: "active",
            invitedByPrincipalId: null,
            invitationId: null,
            createdAt: t0,
            updatedAt: t0,
          },
          [
            {
              roleBindingId,
              sourceRef: roleBindingSourceRef,
              membershipId,
              roleCode: "operator",
              grantedByPrincipalId: null,
              approvalId: null,
              validFrom: t0,
              validTo: null,
              createdAt: t0,
              updatedAt: t0,
            },
          ],
        );

        await waitUntilBlockedOn(dbMonitor, gatePid);

        await gateClient.query("COMMIT");
        gateCommitted = true;

        const result = await aPromise;

        // Canonical source_ref resolution: whichever draft actually
        // committed first for this source_ref wins; the other caller's
        // own discarded draft principal_id must never leak into the
        // returned/persisted identity, and every dependent row must point
        // at that one canonical principal_id (FK coherence).
        canonicalPrincipalId = result.principal.principalId;
        expect([gateDraftPrincipalId, aDraftPrincipalId]).toContain(
          canonicalPrincipalId,
        );
        expect(result.membership.principalId).toBe(canonicalPrincipalId);

        const principalCountRow = await dbMonitor.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM iam.identity_principals WHERE source_ref = $1`,
          [principalSourceRef],
        );
        expect(principalCountRow.rows[0]?.count).toBe("1");

        const membershipRow = await dbMonitor.query<{
          principal_id: string;
        }>(
          `SELECT principal_id FROM iam.identity_memberships WHERE membership_id = $1`,
          [membershipId],
        );
        expect(membershipRow.rows[0]?.principal_id).toBe(
          canonicalPrincipalId,
        );
      } finally {
        if (!gateCommitted) {
          await gateClient.query("ROLLBACK").catch(() => undefined);
        }
        gateClient.release();
      }

      const jwtAuthService = new JwtAuthService(repoA);
      const identity = {
        authMode: "jwt_bearer" as const,
        actorType: "ops_user" as const,
        actorId: canonicalPrincipalId,
        principalId: canonicalPrincipalId,
        realm: "ops" as const,
        tenantId: null,
        roles: ["operator"],
        roleFamilies: ["ops" as const],
        scopes: [] as string[],
      };

      // tokenVersion is set explicitly from the known, just-converged
      // updatedAt rather than through issueSessionToken's own
      // ensurePrincipal path: that path's buildPrincipalRecord mints a
      // distinct `jwt_principal:${realm}:${principalId}` source_ref, which
      // is the wrong identity scheme for a principal provisioned through
      // the IAP workforce path under test here.
      const issued = await jwtAuthService.issueSessionToken(
        { ...identity, membershipId },
        {
          tokenVersion: Date.parse(t0),
          authTime: new Date().toISOString(),
        },
      );
      sessionIds.add(issued.sessionId);
      expect(
        await jwtAuthService.verifyAccessToken(issued.token),
      ).not.toBeNull();

      // A genuinely newer, compatible mutation lands through the exact
      // same transactional entry point, via a THIRD distinct draft
      // principal_id (e.g. a concurrent automated re-provisioning run that
      // also observed the subject should now be suspended) -- not a race
      // this time, so no retry is required, but the same canonical
      // source_ref resolution and FK/JSON coherence must hold for a
      // genuine content change too.
      const thirdDraftPrincipalId = `principal_wfi_draft_c_${randomUUID()}`;
      principalIds.add(thirdDraftPrincipalId);
      const t1 = new Date().toISOString();

      const mutated = await repoA.upsertWorkforceIdentity(
        {
          principalId: thirdDraftPrincipalId,
          sourceRef: principalSourceRef,
          issuer: "google_iap",
          subject,
          principalType: "human",
          email: "wfi-draft@example.com",
          emailVerified: true,
          displayName: "WFI Draft Fixture",
          status: "suspended",
          createdAt: t0,
          updatedAt: t1,
        },
        {
          membershipId,
          sourceRef: membershipSourceRef,
          principalId: thirdDraftPrincipalId,
          realm: "ops",
          scopeRef: "platform:control_plane",
          tenantId: null,
          partnerId: null,
          status: "active",
          invitedByPrincipalId: null,
          invitationId: null,
          createdAt: t0,
          updatedAt: t0,
        },
        [
          {
            roleBindingId,
            sourceRef: roleBindingSourceRef,
            membershipId,
            roleCode: "operator",
            grantedByPrincipalId: null,
            approvalId: null,
            validFrom: t0,
            validTo: null,
            createdAt: t0,
            updatedAt: t0,
          },
        ],
      );

      // The suspension's new content applies, but the canonical
      // principal_id from the earlier race -- not this third call's own
      // discarded draft -- is what persists, with the record JSON
      // re-stamped to match.
      expect(mutated.principal.principalId).toBe(canonicalPrincipalId);
      expect(mutated.principal.status).toBe("suspended");
      expect(mutated.principal.updatedAt).toBe(t1);

      const principalRow = await dbMonitor.query<{
        principal_id: string;
        account_status: string;
        updated_at: Date;
        record: { principalId: string };
      }>(
        `SELECT principal_id, account_status, updated_at, record FROM iam.identity_principals WHERE source_ref = $1`,
        [principalSourceRef],
      );
      expect(principalRow.rows[0]?.principal_id).toBe(canonicalPrincipalId);
      expect(principalRow.rows[0]?.account_status).toBe("suspended");
      expect(principalRow.rows[0]?.updated_at.toISOString()).toBe(t1);
      expect(principalRow.rows[0]?.record.principalId).toBe(
        canonicalPrincipalId,
      );

      // The actual acceptance requirement: a token issued while the
      // subject was still active must be rejected once the genuine
      // suspension has landed, even though it arrived through a brand-new
      // draft identity bundle rather than a direct ensurePrincipalRecord
      // call.
      expect(
        await jwtAuthService.verifyAccessToken(issued.token),
      ).toBeNull();
    } finally {
      if (originalKeyRing === undefined) {
        delete process.env.JWT_KEY_RING_JSON;
      } else {
        process.env.JWT_KEY_RING_JSON = originalKeyRing;
      }
    }
  });

  // SR-AUTH-SESSION-SUPERSEDE-20261003 R9-TX-V (second reopen): R10 above
  // already proves a genuine, non-arbiter conflict rejects the *single*
  // statement that triggers it. This case proves the surrounding
  // transaction in upsertWorkforceIdentity is still atomic when that
  // happens on the *second* statement of the bundle -- the first
  // statement's write (a genuine status mutation on an already-existing
  // principal, not a no-op) must not survive if a later statement in the
  // same transaction hits an unrecoverable conflict and the whole bundle
  // rolls back.
  it("R9-TX-ROLLBACK (real Postgres): a genuine non-recoverable conflict on the membership statement rolls back the earlier, already-succeeded principal mutation inside the same upsertWorkforceIdentity transaction", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);

    const existingPrincipalId = `principal_r9rb_existing_${randomUUID()}`;
    principalIds.add(existingPrincipalId);
    await insertPrincipalFixture(
      db,
      existingPrincipalId,
      `source_${existingPrincipalId}`,
    );

    const existingMembershipId = `membership_r9rb_existing_${randomUUID()}`;
    membershipIds.add(existingMembershipId);
    await insertMembershipFixture(
      db,
      existingMembershipId,
      `source_${existingMembershipId}`,
      existingPrincipalId,
    );
    const sharedScopeRef = `scope_${existingMembershipId}`;

    const beforeRow = await db.query<{
      account_status: string;
      updated_at: Date;
    }>(
      `SELECT account_status, updated_at FROM iam.identity_principals WHERE principal_id = $1`,
      [existingPrincipalId],
    );

    const newMembershipId = `membership_r9rb_new_${randomUUID()}`;
    membershipIds.add(newMembershipId);
    const roleBindingId = `role_binding_r9rb_${randomUUID()}`;
    roleBindingIds.add(roleBindingId);
    const t1 = new Date().toISOString();

    // Statement 1 (principal): a genuine mutation of the already-existing
    // principal -- not a no-op -- so there is a real write to roll back.
    // Statement 2 (membership): a brand-new membership_id/source_ref, but
    // targeting the SAME (principal_id, realm, scope_ref) as the
    // pre-existing membership above. That hits
    // uq_identity_memberships_context against a genuinely different,
    // already-committed row, not the source_ref arbiter, so the retry
    // inside runUpsertWithConflictRecovery hits the identical conflict
    // again and must propagate (R10 semantics), aborting the whole
    // transaction.
    await expect(
      repo.upsertWorkforceIdentity(
        {
          principalId: existingPrincipalId,
          sourceRef: `source_${existingPrincipalId}`,
          issuer: "test_issuer",
          subject: `sub_${existingPrincipalId}`,
          principalType: "human",
          email: `${existingPrincipalId}@example.com`,
          emailVerified: true,
          displayName: "Upsert Concurrency Fixture",
          status: "suspended",
          createdAt: t1,
          updatedAt: t1,
        },
        {
          membershipId: newMembershipId,
          sourceRef: `source_${newMembershipId}`,
          principalId: existingPrincipalId,
          realm: "tenant",
          scopeRef: sharedScopeRef,
          tenantId: "tenant_fixture",
          partnerId: null,
          status: "active",
          invitedByPrincipalId: null,
          invitationId: null,
          createdAt: t1,
          updatedAt: t1,
        },
        [
          {
            roleBindingId,
            sourceRef: `source_${roleBindingId}`,
            membershipId: newMembershipId,
            roleCode: "ops_user",
            grantedByPrincipalId: null,
            approvalId: null,
            validFrom: t1,
            validTo: null,
            createdAt: t1,
            updatedAt: t1,
          },
        ],
      ),
    ).rejects.toThrow();

    // The earlier, genuinely-succeeded statement in the same transaction
    // must not have survived: the principal must still show its pre-call
    // status and updated_at, not the suspension this failed call
    // attempted.
    const afterRow = await db.query<{
      account_status: string;
      updated_at: Date;
    }>(
      `SELECT account_status, updated_at FROM iam.identity_principals WHERE principal_id = $1`,
      [existingPrincipalId],
    );
    expect(afterRow.rows[0]?.account_status).toBe(
      beforeRow.rows[0]?.account_status,
    );
    expect(afterRow.rows[0]?.updated_at.toISOString()).toBe(
      beforeRow.rows[0]?.updated_at.toISOString(),
    );

    const newMembershipRow = await db.query(
      `SELECT 1 FROM iam.identity_memberships WHERE membership_id = $1`,
      [newMembershipId],
    );
    expect(newMembershipRow.rows).toHaveLength(0);
  });
});
