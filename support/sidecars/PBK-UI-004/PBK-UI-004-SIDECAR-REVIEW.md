# PBK-UI-004 Sidecar Review Packet

This document refreshes the `PBK-UI-004` sidecar review packet against the
current machine truth in this worktree. It does not change canonical truth.
Its job is narrower: give the assigned reviewer (`Codex`) a clean evidence
summary, explain the live handoff state, and remove stale claims that the
parent task is already closed out on this branch.

The key correction is simple:

- `ai-status.json` does **not** currently show `PBK-UI-004` as `done`.
- `ai-status.json` currently shows `PBK-UI-004` as `todo`, owned by `Codex2`,
  reviewed by `Codex`, and still gated on `PBK-UI-003`.
- A historical commit `13104105d299eadd0b433596b2f173249dfbb5fc` exists in the
  repo object database and matches the old packet's implementation story, but
  it is **not** an ancestor of this task branch `HEAD` and it is **not** the
  live control-plane claim for `PBK-UI-004` in the current `ai-status.json`.

Anchors used here:

- `ai-status.json`
- `apps/partner-booking-web/README.md`
- `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
- `git show --stat --summary 13104105d299eadd0b433596b2f173249dfbb5fc`
- `git branch -a --contains 13104105d299eadd0b433596b2f173249dfbb5fc`
- `git cat-file -e HEAD:<path>` path-presence checks

## §1 Scope & Boundary

- **Task ID:** `PBK-UI-004-SIDECAR-REVIEW`
- **Parent Task:** `PBK-UI-004`
- **Helper Kind:** `review_packet`
- **Dispatch owner / reviewer:** `Codex2` -> `Codex`
- **Mutates Canonical:** `false`
- **Objective:** provide a reviewer-facing packet for `PBK-UI-004` without
  editing runtime code, L1/L2 product truth, or the parent task's canonical
  implementation surface.

Guardrails for this packet:

- Only the artifact under `support/sidecars/PBK-UI-004/` is touched.
- Any machine-truth transition must go through `scripts/ai-status.sh`, not
  manual edits to `ai-status.json`, `current-work.md`, or the log files.
- This packet does not silently convert historical off-branch evidence into
  current-branch acceptance.

## §2 Machine-Truth Anchors

### Parent task: `PBK-UI-004`

| Field | Value |
| --- | --- |
| Title | `Authority-safe negative paths` |
| Phase | `Wave 5` |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Status | `todo` |
| Depends on | `PBK-UI-003` |
| Planning ref | `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` |
| Acceptance | `pnpm --filter @drts/partner-booking-web typecheck / build / lint`; `Storybook 對照對應 PB_* artboard (PBK-UI-003 起)` |
| `last_update` | `2026-05-12T18:55:03Z` |
| Current `next` | `Chairman reassigned reviewer from Claude to Codex: Claude lane is capacity-paused. Preemptively move the reviewer slot to healthy Codex so the task will not stall on reviewer assignment once its dependency clears.` |
| Pending handoff | `Claude` -> `Codex` at `2026-05-12T18:55:03Z` |

Implications:

- The parent is **not** in `review`.
- The parent is **not** in `review_approved`.
- The parent is **not** in `done`.
- This packet therefore supports future review and present-day reviewer
  orientation; it is not proof that the parent already passed acceptance on
  this branch.

### Direct dependency: `PBK-UI-003`

| Field | Value |
| --- | --- |
| Title | `CTBC reference funnel — 7 screens` |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Status | `in_progress` |
| Depends on | `PBK-UI-002` |
| `last_update` | `2026-05-12T20:08:40Z` |
| Current `next` | `Continuing CTBC 7-screen partner booking funnel implementation and verification in apps/partner-booking-web.` |

This dependency state matters: `PBK-UI-004` is not reviewable as a completed
parent slice while its only prerequisite is still `in_progress`.

### This sidecar task: `PBK-UI-004-SIDECAR-REVIEW`

The dispatch brief for this slice says:

| Field | Value | Source |
| --- | --- | --- |
| Owner | `Codex2` | dispatch brief |
| Reviewer | `Codex` | dispatch brief |
| Status | `review` | dispatch brief |
| `task_class` | `sidecar` | expected sidecar shape |
| `helper_kind` | `review_packet` | dispatch brief |
| `mutates_canonical` | `false` | dispatch brief |
| Artifact | `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md` | repo |

Control-plane gap to note explicitly:

- `PBK-UI-004-SIDECAR-REVIEW` is **not present** as a task row in the current
  `ai-status.json`.
- That means the packet can be refreshed now, but a formal sidecar
  `approve`/`done` transition cannot be recorded until the task is materialized
  in machine truth by the normal supervisor flow.

## §3 Reviewer Handoff Trail For The Parent

The parent reviewer slot moved several times while the task stayed pre-review.
The live endpoint is `Codex`, not `Claude2` and not `Claude`.

| Timestamp | Handoff | Status | Meaning |
| --- | --- | --- | --- |
| `2026-05-10T12:21:05Z` | `Gemini` -> `Claude2` | done | owner moved off a paused lane |
| `2026-05-10T12:47:43Z` | `Claude2` -> `Codex2` | done | owner aligned with the partner-booking chain |
| `2026-05-11T02:52:55Z` | `Codex` -> `Claude2` | done | reviewer temporarily moved off the degraded Codex lane |
| `2026-05-12T15:53:44Z` | `Claude2` -> `Claude` | done | reviewer moved off the capacity-paused Claude2 lane |
| `2026-05-12T18:55:03Z` | `Claude` -> `Codex` | pending | current live reviewer handoff |

This packet intentionally updates all reviewer-facing notes to point at
`Codex` as the active reviewer destination.

## §4 Current Branch Baseline

Current branch / `HEAD` context:

- branch: `codex/pbk-ui-004-sidecar-review`
- `HEAD`: `73038d6` (`OPS-DISPATCH-METRICS: skip active queue events in occupancy`)

What the current worktree actually contains for partner booking:

| Path | Present at `HEAD`? | Notes |
| --- | --- | --- |
| `apps/partner-booking-web/README.md` | yes | documents the future direct-route rule for `PBK-UI-004` |
| `apps/partner-booking-web/AGENTS.md` | yes | repo-local guidance only |
| `apps/partner-booking-web/app/[tenantSlug]/[routeState]/page.tsx` | no | missing at current `HEAD` |
| `apps/partner-booking-web/app/[tenantSlug]/page.tsx` | no | missing at current `HEAD` |
| `apps/partner-booking-web/lib/route-state.ts` | no | missing at current `HEAD` |
| `packages/ui-web/src/partner-booking-funnel.tsx` | no | missing at current `HEAD` |

Additional baseline observations:

- `apps/partner-booking-web/README.md` already states that the canonical
  authority-safe negative paths will be direct routes:
  `/[tenantSlug]/eligible`, `/[tenantSlug]/ineligible`,
  `/[tenantSlug]/manual_review`, `/[tenantSlug]/inactive`, and
  `/[tenantSlug]/eligibility-required`.
- That README text is a useful intent anchor, but it is not implementation
  evidence by itself.
- The planning-ref path
  `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` is referenced by
  `ai-status.json` and by the accepted `PBK-UI-005` decision doc, but that file
  is not present in this worktree. For this refresh, the packet therefore
  relies on visible repo anchors plus the machine-truth task fields.

## §5 Historical Off-Branch Evidence

The repo still contains the historical commit
`13104105d299eadd0b433596b2f173249dfbb5fc`
(`feat(PBK-UI-004): preserve authority-safe partner negative paths`).

What `git show --stat --summary 13104105...` confirms:

- trailer: `LLM-Agent: Codex2`
- trailer: `Task-ID: PBK-UI-004`
- trailer: `Reviewer: Codex`
- trailer verification string:
  `pnpm --filter @drts/partner-booking-web typecheck; ... build; ... lint; pnpm --filter @drts/ui-web build-storybook`
- six-file diff:
  - `apps/partner-booking-web/README.md`
  - `apps/partner-booking-web/app/[tenantSlug]/[routeState]/page.tsx`
  - `apps/partner-booking-web/app/[tenantSlug]/page.tsx`
  - `apps/partner-booking-web/lib/route-state.ts`
  - `packages/ui-web/src/index.tsx`
  - `packages/ui-web/src/partner-booking-funnel.tsx`

What the current branch checks confirm:

- `git merge-base --is-ancestor 13104105... HEAD` returns exit code `1`
  on this task branch.
- `git branch -a --contains 13104105...` lists
  `feat/claude2-ui-redesign-foundation` and
  `remotes/origin/feat/claude2-ui-redesign-foundation`, but not
  `codex/pbk-ui-004-sidecar-review`.
- The current `HEAD` contains only the README from that six-file surface, not
  the route/page/funnel implementation files.

Reviewer consequence:

- This historical commit explains where the stale packet's earlier
  parent-`done` narrative came from.
- It must **not** be presented as current-branch completion evidence unless the
  control plane is updated to point back to that commit and the branch / push
  evidence is re-established for the active task state.

## §6 Interaction With PBK-UI-005

`docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
still treats `PBK-UI-004` as a readiness gate:

- repo-local live-routing work waits on `PBK-UI-003` parity
- repo-local live-routing work also waits on `PBK-UI-004` negative-path parity

That decision doc is useful context, but it is not substitute evidence that
`PBK-UI-004` is complete on the current task branch. The decision is accepted;
the implementation slice is not yet recorded as accepted in current machine
truth.

## §7 Reviewer Checklist

These are the checks that matter for the refreshed packet itself.

### A. Machine truth

- [ ] `ai-status.json` still records `PBK-UI-004` as owner `Codex2`,
      reviewer `Codex`, status `todo`, depends on `PBK-UI-003`, and carries the
      pending reviewer handoff from `Claude` to `Codex`.
- [ ] `ai-status.json` still records `PBK-UI-003` as `in_progress`. If it moves
      to `done`, refresh this packet's dependency section before using it as
      review support.
- [ ] If `PBK-UI-004-SIDECAR-REVIEW` is later materialized into
      `ai-status.json`, confirm its row matches the dispatch brief:
      owner `Codex2`, reviewer `Codex`, `task_class=sidecar`,
      `helper_kind=review_packet`, `mutates_canonical=false`, artifact path
      under `support/sidecars/PBK-UI-004/`.

### B. Repo state

- [ ] Do not approve `PBK-UI-004` based only on `apps/partner-booking-web/README.md`.
- [ ] Do not treat the existence of commit `13104105...` elsewhere in the repo
      as current-branch proof.
- [ ] Require the active implementation branch or recorded closeout branch to
      actually contain the route-state, page, and funnel files before accepting
      parent completion.
- [ ] If the eventual parent closeout again relies on `13104105...` or a
      descendant, require `ai-status.json` to record that commit and its push
      metadata explicitly instead of inferring it from historical packet text.

### C. Sidecar scope

- [ ] The only task-scoped content edit for this sidecar slice is this file.
- [ ] No runtime code, no L1/L2 truth docs, and no parent implementation files
      were edited by this refresh.

## §8 Reviewer Handoff Notes

1. This refresh removes two stale narratives from the previous packet:
   sidecar-reviewer `Codex2`, and parent-task `done`.
2. The live parent reviewer endpoint is `Codex` because the latest unresolved
   handoff is `Claude` -> `Codex` at `2026-05-12T18:55:03Z`.
3. The parent task itself is still pre-review. The only dependency
   `PBK-UI-003` is still `in_progress`, so this packet should be read as
   reviewer orientation and evidence hygiene, not as parent acceptance.
4. The repo does contain a historical implementation commit `13104105...`, but
   it is off-branch relative to this task worktree. Keep that distinction
   explicit whenever this packet is cited.
5. The sidecar task row is currently missing from `ai-status.json` in this
   worktree. Until supervisor or owner materializes that row, formal sidecar
   `approve` / `done` recording cannot happen through `scripts/ai-status.sh`.
6. Any later machine-truth movement should stay script-driven. Do not hand-edit
   `ai-status.json`, `current-work.md`, or log files to "catch up" the packet.
