import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DatabaseService } from "../../src/common/db";
import { AgencyDirectoryRepository } from "../../src/modules/agency-access/agency-directory.repository";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { PasswordHashingService } from "../../src/common/auth/password-hashing.service";

// PWD-LOGIN-011 (SA/SD §11, 真 PG migration 整合測試: "邀請接受的密碼分支要有
// 並發一次性消耗測試（與 acceptTenantOidcInvitation 的並發測試同等要求）"):
// `tenant-google-invitation.pg.test.ts` already has this exact race for the
// *tenant* realm ("only one of a racing password acceptance and Google
// acceptance consumes the token"). `agency-invitation.pg.test.ts` has the
// equivalent OIDC-vs-OIDC concurrency coverage for the *agency* realm, but
// never exercises `IdentityRepository.acceptAgencyInvitationWithPassword`
// racing `acceptAgencyOidcInvitation` over the same invitation row on the
// formal schema -- this file is that missing cell, kept in its own file
// (rather than appended to `agency-invitation.pg.test.ts`) per this task's
// write_scopes (new test files only, no edits to existing test files).
//
// PWD-LOGIN-011's own write_scopes (apps/api/tests/, tests/security/,
// tests/unit/) are the reason this file, which required a real find on
// this gap, name a separate SA/SD §6 (password reset)/§1 (invitation) owner
// task to fix anything found broken, not patch product code here -- no
// defect was found in this one; the row lock already behaves correctly.
//
// PWD-LOGIN-011's own `test_commands` list the hosted-only run as
// `pnpm --filter @drts/api test` (includes `.pg.test.ts`, needs real
// migrations + real PG). This VM has no local Postgres/Docker (AGENTS.md VM
// restriction) and cannot run this file; it runs in the existing hosted CI
// job `product_api_unit` ("Product API unit tests (shard 1/2, 2/2)") in
// `.github/workflows/ci.yml` / `ci-integ.yml`, the same job that already
// runs `tenant-google-invitation.pg.test.ts` and `agency-invitation.pg.test.ts`.
const PRIOR_PEPPER_SECRETS_JSON = process.env.PASSWORD_PEPPER_SECRETS_JSON;
const PRIOR_PEPPER_CURRENT_VERSION = process.env.PASSWORD_PEPPER_CURRENT_VERSION;

beforeAll(() => {
  process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
    v1: "agency-invitation-password-race-pg-test-pepper-32char!",
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

// Local VM: skip; do not launch PostgreSQL/Docker to satisfy this suite.
describe.skipIf(!process.env.DATABASE_URL)(
  "Agency invitation password-vs-Google race on the formal schema (PWD-LOGIN-011)",
  () => {
    const databases: DatabaseService[] = [];
    const agencies: string[] = [];
    const principals: string[] = [];
    const memberships: string[] = [];

    async function fixture() {
      const database = new DatabaseService();
      databases.push(database);
      const repository = new IdentityRepository(database);
      const directory = new AgencyDirectoryRepository(database);
      const id = randomUUID();
      const now = new Date().toISOString();
      const agency = await directory.create({
        agencyId: `agency_pg_race_${id.replace(/-/g, "")}`,
        agencyCode: `PG-RACE-${id}`,
        displayName: "PG password-race fixture agency",
        status: "active",
        createdByPrincipalId: null,
        createdAt: now,
        updatedAt: now,
      });
      agencies.push(agency.agencyId);
      const rawToken = `ai_race_${id}`;
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const email = `${id}@agency-race.example.org`;
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
        subject: id,
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
            "DELETE FROM iam.identity_password_credentials WHERE principal_id = ANY($1::text[])",
            [principals],
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

    it("only one of a racing password acceptance and Google acceptance consumes the agency invitation token", async () => {
      const f = await fixture();
      const second = new IdentityRepository(f.database);
      const { hash, algo, pepperVersion } = await new PasswordHashingService().hash(
        "agency-racer-password-value",
      );

      const results = await Promise.allSettled([
        f.repository.acceptAgencyInvitationWithPassword(f.tokenHash, {
          passwordHash: hash,
          passwordAlgo: algo,
          pepperVersion,
        }),
        second.acceptAgencyOidcInvitation(f.tokenHash, f.proof),
      ]);

      const fulfilled = results.filter(
        (result): result is PromiseFulfilledResult<unknown> =>
          result.status === "fulfilled" && result.value !== null,
      );
      expect(fulfilled).toHaveLength(1);

      const invitation = await second.findInvitationByTokenHash(f.tokenHash);
      expect(invitation?.acceptedAt).not.toBeNull();
      const principal = await second.findPrincipalById(
        f.issued.principal.principalId,
      );
      expect(principal?.status).toBe("active");
      const credential = await second.findPasswordCredentialByPrincipalId(
        f.issued.principal.principalId,
      );
      const membershipAfter = await second.findMembershipById(
        f.issued.membership.membershipId,
      );
      expect(membershipAfter?.status).toBe("active");

      if (credential) {
        // Password branch won: issuer/subject stay at the invitation-time
        // placeholder, never rebound to the Google proof (mirrors the
        // tenant password branch's same guarantee).
        expect(principal?.issuer).toBe(f.issued.principal.issuer);
        expect(principal?.subject).toBe(f.issued.principal.subject);
      } else {
        // Google branch won: no password credential row was ever written.
        expect(principal?.subject).toBe(f.proof.subject);
      }

      // Whichever branch won, the loser's retry against the now-accepted
      // invitation must still be rejected (single consumption, not a
      // transient lock contention that a retry could still win).
      const retry = await second.acceptAgencyOidcInvitation(f.tokenHash, {
        ...f.proof,
        subject: `${f.proof.subject}-retry`,
      });
      expect(retry).toBeNull();
    });
  },
);
