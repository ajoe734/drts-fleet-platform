/**
 * Shared types for the Platform Admin LLM assistant route-context layer.
 *
 * These types describe *deterministic* route context: everything the assistant
 * is allowed to know about "where the operator is and what is on screen" must be
 * derived from the route, the query string, and page-owned selection state that
 * a page explicitly hands to the adapter.
 *
 * Hard rule (acceptance §"not arbitrary DOM scraping"): no value produced by
 * this layer may be sourced from DOM scraping. The adapter never reads
 * `document`, `window`, `innerText`, or rendered nodes. Pages surface their own
 * selection state through {@link PageContextSnapshot}; that is the only channel
 * for dynamic, page-local context.
 *
 * Authority: route map + behaviour from
 *   - docs/05-ui/platform-admin-design-handoff-packet-20260525.md (§§5.1–5.18)
 *   - docs/05-ui/platform-admin-body-parity-audit-20260602.md (18-route census)
 *   - docs/02-architecture/realtime-data-model-20260524.md (§2 refresh tiers)
 */

/**
 * Canonical refresh tiers. Re-exported verbatim from the platform-wide contract
 * (`@drts/contracts` → `ui-runtime.ts`, Q-X02 fixed cadence tiers) so this layer
 * never drifts from the source of truth. The full union is
 * `urgent | fast | dispatch | medium | medium_slow | slow | manual`; Platform
 * Admin routes only use the slower web-poll tiers (`slow`/`medium`/`manual`),
 * but the type stays canonical so any future tier resolves without a local edit.
 */
import type { RefreshTier } from "@drts/contracts";
export type { RefreshTier };

/** Stable key for each of the 18 Platform Admin canvas routes. */
export type PlatformAdminRouteKey =
  | "home"
  | "tenants"
  | "tenant-detail"
  | "tenant-governance"
  | "partners"
  | "partner-detail"
  | "users"
  | "fleet"
  | "switchboard"
  | "pricing"
  | "payments"
  | "reimbursements"
  | "reimbursement-batch-detail"
  | "adapter-registry"
  | "health"
  | "notices"
  | "audit"
  | "feature-flags";

export type LocalizedText = { zh: string; en: string };

/** Kinds of entity the assistant may reference, scoped to Platform Admin. */
export type AssistantEntityKind =
  | "tenant"
  | "partner-entry"
  | "platform-user"
  | "vehicle"
  | "driver"
  | "pricing-rule"
  | "payment-batch"
  | "reimbursement-batch"
  | "reconciliation-issue"
  | "adapter"
  | "feature-flag"
  | "audit-record"
  | "notice"
  | "public-info-version"
  | "placard";

/** Provenance of an entity reference, for assistant transparency/audit. */
export type EntityRefSource = "route-param" | "query" | "page-selection";

export interface AssistantEntityRef {
  kind: AssistantEntityKind;
  /** Stable identifier (slug or id) from the route, query, or page state. */
  id: string;
  /** Optional human label, only ever provided by page-owned state. */
  label?: string;
  /** Where this reference was derived from. */
  source: EntityRefSource;
}

export type RouteContextWarningSeverity = "info" | "warning" | "critical";

export interface RouteContextWarning {
  /** Stable machine code; deduped across baseline + page warnings. */
  code: string;
  severity: RouteContextWarningSeverity;
  message: LocalizedText;
}

/**
 * Page-owned snapshot a route may hand to `buildRouteContext`. This is the ONLY
 * channel for dynamic, page-local context (active tab, current selection, live
 * warnings). Pages pass plain serializable data they already hold in React
 * state; the adapter never reaches into the DOM to discover it.
 */
export interface PageContextSnapshot {
  /** Page-owned active tab key. Ignored unless it is a valid tab for the route. */
  activeTab?: string;
  /** Page-owned selection (e.g. the row the operator opened). Never scraped. */
  selection?: AssistantEntityRef[];
  /** Page-derived advisory warnings (e.g. "maintenance mode is ON"). */
  warnings?: RouteContextWarning[];
}

/** Static, compile-time registry entry describing one Platform Admin route. */
export interface AssistantRouteDescriptor {
  routeKey: PlatformAdminRouteKey;
  /** Path template using Next.js dynamic segments, e.g. `/partners/[entrySlug]`. */
  pathTemplate: string;
  /** Shell nav section key (mirrors admin-shell sections). */
  section: string;
  title: LocalizedText;
  /** Canonical tab keys for this route, in canvas order. Empty for tabless routes. */
  tabs: string[];
  /** Default active tab when the page provides none. */
  defaultTab: string | null;
  refreshTier: RefreshTier;
  /** Dynamic route params lifted into visible entity refs. */
  paramEntities?: Array<{ param: string; kind: AssistantEntityKind }>;
  /** Known query keys lifted into visible entity refs. */
  queryEntities?: Array<{ key: string; kind: AssistantEntityKind }>;
  /** Warnings that always apply to this route. */
  baselineWarnings?: RouteContextWarning[];
  /**
   * True when the route's body is owned by a separate body-parity worker and may
   * not yet be implemented in this app. Metadata still resolves so the assistant
   * can describe the route. Per the 2026-06-02 body parity audit these are:
   * `/tenants/[tenantId]`, `/payments/reimbursements`,
   * `/payments/reimbursements/[batchId]`.
   */
  bodyParityPending?: boolean;
}

/** Fully-resolved, deterministic context for the assistant on a given route. */
export interface AssistantRouteContext {
  routeKey: PlatformAdminRouteKey;
  pathname: string;
  section: string;
  title: LocalizedText;
  /** Resolved active tab (page-owned if valid, else descriptor default). */
  activeTab: string | null;
  availableTabs: string[];
  /** Entity refs from route params, query, and page-owned selection. */
  visibleEntityRefs: AssistantEntityRef[];
  /** Baseline + body-parity + page warnings, deduped by code. */
  warnings: RouteContextWarning[];
  refreshTier: RefreshTier;
  /** False for not-yet-implemented body-parity routes. */
  routeImplemented: boolean;
  /** Provenance flags: which inputs contributed to this context. */
  generatedFrom: {
    route: boolean;
    query: boolean;
    pageSelection: boolean;
  };
}

/**
 * Loose query input accepted by the adapter. Supports both the client
 * `useSearchParams()` (`URLSearchParams`) and the server `searchParams` prop
 * (`Record`). Plain strings are parsed as a query string. No DOM types here.
 */
export type AssistantQueryInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | string
  | null
  | undefined;
