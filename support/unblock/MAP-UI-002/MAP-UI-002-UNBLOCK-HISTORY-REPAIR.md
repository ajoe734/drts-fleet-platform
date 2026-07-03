# MAP-UI-002 Unblock History Repair

## Scope

- Task: `MAP-UI-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `MAP-UI-002`
- Owner: `Codex2`
- Reviewer: `Claude2`
- Audit timestamp: `2026-07-03T14:05:00Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-ui-002-unblock-history-repair`
- Assigned helper branch:
  `codex2/map-ui-002-unblock-history-repair`

## Diagnosis

`MAP-UI-002` is not blocked by a broken Git object or a force-push requirement.
It is blocked by branch-role contamination: the repo now has multiple
`map-ui-002*` rails that look canonical, but they do not represent the same
delivery state.

1. The parent owner rail is `origin/codex2/map-ui-002 @ cdab1e5a0`. It is
   exactly three commits ahead of `origin/dev @ f452f019f` and contains the
   primitive delivery plus the owner closeout commit:
   - `6aa1c56ca feat(MAP-UI-002): add geometry editor primitive`
   - `71c2b707a MAP-UI-002: extract geometry editor core for unit gate`
   - `cdab1e5a0 closeout(MAP-UI-002): finalize owner review-approved branch`
2. The hardening rail is `origin/codex2/map-ui-002-harden-001 @ a9c12be12`. It
   is two commits ahead of `origin/dev`, but it is not a descendant of the
   parent owner rail. Relative to `origin/codex2/map-ui-002`, it diverges by
   `3 left / 2 right`.
3. The integration rail is `origin/codex/map-ui-002-integrate-001 @ 4c08c6a28`.
   It was built directly from `origin/dev`, not from either Codex2 closeout
   rail. Relative to `origin/dev`, it is `1 behind / 2 ahead`. Relative to
   `origin/codex2/map-ui-002-harden-001`, it diverges by `3 left / 2 right`.
4. The attached integration worktree
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-map-ui-002-integrate-001`
   has unpublished local commits on top of that remote rail:
   - `75842fc3f wip(MAP-UI-002-HARDEN-001): anchor geometry editor hardening`
   - `95dc9c7a9 MAP-UI-002-INTEGRATE-001: close geometry editor integration`
   - `9dc1dbfa5 MAP-UI-002-INTEGRATE-001: refresh closeout evidence after dev rebase`
   - `e61d90579 MAP-UI-002-INTEGRATE-001: preserve branch ancestry after dev rebase`
   These commits are not on `origin/codex/map-ui-002-integrate-001`.
5. The current integration closeout evidence cites hardening anchor commits
   `414f27484` / `75842fc3f`, not the pushed hardening closeout
   `a9c12be12`. That means the integration rail is tracking an intermediate
   hardening state instead of the formal Codex2 closeout.
6. There is also local branch-name noise on the same task stem:
   - `claude2/map-ui-002 @ f452f019f [origin/dev]`
   - `claude2/map-ui-002-integrate-001 @ f452f019f [origin/dev]`
   These names look task-specific but currently point to plain `origin/dev`,
   making branch-name-only resumption unsafe.

## Exact Contamination

The exact contamination is a control-plane/history split across three
canonical-looking rails:

1. `origin/codex2/map-ui-002` is the only pushed owner closeout for the parent
   task.
2. `origin/codex2/map-ui-002-harden-001` is a second pushed closeout rail for
   the same deliverable family, but it does not descend from the parent owner
   rail.
3. `origin/codex/map-ui-002-integrate-001` is a third rail that replays the
   feature from `origin/dev` and uses hardening anchor commits instead of the
   pushed hardening closeout.
4. The live integration worktree contains additional unpublished commits beyond
   the remote integration branch, so branch name alone does not identify the
   true latest integration state.
5. Same-stem local refs such as `claude2/map-ui-002` and
   `claude2/map-ui-002-integrate-001` alias `origin/dev`, increasing the chance
   of resuming the wrong rail.

This is why the parent stays blocked even though multiple `map-ui-002*` refs
exist: there is no single non-ambiguous branch that both represents the final
Codex2 closeouts and carries the downstream integration work.

## Non-Destructive Repair Path

Do not force-push, rebase shared remote history in place, or rename the pushed
Codex2 rails.

1. Keep `origin/codex2/map-ui-002 @ cdab1e5a0` as the canonical parent owner
   rail for `MAP-UI-002`.
2. Keep `origin/codex2/map-ui-002-harden-001 @ a9c12be12` as the canonical
   hardening closeout rail.
3. Treat `origin/codex/map-ui-002-integrate-001 @ 4c08c6a28` as a stale
   integration replay, not as the canonical parent rail.
4. Resume integration work only from the dedicated integration worktree/branch,
   but rebuild it on top of the pushed Codex2 closeouts with normal commits:

```bash
git fetch origin --prune
git switch codex/map-ui-002-integrate-001
git rebase --onto origin/codex2/map-ui-002-harden-001 origin/dev
```

5. If the rebase is noisy or the owner prefers a cleaner rail, create a fresh
   non-destructive integration branch from
   `origin/codex2/map-ui-002-harden-001` and cherry-pick only the true
   integration-only commits (`MAP-UI-002-INTEGRATE-001:*`, Storybook preview,
   closeout evidence). Do not replay the older hardening anchors.
6. After that normal rebase or replay, push the integration branch with a
   regular non-force push and open or update its PR to `dev`.
7. Downstream tasks must reference the integration rail only after it contains
   both pushed Codex2 closeouts and its own integration-only commits.

## Concrete Parent Next Step

`MAP-UI-002` should stay blocked for integration closeout, but its next
actionable step is now unambiguous:

1. Treat `origin/codex2/map-ui-002 @ cdab1e5a0` as the historical parent owner
   closeout.
2. Do not resume from `claude2/map-ui-002`, `claude2/map-ui-002-integrate-001`,
   or the stale remote `origin/codex/map-ui-002-integrate-001` as-is.
3. Ask the `MAP-UI-002-INTEGRATE-001` owner to rebase or replay that branch on
   top of `origin/codex2/map-ui-002-harden-001 @ a9c12be12`, then push and open
   the integration PR to `dev`.
4. Once the integration PR exists and references the pushed Codex2 closeouts,
   `MAP-UI-002` can cite that branch as its concrete downstream resume rail
   instead of staying blocked on ambiguous branch history.

## Why This Is Safe

- No shared remote ref is rewritten.
- No force-push is required.
- The existing Codex2 closeout branches remain auditable.
- The integration task keeps ownership of integration-only commits.
- The repair turns ambiguous branch names into an explicit parent rail and an
  explicit integration rail.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-UI-002-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-UI-002`
  - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-UI-002-HARDEN-001`
  - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-UI-002-INTEGRATE-001`
- Inspected related refs and worktrees:
  - `git fetch origin --prune`
  - `git branch -vv | grep 'map-ui-002'`
  - `git worktree list --porcelain`
  - `git ls-remote --heads origin 'refs/heads/codex2/map-ui-002' 'refs/heads/codex2/map-ui-002-harden-001' 'refs/heads/codex/map-ui-002-integrate-001'`
  - `git rev-list --left-right --count origin/dev...origin/codex2/map-ui-002`
  - `git rev-list --left-right --count origin/dev...origin/codex2/map-ui-002-harden-001`
  - `git rev-list --left-right --count origin/dev...origin/codex/map-ui-002-integrate-001`
  - `git rev-list --left-right --count origin/codex2/map-ui-002...origin/codex2/map-ui-002-harden-001`
  - `git rev-list --left-right --count origin/codex2/map-ui-002-harden-001...codex/map-ui-002-integrate-001`
  - `git log --oneline origin/dev..origin/codex2/map-ui-002`
  - `git log --oneline origin/codex2/map-ui-002..origin/codex2/map-ui-002-harden-001`
  - `git log --oneline origin/codex2/map-ui-002-harden-001..codex/map-ui-002-integrate-001`
  - `git reflog show --date=iso codex2/map-ui-002-unblock-history-repair`
  - `git status --short` and `git log --oneline --graph --decorate --max-count=20` inside `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-map-ui-002-integrate-001`
- Inspected commit/evidence content:
  - `git show --stat --summary --format=fuller cdab1e5a0`
  - `git show --stat --summary --format=fuller a9c12be12`
  - `git show --stat --summary --format=fuller 4c08c6a28`
  - `sed -n '1,240p' support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md` from the integration worktree

No runtime/package tests were run in this helper task. This repair is
branch-history and machine-truth triage only.
