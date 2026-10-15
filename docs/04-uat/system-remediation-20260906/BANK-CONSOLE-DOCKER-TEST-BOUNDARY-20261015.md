# BANK-CONSOLE-DOCKER-TEST-BOUNDARY-20261015

Owner: Codex · Reviewer: Codex2 · 2026-10-15 UTC

## Finding and repair boundary

F1: Deploy Dev run `38811154656`, attempt 1, job `116684443591`, source
`127925f37dd89da695b37f3324b31da38f47a58c` (`publish/v2026.10.15.1`) compiled
webpack successfully, then failed TypeScript with TS2307 at
`tests/unit/bank-bookings-pages.test.ts:7`. The app test imports repository-root
`tests/unit/system-remediation/sr-wire-001/ui-module-loader.ts`.
`apps/bank-console-web/Dockerfile` copies packages and the app, but not root tests.
The app tsconfig included `**/*.ts` and excluded only `node_modules`.

Original receipt:
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/actual127925-bank-Docker-test-helper-firstfailure-readonly.json`.
Raw log, lines 5955–5979:
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/review-demo-candidate8558-shared-dev-delivery-results/publish-deploy/raw-logs/run-38811154656-attempt1-job-116684443591.log`.
Recorded SHA256: `e3fd9de932861e37efc57cf54c329b55972f4c49448ae51767f579c6c0504b7c`.

The repair adds only `tests` to the app tsconfig exclusion. Next production
typechecking and the existing app typecheck command remain enabled; the app
Vitest config still discovers `tests/**/*.test.ts`. No Docker inputs, source
behavior, root tsconfig, existing assertions, CI policy or deployment settings
change. The original Bank source task's accepted credit remains intact.

The added regression builds the actual TypeScript program using the production
tsconfig. A compiler host hides only repository-root test files, matching this
Docker filesystem boundary. It checks that mounted list/detail, production reader
and proxy remain in the graph while both app tests and root test helpers are
absent. It does not mock the TypeScript parser/resolver or the app configuration.
This is a graph regression, not a real Docker image build.

## Evidence ledger

Baseline product/config SHA: `127925f37dd89da695b37f3324b31da38f47a58c`.
Regression checkpoint: `8ddd8a0d9` (ordinary push; not a candidate).
Final candidate identity is the full SHA/branch/PR recorded by the same handoff
as this document. No prior review/rework candidates exist for this new task.

| Finding / required acceptance                                                | Source and change                                             | Before → after                                                                                                                                                                       | Command / evidence                                                                                                                                                                                            | Outstanding limits                                                                                                                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 / `bank-docker-boundary_source-and-regression`                            | App tsconfig `exclude`; pages test production graph           | Before: new regression fails because all six app test files enter the real program. After: same case passes and mounted source remains included.                                     | `pnpm --filter @drts/bank-console-web exec vitest run tests/unit/bank-bookings-pages.test.ts -t 'production TypeScript graph'`; exit 1 → 0; `.local/bank-docker-boundary/graph-before.log`, `graph-after.log` | Whole app 112 PASS; normal typecheck, final tsc and lint PASS. Same-SHA review/CI/merge remain pending.                                                                                         |
| F1 / missing-helper compilation and production typecheck control             | Actual TypeScript compiler host with repository tests absent  | Old config and original page test: exactly TS2307 at line 7. Fixed: zero diagnostics. In-memory invalid production assignment: exactly TS2322.                                       | `node .local/bank-docker-boundary/compile-probe.cjs`, exit 0; `compile-probe.log`                                                                                                                             | Only test filesystem boundary and negative assignment are simulated. No Docker image/build/runtime credit.                                                                                      |
| Existing bank role/PII/denial/outage/no-seed regressions (source acceptance) | Unchanged SR-BANK-001/002, user and statement-contract suites | Raw: 121 PASS / 2 pre-existing mock-export FAIL. Isolate alias-only mock: original 123 assertions PASS.                                                                              | Commands C/D below; `original-regressions-raw.log`, `original-regressions-isolated.log`                                                                                                                       | Raw failure retained; isolated harness PASS does not claim the default raw command passes.                                                                                                      |
| Existing local environment limitation                                        | Worker app dependency links                                   | Raw pre-repair tsc fails only on dangling `@drts/tenant-auth` imports. Rebuilt ignored worker app dependency links to this worktree's packages, preserving canonical shared modules. | `.local/bank-docker-boundary/typecheck-before.log`; raw wrapper exit 1 / tsc exit 2                                                                                                                           | Environment repair is not product defect credit.                                                                                                                                                |
| `bank-docker-boundary_hosted-image-build`                                    | Deploy Dev `Build & push — bank-console-web`, Dockerfile      | Original hosted build exit 1; repaired hosted image build pending                                                                                                                    | Original run/job/raw above; workflow lines 523–534 select the real Dockerfile                                                                                                                                 | Supervisor sole publisher must build an immutable merged version and record source projection/actual SHA plus real bank image build exit 0. Root CI build or an existing image is insufficient. |
| Same-candidate integration                                                   | Task branch → Codex2 review → CI → protected merge            | Pending                                                                                                                                                                              | Canonical handoff supplies final identity                                                                                                                                                                     | No owner `done`, deployment dispatch/rerun or merge.                                                                                                                                            |

No product development/preview/browser/DB/Compose server was started on this VM.
Machine-specific logs and dependency repairs stay under ignored local paths.

## Final local checks and reproducibility

All commands below completed and their results were read. Node `22.23.2`, pnpm
`10.33.0`, TypeScript `5.9.3`, Vitest `4.1.4`. Tested implementation checkpoint
`ab8a42770` includes both config and regression; final commit adds evidence only.
Log paths below are relative to this isolated worker's `.local/bank-docker-boundary/`.

- A: `pnpm --filter @drts/bank-console-web test` → exit 0, 6 files / **112 PASS**
  (original 111 plus graph regression), `app-tests.log`. No tests skipped or removed.
  Readback/paging/pages, producer-backed catalog cases, proxy and statement artifacts
  remain exercised with their existing doubles; no new business behavior mocks.
- B: `pnpm --filter @drts/bank-console-web typecheck` → exit 0, actual
  `next typegen && tsc --noEmit`, `typecheck.log`. Typegen opened no listener.
  Restored its generated extra `next-env.d.ts` import to preserve the original file;
  final `pnpm --filter @drts/bank-console-web exec tsc --noEmit --incremental false`
  → exit 0, `typecheck-final.log`, on the exact delivered source/config.
- C: `pnpm exec vitest run --config apps/bank-console-web/vitest.config.ts tests/unit/system-remediation/sr-bank-001/sr-bank-001.test.ts tests/unit/system-remediation/sr-bank-002/sr-bank-002.test.ts tests/unit/bank-user-management-flow-20261015 tests/unit/bank-statement-contract-readback-20261015`
  → exit 1, 121 PASS / 2 FAIL, `original-regressions-raw.log`. Both failures occur
  when the unchanged SR-BANK-002 alias-only `vi.mock("@/lib/translations")` also
  replaces the relative real translations import and omits its `translations`
  export. Same known limitation and counts as the original Bank task artifact.
- D: C with only `--config .local/bank-docker-boundary/original-vitest.config.mts`
  substituted → exit 0, 7 files / **123 PASS**, `original-regressions-isolated.log`.
  This local config inherits the app config and gives the exact
  `@/lib/translations` alias precedence, targeting `translation-adapter.ts`, which
  only re-exports the real app `t`. The alias-only mock now affects that adapter;
  relative imports execute the real translations. No original test, assertion,
  production source or authorization logic was changed.
- E: `node .local/bank-docker-boundary/compile-probe.cjs` → exit 0,
  `compile-probe.log`. It reads the old tsconfig and original page test through
  `git show 127925f37dd89da695b37f3324b31da38f47a58c:<path>` without resetting any
  worktree, masks only root tests with the compiler host, and calls
  `ts.getPreEmitDiagnostics(ts.createProgram(...))`. Old program: exactly TS2307
  for the missing helper at original line 7. Fixed program: zero diagnostics.
  A third program appends `const __bankBoundaryNegative: string = 1;` to
  `lib/bookings.ts` only inside the host read, yielding exactly TS2322 in that
  production file. This proves production type errors remain enforced; no source
  file was edited for the negative control.
- `pnpm --filter @drts/bank-console-web lint` → exit 0, `lint.log`.
  Changed-file `pnpm exec prettier --check`, `git diff --check`,
  `python3 tools/ci/check_test_coverage.py` (all 99 tracked Python test files
  reachable) and commit-trailer verification → exit 0.
- Original hosted raw-log SHA256 was independently recomputed and matches the
  receipt above. No new hosted deployment or Docker image build was dispatched.

Remaining delivery is Codex2 exact-SHA review, mandatory hosted CI, protected
merge and the two canonical acceptance keys. The Supervisor must record the
actual bank Docker success for a repaired immutable merged version; other
services/full shared-order acceptance stay with their existing tasks.
