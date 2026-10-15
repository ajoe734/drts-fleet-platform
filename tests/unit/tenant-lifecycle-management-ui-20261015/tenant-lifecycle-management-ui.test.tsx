// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as apiClientPkg from "@drts/api-client";
import { ApiClient } from "@drts/api-client";
import * as contractsPkg from "@drts/contracts";
import type { PlatformAdminTenantRecord } from "@drts/contracts";
import * as uiWebPkg from "@drts/ui-web";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { resolveRouteAuthPolicy } from "../../../apps/api/src/common/auth/auth.policy";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminRepository } from "../../../apps/api/src/modules/platform-admin/platform-admin.repository";
import { TenantsController } from "../../../apps/api/src/modules/platform-admin/tenants.controller";
import { TenantsService } from "../../../apps/api/src/modules/platform-admin/tenants.service";
import type * as TenantLifecycleClientModule from "../../../apps/platform-admin-web/app/tenants/tenant-lifecycle-client";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const navigationState = {
  tenantId: "tenant-demo-001",
};

const activeClientRef: { current: ApiClient | null } = {
  current: null,
};

const appRoot = resolve("apps/platform-admin-web");
const loadPlatformModule = createUiModuleLoader(appRoot, {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "@drts/contracts": contractsPkg,
  "@drts/api-client": apiClientPkg,
  "@drts/ui-web": uiWebPkg,
  "next/navigation": {
    useParams: () => ({ tenantId: navigationState.tenantId }),
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
    }),
    usePathname: () => `/tenants/${navigationState.tenantId}`,
  },
  "@/lib/admin-client": {
    formatDateTime: (value?: string | null) =>
      value ? new Date(value).toISOString() : "—",
    usePlatformAdminClient: () => {
      if (!activeClientRef.current) {
        throw new Error("Test ApiClient not initialized");
      }
      return activeClientRef.current;
    },
  },
});

const { LanguageProvider } = loadPlatformModule<{
  LanguageProvider: React.ComponentType<{
    defaultLocale?: "zh" | "en";
    children: React.ReactNode;
  }>;
}>(resolve(appRoot, "lib/i18n.tsx"));

const { PlatformAdminAuthorityProvider } = loadPlatformModule<{
  PlatformAdminAuthorityProvider: React.ComponentType<{
    authority: {
      actorId?: string;
      scopes: string[];
      roles?: string[];
      realm?: string;
    };
    children: React.ReactNode;
  }>;
}>(resolve(appRoot, "lib/platform-admin-authority.tsx"));

const lifecycleClient = loadPlatformModule<typeof TenantLifecycleClientModule>(
  resolve(appRoot, "app/tenants/tenant-lifecycle-client.ts"),
);
const {
  acknowledgeTenantRoleWithReadback,
  activateTenantWithReadback,
  assertCanonicalTenantRecord,
  buildTenantLifecycleAvailableActions,
  hasTenantLifecycleWriteAuthority,
  rollbackHoldTenantWithReadback,
  setTenantRolloutStageWithReadback,
  suspendTenantWithReadback,
  toTenantOnboardingDraftState,
  updateTenantSettingsWithReadback,
} = lifecycleClient;

const tenantDetailPagePath =
  process.env.TENANT_DETAIL_PAGE_OVERRIDE_PATH ??
  resolve(appRoot, "app/tenants/[tenantId]/page.tsx");
const TenantDetailPage = loadPlatformModule<{
  default: React.ComponentType;
}>(tenantDetailPagePath).default;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<
  T = { rows: unknown[]; rowCount: number },
>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type SimulatedAuthClaims = {
  authenticated: boolean;
  realm: "platform" | "tenant" | "driver" | "partner";
  roles: string[];
  scopes: string[];
};

function createFullStackHarness(initialAuth?: Partial<SimulatedAuthClaims>) {
  const httpRequests: Array<{
    method: string;
    path: string;
    body: unknown;
  }> = [];

  let authClaims: SimulatedAuthClaims = {
    authenticated: true,
    realm: "platform",
    roles: ["pa_tenant_mgr"],
    scopes: ["foundation:read", "foundation:write"],
    ...initialAuth,
  };

  let nextQueryImpl: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number }> = async () => ({
    rows: [],
    rowCount: 1,
  });

  const databaseService: Pick<DatabaseService, "isEnabled" | "query"> = {
    isEnabled: () => true,
    query: vi.fn((sql: string, params: unknown[] = []) =>
      nextQueryImpl(sql, params),
    ) as unknown as DatabaseService["query"],
  };

  const repository = new PlatformAdminRepository(
    databaseService as DatabaseService,
  );
  const auditNotificationService = new AuditNotificationService();
  const service = new TenantsService(auditNotificationService, repository);
  const controller = new TenantsController(service);

  const enforceRouteGuard = (method: string, path: string) => {
    const policy = resolveRouteAuthPolicy(method, path);
    if (!policy) {
      throw new ApiRequestError(
        403,
        "AUTH_ROUTE_UNCLASSIFIED",
        `Unclassified route ${method} ${path}`,
      );
    }
    if (!authClaims.authenticated) {
      throw new ApiRequestError(
        401,
        "AUTH_REQUIRED",
        "Authentication required.",
      );
    }
    if (
      policy.allowedRealms.length > 0 &&
      !policy.allowedRealms.includes(authClaims.realm)
    ) {
      throw new ApiRequestError(
        403,
        "AUTH_REALM_DENIED",
        `Realm ${authClaims.realm} is not allowed for ${method} ${path}.`,
      );
    }
    if (
      policy.requiredScopes.length > 0 &&
      !policy.requiredScopes.every((scope) => authClaims.scopes.includes(scope))
    ) {
      throw new ApiRequestError(
        403,
        "AUTH_SCOPE_DENIED",
        `Missing required scope for ${method} ${path}. Required: ${policy.requiredScopes.join(", ")}`,
      );
    }
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const rawUrl = typeof input === "string" ? input : input.toString();
    const url = new URL(rawUrl, "http://platform-admin.test");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    const body =
      typeof init?.body === "string" && init.body.trim().length > 0
        ? JSON.parse(init.body)
        : undefined;

    httpRequests.push({ method, path, body });

    try {
      enforceRouteGuard(method, path);

      let result: unknown;
      const reqId = `req-${httpRequests.length}`;

      if (method === "GET" && path === "/api/platform-admin/tenants") {
        result = controller.list(reqId);
      } else if (method === "POST" && path === "/api/platform-admin/tenants") {
        result = await controller.create(body as never, reqId);
      } else {
        const match = path.match(
          /^\/api\/platform-admin\/tenants\/([^/]+)(?:\/(.+))?$/,
        );
        if (!match) {
          throw new Error(`Unhandled route ${method} ${path}`);
        }
        const tenantId = decodeURIComponent(match[1]);
        const subRoute = match[2] ?? "";

        if (method === "GET" && subRoute === "") {
          result = controller.getTenant(tenantId, reqId);
        } else if (method === "POST" && subRoute === "settings") {
          result = await controller.updateSettings(
            tenantId,
            body as never,
            reqId,
          );
        } else if (method === "POST" && subRoute === "onboarding") {
          result = await controller.updateOnboarding(
            tenantId,
            body as never,
            reqId,
          );
        } else if (method === "POST" && subRoute === "rollout") {
          result = await controller.setRolloutStage(
            tenantId,
            body as never,
            reqId,
          );
        } else if (method === "POST" && subRoute === "roles/invite") {
          result = await controller.inviteRole(tenantId, body as never, reqId);
        } else if (method === "POST" && subRoute === "roles/acknowledge") {
          result = await controller.acknowledgeRole(
            tenantId,
            body as never,
            reqId,
          );
        } else if (method === "POST" && subRoute === "rollback-hold") {
          result = await controller.rollbackHold(tenantId, reqId);
        } else if (method === "POST" && subRoute === "suspend") {
          result = await controller.suspend(tenantId, reqId);
        } else if (method === "POST" && subRoute === "activate") {
          result = await controller.activate(tenantId, reqId);
        } else {
          throw new Error(`Unhandled subroute ${method} ${path}`);
        }
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        const status = error.getStatus();
        const responseBody = error.getResponse();
        return new Response(JSON.stringify(responseBody), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
      const message =
        error instanceof Error ? error.message : "Unexpected server error";
      return new Response(
        JSON.stringify({
          error: {
            code: "PERSISTENCE_UNAVAILABLE",
            message,
          },
        }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      );
    }
  };

  vi.stubGlobal("fetch", fetchImpl);
  const client = new ApiClient({
    baseUrl: "http://platform-admin.test",
  });

  return {
    client,
    controller,
    service,
    repository,
    auditNotificationService,
    httpRequests,
    setAuthClaims(next: Partial<SimulatedAuthClaims>) {
      authClaims = { ...authClaims, ...next };
    },
    setNextQueryImpl(
      fn: (
        sql: string,
        params: unknown[],
      ) => Promise<{ rows: unknown[]; rowCount: number }>,
    ) {
      nextQueryImpl = fn;
    },
  };
}

function renderTenantDetailWorkspace(
  authority: {
    actorId?: string;
    roles?: string[];
    scopes: string[];
    realm?: string;
  } = {
    actorId: "usr-platform-admin-01",
    roles: ["pa_tenant_mgr"],
    scopes: ["foundation:read", "foundation:write"],
  },
) {
  return render(
    <LanguageProvider defaultLocale="en">
      <PlatformAdminAuthorityProvider authority={authority}>
        <TenantDetailPage />
      </PlatformAdminAuthorityProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  navigationState.tenantId = "tenant-demo-001";
});

afterEach(() => {
  cleanup();
  activeClientRef.current = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TENANT-EXISTING-MANAGEMENT-FLOW-20261015: existing-tenant lifecycle UI & adapter with canonical ACK/readback", () => {
  describe("tenant-existing-management_settings-quota-modules-real-command", () => {
    it("renders existing tenant settings/quotas/enabledModules in TenantDetailPage, awaits deferred server ACK, refetches authoritative tenant data, and preserves create flow", async () => {
      const harness = createFullStackHarness();
      activeClientRef.current = harness.client;

      // Verify original create flow works on the same client/controller contract
      const createdTenant = await harness.client.createPlatformTenant({
        name: "Created Flow Tenant",
        code: "created_flow",
        enabledModules: ["enterprise_dispatch", "billing"],
        quotas: {
          activeDrivers: 30,
          monthlyBookings: 600,
          monthlyApiCalls: 15000,
        },
      });
      expect(createdTenant.id).toBe("tenant-created-flow");
      expect(harness.service.get("tenant-created-flow").name).toBe(
        "Created Flow Tenant",
      );

      // Render existing tenant detail page for tenant-demo-001
      renderTenantDetailWorkspace();

      await waitFor(() => {
        expect(screen.getByTestId("tenant-settings-form")).toBeTruthy();
      });

      const settingsForm = screen.getByTestId("tenant-settings-form");
      const textInputs = settingsForm.querySelectorAll('input[type="text"], input:not([type])');
      const nameInput = textInputs[0] as HTMLInputElement;
      expect(nameInput.value).toBe("Demo Tenant");

      const numberInputs = settingsForm.querySelectorAll(
        'input[type="number"]',
      );
      expect(numberInputs.length).toBe(3);
      const activeDriversInput = numberInputs[0] as HTMLInputElement;
      const monthlyBookingsInput = numberInputs[1] as HTMLInputElement;
      const monthlyApiCallsInput = numberInputs[2] as HTMLInputElement;

      fireEvent.change(nameInput, {
        target: { value: "Demo Tenant Managed V2" },
      });
      fireEvent.change(activeDriversInput, { target: { value: "145" } });
      fireEvent.change(monthlyBookingsInput, { target: { value: "4200" } });
      fireEvent.change(monthlyApiCallsInput, { target: { value: "85000" } });

      // Toggle webhooks module checkbox inside settingsForm
      const checkboxes = settingsForm.querySelectorAll(
        'input[type="checkbox"]',
      );
      // Module checkboxes are first 4 (enterprise_dispatch, billing, reporting, webhooks), followed by confirm-settings-checkbox
      const webhooksCheckbox = checkboxes[3] as HTMLInputElement;
      fireEvent.click(webhooksCheckbox);

      // Hold the DB write using a deferred promise to verify pending state before server ACK
      const writeDeferred = createDeferred();
      harness.setNextQueryImpl(() => writeDeferred.promise);

      const saveBtn = screen.getByTestId(
        "save-tenant-settings-btn",
      ) as HTMLButtonElement;
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(saveBtn.textContent).toContain("Saving settings…");
      });
      expect(screen.queryByTestId("tenant-canonical-ack-banner")).toBeNull();

      // Resolve server persistence and verify ACK + authoritative GET readback
      writeDeferred.resolve({ rows: [], rowCount: 1 });

      await waitFor(() => {
        expect(screen.getByTestId("tenant-canonical-ack-banner")).toBeTruthy();
      });

      const ackBanner = screen.getByTestId("tenant-canonical-ack-banner");
      expect(ackBanner.textContent).toContain(
        "Authoritative Server ACK & Readback · Updated tenant settings, quotas, and enabled modules",
      );
      expect(ackBanner.textContent).toContain("tenant-demo-001");
      expect(ackBanner.textContent).not.toContain("Audit receipt ·");

      // Verify exact HTTP calls: POST /settings followed by GET /:tenantId readback
      const recentCalls = harness.httpRequests.slice(-2);
      expect(recentCalls[0]).toEqual({
        method: "POST",
        path: "/api/platform-admin/tenants/tenant-demo-001/settings",
        body: {
          name: "Demo Tenant Managed V2",
          enabledModules: [
            "enterprise_dispatch",
            "billing",
            "reporting",
            "webhooks",
          ],
          quotas: {
            activeDrivers: 145,
            monthlyBookings: 4200,
            monthlyApiCalls: 85000,
          },
        },
      });
      expect(recentCalls[1]).toEqual({
        method: "GET",
        path: "/api/platform-admin/tenants/tenant-demo-001",
        body: undefined,
      });

      // Verify readback updated the UI state
      expect(nameInput.value).toBe("Demo Tenant Managed V2");
      expect(activeDriversInput.value).toBe("145");
      expect(monthlyBookingsInput.value).toBe("4200");
      expect(monthlyApiCallsInput.value).toBe("85000");
    });

    it("retains user form edits and displays error banner when settings mutation rejects", async () => {
      const harness = createFullStackHarness();
      activeClientRef.current = harness.client;

      renderTenantDetailWorkspace();

      await waitFor(() => {
        expect(screen.getByTestId("tenant-settings-form")).toBeTruthy();
      });

      const settingsForm = screen.getByTestId("tenant-settings-form");
      const nameInput = settingsForm.querySelector(
        "input",
      ) as HTMLInputElement;
      const numberInputs = settingsForm.querySelectorAll(
        'input[type="number"]',
      );
      const activeDriversInput = numberInputs[0] as HTMLInputElement;

      fireEvent.change(nameInput, {
        target: { value: "Unsaved Draft Tenant Name" },
      });
      fireEvent.change(activeDriversInput, { target: { value: "333" } });

      harness.setNextQueryImpl(async () => {
        throw new Error("pg_settings_write_failed");
      });

      fireEvent.click(screen.getByTestId("save-tenant-settings-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("tenant-lifecycle-error-banner")).toBeTruthy();
      });

      expect(
        screen.getByTestId("tenant-lifecycle-error-banner").textContent,
      ).toContain("pg_settings_write_failed");
      expect(screen.queryByTestId("tenant-canonical-ack-banner")).toBeNull();

      // Edits must be retained in the form so the operator does not lose work
      expect(nameInput.value).toBe("Unsaved Draft Tenant Name");
      expect(activeDriversInput.value).toBe("333");
      // Server state remains unchanged
      expect(harness.service.get("tenant-demo-001").name).toBe("Demo Tenant");
    });
  });

  describe("tenant-existing-management_onboarding-stage-status-ack-readback", () => {
    it("wires onboarding package, role invite/acknowledge, rollout stage promotion, suspend, activate, and rollback_hold in TenantDetailPage with canonical ACK and readback", async () => {
      const harness = createFullStackHarness();
      activeClientRef.current = harness.client;

      // Create a fresh sandbox tenant so we can drive the full lifecycle journey from sandbox -> pilot -> production -> suspend -> activate -> rollback_hold
      const created = await harness.client.createPlatformTenant({
        name: "Lifecycle Journey Corp",
        code: "lifecycle_journey",
        enabledModules: ["enterprise_dispatch", "billing"],
        quotas: {
          activeDrivers: 50,
          monthlyBookings: 1200,
          monthlyApiCalls: 30000,
        },
      });
      navigationState.tenantId = created.id;

      renderTenantDetailWorkspace();

      await waitFor(() => {
        expect(screen.getByTestId("tenant-onboarding-form")).toBeTruthy();
      });

      // 1. Update Onboarding Package & Gate Readiness
      fireEvent.change(screen.getByTestId("onboarding-invoice-title-input"), {
        target: { value: "Lifecycle Journey Holdings Ltd." },
      });
      fireEvent.change(screen.getByTestId("onboarding-contact-name-input"), {
        target: { value: "Iris Lin" },
      });
      fireEvent.change(screen.getByTestId("onboarding-contact-email-input"), {
        target: { value: "iris.lin@journey.example" },
      });
      fireEvent.change(
        screen.getByTestId("onboarding-integration-mode-select"),
        {
          target: { value: "api_key_and_webhook" },
        },
      );
      fireEvent.change(screen.getByTestId("onboarding-sandbox-url-input"), {
        target: { value: "https://sandbox.journey.example" },
      });
      fireEvent.change(screen.getByTestId("onboarding-production-url-input"), {
        target: { value: "https://prod.journey.example" },
      });
      fireEvent.change(screen.getByTestId("onboarding-api-scopes-input"), {
        target: { value: "bookings:read, bookings:write, webhooks:read" },
      });
      fireEvent.change(screen.getByTestId("onboarding-webhook-events-input"), {
        target: { value: "booking.created, booking.completed" },
      });
      fireEvent.change(screen.getByTestId("onboarding-cutover-owner-input"), {
        target: { value: "cutover.lead@drts.example" },
      });
      fireEvent.change(screen.getByTestId("onboarding-rollback-owner-input"), {
        target: { value: "rollback.lead@drts.example" },
      });
      fireEvent.change(screen.getByTestId("onboarding-sandbox-gate-select"), {
        target: { value: "approved" },
      });
      fireEvent.change(screen.getByTestId("onboarding-pilot-gate-select"), {
        target: { value: "approved" },
      });
      fireEvent.change(
        screen.getByTestId("onboarding-production-gate-select"),
        {
          target: { value: "ready" },
        },
      );
      fireEvent.change(screen.getByTestId("onboarding-notes-input"), {
        target: { value: "All onboarding gates verified" },
      });
      fireEvent.click(
        screen.getByTestId("onboarding-rollback-prepared-checkbox"),
      );

      const onboardingDeferred = createDeferred();
      harness.setNextQueryImpl(() => onboardingDeferred.promise);

      const saveOnboardingBtn = screen.getByTestId(
        "save-tenant-onboarding-btn",
      );
      fireEvent.click(saveOnboardingBtn);

      await waitFor(() => {
        expect(saveOnboardingBtn.textContent).toContain("Saving onboarding…");
      });

      onboardingDeferred.resolve({ rows: [], rowCount: 1 });

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-canonical-ack-banner").textContent,
        ).toContain("Updated tenant onboarding package and gate baseline");
      });

      expect(
        harness.service.get(created.id).rollout.rollbackPrepared,
      ).toBe(true);
      expect(harness.service.get(created.id).rollout.sandboxStatus).toBe(
        "approved",
      );

      // 2. Invite & Acknowledge required bootstrap roles via the Roles table UI buttons
      const inviteButtons = screen.getAllByRole("button", { name: "Invite" });
      expect(inviteButtons.length).toBeGreaterThanOrEqual(2);
      fireEvent.click(inviteButtons[0]);

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-canonical-ack-banner").textContent,
        ).toContain("Invited bootstrap role");
      });

      const remainingInviteButtons = screen.getAllByRole("button", {
        name: "Invite",
      });
      fireEvent.click(remainingInviteButtons[0]);

      await waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: "Acknowledge" }).length,
        ).toBe(2);
      });

      fireEvent.click(
        screen.getAllByRole("button", { name: "Acknowledge" })[0],
      );
      await waitFor(() => {
        expect(
          screen.getAllByRole("button", { name: "Acknowledge" }).length,
        ).toBe(1);
      });

      fireEvent.click(
        screen.getAllByRole("button", { name: "Acknowledge" })[0],
      );
      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-canonical-ack-banner").textContent,
        ).toContain("Acknowledged bootstrap role");
      });

      // 3. Rollout stage promotion: sandbox -> pilot -> production
      const stageSelect = screen.getByTestId(
        "rollout-stage-select",
      ) as HTMLSelectElement;
      const stageNotesInput = screen.getByTestId(
        "rollout-stage-notes-input",
      ) as HTMLInputElement;

      fireEvent.change(stageSelect, { target: { value: "pilot" } });
      fireEvent.change(stageNotesInput, {
        target: { value: "Promoted to pilot after sandbox approval" },
      });

      const stageDeferred = createDeferred();
      harness.setNextQueryImpl(() => stageDeferred.promise);

      const applyStageBtn = screen.getByTestId("apply-rollout-stage-btn");
      fireEvent.click(applyStageBtn);

      await waitFor(() => {
        expect(applyStageBtn.textContent).toContain("Applying stage…");
      });

      stageDeferred.resolve({ rows: [], rowCount: 1 });

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-canonical-ack-banner").textContent,
        ).toContain("Updated tenant rollout stage (pilot)");
      });
      expect(harness.service.get(created.id).rollout.stage).toBe("pilot");

      // Promote to production using quick stage button
      fireEvent.click(screen.getByTestId("promote-stage-production-btn"));
      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-canonical-ack-banner").textContent,
        ).toContain("Updated tenant rollout stage (production)");
      });
      expect(harness.service.get(created.id).rollout.stage).toBe("production");

      // 4. Suspend tenant (high-risk modal requiring non-empty reason)
      fireEvent.click(screen.getByTestId("open-suspend-modal-btn"));
      const confirmSuspendBtn = screen.getByTestId(
        "confirm-suspend-btn",
      ) as HTMLButtonElement;
      expect(confirmSuspendBtn.disabled).toBe(true);

      fireEvent.change(screen.getByTestId("suspend-reason-input"), {
        target: { value: "Maintenance window freeze SEC-204" },
      });
      expect(confirmSuspendBtn.disabled).toBe(false);

      fireEvent.click(confirmSuspendBtn);

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-canonical-ack-banner").textContent,
        ).toContain("Suspended tenant (paused)");
      });
      expect(
        screen.getByTestId("tenant-canonical-ack-banner").textContent,
      ).toContain("Maintenance window freeze SEC-204");
      expect(harness.service.get(created.id).status).toBe("paused");

      // 5. Activate tenant (restores status to active with readback)
      const activateBtn = screen.getByTestId(
        "activate-tenant-btn",
      ) as HTMLButtonElement;
      expect(activateBtn.disabled).toBe(false);
      fireEvent.click(activateBtn);

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-canonical-ack-banner").textContent,
        ).toContain("Activated tenant (active)");
      });
      expect(harness.service.get(created.id).status).toBe("active");

      // 6. Enter rollback_hold (high-risk modal requiring non-empty reason)
      fireEvent.click(screen.getByTestId("open-rollback-modal-btn"));
      const confirmRollbackBtn = screen.getByTestId(
        "confirm-rollback-btn",
      ) as HTMLButtonElement;
      expect(confirmRollbackBtn.disabled).toBe(true);

      fireEvent.change(screen.getByTestId("rollback-reason-input"), {
        target: { value: "Cutover anomaly INC-902" },
      });
      expect(confirmRollbackBtn.disabled).toBe(false);
      fireEvent.click(confirmRollbackBtn);

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-canonical-ack-banner").textContent,
        ).toContain("Entered rollback_hold");
      });
      expect(
        screen.getByTestId("tenant-canonical-ack-banner").textContent,
      ).toContain("Cutover anomaly INC-902");
      expect(harness.service.get(created.id).status).toBe("rollback_hold");
    });

    it("retains onboarding and rollout stage drafts and displays canonical error when server rejects stage promotion or onboarding update", async () => {
      const harness = createFullStackHarness();
      activeClientRef.current = harness.client;

      const fresh = await harness.client.createPlatformTenant({
        name: "Blocked Promotion Corp",
        code: "blocked_promo",
      });
      navigationState.tenantId = fresh.id;

      renderTenantDetailWorkspace();

      await waitFor(() => {
        expect(screen.getByTestId("tenant-rollout-stage-form")).toBeTruthy();
      });

      // Attempt to promote directly to production before gates/roles are ready -> 409 TENANT_PROMOTION_GATE_BLOCKED
      const stageSelect = screen.getByTestId(
        "rollout-stage-select",
      ) as HTMLSelectElement;
      const stageNotesInput = screen.getByTestId(
        "rollout-stage-notes-input",
      ) as HTMLInputElement;

      fireEvent.change(stageSelect, { target: { value: "production" } });
      fireEvent.change(stageNotesInput, {
        target: { value: "Premature production attempt" },
      });

      fireEvent.click(screen.getByTestId("apply-rollout-stage-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("tenant-lifecycle-error-banner")).toBeTruthy();
      });

      expect(
        screen.getByTestId("tenant-lifecycle-error-banner").textContent,
      ).toContain("Cannot promote to production:");
      expect(screen.queryByTestId("tenant-canonical-ack-banner")).toBeNull();

      // Draft inputs must remain preserved
      expect(stageSelect.value).toBe("production");
      expect(stageNotesInput.value).toBe("Premature production attempt");
      expect(harness.service.get(fresh.id).rollout.stage).toBe("sandbox");
    });
  });

  describe("tenant-existing-management_original-authority-confirm-denials", () => {
    it("enforces pa_tenant_mgr/pa_super_admin role, platform realm, and foundation:write scope in both UI and server guard, ignoring browser cookies", async () => {
      const harness = createFullStackHarness();
      activeClientRef.current = harness.client;

      // Attempt to spoof authority via document.cookie
      document.cookie =
        "drts_role=pa_super_admin; drts_scopes=foundation:write; realm=platform";

      // Render with support auditor lacking foundation:write scope
      renderTenantDetailWorkspace({
        roles: ["pa_support_auditor"],
        scopes: ["foundation:read"],
      });

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-authority-readonly-banner"),
        ).toBeTruthy();
      });

      expect(
        (screen.getByTestId("save-tenant-settings-btn") as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(
        (screen.getByTestId("save-tenant-onboarding-btn") as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(
        (screen.getByTestId("apply-rollout-stage-btn") as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(
        (screen.getByTestId("activate-tenant-btn") as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(
        (screen.getByTestId("open-suspend-modal-btn") as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(
        (screen.getByTestId("open-rollback-modal-btn") as HTMLButtonElement)
          .disabled,
      ).toBe(true);

      // Verify helper and adapter reject non-platform realm and missing foundation:write scope
      expect(
        hasTenantLifecycleWriteAuthority({
          realm: "tenant",
          roles: ["pa_super_admin"],
          scopes: ["foundation:write"],
        }),
      ).toBe(false);
      expect(
        hasTenantLifecycleWriteAuthority({
          realm: "platform",
          roles: ["pa_support_auditor"],
          scopes: ["foundation:write"],
        }),
      ).toBe(false);
      expect(
        hasTenantLifecycleWriteAuthority({
          realm: "platform",
          roles: ["pa_tenant_mgr"],
          scopes: ["foundation:read"],
        }),
      ).toBe(false);
      expect(
        hasTenantLifecycleWriteAuthority({
          realm: "platform",
          roles: ["pa_tenant_mgr"],
          scopes: ["foundation:read", "foundation:write"],
        }),
      ).toBe(true);

      await expect(
        updateTenantSettingsWithReadback(
          harness.client,
          "tenant-demo-001",
          {
            name: "Unauthorized Edit",
            activeDrivers: "50",
            monthlyBookings: "500",
            monthlyApiCalls: "5000",
            enabledModules: ["enterprise_dispatch"],
          },
          {
            realm: "tenant",
            roles: ["pa_tenant_mgr"],
            scopes: ["foundation:write"],
          },
        ),
      ).rejects.toThrow("FORBIDDEN_TENANT_LIFECYCLE_WRITE");

      // Server BootstrapAuthGuard also denies requests when token lacks foundation:write or has wrong realm
      harness.setAuthClaims({
        realm: "platform",
        roles: ["pa_support_auditor"],
        scopes: ["foundation:read"],
      });

      await expect(
        updateTenantSettingsWithReadback(
          harness.client,
          "tenant-demo-001",
          {
            name: "Server Guard Denied",
            activeDrivers: "50",
            monthlyBookings: "500",
            monthlyApiCalls: "5000",
            enabledModules: ["enterprise_dispatch"],
          },
          {
            realm: "platform",
            roles: ["pa_tenant_mgr"],
            scopes: ["foundation:write"],
          },
        ),
      ).rejects.toThrow(/Missing required scope|FORBIDDEN/i);
    });

    it("enforces medium confirmation checkboxes, high-risk suspend/rollback reasons, quota/module validation, role ack/rollback guards, and cross-tenant refusals", async () => {
      const harness = createFullStackHarness();
      activeClientRef.current = harness.client;

      renderTenantDetailWorkspace();

      await waitFor(() => {
        expect(screen.getByTestId("tenant-settings-form")).toBeTruthy();
      });

      const requestCountBefore = harness.httpRequests.length;

      // 1. Unchecking medium confirmation blocks settings submission without calling API
      fireEvent.click(screen.getByTestId("confirm-settings-checkbox"));
      fireEvent.click(screen.getByTestId("save-tenant-settings-btn"));

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-lifecycle-error-banner").textContent,
        ).toContain("Please confirm this change before submitting.");
      });
      expect(harness.httpRequests.length).toBe(requestCountBefore);

      // Re-check confirmation and test negative quota rejection through real server validation
      fireEvent.click(screen.getByTestId("confirm-settings-checkbox"));
      const settingsForm = screen.getByTestId("tenant-settings-form");
      const activeDriversInput = settingsForm.querySelectorAll(
        'input[type="number"]',
      )[0] as HTMLInputElement;
      fireEvent.change(activeDriversInput, { target: { value: "-10" } });
      fireEvent.click(screen.getByTestId("save-tenant-settings-btn"));

      await waitFor(() => {
        expect(
          screen.getByTestId("tenant-lifecycle-error-banner").textContent,
        ).toContain("Invalid quota value for activeDrivers.");
      });
      expect(activeDriversInput.value).toBe("-10");

      // 2. Invalid module validation
      await expect(
        updateTenantSettingsWithReadback(harness.client, "tenant-demo-001", {
          name: "Demo Tenant",
          activeDrivers: "50",
          monthlyBookings: "500",
          monthlyApiCalls: "5000",
          enabledModules: ["invalid_mod" as never],
        }),
      ).rejects.toThrow(/Unknown tenant module|TENANT_MODULE_INVALID/i);

      // 3. High-risk actions require non-empty reason
      await expect(
        suspendTenantWithReadback(harness.client, "tenant-demo-001", "   "),
      ).rejects.toThrow("HIGH_RISK_REASON_REQUIRED");
      await expect(
        rollbackHoldTenantWithReadback(
          harness.client,
          "tenant-demo-001",
          "   ",
        ),
      ).rejects.toThrow("HIGH_RISK_REASON_REQUIRED");

      // 4. Uninvited role acknowledgement & rollback_hold promotion guards
      const uninvitedTenant = await harness.client.createPlatformTenant({
        name: "Guard Tenant",
        code: "guard_tenant",
      });
      await expect(
        acknowledgeTenantRoleWithReadback(harness.client, uninvitedTenant.id, {
          roleCode: "tenant_admin",
        }),
      ).rejects.toThrow(
        /Role must be invited before it can be acknowledged|TENANT_ROLE_NOT_INVITED/i,
      );

      const holdResult = await rollbackHoldTenantWithReadback(
        harness.client,
        uninvitedTenant.id,
        "Emergency hold for rollback guard test",
      );
      expect(holdResult.tenant.status).toBe("rollback_hold");

      await expect(
        setTenantRolloutStageWithReadback(harness.client, uninvitedTenant.id, {
          stage: "pilot",
          notes: "Attempt promotion while in rollback_hold",
        }),
      ).rejects.toThrow(
        /Tenant is in rollback hold|TENANT_IN_ROLLBACK_HOLD/i,
      );

      // 5. Cross-tenant response refusal on ACK and readback
      const demoTenant = harness.service.get("tenant-demo-001");
      expect(() =>
        assertCanonicalTenantRecord(
          { ...demoTenant, id: "tenant-other-999" },
          "tenant-demo-001",
          "update_settings.ack",
        ),
      ).toThrow("CROSS_TENANT_REFUSED");

      const mismatchedClient = {
        ...harness.client,
        getPlatformTenant: async () =>
          ({
            ...demoTenant,
            id: "tenant-hijacked-999",
          }) as PlatformAdminTenantRecord,
        activateTenant: async () => demoTenant,
      };

      await expect(
        activateTenantWithReadback(mismatchedClient, "tenant-demo-001"),
      ).rejects.toThrow("CROSS_TENANT_REFUSED");

      // 6. ResourceActionDescriptor contract metadata matches medium/high risk design handoff
      const descriptors = buildTenantLifecycleAvailableActions(demoTenant, {
        realm: "platform",
        roles: ["pa_tenant_mgr"],
        scopes: ["foundation:write"],
      });
      expect(descriptors.update_settings.confirmation).toBe("medium");
      expect(descriptors.update_onboarding.confirmation).toBe("medium");
      expect(descriptors.set_rollout_stage.confirmation).toBe("medium");
      expect(descriptors.suspend.confirmation).toBe("high");
      expect(descriptors.suspend.requiresReason).toBe(true);
      expect(descriptors.rollback_hold.confirmation).toBe("high");
      expect(descriptors.rollback_hold.requiresReason).toBe(true);
      expect(toTenantOnboardingDraftState(demoTenant).sandboxStatus).toBe(
        demoTenant.rollout.sandboxStatus,
      );
    });
  });
});
