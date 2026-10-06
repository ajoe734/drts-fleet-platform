# SR-GCP-ARTIFACT-ACTIVATION-20261004 unblock audit (2026-10-06)

Task: `SR-GCP-ARTIFACT-ACTIVATION-20261004-UNBLOCK-HISTORY-REPAIR`; owner:
Claude2; reviewer: Pi. Scope: document the exact branch/worktree/commit state
and a non-destructive repair path; no parent source change or parent
candidate handoff is performed by this helper.

## Finding: the parent is not currently blocked by git history contamination

The parent's live status (`status: blocked`, `waiting_for: Codex`,
`last_update: 2026-10-06T15:04:24Z`) is a **write-scope policy decision**, not
a repository-history defect:

> R8-doc round-4 REOPEN (SHA `3d9ef2dc7`, gen `5ec7a67a…`): retained P2
> publish-failure detached-rejection defect is in product code
> (`billing-settlement.controller.ts:317-325`, `.service.ts:2029-2030`,
> `.repository.ts:975-1001`/`.service.ts:4598-4620`), both outside this
> task's `write_scopes`. Requesting Supervisor add
> `billing-settlement.controller.ts` and `billing-settlement.service.ts` to
> this task's `write_scopes`… Routing this blocker through reviewer Codex
> since Supervisor is not a resolvable lane agent for `ai-status.sh blocker`.

The owner correctly identified a real product-code defect (an unawaited
`publishDriverFeePlan` promise whose rejection is never observed, plus a
cache-before-persist race) that cannot be fixed inside the task's current
`write_scopes`. Only Supervisor can expand `write_scopes`; that decision, not
any git/worktree/commit problem, is what the parent is waiting on.

## Exact git/GitHub state (verified after `git fetch origin`)

There **is** real branch/PR contamination in this family, left over from an
earlier failed attempt to pass the commit-trailer CI gate (Supervisor's own
2026-10-05T23:40Z note in the parent's `integration_notes` already describes
this: "the previous owner created about 13 branches and PRs… At one point it
also added an `ALLOWED_SHAS` exemption to
`tools/ci/git/check_commit_trailers.py`… since reverted"). This audit
independently re-verifies that state is still present and is not itself
blocking review/merge of the current candidate:

| Branch                                                                                        | PR                                                                                          | State                                                                           | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude2/sr-gcp-artifact-activation-20261004`                                                 | [#2349](https://github.com/ajoe734/drts-fleet-platform/pull/2349)                           | OPEN, `mergeable=MERGEABLE`, `mergeStateStatus=BLOCKED` (failing CI, see below) | **Live candidate.** Tip `751a4cec9d5c2f2cee4cf9b77167026aa463ce5d`, 21 commits above merge-base `b20895a17085681eb0974864be53eae8d726b343` with `origin/dev`. `check_commit_trailers.py --base origin/dev --head <tip>` → `21 commit(s) OK`, exit 0. CI run `37484165258`/`37484165338`: `Commit trailers` pass, `Canonical consistency` pass, `typecheck`/`lint`/`build` pass; `unit`, `ci-integ`, `Smoke acceptance`, `Product smoke acceptance` fail — consistent with the retained P2 defect described above, not a git-mechanics failure. |
| `claude2/sr-gcp-artifact-activation-20261004-final`                                           | [#2348](https://github.com/ajoe734/drts-fleet-platform/pull/2348)                           | OPEN, `mergeStateStatus=CLEAN`                                                  | **Superseded.** Single commit `22ec14ac983f2dc6d36b476ee4662b79ce29360e` ("consolidate reviewed GCP artifact activation fixes"), frozen at 2026-10-05T23:41:44Z. All 21 further review-round fixes (R1–R9, R8-doc) landed on the un-suffixed branch above instead, so this branch never advanced after the consolidation commit.                                                                                                                                                                                                               |
| `gemini/sr-gcp-artifact-activation-20261004` (+ `-r2`…`-r9`, `-v2`…`-v8`, `-r6` dash variant) | #2313, #2317, #2321, #2324, #2329, #2334, #2335, #2338, #2340, #2343, #2344, #2346 (13 PRs) | all OPEN, none merged/closed                                                    | **Dead rounds** from the failed trailer-gate recovery attempt. None contain the current reviewed fixes; none are referenced by the task's `candidate_branch`/`pr_url` at any point in the current `worker_outcomes` history.                                                                                                                                                                                                                                                                                                                   |

No worktree ambiguity exists: `git worktree list --porcelain` shows only this
helper's own assigned worktree
(`.artifacts/worktrees/auto/claude2-sr-gcp-artifact-activation-20261004-unblock-history-repair`,
on `claude2/sr-gcp-artifact-activation-20261004-unblock-history-repair`); no
worktree checks out any of the branches in the table above, so there is no
local-checkout collision for the parent's next owner session.

### A second, cosmetic artifact: a stray `branch` field on the task

`ai-status.sh show SR-GCP-ARTIFACT-ACTIVATION-20261004` currently prints a
top-level `"branch": "claude2/sr-gcp-artifact-activation-20261004-final"`
key. Reading the current release's `ai_status.py` and `github_bus.py`
confirms this key is **dead data, not live machine truth**:

- No command in `ai_status.py` (`handoff`, `blocker`, `progress`, `reopen`,
  `resume-blocked`, …) ever reads or writes a task-level `"branch"` key. The
  only `"branch"` keys the code sets belong to **agent** records (each
  lane's default branch), not tasks.
- `github_bus.review_branch_for_task()` resolves the branch to poll from
  `task.get("candidate_branch")` first, then `task.get("github",
{}).get("head_branch")`, then the _owner agent's_ default branch — never
  from this stray task-level `"branch"` key.
- `find_existing_pr()` always matches by exact `--head <branch> --base dev`,
  so even with 13 duplicate-titled open PRs in this family, the bus cannot
  accidentally bind the wrong one.

So this key does not and cannot misroute review/CI/merge automation; it is
a harmless leftover (likely from an earlier schema or a one-off manual edit)
that only makes the human-readable `show` output look stale. It is not part
of the live candidate lifecycle fields (`candidate_sha`/`candidate_branch`/
`pr_url`), which are correctly set fresh on every `handoff` and correctly
cleared on every `reopen` via `clear_candidate_evidence()` — the repeated
owner/reviewer round-trips visible in `worker_outcomes` (SHAs
`78ba16aa1…` → … → `3d9ef2dc7…`) are normal candidate-lifecycle operation,
not evidence of corruption.

## Non-destructive repair path

1. **No git repair is required for the live candidate.** PR #2349 at
   `751a4cec9` is a clean, linear, correctly-trailered branch already in
   front of the correct reviewer (Codex) for the correct reason (a
   write-scope decision). Nothing here should be rebased, amended, or
   force-pushed.
2. **Leave the 13 superseded branches/PRs and the stray `-final` branch/PR
   untouched for now.** Per the branch-strategy rule and the Supervisor's
   own prior note ("Supervisor will ask the user before closing any of
   them"), closing GitHub PRs is a visible action on shared state; this
   helper does not close, delete, or comment on any of them. The concrete
   cleanup recommendation for Supervisor + user is to close PRs #2313,
   #2317, #2321, #2324, #2329, #2334, #2335, #2338, #2340, #2343, #2344,
   #2346 and #2348 as superseded by #2349, and delete their branches only
   after that explicit confirmation — this is bookkeeping, not something
   blocking the parent today.
3. **The stray task-level `"branch"` field is safe to ignore or to clear
   manually in a future `ai-status.json` maintenance pass.** No currently
   released command can correct it (it is not part of any mutation
   command's schema), and since it is not read by any live code path,
   leaving it as-is carries no functional risk; this helper does not patch
   `ai-status.json` directly, consistent with Machine Truth Discipline
   (§0.5 of `AI_COLLABORATION_GUIDE.md`: canonical state is only mutated
   through the status CLI, never by ad hoc edits).

## Concrete unblocked next step for the parent

The parent does not need a history recovery. It needs **Supervisor's
write_scopes decision**:

- Grant: add `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
  and `billing-settlement.service.ts` to `SR-GCP-ARTIFACT-ACTIVATION-20261004`'s
  `write_scopes` (the owner already checked `ai-status.json` and found no
  other open task holding those paths — `SR-DRIVER-GAPS-20260911`,
  `AUDIT-PROOF-CLOSURE-20261002`, `AUDIT-ARTIFACT-DURABILITY-20261002`, and
  `SR-INVOICE-MAIL-20261004` are all `done`), so Claude2 can add the
  awaited/handled publish-error contract R8-doc round-4 asks for on top of
  the current live candidate branch `claude2/sr-gcp-artifact-activation-20261004`
  (PR #2349); or
- Deny / redirect: route the fix to a separate task that already owns those
  billing-settlement files, and have this task either drop or re-scope the
  R8-doc finding accordingly.

Either way, `resume-blocked` is Supervisor's call once that decision is
made; this helper does not attempt to make that policy decision or resume
the parent itself.

## Checks performed in this helper

- `git fetch origin`; `git branch -r | grep -i sr-gcp-artifact-activation`:
  18 matching remote branches enumerated.
- `git log origin/dev..origin/claude2/sr-gcp-artifact-activation-20261004-final`
  and the same against the un-suffixed branch: confirmed 1 vs 21 commits
  above the shared merge-base `b20895a17085681eb0974864be53eae8d726b343`.
- `git merge-base --is-ancestor 3d9ef2dc7… origin/claude2/…-final`: `NO`;
  `git branch -a --contains 3d9ef2dc7…`: only
  `claude2/sr-gcp-artifact-activation-20261004` (un-suffixed) — confirmed the
  reviewed candidate lives on the un-suffixed branch, not `-final`.
- `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head
origin/claude2/sr-gcp-artifact-activation-20261004`: `21 commit(s) OK`,
  exit 0.
- `git show origin/dev:tools/ci/git/check_commit_trailers.py | grep
ALLOWED_SHAS`: no match (exit 1) — confirmed the R9 `ALLOWED_SHAS`
  exemption finding is not present on current `dev`.
- `gh pr list --search "sr-gcp-artifact-activation-20261004" --state open`:
  enumerated all 14 open PRs in this family (13 superseded + the live one);
  `gh pr view 2349/2348/2313/2317 --json mergeable,mergeStateStatus,state,
mergedAt,closedAt`: confirmed live/stale/open states above.
- `gh pr checks 2349`: confirmed the specific failing jobs (`unit`,
  `ci-integ`, `Smoke acceptance`, `Product smoke acceptance`) match the
  retained P2 defect description, and that `Commit trailers` /
  `Canonical consistency` / `typecheck` / `lint` / `build` pass.
- `git worktree list --porcelain`: confirmed no worktree collision for any
  branch in this family besides this helper's own assigned worktree.
- Read `tools/development-orchestrator/bin/ai_status.py`
  (`clear_candidate_evidence`, `command_handoff`, `command_blocker`,
  `command_progress`, `command_reopen`, `command_show`) and
  `tools/development-orchestrator/github_bus.py`
  (`review_branch_for_task`, `find_existing_pr`) to confirm the stray
  task-level `"branch"` field is unused by any live command or bus path.
- No product tests were run and no parent source file was touched by this
  helper.

## Delivery

This file is the only change in this helper task. Its task-scoped commit and
normal push are on
`claude2/sr-gcp-artifact-activation-20261004-unblock-history-repair`; the
final SHA and PR URL are recorded by this helper's own `handoff` in machine
truth, avoiding a self-referential SHA in this document. The parent task
receives a `note` via the status CLI summarizing this finding and the
concrete next step; the parent's `status`/`waiting_for` are left untouched
since the write-scope decision — not this helper — is what resolves the
block.
