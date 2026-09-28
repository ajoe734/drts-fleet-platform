# E2E022 Date Boundary Remediation

## Observed Failure
The E2E022 test initially failed with `daily rebuild count expected 3, got 2` at 2026-09-27 23:31:58 UTC.

## Remediation History & Review Findings

| Candidate SHA | Status | Findings |
| --- | --- | --- |
| `9db3415b08c6431c47b8a16de7fbd1718b7d7fea` | REJECTED | Historical rejection. |
| `d6a4b7d620585f1c2eb6315e2195f2a1b181e18d` | REJECTED | Historical rejection. |
| `8419de2aba93dc18a2a46b432a15cd5502b1833e` | REJECTED | R1: Month/year rollover remains broken. R2: Offline regression disconnected. |
| `9501e8874f15479a5b52dfdc84b6b521419589d1` | REJECTED | R1: Partially resolved. R3: Split-month coverage compares different denominators. R4: Complaint creation cross-month eligibility not handled. R2: Offline regression still bypasses real fixture. |
| `8d3d8fdd7cc1789914a1ed7f131b46a3c0320b27` | REJECTED | R3: RESOLVED. R4: PARTIALLY RESOLVED (fails on zero-category parsing). R2: REPEATED (still bypasses real fixture). R5: NEW (commit subject violation). |
| `bfeec848027bc1caa280d39faf0a29bdb0781759` | REJECTED | R4: RESOLVED. R2: REPEATED (still duplicated logic instead of shared fixture). R5: REPEATED (invalid ancestor blocks PR). R6: NEW (UAT truthfulness violation - falsely claimed acceptance). |
| `1eab0714deb372504d51ac172daf46e417758c2f` | REJECTED | R2: REPEATED (unit test still bypassed real assertions). R6: REPEATED (falsely claimed acceptance). |
| `649b63a62745ba1f65bb83257ae1233218a759c1` | REJECTED | R2: REPEATED (unit test bypassed query/date daily paths). R6: REPEATED (falsely claimed full acceptance, used mutable branches for versions, cited outdated CI run). |

## Fixes in Progress (Current Iteration)

1. **R4 Complaint Category Parsing:**
   Added `// 0` to `jq` expressions extracting `.late_arrival` and `.no_arrival`. The production `ReportingService` omits empty category keys, causing failures without the fallback.
2. **R2 Real Assertion Harness:**
   Extracted `aggregate_and_assert_daily_records`, `aggregate_monthly_records`, `run_summary_preview_and_assert`, and `run_summary_job_and_assert` into `tests/e2e/lib/operations-reporting-dates.sh`. Both E2E script and offline unit test now execute these exact shared request loops and assertions. The unit test intercepts `http_call` to return date-keyed independent JSON responses, validating that omitted dates or improperly mapped query periods correctly fail the exact same assertions the E2E script runs.
3. **R5 Clean Successor & R6 Truthful UAT:**
   The PR history was reconstructed on a clean successor branch to drop the offending `8d3d8fdd7c` ancestor. The UAT document accurately records the rejections, restores lost history including `9db3415b08c6` and `d6a4b7d...`, tracks exact evidence based on immutable SHAs, and explicitly states the status of acceptance testing without false claims.

## Acceptance Criteria
- [x] `time_boundary_report_fixtures_consistent`: SATISFIED (offline regression test passes using independent fixtures and real E2E assertion paths).

### Evidence Table
| Command / Check | Candidate / Version | Outcome | Limitations / Notes |
| --- | --- | --- | --- |
| `Node v22.23.2 execFileSync... helper reproduction` | `649b63a...` (Baseline) | FAIL | Failed production node probe, unit falsely passes missing unique_summary_months |
| `bash tests/unit/system-remediation/sr-ci-e2e022-date-boundary-20260927/test-date-logic.sh` | `285c24fc8571ea5e470ed7c23f53c62d40bdbccb` | PASS | Tests boundary fixtures, HTTP mock, and negative controls offline |
| E2E Assertions Integration | `285c24fc8571ea5e470ed7c23f53c62d40bdbccb` | VERIFIED | `E2E-022-operations-reporting.sh` utilizes shared HTTP iteration paths |

- [ ] `hosted_cross_surface_e2e_pass`: PENDING.
Historical successful runs (for reference only):
- Candidate `1eab0714deb372504d51ac172daf46e417758c2f`, run `36371443761` (completed 2026-09-28T02:56:59Z).
- Candidate `649b63a62745ba1f65bb83257ae1233218a759c1`, run `36372399162`, job `108771337730` (completed 2026-09-28T03:10:58Z).
Current candidate requires fresh CI execution after push.
