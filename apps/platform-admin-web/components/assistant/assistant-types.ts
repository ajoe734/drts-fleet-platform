"use client";

import type { CSSProperties, ReactNode } from "react";
import { buildCanvasTheme } from "@drts/ui-web/canvas-tokens";

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
  disabled?: boolean;
  disabledReason?: string | null;
}

export interface AssistantPendingAction {
  toolName: string;
  payload: Record<string, unknown>;
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
  pendingAction?: AssistantPendingAction | null;
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
    case "idle":
      return "Idle";
    case "thinking":
      return "Thinking";
    case "planning":
      return "Planning";
    case "awaiting_confirmation":
      return "Awaiting confirmation";
    case "executing":
      return "Executing";
    case "receipt":
      return "Receipt";
    case "error":
      return "Error";
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
  | "maintenance-mode"
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

export interface AssistantPageActionSummary {
  actionId: string;
  label: string;
  riskLevel?: AssistantRiskLevel;
  disabled?: boolean;
}

export interface AssistantTableSummary {
  tableId: string;
  title: string;
  visibleRowCount: number;
  visibleRowIds: string[];
  selectedRowIds?: string[];
  availableActions?: AssistantPageActionSummary[];
}

export interface AssistantFormFieldSummary {
  fieldId: string;
  label: string;
  valueSummary?: string | number | boolean | null;
  required?: boolean;
  dirty?: boolean;
}

export interface AssistantValidationErrorSummary {
  code: string;
  message: string;
  fieldId?: string;
}

export interface AssistantFormSummary {
  formId: string;
  title: string;
  dirty: boolean;
  fields: AssistantFormFieldSummary[];
  validationErrors: AssistantValidationErrorSummary[];
  availableActions?: AssistantPageActionSummary[];
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
  /** Page-owned visible table summaries for the current canvas state. */
  visibleTables?: AssistantTableSummary[];
  /** Page-owned selected rows/records if the page exposes them. */
  selectedRecords?: AssistantEntityRef[];
  /** Page-owned action list the operator can currently trigger. */
  availableActions?: AssistantPageActionSummary[];
  /** Controlled form snapshot for assistant-readable drafts and errors. */
  forms?: AssistantFormSummary[];
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
