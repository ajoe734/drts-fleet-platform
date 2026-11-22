import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/common/db";
import {
  FLEET_INVITATION_ISSUER,
  IdentityRepository,
} from "../../src/modules/identity/identity.repository";
import { PasswordHashingService } from "../../src/common/auth/password-hashing.service";
import { PartnerUserIdentityLinkRepository } from "../../src/modules/tenant-partner/partner-user-identity-link.repository";

// PWD-LOGIN-004's password branch hashes with PasswordHashingService, which
// fails closed (Stage 1.5 §15.2) unless a pepper is configured. Test-only
// value, not a real secret.
const PRIOR_PEPPER_SECRETS_JSON = process.env.PASSWORD_PEPPER_SECRETS_JSON;
const PRIOR_PEPPER_CURRENT_VERSION = process.env.PASSWORD_PEPPER_CURRENT_VERSION;

beforeAll(() => {
  process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
    v1: "fleet-staff-invitation-pg-test-pepper-32chars!",
  });
  process.env.PASSWORD_PEPPER_CURRENT_VERSION = "v1";
});

afterAll(() => {
  if (PRIOR_PEPPER_SECRETS_JSON === undefined) {
    delete process.env.PASSWORD_PEPPER_SECRETS_JSON;
  } else {
    process.env.PASSWORD_PEPPER_SECRETS_JSON = PRIOR_PEPPER_SECRETS_JSON;
  }
  if (PRIOR_PEPPER_CURRENT_VERSION === undefined) {
    delete process.env.PASSWORD_PEPPER_CURRENT_VERSION;
  } else {
    process.env.PASSWORD_PEPPER_CURRENT_VERSION = PRIOR_PEPPER_CURRENT_VERSION;
  }
});

// FLEET-ONB-003 SA/SD §2, §8: Fleet staff invitation issue/revoke/deactivate
// on the formal migrated schema (V0068 identity tables).
// Runs in the existing hosted Product smoke acceptance job after db:migrate.
// Local VM: skip; do not launch PostgreSQL/Docker to satisfy this suite.
describe.skipIf(!process.env.DATABASE_URL)(
  "Fleet staff invitation transaction on the formal schema",
  () => {
    const databases: DatabaseService[] = [];
    const principals: string[] = [];
    const memberships: string[] = [];
    const fleetPartnerIds: string[] = [];
    const entrySlugs: string[] = [];

    async function fixture(entrySlug = `fleet-pg-${randomUUID()}`) {
      const database = new DatabaseService();
      databases.push(database);
      const repository = new IdentityRepository(database);
      const fleetPartnerId = `fleet-pg-partner-${randomUUID()}`;
      const now = new Date().toISOString();
      await database.query(
        `INSERT INTO admin.phase1_fleet_partners (fleet_partner_id, active, partnership_type, updated_at, record)
         VALUES ($1, true, 'standard', $2, $3::jsonb)`,
        [fleetPartnerId, now, JSON.stringify({ fleetPartnerId, active: true })],
      );
      fleetPartnerIds.push(fleetPartnerId);
      entrySlugs.push(entrySlug);
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
      principals.push(issued!.principal.principalId);
      memberships.push(issued!.membership.membershipId);
      return {
        database,
        repository,
        entrySlug,
        fleetPartnerId,
        tokenHash,
        email,
        issued: issued!,
        proof: {
          issuer: "https://accounts.google.com",
          subject: id,
          email,
          entrySlug,
        },
      };
    }

    afterEach(async () => {
      const database = databases[0];
      try {
        if (database) {
          await database.query(
            "DELETE FROM admin.phase1_partner_user_identity_links WHERE entry_slug = ANY($1::text[])",
            [entrySlugs],
          );
          await database.query(
            "UPDATE iam.identity_memberships SET invitation_id = NULL WHERE membership_id = ANY($1::text[])",
            [memberships],
          );
          await database.query(
            "DELETE FROM iam.identity_invitations WHERE membership_id = ANY($1::text[])",
            [memberships],
          );
          await database.query(
            "DELETE FROM iam.identity_role_bindings WHERE membership_id = ANY($1::text[])",
            [memberships],
          );
          await database.query(
            "DELETE FROM iam.identity_memberships WHERE membership_id = ANY($1::text[])",
            [memberships],
          );
          await database.query(
            "DELETE FROM iam.identity_password_credentials WHERE principal_id = ANY($1::text[])",
            [principals],
          );
          await database.query(
            "DELETE FROM iam.identity_principals WHERE principal_id = ANY($1::text[])",
            [principals],
          );
          await database.query(
            "DELETE FROM admin.phase1_fleet_partners WHERE fleet_partner_id = ANY($1::text[])",
            [fleetPartnerIds],
          );
        }
      } finally {
        principals.length = 0;
        memberships.length = 0;
        fleetPartnerIds.length = 0;
        entrySlugs.length = 0;
        await Promise.all(
          databases.splice(0).map((database) => database.onModuleDestroy()),
        );
      }
    });

    it("persists invitation delivery outcomes for a fresh repository on the formal schema", async () => {
      const f = await fixture();
      for (const deliveryStatus of ["delivered", "delivery_failed"] as const) {
        const updated =
          await f.repository.setFleetStaffInvitationDeliveryStatus(
            f.issued.invitation.invitationId,
            deliveryStatus,
          );
        expect(updated).toMatchObject({
          invitationId: f.issued.invitation.invitationId,
          membershipId: f.issued.membership.membershipId,
          deliveryStatus,
          tokenHash: f.tokenHash,
          acceptedAt: null,
          revokedAt: null,
        });
        const persisted = await f.database.query<{
          delivery_status: string;
          record_delivery_status: string;
        }>(
          `SELECT delivery_status, record->>'deliveryStatus' AS record_delivery_status
             FROM iam.identity_invitations WHERE invitation_id = $1`,
          [f.issued.invitation.invitationId],
        );
        expect(persisted.rows).toEqual([
          {
            delivery_status: deliveryStatus,
            record_delivery_status: deliveryStatus,
          },
        ]);
      }
    });

    it("rejects a second invitation for an email with an already-active membership", async () => {
      const f = await fixture();
      // Simulate FLEET-ONB-004's not-yet-implemented accept step: activate
      // the membership the way acceptance eventually will.
      await f.repository.ensureMembershipRecord({
        ...f.issued.membership,
        status: "active",
        updatedAt: new Date().toISOString(),
      });
      const second = new IdentityRepository(f.database);
      await expect(
        second.issueFleetStaffInvitation({
          entrySlug: f.entrySlug,
          fleetPartnerId: f.fleetPartnerId,
          email: f.email,
          roleCode: "fleet_partner_admin",
          validTo: null,
          tokenHash: createHash("sha256")
            .update(`fi_${randomUUID()}`)
            .digest("hex"),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          issuerPrincipalId: null,
        }),
      ).resolves.toBeNull();
    });

    it("re-invites the same placeholder principal instead of creating a duplicate", async () => {
      const f = await fixture();
      const second = new IdentityRepository(f.database);
      const rawToken = `fi_${randomUUID()}`;
      const reissued = await second.issueFleetStaffInvitation({
        entrySlug: f.entrySlug,
        fleetPartnerId: f.fleetPartnerId,
        email: f.email,
        roleCode: "fleet_partner_finance",
        validTo: null,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        issuerPrincipalId: null,
      });
      expect(reissued).not.toBeNull();
      expect(reissued!.principal.principalId).toBe(
        f.issued.principal.principalId,
      );
      expect(reissued!.membership.membershipId).toBe(
        f.issued.membership.membershipId,
      );
      expect(reissued!.roleBinding.roleCode).toBe("fleet_partner_finance");
      memberships.push(reissued!.membership.membershipId);
      // The earlier pending invitation must be revoked by the re-invite, not
      // left consumable alongside the new one.
      const priorInvitation = await f.database.query<{
        revoked_at: string | null;
      }>(
        `SELECT revoked_at FROM iam.identity_invitations WHERE invitation_id = $1`,
        [f.issued.invitation.invitationId],
      );
      expect(priorInvitation.rows[0]?.revoked_at).not.toBeNull();
    });

    it("revokes a pending invitation and rejects revoking it twice", async () => {
      const f = await fixture();
      const revoked = await f.repository.revokeFleetStaffInvitation(
        f.entrySlug,
        f.fleetPartnerId,
        f.issued.invitation.invitationId,
      );
      expect(revoked).toMatchObject({
        invitationId: f.issued.invitation.invitationId,
        revokedAt: expect.any(String),
      });
      expect(
        await f.repository.revokeFleetStaffInvitation(
          f.entrySlug,
          f.fleetPartnerId,
          f.issued.invitation.invitationId,
        ),
      ).toBeNull();
    });

    it("deactivates a Fleet staff membership, revokes its sessions and its still-pending invitation", async () => {
      const f = await fixture();
      const now = new Date().toISOString();
      const session = await f.database.query<{ session_id: string }>(
        `INSERT INTO iam.identity_sessions (
            session_id, source_ref, principal_id, realm, status, auth_time,
            auth_methods, token_version, absolute_expires_at, created_at,
            updated_at, record
          ) VALUES ($1, $1, $2, 'partner', 'active', $3, '{}', 1, $4, $3, $3, '{}'::jsonb)
          RETURNING session_id`,
        [
          `session_pg_${randomUUID()}`,
          f.issued.principal.principalId,
          now,
          new Date(Date.now() + 3_600_000).toISOString(),
        ],
      );
      const disabled = await f.repository.deactivateFleetStaffMembership(
        f.entrySlug,
        f.fleetPartnerId,
        f.issued.membership.membershipId,
        null,
      );
      expect(disabled).toMatchObject({
        membershipId: f.issued.membership.membershipId,
        status: "disabled",
      });
      const invitation = await f.database.query<{ revoked_at: string | null }>(
        `SELECT revoked_at FROM iam.identity_invitations WHERE invitation_id = $1`,
        [f.issued.invitation.invitationId],
      );
      expect(invitation.rows[0]?.revoked_at).not.toBeNull();
      const sessionRow = await f.database.query<{ status: string }>(
        `SELECT status FROM iam.identity_sessions WHERE session_id = $1`,
        [session.rows[0]!.session_id],
      );
      expect(sessionRow.rows[0]?.status).toBe("revoked");
      await f.database.query(
        `DELETE FROM iam.identity_sessions WHERE session_id = $1`,
        [session.rows[0]!.session_id],
      );
    });

    // FLEET-ONB-004 SA/SD §3: Google-bind and password-branch acceptance,
    // on the formal schema, mirroring tenant-google-invitation.pg.test.ts's
    // concurrency coverage for acceptTenantOidcInvitation.
    it("only one concurrent Google consumer binds, activates, and creates the identity link", async () => {
      const f = await fixture();
      const second = new IdentityRepository(f.database);
      const link = new PartnerUserIdentityLinkRepository(f.database);
      const results = await Promise.all([
        f.repository.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
        second.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(
        await second.findPrincipalBySubject(f.proof.issuer, f.proof.subject),
      ).toMatchObject({
        principalId: f.issued.principal.principalId,
        status: "active",
        emailVerified: true,
      });
      expect(
        await second.findMembershipById(f.issued.membership.membershipId),
      ).toMatchObject({ status: "active" });
      const linkRow = await f.database.query<{ drts_passenger_id: string }>(
        `SELECT drts_passenger_id FROM admin.phase1_partner_user_identity_links
          WHERE entry_slug = $1 AND partner_user_ref = $2`,
        [f.entrySlug, f.proof.subject],
      );
      expect(linkRow.rows[0]?.drts_passenger_id).toBe(
        f.issued.principal.principalId,
      );
    });

    it("a conflicting issuer/sub rolls back invitation and activation without creating a link", async () => {
      const first = await fixture();
      const second = await fixture();
      const link = new PartnerUserIdentityLinkRepository(first.database);
      expect(
        await first.repository.acceptFleetStaffOidcInvitation(
          first.tokenHash,
          first.proof,
          link,
        ),
      ).not.toBeNull();
      expect(
        await second.repository.acceptFleetStaffOidcInvitation(
          second.tokenHash,
          { ...second.proof, subject: first.proof.subject },
          link,
        ),
      ).toBeNull();
      const invitation = await second.database.query<{
        accepted_at: string | null;
      }>(
        `SELECT accepted_at FROM iam.identity_invitations WHERE token_hash = $1`,
        [second.tokenHash],
      );
      expect(invitation.rows[0]?.accepted_at).toBeNull();
      expect(
        await second.repository.findMembershipById(
          second.issued.membership.membershipId,
        ),
      ).toMatchObject({ status: "invited" });
      const linkRow = await second.database.query<{ drts_passenger_id: string }>(
        `SELECT drts_passenger_id FROM admin.phase1_partner_user_identity_links
          WHERE entry_slug = $1 AND partner_user_ref = $2`,
        [second.entrySlug, second.proof.subject],
      );
      expect(linkRow.rows).toHaveLength(0);
      // The invitation is still consumable with the correct proof.
      expect(
        await second.repository.acceptFleetStaffOidcInvitation(
          second.tokenHash,
          second.proof,
          link,
        ),
      ).not.toBeNull();
    });

    it("SA/SD §9: a pre-existing (entrySlug, sub) identity link rolls back the whole acceptance", async () => {
      const f = await fixture();
      const link = new PartnerUserIdentityLinkRepository(f.database);
      // A prior referral handoff already linked this exact (entrySlug, sub).
      const existing = await link.createForInvitedPrincipal(
        f.entrySlug,
        f.proof.subject,
        `passenger_referral_${randomUUID()}`,
      );
      expect(existing).not.toBeNull();

      expect(
        await f.repository.acceptFleetStaffOidcInvitation(
          f.tokenHash,
          f.proof,
          link,
        ),
      ).toBeNull();
      const invitation = await f.database.query<{
        accepted_at: string | null;
      }>(
        `SELECT accepted_at FROM iam.identity_invitations WHERE token_hash = $1`,
        [f.tokenHash],
      );
      expect(invitation.rows[0]?.accepted_at).toBeNull();
      expect(
        await f.repository.findMembershipById(f.issued.membership.membershipId),
      ).toMatchObject({ status: "invited" });
      // The pre-existing link must survive untouched.
      const linkRow = await f.database.query<{ drts_passenger_id: string }>(
        `SELECT drts_passenger_id FROM admin.phase1_partner_user_identity_links
          WHERE entry_slug = $1 AND partner_user_ref = $2`,
        [f.entrySlug, f.proof.subject],
      );
      expect(linkRow.rows[0]?.drts_passenger_id).toBe(existing!.drtsPassengerId);
    });

    it("only one of a racing password acceptance and Google acceptance consumes the token, and the loser leaves no partial state", async () => {
      const f = await fixture();
      const second = new IdentityRepository(f.database);
      const link = new PartnerUserIdentityLinkRepository(f.database);
      const { hash, algo, pepperVersion } =
        await new PasswordHashingService().hash("fleet-racer-password-value");

      const results = await Promise.allSettled([
        f.repository.acceptFleetStaffInvitationWithPassword(f.tokenHash, {
          passwordHash: hash,
          passwordAlgo: algo,
          pepperVersion,
        }),
        second.acceptFleetStaffOidcInvitation(f.tokenHash, f.proof, link),
      ]);

      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<unknown> =>
          result.status === "fulfilled" && result.value !== null,
      );
      expect(fulfilled).toHaveLength(1);

      const principal = await second.findPrincipalById(
        f.issued.principal.principalId,
      );
      expect(principal?.status).toBe("active");
      const credential = await second.findPasswordCredentialByPrincipalId(
        f.issued.principal.principalId,
      );
      const linkRow = await f.database.query<{ drts_passenger_id: string }>(
        `SELECT drts_passenger_id FROM admin.phase1_partner_user_identity_links
          WHERE entry_slug = $1 AND partner_user_ref = $2`,
        [f.entrySlug, f.proof.subject],
      );

      if (credential) {
        // Password branch won: issuer/subject stay at their invitation-time
        // placeholder, and no Google-sub identity link is ever created.
        expect(principal?.issuer).toBe(f.issued.principal.issuer);
        expect(principal?.subject).toBe(f.issued.principal.subject);
        expect(linkRow.rows).toHaveLength(0);
      } else {
        // Google branch won: no password credential row was ever written.
        expect(principal?.subject).toBe(f.proof.subject);
        expect(linkRow.rows[0]?.drts_passenger_id).toBe(
          f.issued.principal.principalId,
        );
      }
    });

    it("FLEET-REINVITE-CANONICAL-MEMBER-20261122: rejects a same-email re-invitation after real Google OIDC acceptance while isolating another Fleet with the same email", async () => {
      const f = await fixture();
      const link = new PartnerUserIdentityLinkRepository(f.database);
      const accepted = await f.repository.acceptFleetStaffOidcInvitation(
        f.tokenHash,
        f.proof,
        link,
      );
      expect(accepted).not.toBeNull();

      const second = new IdentityRepository(f.database);
      await expect(
        second.issueFleetStaffInvitation({
          entrySlug: f.entrySlug,
          fleetPartnerId: f.fleetPartnerId,
          email: `  ${f.email.toUpperCase()}  `,
          roleCode: "fleet_partner_admin",
          validTo: null,
          tokenHash: createHash("sha256")
            .update(`fi_${randomUUID()}`)
            .digest("hex"),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          issuerPrincipalId: null,
        }),
      ).resolves.toBeNull();

      // Verify no second membership or invitation was created for this Fleet entry.
      const invitationsForEntry = await second.listFleetStaffInvitations(
        f.entrySlug,
        f.fleetPartnerId,
      );
      expect(invitationsForEntry).toHaveLength(1);
      expect(invitationsForEntry[0]?.invitationId).toBe(
        f.issued.invitation.invitationId,
      );
      expect(invitationsForEntry[0]?.acceptedAt).not.toBeNull();

      // Another Fleet entry with the exact same email is isolated and creates its own canonical member.
      const otherEntrySlug = `fleet-pg-other-${randomUUID()}`;
      const otherFleetPartnerId = `fleet-pg-partner-other-${randomUUID()}`;
      const now = new Date().toISOString();
      await f.database.query(
        `INSERT INTO admin.phase1_fleet_partners (fleet_partner_id, active, partnership_type, updated_at, record)
         VALUES ($1, true, 'standard', $2, $3::jsonb)`,
        [
          otherFleetPartnerId,
          now,
          JSON.stringify({ fleetPartnerId: otherFleetPartnerId, active: true }),
        ],
      );
      fleetPartnerIds.push(otherFleetPartnerId);
      entrySlugs.push(otherEntrySlug);

      const otherIssued = await second.issueFleetStaffInvitation({
        entrySlug: otherEntrySlug,
        fleetPartnerId: otherFleetPartnerId,
        email: f.email,
        roleCode: "fleet_partner_finance",
        validTo: null,
        tokenHash: createHash("sha256")
          .update(`fi_${randomUUID()}`)
          .digest("hex"),
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        issuerPrincipalId: null,
      });
      expect(otherIssued).not.toBeNull();
      principals.push(otherIssued!.principal.principalId);
      memberships.push(otherIssued!.membership.membershipId);
      expect(otherIssued!.principal.principalId).not.toBe(
        f.issued.principal.principalId,
      );
      expect(otherIssued!.membership.membershipId).not.toBe(
        f.issued.membership.membershipId,
      );
    });

    it("FLEET-REINVITE-CANONICAL-MEMBER-20261122: reuses canonical principal, membership, and role binding IDs and createdAt after Google OIDC acceptance and deactivation, preserves history, rejects old Google sub collision, and accepts via password", async () => {
      const f = await fixture();
      const link = new PartnerUserIdentityLinkRepository(f.database);
      const accepted = await f.repository.acceptFleetStaffOidcInvitation(
        f.tokenHash,
        f.proof,
        link,
      );
      expect(accepted).not.toBeNull();

      const now = new Date().toISOString();
      const session = await f.database.query<{ session_id: string }>(
        `INSERT INTO iam.identity_sessions (
            session_id, source_ref, principal_id, realm, status, auth_time,
            auth_methods, token_version, absolute_expires_at, created_at,
            updated_at, record
          ) VALUES ($1, $1, $2, 'partner', 'active', $3, '{}', 1, $4, $3, $3, '{}'::jsonb)
          RETURNING session_id`,
        [
          `session_pg_reinvite_${randomUUID()}`,
          f.issued.principal.principalId,
          now,
          new Date(Date.now() + 3_600_000).toISOString(),
        ],
      );
      const sessionId = session.rows[0]!.session_id;

      try {
        const disabled = await f.repository.deactivateFleetStaffMembership(
          f.entrySlug,
          f.fleetPartnerId,
          f.issued.membership.membershipId,
          null,
        );
        expect(disabled).toMatchObject({
          membershipId: f.issued.membership.membershipId,
          status: "disabled",
        });

        const second = new IdentityRepository(f.database);
        const newTokenHash = createHash("sha256")
          .update(`fi_${randomUUID()}`)
          .digest("hex");
        const reissued = await second.issueFleetStaffInvitation({
          entrySlug: f.entrySlug,
          fleetPartnerId: f.fleetPartnerId,
          email: f.email,
          roleCode: "fleet_partner_finance",
          validTo: null,
          tokenHash: newTokenHash,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          issuerPrincipalId: null,
        });
        expect(reissued).not.toBeNull();
        expect(reissued!.principal).toMatchObject({
          principalId: f.issued.principal.principalId,
          createdAt: f.issued.principal.createdAt,
          issuer: FLEET_INVITATION_ISSUER,
          subject: `fleet:${f.entrySlug}:email:${f.email}`,
          status: "invited",
          emailVerified: false,
        });
        expect(reissued!.membership).toMatchObject({
          membershipId: f.issued.membership.membershipId,
          createdAt: f.issued.membership.createdAt,
          status: "invited",
          invitationId: reissued!.invitation.invitationId,
        });
        expect(reissued!.roleBinding).toMatchObject({
          roleBindingId: f.issued.roleBinding.roleBindingId,
          createdAt: f.issued.roleBinding.createdAt,
          roleCode: "fleet_partner_finance",
        });

        // Old accepted invitation and revoked session remain traceable.
        const firstInvitationRow = await f.database.query<{
          accepted_at: string | null;
          revoked_at: string | null;
        }>(
          `SELECT accepted_at, revoked_at FROM iam.identity_invitations WHERE invitation_id = $1`,
          [f.issued.invitation.invitationId],
        );
        expect(firstInvitationRow.rows[0]?.accepted_at).not.toBeNull();
        expect(firstInvitationRow.rows[0]?.revoked_at).toBeNull();

        const sessionRow = await f.database.query<{
          status: string;
          revoke_reason: string | null;
        }>(
          `SELECT status, revoke_reason FROM iam.identity_sessions WHERE session_id = $1`,
          [sessionId],
        );
        expect(sessionRow.rows[0]).toEqual({
          status: "revoked",
          revoke_reason: "fleet_staff_membership_deactivated",
        });

        // Re-using the same old Google sub hits the preserved (entrySlug, sub)
        // identity link conflict and rolls back without consuming the new token.
        expect(
          await second.acceptFleetStaffOidcInvitation(
            newTokenHash,
            f.proof,
            link,
          ),
        ).toBeNull();

        const { hash, algo, pepperVersion } =
          await new PasswordHashingService().hash("fleet-reinvited-password-value");
        const passwordAccepted =
          await second.acceptFleetStaffInvitationWithPassword(newTokenHash, {
            passwordHash: hash,
            passwordAlgo: algo,
            pepperVersion,
          });
        expect(passwordAccepted).toMatchObject({
          principal: {
            principalId: f.issued.principal.principalId,
            createdAt: f.issued.principal.createdAt,
            issuer: FLEET_INVITATION_ISSUER,
            status: "active",
          },
          membership: {
            membershipId: f.issued.membership.membershipId,
            createdAt: f.issued.membership.createdAt,
            status: "active",
          },
        });
      } finally {
        await f.database.query(
          `DELETE FROM iam.identity_sessions WHERE session_id = $1`,
          [sessionId],
        );
      }
    });
  },
);
