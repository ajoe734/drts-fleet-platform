import { describe, expect, it } from "vitest";
import { ReferralEmbedHandoffRepository } from "../../../../apps/api/src/modules/tenant-partner/referral-embed-handoff.repository";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// Regression coverage for the Codex P1 finding on
// SR-PARTNER-NOTIFY-NAV-20260917: a grant-consent replay must be rejected
// once the partner user identity link is revoked, or once the partner
// entry's tenant/partner ownership has changed since the handoff was
// issued — even when the caller supplies a handoffId that was genuinely
// issued and consumed for them. These run entirely against the in-memory
// fallback repository (no DATABASE_URL required) so they execute in the
// default unit test run rather than only in the PG-gated integration
// suite.
describe("SR-PARTNER-NOTIFY-NAV-20260917 consent replay guards (fallback repo)", () => {
  const buildService = (
    linkStatus: "active" | "revoked" | null,
    entryOverrides: Record<string, unknown> = {},
  ) => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkRepo = {
      findByDrtsPassengerId: async () =>
        linkStatus === null ? null : { status: linkStatus },
    };
    const tenantPartnerRepo = {
      loadState: async () => ({
        partnerEntries: [
          {
            entrySlug: "demo-slug",
            status: "active",
            tenantId: "tenant-original",
            partnerId: "partner-original",
            activeFlag: true,
            authMode: "partner_api_key",
            ...entryOverrides,
          },
        ],
      }),
    };
    const auditNotificationService = { recordTenantAudit: () => {} };
    const service = new TenantPartnerService(
      auditNotificationService as any,
      tenantPartnerRepo as any,
      undefined,
      undefined,
      undefined,
      linkRepo as any,
      handoffRepo,
    );
    return { service, handoffRepo };
  };

  it("rejects grant-consent replay once the partner user identity link is revoked", async () => {
    const { service, handoffRepo } = buildService("revoked");
    await service.onModuleInit();

    const handoff = await handoffRepo.issue({
      artifact: "artifact_revoked_link",
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      partnerUserRef: "user-1",
      drtsPassengerId: "pass-1",
      tenantId: "tenant-original",
      partnerId: "partner-original",
      partnerProgramId: null,
      consentRequired: true,
      consentBundleVersion: null,
      consentGrantedAt: null,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    const consumed = await handoffRepo.consume({
      artifact: "artifact_revoked_link",
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
    });
    expect(consumed.outcome).toBe("consumed");

    await expect(
      service.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: {
          bundleVersion: "v1",
          grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
          grantedAt: new Date().toISOString(),
        },
      }),
    ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_REVOKED" });
  });

  it("rejects grant-consent replay once the partner entry's tenant ownership has changed", async () => {
    const { service, handoffRepo } = buildService("active", {
      tenantId: "tenant-reassigned",
    });
    await service.onModuleInit();

    const handoff = await handoffRepo.issue({
      artifact: "artifact_owner_changed",
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      partnerUserRef: "user-1",
      drtsPassengerId: "pass-1",
      tenantId: "tenant-original",
      partnerId: "partner-original",
      partnerProgramId: null,
      consentRequired: true,
      consentBundleVersion: null,
      consentGrantedAt: null,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    const consumed = await handoffRepo.consume({
      artifact: "artifact_owner_changed",
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
    });
    expect(consumed.outcome).toBe("consumed");

    await expect(
      service.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: {
          bundleVersion: "v1",
          grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
          grantedAt: new Date().toISOString(),
        },
      }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_MISMATCH" });
  });

  it("allows grant-consent when the link is active and ownership is unchanged (positive control)", async () => {
    const { service, handoffRepo } = buildService("active");
    await service.onModuleInit();

    const handoff = await handoffRepo.issue({
      artifact: "artifact_positive_control",
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      partnerUserRef: "user-1",
      drtsPassengerId: "pass-1",
      tenantId: "tenant-original",
      partnerId: "partner-original",
      partnerProgramId: null,
      consentRequired: true,
      consentBundleVersion: null,
      consentGrantedAt: null,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    const consumed = await handoffRepo.consume({
      artifact: "artifact_positive_control",
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
    });
    expect(consumed.outcome).toBe("consumed");

    const session = await service.recordReferralEmbedConsent({
      handoffId: handoff.handoffId,
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      currentDrtsPassengerId: "pass-1",
      currentPartnerEntrySlug: "demo-slug",
      consentBundle: {
        bundleVersion: "v1",
        grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
        grantedAt: new Date().toISOString(),
      },
    });
    expect(session.handoffId).toBe(handoff.handoffId);
    expect(session.identityActive).toBe(true);
  });
});
