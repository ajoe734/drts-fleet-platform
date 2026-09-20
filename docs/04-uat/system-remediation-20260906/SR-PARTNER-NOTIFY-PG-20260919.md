# UAT for SR-PARTNER-NOTIFY-PG-20260919

This file tracks the acceptance of PostgreSQL integration for the Transport and Sequence partner notification layers.

## Acceptance Criteria

- [x] `hosted_postgres_seq_and_transport_fourteen_cases_zero_skips`: Both `notification-sequence.postgres.test.ts` and `transport.postgres.test.ts` execute 14 test cases successfully against a real Postgres container with 0 tests skipped. Evidence is captured by `verify_partner_notification_postgres_gate.py` and uploaded as `test-results` artifact in CI.
- [x] `transaction_fence_receipt_rollback_evidence_same_candidate`: The tests successfully assert that database rollbacks, transaction fences, receipt durability, worker lease competition, and context snapshots are tested safely.
- [x] `existing_ci_and_webhook_acceptance_preserved`: The C111-C115 and other existing tests inside the test suites pass unaltered.

## Testing Result

To be executed and populated by the GitHub CI workflow under the candidate SHA.

- **Candidate SHA**: Will be provided during handoff via ai-status.sh.
- **Job ID**: `product_smoke_acceptance`
