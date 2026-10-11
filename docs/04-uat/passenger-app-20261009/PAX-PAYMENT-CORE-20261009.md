# PAX-PAYMENT-CORE-20261009

Owner: Codex. Reviewer: Codex2. Source base:
`62a73710e87c0163c7e82a5956612be558e554bf` (real Booking PR #2553 delivery).
This is an implementation checkpoint, **not a candidate or acceptance**.

## Authority and actual callers

- Full original task/common and registered supplement
  `.local/continue-completion-frontier-20261011T0710Z/PAX-PAYMENT-ORIGINAL-SOURCE-AFTER-REAL-BOOKING-DELIVERY.md`
  were read; user 2026-10-10 decision prohibits all cancellation charges.
- SA/SD §4 uses `PSP_TOKEN_ENCRYPTION_KEY_NAME`; §8 requires encrypted tokens,
  completion capture, the existing billing authority, recovery, and unpaid fences.
- P5 source `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/source_specs/01_system_development_team_spec_20260720.md`
  §12 defines `not_selected/authorized/captured/failed/refunded/manual_recovery`.
- Formal allocation is V0115, `V0115__passenger_payment_core.sql`, primary tables
  `passenger.psp_tokens`, `passenger.payment_idempotency_keys`,
  `passenger.payment_charge_records`. V0056, V0060 and V0084 govern existing billing
  columns, attempt count/actions, and currency `TWD`.
- `OwnedMobilityService.buildMultiTaxiCertificateEvent` supplies `fareMinor` from
  committed driver-completion fare (`task.fare`), not a passenger fare quote.
  `executeDriverCompletionOutboxEffect` / `publishMultiTaxiCertificateEvent`
  emit `owned-mobility.multi-taxi-trip.completed` through a durable completion
  outbox. A listener can be added inside the authorized payment directory.
- `PassengerBookingService.createRide` and
  `PassengerBookingRepository.commitBooking` are the valid payment-method and
  unpaid-create seams. Preserve the existing transaction callback and cancellation.
- `PassengerAccountService.deleteAccount` and
  `PostgresPassengerAccountTransaction.anonymize` are deletion seams. The latter
  is also called by `FacebookDataDeletionService.delete`, so a defensive guard
  there must cover that alternate path without editing the OAuth directory.
- Billing recovery currently uses `PlatformManualPaymentRecoveryPort`; its
  repository independently changes the billing authority. A new adapter must
  preserve state agreement and avoid treating `accepted` as a successful capture.

## First independently verifiable unit (2026-10-11)

Added `PaymentProviderPort` (bind/3DS, capture/refund, explicit readback and
unknown acknowledgement), `FakePaymentProvider`, `PaymentTokenCipher` and
`paymentRuntimeFromEnv`. No network calls, API/module registration, financial
ledger, production migration or booking/account changes in this checkpoint.

Cipher uses AES-256-GCM, fresh 12-byte nonces and 16-byte tags. AAD binds schema,
version, key ID, passenger and method. The secret slot is exactly
`PSP_TOKEN_ENCRYPTION_KEY_NAME`, whose proposed internal value is a JSON keyring
`{activeKeyId,keys:{id:base64_32_bytes}}`; old keys must be retained during rotation.
No plaintext token/cipher/key/error-cause logging. No Secret Manager access.
The configuration helper requires explicit `PSP_PROVIDER=fake`, complete SD §4
settings and sandbox=true. `DRTS_ENV` is the product environment: shared dev's
`NODE_ENV=production,DRTS_ENV=development` is permitted; absent/unknown/production
`DRTS_ENV` rejects fake selection even with missing settings. Uncontracted real
adapters remain unavailable. Startup enforcement still requires module wiring.

## Verification ledger (retain unresolved rows)

| Finding / acceptance                               | Source / change                               | Old → new                                                                                                                               | Command / exit / version / evidence                                                                                                                                                                                         | Unverified / concrete limits                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token confidentiality/integrity/rotation           | `payment-token-cipher.ts` encrypt/decrypt/AAD | No payment implementation at source base → production cipher called by unit tests, tamper and wrong-owner/method rejected               | `pnpm exec vitest run tests/unit/pax-payment-core-20261009/security-boundary.test.ts`, exit 0, 1 file / 26 tests passed; `.local/pax-payment-core-20261009/security-boundary.log`; Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4 | No persisted tokens / real key rotation / hosted PG claim                                                                                                |
| Fake production/config matrix                      | `payment-runtime.config.ts`, fake constructor | No provider → production/unknown/absent rejected; all partial groups disabled; test/development/staging enabled with synthetic settings | Same 26-test run, exit 0; production helper and constructor are real, no mocked selection                                                                                                                                   | API startup module registration not yet implemented                                                                                                      |
| One-use binding / 3DS / money idempotency readback | `fake-payment-provider.ts`                    | No provider → synthetic credential exchange, replay, changed payload refusal, 3DS/pending/declined, capture/refund readback covered     | Same 26-test run, exit 0; fake is the external PSP boundary, not persistence evidence                                                                                                                                       | Contracted PSP hosted fields, browser, challenge callback, real money remain external gate                                                               |
| Source lint                                        | New payment directory and test                | New files checked                                                                                                                       | `pnpm exec eslint apps/api/src/modules/passenger-app/payment tests/unit/pax-payment-core-20261009 --max-warnings=0`, exit 0; `.local/pax-payment-core-20261009/security-lint.log`; Prettier write exit 0                    | Scoped only                                                                                                                                              |
| `pax-payment_bind_charge_and_states`               | Original task, SD §8, V0115/V0056/V0060/V0084 | Not implemented yet beyond provider boundary                                                                                            | Pending                                                                                                                                                                                                                     | Binding SQL/API, completion capture, durable attempts, full state mapping/refunds and independent review/CI remain                                       |
| `pax-payment_security_and_recovery`                | Original task/common/P5 §12                   | Cipher/config tests passed; financial fences/recovery remain                                                                            | Pending                                                                                                                                                                                                                     | Missing canonical retry count/delay policy; production startup, notification, unpaid booking/delete fences and hosted PG/HTTP/provider acceptance remain |

Repository dependencies were installed in this isolated worktree from the local
pnpm cache (`pnpm install --offline --frozen-lockfile --ignore-scripts --filter
drts-fleet-platform --filter @drts/api...`, exit 0). The supplied canonical-root
node*modules links were removed without touching their targets. Contracts and
control-plane-auth builds both exited 0. The untracked `.husky/*`delegation
wrappers use the installed Husky 9.1.7`husky` script, so the installed task guard
delegates the original tracked pre-commit/commit-msg chain; core.hooksPath and
tracked hooks/configuration were not changed or bypassed.

## Required coordination / remaining work

The original task says failures retry "依政策"; SD §8 and P5 §12 do not define
the retry maximum, interval/backoff, or handling of definitive decline versus
unknown acknowledgement. Search of current canonical architecture/decision and
payment recovery code found no approved payment retry schedule. This is a
financial business policy, so no arbitrary numeric default is introduced. Owner
recorded the exact gap through the active release `progress` command for Supervisor
coordination. Safe independent token/provider work continues; this checkpoint is
not a full source handoff. No previous Payment candidate/review/PR exists.

All hosted PG, API/HTTP, browser, notification and contracted PSP acceptance are
unexecuted. No servers, containers, cloud authentication, external secrets,
real provider calls or deployments were started on this VM.

## Second checkpoint: persisted binding and defensive deletion guard

First published anchor: `93cf5bb92351543af5db84ced1086be7a8ae25b6`.
Added V0115, `PaymentMethodRepository`, `PaymentMethodService`,
`PaymentMethodController` and the append-only module providers/controller.
GET/POST/DELETE payment-methods and PUT default use `PassengerAccountService.getMe`
to validate the actual live passenger identity. Repository mutations lock the
active account in a transaction. The binding claim is committed before provider
exchange; replay with another owner is refused before contacting the PSP.
Exchange errors retain the pending claim, and completion atomically writes the
encrypted method and journal outcome. Responses explicitly project metadata or
3DS/pending status, never a provider object with extra token fields.

Removal clears the encrypted token only after checking owned noncancelled
financial obligations; expired cards remain removable. Default mutation requires
an active unexpired owned card and serializes on the account row. Fake refunds
now refuse totals above the original capture even with another refund key.

`PostgresPassengerAccountTransaction.anonymize` checks unpaid/active obligations
inside its existing transaction. This covers both DELETE /me and the existing
last-identity Facebook deletion caller; refusal rolls back session revocations
and leaves anonymization/financial retention unchanged. The new helper's booking
mode is **not wired yet**. No cancellation handler or fee was changed.

### SQL field comparison for binding (PG still unexecuted)

| Formal V0115 column / type                                                                      | Production SQL arguments / projection                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `psp_tokens.payment_method_id uuid`                                                             | claim `entity_id`; INSERT $1; `row.payment_method_id` → `paymentMethodId`                                                                                                 |
| `drts_passenger_id varchar(100)`                                                                | authenticated owner, INSERT $2; every method lookup/update filters owner; matches V0109 account key                                                                       |
| `provider text`                                                                                 | INSERT $3; provider name from configured backend; not in public projection                                                                                                |
| `token_envelope jsonb`                                                                          | INSERT $4::jsonb; AES-GCM envelope only; no plaintext credential/token argument to SQL                                                                                    |
| `last4 varchar(4), card_type varchar(40)`                                                       | INSERT $5/$6, validated provider display metadata; `last4/cardType` projection                                                                                            |
| `expiry_month varchar(2), expiry_year varchar(4)`                                               | INSERT $7/$8; string/format and expiry validated; numeric SQL comparison uses these actual columns                                                                        |
| `is_default boolean`                                                                            | INSERT computed NOT EXISTS under account lock; default change clears then sets; public boolean projection                                                                 |
| `status text, removed_at timestamptz`                                                           | defaults active; removal sets removed, clears envelope/default, stamps now; constraint enforces removal shape                                                             |
| `created_at timestamptz`                                                                        | default now; list ordering only; no fabricated API timestamp                                                                                                              |
| `payment_idempotency_keys.idempotency_key text`                                                 | `pax:bind:` + SHA256(provider/credential); INSERT $1; replay filters operation=bind and locks row                                                                         |
| `operation text, drts_passenger_id varchar(100), entity_id uuid, credential_digest varchar(64)` | literal bind, owner $2, reserved random method UUID $3, digest $4; global unique credential index; no raw credential stored                                               |
| `outcome text, error_code text, created_at/updated_at timestamptz`                              | pending default; completed/pending/action_required/failed updates scoped to owner; fixed error classification; concurrent incomplete responses cannot overwrite completed |
| `payment_charge_records` / existing billing authority                                           | DDL reservation only; **no charge/state writer yet**. Its SQL/row/state acceptance remains pending; do not treat the reservation as financial delivery.                   |

### Additional findings / checks

| Finding / acceptance                         | Source / change                                                        | Old → new                                                                                                                         | Commands / exits / evidence                                                                                                                                                                                                                                                                                                                                                                                                               | Limits                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unpaid account deletion                      | `anonymize`, `assertNoUnpaidPassengerRides`                            | Actual repository at anchor 93cf5bb permits deletion → current repository rejects with pending_payment_block and no anonymization | `PAX_PAYMENT_ACCOUNT_SOURCE="$PWD/.local/pax-payment-core-20261009/account-repository-93cf5bb.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/historical-deletion-probe.test.ts`: exit 1, **1 actual failing test**, old promise resolves; `deletion-old-93cf5bb-retry.log`. Current same probe included in regression: pass. Historical source extracted with git show, only imports rewritten; active worktree not reset. | Database replies mocked; no PG engine/constraint/concurrency proof. Both production deletion paths share this repository method. |
| Binding journal/ownership/confidentiality    | binding repository/service/controller/module                           | Absent at 93cf5bb → real service and production SQL orchestration tested with database/PSP boundaries mocked                      | `pnpm exec vitest run tests/unit/pax-payment-core-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-facebook-login-20261009 tests/unit/pax-booking-history-20261009`: exit 0, **15 files / 419 tests passed**; `checkpoint-regression.log`                                                                                                                                                                                  | No HTTP server, provider contract, 3DS browser, actual PG or billing capture evidence                                            |
| Typecheck and lint                           | All second-checkpoint source/test changes                              | First binding typecheck exit 2 (strict indexing of body key) → fixed, final API typecheck exit 0                                  | `pnpm --filter @drts/api typecheck`: exit 0, `checkpoint-typecheck.log`; original failure `binding-typecheck.log`. Scoped `pnpm exec eslint ... --max-warnings=0`: exit 0, `checkpoint-lint.log`                                                                                                                                                                                                                                          | Scoped source + API compiler; no full hosted CI claim                                                                            |
| Historical probe initial environment failure | Historical extracted repository import                                 | Initial missing Nest package → rewrote import to isolated installed API dependency → actual test executes/fails as above          | `deletion-old-93cf5bb.log`: exit 1, **0 tests**, not a valid behavioral reproduction; retained separately from successful reproduction setup                                                                                                                                                                                                                                                                                              | No canonical-root dependencies linked; no claimed pass from fixture failure                                                      |
| Repository classification/whitespace         | task-owned files                                                       | Current tracked repository classification validated                                                                               | `node tools/ci/check-repo-classification.mjs`: exit 0, `checkpoint-classification.log`; `git diff --check`: exit 0                                                                                                                                                                                                                                                                                                                        | New files also checked on staged commit via original hooks; not full CI                                                          |
| `pax-payment_bind_charge_and_states`         | Binding source available; completion/recovery/refund source incomplete | Partial implementation only                                                                                                       | No acceptance recorded                                                                                                                                                                                                                                                                                                                                                                                                                    | Real billing/state writer, retry/manual recovery/notice, platform refund, PG/HTTP/independent same-SHA review/CI remain          |
| `pax-payment_security_and_recovery`          | Cipher/config/bind ownership/deletion guard verified in scoped tests   | Security source advances; entire recovery incomplete                                                                              | No acceptance recorded                                                                                                                                                                                                                                                                                                                                                                                                                    | Unpaid booking transaction guard and approved retry policy remain, plus hosted tests/external provider gate                      |

All local evidence files above are under this isolated worktree's
`.local/pax-payment-core-20261009/`; final test/tool versions remain Node 22.23.2,
pnpm 10.33.0, Vitest 4.1.4. Every launched local check finished and its results
were read. No review candidate is locked, no `done`/acceptance was written.

### Exact Supervisor coordination requests before remaining shared integration

1. Provide/cite the approved payment retry maximum and delay/backoff, and the
   treatment of unknown acknowledgement versus definitive decline. Existing
   original/SD/P5 authority only says retry by policy, so financial defaults are
   absent. No policy values were fabricated in source or configuration.
2. Extend the original task's test scope (after overlap check) to
   `tests/unit/pax-booking-history-20261009/`. Its
   `production-booking-fixture.ts` creates `paymentMethodId: "payment-unit"`,
   `booking-history-spec.test.ts` creates `"pm-1"`, and
   `booking-atomicity.test.ts` assumes no account FOR UPDATE during commit.
   These are actual callers of the production service/repository that must be
   updated to supply an owned valid method/account-locked payment transaction
   when the required unpaid/method guards are wired. Current task scopes permit
   only `tests/unit/pax-payment-core-20261009/` and API tests, so those predecessor
   fixtures were read but not edited. Preserve their R2/R9 assertions and add
   proper positive payment prerequisites; do not relax them or insert fallback
   payment IDs just to keep old mocks passing.

The original owner continues this task; these are coordination gaps, not a new
helper task, external PSP gate waiver, candidate or source completion claim.

## Publication and CI repair checkpoint

Published binding/deletion source checkpoint:
`f549b8be3c9b95be89059579d9b77278338b667e`.
Draft PR: <https://github.com/ajoe734/drts-fleet-platform/pull/2555>.
Local, remote branch and draft head were checked equal before publication;
base62 → HEAD trailer checker ran with `COMMIT_TRAILER_BYPASS` unset (2 commits
OK), and the worktree was clean. This remains an incomplete draft, not handoff.

Both automatically started hosted runs for f549b8be finished and were read:

- CI [38127142993](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38127142993):
  **failure**, 11 SUCCESS / 2 FAILURE. Product smoke root typecheck found three
  test-only errors in this task (two exactOptionalPropertyTypes call-record
  fields storing undefined, one unchecked Buffer index). Aggregate Smoke
  acceptance also failed. Exact log retained in
  `.local/pax-payment-core-20261009/ci-38127142993-failed.log`.
- CI integration
  [38127143023](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38127143023):
  workflow success, **5 SUCCESS / 12 SKIPPED**. Build/typecheck/unit/integration
  and individual E2E gates were skipped; `e2e` only ran the aggregate step.
  This is explicitly **not full CI or runtime acceptance**.

The three test typing errors were corrected without changing product behavior.
`pnpm exec vitest run tests/unit/pax-payment-core-20261009` passed 4 files / 52
tests, exit 0 (`type-fix-unit.log`); test lint exit 0 (`type-fix-lint.log`). First
local `pnpm typecheck:root` retry exited 2 because the earlier API-only filtered
installation omitted other workspace packages; it contained no remaining errors
in this task (`root-typecheck-fixed.log`). Installed all workspace dependencies
from the offline cache with `pnpm install --offline --frozen-lockfile
--ignore-scripts` (exit 0, no source/lockfile change). Then
`pnpm typecheck:root` **passed, exit 0** (`root-typecheck-full-install.log`).
This corrects the earlier omission: API typecheck alone never validated the root
test files. CI for the newly published typing-fix head must be read separately;
the failed f549b8be result is retained, not overwritten or reported as success.

The approved retry-policy and Booking test-scope coordination requests above
remain unresolved; full charge/recovery/refund/booking source is not complete.
Neither acceptance key, candidate handoff, independent approval nor `done` has
been recorded.

## Caller regression and UUID reference repair

Adjacent published checkpoint:
`2b8934762dd117e33ff71bb415cc596527e42751`. Its CI
[38127675470](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38127675470)
finished/read: root/workspace typecheck and migration application passed, root
unit step passed, API units **1665 passed / 1 failed (174 files)**. The sole
failure was the preexisting Facebook caller test forbidding any billing SQL,
which now conflicts with the required unpaid authority read. The product guard
was retained; within the original allowed API test scope, the test now explicitly
checks the owner's unpaid read and still forbids all financial writes. A new
negative test invokes the real `FacebookDataDeletionService.delete` and real
account repository, refuses debt, rolls back, and returns no deletion receipt.
`pnpm --dir apps/api exec vitest run tests/unit/facebook-data-deletion.repository.test.ts`
passed **5 tests**, exit 0; `facebook-caller-unit.log`. Old CI failure log is
`ci-38127675470-failed.log`. Integration run 38127675482 succeeded with the same
draft skip limitation; it is not full source acceptance.

An additional finding during caller/SQL inspection: the UUID PK admits
case-equivalent input, while the previous method-removal obligation query compared
the order JSON string literally. An upper/lowercase spelling could therefore
miss a reference even though owned-method lookup resolves the same UUID.
`PaymentMethodService.paymentMethodId` now canonicalizes the UUID, and
`PaymentMethodRepository.remove` compares both order reference and parameter in
lowercase. This protects references saved by the current Booking caller, which
previously forwarded the request spelling verbatim. No payment IDs are invented.

| Finding / requirement               | Actual boundary / repair                                                                                      | Old → new evidence                                                                                                                                                                                      | Commands / limits                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Case-equivalent removal/default IDs | production service `paymentMethodId`, repository `remove`, formal V0115 uuid PK and OwnedOrder JSON reference | Extracted real 2b893476 service forwards uppercase; same service probe expects canonical owner-scoped argument and fails **1 executed test / 1 other probe passes** → current real service probe passes | `PAX_PAYMENT_METHOD_SOURCE="$PWD/.local/pax-payment-core-20261009/payment-method-service-2b893476.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/historical-deletion-probe.test.ts`, exit 1, `method-case-old-2b893476.log`; source snapshot imports only rewritten, no active-tree reset. Repository query examined against formal UUID/JSON fields; actual PG case/race behavior still unverified. |
| Direct Facebook caller / retention  | API unit file, existing real service+repository                                                               | Old blanket no-billing-read assertion fails exact CI SHA → updated no-financial-write and debt refusal cases pass                                                                                       | 5 API caller tests pass, exit 0; PostgreSQL replies are mocked, not a fabricated PG engine. Preserve other-owner/stale-identity/remaining-login/rollback checks.                                                                                                                                                                                                                                                    |
| Affected regression                 | root Payment + Booking + Account + Facebook suites                                                            | All previous scoped cases plus new normalization probe pass                                                                                                                                             | Same four-suite command, **15 files / 421 tests**, exit 0; `uuid-caller-regression.log`                                                                                                                                                                                                                                                                                                                             |
| Compiler/lint                       | Current product normalization and caller-test changes                                                         | root and API compiler both pass                                                                                                                                                                         | `pnpm typecheck:root`, exit 0 (`uuid-root-typecheck.log`); `pnpm --filter @drts/api typecheck`, exit 0 (`uuid-api-typecheck.log`); scoped ESLint exit 0 (`uuid-caller-lint.log`)                                                                                                                                                                                                                                    |

Canonical L1/L2 product/spec/execution bundles were also searched for payment
retry policy during the CI wait; no approved maximum/delay was found. Both
Supervisor coordination requests remain. These repaired source checkpoints still
do not implement the pending completion/dual-state/retry/recovery/notice/refund/
booking work or supply either original acceptance key.

## Exact Booking prerequisite grant and transaction guard

Latest binding checkpoint `ab167c2cad6a789f5c3fd576d6b95e99f275abc4`
hosted CI [38128935251](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38128935251)
completed/read **13 SUCCESS / 0 FAILURE**. Integration
[38128935252](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38128935252)
completed/read **5 SUCCESS / 12 SKIPPED**, not full integration/runtime acceptance.
Both JSON results are retained under `.local/pax-payment-core-20261009/` as
`ci-ab167c2-main.json` and `ci-ab167c2-integration.json`.

Supervisor updated the original task's spec to
`.local/continue-completion-frontier-20261011T0710Z/PAX-PAYMENT-EXACT-ORIGINAL-BOOKING-FIXTURE-PAYMENT-PREREQUISITE-SUPPLEMENT.md`
and granted only the three explicitly listed Booking fixture/test files. This
resolves coordination request 2 above; the broader Booking test directory remains
outside the write scope. Full supplement was read. The retry-policy gap remains,
with explicit validated injected policy and synthetic test policy authorized;
there are no invented real financial default values.

`PassengerBookingService.createRide` requires and canonicalizes a UUID method,
without constructing a fake/fallback reference. `commitBooking` now rechecks
active account, unpaid obligations and owned active/unexpired method, under
account/method locks on the SAME PoolClient before order/token/history writes.
Method lookup uses the existing production `requireActivePaymentMethod` query
against formal V0115 fields. Account/default/remove and Booking share the account
lock order. Cancellation handlers/fees, dispatch and transaction failure cleanup
are unchanged. Financial completion writers still await implementation, so this
is not an end-to-end concurrency/charge claim.

| Finding / requirement                               | Real boundary / change                                                                                                                         | Old → new execution                                                                                                                                                                                                                                                                                                                                          | Verification / concrete limits                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unpaid new-booking fence                            | `PassengerBookingRepository.commitBooking`, `assertPassengerCanBook`, existing unpaid authority query                                          | Real ab167c2 repository git-show snapshot, with imports only rewritten, allows unpaid booking and resolves persist callback → current repository rejects debt before callback                                                                                                                                                                                | Old probe exit 1, **1 executed FAIL / 11 filtered SKIP**, `booking-debt-old-ab167c2.log`; initial Nest import setup failure exit 1 / **0 tests** retained separately as `booking-debt-old-ab167c2-setup.log`, not behavioral evidence. Actual PostgreSQL/HTTP unexecuted.                                   |
| Exact delivered Booking fixtures need valid methods | Three granted test files; genuine Account/Booking/MultiTaxi/Owned/repository paths retained                                                    | Unmodified test files checked equal to immutable source62 before changes; applying new Payment guards executes **62 FAIL / 96 PASS**, `booking-original-prerequisite-failure.log` → first prerequisite repair **157 PASS / 1 FAIL**, `booking-prerequisite-fixed.log` → complete positive account-owner SQL responses **158 Booking PASS**, no skipped cases | Initial remaining account-switch failure came from fixture SQL hardcoding OWNER instead of the configured fixture account. Only granted fixture was repaired; no access/realm/cancellation tests edited. Each exact method lookup remains UUID+owner matched, not unconditional rows.                       |
| R2/R9 unchanged financial/ownership authority       | Original four lead values, all nine fault groups, lost COMMIT/rollback eviction, pending-history, terminal compensation and cancellation cases | Existing cases pass with owned formal method rows; positive assertions now require account/debt/method reads in order before any insert on same transaction. Failed persistence still has no compensating order lock/write                                                                                                                                   | Payment+Booking **10 files / 224 PASS**, `booking-payment-regression.log`; all affected Payment+Booking+Account+Facebook **16 files / 433 PASS**, `booking-full-affected-regression.log`; exit 0, no skips.                                                                                                 |
| Required method/account negative paths              | Real service+repository and SQL response boundary                                                                                              | Missing/malformed IDs, foreign/nonmatching/expired/removed method responses, deleted account and unpaid obligations refuse all inserts and publication; valid owned method succeeds                                                                                                                                                                          | New `booking-payment.test.ts`, 12 tests; expiry/status filtering is PG's external boundary (mocked rows), not an engine simulation. Root/API typecheck and scoped ESLint exit 0: `booking-root-typecheck.log`, `booking-api-typecheck.log`, `booking-lint.log`; Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4. |

Completion capture, actual dual billing/charge status writes, durable retry,
unknown acknowledgement, recovery notices, platform refunds, PG/HTTP and full
same-SHA independent review remain. Neither original acceptance key is recorded;
this is still an incomplete draft/source checkpoint, not candidate or `done`.

## Explicit injected capture policy decision boundary

Booking source checkpoint:
`aff151fb531869396acbdb3fd81d5191f42bfeab` (ordinary non-force push, PR head
verified equal). `payment-capture.policy.ts` now defines the explicitly injected
`PaymentCapturePolicy` and validates ALL three fields:
`retryDelaysMs`, `retryDefinitiveDeclines`, `unknownReadbackDelaysMs`.
Missing/partial/unknown fields, sparse arrays, noninteger/negative/nonfinite
delays and nonboolean decline policy fail without a fallback. The capture maximum
is one initial request plus the supplied retry schedule length. Schedules are
copied and frozen. No configuration name, environment default, production retry
numbers or deployment settings are invented.

`captureDisposition` distinguishes definitive retryable failures from unknown
acknowledgement. Unknown/pending can only schedule a readback of the original
order key, on its separate supplied readback budget; exhausting either applicable
budget requests `manual_recovery` and a recovery notice. Nonretryable failures
never schedule another capture. `accepted`, invalid provider results and an empty
completion reference cannot produce captured status. Only completed acknowledgement
or completed readback yields captured. The output is a decision, NOT an actual
ledger write/attempt increment, refund, notification, scheduler or retry executor.
This boundary is not wired into a money workflow yet.

| Finding / requirement                               | Source / formal boundary                                                                          | Verification / evidence                                                                                                                                                                                                                                                                                                                                                         | Remaining limit                                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retry business values absent                        | Supervisor's exact supplement permits validated explicit injection and synthetic TEST policy only | `pnpm exec vitest run tests/unit/pax-payment-core-20261009/capture-policy.test.ts`, exit 0, **25 PASS**, `capture-policy-unit-final.log`; missing/invalid policy refuses, caller mutation cannot change schedule                                                                                                                                                                | Approved real policy values still need Supervisor coordination; no product defaults created. New capability did not exist at source62; no behavioral old-policy probe is claimed.                                 |
| Unknown acknowledgement / durable count distinction | Real `captureDisposition`, real FakePaymentProvider capture/readback                              | Lost-response test calls the real fake once, classifies local unknown as failed/readback, then classifies original-key completed readback as captured; definitive decline boolean/budget exhaustion/notice cases covered                                                                                                                                                        | Synthetic PSP boundary only. Durable DB persistence, crashes, replica races, automatic execution and delivery remain unimplemented/unverified.                                                                    |
| Source checks                                       | All affected source/tests                                                                         | **17 files / 458 PASS**, exit 0, `policy-affected-regression.log`; root and API typecheck exit 0 (`capture-policy-root-typecheck.log`, `capture-policy-api-typecheck.log`). First scoped ESLint exit 1 for `no-control-regex` (`capture-policy-lint.log`) → equivalent code-point validation, final lint exit 0 (`capture-policy-lint-fixed.log`) and final policy unit 25 PASS | The 458-test run preceded that equivalent lint-only expression repair; final 25-test run exercises repaired source. Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4. Hosted CI for each published SHA read separately. |

The first Booking checkpoint commit-message guard refused lowercase agent trailer
`codex`; the staged source was preserved and publication succeeded with actual
owner trailer `Codex` / reviewer `Codex2`, without bypassing or modifying either
the task guard or original Husky chain. Source62 → aff151fb trailer checker then
passed all five commits with bypass unset. Remaining full financial workflow and
both acceptance keys from prior rows are still pending, not waived by these
decision tests or the earlier green binding CI.

## Completion, durable capture/readback, and manual recovery checkpoint

Dispatch resumed from published `1a735f573746d71560d0809ea7c79cc7a32f04d1`.
The initial completion source anchor is
`dfc9f7edae89096b5ff4b76b85a7dec2455f2bcd`, ordinarily pushed to the same
draft PR [#2555](https://github.com/ajoe734/drts-fleet-platform/pull/2555).
This section records the subsequent tested repair; the final published source
identity/run results are recorded through the active-release task `progress`
and `.local/pax-payment-core-20261009/charge-published-identity.json`.
There is still **no candidate, handoff, acceptance or done**.

`PaymentChargeService.onTripCompleted` subscribes to the actual durable
`owned-mobility.multi-taxi-trip.completed` event, not the tenant-only settlement
event. `PaymentChargeSession.initialize` resolves the owner from formal V0113
Booking history, locks that account first, and reads the completed order/task
from formal V0011/V0056. The runtime, owner, completed states, task fare/currency
and completion time must agree. The selected method UUID is taken from the
server order. The actual task fare is used, matching CertificateSupport's
receipt total; the quote and separately reported toll are never added to it.
Guest orders, including legacy non-UUID guest IDs, acquire no first-party
financial records. Cancellation never enters this writer.

The one-order capture key is `pax:capture:<canonical order UUID>`. Its journal,
billing authority and charge ledger are committed before PSP execution. Since
the card is already selected, an unpresented obligation is `failed` with
`unavailable` and attempt zero, rather than the P5 UI's `not_selected` (which
means no method selected). No PSP authorization is fabricated. Missing policy,
provider or cipher leaves that debt unpaid and sends no money request. The
production module currently has **no approved PAYMENT_CAPTURE_POLICY binding**;
it remains disabled for money until Supervisor supplies the real policy.

A dedicated PG session holds an order advisory lock across short transactions
and PSP I/O; there is no open transaction during PSP I/O. Before capture, the
writer reserves the attempt and commits `failed/unknown`, next operation
`readback`, and an operation UUID in both relevant ledgers/journal. A lost
pre-request COMMIT acknowledgement may reserve without sending; the conservative
recovery still reads the original key and never sends another capture. Readbacks
increment their separate durable count. UUID fencing rejects late writes after
another worker advances the operation. Billing/status/amount/currency/method/
capture-ref/count disagreement refuses processing, not silent reconciliation.
SQL/crypto/PSP exceptions are scrubbed; tokens appear only in memory at the PSP
boundary, never in repository SQL, returned objects, errors or logs.

`captureDisposition` now drives real writes: definitive eligible failures retry
under the same key at the explicitly supplied delays; unknown/pending/invalid
acknowledgements read back under their own budget; only completed acknowledgement
with a valid reference writes captured. Exhaustion atomically writes
`manual_recovery` in both tables and stamps `recovery_notice_requested_at` once
on the owned charge ledger. The owner and order are already recorded there.
The first a985 publication incorrectly inserted a new consumer outbox event;
the contract correction below removes that unsupported shared-transport write.
This is a durable notice request, **not completed notification delivery**.
The hosted `PaymentChargeWorker` scans due durable state at startup and every
second (operational polling, not a financial retry default); it requires DB,
PSP, cipher and explicit validated policy. Unit lifecycle checks use a fake
clock. No actual API/worker product runtime was started on this VM.

`PassengerCoreManualPaymentRecoveryPort` wires the existing authorized platform
Billing recovery caller to that same charge writer and notice request. Legacy manual
handoff remains accepted without pretending PSP success. The Billing receipt
transaction locks the account, verifies matching ledgers and records only the
recovery receipt for managed passenger payments; it cannot independently rewrite
their status or increment their attempt count. A legacy port claiming a core
result is refused. Existing platform `billing:write`, command-idempotency and
audit checks remain in the actual Billing service. Ops `retry_capture` remains
unavailable; automatic retries use the fenced worker. Platform refund API and
durable refund workflow are the next unfinished source unit.

### Field-by-field charge / billing SQL audit (PG unexecuted)

| Formal migration column / type                                                          | Actual writer / argument / read mapping                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V0115 journal `idempotency_key text, operation text`                                    | initialize $1=`pax:capture:<order UUID>`, literal capture; replay SELECT locks and verifies operation                                                                                            |
| Journal `drts_passenger_id varchar(100), entity_id uuid, credential_digest varchar(64)` | authoritative history owner $2, canonical order $3; capture has NULL credential digest as formal CHECK requires                                                                                  |
| Journal `outcome, error_code, created_at, updated_at`                                   | pending default; unknown committed before request; completed only after acknowledged capture; failure enum errors, unknown uses NULL error_code; DB timestamps                                   |
| Charge `order_id uuid, payment_id varchar(255)`                                         | initialize $1 order, $2 deterministic `pax-payment:<order>`; formal history/payment FK; load matches billing order text and ID                                                                   |
| Charge `drts_passenger_id varchar(100), payment_method_id uuid`                         | initialize $3 history owner, $4 order method UUID; composite method-owner FK; method join has both fields                                                                                        |
| Charge `idempotency_key text`                                                           | initialize $5, references committed journal; immutable one-order provider key                                                                                                                    |
| Charge `amount_minor bigint, currency char(3)`                                          | initialize $6 validated safe integer from completed task/event; literal TWD; load bigint converted with safe-integer check and compared to billing                                               |
| Charge `status text`                                                                    | initialized failed/unavailable, never artificial authorization; failed/captured/manual_recovery transitions use real validated disposition                                                       |
| Charge `attempt_count integer`                                                          | default 0; begin $2 reserves only capture; finish preserves count; readback/manual handoff never adds a capture                                                                                  |
| Charge **new** `readback_count integer`                                                 | default 0, nonnegative CHECK; begin $3 increments readback/reset on definitive capture retry; policy uses separate budget                                                                        |
| Charge **new** `next_operation text, operation_id uuid`                                 | allowed capture/readback or NULL; initial capture; begin readback + $4 UUID; finish decision operation or NULL and clears UUID; WHERE old UUID fences late writes                                |
| Charge `provider_capture_ref text, provider_refund_ref text`                            | validated completed reference goes to finish $4 and public billing ref; refund reference reserved, not yet written                                                                               |
| Charge `last_error_code text, retry_at timestamptz`                                     | initial unavailable; pre-request unknown; finish $5/$7 classified error/explicit-policy deadline; no raw provider error                                                                          |
| Charge `completed_at timestamptz`                                                       | initialize $7 matches authoritative completed task; no wall-clock replacement                                                                                                                    |
| Charge `recovery_notice_requested_at timestamptz, created_at, updated_at`               | notice flag finish $8 stamps COALESCE once, DB creation/update timestamps                                                                                                                        |
| V0056 billing `payment_id, order_id, payment_method_token_ref`                          | initialize $1/$2/$3; method-token-ref is our method UUID, never PSP token; verified against the charge ledger                                                                                    |
| Billing `status, amount_minor, currency, provider_payment_ref`                          | initialize failed/$4/TWD; real disposition status + validated capture ref; dual-table transaction; currency follows V0084                                                                        |
| V0060 billing `attempt_count integer, available_actions jsonb`                          | count equals reserved charge captures; available_actions remains formal [] default; managed Billing receipt never increments count again                                                         |
| V0056 consumer outbox                                                                   | a985's invented event INSERT removed after contract verification; no current payment write to the shared consumer transport. A typed payment event/transport needs Supervisor scope coordination |

### Findings, failures and verified scope

All paths below are relative to this isolated task cwd. Versions: Node 22.23.2,
pnpm 10.33.0, Vitest 4.1.4. Full commands/cwd are the dispatched workspace and
the named test paths; logs are `.local/pax-payment-core-20261009/`.

| Finding / acceptance                                                                                    | Actual source and result                                                                                                                                                                                                                                                                           | Command / exit / evidence                                                                                                                                                                                                                                                                                                              | Remaining limitation                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Previously absent completion/capture writer                                                             | real completion service, charge session/repository, fake PSP; committed request precedes PSP, actual fare rather than quote/toll, duplicate completion sends once, refusal branches execute                                                                                                        | Initial `pnpm exec vitest run tests/unit/pax-payment-core-20261009/charge-workflow.test.ts`: **17 PASS**, exit 0, `charge-unit-initial.log`; expanded workflow/worker: **33 PASS**, exit 0, `charge-unit-status-final.log`                                                                                                             | New capability absent at 1a735; no invented old behavior reproduction. SQL replies/PSP are external mocks, not PG engine/race/transaction evidence                                         |
| Unknown / crash / due retry / manual notice                                                             | real repository and policy; lost PSP response, lost pre-send COMMIT response, failed completion write, restarted service, readback budget, future retry deadline, stale operation UUID, foreign owner/provider, billing drift all exercised                                                        | `pnpm exec vitest run tests/unit/pax-payment-core-20261009 tests/unit/audit-recovery-providers-20261002.test.ts`: **10 files / 141 PASS**, exit 0, `charge-core-recovery-regression.log`; final affected suite below covers later source tightening                                                                                    | Dedicated-session locks, replicas, real lost COMMIT and rollback effects still need hosted PG. Fixture supplies potentially committed snapshots; it is explicitly not a rollback simulator |
| Legacy Billing receipt writer would diverge or double-count core ledger                                 | actual new port invokes real core service; real Billing repository accepts managed matching status/count/amount/currency/ref, rejects drift or unmanaged claim; legacy internal manual adapter retained                                                                                            | Final `pnpm exec vitest run tests/unit/pax-payment-core-20261009/billing-recovery-writer.test.ts`: **8 PASS**, exit 0, `charge-billing-writer-final.log`; no copied SQL implementation or mock core writer in these repository tests                                                                                                   | Provider/auth boundary HTTP acceptance pending; Ops retry command still disabled; platform refund unfinished                                                                               |
| Existing Billing caller sequence prerequisite                                                           | original API suite preserved; one SELECT for passenger ledger added before the legacy receipt write                                                                                                                                                                                                | Original unchanged assertion: **10 PASS / 1 FAIL**, exit 1, `charge-billing-fixture-original.log` → `pnpm --dir apps/api exec vitest run tests/unit/billing-payment-exception.test.ts tests/unit/facebook-data-deletion.repository.test.ts`: **16 PASS**, exit 0, `charge-final-api-caller-regression.log`                             | Original financial-no-token-write assertions retained; this is fixture sequence repair, not a claimed PG reproduction                                                                      |
| Original Booking R2/R9, realm/account switch, unpaid/create/delete, binding/cipher/provider regressions | all original suites plus current payment/manual-recovery/worker source                                                                                                                                                                                                                             | `pnpm exec vitest run tests/unit/pax-payment-core-20261009 tests/unit/pax-booking-history-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-facebook-login-20261009 tests/unit/audit-recovery-providers-20261002.test.ts`: **21 files / 508 PASS**, exit 0, `charge-final-affected-regression.log`; no skips             | No browser/HTTP/server/DB/provider acceptance inferred from unit passes                                                                                                                    |
| Compiler failures preserved and repaired                                                                | initial canonical-root symlinks supplied at dispatch caused missing dependencies; isolated offline reinstall/build fixed that. dfc9 anchor had TS2366 in withOrder; explicit return fixed it. A new test's explicit undefined optional flag violated exactOptionalPropertyTypes; omission fixes it | initial typecheck exit 2 `charge-initial-api-typecheck.log`; install exit 0 `charge-dependency-install.log`; builds exit 0; TS2366 `charge-initial-api-typecheck-fixed.log`; API final exit 0 `charge-final-api-typecheck.log`; root test failure exit 2 `charge-final-root-typecheck.log`, final root check recorded separately       | No source/lockfile/config alteration for dependency setup; worktree-only symlinks removed, targets untouched                                                                               |
| First published anchor CI was genuinely red                                                             | dfc9 hosted Typecheck failed on TS2366, no root/workspace pass claimed                                                                                                                                                                                                                             | [CI 38133163242](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38133163242): completed/read **11 SUCCESS / 2 FAILURE**, `charge-ci-first.json`, `charge-ci-first-failed.log`; [integration 38133163172](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38133163172): completed/read **5 SUCCESS / 12 SKIP** | Draft integration is not full runtime acceptance. The repair must obtain new same-SHA CI, recorded with the final published identity                                                       |
| `pax-payment_bind_charge_and_states`                                                                    | Binding + actual capture/status source now present; whole task still incomplete                                                                                                                                                                                                                    | **Not recorded**; all previous failure/skip/limits retained                                                                                                                                                                                                                                                                            | Durable platform refund, approved deployed policy binding, exact-SHA independent reviewer, full hosted CI/PG/HTTP and protected merge remain                                               |
| `pax-payment_security_and_recovery`                                                                     | Previous encryption/fake/unpaid fences preserved; durable retry/readback/manual writer and notice request now present                                                                                                                                                                              | **Not recorded**                                                                                                                                                                                                                                                                                                                       | Actual notification delivery/first-party route readiness, full financial crash/concurrency matrix and contracted PSP remain unverified; refund/recovery source and policy gate unfinished  |

Final root typecheck after the test-only omission repair **passed, exit 0**:
`pnpm typecheck:root`, `charge-final-root-typecheck-fixed.log`. The final
8-test Billing writer run and its lint also passed, exit 0. Scoped source/test
ESLint passed, exit 0 (`charge-final-lint.log`), and repository classification
passed, exit 0 (`charge-final-classification.log`). Every listed check is
completed/read. Whitespace and full range/individual role+scope checks are
captured again with final publication identity.

The generic dispatch `wip(...)` anchor subject was rejected by the existing
literal Task-ID publication guard. Owner then read the exact original-source
supplement/guard and used its required literal subject with genuine Codex/Codex2
trailers. The original installed Husky 9.1.7 delegation wrappers were recreated
in this isolated worktree, preserving core.hooksPath and both tracked hooks;
the successful commit ran the original staged-file, Prettier, ESLint and trailer
chain. No HUSKY/hook/task-guard bypass, rebase, amend, force push or reset occurred.

## Adjacent checkpoint correction: closed notification contract

Further actual caller/contract reading found that
`packages/contracts/src/phase1-p5-s3-multi-taxi.ts::ConsumerNotificationOutboxRecord.eventType`
admits only assignment/disclosure/ETA/arrival/receipt/cancellation events. The
new `payment_recovery_required` event in a985 was unsupported and outside this
task's shared-contract authority. It is removed from the production SQL; the
original V0115 `recovery_notice_requested_at` field remains an atomic, once-only
request record with authoritative owner/order on the same ledger. Manual
recovery/status/attempt behavior remains, and no delivery success is claimed.

Exact Supervisor coordination boundary: adding a typed payment recovery notice
to `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`, the real notification
event mapper/transport under `apps/api/src/modules/multi-taxi/`, and its formal
recipient/channel/delivery tests requires scope reconciliation with the owning
notification tasks. Those paths are not in this Payment dispatch. Do not relabel
a payment notice as receipt_ready or edit that foreign contract without the
Supervisor grant. Approved real capture-policy binding is still separately
missing. Neither gap waives either original acceptance key.

| Finding                                             | Real old source → repair                                                                                                                                                                           | Repro command / exit / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Limits                                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a985 emits an unsupported shared notification event | immutable `a985f951359bbabf908ec323a9036924f7ba6737` real `PaymentChargeRepository` calls the shared outbox INSERT; repaired real repository retains ledger request and emits no unsupported event | Source extracted with git show, only imports relocated, no active reset. `PAX_PAYMENT_CHARGE_REPOSITORY_SOURCE="$PWD/.local/pax-payment-core-20261009/charge-repository-a985.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/charge-workflow.test.ts -t 'keeps recovery notice requests'`: **1 executed FAIL / 29 filter SKIP**, exit 1, `charge-notice-old-a985.log` → same probe current source **1 executed PASS / 29 filter SKIP**, exit 0, `charge-notice-fixed.log` | Narrow filter skips are not full regression. Both probes call the real repository/service/policy and synthetic PSP/SQL replies; no missing-package or 0-test reproduction, no claimed PG/delivery acceptance |

The earlier 508-test and hosted a985 results remain evidence for their actual
version; the contract repair receives a new full affected regression and new
ordinary published SHA/CI before the final progress report. No acceptance or
candidate is inferred from either version's scoped passes.

After the contract repair, the same full affected command completed/read:
**21 files / 509 PASS / 0 SKIP**, exit 0,
`charge-notice-affected-regression.log`. Root/API typecheck both passed, exit 0
(`charge-notice-root-typecheck.log`, `charge-notice-api-typecheck.log`), and scoped
Payment ESLint passed, exit 0 (`charge-notice-lint.log`). The unchanged API
Billing/Facebook caller suite's 16 PASS remains applicable; no caller source or
fixture changed in this notice-only correction. The current final source identity
will bind these checks, scope/role audit and hosted results in the referenced
publication evidence and machine-truth progress.

## 2026-10-11 continuation: platform full refund checkpoint

Adjacent source baseline remains `4230964c7c0e64d5b5cf43a12fb3a4f598084f6e`,
ordinary published draft PR #2555, not a locked candidate. This unit implements
the previously absent platform refund path required by common A8 and the
canonical SD API table: `POST /api/passenger-app/platform/rides/:id/refund`.
It calls the production controller/service/session and original provider port.
The route and direct service require platform_admin, platform realm, a null
tenant, an actor ID and billing:write. Guest/partner or missing passenger ledger
cannot enter this core.

The minimal API accepts only a reason and refunds the full durable captured
amount in TWD. `RefundPassengerRideCommand.amount` is optional but has no
canonical unit or partial-refund state rule. Explicit amount/partial requests
are refused rather than assigning units or calling a partial refund refunded.
Supervisor must reconcile that exact contract boundary before partial support;
full refund is implemented, partial refund is not claimed. No financial refund
retry policy was supplied: definitive failure remains captured and terminal for
this refund operation; unknown/pending/malformed/thrown results resume by reading
the original refund key only. No automatic or second-money retry is invented.

`PaymentRefundRepository` reuses PaymentChargeRepository's original order
advisory lock (`pax:capture:<order>`), account-first transactions, sanitized DB
failures and session eviction. It commits `pax:refund:<order>`, original actor,
reason and a refund UUID before PSP I/O. Only completed provider acknowledgement
with a validated reference atomically changes both charge and Billing authority
to refunded; original capture reference/amount/attempt counters remain intact.
Removed card tokens/deleted accounts do not prevent reading or refunding a
previous capture, and no token decryption is needed. Late response UUIDs and
foreign/orphan journal claims refuse. Refund metadata is added only to the
allocated, unmerged V0115 charge table; no new migration number/table is invented.

| Finding / acceptance                      | Source and SQL audit                                                                                                                                                                                                                                                              | Executed evidence                                                                                                                                                                                                                                                                                    | Remaining limit                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Previously absent Ops refund              | PaymentRefundController/Service/Session; PassengerAppModule appended registration; exact auth route appended                                                                                                                                                                      | `pnpm exec vitest run tests/unit/pax-payment-core-20261009/refund-workflow.test.ts`: **49 PASS / 0 SKIP**, exit 0, `.local/pax-payment-core-20261009/refund-unit-fixed.log`                                                                                                                          | New functionality absent from baseline; no fabricated old dynamic failure. Actual HTTP/PG/provider acceptance not run.                                                     |
| Full-refund durability and refusal matrix | Real repository beginRefund/finishRefund with mock SQL replies and fake PSP                                                                                                                                                                                                       | Same 49 tests execute pre-PSP commit, duplicate, lost PSP acknowledgement, lost pre/final COMMIT acknowledgement, unknown/pending/malformed/failed outcomes, forbidden realms/scopes/actor/tenant, foreign journal, missing/drifted payment, changed reason, late UUID and zero-row final writes     | SQL/PSP are external boundaries, not a PG engine/rollback/concurrency simulation. Lost-COMMIT fixtures represent committed response loss; no rollback correctness claimed. |
| SQL columns and constraints               | V0115 c.refund_idempotency_key FK/unique, refund_reason varchar(500), refund_actor_id text, refund_status unknown/completed/failed, refund_operation_id UUID and existing provider_refund_ref; V0056/V0060/V0084 billing status/ref/amount/attempts; idempotency operation=refund | Every inserted/selected/updated column read against the formal migrations and allocation primary_tables; Billing amount/reference compared and capture attempts untouched                                                                                                                            | Independent reviewer must repeat audit; hosted formal schema PG behavior unverified. V0115 requires fresh schema, not applied-schema patching.                             |
| Dependency/tooling failures retained      | Dispatch restored worktree dependency links into canonical root; absent Nest packages prevented compilation                                                                                                                                                                       | Initial API tsc **exit 2**, `refund-initial-api-typecheck.log`. Removed only worktree node_modules symlinks, preserved targets; `pnpm install --offline --frozen-lockfile` **exit 0**, `refund-dependency-install.log`; contracts/auth builds exit 0; API tsc **exit 0**, `refund-api-typecheck.log` | Tooling setup is not product proof. No lockfile/source/config changes or runtime started.                                                                                  |
| Test import repair                        | Root package does not declare reflect-metadata; Nest's real decorators already load it                                                                                                                                                                                            | Initial refund suite **0 executed / suite FAIL**, exit 1, `refund-unit-initial.log`; removed direct undeclared root import, final **49 PASS**, exit 0                                                                                                                                                | Initial suite/import failure is not a behavioral reproduction.                                                                                                             |
| `pax-payment_bind_charge_and_states`      | Full refund added; previous bind/capture/Booking fixes retained                                                                                                                                                                                                                   | **Not recorded**                                                                                                                                                                                                                                                                                     | Full affected regression, same-source CI, independent review, protected merge, hosted HTTP/PG and policy binding still required.                                           |
| `pax-payment_security_and_recovery`       | Original encryption/fake/unpaid/claim/notice request boundaries preserved                                                                                                                                                                                                         | **Not recorded**                                                                                                                                                                                                                                                                                     | Approved actual capture policy, typed notice recipient/transport scope and actual delivery remain pending; full financial fault matrix not yet complete.                   |

Evidence cwd is the dispatched isolated worktree; Node 22.23.2, pnpm 10.33.0,
Vitest 4.1.4. This is a recoverable source checkpoint, not handoff/done; final
source identity, full regression and hosted checks are recorded after publication.
