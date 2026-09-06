import { describe, expect, it } from "vitest";

import { ReferralEmbedHandoffRepository } from "../../../../apps/api/src/modules/tenant-partner/referral-embed-handoff.repository";

// SR-REFERRAL-001 (R07 / C020): "合法測試issuer產生的token能到叫車；過期/錯host/
// 重放拒絕" — a legitimately issued single-use referral embed handoff artifact
// must resolve to a bookable session, while an expired artifact, a wrong-host
// replay attempt, and a same-host replay attempt must each be explicitly
// rejected rather than silently succeeding or falling through to a generic
// error. This repository (no DatabaseService configured, so it exercises the
// in-memory fallback store used whenever Postgres isn't wired up) is the
// authority for that decision — exercised directly against the real class, no
// fixtures standing in for the outcome.
describe("SR-REFERRAL-001: referral embed handoff artifact lifecycle", () => {
  function issuedCommand(overrides: Partial<Parameters<
    ReferralEmbedHandoffRepository["issue"]
  >[0]> = {}) {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 120_000);
    return {
      artifact: "test-issuer-artifact-001",
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
      partnerUserRef: "resident-001",
      drtsPassengerId: "referral-yuhe-resident-001",
      tenantId: "tenant-yuhe",
      partnerId: "partner-yuhe",
      partnerProgramId: "program-referral-community",
      consentRequired: false,
      consentBundleVersion: null,
      consentGrantedAt: null,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ...overrides,
    };
  }

  it("runs in in-memory fallback mode when no DatabaseService is configured", () => {
    const repository = new ReferralEmbedHandoffRepository();
    expect(repository.isEnabled()).toBe(false);
  });

  it("consumes a legitimately issued artifact into a bookable session", async () => {
    const repository = new ReferralEmbedHandoffRepository();
    const record = await repository.issue(issuedCommand());

    const result = await repository.consume({
      artifact: "test-issuer-artifact-001",
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
    });

    expect(result.outcome).toBe("consumed");
    if (result.outcome === "consumed") {
      expect(result.session.handoffId).toBe(record.handoffId);
      expect(result.session.partnerEntrySlug).toBe("yuhe-residence");
      expect(result.session.entryHost).toBe("app.yuhe-living.com.tw");
      expect(result.session.drtsPassengerId).toBe(
        "referral-yuhe-resident-001",
      );
      expect(result.session.identityActive).toBe(true);
    }
  });

  it("rejects replay of an already-consumed artifact", async () => {
    const repository = new ReferralEmbedHandoffRepository();
    await repository.issue(issuedCommand());

    const first = await repository.consume({
      artifact: "test-issuer-artifact-001",
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
    });
    expect(first.outcome).toBe("consumed");

    const replay = await repository.consume({
      artifact: "test-issuer-artifact-001",
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
    });
    expect(replay.outcome).toBe("replayed");
  });

  it("rejects consumption from a host other than the one the artifact was issued for", async () => {
    const repository = new ReferralEmbedHandoffRepository();
    await repository.issue(issuedCommand());

    const result = await repository.consume({
      artifact: "test-issuer-artifact-001",
      entrySlug: "yuhe-residence",
      entryHost: "attacker.example",
    });

    expect(result.outcome).toBe("wrong_host");
  });

  it("rejects an expired artifact", async () => {
    const repository = new ReferralEmbedHandoffRepository();
    const issuedAt = new Date(Date.now() - 10 * 60_000);
    const expiresAt = new Date(issuedAt.getTime() + 120_000);
    await repository.issue(
      issuedCommand({
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }),
    );

    const result = await repository.consume({
      artifact: "test-issuer-artifact-001",
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
    });

    expect(result.outcome).toBe("expired");
  });

  it("reports missing for an artifact that was never issued", async () => {
    const repository = new ReferralEmbedHandoffRepository();

    const result = await repository.consume({
      artifact: "never-issued",
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
    });

    expect(result.outcome).toBe("missing");
  });
});
