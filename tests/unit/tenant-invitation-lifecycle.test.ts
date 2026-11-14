import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// PWD-LOGIN-004's password-branch acceptance hashes with
// PasswordHashingService, which fails closed (Stage 1.5 §15.2) unless a
// pepper is configured. These are test-only values, not a real secret.
const PRIOR_PEPPER_SECRETS_JSON = process.env.PASSWORD_PEPPER_SECRETS_JSON;
const PRIOR_PEPPER_CURRENT_VERSION = process.env.PASSWORD_PEPPER_CURRENT_VERSION;

beforeAll(() => {
  process.env.PASSWORD_PEPPER_SECRETS_JSON = JSON.stringify({
    v1: "tenant-invitation-lifecycle-test-pepper-32chars!",
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

class CapturingInvitationDelivery extends TenantInvitationDeliveryService {
  readonly tokens = new Map<string, string>();

  override async send(request: TenantInvitationDeliveryRequest) {
    this.tokens.set(request.invitationId, request.rawToken);
    return super.send(request);
  }
}

function createFixture() {
  const identityRepository = new IdentityRepository();
  const delivery = new CapturingInvitationDelivery();
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    identityRepository,
    identityRepository,
    delivery,
  );
  return { delivery, identityRepository, service };
}

describe("tenant invitation lifecycle", () => {
  it("keeps raw proof out of API and persistence, then accepts it exactly once", async () => {
    const { delivery, identityRepository, service } = createFixture();
    const created = await service.createTenantUser("tenant-invite-test", {
      email: "joiner@example.com",
      displayName: "Joiner",
      roleCode: "tenant_viewer",
    });

    const invitation = identityRepository.listInvitations()[0];
    expect(invitation).toBeDefined();
    const rawToken = delivery.tokens.get(invitation!.invitationId);
    expect(rawToken).toMatch(/^ti_/);
    expect(JSON.stringify(created)).not.toContain(rawToken!);
    expect(JSON.stringify(invitation)).not.toContain(rawToken!);
    expect(delivery.listDeliveries()[0]).not.toHaveProperty("rawToken");

    const accepted = await service.acceptTenantInvitation({
      invitationToken: rawToken!,
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.user.status).toBe("active");
    expect(accepted.invitation).not.toHaveProperty("tokenHash");
    expect(identityRepository.listInvitations()[0]?.acceptedAt).not.toBeNull();
    expect(identityRepository.listMemberships()[0]?.status).toBe("active");

    await expect(
      service.acceptTenantInvitation({ invitationToken: rawToken! }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("invalidates the previous proof when an invitation is resent", async () => {
    const { delivery, identityRepository, service } = createFixture();
    const created = await service.createTenantUser("tenant-resend-test", {
      email: "resend@example.com",
      displayName: "Resend",
      roleCode: "tenant_viewer",
    });
    const firstInvitation = identityRepository.listInvitations()[0]!;
    const firstToken = delivery.tokens.get(firstInvitation.invitationId)!;

    const resent = await service.resendTenantInvitation(
      "tenant-resend-test",
      created.userId,
    );
    const secondToken = delivery.tokens.get(resent.invitationId)!;
    expect(secondToken).not.toBe(firstToken);
    expect(identityRepository.listInvitations()).toHaveLength(2);

    await expect(
      service.acceptTenantInvitation({ invitationToken: firstToken }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    await expect(
      service.acceptTenantInvitation({ invitationToken: secondToken }),
    ).resolves.toMatchObject({ accepted: true });
  });

  it("accepts the password branch exactly once without overwriting issuer/subject", async () => {
    const { delivery, identityRepository, service } = createFixture();
    await service.createTenantUser("tenant-pwd-test", {
      email: "pwd-joiner@example.com",
      displayName: "Password Joiner",
      roleCode: "tenant_viewer",
    });

    const invitation = identityRepository.listInvitations()[0]!;
    const rawToken = delivery.tokens.get(invitation.invitationId)!;
    const principalBefore = identityRepository.listPrincipals()[0]!;
    expect(principalBefore.status).toBe("invited");

    const activatedUser = await service.acceptTenantInvitationWithPassword({
      invitationToken: rawToken,
      password: "correct horse battery staple",
    });
    expect(activatedUser.status).toBe("active");

    const principalAfter = identityRepository.listPrincipals()[0]!;
    // The password branch must never touch (issuer, subject): that unique
    // constraint belongs to external IdP identity, not a password (SA/SD §1).
    expect(principalAfter.issuer).toBe(principalBefore.issuer);
    expect(principalAfter.subject).toBe(principalBefore.subject);
    expect(principalAfter.status).toBe("active");

    const credential = await identityRepository.findPasswordCredentialByPrincipalId(
      principalAfter.principalId,
    );
    expect(credential).toMatchObject({ principalId: principalAfter.principalId });
    expect(credential?.passwordHash).toBeTruthy();
    expect(credential?.passwordHash).not.toContain(
      "correct horse battery staple",
    );
    expect(identityRepository.listMemberships()[0]?.status).toBe("active");
    expect(identityRepository.listInvitations()[0]?.acceptedAt).not.toBeNull();

    await expect(
      service.acceptTenantInvitationWithPassword({
        invitationToken: rawToken,
        password: "a-different-password",
      }),
    ).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("lets only one of a racing password branch and Google branch consume the same token", async () => {
    const { delivery, identityRepository, service } = createFixture();
    await service.createTenantUser("tenant-race-test", {
      email: "racer@example.com",
      displayName: "Racer",
      roleCode: "tenant_viewer",
    });

    const invitation = identityRepository.listInvitations()[0]!;
    const rawToken = delivery.tokens.get(invitation.invitationId)!;
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const results = await Promise.allSettled([
      service.acceptTenantInvitationWithPassword({
        invitationToken: rawToken,
        password: "racer-password-value",
      }),
      service.acceptTenantOidcInvitation(tokenHash, {
        issuer: "https://accounts.google.com",
        subject: "racer-google-sub",
        email: "racer@example.com",
        tenantId: "tenant-race-test",
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ApiRequestError,
    );

    // Exactly one invitation acceptance happened, regardless of which branch won.
    expect(identityRepository.listInvitations()[0]?.acceptedAt).not.toBeNull();
    const principal = identityRepository.listPrincipals()[0]!;
    expect(principal.status).toBe("active");
    const credential = await identityRepository.findPasswordCredentialByPrincipalId(
      principal.principalId,
    );
    const wonByPassword = (fulfilled[0] as PromiseFulfilledResult<unknown>)
      .value as { subjectId?: string } | undefined;
    if (credential) {
      // Password branch won: issuer/subject stay untouched.
      expect(principal.subject).not.toBe("racer-google-sub");
    } else {
      // Google branch won: no password credential was ever written.
      expect(wonByPassword?.subjectId).toBe("racer-google-sub");
    }
  });
});
