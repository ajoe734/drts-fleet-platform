# PBK-UI-005 Sidecar Acceptance Packet

This document is the parallel acceptance-support packet for `PBK-UI-005`
("新舊 partner mode 共存政策"). It does not change canonical truth. It
consolidates the repo facts that the assigned sidecar reviewer (`Codex2`) and
the parent-task reviewer (`Codex`) need so that the parent decision-doc task
can be accepted against `ai-status.json`, `docs/01-decisions/`, and the Wave 5
UI breakdown.

Anchors used here come from:

- `ai-status.json`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` §`PBK-UI-005`
- `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`
- `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- `apps/partner-booking-web/README.md`
- `apps/tenant-console-web/app/partner/`
- Local git history at commit `781f600` (`docs(PBK-UI-005): record partner booking cutover topology`)

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-005-SIDECAR-ACCEPTANCE`
- **Parent Task:** `PBK-UI-005`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Claude`
- **Reviewer:** `Codex2`
- **Mutates Canonical:** `false`
- **Objective:** Hand off a reviewer-facing acceptance checklist and dependency
  map for the parent decision-doc task without editing L1/L2 truth, runtime
  code, or the parent backlog item itself. The parent is a decision-doc task,
  so acceptance here is "decision doc accepted per existing `SD-DP-*` flow,"
  not a build/test gate on app code.

Guardrails for this packet:

- Only the artifact under `support/sidecars/PBK-UI-005/` is touched by this
  task.
- Machine-truth state transitions go through `scripts/ai-status.sh`, never by
  hand-editing `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`.
- The packet does not re-decide parent scope; it cites what is already recorded
  in `ai-status.json`, the planning doc, and `SD-DP-20260512-006`.
- The packet does not attempt to authorize live production cutover. The parent
  decision doc explicitly defers that to a later cutover task with its own
  gates.

## §2 Machine-Truth Anchors

### Parent task: `PBK-UI-005`

| Field        | Value                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Title        | `新舊 partner mode 共存政策 (decision doc)`                                                                            |
| Phase        | `Wave 5`                                                                                                               |
| Owner        | `Codex2` (availability-first reassignment recorded in `next` field)                                                    |
| Reviewer     | `Codex`                                                                                                                |
| Status       | `in_progress`                                                                                                          |
| Depends on   | `PBK-UI-004`                                                                                                           |
| Planning ref | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` §`PBK-UI-005`                                                  |
| Acceptance   | `pnpm --filter @drts/partner-booking-web typecheck / build / lint`; `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)` |
| Review file  | `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`                                         |
| Last update  | `2026-05-13T00:35:25Z`                                                                                                 |

The parent record already carries one reviewer note in `review_notes_zh[0]`:

> 審查通過|decision doc 已明確 supersede 舊 partner landing-zone 條款並保留
> constrained-capability / backend-authority 邊界|README 已連回新 cutover
> decision，且內容與 product spec、operational blueprint、rollout rollback
> gate 一致

That note is consistent with what the decision doc, the supersession block,
and the partner-booking-web README at commit `781f600` say. The parent has
not yet recorded a `done` state, so this acceptance packet describes the
checklist the parent owner / reviewer should walk through to drive the
parent from `in_progress` → `review` → `review_approved` → `done` against
the existing `SD-DP-*` decision-doc flow.

Planning-doc scope for `PBK-UI-005` is narrow:

- The deliverable is a **decision doc**, not partner-app runtime code.
- The decision doc must state when to switch, whether to retire the legacy
  path, and how long the transition lasts.
- Supervisor + governance reviewer co-sign per the existing `SD-DP-*` flow.
- The artifact slot in the planning doc was `docs/01-decisions/SD-DP-20260???-NNN-partner-booking-app-cutover.md`;
  the actual filename allocated is
  `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`.

### Sidecar task: `PBK-UI-005-SIDECAR-ACCEPTANCE`

| Field               | Value                                                          |
| ------------------- | -------------------------------------------------------------- |
| Owner               | `Claude`                                                       |
| Reviewer            | `Codex2`                                                       |
| Status              | `in_progress`                                                  |
| `task_class`        | `sidecar`                                                      |
| `helper_kind`       | `acceptance_packet`                                            |
| `mutates_canonical` | `false`                                                        |
| Depends on          | `PBK-UI-004`                                                   |
| Artifact            | `support/sidecars/PBK-UI-005/PBK-UI-005-SIDECAR-ACCEPTANCE.md` |
| `auto_created_by`   | `supervisor-underutilization` (parallel-support slot)          |

### Parallel sidecar: `PBK-UI-005-SIDECAR-REVIEW`

A second sidecar (`PBK-UI-005-SIDECAR-REVIEW`, owner `Gemini2`) covers the
review-packet half. It is currently `review`. This acceptance packet is
intentionally narrower than that review packet: this one anchors the parent's
acceptance gate, the other one carries the reviewer-facing evidence for the
decision doc itself once the parent transitions to `done`. Approving this
packet should not require approving or duplicating the review-packet sidecar.

## §3 Dependency Map

### Direct dependency: `PBK-UI-004` — Authority-safe negative paths

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Status         | `done`                                                             |
| Owner          | `Codex2`                                                           |
| Reviewer       | `Codex`                                                            |
| Depends on     | `PBK-UI-003`                                                       |
| Commit         | `13104105d299eadd0b433596b2f173249dfbb5fc`                         |
| Commit subject | `feat(PBK-UI-004): preserve authority-safe partner negative paths` |
| Push           | `origin/feat/claude2-ui-redesign-foundation`                       |
| Recorded at    | `2026-05-12T21:11:06Z`                                             |

`PBK-UI-004` is the concrete prerequisite for `PBK-UI-005`, not a vague
upstream:

- `SD-DP-20260512-006` §`Cutover Gates / 1. Repo-local readiness gate` makes
  the decision doc explicitly contingent on `PBK-UI-003` and `PBK-UI-004`
  parity remaining intact in `apps/partner-booking-web` before any
  live-routing work is planned.
- `apps/tenant-console-web/app/partner/` is what the decision doc reclassifies
  as a "legacy compatibility and behavior-reference surface". Without the
  authority-safe negative-path coverage delivered in `PBK-UI-004`, the
  decision doc could not claim that the new app preserves the existing
  `eligible / ineligible / manual_review / inactive / eligibility-required`
  parity.

### Transitive dependencies recorded by the decision doc

`SD-DP-20260512-006` reaches outside the `PBK-UI-*` slice in three controlled
directions. The acceptance packet records them so the reviewer can verify the
decision doc has not silently expanded scope past what those documents already
say:

- **Constrained-capability and backend-authority boundaries** —
  `SD-DP-20260508-004-tenant-console-productization-topology.md` and
  `SD-DP-20260509-005-full-system-ui-surface-topology.md`. The new decision
  supersedes only their _partner-booking landing-zone_ clauses and leaves
  constrained-capability + backend authority intact.
- **Product-spec partner-mode envelope** —
  `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
  §`7.5.2 Partner entry setup workflow`, §`9.4.2 Partner Booking Mode`, and
  §`9.7.1 Tenant login and workspace bootstrap`. These pin partner mode to
  bootstrap / eligibility / booking creation / minimal tracking and hide
  tenant-admin modules.
- **Operational blueprint and rollout/rollback gates** —
  `docs/02-architecture/phase1-role-scenario-and-negative-flow-matrix-20260430.md`,
  `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`,
  `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`, and
  `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`. These keep
  `tenant-commute-hub` partner mode as the current live owner and require a
  named `cutoverOwner` / `rollbackOwner` plus `rollbackPrepared` state before
  any production promotion.

### Repo state captured by the decision doc

Commit `781f60010f1646b30a3064ac4b1aabaa9690602c` records only the changes
needed to land the decision doc:

| Path                                                                           | Change in commit         | Role                                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md` | new (+162 lines)         | The accepted decision: topology, transition length, deprecation strategy, cutover gates.                                       |
| `apps/partner-booking-web/README.md`                                           | modified (+1 / −1 net 0) | Links the README's cutover-policy reference from "`PBK-UI-005` decision doc" to the actual `SD-DP-20260512-006-*.md` filename. |

The commit carries the trailer `LLM-Agent: Codex / Task-ID: PBK-UI-005 /
Reviewer: Codex2 / Verification: pnpm --filter @drts/partner-booking-web
typecheck; … lint; … build; pnpm --filter @drts/ui-web build-storybook`, so
even though the parent is decision-doc-only, the verification field already
records that the partner-booking-web tooling was exercised against the same
working tree.

## §4 Parent-Task Acceptance Checklist (`PBK-UI-005`)

These are the reviewer-facing gates for the parent task, derived from
`ai-status.json`, the Wave 5 UI breakdown, and the existing `SD-DP-*` flow.
They are intentionally specific so the parent owner can use them without
reinterpreting scope.

### A. Decision-doc scope gates

- [x] Deliver a decision doc under `docs/01-decisions/` with the standard
      `SD-DP-YYYYMMDD-NNN-*.md` filename. Actual filename:
      `SD-DP-20260512-006-partner-booking-app-cutover-topology.md`.
- [x] State **when to switch**: the decision doc names two windows — repo-local
      coexistence starting `2026-05-12`, and a per-entry live rollback retention
      of at least `14` calendar days after each entry's production promotion.
- [x] State **whether to retire the legacy path**: the doc keeps
      `apps/tenant-console-web/app/partner/*` as a legacy compatibility /
      behavior-reference surface, restricted to production-safety, parity, and
      rollback-support changes, with removal deferred to a dedicated cleanup
      task after the last migrated partner entry clears rollback retention.
- [x] State **transition length**: see Repo-local coexistence + per-entry
      14-day rollback retention.
- [x] Record explicit supersession of partner-booking landing-zone clauses in
      `SD-DP-20260508-004-*` and `SD-DP-20260509-005-*`, while preserving the
      constrained-capability rule, the no-tenant-admin-navigation rule, and the
      backend-authority-outside-shell rule.
- [x] Preserve `tenant-commute-hub` partner mode as the current live production
      owner and explicitly defer its retirement to a later upstream action.
- [x] Defer live production cutover to a later cutover task with named
      `cutoverOwner` / `rollbackOwner` and `rollbackPrepared` state.

### B. Acceptance gates declared in `ai-status.json`

The parent record copies the generic Wave 5 acceptance string
`pnpm --filter @drts/partner-booking-web typecheck / build / lint` and the
Storybook line. Because `PBK-UI-005` is decision-doc-only, the parent owner
should treat these as **regression-safety gates** (the decision doc must not
break the existing partner-booking-web surface), not as net-new build outputs
on `PBK-UI-005`'s diff:

- [x] `pnpm --filter @drts/partner-booking-web typecheck`
- [x] `pnpm --filter @drts/partner-booking-web build`
- [x] `pnpm --filter @drts/partner-booking-web lint`
- [x] Storybook artboard parity against `PB_*` artboards (`PBK-UI-003 起`)
      remains green; nothing in the decision-doc commit edits Storybook
      sources.

Commit `781f600`'s trailer records the verification command set above as
already executed. The reviewer should re-confirm these commands still pass on
the current branch state before approving the parent's `review` →
`review_approved` transition.

### C. Decision-doc co-sign gates

- [ ] **Supervisor sign-off** on the decision doc. The decision doc lists
      Owner `Codex` / Reviewer `Codex2`; the parent's `review_notes_zh[0]`
      already records governance approval text. The supervisor should
      re-confirm the supersession block is still narrow and that the
      coexistence policy table has not drifted from product spec / blueprint /
      rollout gate language.
- [ ] **Governance reviewer sign-off** — performed by parent reviewer
      `Codex`. Approval must include the language that the decision doc
      supersedes only the partner-booking landing-zone clauses in
      `SD-DP-20260508-004-*` / `SD-DP-20260509-005-*` and preserves
      constrained-capability + backend-authority boundaries.
- [ ] Parent transitions through `scripts/ai-status.sh`:
      `start` → `progress` (if needed) → `handoff Codex` → `approve` →
      (owner) `done` with `COMMIT_HASH=781f600...` /
      `COMMIT_SUBJECT="docs(PBK-UI-005): record partner booking cutover topology"` /
      `PUSH_REMOTE=origin` / `PUSH_BRANCH=feat/claude2-ui-redesign-foundation`.

### D. Guardrails

- [x] No canonical truth files outside `docs/01-decisions/` and the README
      back-link are edited as part of the decision-doc commit (`781f600`
      touches only two files; both are documentation).
- [x] No partner-booking-web runtime or `apps/tenant-console-web/app/partner/`
      runtime changes are introduced by the decision doc.
- [x] No claim of live production cutover is made by `PBK-UI-005` alone —
      that is explicitly deferred to a later cutover task with its own gates.
- [ ] The reviewer rejects any reading of `PBK-UI-005` that: - silently retires `tenant-commute-hub` partner mode from repo-local code
      changes alone, or - reuses the current Wave 5 `tenantSlug` route as a production cutover
      contract instead of the documented `entrySlug` / host-resolved entry,
      or - removes `apps/tenant-console-web/app/partner/*` before the last
      actively migrated partner entry clears its 14-day rollback retention.

## §5 Packet Completeness Check

These are the acceptance points for this sidecar artifact itself.

- [x] The packet is anchored to `ai-status.json` for both the sidecar task and
      the parent task `PBK-UI-005`.
- [x] The packet names the actual upstream dependency `PBK-UI-004` and records
      its `done`-state commit `13104105d299eadd0b433596b2f173249dfbb5fc` pushed
      to `origin/feat/claude2-ui-redesign-foundation` at
      `2026-05-12T21:11:06Z`.
- [x] The dependency map references the actual decision-doc paths
      (`SD-DP-20260512-006-*.md`, `SD-DP-20260508-004-*.md`,
      `SD-DP-20260509-005-*.md`) plus the product spec, operational blueprint,
      and rollout-gate runbooks cited inside the decision doc.
- [x] The packet ties the parent's `ai-status.json` acceptance line to the
      Wave 5 partner-booking-web regression-safety gates, since `PBK-UI-005`
      is a decision-doc-only task and does not produce net-new app artifacts.
- [x] The packet records the exact commit (`781f600`) that lands the decision
      doc and the README back-link, and notes its verification trailer.
- [x] The only support artifact content written for this task is this file
      under `support/sidecars/PBK-UI-005/PBK-UI-005-SIDECAR-ACCEPTANCE.md`.
- [x] The packet does not duplicate or pre-empt the parallel
      `PBK-UI-005-SIDECAR-REVIEW` packet owned by `Gemini2`.

## §6 Reviewer Handoff Notes (for `Codex2`)

1. Reconfirm `ai-status.json` still shows `PBK-UI-005` with reviewer `Codex`
   and dependency `PBK-UI-004`. If the parent record changes (e.g. moves to
   `review` / `review_approved` / `done`), refresh §2, §3, and §4 before
   approving this packet.
2. Reconfirm `PBK-UI-004` is still `done` on commit
   `13104105d299eadd0b433596b2f173249dfbb5fc` pushed to
   `origin/feat/claude2-ui-redesign-foundation`, because this packet anchors
   the parent's decision doc to that closeout state.
3. Verify `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
   at the current branch state still:
   - reclassifies `apps/tenant-console-web/app/partner/*` as legacy
     compatibility / behavior-reference,
   - keeps `tenant-commute-hub` partner mode as current live owner,
   - declares the partner-entry granularity for migration,
   - defers production cutover and `tenant-commute-hub` retirement to later
     tasks, and
   - supersedes only the partner-booking landing-zone clauses of
     `SD-DP-20260508-004-*` / `SD-DP-20260509-005-*`.
4. Treat this as a sidecar-only support packet. It must not be used to
   silently expand `PBK-UI-005` into production cutover, route-switching, or
   tenant-commute-hub retirement work. Those belong to later cutover tasks.
5. Approval should verify that the only task-scoped content edit for this
   sidecar is `support/sidecars/PBK-UI-005/PBK-UI-005-SIDECAR-ACCEPTANCE.md`,
   plus machine-truth state transitions recorded through
   `scripts/ai-status.sh`.
