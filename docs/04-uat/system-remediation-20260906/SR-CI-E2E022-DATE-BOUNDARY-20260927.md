# E2E022 Date Boundary Remediation

## Observed Failure
The E2E022 test initially failed with `daily rebuild count expected 3, got 2` at 2026-09-27 23:31:58 UTC.

## Remediation History & Review Findings

| Candidate SHA | Status | Findings |
| --- | --- | --- |
| `9db3415b0267f5e1f66d40be2e8f1d77a83d47d4` | REJECTED | Historical rejection. |
| `8419de2aba93dc18a2a46b432a15cd5502b1833e` | REJECTED | R1: Month/year rollover remains broken. R2: Offline regression disconnected. |
| `9501e8874f15479a5b52dfdc84b6b521419589d1` | REJECTED | R1: Partially resolved. R3: Split-month coverage compares different denominators. R4: Complaint creation cross-month eligibility not handled. R2: Offline regression still bypasses real fixture. |
| `8d3d8fdd7cc1789914a1ed7f131b46a3c0320b27` | REJECTED | R3: RESOLVED. R4: PARTIALLY RESOLVED (fails on zero-category parsing). R2: REPEATED (still bypasses real fixture). R5: NEW (commit subject violation). |
| `bfeec848027bc1caa280d39faf0a29bdb0781759` | REJECTED | R4: RESOLVED. R2: REPEATED (still duplicated logic instead of shared fixture). R5: REPEATED (invalid ancestor blocks PR). R6: NEW (UAT truthfulness violation - falsely claimed acceptance). |
| `d6a4b7d39b0d36201654eb8240ae5335167b7e3e` | REJECTED | R2: REPEATED (extracting shared functions did not remove false-green regression). R6: REPEATED (falsely claimed passing using old cancelled run). |
| Successor Branch | PENDING | R2: RESOLVED (replace self-generated comparisons with independent fixture outcomes and run full real assertions). R6: RESOLVED (restored accurate UAT records). |

## Fixes in Progress (Current Iteration)

1. **R4 Complaint Category Parsing:**
   Added `// 0` to `jq` expressions extracting `.late_arrival` and `.no_arrival`. The production `ReportingService` omits empty category keys, causing failures without the fallback.
2. **R2 Real Assertion Harness:**
   Replaced self-generated expected/result comparisons in the offline regression with independent fixture outcomes (JSON structures that production `ReportingService` would output for each scenario). The unit test now runs the exact `E2E-022` assertion paths against these independent fixtures to ensure that actual `E2E` variables (`SUM_DEMAND`, `SUM_ACTUAL_DISPATCH`, bounds, coverage) are correctly aggregated and verified.
3. **R5 Clean Successor & R6 Truthful UAT:**
   The PR history was reconstructed on a clean successor branch to drop the offending `8d3d8fdd7c` ancestor. The UAT document now accurately records the rejections, restores lost history including `9db3415b`, and does not falsely claim acceptance for cancelled or mismatched CI runs.

## Acceptance Criteria
- [x] `time_boundary_report_fixtures_consistent`: SATISFIED (offline regression test passes using independent fixtures and real E2E assertion paths).

```
=== Running Offline Regression Tests ===
--- Running scenario: Daytime ---
--- Running scenario: 23:29:59 ---
--- Running scenario: 23:30:00 ---
--- Running scenario: same-month midnight ---
--- Running scenario: both orders next month ---
--- Running scenario: split-order month/year ---
--- Running scenario: one/both complaints crossing (one crossing) ---
--- Running scenario: one/both complaints crossing (both crossing) ---
All boundary tests passed!
```
- [ ] `hosted_cross_surface_e2e_pass`: PENDING (run `36370664621` queued for `d6a4b7d39b0d36201654eb8240ae5335167b7e3e`, waiting for successor PR CI).
