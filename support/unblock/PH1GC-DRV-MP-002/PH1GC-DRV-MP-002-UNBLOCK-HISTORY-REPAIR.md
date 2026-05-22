# PH1GC-DRV-MP-002 Unblock History Repair

## Scope

- Task: `PH1GC-DRV-MP-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-DRV-MP-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit date: `2026-05-22`

## Diagnosis

The parent is blocked by related branch/worktree history contamination, not by a
missing new code or documentation fix.

1. The only pushed helper branch for this parent that is based on current
   `origin/dev` is
   `origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock @ 0b93824e9b6c2e0a0c01224fe1a0451d1ebdbf6e`.
   Its merge-base with `origin/dev` is `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`,
   and `origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock`
   is `0 left / 2 right`.
2. That pushed `codex2` helper branch changes only
   `support/unblock/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK.md`,
   so it is a clean replay target for the parent's external-blocker evidence.
3. A sibling pushed branch,
   `origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ cb1192f94e6a0b0c676d6bb2f7e694040e7d3757`,
   is not based on current `origin/dev`. Its merge-base with `origin/dev` is
   `bf176edd9c100ad121face524588c3144bdcd15d`, and
   `origin/dev...origin/codex/ph1gc-drv-mp-002-sidecar-acceptance` is
   `1 left / 1 right`.
4. The diff from that stale-base `codex` sidecar branch to current `origin/dev`
   is therefore contaminated by trunk drift; it is not a clean single-purpose
   replay branch for the parent. The branch contains the intended sidecar
   acceptance file, but it is coupled to an older publish snapshot ancestry.
5. Additional related worktrees still point at non-canonical refs:
   `codex2/ph1gc-drv-mp-002-sidecar-acceptance` is a local-only worktree still
   parked at `bf176edd`, and `codex/ph1gc-drv-mp-002-unblock-manual-unblock`
   plus `codex2/ph1gc-drv-mp-002-unblock-history-repair` both point at clean
   `origin/dev` with no task-scoped repair commit yet.
6. There is no pushed parent branch `origin/codex2/ph1gc-drv-mp-002`, so the
   control plane currently sees multiple near-parent helper branches with mixed
   ancestry and no durable repair note identifying which one should be replayed.

## Exact Contamination

The contamination is the mismatch between:

1. A clean pushed `codex2` helper branch on current `origin/dev`
   (`origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock`).
2. A pushed `codex` helper branch carrying relevant task evidence but still
   rooted on stale base `bf176edd`
   (`origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`).
3. Local helper worktrees whose branch names suggest they may be canonical, but
   which either have no remote branch or still sit on the stale base.

That ambiguity keeps the parent blocked on branch history, even though the
remaining substantive blocker is already documented as external device-lab
evidence.

## Non-Destructive Repair Path

Do not force-push or rewrite any shared branch. Repair by replaying the parent
on the already-pushed clean `codex2` helper branch and treating the stale-base
`codex` sidecar branch as audit evidence only.

1. Treat
   `origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock @ 0b93824e9b6c2e0a0c01224fe1a0451d1ebdbf6e`
   as the canonical replay target for the parent's unblock state. It is the
   only pushed related branch that cleanly composes with current `origin/dev`.
2. Do not replay the parent from
   `origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`; keep it as immutable
   evidence of the stale-base sidecar branch, not as the canonical review path.
3. Leave `codex2/ph1gc-drv-mp-002-sidecar-acceptance`,
   `codex/ph1gc-drv-mp-002-unblock-manual-unblock`, and this helper branch in
   place for audit. They do not need renaming or history rewrite.
4. Parent owner `Codex2` should update the parent with this exact next step:

```bash
AI_NAME=Codex2 scripts/ai-status.sh progress PH1GC-DRV-MP-002 \
  "History repair: replay parent from origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock @ 0b93824e9b6c2e0a0c01224fe1a0451d1ebdbf6e. Treat origin/codex/ph1gc-drv-mp-002-sidecar-acceptance @ cb1192f94e6a0b0c676d6bb2f7e694040e7d3757 as stale-base audit evidence only; no force-push required."
```

5. If the control plane requires a review replay instead of a progress note,
   use the same canonical branch in the handoff:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-DRV-MP-002 Codex \
  "Replay review on canonical helper branch origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock @ 0b93824e9b6c2e0a0c01224fe1a0451d1ebdbf6e. Related branch origin/codex/ph1gc-drv-mp-002-sidecar-acceptance stays as stale-base audit evidence; repair is non-destructive and requires no force-push."
```

6. After that replay, the parent should remain blocked only on the external
   device-lab prerequisites already documented in
   `PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK.md`, not on branch ambiguity.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The current-dev-based pushed `codex2` branch remains the canonical replay
  surface.
- The stale-base `codex` sidecar branch stays available for audit.
- The repair records the right replay target instead of trying to move evidence
  across branch names.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md` §11
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Compared related branch/worktree state:
  - `git for-each-ref --format='%(refname:short) %(objectname)' refs/heads refs/remotes/origin | grep 'ph1gc-drv-mp-002' | sort`
  - `git worktree list --porcelain | grep -A2 -B1 'ph1gc-drv-mp-002'`
  - `git ls-remote --heads origin 'refs/heads/codex/ph1gc-drv-mp-002-sidecar-acceptance' 'refs/heads/codex2/ph1gc-drv-mp-002-sidecar-acceptance' 'refs/heads/codex/ph1gc-drv-mp-002-unblock-manual-unblock' 'refs/heads/codex2/ph1gc-drv-mp-002-unblock-manual-unblock' 'refs/heads/codex2/ph1gc-drv-mp-002-unblock-history-repair'`
- Compared ancestry and diffs:
  - `git merge-base origin/dev origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`
  - `git rev-list --left-right --count origin/dev...origin/codex/ph1gc-drv-mp-002-sidecar-acceptance`
  - `git merge-base origin/dev origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock`
  - `git rev-list --left-right --count origin/dev...origin/codex2/ph1gc-drv-mp-002-unblock-manual-unblock`
  - `git diff --name-status bf176edd..cb1192f9`
  - `git diff --name-status 6607dea8..0b93824e`
  - `git branch -r --contains cb1192f9`
  - `git branch -r --contains 0b93824e`
