import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/common/db";
import { AgencyDirectoryRepository } from "../../src/modules/agency-access/agency-directory.repository";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";

// BUREAU-R13 agency invitation acceptance on the formal migrated schema
// (V0068 identity tables + V0132 core.regulatory_agencies).
// Runs in the existing hosted Product smoke acceptance job after db:migrate.
// Local VM: skip; do not launch PostgreSQL/Docker to satisfy this suite.
describe.skipIf(!process.env.DATABASE_URL)(
  "Agency invitation transaction on the formal schema",
  () => {
    const databases: DatabaseService[] = [];
    const agencies: string[] = [];
    const principals: string[] = [];
    const memberships: string[] = [];

    async function fixture(subject = randomUUID()) {
      const database = new DatabaseService();
      databases.push(database);
      const repository = new IdentityRepository(database);
      const directory = new AgencyDirectoryRepository(database);
      const id = randomUUID();
      const now = new Date().toISOString();
      const agency = await directory.create({
        agencyId: `agency_pg_${id.replace(/-/g, "")}`,
        agencyCode: `PG-${id}`,
        displayName: "PG fixture agency",
        status: "active",
        createdByPrincipalId: null,
        createdAt: now,
        updatedAt: now,
      });
      agencies.push(agency.agencyId);
      const rawToken = `ai_${id}`;
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const email = `${id}@agency.example.org`;
      const issued = await repository.issueAgencyInvitation({
        agencyId: agency.agencyId,
        email,
        roleCode: "agency_viewer",
        accessValidTo: new Date(Date.now() + 86_400_000).toISOString(),
        tokenHash,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        issuerPrincipalId: null,
      });
      principals.push(issued!.principal.principalId);
      memberships.push(issued!.membership.membershipId);
      const proof = {
        issuer: "https://accounts.google.com",
        subject,
        email,
        agencyId: agency.agencyId,
      };
      return {
        database,
        repository,
        directory,
        agency,
        tokenHash,
        proof,
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
          await database.query(
            "DELETE FROM core.regulatory_agencies WHERE agency_id = ANY($1::text[])",
            [agencies],
          );
        }
      } finally {
        agencies.length = 0;
        principals.length = 0;
        memberships.length = 0;
        await Promise.all(
          databases.splice(0).map((database) => database.onModuleDestroy()),
        );
      }
    });

    it("only one concurrent consumer binds and activates the agency membership", async () => {
      const f = await fixture();
      const second = new IdentityRepository(f.database);
      const results = await Promise.all([
        f.repository.acceptAgencyOidcInvitation(f.tokenHash, f.proof),
        second.acceptAgencyOidcInvitation(f.tokenHash, f.proof),
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
        await second.findAgencyMembershipForPrincipal(
          f.issued.principal.principalId,
        ),
      ).toMatchObject({
        agencyId: f.agency.agencyId,
        membership: { status: "active", realm: "agency" },
      });
    });

    it("wrong email and wrong agency attempts leave the proof consumable", async () => {
      const f = await fixture();
      expect(
        await f.repository.acceptAgencyOidcInvitation(f.tokenHash, {
          ...f.proof,
          email: "other@agency.example.org",
        }),
      ).toBeNull();
      expect(
        await f.repository.acceptAgencyOidcInvitation(f.tokenHash, {
          ...f.proof,
          agencyId: "agency_somewhere_else",
        }),
      ).toBeNull();
      expect(
        await f.repository.findInvitationByTokenHash(f.tokenHash),
      ).toMatchObject({ acceptedAt: null });
      expect(
        await f.repository.acceptAgencyOidcInvitation(f.tokenHash, f.proof),
      ).not.toBeNull();
    });

    it("a suspended agency cannot consume its invitation", async () => {
      const f = await fixture();
      await f.directory.update(f.agency.agencyId, { status: "suspended" });
      expect(
        await f.repository.acceptAgencyOidcInvitation(f.tokenHash, f.proof),
      ).toBeNull();
      expect(
        await f.repository.findInvitationByTokenHash(f.tokenHash),
      ).toMatchObject({ acceptedAt: null });
    });

    it("an (issuer, sub) conflict rolls back the whole acceptance", async () => {
      const subject = randomUUID();
      const first = await fixture(subject);
      const second = await fixture(subject);
      expect(
        await first.repository.acceptAgencyOidcInvitation(
          first.tokenHash,
          first.proof,
        ),
      ).not.toBeNull();
      expect(
        await second.repository.acceptAgencyOidcInvitation(
          second.tokenHash,
          second.proof,
        ),
      ).toBeNull();
      expect(
        await second.repository.findInvitationByTokenHash(second.tokenHash),
      ).toMatchObject({ acceptedAt: null });
      expect(
        await second.repository.findMembershipById(
          second.issued.membership.membershipId,
        ),
      ).toMatchObject({ status: "invited" });
      expect(
        await second.repository.findPrincipalById(
          second.issued.principal.principalId,
        ),
      ).toMatchObject({ status: "invited", issuer: "agency_invitation" });
    });
  },
);
