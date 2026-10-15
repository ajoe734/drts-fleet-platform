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

| Finding / required acceptance                     | Source and change                                        | Before → after                                                                                                                                                                       | Command / evidence                                                                                                                                                                                            | Outstanding limits                                                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 / `bank-docker-boundary_source-and-regression` | App tsconfig `exclude`; pages test production graph      | Before: new regression fails because all six app test files enter the real program. After: same case passes and mounted source remains included.                                     | `pnpm --filter @drts/bank-console-web exec vitest run tests/unit/bank-bookings-pages.test.ts -t 'production TypeScript graph'`; exit 1 → 0; `.local/bank-docker-boundary/graph-before.log`, `graph-after.log` | Whole app regression, lint and typecheck pending at checkpoint.                                                                                                                                 |
| Existing local environment limitation             | Worker app dependency links                              | Raw pre-repair tsc fails only on dangling `@drts/tenant-auth` imports. Rebuilt ignored worker app dependency links to this worktree's packages, preserving canonical shared modules. | `.local/bank-docker-boundary/typecheck-before.log`; raw wrapper exit 1 / tsc exit 2                                                                                                                           | Environment repair is not product defect credit.                                                                                                                                                |
| `bank-docker-boundary_hosted-image-build`         | Deploy Dev `Build & push — bank-console-web`, Dockerfile | Original hosted build exit 1; repaired hosted image build pending                                                                                                                    | Original run/job/raw above; workflow lines 523–534 select the real Dockerfile                                                                                                                                 | Supervisor sole publisher must build an immutable merged version and record source projection/actual SHA plus real bank image build exit 0. Root CI build or an existing image is insufficient. |
| Same-candidate integration                        | Task branch → Codex2 review → CI → protected merge       | Pending                                                                                                                                                                              | Canonical handoff supplies final identity                                                                                                                                                                     | No owner `done`, deployment dispatch/rerun or merge.                                                                                                                                            |

No product development/preview/browser/DB/Compose server was started on this VM.
Machine-specific logs and dependency repairs stay under ignored local paths.
