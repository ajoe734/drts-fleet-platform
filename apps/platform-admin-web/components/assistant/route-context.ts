"use client";

/**
 * Deterministic route-context registry + adapters for the Platform Admin LLM
 * assistant.
 *
 * This module is the single source of truth for "what route is the operator on,
 * which tab is active, what entities are in view, what should the assistant be
 * warned about, and how fresh is the data". Every value is computed purely from:
 *
 *   1. the route (pathname),
 *   2. the query string, and
 *   3. page-owned selection state passed in via {@link PageContextSnapshot}.
 *
 * It performs NO DOM scraping. The module imports no React/Next runtime and
 * never touches `document` / `window`, so it is unit-testable in plain Node and
 * safe to call from both server and client components.
 *
 * Client usage (no page-body rewrite required):
 *
 *   "use client";
 *   import { usePathname, useSearchParams } from "next/navigation";
 *   import { buildRouteContext } from "@/components/assistant/route-context";
 *   const ctx = buildRouteContext(usePathname(), useSearchParams(), {
 *     activeTab,                 // page-owned tab state
 *     selection: [selectedRef],  // page-owned selection, NOT scraped
 *   });
 *
 * Server usage:
 *
 *   const ctx = buildRouteContext("/payments", searchParams);
 *
 * Route map authority: docs/05-ui/platform-admin-design-handoff-packet-20260525.md
 * (§§5.1–5.18) and docs/05-ui/platform-admin-body-parity-audit-20260602.md.
 * Refresh tiers: docs/02-architecture/realtime-data-model-20260524.md §2.
 */

import type { CrossAppResourceLink } from "@drts/contracts";
import { getBilingualText } from "../../lib/translations";
import { usePathname, useRouter } from "next/navigation";
import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ASSISTANT_CONTEXT_SCHEMA } from "./assistant-types";
import type {
  AssistantAvailableAction,
  AssistantContextPacket,
  AssistantEntityRef,
  AssistantFormContext,
  AssistantFormFieldContext,
  AssistantQueryInput,
  AssistantRouteContext,
  AssistantRouteDescriptor,
  AssistantTableContext,
  PageContextSnapshot,
  PlatformAdminRouteKey,
  RouteContextWarning,
} from "./assistant-types";

function localizedText(key: string) {
  return getBilingualText(key);
}

export const PLATFORM_ADMIN_ROUTE_REGISTRY = {
  home: { href: "/" },
  tenants: { href: "/tenants" },
  "tenant-governance": { href: "/tenant-governance" },
  partners: { href: "/partners" },
  users: { href: "/users" },
  fleet: { href: "/fleet" },
  "service-products": { href: "/service-products" },
  "service-area-governance": { href: "/service-area-governance" },
  "vehicle-eligibility": { href: "/vehicle-eligibility" },
  "fleet-partners": { href: "/fleet-partners" },
  sandbox: { href: "/sandbox" },
  "sandbox-suspend": { href: "/sandbox/suspend" },
  "sandbox-compliance": { href: "/platform-admin/compliance" },
  "sandbox-investigations": { href: "/platform-admin/investigations" },
  "sandbox-evidence-exports": { href: "/platform-admin/evidence/exports" },
  "sandbox-legal-holds": { href: "/platform-admin/evidence/legal-holds" },
  "sandbox-regulatory-reports": { href: "/platform-admin/regulatory-reports" },
  switchboard: { href: "/switchboard" },
  pricing: { href: "/pricing" },
  payments: { href: "/payments" },
  reimbursements: { href: "/payments/reimbursements" },
  "adapter-registry": { href: "/adapter-registry" },
  health: { href: "/health" },
  notices: { href: "/notices" },
  audit: { href: "/audit" },
  "feature-flags": { href: "/feature-flags" },
} as const;

export type PlatformAdminRouteId = keyof typeof PLATFORM_ADMIN_ROUTE_REGISTRY;

export type AssistantToolResult =
  | {
      ok: true;
      code: string;
      message: string;
      payload?: Record<string, unknown>;
    }
  | {
      ok: false;
      code: string;
      message: string;
      payload?: Record<string, unknown>;
    };

export type AssistantFilterAdapter = {
  apply: (value: unknown) => AssistantToolResult;
};

export type AssistantDraftAdapter = {
  fill: (values: Record<string, unknown>) => AssistantToolResult;
};

export type PlatformAdminAssistantPageBridge = {
  pageId: string;
  filters?: Record<string, AssistantFilterAdapter>;
  drafts?: Record<string, AssistantDraftAdapter>;
  crossAppLinks?: Record<string, CrossAppResourceLink>;
  /**
   * Live, page-owned context snapshot for the context mesh v2. The overlay
   * calls this at send-time so the packet reflects current selection, form
   * values, validation errors, and visible rows.
   */
  getContextSnapshot?: () => PageContextSnapshot | undefined;
};

// ---------------------------------------------------------------------------
// Reusable baseline warnings
// ---------------------------------------------------------------------------

const HIGH_RISK_ACTIONS_WARNING: RouteContextWarning = {
  code: "high_risk_actions_present",
  severity: "warning",
  message: localizedText("assistant.warning.highRiskActions"),
};

const WRITE_AUTHORITY_WARNING: RouteContextWarning = {
  code: "platform_write_authority",
  severity: "warning",
  message: localizedText("assistant.warning.writeAuthority"),
};

const PLAINTEXT_SECRET_WARNING: RouteContextWarning = {
  code: "plaintext_secret_once",
  severity: "warning",
  message: localizedText("assistant.warning.plaintextSecret"),
};

const MAINTENANCE_MODE_WARNING: RouteContextWarning = {
  code: "maintenance_mode_surface",
  severity: "warning",
  message: localizedText("assistant.warning.maintenanceMode"),
};

const LEGAL_HOLD_WARNING: RouteContextWarning = {
  code: "legal_hold_evidence_governance",
  severity: "info",
  message: localizedText("assistant.warning.legalHold"),
};

const BODY_PARITY_PENDING_WARNING: RouteContextWarning = {
  code: "route_body_parity_pending",
  severity: "info",
  message: localizedText("assistant.warning.bodyParityPending"),
};

const UNKNOWN_ROUTE_WARNING: RouteContextWarning = {
  code: "unknown_route",
  severity: "info",
  message: localizedText("assistant.warning.unknownRoute"),
};

// ---------------------------------------------------------------------------
// Route registry — all current Platform Admin routes
// ---------------------------------------------------------------------------

/**
 * The registered routes. `bodyParityPending` marks the 3 routes that returned 404
 * on dev as of the 2026-06-02 body parity audit and whose bodies are owned by
 * separate workers; their metadata still resolves here.
 */
export const PLATFORM_ADMIN_ROUTES: readonly AssistantRouteDescriptor[] = [
  {
    routeKey: "home",
    pathTemplate: "/",
    section: "workspace",
    title: localizedText("assistant.route.home.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
  },
  {
    routeKey: "tenants",
    pathTemplate: "/tenants",
    section: "tenant",
    title: localizedText("assistant.route.tenants.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
  },
  {
    routeKey: "tenant-detail",
    pathTemplate: "/tenants/[tenantId]",
    section: "tenant",
    title: localizedText("assistant.route.tenantDetail.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    paramEntities: [{ param: "tenantId", kind: "tenant" }],
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
    bodyParityPending: true,
  },
  {
    routeKey: "tenant-governance",
    pathTemplate: "/tenant-governance",
    section: "tenant",
    title: localizedText("assistant.route.tenantGovernance.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    queryEntities: [{ key: "tenantId", kind: "tenant" }],
  },
  {
    routeKey: "partners",
    pathTemplate: "/partners",
    section: "tenant",
    title: localizedText("assistant.route.partners.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    queryEntities: [{ key: "tenantId", kind: "tenant" }],
  },
  {
    routeKey: "partner-detail",
    pathTemplate: "/partners/[entrySlug]",
    section: "tenant",
    title: localizedText("assistant.route.partnerDetail.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    paramEntities: [{ param: "entrySlug", kind: "partner-entry" }],
    baselineWarnings: [PLAINTEXT_SECRET_WARNING, HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "users",
    pathTemplate: "/users",
    section: "tenant",
    title: localizedText("assistant.route.users.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "fleet",
    pathTemplate: "/fleet",
    section: "fleet",
    title: localizedText("assistant.route.fleet.title"),
    tabs: [
      "vehicles",
      "drivers",
      "contracts",
      "device-binding",
      "exclusivity-reviews",
      "offboarding",
    ],
    defaultTab: "vehicles",
    refreshTier: "slow",
  },
  {
    routeKey: "service-products",
    pathTemplate: "/service-products",
    section: "commerce",
    title: localizedText("assistant.route.serviceProducts.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "service-area-governance",
    pathTemplate: "/service-area-governance",
    section: "fleet",
    title: localizedText("assistant.route.serviceAreaGovernance.title"),
    tabs: ["service-areas", "stop-policies"],
    defaultTab: "service-areas",
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "vehicle-eligibility",
    pathTemplate: "/vehicle-eligibility",
    section: "fleet",
    title: localizedText("assistant.route.vehicleEligibility.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "fleet-partners",
    pathTemplate: "/fleet-partners",
    section: "fleet",
    title: localizedText("assistant.route.fleetPartners.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "fleet-partner-detail",
    pathTemplate: "/fleet-partners/[fleetPartnerId]",
    section: "fleet",
    title: localizedText("assistant.route.fleetPartnerDetail.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    paramEntities: [{ param: "fleetPartnerId", kind: "fleet-partner" }],
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "sandbox-compliance",
    pathTemplate: "/platform-admin/compliance",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxCompliance.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING, LEGAL_HOLD_WARNING],
  },
  {
    routeKey: "sandbox-compliance-trip-detail",
    pathTemplate: "/platform-admin/compliance/trips/[tripId]",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxComplianceTripDetail.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING, LEGAL_HOLD_WARNING],
  },
  {
    routeKey: "sandbox-investigations",
    pathTemplate: "/platform-admin/investigations",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxInvestigations.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "sandbox-investigation-detail",
    pathTemplate: "/platform-admin/investigations/[caseId]",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxInvestigationDetail.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING, LEGAL_HOLD_WARNING],
  },
  {
    routeKey: "sandbox-investigation-timeline",
    pathTemplate: "/platform-admin/investigations/[caseId]/timeline",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxInvestigationTimeline.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING, LEGAL_HOLD_WARNING],
  },
  {
    routeKey: "sandbox-evidence-manifest",
    pathTemplate: "/platform-admin/evidence/manifests/[manifestId]",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxEvidenceManifest.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [LEGAL_HOLD_WARNING],
  },
  {
    routeKey: "sandbox-evidence-exports",
    pathTemplate: "/platform-admin/evidence/exports",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxEvidenceExports.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING, LEGAL_HOLD_WARNING],
  },
  {
    routeKey: "sandbox-legal-holds",
    pathTemplate: "/platform-admin/evidence/legal-holds",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxLegalHolds.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING, LEGAL_HOLD_WARNING],
  },
  {
    routeKey: "sandbox-regulatory-reports",
    pathTemplate: "/platform-admin/regulatory-reports",
    section: "sandbox",
    title: localizedText("assistant.route.sandboxRegulatoryReports.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "switchboard",
    pathTemplate: "/switchboard",
    section: "commerce",
    title: localizedText("assistant.route.switchboard.title"),
    tabs: ["public-info", "placards"],
    defaultTab: "public-info",
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "pricing",
    pathTemplate: "/pricing",
    section: "commerce",
    title: localizedText("assistant.route.pricing.title"),
    tabs: [
      "passenger-pricing",
      "driver-fee-plans",
      "subsidy-reimbursement-rules",
      "published-versions",
    ],
    defaultTab: "passenger-pricing",
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "payments",
    pathTemplate: "/payments",
    section: "commerce",
    title: localizedText("assistant.route.payments.title"),
    tabs: [
      "tenant-invoices",
      "driver-statements",
      "settlement-matrix",
      "reconciliation-issues",
      "reimbursements",
    ],
    defaultTab: "tenant-invoices",
    refreshTier: "slow",
    queryEntities: [{ key: "tenantId", kind: "tenant" }],
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "reimbursements",
    pathTemplate: "/payments/reimbursements",
    section: "commerce",
    title: localizedText("assistant.route.reimbursements.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    queryEntities: [{ key: "tenantId", kind: "tenant" }],
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
    bodyParityPending: true,
  },
  {
    routeKey: "reimbursement-batch-detail",
    pathTemplate: "/payments/reimbursements/[batchId]",
    section: "commerce",
    title: localizedText("assistant.route.reimbursementBatchDetail.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    paramEntities: [{ param: "batchId", kind: "reimbursement-batch" }],
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
    bodyParityPending: true,
  },
  {
    routeKey: "adapter-registry",
    pathTemplate: "/adapter-registry",
    section: "commerce",
    title: localizedText("assistant.route.adapterRegistry.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "medium",
    queryEntities: [{ key: "adapterId", kind: "adapter" }],
    baselineWarnings: [PLAINTEXT_SECRET_WARNING, HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "health",
    pathTemplate: "/health",
    section: "ops",
    title: localizedText("assistant.route.health.title"),
    tabs: ["alerts", "adapters"],
    defaultTab: "alerts",
    refreshTier: "medium",
  },
  {
    routeKey: "notices",
    pathTemplate: "/notices",
    section: "ops",
    title: localizedText("assistant.route.notices.title"),
    tabs: ["notices", "maintenance-mode", "broadcast-history"],
    defaultTab: "notices",
    refreshTier: "slow",
    baselineWarnings: [MAINTENANCE_MODE_WARNING, HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "audit",
    pathTemplate: "/audit",
    section: "ops",
    title: localizedText("assistant.route.audit.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "manual",
    queryEntities: [{ key: "tenantId", kind: "tenant" }],
    baselineWarnings: [LEGAL_HOLD_WARNING, HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "feature-flags",
    pathTemplate: "/feature-flags",
    section: "ops",
    title: localizedText("assistant.route.featureFlags.title"),
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    queryEntities: [
      { key: "tenantId", kind: "tenant" },
      { key: "flagKey", kind: "feature-flag" },
    ],
    baselineWarnings: [WRITE_AUTHORITY_WARNING, HIGH_RISK_ACTIONS_WARNING],
  },
] as const;

/** Map keyed by route key for O(1) descriptor lookup. */
const ROUTES_BY_KEY: Record<PlatformAdminRouteKey, AssistantRouteDescriptor> =
  PLATFORM_ADMIN_ROUTES.reduce(
    (acc, descriptor) => {
      acc[descriptor.routeKey] = descriptor;
      return acc;
    },
    {} as Record<PlatformAdminRouteKey, AssistantRouteDescriptor>,
  );

const HOME_DESCRIPTOR = ROUTES_BY_KEY.home;

/** All registered route keys, in canvas order. */
export const PLATFORM_ADMIN_ROUTE_KEYS: readonly PlatformAdminRouteKey[] =
  PLATFORM_ADMIN_ROUTES.map((descriptor) => descriptor.routeKey);

/** Look up a descriptor by its route key. */
export function getRouteDescriptor(
  routeKey: PlatformAdminRouteKey,
): AssistantRouteDescriptor {
  return ROUTES_BY_KEY[routeKey];
}

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

export interface RouteMatch {
  descriptor: AssistantRouteDescriptor;
  /** Captured dynamic params, e.g. `{ entrySlug: "acme" }`. */
  params: Record<string, string>;
}

function toSegments(path: string): string[] {
  const [withoutQuery] = path.split("?");
  const [clean] = (withoutQuery ?? "").split("#");
  return (clean ?? "").split("/").filter((segment) => segment.length > 0);
}

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith("[") && segment.endsWith("]");
}

function dynamicParamName(segment: string): string {
  return segment.slice(1, -1).replace(/^\.\.\./, "");
}

/**
 * Deterministically match a pathname against the registry. When more than one
 * template matches (cannot happen with the current map, but kept robust), the
 * candidate with the most *static* segment matches wins, so static routes always
 * beat dynamic ones.
 */
export function matchRoute(pathname: string): RouteMatch | null {
  const pathSegments = toSegments(pathname);

  let best: RouteMatch | null = null;
  let bestStaticScore = -1;

  for (const descriptor of PLATFORM_ADMIN_ROUTES) {
    const templateSegments = toSegments(descriptor.pathTemplate);
    if (templateSegments.length !== pathSegments.length) {
      continue;
    }

    const params: Record<string, string> = {};
    let matched = true;
    let staticScore = 0;

    for (let index = 0; index < templateSegments.length; index += 1) {
      const templateSegment = templateSegments[index] as string;
      const pathSegment = pathSegments[index] as string;

      if (isDynamicSegment(templateSegment)) {
        params[dynamicParamName(templateSegment)] = decodeSegment(pathSegment);
        continue;
      }

      if (templateSegment !== pathSegment) {
        matched = false;
        break;
      }
      staticScore += 1;
    }

    if (matched && staticScore > bestStaticScore) {
      best = { descriptor, params };
      bestStaticScore = staticScore;
    }
  }

  return best;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// ---------------------------------------------------------------------------
// Query normalization (no DOM types)
// ---------------------------------------------------------------------------

function readQueryValue(
  query: AssistantQueryInput,
  key: string,
): string | undefined {
  if (!query) {
    return undefined;
  }

  if (typeof query === "string") {
    const params = new URLSearchParams(
      query.startsWith("?") ? query.slice(1) : query,
    );
    return params.get(key) ?? undefined;
  }

  if (query instanceof URLSearchParams) {
    return query.get(key) ?? undefined;
  }

  const value = query[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value ?? undefined;
}

// ---------------------------------------------------------------------------
// Entity ref + warning assembly
// ---------------------------------------------------------------------------

function dedupeEntityRefs(refs: AssistantEntityRef[]): AssistantEntityRef[] {
  const byKey = new Map<string, AssistantEntityRef>();
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, ref);
      continue;
    }
    // Prefer a ref that carries a label; otherwise keep the earlier (route/query
    // refs are added before page-selection refs).
    if (!existing.label && ref.label) {
      byKey.set(key, { ...existing, label: ref.label });
    }
  }
  return Array.from(byKey.values());
}

function dedupeWarnings(
  warnings: RouteContextWarning[],
): RouteContextWarning[] {
  const byCode = new Map<string, RouteContextWarning>();
  for (const warning of warnings) {
    if (!byCode.has(warning.code)) {
      byCode.set(warning.code, warning);
    }
  }
  return Array.from(byCode.values());
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

/**
 * Build the deterministic assistant route context for a pathname.
 *
 * @param pathname  The current path (e.g. `usePathname()` or a server route).
 * @param query     Optional query input (client `URLSearchParams`, server
 *                  `searchParams`, or a raw query string).
 * @param pageState Optional page-owned snapshot (active tab, selection,
 *                  warnings). This is the ONLY way dynamic page state enters the
 *                  context — there is no DOM scraping fallback.
 */
export function buildRouteContext(
  pathname: string,
  query?: AssistantQueryInput,
  pageState?: PageContextSnapshot,
): AssistantRouteContext {
  const match = matchRoute(pathname);
  const descriptor = match?.descriptor ?? HOME_DESCRIPTOR;
  const params = match?.params ?? {};

  // 1. Entity refs from dynamic route params.
  const routeRefs: AssistantEntityRef[] = (descriptor.paramEntities ?? [])
    .map(({ param, kind }) => {
      const id = params[param];
      return id
        ? ({ kind, id, source: "route-param" } as AssistantEntityRef)
        : null;
    })
    .filter((ref): ref is AssistantEntityRef => ref !== null);

  // 2. Entity refs from known query keys.
  const queryRefs: AssistantEntityRef[] = (descriptor.queryEntities ?? [])
    .map(({ key, kind }) => {
      const id = readQueryValue(query, key);
      return id ? ({ kind, id, source: "query" } as AssistantEntityRef) : null;
    })
    .filter((ref): ref is AssistantEntityRef => ref !== null);

  // 3. Entity refs from page-owned selection (never scraped).
  const selectionRefs: AssistantEntityRef[] = (pageState?.selection ?? []).map(
    (ref) => ({ ...ref, source: "page-selection" as const }),
  );

  const visibleEntityRefs = dedupeEntityRefs([
    ...routeRefs,
    ...queryRefs,
    ...selectionRefs,
  ]);

  // Active tab: page-owned value only if it is valid for this route.
  const pageTab = pageState?.activeTab;
  const activeTab =
    pageTab && descriptor.tabs.includes(pageTab)
      ? pageTab
      : descriptor.defaultTab;

  // Warnings: baseline + body-parity + (unknown-route) + page warnings.
  const warnings = dedupeWarnings([
    ...(descriptor.baselineWarnings ?? []),
    ...(descriptor.bodyParityPending ? [BODY_PARITY_PENDING_WARNING] : []),
    ...(match ? [] : [UNKNOWN_ROUTE_WARNING]),
    ...(pageState?.warnings ?? []),
  ]);

  return {
    routeKey: descriptor.routeKey,
    pathname,
    section: descriptor.section,
    title: descriptor.title,
    activeTab,
    availableTabs: descriptor.tabs,
    visibleEntityRefs,
    warnings,
    refreshTier: descriptor.refreshTier,
    routeImplemented: !descriptor.bodyParityPending,
    generatedFrom: {
      route: true,
      query: queryRefs.length > 0,
      pageSelection:
        selectionRefs.length > 0 ||
        Boolean(pageState?.activeTab) ||
        (pageState?.warnings?.length ?? 0) > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Context mesh v2 — bounded, privacy-filtered context packet
// ---------------------------------------------------------------------------

export const ASSISTANT_CONTEXT_LIMITS = {
  maxTables: 6,
  maxTableColumns: 12,
  maxSampleRows: 5,
  maxForms: 6,
  maxFormFields: 24,
  maxValidationErrors: 12,
  maxActions: 16,
  maxValuePreview: 64,
} as const;

function truncatePreview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= ASSISTANT_CONTEXT_LIMITS.maxValuePreview) {
    return trimmed;
  }
  return `${trimmed.slice(0, ASSISTANT_CONTEXT_LIMITS.maxValuePreview - 1)}…`;
}

function sanitizeFormField(
  field: AssistantFormFieldContext,
): AssistantFormFieldContext {
  const sensitive = field.sensitive === true || field.kind === "secret";
  const base: AssistantFormFieldContext = {
    name: field.name,
    filled: field.filled === true,
  };
  if (field.label !== undefined) {
    base.label = field.label;
  }
  if (field.kind !== undefined) {
    base.kind = field.kind;
  }
  if (field.required !== undefined) {
    base.required = field.required;
  }
  if (sensitive) {
    base.sensitive = true;
    return base;
  }
  if (field.valuePreview !== undefined && field.valuePreview.length > 0) {
    base.valuePreview = truncatePreview(field.valuePreview);
  }
  return base;
}

function sanitizeForm(form: AssistantFormContext): AssistantFormContext {
  return {
    formId: form.formId,
    ...(form.title !== undefined ? { title: form.title } : {}),
    dirty: form.dirty === true,
    ...(form.submitting !== undefined ? { submitting: form.submitting } : {}),
    fields: form.fields
      .slice(0, ASSISTANT_CONTEXT_LIMITS.maxFormFields)
      .map(sanitizeFormField),
    validationErrors: form.validationErrors.slice(
      0,
      ASSISTANT_CONTEXT_LIMITS.maxValidationErrors,
    ),
  };
}

function sanitizeTable(table: AssistantTableContext): AssistantTableContext {
  const next: AssistantTableContext = {
    tableId: table.tableId,
    visibleRowCount: Math.max(0, Math.trunc(table.visibleRowCount)),
  };
  if (table.title !== undefined) {
    next.title = table.title;
  }
  if (table.totalRowCount !== undefined) {
    next.totalRowCount = Math.max(0, Math.trunc(table.totalRowCount));
  }
  if (table.columns) {
    next.columns = table.columns.slice(
      0,
      ASSISTANT_CONTEXT_LIMITS.maxTableColumns,
    );
  }
  if (table.rowEntityKind !== undefined) {
    next.rowEntityKind = table.rowEntityKind;
  }
  if (table.sampleRows) {
    next.sampleRows = table.sampleRows.slice(
      0,
      ASSISTANT_CONTEXT_LIMITS.maxSampleRows,
    );
  }
  if (table.activeFilter !== undefined) {
    next.activeFilter = table.activeFilter;
  }
  return next;
}

function sanitizeAction(
  action: AssistantAvailableAction,
): AssistantAvailableAction {
  const next: AssistantAvailableAction = {
    id: action.id,
    label: action.label,
    enabled: action.enabled === true,
  };
  if (action.risk !== undefined) {
    next.risk = action.risk;
  }
  if (action.disabledReasonCode !== undefined) {
    next.disabledReasonCode = action.disabledReasonCode;
  }
  if (action.requiresConfirmation !== undefined) {
    next.requiresConfirmation = action.requiresConfirmation;
  }
  return next;
}

export function buildAssistantContextPacket(
  pathname: string,
  query?: AssistantQueryInput,
  pageState?: PageContextSnapshot,
  userIntent?: { rawPrompt: string; locale: "zh" | "en" },
): AssistantContextPacket {
  const routeContext = buildRouteContext(pathname, query, pageState);

  const selectedRecords: AssistantEntityRef[] = routeContext.visibleEntityRefs
    .filter((ref) => ref.source === "page-selection")
    .map((ref) => ({ ...ref }));

  const visibleTables = (pageState?.tables ?? [])
    .slice(0, ASSISTANT_CONTEXT_LIMITS.maxTables)
    .map(sanitizeTable);
  const forms = (pageState?.forms ?? [])
    .slice(0, ASSISTANT_CONTEXT_LIMITS.maxForms)
    .map(sanitizeForm);
  const availableActions = (pageState?.availableActions ?? [])
    .slice(0, ASSISTANT_CONTEXT_LIMITS.maxActions)
    .map(sanitizeAction);

  return {
    schema: ASSISTANT_CONTEXT_SCHEMA,
    route: {
      pathname: routeContext.pathname,
      routeKey: routeContext.routeKey,
      title: routeContext.title,
      section: routeContext.section,
      activeTab: routeContext.activeTab,
      availableTabs: routeContext.availableTabs,
      refreshTier: routeContext.refreshTier,
      routeImplemented: routeContext.routeImplemented,
    },
    page: {
      visibleEntityRefs: routeContext.visibleEntityRefs,
      selectedRecords,
      visibleTables,
      visibleWarnings: routeContext.warnings,
      availableActions,
    },
    forms,
    ...(userIntent ? { userIntent } : {}),
    generatedFrom: {
      route: routeContext.generatedFrom.route,
      query: routeContext.generatedFrom.query,
      pageSelection: routeContext.generatedFrom.pageSelection,
      pageTables: visibleTables.length > 0,
      pageForms: forms.length > 0,
      pageActions: availableActions.length > 0,
    },
  };
}

export function serializeAssistantContextPacket(
  packet: AssistantContextPacket,
  locale: "zh" | "en",
): string {
  const { route, page, forms } = packet;

  const entityRefs =
    page.visibleEntityRefs.length > 0
      ? page.visibleEntityRefs
          .map((entity) => `${entity.kind}:${entity.id}`)
          .join(", ")
      : "none";
  const warnings =
    page.visibleWarnings.length > 0
      ? page.visibleWarnings
          .map((warning) => `${warning.code}: ${warning.message[locale]}`)
          .join("; ")
      : "none";

  const lines: string[] = [
    "[Platform Admin route context]",
    `Path: ${route.pathname}`,
    `Page: ${route.title[locale]}`,
    `Active tab: ${route.activeTab ?? "none"}`,
    `Refresh tier: ${route.refreshTier}`,
    `Visible entities: ${entityRefs}`,
    `Warnings: ${warnings}`,
  ];

  if (
    page.visibleTables.length > 0 ||
    page.selectedRecords.length > 0 ||
    page.availableActions.length > 0
  ) {
    lines.push("", "[Page context]");

    if (page.visibleTables.length > 0) {
      lines.push(
        `Visible tables: ${page.visibleTables
          .map((table) => {
            const count =
              table.totalRowCount !== undefined &&
              table.totalRowCount !== table.visibleRowCount
                ? `${table.visibleRowCount}/${table.totalRowCount} rows`
                : `${table.visibleRowCount} rows`;
            const cols =
              table.columns && table.columns.length > 0
                ? `; columns: ${table.columns
                    .map((col) => col.label ?? col.key)
                    .join(", ")}`
                : "";
            const filter = table.activeFilter
              ? `; filter: ${table.activeFilter}`
              : "";
            return `${table.title ?? table.tableId} (${count}${cols}${filter})`;
          })
          .join("; ")}`,
      );
    }

    if (page.selectedRecords.length > 0) {
      lines.push(
        `Selected records: ${page.selectedRecords
          .map((ref) =>
            ref.label
              ? `${ref.kind}:${ref.id} (${ref.label})`
              : `${ref.kind}:${ref.id}`,
          )
          .join(", ")}`,
      );
    }

    if (page.availableActions.length > 0) {
      lines.push(
        `Available actions: ${page.availableActions
          .map((action) => {
            const tags = [
              action.risk ?? "low",
              action.enabled
                ? action.requiresConfirmation
                  ? "requires confirmation"
                  : "ready"
                : `disabled${
                    action.disabledReasonCode
                      ? `:${action.disabledReasonCode}`
                      : ""
                  }`,
            ];
            return `${action.label} [${tags.join(", ")}]`;
          })
          .join("; ")}`,
      );
    }
  }

  if (forms.length > 0) {
    lines.push("", "[Forms]");
    for (const form of forms) {
      const flags = [form.dirty ? "dirty" : "pristine"];
      if (form.submitting) {
        flags.push("submitting");
      }
      const fieldSummary =
        form.fields.length > 0
          ? form.fields
              .map((field) => {
                const state = field.filled
                  ? field.sensitive
                    ? "filled(redacted)"
                    : field.valuePreview
                      ? `filled "${field.valuePreview}"`
                      : "filled"
                  : `empty${field.required ? "(required)" : ""}`;
                return `${field.name}=${state}`;
              })
              .join(", ")
          : "no fields";
      lines.push(
        `${form.title ?? form.formId} (${flags.join(", ")}): ${fieldSummary}`,
      );
      if (form.validationErrors.length > 0) {
        lines.push(
          `  errors: ${form.validationErrors
            .map((err) =>
              err.field ? `${err.field}: ${err.message}` : err.message,
            )
            .join("; ")}`,
        );
      }
    }
  }

  return lines.join("\n");
}

type PlatformAdminRouteContextValue = {
  pathname: string;
  pageBridge: PlatformAdminAssistantPageBridge | null;
  setPageBridge: (bridge: PlatformAdminAssistantPageBridge | null) => void;
  navigateToHref: (href: string) => AssistantToolResult;
  openCrossAppLink: (link: CrossAppResourceLink) => AssistantToolResult;
};

const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";
const DEFAULT_OPS_CONSOLE_BASE = "/_apps/ops-console";
const DEFAULT_TENANT_CONSOLE_BASE = "/_apps/tenant-console";

const PlatformAdminRouteContext =
  createContext<PlatformAdminRouteContextValue | null>(null);

function trimBaseUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim().replace(/\/$/, "");
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function joinBase(base: string, route: string) {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${base}${normalizedRoute}`;
}

export function resolvePlatformAdminRoute(
  routeId: PlatformAdminRouteId,
): string {
  return PLATFORM_ADMIN_ROUTE_REGISTRY[routeId].href;
}

export function resolvePlatformAdminRouteByHref(href: string) {
  const normalizedHref = href.trim();
  const routeEntry = Object.entries(PLATFORM_ADMIN_ROUTE_REGISTRY).find(
    ([, route]) => route.href === normalizedHref,
  );
  if (!routeEntry) {
    return null;
  }

  const [routeId, route] = routeEntry;
  return {
    routeId: routeId as PlatformAdminRouteId,
    href: route.href,
  };
}

export function resolveCrossAppHref(link: CrossAppResourceLink): string {
  const base =
    link.targetApp === "platform-admin"
      ? trimBaseUrl(
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
            process.env.DRTS_PLATFORM_ADMIN_URL,
          DEFAULT_PLATFORM_ADMIN_BASE,
        )
      : link.targetApp === "ops-console"
        ? trimBaseUrl(
            process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ??
              process.env.DRTS_OPS_CONSOLE_URL,
            DEFAULT_OPS_CONSOLE_BASE,
          )
        : trimBaseUrl(
            process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ??
              process.env.DRTS_TENANT_CONSOLE_URL,
            DEFAULT_TENANT_CONSOLE_BASE,
          );

  return joinBase(base, link.route);
}

export function PlatformAdminAssistantProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [pageBridge, setPageBridge] =
    useState<PlatformAdminAssistantPageBridge | null>(null);

  const value = useMemo<PlatformAdminRouteContextValue>(
    () => ({
      pathname,
      pageBridge,
      setPageBridge,
      navigateToHref(href) {
        router.push(href);
        return {
          ok: true,
          code: "route_opened",
          message: `Opened platform route ${href}.`,
          payload: { href },
        };
      },
      openCrossAppLink(link) {
        const href = resolveCrossAppHref(link);
        window.open(href, "_blank", "noopener,noreferrer");
        return {
          ok: true,
          code: "cross_app_opened",
          message: `Opened ${link.targetApp} resource in a new tab.`,
          payload: {
            href,
            targetApp: link.targetApp,
            resourceType: link.resourceType,
            resourceId: link.resourceId,
          },
        };
      },
    }),
    [pageBridge, pathname, router],
  );

  return createElement(PlatformAdminRouteContext.Provider, { value }, children);
}

function usePlatformAdminRouteContext() {
  const context = useContext(PlatformAdminRouteContext);
  if (!context) {
    throw new Error(
      "PlatformAdminAssistantProvider is required for assistant route context.",
    );
  }
  return context;
}

export function usePlatformAdminAssistantPage(
  bridge: PlatformAdminAssistantPageBridge,
) {
  const { setPageBridge } = usePlatformAdminRouteContext();
  const latestBridgeRef = useRef(bridge);
  const stableBridgeRef = useRef<PlatformAdminAssistantPageBridge | null>(null);

  latestBridgeRef.current = bridge;

  if (stableBridgeRef.current === null) {
    stableBridgeRef.current = createStablePageBridgeProxy(
      () => latestBridgeRef.current,
    );
  }

  useEffect(() => {
    setPageBridge(stableBridgeRef.current);
    return () => {
      setPageBridge(null);
    };
  }, [setPageBridge]);
}

export function usePlatformAdminAssistantRouteContext() {
  return usePlatformAdminRouteContext();
}

export function createStablePageBridgeProxy(
  getCurrentBridge: () => PlatformAdminAssistantPageBridge,
): PlatformAdminAssistantPageBridge {
  return new Proxy(
    {
      pageId: getCurrentBridge().pageId,
      getContextSnapshot() {
        return getCurrentBridge().getContextSnapshot?.();
      },
    } as PlatformAdminAssistantPageBridge,
    {
      get(_target, property) {
        if (property === "getContextSnapshot") {
          return () => getCurrentBridge().getContextSnapshot?.();
        }
        return getCurrentBridge()[
          property as keyof PlatformAdminAssistantPageBridge
        ];
      },
    },
  );
}
