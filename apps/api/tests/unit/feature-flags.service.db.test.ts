import { describe, expect, it, vi } from "vitest";

import type { FeatureFlag } from "@drts/contracts";

import { FeatureFlagRepository } from "../../src/modules/feature-flags/feature-flag.repository";
import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";

// Covers the DB-backed branch of FeatureFlagsService (getDb() === true). The
// in-memory branch is exercised by assistant.service.test.ts; the review noted
// the DB path was previously untested. Here the repository is faked so the
// service's delegation + per-realm merge logic is verified end to end.

const ASSIST = "ops.assistant.enabled";

function globalFlag(enabled: boolean): FeatureFlag {
  return {
    key: ASSIST,
    enabled,
    description: "Enable ops console LLM assistant",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}

function overrideFlag(tenantId: string, enabled: boolean): FeatureFlag {
  return {
    key: ASSIST,
    enabled,
    description: "Enable ops console LLM assistant",
    tenantId,
    updatedAt: "2026-06-02T01:00:00.000Z",
  };
}

function createService(repoOverrides: Partial<FeatureFlagRepository> = {}) {
  const repository = {
    isEnabled: () => true,
    findAll: vi.fn(),
    findByKey: vi.fn(),
    updateFlag: vi.fn(),
    upsertTenantOverride: vi.fn(),
    ...repoOverrides,
  } as unknown as FeatureFlagRepository;
  const service = new FeatureFlagsService(repository);
  return { service, repository };
}

describe("FeatureFlagsService DB branch", () => {
  it("resolves a realm to its override and other realms to the global default", async () => {
    const findByKey = vi.fn(async (_key: string, tenantId?: string) =>
      tenantId === "tenant-a"
        ? overrideFlag("tenant-a", true)
        : globalFlag(false),
    );
    const { service } = createService({ findByKey });

    // Global default off; only tenant-a is enabled via its override.
    await expect(service.isEnabled(ASSIST)).resolves.toBe(false);
    await expect(service.isEnabled(ASSIST, "tenant-a")).resolves.toBe(true);
    await expect(service.isEnabled(ASSIST, "tenant-b")).resolves.toBe(false);
    expect(findByKey).toHaveBeenCalledWith(ASSIST, "tenant-a");
  });

  it("getAll merges a per-realm override on top of the global registry", async () => {
    const findAll = vi.fn(async () => [
      globalFlag(false),
      overrideFlag("tenant-a", true),
    ]);
    const { service } = createService({ findAll });

    // For tenant-a the override shadows the global row (one entry, enabled).
    const tenantView = await service.getAll("tenant-a");
    const assist = tenantView.filter((f) => f.key === ASSIST);
    expect(assist).toHaveLength(1);
    expect(assist[0]).toMatchObject({ enabled: true, tenantId: "tenant-a" });

    // Global view excludes tenant overrides and keeps the default off.
    const globalView = await service.getAll();
    const globalAssist = globalView.filter((f) => f.key === ASSIST);
    expect(globalAssist).toHaveLength(1);
    expect(globalAssist[0]).toMatchObject({ enabled: false });
    expect(globalAssist[0]).not.toHaveProperty("tenantId");
  });

  it("delegates updateFlag and upsertTenantOverride to the repository", async () => {
    const updateFlag = vi.fn(async () => globalFlag(true));
    const upsertTenantOverride = vi.fn(async () =>
      overrideFlag("tenant-a", true),
    );
    // upsertTenantOverride looks up the global description first.
    const findByKey = vi.fn(async () => globalFlag(false));
    const { service } = createService({
      updateFlag,
      upsertTenantOverride,
      findByKey,
    });

    await service.updateFlag(ASSIST, true);
    expect(updateFlag).toHaveBeenCalledWith(ASSIST, true);

    await service.upsertTenantOverride(ASSIST, "tenant-a", true);
    expect(upsertTenantOverride).toHaveBeenCalledWith(
      ASSIST,
      "tenant-a",
      true,
      "Enable ops console LLM assistant",
    );
  });
});
