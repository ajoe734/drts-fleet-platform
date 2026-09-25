import { describe, expect, it } from "vitest";
import type { ReferralEmbedConsentBundle } from "@drts/contracts";
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
//
// Per the 2026-09-24 Codex re-review, the revoked/owner-changed cases must
// be genuine replays: grant consent successfully once (so a ledger entry
// really exists), change the link/entry state afterwards, and only then
// attempt the same handoffId+bundleVersion again — asserting the ledger and
// the handoff's persisted consent fields are byte-for-byte unchanged by the
// rejected replay. A second TenantPartnerService instance sharing the same
// ReferralEmbedHandoffRepository models the entry-attribute changes
// (tenant/partner reassignment, entry deactivation) because
// TenantPartnerService snapshots partnerEntries once in onModuleInit; the
// identity link, in contrast, is queried live on every call, so a single
// mutable linkRepo object is enough for the revoked-link case.
describe("SR-PARTNER-NOTIFY-NAV-20260917 consent replay guards (fallback repo)", () => {
  const buildEntry = (overrides: Record<string, unknown> = {}) => ({
    entrySlug: "demo-slug",
    status: "active",
    tenantId: "tenant-original",
    partnerId: "partner-original",
    activeFlag: true,
    authMode: "partner_api_key",
    ...overrides,
  });

  const buildService = (
    entryOverrides: Record<string, unknown>,
    linkRepo: { findByDrtsPassengerId: (entrySlug: string, drtsPassengerId: string) => Promise<{ status: string } | null> },
    handoffRepo: ReferralEmbedHandoffRepository,
  ) => {
    const tenantPartnerRepo = {
      loadState: async () => ({
        partnerEntries: [buildEntry(entryOverrides)],
      }),
    };
    const auditNotificationService = { recordAuditLog: () => {} };
    return new TenantPartnerService(
      auditNotificationService as any,
      tenantPartnerRepo as any,
      undefined,
      undefined,
      undefined,
      linkRepo as any,
      handoffRepo,
    );
  };

  const issueAndConsume = async (
    handoffRepo: ReferralEmbedHandoffRepository,
    overrides: { artifact: string; drtsPassengerId?: string } = { artifact: "artifact" },
  ) => {
    const handoff = await handoffRepo.issue({
      artifact: overrides.artifact,
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      partnerUserRef: "user-1",
      drtsPassengerId: overrides.drtsPassengerId ?? "pass-1",
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
      artifact: overrides.artifact,
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
    });
    expect(consumed.outcome).toBe("consumed");
    return handoff;
  };

  const consentBundle = (): ReferralEmbedConsentBundle => ({
    bundleVersion: "v1",
    grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
    grantedAt: new Date().toISOString(),
  });

  it("rejects a grant-consent replay once the partner user identity link is revoked, without rewriting the ledger", async () => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkStatus: { current: "active" | "revoked" } = { current: "active" };
    const linkRepo = {
      findByDrtsPassengerId: async () => ({ status: linkStatus.current }),
    };
    const service = buildService({}, linkRepo, handoffRepo);
    await service.onModuleInit();

    const handoff = await issueAndConsume(handoffRepo, { artifact: "artifact_revoked_link" });

    const granted = await service.recordReferralEmbedConsent({
      handoffId: handoff.handoffId,
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      currentDrtsPassengerId: "pass-1",
      currentPartnerEntrySlug: "demo-slug",
      consentBundle: consentBundle(),
    });
    expect(granted.identityActive).toBe(true);
    const ledgerAfterGrant = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
    expect(ledgerAfterGrant).not.toBeNull();

    linkStatus.current = "revoked";

    await expect(
      service.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: consentBundle(),
      }),
    ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_REVOKED" });

    const ledgerAfterReplay = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
    expect(ledgerAfterReplay).toEqual(ledgerAfterGrant);
  });

  it("rejects a grant-consent replay once the partner entry's tenant ownership has changed, without rewriting the ledger", async () => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkRepo = { findByDrtsPassengerId: async () => ({ status: "active" }) };
    const serviceAtGrantTime = buildService({}, linkRepo, handoffRepo);
    await serviceAtGrantTime.onModuleInit();

    const handoff = await issueAndConsume(handoffRepo, { artifact: "artifact_owner_changed" });

    const granted = await serviceAtGrantTime.recordReferralEmbedConsent({
      handoffId: handoff.handoffId,
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      currentDrtsPassengerId: "pass-1",
      currentPartnerEntrySlug: "demo-slug",
      consentBundle: consentBundle(),
    });
    expect(granted.identityActive).toBe(true);
    const ledgerAfterGrant = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
    expect(ledgerAfterGrant).not.toBeNull();

    // The entry's tenant ownership is reassigned after the grant. A fresh
    // service load (the real-world equivalent of the tenant-partner
    // directory being updated) must see the new owner.
    const serviceAfterReassignment = buildService(
      { tenantId: "tenant-reassigned" },
      linkRepo,
      handoffRepo,
    );
    await serviceAfterReassignment.onModuleInit();

    await expect(
      serviceAfterReassignment.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: consentBundle(),
      }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_MISMATCH" });

    const ledgerAfterReplay = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
    expect(ledgerAfterReplay).toEqual(ledgerAfterGrant);
  });

  it("rejects a grant-consent replay once the partner entry's partner ownership has changed, without rewriting the ledger", async () => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkRepo = { findByDrtsPassengerId: async () => ({ status: "active" }) };
    const serviceAtGrantTime = buildService({}, linkRepo, handoffRepo);
    await serviceAtGrantTime.onModuleInit();

    const handoff = await issueAndConsume(handoffRepo, {
      artifact: "artifact_partner_changed",
    });

    const granted = await serviceAtGrantTime.recordReferralEmbedConsent({
      handoffId: handoff.handoffId,
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      currentDrtsPassengerId: "pass-1",
      currentPartnerEntrySlug: "demo-slug",
      consentBundle: consentBundle(),
    });
    expect(granted.identityActive).toBe(true);
    const ledgerAfterGrant = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
    expect(ledgerAfterGrant).not.toBeNull();

    // Distinct from the tenant-reassignment case above: here the same
    // tenant keeps the entry, but it is handed to a different partner.
    const serviceAfterReassignment = buildService(
      { partnerId: "partner-reassigned" },
      linkRepo,
      handoffRepo,
    );
    await serviceAfterReassignment.onModuleInit();

    await expect(
      serviceAfterReassignment.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: consentBundle(),
      }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_MISMATCH" });

    const ledgerAfterReplay = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
    expect(ledgerAfterReplay).toEqual(ledgerAfterGrant);
  });

  it("rejects grant-consent when the partner entry has been deactivated since the handoff was issued, writing zero ledger entries", async () => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkRepo = { findByDrtsPassengerId: async () => ({ status: "active" }) };

    const handoff = await issueAndConsume(handoffRepo, {
      artifact: "artifact_inactive_entry",
    });

    const inactiveService = buildService(
      { activeFlag: false },
      linkRepo,
      handoffRepo,
    );
    await inactiveService.onModuleInit();

    await expect(
      inactiveService.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: consentBundle(),
      }),
    ).rejects.toMatchObject({ code: "PARTNER_ENTRY_INACTIVE" });

    const ledger = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
    expect(ledger).toBeNull();
  });

  it("rejects grant-consent for a handoff that has not been consumed yet, writing zero ledger entries", async () => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkRepo = { findByDrtsPassengerId: async () => ({ status: "active" }) };
    const service = buildService({}, linkRepo, handoffRepo);
    await service.onModuleInit();

    const handoff = await handoffRepo.issue({
      artifact: "artifact_not_consumed",
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
    // Deliberately skipped: handoffRepo.consume(...)

    await expect(
      service.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: consentBundle(),
      }),
    ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_NOT_CONSUMED" });

    const ledger = await handoffRepo.findLatestConsent("demo-slug", "pass-1");
    expect(ledger).toBeNull();
  });

  it("rejects the first-ever grant-consent attempt when the identity link was already revoked before any consent was granted, writing zero ledger entries", async () => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkRepo = {
      findByDrtsPassengerId: async () => ({ status: "revoked" as const }),
    };
    const service = buildService({}, linkRepo, handoffRepo);
    await service.onModuleInit();

    const handoff = await issueAndConsume(handoffRepo, {
      artifact: "artifact_revoked_before_first_grant",
    });

    // Sanity check: nothing has ever been granted for this passenger yet,
    // distinct from the "revoked after a real grant" case above where a
    // ledger row already exists by this point.
    expect(await handoffRepo.findLatestConsent("demo-slug", "pass-1")).toBeNull();

    await expect(
      service.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: consentBundle(),
      }),
    ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_REVOKED" });

    expect(await handoffRepo.findLatestConsent("demo-slug", "pass-1")).toBeNull();
  });

  it("rejects the first-ever grant-consent attempt when the entry's tenant ownership had already changed before any consent was granted, writing zero ledger entries", async () => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkRepo = { findByDrtsPassengerId: async () => ({ status: "active" }) };

    // The handoff is issued/consumed while the tenant-partner directory
    // already reflects the reassigned owner, modeling a directory update
    // that landed before the passenger ever completed consent.
    const handoff = await issueAndConsume(handoffRepo, {
      artifact: "artifact_owner_changed_before_first_grant",
    });
    const reassignedService = buildService(
      { tenantId: "tenant-reassigned" },
      linkRepo,
      handoffRepo,
    );
    await reassignedService.onModuleInit();

    expect(await handoffRepo.findLatestConsent("demo-slug", "pass-1")).toBeNull();

    await expect(
      reassignedService.recordReferralEmbedConsent({
        handoffId: handoff.handoffId,
        entrySlug: "demo-slug",
        entryHost: "demo-host.com",
        currentDrtsPassengerId: "pass-1",
        currentPartnerEntrySlug: "demo-slug",
        consentBundle: consentBundle(),
      }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_MISMATCH" });

    expect(await handoffRepo.findLatestConsent("demo-slug", "pass-1")).toBeNull();
  });

  it("allows grant-consent when the link is active and ownership is unchanged (positive control)", async () => {
    const handoffRepo = new ReferralEmbedHandoffRepository();
    const linkRepo = { findByDrtsPassengerId: async () => ({ status: "active" }) };
    const service = buildService({}, linkRepo, handoffRepo);
    await service.onModuleInit();

    const handoff = await issueAndConsume(handoffRepo, {
      artifact: "artifact_positive_control",
    });

    const session = await service.recordReferralEmbedConsent({
      handoffId: handoff.handoffId,
      entrySlug: "demo-slug",
      entryHost: "demo-host.com",
      currentDrtsPassengerId: "pass-1",
      currentPartnerEntrySlug: "demo-slug",
      consentBundle: consentBundle(),
    });
    expect(session.handoffId).toBe(handoff.handoffId);
    expect(session.identityActive).toBe(true);
  });
});
