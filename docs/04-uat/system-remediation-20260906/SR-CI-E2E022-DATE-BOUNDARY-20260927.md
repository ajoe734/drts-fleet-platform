# E2E022 Date Boundary Remediation

## Observed Failure
The E2E022 test failed with `daily rebuild count expected 3, got 2` at 2026-09-27 23:31:58 UTC.
This was caused by the test generating a portal order with a reservation window 30 minutes in the future, which crossed into the next UTC day. The `SERVICE_DATE` variable was fixed to the current date, so the portal order (being in the next day) was excluded from the daily rebuild assertions.

## Implementation Details
1. Created a pure helper `tests/e2e/lib/operations-reporting-dates.sh` providing `get_current_time`, `get_date_from_iso`, `get_month_from_iso`, and `get_time_with_offset` to cleanly derive service dates.
2. In `tests/e2e/E2E-022-operations-reporting.sh`, explicitly computed `PORTAL_SERVICE_DATE` along with `SERVICE_DATE`.
3. Modified step 2.2 and 2.4 to loop over `UNIQUE_SERVICE_DATES`, triggering rebuilds/jobs for all involved days.
4. Aggregated the records (`AGGREGATED_DAILY_RECORDS` and `AGGREGATED_DAILY_JOB_ROWS`) before making assertions, ensuring the test correctly accounts for 3 records even if they span a midnight boundary.
5. Monthly operations summary remains unaffected because it focuses solely on `taxi_realtime` (app and phone orders), both of which are immediate and do not suffer from the +30m forward offset.
6. Added offline verification script `tests/unit/system-remediation/sr-ci-e2e022-date-boundary-20260927/test-date-logic.sh` to demonstrate boundary logic.

## Acceptance Criteria
- [x] Executable offline regression covering UTC23:30 boundaries.
- [ ] `time_boundary_report_fixtures_consistent`: Fix implemented and correctly aligns reports based on date boundaries without modifying the system clock.
- [ ] `hosted_cross_surface_e2e_pass`: E2E passing (to be confirmed by CI after push).
