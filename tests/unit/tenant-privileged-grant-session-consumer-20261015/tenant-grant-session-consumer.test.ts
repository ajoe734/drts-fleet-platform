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
});
