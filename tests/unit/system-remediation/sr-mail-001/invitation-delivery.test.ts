import { describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { TenantInvitationDeliveryService } from "../../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

export function fixture(delivery = new TenantInvitationDeliveryService(), identity = new IdentityRepository()) {
  const service = new TenantPartnerService(new AuditNotificationService(), undefined, undefined, undefined, undefined, undefined, undefined, identity, identity, delivery);
  return { service, identity, delivery };
}

describe("SR-MAIL-001 invitation delivery", () => {
  it("does not claim delivered without a configured transport", async () => {
    const { service, identity } = fixture();
    await service.createTenantUser("sr-mail-unavailable", {
      email: "unavailable@example.test", displayName: "Unavailable", roleCode: "tenant_viewer",
    });
    expect(identity.listInvitations()[0]?.deliveryStatus).toBe("delivery_failed");
  });
});
