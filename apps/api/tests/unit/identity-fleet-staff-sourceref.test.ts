import { describe, expect, it, vi } from "vitest";

import type {
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
} from "@drts/contracts";

import {
  buildFleetMemberSourceRef,
  buildFleetPartnerPrincipalSourceRef,
  buildFleetRoleBindingSourceRef,
  buildFleetScopeRef,
  FLEET_INVITATION_ISSUER,
  IdentityRepository,
} from "../../src/modules/identity/identity.repository";

// FLEET-ONB-002 SA/SD §2 (docs/02-architecture/fleet-staff-onboarding-20261114/01_system_sa_sd.md),
// table row for each record kind. These are not re-derivations of the
// convention; they are the literal strings copied out of the two existing
// call sites that already hardcode this format inline:
//   - `apps/api/src/modules/identity/identity.repository.ts` `manageFleetHumanRole`
//     (`fleet_member:${entrySlug}:${principalId}` / `fleet_role:${entrySlug}:${principalId}` /
//     `jwt_principal:partner:${principalId}` / `fleet:${entrySlug}`)
//   - `apps/api/src/modules/auth/oidc-pkce.service.ts` `exchangePartnerCallbackSession`
//     (byte-identical templates, confirmed by inspection; that file is outside
//     this task's write_scopes, so it is not imported here)
const ENTRY_SLUG = "fleet-demo-001";
const PRINCIPAL_ID = "principal_fleet_fixture_sourceref_001";

describe("Fleet staff sourceRef/scopeRef helpers (FLEET-ONB-002)", () => {
  it("FLEET_INVITATION_ISSUER is a distinct, non-authenticatable placeholder issuer", () => {
    expect(FLEET_INVITATION_ISSUER).toBe("fleet_invitation");
  });

  it("buildFleetScopeRef matches the literal `fleet:<entrySlug>` scope used by manageFleetHumanRole/exchangePartnerCallbackSession", () => {
    expect(buildFleetScopeRef(ENTRY_SLUG)).toBe(`fleet:${ENTRY_SLUG}`);
    expect(buildFleetScopeRef(ENTRY_SLUG)).toBe("fleet:fleet-demo-001");
  });

  it("buildFleetPartnerPrincipalSourceRef matches the literal `jwt_principal:partner:<principalId>` sourceRef", () => {
    expect(buildFleetPartnerPrincipalSourceRef(PRINCIPAL_ID)).toBe(
      `jwt_principal:partner:${PRINCIPAL_ID}`,
    );
  });

  it("buildFleetMemberSourceRef matches the literal `fleet_member:<entrySlug>:<principalId>` sourceRef", () => {
    expect(buildFleetMemberSourceRef(ENTRY_SLUG, PRINCIPAL_ID)).toBe(
      `fleet_member:${ENTRY_SLUG}:${PRINCIPAL_ID}`,
    );
  });

  it("buildFleetRoleBindingSourceRef matches the literal `fleet_role:<entrySlug>:<principalId>` sourceRef", () => {
    expect(buildFleetRoleBindingSourceRef(ENTRY_SLUG, PRINCIPAL_ID)).toBe(
      `fleet_role:${ENTRY_SLUG}:${PRINCIPAL_ID}`,
    );
  });
});

/**
 * A minimal PoolClient double that answers the exact query shapes
 * `manageFleetHumanRole` issues (BEGIN/COMMIT/ROLLBACK, SAVEPOINT, the three
 * `FOR UPDATE` lookups, the two `INSERT ... ON CONFLICT (source_ref)` upserts,
 * and the session-revocation UPDATE). It is not a generic SQL engine: each
 * branch below exists only because `manageFleetHumanRole`'s real SQL text
 * contains that substring.
 */
function createManageFleetHumanRoleClientMock(
  principal: CanonicalIdentityPrincipalRecord,
) {
  const memberships = new Map<string, CanonicalIdentityMembershipRecord>();
  const roleBindings = new Map<string, CanonicalIdentityRoleBindingRecord>();

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const text = sql.trim();

    if (
      text.startsWith("BEGIN") ||
      text.startsWith("COMMIT") ||
      text.startsWith("ROLLBACK") ||
      text.startsWith("SAVEPOINT") ||
      text.startsWith("ROLLBACK TO SAVEPOINT")
    ) {
      return { rows: [] };
    }

    if (text.includes("FROM iam.identity_principals WHERE principal_id")) {
      return params[0] === principal.principalId
        ? { rows: [{ record: principal }] }
        : { rows: [] };
    }

    if (
      text.includes("FROM iam.identity_memberships WHERE source_ref") &&
      text.includes("FOR UPDATE")
    ) {
      const existing = memberships.get(params[0] as string);
      return { rows: existing ? [{ record: existing }] : [] };
    }

    if (text.includes("INSERT INTO iam.identity_memberships")) {
      const record = JSON.parse(params[12] as string);
      memberships.set(record.sourceRef, record);
      return { rows: [{ record }] };
    }

    if (
      text.includes("FROM iam.identity_role_bindings WHERE source_ref") &&
      text.includes("FOR UPDATE")
    ) {
      const existing = roleBindings.get(params[0] as string);
      return { rows: existing ? [{ record: existing }] : [] };
    }

    if (text.includes("INSERT INTO iam.identity_role_bindings")) {
      const record = JSON.parse(params[10] as string);
      roleBindings.set(record.sourceRef, record);
      return { rows: [{ record }] };
    }

    if (text.includes("UPDATE iam.identity_sessions")) {
      return { rows: [] };
    }

    throw new Error(`Unmocked manageFleetHumanRole query: ${text}`);
  });

  return { query, release: vi.fn() };
}

function buildInvitedFleetPrincipal(
  principalId: string,
  now: string,
): CanonicalIdentityPrincipalRecord {
  return {
    principalId,
    // This is exactly the string FLEET-ONB-002's createForInvitedPrincipal
    // flow (via acceptFleetStaffOidcInvitation/acceptFleetStaffInvitationWithPassword,
    // FLEET-ONB-004) must upsert the principal's sourceRef to, and exactly
    // what manageFleetHumanRole/exchangePartnerCallbackSession require.
    sourceRef: buildFleetPartnerPrincipalSourceRef(principalId),
    issuer: "google",
    subject: `google-sub-${principalId}`,
    principalType: "human",
    email: "fleet.staff@example.com",
    emailVerified: true,
    displayName: "Fleet Staff Fixture",
    status: "active",
    createdAt: now,
    updatedAt: now,
  } as CanonicalIdentityPrincipalRecord;
}

describe("manageFleetHumanRole recognizes records built with the new sourceRef/scopeRef helpers (FLEET-ONB-002 regression)", () => {
  // manageFleetHumanRole and exchangePartnerCallbackSession
  // (oidc-pkce.service.ts, outside this task's write_scopes) share the exact
  // same inline sourceRef/scopeRef string literals for the principal,
  // membership, and role-binding formulas (confirmed by inspection: both use
  // `jwt_principal:partner:<id>`, `fleet_member:<entrySlug>:<id>`,
  // `fleet_role:<entrySlug>:<id>`, `fleet:<entrySlug>`). Exercising the one
  // call site inside this task's write_scopes that executes those literal
  // comparisons against our helper output therefore regression-protects both.
  it("accepts a principal whose sourceRef was built with buildFleetPartnerPrincipalSourceRef and creates matching membership/binding sourceRefs", async () => {
    const now = "2026-11-14T10:00:00.000Z";
    const principal = buildInvitedFleetPrincipal(PRINCIPAL_ID, now);
    const client = createManageFleetHumanRoleClientMock(principal);
    const databaseService = {
      isEnabled: () => true,
      connect: async () => client,
    };
    const repository = new IdentityRepository(databaseService as never);

    const { membership, binding } = await repository.manageFleetHumanRole({
      entrySlug: ENTRY_SLUG,
      fleetPartnerId: "fleet-demo-001",
      principalId: PRINCIPAL_ID,
      roleCode: "fleet_partner_admin",
      enabled: true,
      validTo: null,
      managerPrincipalId: "principal_platform_admin_fixture",
      audit: async () => {},
    });

    expect(membership.sourceRef).toBe(
      buildFleetMemberSourceRef(ENTRY_SLUG, PRINCIPAL_ID),
    );
    expect(membership.scopeRef).toBe(buildFleetScopeRef(ENTRY_SLUG));
    expect(binding.sourceRef).toBe(
      buildFleetRoleBindingSourceRef(ENTRY_SLUG, PRINCIPAL_ID),
    );
  });

  it("rejects a principal whose sourceRef drifts from buildFleetPartnerPrincipalSourceRef's format (format-drift fence)", async () => {
    const now = "2026-11-14T10:00:00.000Z";
    const principal = buildInvitedFleetPrincipal(PRINCIPAL_ID, now);
    // Simulate format drift: an off-convention sourceRef that a future,
    // uncoordinated change to the helper (or to the inline literal in
    // manageFleetHumanRole/exchangePartnerCallbackSession) could produce.
    principal.sourceRef = `jwt_principal:${PRINCIPAL_ID}`;
    const client = createManageFleetHumanRoleClientMock(principal);
    const databaseService = {
      isEnabled: () => true,
      connect: async () => client,
    };
    const repository = new IdentityRepository(databaseService as never);

    await expect(
      repository.manageFleetHumanRole({
        entrySlug: ENTRY_SLUG,
        fleetPartnerId: "fleet-demo-001",
        principalId: PRINCIPAL_ID,
        roleCode: "fleet_partner_admin",
        enabled: true,
        validTo: null,
        managerPrincipalId: "principal_platform_admin_fixture",
        audit: async () => {},
      }),
    ).rejects.toThrow(
      "Target must have an existing active linked partner-human principal.",
    );
  });
});
