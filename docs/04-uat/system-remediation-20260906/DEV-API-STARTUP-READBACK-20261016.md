# DEV-API-STARTUP-READBACK-20261016

Owner: Claude2 · Reviewer: Codex · 2026-10-16 UTC

## Finding and repair boundary

F1: Shared-dev source `2aed20cee7c80fca77aeb326ab6c8b8377fee0dd` passed its own
CI, built 10 service images and ran the DB migration, but Cloud Run revision
`drts-dev-api-00092-9j6` exited before it reached its listener on port 3001.
The deploy summary carries no application exception; it only shows the
deploying VM user's token as expired and the compute identity's logging scope
as insufficient to read the revision's own startup logs at deploy time.
Original receipt:
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/bank-docker-candidate5c75-accepted-dev-results/publish-deploy/actual2aed-APIrevision-startup-first-failure-qualified-receipt.json`.

This task adds a bounded, read-only diagnostic path so that the actual
revision's startup stderr/stdout can be read back once through the existing
GitHub-hosted `DEV_WIF` identity, instead of guessing a root cause (e.g.
treating a generic port-listen timeout as if it were the real exception).

The repair adds:

- `operations/verification/read-dev-api-startup-log.py` — a fixed-target
  reader. `PROJECT`, `SERVICE`, `REVISION`, `START`/`END`, and `LIMIT` are
  hardcoded to the exact failed revision and the 2026-10-16T01:07:50Z–
  01:10:00Z window recorded in the receipt above (not a general-purpose log
  tail). It runs exactly one `gcloud logging read`, requires every returned
  row's `resource.labels` to match the fixed service/revision (raising
  otherwise), redacts `Authorization`/`Bearer`/PEM-looking and
  `password|client_secret|api_key|access_token|refresh_token|jwt_secret`-keyed
  text before persisting any message, and writes one JSON snapshot. A
  `gcloud` failure (non-zero exit) is recorded as a `read_failure_codes` list
  parsed from known error tokens (`PERMISSION_DENIED`, `UNAUTHENTICATED`,
  `ACCESS_TOKEN_SCOPE_INSUFFICIENT`, `SERVICE_DISABLED`, `NOT_FOUND`) and the
  script exits non-zero — an auth/list-permission failure is a blocker, not a
  readback result, and the script does not synthesize a cause in that case.
- `.github/workflows/ci-integ.yml` — one new `workflow_dispatch` input
  (`failed_api_revision`) and one new job
  (`readonly-api-startup-readback`), both additive. The job only runs when
  `workflow_dispatch` is used with `failed_api_revision` equal to the exact
  literal `drts-dev-api-00092-9j6`; any other value (including the default
  empty string) leaves the job skipped. It reuses the same immutable
  definition/target validation, same checkout-then-verify step, and same
  `DEV_WIF_PROVIDER`/`DEV_WIF_SERVICE_ACCOUNT` authentication already used by
  the existing `readonly-dev-metadata` job on lines 52–98, so no new identity,
  IAM binding, or secret is introduced. The job uploads the snapshot as a
  build artifact (`if-no-files-found: error`) whether the read succeeded or
  failed, so a blocked read is still visible as a failed-but-recorded run
  rather than a silently missing one.
- Every existing `push`/`pull_request` trigger, the existing
  `readonly-dev-metadata` job, and all mandatory CI jobs (`candidate`,
  `changes`, `lint`, `typecheck`, `unit`, `integration`,
  `iam-negative-matrix`, `build`, `repo-classification`,
  `dependency-security`, `orchestrator-tests`, `ci-integ`) are unchanged. No
  job's `if`, `timeout-minutes`, or required-check status changed.

No VM product/DB/browser/Docker runtime was started. This task does not
change any cloud IAM role, scope, or public exposure; it reuses the identity
and project/region guard already required by the sibling job.

## Evidence ledger

Baseline source for the readback job definition: `2aed20cee7c80fca77aeb326ab6c8b8377fee0dd`
(the failed revision's own build SHA, used as the fixed diagnostic target —
not reused as this task's own candidate SHA).
Final candidate identity is the full SHA/branch/PR recorded by this task's
`handoff`. No prior review/rework candidates exist for this task.

| Finding / required acceptance | Source and change | Before → after | Command / evidence | Outstanding limits |
| --- | --- | --- | --- | --- |
| F1 / `dev-api-startup-readback_source-review-and-existing-CI` | New `operations/verification/read-dev-api-startup-log.py`; new `readonly-api-startup-readback` job in `.github/workflows/ci-integ.yml` (additive only) | Before: no bounded diagnostic path for a failed revision's startup log existed in this workflow. After: one gated, read-only job exists; every existing trigger, job and required check is byte-for-byte unchanged except the two additive hunks noted above | `python3 -m py_compile operations/verification/read-dev-api-startup-log.py` → exit 0; `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-integ.yml'))"` → exit 0 | Independent review by Codex, hosted `ci-integ` CI run and protected merge for this exact candidate SHA remain pending at handoff time |
| `dev-api-startup-readback_actual-failed-revision-cause` | `readonly-api-startup-readback` job dispatch against the merged/accepted ref | Before: the actual failed-revision startup exception was unread. After: pending — one GitHub-hosted `DEV_WIF` diagnostic run against this task's accepted ref | Not yet dispatched. Per this task's implementation boundary, the Supervisor/root is the sole GitHub-bus dispatcher and runs the one diagnostic dispatch once this candidate is on an accepted ref; this task does not duplicate that dispatch | This acceptance key cannot close from source review alone — it requires the one real hosted run and its artifact. An `ACCESS_TOKEN_SCOPE_INSUFFICIENT`/`PERMISSION_DENIED` result from that run is itself a valid (blocking) readback outcome, not a root-cause finding; only a non-empty `entries` snapshot with `gcloud_exit_code: 0` qualifies as the actual startup exception readback |
| Same-candidate integration | Task branch → Codex review → CI → protected merge | Pending | Canonical handoff supplies final identity | No owner `done`, deployment dispatch/rerun, or merge performed by this task |

No product development/preview/browser/DB/Compose server was started on this VM.

## Final local checks and reproducibility

- `python3 -m py_compile operations/verification/read-dev-api-startup-log.py`
  → exit 0 (compile-only check; no `gcloud` invocation, no cloud credentials
  used, no log query executed locally — this VM does not run the product
  diagnostic query).
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-integ.yml'))"`
  → exit 0 (confirms the additive YAML hunks parse; does not substitute for
  hosted `ci-integ` execution).
- No `pytest`/`vitest` suite covers this script; it is a standalone
  operations diagnostic invoked only by its own gated CI job, matching the
  existing `read-dev-cloud-metadata.py` sibling's test boundary.

Remaining delivery is Codex's exact-SHA review, mandatory hosted CI, and
protected merge, followed by the Supervisor's one post-merge diagnostic
dispatch and its artifact for the second acceptance key. This task does not
claim a root cause for the API startup failure; it only readies and, once
merged, executes the bounded readback that a precise functional fix can be
based on.
