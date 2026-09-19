# UAT: SR-PARTNER-NOTIFY-SEQ-20260918

## Acceptance Evidence

### durable_event_sequence_allocated_in_same_transaction
- **Status**: PASSED
- **Evidence**: `OwnedMobilityRepository.persistChangesWithExecutor` now calls `allocateNotificationEventSequence` inline within the same exact transaction block (`doWrite`) before writing the generated `eventSequence` into the payload of `ops.consumer_notification_outbox`. This is covered by the integration test in `tests/unit/system-remediation/sr-partner-notify-seq-20260918/owned-mobility-outbox-event-sequence-db.test.ts` which asserts that sequence mutations map exactly 1:1 with transaction commit successes and rolls back perfectly on failure.

### allocator_has_real_callers_and_allocation_test_coverage
- **Status**: PASSED
- **Evidence**: `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts:1883` is now the real caller. Exhaustive tests for this logic have been placed in `tests/unit/system-remediation/sr-partner-notify-seq-20260918/owned-mobility-outbox-event-sequence.test.ts` with mocks verifying the payload, and `owned-mobility-outbox-event-sequence-db.test.ts` providing full coverage for the real TS code running against PostgreSQL.

### owned_mobility_existing_outbox_behaviour_regressed_green
- **Status**: PASSED
- **Evidence**: All existing API unit tests for `OwnedMobilityRepository` are green, and the new sequence allocator is defensive (if it returns null, the payload is unmodified; if the outbox insert DO NOTHING is triggered on retry, it prevents sequence exhaustion).
