# PBK-UI-004 Sidecar Acceptance Packet

This document is the parallel acceptance-support packet for `PBK-UI-004`
("Authority-safe negative paths"). It does not change canonical truth. It
collects the current machine-truth anchors, the dependency map, and the
reviewer-facing acceptance checklist that `Codex` should use when the parent
task is ready to move from `in_progress` to `review`.

This packet is intentionally scoped to support material only:

- current task-state anchors come from the active dispatch workspace's
  `ai-status.json`
- implementation-shape evidence comes from the existing
  `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md`
- historical commit evidence comes from git history for
  `13104105d299eadd0b433596b2f173249dfbb5fc`
- route-policy context comes from `apps/partner-booking-web/README.md` and
  `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-004-SIDECAR-ACCEPTANCE`
- **Parent Task:** `PBK-UI-004`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Codex2`
- **Reviewer:** `Codex`
- **Mutates Canonical:** `false`
- **Objective:** Hand off an acceptance checklist and dependency map for the
  parent negative-path task without editing L1/L2 truth, runtime code, or the
  parent backlog item itself.

Guardrails for this packet:

- Only the artifact under `support/sidecars/PBK-UI-004/` is touched.
- Machine-truth updates must go through `scripts/ai-status.sh` or
  `python3 scripts/ai_status.py`, never by hand-editing `ai-status.json`,
  `current-work.md`, or `ai-activity-log.jsonl`.
- This packet does not re-open or replace the existing sidecar review packet.
  It complements it by describing what the parent owner and reviewer still
  need to check before the parent can be accepted again under the current
  machine truth.

## §2 Machine-Truth Anchors

### Parent task: `PBK-UI-004`

The active dispatch workspace currently records:

| Field        | Value |
| ------------ | ----- |
| Title        | `Authority-safe negative paths` |
| Phase        | `Wave 5` |
| Owner        | `Codex` |
| Reviewer     | `Codex2` |
| Status       | `in_progress` |
| Depends on   | `PBK-UI-003` |
| Artifact     | `apps/partner-booking-web/` |
| Acceptance   | `pnpm --filter @drts/partner-booking-web typecheck / build / lint`; `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)` |
| Last update  | `2026-05-18T01:19:50Z` |
| Next         | `Owner worker codex-20260518T010028Z-825b4ade is actively implementing PBK-UI-004; machine truth realigned after sidecar reassignment maintenance.` |

Acceptance implication: this parent task is not yet in `review` or
`review_approved` in the current control plane, so this packet is a
pre-handoff acceptance aid, not a post-closeout audit.

### This sidecar task: `PBK-UI-004-SIDECAR-ACCEPTANCE`

The active dispatch workspace currently records:

| Field               | Value |
| ------------------- | ----- |
| Owner               | `Codex2` |
| Reviewer            | `Codex` |
| Status              | `in_progress` |
| `task_class`        | `sidecar` |
| `helper_parent`     | `PBK-UI-004` |
| `helper_kind`       | `acceptance_packet` |
| `mutates_canonical` | `false` |
| Depends on          | `PBK-UI-003` |
| Artifact            | `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-ACCEPTANCE.md` |
| Last update         | `2026-05-18T01:22:44Z` |

### Important control-plane note

The clean `origin/dev` base used for this support-file branch still carries an
older snapshot where `PBK-UI-004` was `todo` and this sidecar task was not yet
present. That is a branch-base lag, not a reason to edit canonical truth from
this sidecar. For acceptance purposes, the authoritative state is the active
dispatch workspace machine truth that reassigned the parent owner to `Codex`
and this sidecar owner to `Codex2`.

## §3 Dependency Map

### Direct dependency: `PBK-UI-003`

The active dispatch workspace records `PBK-UI-003` as:

| Field          | Value |
| -------------- | ----- |
| Status         | `done` |
| Owner          | `Codex2` |
| Reviewer       | `Claude2` |
| Commit         | `4b8a356c441a9ae2b503453bb07033b57abdb303` |
| Commit subject | `PBK-UI-003: anchor owner closeout state` |
| Push           | `origin/codex2/pbk-ui-003` |
| Recorded at    | `2026-05-17T18:49:41Z` |

Dependency implication:

- `PBK-UI-004` can assume the seven-screen CTBC reference funnel is already
  accepted and anchored.
- The parent reviewer for `PBK-UI-004` does not need to re-argue the baseline
  funnel screens; review should focus on the five authority-safe negative
  paths and regression safety against that accepted baseline.

### Supporting acceptance evidence for the parent task

The repo already contains two useful anchors for the parent's expected shape:

1. `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md`
   - captures the intended implementation surface, route-state mapping, and
     reviewer spot-check list for the negative-path work
2. historical commit `13104105d299eadd0b433596b2f173249dfbb5fc`
   - subject:
     `feat(PBK-UI-004): preserve authority-safe partner negative paths`
   - diff stat: six files, `456 insertions(+), 24 deletions(-)`
   - trailer records verification:
     `pnpm --filter @drts/partner-booking-web typecheck; ... build; ... lint; pnpm --filter @drts/ui-web build-storybook`

These anchors are evidence of the intended acceptance target, but they do not
override the current machine truth that says the parent is still
`in_progress`. The owner must still hand off the current parent state to the
reviewer through the normal status flow.

### Downstream dependency pressure

`docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
keeps live cutover contingent on `PBK-UI-004` parity remaining intact:

- repo-local readiness gate item 2 requires the five authority-safe negative
  paths to stay intact
- `PBK-UI-005` depends directly on `PBK-UI-004`

That makes this parent acceptance materially important to the next cutover
policy slice even though this sidecar itself may only edit support material.

## §4 Parent Acceptance Checklist (`PBK-UI-004`)

These are the gates the parent owner (`Codex`) and assigned reviewer
(`Codex2`) should walk through when moving the parent toward acceptance.

### A. Machine-truth gate

- [ ] `ai-status.json` still records `PBK-UI-004` as owned by `Codex`,
      reviewed by `Codex2`, status `in_progress` or `review`, and dependent on
      `PBK-UI-003`.
- [ ] `ai-status.json` still records `PBK-UI-003` as `done` on commit
      `4b8a356c441a9ae2b503453bb07033b57abdb303`.
- [ ] Parent state transitions are made through `scripts/ai-status.sh`
      (`start` / `progress` / `handoff` / `approve` / `done`) rather than
      manual edits.

### B. Implementation-surface gate

- [ ] `apps/partner-booking-web/app/[tenantSlug]/[routeState]/page.tsx`
      exists and resolves known authority-safe states through shared route
      resolution instead of bespoke one-off logic.
- [ ] `apps/partner-booking-web/lib/route-state.ts` exports the strict route
      resolver and the lenient query-string fallback resolver.
- [ ] `apps/partner-booking-web/app/[tenantSlug]/page.tsx` still accepts the
      backward-compatible `?screen=` / `?scenario=` entry while the canonical
      negative paths remain direct routes.
- [ ] `packages/ui-web/src/partner-booking-funnel.tsx` still anchors exactly
      the five negative-path scenario ids:
      `eligible`, `ineligible`, `manual_review`, `inactive`,
      `eligibility-required`.
- [ ] The scenario-to-screen mapping remains:
      `eligible / ineligible / manual_review -> eligibility`,
      `inactive / eligibility-required -> book`.
- [ ] `apps/partner-booking-web/README.md` still documents the five direct
      authority-safe routes alongside the root query-string fallback.

The existing review packet under
`support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md` already breaks
these checks down in more detail. This acceptance packet intentionally keeps
them at the gate level.

### C. Verification gate

- [ ] `pnpm --filter @drts/partner-booking-web typecheck`
- [ ] `pnpm --filter @drts/partner-booking-web build`
- [ ] `pnpm --filter @drts/partner-booking-web lint`
- [ ] Storybook parity against existing `PB_*` artboards remains acceptable;
      the negative paths still ride on the established `eligibility` / `book`
      artboards rather than inventing a new screen contract.

When the parent owner hands off the task for review, the handoff note should
include the concrete verification result string, not a generic "tests pass"
claim.

### D. Scope guardrail gate

- [ ] No canonical-truth files are edited as part of this parent task.
- [ ] No backend-authority, auth, or production cutover claim is introduced
      under `apps/partner-booking-web`; the work remains a UI parity slice.
- [ ] No new Storybook screen contract is invented for negative paths.
- [ ] `PBK-UI-005` remains the separate cutover-policy / coexistence decision
      task.

### E. Handoff gate

- [ ] Parent owner uses
      `AI_NAME=Codex scripts/ai-status.sh handoff PBK-UI-004 Codex2 "<summary>"`
      once implementation and verification are complete.
- [ ] Reviewer either approves with an acceptance summary or reopens with a
      precise failure reason.
- [ ] Owner only marks the parent `done` after the task-scoped commit, normal
      non-force push, and `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` /
      `PUSH_BRANCH` evidence are all available in machine truth.

## §5 Reviewer Handoff Notes

1. This packet is for acceptance routing, not for re-defining the parent.
   Canonical parent scope stays whatever `PBK-UI-004` and its runtime files
   currently say.
2. If the parent owner cites the historical `13104105...` implementation shape,
   treat that as supporting evidence only. Approval must still be based on the
   current parent branch state and current machine truth.
3. If the machine-truth owner/reviewer slots move again before parent handoff,
   refresh §2 before approving this sidecar or using it as the parent-review
   checklist.
4. If the current implementation surface drifts from the existing review packet,
   update the review packet or reopen the parent task; do not silently approve
   against stale evidence.
5. This sidecar's own acceptance is narrower: the packet is complete once this
   file exists, machine-truth state was updated through the status script, and
   the work is handed off to reviewer `Codex`.
