# SYS-UI-004 Sidecar Acceptance Packet

- Sidecar Task: `SYS-UI-004-SIDECAR-ACCEPTANCE`
- Sidecar Owner / Reviewer: `Codex2` / `Claude`
- Parent Task: `SYS-UI-004` — Passenger Booking, Status, And Negative-Flow Materialization
- Parent Owner / Reviewer: `Claude` / `Codex2`
- Helper Kind: `acceptance_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-05-09

## Purpose

Provide a reviewer-ready acceptance packet for `SYS-UI-004` without changing
the parent implementation or any canonical product truth.

This sidecar exists because the parent task is still `in_progress` and already
has recorded reviewer findings in `ai-status.json`. The packet therefore does
three things only:

1. decomposes the parent acceptance line into explicit checklist items;
2. maps each declared dependency to the seam it contributes into the passenger
   surface;
3. records the current parent-state blockers so reviewer `Claude` can judge the
   support packet against machine truth rather than stale prose.

This packet does not approve the parent slice. Parent acceptance remains with
parent reviewer `Codex2` after parent owner `Claude` resolves the recorded
routing regressions.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/SYS-UI-004/`.
- Do not modify L1 product truth (`phase1_*` specs, contracts, migration plan).
- Do not modify the parent write scope under `apps/passenger-web/`.
- Do not rewrite the execution packet, topology decision docs, or task board.
- Hand this packet off to the assigned sidecar reviewer (`Claude`).

## Parent Anchors

- Parent execution packet (canonical):
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
  (`SYS-UI-004` section at lines 247-265).
- Topology / lane anchors:
  - `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:96-99`
  - `phase1_prd_detailed_v1.md` passenger / rider-facing surface sections
  - `phase1_system_analysis_v1.md` passenger-facing channel separation rules
- Baseline predecessor:
  `support/sidecars/SYS-UI-003/SYS-UI-003-SIDECAR-ACCEPTANCE.md`
- Cross-surface support packets the parent explicitly depends on:
  - `support/sidecars/XS-UI-001`
  - `support/sidecars/XS-UI-003`

## Acceptance Decomposition (Parent SYS-UI-004)

Parent acceptance line:

> passenger positive and negative core flows are represented route-by-route

The parent execution packet's Work section expands that into the following
verifiable items. This sidecar does not mark them complete; it provides the
review structure only.

| #   | Acceptance item                                                                                                                                                                                           | Expected evidence seam                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Passenger booking entry exists as a concrete rider-facing route rather than deferred prose.                                                                                                               | `apps/passenger-web/app/book/page.tsx` and route registration in build output.                                                             |
| 2   | Active trip / booking-status view exists as a concrete route.                                                                                                                                             | `apps/passenger-web/app/trip/page.tsx`.                                                                                                    |
| 3   | Cancellation path is materialized only where rider authority exists.                                                                                                                                      | `apps/passenger-web/app/trip/cancel/page.tsx` and copy that frames cancel as policy/authority bound.                                       |
| 4   | Completion / receipt visibility is materialized as a concrete route and still defers receipt ownership honestly.                                                                                          | `apps/passenger-web/app/trip/completed/page.tsx` plus linkage into `/receipts`.                                                            |
| 5   | Read-only authority-safe trip state exists for trips owned by another channel.                                                                                                                            | `apps/passenger-web/app/trip/read-only/page.tsx`.                                                                                          |
| 6   | Denied state exists as its own route, separate from ineligible or no-supply.                                                                                                                              | `apps/passenger-web/app/book/denied/page.tsx`.                                                                                             |
| 7   | Ineligible state exists as its own route, naming failed gates without leaking hidden policy internals.                                                                                                    | `apps/passenger-web/app/book/ineligible/page.tsx`.                                                                                         |
| 8   | No-supply state exists as its own route, separate from denial semantics.                                                                                                                                  | `apps/passenger-web/app/book/no-supply/page.tsx`.                                                                                          |
| 9   | Degraded state exists as its own route and presents read-only / retry-safe behavior rather than fake success.                                                                                             | `apps/passenger-web/app/book/degraded/page.tsx`.                                                                                           |
| 10  | Cancelled trip state exists as its own route, distinct from active cancel flow.                                                                                                                           | `apps/passenger-web/app/trip/cancelled/page.tsx`.                                                                                          |
| 11  | Re-auth-required state exists as its own route and does not expose trip data before verification recovers.                                                                                                | `apps/passenger-web/app/trip/reauth-required/page.tsx`.                                                                                    |
| 12  | Parent navigation and route chrome remain coherent for all new subroutes, so route-by-route materialization is actually discoverable.                                                                     | `apps/passenger-web/lib/navigation.ts`, `apps/passenger-web/components/passenger-shell.tsx`, and review of subroute active-state behavior. |
| 13  | Passenger route set preserves upstream guardrails from `SYS-UI-003`, `XS-UI-001`, and `XS-UI-003`: no separate public live-board app, no fake authority transfer, and explicit command/action boundaries. | Review of route copy, shell framing, and support packet cross-references.                                                                  |
| 14  | Parent verification remains green after route additions and nav fixes.                                                                                                                                    | Parent-owned evidence in `ai-status.json` / parent handoff note for `typecheck`, `lint`, `test`, and `build`.                              |

## Dependency Map

The parent task declares three dependencies. All three are already `done` in
`ai-status.json` at packet write-time, so this packet treats them as a settled
upstream baseline.

| Upstream     | Status | Commit / closeout evidence                                                                                            | What it contributes to SYS-UI-004                                                                                                                                                                   | Seam consumed in the parent slice                                                                                                          |
| ------------ | ------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SYS-UI-003` | `done` | Commit `1b97717`; closeout recorded in `ai-status.json` on 2026-05-09T17:33:33Z                                       | Establishes the passenger shell baseline and concrete routes for `/`, `/auth`, `/trips`, `/receipts`, `/unauthenticated`, and `/unsupported`, while preserving receipt/source-ownership guardrails. | `SYS-UI-004` extends the same `apps/passenger-web` target with `/book*` and `/trip*` routes and must not regress shell or receipt framing. |
| `XS-UI-001`  | `done` | Commit `ac44883` recorded in task closeout; topology decision commit `a4af1d2` updates full-system landing-zone truth | Confirms that public booking-status remains folded into `apps/passenger-web` rather than opening a separate public live-board surface.                                                              | Parent routes are materialized as passenger subroutes under one shell, not as a new app or detached status plane.                          |
| `XS-UI-003`  | `done` | Commit `7b76d9f`; closeout recorded in `ai-status.json` on 2026-05-08T22:08:04Z                                       | Provides the tenant / management command-action matrix that clarifies where mutations are allowed versus read-only.                                                                                 | Parent must keep `/trip/read-only` honest, keep cancel authority scoped, and avoid inventing cross-channel mutation rights in rider copy.  |

Notes:

- `SYS-UI-004` depends on `SYS-UI-003` structurally: the booking/trip routes
  hang off the shell and baseline route topology that `SYS-UI-003` created.
- `XS-UI-001` is a topology guardrail, not an implementation helper. Its value
  here is preventing route sprawl into a second passenger-status app.
- `XS-UI-003` is an authority guardrail. Its value here is ensuring negative
  and read-only states stay aligned with the broader command/action matrix.

## Current Parent-State Snapshot

At packet write-time, `ai-status.json` records parent `SYS-UI-004` as
`in_progress` with a review-failed note dated `2026-05-09T18:05:01Z`.

Recorded parent blockers:

1. `apps/passenger-web/lib/navigation.ts`
   `findPassengerNavItem()` uses `pathname.startsWith(item.href)` while listing
   `/trip` before `/trips`, so `/trips` resolves to `Active Trip` instead of
   `Trip History`.
2. `apps/passenger-web/components/passenger-shell.tsx`
   sidebar active state uses `item.href === pathname`, so subroutes like
   `/book/denied` and `/trip/cancel` do not highlight their parent nav item.

Why this matters for the sidecar:

- The parent acceptance line says flows are represented route-by-route.
- If route chrome misidentifies or fails to highlight those routes, the routes
  technically exist but are not cleanly presented as a coherent route-by-route
  surface.
- The sidecar therefore records navigation coherence as acceptance item `#12`
  instead of treating it as a cosmetic afterthought.

This packet records the blockers; it does not fix them.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — this sidecar touches only
      `support/sidecars/SYS-UI-004/SYS-UI-004-SIDECAR-ACCEPTANCE.md`.
- [x] Do not edit canonical truth — no L1 specs, parent implementation files,
      execution packet, or control-plane docs were modified by this sidecar.
- [ ] Hand off the packet to the assigned reviewer (`Claude`) via
      `scripts/ai-status.sh handoff`.

## Reviewer Pointers (Sidecar)

For sidecar reviewer `Claude`, the key checks are:

1. Confirm the packet reflects current machine truth:
   parent `SYS-UI-004` is still `in_progress`, not accepted.
2. Confirm the Acceptance Decomposition table faithfully expands the parent
   execution packet's Work list without claiming completion.
3. Confirm the Dependency Map matches `ai-status.json` for `SYS-UI-003`,
   `XS-UI-001`, and `XS-UI-003`, including their role in the parent slice.
4. Confirm the Current Parent-State Snapshot matches the reviewer findings
   already recorded in `ai-status.json`.
5. Confirm the sidecar itself mutated no path outside
   `support/sidecars/SYS-UI-004/`.

## Out Of Scope For The Sidecar

- Fixing the parent implementation regressions in `apps/passenger-web/**`.
- Re-reviewing or approving the parent `SYS-UI-004` task itself.
- Changing the execution packet, topology decisions, or acceptance wording in
  canonical docs.
- Producing commit evidence for the parent slice.

Per `AI_COLLABORATION_GUIDE.md` commit-evidence rules, this sidecar is a
support-only artifact and may close with `NO_COMMIT_REQUIRED=1` if it later
reaches `done`.

## Files Added / Updated By The Sidecar

```
support/sidecars/SYS-UI-004/SYS-UI-004-SIDECAR-ACCEPTANCE.md   (this file)
```
