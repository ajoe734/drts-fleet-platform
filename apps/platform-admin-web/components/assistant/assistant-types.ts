"use client";

import type { CSSProperties, ReactNode } from "react";
import { buildCanvasTheme } from "../../../../packages/ui-web/src/canvas-tokens";

export const assistantTheme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

export type AssistantViewState =
  | "idle"
  | "thinking"
  | "planning"
  | "awaiting_confirmation"
  | "executing"
  | "receipt"
  | "error";

export type AssistantMessageRole = "user" | "assistant" | "system";
export type AssistantRiskLevel = "low" | "medium" | "high";
export type AssistantStepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked";
export type AssistantReceiptStatus =
  | "accepted"
  | "completed"
  | "failed"
  | "queued";

export interface AssistantActionPlanStep {
  id: string;
  title: string;
  detail?: string | null;
  status: AssistantStepStatus;
}

export interface AssistantActionPlan {
  title: string;
  summary?: string | null;
  rationale?: string | null;
  resourceLabel?: string | null;
  riskLevel?: AssistantRiskLevel;
  steps: AssistantActionPlanStep[];
  warnings?: string[];
  footer?: ReactNode;
}

export interface AssistantConfirmationRequest {
  title: string;
  message: string;
  riskLevel: AssistantRiskLevel;
  resourceLabel?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonHint?: string | null;
  requiresReason?: boolean;
}

export interface AssistantReceipt {
  title?: string | null;
  message?: string | null;
  actionId?: string | null;
  requestId?: string | null;
  auditId?: string | null;
  resourceLabel?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  status: AssistantReceiptStatus;
  auditHref?: string | null;
}

export interface AssistantErrorState {
  title?: string | null;
  message: string;
  hint?: string | null;
}

export interface AssistantMessageRecord {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt?: string | null;
  state?: AssistantViewState;
  plan?: AssistantActionPlan | null;
  confirmation?: AssistantConfirmationRequest | null;
  receipt?: AssistantReceipt | null;
  error?: AssistantErrorState | null;
}

export function assistantStatusTone(state: AssistantViewState) {
  switch (state) {
    case "thinking":
    case "planning":
      return "info";
    case "awaiting_confirmation":
      return "warn";
    case "executing":
      return "accent";
    case "receipt":
      return "success";
    case "error":
      return "danger";
    case "idle":
    default:
      return "neutral";
  }
}

export function assistantStateLabel(state: AssistantViewState) {
  switch (state) {
    case "awaiting_confirmation":
      return "awaiting confirmation";
    default:
      return state.replaceAll("_", " ");
  }
}

export function assistantRiskTone(risk: AssistantRiskLevel) {
  switch (risk) {
    case "high":
      return "danger";
    case "medium":
      return "warn";
    case "low":
    default:
      return "info";
  }
}

export function assistantReceiptTone(status: AssistantReceiptStatus) {
  switch (status) {
    case "completed":
      return "success";
    case "accepted":
    case "queued":
      return "info";
    case "failed":
    default:
      return "danger";
  }
}

export function assistantStepTone(status: AssistantStepStatus) {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "info";
    case "blocked":
      return "danger";
    case "pending":
    default:
      return "neutral";
  }
}

export const assistantCardStyle: CSSProperties = {
  borderRadius: 18,
  border: `1px solid ${assistantTheme.border}`,
  background: assistantTheme.surface,
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.08)",
};

export const assistantInsetStyle: CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${assistantTheme.border}`,
  background: assistantTheme.surfaceLo,
};

export const assistantMutedTextStyle: CSSProperties = {
  color: assistantTheme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
};

export const assistantMonoTextStyle: CSSProperties = {
  fontFamily: assistantTheme.monoFamily,
  fontSize: 11.5,
};

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
 * Canonical refresh tiers from the realtime data model (§2). Web apps poll /
 * refresh manually; `push_interrupt` is Driver-App only and never used here, but
 * is included so the union matches the platform-wide contract.
 */
export type RefreshTier =
  | "fast"
  | "medium"
  | "slow"
  | "manual"
  | "push_interrupt";

/** Stable key for each of the 19 Platform Admin routes. */
export type PlatformAdminRouteKey =
  | "home"
  | "tenants"
  | "tenant-detail"
  | "tenant-governance"
  | "partners"
  | "partner-detail"
  | "users"
  | "fleet"
  | "service-products"
  | "vehicle-eligibility"
  | "fleet-partners"
  | "fleet-partner-detail"
  | "switchboard"
  | "pricing"
  | "payments"
  | "reimbursements"
  | "reimbursement-batch-detail"
  | "adapter-registry"
  | "health"
  | "notices"
  | "audit"
  | "feature-flags"
  | "sandbox-compliance"
  | "sandbox-compliance-trip-detail"
  | "sandbox-investigations"
  | "sandbox-investigation-detail"
  | "sandbox-investigation-timeline"
  | "sandbox-evidence-manifest"
  | "sandbox-evidence-exports"
  | "sandbox-legal-holds"
  | "sandbox-regulatory-reports";

export type LocalizedText = { zh: string; en: string };

/** Kinds of entity the assistant may reference, scoped to Platform Admin. */
export type AssistantEntityKind =
  | "tenant"
  | "partner-entry"
  | "fleet-partner"
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
 * Form field kinds the assistant can reason about.
 */
export type AssistantFieldKind =
  | "text"
  | "number"
  | "select"
  | "multiselect"
  | "boolean"
  | "date"
  | "secret"
  | "textarea"
  | "other";

/**
 * One field of a page-owned form. `valuePreview` is a short, non-sensitive
 * preview only; for `secret`/`sensitive` fields no value is ever exposed.
 */
export interface AssistantFormFieldContext {
  name: string;
  label?: string;
  kind?: AssistantFieldKind;
  required?: boolean;
  /** True when the field currently holds a non-empty value. */
  filled: boolean;
  /**
   * Short preview of the current value. The builder truncates it and drops it
   * entirely for sensitive fields. Never the raw value for credentials.
   */
  valuePreview?: string;
  /** True when the field is sensitive; its value must never be serialized. */
  sensitive?: boolean;
}

/** A page-reported validation error, field-scoped when `field` is set. */
export interface AssistantFormValidationError {
  field?: string;
  code?: string;
  message: string;
}

/** A page-owned form currently rendered on the route. */
export interface AssistantFormContext {
  formId: string;
  title?: string;
  fields: AssistantFormFieldContext[];
  /** True when the operator has edited the form since load/submit. */
  dirty: boolean;
  /** True when the form is mid-submit. */
  submitting?: boolean;
  validationErrors: AssistantFormValidationError[];
}

/** A column key/label pair a page exposes for an assistant-visible table. */
export interface AssistantTableColumn {
  key: string;
  label?: string;
}

/**
 * A page-owned snapshot of a visible data table. Pages pass bounded summary
 * data they already hold in state; the builder caps columns and sample rows.
 */
export interface AssistantTableContext {
  tableId: string;
  title?: string;
  /** Total rows known to the page (e.g. unfiltered count), when known. */
  totalRowCount?: number;
  /** Rows currently rendered/visible after filters. */
  visibleRowCount: number;
  /** Columns in display order. */
  columns?: AssistantTableColumn[];
  /** Entity kind each row maps to, when uniform. */
  rowEntityKind?: AssistantEntityKind;
  /** A bounded set of example row refs (capped by the builder). */
  sampleRows?: AssistantEntityRef[];
  /** Active filter label/value, page-owned. */
  activeFilter?: string;
}

/** Risk tier of an available action, aligned with the plan §6.4 risk policy. */
export type AssistantActionRisk = "low" | "medium" | "high" | "external";

/** An action the current view exposes, with its availability + risk. */
export interface AssistantAvailableAction {
  id: string;
  label: string;
  risk?: AssistantActionRisk;
  /** False when the action is currently disabled in the UI. */
  enabled: boolean;
  /** Machine code explaining why the action is disabled, if any. */
  disabledReasonCode?: string;
  /** True when the action requires modal confirmation + reason. */
  requiresConfirmation?: boolean;
}

/**
 * Page-owned snapshot a route may hand to `buildRouteContext` /
 * `buildAssistantContextPacket`. This is the ONLY channel for dynamic,
 * page-local context (active tab, current selection, live warnings, visible
 * tables, on-screen forms, available actions). Pages pass plain serializable
 * data they already hold in React state; the adapter never reaches into the DOM
 * to discover it.
 */
export interface PageContextSnapshot {
  /** Page-owned active tab key. Ignored unless it is a valid tab for the route. */
  activeTab?: string;
  /** Page-owned selection (e.g. the row the operator opened). Never scraped. */
  selection?: AssistantEntityRef[];
  /** Page-derived advisory warnings (e.g. "maintenance mode is ON"). */
  warnings?: RouteContextWarning[];
  /** Page-owned visible tables (bounded, never scraped). */
  tables?: AssistantTableContext[];
  /** Page-owned forms with fields + validation, privacy-filtered. */
  forms?: AssistantFormContext[];
  /** Page-owned actions available in the current view. */
  availableActions?: AssistantAvailableAction[];
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

/** Stable schema id for the v2 assistant context packet (plan §6.2). */
export const ASSISTANT_CONTEXT_SCHEMA =
  "platform_admin_assistant_context.v2" as const;

/**
 * The bounded, privacy-filtered context packet handed to the assistant gateway.
 * It merges the deterministic route context with the page-owned snapshot
 * (tables, forms, selection, actions). Built by `buildAssistantContextPacket`.
 */
export interface AssistantContextPacket {
  schema: typeof ASSISTANT_CONTEXT_SCHEMA;
  route: {
    pathname: string;
    routeKey: PlatformAdminRouteKey;
    title: LocalizedText;
    section: string;
    activeTab: string | null;
    availableTabs: string[];
    refreshTier: RefreshTier;
    routeImplemented: boolean;
  };
  page: {
    /** Route + query + selection entity refs, deduped. */
    visibleEntityRefs: AssistantEntityRef[];
    /** Page-owned selected rows/records only. */
    selectedRecords: AssistantEntityRef[];
    /** Bounded visible tables. */
    visibleTables: AssistantTableContext[];
    /** Baseline + body-parity + page warnings, deduped. */
    visibleWarnings: RouteContextWarning[];
    /** Actions exposed by the current view. */
    availableActions: AssistantAvailableAction[];
  };
  /** On-screen forms with fields + validation errors. */
  forms: AssistantFormContext[];
  /** The operator's raw prompt + locale, when this packet accompanies a turn. */
  userIntent?: {
    rawPrompt: string;
    locale: "zh" | "en";
  };
  /** Provenance flags: which inputs contributed to this packet. */
  generatedFrom: {
    route: boolean;
    query: boolean;
    pageSelection: boolean;
    pageTables: boolean;
    pageForms: boolean;
    pageActions: boolean;
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
