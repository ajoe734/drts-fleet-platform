# Driver credential T30 / T7 reminders

Task: `DRIVER-CREDENTIAL-PREEXPIRY-REMINDER-FLOW-20261015`  
Author: Codex2. Independent reviewer: Codex.  
Accepted execution base: `1c0c3f954e5d067156732ce973ccc8cbcc2b02c6`.

The original five clauses and five acceptance keys remain binding. The current full specification is `Preexpiry-R4-full-original-plus-one-existing-B4-pagination-query-family-test.task-spec.json`, SHA-256 `856cbe73797a92eabada15abf8d56817e5b9c1c6c9ed29c2259913f205252430`, in the machine evidence directory below. Its seventh scope is the existing B4 pagination test's query-family classification. This adds no product threshold, recipient audience, dispatch restriction, route, migration, cloud job, or mail drain.

## Result and production path

The existing Registry reconciliation now selects canonical future rows and rechecks their source dates under the existing driver row lock. Each original license field has separate T30 and T7 identities, including ordinary catch-up after a threshold has passed. The source fingerprint includes scope, driver, credential field, source expiry instant, and milestone. A same-expiry master retry retains its identities; a changed expiry supersedes previous reminder work and creates a distinct source revision when eligible.

Reminder families use `entity_type=driver` and `credential_type=preexpiry:<original-credential>:30|7`, compatible with existing V0102 constraints. They retain the actual expiry instant. Original B4 `credential-expiry/v1` fingerprints, expired-event counters, limits, source dates, and driver/policy semantics remain separate. Active lifecycle is the existing preexpiry list rule; valid preexpiry licenses remain dispatch eligible.

`REGULATORY_ALERT_RECIPIENT_EMAIL` supplies the approved server recipient. Missing or invalid configuration leaves a canonical pending event without an invented address or immutable intent. A legitimate configuration recovery fills its intent using the same event identity. Once created, the recipient, sender, body, subject, and idempotency key remain frozen in the existing durable intent. Request-body recipient data does not supply the binding. Existing notification sender configuration and delivery validation remain authoritative.

The real repository transaction commits event plus immutable intent before handing work to `NotificationDeliveryService.enqueue`. Existing receipt-link logic rechecks the same canonical source with driver-before-event locking and retains actual outbox IDs even after renewal supersedes a message. Rejected and uncertain enqueue, accepted-outbox-before-link failures, restart, and competing ordinary instances recover using the persisted original identity. A linked outbox receipt establishes durable acceptance; provider acceptance is a separate actual fact. No external exactly-once guarantee is claimed.

The existing `onModuleInit`, optional `ENABLE_EXPIRY_RECONCILIATION_LOOP` periodic rail, and awaited controller `reconcileExpiry` entry all consume this producer. The existing notification outbox/drain owner remains responsible for accepted deliveries after restart. No additional route, auth grant, scheduling infrastructure, or competing drain was added. The generic Registry persistence helper and seven later Registry commands, Incident holds, P5, and C073 behavior remain unchanged.

## Original acceptance mapping

| Original key                                                                 | Concrete evidence                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `credential-reminder_original30and7-producer-and-canonical-source`           | Actual controller → service → enabled repository SQL/transaction: T30/T7, crossed boundary, all three credential fields, 101 drivers / 606 unique milestone events, exact keyset bindings, source recheck, active/inactive and valid-preexpiry availability, distinct actual-expiry work.                                           |
| `credential-reminder_approved-recipient-and-immutable-durable-handoff`       | Configured recipient; missing/invalid pending recovery; foreign request recipient ignored; immutable replay/config change; delayed and rejected real repository COMMIT; actual NotificationDelivery enqueue boundary and tenant-isolated receipt readback.                                                                          |
| `credential-reminder_renewal-dedup-restart-and-honest-receipt`               | Restart and concurrent ordinary instances; applied COMMIT with lost ACK; rejected/uncertain outbox acceptance; accepted-outbox-before-link failure; renewal while enqueue ACK is held; real late provider acceptance/history; same-expiry retry and changed-expiry revision.                                                        |
| `credential-reminder_actual-production-scheduled-entry-and-safe-preparation` | Actual module startup and original periodic timer cross T30, clean up correctly, and recover through a fresh instance; actual existing awaited controller; canonical bounded scan rather than the expiring-license list. No VM service or cloud action.                                                                             |
| `credential-reminder_exact-candidate-validation`                             | Original before snapshot and direct exits, 18-file final regression union, API Source typecheck, own test typecheck, lint, original assertion/method preservation proof, managed hooks, immutable handoff manifest. New candidate CI, independent review, protected merge and five acceptance keys remain reviewer/integrator work. |

## Executed checks and retained diagnostics

Machine evidence: `.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/preexpiry-original-source-evidence/`.

- `actual-before-collected`: direct exit **1**, original three cases: expired positive **1 PASS**, future T30 and T7 zero-intent failures **2 FAIL**, no skipped cases. `before-original-reminders.test.ts.txt` preserves the original three-case snapshot; `actual-before-source-binding.json` binds the two original production blobs and test snapshot to the accepted base.
- `first-fixed`: direct exit **0**, the same original three cases **3 PASS**.
- `full-own-fixed`: direct exit **0**, the then-expanded set **18 PASS**. Later additions are not counted as before cases.
- `final-union`: direct exit **0**, exact **18 files / 203 PASS / 0 FAIL / 0 SKIP**. This includes the final **20 own cases** and **183 existing cases**. Repeated runs and overlapping subsets are not added to this union.
- `api-source-types-initial`, `final-own-types`, and `final-lint`: direct exit **0**. Focused type configurations retain the repository compiler flags and bind workspace packages to tracked Source; these do not claim a full root or hosted CI run.
- `source-and-assertion-preservation.json` records unchanged Registry members/rails, the retained original three-case AST, and every original B4 assertion statement. The two original 4/6 page counts, 100/2 limits, driver/policy keysets, and event expectations retain their original values; separate assertions cover the new reminder query bindings.

Preparation failures remain in the evidence packet: initial missing workspace dependency link caused zero collection; an early expansion used a partially initialized source cache for unrelated dates and was corrected to pass the actual full license command; own gate generic/optional-property type errors were fixed without changing compiler options; a temporary final-list config used a wrong path, and an output validator initially expected absolute instead of relative paths. None is claimed as a product before result. `affected-initial` is separately retained: 181 PASS / 2 FAIL caused by an existing test counting both SQL query families, corrected only after normal R4 scope coordination. Earlier printer-format comparison diagnostics are retained; the final preservation proof compares the original AST structure.

## Validation boundary

All execution on this VM was socket-free repository checking. Registry decisions, controller, repository SQL/transaction calls, source checks, notification idempotency, and receipts are production code. SQL transports and external outbox/provider faults are controlled **SIM** boundaries; they are not a live PostgreSQL server or external delivery proof. Original installed Pool regression uses an explicit socket-free client, and original mail-outbox tests use controlled transports/tempfiles.

No HTTP, browser, PostgreSQL, Docker, development server, cloud/IAM/job, provider-account, or deployment operation was performed. Actual hosted database continuity, authorized live recipient/provider delivery, required new-candidate CI, independent review, protected merge, and acceptance recording remain explicit downstream qualifications. This finite Source delivery does not claim those outcomes or alter their existing owners.
