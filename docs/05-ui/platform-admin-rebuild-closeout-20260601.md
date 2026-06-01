# Platform Admin Rebuild — Closeout Audit (2026-06-01)

Owner: Codex  
Reviewer target: Codex2  
Task: `UI-FE-ADM-UMBRELLA`

## Status

Umbrella closeout is **not ready** to move to `review` or `done` as of 2026-06-01.

What is verified in this pass:

- machine truth for `UI-FE-ADM-UMBRELLA` is now `owner=Codex`, `reviewer=Codex2`, `status=in_progress`
- the assigned branch is `codex/ui-fe-adm-umbrella` in the isolated worker worktree
- `python3 scripts/ensure-local-node-modules.py repair` passed
- `pnpm --filter @drts/platform-admin-web typecheck` passed
- `pnpm --filter @drts/platform-admin-web build` passed
- `pnpm --filter @drts/platform-admin-web test` passed with no test files
- `pnpm --filter @drts/ui-web build-storybook` passed

What still blocks formal closeout:

- machine truth still contains only `UI-FE-ADM-UMBRELLA` and `UI-FE-ADM-REIMBID`; the other 17 dependency task IDs named on the umbrella do not exist in the current task board
- `python3 scripts/ai_status.py reconcile-from-git origin/dev` still reports `no drift found against origin/dev`
- commit ancestry against `origin/dev` does not support the umbrella acceptance claim that all 18 Platform Admin sub-tasks are done on trunk
- the current branch `HEAD` is `749070cc`, which is not descended from the earlier local umbrella closeout commit `0b226f5c`
- the current branch tree does not contain `apps/platform-admin-web/app/payments/reimbursements/page.tsx` or `apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`
- no clean smoke-test result exists for this pass, and there is no local API target listening on `http://localhost:3001`

## Branch Reality

The current branch tip is:

```text
749070cc wip(UI-FE-ADM-UMBRELLA): anchor blocker audit
```

`git merge-base --is-ancestor 0b226f5c HEAD` returned exit status `1`, so the earlier local closeout commit
`0b226f5c UI-FE-ADM-UMBRELLA: close out platform admin rebuild` is not part of the branch currently assigned to this task.

That matters because the present `next build` route manifest contains:

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
- `/pricing`
- `/switchboard`
- `/tenant-governance`
- `/tenants`
- `/tenants/[tenantId]`
- `/users`

It does **not** contain `/payments/reimbursements` or `/payments/reimbursements/[batchId]`, and the corresponding route files are absent from the working tree.

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

Current machine truth only resolves:

- `UI-FE-ADM-UMBRELLA`
- `UI-FE-ADM-REIMBID`

The remaining 17 dependency IDs are absent from the task board, so the acceptance item "All 18 sub-tasks done" cannot be demonstrated from machine truth.

Separately, a git-history spot check found many local Platform Admin closeout commits across branches, but ancestry checks showed they are mostly **not** ancestors of `origin/dev`. In the sampled set for this pass, only `98e1f140` was an ancestor of `origin/dev`, and that commit is an auto-anchor for `UI-FE-ADM-TENID`, not a final closeout signal for the full umbrella dependency set.

## Verification Evidence

Commands run in this pass:

```bash
AI_NAME=Codex scripts/ai-status.sh start UI-FE-ADM-UMBRELLA "verify dependency completion and prepare platform admin closeout"
AI_NAME=Codex scripts/ai-status.sh show UI-FE-ADM-UMBRELLA
python3 scripts/ai_status.py list | grep 'UI-FE-ADM-'
python3 scripts/ai_status.py reconcile-from-git origin/dev
git log --all --grep='UI-FE-ADM-' --format='%h %s'
git merge-base --is-ancestor 0b226f5c HEAD
test -f apps/platform-admin-web/app/payments/reimbursements/page.tsx
test -f apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx
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
- `ai_status.py list`: showed only `UI-FE-ADM-UMBRELLA` and `UI-FE-ADM-REIMBID`
- `reconcile-from-git origin/dev`: passed with `no drift found against origin/dev`
- `git log --all --grep='UI-FE-ADM-'`: showed local closeout history on multiple branches
- `git merge-base --is-ancestor 0b226f5c HEAD`: failed ancestry check for the earlier umbrella closeout commit
- reimbursement route file presence checks: both missing
- `ensure-local-node-modules.py repair`: passed
- `@drts/platform-admin-web typecheck`: passed
- `@drts/platform-admin-web build`: passed and emitted the 16-route manifest listed above
- `@drts/platform-admin-web test`: passed with no test files
- `@drts/ui-web build-storybook`: passed and emitted `packages/ui-web/storybook-static`
- `curl http://localhost:3001/health` and `/api/health`: both failed to connect, so no smoke target was available

## Required Next Steps

Before `UI-FE-ADM-UMBRELLA` can move to review:

1. restore or reconcile the 17 missing Platform Admin dependency tasks into machine truth, or explicitly replace the umbrella dependency list with the canonical current task IDs
2. integrate the missing Platform Admin route work onto the assigned branch so the actual working tree matches the intended umbrella surface, including reimbursement routes if they remain in scope
3. prepare a live API target and run `./scripts/run-smoke-tests.sh` cleanly
4. only after the above should the owner hand off the task to `Codex2` for review
