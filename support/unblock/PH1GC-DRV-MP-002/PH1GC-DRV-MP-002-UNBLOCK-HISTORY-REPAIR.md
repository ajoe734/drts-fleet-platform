# PH1GC-DRV-MP-002 Unblock History Repair

## Scope

- Task: `PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-DRV-MP-002`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit date: `2026-05-23`

## Diagnosis

The parent is blocked by related branch/worktree history contamination. The
missing support-sidecar tree exists, but every previously pushed candidate
branch that carries it is rooted on stale ancestry.

1. The pushed parent branch
   `origin/codex2/ph1gc-drv-mp-002 @ 9be1a098361ec90b4e30f26854d24441c1c59a8b`
   is not based on current `origin/dev`. Its merge-base with `origin/dev` is
   `a7f88919fd15385ff32d5f70f05c74d5b36d7122`, and
   `origin/dev...origin/codex2/ph1gc-drv-mp-002` is `11 left / 15 right`.
2. The parent branch carries the intended task artifacts, including
   `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` and
   `support/sidecars/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE.md`,
   but they are bundled with stale ancestry and a merge commit, so replaying
   the whole branch would drag unrelated trunk drift into the parent.
3. The prior helper branch cited by the earlier audit,
   `origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock`, no longer exists on
   `origin`. It cannot be the canonical replay target anymore.
4. The earlier history-repair replay branch
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 38ae69390790f98d627d55967a3739ef9f5b6403`
   is also stale now. Its merge-base with current `origin/dev` is
   `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`, and
   `origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-history-repair` is
   `17 left / 2 right`. That is why the previous review rejected it as the
   canonical replay target.
5. A sibling pushed branch,
   `origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ cb1192f94e6a0b0c676d6bb2f7e694040e7d3757`,
   is not based on current `origin/dev`. Its merge-base with `origin/dev` is
   `bf176edd9c100ad121face524588c3144bdcd15d`, and
   `origin/dev...origin/codex/ph1gc-drv-mp-002-sidecar-acceptance` is
   `18 left / 1 right`.
6. The diff from that stale-base `codex` sidecar branch to current `origin/dev`
   is therefore contaminated by trunk drift; it is not a clean single-purpose
   replay branch for the parent. The branch contains the intended sidecar
   acceptance file, but it is coupled to an older publish snapshot ancestry.
7. The reassigned worker branch
   `codex/ph1gc-drv-mp-002-unblock-history-repair` existed only as an empty
   local alias of `origin/dev` before this repair. It carried no task-scoped
   evidence and had no remote branch of its own.
8. Additional related worktrees still point at non-canonical refs:
   `codex2/ph1gc-drv-mp-002-sidecar-acceptance` is a local-only worktree still
   parked at `bf176edd`, and several local helper worktrees still point at
   branch names that either have no remote branch or are stale-base audit refs.

## Exact Contamination

The contamination is the mismatch between:

1. The contaminated pushed parent branch
   (`origin/codex2/ph1gc-drv-mp-002`) that contains the required sidecar tree
   but sits on stale ancestry (`a7f88919`) and includes a merge commit.
2. The stale previous repair branch
   (`origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`) that once carried
   the replay, but no longer composes with current `origin/dev`.
3. A pushed `codex` helper branch carrying related sidecar evidence but still
   rooted on stale base `bf176edd`
   (`origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`).
4. The reassigned `codex/ph1gc-drv-mp-002-unblock-history-repair` branch, which
   was the correct branch name for this task but had not yet replayed the
   support tree or been pushed.

That contamination keeps the parent blocked on branch history because there was
no pushed `codex/...` helper branch on current `origin/dev` that both contained
the missing support tree and was named in machine truth as the current replay
target.

## Non-Destructive Repair Path

Do not force-push or rewrite any shared branch. Repair by replaying only the
task-owned support artifacts onto the reassigned
`codex/ph1gc-drv-mp-002-unblock-history-repair` branch after rebasing it to
current `origin/dev`, and treat every stale-base branch as audit evidence only.

1. Treat
   `origin/codex/ph1gc-drv-mp-002-unblock-history-repair` as the canonical
   replay target for the missing sidecar tree after pushing this repair. It is
   rebased to current `origin/dev` (`0150cbe4e56505854d375211e25d2ab82e948fc0`)
   and contains only task-owned support artifacts:
   - `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR.md`
   - `support/sidecars/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE.md`
   - `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/*`
2. Do not replay the parent from
   `origin/codex2/ph1gc-drv-mp-002`; keep that branch as immutable evidence of
   the stale-base mixed-ancestry parent branch, not as the canonical review
   path.
3. Do not replay the parent from
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`; keep it as the
   stale first repair attempt that is now behind current `origin/dev`, not as
   the canonical review path.
4. Do not replay the parent from
   `origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`; keep it as immutable
   evidence of the stale-base sidecar branch, not as the canonical review path.
5. Leave `codex2/ph1gc-drv-mp-002-sidecar-acceptance` and the stale-base audit
   branches in
   place for audit. They do not need renaming or history rewrite.
6. Parent machine truth should be updated with this exact next step once the
   replay branch is pushed:

```bash
AI_NAME=Codex scripts/ai-status.sh blocker PH1GC-DRV-MP-002 \
  "BLOCKED EXTERNAL after history repair: first review/merge origin/codex/ph1gc-drv-mp-002-unblock-history-repair to land support/sidecars/PH1GC-DRV-MP-002 and support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE on current origin/dev without force-push. Treat origin/codex2/ph1gc-drv-mp-002 @ 9be1a098361ec90b4e30f26854d24441c1c59a8b, origin/codex2/ph1gc-drv-mp-002-unblock-history-repair @ 38ae69390790f98d627d55967a3739ef9f5b6403, and origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ cb1192f94e6a0b0c676d6bb2f7e694040e7d3757 as stale-base audit evidence only. After that merge, the only remaining blockers are the physical device/distribution prerequisites already captured in PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK."
```

7. If the control plane requires a review replay instead of a blocker note,
   use the same canonical branch in the handoff:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-DRV-MP-002 Codex \
  "Replay review on canonical helper branch origin/codex/ph1gc-drv-mp-002-unblock-history-repair. It cleanly replays support/sidecars/PH1GC-DRV-MP-002 and support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE on current origin/dev; origin/codex2/ph1gc-drv-mp-002, origin/codex2/ph1gc-drv-mp-002-unblock-history-repair, and origin/codex/ph1gc-drv-mp-002-sidecar-acceptance stay as stale-base audit evidence only."
```

8. After that replay, the parent should remain blocked only on the external
   device-lab prerequisites already documented in
   `PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK.md`, not on branch ambiguity.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The current-dev-based `codex` repair branch becomes the canonical replay
  surface for the missing sidecar tree.
- The contaminated parent branch is preserved unchanged for audit.
- The stale earlier `codex2` repair branch is preserved unchanged for audit.
- The stale-base `codex` sidecar branch stays available for audit.
- The repair replays only task-owned support artifacts instead of trying to
  rewrite or rebase shared history.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Compared related branch/worktree state:
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads refs/remotes/origin | grep 'ph1gc-drv-mp-002' | sort`
  - `git worktree list --porcelain | grep -A2 -B1 'ph1gc-drv-mp-002'`
  - `git ls-remote --heads origin 'refs/heads/codex/ph1gc-drv-mp-002' 'refs/heads/codex/ph1gc-drv-mp-002-unblock-history-repair' 'refs/heads/codex/ph1gc-drv-mp-002-sidecar-acceptance' 'refs/heads/codex2/ph1gc-drv-mp-002' 'refs/heads/codex2/ph1gc-drv-mp-002-unblock-history-repair'`
- Compared ancestry and diffs:
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002`
  - `git merge-base origin/dev origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git rebase origin/dev`
  - `git diff --name-status origin/dev...origin/codex2/ph1gc-drv-mp-002`
  - `git show --stat --summary --name-only 9be1a098361ec90b4e30f26854d24441c1c59a8b`
  - `git diff --name-status bf176edd..cb1192f9`
  - `git branch -r --contains 9be1a098`
  - `git branch -r --contains 38ae69390790f98d627d55967a3739ef9f5b6403`
  - `git branch -r --contains cb1192f9`
  - `git restore --source=origin/codex2/ph1gc-drv-mp-002-unblock-history-repair -- support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR.md support/sidecars/PH1GC-DRV-MP-002 support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE`
