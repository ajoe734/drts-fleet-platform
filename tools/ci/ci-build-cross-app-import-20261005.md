# CI-BUILD-CROSS-APP-IMPORT-20261005

Owner: Codex. Reviewer: Codex2. Baseline: `b20895a17` (full SHA in baseline log).

Latest owner verification is in [Package classification repair](#package-classification-repair--2026-10-06). Earlier scope blockers below are historical; Supervisor approved those paths in the task integration notes.

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

Machine-local logs and retained clean contexts default to
`.local/ci-build-cross-app-import/` in the assigned task worktree. Set
`DRTS_BUILD_EVIDENCE_DIR` to a persistent canonical `.local/` directory when
the supervisor may recreate the worker worktree (see the refresh below). The reusable
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

## Durable evidence refresh — 2026-10-06

Resumed `2dfd5e41bf363b8054f60fc34a896196d8cbd943`. The task branch and
remote matched, there was no PR or candidate, and the task still had no expanded
`write_scopes`. Fetched `origin/dev` at
`446228cbc771a4ced774126a7d4aaddea4db73e6`; no merge was needed for this
evidence refresh. The published history was preserved.

The previous worktree-local evidence was again absent on resume. Checkpoint
`077b48132fbab4411bfd81b515f29bd90fe9d74c` adds only the optional
`DRTS_BUILD_EVIDENCE_DIR` override to the build script. It changes no archived
build inputs, app/package sources, tests, or CI behavior. This dispatch retained
all new logs and contexts outside the disposable worktree at:

`/home/lupin/workspace/drts-fleet-platform/.local/ci-build-cross-app-import/dispatch-20261006T0016Z/`

The directory name is an evidence label; actual execution timestamps are in
the logs. Checks used Node `v22.23.2`, pnpm `10.33.0`, Next `16.3.8` and Vitest
`4.1.4`. `SHA256SUMS` records the log hashes. This is still an owner checkpoint,
not independent review or a locked candidate.

| Finding / acceptance                                  | Source and result at this checkpoint                                                                                                                                                                 | Command / exit / retained evidence                                                                                                                                                                                                                                    | Remaining limit                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| enterprise-dispatch-web可在自己的Docker建置脈絡中建置 | Baseline `b20895a17085681eb0974864be53eae8d726b343` fails with the original missing tenant-console auth module; `077b48132fbab4411bfd81b515f29bd90fe9d74c` passes all four Dockerfile build commands | `DRTS_BUILD_EVIDENCE_DIR=<directory above> bash tools/ci/verify-enterprise-build-context.sh <SHA>`; baseline exit 1 (`baseline-build.log`, `context.QFdvhA`), fixed exit 0 (`fixed-build.log`, `context.MDYMuG`)                                                      | No Docker, product server, browser or deployment was run                                                  |
| Isolated artifact contents                            | Fixed context has only `apps/enterprise-dispatch-web`; tenant-console is absent; `.next/standalone/apps/enterprise-dispatch-web/server.js` exists                                                    | `find <fixed-context>/apps -mindepth 1 -maxdepth 1 -type d`; `test ! -e <fixed-context>/apps/tenant-console-web`; `test -f <fixed-context>/apps/enterprise-dispatch-web/.next/standalone/apps/enterprise-dispatch-web/server.js`; exit 0                              | The generated server was inspected, never started                                                         |
| Auth behavior / CI guard regression                   | Same seven-file command from the initial checkpoint, including both real auth route entrypoints and all 34 guard cases: **79 passed**, 7 files                                                       | Exit 0, `auth-and-guard.log`                                                                                                                                                                                                                                          | Scoped in-memory tests only                                                                               |
| Root typecheck                                        | Current task checkout                                                                                                                                                                                | `pnpm typecheck:root`; exit 0, `root-typecheck.log`                                                                                                                                                                                                                   | Full app suites were not repeated in this dispatch                                                        |
| 不再跨app相對路徑匯入 / CI加入防止跨app匯入的檢查     | The full guard again reports exactly the six pre-existing references in the five API tests above                                                                                                     | `node tools/ci/check-cross-app-imports.mjs`; exit 1, terminal output matches the outstanding-scope table                                                                                                                                                              | Supervisor must check parallel ownership and update the task scope before relocation; no exemptions added |
| Existing booking fixture failures                     | Baseline and current checkout both fail at production `ApiClient.listTenantBookings`, `packages/api-client/src/index.ts:1262`: `paged.items is not iterable`                                         | In each app directory: `pnpm exec vitest run tests/unit/api-client.test.ts` (tenant: 2 failures) or `pnpm exec vitest run tests/unit/enterprise-booking-lifecycle.test.ts` (enterprise: 1 failure); all exit 1; `{baseline-,}{tenant,enterprise}-booking-fixture.log` | These are reproduced baseline failures, not passing regression evidence; disposition remains pending      |
| 同候選SHA CI通過且獨立reviewer審查                    | No PR, candidate or handoff; reviewer remains Codex2                                                                                                                                                 | Released status CLI `progress` records the scope request and current evidence                                                                                                                                                                                         | Same-SHA hosted CI/review, merge and Supervisor deployment are pending                                    |

The enterprise fixture baseline ran inside the retained baseline enterprise
context. The tenant fixture baseline ran from archived baseline app sources in
`booking-baseline.7askhx`, with `packages` and `node_modules` linked to the
retained baseline context. This preserves the baseline package implementation
and installed dependency closure; the only mock is each existing test's HTTP
fixture. Both baseline runs reached the same production failure as the current
checkout, without dependency/setup errors.

### Booking fixture disposition requested from Supervisor

Concrete authority and minimum repair boundary:

- `packages/contracts/src/index.ts:3713` defines `TenantBookingsPageRecord`
  with `items` and `pagination`. Production
  `OwnedMobilityService.listTenantBookings` builds that object, and
  `OwnedMobilityController.listTenantBookings` wraps it in the API envelope.
  `ApiClient.listTenantBookings` requests `page=1&pageSize=100`, then reads
  `paged.items`. These production files are unchanged by this task.
- `apps/tenant-console-web/tests/unit/api-client.test.ts:10,32` instead mock
  `{ data: [] }`. The minimum fixture correction is a valid empty page in
  `data`, preserving all verified tenant/bearer/realm assertions. This file
  is outside the current tenant `lib/auth` and `app/api/auth` scope, so include
  it in Supervisor's ownership/scope coordination if this task should repair it.
- `apps/enterprise-dispatch-web/tests/unit/enterprise-booking-lifecycle.test.ts:18`
  instead mocks `{ data: [record] }`; its list URL assertion also predates the
  paging parameters. The minimum correction is the contracted page envelope
  plus the actual paging URL, preserving read/update/cancel assertions. This
  file is inside the enterprise app scope, but the paired baseline-fixture
  repair unit has not been applied while its disposition is pending.
- Keep all three failures visible until repaired or explicitly assigned for
  follow-up by Supervisor. Do not modify the production paging contract to
  accept stale fixtures or mark the app suites green from the scoped auth pass.

The released CLI's previously observed `blocker ... Supervisor` rejection
(`Unknown agent: Supervisor`) has no changed prerequisite, so it was not blindly
retried. `progress` successfully records the continuing §0.7 scope dependency
without impersonating Supervisor or assigning a different lane as the blocker.

## Enterprise fixture repair — 2026-10-06T00:16Z

Resumed checkpoint `ae413758c02bedfe48f8eb7f8b40886e1150e209` matched the
published branch. There was still no PR, locked candidate, or expanded scope;
`origin/dev` remained `446228cbc771a4ced774126a7d4aaddea4db73e6`.
The enterprise fixture can be repaired independently within the existing
`apps/enterprise-dispatch-web/` scope, so that part of the previously paired
fixture repair has now proceeded. The tenant fixture and API test relocations
still require Supervisor coordination; this does not authorize those changes.

Repair commit: `67f73dedc27b05bb4ea0c1fdd75c8239fd3219cf` (normally pushed,
checkpoint only). The sole source change is
`apps/enterprise-dispatch-web/tests/unit/enterprise-booking-lifecycle.test.ts`:
its mocked HTTP response now satisfies `TenantBookingsPageRecord`, and its
list URL assertion includes `page=1&pageSize=100`. The test still calls the real
`EnterpriseDispatchTenantClient` and `ApiClient`, then reads, updates and cancels
the same booking. Only HTTP is mocked; production code and all existing
behavior assertions are preserved. No tests were skipped or removed.

Retained evidence directory:
`/home/lupin/workspace/drts-fleet-platform/.local/ci-build-cross-app-import/enterprise-fixture-20261006.k1HJcT/`.
`environment.txt` records the pre-repair SHA, Node `v22.23.2`, and pnpm
`10.33.0`; the test runner is Vitest `4.1.4`. `results.txt` records commands,
source SHAs and exit codes. `SHA256SUMS` covers these files and every log.

| Finding / acceptance                                  | Source and before → after                                                                                                                                                                           | Command / exit / retained evidence                                                                                                                                                                                                                                 | Remaining limit                                                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Enterprise booking fixture mismatch                   | On `ae413758c`, the existing lifecycle test reaches `ApiClient.listTenantBookings` and fails with `paged.items is not iterable`; repaired fixture on `67f73dedc` passes without changing the client | `pnpm --filter @drts/enterprise-dispatch-web test tests/unit/enterprise-booking-lifecycle.test.ts`: exit 1, `enterprise-fixture-before.log`; full `pnpm --filter @drts/enterprise-dispatch-web test`: **32 passed**, 8 files, exit 0, `enterprise-suite-after.log` | Two tenant app fixture failures remain historically reproduced and unresolved; the tenant suite was not rerun this dispatch |
| Enterprise compile / lint                             | Contract-typed fixture and the full enterprise app compile on `67f73dedc`                                                                                                                           | `pnpm --filter @drts/enterprise-dispatch-web typecheck`: exit 0, `enterprise-typecheck.log`; `pnpm exec eslint apps/enterprise-dispatch-web/tests/unit/enterprise-booking-lifecycle.test.ts --max-warnings=0`: exit 0, `enterprise-fixture-eslint.log`             | No production source changes; no new isolated build required for this fixture checkpoint                                    |
| 不再跨app相對路徑匯入 / CI加入防止跨app匯入的檢查     | Full scan on `67f73dedc` still rejects exactly the six imports in the five API tests listed above                                                                                                   | `node tools/ci/check-cross-app-imports.mjs`: exit 1, `full-guard.log`                                                                                                                                                                                              | Supervisor must coordinate those source paths and their move into `tests/unit/cross-app/`; no guard exemptions              |
| enterprise-dispatch-web可在自己的Docker建置脈絡中建置 | Existing baseline-fail / `077b48132`-pass evidence remains under the durable refresh directory above                                                                                                | Build not rerun; prior result retained with its original SHA                                                                                                                                                                                                       | Regenerate at final candidate after remaining repairs; this is not same-SHA acceptance                                      |
| 同候選SHA CI通過且獨立reviewer審查                    | No candidate / PR / hosted CI / independent review / merge / deploy                                                                                                                                 | Not run; checkpoint has only local verification                                                                                                                                                                                                                    | Owner must complete remaining repairs before handoff; Codex2 reviews and Supervisor deploys after merge                     |

All checks started in this dispatch finished and their results were read. No
service, browser test server or Docker process was started. No published commit
was rewritten. The released CLI still cannot represent `waiting_for=Supervisor`
as documented above, so the owner records the scope dependency with `progress`
and does not falsely attribute it to another lane. Supervisor's remaining
decision is to coordinate the five named API test paths and
`apps/tenant-console-web/tests/unit/api-client.test.ts`, then update this task's
write scopes (or provide an explicit fixture follow-up disposition).

## Scope audit and blocked disposition — 2026-10-06T00:22Z

The next dispatch still supplies the same scope. After fetch, local and remote
task heads both remain `28a0df63123ad9038f94a830f1f5b5d58ef8e97c`;
`origin/dev` remains `446228cbc771a4ced774126a7d4aaddea4db73e6`.
`gh pr list --head codex/ci-build-cross-app-import-20261005 --state all`
returns no PR; the released task slice has no candidate or expanded
`write_scopes`. No further source repair is authorized by this dispatch.

| Finding / acceptance                                | Verification at this checkpoint                                                                                                                    | Evidence / remaining condition                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full cross-app guard / CI guard acceptance          | `node tools/ci/check-cross-app-imports.mjs` finishes with exit 1 at `28a0df631`, reporting the same six imports in the five API tests listed above | Retained `full-guard.log`, `environment.txt`, `results.txt`, and `SHA256SUMS` in canonical `.local/ci-build-cross-app-import/scope-audit-20261006.mpv9JG/`; relocation scope still needs Supervisor coordination |
| Tenant booking fixture                              | Not rerun or repaired; two prior baseline-reproduced failures remain open                                                                          | Supervisor must coordinate `apps/tenant-console-web/tests/unit/api-client.test.ts` or explicitly record its follow-up disposition                                                                                |
| Isolated build / same-SHA CI and independent review | Historical build evidence retains its original SHA; no new build, hosted CI, candidate, review, merge or deployment                                | Complete the scope-dependent repairs before locking a candidate                                                                                                                                                  |

Read-only inspection of the active release found an existing way to record this
impasse without assigning it falsely to another lane: `system-block <task-id>
<message>`. The release's `control_plane/usecases/task_board_commands.py`
explicitly permits this command for dispatched workers on their assigned task
and records its worker outcome as `blocked`. Its `bin/ai_status.py` handler
supports `EVIDENCE_REF` and does not require a `waiting_for` agent. Thus the
owner can use the released gateway with `AI_NAME=Codex`, preserving all worker
guards and avoiding the previously rejected `blocker ... Supervisor` form.
No control-plane code or state files are edited directly.

Resume condition: Supervisor checks parallel ownership and updates this task's
scope for the five named API test source paths, their relocation into
`tests/unit/cross-app/`, and the tenant fixture repair/disposition. An unchanged
owner dispatch cannot satisfy this condition. All checks started here finished
and were read; no service, browser runner or Docker was started.

## Scope repair and candidate preparation — 2026-10-06

Supervisor explicitly approved the five API test paths and tenant fixture in
`integration_notes` (labelled 2026-10-06T11:30Z), with no parallel owner conflict.
Resumed source: `6e42d828f572ef44b18d10c083653adb3907bab4`; remote matched,
no PR/candidate existed, and fetched `origin/dev` was
`446228cbc771a4ced774126a7d4aaddea4db73e6`. Published history was preserved.
The repair checkpoints are `f84b121b6` (relocation) and
`fb4ab64be009df7b27a939f0842b0105b4be7f7f` (fixture/type compatibility).
All app, package, guard, test and workflow inputs for final handoff are at the
latter SHA; the final commit only updates this evidence document.

Durable evidence directory for this dispatch:
`/home/lupin/workspace/drts-fleet-platform/.local/ci-build-cross-app-import/scope-repair-20261006/`.
Node `v22.23.2`, pnpm `10.33.0`, Vitest `4.1.4`, Next `16.3.8`.

| Finding / acceptance                                  | Source / repair                                                                                                                                                                                      | Before → after                                                                                                                                    | Command / exit / evidence                                                                                                                                                                                                                            | Remaining limit                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Six cross-app imports / 不再跨app相對路徑匯入         | Move five suites into `tests/unit/cross-app/`; resolve API-owned Nest dependencies with `createRequire` anchored at `apps/api/package.json`                                                          | `6e42d828f` reports six imports, exit 1 → `fb4ab64be` scan reports zero violations across 1641 sources, exit 0                                    | `node tools/ci/check-cross-app-imports.mjs`; `guard-before.log`, `guard-after.log`                                                                                                                                                                   | No allowlist/exemption; static guard does not evaluate arbitrary runtime variables                                                                                       |
| Preserve test assertions and CI jobs                  | Original two API integration paths retain imports of root suites, so API integration CI still executes them. Root `tests/unit/**/*.test.ts` discovery runs all five in product smoke / ci-integ unit | 15 integration cases pass through original API entrypoints; all 18 moved cases pass at root. The 105 `expect(...)` assertions are retained        | `pnpm --filter @drts/api exec vitest run tests/integration/int-mtx-rating-governance-read-authority.test.ts tests/integration/sr-partner-notify-fix-admin-20260927.integration.test.ts`; exit 0, `api-integration-entrypoints.log`; `regression.log` | In-memory tests exercise production handlers/controllers/services; HTTP and DB boundaries are mocked. No PG acceptance claimed                                           |
| Relocated tests enter root TypeScript checking        | Typed order fixtures; await `createCallCenterOrder`'s `MaybePromise`; align mock audit records / constructor arity with production contracts; narrow error before `getStatus`                        | Initial migration exposed 20 diagnostics → root typecheck passes after fixture-only fixes                                                         | `pnpm typecheck:root`; exit 0, `root-typecheck.log`; earlier diagnostics read in worker terminal                                                                                                                                                     | No production code changed for these fixture repairs; no assertion removed                                                                                               |
| Test replay artifact root                             | `proof-artifacts.ts` anchors output under workspace `.local/cross-app-proofs/` independently of cwd; replay commands now use root paths                                                              | Root and API entrypoints pass; historical committed proof files remain unchanged                                                                  | `regression.log`; generated JSON copied to durable `replay-proofs/`                                                                                                                                                                                  | Preserved relative artifact names; these are service/model replay outputs, not fresh browser/PG evidence                                                                 |
| Stale tenant booking fixture                          | `api-client.test.ts` now returns the paginated envelope consumed by real `ApiClient.listTenantBookings`; restore stubbed fetch/environment                                                           | Same resumed source fails both tests with `paged.items is not iterable` → both pass, complete tenant suite 74/74                                  | `pnpm --filter @drts/tenant-console-web exec vitest run tests/unit/api-client.test.ts`, exit 1 then 0 (`tenant-fixture-before-installed.log`, `tenant-fixture-after.log`); full `test`, exit 0 (`tenant-suite.log`)                                  | Initial attempt lacked workspace package links (`tenant-fixture-before.log`); it is setup failure, not defect reproduction. Frozen install fixed setup before comparison |
| Enterprise fixture and auth behavior regression       | Existing enterprise fixture fix retained; actual shared handlers used by both hosts                                                                                                                  | Enterprise suite 32/32; auth, guard and relocated suites 97/97 in 12 files                                                                        | `enterprise-suite.log`, `regression.log`; commands below; exit 0                                                                                                                                                                                     | Vitest in-memory tests only; no browser runner or server                                                                                                                 |
| CI加入防止跨app匯入的檢查                             | `.github/workflows/ci.yml` product smoke executes `check-cross-app-imports.mjs`; 34 real-CLI positive/negative fixtures                                                                              | Full scanner and all 34 fixtures pass                                                                                                             | `guard-after.log`, `regression.log`; exit 0                                                                                                                                                                                                          | Hosted CI belongs to final candidate, not these local runs                                                                                                               |
| enterprise-dispatch-web可在自己的Docker建置脈絡中建置 | Shared handler closure in `@drts/tenant-auth`; exact Dockerfile source inputs and four build commands                                                                                                | Baseline exit 1 with missing module → refreshed source `fb4ab64be` exits 0; context contains only enterprise app and has standalone server output | `DRTS_BUILD_EVIDENCE_DIR=<directory above> bash tools/ci/verify-enterprise-build-context.sh fb4ab64be009df7b27a939f0842b0105b4be7f7f`; `fixed-build.log`, retained `context.uCMI0R`; exit 0                                                          | Build only; generated standalone server inspected, never started                                                                                                         |
| 同候選SHA CI通過且獨立reviewer審查                    | Final SHA, remote branch and PR head will be checked before released CLI handoff to Codex2                                                                                                           | Pending candidate CI and independent review                                                                                                       | Canonical task candidate plus PR/run URLs at handoff                                                                                                                                                                                                 | Supervisor notes shared dependency-security failures are tracked by `CI-DEPENDENCY-ADVISORIES-20261006`; do not waive that gate. Supervisor deploys after merge          |

Final regression command (exit 0, 97 passed):

```bash
pnpm exec vitest run tests/unit/cross-app \
  tests/unit/tenant-google-bff.test.ts \
  tests/unit/deployment-architecture-guards.test.ts \
  tests/unit/system-remediation/sr-tenant-login-001/tenant-login-callback-recovery.test.ts \
  tests/security/iam-browser-storage-and-secret-leakage.test.ts \
  tests/security/iam-tenant-session-revocation-e2e.test.ts \
  tests/e2e/tenant-console-oidc-production.test.ts
pnpm --filter @drts/tenant-console-web test
pnpm --filter @drts/enterprise-dispatch-web test
```

Additional completed checks: root and both app typechecks (logs named
`{root,tenant,enterprise}-typecheck.log`), shared package typecheck/lint, scoped
ESLint for the guard, moved tests, auth/deployment tests and both booking fixture
tests, and `git diff --check`: all exit 0. Tenant type generation added a line
to tracked `next-env.d.ts`; that generated-only side effect was restored.
No UI markup, visual tokens, or design was changed.

The baseline build log retained under `dispatch-20261006T0016Z/baseline-build.log`
was re-read and its SHA-256 verified against the existing manifest:
`1b4a6eae274fed36a392fc38c15c3703a0347ac5ebbc6aeacb5ba369a637cc99`.
Its original source SHA is `b20895a17085681eb0974864be53eae8d726b343` and
its result is exit 1 with the exact missing tenant auth module. It was not
re-executed in this dispatch. The clean source contexts and fresh logs are
retained; `SHA256SUMS` accompanies this dispatch's evidence.

Owner implementation is not task closeout. Same-candidate CI, independent
Codex2 review, merge and Supervisor deployment remain separate lifecycle gates.

All locally started checks finished and their results were read before candidate
handoff. Final candidate differs from verified source `fb4ab64be` only in this
evidence artifact; build and test inputs are identical.

## Package classification repair — 2026-10-06

Resumed published PR [#2355](https://github.com/ajoe734/drts-fleet-platform/pull/2355)
at `5e76bab857fa83fa4d25f9048f671e2c7e9bc901`, with no locked candidate or
independent review. Supervisor approved `repo-classification.json` in the
2026-10-06T12:35Z integration note after checking parallel ownership. This
repair adds only `tenant-auth` to the `package-build-config` and
`runtime-packages` alternations. The package's tsconfig is product operations;
its manifest and sources are product runtime. No classification exception or
guard waiver was introduced.

Durable evidence:
`/home/lupin/workspace/drts-fleet-platform/.local/ci-build-cross-app-import/classification-repair-20261006/`.

| Finding / acceptance                                  | Source / repair                                                                                                                    | Before → after                                                                                                           | Command / exit / evidence                                                                                                                                                                                                         | Remaining limit                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New package fails repository classification           | `repo-classification.json`, only the two approved alternations                                                                     | Published `5e76bab85` fails on seven tenant-auth files, exit 1 → all 5973 tracked files classified, exit 0               | `node tools/ci/check-repo-classification.mjs`; `classification-before.log`, `classification-after.log`; Node v22.23.2                                                                                                             | Final pushed SHA needs hosted CI                                                                                                                        |
| 不再跨app相對路徑匯入 / CI加入防止跨app匯入的檢查     | Existing guard and `.github/workflows/ci.yml` registration unchanged                                                               | Fresh whole-repo scan passes all 1641 sources, exit 0; earlier 34 guard regression cases retained                        | `node tools/ci/check-cross-app-imports.mjs`; `guard.log`; prior `scope-repair-20261006/regression.log` hash verified                                                                                                              | Static analysis does not evaluate arbitrary runtime variables                                                                                           |
| enterprise-dispatch-web可在自己的Docker建置脈絡中建置 | All archive inputs in `verify-enterprise-build-context.sh` match verified `fb4ab64be009df7b27a939f0842b0105b4be7f7f` byte for byte | Prior isolated build exit 0 retained; context still contains only enterprise app and standalone output                   | `git diff --exit-code fb4ab64be -- package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json packages apps/enterprise-dispatch-web` exit 0; prior `fixed-build.log` hash verified                             | Build is retained evidence at the stated source SHA, not newly executed; no Docker/server                                                               |
| Previous auth, fixtures and relocated tests           | No app/package/test/workflow changes in this repair                                                                                | Previous 97 root, 74 tenant, 32 enterprise and 15 API integration-entrypoint tests remain verified at their recorded SHA | `sha256sum -c SHA256SUMS` in `scope-repair-20261006/`: all 19 entries OK; no regression input changed                                                                                                                             | Tests were not repeated for two manifest regex additions                                                                                                |
| 同候選SHA CI通過且獨立reviewer審查                    | Candidate lifecycle and assigned reviewer Codex2                                                                                   | Prior published SHA's CI results fully read; final repair candidate CI/review pending                                    | Prior [CI run](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37457054554) and [integration CI run](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37457054525); `prior-ci.json`, `prior-ci-integ.json` | Shared advisory failure is owned by `CI-DEPENDENCY-ADVISORIES-20261006`; it still prevents green CI. No approval, merge, deployment or closeout claimed |

Prior CI runs are complete: build, unit, integration, typecheck, lint, IAM,
hosted E2E and smoke passed. Both classification jobs and dependency-security
jobs failed, and the integration aggregate failed; orchestrator tests skipped
by scope. Those are prior-SHA results, not final candidate CI. Final CI results
and exact candidate identity are recorded through the PR and released lifecycle
CLI after normal push. Classification and guard checks above finished and their
results were read. Prettier and `git diff --check` also passed.
