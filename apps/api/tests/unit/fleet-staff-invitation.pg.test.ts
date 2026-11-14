import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/common/db";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";

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

    async function fixture(entrySlug = `fleet-pg-${randomUUID()}`) {
      const database = new DatabaseService();
      databases.push(database);
      const repository = new IdentityRepository(database);
      const fleetPartnerId = `fleet-pg-partner-${randomUUID()}`;
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
      };
    }

    afterEach(async () => {
      const database = databases[0];
      try {
        if (database) {
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
            "DELETE FROM iam.identity_principals WHERE principal_id = ANY($1::text[])",
            [principals],
          );
        }
      } finally {
        principals.length = 0;
        memberships.length = 0;
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
  },
);
