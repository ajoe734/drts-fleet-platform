import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type {
  CanonicalIdentityInvitationRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
} from "@drts/contracts";

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
  const invitationsByTokenHash = new Map<
    string,
    CanonicalIdentityInvitationRecord
  >();
  const fleetPartnersActive = new Map<string, boolean>();
  const links = new Map<string, { drtsPassengerId: string }>();
  const passwordCredentials = new Map<
    string,
    { passwordHash: string; passwordAlgo: string; pepperVersion: string }
  >();

  function upsertPrincipalRow(record: CanonicalIdentityPrincipalRecord) {
    principals.set(record.principalId, record);
    principalsByIssuerSubject.set(`${record.issuer}::${record.subject}`, record);
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
      const rec = invitationsByTokenHash.get(params[0] as string);
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
    getInvitation(tokenHash: string) {
      return invitationsByTokenHash.get(tokenHash) ?? null;
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
