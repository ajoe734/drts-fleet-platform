# UI-CANVAS-REF-001 Unblock History Repair

## Scope

- Task: `UI-CANVAS-REF-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-CANVAS-REF-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-08-01T13:13:12Z`
- Canonical machine-truth root:
  `/home/lupin/drts-fleet-platform`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-canvas-ref-001-unblock-history-repair`
- Assigned helper branch:
  `codex/ui-canvas-ref-001-unblock-history-repair`

## Diagnosis

`UI-CANVAS-REF-001` is blocked by branch/worktree/status contamination, not by
missing referral embed implementation.

1. The canonical merged UI payload already exists on `origin/dev` at
   `d73940cf129ce89ef1685cea9202f10a8f086c8c`
   (`UI-CANVAS-REF-001: rebuild referral embed canvas parity (#1224)`).
2. The parent owner-closeout rail exists on local branch
   `codex/ui-canvas-ref-001 @ 46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`, but
   the remote branch `origin/codex/ui-canvas-ref-001` was still one commit
   behind at `3968700a4c0a4636ef504e486a7d27c9ac54c4f7` when this repair began.
3. The parent task's machine-truth `next` field therefore described a false
   state: it claimed closeout commit `46dddf75` was already pushed on
   `origin/codex/ui-canvas-ref-001`, but the actual remote ref still pointed to
   `3968700a`.
4. The assigned helper branch/worktree for this task is also contaminated. The
   helper branch `codex/ui-canvas-ref-001-unblock-history-repair` currently
   resolves to `6ea50dd2b3e5d7137b728672a8a160ff26bff925`
   (`BE-REF-HANDOFF-001: durable S2S handoff and referral session hardening
   (#1219)`), not to the expected `origin/dev` base
   `8a40248967bdc37a60a22e6d37c8ad5dca02bd41`.
5. That helper branch has no remote ref at all. `git ls-remote --heads origin`
   returns `codex/ui-canvas-ref-001`, but not
   `codex/ui-canvas-ref-001-unblock-history-repair`.
6. The contaminated helper worktree also carries repo-wide untracked
   `node_modules` directories, which explains the parent task note that some
   checks were blocked by worktree-level path/symlink noise rather than by the
   referral embed code delta itself.

The parent is therefore blocked by two overlapping history problems:

- a real parent closeout commit existed locally but had not yet been pushed to
  the claimed remote branch
- the helper repair worktree/branch was created or advanced onto an unrelated
  BE referral handoff commit, so it cannot be treated as trustworthy evidence of
  the UI task's own ancestry

## Evidence

### Parent branch state

- `origin/dev @ 8a40248967bdc37a60a22e6d37c8ad5dca02bd41`
- merged UI commit on trunk:
  `d73940cf129ce89ef1685cea9202f10a8f086c8c`
- local parent closeout branch before repair:
  `codex/ui-canvas-ref-001 @ 46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`
- remote parent closeout branch before repair:
  `origin/codex/ui-canvas-ref-001 @ 3968700a4c0a4636ef504e486a7d27c9ac54c4f7`
- `git rev-list --left-right --count origin/codex/ui-canvas-ref-001...codex/ui-canvas-ref-001`:
  `0 1`
- `git merge-base --is-ancestor 46dddf75 d73940cf` returned success, so the
  local metadata closeout commit is already represented in the merged trunk
  history through the later integrated UI branch

### Helper branch contamination

- assigned helper branch:
  `codex/ui-canvas-ref-001-unblock-history-repair @ 6ea50dd2b3e5d7137b728672a8a160ff26bff925`
- merge-base with `origin/dev`:
  `6ea50dd2b3e5d7137b728672a8a160ff26bff925`
- current trunk tip:
  `origin/dev @ 8a40248967bdc37a60a22e6d37c8ad5dca02bd41`
- `git rev-list --left-right --count origin/dev...codex/ui-canvas-ref-001-unblock-history-repair`:
  `1 0`
- `git diff --name-only 8a402489..6ea50dd2` spans a large unrelated Stage 1 /
  BE referral hardening delta across API, workflows, docs, and referral embed
  runtime files, proving this helper branch is not a clean continuation of the
  UI unblock task
- remote helper ref absent:
  `git ls-remote --heads origin 'refs/heads/codex/ui-canvas-ref-001-unblock-history-repair'`
  returned no result

### Worktree contamination

- `git status --short` in the assigned helper worktree reports untracked:
  - `node_modules`
  - `apps/api/node_modules`
  - `apps/referral-embed-web/node_modules`
  - multiple sibling app/package `node_modules` directories
- this aligns with the parent task note that Turbopack and Playwright webServer
  behavior in the isolated worktree was affected by symlinked dependency
  resolution outside the worktree root

## Exact Contamination

The exact contamination is three-part:

1. Parent status drift: machine truth said commit `46dddf75` was already pushed
   to `origin/codex/ui-canvas-ref-001`, but the remote ref actually stopped at
   `3968700a`.
2. Helper branch ancestry drift: the assigned helper branch name matches the
   task, but its HEAD is the unrelated BE referral handoff commit `6ea50dd2`
   rather than `origin/dev @ 8a402489`, so the branch stem is correct while the
   ancestry is wrong.
3. Helper worktree hygiene drift: untracked `node_modules` across the isolated
   worktree create local execution noise that can be mistaken for application
   regressions.

This is branch/worktree/status contamination layered on top of an already
completed and merged UI implementation. It does not require force-pushing or
rewriting any shared history.

## Non-Destructive Repair Path

Do not force-push, rebase shared refs, or rewrite any merged branch.

1. Fast-forward push the missing parent closeout metadata commit from local
   `codex/ui-canvas-ref-001 @ 46dddf75` to
   `origin/codex/ui-canvas-ref-001`.
2. Treat `d73940cf` on `origin/dev` as the canonical merged implementation
   proof, and `46dddf75` on `origin/codex/ui-canvas-ref-001` as the canonical
   owner-closeout metadata proof.
3. Preserve the contaminated helper branch/worktree as audit evidence instead
   of trying to reuse it as parent delivery history.
4. Rebuild this helper packet additively on the assigned helper branch so there
   is a pushed remote evidence rail for
   `codex/ui-canvas-ref-001-unblock-history-repair`.
5. Update the parent task's machine-truth `next` field to point at the actual
   non-destructive replay path:
   - reference pushed branch `origin/codex/ui-canvas-ref-001`
   - reference pushed commit `46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`
   - replay lifecycle only: `handoff -> approve -> done`

## Concrete Parent Next Step

`UI-CANVAS-REF-001` should not try to close out from the contaminated helper
worktree. Its concrete next step is:

1. use pushed parent branch
   `origin/codex/ui-canvas-ref-001 @ 46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`
2. keep trunk evidence anchored on
   `origin/dev @ d73940cf129ce89ef1685cea9202f10a8f086c8c`
3. replay the parent lifecycle with machine truth only:
   - `AI_NAME=Codex scripts/ai-status.sh handoff UI-CANVAS-REF-001 Gemini2 "...46dddf75..."`
   - `AI_NAME=Gemini2 scripts/ai-status.sh approve UI-CANVAS-REF-001 "...46dddf75..."`
   - `AI_NAME=Codex COMMIT_HASH=46dddf75d9058cd35b65075e6aa3fe20d29e5a9d COMMIT_SUBJECT='UI-CANVAS-REF-001: sync owner closeout metadata' PUSH_REMOTE=origin PUSH_BRANCH=codex/ui-canvas-ref-001 INTEGRATION_STATUS=branch_pushed scripts/ai-status.sh done UI-CANVAS-REF-001 "..."`
4. ignore `codex/ui-canvas-ref-001-unblock-history-repair @ 6ea50dd2` for
   parent delivery; it is helper-task evidence only

## Why This Is Safe

- no shared branch is rewritten
- no force-push is required
- the merged UI implementation on `origin/dev` stays unchanged
- the parent closeout branch advances by a normal fast-forward push only
- the contaminated helper branch remains reachable for audit instead of being
  hidden
- the parent unblock path is lifecycle replay, not code replay

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show UI-CANVAS-REF-001`
  - `AI_NAME=Codex scripts/ai-status.sh show UI-CANVAS-REF-001-UNBLOCK-HISTORY-REPAIR`
- inspected branch/worktree state with:
  - `git branch --show-current`
  - `git status --short`
  - `git worktree list --porcelain`
  - `git log --oneline --decorate --graph --max-count=40 --all --grep='UI-CANVAS-REF-001'`
  - `git log --oneline --decorate --graph --max-count=25 codex/ui-canvas-ref-001-unblock-history-repair --`
  - `git rev-parse HEAD`
  - `git rev-parse origin/dev`
  - `git merge-base HEAD origin/dev`
  - `git rev-list --left-right --count origin/dev...codex/ui-canvas-ref-001-unblock-history-repair`
  - `git diff --name-only 8a402489..6ea50dd2`
  - `git show --stat --summary 6ea50dd2`
  - `git ls-remote --heads origin 'refs/heads/codex/ui-canvas-ref-001-unblock-history-repair'`
- inspected parent evidence with:
  - `git show-ref --verify refs/heads/codex/ui-canvas-ref-001`
  - `git rev-parse refs/heads/codex/ui-canvas-ref-001`
  - `git rev-parse refs/remotes/origin/codex/ui-canvas-ref-001`
  - `git rev-list --left-right --count origin/codex/ui-canvas-ref-001...codex/ui-canvas-ref-001`
  - `git show --stat --summary 46dddf75`
  - `git show --stat --summary 3968700a`
  - `git show --stat --summary d73940cf`
  - `git merge-base --is-ancestor 46dddf75 d73940cf`

No runtime tests were run in this helper task. This repair is branch/history
triage plus machine-truth evidence repair.
