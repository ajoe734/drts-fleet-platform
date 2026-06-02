import { describe, expect, it, vi } from "vitest";

import { FeatureFlagRepository } from "../../src/modules/feature-flags/feature-flag.repository";

// These tests cover the DB-backed path of the feature-flag persistence layer
// (the in-memory fallback is exercised by assistant.service.test.ts). They
// assert the SQL the repository emits against admin.feature_flags, following the
// fake-DatabaseService convention used by tenant-partner.repository.test.ts.
//
// The per-realm override path is the one V0026 unblocks: V0014 made flag_key the
// sole PRIMARY KEY, so a second row sharing a flag_key (a tenant override on top
// of the global default) violated the PK before the composite UNIQUE could
// upsert it. The conflict target asserted here only persists once that PK is
// dropped.

interface FlagRowFixture {
  flag_key: string;
  enabled: boolean;
  description: string;
  tenant_id: string | null;
  updated_at: string;
}

function createRepository(rows: FlagRowFixture[] = []) {
  const query = vi.fn().mockResolvedValue({ rows });
  const repository = new FeatureFlagRepository({
    isEnabled: () => true,
    query,
  } as never);
  return { repository, query };
}

const GLOBAL_OFF: FlagRowFixture = {
  flag_key: "ops.assistant.enabled",
  enabled: false,
  description: "Enable ops console LLM assistant widget + backend availability",
  tenant_id: null,
  updated_at: "2026-06-02T00:00:00.000Z",
};

const TENANT_ON: FlagRowFixture = {
  flag_key: "ops.assistant.enabled",
  enabled: true,
  description: "Enable ops console LLM assistant widget + backend availability",
  tenant_id: "tenant-a",
  updated_at: "2026-06-02T01:00:00.000Z",
};

describe("FeatureFlagRepository DB path", () => {
  it("upserts a per-realm override with a (flag_key, tenant_id) conflict target", async () => {
    const { repository, query } = createRepository([TENANT_ON]);

    const result = await repository.upsertTenantOverride(
      "ops.assistant.enabled",
      "tenant-a",
      true,
      "Enable ops console LLM assistant widget + backend availability",
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO admin.feature_flags");
    expect(sql).toContain("ON CONFLICT (flag_key, tenant_id)");
    expect(sql).toContain("DO UPDATE SET");
    // params order: key, enabled, description, tenantId
    expect(params).toEqual([
      "ops.assistant.enabled",
      true,
      "Enable ops console LLM assistant widget + backend availability",
      "tenant-a",
    ]);
    // The returned override carries the realm so it can shadow the global.
    expect(result).toMatchObject({
      key: "ops.assistant.enabled",
      enabled: true,
      tenantId: "tenant-a",
    });
  });

  it("resolves a key for a realm preferring the override over the global", async () => {
    // ORDER BY tenant_id DESC NULLS LAST + LIMIT 1 returns the override first.
    const { repository, query } = createRepository([TENANT_ON]);

    const flag = await repository.findByKey(
      "ops.assistant.enabled",
      "tenant-a",
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "WHERE flag_key = $1 AND (tenant_id = $2 OR tenant_id IS NULL)",
    );
    expect(sql).toContain("ORDER BY tenant_id DESC NULLS LAST");
    expect(params).toEqual(["ops.assistant.enabled", "tenant-a"]);
    expect(flag).toMatchObject({ enabled: true, tenantId: "tenant-a" });
  });

  it("resolves a key with no realm against the global row only", async () => {
    const { repository, query } = createRepository([GLOBAL_OFF]);

    const flag = await repository.findByKey("ops.assistant.enabled");

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHERE flag_key = $1 AND tenant_id IS NULL");
    expect(params).toEqual(["ops.assistant.enabled"]);
    // A null tenant_id is mapped to an absent tenantId, not null.
    expect(flag).not.toHaveProperty("tenantId");
    expect(flag).toMatchObject({ enabled: false });
  });

  it("updateFlag targets the global row only", async () => {
    const { repository, query } = createRepository([
      { ...GLOBAL_OFF, enabled: true },
    ]);

    await repository.updateFlag("ops.assistant.enabled", true);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("UPDATE admin.feature_flags");
    expect(sql).toContain("WHERE flag_key = $1 AND tenant_id IS NULL");
    expect(params).toEqual(["ops.assistant.enabled", true]);
  });

  it("findAll returns global and per-realm rows ordered by key then tenant", async () => {
    const { repository, query } = createRepository([GLOBAL_OFF, TENANT_ON]);

    const flags = await repository.findAll();

    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ORDER BY flag_key, tenant_id");
    expect(flags).toHaveLength(2);
    expect(flags.find((f) => f.tenantId === "tenant-a")?.enabled).toBe(true);
    expect(flags.find((f) => f.tenantId === undefined)?.enabled).toBe(false);
  });

  it("short-circuits without querying when the database is disabled", async () => {
    const query = vi.fn();
    const repository = new FeatureFlagRepository({
      isEnabled: () => false,
      query,
    } as never);

    await expect(repository.findAll()).resolves.toEqual([]);
    await expect(
      repository.findByKey("ops.assistant.enabled"),
    ).resolves.toBeUndefined();
    await expect(
      repository.upsertTenantOverride(
        "ops.assistant.enabled",
        "tenant-a",
        true,
        "d",
      ),
    ).resolves.toBeUndefined();
    await expect(
      repository.updateFlag("ops.assistant.enabled", true),
    ).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
