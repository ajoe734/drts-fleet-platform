# Partner Booking Live Cutover Plan

Last updated: 2026-05-19
Task ref: `PBK-RUNBOOK-001`
Workflow family: `WF-PBK-001`
Owner: `Codex2`
Reviewer: `Claude`

This document is the Phase 1 v3 formalization for the partner-booking live
cutover gate named in
`docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
§`3.4`. It adopts the already-approved operational shape in
`docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md` and
promotes that pilot runbook to the directive's required path and terminology.

The existing pilot runbook remains the detailed operating procedure. This live
cutover plan is the canonical v3 index for:

- the required per-entry cutover record fields,
- the L1 / L2 / L3 stage protocol,
- rollback triggers, rollback steps, and re-promotion conditions,
- monitoring axes and acceptance anchors,
- explicit non-claims for `WF-PBK-001`.

## Scope

This plan preserves the accepted constraints from the pilot runbook and
`SD-DP-20260512-006`:

- Production migration granularity is one partner entry at a time, keyed by
  `entrySlug` or a future host-owned partner-entry identifier.
- The Wave 5 `[tenantSlug]` route in `apps/partner-booking-web` is not the
  production cutover contract.
- `tenant-commute-hub` partner mode remains the current live owner until a
  separately approved production promotion closes the entry's rollback window.
- The repo-local legacy route under
  `apps/tenant-console-web/app/partner/*` remains the rollback-support surface
  during pilot and retention.

## Required Partner-Entry Cutover Record

Every partner entry promoted under `WF-PBK-001` must carry all 14 required
fields below on the platform-admin partner-entry record before the cutover
window may open.

| Required field | Required value at cutover time |
| --- | --- |
| `entrySlug` | Stable ingress identifier for the migrated partner entry. |
| `partnerCode` | Partner-facing code used across booking, reporting, and support workflows. |
| `programId` | Program / campaign identifier bound to the entry's eligibility and billing path. |
| `currentLiveOwner` | The currently serving live owner before promotion, typically `tenant-commute-hub` partner mode or the repo-local legacy route. |
| `targetSurface` | The post-cutover target surface, namely `apps/partner-booking-web` through the entry-owned ingress. |
| `cutoverOwner` | Named operator accountable for opening and supervising the pilot window. |
| `rollbackOwner` | Named operator empowered to declare and execute rollback. |
| `rollbackRoute` | Concrete route or host to restore on rollback. |
| `supportHotline` | Escalation hotline presented to the migrated partner entry. |
| `brandMetadata` | Approved branding/support metadata reflected in tokens or equivalent config. |
| `eligibilityMode` | Authority-backed eligibility mode for the entry (`eligible`, `ineligible`, `manual_review` handling included). |
| `billingReportingOwner` | Named owner for downstream billing/reporting reconciliation. |
| `monitoringDashboard` | Dashboard or query anchor used during pilot and retention monitoring. |
| `rollbackRetentionWindow` | Retention period before production promotion; minimum `14` calendar days. |

## L1 / L2 / L3 Stage Protocol

The v3 directive's L1 / L2 / L3 language maps onto the approved Stage 1 / 2 /
3 protocol in
`docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`.

### L1 - Sandbox validation

L1 corresponds to `sandbox -> sandboxStatus = approved`.

Before exit:

- The seven `PB_*` funnel screens work through `apps/partner-booking-web`.
- The five `PBK-UI-004` authority-safe negative paths produce UX-visible
  denials.
- The legacy repo-local partner route still behaves with parity for rollback
  support.
- The platform-admin partner-entry record shows the 14 required cutover fields
  and readiness checks as complete.

### L2 - Pilot promotion

L2 corresponds to `rolloutStage = pilot` with `pilotStatus = pending ->
approved`.

During the change window:

- The named `cutoverOwner` and `rollbackOwner` are on call.
- Ingress is switched per entry, not by tenant-wide demo routing.
- Happy-path booking, eligibility, audit, and minimal tracking stay
  authority-backed through tenant API paths.
- Parent workflow families `WF-TEN-001`, `WF-ORD-001`, `WF-DSP-001`, and
  `WF-DRV-001` remain healthy for the affected tenant.
- The cutover record captures pilot timestamp, pilot cohort identifier, and the
  evidence anchors listed below.

### L3 - Retention and production gate hold

L3 corresponds to `pilotStatus = approved` with the entry held in retention for
at least `14` calendar days before any separate production promotion.

During retention:

- The legacy repo-local route stays reachable for the migrated partner entry.
- `tenant-commute-hub` remains untouched as the pre-existing live owner until a
  separate production cutover says otherwise.
- Daily monitoring continues against the named dashboard/query anchors.
- No production claim is allowed solely because pilot retention stayed green.

## Rollback Procedure

Rollback remains per-entry and never tenant-wide.

### Rollback triggers

Rollback is mandatory if any of the following occurs during L2 or L3:

- A `WF-PBK-001` acceptance scenario regresses.
- Eligibility, booking, or audit authority desynchronizes.
- A parent workflow family gate degrades for the affected tenant.
- Partner-entry activation, credential, or ingress behavior cannot be recovered
  inside the approved window.

### Rollback steps

1. The `rollbackOwner` declares rollback on the partner-entry record.
2. Set `partnerEntry.rolloutStage = rollback_hold`.
3. Set `partnerEntry.pilotStatus = blocked`.
4. Restore the `rollbackRoute` recorded in the 14-field cutover record.
5. Disable any ingress credential or delivery target activated only for the
   failed pilot window.
6. Capture rollback timestamp, failing scenario/workflow family, rollback
   target, and follow-up task id on the cutover record.

### Re-promotion conditions

Re-promotion requires a fresh L1 validation, a fresh L2 change window, and a
fresh L3 retention window after root cause is fixed.

## Monitoring Axes

Monitor each migrated partner entry by the `monitoringDashboard` named on the
cutover record across these axes:

- Funnel completion through the new entry-owned ingress.
- Eligibility / booking / audit authority desync count, target `0`.
- Coverage of the five `PBK-UI-004` negative paths with UX-visible denial.
- Audit completeness for denied and successful state-changing actions.
- Support hotline correctness for the entry's displayed support metadata.

## Acceptance Anchors

`WF-PBK-001` is acceptable for a given partner entry only when all of the
following are captured:

- `pnpm --filter @drts/partner-booking-web build`
- `pnpm --filter @drts/partner-booking-web lint`
- `pnpm --filter @drts/partner-booking-web typecheck`
- Storybook parity for `PB_Landing`, `PB_Eligibility`, `PB_Book`,
  `PB_Confirmed`, `PB_Trips`, `PB_Receipt`, `PB_Help`
- Happy-path booking evidence through authority-backed create/confirm/tracking
- The five `PBK-UI-004` negative-path evidence anchors
- Governance approval naming `cutoverOwner`, `rollbackOwner`, and
  `rollbackRetentionWindow`
- Pilot cutover record naming the 14 required fields above
- Rollback evidence proving a return to the recorded `rollbackRoute`

## Non-Claims

This plan does not claim:

- tenant-wide partner migration from one successful entry cutover,
- retirement of `tenant-commute-hub` by repo-local code alone,
- removal readiness for `apps/tenant-console-web/app/partner/*`,
- closure of `WF-FWD-001`, `WF-COM-001`, or billing/reporting gates outside
  their own workflow-family artifacts,
- production promotion without a separate post-retention approval.

## Reference Anchors

- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
- `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`
- `apps/partner-booking-web/README.md`
