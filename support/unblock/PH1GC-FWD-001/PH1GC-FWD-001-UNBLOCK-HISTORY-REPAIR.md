# PH1GC-FWD-001 Unblock History Repair

## Scope

- Task: `PH1GC-FWD-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-FWD-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-05-22`

## Diagnosis

The parent is blocked by external sandbox inputs, but the unblock path also had
branch/worktree ambiguity that needed a durable audit note.

1. The only pushed branch that contains the latest parent-sidecar refresh is
   `origin/codex/ph1gc-fwd-001 @ 03f683dd7314e687bf52289e7af6fc2f83f5c7cd`.
   That branch is exactly one commit ahead of `origin/dev` and changes only:
   - `support/sidecars/FWD-LIVE-001/README.md`
   - `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
2. The helper worktree for this task runs on
   `codex/ph1gc-fwd-001-unblock-history-repair`, but before this repair that
   branch had no remote ref and tracked clean `origin/dev @ a7f88919`.
   Its HEAD subject was the unrelated dev commit
   `docs(PH1GC-PROD-001): finalize owner closeout`, because the helper branch
   was created from current `origin/dev`, not from the parent branch.
3. Because this helper branch started from `origin/dev`, the local filesystem in
   this worktree did not contain:
   - the parent-sidecar refresh from `origin/codex/ph1gc-fwd-001`
   - `support/unblock/PH1GC-FWD-001/PH1GC-FWD-001-UNBLOCK-MANUAL-UNBLOCK.md`
   - `support/unblock/PH1GC-FWD-001/PH1GC-FWD-001-UNBLOCK-PLANNING-DECISION.md`
4. The two earlier unblock helpers were already pushed and reviewed on their own
   branches:
   - `origin/codex2/ph1gc-fwd-001-unblock-manual-unblock @ 4944acc9`
     with draft PR `#245`
   - `origin/codex/ph1gc-fwd-001-unblock-planning-decision @ 1b2af014`
     with draft PR `#249`
   But neither helper was merged into `dev`, so a new helper worktree created
   from `origin/dev` could not see those artifacts without reading their refs
   directly.
5. The parent branch itself has no PR yet. Without a task-scoped history-repair
   note, later resume attempts could mistake the empty helper branch/worktree for
   the canonical replay surface instead of the actual parent branch that holds
   the latest sidecar refresh.

## Evidence

### Branch and commit state

- `origin/dev @ a7f88919fd15385ff32d5f70f05c74d5b36d7122`
- `origin/codex/ph1gc-fwd-001 @ 03f683dd7314e687bf52289e7af6fc2f83f5c7cd`
- `origin/dev...origin/codex/ph1gc-fwd-001 = 0 left / 1 right`
- merge-base of `origin/dev` and `origin/codex/ph1gc-fwd-001` is
  `a7f88919fd15385ff32d5f70f05c74d5b36d7122`
- `git diff --name-only a7f88919..03f683dd` shows only the two
  `support/sidecars/FWD-LIVE-001/*` paths above
- `git diff --check origin/dev..origin/codex/ph1gc-fwd-001 -- support/sidecars/FWD-LIVE-001/README.md support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
  passes with no whitespace errors
- `git branch -r --contains 03f683dd` shows only
  `origin/codex/ph1gc-fwd-001`

### Helper-branch ambiguity

- `git ls-remote --heads origin 'refs/heads/codex/ph1gc-fwd-001-unblock-history-repair'`
  returned no ref before this repair
- `git branch -vv` showed:
  - `codex/ph1gc-fwd-001` tracking `origin/codex/ph1gc-fwd-001`
  - `codex/ph1gc-fwd-001-unblock-history-repair` tracking `origin/dev`
- `git reflog show refs/heads/codex/ph1gc-fwd-001-unblock-history-repair`
  records branch creation from `origin/dev` at `2026-05-22 10:46:08 +0000`
- reading the earlier helper artifacts required explicit ref lookups:
  - `origin/codex2/ph1gc-fwd-001-unblock-manual-unblock:...`
  - `origin/codex/ph1gc-fwd-001-unblock-planning-decision:...`
  because those files were absent in this helper worktree before the current
  repair commit

### Machine-truth context

- Canonical `AI_STATUS_ROOT` parent `PH1GC-FWD-001` is still `blocked`
- Parent `next` already records the external-only blocker bundle from the
  `2026-05-22` sandbox revalidation
- This helper task was auto-created by chairman blocked-task triage specifically
  because the parent already had a pushed refresh commit at `03f683dd` but
  still needed a task-scoped stale-base / canonical-path audit

## Exact Contamination

The contamination is not a broken code diff. It is a mismatch between the branch
that actually carries the parent refresh and the helper worktree names that were
spawned later from clean `origin/dev`.

1. The canonical parent progress lives on
   `origin/codex/ph1gc-fwd-001 @ 03f683dd`.
2. The history-repair helper branch name initially pointed at unrelated
   `origin/dev @ a7f88919` with no remote branch and no parent-sidecar diff.
3. The helper worktree therefore looked clean while hiding the fact that the
   latest parent evidence lived elsewhere.
4. The earlier unblock artifacts existed only on their own helper branches and
   draft PRs, so this new helper worktree also lacked local visibility of the
   already-completed unblock chain.

Without a repair note, "resume PH1GC-FWD-001 later" was underspecified at the
branch/worktree level even though the parent blocker itself was already known.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any shared history. Repair by declaring
the correct replay surface and keeping each helper branch as an audit ref.

1. Treat `origin/codex/ph1gc-fwd-001 @ 03f683dd7314e687bf52289e7af6fc2f83f5c7cd`
   as the canonical parent branch until the external forwarder package arrives.
2. Treat `03f683dd` as the canonical sidecar anchor, because it cleanly composes
   with current `origin/dev` and contains only the latest dated refresh for:
   - `support/sidecars/FWD-LIVE-001/README.md`
   - `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
3. Keep the earlier helper branches as evidence-only refs:
   - `origin/codex2/ph1gc-fwd-001-unblock-manual-unblock @ 4944acc9` / PR `#245`
   - `origin/codex/ph1gc-fwd-001-unblock-planning-decision @ 1b2af014` / PR `#249`
4. Do not replay future sandbox work from
   `codex/ph1gc-fwd-001-unblock-history-repair`, because that helper branch was
   created from clean `origin/dev` and was never the carrier of the parent
   sidecar refresh.
5. When the external package is ready, resume from
   `origin/codex/ph1gc-fwd-001 @ 03f683dd` and extend the existing
   `support/sidecars/FWD-LIVE-001/` packet there.

## Concrete Parent Next Step

`PH1GC-FWD-001` should remain `blocked`, but its next-step text should now be
explicitly branch-aware:

> Wait for the forwarder integration owners to provide approved API contract
> authority, a reachable staging endpoint, a non-interactive credential path,
> signed webhook/replay-proof samples, and at least one seeded forwarded-task
> flow so `FWD-LIVE-001` can collect and verify `EXT-002-BLK-001` through
> `EXT-002-BLK-007` evidence without over-claiming `WF-FWD-001`. When those
> inputs arrive, resume from the canonical parent branch
> `origin/codex/ph1gc-fwd-001 @ 03f683dd7314e687bf52289e7af6fc2f83f5c7cd`, not
> from the empty history-repair helper branch created from `origin/dev`.

## Why This Is Safe

- No branch history is rewritten
- No force-push is required
- The only pushed parent-evidence branch remains canonical
- The helper branches remain available as audit evidence
- The repair clarifies the replay target instead of moving commits between refs

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical machine truth at
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical activity log at
  `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- Compared relevant refs and worktrees:
  - `git branch -vv`
  - `git worktree list --porcelain`
  - `git reflog show refs/heads/codex/ph1gc-fwd-001-unblock-history-repair`
  - `git ls-remote --heads origin 'refs/heads/codex/ph1gc-fwd-001' 'refs/heads/codex/ph1gc-fwd-001-unblock-history-repair' 'refs/heads/codex/ph1gc-fwd-001-unblock-planning-decision' 'refs/heads/codex2/ph1gc-fwd-001-unblock-manual-unblock'`
- Verified parent branch composition:
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-fwd-001`
  - `git merge-base origin/dev origin/codex/ph1gc-fwd-001`
  - `git diff --name-only a7f88919..03f683dd`
  - `git diff --check origin/dev..origin/codex/ph1gc-fwd-001 -- support/sidecars/FWD-LIVE-001/README.md support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
  - `git branch -r --contains 03f683dd`
- Verified PR visibility:
  - `gh pr list --head codex/ph1gc-fwd-001 --state all`
  - `gh pr list --state all --search 'PH1GC-FWD-001'`
