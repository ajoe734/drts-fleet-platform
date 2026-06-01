# Platform Admin Rebuild — Closeout Audit (2026-06-01)

Owner: Codex  
Reviewer target: Codex2  
Task: `UI-FE-ADM-UMBRELLA`

## Status

Umbrella closeout is **not ready** to move to `review` or `done` as of 2026-06-01.

What is verified in this pass:

- machine truth for `UI-FE-ADM-UMBRELLA` is now `owner=Codex`, `reviewer=Codex2`, `status=in_progress`
- the 17 previously missing `UI-FE-ADM-*` dependency task rows were re-materialized into machine truth via `scripts/ai-status.sh assign`
- `UI-FE-ADM-TENID` auto-reconciled to `done` from `origin/dev@98e1f140b7b3`, so all 18 dependency IDs now resolve in the task board
- reimbursement queue/detail routes were restored onto this umbrella branch from commits `ff528b79` and `d262f6ad`
- the assigned branch is `codex/ui-fe-adm-umbrella` in the isolated worker worktree
- `python3 scripts/ensure-local-node-modules.py repair` passed
- `pnpm --filter @drts/platform-admin-web typecheck` passed
- `pnpm --filter @drts/platform-admin-web build` passed
- `pnpm --filter @drts/platform-admin-web test` passed with no test files
- `pnpm --filter @drts/ui-web build-storybook` passed

What still blocks formal closeout:

- the task board now resolves all 18 dependency IDs, but only `UI-FE-ADM-REIMBID` and `UI-FE-ADM-TENID` are `done`; the rest remain `backlog` or `in_progress`
- a fresh `python3 scripts/ai_status.py reconcile-from-git origin/dev` still reports `no drift found against origin/dev` after the task-row repair
- commit ancestry against `origin/dev` does not support the umbrella acceptance claim that all 18 Platform Admin sub-tasks are done on trunk
- the current branch `HEAD` includes the reimbursement route restores, but the branch is still not descended from the earlier local umbrella closeout commit `0b226f5c`
- no clean smoke-test result exists for this pass, and there is no local API target listening on `http://localhost:3001`

## Branch Reality

The current branch tip is:

```text
d262f6ad UI-FE-ADM-REIMBID: build Reimbursement batch detail (NEW) page
```

`git merge-base --is-ancestor 0b226f5c HEAD` returned exit status `1`, so the earlier local closeout commit
`0b226f5c UI-FE-ADM-UMBRELLA: close out platform admin rebuild` is not part of the branch currently assigned to this task.

The present `next build` route manifest contains:

- `/`
- `/adapter-registry`
- `/audit`
- `/feature-flags`
- `/fleet`
- `/health`
- `/notices`
- `/partners`
- `/partners/[entrySlug]`
- `/payments`
- `/payments/reimbursements`
- `/payments/reimbursements/[batchId]`
- `/pricing`
- `/switchboard`
- `/tenant-governance`
- `/tenants`
- `/tenants/[tenantId]`
- `/users`

So the earlier reimbursement-route gap on this umbrella branch is now closed.

## Dependency Audit

The umbrella task still names these dependency IDs:

- `UI-FE-ADM-HOME`
- `UI-FE-ADM-TEN`
- `UI-FE-ADM-TENID`
- `UI-FE-ADM-TENGOV`
- `UI-FE-ADM-PRT`
- `UI-FE-ADM-PRTID`
- `UI-FE-ADM-USR`
- `UI-FE-ADM-FLT`
- `UI-FE-ADM-SWB`
- `UI-FE-ADM-PRC`
- `UI-FE-ADM-PAY`
- `UI-FE-ADM-REIMB`
- `UI-FE-ADM-REIMBID`
- `UI-FE-ADM-HLT`
- `UI-FE-ADM-NTC`
- `UI-FE-ADM-AUD`
- `UI-FE-ADM-FF`
- `UI-FE-ADM-ADP`

Current machine truth now resolves all dependency IDs plus the umbrella:

- `UI-FE-ADM-UMBRELLA`
- `UI-FE-ADM-HOME`
- `UI-FE-ADM-TEN`
- `UI-FE-ADM-TENID`
- `UI-FE-ADM-TENGOV`
- `UI-FE-ADM-PRT`
- `UI-FE-ADM-PRTID`
- `UI-FE-ADM-USR`
- `UI-FE-ADM-FLT`
- `UI-FE-ADM-SWB`
- `UI-FE-ADM-PRC`
- `UI-FE-ADM-PAY`
- `UI-FE-ADM-REIMB`
- `UI-FE-ADM-REIMBID`
- `UI-FE-ADM-HLT`
- `UI-FE-ADM-NTC`
- `UI-FE-ADM-AUD`
- `UI-FE-ADM-FF`
- `UI-FE-ADM-ADP`

Current machine-truth status split after the repair:

- `done`: `UI-FE-ADM-TENID`, `UI-FE-ADM-REIMBID`
- `in_progress`: `UI-FE-ADM-UMBRELLA`, `UI-FE-ADM-HOME`, `UI-FE-ADM-TEN`, `UI-FE-ADM-PRT`, `UI-FE-ADM-PRTID`
- `backlog`: `UI-FE-ADM-TENGOV`, `UI-FE-ADM-USR`, `UI-FE-ADM-FLT`, `UI-FE-ADM-SWB`, `UI-FE-ADM-PRC`, `UI-FE-ADM-PAY`, `UI-FE-ADM-REIMB`, `UI-FE-ADM-HLT`, `UI-FE-ADM-NTC`, `UI-FE-ADM-AUD`, `UI-FE-ADM-FF`, `UI-FE-ADM-ADP`

That repairs the earlier "missing dependency IDs" blocker, but the acceptance item "All 18 sub-tasks done" still cannot be demonstrated from machine truth.

Separately, a git-history spot check found many local Platform Admin closeout commits across branches, but ancestry checks showed they are mostly **not** ancestors of `origin/dev`. In the sampled set for this pass, only `98e1f140` was an ancestor of `origin/dev`, and that commit is an auto-anchor for `UI-FE-ADM-TENID`, not a final closeout signal for the full umbrella dependency set.

## Verification Evidence

Commands run in this pass:

```bash
AI_NAME=Codex scripts/ai-status.sh start UI-FE-ADM-UMBRELLA "verify dependency completion and prepare platform admin closeout"
AI_NAME=Codex scripts/ai-status.sh show UI-FE-ADM-UMBRELLA
python3 scripts/ai_status.py list | grep 'UI-FE-ADM-'
python3 -c "import importlib.util, pathlib, os, subprocess, sys; ..."
python3 scripts/ai_status.py reconcile-from-git origin/dev
git log --all --grep='UI-FE-ADM-' --format='%h %s'
git merge-base --is-ancestor 0b226f5c HEAD
git cherry-pick 82e49183 9129ead3
python3 scripts/ensure-local-node-modules.py repair
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web build
pnpm --filter @drts/platform-admin-web test
pnpm --filter @drts/ui-web build-storybook
curl -fsS http://localhost:3001/health
curl -fsS http://localhost:3001/api/health
```

Results:

- `ai-status.sh start/show`: passed
- task-row repair command: passed for all 17 missing dependency IDs
- `ai_status.py list`: now shows all 18 Platform Admin dependency IDs plus the umbrella
- `reconcile-from-git origin/dev`: still reports `no drift found against origin/dev` after the task-row repair
- `git log --all --grep='UI-FE-ADM-'`: showed local closeout history on multiple branches
- `git cherry-pick 82e49183 9129ead3`: passed cleanly and restored both reimbursement routes onto this branch
- `git merge-base --is-ancestor 0b226f5c HEAD`: failed ancestry check for the earlier umbrella closeout commit
- `ensure-local-node-modules.py repair`: passed
- `@drts/platform-admin-web typecheck`: passed after route restoration
- `@drts/platform-admin-web build`: passed after route restoration and emitted the 18-route manifest listed above
- `@drts/platform-admin-web test`: passed with no test files
- `@drts/ui-web build-storybook`: passed and emitted `packages/ui-web/storybook-static`
- `curl http://localhost:3001/health` and `/api/health`: both failed to connect, so no smoke target was available

## Required Next Steps

Before `UI-FE-ADM-UMBRELLA` can move to review:

1. convert the remaining Platform Admin dependency rows from `backlog`/`in_progress` to real `done` evidence, either by merging valid closeout commits to `origin/dev` or by explicitly reconciling the umbrella dependency set to the canonical shipped tasks
2. prepare a live API target and run `./scripts/run-smoke-tests.sh` cleanly
3. only after the above should the owner hand off the task to `Codex2` for review
