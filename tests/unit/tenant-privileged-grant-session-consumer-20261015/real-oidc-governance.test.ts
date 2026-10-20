import { generateKeyPairSync } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { ControlledIdentityStorage } from "./controlled-identity-storage";
import { SecurityEventsRepository } from "../../../apps/api/src/modules/security-events/security-events.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const issuer = "https://accounts.google.com";
const clientId = "grant-real-caller.apps.googleusercontent.com";
const tenantId = "tenant-grant-real-caller";
class CaptureDelivery extends TenantInvitationDeliveryService {
  tokens = new Map<string, string>();
  override async send(request: TenantInvitationDeliveryRequest) {
    this.tokens.set(request.recipientEmail, request.rawToken);
    return super.send(request);
  }
}
async function fixture(
  targetRole: "tenant_viewer" | "tenant_admin" = "tenant_viewer",
) {
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
  let signer = new JwtAuthService(repo, tenant);
  let oidc = new OidcPkceService(
    signer,
    tenant,
    new SecurityEventsService(),
    undefined,
    undefined,
    repo,
  );
  let governance = new PrivilegedRoleGovernanceService(repo);
  const billing = new BillingSettlementService(new AuditNotificationService());
  async function addPerson(
    name: string,
    role: "tenant_admin" | "tenant_viewer",
  ) {
    const email = `${name}@grant.example.org`;
    const user = await tenant.createTenantUser(tenantId, {
      email,
      displayName: name,
      roleCode: role,
    });
    async function login(invitation = false) {
      const login = oidc.generateLoginParameters("tenant", {
        redirectUri: "https://tenant.example/api/auth/tenant/callback",
        tenantId,
        ...(invitation ? { invitationToken: delivery.tokens.get(email)! } : {}),
      });
      const state = oidc.verifyStateToken(login.stateToken)!;
      const idToken = jwt.sign(
        {
          sub: `google-${name}`,
          email,
          email_verified: true,
          nonce: state.nonce,
          amr: ["mfa"],
          auth_time: Math.floor(Date.now() / 1000),
        },
        key.privateKey,
        {
          algorithm: "RS256",
          keyid: "real-key",
          issuer,
          audience: clientId,
          expiresIn: "5m",
        },
      );
      // SIM boundary: Google token and JWKS transport only. All identity,
      // invitation, membership, grant, session and billing decisions are real.
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url.includes("/token")
            ? Response.json({ id_token: idToken })
            : Response.json({
                keys: [
                  {
                    ...key.publicKey.export({ format: "jwk" }),
                    kid: "real-key",
                    alg: "RS256",
                    use: "sig",
                  },
                ],
              }),
        ),
      );
      const session = await oidc.exchangeTenantCallbackSession(
        {
          provider: "oidc",
          code: `code-${name}`,
          state: login.state,
          callbackUrl: state.redirectUri!,
        },
        { stateToken: login.stateToken },
      );
      const payload = await signer.verifyAccessToken(session.accessToken);
      expect(payload).not.toBeNull();
      return {
        session,
        payload: payload!,
        identity: {
          ...signer.toRequestIdentity(payload!),
          supportedExecutionModes: session.identity.supportedExecutionModes,
        },
      };
    }
    const first = await login(true);
    // Existing pre-change public repository mirror read works on f845 too;
    // do not let a newly introduced helper manufacture a before failure.
    const membership = repo
      .listMemberships()
      .find(
        (m) => m.sourceRef === `tenant_user_role:${user.userId}:membership`,
      )!;
    expect(membership).toBeDefined();
    return { user, membership, first, login };
  }
  const requester = await addPerson("requester", "tenant_admin");
  const approver = await addPerson("approver", "tenant_admin");
  const target = await addPerson("target", targetRole);
  async function request(
    roleCode = "tenant_finance_admin",
    targetUserId = target.membership.principalId,
  ) {
    return governance.createRequest(
      {
        tenantId,
        targetUserId,
        targetMembershipId: target.membership.membershipId,
        roleCode,
        reason:
          "Temporary authority through the existing independent approval flow.",
      },
      requester.first.identity,
    );
  }
  async function useCanonicalStorage() {
    const storage = new ControlledIdentityStorage();
    storage.seed("iam.identity_principals", repo.listPrincipals());
    storage.seed("iam.identity_memberships", repo.listMemberships());
    storage.seed(
      "iam.identity_sessions",
      (
        await Promise.all(
          [requester, approver, target].map((person) =>
            repo.getSession(person.first.payload.sid!),
          ),
        )
      ).filter((row): row is NonNullable<typeof row> => row !== null),
    );
    const canonical = new IdentityRepository(storage.database);
    const requiredAudit = new SecurityEventsService(
      new SecurityEventsRepository(storage.database),
    );
    governance = new PrivilegedRoleGovernanceService(
      canonical,
      requiredAudit,
      storage.database,
    );
    signer = new JwtAuthService(canonical, tenant);
    oidc = new OidcPkceService(
      signer,
      tenant,
      new SecurityEventsService(),
      undefined,
      undefined,
      canonical,
    );
    return { storage, canonical };
  }
  return {
    repo,
    tenant,
    get signer() {
      return signer;
    },
    get governance() {
      return governance;
    },
    billing,
    requester,
    approver,
    target,
    request,
    useCanonicalStorage,
  };
}

beforeEach(() => {
  for (const [name, value] of Object.entries({
    DRTS_ENV: "development",
    OIDC_MOCK_MODE: "false",
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: clientId,
    TENANT_OIDC_ISSUER: "",
    TENANT_OIDC_AUDIENCE: "",
    JWT_SECRET: "test-session-secret-32-characters-long",
    JWT_ISSUER: "https://drts-session.example",
    AUTH_ALLOWED_ORIGINS: "https://tenant.example",
    DRTS_DEV_MFA_WAIVED: "false",
    AUTH_REQUIRE_ORDINARY_LOGIN_MFA: "false",
    STEP_UP_PROOF_SECRET: "test_configured_high_entropy_secret_key_32bytes",
  }))
    vi.stubEnv(name, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("real signed OIDC governance caller", () => {
  it("independent approval automatically revokes the old session and fresh durable verification drives billing readback", async () => {
    const f = await fixture();
    expect(() =>
      authorizeInvoiceTenant(
        f.target.first.identity,
        tenantId,
        "tenant:billing:write",
      ),
    ).toThrow();
    const now = new Date().toISOString();
    const familyId = `refresh_${f.target.first.payload.sid}`;
    await f.repo.createRefreshFamily({
      familyId,
      sourceRef: familyId,
      sessionId: f.target.first.payload.sid!,
      currentTokenHash: "a".repeat(64),
      counter: 0,
      status: "active",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      compromisedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const request = await f.request();
    const { grant } = await f.governance.approveRequest(
      request.requestId,
      f.approver.first.identity,
      {
        approvalRequestId: request.requestId,
        mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
      },
    );
    expect(grant.status).toBe("active");
    expect(await f.repo.getRefreshFamily(familyId)).toMatchObject({
      status: "revoked",
      sessionId: f.target.first.payload.sid,
    });
    expect(
      await f.signer.verifyAccessToken(f.target.first.session.accessToken),
    ).toBeNull();
    const fresh = await f.target.login();
    expect(fresh.payload.principalId).toBe(f.target.membership.principalId);
    expect(fresh.payload.membershipId).toBe(f.target.membership.membershipId);
    expect(fresh.payload.tenantPrivilegedGrantId).toBe(grant.grantId);
    const durableVerifier = new JwtAuthService(f.repo, f.tenant);
    const verified = await durableVerifier.verifyAccessToken(
      fresh.session.accessToken,
    );
    expect(verified).not.toBeNull();
    const authorizedTenant = authorizeInvoiceTenant(
      durableVerifier.toRequestIdentity(verified!),
      tenantId,
      "tenant:billing:write",
    );
    await f.billing.updateTenantBillingProfile(authorizedTenant, {
      invoiceTitle: "Real independent grant",
      email: "finance@grant.example.org",
    });
    expect(f.billing.getTenantBillingProfile(tenantId)).toMatchObject({
      invoiceTitle: "Real independent grant",
      email: "finance@grant.example.org",
    });
    expect(
      (
        await f.tenant.findTenantUserForAuthentication(
          tenantId,
          f.target.user.userId,
        )
      )?.roleCode,
    ).toBe("tenant_viewer");
  });

  it.each(["tenant_finance_admin", "tenant_security_admin"])(
    "canonical target cannot approve its own %s grant using its legacy actorId",
    async (role) => {
      const f = await fixture("tenant_admin");
      expect(f.target.first.identity.actorId).toBe(f.target.user.userId);
      expect(f.target.first.identity.actorId).not.toBe(
        f.target.membership.principalId,
      );
      const request = await f.request(role);
      let failure: unknown;
      try {
        const wronglyApproved = await f.governance.approveRequest(
          request.requestId,
          f.target.first.identity,
          {
            approvalRequestId: request.requestId,
            mutation: {
              expectedVersion: request.version,
              reasonCode: "APPROVE",
            },
          },
        );
        const elevated = await f.target.login();
        let commandReadback: string | null = null;
        if (role === "tenant_finance_admin") {
          const authorized = authorizeInvoiceTenant(
            elevated.identity,
            tenantId,
            "tenant:billing:write",
          );
          await f.billing.updateTenantBillingProfile(authorized, {
            invoiceTitle: "SELF APPROVAL REPRODUCTION",
            email: "self@grant.example.org",
          });
          commandReadback =
            f.billing.getTenantBillingProfile(tenantId).invoiceTitle;
        }
        console.info(
          "R3F4_OBSERVATION",
          JSON.stringify({
            grantStatus: wronglyApproved.grant.status,
            role,
            consumedGrant:
              elevated.payload.tenantPrivilegedGrantId ===
              wronglyApproved.grant.grantId,
            commandReadback,
          }),
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: "IAM_SOD_VIOLATION", status: 403 });
      expect(await f.repo.listPrivilegedRoleGrants(tenantId)).toEqual([]);
      expect(
        (await f.repo.getPrivilegedRoleRequest(request.requestId))?.status,
      ).toBe("pending");
      const fresh = await f.target.login();
      expect(fresh.payload.tenantPrivilegedGrantId).toBeFalsy();
    },
  );
  it("canonical requester and explicit target membership cannot approve themselves, while an independent approver can", async () => {
    const f = await fixture();
    const request = await f.request();
    expect(request.requesterPrincipalId).toBe(
      f.requester.membership.principalId,
    );
    await expect(
      f.governance.approveRequest(
        request.requestId,
        f.requester.first.identity,
        {
          approvalRequestId: request.requestId,
          mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
        },
      ),
    ).rejects.toMatchObject({ code: "IAM_SOD_VIOLATION" });
    const membershipTarget = await f.governance.createRequest(
      {
        tenantId,
        targetUserId: f.target.membership.principalId,
        targetMembershipId: f.approver.membership.membershipId,
        roleCode: "tenant_finance_admin",
        reason: "Explicit membership identifies the actual recipient.",
      },
      f.requester.first.identity,
    );
    await expect(
      f.governance.approveRequest(
        membershipTarget.requestId,
        f.approver.first.identity,
        {
          approvalRequestId: membershipTarget.requestId,
          mutation: {
            expectedVersion: membershipTarget.version,
            reasonCode: "APPROVE",
          },
        },
      ),
    ).rejects.toMatchObject({ code: "IAM_SOD_VIOLATION" });
    expect(await f.repo.listPrivilegedRoleGrants(tenantId)).toEqual([]);
    const approved = await f.governance.approveRequest(
      request.requestId,
      f.approver.first.identity,
      {
        approvalRequestId: request.requestId,
        mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
      },
    );
    expect(approved.grant.grantedByPrincipalId).toBe(
      f.approver.membership.principalId,
    );
    expect((await f.target.login()).payload.tenantPrivilegedGrantId).toBe(
      approved.grant.grantId,
    );
  });

  it("an existing legacy requester record still denies the same signed requester", async () => {
    const f = await fixture();
    const request = await f.request();
    await f.repo.savePrivilegedRoleRequest({
      ...request,
      requesterPrincipalId: f.requester.user.userId,
    });
    const restored = new PrivilegedRoleGovernanceService(f.repo);
    await expect(
      restored.approveRequest(request.requestId, f.requester.first.identity, {
        approvalRequestId: request.requestId,
        mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
      }),
    ).rejects.toMatchObject({ code: "IAM_SOD_VIOLATION" });
    expect(await f.repo.listPrivilegedRoleGrants(tenantId)).toEqual([]);
  });

  it.each(["grant-write", "required-audit"] as const)(
    "real SQL %s rejection rolls back the grant and fresh login; retry recovers",
    async (fault) => {
      const f = await fixture();
      const { storage, canonical } = await f.useCanonicalStorage();
      const request = await f.request();
      storage.fault = fault;
      await expect(
        f.governance.approveRequest(
          request.requestId,
          f.approver.first.identity,
          {
            approvalRequestId: request.requestId,
            mutation: {
              expectedVersion: request.version,
              reasonCode: "APPROVE",
            },
          },
        ),
      ).rejects.toThrow(
        fault === "grant-write"
          ? "SIM_STORAGE_GRANT_WRITE_REJECTED"
          : "SIM_REQUIRED_AUDIT_REJECTED",
      );
      expect(storage.calls).toContain("ROLLBACK");
      const freshRepo = new IdentityRepository(storage.database);
      expect(await freshRepo.listPrivilegedRoleGrants(tenantId)).toEqual([]);
      expect(
        (await freshRepo.getPrivilegedRoleRequest(request.requestId))?.status,
      ).toBe("pending");
      expect(
        await f.signer.verifyAccessToken(f.target.first.session.accessToken),
      ).not.toBeNull();
      expect((await f.target.login()).payload.roles).toEqual(["tenant_viewer"]);
      storage.fault = null;
      const approved = await f.governance.approveRequest(
        request.requestId,
        f.approver.first.identity,
        {
          approvalRequestId: request.requestId,
          mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
        },
      );
      expect(
        storage.calls.filter((call) => call === "COMMIT").length,
      ).toBeGreaterThanOrEqual(2);
      const fresh = await f.target.login();
      const restoredVerifier = new JwtAuthService(
        new IdentityRepository(storage.database),
        f.tenant,
      );
      const verified = await restoredVerifier.verifyAccessToken(
        fresh.session.accessToken,
      );
      expect(verified?.tenantPrivilegedGrantId).toBe(approved.grant.grantId);
      expect(
        await canonical.getSession(f.target.first.payload.sid!),
      ).toMatchObject({
        status: "revoked",
        revokeReason: "PRIVILEGED_ROLE_APPROVED",
      });
      const authorized = authorizeInvoiceTenant(
        restoredVerifier.toRequestIdentity(verified!),
        tenantId,
        "tenant:billing:write",
      );
      await f.billing.updateTenantBillingProfile(authorized, {
        invoiceTitle: "SQL ACK retry",
        email: "sql@grant.example.org",
      });
      expect(f.billing.getTenantBillingProfile(tenantId).invoiceTitle).toBe(
        "SQL ACK retry",
      );
    },
  );
  it("existing incompatible-role rules follow the same actual target across canonical and legacy names", async () => {
    const f = await fixture();
    const request = await f.request();
    await f.governance.approveRequest(
      request.requestId,
      f.approver.first.identity,
      {
        approvalRequestId: request.requestId,
        mutation: { expectedVersion: request.version, reasonCode: "APPROVE" },
      },
    );
    await expect(
      f.request("tenant_security_admin", f.target.user.userId),
    ).rejects.toMatchObject({ code: "IAM_SOD_VIOLATION" });
    expect(await f.repo.listPrivilegedRoleGrants(tenantId)).toHaveLength(1);
  });
});
