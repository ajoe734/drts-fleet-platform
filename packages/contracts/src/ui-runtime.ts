/**
 * UI runtime contracts — 12 cross-cutting envelopes / records called out in
 * `docs/05-ui/system-design-answers-all-apps-20260524.md` §7.
 *
 * These types define the SHAPE of UI runtime envelopes that frontends consume
 * from backend read models, plus a few domain-specific records that newly
 * emerged from the system design pass. They have NO runtime behavior — only
 * type definitions.
 *
 * Cross-cutting envelopes (§1):
 *   - UiHealthEnvelope            (Q-X12)
 *   - UiRefreshMetadata           (Q-X01)
 *   - ResourceActionDescriptor    (Q-X13)
 *   - EmptyStateEnvelope          (Q-X15)
 *   - ActionReceipt               (Q-X09 / Q-X10)
 *   - UserNotificationRecord      (Q-X05 / Q-X06)
 *   - CrossAppResourceLink        (Q-X03)
 *   - SearchResultRecord          (Q-X07 / Q-X08)
 *
 * Domain-specific records (§§ 2, 4, 5):
 *   - DriverOpsInstruction              (Q-DRV04)
 *   - DriverMatchingSuppression         (Q-OPS09)
 *   - TenantIntegrationReadinessSummary (Q-TEN10)
 *   - TenantRolloutStateMachineRecord   (Q-ADM05)
 *
 * These do NOT alter existing record types (e.g. `OwnedOrderRecord`,
 * `ComplaintCaseRecord`, `IncidentRecord`, tenant booking records).
 * Field additions to those — `availableActions`, `editableUntil`,
 * `slaStatus`, etc. — land per app in the same PR that rebuilds the
 * consuming UI, so the contract change and its sole consumer move together.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Realm of the actor / receiver. Mirrors `IdentityContext['realm']` but does
 * not include `system` for user-facing notifications.
 */
export type UiActorRealm = "platform" | "ops" | "tenant" | "driver";

/**
 * Severity tone used by notifications and degraded banners. Maps to
 * design-token tone scales (`info` / `warning` / `critical`).
 */
export type UiSeverity = "info" | "warning" | "critical";

// ─────────────────────────────────────────────────────────────────────────────
// Q-X12 — UiHealthEnvelope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-service degradation entry inside `UiHealthEnvelope`.
 */
export interface UiHealthDegradedService {
  service: string;
  impact: string;
  severity: "warning" | "critical";
}

/**
 * Backend-emitted health envelope every page consumes. Replaces the
 * per-page `try/catch -> []` fallback pattern: explicit `degraded` or
 * `down` status with itemized impacted services + last-checked time so
 * the chrome can render an honest banner instead of silently empty data.
 *
 * Consumed by: all 4 app shells (sidebar footer per packets §3.3,
 * page-level degraded banner per packets §3.3).
 */
export interface UiHealthEnvelope {
  status: "healthy" | "degraded" | "down";
  degradedServices: UiHealthDegradedService[];
  lastCheckedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-X01 — UiRefreshMetadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-response freshness envelope. Every list/detail API response should
 * carry one so the UI can render a stale indicator and offer a refresh
 * affordance without inventing its own staleness heuristic.
 *
 * Tier is enforced by `RefreshTier` (Q-X02 fixed cadence tiers); the
 * envelope itself does not name the tier, only the absolute freshness of
 * the snapshot it accompanies.
 */
export interface UiRefreshMetadata {
  generatedAt: string;
  staleAfterMs: number;
  dataFreshness: "fresh" | "stale" | "degraded" | "unknown";
  source: "live" | "cache" | "sandbox" | "static";
}

/**
 * Per-Q-X02 fixed cadence tiers. UI uses this enum to pick the polling
 * cadence from shared config — pages do not write magic numbers.
 *
 * Tier → cadence:
 *   - urgent       push immediately + poll 5s fallback
 *   - fast         3s
 *   - dispatch     5s
 *   - medium       15s
 *   - medium_slow  30s
 *   - slow         30s
 *   - manual       no polling
 */
export type RefreshTier =
  | "urgent"
  | "fast"
  | "dispatch"
  | "medium"
  | "medium_slow"
  | "slow"
  | "manual";

// ─────────────────────────────────────────────────────────────────────────────
// Q-X13 — ResourceActionDescriptor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Risk classification for an action. Drives the confirmation pattern per
 * Q-X09:
 *   - low      direct action + toast receipt
 *   - medium   modal confirm + toast receipt
 *   - high     modal confirm + required reason + toast receipt
 */
export type ActionRiskLevel = "low" | "medium" | "high";

/**
 * Single entry in a resource's `availableActions[]`. Backend returns
 * these per resource so the UI can render CTAs without hard-coding
 * role-to-action mapping. A 0-length list means the resource is
 * effectively read-only for the current actor.
 *
 * - `enabled: false` + `disabledReasonCode` means "show the affordance
 *    disabled with a tooltip explaining why" (NOT hide it).
 * - `requiresReason: true` means the confirmation modal must collect a
 *    non-empty reason string before invoking.
 *
 * Consumed by: every list/detail screen across all 4 apps (packets §3.5).
 */
export interface ResourceActionDescriptor {
  action: string;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel: ActionRiskLevel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-X15 — EmptyStateEnvelope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a list response returned zero items. Backend must distinguish these
 * so the UI can render an appropriate empty-state visual + next-action
 * affordance per Q-X15.
 *
 * The `driver_not_eligible` reason is driver-app-specific (Q-DRV01) — UI
 * shows it as a distinct state from `no_data` so the driver understands
 * "no work for me right now" vs "I cannot receive work at all".
 */
export type EmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "driver_not_eligible"
  | "filtered_empty";

/**
 * Empty-state envelope accompanying any list response whose `items` is
 * empty. The optional `nextAction` is a `ResourceActionDescriptor` so the
 * UI can render a CTA in the empty state ("Configure SLA", "Issue API
 * key", etc.) when the reason is `not_provisioned`.
 */
export interface EmptyStateEnvelope {
  reason: EmptyReason;
  messageCode: string;
  nextAction?: ResourceActionDescriptor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-X09 / Q-X10 — ActionReceipt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Receipt returned by every write action. `auditId` is the canonical
 * audit-trail identifier; the UI may surface a "View audit" deep link
 * (in-app for actions whose audit lives in the current app; otherwise
 * a `CrossAppResourceLink` to the owning app's `/audit?auditId=…`).
 *
 * `status: "accepted"` means the command was received but external
 * confirmation is pending (e.g. Q-TEN04 booking commands with
 * accepted+pending external dependency).
 */
export interface ActionReceipt {
  actionId: string;
  auditId: string;
  resourceType: string;
  resourceId: string;
  status: "accepted" | "completed" | "failed";
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-X03 — CrossAppResourceLink
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cross-app deep link target. Phase 1 keeps the 4 apps as separate
 * deployments; cross-app navigation is deep-link to a different
 * deployed URL, opened in a new tab by default.
 *
 * Used by notifications (`UserNotificationRecord.resourceLink`),
 * action receipts (cross-app audit view), and inline cross-references
 * (e.g. ops-console revenue mismatch → platform-admin reconciliation).
 */
export interface CrossAppResourceLink {
  targetApp: "ops-console" | "platform-admin" | "tenant-console";
  route: string;
  resourceType: string;
  resourceId: string;
  openMode: "new_tab" | "same_tab";
  label: string;
}

/**
 * Shared runtime fields that any list/detail resource can expose so the UI
 * does not infer CTA visibility or deep-link topology on its own.
 */
export interface ActionableResourceRuntimeFields {
  availableActions?: ResourceActionDescriptor[];
  resourceLinks?: CrossAppResourceLink[];
}

/**
 * Canonical list envelope for UI-facing resource collections that need list
 * CTAs, differentiated empty states, and refresh-tier wiring.
 */
export interface UiListResourceEnvelope<TItem> {
  items: TItem[];
  availableActions: ResourceActionDescriptor[];
  emptyState?: EmptyStateEnvelope;
  refreshTier: RefreshTier;
  refreshedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-X05 / Q-X06 — UserNotificationRecord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-user inbox notification. Distinct from the pre-existing
 * `NotificationRecord` (which is a channel-keyed legacy notice model).
 *
 * `eventType` follows the Q-X06 taxonomy. Examples:
 *   - admin/ops: `incident.critical.created`,
 *     `complaint.sla_breached`, `approval_request.created`,
 *     `reconciliation_issue.assigned`, `adapter.health.degraded`,
 *     `tenant.rollout_gate.ready`, `tenant.rollback_hold.enabled`
 *   - driver: `driver.task.offered`,
 *     `driver.task.accept_timeout_warning`,
 *     `driver.platform.reauth_required`, `driver.platform.sync_failed`,
 *     `driver.shift.end_reminder`, `driver.sos.acknowledged`
 *   - tenant/partner: `booking.created`, `booking.confirmed`,
 *     `booking.cancelled`, `booking.approval_required`,
 *     `booking.approval_approved`, `booking.approval_rejected`,
 *     `invoice.ready`, `webhook.delivery_failed`,
 *     `quota.threshold_warning`
 *
 * Cross-app notices from platform-admin (Q-ADM15 critical/maintenance
 * severity) target tenant/ops/driver audiences via the same record.
 *
 * Consumed by: bell icon + notification inbox in all 4 app shells
 * (driver-app additionally receives native push for `urgent` tier
 * events per Q-X02).
 */
export interface UserNotificationRecord {
  notificationId: string;
  recipientActorId: string;
  recipientRealm: UiActorRealm;
  tenantId?: string | null;
  severity: UiSeverity;
  eventType: string;
  title: string;
  message: string;
  resourceLink?: CrossAppResourceLink | null;
  readAt: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-X07 / Q-X08 — SearchResultRecord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * App-scoped cross-entity search result. Header search returns these
 * grouped by `category`. Per-app scope (per packets §3.8):
 *   - ops-console: orders, dispatch items, drivers, vehicles,
 *     complaints, incidents
 *   - platform-admin: tenants, partners, users, adapter registry,
 *     audit events
 *   - tenant-console: bookings, passengers, addresses, cost centers,
 *     invoices
 *   - driver-app: NOT applicable (no header search per Q-X07)
 *
 * Result categories must NOT be mixed into a single flat list per
 * Q-X08 — UI groups them.
 */
export interface SearchResultRecord {
  category: string;
  resourceType: string;
  resourceId: string;
  primaryLabel: string;
  secondaryLabel?: string;
  link: CrossAppResourceLink;
  matchedFields?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-DRV04 — DriverOpsInstruction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ops-issued instruction surfaced to the driver, primarily for
 * manual-fallback scenarios when a forwarded order needs human
 * coordination (Q-DRV04). The driver app shows this as an in-app banner
 * + optional push, NOT as a static label — the message is operator-
 * authored and tied to a specific task.
 *
 * Consumed by: driver-app `/trip` (forwarded mode, manual fallback
 * state).
 */
export interface DriverOpsInstruction {
  instructionId: string;
  taskId: string;
  message: string;
  issuedBy: string;
  issuedAt: string;
  expiresAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-OPS09 — DriverMatchingSuppression
// ─────────────────────────────────────────────────────────────────────────────

/**
 * State record showing whether driver matching is currently suppressed
 * for a given driver, and why. Created by ops actions during an incident
 * or compliance hold; auto-lifted when the source incident resolves;
 * has a default 24h TTL unless extended by `ops_manager`.
 *
 * Consumed by: ops-console `/incidents/[id]` (visible state),
 * `/drivers/[id]` (banner + lift CTA), driver-app eligibility
 * computation (reflected in `eligibleServiceBuckets` + reasons).
 */
export interface DriverMatchingSuppression {
  active: boolean;
  reasonCode: "incident" | "compliance_hold" | "manual_ops_hold";
  sourceIncidentId?: string | null;
  expiresAt: string;
  liftedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-TEN10 — TenantIntegrationReadinessSummary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Readiness state for a single integration sub-system (API key,
 * webhook, notification routing, SLA profile, report job availability,
 * module enablement, partner entry).
 */
export interface TenantIntegrationReadinessItem {
  subSystem:
    | "api_keys"
    | "webhooks"
    | "notifications"
    | "sla"
    | "reports"
    | "modules"
    | "partner_entries";
  status: "ready" | "partial" | "not_provisioned" | "blocked";
  detail?: string;
  nextAction?: ResourceActionDescriptor;
}

/**
 * Aggregated tenant integration readiness response served by a single
 * endpoint (Q-TEN10 — `/api/tenant/integration-governance/readiness`).
 * Replaces the previously-implied 6+ parallel queries the UI would have
 * had to orchestrate.
 *
 * Consumed by: tenant-console `/integration-governance`.
 */
export interface TenantIntegrationReadinessSummary {
  tenantId: string;
  items: TenantIntegrationReadinessItem[];
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-ADM05 — TenantRolloutStateMachineRecord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tenant rollout stage. Mirrors spec §7.4.2.
 */
export type TenantRolloutStage =
  | "sandbox"
  | "pilot"
  | "production"
  | "rollback_hold";

/**
 * Gate status for the current rollout stage.
 */
export type TenantRolloutGateStatus =
  | "pending"
  | "ready"
  | "approved"
  | "blocked";

/**
 * Snapshot of the rollout state machine for one tenant. Authoritative
 * source for the page chrome on `/tenants/[tenantId]` and for the
 * `tenant.rollout_gate.ready` / `tenant.rollback_hold.enabled`
 * notification events.
 *
 * Per Q-ADM06 the `cutoverOwner` / `rollbackOwner` references are
 * platform user records (with displayName snapshot at assignment time),
 * not free-text.
 *
 * Consumed by: platform-admin `/tenants/[tenantId]`,
 * `/tenant-governance`.
 */
export interface TenantRolloutStateMachineRecord {
  tenantId: string;
  stage: TenantRolloutStage;
  gateStatus: TenantRolloutGateStatus;
  cutoverOwnerUserId: string | null;
  cutoverOwnerDisplayName: string | null;
  rollbackOwnerUserId: string | null;
  rollbackOwnerDisplayName: string | null;
  rollbackPrepared: boolean;
  enteredStageAt: string;
  enteredGateAt: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
  availableActions: ResourceActionDescriptor[];
}
