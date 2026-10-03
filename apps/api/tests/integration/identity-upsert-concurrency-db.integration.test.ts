import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
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

describe("SR-AUTH-SESSION-SUPERSEDE-20261003 R2: ensure*Record no-op/mutation/concurrency against real Postgres", () => {
  const databases: DatabaseService[] = [];
  const principalIds = new Set<string>();
  const membershipIds = new Set<string>();
  const roleBindingIds = new Set<string>();

  afterEach(async () => {
    if (DATABASE_URL) {
      const cleanup = new DatabaseService();
      try {
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

    const dbRow = await dbA.query<{ valid_from: Date }>(
      `SELECT valid_from FROM iam.identity_role_bindings WHERE role_binding_id = $1`,
      [roleBindingId],
    );
    expect(dbRow.rows[0]?.valid_from.toISOString()).toBe(resultA.validFrom);
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
});
