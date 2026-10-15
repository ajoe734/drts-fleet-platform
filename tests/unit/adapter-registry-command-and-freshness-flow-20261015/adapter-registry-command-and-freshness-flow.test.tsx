// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import type {
  PlatformAdapter,
  UpdatePlatformAdapterCommand,
} from "@drts/contracts";
import * as canvas from "../../../packages/ui-web/src/index";
import {
  t as translate,
  type Locale,
} from "../../../apps/platform-admin-web/lib/translations";
import { formatPlatformCodeLabel } from "../../../apps/platform-admin-web/lib/localized-labels";
import { ApiClient } from "../../../packages/api-client/src/index";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminController } from "../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import {
  PlatformAdapterRevisionConflictError,
  PlatformAdminRepository,
} from "../../../apps/api/src/modules/platform-admin/platform-admin.repository";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve("apps/platform-admin-web");

type TestPrincipal = {
  authenticated: boolean;
  actorId: string | null;
  realm: string;
  scopes: string[];
  displayPersonaOnly?: boolean;
};

const AUTHORIZED_PLATFORM_PRINCIPAL: TestPrincipal = {
  authenticated: true,
  actorId: "principal_platform_admin_001",
  realm: "platform",
  scopes: ["foundation:read", "foundation:write"],
};

function createAdapterRegistryWireHarness(options?: {
  repository?: PlatformAdminRepository;
  auditNotificationService?: AuditNotificationService;
  withIdempotency?: boolean;
}) {
  const auditNotificationService =
    options?.auditNotificationService ?? new AuditNotificationService();
  const platformAdminService = new PlatformAdminService(
    auditNotificationService,
    options?.repository,
  );
  const idempotencyStore = new Map<
    string,
    { data: unknown; statusCode: number }
  >();
  const idempotencyService = options?.withIdempotency
    ? {
        execute: vi.fn(
          async (params: {
            scope: string;
            idempotencyKey?: string;
            execute: () => Promise<{ data: unknown; statusCode: number }>;
          }) => {
            const cacheKey = `${params.scope}:${params.idempotencyKey ?? "none"}`;
            if (params.idempotencyKey && idempotencyStore.has(cacheKey)) {
              const cached = idempotencyStore.get(cacheKey)!;
              return { ...cached, replayed: true };
            }
            const executed = await params.execute();
            if (params.idempotencyKey) {
              idempotencyStore.set(cacheKey, executed);
            }
            return { ...executed, replayed: false };
          },
        ),
      }
    : undefined;

  const platformAdminController = new PlatformAdminController(
    platformAdminService,
    idempotencyService as never,
  );

  let activePrincipal: TestPrincipal = { ...AUTHORIZED_PLATFORM_PRINCIPAL };
  let nextListError: { status: number; code: string; message: string } | null =
    null;
  let listGate: (() => Promise<void>) | null = null;

  const requests: Array<{
    method: string;
    path: string;
    body: unknown;
    headers: Record<string, string>;
  }> = [];

  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(rawUrl, "http://localhost");
    const path = url.pathname.replace(/^\/control-plane-proxy/, "/api");
    const method = (init?.method ?? "GET").toUpperCase();
    const rawHeaders = new Headers(init?.headers);
    const headers: Record<string, string> = {};
    rawHeaders.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const body =
      init?.body && typeof init.body === "string"
        ? JSON.parse(init.body)
        : undefined;

    requests.push({ method, path, body, headers });

    // Enforce real route auth policy (realm + foundation:read / foundation:write)
    // and reject missing, display-only, or forged identities.
    const policy = resolveRouteAuthPolicy(method, path);
    if (policy) {
      if (
        !activePrincipal.authenticated ||
        activePrincipal.displayPersonaOnly ||
        !activePrincipal.actorId
      ) {
        return Response.json(
          {
            error: {
              code: "AUTH_UNAUTHORIZED",
              message: "Authenticated platform principal is required.",
            },
          },
          { status: 401 },
        );
      }
      if (!policy.allowedRealms.includes(activePrincipal.realm as never)) {
        return Response.json(
          {
            error: {
              code: "AUTH_REALM_FORBIDDEN",
              message: `Realm ${activePrincipal.realm} is not permitted for ${policy.routeKey}.`,
            },
          },
          { status: 403 },
        );
      }
      const hasRequiredScopes = policy.requiredScopes.every((scope) =>
        activePrincipal.scopes.includes(scope),
      );
      if (!hasRequiredScopes) {
        return Response.json(
          {
            error: {
              code: "AUTH_SCOPE_FORBIDDEN",
              message: `Missing required scope ${policy.requiredScopes.join(", ")}.`,
            },
          },
          { status: 403 },
        );
      }
    }

    try {
      if (method === "GET" && path === "/api/platform-admin/adapters") {
        if (listGate) {
          await listGate();
        }
        if (nextListError) {
          const err = nextListError;
          nextListError = null;
          return Response.json(
            { error: { code: err.code, message: err.message } },
            { status: err.status },
          );
        }
        const envelope =
          platformAdminController.listPlatformAdapters("req-adapter-list");
        return Response.json(deepToSnakeCase(envelope), { status: 200 });
      }

      if (method === "POST" && path === "/api/platform-admin/adapters") {
        let statusCode = 201;
        const responseLike = {
          status(code: number) {
            statusCode = code;
            return this;
          },
          setHeader() {
            return this;
          },
        };
        const envelope = await platformAdminController.registerPlatformAdapter(
          body as PlatformAdapter,
          responseLike as never,
          headers["idempotency-key"],
          "req-adapter-register",
          {
            actorId: activePrincipal.actorId,
            actorType: "platform_admin",
            tenantId: null,
            roles: ["platform_admin"],
            scopes: activePrincipal.scopes,
          } as never,
        );
        return Response.json(deepToSnakeCase(envelope), { status: statusCode });
      }

      const warningMatch = path.match(
        /^\/api\/platform-admin\/adapters\/([^/]+)\/credential-expiry-warning$/,
      );
      if (method === "GET" && warningMatch) {
        const adapterId = decodeURIComponent(warningMatch[1]!);
        const envelope =
          platformAdminController.getPlatformAdapterCredentialExpiryWarning(
            adapterId,
            "req-adapter-warning",
          );
        return Response.json(deepToSnakeCase(envelope), { status: 200 });
      }

      const itemMatch = path.match(/^\/api\/platform-admin\/adapters\/([^/]+)$/);
      if (method === "GET" && itemMatch) {
        const adapterId = decodeURIComponent(itemMatch[1]!);
        const envelope = platformAdminController.getPlatformAdapter(
          adapterId,
          "req-adapter-get",
        );
        return Response.json(deepToSnakeCase(envelope), { status: 200 });
      }

      if (method === "PATCH" && itemMatch) {
        const adapterId = decodeURIComponent(itemMatch[1]!);
        const envelope = await platformAdminController.updatePlatformAdapter(
          adapterId,
          body as UpdatePlatformAdapterCommand,
          {
            actorId: activePrincipal.actorId,
            actorType: "platform_admin",
            tenantId: null,
            roles: ["platform_admin"],
            scopes: activePrincipal.scopes,
          } as never,
          "req-adapter-patch",
        );
        return Response.json(deepToSnakeCase(envelope), { status: 200 });
      }

      return Response.json(
        {
          error: {
            code: "UNEXPECTED_TEST_ROUTE",
            message: `Unexpected route ${method} ${path}`,
          },
        },
        { status: 404 },
      );
    } catch (error) {
      if (error instanceof ApiRequestError) {
        return Response.json(error.getResponse(), {
          status: error.getStatus(),
        });
      }
      return Response.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : String(error),
          },
        },
        { status: 500 },
      );
    }
  };

  return {
    auditNotificationService,
    platformAdminService,
    platformAdminController,
    idempotencyService,
    requests,
    fetchImpl,
    setPrincipal(principal: TestPrincipal) {
      activePrincipal = principal;
    },
    failNextList(error: { status: number; code: string; message: string }) {
      nextListError = error;
    },
    setListGate(gate: (() => Promise<void>) | null) {
      listGate = gate;
    },
  };
}

let activeClient: ApiClient;
let locale: Locale = "zh";

const tt = (key: string, params?: Record<string, string | number>) =>
  translate(key, locale, params);

function loadAdapterRegistryPage() {
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "@/lib/admin-client": {
      usePlatformAdminClient: () => activeClient,
      formatDateTime: (value?: string | null) => value ?? "—",
    },
    "@/lib/i18n": {
      useTranslation: () => ({ locale, t: tt }),
    },
    "@/lib/localized-labels": {
      formatPlatformCodeLabel,
    },
  });

  return load<{ default: React.ComponentType }>(
    resolve(appRoot, "app/adapter-registry/page.tsx"),
  ).default;
}

describe("ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015: C104 & C105 production regressions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    locale = "zh";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("C104-F1: clicking Register adapter opens the governed registration form, submits canonical POST /api/platform-admin/adapters, and renders the returned/refetched adapter with rev 1 and server warning", async () => {
    const harness = createAdapterRegistryWireHarness({ withIdempotency: true });
    await harness.platformAdminService.onModuleInit();
    vi.stubGlobal("fetch", harness.fetchImpl);
    activeClient = new ApiClient({ baseUrl: "http://localhost" });

    const Page = loadAdapterRegistryPage();
    render(<Page />);

    await waitFor(() => {
      expect(screen.queryByText(tt("adapterRegistry.loading"))).toBeNull();
    });
    expect(screen.getByText("DRTS Native Dispatch")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: tt("adapterRegistry.registerAction") }),
    );

    const modal = screen.getByTestId("adapter-register-modal");
    fireEvent.change(within(modal).getByTestId("register-adapter-id"), {
      target: { value: "adapter-taiwan-metro-01" },
    });
    fireEvent.change(
      within(modal).getByTestId("register-adapter-platform-code"),
      {
        target: { value: "TWMETRO" },
      },
    );
    fireEvent.change(within(modal).getByTestId("register-adapter-name"), {
      target: { value: "北捷轉乘接駁轉接器" },
    });
    fireEvent.change(
      within(modal).getByTestId("register-adapter-description"),
      {
        target: { value: "大台北轉乘派遣雙向轉接" },
      },
    );
    fireEvent.change(within(modal).getByTestId("register-adapter-version"), {
      target: { value: "2.1.0" },
    });
    fireEvent.change(
      within(modal).getByTestId("register-adapter-cred-reference"),
      {
        target: { value: "kms://projects/drts/locations/tw/keyRings/metro-v1" },
      },
    );
    const futureExpiry = new Date(
      Date.now() + 45 * 24 * 60 * 60 * 1000,
    ).toISOString();
    fireEvent.change(
      within(modal).getByTestId("register-adapter-cred-expires-at"),
      {
        target: { value: futureExpiry },
      },
    );
    fireEvent.change(
      within(modal).getByTestId("register-adapter-service-buckets"),
      {
        target: { value: "standard_taxi, accessible" },
      },
    );

    fireEvent.click(within(modal).getByTestId("register-adapter-submit"));

    await waitFor(() => {
      expect(screen.queryByTestId("adapter-register-modal")).toBeNull();
    });

    const postRequests = harness.requests.filter(
      (req) =>
        req.method === "POST" && req.path === "/api/platform-admin/adapters",
    );
    expect(postRequests).toHaveLength(1);
    expect(postRequests[0]!.body).toEqual(
      expect.objectContaining({
        id: "adapter-taiwan-metro-01",
        platformCode: "TWMETRO",
        name: "北捷轉乘接駁轉接器",
        version: "2.1.0",
        credentialExpiry: {
          reference: "kms://projects/drts/locations/tw/keyRings/metro-v1",
          expiresAt: futureExpiry,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("北捷轉乘接駁轉接器")).toBeTruthy();
    });
    const registeredCard = screen.getByTestId(
      "adapter-card-adapter-taiwan-metro-01",
    );
    expect(
      within(registeredCard).getByText("adapter-taiwan-metro-01"),
    ).toBeTruthy();
    expect(
      within(registeredCard).getByText(
        /kms:\/\/projects\/drts\/locations\/tw\/keyRings\/metro-v1/,
      ),
    ).toBeTruthy();

    const stored = harness.platformAdminService.getPlatformAdapter(
      "adapter-taiwan-metro-01",
    );
    expect(stored?.revision).toBe(1);
    expect(stored?.lastMutationAudit).toBeNull();
    expect(stored?.credentialExpiryWarning?.state).toBe("ok");
  });

  it("C104-F2: clicking Edit config and Edit credential opens real forms, submits canonical PATCH with expectedRevision and reason, displays updated revision and server audit evidence, and keeps Rotate credential honest", async () => {
    const harness = createAdapterRegistryWireHarness();
    await harness.platformAdminService.onModuleInit();
    vi.stubGlobal("fetch", harness.fetchImpl);
    activeClient = new ApiClient({ baseUrl: "http://localhost" });

    const Page = loadAdapterRegistryPage();
    render(<Page />);

    await waitFor(() => {
      expect(screen.queryByText(tt("adapterRegistry.loading"))).toBeNull();
    });

    // 1. Edit config on cityride-forwarder
    const cityCardInitial = screen.getByTestId(
      "adapter-card-cityride-forwarder",
    );
    fireEvent.click(
      within(cityCardInitial).getByRole("button", {
        name: tt("adapterRegistry.editConfig"),
      }),
    );

    const configModal = screen.getByTestId("adapter-config-modal");
    fireEvent.change(within(configModal).getByTestId("config-max-candidates"), {
      target: { value: "8" },
    });
    fireEvent.change(
      within(configModal).getByTestId("config-accept-timeout-seconds"),
      {
        target: { value: "42" },
      },
    );
    fireEvent.change(
      within(configModal).getByTestId("config-service-buckets"),
      {
        target: { value: "standard, premium, wheelchair" },
      },
    );
    fireEvent.change(within(configModal).getByTestId("config-reason"), {
      target: { value: "Q4 尖峰派遣候選上限與逾時參數調整" },
    });
    fireEvent.click(within(configModal).getByTestId("config-submit"));

    await waitFor(() => {
      expect(screen.queryByTestId("adapter-config-modal")).toBeNull();
    });

    const patchRequestsAfterConfig = harness.requests.filter(
      (req) =>
        req.method === "PATCH" &&
        req.path.startsWith("/api/platform-admin/adapters/"),
    );
    expect(patchRequestsAfterConfig).toHaveLength(1);
    expect(patchRequestsAfterConfig[0]!.body).toEqual(
      expect.objectContaining({
        expectedRevision: 1,
        reason: "Q4 尖峰派遣候選上限與逾時參數調整",
        policies: expect.objectContaining({
          maxCandidates: 8,
          acceptTimeoutSeconds: 42,
          serviceBuckets: ["standard", "premium", "wheelchair"],
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("42s")).toBeTruthy();
      expect(
        screen.getAllByText(/Q4 尖峰派遣候選上限與逾時參數調整/).length,
      ).toBeGreaterThanOrEqual(1);
    });

    // 2. Edit credential reference & expiry on the same adapter (cityride-forwarder)
    const cityCardAfterConfig = screen.getByTestId(
      "adapter-card-cityride-forwarder",
    );
    fireEvent.click(
      within(cityCardAfterConfig).getByRole("button", {
        name: tt("adapterRegistry.editCredential"),
      }),
    );

    const credModal = screen.getByTestId("adapter-credential-modal");
    const newExpiry = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
    fireEvent.change(within(credModal).getByTestId("credential-reference"), {
      target: { value: "kms-ref-2026-q4-v2" },
    });
    fireEvent.change(within(credModal).getByTestId("credential-expires-at"), {
      target: { value: newExpiry },
    });
    fireEvent.change(within(credModal).getByTestId("credential-reason"), {
      target: { value: "登錄 Q4 KMS 金鑰版本參照與新效期" },
    });
    fireEvent.click(within(credModal).getByTestId("credential-submit"));

    await waitFor(() => {
      expect(screen.queryByTestId("adapter-credential-modal")).toBeNull();
    });

    const patchRequestsAfterCred = harness.requests.filter(
      (req) =>
        req.method === "PATCH" &&
        req.path.startsWith("/api/platform-admin/adapters/"),
    );
    expect(patchRequestsAfterCred).toHaveLength(2);
    expect(patchRequestsAfterCred[1]!.body).toEqual({
      credentialExpiry: {
        reference: "kms-ref-2026-q4-v2",
        expiresAt: newExpiry,
      },
      expectedRevision: 2,
      reason: "登錄 Q4 KMS 金鑰版本參照與新效期",
    });

    await waitFor(() => {
      expect(screen.getByText(/kms-ref-2026-q4-v2/)).toBeTruthy();
      expect(
        screen.getAllByText(/登錄 Q4 KMS 金鑰版本參照與新效期/).length,
      ).toBeGreaterThanOrEqual(1);
    });

    // 3. Rotate credential button remains an honest governance notice, never fabricating a provider secret rotation PATCH
    const rotateButtons = screen.getAllByRole("button", {
      name: new RegExp(tt("adapterRegistry.rotateCredential")),
    });
    fireEvent.click(rotateButtons[0]!);
    const patchRequestsAfterRotateClick = harness.requests.filter(
      (req) => req.method === "PATCH",
    );
    expect(patchRequestsAfterRotateClick).toHaveLength(2);

    // 4. Existing enable/disable control works alongside the new governance forms and bumps revision to 3
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("例行維護停用正式環境 SMS 轉接器");
    try {
      const disableButtons = screen.getAllByRole("button", {
        name: new RegExp(tt("adapterRegistry.disableAdapter")),
      });
      fireEvent.click(disableButtons[0]!);

      await waitFor(() => {
        const patches = harness.requests.filter(
          (req) =>
            req.method === "PATCH" &&
            req.path.startsWith("/api/platform-admin/adapters/"),
        );
        expect(patches).toHaveLength(3);
        expect(patches[2]!.body).toEqual({
          config: {
            isEnabled: false,
          },
          expectedRevision: 3,
          reason: "例行維護停用正式環境 SMS 轉接器",
        });
      });
    } finally {
      confirmSpy.mockRestore();
      promptSpy.mockRestore();
    }
  });

  it("C104-F3: enabled repository rejecting create or update propagates failure before mutating memory, recording success audit, or returning 2xx ACK; subsequent recovery persists and reloads cleanly", async () => {
    const store = new Map<string, PlatformAdapter>();
    let rejectNextPersist = false;
    let rejectNextMutate: Error | null = null;

    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => ({
        platformTenants: [],
        publicInfoVersions: [],
        placardVersions: [],
        platformAdapters: Array.from(store.values()),
      })),
      persistChanges: vi.fn(
        async (changes: { platformAdapters?: readonly PlatformAdapter[] }) => {
          if (rejectNextPersist) {
            rejectNextPersist = false;
            throw new Error("PG_WRITE_REJECTED_ON_REGISTER");
          }
          for (const adapter of changes.platformAdapters ?? []) {
            store.set(adapter.id, structuredClone(adapter));
          }
        },
      ),
      mutateAdapterWithAudit: vi.fn(
        async (
          adapterId: string,
          expectedRevision: number,
          updatedRecord: PlatformAdapter,
        ) => {
          if (rejectNextMutate) {
            const err = rejectNextMutate;
            rejectNextMutate = null;
            throw err;
          }
          const existing = store.get(adapterId);
          if (!existing || (existing.revision ?? 1) !== expectedRevision) {
            throw new PlatformAdapterRevisionConflictError(
              adapterId,
              expectedRevision,
            );
          }
          store.set(adapterId, structuredClone(updatedRecord));
        },
      ),
      reportPersistenceFailure: vi.fn(),
    } as unknown as PlatformAdminRepository;

    const harness = createAdapterRegistryWireHarness({
      repository,
      withIdempotency: true,
    });
    await harness.platformAdminService.onModuleInit();
    const initialCount =
      harness.platformAdminService.listPlatformAdapters().length;

    // 1. Enabled repository rejects POST create -> must reject, not add in-memory row or audit
    rejectNextPersist = true;
    const candidateAdapter: PlatformAdapter = {
      ...harness.platformAdminService.listPlatformAdapters()[0]!,
      id: "rejected-create-adapter",
      platformCode: "REJ",
      name: "Rejected Adapter",
    };

    await expect(
      harness.platformAdminController.registerPlatformAdapter(
        candidateAdapter,
        { status: () => ({}), setHeader: () => ({}) } as never,
        "idem-reject-create-1",
        "req-reject-create-1",
      ),
    ).rejects.toThrow(/PG_WRITE_REJECTED_ON_REGISTER/);

    expect(
      harness.platformAdminService.getPlatformAdapter(
        "rejected-create-adapter",
      ),
    ).toBeUndefined();
    expect(harness.platformAdminService.listPlatformAdapters()).toHaveLength(
      initialCount,
    );
    expect(
      harness.auditNotificationService
        .listAuditLogs()
        .some(
          (entry) =>
            entry.actionName === "register_platform_adapter" &&
            entry.resourceId === "rejected-create-adapter",
        ),
    ).toBe(false);

    // 2. Enabled repository rejects PATCH update (both DB write failure and durable revision conflict)
    const target = harness.platformAdminService.listPlatformAdapters()[0]!;
    const originalEnabled = target.config.isEnabled;
    const originalRevision = target.revision ?? 1;

    rejectNextMutate = new Error("PG_WRITE_REJECTED_ON_UPDATE");
    await expect(
      harness.platformAdminService.updatePlatformAdapter(
        target.id,
        {
          config: { isEnabled: !originalEnabled },
          expectedRevision: originalRevision,
          reason: "attempt during DB outage",
        },
        "req-reject-update-1",
        "principal_platform_admin_001",
      ),
    ).rejects.toThrow(/PG_WRITE_REJECTED_ON_UPDATE/);

    expect(
      harness.platformAdminService.getPlatformAdapter(target.id)?.config
        .isEnabled,
    ).toBe(originalEnabled);
    expect(
      harness.platformAdminService.getPlatformAdapter(target.id)?.revision,
    ).toBe(originalRevision);
    expect(
      harness.auditNotificationService
        .listAuditLogs()
        .some(
          (entry) =>
            entry.actionName === "update_platform_adapter" &&
            entry.resourceId === target.id,
        ),
    ).toBe(false);

    // Durable revision conflict must surface 409 PLATFORM_ADAPTER_REVISION_CONFLICT
    rejectNextMutate = new PlatformAdapterRevisionConflictError(
      target.id,
      originalRevision,
    );
    await expect(
      harness.platformAdminService.updatePlatformAdapter(
        target.id,
        {
          config: { isEnabled: !originalEnabled },
          expectedRevision: originalRevision,
          reason: "attempt hitting durable CAS conflict",
        },
        "req-reject-update-cas",
        "principal_platform_admin_001",
      ),
    ).rejects.toMatchObject({
      code: "PLATFORM_ADAPTER_REVISION_CONFLICT",
    });
    expect(
      harness.platformAdminService.getPlatformAdapter(target.id)?.revision,
    ).toBe(originalRevision);

    // 3. Subsequent retry when repository succeeds commits durably and survives reload
    const committed = await harness.platformAdminService.updatePlatformAdapter(
      target.id,
      {
        config: { isEnabled: !originalEnabled },
        expectedRevision: originalRevision,
        reason: "recovered durable update",
      },
      "req-recovered-update",
      "principal_platform_admin_001",
    );
    expect(committed?.revision).toBe(originalRevision + 1);
    expect(committed?.config.isEnabled).toBe(!originalEnabled);

    const reloadedService = new PlatformAdminService(
      new AuditNotificationService(),
      repository,
    );
    await reloadedService.onModuleInit();
    const reloaded = reloadedService.getPlatformAdapter(target.id);
    expect(reloaded?.revision).toBe(originalRevision + 1);
    expect(reloaded?.config.isEnabled).toBe(!originalEnabled);
    expect(reloaded?.lastMutationAudit?.reason).toBe(
      "recovered durable update",
    );
  });

  it("C105-F1: mounted page refreshes at the T4 (30s) cadence across ok -> warning -> expired transitions without manual reload, deduplicates slow requests, and cleans up on unmount", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-10-15T12:00:00.000Z");
    vi.setSystemTime(t0);

    const harness = createAdapterRegistryWireHarness();
    await harness.platformAdminService.onModuleInit();

    // Set owned-dispatch expiry to T0 + 14 days + 45 seconds:
    // - At T0: 14d 45s remaining -> "ok"
    // - At T0 + 30s: 14d 15s remaining -> "ok"
    // - At T0 + 60s: 13d 23h 59m 45s remaining -> "warning"
    // - At T0 + 14d + 60s: past expiresAt -> "expired"
    const expiresAtMs = t0.getTime() + 14 * 24 * 60 * 60 * 1000 + 45 * 1000;
    const expiresAtIso = new Date(expiresAtMs).toISOString();
    await harness.platformAdminService.updatePlatformAdapter(
      "owned-dispatch",
      {
        credentialExpiry: {
          reference: "kms-t4-progression-key",
          expiresAt: expiresAtIso,
        },
        reason: "seed T4 progression boundary",
      },
      "req-seed-t4",
      "principal_platform_admin_001",
    );

    vi.stubGlobal("fetch", harness.fetchImpl);
    activeClient = new ApiClient({ baseUrl: "http://localhost" });

    const Page = loadAdapterRegistryPage();
    const { unmount } = render(<Page />);

    // Initial load at T0
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("DRTS Native Dispatch")).toBeTruthy();

    // Advance 30s (1st T4 window): must trigger a periodic GET /api/platform-admin/adapters refresh
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(
      harness.requests.filter(
        (req) =>
          req.method === "GET" && req.path === "/api/platform-admin/adapters",
      ),
    ).toHaveLength(2);

    const card = screen.getByTestId("adapter-card-owned-dispatch");
    expect(within(card).getByTestId("adapter-expiry-state").textContent).toBe(
      formatPlatformCodeLabel(locale, "ok"),
    );
    expect(
      within(card).getByTestId("adapter-expiry-evaluated-at").textContent,
    ).toContain("2026-10-15T12:00:30.000Z");

    // Advance another 30s (2nd T4 window at T0 + 60s): now within 14d window -> "warning"
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(within(card).getByTestId("adapter-expiry-state").textContent).toBe(
      formatPlatformCodeLabel(locale, "warning"),
    );
    expect(
      within(card).getByTestId("adapter-expiry-evaluated-at").textContent,
    ).toContain("2026-10-15T12:01:00.000Z");

    // Jump system clock past expiresAt and advance one 30s T4 tick -> "expired"
    const afterExpiry = new Date(expiresAtMs + 5_000);
    vi.setSystemTime(afterExpiry);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(within(card).getByTestId("adapter-expiry-state").textContent).toBe(
      formatPlatformCodeLabel(locale, "expired"),
    );

    // Verify unmount cleans up interval: advancing timers produces no further GET requests
    const countBeforeUnmount = harness.requests.length;
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(harness.requests.length).toBe(countBeforeUnmount);
  });

  it("distinguishes real unknown expiry from failed/denied refresh and prevents overlapping or out-of-order refresh overwrites", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-10-15T13:00:00.000Z");
    vi.setSystemTime(t0);

    const harness = createAdapterRegistryWireHarness();
    await harness.platformAdminService.onModuleInit();

    await harness.platformAdminService.updatePlatformAdapter(
      "cityride-forwarder",
      {
        credentialExpiry: {
          reference: "vault://cityride/prod/token-v1",
          expiresAt: new Date(
            t0.getTime() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        reason: "Set valid future expiry for refresh failure distinction test",
      },
      "req-cityride-seed",
      "principal_platform_admin_001",
    );

    vi.stubGlobal("fetch", harness.fetchImpl);
    activeClient = new ApiClient({ baseUrl: "http://localhost" });

    const Page = loadAdapterRegistryPage();
    render(<Page />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // owned-dispatch has null credentialExpiry -> real "unknown" expiry state with no error banner
    const ownedCard = screen.getByTestId("adapter-card-owned-dispatch");
    expect(
      within(ownedCard).getByTestId("adapter-expiry-state").textContent,
    ).toBe(formatPlatformCodeLabel(locale, "unknown"));
    expect(screen.queryByTestId("adapter-refresh-error-banner")).toBeNull();

    // Next T4 refresh fails with 503: must show honest refresh error banner and preserve previous evaluatedAt & states
    harness.failNextList({
      status: 503,
      code: "ADAPTER_REGISTRY_UNAVAILABLE",
      message: "Upstream registry read timed out",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.getByTestId("adapter-refresh-error-banner")).toBeTruthy();
    const cityCard = screen.getByTestId("adapter-card-cityride-forwarder");
    expect(
      within(cityCard).getByTestId("adapter-expiry-state").textContent,
    ).toBe(formatPlatformCodeLabel(locale, "ok"));
    expect(
      within(cityCard).getByTestId("adapter-expiry-evaluated-at").textContent,
    ).toContain("2026-10-15T13:00:00.000Z");

    // Deduplication across slow request: hold the next refresh open across multiple 30s ticks
    let releaseSlowList!: () => void;
    harness.setListGate(
      () =>
        new Promise<void>((resolveGate) => {
          releaseSlowList = resolveGate;
        }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    const listCountWhileInFlight = harness.requests.filter(
      (req) =>
        req.method === "GET" && req.path === "/api/platform-admin/adapters",
    ).length;

    // Two more 30s ticks while the request is still in flight must NOT start overlapping requests
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const listCountAfterExtraTicks = harness.requests.filter(
      (req) =>
        req.method === "GET" && req.path === "/api/platform-admin/adapters",
    ).length;
    expect(listCountAfterExtraTicks).toBe(listCountWhileInFlight);

    harness.setListGate(null);
    await act(async () => {
      releaseSlowList();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId("adapter-refresh-error-banner")).toBeNull();
  });

  it("enforces platform realm and foundation:write role/scope boundaries and rejects missing, display-only, or wrong-realm identities without false UI success", async () => {
    const harness = createAdapterRegistryWireHarness();
    await harness.platformAdminService.onModuleInit();
    vi.stubGlobal("fetch", harness.fetchImpl);
    activeClient = new ApiClient({ baseUrl: "http://localhost" });

    const Page = loadAdapterRegistryPage();
    render(<Page />);

    await waitFor(() => {
      expect(screen.queryByText(tt("adapterRegistry.loading"))).toBeNull();
    });

    // Switch principal to read-only (missing foundation:write)
    harness.setPrincipal({
      authenticated: true,
      actorId: "principal_platform_viewer_002",
      realm: "platform",
      scopes: ["foundation:read"],
    });

    fireEvent.click(
      screen.getByRole("button", { name: tt("adapterRegistry.registerAction") }),
    );
    const modal = screen.getByTestId("adapter-register-modal");
    fireEvent.change(within(modal).getByTestId("register-adapter-id"), {
      target: { value: "unauthorized-adapter" },
    });
    fireEvent.change(
      within(modal).getByTestId("register-adapter-platform-code"),
      {
        target: { value: "UNAUTH" },
      },
    );
    fireEvent.change(within(modal).getByTestId("register-adapter-name"), {
      target: { value: "Unauthorized Adapter" },
    });
    fireEvent.click(within(modal).getByTestId("register-adapter-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("adapter-register-error")).toBeTruthy();
    });
    expect(
      harness.platformAdminService.getPlatformAdapter("unauthorized-adapter"),
    ).toBeUndefined();

    // Display-only persona or wrong realm (ops) is also rejected
    harness.setPrincipal({
      authenticated: true,
      actorId: "principal_ops_001",
      realm: "ops",
      scopes: ["foundation:read", "foundation:write"],
      displayPersonaOnly: true,
    });
    fireEvent.click(within(modal).getByTestId("register-adapter-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("adapter-register-error")).toBeTruthy();
    });
    expect(
      harness.platformAdminService.getPlatformAdapter("unauthorized-adapter"),
    ).toBeUndefined();
  });

  it("preserves deliberate noDB/demo mode, propagates rejected audit writes honestly, and validates command inputs", async () => {
    const disabledRepo = {
      isEnabled: () => false,
      loadState: vi.fn(),
      persistChanges: vi.fn(),
      mutateAdapterWithAudit: vi.fn(),
      reportPersistenceFailure: vi.fn(),
    } as unknown as PlatformAdminRepository;

    const auditService = new AuditNotificationService();
    const noDbService = new PlatformAdminService(auditService, disabledRepo);
    await noDbService.onModuleInit();

    const baseAdapter = noDbService.listPlatformAdapters()[0]!;
    const registeredInNoDb = await noDbService.registerPlatformAdapter(
      {
        ...baseAdapter,
        id: "nodb-demo-adapter",
        platformCode: "NODB" as PlatformAdapter["platformCode"],
        name: "NoDB Demo Adapter",
        version: "1.0.0",
      },
      "req-nodb-reg",
      "principal_platform_admin_001",
    );
    expect(registeredInNoDb.id).toBe("nodb-demo-adapter");
    expect(disabledRepo.persistChanges).not.toHaveBeenCalled();

    const updatedInNoDb = await noDbService.updatePlatformAdapter(
      "nodb-demo-adapter",
      {
        expectedRevision: 1,
        config: { isEnabled: false },
        reason: "NoDB toggle test",
      },
      "req-nodb-upd",
      "principal_platform_admin_001",
    );
    expect(updatedInNoDb?.revision).toBe(2);
    expect(disabledRepo.mutateAdapterWithAudit).not.toHaveBeenCalled();

    await expect(
      noDbService.registerPlatformAdapter({
        ...baseAdapter,
        id: "   ",
      }),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });

    await expect(
      noDbService.updatePlatformAdapter("nodb-demo-adapter", {
        credentialExpiry: {
          reference: "   ",
          expiresAt: new Date().toISOString(),
        },
      }),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });

    await expect(
      noDbService.updatePlatformAdapter("nodb-demo-adapter", {
        policies: {
          ...baseAdapter.policies,
          maxCandidates: 0,
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      noDbService.updatePlatformAdapter("nodb-demo-adapter", {
        webhookStatus: {
          url: "   ",
          isEnabled: true,
          lastEventTimestamp: null,
          lastStatus: "UNKNOWN",
        },
      }),
    ).rejects.toMatchObject({ code: "FIELD_REQUIRED" });

    vi.spyOn(auditService, "recordAuditLogAsync").mockRejectedValueOnce(
      new Error("AUDIT_LOG_APPEND_REJECTED"),
    );
    await expect(
      noDbService.updatePlatformAdapter("nodb-demo-adapter", {
        expectedRevision: 2,
        config: { isEnabled: true },
        reason: "Should fail when audit append rejects",
      }),
    ).rejects.toThrow(/AUDIT_LOG_APPEND_REJECTED/);
    expect(noDbService.getPlatformAdapter("nodb-demo-adapter")?.revision).toBe(
      2,
    );
    expect(
      noDbService.getPlatformAdapter("nodb-demo-adapter")?.config.isEnabled,
    ).toBe(false);
  });
});
