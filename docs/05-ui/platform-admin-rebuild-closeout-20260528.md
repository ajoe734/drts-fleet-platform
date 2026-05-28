# Platform Admin Rebuild — Closeout Audit (2026-05-28)

Owner: Codex  
Reviewer target: Claude2  
Task: `UI-FE-ADM-UMBRELLA`

## Status

Umbrella closeout is **not ready** to move to `review` or `done`.

What is complete in this audit pass:

- machine truth ownership was reassigned to `Codex` per dispatch and the umbrella task was moved to `in_progress`
- the platform-admin route surface was verified in `apps/platform-admin-web`
- local dependency installation was repaired in this worktree with `python3 scripts/ensure-local-node-modules.py repair`
- `pnpm --filter @drts/contracts build` passed
- `pnpm --filter @drts/ui-tokens build` passed
- `pnpm --filter @drts/platform-admin-web test` passed
- `pnpm --filter @drts/platform-admin-web typecheck` passed
- `pnpm --filter @drts/platform-admin-web build` passed
- `pnpm --filter @drts/ui-web build-storybook` passed

What is still blocking formal closeout:

- all 18 dependency tasks listed on `UI-FE-ADM-UMBRELLA` are still recorded as `backlog` in `ai-status.json`
- no clean smoke-test evidence was produced in this pass

## Dependency Audit

`UI-FE-ADM-UMBRELLA` currently depends on these task IDs:

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

At audit time, every one of those dependencies remained `backlog` in machine truth. That alone prevents the umbrella acceptance item "All 18 sub-tasks done" from being satisfied, even though the corresponding route surface exists in the app tree.

## Route Surface Present

The current `apps/platform-admin-web/app` route surface includes:

- `/`
- `/tenants`
- `/tenants/[tenantId]`
- `/tenant-governance`
- `/partners`
- `/partners/[entrySlug]`
- `/users`
- `/fleet`
- `/switchboard`
- `/pricing`
- `/payments`
- `/adapter-registry`
- `/health`
- `/notices`
- `/audit`
- `/feature-flags`

This matches the currently implemented platform-admin rebuild surface in the repo. There is no `payments/reimbursements` route in the current app tree, so the umbrella should not claim full completion solely from route presence.

## Verification Evidence

Commands run in this audit pass:

```bash
python3 scripts/ensure-local-node-modules.py repair
pnpm --filter @drts/contracts build
pnpm --filter @drts/ui-tokens build
pnpm --filter @drts/platform-admin-web test
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web build
pnpm --filter @drts/ui-web build-storybook
```

Results:

- `ensure-local-node-modules.py repair`: passed
- `@drts/contracts build`: passed
- `@drts/ui-tokens build`: passed
- `@drts/platform-admin-web test`: passed with no test files
- `@drts/platform-admin-web typecheck`: passed after workspace package builds
- `@drts/platform-admin-web build`: passed and emitted the expected route manifest
- `@drts/ui-web build-storybook`: passed and emitted `packages/ui-web/storybook-static`

Not executed in this pass:

- `./scripts/run-smoke-tests.sh`

Reason:

- no running target API environment was prepared in this audit pass, and the umbrella acceptance requires a clean smoke result rather than an assumed pass

## Required Next Steps

Before `UI-FE-ADM-UMBRELLA` can move to review:

1. the 18 dependency tasks must be reconciled to real machine-truth completion state
2. a smoke target must be prepared and `./scripts/run-smoke-tests.sh` must pass cleanly
3. owner closeout should then hand off to `Claude2` with the final verification summary
