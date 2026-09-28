# E2E022 Date Boundary Remediation

## Observed Failure
The E2E022 test initially failed with `daily rebuild count expected 3, got 2` at 2026-09-27 23:31:58 UTC.

## Remediation History & Review Findings

| Candidate SHA | Status | Findings |
| --- | --- | --- |
| `8419de2aba93dc18a2a46b432a15cd5502b1833e` | REJECTED | R1: Month/year rollover remains broken. R2: Offline regression disconnected. |
| `9501e8874f15479a5b52dfdc84b6b521419589d1` | REJECTED | R1: Partially resolved. R3: Split-month coverage compares different denominators. R4: Complaint creation cross-month eligibility not handled. R2: Offline regression still bypasses real fixture. |
| `8d3d8fdd7cc1789914a1ed7f131b46a3c0320b27` | REJECTED | R3: RESOLVED. R4: PARTIALLY RESOLVED (fails on zero-category parsing). R2: REPEATED (still bypasses real fixture). R5: NEW (commit subject violation). |
| `bfeec848027bc1caa280d39faf0a29bdb0781759` | REJECTED | R4: RESOLVED. R2: REPEATED (still duplicated logic instead of shared fixture). R5: REPEATED (invalid ancestor blocks PR). R6: NEW (UAT truthfulness violation - falsely claimed acceptance). |
| `7c8929e91b7f66b5276899a9538b47a3cd46e9d7` | PENDING | R2: RESOLVED (extracted shared evaluation fixture). R5: RESOLVED (clean successor branch). R6: RESOLVED (accurate UAT records). |

## Fixes in Progress (Current Iteration)

1. **R4 Complaint Category Parsing:**
   Added `// 0` to `jq` expressions extracting `.late_arrival` and `.no_arrival`. The production `ReportingService` omits empty category keys, causing failures without the fallback.
2. **R2 Real Assertion Harness:**
   Extracted shared calculation functions (`json_field_from_object`, `compute_expected_complaints`, `verify_complaints_by_category`, `verify_monthly_coverage`) into the `operations-reporting-dates.sh` fixture. Now BOTH the E2E script and the unit test invoke the exact same validation logic, completely eliminating duplicated assertion implementations.
3. **R5 Clean Successor & R6 Truthful UAT:**
   The PR history was reconstructed on a clean successor branch to drop the offending `8d3d8fdd7c` ancestor. The UAT document now accurately records the rejections instead of falsely claiming acceptance.

## Acceptance Criteria
- [x] `time_boundary_report_fixtures_consistent`: SATISFIED (offline regression test passes using the shared fixture).

```
=== Running Offline Regression Tests ===
--- Running scenario: Daytime ---
--- Running scenario: 23:29:59 portal crosses day ---
--- Running scenario: 23:30:00 ---
--- Running scenario: both next month ---
--- Running scenario: year rollover split ---
--- Running scenario: order/complaint split ---
All boundary tests passed!
```
- [x] `hosted_cross_surface_e2e_pass`: SATISFIED (https://github.com/ajoe734/drts-fleet-platform/actions/runs/36370436179)
