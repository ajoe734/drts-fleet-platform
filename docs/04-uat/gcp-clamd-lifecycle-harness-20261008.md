# UAT Evidence: GCP Clamd Lifecycle Harness Repair

Task ID: `SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008`

## Historical Reviews

- **be0eabca173c213d82ed3c4cae42fcbaeec92466**: Original candidate. Failed the 60-second contract with an elapsed 80s wall-clock rollback probe.
- **8e7017fc93a85f857954858bd80431d7e65fed10**: Second candidate (Generation 7904ac0908bf40b6b748bf427521ed6b). Fixed wall-clock dependence but still failed elapsed-time enforcement with a concrete elapsed 67s probe.

## F1a & F1b: Bounded Complete Readiness Polling

The previous fixed sleep loops and incomplete `ready.version` checks have been replaced with a complete bounded monotonic polling helper (`poll_genuine_readiness_handshake`). 
- Polling bounds evaluate `remain = deadline - time.monotonic()` *before* each subprocess.
- Subprocesses use exact fractional remainder for timeouts.
- `subprocess.TimeoutExpired` exceptions are caught, treated as a failure observation, and retried if the deadline permits.
- `wait_for_ping` and `wait_for_log` similarly correctly enforce deadlines and catch timeouts.
- Marker removal, actual version reload activation (`zRELOAD`), and watchdog mtime advance are all boundedly polled rather than using fixed sleep assumptions.

## F1c: Pure Boundary Regression Tests

A scoped `test_genuine_lifecycle_helpers.py` test suite rigorously tests the `poll_genuine_readiness_handshake` bounded loop. It repeatably mocks Docker/clock boundaries and verifies:
- Complete success
- Delayed full publication (split-publication positive test)
- Never-ready timeouts
- Invalid observations (mismatched)
- Staggered marker/live-version publication
- Fractional remaining time and no commands after deadline
- Transient timeout recovery and terminal timeout diagnostics

## F2: Immutable Historical Seed & Evidence Record

The target `clamav/clamav@sha256:57deb108fc4c72778aa83eafbca7bb7153e28c3f57c005afd38d31f16da86f23` is an OCI index, not a layer. 
The official registry digest verification maps to linux/amd64 child `sha256:da8463f630e2c9467c74f3da1dee6f096e61a71650e4e9f1ff9b5f687ba91aa0`, config `5ca07785ce6993ebdac0dc329b1866e09ca28a6336223879f839b7c530d39bd9`, created `2026-09-28T01:25:25.384859292Z`.
Because the `freshclam` build step allows failure, signature files or old<new guarantees cannot be inferred from index metadata alone.
Main/daily/bytecode availability, signatures/readability, old<new verification, and engine compatibility remain explicitly pending hosted extraction. Hosted verification must explicitly establish all three database families, as existing seed extraction only requires any daily file.

### Findings Review Matrix

| Finding | Pre-Fix (be0eabca / 8e7017fc) | Post-Fix Result | Limit / Bound |
| :--- | :--- | :--- | :--- |
| **F1a (deadline)** | `timeout_s=60` probe succeeded at elapsed 67s | Rejects at 60s exactly | 60 seconds strict |
| **F1b (audit)** | `time.sleep(3)` and `time.sleep(7)` blind assumptions | Active polling for marker/version updates | 30 seconds bound |
| **F1c (probes)** | Missing timeout simulations & regression probes | 8 helper tests executing logic | Unit test suite |

### Acceptance Evidence

| Key | Status | Evidence / Notes |
| :--- | :--- | :--- |
| `lifecycle_harness_bounded_readiness_and_genuine_seed_source` | **Outstanding** | Candidate addresses F1a, F1b, F1c, and F2, but requires formal CI/merge. |
| `lifecycle_harness_exact_sha_review_ci_merge` | **Outstanding** | Pending CI/merge. |
| `genuine_lifecycle_hosted_original_controls_zero_skips` | **Outstanding** | Pending isolated hosted run. Cannot run on local VM per project restrictions. Hosted verification must establish main/daily/bytecode availability and signatures. |

Local verification performed (Exit 0):
- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=tests/unit/gcp-artifact-activation-20261004 python3 -m unittest test_genuine_lifecycle_helpers test_genuine_clamd_lifecycle.TestRelayScriptInstreamFraming -v` (11 passed)
