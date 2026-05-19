# Partner Booking Live Cutover Plan

Last updated: 2026-05-19
Task ref: `PBK-RUNBOOK-001`
Workflow family: `WF-PBK-001`
Owner: `Codex`
Reviewer: `Claude2`

This document is the v3 formal live-cutover wrapper for
`WF-PBK-001`. It intentionally keeps
`docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
as the detailed normative operating procedure and adds the directive-level
items that v3 asked to see under a separate path:

- the current workflow-family gate read,
- the required per-partner-entry live-cutover record,
- the mapping from directive wording to the repo's current artifacts,
- the non-claim language that prevents repo-local proof from being mistaken
  for production traffic retirement.

## 1. Current Gate Read

- Current `WF-PBK-001` read: `HOLD`
- Repo-local readiness already exists:
  `apps/partner-booking-web`, the accepted topology decision
  `SD-DP-20260512-006`, the authority-safe negative-path requirement from
  `PBK-UI-004`, and the existing cutover shell proof in
  `tests/e2e/E2E-008-partner-booking-cutover.sh`.
- The gate remains `HOLD` because this wave still needs a named pilot partner
  entry, named `cutoverOwner` / `rollbackOwner`, a real pilot window, and
  rollback-ready observation evidence before anyone can restate the family as
  `PASS (pilot evidence)`.
- Production remains a separate gate. The current live owner is still the
  external `tenant-commute-hub` partner mode until a later production cutover
  task explicitly closes that transition.

## 2. Normative Artifact Map

| Need | Current artifact | How this plan uses it |
| --- | --- | --- |
| Topology and live-cutover constraints | `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md` | Binding source for migration granularity, coexistence policy, pilot-vs-production separation, and rollback-retention rules. |
| Detailed pilot cutover procedure | `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md` | Normative operating procedure for readiness, pilot window, rollback, monitoring, acceptance, and non-claims. |
| Parent tenant rollout semantics | `docs/03-runbooks/tenant-onboarding-rollout-runbook.md` | Governs `rollbackPrepared`, tenant rollback ownership, and the `rollback_hold` model that partner-entry cutover composes with. |
| Existing repo proof | `tests/e2e/E2E-008-partner-booking-cutover.sh` | Current shell-E2E contract for deactivate -> bootstrap denial -> reactivate -> eligibility -> booking -> finance read-back -> restored active state. |
| Current gate dashboard | `docs/04-uat/phase1-business-flow-verification-dashboard-20260519.md` | Records the current `WF-PBK-001` read as `HOLD` and names the next unlock as a real pilot window plus rollback evidence. |
| v3 wave planning intent | `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md` | Explains why this file exists separately from the earlier pilot runbook: v3 wants a formal live-cutover-plan path without redoing the underlying procedure. |

Numbering note: the v3 directive names `tests/e2e/E2E-007-partner-booking-pilot.sh`,
but the current repo artifact is
`tests/e2e/E2E-008-partner-booking-cutover.sh`. Until the user resolves the
global E2E renumbering conflict, this plan treats the existing `E2E-008`
script as the authoritative proof path.

## 3. Required Partner-Entry Cutover Record

Before opening a pilot window, create or update one partner-entry record that
contains every field below. This is the minimum live-cutover packet for
`WF-PBK-001`.

| Field | Required meaning for `WF-PBK-001` |
| --- | --- |
| `entrySlug` | The migration unit. Live migration is per partner entry, not per tenant. |
| `partnerCode` | Stable partner/business identifier used in platform-admin and reporting surfaces. |
| `programId` | The benefit or partner program identifier used by eligibility and reporting flows. |
| `current live owner` | The currently serving production surface before pilot. Normally `tenant-commute-hub` partner mode or the repo-local legacy route. |
| `target surface` | `apps/partner-booking-web` plus the real entry-owned ingress. It must not be the Wave 5 `[tenantSlug]` demo route alone. |
| `cutoverOwner` | Named human/operator who owns the pilot change window. |
| `rollbackOwner` | Named human/operator who can declare and execute rollback. |
| `rollback route` | The concrete legacy route or host that remains valid during pilot and the retention window. |
| `support hotline` | The support escalation path exposed to the partner entry during pilot. |
| `brand metadata` | Branding tokens or equivalent white-label metadata that must match the live partner entry. |
| `eligibility mode` | The authority-backed eligibility configuration for the entry; it must not be mock-only UI state. |
| `billing/reporting owner` | Named owner for invoice, receipt, report-export, and receipt-ownership questions during pilot. |
| `monitoring dashboard` | The dashboard or evidence path used to watch pilot funnel completion, denials, audit entries, and support issues. |
| `rollback retention window` | At least `14` calendar days after pilot promotion, matching `SD-DP-20260512-006` and the pilot runbook. |

## 4. Live Cutover Plan

This plan keeps the detailed operational steps in the pilot runbook and uses
the following higher-level sequence for v3 reporting.

### Phase A - Select the partner entry

1. Pick one named partner entry.
2. Freeze the `current live owner`, `target surface`, and `rollback route`.
3. Name the `cutoverOwner`, `rollbackOwner`, `billing/reporting owner`, and
   support hotline path.

Exit evidence:

- the partner-entry record contains every field from Section 3,
- the parent tenant record is at least pilot-eligible and keeps
  `rollbackPrepared = true`.

### Phase B - Repo-local and sandbox readiness

Run the readiness gates already defined in
`partner-booking-pilot-cutover-runbook-20260519.md`:

- seven-screen partner funnel parity remains intact,
- five authority-safe negative paths remain intact,
- `@drts/partner-booking-web` build, lint, and typecheck stay green,
- Storybook parity remains green,
- the entry's sandbox validation exits with `sandboxStatus = approved`.

Exit evidence:

- readiness checks are recorded for the chosen entry,
- the shell-E2E path `tests/e2e/E2E-008-partner-booking-cutover.sh`
  still matches the intended partner-entry contract.

### Phase C - Pilot cutover window

1. Open a change window with the named owners on call.
2. Set the partner entry into `pilot` rollout mode without claiming
   production retirement.
3. Route a small named cohort through the real entry-owned ingress to
   `apps/partner-booking-web`.
4. Confirm the end-to-end flow:
   `landing -> eligibility verification -> eligible / ineligible / manual_review -> booking create -> confirmation -> trip tracking -> receipt / statement -> partner report`.
5. Confirm that denied paths remain UX-visible and authority-backed.
6. Confirm that rollback can still target the named legacy route or host.

Exit evidence:

- `pilotStatus = approved`,
- the pilot timestamp and cohort are recorded,
- the chosen entry's audit and monitoring evidence are attached,
- the rollback target remains reachable.

### Phase D - Retention and observation

1. Keep the rollback route valid for at least `14` calendar days.
2. Observe funnel completion, denial handling, audit completeness, and support
   hotline readiness during the retention window.
3. If a regression appears, move the entry to `rollback_hold` and follow the
   rollback procedure in the normative pilot runbook.

Exit evidence:

- either the entry clears the retention window without rollback,
- or a rollback record names the failing scenario, timestamp, owner, and
  restored target.

### Phase E - Separate production follow-up

If the pilot succeeds, open a separate production cutover task. That later task
must capture:

- the production promotion timestamp,
- the final live-owner transition away from `tenant-commute-hub`,
- the entry-specific rollback decision record,
- machine-truth closeout evidence for the promoted surface.

This document does not authorize that production transition by itself.

## 5. Required Evidence Package

Before `WF-PBK-001` can move past `HOLD`, the reviewer should be able to see
all of the following for at least one named partner entry:

1. The Section 3 partner-entry record completed in platform-admin or an
   equivalent governed cutover packet.
2. Repo-local readiness evidence:
   `@drts/partner-booking-web` build, lint, typecheck, Storybook parity, and
   the authority-safe negative-path contract from `PBK-UI-004`.
3. The existing partner cutover shell proof from
   `tests/e2e/E2E-008-partner-booking-cutover.sh` or the renamed equivalent if
   the user later resolves numbering.
4. Real pilot-window evidence for the chosen entry:
   happy-path booking, negative-path denials, audit entries, and monitoring
   read-back.
5. Rollback-readiness evidence:
   the named rollback route, proof it remained reachable during pilot, and the
   operator record that shows who can execute rollback.
6. Machine-truth delivery evidence:
   owner branch commit, normal non-force push, and reviewer handoff/approval in
   `ai-status.json`.

## 6. Relationship To The Existing Pilot Runbook

| This document's role | Detailed source |
| --- | --- |
| Gate position and v3 formalization | This file |
| Pre-cutover readiness checklist | `partner-booking-pilot-cutover-runbook-20260519.md` -> `Pre-cutover Inputs` |
| Sandbox / pilot / retention stage procedures | `partner-booking-pilot-cutover-runbook-20260519.md` -> `Cutover Stages` |
| Rollback triggers and step-by-step rollback | `partner-booking-pilot-cutover-runbook-20260519.md` -> `Rollback Procedure` |
| Monitoring axes and support escalation | `partner-booking-pilot-cutover-runbook-20260519.md` -> `Monitoring And Support` |
| Acceptance and non-claim wording | `partner-booking-pilot-cutover-runbook-20260519.md` -> `Acceptance` and `Non-Claims` |

The intent is to prevent drift: update the pilot runbook when the operational
procedure changes, and update this live-cutover plan when the workflow-family
gate wording, required fields, or directive mapping changes.

## 7. Non-Claims

This document explicitly does not claim any of the following:

- the Wave 5 `[tenantSlug]` demo route is a valid production cutover contract,
- repo-local UI completion alone retires `tenant-commute-hub` as the live
  owner,
- the current `E2E-008` script has already satisfied the directive's unresolved
  numbering request for `E2E-007`,
- pilot evidence for one entry automatically promotes all entries in the same
  tenant,
- `WF-FWD-001`, `WF-COM-001`, or `WF-FIN-001` are closed differently from
  their own workflow-family runbooks,
- pilot readiness equals production authorization.

## Reference Anchors

- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
  §`3.4 WF-PBK-001`
- `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md`
- `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/04-uat/phase1-business-flow-verification-dashboard-20260519.md`
- `tests/e2e/E2E-008-partner-booking-cutover.sh`
