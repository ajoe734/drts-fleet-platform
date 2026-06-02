# UI-FE-ADM-PARITY-HEALTH-20260602 Unblock History Repair

## Scope

- Task: `UI-FE-ADM-PARITY-HEALTH-20260602-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-FE-ADM-PARITY-HEALTH-20260602`
- Owner: `Codex`
- Reviewer: `Claude`
- Audit timestamp: `2026-06-02`

## Diagnosis

The parent is blocked by branch/worktree/commit contamination, not by a missing
task history-repair branch or by an already-pushed canonical owner commit.

1. The parent task machine truth says the latest anchor is `396edcff` with
   message `wip(UI-FE-ADM-PARITY-HEALTH-20260602): tighten health canvas parity`.
2. The actual parent branch
   `codex/ui-fe-adm-parity-health-20260602` is still at
   `3be8464262d315d57b1d42d004cc196d3578bf42` and has no task commit at all.
3. Commit `396edcff9cc89de7b3b1d4ee01a014b1240190ae` exists, but it is on the
   different branch `codex2/ui-fe-adm-parity-health-20260602`, together with
   the earlier anchor `92af30dd0a72bd019b5c523287b670f303e94008`.
4. The assigned parent worktree
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-fe-adm-parity-health-20260602`
   also contains an uncommitted `apps/platform-admin-web/app/health/page.tsx`
   diff that differs materially from the `codex2` branch tip.
5. The result is a three-way split: machine truth points at a `codex2` commit,
   the parent branch points at `origin/dev`, and the parent worktree contains a
   third uncommitted variant.

## Evidence

### Branch and worktree state

- parent branch and unblock helper branch:
  - `codex/ui-fe-adm-parity-health-20260602 @ 3be84642`
  - `codex/ui-fe-adm-parity-health-20260602-unblock-history-repair @ 3be84642`
- alternate lane branch with task commits:
  - `codex2/ui-fe-adm-parity-health-20260602 @ 396edcff`
- `git rev-list --left-right --count origin/dev...codex/ui-fe-adm-parity-health-20260602`
  returns `0 0`, proving the parent branch never advanced past `origin/dev`.
- `git rev-list --left-right --count origin/dev...codex2/ui-fe-adm-parity-health-20260602`
  returns `0 2`, proving the `codex2` lane has the only task commits.
- `git reflog show codex/ui-fe-adm-parity-health-20260602`
  shows only one event: branch created from `origin/dev` at `2026-06-02 13:52:35 +0000`.
- `git status --short` in the parent worktree shows:
  - `M apps/platform-admin-web/app/health/page.tsx`
- `git diff --no-index --stat <codex parent page> <codex2 page>`
  reports `663 insertions(+), 395 deletions(-)`, confirming the dirty parent
  worktree is not identical to the `codex2` branch tip.

### Commit provenance

- `git show --stat --summary 92af30dd`
  confirms `wip(UI-FE-ADM-PARITY-HEALTH-20260602): anchor health body parity`
  touched only `apps/platform-admin-web/app/health/page.tsx`.
- `git show --stat --summary 396edcff`
  confirms `wip(UI-FE-ADM-PARITY-HEALTH-20260602): tighten health canvas parity`
  is a follow-up commit on the same `codex2` branch.
- Both commits carry:
  - `LLM-Agent: codex2`
  - `Task-ID: UI-FE-ADM-PARITY-HEALTH-20260602`
  - `Reviewer: Claude`

## Exact Contamination

The contamination is the combination of three mismatches:

1. The parent task's recorded anchor commit lives on `codex2/...`, not on the
   assigned parent branch `codex/...`.
2. The assigned parent branch has no task history and is still identical to
   `origin/dev`.
3. The assigned parent worktree has an additional uncommitted `page.tsx`
   variant that diverges from the `codex2` branch tip by hundreds of changed
   lines.

This is why the parent stays blocked: there is no single canonical branch tip
that matches both machine truth and the current worktree.

## Non-Destructive Repair Path

Do not force-push, reset, or rewrite any branch. Repair by treating the
existing `codex2` commits as transplant source material and recreating a clean
canonical history on the assigned parent rail.

1. Keep this helper branch as audit evidence only.
2. Reuse the existing parent worktree:
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-fe-adm-parity-health-20260602`
   on branch `codex/ui-fe-adm-parity-health-20260602`.
3. Before changing anything else, inspect the dirty parent file against the
   `codex2` tip:
   `git diff codex2/ui-fe-adm-parity-health-20260602 -- apps/platform-admin-web/app/health/page.tsx`
4. Decide whether the dirty parent worktree contains intentional changes that
   must survive. There are two safe outcomes:
   - If the dirty parent diff is obsolete, discard only that file's local dirt
     by replacing it from `codex2/ui-fe-adm-parity-health-20260602`, then make
     a fresh canonical anchor commit on `codex/ui-fe-adm-parity-health-20260602`.
   - If the dirty parent diff contains intentional follow-up work, manually
     reconcile it with `396edcff`, then make a fresh canonical anchor commit on
     `codex/ui-fe-adm-parity-health-20260602`.
5. Preserve current refs by replaying content, not by moving branch names:
   the parent branch should gain new commits; the `codex2` branch should remain
   untouched as source evidence.
6. Push the repaired parent branch normally:
   `git push -u origin codex/ui-fe-adm-parity-health-20260602`
7. After that canonical push exists, update the parent task status so machine
   truth points at the pushed `codex/...` branch instead of the `codex2` WIP
   commits.

## Concrete Parent Next Step

Resume `UI-FE-ADM-PARITY-HEALTH-20260602` from the assigned parent worktree on
`codex/ui-fe-adm-parity-health-20260602`, compare its dirty `page.tsx` against
`codex2/ui-fe-adm-parity-health-20260602 @ 396edcff`, then create and push a
new canonical anchor commit on the `codex/...` branch that either:

- exactly replays the accepted `codex2` content, or
- reconciles that content with the dirty parent worktree if those extra changes
  are intentional.

The key unblock is: machine truth must stop treating `396edcff` on
`codex2/...` as if it were already on the canonical parent branch.

## Why This Is Safe

- No existing branch or remote ref is rewritten.
- No force-push is required.
- The `codex2` branch remains intact as historical evidence.
- The parent branch receives new canonical commits on its assigned rail.
- The dirty parent worktree is explicitly reconciled instead of being silently
  overwritten.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md` and
  `.orchestrator/skills/worker-anchor-commit.md`
- Confirmed task and parent machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show UI-FE-ADM-PARITY-HEALTH-20260602-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex scripts/ai-status.sh show UI-FE-ADM-PARITY-HEALTH-20260602`
- Inspected branch/worktree state:
  - `git branch --show-current`
  - `git branch -vv | grep 'ui-fe-adm-parity-health-20260602'`
  - `git worktree list --porcelain`
  - `git status --short`
  - `git reflog show --date=iso codex/ui-fe-adm-parity-health-20260602`
  - `git rev-list --left-right --count origin/dev...codex/ui-fe-adm-parity-health-20260602`
  - `git rev-list --left-right --count origin/dev...codex2/ui-fe-adm-parity-health-20260602`
  - `git merge-base codex/ui-fe-adm-parity-health-20260602 codex2/ui-fe-adm-parity-health-20260602`
- Confirmed commit placement and provenance:
  - `git show --stat --summary 92af30dd`
  - `git show --stat --summary 396edcff`
  - `git show --no-patch --format=fuller 92af30dd`
  - `git show --no-patch --format=fuller 396edcff`
- Confirmed worktree divergence between the `codex` and `codex2` variants:
  - `git diff codex2/ui-fe-adm-parity-health-20260602 -- apps/platform-admin-web/app/health/page.tsx`
  - `git diff --no-index --stat <codex parent page> <codex2 page>`
