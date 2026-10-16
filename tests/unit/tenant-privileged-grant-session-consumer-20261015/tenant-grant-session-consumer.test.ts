import { generateKeyPairSync } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentityContext } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { PrivilegedRoleGovernanceService } from "../../../apps/api/src/modules/identity/privileged-role-governance.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { OidcPkceService } from "../../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { SecurityEventsService } from "../../../apps/api/src/modules/security-events/security-events.service";
import { authorizeInvoiceTenant } from "../../../apps/api/src/modules/billing-settlement/invoice-mail.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

// C011-F1: a dual-approved tenant privileged-role grant must actually change
// what a freshly issued tenant OIDC session (and every later durable
// revalidation of it) is allowed to do, without ever rewriting the durable
// TenantUserRole it is layered on top of.

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const issuer = "https://accounts.google.com";
const email = "elevated-consumer@example.org";
const tenantId = "tenant-privileged-grant-consumer-test";
const clientId = "123-test.apps.googleusercontent.com";

class CaptureDelivery extends TenantInvitationDeliveryService {
  token = "";
  override async send(request: TenantInvitationDeliveryRequest) {
    this.token = request.rawToken;
    return super.send(request);
  }
}

function createGovernanceIdentity(
  overrides: Partial<IdentityContext> = {},
): IdentityContext {
  return {
    actorType: "tenant_admin",
    actorId: "usr_governance_actor",
    realm: "tenant",
    authMode: "jwt_bearer",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:write"],
    tenantId,
    authMethods: ["jwt", "mfa"],
    authTime: new Date().toISOString(),
    ...overrides,
  } as IdentityContext;
}

async function fixture() {
  const repo = new IdentityRepository();
  const delivery = new CaptureDelivery();
  const tenant = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    repo,
    repo,
    delivery,
  );
  const user = await tenant.createTenantUser(tenantId, {
    email,
    displayName: "Elevated Consumer",
    roleCode: "tenant_viewer",
  });
  const security = new SecurityEventsService();
  const signer = new JwtAuthService(repo, tenant);
  const oidc = new OidcPkceService(
    signer,
    tenant,
    security,
    undefined,
    undefined,
    repo,
  );
  const governance = new PrivilegedRoleGovernanceService(repo);
  const billing = new BillingSettlementService(new AuditNotificationService());

  const sign = (nonce?: string, overrides: Record<string, unknown> = {}) =>
    jwt.sign(
      { sub: "google-user", email, email_verified: true, nonce, ...overrides },
      key.privateKey,
      {
        algorithm: "RS256",
        keyid: "key",
        issuer,
        audience: clientId,
        expiresIn: "5m",
      },
    );
  const mockGoogle = (idToken: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/token")) return Response.json({ id_token: idToken });
        return Response.json({
          keys: [
            {
              ...key.publicKey.export({ format: "jwk" }),
              kid: "key",
              alg: "RS256",
              use: "sig",
            },
          ],
        });
      }),
    );

  async function callback(invitationToken?: string) {
    const login = oidc.generateLoginParameters("tenant", {
      redirectUri: "https://tenant.example/api/auth/tenant/callback",
      tenantId,
      ...(invitationToken ? { invitationToken } : {}),
    });
    const state = oidc.verifyStateToken(login.stateToken)!;
    mockGoogle(sign(state.nonce));
    return oidc.exchangeTenantCallbackSession(
      {
        provider: "oidc",
        code: "google-code",
        state: login.state,
        callbackUrl: state.redirectUri!,
      },
      { stateToken: login.stateToken },
    );
  }

  return { repo, tenant, delivery, user, oidc, signer, governance, billing, sign, mockGoogle, callback };
}

describe("TENANT-PRIVILEGED-GRANT-SESSION-CONSUMER-FLOW-20261015 (C011-F1)", () => {
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("OIDC_MOCK_MODE", "false");
    vi.stubEnv("OIDC_ISSUER", issuer);
    vi.stubEnv("OIDC_CLIENT_ID", clientId);
    vi.stubEnv("TENANT_OIDC_ISSUER", "");
    vi.stubEnv("TENANT_OIDC_AUDIENCE", "");
    vi.stubEnv("JWT_SECRET", "test-session-secret-32-characters-long");
    vi.stubEnv("JWT_ISSUER", "https://drts-session.example");
    vi.stubEnv("AUTH_ALLOWED_ORIGINS", "https://tenant.example");
    vi.stubEnv("DRTS_DEV_MFA_WAIVED", "false");
    vi.stubEnv("AUTH_REQUIRE_ORDINARY_LOGIN_MFA", "false");
    vi.stubEnv("STEP_UP_PROOF_SECRET", "test_configured_high_entropy_secret_key_32bytes");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("before fix: base tenant_viewer session has no billing-write authority (reproduction)", async () => {
    const f = await fixture();
    const session = await f.callback(f.delivery.token);
    expect(session.identity.roles).toEqual(["tenant_viewer"]);
    const payload = await f.signer.verifyAccessToken(session.accessToken);
    expect(payload).not.toBeNull();
    const identity = f.signer.toRequestIdentity(payload!);
    expect(() =>
      authorizeInvoiceTenant(identity, tenantId, "tenant:billing:write"),
    ).toThrow();
  });

  it("after fix: a real dual-approved grant elevates a fresh session and the elevated token drives a real protected command + readback", async () => {
    const f = await fixture();
    const baseSession = await f.callback(f.delivery.token);
    const baseDecoded = jwt.decode(baseSession.accessToken) as jwt.JwtPayload;

    const membershipId = await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    );
    expect(membershipId).toBeTruthy();

    const requester = createGovernanceIdentity({ actorId: "usr_requester" });
    const approver = createGovernanceIdentity({ actorId: "usr_approver" });
    const request = await f.governance.createRequest(
      {
        targetUserId: f.user.userId,
        targetMembershipId: membershipId,
        roleCode: "tenant_finance_admin",
        reason: "Quarter-end billing close requires temporary finance authority.",
        tenantId,
      },
      requester,
    );
    const { grant } = await f.governance.approveRequest(request.requestId, approver, {
      approvalRequestId: request.requestId,
      mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
    });
    expect(grant.status).toBe("active");
    expect(grant.roleCode).toBe("tenant_finance_admin");

    // C010 credit: the pre-grant session is revoked before the fresh login.
    await f.signer.revokeCurrentSession(baseDecoded.sid as string);
    expect(await f.signer.verifyAccessToken(baseSession.accessToken)).toBeNull();

    const elevatedSession = await f.callback();
    expect(elevatedSession.identity.roles).toEqual(["tenant_finance_admin"]);
    expect(elevatedSession.identity.scopes).toContain("tenant:billing:write");

    const payload = await f.signer.verifyAccessToken(elevatedSession.accessToken);
    expect(payload).not.toBeNull();
    expect(payload!.tenantPrivilegedGrantId).toBe(grant.grantId);
    const identity = f.signer.toRequestIdentity(payload!);

    const authorizedTenantId = authorizeInvoiceTenant(
      identity,
      tenantId,
      "tenant:billing:write",
    );
    const updated = await f.billing.updateTenantBillingProfile(authorizedTenantId, {
      invoiceTitle: "Elevated Co",
      email: "billing@acme.example",
    });
    expect(updated.invoiceTitle).toBe("Elevated Co");
    const readback = f.billing.getTenantBillingProfile(tenantId);
    expect(readback.invoiceTitle).toBe("Elevated Co");
    expect(readback.email).toBe("billing@acme.example");

    // The durable TenantUserRole was never permanently rewritten by the grant.
    const persisted = await f.tenant.findTenantUserForAuthentication(
      tenantId,
      f.user.userId,
    );
    expect(persisted?.roleCode).toBe("tenant_viewer");
  });

  it("removed grant: already-issued elevated token is denied on the next durable revalidation (no re-login)", async () => {
    const f = await fixture();
    await f.callback(f.delivery.token);
    const membershipId = (await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    ))!;

    const requester = createGovernanceIdentity({ actorId: "usr_requester_2" });
    const approver = createGovernanceIdentity({ actorId: "usr_approver_2" });
    const request = await f.governance.createRequest(
      {
        targetUserId: f.user.userId,
        targetMembershipId: membershipId,
        roleCode: "tenant_finance_admin",
        reason: "Temporary finance authority for reconciliation.",
        tenantId,
      },
      requester,
    );
    await f.governance.approveRequest(request.requestId, approver, {
      approvalRequestId: request.requestId,
      mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
    });

    const elevatedSession = await f.callback();
    const payloadBefore = await f.signer.verifyAccessToken(elevatedSession.accessToken);
    expect(payloadBefore).not.toBeNull();

    await f.governance.removeGrant(
      {
        targetUserId: f.user.userId,
        roleCode: "tenant_finance_admin",
        tenantId,
        mutation: { expectedVersion: 1, reasonCode: "REVOKE" },
      },
      approver,
    );

    // Same still-live session/token, re-validated: the grant it depends on is
    // gone now, so it must fail closed instead of continuing to admit the
    // elevated role for the rest of the token's lifetime.
    const payloadAfter = await f.signer.verifyAccessToken(elevatedSession.accessToken);
    expect(payloadAfter).toBeNull();

    // A brand new login after removal reverts to the durable base role.
    await f.signer.revokeCurrentSession(
      (jwt.decode(elevatedSession.accessToken) as jwt.JwtPayload).sid as string,
    );
    const revertedSession = await f.callback();
    expect(revertedSession.identity.roles).toEqual(["tenant_viewer"]);
  });

  it("expired grant does not elevate a fresh login and future-dated grant stays pending (not active)", async () => {
    const f = await fixture();
    await f.callback(f.delivery.token);
    const membershipId = (await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    ))!;

    const requester = createGovernanceIdentity({ actorId: "usr_requester_3" });
    const approver = createGovernanceIdentity({ actorId: "usr_approver_3" });
    const request = await f.governance.createRequest(
      {
        targetUserId: f.user.userId,
        targetMembershipId: membershipId,
        roleCode: "tenant_finance_admin",
        reason: "Short-lived finance authority.",
        tenantId,
        validTo: new Date(Date.now() + 60_000).toISOString(),
      },
      requester,
    );
    const { grant } = await f.governance.approveRequest(request.requestId, approver, {
      approvalRequestId: request.requestId,
      mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
    });

    // Directly age the grant past its validTo, the same way other tests in
    // this repository fast-forward time-bound records without a live clock.
    await f.repo.savePrivilegedRoleGrant({
      ...grant,
      validTo: new Date(Date.now() - 1_000).toISOString(),
    });

    const activeAfterExpiry = await f.repo.findActivePrivilegedGrantsForMembership(
      membershipId,
    );
    expect(activeAfterExpiry.some((g) => g.grantId === grant.grantId)).toBe(false);

    const sessionAfterExpiry = await f.callback();
    expect(sessionAfterExpiry.identity.roles).toEqual(["tenant_viewer"]);

    // Future-dated request: approval leaves it pending_activation, which the
    // active-grant projection must never treat as elevating anything yet.
    const futureRequest = await f.governance.createRequest(
      {
        targetUserId: f.user.userId,
        targetMembershipId: membershipId,
        roleCode: "tenant_finance_admin",
        reason: "Scheduled future finance authority.",
        tenantId,
        validFrom: new Date(Date.now() + 3_600_000).toISOString(),
      },
      requester,
    );
    const { grant: futureGrant } = await f.governance.approveRequest(
      futureRequest.requestId,
      approver,
      {
        approvalRequestId: futureRequest.requestId,
        mutation: { expectedVersion: futureRequest.version, reasonCode: "APPROVE" },
      },
    );
    expect(futureGrant.status).toBe("pending_activation");
    const activeNow = await f.repo.findActivePrivilegedGrantsForMembership(
      membershipId,
    );
    expect(activeNow.some((g) => g.grantId === futureGrant.grantId)).toBe(false);
  });

  it("a grant scoped to a different tenant never projects into this membership's active grants", async () => {
    const f = await fixture();
    await f.callback(f.delivery.token);
    const membershipId = (await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    ))!;

    const now = new Date().toISOString();
    await f.repo.savePrivilegedRoleGrant({
      grantId: "grant_wrong_tenant_test",
      requestId: null,
      tenantId: "some-other-tenant",
      realm: "tenant",
      targetUserId: "irrelevant",
      targetMembershipId: membershipId,
      roleCode: "tenant_finance_admin",
      grantedByPrincipalId: "usr_approver_other_tenant",
      approvalId: null,
      validFrom: now,
      validTo: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const activeGrants = await f.repo.findActivePrivilegedGrantsForMembership(
      membershipId,
    );
    expect(activeGrants).toHaveLength(0);

    const session = await f.callback();
    expect(session.identity.roles).toEqual(["tenant_viewer"]);
  });

  it("self-approval of a privileged role grant is still rejected (SoD unchanged by this fix)", async () => {
    const f = await fixture();
    const membershipId = (await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    ))!;
    const requesterAndApprover = createGovernanceIdentity({
      actorId: f.user.userId,
    });
    const request = await f.governance.createRequest(
      {
        targetUserId: f.user.userId,
        targetMembershipId: membershipId,
        roleCode: "tenant_finance_admin",
        reason: "Attempted self-elevation.",
        tenantId,
      },
      requesterAndApprover,
    );
    await expect(
      f.governance.approveRequest(request.requestId, requesterAndApprover, {
        approvalRequestId: request.requestId,
        mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
      }),
    ).rejects.toThrow();
  });

  // C011-F1 reopen (reviewer-reproduced regressions): the fixes above must
  // not stop at "a grant changes the issued role". They must also (a) bind
  // the MFA gate to the *effective* role being issued, not the durable one
  // a grant deliberately leaves unchanged, (b) issue sessions under the
  // same canonical principal/membership the dual-approval flow revokes by
  // and any grant targets (never a legacy/manufactured identity), and (c)
  // respect an explicit targetMembershipId instead of also matching every
  // other membership of the same principal.

  it("after fix: elevating to tenant_admin via a grant requires real MFA proof on the fresh login, closing the effective-role MFA bypass", async () => {
    const f = await fixture();
    await f.callback(f.delivery.token);
    const membershipId = (await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    ))!;

    const requester = createGovernanceIdentity({ actorId: "usr_requester_mfa" });
    const approver = createGovernanceIdentity({ actorId: "usr_approver_mfa" });
    const request = await f.governance.createRequest(
      {
        targetUserId: f.user.userId,
        targetMembershipId: membershipId,
        roleCode: "tenant_admin",
        reason: "Temporary tenant_admin authority for an incident.",
        tenantId,
      },
      requester,
    );
    const { grant } = await f.governance.approveRequest(request.requestId, approver, {
      approvalRequestId: request.requestId,
      mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
    });
    expect(grant.roleCode).toBe("tenant_admin");

    // A fresh ordinary-login callback carries no amr/acr trusted MFA proof,
    // AUTH_REQUIRE_ORDINARY_LOGIN_MFA=false and DRTS_DEV_MFA_WAIVED=false.
    // Issuing roles=[tenant_admin] into this session without MFA proof
    // would be a privilege-escalation bypass of the existing high-privilege
    // MFA rule; it must be denied instead.
    await expect(f.callback()).rejects.toThrow();
  });

  it("after fix: dual approval revokes the pre-elevation session by canonical principal, and the fresh elevated session carries the canonical principal/membership (not a legacy/null identity)", async () => {
    const f = await fixture();
    const baseSession = await f.callback(f.delivery.token);

    const membershipId = (await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    ))!;
    const membership = (await f.repo.findMembershipById(membershipId))!;
    const baseDecoded = jwt.decode(baseSession.accessToken) as jwt.JwtPayload;

    // The base session already binds the canonical identity, not the
    // legacy tenant-user id, and a real membershipId.
    expect(baseDecoded.principalId).toBe(membership.principalId);
    expect(baseDecoded.principalId).not.toBe(f.user.userId);
    expect(baseDecoded.membershipId).toBe(membershipId);

    const requester = createGovernanceIdentity({ actorId: "usr_requester_canonical" });
    const approver = createGovernanceIdentity({ actorId: "usr_approver_canonical" });
    const request = await f.governance.createRequest(
      {
        // A real caller targets the canonical principal, exactly like the
        // identity the session above is now bound to.
        targetUserId: membership.principalId,
        targetMembershipId: membershipId,
        roleCode: "tenant_finance_admin",
        reason: "Quarter-end billing close requires temporary finance authority.",
        tenantId,
      },
      requester,
    );
    const { grant } = await f.governance.approveRequest(request.requestId, approver, {
      approvalRequestId: request.requestId,
      mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
    });
    expect(grant.status).toBe("active");

    // No manual revokeCurrentSession call: approval alone, keyed on the
    // canonical principal, must already have revoked the pre-elevation
    // session's token.
    expect(await f.signer.verifyAccessToken(baseSession.accessToken)).toBeNull();

    const elevatedSession = await f.callback();
    expect(elevatedSession.identity.roles).toEqual(["tenant_finance_admin"]);
    const elevatedDecoded = jwt.decode(elevatedSession.accessToken) as jwt.JwtPayload;
    expect(elevatedDecoded.principalId).toBe(membership.principalId);
    expect(elevatedDecoded.membershipId).toBe(membershipId);
  });

  it("a grant explicitly scoped to a different membership of the same principal never elevates this membership", async () => {
    const f = await fixture();
    await f.callback(f.delivery.token);
    const membershipId = (await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    ))!;
    const membership = (await f.repo.findMembershipById(membershipId))!;

    const now = new Date().toISOString();
    const otherMembershipId = "membership_review_other";
    await f.repo.ensureMembershipRecord({
      membershipId: otherMembershipId,
      sourceRef: "tenant_user_role:review_other:membership",
      principalId: membership.principalId,
      realm: "tenant",
      scopeRef: membership.scopeRef,
      tenantId,
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });

    const requester = createGovernanceIdentity({ actorId: "usr_requester_other_membership" });
    const approver = createGovernanceIdentity({ actorId: "usr_approver_other_membership" });
    const request = await f.governance.createRequest(
      {
        targetUserId: membership.principalId,
        // Explicitly scoped to the *other* membership (N), not this one (M).
        targetMembershipId: otherMembershipId,
        roleCode: "tenant_finance_admin",
        reason: "Finance authority scoped to a different membership only.",
        tenantId,
      },
      requester,
    );
    const { grant } = await f.governance.approveRequest(request.requestId, approver, {
      approvalRequestId: request.requestId,
      mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
    });
    expect(grant.targetMembershipId).toBe(otherMembershipId);

    const activeGrantsForThisMembership =
      await f.repo.findActivePrivilegedGrantsForMembership(membershipId);
    expect(activeGrantsForThisMembership).toHaveLength(0);

    const session = await f.callback();
    expect(session.identity.roles).toEqual(["tenant_viewer"]);
  });

  // R3-F4 (reviewer-reproduced): the canonical identity work above means a
  // real tenant_admin's *authenticated* identity carries actorId=legacy
  // TenantUserRole.userId while the governance request's targetUserId is,
  // for a real caller, the canonical principalId (exactly what the base
  // session above is bound to). An independent requester naming that
  // canonical principal as the target, followed by the target itself
  // approving with its own real (legacy-actorId) identity, must still be
  // rejected as Separation-of-Duties self-approval -- not admitted because
  // the two ids happen to be spelled differently for the same person.
  it("after fix: target approving its own request under its real (legacy actorId) identity is still rejected, even though the request names the canonical principal", async () => {
    const f = await fixture();

    async function realCallbackAs(targetEmail: string, invitationToken?: string) {
      const login = f.oidc.generateLoginParameters("tenant", {
        redirectUri: "https://tenant.example/api/auth/tenant/callback",
        tenantId,
        ...(invitationToken ? { invitationToken } : {}),
      });
      const state = f.oidc.verifyStateToken(login.stateToken)!;
      // All three real users here hold the durable tenant_admin role, which
      // requires trusted MFA proof on every login regardless of any grant.
      f.mockGoogle(
        f.sign(state.nonce, {
          sub: `google-user-${targetEmail}`,
          email: targetEmail,
          amr: ["mfa"],
          auth_time: Math.floor(Date.now() / 1000),
        }),
      );
      return f.oidc.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          code: "google-code",
          state: login.state,
          callbackUrl: state.redirectUri!,
        },
        { stateToken: login.stateToken },
      );
    }

    const targetEmail = "r3f4-target@example.org";
    const requesterEmail = "r3f4-requester@example.org";
    const approverEmail = "r3f4-approver@example.org";

    const target = await f.tenant.createTenantUser(tenantId, {
      email: targetEmail,
      displayName: "R3F4 Target",
      roleCode: "tenant_admin",
    });
    const targetInviteToken = f.delivery.token;
    await f.tenant.createTenantUser(tenantId, {
      email: requesterEmail,
      displayName: "R3F4 Requester",
      roleCode: "tenant_admin",
    });
    const requesterInviteToken = f.delivery.token;
    await f.tenant.createTenantUser(tenantId, {
      email: approverEmail,
      displayName: "R3F4 Genuine Approver",
      roleCode: "tenant_admin",
    });
    const approverInviteToken = f.delivery.token;

    // Three real, independent OIDC-authenticated identities, derived the
    // exact same way the production @CurrentIdentity() decorator does.
    const targetSession = await realCallbackAs(targetEmail, targetInviteToken);
    const targetPayload = await f.signer.verifyAccessToken(targetSession.accessToken);
    const targetIdentity = f.signer.toRequestIdentity(targetPayload!);

    const requesterSession = await realCallbackAs(requesterEmail, requesterInviteToken);
    const requesterPayload = await f.signer.verifyAccessToken(requesterSession.accessToken);
    const requesterIdentity = f.signer.toRequestIdentity(requesterPayload!);

    const approverSession = await realCallbackAs(approverEmail, approverInviteToken);
    const approverPayload = await f.signer.verifyAccessToken(approverSession.accessToken);
    const genuineApproverIdentity = f.signer.toRequestIdentity(approverPayload!);

    const targetMembershipId = await f.repo.findMembershipIdForLegacyTenantUser(
      target.userId,
    );
    expect(targetMembershipId).toBeTruthy();
    const targetMembership = await f.repo.findMembershipById(targetMembershipId!);
    expect(targetMembership).toBeTruthy();

    // actorId (legacy) and principalId (canonical) really are different
    // strings for the same real person here -- that is the whole bug.
    expect(targetIdentity.actorId).toBe(target.userId);
    expect(targetIdentity.principalId).toBe(targetMembership!.principalId);
    expect(targetIdentity.principalId).not.toBe(target.userId);

    const request = await f.governance.createRequest(
      {
        // A real independent requester names the target by canonical
        // principal, exactly like the session binding this task already
        // fixed for OIDC issuance.
        targetUserId: targetMembership!.principalId,
        targetMembershipId: targetMembershipId!,
        roleCode: "tenant_finance_admin",
        reason: "Independent request naming the canonical target principal.",
        tenantId,
      },
      requesterIdentity,
    );

    let selfApprovalError: unknown;
    try {
      await f.governance.approveRequest(request.requestId, targetIdentity, {
        approvalRequestId: request.requestId,
        mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
      });
    } catch (error) {
      selfApprovalError = error;
    }
    expect((selfApprovalError as { code?: string } | undefined)?.code).toBe(
      "IAM_SOD_VIOLATION",
    );

    // The request must still be pending and ungranted -- a rejected approve
    // call must not have left a usable grant behind.
    const stillPending = await f.governance.getRequest(request.requestId);
    expect(stillPending?.status).toBe("pending");
    const activeGrantsForTarget = await f.repo.findActivePrivilegedGrantsForMembership(
      targetMembershipId!,
    );
    expect(activeGrantsForTarget).toHaveLength(0);

    // The fix must not also break the legitimate case: a genuinely
    // independent real admin can still approve the very same request.
    const { grant } = await f.governance.approveRequest(
      request.requestId,
      genuineApproverIdentity,
      {
        approvalRequestId: request.requestId,
        mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
      },
    );
    expect(grant.status).toBe("active");
    expect(grant.roleCode).toBe("tenant_finance_admin");
  });

  // Same canonical-vs-legacy identity mismatch, exercised through
  // rejectRequest's parallel SoD check (identical bug pattern, lower
  // severity since it only wrongly *permits* a target/requester to reject
  // their own request rather than granting elevated authority).
  it("after fix: rejectRequest also recognizes the target by canonical principalId/membershipId, not only legacy actorId", async () => {
    const f = await fixture();
    const membershipId = (await f.repo.findMembershipIdForLegacyTenantUser(
      f.user.userId,
    ))!;
    const membership = (await f.repo.findMembershipById(membershipId))!;

    const requester = createGovernanceIdentity({ actorId: "usr_requester_reject_r3f4" });
    // The target's real identity would carry a different legacy actorId
    // from the membership/principal record, but the same canonical
    // principalId/membershipId -- constructed directly here (not via a
    // mocked rejectRequest/governance call; only the IdentityContext input
    // is hand-built, exactly like the suite's existing actorId-based
    // self-approval case above).
    const targetAsRejector = createGovernanceIdentity({
      actorId: "usr_target_distinct_legacy_actor_id",
      principalId: membership.principalId,
      membershipId,
    });

    const request = await f.governance.createRequest(
      {
        targetUserId: membership.principalId,
        targetMembershipId: membershipId,
        roleCode: "tenant_finance_admin",
        reason: "Independent request naming the canonical target principal.",
        tenantId,
      },
      requester,
    );

    let selfRejectError: unknown;
    try {
      await f.governance.rejectRequest(request.requestId, targetAsRejector, {
        approvalRequestId: request.requestId,
        mutation: { expectedVersion: request.version, reasonCode: "REJECT" },
      });
    } catch (error) {
      selfRejectError = error;
    }
    expect((selfRejectError as { code?: string } | undefined)?.code).toBe(
      "IAM_SOD_VIOLATION",
    );
  });
});
