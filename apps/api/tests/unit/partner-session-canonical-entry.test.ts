import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiRequestError } from "../../src/common/api-envelope";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";

// Deploy-dev run 43329902604 (2026-11-12): a partner bootstrap session issued
// against the persisted entry was rejected with 401 JWT_INVALID when a later
// request landed on an API instance whose in-memory entry list did not hold
// that entry. Verification must read the same canonical entry issuance used.

const ENTRY_SLUG = "operational-fleet-entry";
const UPDATED_AT = "2026-11-12T23:56:10.000Z";

function canonicalEntry(updatedAt = UPDATED_AT) {
  return {
    entrySlug: ENTRY_SLUG,
    partnerId: "fleet-partner-001",
    tenantId: "tenant-001",
    programId: "program-001",
    status: "active",
    activeFlag: true,
    updatedAt,
  };
}

function entryMissingFromThisInstance(): never {
  throw new ApiRequestError(
    404,
    "PARTNER_ENTRY_NOT_FOUND",
    "The partner entry could not be found.",
    { entrySlug: ENTRY_SLUG },
  );
}

async function issuePartnerToken(auth: JwtAuthService) {
  const issued = await auth.issueSessionToken(
    {
      authMode: "jwt_bearer",
      actorType: "partner_api_key",
      actorId: "partner-key-operational",
      realm: "partner",
      tenantId: "tenant-001",
      partnerId: "fleet-partner-001",
      partnerProgramId: "program-001",
      partnerEntrySlug: ENTRY_SLUG,
      roleFamilies: ["partner"],
      roles: ["partner_api_client"],
      scopes: ["partner:read", "partner:write"],
    } as never,
    {
      expiresIn: "1h",
      tokenVersion: Date.parse(UPDATED_AT),
      amr: ["partner_api_key"],
      acr: "aal1",
    } as never,
  );
  return issued.token;
}

describe("partner bootstrap session verification across API instances", () => {
  const saved = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_ISSUER: process.env.JWT_ISSUER,
    JWT_AUDIENCE: process.env.JWT_AUDIENCE,
  };

  beforeEach(() => {
    process.env.JWT_SECRET = "partner-canonical-entry-test-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("accepts the session when only the persisted entry knows the slug", async () => {
    const tenantPartnerService = {
      getPartnerEntry: entryMissingFromThisInstance,
      resolvePartnerEntry: async (slug: string) => {
        expect(slug).toBe(ENTRY_SLUG);
        return canonicalEntry();
      },
    };
    const auth = new JwtAuthService(
      new IdentityRepository(),
      tenantPartnerService as never,
    );
    const token = await issuePartnerToken(auth);

    expect(await auth.verifyAccessToken(token)).toMatchObject({
      realm: "partner",
      partnerEntrySlug: ENTRY_SLUG,
      tokenVersion: Date.parse(UPDATED_AT),
    });
  });

  it("rejects the session when the persisted entry has moved on", async () => {
    const tenantPartnerService = {
      getPartnerEntry: () => canonicalEntry(),
      resolvePartnerEntry: async () =>
        canonicalEntry("2026-11-12T23:58:00.000Z"),
    };
    const auth = new JwtAuthService(
      new IdentityRepository(),
      tenantPartnerService as never,
    );
    const token = await issuePartnerToken(auth);

    expect(await auth.verifyAccessToken(token)).toBeNull();
  });

  it("fails closed when the persisted entry cannot be resolved", async () => {
    const tenantPartnerService = {
      getPartnerEntry: () => canonicalEntry(),
      resolvePartnerEntry: async () => entryMissingFromThisInstance(),
    };
    const auth = new JwtAuthService(
      new IdentityRepository(),
      tenantPartnerService as never,
    );
    const token = await issuePartnerToken(auth);

    expect(await auth.verifyAccessToken(token)).toBeNull();
  });
});
