import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { GET as tenantHealthz } from "../../../../apps/tenant-console-web/app/healthz/route";
import { GET as enterpriseHealthz } from "../../../../apps/enterprise-dispatch-web/app/healthz/route";
import { GET as bankHealthz } from "../../../../apps/bank-console-web/app/healthz/route";
import {
  PUBLIC_AUTH_PATHS,
  HEALTHCHECK_PATH,
} from "../../../../apps/tenant-console-web/lib/auth/constants";

const repoRoot = path.resolve(__dirname, "../../../..");

describe("SR-DEV-HEALTHCHECK-IDENTITY-20260915: dev deployment health check identity verification", () => {
  const workflowContent = readFileSync(
    path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
    "utf8",
  );

  it("probes private Cloud Run services with identity token authorization", () => {
    // Assert curl_ready_auth helper exists and passes Authorization header
    expect(workflowContent).toContain("curl_ready_auth()");
    expect(workflowContent).toContain("Authorization: Bearer ${id_token}");
    expect(workflowContent).toContain("--location-trusted");
    expect(workflowContent).toContain("--retry-all-errors");
    expect(workflowContent).toContain("--retry 10");
    expect(workflowContent).toContain("--fail");

    // Assert private services use curl_ready_auth with minted identity tokens
    expect(workflowContent).toContain(
      'curl_ready_auth "${{ steps.urls.outputs.tenant_console }}" "${TENANT_CONSOLE_ID_TOKEN}"',
    );
    expect(workflowContent).toContain(
      'curl_ready_auth "${{ steps.urls.outputs.bank_console }}" "${BANK_CONSOLE_ID_TOKEN}"',
    );
    expect(workflowContent).toContain(
      'curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}" "${ENTERPRISE_DISPATCH_ID_TOKEN}"',
    );
    expect(workflowContent).toContain(
      'curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}/bookings/new" "${ENTERPRISE_DISPATCH_ID_TOKEN}"',
    );
    expect(workflowContent).toContain(
      'curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}/embed/unsupported-host" "${ENTERPRISE_DISPATCH_ID_TOKEN}"',
    );

    // Assert Cloud Run infrastructure-reserved path /healthz is not probed over public GFE
    expect(workflowContent).not.toContain(
      'curl_ready_auth "${{ steps.urls.outputs.tenant_console }}/healthz"',
    );
    expect(workflowContent).not.toContain(
      'curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}/healthz"',
    );
  });

  it("maintains anonymous probes for public services", () => {
    expect(workflowContent).toContain(
      'curl_ready "${{ steps.urls.outputs.api }}/health"',
    );
    expect(workflowContent).toContain(
      'curl_ready "${{ steps.urls.outputs.platform_admin }}"',
    );
    expect(workflowContent).toContain(
      'curl_ready "${{ steps.urls.outputs.ops_console }}"',
    );
    expect(workflowContent).toContain(
      'curl_ready "${{ steps.urls.outputs.fleet_partner_portal }}"',
    );
    expect(workflowContent).toContain(
      'curl_ready "${{ steps.urls.outputs.channel_partner_portal }}"',
    );
  });

  it("preserves strict --no-allow-unauthenticated defaults for private services", () => {
    // Services must not be exposed unauthenticated
    expect(workflowContent).toContain(
      'tenant_console_exposure_flag="$(exposure_flag "${DEV_TENANT_CONSOLE_ALLOW_UNAUTHENTICATED:-}" false)"',
    );
    expect(workflowContent).toContain(
      'bank_console_exposure_flag="$(exposure_flag "${DEV_BANK_CONSOLE_ALLOW_UNAUTHENTICATED:-}" false)"',
    );
    expect(workflowContent).toContain(
      'enterprise_dispatch_exposure_flag="$(exposure_flag "${DEV_ENTERPRISE_DISPATCH_ALLOW_UNAUTHENTICATED:-}" false)"',
    );
  });

  it("implements tenant-console-web /healthz route handler and includes it in PUBLIC_AUTH_PATHS", async () => {
    expect(HEALTHCHECK_PATH).toBe("/healthz");
    expect(PUBLIC_AUTH_PATHS).toContain("/healthz");

    const response = tenantHealthz();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      service: "tenant-console-web",
    });
  });

  it("implements enterprise-dispatch-web /healthz route handler", async () => {
    const response = enterpriseHealthz();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      service: "enterprise-dispatch-web",
    });
  });

  it("implements bank-console-web /healthz route handler", async () => {
    const response = bankHealthz();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      status: "ok",
      service: "bank-console-web",
    });
  });

  it("mints ID tokens for private services in operational-candidate-acceptance and passes them to journey runner", () => {
    // Assert minting steps exist in operational-candidate-acceptance job
    expect(workflowContent).toContain(
      "Mint identity token — tenant console (operational candidate)",
    );
    expect(workflowContent).toContain(
      "Mint identity token — bank console (operational candidate)",
    );
    expect(workflowContent).toContain(
      "Mint identity token — enterprise dispatch (operational candidate)",
    );

    // Assert tokens are passed to Execute candidate-bound operational journeys step
    expect(workflowContent).toContain(
      "DRTS_DEV_TENANT_CONSOLE_ID_TOKEN: ${{ steps.id_token_tenant_console.outputs.id_token }}",
    );
    expect(workflowContent).toContain(
      "DRTS_DEV_BANK_CONSOLE_ID_TOKEN: ${{ steps.id_token_bank_console.outputs.id_token }}",
    );
    expect(workflowContent).toContain(
      "DRTS_DEV_ENTERPRISE_DISPATCH_ID_TOKEN: ${{ steps.id_token_enterprise_dispatch.outputs.id_token }}",
    );
  });

  it("exports ID tokens in run-operational-browser-acceptance.sh", () => {
    const runnerContent = readFileSync(
      path.join(
        repoRoot,
        "operations/verification/run-operational-browser-acceptance.sh",
      ),
      "utf8",
    );
    expect(runnerContent).toContain(
      'export DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN="${DRTS_DEV_TENANT_CONSOLE_ID_TOKEN:-${DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN:-}}"',
    );
    expect(runnerContent).toContain(
      'export DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN="${DRTS_DEV_BANK_CONSOLE_ID_TOKEN:-${DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN:-}}"',
    );
    expect(runnerContent).toContain(
      'export DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN="${DRTS_DEV_ENTERPRISE_DISPATCH_ID_TOKEN:-${DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN:-}}"',
    );
  });

  it("applies Authorization header and extraHTTPHeaders to private services in operational-candidate.spec.ts", () => {
    const specContent = readFileSync(
      path.join(repoRoot, "tests/e2e/operational-candidate.spec.ts"),
      "utf8",
    );
    // Identity token resolution
    expect(specContent).toContain("getIdentityToken");
    expect(specContent).toContain("DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN");
    expect(specContent).toContain("DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN");
    expect(specContent).toContain(
      "DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN",
    );

    // Request and browser context authentication
    expect(specContent).toContain(
      'httpHeaders["Authorization"] = `Bearer ${idToken}`',
    );
    expect(specContent).toContain("await context.setExtraHTTPHeaders({");
    expect(specContent).toContain("Authorization: `Bearer ${idToken}`,");

    // Bank console login authentication
    expect(specContent).toContain(
      "bank console demo login remains on the deployed public origin",
    );
    expect(specContent).toContain('id: "bank-console-web"');
  });

  it("applies Authorization header and extraHTTPHeaders to private services in operational-browser-acceptance.spec.ts and handles downloads", () => {
    const specContent = readFileSync(
      path.join(repoRoot, "tests/e2e/operational-browser-acceptance.spec.ts"),
      "utf8",
    );
    // Identity token resolution
    expect(specContent).toContain("getIdentityToken");
    expect(specContent).toContain("DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN");
    expect(specContent).toContain("DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN");
    expect(specContent).toContain(
      "DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN",
    );

    // Browser context extraHTTPHeaders for journeys and routes
    expect(specContent).toContain("await page.context().setExtraHTTPHeaders({");
    expect(specContent).toContain("Authorization: `Bearer ${idToken}`,");

    // Setup and readback requests carry Authorization header for private services
    expect(specContent).toContain(
      'headers["Authorization"] = `Bearer ${setupIdToken}`;',
    );
    expect(specContent).toContain(
      'readbackHeaders["Authorization"] = `Bearer ${idToken}`;',
    );

    // Download verification checks download artifact and candidate revision
    expect(specContent).toContain('operation.responseKind === "download"');
    expect(specContent).toContain('page.waitForEvent("download"');
    expect(specContent).toContain("downloadResponse.headers()");
  });

  it("allows matching_timeout on created orders with DB repository enabled so operational journey setup succeeds", async () => {
    const { buildOwnedMobilityServiceForTest, createTestPassengerOrder } = await import(
      "../sr-qa-dispatch-001/test-support"
    );
    const { vi } = await import("vitest");

    const mockRepo = {
      isEnabled: vi.fn(() => true),
      withTransaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
      loadOrderCancellationForUpdate: vi.fn(async (_tx: unknown, orderId: string) => ({
        order: testService.requireOrder(orderId),
        assignment: null,
        task: null,
        dispatchJobs: [],
      })),
      persistChanges: vi.fn(async () => undefined),
      persistOrderWorkflow: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    };

    const { service: testService } = buildOwnedMobilityServiceForTest();
    // Attach repo
    (testService as any).ownedMobilityRepository = mockRepo;

    const order = createTestPassengerOrder(testService);
    // Explicitly test an order in "created" status (as produced by tenant booking creation)
    testService.requireOrder(order.orderId).status = "created";

    const result = await testService.handleDispatchTimeout(
      order.orderId,
      "matching_timeout",
    );

    expect(result.status).toBe("dispatch_timeout");
    expect(result.escalationAction).not.toBe("superseded");
    expect(testService.getOrder(order.orderId).status).toBe("dispatch_timeout");
  });

  it.each([
    "no_supply",
    "exception_hold",
    "dispatch_failed",
    "recording_pending",
    "completed",
    "cancelled",
    "driver_accepted",
    "enroute_pickup",
    "arrived_pickup",
    "on_trip",
    "proof_pending",
    "dispatch_timeout",
  ] as const)(
    "fences stale matching_timeout on %s orders as superseded (DB repo enabled)",
    async (nonTimeoutableStatus) => {
      const { buildOwnedMobilityServiceForTest, createTestPassengerOrder } = await import(
        "../sr-qa-dispatch-001/test-support"
      );
      const { vi } = await import("vitest");

      const mockRepo = {
        isEnabled: vi.fn(() => true),
        withTransaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
        loadOrderCancellationForUpdate: vi.fn(async (_tx: unknown, orderId: string) => ({
          order: testService.requireOrder(orderId),
          assignment: null,
          task: null,
          dispatchJobs: [],
        })),
        persistChanges: vi.fn(async () => undefined),
        persistOrderWorkflow: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      };

      const { service: testService } = buildOwnedMobilityServiceForTest();
      (testService as any).ownedMobilityRepository = mockRepo;

      const order = createTestPassengerOrder(testService);
      testService.requireOrder(order.orderId).status = nonTimeoutableStatus;
      const initialAttemptCount = testService.requireOrder(order.orderId).dispatchAttemptCount;

      const result = await testService.handleDispatchTimeout(
        order.orderId,
        "matching_timeout",
      );

      expect(result.status).toBe(nonTimeoutableStatus);
      expect(result.escalationAction).toBe("superseded");
      expect(testService.getOrder(order.orderId).status).toBe(nonTimeoutableStatus);
      expect(testService.getOrder(order.orderId).dispatchAttemptCount).toBe(initialAttemptCount);
    },
  );

  it.each([
    "no_supply",
    "exception_hold",
    "dispatch_failed",
    "recording_pending",
    "completed",
    "cancelled",
    "driver_accepted",
    "enroute_pickup",
    "arrived_pickup",
    "on_trip",
    "proof_pending",
    "dispatch_timeout",
  ] as const)(
    "fences stale matching_timeout on %s orders as superseded (in-memory mode)",
    async (nonTimeoutableStatus) => {
      const { buildOwnedMobilityServiceForTest, createTestPassengerOrder } = await import(
        "../sr-qa-dispatch-001/test-support"
      );

      const { service: testService } = buildOwnedMobilityServiceForTest();
      const order = createTestPassengerOrder(testService);
      testService.requireOrder(order.orderId).status = nonTimeoutableStatus;
      const initialAttemptCount = testService.requireOrder(order.orderId).dispatchAttemptCount;

      const result = await testService.handleDispatchTimeout(
        order.orderId,
        "matching_timeout",
      );

      expect(result.status).toBe(nonTimeoutableStatus);
      expect(result.escalationAction).toBe("superseded");
      expect(testService.getOrder(order.orderId).status).toBe(nonTimeoutableStatus);
      expect(testService.getOrder(order.orderId).dispatchAttemptCount).toBe(initialAttemptCount);
    },
  );

  it.each([
    "created",
    "ready_for_dispatch",
    "redispatch_required",
    "preassigned",
    "delayed_queue",
  ] as const)(
    "allows matching_timeout on %s orders without assignment",
    async (timeoutableStatus) => {
      const { buildOwnedMobilityServiceForTest, createTestPassengerOrder } = await import(
        "../sr-qa-dispatch-001/test-support"
      );
      const { vi } = await import("vitest");

      const mockRepo = {
        isEnabled: vi.fn(() => true),
        withTransaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
        loadOrderCancellationForUpdate: vi.fn(async (_tx: unknown, orderId: string) => ({
          order: testService.requireOrder(orderId),
          assignment: null,
          task: null,
          dispatchJobs: [],
        })),
        persistChanges: vi.fn(async () => undefined),
        persistOrderWorkflow: vi.fn(async () => undefined),
        reportPersistenceFailure: vi.fn(),
      };

      const { service: testService } = buildOwnedMobilityServiceForTest();
      (testService as any).ownedMobilityRepository = mockRepo;

      const order = createTestPassengerOrder(testService);
      testService.requireOrder(order.orderId).status = timeoutableStatus;

      const result = await testService.handleDispatchTimeout(
        order.orderId,
        "matching_timeout",
      );

      expect(result.status).toBe("dispatch_timeout");
      expect(result.escalationAction).not.toBe("superseded");
      expect(testService.getOrder(order.orderId).status).toBe("dispatch_timeout");
    },
  );
});

