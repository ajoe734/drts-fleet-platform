// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import type { ProductRuleCatalog } from "@drts/contracts";
import * as canvas from "../../../packages/ui-web/src/index";
import {
  t as translate,
  type Locale,
} from "../../../apps/platform-admin-web/lib/translations";
import { ApiClient } from "../../../packages/api-client/src/index";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { PlatformAdminController } from "../../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve("apps/platform-admin-web");

const SAMPLE_CATALOG: ProductRuleCatalog = {
  phase1ServiceBuckets: [
    "standard_taxi",
    "business_dispatch",
    "airport_transfer",
    "wheelchair",
  ],
  pricingAuthority: {
    canonicalQuotedFareSource: "platform_pricing_rule",
    canonicalPricingRuleVersion: "2026.04",
    tenantCanSetQuotedFare: false,
    partnerCanSetQuotedFare: false,
    manualOverrideActorTypes: ["platform_admin", "ops_user"],
    manualOverrideRequiredFields: ["actor", "reason", "traceId"],
  },
} as unknown as ProductRuleCatalog;

function createPricingWireHarness() {
  const auditNotificationService = new AuditNotificationService();
  const platformAdminService = new PlatformAdminService(
    auditNotificationService,
  );
  const platformAdminController = new PlatformAdminController(
    platformAdminService,
  );
  const billingSettlementService = new BillingSettlementService(
    auditNotificationService,
    undefined,
    {
      listReconciliationIssues: () => [],
    } as never,
  );

  const requests: Array<{
    method: string;
    path: string;
    body: unknown;
  }> = [];
  let nextCreateError: unknown = null;
  let nextPublishError: unknown = null;

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
    const body =
      init?.body && typeof init.body === "string"
        ? JSON.parse(init.body)
        : undefined;

    requests.push({ method, path, body });

    try {
      if (method === "GET" && path === "/api/platform-admin/pricing-rules") {
        const envelope =
          platformAdminController.listPlatformPricingRules("req-pricing-list");
        return Response.json(envelope, { status: 200 });
      }
      if (method === "POST" && path === "/api/platform-admin/pricing-rules") {
        if (nextCreateError) {
          const err = nextCreateError;
          nextCreateError = null;
          throw err;
        }
        const envelope = platformAdminController.createPlatformPricingRule(
          body as never,
          "req-pricing-create",
        );
        return Response.json(envelope, { status: 201 });
      }
      const publishMatch = path.match(
        /^\/api\/platform-admin\/pricing-rules\/([^/]+)\/publish$/,
      );
      if (method === "POST" && publishMatch) {
        if (nextPublishError) {
          const err = nextPublishError;
          nextPublishError = null;
          throw err;
        }
        const ruleId = decodeURIComponent(publishMatch[1]!);
        const envelope = platformAdminController.publishPlatformPricingRule(
          ruleId,
          body as never,
          "req-pricing-publish",
        );
        return Response.json(envelope, { status: 200 });
      }
      if (
        method === "GET" &&
        (path === "/api/driver-fee-plans" ||
          path === "/api/settlement/driver-fee-plans")
      ) {
        return Response.json(
          {
            data: { items: billingSettlementService.listDriverFeePlans() },
            meta: { requestId: "req-fee-plans" },
          },
          { status: 200 },
        );
      }
      if (method === "GET" && path === "/api/product-rule/catalog") {
        return Response.json(
          {
            data: SAMPLE_CATALOG,
            meta: { requestId: "req-catalog" },
          },
          { status: 200 },
        );
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
    billingSettlementService,
    requests,
    fetchImpl,
    failNextCreate(error: unknown) {
      nextCreateError = error;
    },
    failNextPublish(error: unknown) {
      nextPublishError = error;
    },
  };
}

let activeClient: ApiClient;
let locale: Locale = "zh";
let currentPathname = "/pricing";
let currentSearch = "tab=passenger&scope=enterprise";
let activeAuthority = {
  actorId: "pa-pricing-manager-01",
  scopes: ["platform:read", "platform:write"],
};

const tt = (key: string, params?: Record<string, string | number>) =>
  translate(key, locale, params);

function loadPricingPage() {
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "next/navigation": {
      usePathname: () => currentPathname,
      useSearchParams: () => new URLSearchParams(currentSearch),
    },
    "@/components/assistant/route-context": {
      usePlatformAdminAssistantPage: () => {},
    },
    "@/lib/admin-client": {
      usePlatformAdminClient: () => activeClient,
      formatDateTime: (value?: string | null) => value ?? "—",
    },
    "@/lib/platform-admin-authority": {
      usePlatformAdminAuthority: () => activeAuthority,
    },
    "@/lib/i18n": {
      useTranslation: () => ({ locale, t: tt }),
    },
  });

  return load<{ default: React.ComponentType }>(
    resolve(appRoot, "app/pricing/page.tsx"),
  ).default;
}

async function waitForWorkspaceLoaded() {
  await waitFor(() => {
    expect(screen.queryByText(tt("pricing.loadingWorkspace"))).toBeNull();
  });
}

describe("PRICING-DRAFT-AND-PUBLISH-REASON-20261015: C076 Create draft & publish reason authoritative audit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    locale = "zh";
    currentPathname = "/pricing";
    currentSearch = "tab=passenger&scope=enterprise";
    activeAuthority = {
      actorId: "pa-pricing-manager-01",
      scopes: ["platform:read", "platform:write"],
    };
    window.history.replaceState(
      null,
      "",
      `${currentPathname}?${currentSearch}`,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("C076-F1 + C076-F2: creates a canonical pricing draft from the page header action, reads it back into comparison, and publishes it with user-entered reason recorded in authoritative audit", async () => {
    const harness = createPricingWireHarness();
    vi.stubGlobal("fetch", harness.fetchImpl);
    activeClient = new ApiClient({ baseUrl: "http://localhost" });

    const PricingPage = loadPricingPage();
    render(<PricingPage />);
    await waitForWorkspaceLoaded();

    // Initial seed has only active rules; Publish button is disabled.
    const publishHeaderButton = screen.getByRole("button", {
      name: tt("common.publish"),
    }) as HTMLButtonElement;
    expect(publishHeaderButton.disabled).toBe(true);

    // Click Create Passenger Draft button in header.
    const createDraftHeaderButton = screen.getByRole("button", {
      name: tt("pricing.action.createPassengerDraft"),
    });
    fireEvent.click(createDraftHeaderButton);

    // Preserves current tab and URL query selection.
    expect(window.location.search).toBe("?tab=passenger&scope=enterprise");

    // Fill out the draft creation form and submit once.
    fireEvent.change(screen.getByLabelText(tt("pricing.form.ruleName")), {
      target: { value: "Standard Service Fee" },
    });
    fireEvent.change(screen.getByLabelText(tt("pricing.form.version")), {
      target: { value: "2026.05-draft" },
    });
    fireEvent.change(screen.getByLabelText(tt("pricing.form.serviceFeeBps")), {
      target: { value: "1350" },
    });
    fireEvent.change(screen.getByLabelText(tt("pricing.form.reimbMode")), {
      target: { value: "mixed" },
    });
    fireEvent.change(screen.getByLabelText(tt("pricing.form.applicableTo")), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText(tt("pricing.form.notes")), {
      target: { value: "Q2 enterprise promotional draft tier" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: tt("pricing.createDraft") }),
    );

    // Wait for canonical creation and readback to complete.
    await waitFor(() => {
      expect(screen.getAllByText("2026.05-draft").length).toBeGreaterThan(0);
    });

    const createPostRequests = harness.requests.filter(
      (req) =>
        req.method === "POST" &&
        req.path === "/api/platform-admin/pricing-rules",
    );
    expect(createPostRequests).toHaveLength(1);
    expect(createPostRequests[0]!.body).toMatchObject({
      ruleName: "Standard Service Fee",
      version: "2026.05-draft",
      serviceFeeBps: 1350,
      reimbursementMode: "mixed",
      applicableTo: "all",
      notes: "Q2 enterprise promotional draft tier",
    });

    // Verify canonical service state and create audit log.
    const rulesAfterCreate =
      harness.platformAdminService.listPlatformPricingRules();
    const createdDraft = rulesAfterCreate.find(
      (rule) => rule.version === "2026.05-draft",
    );
    expect(createdDraft).toBeDefined();
    expect(createdDraft?.status).toBe("draft");
    expect(createdDraft?.serviceFeeBps).toBe(1350);

    // Prior active versions remain untouched.
    const priorActive = rulesAfterCreate.find(
      (rule) => rule.ruleId === "rule-demo-001",
    );
    expect(priorActive?.status).toBe("active");
    expect(priorActive?.version).toBe("2026.04");

    // Publish button is now enabled because canonical draft is selected for comparison.
    expect(publishHeaderButton.disabled).toBe(false);
    fireEvent.click(publishHeaderButton);

    // Enter a valid publish reason (>= 12 trimmed chars) with surrounding whitespace.
    const rawReason =
      "   Approved 2026.05 fee adjustment after finance committee signoff   ";
    const expectedTrimmedReason =
      "Approved 2026.05 fee adjustment after finance committee signoff";
    fireEvent.change(screen.getByLabelText(tt("pricing.form.publishReason")), {
      target: { value: rawReason },
    });

    fireEvent.click(
      screen.getByRole("button", { name: tt("pricing.confirmPublish") }),
    );

    // Wait for publish receipt banner to render.
    await waitFor(() => {
      expect(screen.getByText(new RegExp(expectedTrimmedReason))).toBeTruthy();
    });

    // Verify the publish HTTP request carried the trimmed reason and authenticated actor (not cosmetic locale persona).
    const publishPostRequests = harness.requests.filter(
      (req) =>
        req.method === "POST" &&
        req.path ===
          `/api/platform-admin/pricing-rules/${createdDraft!.ruleId}/publish`,
    );
    expect(publishPostRequests).toHaveLength(1);
    expect(publishPostRequests[0]!.body).toMatchObject({
      reason: expectedTrimmedReason,
      publishedBy: "pa-pricing-manager-01",
    });
    expect(
      (publishPostRequests[0]!.body as { publishedBy?: string }).publishedBy,
    ).not.toBe("platform_admin:zh");

    // Verify authoritative audit log contains the trimmed user-entered reason and actorId.
    const publishAuditLog = harness.auditNotificationService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "publish_platform_pricing_rule" &&
          entry.resourceId === createdDraft!.ruleId,
      );
    expect(publishAuditLog).toBeDefined();
    expect(publishAuditLog?.actorId).toBe("pa-pricing-manager-01");
    expect(publishAuditLog?.newValuesSummary).toEqual(
      expect.objectContaining({
        ruleId: createdDraft!.ruleId,
        version: "2026.05-draft",
        applicableTo: "all",
        publishedBy: "pa-pricing-manager-01",
        reason: expectedTrimmedReason,
      }),
    );

    // Verify canonical readback: new rule is active with publishReason, prior active rule is archived.
    const rulesAfterPublish =
      harness.platformAdminService.listPlatformPricingRules();
    const publishedRule = rulesAfterPublish.find(
      (rule) => rule.ruleId === createdDraft!.ruleId,
    );
    const archivedPriorRule = rulesAfterPublish.find(
      (rule) => rule.ruleId === "rule-demo-001",
    );
    expect(publishedRule?.status).toBe("active");
    expect(publishedRule?.publishedBy).toBe("pa-pricing-manager-01");
    expect(publishedRule?.publishReason).toBe(expectedTrimmedReason);
    expect(archivedPriorRule?.status).toBe("archived");
  });

  it("C076-F2 UI-to-audit flow: carries trimmed user-entered publish reason and authenticated actorId through PublishPlatformPricingRuleCommand into authoritative publish audit", async () => {
    const harness = createPricingWireHarness();
    const draft = harness.platformAdminService.createPlatformPricingRule({
      ruleName: "Standard Service Fee",
      version: "2026.05-seeded-draft",
      serviceFeeBps: 1425,
      reimbursementMode: "platform_funded",
      applicableTo: "all",
    });
    vi.stubGlobal("fetch", harness.fetchImpl);
    activeClient = new ApiClient({ baseUrl: "http://localhost" });

    const PricingPage = loadPricingPage();
    render(<PricingPage />);
    await waitForWorkspaceLoaded();

    const publishHeaderButton = screen.getByRole("button", {
      name: tt("common.publish"),
    }) as HTMLButtonElement;
    expect(publishHeaderButton.disabled).toBe(false);
    fireEvent.click(publishHeaderButton);

    const rawReason = "   Board-approved Q2 passenger fee schedule rollout   ";
    const expectedTrimmedReason =
      "Board-approved Q2 passenger fee schedule rollout";
    fireEvent.change(
      screen.getByPlaceholderText(tt("pricing.form.publishReasonPlaceholder")),
      {
        target: { value: rawReason },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: tt("pricing.confirmPublish") }),
    );

    await waitFor(() => {
      const publishReqs = harness.requests.filter(
        (req) =>
          req.method === "POST" &&
          req.path ===
            `/api/platform-admin/pricing-rules/${draft.ruleId}/publish`,
      );
      expect(publishReqs).toHaveLength(1);
    });

    const publishReq = harness.requests.find(
      (req) =>
        req.method === "POST" &&
        req.path ===
          `/api/platform-admin/pricing-rules/${draft.ruleId}/publish`,
    )!;
    expect(publishReq.body).toMatchObject({
      reason: expectedTrimmedReason,
      publishedBy: "pa-pricing-manager-01",
    });

    const publishAuditLog = harness.auditNotificationService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "publish_platform_pricing_rule" &&
          entry.resourceId === draft.ruleId,
      );
    expect(publishAuditLog?.actorId).toBe("pa-pricing-manager-01");
    expect(publishAuditLog?.newValuesSummary).toEqual(
      expect.objectContaining({
        ruleId: draft.ruleId,
        version: "2026.05-seeded-draft",
        publishedBy: "pa-pricing-manager-01",
        reason: expectedTrimmedReason,
      }),
    );
  });

  it("C076-F2 server enforcement: rejects missing, blank, or short (< 12 trimmed chars) publish reason without mutating rules or recording audit", () => {
    const harness = createPricingWireHarness();
    const draft = harness.platformAdminService.createPlatformPricingRule({
      ruleName: "Standard Service Fee",
      version: "2026.06-draft",
      serviceFeeBps: 1400,
      reimbursementMode: "platform_funded",
      applicableTo: "all",
    });

    for (const invalidReason of [undefined, "", "   ", "  short 11c  "]) {
      expect(() =>
        harness.platformAdminController.publishPlatformPricingRule(
          draft.ruleId,
          {
            publishedBy: "pa-pricing-manager-01",
            reason: invalidReason as unknown as string,
          },
          "req-invalid-reason",
        ),
      ).toThrowError(ApiRequestError);
    }

    const rules = harness.platformAdminService.listPlatformPricingRules();
    expect(rules.find((r) => r.ruleId === draft.ruleId)?.status).toBe("draft");
    expect(rules.find((r) => r.ruleId === "rule-demo-001")?.status).toBe(
      "active",
    );
    expect(
      harness.auditNotificationService
        .listAuditLogs()
        .filter((log) => log.actionName === "publish_platform_pricing_rule"),
    ).toHaveLength(0);
  });

  it("keeps create and publish failures honest without fabricating local drafts or optimistic publish receipts", async () => {
    const harness = createPricingWireHarness();
    vi.stubGlobal("fetch", harness.fetchImpl);
    activeClient = new ApiClient({ baseUrl: "http://localhost" });

    const PricingPage = loadPricingPage();
    render(<PricingPage />);
    await waitForWorkspaceLoaded();

    // 1. Attempt to create a duplicate version (Standard Service Fee / 2026.04 / all already exists in seed).
    fireEvent.click(
      screen.getByRole("button", {
        name: tt("pricing.action.createPassengerDraft"),
      }),
    );
    fireEvent.change(screen.getByLabelText(tt("pricing.form.ruleName")), {
      target: { value: "Standard Service Fee" },
    });
    fireEvent.change(screen.getByLabelText(tt("pricing.form.version")), {
      target: { value: "2026.04" },
    });
    fireEvent.change(screen.getByLabelText(tt("pricing.form.serviceFeeBps")), {
      target: { value: "1600" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: tt("pricing.createDraft") }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/A pricing rule with this version already exists/i),
      ).toBeTruthy();
    });

    // No draft was fabricated; Publish button remains disabled.
    const publishHeaderButton = screen.getByRole("button", {
      name: tt("common.publish"),
    }) as HTMLButtonElement;
    expect(publishHeaderButton.disabled).toBe(true);

    // 2. Now enter a valid new version and succeed.
    fireEvent.change(screen.getByLabelText(tt("pricing.form.version")), {
      target: { value: "2026.07-draft" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: tt("pricing.createDraft") }),
    );
    await waitFor(() => {
      expect(screen.getAllByText("2026.07-draft").length).toBeGreaterThan(0);
    });

    // 3. Simulate a 503 failure on publish; verify no optimistic receipt is shown and modal stays open.
    harness.failNextPublish(
      new ApiRequestError(
        503,
        "PRICING_PUBLISH_UNAVAILABLE",
        "Upstream pricing authority temporarily unavailable.",
      ),
    );
    fireEvent.click(publishHeaderButton);
    const modalForm = screen
      .getByRole("button", { name: tt("pricing.confirmPublish") })
      .closest("form")!;
    fireEvent.change(
      within(modalForm).getByLabelText(tt("pricing.form.publishReason")),
      {
        target: { value: "Valid twelve+ character publish reason for test" },
      },
    );
    fireEvent.click(
      within(modalForm).getByRole("button", {
        name: tt("pricing.confirmPublish"),
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Upstream pricing authority temporarily unavailable/i),
      ).toBeTruthy();
    });
    expect(screen.queryByText(tt("pricing.banner.receipt.title"))).toBeNull();
  });
});
