import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../../apps/api/src/common/auth/auth.constants";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type {
  ForwarderAdapterHealthSnapshot,
  ForwarderAdapterInterface,
} from "../../../apps/api/src/modules/forwarder/forwarder-adapter.interface";
import { GRAB_TAIWAN_PLATFORM_CODE } from "../../../apps/api/src/modules/forwarder/grab-taiwan.adapter";
import { ForwarderController } from "../../../apps/api/src/modules/forwarder/forwarder.controller";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import { OperationalObservabilityController } from "../../../apps/api/src/modules/operational-observability/operational-observability.controller";
import { OperationalObservabilityService } from "../../../apps/api/src/modules/operational-observability/operational-observability.service";
import * as drtsApiClient from "../../../packages/api-client/src/index";
import { ApiClient, ApiClientError } from "../../../packages/api-client/src/index";
import * as drtsContracts from "../../../packages/contracts/src/index";
import type {
  AdapterHealthRecord,
  ForwardedOrderRecord,
  OperationalObservabilitySnapshot,
  PlatformCode,
} from "../../../packages/contracts/src/index";
import * as drtsUi from "../../../packages/ui-web/src/index";
import type {
  HealthPageLoadState,
  PlatformHealthSourceClient,
} from "../../../apps/platform-admin-web/app/health/health-observability-model";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const platformAdminRequire = createRequire(
  resolve("apps/platform-admin-web/package.json"),
);
const { renderToStaticMarkup } = platformAdminRequire(
  "react-dom/server",
) as typeof import("react-dom/server");

const workspaceModuleMocks = {
  "@drts/api-client": drtsApiClient,
  "@drts/contracts": drtsContracts,
  "@drts/ui": drtsUi,
  "@drts/ui-web": drtsUi,
};

const platformAppRoot = resolve("apps/platform-admin-web");
const loadPlatformModule = createUiModuleLoader(
  platformAppRoot,
  workspaceModuleMocks,
);
const {
  beginHealthPageLoad,
  buildPlatformHealthViewModel,
  computePerAdapterOrders24h,
  createInitialHealthPageState,
  loadPlatformHealthSources,
  selectAdapterLatestEvent,
} = loadPlatformModule<
  typeof import("../../../apps/platform-admin-web/app/health/health-observability-model")
>(resolve(platformAppRoot, "app/health/health-observability-model.ts"));

const opsAppRoot = resolve("apps/ops-console-web");
const loadOpsModule = createUiModuleLoader(opsAppRoot, workspaceModuleMocks);
const {
  buildOpsHealthEnvelope,
  buildOpsObservabilitySignals,
  buildOpsRefreshMetadata,
  createInitialOpsObservabilityReadState,
  createLoadingOpsObservabilityReadState,
  loadOpsObservabilityReadState,
  resolveOpsAdapterEmptyState,
  resolveOpsStaleLocationKpi,
  selectOpsActiveAlerts,
} = loadOpsModule<
  typeof import("../../../apps/ops-console-web/app/dashboard/observability-read-state")
>(resolve(opsAppRoot, "app/dashboard/observability-read-state.ts"));

function buildBaseObservabilitySnapshot(
  overrides: Partial<OperationalObservabilitySnapshot> = {},
): OperationalObservabilitySnapshot {
  return {
    generatedAt: "2026-10-15T12:00:00.000Z",
    alerts: [
      {
        key: "dispatch_lag",
        state: "healthy",
        routes: ["ops", "platform"],
        measuredValue: 0,
        thresholds: { warning: 10, critical: 20, unit: "minutes" },
        observedAt: "2026-10-15T12:00:00.000Z",
      },
      {
        key: "recording_backlog",
        state: "healthy",
        routes: ["ops"],
        measuredValue: 0,
        thresholds: { warning: 1, critical: 3, unit: "count" },
        observedAt: "2026-10-15T12:00:00.000Z",
      },
      {
        key: "driver_state_lag",
        state: "healthy",
        routes: ["ops"],
        measuredValue: 0,
        thresholds: { warning: 1, critical: 3, unit: "count" },
        observedAt: "2026-10-15T12:00:00.000Z",
      },
      {
        key: "webhook_failure_burst",
        state: "healthy",
        routes: ["ops", "platform"],
        measuredValue: 0,
        thresholds: { warning: 1, critical: 3, unit: "count" },
        observedAt: "2026-10-15T12:00:00.000Z",
      },
      {
        key: "eligibility_review_backlog",
        state: "healthy",
        routes: ["ops", "platform"],
        measuredValue: 0,
        thresholds: { warning: 1, critical: 5, unit: "count" },
        observedAt: "2026-10-15T12:00:00.000Z",
      },
      {
        key: "adapter_degradation",
        state: "healthy",
        routes: ["ops", "platform"],
        measuredValue: 0,
        thresholds: { warning: 1, critical: 2, unit: "count" },
        observedAt: "2026-10-15T12:00:00.000Z",
      },
    ],
    dispatch: {
      activeOrders: 2,
      queueDepth: 0,
      laggedOrders: 0,
      redispatchOrders: 0,
      exceptionHoldOrders: 0,
      dispatchFailedOrders: 0,
      oldestReadyOrderLagMinutes: null,
    },
    recording: {
      phoneOrders: 2,
      linkedOrders: 2,
      pendingOrders: 0,
      pendingCallSessions: 0,
      missingRecordingLinks: 0,
      oldestPendingLagMinutes: null,
      linkedRatioPercent: 100,
    },
    driverState: {
      totalDrivers: 4,
      availableDrivers: 3,
      dispatchEligibleDrivers: 3,
      offlineDrivers: 1,
      staleLocationDrivers: 0,
      missingLocationDrivers: 0,
      oldestLocationLagMinutes: null,
    },
    webhook: {
      totalEndpoints: 2,
      activeEndpoints: 2,
      disabledEndpoints: 0,
      queuedDeliveries: 0,
      failedDeliveriesLastHour: 0,
      oldestQueuedDeliveryLagMinutes: null,
    },
    eligibility: {
      totalReviewQueue: 0,
      manualReviewQueue: 0,
      manualFallbackQueue: 0,
      ineligibleQueue: 0,
      recentFailureCount24h: 0,
    },
    reporting: {
      queuedJobs: 0,
      failedJobs: 0,
      dispatchRecordingIndexQueuedJobs: 0,
    },
    adapters: {
      totalAdapters: 3,
      healthyAdapters: 3,
      degradedAdapters: 0,
      downAdapters: 0,
    },
    forwarderOps: {
      totalForwardedOrders: 15,
      syncFailedOrders: 0,
      acceptPendingOrders: 0,
      manualFallbackQueue: 0,
      reconciliationQueue: 0,
      oldestSyncFailedLagMinutes: null,
      oldestAcceptPendingLagMinutes: null,
      oldestManualFallbackLagMinutes: null,
      oldestReconciliationLagMinutes: null,
    },
    mapGeofence: {
      providerHealth: {
        status: "healthy",
        provider: "mock",
        mode: "mock",
        failClosed: false,
        lastCheckedAt: "2026-10-15T12:00:00.000Z",
        quota: {
          dailyLimit: 10000,
          minuteLimit: 600,
          dailyUsed: 10,
          minuteUsed: 1,
          usagePercent: 0.1,
          status: "healthy",
          warningThresholdPercent: 80,
          criticalThresholdPercent: 95,
          policy: "mock_unlimited",
        },
      },
      geo: {
        providerOutageCount: 0,
        addressAmbiguityCount: 0,
        coordinateLessAttemptCount: 0,
        manualOverrideCount: 0,
        resolvedAddressCount: 5,
        requests: {
          total: 5,
          successful: 5,
          providerErrorCount: 0,
          successRatePercent: 100,
          byOperation: { search: 2, resolve: 2, reverse: 1 },
          byResult: {
            resolved: 5,
            manualOverride: 0,
            addressAmbiguity: 0,
            coordinateLessAttempt: 0,
            providerOutage: 0,
          },
        },
        latencyMs: { count: 5, average: 12, max: 20, p95: 18 },
      },
      serviceArea: {
        evaluations: 5,
        serviceableCount: 5,
        manualReviewCount: 0,
        policyDenialCount: 0,
        outOfAreaCount: 0,
        coordinateLessAttemptCount: 0,
      },
      governance: {
        geometryMutationCount: 0,
        serviceAreaPublishedCount: 1,
        serviceAreaRetiredCount: 0,
        stopPolicyPublishedCount: 1,
        stopPolicyRetiredCount: 0,
        manualOverrideCount: 0,
      },
      lastEventAt: "2026-10-15T11:55:00.000Z",
    },
    adapterDetails: [
      {
        platformCode: "yoxi" as PlatformCode,
        status: "healthy",
        reason: "none",
        credentialStatus: "valid",
        authStatus: "authenticated",
        webhookStatus: "healthy",
        rateLimitStatus: "ok",
        capabilitySummary: {
          mode: "hybrid",
          productionStatus: "production_ready",
          supportsInboundWebhook: true,
          supportsOutboundActions: true,
          supportedWebhookEvents: ["forwarder.order.received"],
          notes: [],
        },
        lastCheckedAt: "2026-10-15T11:59:00.000Z",
        lastError: null,
        lastWebhookReceivedAt: "2026-10-15T08:00:00.000Z",
        lastRateLimitAt: null,
        lastAuthFailureAt: null,
      },
      {
        platformCode: "line-taxi",
        status: "healthy",
        reason: "none",
        credentialStatus: "valid",
        authStatus: "authenticated",
        webhookStatus: "healthy",
        rateLimitStatus: "ok",
        capabilitySummary: {
          mode: "hybrid",
          productionStatus: "production_ready",
          supportsInboundWebhook: true,
          supportsOutboundActions: true,
          supportedWebhookEvents: ["forwarder.order.received"],
          notes: [],
        },
        lastCheckedAt: "2026-10-15T11:59:00.000Z",
        lastError: null,
        lastWebhookReceivedAt: "2026-10-15T09:30:00.000Z",
        lastRateLimitAt: null,
        lastAuthFailureAt: null,
      },
      {
        platformCode: "uber",
        status: "healthy",
        reason: "stub",
        credentialStatus: "stub",
        authStatus: "stub",
        webhookStatus: "stub",
        rateLimitStatus: "ok",
        capabilitySummary: {
          mode: "stub",
          productionStatus: "stub",
          supportsInboundWebhook: true,
          supportsOutboundActions: true,
          supportedWebhookEvents: [],
          notes: [],
        },
        lastCheckedAt: "2026-10-15T11:59:00.000Z",
        lastError: null,
        lastWebhookReceivedAt: null,
        lastRateLimitAt: null,
        lastAuthFailureAt: null,
      },
    ],
    phase2SandboxKpiDashboard: null,
    roleViews: [
      {
        route: "ops",
        alertKeys: [
          "dispatch_lag",
          "recording_backlog",
          "driver_state_lag",
          "webhook_failure_burst",
          "eligibility_review_backlog",
          "adapter_degradation",
        ],
        focusAreas: [
          "dispatch",
          "recording",
          "driver_state",
          "reporting",
          "adapters",
          "forwarder_ops",
        ],
      },
      {
        route: "platform",
        alertKeys: [
          "dispatch_lag",
          "webhook_failure_burst",
          "eligibility_review_backlog",
          "adapter_degradation",
        ],
        focusAreas: [
          "dispatch",
          "webhook",
          "eligibility",
          "reporting",
          "adapters",
          "forwarder_ops",
        ],
      },
    ],
    ...overrides,
  };
}

function buildForwardedOrderRecord(input: {
  orderId: string;
  platformCode: string;
  createdAt: string;
  updatedAt?: string;
  status?: ForwardedOrderRecord["status"];
}): ForwardedOrderRecord {
  return {
    mirrorOrderId: input.orderId,
    externalOrderId: `ext-${input.orderId}`,
    platformCode: input.platformCode as PlatformCode,
    status: input.status ?? "completed_synced",
    assignedDriverId: "drv-01",
    assignedVehicleId: "veh-01",
    lastSyncError: null,
    manualFallback: {
      required: false,
      reason: null,
      escalatedAt: null,
    },
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  } as unknown as ForwardedOrderRecord;
}

function createMockAdapter(
  platformCode: PlatformCode = GRAB_TAIWAN_PLATFORM_CODE,
  overrides: Partial<ForwarderAdapterInterface> = {},
): ForwarderAdapterInterface {
  return {
    platformCode,
    capabilitySummary: {
      mode: "hybrid",
      productionStatus: "production_ready",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
      supportedWebhookEvents: ["forwarder.order.received"],
      notes: ["Mock adapter"],
    },
    accept: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "accept_ok",
    })),
    reject: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "reject_ok",
    })),
    complete: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "complete_ok",
    })),
    heartbeat: vi.fn(async () => ({
      acknowledged: true,
      platformCode,
      checkedAt: new Date().toISOString(),
    })),
    fetchEarnings: vi.fn(async () => ({
      platformCode,
      currency: "TWD",
      totalAmount: 0,
      asOf: new Date().toISOString(),
    })),
    getHealthSnapshot: vi.fn(
      async (): Promise<ForwarderAdapterHealthSnapshot> => ({
        status: "healthy",
        reason: "none",
        credentialStatus: "valid",
        authStatus: "authenticated",
        webhookStatus: "healthy",
        rateLimitStatus: "ok",
        checkedAt: "2026-10-15T11:59:00.000Z",
      }),
    ),
    ...overrides,
  };
}

function createStubAdapter(
  platformCode: PlatformCode = "UBER_TAIWAN" as PlatformCode,
): ForwarderAdapterInterface {
  return {
    platformCode,
    capabilitySummary: {
      mode: "stub",
      productionStatus: "stub",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
      supportedWebhookEvents: [],
      notes: ["Stub adapter"],
    },
    accept: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "stub_accept",
    })),
    reject: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "stub_reject",
    })),
    complete: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "stub_complete",
    })),
    heartbeat: vi.fn(async () => ({
      acknowledged: true,
      platformCode,
      checkedAt: new Date().toISOString(),
    })),
    fetchEarnings: vi.fn(async () => ({
      platformCode,
      currency: "TWD",
      totalAmount: 0,
      asOf: new Date().toISOString(),
    })),
  };
}

function createPlatformHealthPageHarness(client: PlatformHealthSourceClient) {
  const appRoot = resolve("apps/platform-admin-web");
  const realRequire = createRequire(resolve(appRoot, "package.json"));
  const realReact = realRequire("react") as typeof import("react");
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  let mounted = false;
  const effects: Array<() => unknown> = [];

  const load = createUiModuleLoader(appRoot, {
    ...workspaceModuleMocks,
    react: {
      ...realReact,
      useState: (initial: unknown) => {
        const slot = stateIndex++;
        if (!(slot in states)) {
          states[slot] =
            typeof initial === "function"
              ? (initial as () => unknown)()
              : initial;
        }
        return [
          states[slot],
          (next: unknown) => {
            states[slot] =
              typeof next === "function"
                ? (next as (prev: unknown) => unknown)(states[slot])
                : next;
          },
        ];
      },
      useRef: (initial: unknown) => {
        const slot = refIndex++;
        if (!(slot in refs)) {
          refs[slot] = { current: initial };
        }
        return refs[slot];
      },
      useEffect: (effect: () => unknown) => {
        if (!mounted) {
          effects.push(effect);
        }
      },
      useCallback: (cb: unknown) => cb,
      useMemo: (factory: () => unknown) => factory(),
    },
    "@/lib/admin-client": {
      usePlatformAdminClient: () => client,
      formatDateTime: (iso: string) =>
        iso ? new Date(iso).toLocaleString() : "—",
    },
    "@/lib/i18n": {
      useTranslation: () => ({ locale: "en" as const }),
    },
  });

  const mod = load<{
    default: () => import("react").ReactElement;
  }>(resolve(appRoot, "app/health/page.tsx"));

  const renderHtml = () => {
    stateIndex = 0;
    refIndex = 0;
    const element = mod.default();
    mounted = true;
    return renderToStaticMarkup(element);
  };

  return {
    renderHtml,
    flushEffects: async () => {
      while (effects.length > 0) {
        const effect = effects.shift()!;
        await effect();
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    },
    getLoadState: () => states[0] as HealthPageLoadState,
  };
}

async function renderOpsDashboardPageHtml(input: {
  healthResponse: () => Promise<Response>;
  observabilityEnvelope: () => Promise<unknown>;
  identity?: { realm?: string; actorType?: string } | null;
}) {
  const appRoot = resolve("apps/ops-console-web");
  const realRequire = createRequire(resolve(appRoot, "package.json"));
  const realReact = realRequire("react") as typeof import("react");
  const emptyListEnvelope = {
    data: { items: [] },
    meta: {
      requestId: "req-ops-list",
      timestamp: "2026-10-15T12:00:00.000Z",
    },
  };

  const mockClient = {
    getIdentityContext: async () =>
      input.identity !== undefined
        ? input.identity
        : { realm: "ops", actorType: "ops_user" },
    getListEnvelope: async () => emptyListEnvelope,
    getEnvelope: async (path: string) => {
      if (path === "/api/operational-observability") {
        return input.observabilityEnvelope();
      }
      throw new Error(`Unexpected path ${path}`);
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    input.healthResponse()) as unknown as typeof fetch;

  try {
    const load = createUiModuleLoader(appRoot, {
      ...workspaceModuleMocks,
      "next/link": {
        __esModule: true,
        default: ({
          href,
          children,
          className,
        }: {
          href: string;
          children: import("react").ReactNode;
          className?: string;
        }) => realReact.createElement("a", { href, className }, children),
      },
      "@/lib/api-client.server": {
        getServerOpsClient: async () => mockClient,
      },
      "@/lib/server-locale": {
        getServerLocale: async () => "en" as const,
      },
    });

    const mod = load<{
      default: () => Promise<import("react").ReactElement>;
    }>(resolve(appRoot, "app/dashboard/page.tsx"));
    const element = await mod.default();
    return renderToStaticMarkup(element);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("HEALTH-OBSERVABILITY-SOURCE-TRUTH-20261015", () => {
  describe("1. health-observability_actual-Platform-and-Ops-unknown-zero-error-stale-source", () => {
    it("captures the pre-repair bug where a first rejected read turned into fake 0/ok/no-alert and Ops marked healthy/live/fresh", () => {
      const legacyPlatformFallback = {
        generatedAt: new Date("2026-10-15T12:00:00.000Z").toISOString(),
        alerts: [] as OperationalObservabilitySnapshot["alerts"],
        dispatch: { oldestReadyOrderLagMinutes: null, laggedOrders: 0 },
        webhook: { queuedDeliveries: 0, failedDeliveriesLastHour: 0 },
        reporting: { failedJobs: 0, queuedJobs: 0 },
      };
      expect(legacyPlatformFallback.alerts).toHaveLength(0);
      expect(
        legacyPlatformFallback.dispatch.oldestReadyOrderLagMinutes != null
          ? "watch"
          : "ok",
      ).toBe("ok");

      const healthyLiveness = {
        service: "api",
        status: "healthy",
        mode: "development",
        execution_mode: "in_memory",
        timestamp: "2026-10-15T12:00:00.000Z",
      };
      const legacyOpsAdapters: OperationalObservabilitySnapshot["adapterDetails"] =
        [];
      const legacyOpsDegraded = legacyOpsAdapters.filter(
        (item) => item.status !== "healthy",
      );
      const legacyOpsStatus =
        healthyLiveness.status === "down"
          ? "down"
          : legacyOpsDegraded.length > 0
            ? "degraded"
            : "healthy";
      expect(legacyOpsStatus).toBe("healthy");
    });

    it("distinguishes initial, loading, permission_denied, unavailable, empty, successful_zero, nonzero, and stale states in Platform /health", async () => {
      // 1. Initial & Loading states
      const initialState = createInitialHealthPageState();
      expect(initialState.observability.status).toBe("initial");
      expect(initialState.observability.posture).toBe("unknown");
      expect(initialState.observability.sourceTimestamp).toBeNull();

      const initialVm = buildPlatformHealthViewModel(initialState, "en");
      expect(initialVm.loading).toBe(true);
      expect(initialVm.kpis.dispatch.value).toBe("—");
      expect(initialVm.kpis.dispatch.delta).toBeUndefined();
      expect(initialVm.kpis.webhook.value).toBe("—");
      expect(initialVm.alertsEmptyState.kind).toBe("loading");

      const loadingState = beginHealthPageLoad(initialState);
      expect(loadingState.observability.status).toBe("loading");
      const loadingVm = buildPlatformHealthViewModel(loadingState, "en");
      expect(loadingVm.loading).toBe(true);
      expect(loadingVm.kpis.dispatch.value).toBe("—");
      expect(loadingVm.alertsEmptyState.kind).toBe("loading");

      // 2. First read rejected with 503 Unavailable (while adapters endpoint succeeds independently!)
      const validAdapters: AdapterHealthRecord[] = [
        {
          platformCode: "yoxi" as PlatformCode,
          status: "healthy",
          reason: "none",
          credentialStatus: "valid",
          authStatus: "authenticated",
          webhookStatus: "healthy",
          rateLimitStatus: "ok",
          capabilitySummary: {
            mode: "hybrid",
            productionStatus: "production_ready",
            supportsInboundWebhook: true,
            supportsOutboundActions: true,
            supportedWebhookEvents: ["forwarder.order.received"],
            notes: [],
          },
          lastCheckedAt: "2026-10-15T11:58:00.000Z",
          lastWebhookReceivedAt: "2026-10-15T11:40:00.000Z",
          lastError: null,
          lastRateLimitAt: null,
          lastAuthFailureAt: null,
        },
      ];

      const unavailableClient: PlatformHealthSourceClient = {
        getOperationalObservability: vi
          .fn<() => Promise<OperationalObservabilitySnapshot>>()
          .mockRejectedValue(
            new ApiClientError({
              statusCode: 503,
              code: "SERVICE_UNAVAILABLE",
              message: "Observability collector unavailable",
              retryable: true,
              rawBody: '{"error":{"code":"SERVICE_UNAVAILABLE"}}',
            }),
          ),
        getForwarderAdaptersHealth: vi
          .fn<() => Promise<AdapterHealthRecord[]>>()
          .mockResolvedValue(validAdapters),
        listForwarderOrders: vi
          .fn<() => Promise<ForwardedOrderRecord[]>>()
          .mockRejectedValue(
            new ApiClientError({
              statusCode: 503,
              code: "SERVICE_UNAVAILABLE",
              message: "Forwarder orders unavailable",
              retryable: true,
              rawBody: '{"error":{"code":"SERVICE_UNAVAILABLE"}}',
            }),
          ),
      };

      const unavailableState = await loadPlatformHealthSources(
        unavailableClient,
        loadingState,
        { uiRefreshedAt: "2026-10-15T12:01:00.000Z" },
      );
      expect(unavailableState.observability.status).toBe("unavailable");
      expect(unavailableState.observability.posture).toBe("unknown");
      expect(unavailableState.observability.data).toBeNull();
      expect(unavailableState.observability.sourceTimestamp).toBeNull();
      expect(unavailableState.uiRefreshedAt).toBe("2026-10-15T12:01:00.000Z");

      // Independent adapters section succeeded and is preserved!
      expect(unavailableState.adapters.status).toBe("ready");
      expect(unavailableState.adapters.data).toHaveLength(1);

      const unavailableVm = buildPlatformHealthViewModel(
        unavailableState,
        "en",
      );
      expect(unavailableVm.kpis.dispatch.value).toBe("Unknown");
      expect(unavailableVm.kpis.dispatch.delta).toBe("Unavailable");
      expect(unavailableVm.kpis.dispatch.deltaTone).toBe("neutral");
      expect(unavailableVm.kpis.webhook.value).toBe("Unknown");
      expect(unavailableVm.kpis.webhook.delta).toBe("Unavailable");
      expect(unavailableVm.kpis.reporting.value).toBe("Unknown");
      expect(unavailableVm.kpis.reporting.delta).toBe("Unavailable");
      expect(
        unavailableVm.dispatchSummary.every((item) => item.value === "Unknown"),
      ).toBe(true);
      expect(unavailableVm.alertsEmptyState.kind).toBe("unavailable");
      expect(unavailableVm.alertsEmptyState.message).not.toContain(
        "No active alerts.",
      );
      expect(unavailableVm.adapterRows).toHaveLength(1);
      expect(unavailableVm.adapterRows[0]?.adapter).toBe("yoxi");
      expect(unavailableVm.adapterRows[0]?.orders24h).toBe("—");
      expect(unavailableVm.adapterRows[0]?.orders24hCount).toBeNull();

      // Render actual HealthPage component on first rejected read
      const harness = createPlatformHealthPageHarness(unavailableClient);
      const initialHtml = harness.renderHtml();
      expect(initialHtml).toContain("Loading alerts...");
      await harness.flushEffects();
      const failedHtml = harness.renderHtml();
      expect(failedHtml).toContain("Unable to refresh platform health");
      expect(failedHtml).toContain("Observability collector unavailable");
      expect(failedHtml).not.toContain("No active alerts.");
      expect(failedHtml).not.toContain("0 lagged orders are above threshold");
      expect(failedHtml).toContain("Yoxi channel");

      // 3. First read rejected with 403 Permission Denied
      const deniedState = await loadPlatformHealthSources(
        {
          getOperationalObservability: async () => {
            throw new ApiClientError({
              statusCode: 403,
              code: "FORBIDDEN",
              message: "Insufficient scope audit:read",
              retryable: false,
              rawBody: '{"error":{"code":"FORBIDDEN"}}',
            });
          },
          getForwarderAdaptersHealth: async () => {
            throw new ApiClientError({
              statusCode: 403,
              code: "FORBIDDEN",
              message: "Forbidden adapter health",
              retryable: false,
              rawBody: '{"error":{"code":"FORBIDDEN"}}',
            });
          },
          listForwarderOrders: async () => {
            throw new ApiClientError({
              statusCode: 403,
              code: "FORBIDDEN",
              message: "Forbidden orders",
              retryable: false,
              rawBody: '{"error":{"code":"FORBIDDEN"}}',
            });
          },
        },
        createInitialHealthPageState(),
        { uiRefreshedAt: "2026-10-15T12:02:00.000Z" },
      );
      expect(deniedState.observability.status).toBe("permission_denied");
      expect(deniedState.observability.sourceTimestamp).toBeNull();
      const deniedVm = buildPlatformHealthViewModel(deniedState, "en");
      expect(deniedVm.kpis.dispatch.value).toBe("Unknown");
      expect(deniedVm.kpis.dispatch.delta).toBe("Permission Denied");
      expect(deniedVm.alertsEmptyState.kind).toBe("permission_denied");
      expect(deniedVm.alertsEmptyState.message).toContain("Permission Denied");
      expect(deniedVm.adaptersEmptyState.kind).toBe("permission_denied");

      // 4. Empty vs Successful Zero vs Nonzero postures
      const emptySnapshot = buildBaseObservabilitySnapshot({
        alerts: [],
        dispatch: {
          activeOrders: 0,
          queueDepth: 0,
          laggedOrders: 0,
          redispatchOrders: 0,
          exceptionHoldOrders: 0,
          dispatchFailedOrders: 0,
          oldestReadyOrderLagMinutes: null,
        },
        recording: {
          phoneOrders: 0,
          linkedOrders: 0,
          pendingOrders: 0,
          pendingCallSessions: 0,
          missingRecordingLinks: 0,
          oldestPendingLagMinutes: null,
          linkedRatioPercent: 100,
        },
        driverState: {
          totalDrivers: 0,
          availableDrivers: 0,
          dispatchEligibleDrivers: 0,
          offlineDrivers: 0,
          staleLocationDrivers: 0,
          missingLocationDrivers: 0,
          oldestLocationLagMinutes: null,
        },
        webhook: {
          totalEndpoints: 0,
          activeEndpoints: 0,
          disabledEndpoints: 0,
          queuedDeliveries: 0,
          failedDeliveriesLastHour: 0,
          oldestQueuedDeliveryLagMinutes: null,
        },
        adapters: {
          totalAdapters: 0,
          healthyAdapters: 0,
          degradedAdapters: 0,
          downAdapters: 0,
        },
        forwarderOps: {
          totalForwardedOrders: 0,
          syncFailedOrders: 0,
          acceptPendingOrders: 0,
          manualFallbackQueue: 0,
          reconciliationQueue: 0,
          oldestSyncFailedLagMinutes: null,
          oldestAcceptPendingLagMinutes: null,
          oldestManualFallbackLagMinutes: null,
          oldestReconciliationLagMinutes: null,
        },
        adapterDetails: [],
      });
      const zeroOrdersSpy = vi.fn<() => Promise<ForwardedOrderRecord[]>>();
      const emptyState = await loadPlatformHealthSources({
        getOperationalObservability: async () => emptySnapshot,
        getForwarderAdaptersHealth: async () => validAdapters,
        listForwarderOrders: zeroOrdersSpy,
      });
      expect(zeroOrdersSpy).not.toHaveBeenCalled();
      expect(emptyState.observability.status).toBe("ready");
      expect(emptyState.observability.posture).toBe("empty");
      expect(emptyState.forwardedOrders.status).toBe("ready");
      expect(emptyState.forwardedOrders.posture).toBe("empty");
      const emptyVm = buildPlatformHealthViewModel(emptyState, "en");
      expect(emptyVm.adapterRows[0]?.orders24h).toBe("0");
      expect(emptyVm.adapterRows[0]?.orders24hProvenance).toBe("window_24h");

      const successfulZeroSnapshot = buildBaseObservabilitySnapshot({
        adapters: {
          totalAdapters: 2,
          healthyAdapters: 2,
          degradedAdapters: 0,
          downAdapters: 0,
        },
        adapterDetails: buildBaseObservabilitySnapshot().adapterDetails.slice(
          0,
          2,
        ),
      });
      const successfulZeroState = await loadPlatformHealthSources({
        getOperationalObservability: async () => successfulZeroSnapshot,
        getForwarderAdaptersHealth: async () => validAdapters,
        listForwarderOrders: async () => [],
      });
      expect(successfulZeroState.observability.status).toBe("ready");
      expect(successfulZeroState.observability.posture).toBe("successful_zero");
      const zeroVm = buildPlatformHealthViewModel(successfulZeroState, "en");
      expect(zeroVm.kpis.webhook.value).toBe("0");
      expect(zeroVm.kpis.webhook.delta).toBe("ok");
      expect(zeroVm.alertsEmptyState.kind).toBe("empty");
      expect(zeroVm.alertsEmptyState.message).toBe("No active alerts.");

      const nonzeroSnapshot = buildBaseObservabilitySnapshot({
        generatedAt: "2026-10-15T12:05:00.000Z",
        dispatch: {
          activeOrders: 4,
          queueDepth: 2,
          laggedOrders: 1,
          redispatchOrders: 1,
          exceptionHoldOrders: 0,
          dispatchFailedOrders: 0,
          oldestReadyOrderLagMinutes: 26,
        },
        alerts: [
          {
            key: "dispatch_lag",
            state: "critical",
            routes: ["ops", "platform"],
            measuredValue: 26,
            thresholds: { warning: 10, critical: 20, unit: "minutes" },
            observedAt: "2026-10-15T12:05:00.000Z",
          },
        ],
      });
      const nonzeroState = await loadPlatformHealthSources(
        {
          getOperationalObservability: async () => nonzeroSnapshot,
          getForwarderAdaptersHealth: async () => validAdapters,
          listForwarderOrders: async () => [],
        },
        successfulZeroState,
        { uiRefreshedAt: "2026-10-15T12:05:01.000Z" },
      );
      expect(nonzeroState.observability.status).toBe("ready");
      expect(nonzeroState.observability.posture).toBe("nonzero");
      expect(nonzeroState.observability.sourceTimestamp).toBe(
        "2026-10-15T12:05:00.000Z",
      );

      // 5. Later failed refresh retains prior valid data ONLY with original source timestamp & explicit stale status
      const staleState = await loadPlatformHealthSources(
        {
          getOperationalObservability: async () => {
            throw new ApiClientError({
              statusCode: 503,
              code: "SERVICE_UNAVAILABLE",
              message: "Upstream observability timeout on refresh",
              retryable: true,
              rawBody: "{}",
            });
          },
          getForwarderAdaptersHealth: async () => validAdapters,
          listForwarderOrders: async () => [],
        },
        nonzeroState,
        { uiRefreshedAt: "2026-10-15T12:10:00.000Z" },
      );
      expect(staleState.observability.status).toBe("stale");
      expect(staleState.observability.staleReason).toBe("unavailable");
      expect(staleState.observability.sourceTimestamp).toBe(
        "2026-10-15T12:05:00.000Z",
      );
      expect(staleState.uiRefreshedAt).toBe("2026-10-15T12:10:00.000Z");

      const staleVm = buildPlatformHealthViewModel(staleState, "en");
      expect(staleVm.kpis.dispatch.value).toBe("26 min");
      expect(staleVm.kpis.dispatch.delta).toContain("stale");
      expect(staleVm.kpis.dispatch.deltaTone).toBe("neutral");
      expect(staleVm.banner?.tone).toBe("warn");
      expect(staleVm.banner?.body).toContain(
        "Upstream observability timeout on refresh",
      );

      // 6. Recovery to a true source response on subsequent refresh
      const recoveredSnapshot = buildBaseObservabilitySnapshot({
        generatedAt: "2026-10-15T12:15:00.000Z",
      });
      const recoveredState = await loadPlatformHealthSources(
        {
          getOperationalObservability: async () => recoveredSnapshot,
          getForwarderAdaptersHealth: async () => validAdapters,
          listForwarderOrders: async () => [],
        },
        staleState,
        { uiRefreshedAt: "2026-10-15T12:15:01.000Z" },
      );
      expect(recoveredState.observability.status).toBe("ready");
      expect(recoveredState.observability.staleReason).toBeNull();
      expect(recoveredState.observability.sourceTimestamp).toBe(
        "2026-10-15T12:15:00.000Z",
      );
      const recoveredVm = buildPlatformHealthViewModel(recoveredState, "en");
      expect(recoveredVm.banner).toBeNull();
      expect(recoveredVm.kpis.webhook.delta).toBe("ok");
    });

    it("prevents Ops /dashboard from reporting healthy/fresh/live/0/within-SLA when /api/operational-observability fails despite healthy /api/health", async () => {
      const healthyLiveness = {
        service: "api",
        status: "healthy",
        mode: "development",
        execution_mode: "in_memory",
        timestamp: "2026-10-15T12:00:00.000Z",
      };

      const initialOps = createInitialOpsObservabilityReadState();
      expect(initialOps.status).toBe("initial");
      expect(initialOps.posture).toBe("unknown");
      const loadingOps = createLoadingOpsObservabilityReadState(initialOps);
      expect(loadingOps.status).toBe("loading");

      // 1. First read fails with 503 Unavailable while /api/health is healthy
      const unavailableOps = await loadOpsObservabilityReadState(
        async () => {
          throw new ApiClientError({
            statusCode: 503,
            code: "SERVICE_UNAVAILABLE",
            message: "Observability endpoint down",
            retryable: true,
            rawBody: "{}",
          });
        },
        { uiRefreshedAt: "2026-10-15T12:01:00.000Z" },
      );
      expect(unavailableOps.status).toBe("unavailable");
      expect(unavailableOps.posture).toBe("unknown");
      expect(unavailableOps.snapshot).toBeNull();
      expect(unavailableOps.sourceGeneratedAt).toBeNull();

      const healthEnvelope = buildOpsHealthEnvelope(
        healthyLiveness,
        unavailableOps,
      );
      expect(healthEnvelope.status).toBe("degraded");
      expect(healthEnvelope.degradedServices).toEqual([
        {
          service: "operational-observability",
          impact: "dashboard.section.banner.serviceImpact.unavailable",
          severity: "warning",
        },
      ]);

      const refreshMeta = buildOpsRefreshMetadata({
        observabilityState: unavailableOps,
        otherSourceTimestamps: ["2026-10-15T12:00:00.000Z"],
        healthEnvelope,
        nowMs: Date.parse("2026-10-15T12:01:00.000Z"),
      });
      expect(refreshMeta.dataFreshness).toBe("unknown");
      expect(refreshMeta.source).toBe("static");
      expect(refreshMeta.generatedAt).toBe("");

      const staleLocationKpi = resolveOpsStaleLocationKpi({
        observabilityState: unavailableOps,
        offlineVehicles: 0,
        locale: "en",
      });
      expect(staleLocationKpi.value).toBe("—");
      expect(staleLocationKpi.delta).toBe("unknown");

      const adapterEmpty = resolveOpsAdapterEmptyState(unavailableOps);
      expect(adapterEmpty.reason).toBe("fetch_failed");

      const signals = buildOpsObservabilitySignals({
        observabilityState: unavailableOps,
        sortedAdapterDetails: [],
        identity: { realm: "ops", actorType: "ops_user" },
        health: healthyLiveness,
        locale: "en",
      });
      expect(signals[0]).toEqual({
        label: "Dispatch lag",
        value: "unknown",
        tone: "danger",
      });
      expect(signals[1]).toEqual({
        label: "Webhook delivery p95",
        value: "unknown",
        tone: "danger",
      });

      const opsUnavailableHtml = await renderOpsDashboardPageHtml({
        healthResponse: async () =>
          new Response(JSON.stringify(healthyLiveness), { status: 200 }),
        observabilityEnvelope: async () => {
          throw new ApiClientError({
            statusCode: 503,
            code: "SERVICE_UNAVAILABLE",
            message: "Observability unavailable",
            retryable: true,
            rawBody: "{}",
          });
        },
      });
      expect(opsUnavailableHtml).toContain("Critical dependency degraded");
      expect(opsUnavailableHtml).toContain("operational-observability");
      expect(opsUnavailableHtml).toContain("Unable to load data");
      expect(opsUnavailableHtml).not.toContain("within SLA");
      expect(opsUnavailableHtml).not.toContain("Not provisioned");

      // 2. First read fails with 403 Permission Denied
      const deniedOps = await loadOpsObservabilityReadState(async () => {
        throw new ApiClientError({
          statusCode: 403,
          code: "FORBIDDEN",
          message: "Realm or role denied",
          retryable: false,
          rawBody: "{}",
        });
      });
      expect(deniedOps.status).toBe("permission_denied");
      expect(resolveOpsAdapterEmptyState(deniedOps).reason).toBe(
        "permission_denied",
      );

      // 3. Valid read followed by failed refresh retains original timestamp as stale/cache and then recovers
      const validSnapshot = buildBaseObservabilitySnapshot({
        generatedAt: "2026-10-15T12:00:00.000Z",
        driverState: {
          totalDrivers: 4,
          availableDrivers: 3,
          dispatchEligibleDrivers: 3,
          offlineDrivers: 1,
          staleLocationDrivers: 2,
          missingLocationDrivers: 0,
          oldestLocationLagMinutes: 9,
        },
      });
      const readyOps = await loadOpsObservabilityReadState(async () => ({
        data: validSnapshot,
        meta: {
          requestId: "req-1",
          timestamp: "2026-10-15T12:00:00.000Z",
        },
      }));
      expect(readyOps.status).toBe("ready");
      expect(readyOps.posture).toBe("nonzero");
      expect(readyOps.sourceGeneratedAt).toBe("2026-10-15T12:00:00.000Z");

      const staleOps = await loadOpsObservabilityReadState(
        async () => {
          throw new Error("Refresh failed with 503");
        },
        {
          priorState: readyOps,
          uiRefreshedAt: "2026-10-15T12:05:00.000Z",
        },
      );
      expect(staleOps.status).toBe("stale");
      expect(staleOps.sourceGeneratedAt).toBe("2026-10-15T12:00:00.000Z");
      expect(staleOps.uiRefreshedAt).toBe("2026-10-15T12:05:00.000Z");

      const staleEnvelope = buildOpsHealthEnvelope(healthyLiveness, staleOps);
      expect(staleEnvelope.status).toBe("degraded");
      const staleRefresh = buildOpsRefreshMetadata({
        observabilityState: staleOps,
        healthEnvelope: staleEnvelope,
        nowMs: Date.parse("2026-10-15T12:00:05.000Z"),
      });
      expect(staleRefresh.dataFreshness).toBe("stale");
      expect(staleRefresh.source).toBe("cache");
      expect(staleRefresh.generatedAt).toBe("2026-10-15T12:00:00.000Z");

      const recoveredOps = await loadOpsObservabilityReadState(
        async () => ({
          data: buildBaseObservabilitySnapshot({
            generatedAt: "2026-10-15T12:06:00.000Z",
            adapters: {
              totalAdapters: 2,
              healthyAdapters: 2,
              degradedAdapters: 0,
              downAdapters: 0,
            },
            adapterDetails:
              buildBaseObservabilitySnapshot().adapterDetails.slice(0, 2),
          }),
          meta: {
            requestId: "req-2",
            timestamp: "2026-10-15T12:06:00.000Z",
          },
        }),
        {
          priorState: staleOps,
          uiRefreshedAt: "2026-10-15T12:06:01.000Z",
        },
      );
      expect(recoveredOps.status).toBe("ready");
      const recoveredEnvelope = buildOpsHealthEnvelope(
        healthyLiveness,
        recoveredOps,
      );
      expect(recoveredEnvelope.status).toBe("healthy");
      const recoveredRefresh = buildOpsRefreshMetadata({
        observabilityState: recoveredOps,
        healthEnvelope: recoveredEnvelope,
        nowMs: Date.parse("2026-10-15T12:06:05.000Z"),
      });
      expect(recoveredRefresh.dataFreshness).toBe("fresh");
      expect(recoveredRefresh.source).toBe("live");
    });
  });

  describe("2. health-observability_actual-per-adapter24h-and-latest-event-provenance", () => {
    it("computes per-adapter 24h order counts over the true 24h window without dividing global total, and preserves legitimate 0 vs missing/denied source", async () => {
      const referenceTimestamp = "2026-10-15T12:00:00.000Z";
      const orders: ForwardedOrderRecord[] = [
        // yoxi: 3 within 24h, 2 older than 24h
        buildForwardedOrderRecord({
          orderId: "ord-yoxi-1",
          platformCode: "yoxi",
          createdAt: "2026-10-15T11:30:00.000Z",
        }),
        buildForwardedOrderRecord({
          orderId: "ord-yoxi-2",
          platformCode: "yoxi",
          createdAt: "2026-10-15T01:00:00.000Z",
        }),
        buildForwardedOrderRecord({
          orderId: "ord-yoxi-3",
          platformCode: "yoxi",
          createdAt: "2026-10-14T12:00:00.000Z", // exact 24h boundary
        }),
        buildForwardedOrderRecord({
          orderId: "ord-yoxi-old-1",
          platformCode: "yoxi",
          createdAt: "2026-10-14T11:59:59.000Z", // 1s older than 24h
        }),
        buildForwardedOrderRecord({
          orderId: "ord-yoxi-old-2",
          platformCode: "yoxi",
          createdAt: "2026-10-10T08:00:00.000Z",
        }),
        // line-taxi: 1 within 24h, 3 older than 24h
        buildForwardedOrderRecord({
          orderId: "ord-line-1",
          platformCode: "line-taxi",
          createdAt: "2026-10-15T06:00:00.000Z",
        }),
        buildForwardedOrderRecord({
          orderId: "ord-line-old-1",
          platformCode: "line-taxi",
          createdAt: "2026-10-13T06:00:00.000Z",
        }),
        buildForwardedOrderRecord({
          orderId: "ord-line-old-2",
          platformCode: "line-taxi",
          createdAt: "2026-10-12T06:00:00.000Z",
        }),
        buildForwardedOrderRecord({
          orderId: "ord-line-old-3",
          platformCode: "line-taxi",
          createdAt: "2026-10-11T06:00:00.000Z",
        }),
        // uber: 0 within 24h, 6 older than 24h (total across all adapters = 15)
        ...Array.from({ length: 6 }, (_, idx) =>
          buildForwardedOrderRecord({
            orderId: `ord-uber-old-${idx + 1}`,
            platformCode: "uber",
            createdAt: "2026-10-09T10:00:00.000Z",
          }),
        ),
      ];

      const snapshot = buildBaseObservabilitySnapshot({
        generatedAt: referenceTimestamp,
      });

      const loadedState = await loadPlatformHealthSources(
        {
          getOperationalObservability: async () => snapshot,
          getForwarderAdaptersHealth: async () => snapshot.adapterDetails,
          listForwarderOrders: async () => orders,
        },
        createInitialHealthPageState(),
        { uiRefreshedAt: "2026-10-15T12:00:05.000Z" },
      );

      const vm = buildPlatformHealthViewModel(loadedState, "en");
      expect(vm.forwarderOpsSummary.totalForwardedOrders).toBe(15);

      const yoxiRow = vm.adapterRows.find((row) => row.adapter === "yoxi");
      const lineRow = vm.adapterRows.find((row) => row.adapter === "line-taxi");
      const uberRow = vm.adapterRows.find((row) => row.adapter === "uber");

      expect(yoxiRow?.orders24hCount).toBe(3);
      expect(yoxiRow?.orders24h).toBe("3");
      expect(yoxiRow?.orders24hProvenance).toBe("window_24h");

      expect(lineRow?.orders24hCount).toBe(1);
      expect(lineRow?.orders24h).toBe("1");
      expect(lineRow?.orders24hProvenance).toBe("window_24h");

      expect(uberRow?.orders24hCount).toBe(0);
      expect(uberRow?.orders24h).toBe("0");
      expect(uberRow?.orders24hProvenance).toBe("window_24h");

      const deniedOrdersMap = computePerAdapterOrders24h({
        adapters: snapshot.adapterDetails,
        forwardedOrdersState: { status: "permission_denied", data: null },
        referenceTimestamp,
        locale: "en",
      });
      expect(deniedOrdersMap.get("yoxi")).toEqual({
        count: null,
        formatted: "—",
        provenance: "permission_denied",
      });
      expect(deniedOrdersMap.get("uber")).toEqual({
        count: null,
        formatted: "—",
        provenance: "permission_denied",
      });
    });

    it("selects the latest valid actual event across webhook, rate_limit, and auth_failure and distinguishes source check time and UI refresh time", () => {
      // 1. Newer rate_limit event beats older webhook event
      const rateLimitLatest = selectAdapterLatestEvent(
        {
          lastWebhookReceivedAt: "2026-10-15T08:00:00.000Z",
          lastRateLimitAt: "2026-10-15T11:45:00.000Z",
          lastAuthFailureAt: "2026-10-15T09:30:00.000Z",
          lastCheckedAt: "2026-10-15T12:00:00.000Z",
        },
        "en",
        "2026-10-15T12:01:00.000Z",
      );
      expect(rateLimitLatest.provenance).toBe("actual_event");
      expect(rateLimitLatest.lastEventKind).toBe("rate_limit");
      expect(rateLimitLatest.lastEventAt).toBe("2026-10-15T11:45:00.000Z");
      expect(rateLimitLatest.lastCheckedAt).toBe("2026-10-15T12:00:00.000Z");
      expect(rateLimitLatest.uiRefreshedAt).toBe("2026-10-15T12:01:00.000Z");

      // 2. Newer auth_failure event beats older webhook and rate_limit events
      const authFailureLatest = selectAdapterLatestEvent(
        {
          lastWebhookReceivedAt: "2026-10-15T10:00:00.000Z",
          lastRateLimitAt: "2026-10-15T10:30:00.000Z",
          lastAuthFailureAt: "2026-10-15T11:50:00.000Z",
          lastCheckedAt: "2026-10-15T12:00:00.000Z",
        },
        "en",
        "2026-10-15T12:01:00.000Z",
      );
      expect(authFailureLatest.provenance).toBe("actual_event");
      expect(authFailureLatest.lastEventKind).toBe("auth_failure");
      expect(authFailureLatest.lastEventAt).toBe("2026-10-15T11:50:00.000Z");

      // 3. No actual event, but valid lastCheckedAt -> check_only provenance
      const checkOnly = selectAdapterLatestEvent(
        {
          lastWebhookReceivedAt: null,
          lastRateLimitAt: null,
          lastAuthFailureAt: null,
          lastCheckedAt: "2026-10-15T11:59:00.000Z",
        },
        "en",
        "2026-10-15T12:01:00.000Z",
      );
      expect(checkOnly.provenance).toBe("check_only");
      expect(checkOnly.lastEventAt).toBeNull();
      expect(checkOnly.lastEventKind).toBeNull();
      expect(checkOnly.lastCheckedAt).toBe("2026-10-15T11:59:00.000Z");
      expect(checkOnly.formattedLastEvent).toBe("—");

      // 4. Invalid or missing timestamps stay unknown (never "Invalid Date")
      const invalidTimestamps = selectAdapterLatestEvent(
        {
          lastWebhookReceivedAt: "not-a-timestamp",
          lastRateLimitAt: "",
          lastAuthFailureAt: null,
          lastCheckedAt: "invalid-check-time",
        },
        "en",
        "not-a-refresh-time",
      );
      expect(invalidTimestamps.provenance).toBe("unknown");
      expect(invalidTimestamps.lastEventAt).toBeNull();
      expect(invalidTimestamps.lastCheckedAt).toBeNull();
      expect(invalidTimestamps.uiRefreshedAt).toBeNull();
      expect(invalidTimestamps.formattedLastEvent).toBe("Unknown");
      expect(invalidTimestamps.formattedLastEvent).not.toContain(
        "Invalid Date",
      );
    });
  });

  describe("3. health-observability_original-alert-role-auth-stub-and-positive-regressions", () => {
    it("preserves C108 ForwarderService failure classifications, stub/production_ready identity, valid queue 0 vs null lag, role/realm/scope metadata, and end-to-end ApiClient consumer wiring", async () => {
      const liveGrabAdapter = createMockAdapter(GRAB_TAIWAN_PLATFORM_CODE);
      const stubUberAdapter = createStubAdapter("UBER_TAIWAN" as PlatformCode);

      const auditNotificationService = new AuditNotificationService();
      const regulatoryRegistryService = {
        listDrivers: vi.fn(() => []),
        listLatestDriverLocations: vi.fn(() => []),
      };
      const ownedOrders: Array<Record<string, unknown>> = [];
      const dispatchJobs: Array<Record<string, unknown>> = [];
      const ownedMobilityService = {
        cancelForwarderTasks: vi.fn(() => []),
        registerForwarderSource: vi.fn(),
        listDriverTasks: vi.fn(() => []),
        listOrders: vi.fn(() => ownedOrders),
        listDispatchJobs: vi.fn(() => dispatchJobs),
      };
      const forwarderRepository = {
        loadState: vi.fn(async () => ({
          forwardedOrders: [],
          adapterHealth: [],
        })),
        persistChanges: vi.fn(async () => undefined),
      };

      const forwarderService = new ForwarderService(
        regulatoryRegistryService as never,
        auditNotificationService as never,
        [liveGrabAdapter, stubUberAdapter],
        forwarderRepository as never,
        ownedMobilityService as never,
      );
      await forwarderService.onModuleInit();

      const callcenterService = { listCallSessions: vi.fn(() => []) };
      const reportingFilingService = { listReportJobs: vi.fn(() => []) };
      const tenantPartnerService = {
        listPartnerEligibilityReviewQueue: vi.fn(() => []),
        summarizeWebhookDeliveryHealth: vi.fn(() => ({
          failedDeliveriesLastHour: 0,
          pendingDeliveries: 0,
        })),
      };

      const observabilityService = new OperationalObservabilityService(
        ownedMobilityService as never,
        callcenterService as never,
        regulatoryRegistryService as never,
        forwarderService as never,
        reportingFilingService as never,
        tenantPartnerService as never,
      );

      // Verify OperationalObservabilityController realm & scope governance metadata
      const controllerProto = OperationalObservabilityController.prototype;
      const realms = Reflect.getMetadata(
        AUTH_ALLOWED_REALMS_KEY,
        controllerProto.getSnapshot,
      );
      const scopes = Reflect.getMetadata(
        AUTH_REQUIRED_SCOPES_KEY,
        controllerProto.getSnapshot,
      );
      expect(realms).toEqual(["platform", "ops"]);
      expect(scopes).toEqual(["audit:read"]);

      // Valid queue 0 lag minutes vs null lag when queue is empty
      const emptyQueueSnapshot = await observabilityService.getSnapshot();
      expect(emptyQueueSnapshot.dispatch.queueDepth).toBe(0);
      expect(
        emptyQueueSnapshot.dispatch.oldestReadyOrderLagMinutes,
      ).toBeNull();

      const nowIso = new Date().toISOString();
      ownedOrders.push({
        orderId: "ord-ready-zero-lag",
        status: "ready_for_dispatch",
        orderSource: "app",
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      dispatchJobs.push({
        dispatchJobId: "job-ready-zero-lag",
        orderId: "ord-ready-zero-lag",
        status: "queued",
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const zeroLagSnapshot = await observabilityService.getSnapshot();
      expect(zeroLagSnapshot.dispatch.queueDepth).toBe(1);
      expect(zeroLagSnapshot.dispatch.oldestReadyOrderLagMinutes).toBe(0);

      // Ingest forwarded order and exercise C108 failure classifications: 429 rate_limit, webhook, credential, 401 auth
      const grabOrder = forwarderService.ingestExternalOrder({
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: "grab-c108-order-1",
        payload: { serviceBucket: "standard_taxi" },
      });

      forwarderService.reportSyncFailure(grabOrder.mirrorOrderId, {
        errorCode: "RATE_LIMIT_EXCEEDED",
        errorMessage: "HTTP 429 rate limit reached",
        retryable: true,
      });
      let grabHealth = forwarderService
        .listAdapterHealth()
        .find((h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE);
      expect(grabHealth?.reason).toBe("rate_limit");
      expect(grabHealth?.rateLimitStatus).toBe("limited");
      expect(grabHealth?.lastRateLimitAt).toBeDefined();

      forwarderService.reportSyncFailure(grabOrder.mirrorOrderId, {
        errorCode: "AUTH_TOKEN_EXPIRED",
        errorMessage: "OAuth token 401 reauth required",
        retryable: true,
      });
      grabHealth = forwarderService
        .listAdapterHealth()
        .find((h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE);
      expect(grabHealth?.reason).toBe("auth");
      expect(grabHealth?.authStatus).toBe("reauth_required");
      expect(grabHealth?.lastAuthFailureAt).toBeDefined();

      // Wire real ApiClient against in-memory fetch backed by OperationalObservabilityController & ForwarderController
      const controller = new OperationalObservabilityController(
        observabilityService,
      );
      const forwarderController = new ForwarderController(forwarderService);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (inputUrl: RequestInfo | URL) => {
        const url = new URL(String(inputUrl));
        if (url.pathname === "/api/operational-observability") {
          const envelope = await controller.getSnapshot("req-c108-e2e");
          return new Response(JSON.stringify(envelope), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname === "/api/forwarder/adapters/health") {
          return new Response(
            JSON.stringify(
              forwarderController.listAdapterHealth("req-adapters"),
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.pathname === "/api/forwarder/orders") {
          return new Response(
            JSON.stringify(
              forwarderController.listForwardedOrders("req-orders"),
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not Found", { status: 404 });
      }) as unknown as typeof fetch;

      try {
        const apiClient = new ApiClient({ baseUrl: "http://drts.local" });
        const platformState = await loadPlatformHealthSources(apiClient);
        expect(platformState.observability.status).toBe("ready");
        expect(platformState.adapters.status).toBe("ready");
        expect(platformState.forwardedOrders.status).toBe("ready");

        const platformVm = buildPlatformHealthViewModel(platformState, "en");
        // Valid queue 0 lag renders "0 min" (distinct from "—" when null)
        expect(platformVm.kpis.dispatch.value).toBe("0 min");
        expect(platformVm.kpis.dispatch.delta).toBe("ok");
        expect(
          platformVm.activeAlerts.some((a) => a.key === "adapter_degradation"),
        ).toBe(true);

        const grabRow = platformVm.adapterRows.find(
          (r) => r.adapter === GRAB_TAIWAN_PLATFORM_CODE,
        );
        const uberRow = platformVm.adapterRows.find(
          (r) => r.adapter === "UBER_TAIWAN",
        );

        expect(grabRow?.mode).toBe("hybrid");
        expect(grabRow?.kind).toBe("HYBRID");
        expect(grabRow?.status).toBe("degraded");
        expect(grabRow?.orders24hCount).toBe(1);
        expect(grabRow?.orders24h).toBe("1");

        expect(uberRow?.mode).toBe("stub");
        expect(uberRow?.kind).toBe("STUB");
        expect(uberRow?.orders24hCount).toBe(0);
        expect(uberRow?.orders24h).toBe("0");

        // Ops alert routing readback from the same snapshot
        const opsActiveAlerts = selectOpsActiveAlerts(
          platformState.observability.data,
        );
        expect(
          opsActiveAlerts.some((alert) => alert.key === "adapter_degradation"),
        ).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
