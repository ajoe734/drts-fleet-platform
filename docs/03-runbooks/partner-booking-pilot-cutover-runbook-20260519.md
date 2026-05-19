# Partner Booking Pilot Cutover Runbook

Last updated: 2026-05-19
Task ref: `PBK-CUTOVER-001`
Workflow family: `WF-PBK-001`
Owner: `Codex`
Reviewer: `Claude`

This runbook operationalises the partner-entry pilot cutover from the legacy
`tenant-commute-hub` partner mode (and the legacy
`apps/tenant-console-web/app/partner/*` repo-local route) onto the
repo-canonical `apps/partner-booking-web` surface. It is the named release-gate
companion for the `WF-PBK-001` row in
`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.

It is governed by the accepted topology decision
`docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
(`PBK-UI-005`) and does not by itself authorise production promotion. A
production cutover requires a separately approved follow-up task under
`SD-DP-20260512-006` §`Cutover Gates` `3. Production cutover gate`.

## Scope

This runbook is bounded to:

- **One partner entry at a time.** Migration granularity is the partner entry
  (`entrySlug` or future host-resolved partner entry), not a whole tenant. The
  current Wave 5 `[tenantSlug]` route in `apps/partner-booking-web` remains a
  repo-local white-label demo surface and must not be treated as the
  production cutover contract.
- **Pilot-stage cutover only.** This document covers the move from
  `sandboxStatus = approved` to `pilotStatus = approved` for the named
  partner entry, plus the operational checks required before a separate task
  may promote that entry to production.
- **Three coexisting surfaces.** Per
  `SD-DP-20260512-006` §`Coexistence Policy`:
  - `apps/partner-booking-web` — canonical repo-local partner-booking surface.
  - `apps/tenant-console-web/app/partner/*` — legacy compatibility / behavior
    reference surface.
  - `tenant-commute-hub` partner mode — current live production owner outside
    this repo, retired only by upstream action.

It is **not** in scope to:

- claim live traffic for any partner entry without a separate
  production-cutover task,
- retire the legacy tenant-console partner route ahead of the per-entry
  14-day rollback retention window,
- claim that `tenant-commute-hub` partner mode is replaced by repo-local code
  changes alone.

## Surfaces And Source Of Truth

| Surface                             | Repo path / origin                                                      | Role during pilot cutover                                                                                              | Source of truth invariant                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical partner booking app       | `apps/partner-booking-web`                                              | New repo-canonical entry surface for the migrated partner entry once pilot gate clears.                                | UI shell only. Backend authority (eligibility, booking, audit, billing, webhook) stays in `tenant-partner` and the tenant API authority path; the UI must not fork that authority. |
| Legacy partner route (repo-local)   | `apps/tenant-console-web/app/partner/*`                                 | Behaviour-reference and rollback-support surface. Must remain reachable while any migrated entry is in retention.      | Production-safety / parity fixes only. No new IA, no new partner-only features.                                                                                                    |
| Legacy partner mode (external)      | `tenant-commute-hub` partner mode                                       | Current live production owner. Remains the live surface until a separate production-cutover task formally retires it.  | External live system. Repo-local code changes alone may not claim retirement.                                                                                                      |
| Tenant API authority path           | `apps/api/src/modules/tenant-partner`, `apps/api/src/modules/partner-*` | Single source of truth for eligibility, booking-create, partner-entry activation, and audit.                           | Both the new and legacy surfaces must reach authority through this path; no UI-only forks of authority state.                                                                      |
| Platform-admin partner-entry record | Platform Admin `Partners` (`docs/01-product` §`7.5.2`)                  | Owns partner-entry activation, ingress credential, branding, support metadata, eligibility / auth mode, and readiness. | Pilot cutover may only promote an entry whose platform-admin record is `active` and whose readiness checks pass.                                                                   |

The cross-tenant onboarding flow in
`docs/03-runbooks/tenant-onboarding-rollout-runbook.md` remains the parent
rollout framework; this runbook is the partner-entry overlay that applies
within a tenant whose `rollout.stage` is at least `pilot`.

## Pre-cutover Inputs (must be true before scheduling)

Before scheduling a partner-entry pilot cutover, confirm each item below.
Missing items move the entry into a blocked state instead of allowing the
cutover window to open.

### 1. Repo-local readiness (`SD-DP-20260512-006` §1)

- `PBK-UI-003` parity holds for the seven `PB_*` reference funnel screens.
- `PBK-UI-004` parity holds for the five authority-safe negative paths.
- `pnpm --filter @drts/partner-booking-web build / lint / typecheck` are
  green on the cutover candidate commit.
- Storybook parity for the partner-booking artboards remains green.

### 2. Partner-entry record readiness (`SD-DP-20260512-006` §2)

- The platform-admin partner-entry record exists with `status = active`.
- `entrySlug` (or future host-owned partner-entry identifier) is locked, and
  ingress resolves by that identifier — not by the Wave 5 `[tenantSlug]` demo
  route alone.
- Auth / bootstrap, eligibility, booking-create, and minimal-tracking flows
  are wired to backend authority and **not** to mock-only UI state.
- Branding metadata, support hotline, and partner-entry activation data are
  finalised per entry and reflected in `BRAND_TEMPLATES` (or the equivalent
  tokens layer entry).
- Ingress credential has been issued via the Partner Entry Governance
  workflow (`docs/01-product` §`7.5.2`).

### 3. Evidence readiness (`SD-DP-20260512-006` §2 + `WF-PBK-001`)

- Happy-path booking smoke / UAT evidence exists for the seven `PB_*`
  screens through the new app for this partner entry.
- The five authority-safe negative paths have evidence anchors named in this
  runbook's Acceptance section.
- Live forwarder, CTI, billing, and FIN paths remain governed by their own
  workflow families (`WF-FWD-001`, `WF-COM-001`, `WF-FIN-001`); this
  cutover may not over-claim those families' gates.

### 4. Ownership readiness (`SD-DP-20260512-006` §3 prerequisite)

- A named `cutoverOwner` is recorded for the partner entry.
- A named `rollbackOwner` is recorded for the partner entry.
- The tenant's `rollbackPrepared` flag is `true` on the platform-admin record
  for the parent tenant (per
  `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`).

If any item above is unmet, do not open the cutover window. Record the gap on
the partner-entry record and return the work to the appropriate governance
owner.

## Cutover Stages

Use the explicit per-entry `partnerEntry.rolloutStage` field. Allowed values:
`sandbox`, `pilot`, `production`, `rollback_hold`.

This runbook operates on the `sandbox → pilot` transition. The
`pilot → production` transition is governed by `SD-DP-20260512-006` §3 and is
out of scope here.

### Stage 1 — Sandbox validation (T-7d to T-1d)

1. Provision the partner entry in `sandbox` against the new app using a
   sandbox tenant.
2. Walk the seven `PB_*` reference funnel screens through the new app and
   confirm the funnel exits resolve to backend authority (not mock state).
3. Walk the five authority-safe negative paths (`PBK-UI-004`) through the
   new app. Each must produce a UX-visible denial — silent failures are a
   regression for `WF-PBK-001`.
4. Confirm the legacy `tenant-console-web/app/partner/*` route still loads
   for the same partner entry and produces parity behaviour for the five
   negative paths. This is the rollback-support surface; it is not retired
   in pilot.
5. Confirm `tenant-commute-hub` partner mode is unchanged.
6. Confirm the platform-admin partner-entry record shows the readiness
   checklist as green.

Exit condition: `partnerEntry.sandboxStatus = approved`.

### Stage 2 — Pilot promotion (T-day window)

1. Open a change window with the named `cutoverOwner` and `rollbackOwner` on
   call.
2. Set `partnerEntry.rolloutStage = pilot` and `pilotStatus = pending` via
   the platform-admin record. Do not flip live ingress yet.
3. Route a small, named pilot cohort (operator-list or whitelisted partner
   account) to the new app via the partner entry's `entrySlug` ingress.
4. Watch the partner entry's monitoring path for the duration of the change
   window (see "Monitoring And Support" below).
5. Confirm:
   - happy-path booking creates a real booking through tenant API authority,
   - eligibility responses are authority-backed (no UI fork),
   - audit entries are produced for both successful and denied actions,
   - `WF-TEN-001`, `WF-ORD-001`, `WF-DSP-001`, and `WF-DRV-001` continue to
     pass their existing live staging evidence shape for the affected
     tenant.
6. If acceptance holds for the window, set `pilotStatus = approved`.

Exit condition: `partnerEntry.pilotStatus = approved` and the cutover record
captures named `cutoverOwner`, `rollbackOwner`, `rollbackPrepared = true`,
pilot timestamp, pilot cohort identifier, and the evidence anchors named in
this runbook's Acceptance section.

### Stage 3 — Pilot retention and observation (T-day to T+14d)

1. Keep the legacy `tenant-console-web/app/partner/*` route reachable for the
   migrated partner entry. Do not remove it.
2. Keep `tenant-commute-hub` partner mode untouched.
3. Observe the partner entry against the monitoring path daily for at least
   14 calendar days.
4. Pilot retention closes when the per-entry rollback retention window
   defined in `SD-DP-20260512-006` §`Transition Length` (≥14 days) clears
   without a triggered rollback.
5. Pilot retention does not by itself promote the entry to production. That
   promotion requires the separate production-cutover task per
   `SD-DP-20260512-006` §3.

## Rollback Procedure

Rollback for a partner-entry pilot cutover is a per-entry action. It must not
affect other migrated entries.

### Triggering rollback

A rollback is required if any of the following occurs during the pilot
window or the 14-day retention window:

- A `WF-PBK-001` acceptance scenario regresses (happy-path booking failure,
  authority desync, audit gap, or silent negative-path failure).
- A parent-family gate degrades for the affected tenant (`WF-TEN-001`,
  `WF-ORD-001`, `WF-DSP-001`, or `WF-DRV-001`).
- A partner-entry activation or credential anomaly cannot be resolved within
  the change window.
- An external dependency named under `EXT-002` (forwarder) or `EXT-004`
  (CTI) materially blocks the partner entry's pilot path.

### Rollback steps

1. The `rollbackOwner` declares rollback in writing on the partner-entry
   record and notifies the `cutoverOwner` and the tenant rollback owner.
2. Set `partnerEntry.rolloutStage = rollback_hold` and
   `partnerEntry.pilotStatus = blocked` on the platform-admin record. The
   API blocks any further promotion until the hold is resolved (mirrors
   `docs/03-runbooks/tenant-onboarding-rollout-runbook.md` `Rollback Hold`).
3. Re-route ingress for the partner entry back to the legacy surface that
   was valid immediately before pilot promotion:
   - If the entry was previously served by
     `apps/tenant-console-web/app/partner/*`, restore that route.
   - If the entry was previously served by `tenant-commute-hub` partner
     mode, restore that path through the upstream production owner.
4. Disable any new ingress credential or webhook delivery target that was
   activated specifically for the pilot.
5. Capture a rollback decision record on the partner-entry record:
   - rollback timestamp,
   - rollback owner identifier,
   - the failing acceptance scenario or workflow family,
   - the rollback target route or host,
   - the open follow-up task id (if any).
6. Resume only after the `rollbackOwner` confirms that the previous working
   state is fully restored and no migrated traffic is still pointed at the
   new app.

### Re-promotion after rollback

Re-promotion requires:

1. Root cause identified and resolved (with reference to the failing
   acceptance scenario or workflow family).
2. A re-run of Stage 1 sandbox validation for the partner entry.
3. A fresh Stage 2 pilot promotion window with a newly captured cutover
   record.
4. A fresh 14-day Stage 3 retention window before the entry may be
   considered for production promotion.

## Monitoring And Support

During the pilot window and retention window, monitor the migrated partner
entry along these axes:

- **Funnel completion** — happy-path booking success rate through the new
  app, segmented by the partner-entry `entrySlug`.
- **Authority desync** — number of UI-state vs. backend-state mismatches for
  eligibility, booking, and audit. Target is `0`.
- **Negative-path coverage** — each of the five authority-safe negative
  paths produces a UX-visible denial, not a silent failure.
- **Audit completeness** — every denied action and every state-changing
  successful action produces an audit entry, consistent with the
  `ORX-GV-001` audit-trail expectation.
- **Support hotline coverage** — the partner-entry's named support hotline
  is reachable and the partner-entry record reflects the correct hotline
  metadata.

Support escalation goes to the `cutoverOwner` first, then the
`rollbackOwner`, then the tenant's `cutoverOwner` / `rollbackOwner` per
`docs/03-runbooks/tenant-onboarding-rollout-runbook.md`.

## Acceptance (`WF-PBK-001` evidence anchors)

Pilot cutover for a partner entry is acceptable only when all of the
following are captured against that entry:

### Repo-local acceptance

- `pnpm --filter @drts/partner-booking-web build`
- `pnpm --filter @drts/partner-booking-web lint`
- `pnpm --filter @drts/partner-booking-web typecheck`
- Storybook parity green for `PB_Landing`, `PB_Eligibility`, `PB_Book`,
  `PB_Confirmed`, `PB_Trips`, `PB_Receipt`, `PB_Help`.

### Functional acceptance (per partner entry)

- Happy-path booking through the new app reaches `WF-ORD-001` backend
  authority (no mock-only state).
- The five authority-safe negative paths from `PBK-UI-004` each produce a
  UX-visible denial.
- The legacy `apps/tenant-console-web/app/partner/*` route still produces
  parity behaviour for the same five negative paths for the same partner
  entry while the entry is in pilot or retention.

### Governance acceptance (per partner entry)

- The platform-admin partner-entry record names a `cutoverOwner` and a
  `rollbackOwner`.
- The parent tenant has `rollbackPrepared = true`.
- The cutover record captures: pilot timestamp, pilot cohort, evidence
  anchors named above, rollback target route or host, and the support
  hotline path.
- The governance reviewer's approval is captured against the cutover record
  (per `SD-DP-20260512-006` §3 prerequisite — even at pilot stage, this
  runbook records the approval for traceability).

### Machine-truth acceptance

- Owner has produced a task-scoped commit on the cutover branch with the
  trailers required by `AI_COLLABORATION_GUIDE.md` §`Commit evidence rule`:
  `LLM-Agent: Codex`, `Task-ID: PBK-CUTOVER-001`,
  `Reviewer: Claude`.
- Owner has pushed the commit with a normal non-force push and recorded
  `PUSH_REMOTE` and `PUSH_BRANCH`.
- The task reaches `done` only after the supervisor-controlled machine-truth
  closeout per `SD-DP-20260512-006` §3.

## Non-Claims

This runbook explicitly does **not** claim:

- That `tenant-commute-hub` partner mode has been retired.
- That `apps/tenant-console-web/app/partner/*` is safe to remove.
- That `WF-FWD-001`, `WF-COM-001`, or `WF-FIN-001` close out in a different
  shape than their own runbooks describe.
- That a single partner-entry pilot generalises to a tenant-wide cutover.
- That repo-local CI green implies live traffic safety. Live traffic remains
  gated by the separate production-cutover task per
  `SD-DP-20260512-006` §3.

## Reference Anchors

- `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (`WF-PBK-001` row)
- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`
- `docs/03-runbooks/forwarder-production-adapter-rollout-runbook.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
  §`7.5.2 Partner entry setup workflow`,
  §`9.4.2 Partner Booking Mode`,
  §`9.7.1 Tenant login and workspace bootstrap`
- `apps/partner-booking-web/README.md`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
