import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type {
  CanonicalIdentityInvitationRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
  CanonicalIdentitySessionRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { FleetPartnerService } from "../../src/modules/fleet-partner/fleet-partner.service";
import {
  FLEET_INVITATION_ISSUER,
  IdentityRepository,
} from "../../src/modules/identity/identity.repository";
import { PartnerUserIdentityLinkRepository } from "../../src/modules/tenant-partner/partner-user-identity-link.repository";

/**
 * FLEET-ONB-004 SA/SD §3: a minimal PoolClient double that answers the exact
 * query shapes `issueFleetStaffInvitation` (FLEET-ONB-003, already merged),
 * `acceptFleetStaffOidcInvitation` and `acceptFleetStaffInvitationWithPassword`
 * (this task) issue -- not a generic SQL engine: each branch below exists
 * only because one of those methods' real SQL text contains that substring
 * (same convention as identity-fleet-staff-sourceref.test.ts's
 * `createManageFleetHumanRoleClientMock`). `admin.phase1_fleet_partners` and
 * `admin.phase1_partner_user_identity_links` are modeled with real
 * ON CONFLICT semantics so the negative-matrix tests below can assert a full
 * rollback, not just a `null` return.
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
  const invitationsById = new Map<
    string,
    CanonicalIdentityInvitationRecord
  >();
  const invitationsByTokenHash = new Map<
    string,
    CanonicalIdentityInvitationRecord
  >();
  const sessions = new Map<string, CanonicalIdentitySessionRecord>();
  const fleetPartnersActive = new Map<string, boolean>();
  const links = new Map<string, { drtsPassengerId: string }>();
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
    const prior = record.sourceRef
      ? membershipsBySourceRef.get(record.sourceRef)
      : memberships.get(record.membershipId);
    const persisted = prior
      ? {
          ...record,
          membershipId: prior.membershipId,
          createdAt: prior.createdAt,
        }
      : record;
    memberships.set(persisted.membershipId, persisted);
    if (persisted.sourceRef)
      membershipsBySourceRef.set(persisted.sourceRef, persisted);
    return persisted;
  }
  function upsertRoleBindingRow(record: CanonicalIdentityRoleBindingRecord) {
    const prior = record.sourceRef
      ? roleBindingsBySourceRef.get(record.sourceRef)
      : undefined;
    const persisted = prior
      ? {
          ...record,
          roleBindingId: prior.roleBindingId,
          createdAt: prior.createdAt,
        }
      : record;
    if (persisted.sourceRef)
      roleBindingsBySourceRef.set(persisted.sourceRef, persisted);
    const list = roleBindingsByMembership.get(persisted.membershipId) ?? [];
    const idx = list.findIndex((b) => b.sourceRef === persisted.sourceRef);
    if (idx >= 0) list[idx] = persisted;
    else list.push(persisted);
    roleBindingsByMembership.set(persisted.membershipId, list);
    return persisted;
  }
  function upsertInvitationRow(record: CanonicalIdentityInvitationRecord) {
    invitationsById.set(record.invitationId, record);
    invitationsByTokenHash.set(record.tokenHash, record);
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
    if (
      text.includes("FROM iam.identity_principals") &&
      text.includes("WHERE issuer = $1 AND subject = $2")
    ) {
      const rec = principalsByIssuerSubject.get(`${params[0]}::${params[1]}`);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (
      text.includes("FROM iam.identity_principals") &&
      text.includes("WHERE principal_id = $1")
    ) {
      const rec = principals.get(params[0] as string);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (
      text.includes("FROM iam.identity_memberships") &&
      text.includes("WHERE source_ref = $1")
    ) {
      const rec = membershipsBySourceRef.get(params[0] as string);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (text.includes("FROM iam.identity_memberships") && text.includes("WHERE membership_id = $1")) {
      const rec = memberships.get(params[0] as string);
      if (!rec) return { rows: [] };
      if (
        text.includes("realm = 'partner' AND scope_ref = $2 AND partner_id = $3") &&
        (rec.realm !== "partner" ||
          rec.scopeRef !== params[1] ||
          rec.partnerId !== params[2])
      ) {
        return { rows: [] };
      }
      return { rows: [{ record: rec }] };
    }
    if (
      text.includes("FROM iam.identity_role_bindings") &&
      text.includes("WHERE source_ref = $1")
    ) {
      const rec = roleBindingsBySourceRef.get(params[0] as string);
      return { rows: rec ? [{ record: rec }] : [] };
    }
    if (text.includes("FROM iam.identity_role_bindings") && text.includes("WHERE membership_id = $1")) {
      const list = roleBindingsByMembership.get(params[0] as string) ?? [];
      return { rows: list.map((record) => ({ record })) };
    }
    if (text.includes("FROM iam.privileged_role_grants")) {
      return { rows: [] };
    }
    if (text.includes("FROM iam.identity_invitations") && text.includes("token_hash = $1")) {
      const rec = invitationsByTokenHash.get(params[0] as string);
      const nowMs = Date.parse(params[1] as string);
      const valid =
        rec &&
        !rec.acceptedAt &&
        !rec.revokedAt &&
        Date.parse(rec.expiresAt) > nowMs;
      return { rows: valid ? [{ record: rec }] : [] };
    }
    if (
      text.includes("UPDATE iam.identity_invitations") &&
      text.includes("SET delivery_status = $2::text")
    ) {
      const rec = invitationsById.get(params[0] as string);
      if (!rec || rec.realm !== "partner") return { rows: [] };
      const updated: CanonicalIdentityInvitationRecord = {
        ...rec,
        deliveryStatus: params[1] as CanonicalIdentityInvitationRecord["deliveryStatus"],
        updatedAt: params[2] as string,
      };
      upsertInvitationRow(updated);
      return { rows: [{ record: updated }] };
    }
    if (
      text.includes("UPDATE iam.identity_invitations") &&
      text.includes("SET revoked_at = $2::timestamptz") &&
      text.includes("WHERE membership_id = $1")
    ) {
      for (const inv of invitationsById.values()) {
        if (
          inv.membershipId === params[0] &&
          !inv.acceptedAt &&
          !inv.revokedAt
        ) {
          upsertInvitationRow({
            ...inv,
            revokedAt: params[1] as string,
            updatedAt: params[1] as string,
          });
        }
      }
      return { rows: [] };
    }
    if (text.includes("SELECT active FROM admin.phase1_fleet_partners")) {
      const active = fleetPartnersActive.get(params[0] as string);
      return { rows: active === undefined ? [] : [{ active }] };
    }
    if (text.includes("INSERT INTO admin.phase1_partner_user_identity_links")) {
      const entrySlug = params[0] as string;
      const partnerUserRef = params[1] as string;
      const key = `${entrySlug}::${partnerUserRef}`;
      if (links.has(key)) return { rows: [] };
      const record = JSON.parse(params[4] as string) as { drtsPassengerId: string };
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
      const persisted = upsertPrincipalRow(record);
      return { rows: [{ record: persisted }] };
    }
    if (text.includes("INSERT INTO iam.identity_memberships")) {
      const record = JSON.parse(
        params[12] as string,
      ) as CanonicalIdentityMembershipRecord;
      const persisted = upsertMembershipRow(record);
      return { rows: [{ record: persisted }] };
    }
    if (text.includes("INSERT INTO iam.identity_role_bindings")) {
      const record = JSON.parse(
        params[10] as string,
      ) as CanonicalIdentityRoleBindingRecord;
      const persisted = upsertRoleBindingRow(record);
      return { rows: [{ record: persisted }] };
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
    if (text.includes("UPDATE iam.identity_sessions")) {
      const revokedIds: Array<{ session_id: string }> = [];
      for (const session of sessions.values()) {
        if (session.principalId === params[0] && session.status === "active") {
          sessions.set(session.sessionId, {
            ...session,
            status: "revoked",
            revokedAt: params[1] as string,
            revokedByPrincipalId: (params[2] as string | null) ?? null,
            revokeReason: params[3] as string,
            updatedAt: params[1] as string,
          });
          revokedIds.push({ session_id: session.sessionId });
        }
      }
      return { rows: revokedIds };
    }
    if (text.includes("UPDATE iam.identity_refresh_families")) {
      return { rows: [] };
    }

    throw new Error(`Unmocked Fleet invitation query: ${text}`);
  });

  return {
    client: { query, release: vi.fn() },
    setFleetPartnerActive(fleetPartnerId: string, active: boolean) {
      fleetPartnersActive.set(fleetPartnerId, active);
    },
    seedLink(entrySlug: string, partnerUserRef: string, drtsPassengerId: string) {
      links.set(`${entrySlug}::${partnerUserRef}`, { drtsPassengerId });
    },
    getLink(entrySlug: string, partnerUserRef: string) {
      return links.get(`${entrySlug}::${partnerUserRef}`) ?? null;
    },
    getPasswordCredential(principalId: string) {
      return passwordCredentials.get(principalId) ?? null;
    },
    getPrincipal(principalId: string) {
      return principals.get(principalId) ?? null;
    },
    getPrincipalCount() {
      return [...principals.values()].filter((p) =>
        p.sourceRef?.startsWith("jwt_principal:partner:"),
      ).length;
    },
    getMembership(membershipId: string) {
      return memberships.get(membershipId) ?? null;
    },
    getMembershipCount() {
      return [...memberships.values()].filter((m) => m.realm === "partner")
        .length;
    },
    getRoleBindings(membershipId: string) {
      return roleBindingsByMembership.get(membershipId) ?? [];
    },
    getInvitation(tokenHash: string) {
      return invitationsByTokenHash.get(tokenHash) ?? null;
    },
    getInvitationById(invitationId: string) {
      return invitationsById.get(invitationId) ?? null;
    },
    getInvitationCount() {
      return invitationsById.size;
    },
    seedSession(session: CanonicalIdentitySessionRecord) {
      sessions.set(session.sessionId, session);
    },
    getSession(sessionId: string) {
      return sessions.get(sessionId) ?? null;
    },
  };
}

async function fixture(
  mock: ReturnType<typeof createFleetInvitationClientMock>,
  entrySlug = `fleet-demo-${randomUUID()}`,
) {
  const databaseService = {
    isEnabled: () => true,
    connect: async () => mock.client,
    query: mock.client.query,
  };
  const repository = new IdentityRepository(databaseService as never);
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
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
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

describe("IdentityRepository.acceptFleetStaffOidcInvitation (FLEET-ONB-004 SA/SD §3)", () => {
  it("binds (issuer, sub), activates the membership, and creates the partner_user_identity_links row", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    const link = new PartnerUserIdentityLinkRepository();

    const accepted = await f.repository.acceptFleetStaffOidcInvitation(
      f.tokenHash,
      f.proof,
      link,
    );

    expect(accepted).toMatchObject({
      entrySlug: f.entrySlug,
      fleetPartnerId: f.fleetPartnerId,
      principal: {
        principalId: f.issued.principal.principalId,
        issuer: f.proof.issuer,
        subject: f.proof.subject,
        status: "active",
        emailVerified: true,
      },
      membership: { status: "active" },
    });
    expect(mock.getLink(f.entrySlug, f.proof.subject)).toMatchObject({
      drtsPassengerId: f.issued.principal.principalId,
    });
    expect(mock.getInvitation(f.tokenHash)?.acceptedAt).not.toBeNull();
  });

  it("rejects when the proof email does not match the invitation email, without consuming it", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    const link = new PartnerUserIdentityLinkRepository();

    const accepted = await f.repository.acceptFleetStaffOidcInvitation(
      f.tokenHash,
      { ...f.proof, email: "someone-else@example.org" },
      link,
    );

    expect(accepted).toBeNull();
    expect(mock.getInvitation(f.tokenHash)?.acceptedAt).toBeNull();
    expect(mock.getLink(f.entrySlug, f.proof.subject)).toBeNull();
  });

  it("rejects when the fleet partner is inactive, leaving the invitation consumable once reactivated", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    mock.setFleetPartnerActive(f.fleetPartnerId, false);
    const link = new PartnerUserIdentityLinkRepository();

    expect(
      await f.repository.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
    ).toBeNull();
    expect(mock.getInvitation(f.tokenHash)?.acceptedAt).toBeNull();

    mock.setFleetPartnerActive(f.fleetPartnerId, true);
    expect(
      await f.repository.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
    ).not.toBeNull();
  });

  it("SA/SD §9: rolls back the whole transaction when the (entrySlug, sub) identity link already exists", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    // Simulate a prior referral handoff link for the exact same (entrySlug, sub).
    mock.seedLink(f.entrySlug, f.proof.subject, "passenger_prior_referral_link");
    const link = new PartnerUserIdentityLinkRepository();

    const accepted = await f.repository.acceptFleetStaffOidcInvitation(
      f.tokenHash,
      f.proof,
      link,
    );

    expect(accepted).toBeNull();
    // Invitation not consumed and principal/membership not activated.
    expect(mock.getInvitation(f.tokenHash)?.acceptedAt).toBeNull();
    expect(mock.getPrincipal(f.issued.principal.principalId)?.status).toBe(
      "invited",
    );
    // The pre-existing link must survive untouched (not overwritten).
    expect(mock.getLink(f.entrySlug, f.proof.subject)).toMatchObject({
      drtsPassengerId: "passenger_prior_referral_link",
    });
  });

  it("SA/SD §9: rolls back on an (issuer, sub) unique-constraint conflict with another principal", async () => {
    const mock = createFleetInvitationClientMock();
    const other = await fixture(mock);
    const f = await fixture(mock);
    const link = new PartnerUserIdentityLinkRepository();

    // other's proof's (issuer, sub) is already bound to a different principal.
    expect(
      await other.repository.acceptFleetStaffOidcInvitation(
        other.tokenHash,
        other.proof,
        link,
      ),
    ).not.toBeNull();

    const conflicting = await f.repository.acceptFleetStaffOidcInvitation(
      f.tokenHash,
      { ...f.proof, issuer: other.proof.issuer, subject: other.proof.subject },
      link,
    );

    expect(conflicting).toBeNull();
    expect(mock.getInvitation(f.tokenHash)?.acceptedAt).toBeNull();
    expect(mock.getPrincipal(f.issued.principal.principalId)?.status).toBe(
      "invited",
    );
  });

  it("rejects a second acceptance attempt once the invitation has already been consumed", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    const link = new PartnerUserIdentityLinkRepository();

    expect(
      await f.repository.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
    ).not.toBeNull();
    expect(
      await f.repository.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
    ).toBeNull();
  });

  it("rejects a cross-entry probe: a different, otherwise-valid entrySlug cannot consume this invitation", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    const link = new PartnerUserIdentityLinkRepository();

    expect(
      await f.repository.acceptFleetStaffOidcInvitation(
        f.tokenHash,
        { ...f.proof, entrySlug: "a-different-active-fleet-entry" },
        link,
      ),
    ).toBeNull();
    expect(mock.getInvitation(f.tokenHash)?.acceptedAt).toBeNull();
  });

  it("honors a role binding with no validTo (SA/SD §2: Fleet access may never expire)", async () => {
    const mock = createFleetInvitationClientMock();
    // fixture() already issues with validTo: null; this test asserts that
    // alone (unlike acceptAgencyOidcInvitation, which requires an explicit
    // future validTo) is sufficient for hasActiveAccess to pass.
    const f = await fixture(mock);
    const link = new PartnerUserIdentityLinkRepository();

    const accepted = await f.repository.acceptFleetStaffOidcInvitation(
      f.tokenHash,
      f.proof,
      link,
    );
    expect(accepted).not.toBeNull();
    expect(accepted!.roleBindings[0]).toMatchObject({ validTo: null });
  });
});

describe("IdentityRepository.acceptFleetStaffInvitationWithPassword (FLEET-ONB-004 SA/SD §3 password branch)", () => {
  it("activates the membership, stores the credential, and never rebinds issuer/subject", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);

    const accepted = await f.repository.acceptFleetStaffInvitationWithPassword(
      f.tokenHash,
      {
        passwordHash: "hashed-value",
        passwordAlgo: "argon2id",
        pepperVersion: "v1",
      },
    );

    expect(accepted).toMatchObject({
      entrySlug: f.entrySlug,
      fleetPartnerId: f.fleetPartnerId,
      principal: {
        principalId: f.issued.principal.principalId,
        // Never rebound: no verified Google sub exists for this branch.
        issuer: FLEET_INVITATION_ISSUER,
        subject: f.issued.principal.subject,
        status: "active",
        emailVerified: true,
      },
      membership: { status: "active" },
    });
    expect(mock.getPasswordCredential(f.issued.principal.principalId)).toEqual({
      passwordHash: "hashed-value",
      passwordAlgo: "argon2id",
      pepperVersion: "v1",
    });
    // SA/SD §3: the password branch never populates partner_user_identity_links
    // -- that table's semantics are a Google sub -> drtsPassengerId mapping.
    expect(mock.getLink(f.entrySlug, f.issued.principal.subject)).toBeNull();
  });

  it("rejects a second acceptance attempt once consumed by the other branch", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    const link = new PartnerUserIdentityLinkRepository();

    expect(
      await f.repository.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
    ).not.toBeNull();
    expect(
      await f.repository.acceptFleetStaffInvitationWithPassword(f.tokenHash, {
        passwordHash: "hashed-value",
        passwordAlgo: "argon2id",
        pepperVersion: "v1",
      }),
    ).toBeNull();
  });

  it("rejects when the fleet partner is inactive", async () => {
    const mock = createFleetInvitationClientMock();
    const f = await fixture(mock);
    mock.setFleetPartnerActive(f.fleetPartnerId, false);

    expect(
      await f.repository.acceptFleetStaffInvitationWithPassword(f.tokenHash, {
        passwordHash: "hashed-value",
        passwordAlgo: "argon2id",
        pepperVersion: "v1",
      }),
    ).toBeNull();
    expect(mock.getInvitation(f.tokenHash)?.acceptedAt).toBeNull();
  });
});

function createFleetServiceOverMock(
  mock: ReturnType<typeof createFleetInvitationClientMock>,
  repository: IdentityRepository,
  fleets: Array<{ fleetPartnerId: string; entrySlug: string }>,
) {
  const deliveredTokens: Array<{
    invitationId: string;
    fleetPartnerId: string;
    entrySlug: string;
    recipientEmail: string;
    rawToken: string;
  }> = [];
  const fleetSet = new Set(fleets.map((f) => f.fleetPartnerId));
  for (const f of fleets) {
    mock.setFleetPartnerActive(f.fleetPartnerId, true);
  }
  const invitationDelivery = {
    send: vi.fn(
      async (req: {
        invitationId: string;
        fleetPartnerId: string;
        entrySlug: string;
        recipientEmail: string;
        expiresAt: string;
        rawToken: string;
      }) => {
        deliveredTokens.push(req);
        return {
          status: "sent" as const,
          attemptedAt: new Date().toISOString(),
        };
      },
    ),
  };
  const audit = {
    isEnabled: () => true,
    recordEventRequired: vi.fn(async () => undefined),
  };
  const service = new FleetPartnerService(
    undefined as never,
    undefined as never,
    undefined as never,
    {
      isEnabled: () => true,
      findActiveFleetPartnerById: async (id: string) =>
        fleetSet.has(id) ? { fleetPartnerId: id, active: true } : null,
    } as never,
    undefined,
    repository,
    {
      resolvePartnerEntries: async (slug: string) =>
        fleets
          .filter((f) => f.entrySlug === slug)
          .map((f) => ({
            entrySlug: f.entrySlug,
            partnerType: "fleet_partner",
            partnerId: f.fleetPartnerId,
          })),
    } as never,
    { isEnabled: () => true, find: async () => null } as never,
    audit as never,
    invitationDelivery as never,
  );
  const manager = {
    realm: "platform",
    actorType: "platform_admin",
    actorId: "manager-reinvite-test",
    principalId: "principal-manager-reinvite-test",
    scopes: ["foundation:write"],
    amr: [],
  } as never;
  return { service, manager, deliveredTokens, invitationDelivery, audit };
}

describe("FLEET-REINVITE-CANONICAL-MEMBER-20261122: same-email re-invitation after Google OIDC binding", () => {
  it("rejects a duplicate invitation for an already-active Google-bound member with 409 FLEET_STAFF_ALREADY_ACTIVE (no second member, invitation, or email), while isolating another Fleet with the same email", async () => {
    const mock = createFleetInvitationClientMock();
    const databaseService = {
      isEnabled: () => true,
      connect: async () => mock.client,
      query: mock.client.query,
    };
    const repository = new IdentityRepository(databaseService as never);
    const linkRepo = new PartnerUserIdentityLinkRepository();

    const fleetA = {
      fleetPartnerId: `fleet-partner-a-${randomUUID()}`,
      entrySlug: `fleet-entry-a-${randomUUID()}`,
    };
    const fleetB = {
      fleetPartnerId: `fleet-partner-b-${randomUUID()}`,
      entrySlug: `fleet-entry-b-${randomUUID()}`,
    };
    const { service, manager, deliveredTokens, invitationDelivery } =
      createFleetServiceOverMock(mock, repository, [fleetA, fleetB]);

    const email = `google-bound-${randomUUID()}@fleet.example.org`;
    const firstIssued = await service.inviteFleetStaff(
      fleetA.fleetPartnerId,
      {
        entrySlug: fleetA.entrySlug,
        email,
        roleCode: "fleet_partner_ops",
      },
      manager,
    );
    expect(deliveredTokens).toHaveLength(1);
    const firstTokenHash = createHash("sha256")
      .update(deliveredTokens[0]!.rawToken)
      .digest("hex");
    const googleSub = `google-sub-${randomUUID()}`;

    const accepted = await repository.acceptFleetStaffOidcInvitation(
      firstTokenHash,
      {
        issuer: "https://accounts.google.com",
        subject: googleSub,
        email,
        entrySlug: fleetA.entrySlug,
      },
      linkRepo,
    );
    expect(accepted).not.toBeNull();
    expect(mock.getPrincipal(firstIssued.member.principalId)).toMatchObject({
      principalId: firstIssued.member.principalId,
      issuer: "https://accounts.google.com",
      subject: googleSub,
      status: "active",
      emailVerified: true,
    });

    // Re-inviting the active Google-bound member in the same Fleet entry must
    // fail with 409 FLEET_STAFF_ALREADY_ACTIVE without creating a duplicate
    // principal/membership/invitation or sending a second email.
    let conflictError: unknown;
    try {
      await service.inviteFleetStaff(
        fleetA.fleetPartnerId,
        {
          entrySlug: fleetA.entrySlug,
          email: `  ${email.toUpperCase()}  `,
          roleCode: "fleet_partner_admin",
        },
        manager,
      );
    } catch (err) {
      conflictError = err;
    }
    expect(conflictError).toBeInstanceOf(ApiRequestError);
    expect((conflictError as ApiRequestError).getStatus()).toBe(409);
    expect((conflictError as ApiRequestError).code).toBe(
      "FLEET_STAFF_ALREADY_ACTIVE",
    );
    expect(invitationDelivery.send).toHaveBeenCalledTimes(1);
    expect(mock.getPrincipalCount()).toBe(1);
    expect(mock.getMembershipCount()).toBe(1);
    expect(mock.getInvitationCount()).toBe(1);
    expect(mock.getPrincipal(firstIssued.member.principalId)).toMatchObject({
      issuer: "https://accounts.google.com",
      subject: googleSub,
      status: "active",
    });
    expect(mock.getMembership(firstIssued.member.membershipId)?.status).toBe(
      "active",
    );
    expect(mock.getLink(fleetA.entrySlug, googleSub)).toMatchObject({
      drtsPassengerId: firstIssued.member.principalId,
    });

    // Cross-Fleet isolation: inviting the same email in Fleet B creates a
    // distinct principal, membership, role binding, and invitation for Fleet B
    // without touching Fleet A's active Google-bound member.
    const fleetBIssued = await service.inviteFleetStaff(
      fleetB.fleetPartnerId,
      {
        entrySlug: fleetB.entrySlug,
        email,
        roleCode: "fleet_partner_finance",
      },
      manager,
    );
    expect(fleetBIssued.member.principalId).not.toBe(
      firstIssued.member.principalId,
    );
    expect(fleetBIssued.member.membershipId).not.toBe(
      firstIssued.member.membershipId,
    );
    expect(mock.getPrincipalCount()).toBe(2);
    expect(mock.getMembershipCount()).toBe(2);
    expect(mock.getInvitationCount()).toBe(2);
    expect(mock.getMembership(firstIssued.member.membershipId)?.status).toBe(
      "active",
    );
  });

  it("reuses principal, membership, and role binding IDs and createdAt when re-inviting a deactivated Google-bound member, preserves old accepted invitation and revoked session, keeps old Google sub collision rule, and accepts via password", async () => {
    const mock = createFleetInvitationClientMock();
    const databaseService = {
      isEnabled: () => true,
      connect: async () => mock.client,
      query: mock.client.query,
    };
    const repository = new IdentityRepository(databaseService as never);
    const linkRepo = new PartnerUserIdentityLinkRepository();

    const fleet = {
      fleetPartnerId: `fleet-partner-${randomUUID()}`,
      entrySlug: `fleet-entry-${randomUUID()}`,
    };
    const { service, manager, deliveredTokens } = createFleetServiceOverMock(
      mock,
      repository,
      [fleet],
    );

    const email = `deactivated-google-${randomUUID()}@fleet.example.org`;
    const firstIssued = await service.inviteFleetStaff(
      fleet.fleetPartnerId,
      {
        entrySlug: fleet.entrySlug,
        email,
        roleCode: "fleet_partner_ops",
      },
      manager,
    );
    const firstTokenHash = createHash("sha256")
      .update(deliveredTokens[0]!.rawToken)
      .digest("hex");
    const googleSub = `google-sub-${randomUUID()}`;

    const accepted = await repository.acceptFleetStaffOidcInvitation(
      firstTokenHash,
      {
        issuer: "https://accounts.google.com",
        subject: googleSub,
        email,
        entrySlug: fleet.entrySlug,
      },
      linkRepo,
    );
    expect(accepted).not.toBeNull();
    const originalPrincipal = { ...accepted!.principal };
    const originalMembership = { ...accepted!.membership };
    const originalBinding = { ...accepted!.roleBindings[0]! };
    const firstAcceptedInvitation = {
      ...mock.getInvitationById(firstIssued.invitation.invitationId)!,
    };
    expect(firstAcceptedInvitation.acceptedAt).not.toBeNull();

    // Seed an active session for the Google-bound principal before deactivation.
    const sessionNow = new Date().toISOString();
    const sessionId = `session_${randomUUID()}`;
    mock.seedSession({
      sessionId,
      sourceRef: sessionId,
      principalId: originalPrincipal.principalId,
      membershipId: originalMembership.membershipId,
      realm: "partner",
      status: "active",
      authTime: sessionNow,
      authMethods: ["oidc"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: sessionNow,
      updatedAt: sessionNow,
    });

    const deactivated = await service.deactivateFleetStaffMember(
      fleet.fleetPartnerId,
      fleet.entrySlug,
      originalMembership.membershipId,
      manager,
    );
    expect(deactivated).toMatchObject({
      principalId: originalPrincipal.principalId,
      membershipId: originalMembership.membershipId,
      status: "disabled",
    });
    expect(mock.getSession(sessionId)).toMatchObject({
      status: "revoked",
      revokedByPrincipalId: "principal-manager-reinvite-test",
      revokeReason: "fleet_staff_membership_deactivated",
    });

    // Re-invite the same email in the same Fleet entry after deactivation.
    const reissued = await service.inviteFleetStaff(
      fleet.fleetPartnerId,
      {
        entrySlug: fleet.entrySlug,
        email,
        roleCode: "fleet_partner_finance",
      },
      manager,
    );
    expect(deliveredTokens).toHaveLength(2);
    const secondTokenHash = createHash("sha256")
      .update(deliveredTokens[1]!.rawToken)
      .digest("hex");
    expect(secondTokenHash).not.toBe(firstTokenHash);
    expect(reissued.invitation.invitationId).not.toBe(
      firstIssued.invitation.invitationId,
    );

    // Must reuse canonical principal, membership, and role binding IDs and createdAt.
    expect(reissued.member).toMatchObject({
      principalId: originalPrincipal.principalId,
      membershipId: originalMembership.membershipId,
      roleCode: "fleet_partner_finance",
      status: "invited",
    });
    expect(mock.getPrincipalCount()).toBe(1);
    expect(mock.getMembershipCount()).toBe(1);
    expect(mock.getPrincipal(originalPrincipal.principalId)).toMatchObject({
      principalId: originalPrincipal.principalId,
      createdAt: originalPrincipal.createdAt,
      issuer: FLEET_INVITATION_ISSUER,
      subject: `fleet:${fleet.entrySlug}:email:${email}`,
      status: "invited",
      emailVerified: false,
    });
    expect(mock.getMembership(originalMembership.membershipId)).toMatchObject({
      membershipId: originalMembership.membershipId,
      createdAt: originalMembership.createdAt,
      status: "invited",
      invitationId: reissued.invitation.invitationId,
    });
    expect(mock.getRoleBindings(originalMembership.membershipId)[0]).toMatchObject({
      roleBindingId: originalBinding.roleBindingId,
      createdAt: originalBinding.createdAt,
      roleCode: "fleet_partner_finance",
    });

    // Prior accepted invitation and revoked session remain traceable.
    expect(
      mock.getInvitationById(firstIssued.invitation.invitationId),
    ).toEqual(firstAcceptedInvitation);
    expect(mock.getSession(sessionId)).toMatchObject({
      status: "revoked",
      revokeReason: "fleet_staff_membership_deactivated",
    });

    // SA/SD §2, §3, §9: existing (entrySlug, googleSub) link is retained and
    // rejects re-binding the same Google sub without consuming the new token.
    expect(
      await repository.acceptFleetStaffOidcInvitation(
        secondTokenHash,
        {
          issuer: "https://accounts.google.com",
          subject: googleSub,
          email,
          entrySlug: fleet.entrySlug,
        },
        linkRepo,
      ),
    ).toBeNull();
    expect(mock.getInvitation(secondTokenHash)?.acceptedAt).toBeNull();

    // Password-branch acceptance succeeds on the reused canonical member.
    const passwordAccepted =
      await repository.acceptFleetStaffInvitationWithPassword(secondTokenHash, {
        passwordHash: "reinvited-hashed-password",
        passwordAlgo: "argon2id",
        pepperVersion: "v1",
      });
    expect(passwordAccepted).toMatchObject({
      entrySlug: fleet.entrySlug,
      fleetPartnerId: fleet.fleetPartnerId,
      principal: {
        principalId: originalPrincipal.principalId,
        createdAt: originalPrincipal.createdAt,
        issuer: FLEET_INVITATION_ISSUER,
        status: "active",
        emailVerified: true,
      },
      membership: {
        membershipId: originalMembership.membershipId,
        createdAt: originalMembership.createdAt,
        status: "active",
      },
    });
    expect(mock.getInvitation(secondTokenHash)?.acceptedAt).not.toBeNull();
  });
});
