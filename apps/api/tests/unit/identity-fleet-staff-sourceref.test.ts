import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { OidcPkceService } from "../../src/modules/auth/oidc-pkce.service";
import { PartnerUserIdentityLinkRepository } from "../../src/modules/tenant-partner/partner-user-identity-link.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

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

/**
 * FLEET-ONB-002 acceptance line 290 names both `manageFleetHumanRole` and
 * `exchangePartnerCallbackSession` as readers that must recognize records
 * built with these helpers. The describe block above exercises the former
 * directly; this one exercises the real, unmodified
 * `exchangePartnerCallbackSession` (oidc-pkce.service.ts, outside this
 * task's write_scopes — only imported, never changed) so an independent
 * drift in that call site's own inline sourceRef literals would also fail
 * here, not just a drift in `manageFleetHumanRole`'s.
 */
describe("exchangePartnerCallbackSession recognizes records built with the new sourceRef/scopeRef helpers (FLEET-ONB-002 regression)", () => {
  const OIDC_CODE = "partner_fleet_staff_sourceref_oidc_subject";
  const OIDC_SUB = `sub_oidc_${createHash("sha256").update(OIDC_CODE).digest("hex").slice(0, 12)}`;
  const INVITED_PRINCIPAL_ID = "principal_fleet_fixture_oidc_sourceref_001";
  // Matches tests/unit/fleet-partner-human-role-authority-20261026.test.ts's
  // "fleet-demo-001" entry (tenant-partner.service.ts), already seeded as an
  // active fleet_partner entry; no fixture mutation needed.
  const ENTRY = "fleet-demo-001";

  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("OIDC_MOCK_MODE", "true");
    vi.stubEnv("JWT_SECRET", "test_jwt_secret_key_32_characters_long_min!");
  });

  async function setup() {
    const repository = new IdentityRepository();
    const link = new PartnerUserIdentityLinkRepository();
    const tenant = new TenantPartnerService(new AuditNotificationService());
    const jwt = new JwtAuthService(repository, tenant, undefined, undefined, link);
    const oidc = new OidcPkceService(jwt, tenant, undefined, link, undefined, repository);

    // createForInvitedPrincipal (this task), not resolveOrCreate: the link's
    // drtsPassengerId is the invited principal's already-known principalId.
    const linked = await link.createForInvitedPrincipal(
      ENTRY,
      OIDC_SUB,
      INVITED_PRINCIPAL_ID,
      "2026-11-14T10:00:00.000Z",
    );
    expect(linked).not.toBeNull();

    async function login() {
      const state = oidc.generateLoginParameters("partner", { partnerId: ENTRY });
      return oidc.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          code: OIDC_CODE,
          state: state.state,
          partnerId: ENTRY,
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        { stateToken: state.stateToken },
      );
    }

    return { repository, login };
  }

  it("grants the managed Fleet role once a principal/membership/binding built with the new helpers are seeded", async () => {
    const { repository, login } = await setup();

    // No principal yet: findPrincipalById(drtsPassengerId) finds nothing, so
    // exchangePartnerCallbackSession must not grant managed Fleet access.
    const unassigned = await login();
    expect(unassigned.identity.membershipId).toBeUndefined();

    const now = "2026-11-14T10:05:00.000Z";
    await repository.ensurePrincipalRecord({
      principalId: INVITED_PRINCIPAL_ID,
      sourceRef: buildFleetPartnerPrincipalSourceRef(INVITED_PRINCIPAL_ID),
      issuer: "google",
      subject: `google-sub-${INVITED_PRINCIPAL_ID}`,
      principalType: "human",
      email: "fleet.staff.sourceref@example.com",
      emailVerified: true,
      displayName: "Fleet Staff SourceRef Fixture",
      status: "active",
      createdAt: now,
      updatedAt: now,
    } as CanonicalIdentityPrincipalRecord);
    const membership = await repository.ensureMembershipRecord({
      membershipId: "fleet-sourceref-test-membership",
      sourceRef: buildFleetMemberSourceRef(ENTRY, INVITED_PRINCIPAL_ID),
      principalId: INVITED_PRINCIPAL_ID,
      realm: "partner",
      scopeRef: buildFleetScopeRef(ENTRY),
      tenantId: null,
      partnerId: "fleet-demo-001",
      status: "active",
      invitedByPrincipalId: "manager",
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });
    await repository.ensureRoleBindingRecord({
      roleBindingId: "fleet-sourceref-test-binding",
      sourceRef: buildFleetRoleBindingSourceRef(ENTRY, INVITED_PRINCIPAL_ID),
      membershipId: membership.membershipId,
      roleCode: "fleet_partner_ops",
      grantedByPrincipalId: "manager",
      approvalId: null,
      validFrom: now,
      validTo: null,
      createdAt: now,
      updatedAt: now,
    });

    const granted = await login();
    expect(granted.identity).toMatchObject({
      membershipId: membership.membershipId,
      partnerId: "fleet-demo-001",
      partnerEntrySlug: ENTRY,
      roles: ["fleet_partner_ops"],
    });
  });

  it("does not grant managed Fleet role access when the principal sourceRef drifts from buildFleetPartnerPrincipalSourceRef's format (format-drift fence)", async () => {
    const { repository, login } = await setup();

    const now = "2026-11-14T10:05:00.000Z";
    // Format drift: an off-convention sourceRef, as an uncoordinated change
    // to the helper (or to exchangePartnerCallbackSession's own inline
    // literal) could produce.
    await repository.ensurePrincipalRecord({
      principalId: INVITED_PRINCIPAL_ID,
      sourceRef: `jwt_principal:${INVITED_PRINCIPAL_ID}`,
      issuer: "google",
      subject: `google-sub-${INVITED_PRINCIPAL_ID}`,
      principalType: "human",
      email: "fleet.staff.sourceref@example.com",
      emailVerified: true,
      displayName: "Fleet Staff SourceRef Fixture",
      status: "active",
      createdAt: now,
      updatedAt: now,
    } as CanonicalIdentityPrincipalRecord);
    await repository.ensureMembershipRecord({
      membershipId: "fleet-sourceref-drift-membership",
      sourceRef: buildFleetMemberSourceRef(ENTRY, INVITED_PRINCIPAL_ID),
      principalId: INVITED_PRINCIPAL_ID,
      realm: "partner",
      scopeRef: buildFleetScopeRef(ENTRY),
      tenantId: null,
      partnerId: "fleet-demo-001",
      status: "active",
      invitedByPrincipalId: "manager",
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await login();
    expect(result.identity.membershipId).toBeUndefined();
  });
});
