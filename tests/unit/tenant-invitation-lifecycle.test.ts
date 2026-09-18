import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

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
});
