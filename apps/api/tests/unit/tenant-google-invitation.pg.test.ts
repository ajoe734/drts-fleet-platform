import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { TenantUserRoleRecord } from "@drts/contracts";
import { DatabaseService } from "../../src/common/db";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { TenantPartnerRepository } from "../../src/modules/tenant-partner/tenant-partner.repository";

// Runs in the existing hosted Product smoke acceptance job after db:migrate.
// Local VM: skip; do not launch PostgreSQL/Docker to satisfy this suite.
describe.skipIf(!process.env.DATABASE_URL)(
  "Google invitation transaction on the formal schema",
  () => {
    const databases: DatabaseService[] = [];
    const users: string[] = [];
    const principals: string[] = [];
    const memberships: string[] = [];
    async function fixture() {
      const database = new DatabaseService();
      databases.push(database);
      const repository = new IdentityRepository(database);
      const tenantRepository = new TenantPartnerRepository(database);
      const id = randomUUID();
      const now = new Date().toISOString();
      const user: TenantUserRoleRecord = {
        userId: `oidc-test-${id}`,
        tenantId: `tenant-${id}`,
        email: `${id}@example.org`,
        displayName: "OIDC PG fixture",
        roleCode: "tenant_viewer",
        status: "invited",
        invitedAt: now,
        updatedAt: now,
        approvalNotificationOptOut: false,
      };
      users.push(user.userId);
      await tenantRepository.persistChanges({ userRoles: [user] });
      const snapshot = await repository.syncLegacyTenantUserRole(user);
      principals.push(snapshot.principal.principalId);
      memberships.push(snapshot.membership.membershipId);
      const tokenHash = createHash("sha256").update(id).digest("hex");
      await repository.upsertInvitationRecord({
        ...snapshot.invitation!,
        tokenHash,
        // Canonical invitation state after the delivery adapter reports "sent".
        deliveryStatus: "delivered",
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
      const proof = {
        issuer: "https://accounts.google.com",
        subject: id,
        email: user.email,
        tenantId: user.tenantId,
      };
      return { database, repository, user, tokenHash, proof, snapshot };
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
          await database.query(
            "DELETE FROM admin.phase1_tenant_user_roles WHERE user_id = ANY($1::text[])",
            [users],
          );
        }
      } finally {
        users.length = 0;
        principals.length = 0;
        memberships.length = 0;
        await Promise.all(
          databases.splice(0).map((database) => database.onModuleDestroy()),
        );
      }
    });

    it("only one concurrent consumer binds and activates, visible to a fresh repository", async () => {
      const f = await fixture();
      const second = new IdentityRepository(f.database);
      const results = await Promise.all([
        f.repository.acceptTenantOidcInvitation(f.tokenHash, f.proof),
        second.acceptTenantOidcInvitation(f.tokenHash, f.proof),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await second.findTenantUserByOidcSubject(f.proof)).toMatchObject({
        userId: f.user.userId,
        status: "active",
        subjectId: f.proof.subject,
      });
      expect(
        await second.findPrincipalBySubject(f.proof.issuer, f.proof.subject),
      ).toMatchObject({
        principalId: f.snapshot.principal.principalId,
        status: "active",
        emailVerified: true,
      });
      expect(
        await second.findMembershipById(f.snapshot.membership.membershipId),
      ).toMatchObject({ status: "active" });
    });

    it("wrong recipient and cross-tenant attempts leave the proof consumable", async () => {
      const f = await fixture();
      expect(
        await f.repository.acceptTenantOidcInvitation(f.tokenHash, {
          ...f.proof,
          email: "other@example.org",
        }),
      ).toBeNull();
      expect(
        await f.repository.acceptTenantOidcInvitation(f.tokenHash, {
          ...f.proof,
          tenantId: "another-tenant",
        }),
      ).toBeNull();
      expect(
        await f.repository.findInvitationByTokenHash(f.tokenHash),
      ).toMatchObject({ acceptedAt: null });
      expect(
        await f.repository.acceptTenantOidcInvitation(f.tokenHash, f.proof),
      ).not.toBeNull();
    });

    it("a conflicting issuer/sub rolls back invitation and activation", async () => {
      const first = await fixture();
      const second = await fixture();
      expect(
        await first.repository.acceptTenantOidcInvitation(
          first.tokenHash,
          first.proof,
        ),
      ).not.toBeNull();
      expect(
        await second.repository.acceptTenantOidcInvitation(second.tokenHash, {
          ...second.proof,
          subject: first.proof.subject,
        }),
      ).toBeNull();
      expect(
        await second.repository.findInvitationByTokenHash(second.tokenHash),
      ).toMatchObject({ acceptedAt: null });
      expect(
        await second.repository.findTenantUserForAuthentication(
          second.user.tenantId,
          second.user.userId,
        ),
      ).toMatchObject({ status: "invited" });
      expect(
        await second.repository.findMembershipById(
          second.snapshot.membership.membershipId,
        ),
      ).toMatchObject({ status: "invited" });
      expect(
        await second.repository.acceptTenantOidcInvitation(
          second.tokenHash,
          second.proof,
        ),
      ).not.toBeNull();
    });
  },
);
