import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { AgencyDirectoryRepository } from "../../../apps/api/src/modules/agency-access/agency-directory.repository";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";

// BUREAU-R13 §2.5: JwtAuthService.verifyAccessToken revalidates an agency
// token on every request. Each denial below happens without revoking the
// session row, proving the durable-state branch itself rejects the token.
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function fixture(roleCode = "agency_viewer") {
  const repo = new IdentityRepository();
  const directory = new AgencyDirectoryRepository();
  const now = new Date().toISOString();
  await directory.create({
    agencyId: "agency_a",
    agencyCode: "TEST-A",
    displayName: "Test agency A",
    status: "active",
    createdByPrincipalId: null,
    createdAt: now,
    updatedAt: now,
  });
  await repo.issueAgencyInvitation({
    agencyId: "agency_a",
    email: "inspector@agency.example",
    roleCode,
    accessValidTo: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    tokenHash: hash("ai_durable"),
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    issuerPrincipalId: null,
  });
  const accepted = await repo.acceptAgencyOidcInvitation(hash("ai_durable"), {
    issuer: "https://accounts.google.com",
    subject: "google-agency-user",
    email: "inspector@agency.example",
  });
  if (!accepted) throw new Error("fixture invitation was not accepted");
  const signer = new JwtAuthService(repo, undefined, undefined, directory);

  async function issue(
    overrides: { scopes?: string[]; roles?: string[] } = {},
  ) {
    const snapshot = (await repo.findAgencyMembershipForPrincipal(
      accepted!.principal.principalId,
    ))!;
    // Same fingerprint the formal OIDC exchange signs (principal, membership
    // and every role binding updatedAt).
    const tokenVersion = Math.max(
      ...[
        snapshot.principal.updatedAt,
        snapshot.membership.updatedAt,
        ...snapshot.roleBindings.map((binding) => binding.updatedAt),
      ].map((value) => Date.parse(value)),
    );
    const issued = await signer.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "agency_user",
        actorId: snapshot.principal.principalId,
        principalId: snapshot.principal.principalId,
        membershipId: snapshot.membership.membershipId,
        subject: "google-agency-user",
        realm: "agency",
        tenantId: null,
        agencyId: "agency_a",
        roleFamilies: ["agency"],
        roles: overrides.roles ?? [roleCode],
        scopes: overrides.scopes ?? [
          "agency:trip_records:read",
          "agency:reports:read",
          "agency:qualifications:read",
        ],
        tokenVersion,
        amr: [],
        acr: "",
        requestId: null,
      },
      { expiresIn: "8h", ensurePrincipal: false, tokenVersion },
    );
    return { token: issued.token, snapshot };
  }
  return { repo, directory, signer, accepted, issue };
}

describe("BUREAU-R13 agency durable-state revalidation", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("JWT_SECRET", "test-session-secret-32-characters-long");
    vi.stubEnv("JWT_ISSUER", "https://drts-session.example");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts a live agency session and carries agencyId into the request identity", async () => {
    const f = await fixture();
    const { token } = await f.issue();
    const payload = await f.signer.verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(f.signer.toRequestIdentity(payload!)).toMatchObject({
      realm: "agency",
      actorType: "agency_user",
      agencyId: "agency_a",
    });
  });

  it("rejects the token once the membership is disabled", async () => {
    const f = await fixture();
    const { token, snapshot } = await f.issue();
    await f.repo.ensureMembershipRecord({
      ...snapshot.membership,
      status: "disabled",
      updatedAt: snapshot.membership.updatedAt,
    });
    expect(await f.signer.verifyAccessToken(token)).toBeNull();
  });

  it("rejects the token once the agency is suspended", async () => {
    const f = await fixture();
    const { token } = await f.issue();
    expect(await f.signer.verifyAccessToken(token)).not.toBeNull();
    await f.directory.update("agency_a", { status: "suspended" });
    expect(await f.signer.verifyAccessToken(token)).toBeNull();
  });

  it("rejects the token once valid_to has passed, without any scheduler", async () => {
    const f = await fixture();
    const { token, snapshot } = await f.issue();
    const binding = snapshot.roleBindings[0]!;
    // valid_to moves into the past while updatedAt (the token fingerprint)
    // stays the same: only the expiry check can reject this token.
    await f.repo.ensureRoleBindingRecord({
      ...binding,
      validTo: new Date(Date.now() - 1000).toISOString(),
      updatedAt: binding.updatedAt,
    });
    expect(await f.signer.verifyAccessToken(token)).toBeNull();
  });

  it("rejects a binding without an explicit valid_to", async () => {
    const f = await fixture();
    const { token, snapshot } = await f.issue();
    const binding = snapshot.roleBindings[0]!;
    await f.repo.ensureRoleBindingRecord({
      ...binding,
      validTo: null,
      updatedAt: binding.updatedAt,
    });
    expect(await f.signer.verifyAccessToken(token)).toBeNull();
  });

  it("rejects the token when the role binding changes (tokenVersion)", async () => {
    const f = await fixture("agency_exporter");
    const { token, snapshot } = await f.issue({
      roles: ["agency_exporter"],
      scopes: ["agency:trip_records:read", "agency:trip_records:export"],
    });
    expect(await f.signer.verifyAccessToken(token)).not.toBeNull();
    const binding = snapshot.roleBindings[0]!;
    await f.repo.ensureRoleBindingRecord({
      ...binding,
      roleCode: "agency_viewer",
      updatedAt: new Date(Date.parse(binding.updatedAt) + 1000).toISOString(),
    });
    expect(await f.signer.verifyAccessToken(token)).toBeNull();
  });

  it("rejects scopes beyond the active role binding even with a current tokenVersion", async () => {
    const f = await fixture("agency_viewer");
    const { token } = await f.issue({
      scopes: ["agency:trip_records:read", "agency:trip_records:export"],
    });
    expect(await f.signer.verifyAccessToken(token)).toBeNull();
  });

  it("revokes immediately through the formal deactivation path", async () => {
    const f = await fixture();
    const { token, snapshot } = await f.issue();
    await f.repo.deactivateAgencyMembership(
      "agency_a",
      snapshot.membership.membershipId,
      null,
    );
    expect(await f.signer.verifyAccessToken(token)).toBeNull();
  });

  it("fails closed when the agency directory authority is not wired", async () => {
    const f = await fixture();
    const { token } = await f.issue();
    const withoutDirectory = new JwtAuthService(f.repo);
    expect(await withoutDirectory.verifyAccessToken(token)).toBeNull();
  });

  it("fails closed without a durable identity repository", async () => {
    const f = await fixture();
    const { token } = await f.issue();
    const stateless = new JwtAuthService();
    expect(await stateless.verifyAccessToken(token)).toBeNull();
  });
});
