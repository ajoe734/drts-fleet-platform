import { describe, expect, it } from "vitest";

import type { TenantUserRoleRecord } from "../../../../packages/contracts/src";
import type { DatabaseService } from "../../../../apps/api/src/common/db/database.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import {
  FakeConflictAwarePgClient,
  FakeDatabaseServiceHandle,
} from "./fake-conflict-aware-pg-client";

// SR-IDENTITY-002-PRINCIPAL-UPSERT-CONFLICT
//
// Root cause: syncLegacyTenantUserRole generates a brand-new randomUUID()
// principal/membership/role-binding/invitation id on every call, but the
// on-conflict upsert targets the stable `source_ref` business key. The old
// `record = EXCLUDED.record` SET clause let the RETURNED json (and therefore
// every id handed to downstream FK columns) drift to the newly generated
// draft id, while the actually persisted primary-key column stayed at the
// first-ever id. A second sync (e.g. invite -> activate) then tried to point
// identity_memberships.principal_id at an id that was never persisted,
// tripping identity_memberships_principal_id_fkey in real Postgres.
//
// This uses a small interpreter (FakeConflictAwarePgClient) that evaluates
// the *actual* SQL text IdentityRepository sends -- INSERT columns, the ON
// CONFLICT target, and each DO UPDATE SET assignment including the
// jsonb_set(...) fix -- against an in-memory table. It is not a stand-in for
// real Postgres acceptance (that runs remotely per the acceptance runner),
// but it does fail the same way real Postgres would if the SET clause
// regressed back to `record = EXCLUDED.record`.

const TENANT_USER_BASE: TenantUserRoleRecord = {
  userId: "tenant_user_conflict_001",
  tenantId: "tenant_conflict",
  email: "ops-admin@example.com",
  displayName: "Ops Admin",
  roleCode: "tenant_ops_admin",
  status: "invited",
  approvalNotificationOptOut: false,
  invitedAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

// IdentityRepository's constructor fires an unawaited
// ensureDefaultPlatformAccount(), which upserts its own
// platform_admin_default principal/membership/role-binding into the same
// fake tables. Every helper below scopes to this test's own source_ref
// prefix so that seed row is never mistaken for a conflict-upsert bug.
const SOURCE_PREFIX = `tenant_user_role:${TENANT_USER_BASE.userId}`;

function newDbBackedRepository() {
  const handle = new FakeDatabaseServiceHandle();
  const repository = new IdentityRepository(
    handle as unknown as DatabaseService,
  );
  return { repository, client: handle.client };
}

function ownRows(client: FakeConflictAwarePgClient, table: string) {
  return (client.tables.get(table) ?? []).filter((row) =>
    String(row.source_ref ?? "").startsWith(SOURCE_PREFIX),
  );
}

function principalsTable(client: FakeConflictAwarePgClient) {
  return ownRows(client, "iam.identity_principals");
}

function membershipsTable(client: FakeConflictAwarePgClient) {
  return ownRows(client, "iam.identity_memberships");
}

function roleBindingsTable(client: FakeConflictAwarePgClient) {
  return ownRows(client, "iam.identity_role_bindings");
}

function invitationsTable(client: FakeConflictAwarePgClient) {
  return ownRows(client, "iam.identity_invitations");
}

describe("SR-IDENTITY-002: identity_principals upsert conflict preserves persisted keys", () => {
  it("reproduces the invite -> activate resync without an FK-breaking id drift", async () => {
    const { repository, client } = newDbBackedRepository();

    const invited = await repository.syncLegacyTenantUserRole({
      ...TENANT_USER_BASE,
    });

    expect(principalsTable(client)).toHaveLength(1);
    expect(membershipsTable(client)).toHaveLength(1);
    expect(roleBindingsTable(client)).toHaveLength(1);

    const activated = await repository.syncLegacyTenantUserRole({
      ...TENANT_USER_BASE,
      status: "active",
      updatedAt: "2026-08-01T11:00:00.000Z",
    });

    // Old failure mode: a second sync on the same source_ref would still
    // only produce one persisted row (ON CONFLICT), but the *returned*
    // principal/membership/role-binding ids would silently diverge from
    // the persisted primary-key column because `record = EXCLUDED.record`
    // overwrote the JSON with the freshly generated draft id.
    expect(principalsTable(client)).toHaveLength(1);
    expect(membershipsTable(client)).toHaveLength(1);
    expect(roleBindingsTable(client)).toHaveLength(1);

    expect(activated.principal.principalId).toBe(invited.principal.principalId);
    expect(activated.membership.membershipId).toBe(
      invited.membership.membershipId,
    );
    expect(activated.roleBinding.roleBindingId).toBe(
      invited.roleBinding.roleBindingId,
    );
    expect(activated.invitation?.invitationId).toBe(
      invited.invitation?.invitationId,
    );

    // The returned principal id must equal the actually persisted primary
    // key column, not merely a value chosen by the test's own assertions.
    const persistedPrincipalRow = principalsTable(client)[0]!;
    expect(activated.principal.principalId).toBe(
      persistedPrincipalRow.principal_id,
    );

    // The membership's principal_id FK column must point at a principal
    // row that actually exists -- this is exactly the constraint that
    // failed as identity_memberships_principal_id_fkey in real Postgres.
    const persistedMembershipRow = membershipsTable(client)[0]!;
    const principalIds = new Set(
      principalsTable(client).map((row) => row.principal_id),
    );
    expect(principalIds.has(persistedMembershipRow.principal_id)).toBe(true);
    expect(persistedMembershipRow.principal_id).toBe(
      persistedPrincipalRow.principal_id,
    );
  });

  it("keeps the invitation FK stable across repeated resync of the same source_ref", async () => {
    const { repository, client } = newDbBackedRepository();

    await repository.syncLegacyTenantUserRole({ ...TENANT_USER_BASE });
    const second = await repository.syncLegacyTenantUserRole({
      ...TENANT_USER_BASE,
      status: "active",
      updatedAt: "2026-08-01T11:00:00.000Z",
    });
    const third = await repository.syncLegacyTenantUserRole({
      ...TENANT_USER_BASE,
      roleCode: "tenant_finance_admin",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    expect(invitationsTable(client)).toHaveLength(1);
    expect(third.invitation?.invitationId).toBe(second.invitation?.invitationId);

    const persistedMembershipRow = membershipsTable(client)[0]!;
    const invitationIds = new Set(
      invitationsTable(client).map((row) => row.invitation_id),
    );
    expect(
      invitationIds.has(persistedMembershipRow.invitation_id as string),
    ).toBe(true);
    expect(third.roleBinding.roleCode).toBe("tenant_finance_admin");
    expect(roleBindingsTable(client)).toHaveLength(1);
  });

  it("keeps concurrent resyncs of the same source_ref on the same persisted principal", async () => {
    const { repository, client } = newDbBackedRepository();

    await repository.syncLegacyTenantUserRole({ ...TENANT_USER_BASE });

    const [left, right] = await Promise.all([
      repository.syncLegacyTenantUserRole({
        ...TENANT_USER_BASE,
        status: "active",
        updatedAt: "2026-08-01T11:00:00.000Z",
      }),
      repository.syncLegacyTenantUserRole({
        ...TENANT_USER_BASE,
        status: "active",
        updatedAt: "2026-08-01T11:00:01.000Z",
      }),
    ]);

    expect(principalsTable(client)).toHaveLength(1);
    const persistedPrincipalRow = principalsTable(client)[0]!;
    expect(left.principal.principalId).toBe(persistedPrincipalRow.principal_id);
    expect(right.principal.principalId).toBe(
      persistedPrincipalRow.principal_id,
    );

    const principalIds = new Set(
      principalsTable(client).map((row) => row.principal_id),
    );
    for (const membershipRow of membershipsTable(client)) {
      expect(principalIds.has(membershipRow.principal_id)).toBe(true);
    }
  });
});
