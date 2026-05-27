import { describe, expect, it, vi } from "vitest";

import type { FeatureFlag } from "@drts/contracts";

import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";
import type { FeatureFlagRepository } from "../../src/modules/feature-flags/feature-flag.repository";

function createRepository(flags: FeatureFlag[]) {
  return {
    isEnabled: vi.fn(() => true),
    findAll: vi.fn(async () => flags),
  } as unknown as Pick<FeatureFlagRepository, "isEnabled" | "findAll">;
}

describe("feature flags service ops summary", () => {
  it("includes tenant overrides in ops scope and marks divergent keys as partial", async () => {
    const repository = createRepository([
      {
        key: "ops-console.reports",
        enabled: true,
        description: "Enable ops reports",
        updatedAt: "2026-05-27T10:00:00.000Z",
      },
      {
        key: "ops-console.reports",
        enabled: false,
        description: "Disable ops reports for tenant-a",
        tenantId: "tenant-a",
        updatedAt: "2026-05-27T11:00:00.000Z",
      },
      {
        key: "driver-app.shift",
        enabled: false,
        description: "Enable driver app shift/attendance tracking",
        updatedAt: "2026-05-27T09:00:00.000Z",
      },
    ]);
    const service = new FeatureFlagsService(
      repository as FeatureFlagRepository,
    );

    const response = await service.getOpsSummary();
    const reportRows = response.items.filter(
      (item) => item.key === "ops-console.reports",
    );

    expect(reportRows).toHaveLength(2);
    expect(reportRows.map((item) => item.scope)).toEqual(["global", "tenant"]);
    expect(reportRows.every((item) => item.rolloutState === "partial")).toBe(
      true,
    );
    expect(reportRows[0]?.rolloutSummary).toContain("tenant override");
    expect(reportRows[1]?.historyLink?.route).toContain("tenantId=tenant-a");
  });

  it("filters to the requested tenant while preserving partial-state context", async () => {
    const repository = createRepository([
      {
        key: "tenant-portal.billing",
        enabled: true,
        description: "Enable tenant portal billing views",
        updatedAt: "2026-05-27T10:00:00.000Z",
      },
      {
        key: "tenant-portal.billing",
        enabled: false,
        description: "Disable billing for tenant-z",
        tenantId: "tenant-z",
        updatedAt: "2026-05-27T11:30:00.000Z",
      },
      {
        key: "tenant-portal.reports",
        enabled: true,
        description: "Enable tenant reports",
        updatedAt: "2026-05-27T10:30:00.000Z",
      },
    ]);
    const service = new FeatureFlagsService(
      repository as FeatureFlagRepository,
    );

    const response = await service.getOpsSummary("tenant-z");

    expect(response.items.map((item) => `${item.key}:${item.scope}`)).toEqual([
      "tenant-portal.billing:tenant",
      "tenant-portal.reports:global",
    ]);
    expect(response.items[0]?.rolloutState).toBe("partial");
    expect(response.items[0]?.rolloutSummary).toBe(
      "Tenant override differs from the platform default.",
    );
    expect(response.items[1]?.rolloutState).toBe("uniform");
  });
});
