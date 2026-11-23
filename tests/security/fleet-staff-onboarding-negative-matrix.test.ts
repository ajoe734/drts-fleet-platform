import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PartnerChannelEntryRecord } from "@drts/contracts";
import type {
  CanonicalIdentityInvitationRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
} from "@drts/contracts";

import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { PartnerUserIdentityLinkRepository } from "../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";

/**
 * FLEET-ONB-007 SA/SD §9: two end-to-end negative-matrix rows on the Fleet
 * staff invitation Google-bind chain
 * (`AuthController.exchangePartnerCallbackSession` ->
 * `OidcPkceService.issueVerifiedFleetSession`) that
 * tests/security/iam-oidc-strict-negative.test.ts's
 * "FLEET-ONB-004 Fleet staff invitation Google-bind: strict negative
 * controls" describe block does not cover:
 *
 *  - `claims.email_verified !== true` (SA/SD §9 row 5) -- enforced in
 *    `issueVerifiedFleetSession` itself, before the invitation is even
 *    looked up.
 *  - the named `partner_entries` row being inactive (SA/SD §9 row 8's
 *    second half; `fleet_partners.active === false` is already covered by
 *    apps/api/tests/unit/fleet-staff-invitation-accept.test.ts) --
 *    `TenantPartnerService.listPartnerEntries` filters on `activeFlag` and
 *    `status === "active"`, so an inactive entry resolves to no match at
 *    all, the same `PARTNER_ENTRY_NOT_FOUND` branch as a missing entry.
 *
 * Same minimal PoolClient double convention as
 * tests/unit/identity-fleet-staff-sourceref.test.ts and
 * iam-oidc-strict-negative.test.ts's fleet describe block (duplicated, not
 * imported, since those are local, unexported helpers).
 */
describe("FLEET-ONB-007 Fleet staff invitation Google-bind: email_verified and partner_entries negative controls", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("OIDC_MOCK_MODE", "true");
    vi.stubEnv("JWT_SECRET", "test_jwt_secret_key_32_characters_long_min!");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function createFleetDatabaseDouble(activeFleetPartnerId: string) {
    const principals = new Map<string, CanonicalIdentityPrincipalRecord>();
    const principalsByIssuerSubject = new Map<
      string,
      CanonicalIdentityPrincipalRecord
    >();
    const memberships = new Map<string, CanonicalIdentityMembershipRecord>();
    const membershipsBySourceRef = new Map<
      string,
      CanonicalIdentityMembershipRecord
    >();
    const roleBindingsByMembership = new Map<
      string,
      CanonicalIdentityRoleBindingRecord[]
    >();
    const roleBindingsBySourceRef = new Map<
      string,
      CanonicalIdentityRoleBindingRecord
    >();
    const invitationsByTokenHash = new Map<
      string,
      CanonicalIdentityInvitationRecord
    >();
    const fleetPartnersActive = new Map<string, boolean>([
      [activeFleetPartnerId, true],
    ]);
    const links = new Map<string, { drtsPassengerId: string }>();

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
      if (
        text.includes("FROM iam.identity_principals p") &&
        text.includes(
          "JOIN iam.identity_memberships m ON m.principal_id = p.principal_id",
        )
      ) {
        const [scopeRef, partnerId, emailNormalized, entrySlug] = params as [
          string,
          string,
          string,
          string,
        ];
        const rows: Array<{ principal_id: string }> = [];
        for (const m of memberships.values()) {
          if (
            m.realm !== "partner" ||
            m.scopeRef !== scopeRef ||
            m.partnerId !== partnerId
          ) {
            continue;
          }
          const p = principals.get(m.principalId);
          if (
            p &&
            p.email?.toLowerCase() === emailNormalized &&
            p.principalType === "human" &&
            p.sourceRef === `jwt_principal:partner:${p.principalId}` &&
            m.sourceRef === `fleet_member:${entrySlug}:${p.principalId}`
          ) {
            rows.push({ principal_id: p.principalId });
          }
        }
        return { rows };
      }
      if (text.startsWith("SELECT principal_id FROM iam.identity_principals")) {
        const rec = principals.get(params[0] as string);
        return { rows: rec ? [{ principal_id: rec.principalId }] : [] };
      }
      if (
        text.includes(
          "FROM iam.identity_principals WHERE issuer = $1 AND subject = $2",
        )
      ) {
        const rec = principalsByIssuerSubject.get(`${params[0]}::${params[1]}`);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (text.includes("FROM iam.identity_principals WHERE principal_id = $1")) {
        const rec = principals.get(params[0] as string);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (text.includes("FROM iam.identity_memberships WHERE source_ref = $1")) {
        const rec = membershipsBySourceRef.get(params[0] as string);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (text.includes("FROM iam.identity_memberships WHERE membership_id = $1")) {
        const rec = memberships.get(params[0] as string);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (text.includes("FROM iam.identity_role_bindings WHERE source_ref = $1")) {
        const rec = roleBindingsBySourceRef.get(params[0] as string);
        return { rows: rec ? [{ record: rec }] : [] };
      }
      if (
        text.includes("FROM iam.identity_role_bindings WHERE membership_id = $1")
      ) {
        const list = roleBindingsByMembership.get(params[0] as string) ?? [];
        return { rows: list.map((record) => ({ record })) };
      }
      if (
        text.includes("FROM iam.identity_invitations") &&
        text.includes("token_hash = $1")
      ) {
        const rec = invitationsByTokenHash.get(params[0] as string);
        const nowMs = Date.parse(params[1] as string);
        const valid =
          rec && !rec.acceptedAt && !rec.revokedAt && Date.parse(rec.expiresAt) > nowMs;
        return { rows: valid ? [{ record: rec }] : [] };
      }
      if (text.includes("SELECT active FROM admin.phase1_fleet_partners")) {
        const active = fleetPartnersActive.get(params[0] as string);
        return { rows: active === undefined ? [] : [{ active }] };
      }
      if (text.includes("INSERT INTO admin.phase1_partner_user_identity_links")) {
        const entrySlug = params[0] as string;
        const partnerUserRef = params[1] as string;
        const drtsPassengerId = params[2] as string;
        const key = `${entrySlug}::${partnerUserRef}`;
        for (const existing of links.values()) {
          const rec = existing as {
            entrySlug?: string;
            partnerUserRef?: string;
            drtsPassengerId: string;
            status?: string;
            consentScope?: string;
          };
          if (
            rec.entrySlug === entrySlug &&
            rec.drtsPassengerId === drtsPassengerId &&
            rec.consentScope === "fleet_staff_invitation" &&
            rec.partnerUserRef !== partnerUserRef
          ) {
            return { rows: [] };
          }
        }
        const existingForKey = links.get(key) as
          | {
              entrySlug?: string;
              partnerUserRef?: string;
              drtsPassengerId: string;
              status?: string;
              consentScope?: string;
            }
          | undefined;
        if (existingForKey) {
          if (
            existingForKey.entrySlug === entrySlug &&
            existingForKey.partnerUserRef === partnerUserRef &&
            existingForKey.drtsPassengerId === drtsPassengerId &&
            existingForKey.status === "active" &&
            existingForKey.consentScope === "fleet_staff_invitation"
          ) {
            return { rows: [{ record: existingForKey }] };
          }
          return { rows: [] };
        }
        const record = JSON.parse(params[4] as string);
        links.set(key, record);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_principals")) {
        const record = JSON.parse(params[11] as string);
        const prior = principals.get(record.principalId);
        if (prior) {
          principalsByIssuerSubject.delete(`${prior.issuer}::${prior.subject}`);
        }
        principals.set(record.principalId, record);
        principalsByIssuerSubject.set(`${record.issuer}::${record.subject}`, record);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_memberships")) {
        const record = JSON.parse(params[12] as string);
        memberships.set(record.membershipId, record);
        if (record.sourceRef) membershipsBySourceRef.set(record.sourceRef, record);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_role_bindings")) {
        const record = JSON.parse(params[10] as string);
        if (record.sourceRef) roleBindingsBySourceRef.set(record.sourceRef, record);
        const list = roleBindingsByMembership.get(record.membershipId) ?? [];
        list.push(record);
        roleBindingsByMembership.set(record.membershipId, list);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_invitations")) {
        const record = JSON.parse(params[17] as string);
        invitationsByTokenHash.set(record.tokenHash, record);
        return { rows: [{ record }] };
      }
      if (text.includes("INSERT INTO iam.identity_sessions")) {
        const [
          sessionId,
          sourceRef,
          principalId,
          membershipId,
          realm,
          status,
          authTime,
          authMethods,
          tokenVersion,
          idleExpiresAt,
          absoluteExpiresAt,
          revokedAt,
          revokedByPrincipalId,
          revokeReason,
          deviceSummary,
          riskSummary,
          createdAt,
          updatedAt,
          record,
        ] = params;
        return {
          rows: [
            {
              session_id: sessionId,
              source_ref: sourceRef,
              principal_id: principalId,
              membership_id: membershipId,
              realm,
              status,
              auth_time: authTime,
              auth_methods: authMethods,
              token_version: tokenVersion,
              idle_expires_at: idleExpiresAt,
              absolute_expires_at: absoluteExpiresAt,
              revoked_at: revokedAt,
              revoked_by_principal_id: revokedByPrincipalId,
              revoke_reason: revokeReason,
              device_summary: JSON.parse(deviceSummary as string),
              risk_summary: JSON.parse(riskSummary as string),
              created_at: createdAt,
              updated_at: updatedAt,
              record: JSON.parse(record as string),
            },
          ],
        };
      }
      throw new Error(`Unmocked Fleet invitation query: ${text}`);
    });

    return {
      databaseService: {
        isEnabled: () => true,
        connect: async () => ({ query, release: vi.fn() }),
      },
    };
  }

  /** Registers an entry `TenantPartnerService.listPartnerEntries` will
   * filter out (status !== "active" and/or activeFlag === false), proving
   * the Fleet staff invitation Google-bind chain denies acceptance against
   * an existing-but-inactive entry, not just a wholly absent one. */
  function registerInactiveFleetPartnerEntry(
    tenant: TenantPartnerService,
    options: { entrySlug: string; fleetPartnerId: string },
  ) {
    const now = new Date().toISOString();
    const entry: PartnerChannelEntryRecord = {
      partnerId: options.fleetPartnerId,
      partnerCode: "fleet_onb_007_inactive_fixture",
      partnerType: "fleet_partner",
      programId: "program-fleet-onb-007-inactive-fixture",
      programCode: null,
      tenantId: "tenant-fleet-onb-007-inactive-fixture",
      bankCode: null,
      entrySlug: options.entrySlug,
      displayName: "Inactive Fleet Partner Fixture",
      businessDispatchSubtype: "enterprise_dispatch",
      authMode: "partner_api_key",
      eligibilityMode: "none",
      entryHost: null,
      entryPath: `/partner/${options.entrySlug}`,
      themeAccent: null,
      brandingMetadata: null,
      eligibilityContract: null,
      status: "inactive",
      activeFlag: false,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      createdAt: now,
      updatedAt: now,
      auditMetadata: {
        source: "seed_bootstrap",
        requestId: null,
        createdBy: "system:seed",
        updatedBy: "system:seed",
      },
    };
    (
      tenant as unknown as { partnerEntries: PartnerChannelEntryRecord[] }
    ).partnerEntries.push(entry);
  }

  async function setup(fleetPartnerId: string) {
    const db = createFleetDatabaseDouble(fleetPartnerId);
    const repository = new IdentityRepository(db.databaseService as never);
    const link = new PartnerUserIdentityLinkRepository();
    const tenant = new TenantPartnerService(new AuditNotificationService());
    const jwt = new JwtAuthService(repository, tenant, undefined, undefined, link);
    const oidc = new OidcPkceService(jwt, tenant, undefined, link, undefined, repository);

    async function issueInvitation(entrySlug: string, email = "admin@acme.example") {
      const rawToken = `fi_${randomUUID()}`;
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const issued = await repository.issueFleetStaffInvitation({
        entrySlug,
        fleetPartnerId,
        email,
        roleCode: "fleet_partner_ops",
        validTo: null,
        tokenHash,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        issuerPrincipalId: null,
      });
      if (!issued) throw new Error("fixture invitation was not issued");
      return { rawToken, issued };
    }

    async function attemptAccept(
      entrySlug: string,
      rawToken: string,
      code: string,
    ) {
      const state = oidc.generateLoginParameters("partner", {
        invitationToken: rawToken,
        partnerId: entrySlug,
      });
      return oidc.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          code,
          state: state.state,
          partnerId: entrySlug,
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        { stateToken: state.stateToken },
      );
    }

    return { tenant, issueInvitation, attemptAccept };
  }

  it("SA/SD §9: rejects acceptance when the OIDC proof's email_verified is not true, without ever consuming the invitation", async () => {
    const FLEET_ENTRY = "fleet-demo-001";
    const { issueInvitation, attemptAccept } = await setup(FLEET_ENTRY);
    // performOidcCodeExchange's "unverified_email"/"email_not_verified" code
    // branch returns email_verified: false unconditionally; this check runs
    // before the invitation itself is even looked up, so the fixture's own
    // email need not match.
    const { rawToken } = await issueInvitation(FLEET_ENTRY, "unverified@acme.example");

    await expect(
      attemptAccept(FLEET_ENTRY, rawToken, "partner_fleet_email_not_verified"),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
  });

  it("SA/SD §9: rejects acceptance when the named partner_entries row exists but is not active", async () => {
    const FLEET_PARTNER_ID = `fleet-partner-inactive-${randomUUID()}`;
    const ENTRY = `fleet-inactive-entry-${randomUUID()}`;
    const { tenant, issueInvitation, attemptAccept } = await setup(FLEET_PARTNER_ID);
    registerInactiveFleetPartnerEntry(tenant, {
      entrySlug: ENTRY,
      fleetPartnerId: FLEET_PARTNER_ID,
    });
    const { rawToken } = await issueInvitation(ENTRY);

    await expect(
      attemptAccept(ENTRY, rawToken, "partner_fleet_inactive_entry"),
    ).rejects.toMatchObject({ code: "AUTH_SESSION_EXCHANGE_DENIED" });
  });
});
