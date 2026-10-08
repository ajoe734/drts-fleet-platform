# UAT Evidence: GCP Clamd Lifecycle Harness Repair

Task ID: `SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008`

## Historical Reviews

- **be0eabca173c213d82ed3c4cae42fcbaeec92466**: Original candidate. Failed the 60-second contract with an elapsed 80s wall-clock rollback probe.
- **8e7017fc93a85f857954858bd80431d7e65fed10**: Second candidate (Generation 7904ac0908bf40b6b748bf427521ed6b). Fixed wall-clock dependence but still failed elapsed-time enforcement with a concrete elapsed 67s probe.
- **3f961a6360800ead1009302941c642c8cfd37d50**: Third candidate. Missed auditing the renewal/removal/activation loops. Loops lacked timeout checks, fractional bounds, and accepted late results. Also had a watchdog cutoff race where checking for mtime advance missed logs.
- **c38f5dc31a93c454633b8630aad012ecfc13c662**: Fourth candidate (Generation d7d7702c30c64bd99a2f1d3e10b4f81e). Failed to properly bound the three defective loops (renewal/removal/activation), retaining unchanged AST statement blocks. Missing test coverage for the exact findings, fractional timeout, terminal expiry, and live-version lag.
- **668c1eb6205a3a6ddb8f9442bfa1cc2756532acc**: Fifth candidate. Resolved helper/port/relay deadlines but explicitly requested transient HTTP retry and faithful terminal regressions were incomplete. Left the HTTP body-read trigger missing `TimeoutError` and `ConnectionResetError` catches inside the `gateway_scan` inner try block, causing startup/recovery loop abortion instead of retry. Also missed faithful terminal success regression tests for watchdog renewal and marker removal (the early-command mock advanced 15s before the final command, masking the missing terminal success check).
- **db13e91a94dceb27a1f4f53a6c1c37ca52f57b8a**: Sixth candidate (Generation 308f820f37a14a0ab0a3ca6f3682c625). Reviewer identified that transient HTTP body-read defects and renewal/removal regression gaps remained. Current commit addresses this by nesting the HTTPError block to catch read timeouts, bounding late-success tests to 0.5s calls under timeout_s=1, and adding `TestGatewayScanBoundary` for 503 HTTPError body read connection and timeout errors.

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

| Finding | Previous Command/Behavior (be0eabca / 8e7017fc) | New Command/Behavior | Limit / Bound |
| :--- | :--- | :--- | :--- |
| **F1a (deadline)** | Probe with simulated 58s wait and 1.5s subprocess advances yielded success at 67s (elapsed > 60s limit). | `poll_genuine_readiness_handshake` recomputes `remain` before EACH subprocess and raises `TimeoutError` strictly at exactly 60s elapsed. | 60 seconds strict monotonic bound |
| **F1b (audit)** | `time.sleep(3)` after `zRELOAD`; `time.sleep(7)` for watchdog mtime advance. (3f961a63 and c38f5dc3 failed to bound renewal/removal/activation loops and accept late results) | All four auxiliary loops (renewal, removal, activation, pending) extracted to polling helpers dynamically bounded by monotonic deadlines, rejecting late results, with a 2s cap per command, retrying on transient command timeouts, checking watchdog log correctly within the loop to avoid cutoff race. HTTP startup, relay PING, and transport gateway loops updated to handle fractional timeout budgets, reject late results, and correctly handle transient connection errors. | Bounded by monotonic deadline dynamically |
| **F1c (probes)** | Mismatched mock `daily.cvd` order and missing timeout propagation probes. Missing regression for loops and lag. | Added mock probes testing timeout propagation, fractional remaining time, transient timeout cap (2-second cap), staggered live-version lag, and dedicated test boundaries for renewal/removal/activation/pending loop helpers, including late success rejection and delayed watchdog logs. | 20 tests, 0 skips, exit 0 |
| **F2 (evidence)** | Claimed OCI index implies signed older seed extraction and engine compatibility. | Removed unsupported success claims. Factual provenance established (OCI child sha256). All availability/readability/compatibility explicitly pending hosted extraction. | Hosted extraction establishes all 3 families |

### Acceptance Evidence

| Key | Status | Evidence / Notes |
| :--- | :--- | :--- |
| `lifecycle_harness_bounded_readiness_and_genuine_seed_source` | **Outstanding** | Candidate addresses F1a, F1b, F1c, and F2, but requires formal CI/merge. |
| `lifecycle_harness_exact_sha_review_ci_merge` | **Outstanding** | Pending CI/merge. |
| `genuine_lifecycle_hosted_original_controls_zero_skips` | **Outstanding** | Pending isolated hosted run. Cannot run on local VM per project restrictions. Hosted verification must establish main/daily/bytecode availability and signatures. |

Local verification performed (Exit 0):
- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=tests/unit/gcp-artifact-activation-20261004 python3 -m unittest test_genuine_lifecycle_helpers test_genuine_clamd_lifecycle.TestRelayScriptInstreamFraming test_genuine_clamd_lifecycle.TestGatewayScanBoundary -v` (22 passed)
