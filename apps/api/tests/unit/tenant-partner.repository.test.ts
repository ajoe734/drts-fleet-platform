import { describe, expect, it, vi } from "vitest";

import type { TenantQuotaPolicyRecord } from "@drts/contracts";

import {
  TenantPartnerRepository,
  type TenantQuotaMonthlySnapshotRecord,
} from "../../src/modules/tenant-partner/tenant-partner.repository";
import { createEmptyTenantQuotaUsage } from "../../src/modules/tenant-partner/tenant-quota-ledger";

const LIMIT = {
  bookingCountLimit: 2,
  amountMinorLimit: 100_000,
  currency: "TWD",
  enforcementMode: "hard_block" as const,
};

function createQuotaPolicy(
  overrides: Partial<TenantQuotaPolicyRecord> = {},
): TenantQuotaPolicyRecord {
  return {
    tenantId: "tenant-demo-001",
    costCenterCode: null,
    period: "monthly",
    limit: { ...LIMIT },
    inheritedFromTenant: false,
    createdAt: "2026-05-13T10:00:00.000Z",
    updatedAt: "2026-05-13T10:05:00.000Z",
    ...overrides,
  };
}

function createQuotaSnapshot(
  overrides: Partial<TenantQuotaMonthlySnapshotRecord> = {},
): TenantQuotaMonthlySnapshotRecord {
  const limit = overrides.limit ?? LIMIT;
  return {
    tenantId: "tenant-demo-001",
    costCenterCode: null,
    period: "monthly",
    periodKey: "2026-05",
    limit: { ...limit },
    usage: overrides.usage ?? createEmptyTenantQuotaUsage(limit),
    refreshedAt: "2026-05-13T10:10:00.000Z",
    ...overrides,
  };
}

describe("tenant partner repository quota persistence", () => {
  it("uses a null-aware conflict target for tenant-scope quota policies", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new TenantPartnerRepository({
      isEnabled: () => true,
      query,
    } as never);
    const policy = createQuotaPolicy();

    await repository.persistChanges({ quotaPolicies: [policy] });

    const call = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO core.phase1_tenant_quota_policies"),
    ) as [string, unknown[]] | undefined;
    expect(call).toBeDefined();
    expect(call?.[0]).toContain(
      "ON CONFLICT (tenant_id, period) WHERE cost_center_code IS NULL DO UPDATE SET",
    );
    expect(call?.[1]).toEqual([
      policy.tenantId,
      policy.costCenterCode,
      policy.period,
      policy.updatedAt,
      policy.createdAt,
      JSON.stringify(policy),
    ]);
  });

  it("uses a scoped conflict target for cost-center quota policies", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new TenantPartnerRepository({
      isEnabled: () => true,
      query,
    } as never);
    const policy = createQuotaPolicy({ costCenterCode: "CC-FIN-04" });

    await repository.persistChanges({ quotaPolicies: [policy] });

    const call = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO core.phase1_tenant_quota_policies"),
    ) as [string, unknown[]] | undefined;
    expect(call).toBeDefined();
    expect(call?.[0]).toContain(
      "ON CONFLICT (tenant_id, cost_center_code, period) WHERE cost_center_code IS NOT NULL DO UPDATE SET",
    );
  });

  it("locks quota policy and snapshot rows with FOR UPDATE during reservation", async () => {
    const repository = new TenantPartnerRepository();
    const policyQuery = vi.fn().mockResolvedValue({ rows: [] });
    const snapshotQuery = vi.fn().mockResolvedValue({ rows: [] });

    await repository.loadQuotaPoliciesForUpdate(
      { query: policyQuery } as never,
      "tenant-demo-001",
      "CC-FIN-04",
    );
    await repository.loadQuotaMonthlySnapshotsForUpdate(
      { query: snapshotQuery } as never,
      "tenant-demo-001",
      "CC-FIN-04",
      "2026-05",
    );

    expect(policyQuery).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      ["tenant-demo-001", "monthly", "CC-FIN-04"],
    );
    expect(snapshotQuery).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      ["tenant-demo-001", "monthly", "2026-05", "CC-FIN-04"],
    );
  });

  it("uses a null-aware conflict target when seeding quota snapshots", async () => {
    const repository = new TenantPartnerRepository();
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const snapshot = createQuotaSnapshot();

    await repository.ensureQuotaMonthlySnapshots({ query } as never, [
      snapshot,
    ]);

    const call = query.mock.calls[0] as [string, unknown[]] | undefined;
    expect(call).toBeDefined();
    expect(call?.[0]).toContain(
      "ON CONFLICT (tenant_id, period, period_key) WHERE cost_center_code IS NULL DO NOTHING",
    );
  });
});
