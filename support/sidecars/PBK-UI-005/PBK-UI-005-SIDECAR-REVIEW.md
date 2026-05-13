# PBK-UI-005 Sidecar Review Packet

This document is the parallel review-support packet for `PBK-UI-005` ("new vs
legacy partner mode coexistence policy"). It does not change canonical truth.
It consolidates the repo facts and closeout evidence that the assigned sidecar
reviewer (`Codex`) needs in order to review the parent decision-doc task and
its current machine-truth state.

This refreshed packet supersedes the placeholder-only draft handed off on
`2026-05-13`.

Anchors used here:

- `ai-status.json`
- `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
- `apps/partner-booking-web/README.md`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` §`PBK-UI-005`
- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`
- `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- Commit `781f60010f1646b30a3064ac4b1aabaa9690602c` on
  `origin/feat/claude2-ui-redesign-foundation`

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-005-SIDECAR-REVIEW`
- **Parent Task:** `PBK-UI-005`
- **Helper Kind:** `review_packet`
- **Owner:** `Gemini2`
- **Reviewer:** `Codex`
- **Mutates Canonical:** `false`
- **Objective:** Hand off a reviewer-facing evidence summary for the parent
  coexistence-policy decision doc without editing L1/L2 product truth,
  runtime implementation, or the parent backlog item itself.

Guardrails for this packet:

- Only the artifact under `support/sidecars/PBK-UI-005/` is touched.
- Machine-truth state transitions go through `scripts/ai-status.sh`, never by
  hand-editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`.
- The packet cites the parent task's actual decision doc, review approval, and
  pushed closeout-ready commit; it does not invent new product policy.

## §2 Machine-Truth Anchors

### Parent task: `PBK-UI-005`

| Field                      | Value                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Title                      | `新舊 partner mode 共存政策 (decision doc)`                                                           |
| Phase                      | `Wave 5`                                                                                              |
| Owner                      | `Codex2`                                                                                              |
| Reviewer                   | `Codex`                                                                                               |
| Current status             | `in_progress`                                                                                         |
| Depends on                 | `PBK-UI-004` (`done` at commit `13104105d299eadd0b433596b2f173249dfbb5fc`)                            |
| Planning ref               | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`                                               |
| `last_update`              | `2026-05-13T00:35:25Z`                                                                                |
| Current `next`             | `Availability-first reassignment: Codex2 claimed PBK-UI-005 while Codex was unavailable or occupied.` |
| Historical review approval | `2026-05-12T21:21:15Z` by `Codex` reviewer lane                                                       |
| `review_notes_zh[0]`       | `審查通過                                                                                             | decision doc 已明確 supersede 舊 partner landing-zone 條款並保留 constrained-capability / backend-authority 邊界 | README 已連回新 cutover decision，且內容與 product spec、operational blueprint、rollout rollback gate 一致` |
| `review_file`              | `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`                        |

Important nuance:

- The parent already passed review on `2026-05-12`, but machine truth no longer
  shows `review_approved` because an availability-first reassignment moved the
  owner to `Codex2` and set the task back to `in_progress` on `2026-05-13`.
- Despite that transient state, the task-scoped closeout commit already exists:
  `781f60010f1646b30a3064ac4b1aabaa9690602c`
  (`docs(PBK-UI-005): record partner booking cutover topology`) and is already
  reachable from `origin/feat/claude2-ui-redesign-foundation`.
- A machine-truth note was added on `2026-05-13` telling the current owner
  `Codex2` that this commit/push is ready to be used for formal `done`
  closeout.

### This sidecar task: `PBK-UI-005-SIDECAR-REVIEW`

| Field               | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Owner               | `Gemini2`                                                  |
| Reviewer            | `Codex`                                                    |
| Status              | `review`                                                   |
| `task_class`        | `sidecar`                                                  |
| `helper_kind`       | `review_packet`                                            |
| `mutates_canonical` | `false`                                                    |
| Depends on          | `PBK-UI-004`                                               |
| Artifact            | `support/sidecars/PBK-UI-005/PBK-UI-005-SIDECAR-REVIEW.md` |

## §3 Delivered Surface

The parent decision surface is intentionally small and docs-heavy. The pushed
task-scoped commit `781f60010f1646b30a3064ac4b1aabaa9690602c` contains exactly
two paths:

| Path                                                                           | Change in commit | Role                                                                                                                                      |
| ------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md` | new file         | Canonical decision doc defining repo-local coexistence, live cutover gates, rollback retention, deprecation rules, and supersession scope |
| `apps/partner-booking-web/README.md`                                           | small docs edit  | Replaces the generic `PBK-UI-005` mention with a direct link to the accepted decision doc                                                 |

No runtime source, route implementation, API client, Storybook story, or
backend contract file is changed by this commit.

## §4 Decision Summary

The decision doc answers the planning brief directly:

| Topic                       | Recorded policy                                                                                                                                                                                                                      | Anchor                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Repo-local landing zone     | As of `2026-05-12`, `apps/partner-booking-web` becomes the only repo-local landing zone for new partner-booking UI work                                                                                                              | `SD-DP-20260512-006` `## Decision`                                     |
| Legacy tenant-console route | `apps/tenant-console-web/app/partner/*` is reclassified as a legacy compatibility and behavior-reference surface                                                                                                                     | `SD-DP-20260512-006` `## Decision`, `## Coexistence Policy`            |
| Live production owner       | External `tenant-commute-hub` partner mode remains the live production owner until a later cutover task records rollout gates and rollback evidence                                                                                  | `SD-DP-20260512-006` `## Decision`, `## Cutover Gates`                 |
| Migration unit              | Live migration is per partner entry, not per tenant                                                                                                                                                                                  | `SD-DP-20260512-006` `## Decision`                                     |
| Repo-local readiness gate   | `PBK-UI-003` seven-screen parity, `PBK-UI-004` five negative paths, partner-booking-web build/lint/typecheck, and Storybook parity must stay true before live-routing work                                                           | `SD-DP-20260512-006` `## Cutover Gates`                                |
| Pilot/live-readiness gate   | Real auth/bootstrap, backend-authority wiring, entry-based ingress identity, finalized support/branding metadata, happy-path plus five negative-path evidence, and named cutover/rollback owners are required before any live switch | `SD-DP-20260512-006` `## Cutover Gates`                                |
| Transition length           | Repo-local coexistence starts on `2026-05-12`; per-entry rollback retention lasts at least `14` calendar days after that entry is promoted                                                                                           | `SD-DP-20260512-006` `## Transition Length`                            |
| Deprecation rule            | The legacy repo-local partner route may be removed only after the last migrated entry clears the `14`-day rollback-retention window and a dedicated cleanup task is opened                                                           | `SD-DP-20260512-006` `## Transition Length`, `## Deprecation Strategy` |
| Supersession                | The decision narrowly supersedes partner-booking landing-zone clauses in `SD-DP-20260508-004` and `SD-DP-20260509-005` while preserving constrained-capability and backend-authority boundaries                                      | `SD-DP-20260512-006` `## Supersession`                                 |

## §5 Evidence Mapping

### A. Planning brief to decision doc

The planning ref for `PBK-UI-005` asks for a decision doc that answers:

- when cutover happens
- whether the old route is retired
- how long the transition lasts

The decision doc addresses each directly:

- `## Cutover Gates` states that `PBK-UI-005` does **not** authorize live
  promotion by itself and requires a separate future cutover task or runbook.
- `## Deprecation Strategy` freezes the legacy tenant-console route to
  compatibility/safety/rollback support only and postpones removal to a later
  cleanup task.
- `## Transition Length` defines repo-local coexistence starting on
  `2026-05-12` and a per-entry `14`-day rollback-retention window.

### B. Review approval to tree state

The parent review note stored in `ai-status.json` says:

- the decision doc explicitly supersedes the older partner landing-zone clauses
- constrained-capability and backend-authority boundaries remain intact
- `apps/partner-booking-web/README.md` links back to the new cutover decision
- the content aligns with product spec, operational blueprint, and rollout /
  rollback gates

Those claims line up with the tree:

- the new doc has an explicit `## Supersession` section naming
  `SD-DP-20260508-004` and `SD-DP-20260509-005`
- the same section explicitly preserves the constrained-capability rule and
  backend-authority boundary
- the README now links directly to
  `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
- the decision's cutover and rollback language stays at policy/runbook level
  and does not claim live traffic is already switched

### C. Closeout-ready commit evidence

`git show --stat --summary 781f60010f1646b30a3064ac4b1aabaa9690602c` resolves to:

- subject: `docs(PBK-UI-005): record partner booking cutover topology`
- files: the new decision doc plus the README link update only
- trailers:
  - `LLM-Agent: Codex`
  - `Task-ID: PBK-UI-005`
  - `Reviewer: Codex2`
  - `Verification: pnpm --filter @drts/partner-booking-web typecheck; ... lint; ... build; pnpm --filter @drts/ui-web build-storybook`

The commit is already reachable from
`origin/feat/claude2-ui-redesign-foundation`, so the remaining gap is
control-plane closeout by the reassigned owner, not missing git evidence.

## §6 Scope Guardrails

These are the important "did not happen" checks for this parent task:

- No live production cutover was authorized. The doc explicitly says
  `PBK-UI-005` does not promote traffic by itself.
- No backend authority was moved into the UI shell. The doc reiterates that the
  new app, the legacy route, and the external surface may not fork eligibility,
  booking, audit, billing, webhook, or partner-entry truth away from backend
  authority.
- No runtime implementation surface changed beyond the README link. The commit
  is a decision-doc change, not a UI behavior change.
- No tenant-admin navigation expansion was reintroduced into partner booking.
  The supersession is narrow and keeps the constrained-capability boundary.

## §7 Reviewer Closeout Checklist (for `Codex`)

These are the sidecar-review gates. They are audit checks, not new feature
work.

### A. Machine truth still matches this packet

- [ ] `ai-status.json` still records `PBK-UI-005` with owner `Codex2`,
      reviewer `Codex`, dependency `PBK-UI-004`, and the historical
      review-passed note quoted in §2.
- [ ] `ai-status.json` still records `PBK-UI-004` as `done` on commit
      `13104105d299eadd0b433596b2f173249dfbb5fc`.
- [ ] If `PBK-UI-005` has advanced to `done` by the time of review, the new
      `commit_*` / `push_*` fields should match commit
      `781f60010f1646b30a3064ac4b1aabaa9690602c` on
      `origin/feat/claude2-ui-redesign-foundation`. If not, refresh §2 before
      approving.

### B. Repo state matches the decision surface

- [ ] `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
      exists and contains the sections `Decision`, `Coexistence Policy`,
      `Cutover Gates`, `Transition Length`, `Deprecation Strategy`,
      `Supersession`, `Rationale`, and `References`.
- [ ] `apps/partner-booking-web/README.md` links directly to the new decision
      doc instead of a generic `PBK-UI-005` placeholder reference.
- [ ] `git log --oneline -1 781f60010f1646b30a3064ac4b1aabaa9690602c` resolves
      to `docs(PBK-UI-005): record partner booking cutover topology`.
- [ ] `git branch -a --contains 781f60010f1646b30a3064ac4b1aabaa9690602c`
      lists `remotes/origin/feat/claude2-ui-redesign-foundation`.

### C. Scope guardrails still hold

- [ ] No runtime file other than the README was changed by commit `781f600`.
- [ ] The decision doc still says live production cutover needs a later task or
      runbook with supervisor and governance sign-off.
- [ ] The doc still preserves constrained-capability and backend-authority
      boundaries while superseding only the older landing-zone clauses.

### D. Packet hygiene

- [ ] The only task-scoped content edit for `PBK-UI-005-SIDECAR-REVIEW` is this
      file under `support/sidecars/PBK-UI-005/`.
- [ ] Machine-truth state changes for this sidecar were made through
      `scripts/ai-status.sh`.

## §8 Reviewer Handoff Notes (for `Codex`)

1. The parent decision content itself is review-passed. The unusual part is the
   control-plane state: after `Codex` review approval on `2026-05-12`, the
   task was reassigned to `Codex2` on `2026-05-13` before `done` was recorded.
2. The commit/push evidence already exists and is on the branch. The current
   owner only needs to record that evidence through the normal `done` flow.
3. Approval of this sidecar means the packet now accurately reflects both the
   decision content and the transient machine-truth nuance. It does **not**
   mean the parent task has already been formally closed out.
4. This is a sidecar/support slice, so its own eventual closeout can use
   `NO_COMMIT_REQUIRED=1`; no runtime or canonical implementation commit is
   owed by this sidecar task.
