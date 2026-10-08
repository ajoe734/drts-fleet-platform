# UAT Evidence: GCP Clamd Lifecycle Harness Repair

Task ID: `SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008`

## F1a & F1b: Bounded Complete Readiness Polling

The previous fixed sleep loops and incomplete `ready.version` checks have been replaced with a complete bounded monotonic polling helper (`poll_genuine_readiness_handshake`). It correctly tests the following conditions within a remaining time budget before accepting readiness:
- `ready.version` is readable and numeric
- The corresponding `daily.cvd` or `daily.cld` has a readable header that matches the marker
- The `ready` marker exists and its `mtime` is readable
- A genuine `zVERSION` live ping returns a version matching the marker

All related assertions in `test_genuine_clamd_lifecycle.py` use this helper and properly reject completions after expiry while retaining useful diagnostics. We also bounded all `run_cmd` and `time.sleep` calls with `time.monotonic()` remaining budgets.

## F1c: Pure Boundary Regression Tests

A scoped `test_genuine_lifecycle_helpers.py` test suite was added to rigorously test the `poll_genuine_readiness_handshake` bounded loop. It repeatably mocks Docker/clock boundaries and verifies standard successes, delayed full publication, never-ready timeouts, invalid observations, and mismatched conditions to ensure that the bounds are strictly respected and early return/failure occurs as appropriate.

## F2: Immutable Historical Seed & Evidence Record

Digest retrieval is confirmed, referencing the immutable `clamav/clamav@sha256:57deb108fc4c72778aa83eafbca7bb7153e28c3f57c005afd38d31f16da86f23` layer snapshot. This ensures we can extract historical vendor-signed database bytes needed for the harness reliably without relying on mutable tags.

### Finding & Acceptance Evidence

| Key | Status | Evidence / Notes |
| :--- | :--- | :--- |
| `lifecycle_harness_bounded_readiness_and_genuine_seed_source` | **Outstanding** | Candidate addresses F1a, F1b, F1c, and F2, but requires formal Review/CI acceptance before merging. |
| `lifecycle_harness_exact_sha_review_ci_merge` | **Outstanding** | Pending review, CI, and merge. Old SHA: `be0eabca173c213d82ed3c4cae42fcbaeec92466`. New SHA will be recorded at handoff. |
| `genuine_lifecycle_hosted_original_controls_zero_skips` | **Outstanding** | Pending isolated hosted run with complete lifecycle integration. Cannot run on local VM per project restrictions. |

Local verification performed (Exit 0):
- `PYTHONPATH=tests/unit/gcp-artifact-activation-20261004 python3 -m unittest tests/unit/gcp-artifact-activation-20261004/test_genuine_lifecycle_helpers.py` (5 passed)
