# CI-BUILD-CROSS-APP-IMPORT-20261005

Owner: Codex. Reviewer: Codex2. Baseline: `b20895a17` (full SHA in baseline log).

## Repair boundary

The enterprise Dockerfile copies `packages/` and only its own app. Its auth route
imported the tenant-console app, so a monorepo build concealed a missing image
input. Move the complete handler dependency closure to `@drts/tenant-auth`:
`createTenantAuthHandlers`, cookie constants, state/CSRF helpers, Cloud Run
transport, and `verifyTenantSession`. Both app routes consume the workspace
package. Keep tenant helper re-exports for existing middleware, BFF and tests;
keep `/login` versus `/auth-required` host-local error destinations.

No UI, auth policy, cookie scope or API contract redesign. Existing behavior
tests call the real route handlers; only external HTTP is mocked.

## Findings and acceptance evidence

| Finding / acceptance                                  | Source and change                                                                       | Before → after                                                                                           | Command / evidence                                                                                                      | Remaining limits                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| enterprise-dispatch-web可在自己的Docker建置脈絡中建置 | enterprise Dockerfile; new package and both app dependency manifests                    | Baseline fails with the exact missing cross-app module (exit 1); a0d3657fe clean context builds (exit 0) | `bash tools/ci/verify-enterprise-build-context.sh <SHA>`; `.local/ci-build-cross-app-import/{baseline,fixed}-build.log` | Build only; no Docker/server/browser runs                                         |
| 不再跨app相對路徑匯入                                 | both auth routes import `@drts/tenant-auth`                                             | Old isolated app fails guard (exit 1); fixed isolated app passes (exit 0); auth regressions pass         | `node tools/ci/check-cross-app-imports.mjs`; existing BFF/auth suites                                                   | Whole-repo guard still rejects six pre-existing imports in five API tests (below) |
| CI加入防止跨app匯入的檢查                             | `check-cross-app-imports.mjs`, `cross-app-imports.test.ts`, `ci.yml` product smoke gate | 28 guard fixtures pass; full-repo scan fails on pre-existing tests (exit 1)                              | JS/TS import, re-export, dynamic import, require, type import and stylesheet references                                 | No exemptions added; awaiting Supervisor scope coordination for test relocation   |
| 同候選SHA CI通過且獨立reviewer審查                    | candidate lifecycle, reviewer Codex2                                                    | Pending final candidate and hosted CI                                                                    | SHA/PR recorded by handoff after final push                                                                             | Owner does not approve/merge/close; Supervisor deploys after merge                |

Machine-local logs and retained clean contexts live under
`.local/ci-build-cross-app-import/` in the assigned task worktree. The reusable
build script archives a named commit and the Dockerfile's source inputs into a
new directory, installs with a frozen lockfile, and runs its exact four build
commands. It retains the context for inspection and never launches a service.

## Verification checkpoint

- Baseline `b20895a17085681eb0974864be53eae8d726b343`; successful isolated
  build `a0d3657fea23e145abc68934cac926d4c44b0a67`. Subsequent edits extend
  tests and this evidence document only. Node `v22.23.2`, pnpm `10.33.0`,
  Next `16.3.8`; clean contexts retained as `context.jK27BH` (old) and
  `context.Xfk7G7` (fixed) in the machine-local evidence directory.
- `pnpm exec vitest run tests/unit/cross-app-imports.test.ts tests/unit/tenant-google-bff.test.ts tests/unit/deployment-architecture-guards.test.ts tests/unit/system-remediation/sr-tenant-login-001/tenant-login-callback-recovery.test.ts tests/security/iam-browser-storage-and-secret-leakage.test.ts tests/security/iam-tenant-session-revocation-e2e.test.ts tests/e2e/tenant-console-oidc-production.test.ts`:
  **73 passed**, 7 files, exit 0 (`final-auth-tests.log`). The last two are
  Vitest in-memory tests, not browser/server runners. New BFF cases exercise all
  three hosts' failure destinations and rejection/clearing of inactive,
  wrong-realm or missing-tenant sessions; upstream HTTP alone is mocked.
- `pnpm --filter @drts/tenant-auth typecheck`, package lint, guard/test ESLint,
  both app typechecks and `pnpm typecheck:root`: exit 0. Typecheck logs:
  `{tenant,enterprise,root}-typecheck.log`. Package checks used the terminal.
- Full tenant app suite: **72 passed / 2 failed**, exit 1 (`tenant-tests.log`).
  Full enterprise app suite: **31 passed / 1 failed**, exit 1
  (`enterprise-tests.log`). Both failures are stale booking-list HTTP fixtures
  (`paged.items is not iterable` in `packages/api-client/src/index.ts:1262`).
  Re-running the failing suites on archived baseline `b20895a17` reproduces
  the same 2 + 1 failures, exit 1 (`baseline-tenant-api-client.log`,
  `baseline-enterprise-booking.log`). No auth logic is mocked away. The archive
  uses baseline app/package sources and symlinks to installed dependencies;
  an initial missing-zod setup failure was corrected before this comparison.
- Hosted CI/review/merge/deploy **not yet run**. There is no locked candidate.

## Outstanding scope coordination (no guard exceptions)

The first complete scan reports these pre-existing test imports:

| Importing test                                                                                | Target app                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/api/tests/integration/int-mtx-rating-governance-read-authority.test.ts:14`              | `platform-admin-web/app/p5-ratings/rating-api`               |
| `apps/api/tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts:139,564` | `platform-admin-web/app/control-plane-proxy/[...path]/route` |
| `apps/api/tests/unit/map-fleets-closeout-proof.test.ts:31`                                    | `ops-console-web/app/dispatch/ops-map-board`                 |
| `apps/api/tests/unit/owned-mobility-ops-map-api-closeout-proof.test.ts:37`                    | `ops-console-web/app/dispatch/ops-map-board`                 |
| `apps/api/tests/unit/owned-mobility-ops-map-closeout-proof.test.ts:32`                        | `ops-console-web/app/dispatch/ops-map-board`                 |

Owner recorded a scope request using the released `ai-status.sh progress`.
Per AI_COLLABORATION_GUIDE §0.7, Supervisor must check parallel changes and
update the task's write scopes before these additional API test files move.
Proposed next unit: move the five cross-app tests to a repo-level test entrypoint,
preserve assertions and CI execution, adjust relative imports and artifact
paths, then run the complete guard again. Do not hide the failures by excluding
tests or adding an allowlist. The unrelated booking fixtures above also need
explicit disposition; a passing scoped regression does not make them pass.

## Resumed checkpoint — 2026-10-06

Source checkpoint before this repair:
`c9fb5a65e636ec8c47508130472b6af5f10cf676`, matching the published task branch.
`origin/dev` remained `b20895a17085681eb0974864be53eae8d726b343`; no PR or
candidate existed. This is an owner self-check, not an independent review or
a candidate handoff. Auth/package/app sources are unchanged in this checkpoint.

| Finding / acceptance                | Source and repair                                                                                                                                            | Before → after                                                                         | Command / evidence                                                                                                                                                                                     | Remaining limits                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Guard misses computed literal paths | `check-cross-app-imports.mjs:literalPrefix`: unwrap parentheses and TS assertions; combine known string/template segments until the first unknown expression | Four added probes incorrectly exit 0 on `c9fb5a65e`; all correctly exit 1 after repair | `pnpm exec vitest run tests/unit/cross-app-imports.test.ts`; `.local/ci-build-cross-app-import/guard-before-hardening.log` (5 failures total, exit 1), `guard-after-hardening.log` (34 passed, exit 0) | Static guard does not evaluate arbitrary runtime variables                                      |
| Guard misses unquoted CSS URLs      | Stylesheet reference scanner accepts `@import url(../../b/theme.css)` alongside quoted forms                                                                 | Added probe incorrectly exits 0 before; correctly exits 1 after                        | Same guard logs; actual CLI executed against temporary source trees, with no mocked scanner                                                                                                            | Same-app/external imports and commented examples stay accepted                                  |
| Auth behavior and guard regression  | Existing real app route suites plus guard fixtures                                                                                                           | 79 passed in 7 files, exit 0                                                           | Same seven-file Vitest command as the initial checkpoint; `resumed-auth-and-guard.log`; Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4                                                                      | In-memory unit tests only; no browser, service, or Docker                                       |
| Root typecheck / lint               | Updated test and guard                                                                                                                                       | Exit 0 for both                                                                        | `pnpm typecheck:root` (`resumed-root-typecheck.log`); `pnpm exec eslint tools/ci/check-cross-app-imports.mjs tests/unit/cross-app-imports.test.ts --max-warnings=0`                                    | No new app/package source changes                                                               |
| No cross-app imports / same-SHA CI  | Complete repository scan                                                                                                                                     | Still fails on exactly the six API-test imports listed above, exit 1                   | `node tools/ci/check-cross-app-imports.mjs`; `full-guard-resumed.log`                                                                                                                                  | Requires Supervisor scope coordination before relocation; CI/review/merge/deploy remain pending |

The previous dispatch's machine-local logs were not present in the resumed
worktree. The initial checkpoint results above remain historical recorded
evidence, not checks re-executed in this dispatch. Regenerate retained clean
build evidence for the eventual candidate before handoff.

### Concrete next repair unit for Supervisor coordination

The released status CLI still showed no expanded scope after the owner's
renewed request. AI_COLLABORATION_GUIDE §0.7 requires Supervisor to check
parallel ownership and update scopes for the five exact `apps/api/tests/`
files above. Once coordinated:

1. Move those files under `tests/unit/cross-app/`, preserving their assertions
   and fixing paths to the actual API and UI modules. Root `vitest.config.ts`
   already includes `tests/unit/**/*.test.ts`; both product smoke and ci-integ
   run root `test:unit`, so these remain mandatory CI tests.
2. Resolve API-owned Nest dependencies with the existing root-test
   `createRequire(new URL(...apps/api/package.json, import.meta.url))` pattern
   (see `sr-mail-retry-schedule-20261001.test.ts`). Nest is not installed in root
   `node_modules`; blindly copying bare imports would introduce setup failures.
3. Correct `map-fleets-closeout-proof.test.ts`'s `process.cwd()/../..` artifact
   root assumption and the two owned-mobility tests' recorded replay commands.
   Preserve artifact names and assertions; root execution must not write
   outside the workspace. The owned-mobility root-discovery helpers already
   locate `pnpm-workspace.yaml`.
4. Run the relocated suites, root typecheck/lint, full guard and the original
   auth regressions. Resolve the pre-existing booking-fixture disposition,
   then generate final isolated-build evidence, push and open the candidate
   PR for Codex2. Do not waive guard failures or use these checkpoints as CI
   or independent review evidence.
