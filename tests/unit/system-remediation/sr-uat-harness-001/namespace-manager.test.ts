import { describe, it, expect, beforeEach } from "vitest";
import { UatNamespaceManager } from "../../../e2e/system-remediation/shared/namespace-manager";

describe("SR-UAT-HARNESS-001: UatNamespaceManager and Shard Isolation", () => {
  let manager: UatNamespaceManager;

  beforeEach(async () => {
    manager = UatNamespaceManager.getInstance();
    await manager.cleanupAll();
  });

  it("creates two parallel shards with completely isolated namespaces and tenants", () => {
    const shard0 = manager.createShardNamespace({
      shardIndex: 0,
      taskId: "SR-UAT-HARNESS-001",
    });
    const shard1 = manager.createShardNamespace({
      shardIndex: 1,
      taskId: "SR-UAT-HARNESS-001",
    });

    expect(shard0.shardIndex).toBe(0);
    expect(shard1.shardIndex).toBe(1);

    // Namespace IDs and prefixes are distinct
    expect(shard0.namespaceId).not.toBe(shard1.namespaceId);
    expect(shard0.prefix).not.toBe(shard1.prefix);
    expect(shard0.prefix).toContain("s0_");
    expect(shard1.prefix).toContain("s1_");

    // Tenant A in each shard is distinct
    expect(shard0.tenantA.tenantId).not.toBe(shard1.tenantA.tenantId);
    expect(shard0.tenantA.tenantCode).not.toBe(shard1.tenantA.tenantCode);
    expect(shard0.tenantA.tenantType).toBe("enterprise");

    // Tenant B in each shard is distinct
    expect(shard0.tenantB.tenantId).not.toBe(shard1.tenantB.tenantId);
    expect(shard0.tenantB.tenantCode).not.toBe(shard1.tenantB.tenantCode);
    expect(shard0.tenantB.tenantType).toBe("credit_card");

    // Tenants within same shard are distinct
    expect(shard0.tenantA.tenantId).not.toBe(shard0.tenantB.tenantId);
    expect(shard0.tenantA.tenantCode).not.toBe(shard0.tenantB.tenantCode);
  });

  it("qualifies IDs and display names uniquely per shard", () => {
    const shard0 = manager.createShardNamespace({ shardIndex: 0 });
    const shard1 = manager.createShardNamespace({ shardIndex: 1 });

    const id0 = shard0.qualifyId("driver-42");
    const id1 = shard1.qualifyId("driver-42");

    expect(id0).not.toBe(id1);
    expect(id0).toContain(shard0.prefix);
    expect(id1).toContain(shard1.prefix);

    const name0 = shard0.qualifyName("Acme Fleet");
    const name1 = shard1.qualifyName("Acme Fleet");
    expect(name0).not.toBe(name1);
    expect(name0).toContain(shard0.prefix);
  });

  it("assertNoCrossPollution passes for independent shards and fails on collision", () => {
    const shard0 = manager.createShardNamespace({ shardIndex: 0 });
    const shard1 = manager.createShardNamespace({ shardIndex: 1 });

    // Should pass cleanly
    expect(() => {
      UatNamespaceManager.assertNoCrossPollution(shard0, shard1);
    }).not.toThrow();

    // Register cross-shard resource to simulate artificial contamination
    const sharedId = shard0.qualifyId("shared-resource");
    shard0.registerResource("booking", sharedId);
    shard1.registerResource("booking", sharedId);

    // Now should detect collision and throw
    expect(() => {
      UatNamespaceManager.assertNoCrossPollution(shard0, shard1);
    }).toThrow(/Resource collision between shard 0 and shard 1/);
  });

  it("cleans up only its own namespace without affecting concurrent shards", async () => {
    const shard0 = manager.createShardNamespace({ shardIndex: 0 });
    const shard1 = manager.createShardNamespace({ shardIndex: 1 });

    shard0.registerResource("vehicle", shard0.qualifyId("veh-1"));
    shard0.registerResource("order", shard0.qualifyId("ord-1"));

    shard1.registerResource("vehicle", shard1.qualifyId("veh-2"));
    shard1.registerResource("order", shard1.qualifyId("ord-2"));

    // Verify initial counts: 2 tenant resources (A & B) + 2 custom resources = 4
    expect(shard0.getResources().length).toBe(4);
    expect(shard1.getResources().length).toBe(4);

    // Clean shard 0 only
    const report0 = await shard0.cleanup();
    expect(report0.cleanedCount).toBe(4);
    expect(shard0.isCleaned()).toBe(true);
    expect(shard0.getResources().length).toBe(0);

    // Shard 1 remains completely intact
    expect(shard1.isCleaned()).toBe(false);
    expect(shard1.getResources().length).toBe(4);

    // Subsequent cleanup of shard 0 is idempotent
    const idempotentReport = await shard0.cleanup();
    expect(idempotentReport.cleanedCount).toBe(0);

    // Clean shard 1
    const report1 = await shard1.cleanup();
    expect(report1.cleanedCount).toBe(4);
    expect(shard1.isCleaned()).toBe(true);
  });
});
