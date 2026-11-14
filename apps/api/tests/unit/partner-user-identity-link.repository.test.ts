import { describe, expect, it, vi } from "vitest";

// A type-only import: @drts/contracts' index.ts pulls in an unrelated module
// with a zod API call this VM's currently-installed zod version lacks
// (memory: shared node_modules missing zod@4.6.7, not a task regression, CI
// unaffected). A runtime import here would make this file fail to load for
// an environment reason unrelated to this task.
import type { PartnerUserIdentityConsentScope } from "@drts/contracts";

import { PartnerUserIdentityLinkRepository } from "../../src/modules/tenant-partner/partner-user-identity-link.repository";

describe("partner user identity link repository", () => {
  it("returns the same passenger for the same entrySlug and partnerUserRef", async () => {
    const repository = new PartnerUserIdentityLinkRepository();

    const first = await repository.resolveOrCreate({
      entrySlug: "referral-demo-community",
      partnerUserRef: "partner-user-001",
      now: "2026-06-13T10:00:00.000Z",
    });
    const second = await repository.resolveOrCreate({
      entrySlug: "referral-demo-community",
      partnerUserRef: "partner-user-001",
      now: "2026-06-13T10:05:00.000Z",
    });

    expect(second.drtsPassengerId).toBe(first.drtsPassengerId);
    expect(second.linkedAt).toBe(first.linkedAt);
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("creates a new passenger id for a new partner reference", async () => {
    const repository = new PartnerUserIdentityLinkRepository();

    const first = await repository.resolveOrCreate({
      entrySlug: "referral-demo-community",
      partnerUserRef: "partner-user-001",
      now: "2026-06-13T10:00:00.000Z",
    });
    const second = await repository.resolveOrCreate({
      entrySlug: "referral-demo-community",
      partnerUserRef: "partner-user-002",
      now: "2026-06-13T10:05:00.000Z",
    });

    expect(second.drtsPassengerId).not.toBe(first.drtsPassengerId);
    expect(second.drtsPassengerId).toMatch(/^passenger_/);
  });

  it("updates lastSeenAt without changing the passenger binding", async () => {
    const repository = new PartnerUserIdentityLinkRepository();

    const first = await repository.resolveOrCreate({
      entrySlug: "referral-demo-community",
      partnerUserRef: "partner-user-001",
      now: "2026-06-13T10:00:00.000Z",
    });
    const touched = await repository.touchLastSeen(
      "referral-demo-community",
      "partner-user-001",
      "2026-06-13T11:00:00.000Z",
    );

    expect(touched).not.toBeNull();
    expect(touched?.drtsPassengerId).toBe(first.drtsPassengerId);
    expect(touched?.lastSeenAt).toBe("2026-06-13T11:00:00.000Z");
    expect(
      await repository.status("referral-demo-community", "partner-user-001"),
    ).toBe("active");
  });

  it("uses a stable conflict key in the database-backed insert path", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          record: {
            entrySlug: "referral-demo-community",
            partnerUserRef: "partner-user-001",
            drtsPassengerId: "passenger_demo",
            status: "active",
            consentScope: "passenger_identity_link",
            linkedAt: "2026-06-13T10:00:00.000Z",
            lastSeenAt: "2026-06-13T10:00:00.000Z",
            createdAt: "2026-06-13T10:00:00.000Z",
            updatedAt: "2026-06-13T10:00:00.000Z",
          },
        },
      ],
    });
    const repository = new PartnerUserIdentityLinkRepository({
      isEnabled: () => true,
      query,
    } as never);

    await repository.resolveOrCreate({
      entrySlug: "referral-demo-community",
      partnerUserRef: "partner-user-001",
      now: "2026-06-13T10:00:00.000Z",
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ON CONFLICT (entry_slug, partner_user_ref) DO NOTHING",
      ),
      expect.arrayContaining(["referral-demo-community", "partner-user-001"]),
    );
  });

  // FLEET-ONB-002 SA/SD §2: createForInvitedPrincipal, unlike
  // resolveOrCreate, takes the already-created invited principal's id and
  // must never overwrite an existing (entrySlug, partnerUserRef) row.
  describe("createForInvitedPrincipal", () => {
    it("uses the caller-supplied drtsPassengerId, not a fresh random one", async () => {
      const repository = new PartnerUserIdentityLinkRepository();

      const created = await repository.createForInvitedPrincipal(
        "fleet-demo-001",
        "google-sub-staff-001",
        "principal_fleet_fixture_001",
        "2026-11-14T10:00:00.000Z",
      );

      expect(created).not.toBeNull();
      expect(created?.drtsPassengerId).toBe("principal_fleet_fixture_001");
      expect(created?.consentScope).toBe("fleet_staff_invitation");
      expect(created?.status).toBe("active");
      // Compile-time-only check that "fleet_staff_invitation" is part of the
      // PartnerUserIdentityConsentScope union added in packages/contracts/src/referral-channel.ts.
      const consentScope: PartnerUserIdentityConsentScope =
        "fleet_staff_invitation";
      expect(created?.consentScope).toBe(consentScope);
    });

    it("returns a conflict signal (null) on a second call for the same (entrySlug, partnerUserRef), without overwriting the existing row", async () => {
      const repository = new PartnerUserIdentityLinkRepository();

      const first = await repository.createForInvitedPrincipal(
        "fleet-demo-001",
        "google-sub-staff-001",
        "principal_fleet_fixture_001",
        "2026-11-14T10:00:00.000Z",
      );
      const conflict = await repository.createForInvitedPrincipal(
        "fleet-demo-001",
        "google-sub-staff-001",
        "principal_fleet_fixture_DIFFERENT",
        "2026-11-14T11:00:00.000Z",
      );

      expect(first?.drtsPassengerId).toBe("principal_fleet_fixture_001");
      expect(conflict).toBeNull();

      const stillOriginal = await repository.find(
        "fleet-demo-001",
        "google-sub-staff-001",
      );
      expect(stillOriginal?.drtsPassengerId).toBe(
        "principal_fleet_fixture_001",
      );
      expect(stillOriginal?.updatedAt).toBe("2026-11-14T10:00:00.000Z");
    });

    it("does not overwrite an existing link created by a prior referral handoff for the same key", async () => {
      const repository = new PartnerUserIdentityLinkRepository();

      const referralLink = await repository.resolveOrCreate({
        entrySlug: "fleet-demo-001",
        partnerUserRef: "google-sub-shared",
        now: "2026-11-14T09:00:00.000Z",
      });

      const conflict = await repository.createForInvitedPrincipal(
        "fleet-demo-001",
        "google-sub-shared",
        "principal_fleet_fixture_002",
        "2026-11-14T10:00:00.000Z",
      );

      expect(conflict).toBeNull();
      const stillReferral = await repository.find(
        "fleet-demo-001",
        "google-sub-shared",
      );
      expect(stillReferral?.drtsPassengerId).toBe(referralLink.drtsPassengerId);
      expect(stillReferral?.consentScope).toBe("passenger_identity_link");
    });

    it("issues the documented ON CONFLICT DO NOTHING insert against the database-backed path", async () => {
      const query = vi.fn().mockResolvedValue({
        rows: [
          {
            record: {
              entrySlug: "fleet-demo-001",
              partnerUserRef: "google-sub-staff-001",
              drtsPassengerId: "principal_fleet_fixture_001",
              status: "active",
              consentScope: "fleet_staff_invitation",
              linkedAt: "2026-11-14T10:00:00.000Z",
              lastSeenAt: "2026-11-14T10:00:00.000Z",
              createdAt: "2026-11-14T10:00:00.000Z",
              updatedAt: "2026-11-14T10:00:00.000Z",
            },
          },
        ],
      });
      const repository = new PartnerUserIdentityLinkRepository({
        isEnabled: () => true,
        query,
      } as never);

      const result = await repository.createForInvitedPrincipal(
        "fleet-demo-001",
        "google-sub-staff-001",
        "principal_fleet_fixture_001",
        "2026-11-14T10:00:00.000Z",
      );

      expect(result?.drtsPassengerId).toBe("principal_fleet_fixture_001");
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(
          "ON CONFLICT (entry_slug, partner_user_ref) DO NOTHING",
        ),
        expect.arrayContaining([
          "fleet-demo-001",
          "google-sub-staff-001",
          "principal_fleet_fixture_001",
        ]),
      );
    });

    it("surfaces the conflict signal against the database-backed path when the insert hits no row", async () => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      const repository = new PartnerUserIdentityLinkRepository({
        isEnabled: () => true,
        query,
      } as never);

      const result = await repository.createForInvitedPrincipal(
        "fleet-demo-001",
        "google-sub-staff-001",
        "principal_fleet_fixture_001",
        "2026-11-14T10:00:00.000Z",
      );

      expect(result).toBeNull();
    });
  });
});
