# PH1GC-DRV-MP-002 Unblock History Repair

## Scope

- Task: `PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-DRV-MP-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit date: `2026-05-23`

## Diagnosis

The parent is blocked by related branch/worktree history contamination. The
missing support-sidecar tree does exist on a task branch, but the only pushed
parent branch that carries it is not based on current `origin/dev`.

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
4. The still-pushed clean helper branch on current `origin/dev` is now
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`. Before this repair
   it carried only the history note; after this repair it carries the missing
   sidecar tree replayed onto a current-dev base.
5. A sibling pushed branch,
   `origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ cb1192f94e6a0b0c676d6bb2f7e694040e7d3757`,
   is not based on current `origin/dev`. Its merge-base with `origin/dev` is
   `bf176edd9c100ad121face524588c3144bdcd15d`, and
   `origin/dev...origin/codex/ph1gc-drv-mp-002-sidecar-acceptance` is
   `1 left / 1 right`.
6. The diff from that stale-base `codex` sidecar branch to current `origin/dev`
   is therefore contaminated by trunk drift; it is not a clean single-purpose
   replay branch for the parent. The branch contains the intended sidecar
   acceptance file, but it is coupled to an older publish snapshot ancestry.
7. Additional related worktrees still point at non-canonical refs:
   `codex2/ph1gc-drv-mp-002-sidecar-acceptance` is a local-only worktree still
   parked at `bf176edd`, and several local helper worktrees still point at
   branch names that either have no remote branch or are stale-base audit refs.

## Exact Contamination

The contamination is the mismatch between:

1. The contaminated pushed parent branch
   (`origin/codex2/ph1gc-drv-mp-002`) that contains the required sidecar tree
   but sits on stale ancestry (`a7f88919`) and includes a merge commit.
2. The clean current-dev-based repair branch
   (`origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`) that can carry a
   minimal replay without rewriting shared history.
3. A pushed `codex` helper branch carrying related sidecar evidence but still
   rooted on stale base `bf176edd`
   (`origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`).
4. Local helper worktrees whose branch names suggest they may be canonical, but
   which either have no remote branch or still sit on the stale base.

That contamination keeps the parent blocked on branch history because the
missing sidecar tree has no current-dev-based pushed replay branch of its own.

## Non-Destructive Repair Path

Do not force-push or rewrite any shared branch. Repair by replaying only the
task-owned sidecar artifacts onto the already-pushed clean
`codex2/ph1gc-drv-mp-002-unblock-history-repair` branch and treating the
stale-base branches as audit evidence only.

1. Treat
   `origin/codex2/ph1gc-drv-mp-002-unblock-history-repair` as the canonical
   replay target for the missing sidecar tree. It is based on current
   `origin/dev` and now contains only task-owned support artifacts:
   - `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR.md`
   - `support/sidecars/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE.md`
   - `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/*`
2. Do not replay the parent from
   `origin/codex2/ph1gc-drv-mp-002`; keep that branch as immutable evidence of
   the stale-base mixed-ancestry parent branch, not as the canonical review
   path.
3. Do not replay the parent from
   `origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`; keep it as immutable
   evidence of the stale-base sidecar branch, not as the canonical review path.
4. Leave `codex2/ph1gc-drv-mp-002-sidecar-acceptance` and the stale-base audit
   branches in
   place for audit. They do not need renaming or history rewrite.
5. Parent owner `Codex2` should update the parent with this exact next step:

```bash
AI_NAME=Codex2 scripts/ai-status.sh progress PH1GC-DRV-MP-002 \
  "History repair: review/merge origin/codex2/ph1gc-drv-mp-002-unblock-history-repair as the clean replay of support/sidecars/PH1GC-DRV-MP-002 and support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE. Treat origin/codex2/ph1gc-drv-mp-002 @ 9be1a098361ec90b4e30f26854d24441c1c59a8b and origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ cb1192f94e6a0b0c676d6bb2f7e694040e7d3757 as stale-base audit evidence only; no force-push required."
```

6. If the control plane requires a review replay instead of a progress note,
   use the same canonical branch in the handoff:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-DRV-MP-002 Codex \
  "Replay review on canonical helper branch origin/codex2/ph1gc-drv-mp-002-unblock-history-repair. It cleanly replays support/sidecars/PH1GC-DRV-MP-002 and support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE on current origin/dev; origin/codex2/ph1gc-drv-mp-002 and origin/codex/ph1gc-drv-mp-002-sidecar-acceptance stay as stale-base audit evidence only."
```

7. After that replay, the parent should remain blocked only on the external
   device-lab prerequisites already documented in
   `PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK.md`, not on branch ambiguity.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The current-dev-based pushed `codex2` repair branch is now the canonical
  replay surface for the missing sidecar tree.
- The contaminated parent branch is preserved unchanged for audit.
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
  - `git ls-remote --heads origin 'refs/heads/codex/ph1gc-drv-mp-002-sidecar-acceptance' 'refs/heads/codex2/ph1gc-drv-mp-002-sidecar-acceptance' 'refs/heads/codex2/ph1gc-drv-mp-002' 'refs/heads/codex2/ph1gc-drv-mp-002-unblock-history-repair'`
- Compared ancestry and diffs:
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002`
  - `git merge-base origin/dev origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-history-repair`
  - `git diff --name-status origin/dev...origin/codex2/ph1gc-drv-mp-002`
  - `git show --stat --summary --name-only 9be1a098361ec90b4e30f26854d24441c1c59a8b`
  - `git diff --name-status bf176edd..cb1192f9`
  - `git branch -r --contains 9be1a098`
  - `git branch -r --contains b6df1cbc`
  - `git branch -r --contains cb1192f9`
  - `git restore --source=origin/codex2/ph1gc-drv-mp-002 -- support/sidecars/PH1GC-DRV-MP-002 support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE`
