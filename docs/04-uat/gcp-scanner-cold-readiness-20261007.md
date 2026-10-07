# Private scanner cold-start CPU / bounded readiness repair

Task: `SR-GCP-SCANNER-COLD-READINESS-20261007` — Claude / reviewer Claude2.
Precise executable-repair child of `SR-GCP-ARTIFACT-ACTIVATION-20261004`.
Source-only; this task does not run the hosted scanner, start any VM
ClamAV/Docker/server, or redo the full `SR-GCP-ARTIFACT-ACTIVATION-20261004`
release. It owns exactly the two write scopes below.

## Actual counterexample this repairs

Hosted run `https://github.com/ajoe734/drts-fleet-platform/actions/runs/37643205171`
(workflow-definition `publish/v2026.10.07.0` @ `3ecd55d6cf18ec4bdc2d3c28c527d2b3d7555f1f`,
checkout `fd7ce6964455c526e98edff7ea6f2e1b1b211fa4`) deployed the private
scanner successfully through checkout/WIF/build-push/SA-preflight/provision/
scannerURL/ID-token, and `Verify Hosted Backends` then FAILED at its very
first clean scan: `HTTP503 {"error":"scan_engine_not_ready"}` at
`2026-10-07T15:22:50Z`. Revision `drts-dev-scanner-00001-75p` was marked
Cloud Run `Ready` at `15:22:41Z` by the default TCP probe on the gateway's
port 8080; `freshclam` logs showed it starting at `15:22:40Z` with no
confirmed loaded-engine marker yet. No IAM/WIF binding changed before or
after (not an auth regression).

## Root cause

1. **Production side**: the Cloud Run TCP readiness probe only proves the
   gateway process has bound its port — it says nothing about whether the
   `clamd` sidecar has finished loading/refreshing its ClamAV engine and
   written the shared readiness marker the gateway checks. That background
   `freshclam`/`clamd` work happens outside of request processing, and
   Cloud Run throttles CPU to near-zero outside of request processing by
   default. So a revision can sit "Ready" at the platform level for an
   unbounded extra stretch before the engine itself is actually usable,
   and the very first real request can legitimately still land inside
   that window.
2. **Verification side**: the verification helper's very first scan (the
   clean-file check, before anything else has run) asserted an immediate
   `200` with no tolerance for that legitimate cold-start window, so the
   same real condition that production needs to recover from on its own
   was also treated as an unconditional, non-retryable test failure.

## Fix (write scopes only)

- `operations/deployment/provision-dev-artifact-backends.py`:
  `deploy_scanner_service` now passes `--no-cpu-throttling` on the Cloud
  Run deploy call, so the background `freshclam`/`clamd` initialization
  genuinely gets CPU during and after the readiness window, not only
  while serving a request. This is re-asserted on every run (idempotent),
  exactly like every other setting this script already re-asserts.
  `min-instances 0` / `max-instances 1`, the private
  `--no-allow-unauthenticated` + `--invoker-iam-check` IAM surface, the
  exact-digest image references, the per-container memory bounds
  (`512Mi` gateway / `4Gi` clamd), and the shared in-memory readiness-marker
  volume are all unchanged. No new environment variable, no new ingress,
  no change to the TCP probe surface (still port 8080).
- `operations/verification/verify-dev-artifact-backends.py`: a new
  `wait_for_initial_clean_scan(scan_fn, content)` helper wraps only Test 1
  (the first clean-file scan). It retries *exclusively* on
  `503 {"error": "scan_engine_not_ready"}`, up to a finite attempt ceiling
  (`SCANNER_INITIAL_READINESS_MAX_ATTEMPTS`, default 30) and an independent
  total deadline (`SCANNER_INITIAL_READINESS_DEADLINE_SECONDS`, default
  120s; poll interval `SCANNER_INITIAL_READINESS_POLL_INTERVAL_SECONDS`,
  default 2s), all overridable via environment variable. Any other
  outcome — a different status, a non-`scan_engine_not_ready` 503, a
  malformed/non-dict body, or expiry of either bound — returns or raises
  immediately and is asserted by the existing, unmodified
  `assert status == 200` / `assert_receipt(...)` calls. A `503` is never
  treated as a pass, and no existing negative case (hash mismatch,
  oversized, engine-limit, Tests 5-9) was touched.

## Regression coverage

`tests/unit/gcp-scanner-cold-readiness-20261007/test_cold_readiness.py`
(mocks only — no server, engine, or DB):

- `WaitForInitialCleanScanTest`: pending-to-healthy transition, permanently
  pending (fails closed at the attempt ceiling), permanently pending (fails
  closed at the deadline, independently of the attempt ceiling, proven with
  a fake clock), non-retryable `403`, non-retryable non-readiness `503`,
  non-retryable malformed/non-dict body, and a wrong-verdict `200` returned
  immediately instead of retried away.
- `TestScannerInitialReadinessIntegrationTest`: drives the real
  `test_scanner()` entrypoint end-to-end with a cold-start
  pending-to-healthy sequence followed by the existing Tests 2-4b, and a
  permanently-pending sequence that fails the whole run.
- `ProvisionScannerCpuAndProbePolicyTest`: the scanner deploy call carries
  `--no-cpu-throttling` (including when reusing already-existing
  resources), while private IAM, exact-digest images, per-container memory,
  scaling (`min 0` / `max 1` / `concurrency 1`), and the unchanged TCP probe
  port are all still asserted present.

These are additive to, and verified not to break,
`tools/ci/test_dev_artifact_providers.py` and
`tools/ci/test_verify_dev_artifact_backends.py` (51 tests, run unmodified
and still green against both edited files).

## What this does not fix (preserved limitations, unchanged from the parent)

- The deterministic post-readiness transport-fault scenario (Test 9) and
  the storage-gateway transition scenarios remain hosted-only and
  unexecuted outside a real Cloud Run environment; this fix does not make
  them pass and does not weaken or remove their assertions.
- `gcloud logging read` (used by Test 7/8's freshclam-log assertions)
  requires `logging.viewer`, which is not among the known deployer
  project roles; this task does not add any project-level viewer/owner/
  editor grant and does not conceal that gap if it is hit — the exact
  scoped remedy (a `logging.viewer` grant scoped no wider than necessary)
  is a separate, explicitly-scoped follow-up for whoever owns IAM.
- This task performs no hosted rerun itself. The parent
  `SR-GCP-ARTIFACT-ACTIVATION-20261004` owns the genuine hosted rerun,
  engine/negative/bytes/hash/storage/cleanup proof, and SDK-patched
  product release; this child only repairs the exact executable defect
  observed in the prior hosted attempt.
