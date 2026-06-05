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
import { usePathname, useRouter } from "next/navigation";
import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AssistantEntityRef,
  AssistantQueryInput,
  AssistantRouteContext,
  AssistantRouteDescriptor,
  PageContextSnapshot,
  PlatformAdminRouteKey,
  RouteContextWarning,
} from "./assistant-types";

export const PLATFORM_ADMIN_ROUTE_REGISTRY = {
  home: { href: "/" },
  tenants: { href: "/tenants" },
  "tenant-governance": { href: "/tenant-governance" },
  partners: { href: "/partners" },
  users: { href: "/users" },
  fleet: { href: "/fleet" },
  "service-products": { href: "/service-products" },
  "vehicle-eligibility": { href: "/vehicle-eligibility" },
  "fleet-partners": { href: "/fleet-partners" },
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
};

// ---------------------------------------------------------------------------
// Reusable baseline warnings
// ---------------------------------------------------------------------------

const HIGH_RISK_ACTIONS_WARNING: RouteContextWarning = {
  code: "high_risk_actions_present",
  severity: "warning",
  message: {
    zh: "本頁含高風險操作，需 modal 確認、填寫原因並產生稽核紀錄。",
    en: "This route exposes high-risk actions requiring modal confirmation, a reason, and an audit receipt.",
  },
};

const WRITE_AUTHORITY_WARNING: RouteContextWarning = {
  code: "platform_write_authority",
  severity: "warning",
  message: {
    zh: "本頁具平台寫入權限（唯一可寫旗標的 App），變更會即時影響其他 App。",
    en: "This route holds platform write authority (the only app that can write flags); changes propagate to other apps.",
  },
};

const PLAINTEXT_SECRET_WARNING: RouteContextWarning = {
  code: "plaintext_secret_once",
  severity: "warning",
  message: {
    zh: "憑證/密鑰僅在發行或輪替當下以明文顯示一次，之後不可再檢視。",
    en: "Credentials/secrets are shown in plaintext only once at issue/rotation and cannot be viewed again.",
  },
};

const MAINTENANCE_MODE_WARNING: RouteContextWarning = {
  code: "maintenance_mode_surface",
  severity: "warning",
  message: {
    zh: "維護模式為高風險操作，啟用會跨 App 推送橫幅到 ops/tenant/driver。",
    en: "Maintenance mode is high-risk; enabling it pushes a cross-app banner to ops/tenant/driver.",
  },
};

const LEGAL_HOLD_WARNING: RouteContextWarning = {
  code: "legal_hold_evidence_governance",
  severity: "info",
  message: {
    zh: "稽核證據治理：法律保留與刪除例外為高風險操作，需原因並記錄擁有者。",
    en: "Evidence governance: legal holds and deletion exceptions are high-risk and require a reason plus a recorded owner.",
  },
};

const BODY_PARITY_PENDING_WARNING: RouteContextWarning = {
  code: "route_body_parity_pending",
  severity: "info",
  message: {
    zh: "此路由的頁面實作由 body-parity 工作項負責，可能尚未上線；metadata 已就緒。",
    en: "This route's page body is owned by a body-parity work item and may not be live yet; metadata is ready.",
  },
};

const UNKNOWN_ROUTE_WARNING: RouteContextWarning = {
  code: "unknown_route",
  severity: "info",
  message: {
    zh: "未在 Platform Admin 路由註冊表中找到此路徑，已退回首頁 context。",
    en: "Path is not in the Platform Admin route registry; falling back to home context.",
  },
};

// ---------------------------------------------------------------------------
// Route registry — all 19 Platform Admin routes
// ---------------------------------------------------------------------------

/**
 * The 19 routes. `bodyParityPending` marks the 3 routes that returned 404
 * on dev as of the 2026-06-02 body parity audit and whose bodies are owned by
 * separate workers; their metadata still resolves here.
 */
export const PLATFORM_ADMIN_ROUTES: readonly AssistantRouteDescriptor[] = [
  {
    routeKey: "home",
    pathTemplate: "/",
    section: "workspace",
    title: { zh: "工作首頁", en: "Home" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
  },
  {
    routeKey: "tenants",
    pathTemplate: "/tenants",
    section: "tenant",
    title: { zh: "租戶", en: "Tenants" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
  },
  {
    routeKey: "tenant-detail",
    pathTemplate: "/tenants/[tenantId]",
    section: "tenant",
    title: { zh: "租戶詳情", en: "Tenant Detail" },
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
    title: { zh: "跨租戶治理", en: "Tenant Governance" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    queryEntities: [{ key: "tenantId", kind: "tenant" }],
  },
  {
    routeKey: "partners",
    pathTemplate: "/partners",
    section: "tenant",
    title: { zh: "合作夥伴", en: "Partner Entries" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    queryEntities: [{ key: "tenantId", kind: "tenant" }],
  },
  {
    routeKey: "partner-detail",
    pathTemplate: "/partners/[entrySlug]",
    section: "tenant",
    title: { zh: "合作夥伴詳情", en: "Partner Entry Detail" },
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
    title: { zh: "平台人員", en: "Platform Staff" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "fleet",
    pathTemplate: "/fleet",
    section: "fleet",
    title: { zh: "車隊與法遵", en: "Fleet & Compliance" },
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
    title: { zh: "服務產品", en: "Service Products" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "vehicle-eligibility",
    pathTemplate: "/vehicle-eligibility",
    section: "fleet",
    title: { zh: "車輛資格矩陣", en: "Vehicle Eligibility Matrix" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "fleet-partners",
    pathTemplate: "/fleet-partners",
    section: "fleet",
    title: { zh: "車隊夥伴", en: "Fleet Partners" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "fleet-partner-detail",
    pathTemplate: "/fleet-partners/[fleetPartnerId]",
    section: "fleet",
    title: { zh: "車隊夥伴詳情", en: "Fleet Partner Detail" },
    tabs: [],
    defaultTab: null,
    refreshTier: "slow",
    paramEntities: [{ param: "fleetPartnerId", kind: "fleet-partner" }],
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "switchboard",
    pathTemplate: "/switchboard",
    section: "commerce",
    title: { zh: "公開資訊", en: "Public Info & Placards" },
    tabs: ["public-info", "placards"],
    defaultTab: "public-info",
    refreshTier: "slow",
    baselineWarnings: [HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "pricing",
    pathTemplate: "/pricing",
    section: "commerce",
    title: { zh: "費率治理", en: "Pricing" },
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
    title: { zh: "結算與帳務", en: "Payments" },
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
    title: { zh: "代墊批次", en: "Reimbursements" },
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
    title: { zh: "代墊批次詳情", en: "Reimbursement Batch Detail" },
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
    title: { zh: "平台 Adapter", en: "Adapter Registry" },
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
    title: { zh: "平台健康", en: "Platform Health" },
    tabs: ["alerts", "adapters"],
    defaultTab: "alerts",
    refreshTier: "medium",
  },
  {
    routeKey: "notices",
    pathTemplate: "/notices",
    section: "ops",
    title: { zh: "公告與維護", en: "Notices & Maintenance" },
    tabs: ["notices", "maintenance-mode", "broadcast-history"],
    defaultTab: "notices",
    refreshTier: "slow",
    baselineWarnings: [MAINTENANCE_MODE_WARNING, HIGH_RISK_ACTIONS_WARNING],
  },
  {
    routeKey: "audit",
    pathTemplate: "/audit",
    section: "ops",
    title: { zh: "稽核與證據", en: "Audit & Evidence" },
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
    title: { zh: "功能旗標", en: "Feature Flags" },
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

  useEffect(() => {
    setPageBridge(bridge);
    return () => {
      setPageBridge(null);
    };
  }, [bridge, setPageBridge]);
}

export function usePlatformAdminAssistantRouteContext() {
  return usePlatformAdminRouteContext();
}
