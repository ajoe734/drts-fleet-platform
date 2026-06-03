/**
 * Ops Assistant — Context Envelope types (design handoff §5).
 *
 * The frontend passes a structured `OpsAssistantContext` with every assistant
 * turn so answers and proposed actions are about "what the user is looking at".
 * The LLM never scrapes the DOM; the app supplies this envelope. The backend
 * uses it to (a) scope tools, (b) ground RAG, and (c) resolve "this order /
 * this driver" deixis to a concrete id.
 *
 * Pure types only — no runtime behavior — so both server components (layout,
 * identity resolver) and client components (the provider, the future widget)
 * can import them without pulling a `"use client"` boundary.
 *
 * Source: docs/05-ui/ops-console-llm-assistant-design-handoff-20260602.md §5.
 */

import type {
  ActionIntent,
  ActionReceipt,
  ResourceActionDescriptor,
  UiHealthEnvelope,
} from "@drts/contracts";
import type { Locale } from "@/lib/translations";

/**
 * Kind of the entity currently in focus. The known kinds mirror the design §5
 * union; `(string & {})` keeps the list open (per the trailing "…") so a page
 * can publish a kind not yet enumerated without a contract change, while still
 * offering autocomplete for the known set.
 */
export type AssistantEntityKind =
  | "order"
  | "driver"
  | "vehicle"
  | "complaint"
  | "incident"
  | "approval_request"
  | "report_job"
  | "contract"
  | "call_session"
  | "maintenance_task"
  | "tenant"
  | (string & {});

/**
 * The row/detail in focus, if any. Pages publish this via
 * `setAssistantSelection` on row focus / detail mount; it is what makes
 * "this order" / "this driver" deixis resolvable to a concrete id.
 */
export interface AssistantSelection {
  kind: AssistantEntityKind;
  id: string;
}

/**
 * Page-published scope hints that are not derivable from the route alone:
 * the active board/tab and the filters currently applied to the visible list.
 */
export interface AssistantScope {
  board?: string;
  activeTab?: string;
  visibleFilters?: Record<string, string | string[]>;
}

/**
 * Lightweight identity slice for the envelope (design §5). This is NOT the full
 * `IdentityContext`; it is the minimum the assistant needs to scope answers and
 * actions to the operator's realm/tenant and environment.
 */
export interface OpsAssistantIdentity {
  actorType: string;
  realm: string;
  tenant?: string;
  env: string;
}

/**
 * The Context Envelope passed with each assistant turn (design §5).
 */
export interface OpsAssistantContext {
  /** Current route, e.g. "/dispatch". */
  route: string;
  /** Active sub-board, e.g. "no_supply" (dispatch sub-board). */
  board?: string;
  /** Active tab within the route, if the page exposes tabs. */
  activeTab?: string;
  /** The row/detail in focus, if any. */
  selectedEntity?: AssistantSelection;
  /** Filters currently applied to the visible list. */
  visibleFilters?: Record<string, string | string[]>;
  /** Operator identity + environment. */
  identity: OpsAssistantIdentity;
  /** Shell-level health so the assistant can say "gocab degraded" without a call. */
  health: UiHealthEnvelope;
  /** Active UI locale. (Design §5 names "zh-TW"; the app's locale enum is "zh".) */
  locale: Locale;
}

export interface AssistantActionReceipt extends ActionReceipt {
  auditHref?: string | null;
}

export interface AssistantActionBridge {
  resourceKind: AssistantEntityKind;
  resourceId: string;
  availableActions: ResourceActionDescriptor[];
  resolveDescriptor: (
    intent: ActionIntent,
  ) => ResourceActionDescriptor | null;
  invoke: (
    intent: ActionIntent,
    descriptor: ResourceActionDescriptor,
  ) => Promise<AssistantActionReceipt>;
}
