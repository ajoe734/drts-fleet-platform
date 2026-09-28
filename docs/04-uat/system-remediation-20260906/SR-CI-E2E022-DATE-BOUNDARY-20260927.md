# E2E022 Date Boundary Remediation

## Observed Failure
The E2E022 test initially failed with `daily rebuild count expected 3, got 2` at 2026-09-27 23:31:58 UTC.
This was caused by the test generating a portal order with a reservation window 30 minutes in the future, which crossed into the next UTC day.

## Implementation Details & Remediation History

### Initial Fix Attempt (Candidate: 8419de2aba93dc18a2a46b432a15cd5502b1833e)
Attempted to use `extract_authoritative_dates` but left frozen variables in the script.

### Second Fix Attempt (Candidate: 9501e8874f15479a5b52dfdc84b6b521419589d1)
Partially resolved the frozen-start-month issue but introduced regressions in split-month/year scenarios. Review by Codex highlighted three main issues:
- **R2 (Repeated):** The unit test bypassed the actual fixture/assertion path and mocked the `unique_service_dates`. E2E022 duplicated the date logic instead of calling the helper.
- **R3 (New):** Split-month coverage logic aggregated denominators incorrectly. E2E022 summed expected snapshots from all months, but the first row's snapshot coverage rate only reflected its own month, failing the assertion.
- **R4 (New):** Complaints crossed the order month boundary, causing a mismatch with the ReportingService rule (which only counts complaints matching the order's month). E2E022 strictly expected 2 complaints regardless of their creation month.

### Final Remediation
1. **R2 Refactor:** Modified `tests/e2e/lib/operations-reporting-dates.sh` to export all relevant dates. Replaced the duplicated inline date logic in `E2E-022-operations-reporting.sh` (lines 714-738) with a direct `eval` call to `extract_authoritative_dates`. Rewrote `test-date-logic.sh` to completely simulate the actual E2E logic (including jq-like assertions) for various split-month scenarios.
2. **R3 Coverage Fix:** Updated E2E022 to independently validate each monthly row's snapshot coverage rate using its own expected and valid snapshot counts, correctly isolating the rows before verifying the aggregate coverage for the job/preview.
3. **R4 Complaint Eligibility:** Implemented dynamic eligibility checks in E2E022. The script now reads the authoritative `createdAt` for each complaint and only counts it towards the report total if its month matches its related order's summary month. This aligns the test assertions with the production ReportingService contract.

## Testing & Regression Matrix

The offline verification script `test-date-logic.sh` validates the complete report metric logic including unique service dates, daily totals, coverage rates, and complaint eligibility.

| Scenario | App / Phone Created | Portal Started | Complaint Created | Daily Rows | Expected Valid Complaints | Expected Coverage Validation |
|----------|---------------------|----------------|-------------------|------------|---------------------------|------------------------------|
| Daytime | Same Day | Same Day | Same Day | 1 | 2 (Both counted) | 1 month validated |
| Day split | Day 1 | Day 2 | Day 1 | 2 | 2 (Both counted) | 1 month validated |
| Month split | Month 1 | Month 2 (next day) | Month 1 / 2 | 2 | 1 (Phone skipped if split) | 2 months validated separately |
| Year split | Dec 31 | Jan 1 | Jan 1 | 2 | 1 (App skipped if split) | 2 months validated separately |
| Complaint split | Month 1 | Month 1 | Month 2 | 1 | 1 (Complaint skips month) | 1 month validated |

## Acceptance Criteria
- [x] Executable offline regression covering UTC23:30, midnight, and month/year boundaries demonstrating real report logic and E2E assertions.
- [x] `time_boundary_report_fixtures_consistent`: Fix implemented and correctly aligns reports based on authoritative order creation timestamps and ReportingService semantics.
- [ ] `hosted_cross_surface_e2e_pass`: E2E passing (pending hosted CI after push).
