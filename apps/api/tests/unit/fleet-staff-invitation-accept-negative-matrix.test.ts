import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type {
  CanonicalIdentityInvitationRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
} from "@drts/contracts";

import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { PartnerUserIdentityLinkRepository } from "../../src/modules/tenant-partner/partner-user-identity-link.repository";

/**
 * FLEET-ONB-007 SA/SD §9: two negative-matrix rows not yet covered by
 * fleet-staff-invitation-accept.test.ts (FLEET-ONB-004) -- an invitation
 * that has already expired, and one that has already been revoked through
 * the real `revokeFleetStaffInvitation` production path -- must reject
 * acceptance on both the Google-bind and password branches, and must leave
 * the invitation unconsumed (`acceptedAt` stays null).
 *
 * Same minimal PoolClient double convention as
 * fleet-staff-invitation-accept.test.ts, extended with the
 * `UPDATE iam.identity_invitations ... SET revoked_at` shape
 * `revokeFleetStaffInvitation` issues through `databaseService.query`
 * directly (not through `client.query` inside a transaction), so both the
 * `connect()` (transactional) and bare `query()` entry points resolve to the
 * same in-memory store.
 */
function createFleetInvitationClientMock() {
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
  const invitationsById = new Map<string, CanonicalIdentityInvitationRecord>();
  const fleetPartnersActive = new Map<string, boolean>();
  const links = new Map<
    string,
    {
      entrySlug: string;
      partnerUserRef: string;
      drtsPassengerId: string;
      status: string;
      consentScope: string;
    }
  >();
  const passwordCredentials = new Map<
    string,
    { passwordHash: string; passwordAlgo: string; pepperVersion: string }
  >();

  function upsertPrincipalRow(record: CanonicalIdentityPrincipalRecord) {
    const prior = principals.get(record.principalId);
    if (prior) {
      principalsByIssuerSubject.delete(`${prior.issuer}::${prior.subject}`);
    }
    const persisted = prior
      ? {
          ...record,
          principalId: prior.principalId,
          createdAt: prior.createdAt,
        }
      : record;
    principals.set(persisted.principalId, persisted);
    principalsByIssuerSubject.set(
      `${persisted.issuer}::${persisted.subject}`,
      persisted,
    );
    return persisted;
  }
  function upsertMembershipRow(record: CanonicalIdentityMembershipRecord) {
    memberships.set(record.membershipId, record);
    if (record.sourceRef) membershipsBySourceRef.set(record.sourceRef, record);
  }
  function upsertRoleBindingRow(record: CanonicalIdentityRoleBindingRecord) {
    if (record.sourceRef) roleBindingsBySourceRef.set(record.sourceRef, record);
    const list = roleBindingsByMembership.get(record.membershipId) ?? [];
    const idx = list.findIndex((b) => b.sourceRef === record.sourceRef);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    roleBindingsByMembership.set(record.membershipId, list);
  }
  function upsertInvitationRow(record: CanonicalIdentityInvitationRecord) {
    invitationsById.set(record.invitationId, record);
  }
  function findInvitationByTokenHash(tokenHash: string) {
    for (const invitation of invitationsById.values()) {
      if (invitation.tokenHash === tokenHash) return invitation;
    }
    return null;
  }

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
    if (text.includes("FROM iam.identity_principals WHERE issuer = $1 AND subject = $2")) {
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
    if (text.includes("FROM iam.identity_role_bindings WHERE membership_id = $1")) {
      const list = roleBindingsByMembership.get(params[0] as string) ?? [];
      return { rows: list.map((record) => ({ record })) };
    }
    if (text.includes("FROM iam.identity_invitations") && text.includes("token_hash = $1")) {
      const rec = findInvitationByTokenHash(params[0] as string);
      const nowMs = Date.parse(params[1] as string);
      const valid =
        rec &&
        !rec.acceptedAt &&
        !rec.revokedAt &&
        Date.parse(rec.expiresAt) > nowMs;
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
        if (
          existing.entrySlug === entrySlug &&
          existing.drtsPassengerId === drtsPassengerId &&
          existing.partnerUserRef !== partnerUserRef
        ) {
          return { rows: [] };
        }
        if (
          existing.partnerUserRef === partnerUserRef &&
          existing.consentScope === "fleet_staff_invitation" &&
          (existing.entrySlug !== entrySlug ||
            existing.drtsPassengerId !== drtsPassengerId)
        ) {
          return { rows: [] };
        }
      }
      const existingForKey = links.get(key);
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
      const record = JSON.parse(params[4] as string) as {
        entrySlug: string;
        partnerUserRef: string;
        drtsPassengerId: string;
        status: string;
        consentScope: string;
      };
      links.set(key, record);
      return { rows: [{ record }] };
    }
    if (text.includes("INSERT INTO iam.identity_principals")) {
      const record = JSON.parse(
        params[11] as string,
      ) as CanonicalIdentityPrincipalRecord;
      const existing = principalsByIssuerSubject.get(
        `${record.issuer}::${record.subject}`,
      );
      if (existing && existing.principalId !== record.principalId) {
        throw Object.assign(
          new Error(
            "duplicate key value violates unique constraint iam_identity_principals_issuer_subject_key",
          ),
          { code: "23505" },
        );
      }
      upsertPrincipalRow(record);
      return { rows: [{ record }] };
    }
    if (text.includes("INSERT INTO iam.identity_memberships")) {
      const record = JSON.parse(
        params[12] as string,
      ) as CanonicalIdentityMembershipRecord;
      upsertMembershipRow(record);
      return { rows: [{ record }] };
    }
    if (text.includes("INSERT INTO iam.identity_role_bindings")) {
      const record = JSON.parse(
        params[10] as string,
      ) as CanonicalIdentityRoleBindingRecord;
      upsertRoleBindingRow(record);
      return { rows: [{ record }] };
    }
    if (text.includes("INSERT INTO iam.identity_invitations")) {
      const record = JSON.parse(
        params[17] as string,
      ) as CanonicalIdentityInvitationRecord;
      upsertInvitationRow(record);
      return { rows: [{ record }] };
    }
    if (text.includes("INSERT INTO iam.identity_password_credentials")) {
      passwordCredentials.set(params[0] as string, {
        passwordHash: params[1] as string,
        passwordAlgo: params[2] as string,
        pepperVersion: params[3] as string,
      });
      return { rows: [] };
    }
    // revokeFleetStaffInvitation's shape: a bare UPDATE outside a
    // transaction, issued through `databaseService.query` directly.
    if (
      text.includes("UPDATE iam.identity_invitations") &&
      text.includes("SET revoked_at") &&
      text.includes("WHERE invitation_id = $1")
    ) {
      const invitation = invitationsById.get(params[0] as string);
      const hit =
        invitation &&
        invitation.realm === "partner" &&
        invitation.scopeRef === params[1] &&
        invitation.partnerId === params[2] &&
        !invitation.acceptedAt &&
        !invitation.revokedAt
          ? invitation
          : null;
      if (!hit) return { rows: [] };
      const updated = {
        ...hit,
        revokedAt: params[3] as string,
        updatedAt: params[3] as string,
      };
      invitationsById.set(hit.invitationId, updated);
      return { rows: [{ record: updated }] };
    }

    throw new Error(`Unmocked Fleet invitation query: ${text}`);
  });

  return {
    client: { query, release: vi.fn() },
    query,
    setFleetPartnerActive(fleetPartnerId: string, active: boolean) {
      fleetPartnersActive.set(fleetPartnerId, active);
    },
    getInvitation(tokenHash: string) {
      return findInvitationByTokenHash(tokenHash);
    },
    getPrincipal(principalId: string) {
      return principals.get(principalId) ?? null;
    },
    getLink(entrySlug: string, partnerUserRef: string) {
      return links.get(`${entrySlug}::${partnerUserRef}`) ?? null;
    },
  };
}

async function fixture(
  mock: ReturnType<typeof createFleetInvitationClientMock>,
  overrides: { expiresAt?: string } = {},
) {
  const databaseService = {
    isEnabled: () => true,
    connect: async () => mock.client,
    query: mock.query,
  };
  const repository = new IdentityRepository(databaseService as never);
  const entrySlug = `fleet-demo-${randomUUID()}`;
  const fleetPartnerId = `fleet-partner-${randomUUID()}`;
  mock.setFleetPartnerActive(fleetPartnerId, true);
  const id = randomUUID();
  const rawToken = `fi_${id}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const email = `${id}@fleet.example.org`;
  const issued = await repository.issueFleetStaffInvitation({
    entrySlug,
    fleetPartnerId,
    email,
    roleCode: "fleet_partner_ops",
    validTo: null,
    tokenHash,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 300_000).toISOString(),
    issuerPrincipalId: null,
  });
  if (!issued) throw new Error("fixture invitation was not issued");
  return {
    repository,
    entrySlug,
    fleetPartnerId,
    tokenHash,
    email,
    issued,
    proof: {
      issuer: "https://accounts.google.com",
      subject: `google-sub-${id}`,
      email,
      entrySlug,
    },
  };
}

describe("FLEET-ONB-007 SA/SD §9: expired invitation rejects both acceptance branches", () => {
  it("rejects the Google-bind branch once expiresAt is in the past, without consuming it", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const link = new PartnerUserIdentityLinkRepository();

    const accepted = await f.repository.acceptFleetStaffOidcInvitation(
      f.tokenHash,
      f.proof,
      link,
    );

    expect(accepted).toBeNull();
    expect(mock.getInvitation(f.tokenHash)).toMatchObject({
      acceptedAt: null,
    });
    expect(mock.getPrincipal(f.issued.principal.principalId)?.status).toBe(
      "invited",
    );
  });

  it("rejects the password branch once expiresAt is in the past, without consuming it", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const accepted = await f.repository.acceptFleetStaffInvitationWithPassword(
      f.tokenHash,
      { passwordHash: "hashed-value", passwordAlgo: "argon2id", pepperVersion: "v1" },
    );

    expect(accepted).toBeNull();
    expect(mock.getInvitation(f.tokenHash)).toMatchObject({
      acceptedAt: null,
    });
  });

  it("still accepts right up to the boundary when expiresAt has not yet passed", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock, {
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    const link = new PartnerUserIdentityLinkRepository();

    expect(
      await f.repository.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
    ).not.toBeNull();
  });
});

describe("FLEET-ONB-007 SA/SD §9: revoked invitation rejects both acceptance branches", () => {
  it("rejects the Google-bind branch once revoked through the real revokeFleetStaffInvitation path", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    const link = new PartnerUserIdentityLinkRepository();

    const revoked = await f.repository.revokeFleetStaffInvitation(
      f.entrySlug,
      f.fleetPartnerId,
      f.issued.invitation.invitationId,
    );
    expect(revoked?.revokedAt).not.toBeNull();

    const accepted = await f.repository.acceptFleetStaffOidcInvitation(
      f.tokenHash,
      f.proof,
      link,
    );
    expect(accepted).toBeNull();
    expect(mock.getInvitation(f.tokenHash)).toMatchObject({ acceptedAt: null });
    expect(mock.getPrincipal(f.issued.principal.principalId)?.status).toBe(
      "invited",
    );
  });

  it("rejects the password branch once revoked through the real revokeFleetStaffInvitation path", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);

    const revoked = await f.repository.revokeFleetStaffInvitation(
      f.entrySlug,
      f.fleetPartnerId,
      f.issued.invitation.invitationId,
    );
    expect(revoked?.revokedAt).not.toBeNull();

    const accepted = await f.repository.acceptFleetStaffInvitationWithPassword(
      f.tokenHash,
      { passwordHash: "hashed-value", passwordAlgo: "argon2id", pepperVersion: "v1" },
    );
    expect(accepted).toBeNull();
    expect(mock.getInvitation(f.tokenHash)).toMatchObject({ acceptedAt: null });
  });

  it("rejects revoking the same invitation twice (idempotent-not-repeatable), leaving the first revocation intact", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);

    expect(
      await f.repository.revokeFleetStaffInvitation(
        f.entrySlug,
        f.fleetPartnerId,
        f.issued.invitation.invitationId,
      ),
    ).not.toBeNull();
    expect(
      await f.repository.revokeFleetStaffInvitation(
        f.entrySlug,
        f.fleetPartnerId,
        f.issued.invitation.invitationId,
      ),
    ).toBeNull();
  });
});
