import { describe, expect, it, vi } from "vitest";

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
});
