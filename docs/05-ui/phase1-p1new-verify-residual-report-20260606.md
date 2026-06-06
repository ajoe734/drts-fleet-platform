# P1NEW-VERIFY Residual Report

Date: 2026-06-06
Task: `P1NEW-VERIFY`
Owner: `Codex2`
Reviewer: `Claude2`

## Scope

Verify the Phase 1 tenant business operations / service product / fleet partner wave against:

- repo-wide `pnpm typecheck`
- repo-wide `pnpm build`
- i18n guard availability / cleanliness for the new frontends
- `E2E-012`, `E2E-013`, `E2E-014`
- SD §11 acceptance criteria 1-12 in [docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md](../02-architecture/phase1_final_sd_for_dev_team_20260604.md)

## Executed Verification

### 1. Build and typecheck

- `pnpm install` completed successfully on Node `v22.22.2` / pnpm `10.33.0`.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- Build note: `turbo` warned that `@drts/driver-app#build` has no declared `outputs`; this is a cache/config hygiene issue, not a build failure.

### 2. i18n guard

- Expected artifact `scripts/i18n-guard.mjs` is missing from this branch/worktree.
- Repo search found references to the guard only in dispatch metadata under [scripts/dispatch-i18n-bilingual-remediation.py](../../scripts/dispatch-i18n-bilingual-remediation.py).
- Result: repo cannot currently prove the task brief requirement "`i18n-guard 0 violation`" because the guard script is not present.

### 3. E2E execution

- `curl http://localhost:3001/api/health` failed with `curl: (7) Failed to connect`, so no local API target was running in this worktree at verification time.
- `bash tests/e2e/E2E-012-tenant-business-operations.sh` exited with `curl` code `7` on its first API call.
- `bash tests/e2e/E2E-013-service-product-eligibility.sh` exited with `curl` code `7` on its first API call.
- Expected artifact `tests/e2e/E2E-014-fleet-partner-revenue-share.sh` is missing from this branch/worktree.

## SD §11 Acceptance Criteria Check

Source: [docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md](../02-architecture/phase1_final_sd_for_dev_team_20260604.md#11-acceptance-criteria)

| AC  | Requirement                                                                    | Status    | Evidence / residual                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tenant can see payable total and completed trips                               | `BLOCKED` | `E2E-012` could not run because no API target was available; the script itself also documents `/tenant/dashboard` and `/tenant/payables/summary` as unresolved/probe-only in current repo reality. |
| 2   | Tenant can see which users created which orders                                | `BLOCKED` | Requires live tenant booking/order verification through `E2E-012`; blocked by missing API target.                                                                                                  |
| 3   | Tenant can export payable / invoice / cost center / service product report     | `BLOCKED` | `E2E-012` did not reach report assertions because the scenario could not connect to the API target.                                                                                                |
| 4   | Booking service product determines vehicle eligibility                         | `BLOCKED` | `E2E-013` could not connect to the API target.                                                                                                                                                     |
| 5   | Dispatch rejects ineligible vehicles with explicit reason                      | `BLOCKED` | `E2E-013` could not connect to the API target.                                                                                                                                                     |
| 6   | Driver app shows service product and source platform                           | `PARTIAL` | Repo build/typecheck passed for `@drts/driver-app`, but no runtime/E2E proof was produced in this verification pass.                                                                               |
| 7   | Fleet partner can be linked to drivers                                         | `PARTIAL` | Platform Admin fleet-partner routes build successfully, but no runnable E2E or API proof was executed in this pass.                                                                                |
| 8   | Fleet partner revenue share is calculated                                      | `BLOCKED` | No `E2E-014` script exists in `tests/e2e/`; runtime proof absent.                                                                                                                                  |
| 9   | Fleet partner statement is generated                                           | `BLOCKED` | No `E2E-014` script exists in `tests/e2e/`; runtime proof absent.                                                                                                                                  |
| 10  | Platform admin can manage service products, eligibility matrix, fleet partners | `PARTIAL` | `pnpm build` produced `/service-products`, `/vehicle-eligibility`, and `/fleet-partners` routes for `@drts/platform-admin-web`; no live API/E2E proof executed.                                    |
| 11  | Ops can filter dispatch by service product and eligibility                     | `PARTIAL` | `pnpm build` produced `/dispatch` routes for `@drts/ops-console-web`; no live API/E2E proof executed.                                                                                              |
| 12  | E2E-012 / E2E-013 / E2E-014 pass at least in staging                           | `FAIL`    | `E2E-012` and `E2E-013` were blocked immediately by missing API target; `E2E-014` artifact is missing.                                                                                             |

## Residual List

1. Add the missing i18n guard artifact at `scripts/i18n-guard.mjs`, wire it into the expected verification path, and rerun against the target apps.
2. Provide a runnable API target for E2E verification (`localhost:3001` or a documented staging target plus required auth env).
3. Add the missing scenario file `tests/e2e/E2E-014-fleet-partner-revenue-share.sh`.
4. Re-run `E2E-012/013/014` against a live target and update this report with pass/fail evidence instead of environment blockers.
5. If `@drts/driver-app#build` should participate in Turbo caching, declare `outputs` in `turbo.json` to remove the warning and make build evidence cleaner.

## Current Conclusion

This task is not ready for handoff as accepted verification.

What is proven green:

- repo dependency install
- repo-wide typecheck
- repo-wide build

What remains unproven or failing:

- i18n-guard compliance
- all three required E2E scenarios
- SD §11 acceptance closure, especially AC 1-5 and 8-12
