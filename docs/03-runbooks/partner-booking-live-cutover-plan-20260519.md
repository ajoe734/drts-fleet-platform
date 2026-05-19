# Partner Booking Live Cutover Plan

Last updated: 2026-05-19
Task ref: `PBK-RUNBOOK-001`
Workflow family: `WF-PBK-001`
Owner: `Claude2`
Reviewer: `Claude`
Planning ref: [`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`](./phase1-v3-design-blueprint-completion-wave-planning-20260519.md)
Directive ref: [`docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`](../00-context/phase1-design-blueprint-completion-directive-20260519.md) §3.4

This plan formalises the **live cutover** stage for a partner entry under
`WF-PBK-001`: the protocol that takes a partner entry from the cleared
`partnerEntry.pilotStatus = approved` state through a production traffic
switch from the legacy `tenant-commute-hub` partner mode (or the legacy
`apps/tenant-console-web/app/partner/*` route) onto the repo-canonical
`apps/partner-booking-web` surface, plus the rollback evidence required to
treat that switch as accepted.

It is the v3-formalisation companion to
[`docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md),
which remains the authoritative document for the `sandbox → pilot`
transition. This plan begins where that runbook ends. It does not duplicate
the pilot acceptance bar; it cites it.

This plan is governed by the accepted topology decision
[`docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`](../01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md)
(`PBK-UI-005`) and operationalises its §`Cutover Gates` `3. Production
cutover gate`. It does not by itself authorise a production promotion: each
live cutover requires its own named follow-up task and governance reviewer
approval per `SD-DP-20260512-006` §3.

## 1. Scope

This plan is bounded to:

- **One partner entry at a time.** Live migration granularity is the partner
  entry (`entrySlug` or future host-resolved partner entry identifier), not
  a whole tenant. The Wave 5 `[tenantSlug]` demo route in
  `apps/partner-booking-web` **must not** be used as a production cutover
  contract — it remains a repo-local white-label demo surface only.
- **Live traffic switching only.** This document covers the move from
  `partnerEntry.pilotStatus = approved` to a production traffic switch
  (the named partner entry's ingress is routed away from the legacy live
  owner onto `apps/partner-booking-web`), plus the 14-day per-entry
  rollback-retention window that follows.
- **Cross-surface coexistence.** Per `SD-DP-20260512-006` §`Coexistence
  Policy`, the legacy surfaces remain reachable through this window:
  - `apps/partner-booking-web` — new live owner for the cut-over entry.
  - `apps/tenant-console-web/app/partner/*` — rollback-support surface; do
    not retire while any cut-over entry is still in retention.
  - `tenant-commute-hub` partner mode — prior live owner; retirement is an
    upstream action, not a repo-local claim.

It is **not** in scope to:

- claim a tenant-wide cutover from a single partner-entry live switch,
- retire `tenant-commute-hub` partner mode through repo-local code changes,
- remove the repo-local legacy `apps/tenant-console-web/app/partner/*`
  route before every migrated entry has completed its 14-day rollback
  retention,
- generalise the live ingress switch into a future
  multi-partner-entry batch without re-running per-entry evidence.

## 2. Relationship to the pilot cutover runbook

| Concern                                                | Lives in                                                                                                                                    | Notes                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `sandbox → pilot` transition                           | [`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Stage 1` and §`Stage 2`        | Authoritative pilot protocol. Live cutover must not open until pilot exit conditions are met.                                          |
| `pilot retention` (Stage 3, ≥14 days, observation)     | [`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Stage 3`                       | Pilot retention is a prerequisite, not a deliverable, for live cutover.                                                                |
| `pilot → live (production)` transition                 | **This plan** §4–§6                                                                                                                         | Net-new. Covers the ingress switch from the legacy live owner to `apps/partner-booking-web` for one partner entry.                     |
| Live rollback evidence                                 | **This plan** §7                                                                                                                            | Required by directive §3.4.5 acceptance item 4.                                                                                        |
| Negative-path UX acceptance for the new app            | [`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Acceptance`                    | Same five authority-safe negative paths apply. This plan adds no new negative-path semantics; it requires the existing evidence holds. |
| `WF-PBK-001` release-gate matrix row                   | [`phase1-workflow-acceptance-release-gates.md`](./phase1-workflow-acceptance-release-gates.md)                                              | Gate uplift to a live evidence read-out is bounded by directive §3.4.5 and may only be claimed when this plan's §10 acceptance closes. |
| UAT scenarios for the cut-over entry                   | `docs/04-uat/partner-booking-pilot-uat-20260519.md` (`PBK-UAT-001`)                                                                         | Out of scope for this plan; this plan references the eventual UAT doc as evidence input.                                               |

## 3. Surfaces, source of truth, and granularity

This plan inherits the surface map from
[`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Surfaces And Source Of Truth`
and tightens it for the live cutover:

| Surface                              | Role during live cutover                                                                                                                       | Live-cutover-specific invariant                                                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/partner-booking-web`           | Becomes the **new live owner** for the named partner entry once the ingress flip completes.                                                    | Must resolve ingress by `entrySlug` or a host-owned partner-entry identifier. Wave 5 `[tenantSlug]` demo route is forbidden as the production contract.                                                                        |
| `apps/tenant-console-web/app/partner/*` | Stays reachable as a rollback-support surface for every cut-over entry still inside its 14-day retention window.                              | Production-safety / parity fixes only. No new IA, no new partner-only features. Not eligible for removal in this plan.                                                                                                         |
| `tenant-commute-hub` partner mode    | Prior live production owner. Live ingress for the named entry is moved off it, but the upstream system itself remains.                         | Retirement is an upstream action and cannot be claimed by repo-local code. This plan's success does not claim retirement.                                                                                                      |
| Tenant API authority path            | Single source of truth for eligibility, booking-create, partner-entry activation, audit, billing.                                              | Both the new and legacy surfaces must reach authority through this path even during live cutover; no UI-only forks of authority state are allowed.                                                                             |
| Platform-admin partner-entry record  | Owns the per-entry `rolloutStage`, ingress credential, branding, support metadata, eligibility / auth mode, billing/reporting owner, monitoring dashboard, rollback retention window, named owners. | Live cutover may only proceed for an entry whose platform-admin record is `active`, whose pilot retention has cleared, and whose per-entry required fields (§4) are populated and locked at the moment the cutover window opens. |

## 4. Per-entry required fields

Per directive §3.4.3, every partner entry promoted under this plan must
have all of the following fields populated and locked on the platform-admin
partner-entry record at the moment the live cutover window opens. The
platform-admin record is the single source of truth; this plan does not
introduce a parallel registry.

| Field                       | Definition / source                                                                                                                                                       | Live-cutover use                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `entrySlug`                 | Per-entry identifier owned by the platform-admin partner-entry record (or future host-resolved equivalent).                                                               | Becomes the ingress identity on `apps/partner-booking-web`. Replaces any reliance on the Wave 5 `[tenantSlug]` route.  |
| `partnerCode`               | Partner organisation code aligned with `WF-PARTNER-001` eligibility / airport-transfer flow.                                                                              | Used by tenant API authority for partner-scoped eligibility and reporting.                                             |
| `programId`                 | Partner programme identifier (e.g. `credit_card_airport_transfer` programme variant) tied to eligibility mode.                                                            | Pins eligibility rules and partner billing/reporting scope.                                                            |
| `current live owner`        | Surface that owns live traffic immediately before this cutover (`tenant-commute-hub` partner mode or `apps/tenant-console-web/app/partner/*`).                            | Sets the rollback target if the cutover fails.                                                                         |
| `target surface`            | `apps/partner-booking-web` (this plan does not authorise any other target).                                                                                               | Names the new live owner.                                                                                              |
| `cutoverOwner`              | Named human owner of the live cutover window.                                                                                                                             | Holds the change window, decides on commit / hold, signs the cutover record.                                           |
| `rollbackOwner`             | Named human owner of the rollback decision.                                                                                                                               | Declares rollback if any trigger from §7 fires; co-signs the rollback record.                                          |
| `rollback route`            | Exact ingress target the entry returns to if rollback is declared (must equal `current live owner` unless overridden with explicit governance approval).                  | Captured in the cutover record and tested by `rollback path verified` evidence.                                        |
| `support hotline`           | Partner-entry support hotline displayed in the new app and tracked by the partner-entry record.                                                                           | Must be reachable for the duration of the live window and retention.                                                   |
| `brand metadata`            | Branding metadata, tokens, logo, and copy variants resolved per entry (see `BRAND_TEMPLATES` or the equivalent tokens layer).                                             | Must render correctly on `apps/partner-booking-web` for the cut-over entry before ingress flips.                       |
| `eligibility mode`          | Eligibility mode used by `WF-PARTNER-001` for this entry (e.g. `card_last4`, `reference_token`, `manual_review`).                                                         | Must reach backend authority — no UI-only fork. Must match the live-traffic flow contracted in `WF-PARTNER-001`.       |
| `billing/reporting owner`   | Owner of the partner billing / reporting feed under `WF-FIN-GOV-001`.                                                                                                     | Confirms that billing and reporting truth remain unbroken across the ingress flip.                                     |
| `monitoring dashboard`      | URL or identifier of the partner-entry's monitoring path (funnel / authority / audit / hotline metrics).                                                                  | Watched continuously during the cutover window and daily during retention.                                             |
| `rollback retention window` | Calendar length of the per-entry rollback retention window (minimum 14 days per `SD-DP-20260512-006` §`Transition Length`).                                               | Defines when this cutover is eligible to be closed out and when the legacy route may be considered for cleanup.        |

If any field is missing, the live cutover window must not open. Record the
gap on the partner-entry record and return the entry to the appropriate
governance owner.

## 5. Pre-live-cutover gates (must all be true before scheduling)

Live cutover for a named partner entry is permitted only when **all** of the
following are true at the moment the change window opens. Missing items move
the entry into a blocked state instead of allowing the window to open.

### 5.1 Pilot prerequisites (cite, do not duplicate)

- `partnerEntry.sandboxStatus = approved`, per
  [`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Stage 1`.
- `partnerEntry.pilotStatus = approved`, per
  [`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Stage 2`.
- The full pilot retention window (≥14 calendar days) cleared without a
  triggered rollback, per
  [`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Stage 3`.
- Pilot acceptance evidence captured per that runbook's §`Acceptance` is
  still valid (no regression on the same partner entry since pilot exit).

### 5.2 Repo-local readiness (`SD-DP-20260512-006` §1)

- `PBK-UI-003` parity remains intact for the seven `PB_*` funnel screens.
- `PBK-UI-004` parity remains intact for the five authority-safe negative
  paths.
- `pnpm --filter @drts/partner-booking-web build / lint / typecheck` are
  green on the cutover candidate commit.
- Storybook parity for the partner-booking artboards remains green.

### 5.3 Per-entry record readiness

- Every field in §4 is populated, locked, and current.
- `partnerEntry.rolloutStage` is `pilot` (not `production` yet, not
  `rollback_hold`) at the moment the window opens.
- Ingress credential for the new app is issued via the Partner Entry
  Governance workflow (see
  `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
  §`7.5.2`).
- Parent tenant `rollbackPrepared = true` on the platform-admin record (per
  [`tenant-onboarding-rollout-runbook.md`](./tenant-onboarding-rollout-runbook.md)).

### 5.4 Workflow flow alignment

Per directive §3.4.4, the partner-entry flow must walk end-to-end on the
new app for this entry, with backend authority, before live cutover opens:

```text
partner entry active
→ landing
→ eligibility verification
→ eligible / ineligible / manual_review negative paths
→ booking create
→ confirmation
→ trip tracking
→ receipt / statement
→ partner report
→ rollback path verified
```

Evidence for each node must already exist from the pilot window — this gate
is satisfied by citation, not by re-running the pilot.

### 5.5 Governance acceptance

- Governance reviewer pre-approval is recorded on the partner-entry record
  for this specific live cutover task (per `SD-DP-20260512-006` §3
  prerequisite `1. the governance reviewer approves the cutover record`).
- The follow-up live cutover task itself is registered in `ai-status.json`
  with named owner and reviewer. This plan is not a substitute for that
  task.

If any item above is unmet, do not open the cutover window. Record the gap
and return the entry to the appropriate governance owner.

## 6. Live cutover stages

Live cutover uses the explicit `partnerEntry.rolloutStage` field, same field
the pilot runbook uses. Allowed values during live cutover:
`pilot`, `production`, `rollback_hold`.

This plan covers the `pilot → production` transition and the per-entry
14-day rollback-retention window that follows.

### Stage L1 — Pre-cutover lock (T-3d to T-1d)

1. The `cutoverOwner` confirms every §5 gate on the partner-entry record.
2. Re-confirm that `tenant-commute-hub` partner mode is still the current
   live owner (or `apps/tenant-console-web/app/partner/*` if previously
   migrated). No silent ownership drift since pilot exit.
3. Freeze partner-entry record edits except for cutover metadata (owners,
   timestamp, rollback target). Branding and ingress credential are locked.
4. Confirm `apps/partner-booking-web` build artifact on the cutover
   candidate commit matches the artifact that walked the pilot retention.
5. Confirm the monitoring dashboard (§4) is reachable and showing data.
6. Notify the `rollbackOwner`, the tenant `cutoverOwner` and `rollbackOwner`
   (per [`tenant-onboarding-rollout-runbook.md`](./tenant-onboarding-rollout-runbook.md)),
   and the partner-entry support hotline on call.

Exit condition: cutover window scheduled, owners on call, all §5 gates
green.

### Stage L2 — Live ingress flip (T-day window)

1. Open the change window with both `cutoverOwner` and `rollbackOwner` on
   call. Both must be reachable for the duration of the window.
2. Set `partnerEntry.rolloutStage = production` and a transitional
   `liveCutoverStatus = pending` on the platform-admin record.
3. Flip ingress for the named partner entry from the current live owner
   to `apps/partner-booking-web`, resolved by `entrySlug` or the
   host-owned partner-entry identifier. Do not route via the
   `[tenantSlug]` demo route.
4. Observe live traffic on the new app for the full change-window
   duration. Use the partner-entry monitoring dashboard (§4) and the axes
   in §8.
5. Confirm in-window:
   - happy-path booking creates a real booking through tenant API
     authority for live traffic on this entry,
   - eligibility responses are authority-backed (no UI fork),
   - audit entries are produced for both successful and denied actions
     consistent with `ORX-GV-001`,
   - `WF-TEN-001`, `WF-ORD-001`, `WF-DSP-001`, `WF-DRV-001`,
     `WF-PARTNER-001` (when the entry's eligibility mode is in scope),
     and `WF-FIN-GOV-001` (when partner billing/reporting hits in-window)
     continue to pass their existing live evidence shape for the parent
     tenant — no regression caused by the ingress flip,
   - the support hotline (§4) is reachable and resolves to the partner's
     named hotline metadata,
   - the legacy `tenant-console-web/app/partner/*` route is still
     reachable for the entry (rollback-support surface),
   - `tenant-commute-hub` partner mode is unchanged (no upstream retirement
     claim).
6. If every confirmation holds for the window, set
   `liveCutoverStatus = approved` on the partner-entry record. Capture the
   pilot timestamp and pilot cohort identifier from the pilot retention
   record alongside the live cutover timestamp.

Exit condition: `partnerEntry.rolloutStage = production`,
`liveCutoverStatus = approved`, and the cutover record captures named
`cutoverOwner`, `rollbackOwner`, `rollbackPrepared = true`, the live
cutover timestamp, the previous live owner / rollback target, the
monitoring dashboard reference, and the evidence anchors named in §10.

### Stage L3 — Live retention and observation (T-day to T+14d)

1. Keep the legacy `tenant-console-web/app/partner/*` route reachable for
   the migrated partner entry for the duration of the retention window.
2. Keep `tenant-commute-hub` partner mode untouched. Repo-local code
   changes do not claim retirement.
3. Observe the partner entry against the monitoring path (§8) daily for the
   full retention window (minimum 14 calendar days per
   `SD-DP-20260512-006` §`Transition Length`).
4. Daily check: confirm no per-entry funnel-completion regression vs the
   pilot baseline; confirm zero authority desync; confirm negative-path
   denials remain UX-visible; confirm audit completeness; confirm support
   hotline reachability.
5. Retention closes only when the full window clears without a triggered
   rollback. Mark `liveCutoverStatus = retained` on the partner-entry
   record and capture the retention close timestamp.
6. Retention closing does not by itself authorise removal of the legacy
   `tenant-console-web/app/partner/*` route. Removal is a separate cleanup
   task per `SD-DP-20260512-006` §`Deprecation Strategy` step 4 and is
   conditional on every actively migrated entry having cleared its
   retention.

Exit condition: 14-day retention closed without rollback, retention close
timestamp captured, and the live cutover record completed.

## 7. Rollback procedure (live-traffic specific)

Rollback during live cutover is a per-entry action. It must not affect
other migrated entries or the parent tenant's rollout state beyond the
named entry.

### 7.1 Triggers

Rollback is required if any of the following occurs during the live
window or the 14-day retention window:

- A `WF-PBK-001` acceptance scenario regresses on live traffic (happy-path
  booking failure, authority desync, audit gap, or silent negative-path
  failure).
- A parent-family gate degrades for the affected tenant or for this entry's
  programme: `WF-TEN-001`, `WF-ORD-001`, `WF-DSP-001`, `WF-DRV-001`,
  `WF-PARTNER-001`, or `WF-FIN-GOV-001`.
- A partner-entry activation, credential, or branding anomaly cannot be
  resolved within the change window.
- An external dependency named under `EXT-002` (forwarder), `EXT-004`
  (CTI), or the partner's own issuer/sandbox/live system (`EXT-001` or
  equivalent) materially blocks the partner entry's live path.
- Support hotline coverage fails: hotline is unreachable, or the partner's
  named hotline metadata is incorrect on live ingress.

### 7.2 Steps

1. The `rollbackOwner` declares rollback in writing on the partner-entry
   record, names the failing trigger from §7.1, and notifies the
   `cutoverOwner`, the tenant `rollbackOwner`, and the partner-entry
   support hotline.
2. Set `partnerEntry.rolloutStage = rollback_hold` and
   `liveCutoverStatus = blocked` on the platform-admin record. The API
   must block any further promotion until the hold is resolved (mirrors
   `tenant-onboarding-rollout-runbook.md` `Rollback Hold`).
3. Re-route ingress for the named partner entry back to its recorded
   `rollback route` (§4). That target equals the `current live owner`
   recorded at window open unless governance approved an explicit
   override:
   - If the rollback target is `apps/tenant-console-web/app/partner/*`,
     restore that route's ingress.
   - If the rollback target is `tenant-commute-hub` partner mode, restore
     that path through the upstream production owner. Repo-local changes
     alone do not perform the restore — coordinate with the upstream
     production owner.
4. Disable the new-app ingress credential, webhook delivery targets, and
   billing/reporting feed bindings that were activated specifically for
   this live cutover.
5. Capture a rollback decision record on the partner-entry record:
   - rollback timestamp,
   - rollback owner identifier,
   - the failing acceptance scenario, workflow family, or external
     dependency,
   - the rollback target route or host actually restored,
   - the open follow-up task id (if any).
6. Resume normal operation only after the `rollbackOwner` confirms that
   the previous working state is fully restored and no live traffic for
   the named entry still points at `apps/partner-booking-web`.

### 7.3 Re-promotion after rollback

Re-promotion of the same entry requires:

1. Root cause identified and resolved, with reference to the specific
   failing acceptance scenario or workflow family.
2. A re-run of pilot Stage 1 sandbox validation for the partner entry
   per [`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Stage 1`.
3. A fresh pilot Stage 2 promotion window with newly captured pilot
   evidence.
4. A fresh pilot Stage 3 retention window (≥14 days).
5. A fresh live cutover task that walks Stage L1, L2, L3 again.

A rollback during live cutover does not automatically reopen the pilot —
it triggers a new pilot cycle for the named entry.

## 8. Monitoring and support

During the live window and the 14-day retention window, monitor the
migrated partner entry along these axes (inherited from the pilot runbook
and tightened for live traffic):

- **Funnel completion** — happy-path booking success rate through the new
  app, segmented by the partner-entry `entrySlug`. Track against the pilot
  baseline.
- **Authority desync** — number of UI-state vs. backend-state mismatches
  for eligibility, booking, and audit. Target is `0`.
- **Negative-path coverage** — each of the five authority-safe negative
  paths produces a UX-visible denial, not a silent failure.
- **Audit completeness** — every denied action and every state-changing
  successful action produces an audit entry consistent with the
  `ORX-GV-001` audit-trail expectation.
- **Eligibility / partner-program metrics** — eligibility decisions for
  this entry's programme (`WF-PARTNER-001` axis) match authority and reach
  partner reporting (`WF-FIN-GOV-001` axis).
- **Support hotline coverage** — the partner-entry's named support hotline
  is reachable and the partner-entry record reflects the correct hotline
  metadata.
- **Cross-family impact** — `WF-TEN-001` / `WF-ORD-001` / `WF-DSP-001` /
  `WF-DRV-001` / `WF-PARTNER-001` / `WF-FIN-GOV-001` continue to pass
  their existing evidence shapes for the parent tenant.

Support escalation order: `cutoverOwner` → `rollbackOwner` → tenant
`cutoverOwner` / `rollbackOwner` (per
[`tenant-onboarding-rollout-runbook.md`](./tenant-onboarding-rollout-runbook.md)).

## 9. Coexistence and retirement boundaries

This plan does not retire any surface by itself.

- The legacy `apps/tenant-console-web/app/partner/*` route stays reachable
  while any migrated partner entry is inside its retention window. A
  separate cleanup task (post-retention, after all migrated entries clear
  retention) is required to remove it, per `SD-DP-20260512-006`
  §`Deprecation Strategy` step 4.
- `tenant-commute-hub` partner mode retirement is an upstream production
  action. Even a fully successful live cutover for one entry does not
  claim that retirement. Retirement requires a separately scoped upstream
  task, governance approval, and explicit closure of any remaining live
  traffic on that path.
- Producing a green live cutover plus 14-day retention for one partner
  entry is **not** a tenant-wide cutover claim. Each additional partner
  entry walks its own pilot, live cutover, and retention window.

## 10. Acceptance and evidence anchors (`WF-PBK-001`)

A live cutover for a partner entry is accepted only when all of the
following are captured against that entry on the platform-admin record and
in the supervisor-controlled machine truth.

### 10.1 Repo-local acceptance (inherited from pilot)

- `pnpm --filter @drts/partner-booking-web build`
- `pnpm --filter @drts/partner-booking-web lint`
- `pnpm --filter @drts/partner-booking-web typecheck`
- Storybook parity green for `PB_Landing`, `PB_Eligibility`, `PB_Book`,
  `PB_Confirmed`, `PB_Trips`, `PB_Receipt`, `PB_Help`.

### 10.2 Pilot precondition

- Pilot acceptance evidence per
  [`partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md) §`Acceptance`
  is captured, has not regressed, and the pilot retention window has
  closed without a triggered rollback.

### 10.3 Live functional acceptance (per partner entry)

- Live happy-path booking on `apps/partner-booking-web` for the named
  entry creates a real booking through `WF-ORD-001` backend authority (no
  mock-only state).
- The five authority-safe negative paths from `PBK-UI-004` each produce a
  UX-visible denial under live traffic for the named entry.
- The legacy `apps/tenant-console-web/app/partner/*` route still produces
  parity behaviour for the same five negative paths for the same partner
  entry during the retention window.
- The full directive §3.4.4 flow walks end-to-end on live traffic for the
  named entry: `partner entry active → landing → eligibility verification
  → eligible / ineligible / manual_review negative paths → booking create
  → confirmation → trip tracking → receipt / statement → partner report
  → rollback path verified`. Each node has a captured evidence anchor.

### 10.4 Live ingress invariants

- Live ingress for the named entry resolves by `entrySlug` (or future
  host-owned partner-entry identifier). The Wave 5 `[tenantSlug]` demo
  route is **not** used as the live ingress contract.
- Migration granularity is recorded as the partner entry, not the parent
  tenant. The cutover record names exactly one partner entry.

### 10.5 Rollback evidence (directive §3.4.5 item 4)

- The `rollback route` field on the partner-entry record matches the
  surface that owned live traffic immediately before this cutover
  (`tenant-commute-hub` partner mode or
  `apps/tenant-console-web/app/partner/*`).
- A `rollback path verified` evidence anchor exists, captured by walking
  the rollback target in a staging or dry-run posture during the change
  window. This evidence demonstrates that the recorded rollback target
  receives traffic and renders parity behaviour for the named entry if
  invoked.
- For any rollback that actually fires under §7, a rollback decision
  record exists per §7.2 step 5, and the entry's evidence pack captures
  the full §7.3 re-promotion trail before any future live cutover is
  attempted.

### 10.6 Governance acceptance (`SD-DP-20260512-006` §3 prerequisite 1)

- The platform-admin partner-entry record names a `cutoverOwner` and a
  `rollbackOwner`.
- The parent tenant has `rollbackPrepared = true`.
- The governance reviewer's approval is captured against the cutover
  record before the change window opens.
- The cutover record captures: live cutover timestamp, pilot timestamp,
  pilot cohort identifier, previous live owner, rollback target, support
  hotline path, monitoring dashboard reference, and the evidence anchors
  named in §10.3 and §10.5.

### 10.7 Machine-truth closeout (`SD-DP-20260512-006` §3 prerequisite 2)

- The follow-up live cutover task (the task that operationally executes
  this plan for one entry) produces a task-scoped commit with the
  trailers required by `AI_COLLABORATION_GUIDE.md` §`Commit evidence rule`:
  `LLM-Agent: <lane>`, `Task-ID: <task-id>`, `Reviewer: <reviewer>`.
- The owner pushes the commit with a normal non-force push and records
  `PUSH_REMOTE` and `PUSH_BRANCH`.
- The task reaches `done` only after the supervisor-controlled machine
  truth closeout records `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`,
  and `PUSH_BRANCH`.

### 10.8 At least one pilot evidence claim (directive §3.4.5 item 3)

Closing the wave-level `WF-PBK-001` gate read uplift from
`PASS (sandbox evidence)` to a live-evidence read requires at least one
partner entry to have produced a complete live cutover evidence pack per
this plan. The wave closeout packet must cite that entry by name and link
to its cutover record.

## 11. Non-claims

This plan explicitly does **not** claim:

- That `tenant-commute-hub` partner mode has been retired by a successful
  live cutover for one entry.
- That `apps/tenant-console-web/app/partner/*` is safe to remove. Removal
  is gated on every actively migrated entry having cleared its retention.
- That `WF-FWD-001`, `WF-COM-001`, `WF-FIN-001`, `WF-FIN-GOV-001`, or
  `WF-PARTNER-001` close out in a different shape than their own
  runbooks / specs describe.
- That a single partner-entry live cutover generalises to a tenant-wide
  cutover or to a batch live-flip across multiple partner entries.
- That repo-local CI green implies live traffic safety. Live traffic safety
  is gated by the pilot retention evidence, the live cutover evidence
  required by §10, and the governance reviewer's approval.
- That the Wave 5 `[tenantSlug]` route is a production contract. It is
  forbidden as the live ingress identity for any cut-over entry.
- That this plan authorises a live cutover by itself. Each live cutover
  requires its own dispatched task, named owners, and governance approval.

## 12. Reference anchors

- [`docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`](../00-context/phase1-design-blueprint-completion-directive-20260519.md) §3.4
- [`docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`](../01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md) §`Cutover Gates`, §`Transition Length`, §`Deprecation Strategy`
- [`docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`](./partner-booking-pilot-cutover-runbook-20260519.md)
- [`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`](./phase1-workflow-acceptance-release-gates.md) (`WF-PBK-001` row)
- [`docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`](./phase1-v3-design-blueprint-completion-wave-planning-20260519.md) §Group B
- [`docs/03-runbooks/tenant-onboarding-rollout-runbook.md`](./tenant-onboarding-rollout-runbook.md) (`Rollback Hold`, tenant cutover/rollback owners)
- [`docs/03-runbooks/partner-eligibility-manual-review-runbook.md`](./partner-eligibility-manual-review-runbook.md) (`WF-PARTNER-001` manual-review path)
- [`docs/03-runbooks/forwarder-production-adapter-rollout-runbook.md`](./forwarder-production-adapter-rollout-runbook.md) (cross-family rollout protocol reference)
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
  §`7.5.2 Partner entry setup workflow`,
  §`9.4.2 Partner Booking Mode`,
  §`9.7.1 Tenant login and workspace bootstrap`
- `apps/partner-booking-web/README.md`
- Companion UAT scenarios: `docs/04-uat/partner-booking-pilot-uat-20260519.md` (`PBK-UAT-001`, produced under this wave).
- Companion E2E shell: `tests/e2e/E2E-007-partner-booking-pilot.sh` (subject to wave-level `E2E-NUMBERING-DECISION`).
