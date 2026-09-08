import { test, expect } from "@playwright/test";
import {
  UatNamespaceManager,
  BASELINE_PERSONAS,
  createTenantPersonas,
  generateAuthHeaders,
  UatEvidenceRecorder,
} from "./index";

test.describe("SR-UAT-HARNESS-001: Parallel Shard and Tenant Isolation Verification", () => {
  test("maintains complete data and namespace isolation between two parallel shards", async () => {
    const manager = UatNamespaceManager.getInstance();

    // Create Shard 0 namespace
    const shard0 = manager.createShardNamespace({
      shardIndex: 0,
      taskId: "SR-UAT-TEST-001",
    });

    // Create Shard 1 namespace
    const shard1 = manager.createShardNamespace({
      shardIndex: 1,
      taskId: "SR-UAT-TEST-001",
    });

    // Verify distinct namespace identifiers
    expect(shard0.namespaceId).not.toBe(shard1.namespaceId);
    expect(shard0.prefix).not.toBe(shard1.prefix);

    // Verify distinct tenant A and B IDs across shards
    expect(shard0.tenantA.tenantId).not.toBe(shard1.tenantA.tenantId);
    expect(shard0.tenantB.tenantId).not.toBe(shard1.tenantB.tenantId);
    expect(shard0.tenantA.tenantCode).not.toBe(shard1.tenantA.tenantCode);
    expect(shard0.tenantB.tenantCode).not.toBe(shard1.tenantB.tenantCode);

    // Register simulated resources in both shards
    const resourceIdShard0 = shard0.qualifyId("order-1001");
    const resourceIdShard1 = shard1.qualifyId("order-1001");
    expect(resourceIdShard0).not.toBe(resourceIdShard1);

    shard0.registerResource("order", resourceIdShard0);
    shard1.registerResource("order", resourceIdShard1);

    // Assert zero cross-pollution between shards
    expect(() => {
      UatNamespaceManager.assertNoCrossPollution(shard0, shard1);
    }).not.toThrow();

    // Cleanup Shard 0 only
    const cleanupReport0 = await shard0.cleanup();
    expect(cleanupReport0.cleanedCount).toBeGreaterThanOrEqual(3); // tenantA, tenantB, order
    expect(shard0.isCleaned()).toBe(true);

    // Verify Shard 1 is untouched
    expect(shard1.isCleaned()).toBe(false);
    expect(shard1.getResources().length).toBeGreaterThanOrEqual(3);

    // Cleanup Shard 1
    const cleanupReport1 = await shard1.cleanup();
    expect(cleanupReport1.cleanedCount).toBeGreaterThanOrEqual(3);
    expect(shard1.isCleaned()).toBe(true);
  });

  test("generates role personas and enforces live fakeheaders guardrails", async () => {
    const manager = UatNamespaceManager.getInstance();
    const ns = manager.createShardNamespace({ shardIndex: 2 });

    const tenantAPersonas = createTenantPersonas(ns.tenantA);
    expect(tenantAPersonas.admin.actorType).toBe("tenant_admin");
    expect(tenantAPersonas.admin.tenantId).toBe(ns.tenantA.tenantId);
    expect(tenantAPersonas.driver.driverId).toBeDefined();

    // Local / Sandbox header generation
    const localHeaders = generateAuthHeaders(tenantAPersonas.admin, "local");
    expect(localHeaders["x-actor-type"]).toBe("tenant_admin");
    expect(localHeaders["x-tenant-id"]).toBe(ns.tenantA.tenantId);

    const sandboxHeaders = generateAuthHeaders(
      BASELINE_PERSONAS.platform_admin,
      "sandbox",
    );
    expect(sandboxHeaders["x-actor-type"]).toBe("platform_admin");
    expect(sandboxHeaders["x-realm"]).toBe("platform");

    // Guardrail: Live environment must reject fakeheaders
    expect(() => {
      generateAuthHeaders(tenantAPersonas.admin, "live");
    }).toThrow(/Live environment requires authentic credentials/);

    await ns.cleanup();
  });

  test("records evidence with SHA, HTTP/console logs, artifact hashes, and PII redaction", async () => {
    const recorder = new UatEvidenceRecorder({
      taskId: "SR-UAT-HARNESS-001",
      shardIndex: 0,
      baseSha: "ea1b1b4f0359d5ca5ab00ad604d37281a74d70df",
    });

    recorder.recordRole("Platform Admin", BASELINE_PERSONAS.platform_admin);
    recorder.recordResourceId("tenant", "10000000-0000-0000-0000-000000000201");

    // Record HTTP call with PII
    recorder.recordHttpCall({
      method: "POST",
      url: "https://api.drts.internal/api/users?token=secret123",
      statusCode: 200,
      durationMs: 42,
      requestHeaders: { authorization: "Bearer secret-token-value" },
      requestBody: {
        email: "user.test@acme.example",
        phone: "0912-345-678",
        rocId: "A123456789",
        password: "supersecretpassword",
      },
      responseBody: { ok: true, userId: "usr-001" },
    });

    // Record console log with PII
    recorder.recordConsole(
      "info",
      "User 0912-345-678 logged in with email rider@acme.example",
    );

    // Record artifact and compute SHA-256
    const sampleArtifact = recorder.recordArtifact(
      "sample-evidence.txt",
      "Evidence verification content for SR-UAT-HARNESS-001",
      "text/plain",
    );
    expect(sampleArtifact.sha256).toBeDefined();
    expect(sampleArtifact.byteSize).toBeGreaterThan(0);

    // Record live limitation
    recorder.recordLiveLimitation(
      "hardware_gps_dispatch",
      "Physical GPS transponder verification requires field vehicle hardware in SR-LIVE-OPS-001",
    );

    const bundle = recorder.finalize("passed");

    // Verify SHA tracking
    expect(bundle.baseSha).toBe("ea1b1b4f0359d5ca5ab00ad604d37281a74d70df");
    expect(bundle.headSha).toBeDefined();
    expect(bundle.status).toBe("passed");
    expect(bundle.exitCode).toBe(0);

    // Verify PII Redaction
    const httpCall = bundle.httpCalls[0]!;
    expect(httpCall.url).not.toContain("secret123");
    expect((httpCall.requestBody as Record<string, string>).password).toBe(
      "[REDACTED]",
    );
    expect((httpCall.requestBody as Record<string, string>).phone).toBe(
      "0912-***-678",
    );
    expect((httpCall.requestBody as Record<string, string>).email).toBe(
      "u***@acme.example",
    );
    expect((httpCall.requestBody as Record<string, string>).rocId).toBe(
      "A12***789",
    );

    const consoleLog = bundle.consoleLogs[0]!;
    expect(consoleLog.message).toContain("0912-***-678");
    expect(consoleLog.message).toContain("r***@acme.example");
  });

  test("handles execution failure with non-zero exit code", async () => {
    const recorder = new UatEvidenceRecorder({
      taskId: "SR-UAT-HARNESS-001",
      shardIndex: 1,
    });

    recorder.recordError(new Error("Simulated database timeout failure"));
    const bundle = recorder.finalize();

    expect(bundle.status).toBe("failed");
    expect(bundle.exitCode).toBe(1);
    expect(() => {
      recorder.assertSuccess();
    }).toThrow(/exit code 1/);
  });
});
