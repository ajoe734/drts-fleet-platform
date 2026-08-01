import { describe, expect, it, vi } from "vitest";

import { ReferralEmbedHandoffRepository } from "../../src/modules/tenant-partner/referral-embed-handoff.repository";

function buildRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    handoffId: "ref_handoff_001",
    artifactHash: "hash-001",
    entrySlug: "yuhe-residence",
    entryHost: "app.yuhe-living.com.tw",
    partnerUserRef: "resident-001",
    drtsPassengerId: "passenger_001",
    tenantId: "tenant-demo-001",
    partnerId: "partner-demo-001",
    partnerProgramId: "program-demo-001",
    consentRequired: true,
    consentBundleVersion: null,
    consentGrantedAt: null,
    issuedAt: "2026-08-01T10:00:00.000Z",
    expiresAt: "2099-08-01T10:02:00.000Z",
    consumedAt: null,
    ...overrides,
  };
}

describe("ReferralEmbedHandoffRepository", () => {
  it("atomically consumes a database-backed handoff artifact", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") {
        return { rows: [] };
      }
      if (sql.includes("UPDATE admin.phase1_referral_embed_handoffs")) {
        return { rows: [{ record: buildRecord({ consumedAt: "2026-08-01T10:00:10.000Z" }) }] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new ReferralEmbedHandoffRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.consume({
      artifact: "opaque-artifact",
      entrySlug: "yuhe-residence",
      entryHost: "app.yuhe-living.com.tw",
    });

    expect(result).toMatchObject({
      outcome: "consumed",
      session: {
        handoffId: "ref_handoff_001",
        partnerEntrySlug: "yuhe-residence",
        entryHost: "app.yuhe-living.com.tw",
        identityActive: false,
      },
    });
    expect(query.mock.calls[1]?.[0]).toContain("consumed_at = COALESCE");
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns replayed when the artifact was already consumed", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") {
        return { rows: [] };
      }
      if (sql.includes("UPDATE admin.phase1_referral_embed_handoffs")) {
        return { rows: [] };
      }
      if (sql.includes("WHERE artifact_hash = $1")) {
        return {
          rows: [{ record: buildRecord({ consumedAt: "2026-08-01T10:00:15.000Z" }) }],
        };
      }
      return { rows: [] };
    });
    const repository = new ReferralEmbedHandoffRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
    } as never);

    await expect(
      repository.consume({
        artifact: "opaque-artifact",
        entrySlug: "yuhe-residence",
        entryHost: "app.yuhe-living.com.tw",
      }),
    ).resolves.toEqual({ outcome: "replayed" });
  });

  it("returns expired when the artifact is found after its expiry window", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") {
        return { rows: [] };
      }
      if (sql.includes("UPDATE admin.phase1_referral_embed_handoffs")) {
        return { rows: [] };
      }
      if (sql.includes("WHERE artifact_hash = $1")) {
        return {
          rows: [{ record: buildRecord({ expiresAt: "2026-07-01T10:00:00.000Z" }) }],
        };
      }
      return { rows: [] };
    });
    const repository = new ReferralEmbedHandoffRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
    } as never);

    await expect(
      repository.consume({
        artifact: "opaque-artifact",
        entrySlug: "yuhe-residence",
        entryHost: "app.yuhe-living.com.tw",
      }),
    ).resolves.toEqual({ outcome: "expired" });
  });

  it("returns wrong_host when the artifact is replayed against another host", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") {
        return { rows: [] };
      }
      if (sql.includes("UPDATE admin.phase1_referral_embed_handoffs")) {
        return { rows: [] };
      }
      if (sql.includes("WHERE artifact_hash = $1")) {
        return {
          rows: [{ record: buildRecord({ entryHost: "app.yuhe-living.com.tw" }) }],
        };
      }
      return { rows: [] };
    });
    const repository = new ReferralEmbedHandoffRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
    } as never);

    await expect(
      repository.consume({
        artifact: "opaque-artifact",
        entrySlug: "yuhe-residence",
        entryHost: "evil.example",
      }),
    ).resolves.toEqual({ outcome: "wrong_host" });
  });
});
