import { describe, expect, it } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

// FLEET-ONB-001: PARTNER_ENTRY_SEED previously had no partnerType:
// "fleet_partner" row, so exchangePartnerCallbackSession's
// listPartnerEntries(entrySlug) lookup (oidc-pkce.service.ts) could never
// resolve a fleet entry and always denied with PARTNER_ENTRY_NOT_FOUND. The
// new seed entry's entrySlug/partnerId are both set to the
// DRTS_FLEET_PARTNER_ID value ("fleet-demo-001", matching
// FLEET_PARTNER_SEED's fleetPartnerId in fleet-partner.service.ts and the
// deploy-dev.yml env var), so the `e.entrySlug === entrySlug || e.partnerId
// === entrySlug` comparison in that lookup matches on either form.
describe("TenantPartnerService fleet partner entry seed", () => {
  it("resolves an active fleet_partner entry for the DRTS_FLEET_PARTNER_ID value", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const [entry] = service.listPartnerEntries("fleet-demo-001");

    expect(entry).toMatchObject({
      partnerId: "fleet-demo-001",
      entrySlug: "fleet-demo-001",
      partnerType: "fleet_partner",
      status: "active",
      activeFlag: true,
    });
  });

  it("matches via the partnerId comparison branch as well as entrySlug", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const byEntrySlug = service.getPartnerEntry("fleet-demo-001");
    const [byPartnerId] = service
      .listPlatformPartnerEntries()
      .filter((candidate) => candidate.partnerId === "fleet-demo-001");

    expect(byEntrySlug.entrySlug).toBe("fleet-demo-001");
    expect(byPartnerId.entrySlug).toBe("fleet-demo-001");
    expect(byPartnerId.partnerId).toBe("fleet-demo-001");
  });

  it("does not resolve the fleet entry for an unrelated slug supplied by a caller", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    expect(service.listPartnerEntries("some-other-entry-slug")).toEqual([]);
  });
});
