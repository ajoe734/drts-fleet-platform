# SYS-UI-005 Sidecar Acceptance Packet

- Sidecar Task: `SYS-UI-005-SIDECAR-ACCEPTANCE`
- Sidecar Owner / Reviewer: `Claude2` / `Codex`
- Parent Task: `SYS-UI-005` — Call Point / Concierge Portal Materialization
- Parent Owner / Reviewer: `Codex` / `Claude2`
- Helper Kind: `acceptance_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-05-09

## Purpose

Provide parallel acceptance scaffolding while the parent SYS-UI-005 slice is
still `in_progress`. This packet:

1. decomposes the single-line parent acceptance into discrete, individually
   verifiable items the parent owner / parent reviewer can tick off as
   materialization lands;
2. captures the dependency map (`SYS-UI-001`, `OPS-UI-008`) including which
   commit each upstream contributed and where the seam is consumed inside
   `apps/concierge-portal-web`;
3. records the explicit landing-zone naming seam between the topology decision
   (`apps/assisted-entry-web`) and the parent task's chosen artifact path
   (`apps/concierge-portal-web`) so the parent reviewer adjudicates it rather
   than treating the divergence as a silent contradiction.

This packet does not authorize the parent slice. Parent acceptance still
belongs to parent reviewer `Claude2` once the parent owner finishes
materialization.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/SYS-UI-005/`.
- Do not modify L1 product truth (`phase1_*` specs, contracts, migration plan).
- Do not modify the parent's write scope (`apps/concierge-portal-web` and any
  shared assisted-entry helpers).
- Do not modify canonical decision records, runbook execution packets, or the
  central task board (`ai-status.json`).
- Hand the packet off to the assigned reviewer (`Codex`).

## Parent Anchors

- Parent execution packet (canonical):
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
  (`SYS-UI-005` is defined at lines 276–304; surface-map row at lines 98–99.)
- Topology decision (`SYS-UI-001` output):
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- PRD anchor: `phase1_prd_detailed_v1.md` §9.1.3 — call point / concierge as a
  first-class assisted-entry surface, distinct from internal ops.
- Service-contracts anchor: `phase1_service_contracts_v1.md` §3.11 — assisted
  entry session / booking semantics.
- Role-matrix anchor: `phase1_system_analysis_v1.md` §3.1 — splits
  `call_point_operator` and `concierge_operator` from internal ops actors.

## Landing-Zone Naming Seam (Recorded, Not Adjudicated)

The topology decision (`SD-DP-20260509-005`) and the parent execution packet
both name the formal landing zone `apps/assisted-entry-web`:

- decision row: `Call Point / Concierge Portal -> apps/assisted-entry-web`
  (`docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:19`,
  `:34`).
- execution packet write scope: `apps/assisted-entry-web` (lines 287–289).

The parent task record in `ai-status.json` lists artifacts as:

- `apps/concierge-portal-web`
- `support/sidecars/SYS-UI-005`

Repo state at packet write-time:

- `apps/concierge-portal-web/` exists and is scaffolded (Next.js 16 / React 19,
  port `3006`, package `@drts/concierge-portal-web`). It contains
  `app/layout.tsx`, `app/globals.css`, `components/concierge-shell.tsx`,
  `components/session-guard.tsx`, `lib/api-client.ts`, `lib/desk-catalog.ts`,
  `lib/navigation.ts`, `lib/portal-state.tsx`, plus empty route directories for
  `/login`, `/start`, `/lookup`, `/bookings/new`, `/callbacks`, `/ineligible`,
  `/denied`, `/degraded`, `/recording-unavailable`. Route `page.tsx` files were
  not yet present at packet write-time.
- `apps/assisted-entry-web/` exists as an empty directory placeholder.

The shell itself acknowledges the seam in copy:

> `apps/concierge-portal-web/components/concierge-shell.tsx:55–60` — “Task
> artifact path is `apps/concierge-portal-web`; topology docs still refer to
> the assisted-entry family. The support packet records that naming seam
> explicitly.”

This sidecar therefore records the seam as a parent-side decision the parent
reviewer (`Claude2`) and parent owner (`Codex`) must reconcile. Three
resolutions are conformant; the sidecar does not pick one:

1. Treat `concierge-portal-web` as the rename — update the topology decision
   record and execution packet surface-map / write-scope rows so the
   landing-zone name matches the implementation.
2. Treat `assisted-entry-web` as canonical — rename the package /
   directory inside the parent's write scope before parent finalization.
3. Keep both — accept `apps/concierge-portal-web` as the slice deliverable and
   leave the empty `apps/assisted-entry-web/` placeholder as a forward-gated
   assisted-entry plane shell, with a docs amendment recording that the
   call-point / concierge desk surface lives at the concierge-portal path.

The sidecar takes no canonical action on this. Recording the seam is the only
sidecar deliverable here.

## Acceptance Decomposition (Parent SYS-UI-005)

Parent acceptance line:

> concierge landing zone exists and is no longer only a deferred decision note

Together with the parent execution packet's "Work" enumeration (8 sub-bullets
across order entry shell, lookup, call/session context, booking submission,
callback, ineligible, denied, degraded, recording-unavailable), the line
decomposes into the following individually verifiable items. None of these are
checked by the sidecar; the parent owner / parent reviewer tick them as
materialization lands.

| #   | Acceptance item                                                                                                                                                             | Surface anchor expected by parent slice                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Repo-local concierge / call-point landing zone is materialized as a real Next.js target (no longer prose-only).                                                             | `apps/concierge-portal-web` workspace, `next dev` / `next build` runnable, package `@drts/concierge-portal-web`.                                                                                                 |
| 2   | Dedicated concierge shell exists with assisted-entry-plane chrome and does not reuse internal ops-console navigation.                                                       | `components/concierge-shell.tsx`, sidebar nav from `lib/navigation.ts` (Desk Home, Bootstrap Sign-In, Fixed Site Picker, Proxy Booking, Order Lookup, Callbacks, Degraded, Recording Gate).                      |
| 3   | Repo-local bootstrap sign-in for desk operators (until production assisted-entry auth lands) is explicit, with `concierge_operator` / `call_point_operator` mode selection. | `app/login/page.tsx` (route present in this slice), `lib/portal-state.tsx::signIn`, `lib/api-client.ts` `LIMITED_SCOPES = callcenter:read, callcenter:write, owned:read, dispatch:read`.                         |
| 4   | Fixed-site / desk picker exists and binds the session to a desk before assisted entry begins.                                                                               | `app/start/page.tsx`, `lib/desk-catalog.ts::conciergeDeskCatalog`, `lib/portal-state.tsx::selectDesk` and `useSelectedDesk`.                                                                                     |
| 5   | Proxy booking entry exists at the desk lane (concierge order entry shell + booking submission).                                                                             | `app/bookings/new/page.tsx`, eligibility evaluation via `lib/desk-catalog.ts::evaluateDeskEligibility`, mode access via `resolveDeskAccess`, booking submission through the bearer client.                       |
| 6   | Order / contact lookup exists for desk-created sessions, including dispatch trace and recording posture.                                                                    | `app/lookup/page.tsx`, with `recentOrderIds` / `recentCallIds` from `lib/portal-state.tsx`.                                                                                                                      |
| 7   | Call / session context is materialized (active call id, recent calls, session-bound recordkeeping).                                                                         | `lib/portal-state.tsx::recordCall` / `clearActiveCall` / `activeCallId` / `recentCallIds`, surfaced in the topbar (`concierge-shell.tsx:75–87`).                                                                 |
| 8   | Callback flow is materialized (schedule / resolve callbacks for desk-created sessions).                                                                                     | `app/callbacks/page.tsx`, `recentCallbackTaskIds` from `lib/portal-state.tsx::recordCallbackTask`.                                                                                                               |
| 9   | Ineligible state is materialized (product not authorized / service-area mismatch) with explicit reason codes.                                                               | `app/ineligible/page.tsx`, driven by `evaluateDeskEligibility` returning `state: "ineligible"` with `reasonCode: "product_not_authorized" \| "service_area_mismatch"`.                                           |
| 10  | Denied state is materialized (mode not allowed for the desk).                                                                                                               | `app/denied/page.tsx`, driven by `resolveDeskAccess` returning `allowed: false` with `reasonCode: "mode_denied"`.                                                                                                |
| 11  | Degraded state is materialized (read-only fallback when desk lane loses capability).                                                                                        | `app/degraded/page.tsx`; sample `health: "degraded"` desk seeded in `desk-catalog.ts` (Taoyuan T1 row) makes the degraded fallback reachable in repo-local form.                                                 |
| 12  | Recording-unavailable state is materialized; raw recording-callback binding still escalates to ops, not handled inside concierge portal.                                    | `app/recording-unavailable/page.tsx`, copy explicitly defers to ops; `recordingAvailability: "ops_callback_only"` in `desk-catalog.ts` is the canonical posture.                                                 |
| 13  | Concierge / assisted-entry surface does not import or expose ops-console navigation, ops dashboards, or platform-admin authority.                                           | No imports from `apps/ops-console-web` or `apps/platform-admin-web`; nav inventory limited to `lib/navigation.ts`.                                                                                               |
| 14  | Bootstrap auth is constrained to a documented limited scope; no full ops scope leakage.                                                                                     | `lib/api-client.ts::LIMITED_SCOPES = ["callcenter:read", "callcenter:write", "owned:read", "dispatch:read"]`; `x-realm: ops`, `x-roles` set to the operator mode (`call_point_operator` / `concierge_operator`). |
| 15  | Public booking-status sub-surface guidance is honored: there is no separate non-ROC live-board surface; status visibility is folded into desk lookup / booking detail.      | No new live-board route added; status is read inside `/lookup` and booking detail. Per `SD-DP-20260509-005` row "Public booking-status surface" → folded into passenger and assisted-entry.                      |
| 16  | Parent slice runs `pnpm --filter @drts/concierge-portal-web typecheck` and `pnpm --filter @drts/concierge-portal-web build` (or equivalent) cleanly before parent handoff.  | The parent owner records the run as part of parent acceptance evidence; the sidecar does not run these.                                                                                                          |
| 17  | Naming-seam resolution is recorded by the parent (one of the three options in "Landing-Zone Naming Seam"); reviewer adjudication is captured in the parent acceptance.      | Parent reviewer (`Claude2`) records the chosen resolution in the parent's review notes / commit message.                                                                                                         |

These 17 items are the sidecar's reading of the parent acceptance line. The
parent owner / parent reviewer remain the authority on whether materialization
satisfies them; the sidecar provides the checklist, not the verdict.

## Dependency Map (Parent SYS-UI-005)

The parent task lists two upstream dependencies. This map records what each
upstream contributed and where the seam is consumed inside the parent slice.

| Upstream     | Status | Commit  | What it contributed to SYS-UI-005                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Seam consumed in this slice                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SYS-UI-001` | done   | a4af1d2 | Topology decision `SD-DP-20260509-005` placing call point / concierge into a dedicated assisted-entry plane (`apps/assisted-entry-web` per the decision text), separate from ops-console. Execution packet `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md` defining the SYS-UI-005 work scope and acceptance line. Constraint that `apps/ops-console-web/app/callcenter` remains the internal ops control-plane workspace (decision §"Constraints Carried Forward" item 4) and `apps/tenant-portal-web` stays sunset (item 5).            | Implemented as a dedicated `apps/concierge-portal-web` workspace with its own shell, navigation, and bootstrap helpers. The naming seam vs the topology decision text is recorded above. The constraint that the concierge surface is not a replacement for the ops control plane is honored by the limited bootstrap scope in `lib/api-client.ts`. |
| `OPS-UI-008` | done   | 7c366b7 | `apps/ops-console-web/app/callcenter/page.tsx` (Callcenter Session Workspace Hardening) — defines the internal ops-console phone-order / callback / complaint workspace that the concierge / call-point assisted-entry portal must remain distinct from. Its existence is what lets `SYS-UI-005` ship a separate site-bound surface without leaking internal-ops capability. (Per topology decision §"Constraints Carried Forward" item 4: callcenter remains the control-plane agent workspace; concierge portal is the external/site-bound assisted-entry plane.) | Boundary preserved by keeping the concierge portal in its own workspace, with only a documented limited scope (`callcenter:read`, `callcenter:write`, `owned:read`, `dispatch:read`) over the shared bearer transport. Recording-callback binding explicitly defers to ops via `/recording-unavailable` and the `ops_callback_only` desk posture.   |

Notes:

- Both upstream tasks are recorded `done` in `ai-status.json` at packet
  write-time, so the sidecar publishes against a settled dependency baseline.
- Commit hashes were obtained via `git log --oneline -1 -- <path>` for the
  canonical artifact of each upstream (`docs/01-decisions/SD-DP-20260509-005-…`
  for `SYS-UI-001` and `apps/ops-console-web/app/callcenter/page.tsx` for
  `OPS-UI-008`). They are recorded for parent-side traceability only; the
  sidecar makes no claim about their correctness.
- The sister `OPS-UI-008` boundary is asymmetric: SYS-UI-005 must not duplicate
  ops-callcenter authority, but OPS-UI-008 does not need to know about
  SYS-UI-005. The sidecar makes this asymmetry explicit so the reviewer does
  not look for a callcenter-side wiring change that does not exist.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — this packet lives entirely under
      `support/sidecars/SYS-UI-005/`.
- [x] Do not edit canonical truth — no L1 product truth, contract truth,
      migration plan, topology decision record, runbook execution packet,
      `ai-status.json`, or `apps/concierge-portal-web` content was modified by
      the sidecar owner.
- [ ] Hand off the packet to the assigned reviewer (`Codex`) — to be performed
      via `scripts/ai-status.sh handoff` after this content lands.

## Reviewer Pointers (Sidecar)

For sidecar reviewer `Codex` (also the parent owner), the verification surface
is small:

1. Confirm only this file was added by the sidecar owner; no edits to
   `apps/concierge-portal-web/**`, `docs/01-decisions/**`,
   `docs/03-runbooks/**`, or `ai-status.json`.
2. Spot-check the Acceptance Decomposition table against the parent execution
   packet (`docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:276-304`)
   — every parent "Work" sub-bullet maps to at least one numbered item.
3. Spot-check the Dependency Map against `ai-status.json` (`SYS-UI-001`,
   `OPS-UI-008` both `done`) and the recorded commit hashes.
4. Decide whether the Landing-Zone Naming Seam needs to be reconciled before
   parent finalization, and which of the three options applies. (The sidecar
   does not pick one; this is parent-side authority.)
5. If the checklist or dependency map needs revision before the parent slice
   lands, return the sidecar with `reopen` rather than approving — the sidecar
   owner will absorb the changes.

## Out Of Scope For The Sidecar

- Re-verifying parent typecheck / lint / build / route inventory; that is
  parent-owner authority and parent-reviewer authority, not sidecar authority.
- Approving or rejecting the parent SYS-UI-005 task. The sidecar approves only
  the support packet itself.
- Mutating any path outside `support/sidecars/SYS-UI-005/`.
- Adjudicating the `apps/concierge-portal-web` vs `apps/assisted-entry-web`
  naming seam.
- Recording commit evidence — the sidecar finalizes under
  `NO_COMMIT_REQUIRED=1` per `AI_COLLABORATION_GUIDE.md` §5 "Commit evidence
  rule" (sidecar / explicit non-canonical closeout tasks).

## Files Added By The Sidecar

```
support/sidecars/SYS-UI-005/SYS-UI-005-SIDECAR-ACCEPTANCE.md   (this file)
```
