# P2-DP-S1-001 Unblock History Repair

## Scope

- Task: `P2-DP-S1-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-DP-S1-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-26T11:14:00Z`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-p2-dp-s1-001-unblock-history-repair`
- Assigned helper branch:
  `codex2/p2-dp-s1-001-unblock-history-repair`

## Diagnosis

`P2-DP-S1-001` is blocked by branch contamination on the pushed parent branch,
not by missing disclosure-policy code.

1. The parent machine status already says the accepted closeout commit
   `0c94ddefc` is on `origin/codex2/p2-dp-s1-001`, but the branch tip is not
   that closeout. The remote branch now points at merge commit `7af85c58a`.
2. `7af85c58a` is a merge of current `origin/dev` into the parent branch. The
   merged trunk side contributes unrelated `P2-UI-OPS-001` commits:
   `b79b469f1` (`P2-UI-OPS-001: ops-console AV fallback / passenger recovery
   (#918)`) and `5bdb8c636` (`P2-UI-OPS-001: fix fallback ETA i18n guard
   (#919)`).
3. Because of that merge, `origin/codex2/p2-dp-s1-001` is now `ahead 11 / behind
   0` versus `origin/dev`, and its tree includes unrelated ops-console /
   roc-operations changes that do not belong to `P2-DP-S1-001`.
4. The contamination is no longer provable from
   `git diff origin/dev...origin/codex2/p2-dp-s1-001` alone, because current
   `origin/dev` already contains `b79b469f1` and `5bdb8c636`. The correct proof
   is instead the contaminated merge commit itself (`7af85c58a`) plus the
   delta from the clean disclosure-only lineage
   `origin/codex2/p2-dp-s1-001-final...origin/codex2/p2-dp-s1-001`, which
   still shows the ops-console / roc-operations surfaces mixed into the parent
   branch tip.
5. Two older clean disclosure lineages still exist:
   `origin/codex2/p2-dp-s1-001-closeout @ aba1ba321` and
   `origin/codex2/p2-dp-s1-001-final @ eac1fbf3d`. Both avoid the
   `P2-UI-OPS-001` files, but neither is the branch currently referenced by the
   blocked parent task.
6. The helper branch for this unblock task was created correctly from
   `origin/dev @ 5bdb8c636`, so the history problem is isolated to the parent
   branch and not to the helper worktree itself.

## Evidence

### Parent machine-truth state

- `AI_NAME=Codex2 scripts/ai-status.sh show P2-DP-S1-001` reports status
  `blocked` with `next`:
  - closeout commit `0c94ddefc` is already on `origin/codex2/p2-dp-s1-001`
  - branch protection rejected direct integration because branch tip
    `7af85c58a` is a merge commit and remote reported failing required checks

### Branch and worktree state

- `origin/dev @ 5bdb8c63697e384d415db44579beb7c6c06d2ec7`
- `origin/codex2/p2-dp-s1-001 @ 7af85c58ae792a71098b3b3e5bf39e21357e764f`
- `origin/codex2/p2-dp-s1-001-final @ eac1fbf3df857f302481c0c437870a7b56a2d4eb`
- `origin/codex2/p2-dp-s1-001-closeout @ aba1ba32111368c264af87b3b8dc4dde16010f3a`
- helper branch
  `codex2/p2-dp-s1-001-unblock-history-repair @ 5bdb8c63697e384d415db44579beb7c6c06d2ec7`
- `git rev-list --left-right --count origin/dev...codex2/p2-dp-s1-001`
  returns `0 11`
- `git rev-list --left-right --count origin/dev...codex2/p2-dp-s1-001-final`
  returns `2 3`
- `git rev-list --left-right --count origin/dev...codex2/p2-dp-s1-001-closeout`
  returns `2 4`
- `git merge-base --all codex2/p2-dp-s1-001 origin/dev`
  returns current `origin/dev`, proving the contaminated branch absorbed trunk
  instead of staying on a task-only line
- `git branch --contains 0c94ddefc` returns only `codex2/p2-dp-s1-001`
- `git branch --contains eac1fbf3d` returns only
  `codex2/p2-dp-s1-001-final`
- `git branch --contains aba1ba321` returns only
  `codex2/p2-dp-s1-001-closeout`

### Exact contamination chain

- `git log --reverse --format='%H %s' codex2/p2-dp-s1-001 --not codex2/p2-dp-s1-001-final`
  shows the contaminated branch appended:
  - disclosure stack through `0c94ddefc`
  - `e94d8bfb1` merge from an older `origin/dev`
  - `607fe7e84`, `4530dc20d`, `bc31425b1`, `46f1a2070`, `0c94ddefc`
  - unrelated `P2-UI-OPS-001` commits `b79b469f1` and `5bdb8c636`
  - final merge tip `7af85c58a`
- `git show --stat 7af85c58a --` includes:
  - `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`
  - `apps/ops-console-web/lib/translations.ts`
  - `apps/ops-console-web/tsconfig.json`
  - `apps/api/src/modules/roc-operations/roc-operations.controller.ts`
  - `apps/api/src/modules/roc-operations/roc-operations.service.ts`
  - `apps/api/tests/integration/int-p2-008-roc-human-fallback-route.test.ts`
- `git diff --name-only origin/dev...codex2/p2-dp-s1-001-final` shows only
  disclosure-policy surfaces under:
  - `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
  - `apps/api/src/modules/sandbox-dispatch-gate/*`
  - `apps/api/src/modules/owned-mobility/*`
  - related disclosure tests and migration
- `git diff --name-only origin/dev...codex2/p2-dp-s1-001` now shows only the
  disclosure-policy surfaces above, because trunk already absorbed
  `b79b469f1` and `5bdb8c636`. That diff therefore no longer isolates the
  contamination by itself.
- `git diff --name-only origin/codex2/p2-dp-s1-001-final...origin/codex2/p2-dp-s1-001`
  still adds the unrelated files from the contaminated tip:
  - `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`
  - `apps/ops-console-web/lib/translations.ts`
  - `apps/ops-console-web/tsconfig.json`
  - `apps/api/src/modules/roc-operations/roc-operations.controller.ts`
  - `apps/api/src/modules/roc-operations/roc-operations.service.ts`
  - `apps/api/tests/integration/int-p2-008-roc-human-fallback-route.test.ts`
  This proves the parent tip is a mixed disclosure + `P2-UI-OPS-001` branch
  even after `origin/dev` advanced.

### Tree divergence

- `git rev-parse codex2/p2-dp-s1-001^{tree}`
  = `361b0579d35a62ecfdae49c8628b01fa9fe91788`
- `git rev-parse codex2/p2-dp-s1-001-final^{tree}`
  = `3926eef34b4fde93b301c13d003ac25db68bc42b`
- `git rev-parse codex2/p2-dp-s1-001-closeout^{tree}`
  = `f4304745df524bf80761fc713fbce1b850c4ad6b`
- `git rev-parse origin/dev^{tree}`
  = `ac5a158e47ad28979f475441629fc12b08a49265`

The parent branch tree is therefore neither trunk nor one of the clean
disclosure-only trees. It is its own merged composite.

## Exact Contamination

The exact blocker is:

1. Parent closeout commit `0c94ddefc` exists on the shared branch, but it is no
   longer the branch tip.
2. The shared branch was later merged with `origin/dev`, producing
   `7af85c58a`.
3. That merge imported unrelated `P2-UI-OPS-001` code and test surfaces into
   the parent branch.
4. Branch protection and required checks therefore evaluate a mixed branch
   history instead of a task-scoped disclosure-only branch.

This is commit/branch contamination on the existing shared rail. The helper
worktree itself is clean.

## Non-Destructive Repair Path

Do not force-push, rebase, or rewrite `origin/codex2/p2-dp-s1-001`.

1. Freeze `origin/codex2/p2-dp-s1-001 @ 7af85c58a` as audit evidence of the
   contaminated branch tip and preserve `0c94ddefc` as the accepted closeout
   commit inside that history.
2. Start a fresh replay branch from current `origin/dev`:

```bash
git fetch origin
git switch -c codex2/p2-dp-s1-001-replay origin/dev
```

3. Replay only the disclosure-policy commits, not the merge commits and not the
   `P2-UI-OPS-001` commits. The safest replay source is the clean
   `origin/codex2/p2-dp-s1-001-final` lineage:

```bash
git cherry-pick 33dfddd02
git cherry-pick 9ab857567
git cherry-pick eac1fbf3d
```

4. If the owner specifically needs the later disclosure-hardening fixes from the
   contaminated branch, port them selectively from the task-only commits
   `607fe7e84`, `4530dc20d`, `bc31425b1`, `46f1a2070`, and `0c94ddefc`, but
   skip both merge commits (`e94d8bfb1`, `7af85c58a`) and skip
   `b79b469f1` / `5bdb8c636`.
5. Run the disclosure-policy checks on the replay branch, then push it:

```bash
git push -u origin codex2/p2-dp-s1-001-replay
```

6. Open a normal PR from the replay branch to `dev`:

```bash
gh pr create \
  --base dev \
  --head codex2/p2-dp-s1-001-replay \
  --title "P2-DP-S1-001: replay disclosure policy branch without ops-console contamination" \
  --body "Supersedes contaminated branch origin/codex2/p2-dp-s1-001 @ 7af85c58a. Replays the accepted disclosure-policy stack on current dev without force-pushing shared history."
```

7. Re-run the parent review/closeout flow against the clean replay branch
   instead of the contaminated original branch.

## Concrete Parent Next Step

`P2-DP-S1-001` should stop trying to integrate directly from
`origin/codex2/p2-dp-s1-001 @ 7af85c58a`.

Concrete next step:

1. Create `codex2/p2-dp-s1-001-replay` from current `origin/dev`.
2. Cherry-pick `33dfddd02`, `9ab857567`, and `eac1fbf3d` from the clean final
   branch.
3. If needed, selectively port task-only post-final fixes from `607fe7e84`,
   `4530dc20d`, `bc31425b1`, `46f1a2070`, and `0c94ddefc`, but do not replay
   `e94d8bfb1`, `b79b469f1`, `5bdb8c636`, or `7af85c58a`.
4. Push the replay branch, open a PR to `dev`, and hand off review on that new
   branch.
5. After the replay branch merges to `dev`, rerun parent closeout with
   `INTEGRATION_STATUS=merged_to_dev`.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The contaminated branch remains reachable for audit.
- The replay path preserves a clean task-only delivery rail.
- Unrelated `P2-UI-OPS-001` changes stay on trunk where they already belong
  instead of being smuggled through the disclosure-policy branch.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-DP-S1-001-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-DP-S1-001`
- Inspected refs and worktrees:
  - `git branch --show-current`
  - `git status --short`
  - `git worktree list --porcelain`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' ...`
  - `git merge-base --all codex2/p2-dp-s1-001 origin/dev`
  - `git merge-base --all codex2/p2-dp-s1-001-final origin/dev`
  - `git merge-base --all codex2/p2-dp-s1-001-closeout origin/dev`
  - `git rev-list --left-right --count origin/dev...codex2/p2-dp-s1-001`
  - `git rev-list --left-right --count origin/dev...codex2/p2-dp-s1-001-final`
  - `git rev-list --left-right --count origin/dev...codex2/p2-dp-s1-001-closeout`
  - `git log --oneline --decorate --graph --max-count=40 --all --branches='codex2/p2-dp-s1-001*' --branches='origin/dev'`
  - `git log --reverse --format='%H %s' codex2/p2-dp-s1-001 --not codex2/p2-dp-s1-001-final`
  - `git show --stat 7af85c58a --`
  - `git diff --name-status origin/dev...origin/codex2/p2-dp-s1-001`
  - `git diff --name-status origin/codex2/p2-dp-s1-001-final...origin/codex2/p2-dp-s1-001`
  - `git show --stat 0c94ddefc --`
  - `git show --stat eac1fbf3d --`
  - `git show --stat aba1ba321 --`
  - `git branch --contains 0c94ddefc`
  - `git branch --contains eac1fbf3d`
  - `git branch --contains aba1ba321`
  - `git rev-parse codex2/p2-dp-s1-001^{tree}`
  - `git rev-parse codex2/p2-dp-s1-001-final^{tree}`
  - `git rev-parse codex2/p2-dp-s1-001-closeout^{tree}`
  - `git rev-parse origin/dev^{tree}`
- Compared clean versus contaminated task surfaces:
  - `git diff --stat origin/dev...codex2/p2-dp-s1-001-final`
  - `git diff --stat origin/dev...codex2/p2-dp-s1-001-closeout`
  - `git diff --stat origin/dev...codex2/p2-dp-s1-001`
  - `git diff --name-only origin/dev...codex2/p2-dp-s1-001-final`
  - `git diff --name-only origin/dev...codex2/p2-dp-s1-001`
