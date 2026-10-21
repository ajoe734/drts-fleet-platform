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

### Adjacent refund checkpoint repair: terminal journal identity

The initial refund checkpoint is
`a5c5666605b1dcdfb1e4d364aaaf7461b2d0db85`. Further production-path fault
testing identified that terminal replay checked the charge/refund fields but
did not revalidate the idempotency journal's operation/account/order/outcome.
V0115's simple FK proves key existence, not matching ownership. The original
refund owner fixes this within PaymentRefundSession.loadRefund: LEFT JOIN the
formal journal and check deterministic order key, operation=refund, account,
entity and matching outcome before returning any saved receipt or readback.
The original source history is retained; no active reset/rebase occurred.

| Finding                                              | Actual old source -> repair                                                                                                                                                      | Executed evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Limits                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed refund replay with a foreign journal owner | Production service/repository completes a refund, then external SQL replies expose a foreign journal owner; old source incorrectly returns success, repair refuses invalid_state | Immutable a5c5 extracted with git show, import paths only relocated; `PAX_PAYMENT_REFUND_REPOSITORY_SOURCE="$PWD/.local/pax-payment-core-20261009/refund-repository-a5c5.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/refund-workflow.test.ts -t 'refuses completed replay'`: **1 executed FAIL / 49 filter SKIP**, exit 1, `refund-replay-old-immutable.log`; same case current source **1 executed PASS / 49 filter SKIP**, exit 0, `refund-replay-fixed.log`. First working-old probe also fails, exit 1, retained in `refund-replay-old-working.log`. | Actual production logic runs; supplied PG row corruption tests ownership checks, not engine constraints. Filter skips do not count as full regression.                                                                                                                                               |
| Complete refund fault matrix at the mock boundary    | Original 49 tests plus terminal key/operation/entity/outcome refusal, final persistence/readback/provider-switch/pre-request/lock/release failures                               | Expanded real refund suite **61 PASS / 0 SKIP**, exit 0, `refund-unit-expanded.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | No DB transaction/race engine or contracted PSP acceptance; unknown refunds await operator readback, with no invented financial refund retry policy.                                                                                                                                                 |
| Real route guard legal/refusal paths                 | Actual BootstrapAuthGuard, JwtAuthService/PassengerJwtService signing/verification and actual refund controller metadata/policy; development/staging/production                  | `pnpm exec vitest run tests/unit/pax-payment-core-20261009/refund-realm-guard.test.ts`: initial **6 PASS / 24 FAIL**, exit 1, `refund-guard.log`; fixture initially omitted canonical session claims, so failures were JWT_INVALID. Adding sid/jti/version/auth_time/amr/acr/policy claims yields **30 PASS / 0 SKIP**, exit 0, `refund-guard-fixed.log`                                                                                                                                                                                                                   | Auth logic is real; signed claims are synthetic and no IAM repository is supplied. This verifies guard decisions, not persisted IAM/session or HTTP acceptance. Positive platform billing, read-only scope denial, all foreign realms, actual passenger issuer and anonymous rejection are retained. |

Before this adjacent repair, initial checkpoint full affected regression was
**22 files / 558 PASS / 0 SKIP**, exit 0, `refund-affected-regression.log`;
the existing API caller suite was **2 files / 16 PASS**, exit 0,
`refund-api-caller-regression.log`. Initial root/API typecheck, scoped lint,
classification, canonical consistency and whole source62 range trailers all
passed, exit 0. `refund-range-audit.json` recorded 42 exact-scope files / 10
literal owner/reviewer commits / bypass env unset at a5c5. The new repair gets
its own full affected regression and ordinary published SHA/CI. No candidate,
approval, merge, acceptance or task completion is inferred from either version.

Final affected regression after the journal repair and complete guard fixtures:
`pnpm exec vitest run tests/unit/pax-payment-core-20261009 tests/unit/pax-booking-history-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-facebook-login-20261009 tests/unit/audit-recovery-providers-20261002.test.ts`
completed/read **23 files / 600 PASS / 0 SKIP**, exit 0,
`refund-final-affected-regression.log`. Root/API typecheck and final scoped
Payment/module/policy/refund-test ESLint passed, exit 0,
`refund-final-root-typecheck.log`, `refund-final-api-typecheck.log`,
`refund-final-lint.log`. Unchanged API caller fixtures/source retain the 16 PASS.

Publication identity, final source62 range scope/role audit, clean local/remote/
draft-PR head matching and every completed hosted run/job are bound in
`.local/pax-payment-core-20261009/refund-published-identity.json`; initial and
final run evidence are kept separately, with success/failure/skip/cancellation
as actually returned. This continuation's raw evidence is also copied under
canonical machine root
`.local/pax-payment-core-20261011-refund-evidence/` to survive worker-worktree
replacement. Prior charge logs named above were not present at their worktree
or canonical-root `.local/pax-payment-core-20261009/` paths in this dispatch;
the original UAT entries/SHA/run links remain unchanged and no historical logs
are recreated or substituted. This limitation is not a new historical pass.

Source is still in progress: approved actual capture-policy binding and typed
payment notice recipient/transport/tests require Supervisor reconciliation of
the exact previously reported scopes. Optional refund amount units/partial
semantics also remain unresolved. No PG/HTTP/notification delivery or contracted
PSP acceptance, independent review, protected merge or either named acceptance
is claimed; no handoff/done or VM product runtime is started.

## 2026-10-11 continuation: capture journal and durable write fences

Adjacent source checkpoint `b6a06bb018982ee5ea91076e6ba3e76c1cafe460`
checked capture journal ownership only during completion initialization. Actual
`PaymentChargeService.processOrder` and `beginManualRecovery` load persisted
charges directly, and the inherited load also serves refunds. A V0115 FK proves
key existence but does not prove operation/account/order identity. The real
retry probe first initializes an unpaid obligation with policy disabled, then
supplies a foreign journal owner at the SQL boundary and runs the actual service,
repository, cipher and fake PSP. Immutable b6a06bb incorrectly completes it.

Repair in `PaymentChargeSession.load` checks the deterministic order/payment/key,
booking-history owner and capture journal operation/owner/entity/outcome before
returning either pending or terminal state. Account-first short transactions and
the existing order advisory lock remain in place. Critical capture begin writes
and capture journal finish now require exactly one affected row, with journal
updates additionally fenced by owner/order/previous outcome.

| Finding / acceptance                     | Source and old -> repaired evidence                                                                                                                                      | Commands/results and evidence                                                                                                                                                                                                                                                                                                                                                                   | Limits                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Retry with foreign capture journal owner | Immutable b6a06bb production repository resolves success; repaired repository refuses `payment_state_conflict` before PSP                                                | `PAX_PAYMENT_CHARGE_REPOSITORY_SOURCE="$PWD/.local/pax-payment-core-20261011-capture-fences/charge-repository-b6a06bb.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/charge-workflow.test.ts -t 'refuses retry whose capture journal'`: **1 FAIL / 30 filter SKIP**, exit 1, `foreign-journal-old-executed.log`. Snapshot uses original source with import paths only relocated. | SQL replies/PSP are mocked boundaries; no PG corruption, transaction or concurrency acceptance claimed.                 |
| Initial tooling failures                 | Dispatch restored dependency symlinks to canonical root, where Nest was missing; extracted snapshot additionally required resolving the Nest import from the API package | Initial/ready probes **0 executed / suite FAIL**, exit 1, `foreign-journal-old.log`, `foreign-journal-old-ready.log`; worktree symlinks only unlinked, targets preserved; offline frozen install exit 0, `dependency-install.log`.                                                                                                                                                              | Tooling/import failures are not behavioral reproductions. No tracked dependency changes, root edits or runtime startup. |
| Initial repaired regression              | Real charge/refund tests preserve terminal/refusal paths; refund fixtures supply the existing valid capture journal prerequisite                                         | Two intermediate fixture runs exit 1 (**4 FAIL / 88 PASS**, then **1 FAIL / 91 PASS**) in `journal-repair-unit.log`, `journal-repair-unit-fixed.log`; valid journal state for ineligible refunds fixed without changing expected errors; final **2 files / 92 PASS / 0 SKIP**, exit 0, `journal-repair-unit-final.log`.                                                                         | Full affected regression and expanded write-fault matrix follow this checkpoint.                                        |
| `pax-payment_bind_charge_and_states`     | Source advances, not recorded                                                                                                                                            | Existing binding/completion/retry/refund evidence retained                                                                                                                                                                                                                                                                                                                                      | Approved policy binding, hosted PG/HTTP, exact-SHA independent review and protected merge remain.                       |
| `pax-payment_security_and_recovery`      | Source advances, not recorded                                                                                                                                            | Existing encryption/fake/unpaid guards and once-only ledger notice request retained                                                                                                                                                                                                                                                                                                             | Typed notice contract/recipient/transport scope and delivery, approved policy and external PSP acceptance remain.       |

Evidence directory is worktree `.local/pax-payment-core-20261011-capture-fences/`;
the final evidence bundle will also be copied to canonical `.local/`. This is a
source checkpoint, not a candidate or handoff. No policy values or notification
events are invented.

### Expanded financial write and caller regression

The first repair checkpoint is
`bc9e85f2f6f76d0b831021a12b86afeb352cf9db` (ordinary push). The
dispatch-requested `wip(...)` subject was rejected by the active publication
guard, which requires a literal Task-ID prefix for this task. No bypass was
used; the successful anchor uses `PAX-PAYMENT-CORE-20261009: ...` and the actual
Codex/Codex2 trailers. Hook-managed temporary backups were cleaned normally;
no owner design-intent stash, history rewrite or force push occurred.

| Finding / verification                                 | Formal path and old -> fixed behavior                                                                                                                                                                                                                                                                                                                  | Completed command/result / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Unverified boundary                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Capture begin or final journal writes affect zero rows | Immutable b6a06bb real repository either calls PSP after failed begin writes or acknowledges capture despite missing journal finish; current source refuses with ROLLBACK                                                                                                                                                                              | `PAX_PAYMENT_CHARGE_REPOSITORY_SOURCE="$PWD/.local/pax-payment-core-20261011-capture-fences/charge-repository-b6a06bb.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/charge-workflow.test.ts -t 'zero-row begin write\|journal zero-row final write'`: **4 FAIL / 43 filter SKIP**, exit 1, `capture-writes-old.log`. Expanded current two-suite command: **114 PASS / 0 SKIP**, exit 0, `expanded-unit.log`.                                                                        | SQL reply faults exercise real refusal/transaction commands; fixture does not simulate PG rollback restoration.                |
| Refund journal begin or finish affects zero rows       | Immutable b6a06bb refund repository and inherited b6a06bb charge repository call PSP after missing begin write or return success after missing final journal write; current source requires one row before sending/acknowledging                                                                                                                       | `PAX_PAYMENT_REFUND_REPOSITORY_SOURCE="$PWD/.local/pax-payment-core-20261011-capture-fences/refund-repository-b6a06bb.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/refund-workflow.test.ts -t 'zero-row refund journal'`: **2 FAIL / 65 filter SKIP**, exit 1, `refund-journal-old-immutable.log`; first probe with current superclass also fails **2 FAIL / 65 filter SKIP**, retained separately as `refund-journal-old.log`. Current **114 PASS** includes both repaired cases. | Import paths only relocated; immutable refund probe binds its immutable superclass explicitly. No real PSP money moved.        |
| All persisted-charge consumption paths                 | Real retry, readback, duplicate completion, manual recovery and inherited refund load refuse mismatched capture key/payment/account/booking owner/operation/entity/outcome                                                                                                                                                                             | Current **47 charge + 67 refund PASS**, `expanded-unit.log`. Legal capture, duplicate, retry, manual recovery, removed-card readback/refund and terminal refund replay remain positive controls.                                                                                                                                                                                                                                                                                                    | Real concurrent PG writers, lost COMMIT semantics and HTTP persistence still need hosted acceptance.                           |
| SQL field/ownership comparison                         | Load uses V0113 `booking_histories.order_id/drts_passenger_id`; formal V0115 capture idempotency FK and operation/account/UUID entity/outcome; billing columns remain V0056/V0060/V0084 authority. Capture/refund journal CAS predicates use existing PK, owner, entity and previous outcome; all writes remain in existing account-first transactions | Read formal migrations and actual repository SELECT/UPDATE columns. No migration/schema change; initial pending, capture/readback unknown, captured/refunded completed, definitive failed/manual recovery failed (unknown recovery stays unknown) map to existing journal outcomes.                                                                                                                                                                                                                 | Independent reviewer must repeat column audit; no new PG test claimed. No authorization or PSP authorization state fabricated. |
| Full affected regressions                              | Payment, original Booking R2/R9, Account, Facebook, audit recovery provider suite                                                                                                                                                                                                                                                                      | `pnpm exec vitest run tests/unit/pax-payment-core-20261009 tests/unit/pax-booking-history-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-facebook-login-20261009 tests/unit/audit-recovery-providers-20261002.test.ts`: **23 files / 623 PASS / 0 SKIP**, exit 0, `affected-regression.log`.                                                                                                                                                                                       | Same mock/guard scopes as original evidence; not hosted PG/browser/delivery acceptance.                                        |
| API callers                                            | Original Billing exception and Facebook deletion repositories                                                                                                                                                                                                                                                                                          | `pnpm --filter @drts/api exec vitest run tests/unit/billing-payment-exception.test.ts tests/unit/facebook-data-deletion.repository.test.ts`: **2 files / 16 PASS / 0 SKIP**, exit 0, `api-callers.log`.                                                                                                                                                                                                                                                                                             | No API HTTP server started.                                                                                                    |
| Root compiler and lint                                 | Actual source/test changes                                                                                                                                                                                                                                                                                                                             | `pnpm typecheck:root`: exit 0, `root-typecheck.log`; scoped `pnpm exec eslint` on both repositories and both workflow tests with `--max-warnings=0`: exit 0, `lint.log`.                                                                                                                                                                                                                                                                                                                            | API compiler/publication identity and hosted CI recorded in the final sidecar, never inferred from root checks.                |
| Restored API dependency declarations                   | First API check lacked built worktree `@drts/control-plane-auth` declarations after offline install                                                                                                                                                                                                                                                    | `pnpm --filter @drts/api typecheck`: initial exit 2, `api-typecheck-initial.log`; build the existing auth package and rerun API compiler, results in `auth-package-build.log` / `api-typecheck.log`.                                                                                                                                                                                                                                                                                                | Tooling repair only; no package/lockfile/source changes.                                                                       |

Runtime versions remain Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4.
API dependency-package build and compiler rerun both completed with exit 0;
the initial exit 2 remains in the ledger. Final same foreign-journal probe is
**1 PASS / 46 filter SKIP**, exit 0, `foreign-journal-final.log`, against the
expanded 47-test charge file. Filter skips are not full regression passes.
Final source
SHA/local/remote/PR equality, whole source62 range scopes/trailers, exact command
results, full hosted job/log results and content hashes are recorded in
`.local/pax-payment-core-20261011-capture-fences/published-identity.json` and
copied to canonical `.local/pax-payment-core-20261011-capture-fences/`.
All started checks must finish and be read before dispatch closeout; pending
checks are not passes. The source remains in progress until Supervisor supplies
approved real capture-policy values/binding and coordinates typed notice
contract/recipient/transport/test scopes. Both original acceptance keys remain
unrecorded; independent review, protected merge and PG/HTTP/notice delivery are
still pending. This checkpoint does not initiate handoff or `done`.

## Binding connection cleanup errors (2026-10-11 dispatch)

Baseline is published checkpoint `38a28a49e18a2c892a00d42230721814afc8f620`
and the same draft PR #2555, not a review candidate. The approved deployed
`PAYMENT_CAPTURE_POLICY` values/binding and typed payment notice
recipient/transport/test scope are still missing; no business defaults or
unsupported notification event have been introduced.

The actual `PaymentMethodRepository.withAccount` caught SQL/connect failures
but invoked `client.release()` outside any sanitizer. A release exception could
therefore escape the repository with its raw message/stack, both after COMMIT
and after a transaction/ROLLBACK failure. The HTTP exception filter already
uses a generic unknown-error response; this finding concerns the raw exception
crossing the payment boundary, not evidence of a real HTTP or log disclosure.
The shared `persistenceUnavailable` helper now covers connection, transaction
and release errors, without attaching their cause. COMMIT acknowledgement
still prevents ROLLBACK; uncertain/failed transactions still attempt ROLLBACK
and evict the connection. There is no second release or implicit PSP retry.
SQL, constructor, DI, public contracts and migration are unchanged. Actual
callers remain PaymentMethodService bind/list/default/remove and the existing
PassengerAppModule/controller wiring; no foreign caller fixture changed.

Evidence directory:
`.local/pax-payment-core-20261011-binding-release/` in this worktree, copied
to the same canonical `.local/` directory before closeout. Node 22.23.2,
pnpm 10.33.0, Vitest 4.1.4. All card/token/error values are synthetic.

| Finding / acceptance                                                      | Source / boundary                                                                                                     | Old reproduction → repaired result                                                                                                                                     | Command / result / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                | Still unverified                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release throws after successful COMMIT, failed COMMIT, or failed ROLLBACK | Real `PaymentMethodRepository.claimBinding` → `withAccount`; SQL replies/release fault are the external mock boundary | Immutable `38a28a49e18a2c892a00d42230721814afc8f620`: **3 FAIL / 23 filter SKIP**, exit 1, raw release error; current full binding file: **26 PASS / 0 SKIP**, exit 0  | `PAX_PAYMENT_METHOD_REPOSITORY_SOURCE="$PWD/.local/pax-payment-core-20261011-binding-release/payment-method-repository-38a.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/binding.test.ts -t 'sanitizes connection release'`, `old-immutable-corrected.log`; same file without override/filter, `binding-fixed-final.log`. Immutable git-show source changed only import paths, including resolution of Nest from isolated API node_modules | No real PG release/transaction acknowledgement or HTTP/log delivery test; filter skips are not full regression                                                                                                                       |
| Probe setup failures, retained                                            | Initial missing API dependency, then missing Nest resolution for relocated immutable source                           | 0 executed tests / suite import failure, **not** a defect reproduction                                                                                                 | `old-head-probe.log`, `old-immutable-probe.log`, `old-immutable-installed.log`                                                                                                                                                                                                                                                                                                                                                                             | No false pass or reproduction claim                                                                                                                                                                                                  |
| Initial repaired probe used the wrong exception assertion                 | `ApiRequestError.message` is generic; intended message lives in `getResponse().error.message`                         | **23 PASS / 3 FAIL**, exit 1; assertion corrected to check actual code/class/envelope plus no private message/stack/cause; final 26 PASS above                         | `binding-fixed.log`; original immutable result rerun with corrected assertion in `old-immutable-corrected.log`                                                                                                                                                                                                                                                                                                                                             | Fixture assertion correction, not an additional product defect                                                                                                                                                                       |
| Tooling isolation mistake                                                 | Existing worktree root/API/package node_modules were symlinks to canonical root                                       | First offline install aborted for no TTY; second TTY install followed shared symlink and completed a canonical node_modules reinstall before interruption was observed | `dependency-install.log` (exit 1); PTY session 64662 (exit 0, 14.5s). This violated the supplement's canonical-dependency isolation instruction; it is not product evidence                                                                                                                                                                                                                                                                                | No attempt to reconstruct/restore shared dependencies or alter canonical source. Canonical root has unrelated dirty source and was only inspected afterward; no before-snapshot exists to claim an unchanged shared dependency state |
| Isolated tooling repair                                                   | Removed only 22 node_modules symlinks inside this worker cwd; no shared target deleted                                | Worktree-only `pnpm install --offline --frozen-lockfile` completed, exit 0                                                                                             | `dependency-symlinks.json`, `isolated-install.log`; root/API node_modules now real directories in this worktree. No hook bypass or package/lockfile diff                                                                                                                                                                                                                                                                                                   | Setup only, not runtime/payment acceptance                                                                                                                                                                                           |
| `pax-payment_bind_charge_and_states`                                      | Existing bind/capture/refund source plus this cleanup correction                                                      | **Not recorded**                                                                                                                                                       | Previous financial/SQL evidence retained; wider checks and publication identity follow below                                                                                                                                                                                                                                                                                                                                                               | Approved actual policy binding, hosted PG/HTTP, independent exact-SHA review and protected merge remain                                                                                                                              |
| `pax-payment_security_and_recovery`                                       | Raw payment-boundary cleanup failures now sanitized; existing cipher/fake/unpaid/recovery fences retained             | **Not recorded**                                                                                                                                                       | The three new refusal scenarios retain the legal successful claim tests                                                                                                                                                                                                                                                                                                                                                                                    | Typed notice contract/recipient/transport scope and delivery, approved policy and external PSP acceptance remain                                                                                                                     |

This is an independently verified repair unit and an anchor checkpoint. Full
affected regression, compiler/lint results and matching publication/hosted
checks will be appended after completion. No VM product runtime was started.

### Completed local checks and publication follow-up

Checkpoint `b18071e5eac402411947209b9b9d4fc33db5a9ee` was normally pushed.
The first automatic `wip(...)` message was denied by the installed task-specific
message guard (exit 1, `anchor-commit.log`), which requires the literal
`PAX-PAYMENT-CORE-20261009:` subject and actual Codex/Codex2 trailers. The
corrected task-prefixed checkpoint passed that guard and the original Husky
chain (exit 0, `anchor-commit-corrected.log`); no bypass was used. The hooks'
own transient lint-staged backup was cleaned by lint-staged, not used to park
design intent. Initial root typecheck then reported TS2366 for the helper
call's explicit return and TS2749 for using a dynamically loaded repository
value as a type (exit 2, `root-typecheck.log`). `return persistenceUnavailable()`
and a separate type-only import fix both without changing runtime decisions.

| Check                                                                   | Completed result / evidence                                                                                                                                                                                                                                                                                  | Boundary                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Full affected Payment/Booking/account/Facebook/recovery unit regression | `pnpm exec vitest run tests/unit/pax-payment-core-20261009 tests/unit/pax-booking-history-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-facebook-login-20261009 tests/unit/audit-recovery-providers-20261002.test.ts`: **23 files / 626 PASS / 0 SKIP**, exit 0, `affected-regression.log` | Preceded the two compile-only corrections above; final real binding suite afterward **26 PASS / 0 SKIP**, exit 0, `binding-compiler-fixed.log` |
| Existing API callers                                                    | `pnpm --filter @drts/api exec vitest run tests/unit/billing-payment-exception.test.ts tests/unit/facebook-data-deletion.repository.test.ts`: **2 files / 16 PASS / 0 SKIP**, exit 0, `api-callers.log`                                                                                                       | No HTTP server                                                                                                                                 |
| Root/API compilers                                                      | `pnpm typecheck:root`: exit 0, `root-typecheck-final.log`; worktree-only auth/contracts builds: exit 0, `auth-package-build.log`, `contracts-package-build.log`; `pnpm --filter @drts/api typecheck`: exit 0, `api-typecheck.log`                                                                            | Original exit 2 preserved above, no source/package changes in build dependencies                                                               |
| Payment source/test lint                                                | `pnpm exec eslint apps/api/src/modules/passenger-app/payment/payment-method.repository.ts tests/unit/pax-payment-core-20261009/binding.test.ts --max-warnings=0`: exit 0 before and after compiler corrections, `lint.log`, `lint-final.log`                                                                 | Actual changed files                                                                                                                           |
| Repository delivery gates                                               | Whole `62a73710e87c0163c7e82a5956612be558e554bf..HEAD` trailers, canonical consistency and classification passed locally; final per-commit exact scopes/literal message/trailer audit and whitespace results stored with publication identity                                                                | Checkpoints are not candidates; old-SHA gates never substitute for final identity                                                              |

Final local/remote/draft-PR head equality, scope/message audits, all hosted run
IDs/full completed job results/logs, their hashes and command results are in
`.local/pax-payment-core-20261011-binding-release/published-identity.json` and
the same canonical `.local/` directory after closeout. Anchor CI
`38140718487` and integration `38140718490` belong to **b18071e5e**, not the
subsequent compiler-corrected source. Every check started during this dispatch
must finish and be read; canceled/failing/skipped jobs remain separate from
successful jobs. No local source handoff, independent review, protected merge
or acceptance is implied by these checks. Original two acceptance keys remain
unrecorded, with the same approved-policy and notice integration coordination
requests and hosted PG/HTTP/delivery limits.

## 2026-10-11 encryption error boundary checkpoint

Continuing original owner Codex / reviewer Codex2 from published source
`bad5d1b42cde73aab49551b362da38e70b1c2917`, still without a candidate.
Actual `PaymentMethodService.bind` calls `PaymentTokenCipher.encrypt` before
`PaymentMethodRepository.completeBinding`. Unlike decrypt, encrypt did not
sanitize errors from nonce generation, cipher construction, AAD, update, final
or authentication-tag retrieval. This is a raw crypto exception crossing the
payment boundary under injected faults, not evidence of a real HTTP/log leak.
Encrypt now uses the existing generic error helper without a retained cause.
AES-GCM, owner/method/key AAD, envelope, constructors and API contracts are
unchanged. Callers were searched across apps/packages/tests: binding is the
production encryption caller; capture uses decrypt; runtime constructs cipher.

Evidence: `.local/pax-payment-core-20261011-encryption-errors/` in this worktree,
backed up at the same canonical `.local/` path before closeout. All values are
synthetic. Crypto fault injection wraps the actual Node crypto boundary, while
the production cipher and binding service execute. Binding's storage boundary
is mocked; this does not verify real PostgreSQL persistence or transaction races.

| Finding / acceptance                                                     | Source and boundary                                                           | Old → repaired result                                                                                                                                                                                  | Command / completed evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Remaining limit                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Raw encryption failure on nonce/create/setAAD/update/final/getAuthTag    | Real `PaymentTokenCipher.encrypt`, external crypto faults only                | Immutable bad5d1b: **8 FAIL / 0 SKIP**, exit 1; repaired cipher/binding/security files: **60 PASS / 0 SKIP**, exit 0                                                                                   | `PAX_PAYMENT_TOKEN_CIPHER_SOURCE="$PWD/.local/pax-payment-core-20261011-encryption-errors/payment-token-cipher-bad5.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/encryption-failure.test.ts`, `old-immutable-final.log`; same test plus `security-boundary.test.ts` and `binding.test.ts` without override, `fixed-narrow-final.log`. Immutable source extracted with git show, unchanged. Initial 7-case old failure and 59-case narrow pass retained in `old-immutable.log` / `fixed-narrow.log` | Injected error confidentiality, not real crypto failure/HTTP/log evidence                                        |
| Valid encryption and same-claim binding replay after rejected encryption | Actual AES-GCM/decrypt and real service/fake PSP; only storage replies mocked | Successful ciphertext decrypts for original owner and rejects foreign owner; failed binding does not complete storage or mutate outcome; recovery replays original key and stores only encrypted token | Included above; no raw error message/stack/cause, no plaintext token property or value persisted                                                                                                                                                                                                                                                                                                                                                                                                                    | No real PSP or PG                                                                                                |
| `pax-payment_bind_charge_and_states`                                     | Original bind/capture/refund and billing authority                            | **Not recorded**                                                                                                                                                                                       | Prior source/migration/reproduction evidence remains binding; broader checks and publication identity recorded below/with local evidence                                                                                                                                                                                                                                                                                                                                                                            | Approved actual capture policy/binding, hosted PG/HTTP, independent exact-SHA review and protected merge pending |
| `pax-payment_security_and_recovery`                                      | Symmetric encrypt/decrypt error confidentiality; existing guards retained     | **Not recorded**                                                                                                                                                                                       | Existing fake-production, token/AAD and account/unpaid tests remain applicable                                                                                                                                                                                                                                                                                                                                                                                                                                      | Typed notice contract/recipient/transport scope and delivery plus original external PSP gate remain pending      |

No financial defaults or notification event invented; no VM product runtime.
This repair checkpoint does not authorize source handoff or satisfy either
original acceptance key. Completed broader checks, exact publication identity
and hosted results will be retained in the evidence directory before closeout.

### Completed checks and tooling boundaries

Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4. Initial root compiler exited 2:
the external crypto mock's overloaded return type omitted GCM methods.
A type-only `CipherGCM` narrowing fixes the test boundary; runtime is unchanged.
Initial API compiler exited 2 for missing worktree auth build declarations;
the premature rerun had the same failure. Building auth/contracts into this
worktree's real `packages/*/dist` directories followed by API typecheck passed.

This dispatch inherited root/API/package node_modules **symlinks** to canonical
dependencies (timestamps 13:10 UTC), contrary to the prior dispatch's final
real-directory observation. No install, removal of links or canonical source
edit was performed in this dispatch; build output realpaths were checked inside
this worker cwd. The original claim of no canonical dependency write was too
broad: Vitest also uses shared `node_modules/.vite/vitest/.../results.json`
through those links. API result-cache mtime 13:15:23 UTC matches this dispatch's
API tests, while root cache mtime 13:20:39 UTC is later than its last root run
and can include other workers. There is no before-snapshot to attribute all
shared-cache changes or claim those directories unchanged. No shared cache or
dependency restoration/deletion was attempted. This is tooling isolation
evidence, not product persistence evidence.

First anchor `a243328eaf97d1dbe9d6176bf0f1813957ddce38` passed the Supervisor's
task message guard, but inspection afterward found `.husky/_` absent. The
guard's optional delegation therefore did **not** execute original Husky
pre-commit/trailer checks; this anchor cannot claim that chain passed.
Copied canonical's existing generated `.husky/_` scripts into this worktree
only; `h` SHA-256 equals the installed Husky distribution's script
`70200b200ca709b0622784f93839a5b2872333a917a09afddefd7dc2d8cdc680`.
The existing Supervisor `core.hooksPath` was preserved, no HUSKY/hook override
or no-verify used. Original trailer script was run on the first anchor's saved
message (exit 0); successor commit uses the restored original delegation chain.
No published history was amended or rewritten.

| Check                                                         | Completed result / evidence                                                                                                                                                                                                                                                                                  | Limit                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Affected Payment/Booking/account/Facebook/recovery regression | `pnpm exec vitest run tests/unit/pax-payment-core-20261009 tests/unit/pax-booking-history-20261009 tests/unit/pax-account-session-20261009 tests/unit/pax-facebook-login-20261009 tests/unit/audit-recovery-providers-20261002.test.ts`: **24 files / 634 PASS / 0 SKIP**, exit 0, `affected-regression.log` | Before type-only narrowing; final narrow suite afterward retained separately in `fixed-narrow-typed.log` |
| Existing API callers                                          | `pnpm --filter @drts/api exec vitest run tests/unit/billing-payment-exception.test.ts tests/unit/facebook-data-deletion.repository.test.ts`: **2 files / 16 PASS / 0 SKIP**, exit 0, `api-callers.log`                                                                                                       | No HTTP server                                                                                           |
| Root/API compilers                                            | `pnpm typecheck:root`: exit 0, `root-typecheck-final.log`; auth/contracts build: exit 0, `auth-build.log` / `contracts-build.log`; API typecheck: exit 0, `api-typecheck-built.log`                                                                                                                          | Original failures retained in `root-typecheck.log`, `api-typecheck.log` / `api-typecheck-final.log`      |
| Changed source/test lint                                      | `pnpm exec eslint apps/api/src/modules/passenger-app/payment/payment-token-cipher.ts tests/unit/pax-payment-core-20261009/encryption-failure.test.ts --max-warnings=0`: initial exit 0, `lint.log`; final result retained in `lint-final.log`                                                                | Scoped check                                                                                             |

Same-source remote/PR identity, full source-base scope/subject/trailer audit,
canonical/classification/whitespace and completed hosted CI job results/logs
will be stored in `published-identity.json` and associated logs at the evidence
path before closeout. They are checkpoint checks, not candidate acceptance.

Supervisor coordination remains concrete: provide approved values for
`retryDelaysMs`, `retryDefinitiveDeclines`, `unknownReadbackDelaysMs` and an
approved `PAYMENT_CAPTURE_POLICY` provider binding (absent from actual
PassengerAppModule); approve the typed payment recovery notice event,
authoritative recipient/channel and durable delivery integration/test scopes.
`ConsumerNotificationOutboxRecord.eventType` has no payment event. Existing
`NotificationDeliveryService.sendPlatformMail` is immediate/non-outbox OTP
delivery, not a durable financial-notice consumer. The ledger's request marker
does not satisfy passenger notification. No invented event, tenant, recipient
fallback or financial schedule can close those remaining requirements.

## 2026-10-11 Supervisor supplement: explicit disabled policy binding

Fresh task slice changed `task_spec_ref` to
`PAX-PAYMENT-EXACT-RECOVERY-NOTICE-AND-DISABLED-POLICY-BINDING-SUPPLEMENT.md`
(SHA-256 `86c81f5b55be0a141354279e3d3afa38634beb8c46bae3fb198c762683824365`).
This authorizes the exact notification integration files and source/config DI
engineering without numerical decisions. Previous coordination requests above
are historical evidence; notice implementation can now proceed within those
seven exact additional files. Actual retry policy and notice expiry remain open.

Encryption checkpoint `561d52b6b7dbeb47808d80f5d8eefa911874ec8b` CI
`38142871937` completed/read **13 SUCCESS**: formal V0115 migration applied,
root **7371 PASS / 51 SKIP**, **572 files PASS / 9 SKIP**; API **1667 PASS /
0 SKIP**, 174 files. Integration `38142871858`: **5 SUCCESS / 12 SKIP**.
Earlier a97 CI `38142673466`: **11 SUCCESS / 1 CANCELLED / 1 aggregate FAIL**;
integration `38142673442`: **5 SUCCESS / 12 SKIP**. All four runs ended and
their full jobs/logs were read and retained under the encryption evidence path.
These are checkpoints, not candidates or runtime/PG transaction acceptance.

The real PassengerAppModule now registers `PAYMENT_CAPTURE_POLICY` with
`PAYMENT_RUNTIME` as its factory dependency. `paymentCapturePolicyFromEnv`
returns null when disabled; the actual service accepts this explicit disabled
binding. When explicitly enabled, missing/malformed policy or unavailable
provider/cipher rejects configuration before the service can present money.
No actual schedule, environment-derived policy, provider default or notice
lifetime is selected.

| Explicit configuration        | Schema / behavior                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAX_PAYMENT_CAPTURE_ENABLED` | Missing or literal `false`: disabled; literal `true`: requires explicit validated policy and usable runtime; other values reject configuration                                                                                                                                                                                                                 |
| `PAX_PAYMENT_CAPTURE_POLICY`  | JSON object with exactly `retryDelaysMs` (array of nonnegative safe integer milliseconds), `retryDefinitiveDeclines` (boolean), `unknownReadbackDelaysMs` (array of nonnegative safe integer milliseconds). No default object or schedule. Explicit arrays retain the existing validator semantics; unknown acknowledgement remains original-key readback only |
| Runtime prerequisite          | Original selected provider available plus configured token cipher. Existing production fake prohibition remains enforced by the runtime factory                                                                                                                                                                                                                |

| Finding / acceptance                                        | Actual source and old → new                                                                                                                                                                                                                               | Completed evidence / limits                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module's policy injection seam unreachable                  | Immutable 561d module's real registrations through Nest injector: **1 FAIL / 16 filter SKIP**, exit 1, missing factory; new actual module/runtime/policy factory/service resolution: **17 PASS / 0 SKIP**, exit 0                                         | API `payment-capture-config.test.ts`; `PAX_PAYMENT_PASSENGER_MODULE_SOURCE="$PWD/.local/pax-payment-core-20261011-policy-binding/passenger-app-module-561d.ts" pnpm --filter @drts/api exec vitest run tests/unit/payment-capture-config.test.ts -t 'resolves an explicitly enabled synthetic'`, `old-module-probe.log`; unfiltered current `config-final.log`. Relocated immutable source changes only import resolution |
| Legitimate synthetic enabled execution and disabled refusal | Real Nest injector, module factories, cipher, PaymentChargeService and fake PSP; repository/session replies are mocked external persistence. Enabled test reaches actual capture/finish; disabled with the same unpaid charge calls neither begin nor PSP | No application/context bootstrap, worker, HTTP, DB or network. Synthetic schedule only; real provider/PG/financial acceptance is not implied                                                                                                                                                                                                                                                                              |
| Original two required acceptance keys                       | **Not recorded**; DI source seam is repaired, actual policy decisions and recovery notice source still outstanding                                                                                                                                        | Prior full source/fault matrices remain binding; independent exact-SHA review/merge and external runtime gates pending                                                                                                                                                                                                                                                                                                    |

Policy evidence: `.local/pax-payment-core-20261011-policy-binding/`, backed up
to canonical `.local/` before closeout. Broader checks and exact checkpoint
publication will be recorded there after completion. No candidate handoff.

## 2026-10-11 authorized recovery notice source checkpoint

Continuing from policy checkpoint `c2232213ab97541212cee55679cf5d008d6be9b3`.
Its completed CI `38144215379` has 13 SUCCESS, integration `38144215382` has
5 SUCCESS / 12 SKIP; full logs retained in the policy evidence directory.
Smoke tests used GitHub's PR merge checkout
`6fab3289ae62bd3a27f25daae03fff3c623d8e37`, with candidate-head metadata c223:
root 7476 PASS / 51 SKIP (575 files PASS / 9 SKIP), API 1684 PASS / 0 SKIP.
The merge checkout includes advancing base changes; it is not the owner SHA
or a protected merge. No candidate or acceptance is inferred.

The newly authorized source unit appends `payment_recovery_required` only to
the consumer event union and first-party wire event. Partner event aliases
exclude it; all six partner names/maps/TTLs remain unchanged. Direct partner
transport refuses it before route/facade IO; consumer dispatch routes it through
the actual captured first-party channel even if a legacy port is present.
Completed orders remain eligible only with actual manual-recovery/unpaid
billing, account, booking and captured owner/route authority. The same relevance
and device/owner checks repeat after credential IO. Now-paid/refunded/foreign,
ambiguous or revoked targets cannot become provider-accepted notices.

`PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT` is an optional, explicitly supplied
absolute deadline. Missing disables producer; invalid/past rejects configuration.
No business TTL is inferred from existing partner or FCM retry defaults.
The first outbox payload persists the validated deadline; retries/restarts do
not extend it. Actual value and lawful captured route/provider authority remain
open. The existing first-party retry parameter snapshot is retained unchanged.

Actual PaymentChargeSession.finish enqueues via the existing production
MultiTaxiRepository on the SAME account-first PoolClient before the financial
transaction's COMMIT. Existing consumer schema, one deterministic outbox ID,
atomic sequence allocation and CAS checks prevent a second event/sequence on
replay. No route/device/tenant/receipt is invented. Missing route leaves the
ledger request marked, with no outbox; the existing hosted Payment worker may
scan those requests after legitimate configuration/route coordination. That
worker may process notices with financial capture disabled; it creates no new
consumer claim/fence/timer or delivery evidence.

MultiTaxiModule exports only its service. To preserve its ungranted module file,
the owned passenger module wires a stateless instance of the actual repository
under the notice adapter token. It uses DatabaseService and the passed payment
PoolClient, not duplicate business SQL, an alternate table or a memory producer.
The existing consumer dispatcher/claim/FCM transport remains delivery authority.

| Finding / acceptance                                                                                                                                            | Production boundary / old → repaired result                                                                                                                                                                                                | Completed evidence / remaining limit                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Completed unpaid payment notice obsolete under old event relevance                                                                                              | Real FirstPartyNotificationTransport and MultiTaxiRepository: immutable c223 transport **1 FAIL / 10 filter SKIP**, exit 1 → new transport **11 PASS / 0 SKIP**, exit 0                                                                    | `PAX_PAYMENT_FIRST_PARTY_TRANSPORT_SOURCE="$PWD/.local/pax-payment-core-20261011-recovery-notice/first-party-transport-c223.ts" pnpm exec vitest run tests/unit/pax-payment-core-20261009/recovery-notice-transport.test.ts -t 'sends completed unpaid'`, `old-transport-probe.log`; unfiltered `transport-final.log`. Immutable body retained, imports relocated only         |
| Same-client producer / sequence / finish, dedupe, restart, lost COMMIT acknowledgement, route refusal, owner/journal, CAS/sequence failures and explicit expiry | Actual PaymentChargeService/Repository/Session and MultiTaxiRepository; crypto/clock, PG replies and device/provider boundary mocked as disclosed. Combined new producer, transport and existing worker files **39 PASS / 0 SKIP**, exit 0 | `pnpm exec vitest run tests/unit/pax-payment-core-20261009/recovery-notice-producer.test.ts tests/unit/pax-payment-core-20261009/recovery-notice-transport.test.ts tests/unit/pax-payment-core-20261009/charge-worker.test.ts`, `producer-expanded.log`. PG replies are not a transaction/constraint/race engine. Provider acknowledgement is synthetic, not real FCM delivery |
| Initial transport assertion error                                                                                                                               | Server context legitimately contains owner; wire must not                                                                                                                                                                                  | `transport-initial.log`: 10 PASS / 1 FAIL; corrected to assert original owner in captured server context and no owner/token in wire; final 11 PASS above                                                                                                                                                                                                                       |
| Initial partner route fixture error                                                                                                                             | Formal route mapper needs identity_linked_at and all required fields                                                                                                                                                                       | `producer-initial.log`: 31 PASS / 1 FAIL; formal partner row prerequisites repaired, `producer-fixture-fixed.log`: 32 PASS; expanded 39 PASS above. No product guard removed                                                                                                                                                                                                   |
| Original two acceptance keys                                                                                                                                    | **Not recorded**; engineering progress only                                                                                                                                                                                                | Broader original Payment/Booking/account/Facebook, channel/FCM/partner regressions and final publication pending below/evidence directory. Real PG/HTTP/FCM/PSP/device, independent review/merge and actual policy/expiry remain pending                                                                                                                                       |

Evidence: `.local/pax-payment-core-20261011-recovery-notice/`, backed up to
canonical `.local/` before closeout. No VM product runtime; no real provider,
secret, device route enrollment or Booking snapshot producer was taken over.

### Recovery notice dispatcher and module verification continuation

Notice source anchor `de96f53a5d6529eadb627fc5fc010ff02d465775` was ordinarily
pushed. Its CI `38145994641` completed and was read: product-smoke typecheck
failed on the new provider mock's widened string literal and two existing
partner governance fixture callers. Integration `38145994646` completed;
complete jobs/logs are retained in the notice evidence directory. Product smoke
checked PR merge tree `9d39298a9` (full identity in raw log), not the owner tree.
No green CI or candidate is inferred from this failed run.

The owned mock now uses the actual provider function type. The foreign errors
remain at `sr-partner-notify-transport-20260918/governance.test.ts:229,427`:
the partner-only harness labels its row with the widened consumer event union.
Supervisor scope coordination requested ONLY
`tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport-harness.ts`:
type import and `ConsumerNotificationOutboxRecord & { eventType:
PartnerPassengerEventType }` for `harness.row`. Governance calls, old six-event
catalogs and the production facade are preserved. This exact helper is not in
the current grant; no unauthorized fixture/source change was made. Root
typecheck after owned fixes still exits 2 on these two errors only
(`root-typecheck-own-final.log`).

Actual MultiTaxiService dispatcher tests now traverse the real channel resolver,
claim, first-party transport/context, receipt and outcome repositories. A live
competing claim prevents provider IO; a reclaimed fence after synthetic ack
cannot insert a receipt. Receipt/status/COMMIT exceptions remain unresolved.
Missing provider/device produces typed failed outcomes and never uses the
present legacy port. Provider/device/DB replies and clock are external mocks;
this does not prove PG rollback/constraints/races or actual device delivery.
Producer/transport/worker regression: **48 PASS / 0 SKIP**, 3 files, exit 0
(`dispatcher-final.log`). Initial dispatcher fixture omitted the multiline
claim SELECT reply: **16 PASS / 3 FAIL**, retained in `dispatcher-initial.log`;
reply matcher corrected without changing production guards. Initial new
dispatcher compiler errors (optional createdAt/index) were corrected and
retained in `root-typecheck-dispatcher.log`.

The actual PassengerAppModule notice factories and Nest injector are also
tested without application bootstrap, timer, DB or HTTP. The real repository
adapter receives the explicit synthetic expiry; absent expiry/disabled channel
exposes disabled configuration for the existing worker guard. The initial
fixture incorrectly called the low-level selector without its required limit,
then assumed that selector itself was the configuration guard; both failed
runs are retained (`notice-module-initial.log`, `api-final.log`). The test now
checks the actual repository configuration seam; worker refusal remains covered
by its existing production-worker test. API typecheck after the new file passed
(`api-typecheck-module-final.log`). Commands with mistyped billing/caller file
names selected only the matching tests; those logs are not full caller evidence.
The final command uses the actual `billing-payment-exception.test.ts`,
`facebook-data-deletion.repository.test.ts` and
`passenger-push-devices.repository.test.ts` alongside both module config files.
It finished/read **66 PASS / 0 SKIP**, 5 files, exit 0
(`api-actual-callers-final.log`). Notice module configuration is **5 PASS**;
no application bootstrap or network was used.

Full affected Payment/Booking/Account/Facebook/Billing and existing
channel/FCM/route/partner/sequence/registry regression finished/read:
**953 PASS / 14 SKIP**, **45 files PASS / 2 PG files SKIP**, exit 0
(`affected-final.log`). Lint on all changed notice/payment contracts, source
and owned tests passed (`lint-final.log`). The generated normal hook formatted
pre-existing methods in the scoped repository file; a compiler-emitted AST
comparison against c223 verified **50 repository / 117 service unchanged
members**, and identical partner runtime catalogs/maps/TTL
(`audit-preserved-members.cjs`, `preserved-members-final.log`). Initial audit
scanner/SourceFile text mismatches are retained; the final AST excludes trivia
and SourceFile raw text, retains all executable child nodes and literal values.

Actual policy/expiry, lawful captured route/device/provider authority, real PG
payment transaction/concurrency, HTTP/FCM/PSP acceptance and independent
review/merge remain open. The original two acceptance keys remain unrecorded;
no handoff, candidate, done or VM product hosting is claimed.

## 2026-10-11 continuation: incompatible policy deadline validation

Adjacent baseline is `d3b6742aa28b457e1d1c988673045518583b780a`, freshly
equal to local HEAD, live remote branch and draft PR #2555. This dispatch
does not have the requested foreign partner harness scope; its two root
TS2345 errors remain open. The original scope-boundary probe and exact two-hunk
request remain under canonical `.local/pax-payment-core-20261011-recovery-notice/`.

Within already-owned Payment source, the actual policy validator accepted safe
integer delays that cannot produce a finite JavaScript Date deadline. The
registered supplement requires incompatible enabled policy to fail configuration
before PSP execution. The real PassengerAppModule factories/Nest injector
accepted both `Number.MAX_SAFE_INTEGER` and Date's maximum timestamp magnitude
as a delay in either schedule. Adding a positive current epoch to either exceeds
the date range. This is a representation defect, not an approved financial
schedule or a change to retry counts, unknown-only readback or business policy.

`validatePaymentCapturePolicy` now verifies that each explicit delay produces a
finite Date deadline from the validation clock, before copying/freezing the
schedule. The existing per-outcome deadline check remains in place. Actual module
factory and service injection use that same validator; configuration errors stay
sanitized and disabled configuration remains null.

Evidence directory: `.local/pax-payment-core-20261011-policy-date-range/`, copied
to canonical `.local/` before closeout. All commands use the assigned worker cwd,
Node 22.23.2 / pnpm 10.33.0 / Vitest 4.1.4.

| Finding / acceptance                                       | Actual source and old → repaired result                                                                                                                                                                                                | Completed command / result / evidence                                                                                                                                                                                                                                                                                                                                                   | Unverified limits                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Incompatible capture/readback deadline accepted at startup | Actual PassengerAppModule factories, configuration, validator and Nest injector; unchanged d3 product source **4 FAIL / 17 filter SKIP**, resolves configuration instead of rejecting → repaired full config file **21 PASS / 0 SKIP** | `pnpm --filter @drts/api exec vitest run tests/unit/payment-capture-config.test.ts -t 'rejects an unrepresentable'`, exit 1, `old-head-module-projected.log`; unfiltered same command, exit 0, `module-fixed.log`. Test body/prod diff and SHA retained; no active tree reset. Provider/session persistence are disclosed synthetic boundaries, not startup of an application or server | No actual policy values, deployment or PSP evidence supplied                                                                               |
| Original policy and financial decision controls            | Production validator/disposition and charge workflow, including legal synthetic capture, retry, readback and manual recovery                                                                                                           | `pnpm exec vitest run tests/unit/pax-payment-core-20261009/capture-policy.test.ts tests/unit/pax-payment-core-20261009/charge-workflow.test.ts`: **72 PASS / 0 SKIP**, exit 0, `policy-charge-fixed.log`                                                                                                                                                                                | Database and fake PSP replies remain external mocks                                                                                        |
| Initial assertion exposed synthetic fixture internals      | Vitest printed the resolved test runtime's synthetic cipher key bytes in its failed promise diff                                                                                                                                       | Initial identical **4 FAIL / 17 filter SKIP**, exit 1, `old-head-module.log`, retained. Assertion now projects success to undefined before comparing rejection; corrected old result rerun above no longer prints runtime/key objects                                                                                                                                                   | Synthetic fixture only, no real secret retrieved; initial log is not hidden or replaced                                                    |
| Tooling / original hook chain                              | Dispatch again supplied root/API node*modules symlinks to canonical dependencies and omitted generated `.husky/*`                                                                                                                      | No install, relink or deletion performed; Vitest may write shared result cache. Existing canonical generated Husky wrappers copied into worktree only; `h` equals installed Husky script SHA256 `70200b200ca709b0622784f93839a5b2872333a917a09afddefd7dc2d8cdc680`; original Supervisor hooksPath preserved                                                                             | No claim that shared cache is unchanged; tooling is not product acceptance                                                                 |
| pax-payment_bind_charge_and_states                         | Existing original bind/charge/refund/dual-state matrix retained; configuration defect repaired                                                                                                                                         | **Not recorded**; broader checks/publication results retained in this evidence bundle after completion                                                                                                                                                                                                                                                                                  | Foreign harness exact scope/root green CI, independent Codex2 review/protected merge and genuine PG/HTTP/PSP acceptance remain             |
| pax-payment_security_and_recovery                          | Enabled incompatible policy now refused; original guards/token/claim/route matrix retained                                                                                                                                             | **Not recorded**                                                                                                                                                                                                                                                                                                                                                                        | Approved actual capture policy, explicit expiry, lawful persisted route/provider/device authority and real PG/FCM/PSP evidence remain open |

This is a source checkpoint, not a candidate or handoff. All newly started
checks must finish and be read before closeout; their final results and published
identity are recorded in the evidence bundle. No VM product runtime was started.

## 2026-10-11 continuation: retained recovery requests blocked later scans

Baseline `c1132296fe4203296184aa272781714f004fb91a` was freshly equal to local
HEAD, remote task branch and draft PR #2555. The existing partner harness scope
blocker and original two acceptance keys remain open.

`PaymentChargeWorker.drain` previously selected the same first 25 un-enqueued
manual-recovery requests on every poll. A missing/ambiguous/partner route
correctly retains the request without creating an outbox; a full page of such
requests therefore prevented later eligible orders from ever reaching the real
producer. This is scan starvation, separate from any financial retry policy or
notice lifetime decision.

`PaymentChargeRepository.listRecoveryNoticeOrders` now uses a parameterized UUID
keyset in order-ID order. The existing worker advances its scan position after a
completed page and wraps after an empty page. A failed database page read keeps
the same position. The cursor is ephemeral scan progress only: restart begins a
new scan; all delivery/request/owner/expiry/claim/sequence authority remains in
the unchanged production ledger and notice producer. No new timer, claim,
financial schedule, route, event or delivery acknowledgement is introduced.

| Finding / acceptance                                                  | Actual source and old → repaired result                                                                                                                                                    | Completed command / evidence                                                                                                                                                                                                                                                                                                                           | Limits                                                                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full page of retained non-deliveries starves a later eligible request | Actual PaymentChargeWorker and PaymentChargeRepository; baseline **3 FAIL / 0 SKIP**, repaired **3 PASS / 0 SKIP** for later-page progress, wrap/retry and failed-page cursor preservation | `pnpm exec vitest run tests/unit/pax-payment-core-20261009/recovery-notice-scan.test.ts`: old exit 1, `old-head.log`; same file in `scoped.log`, exit 0                                                                                                                                                                                                | DB page replies and notice processing are external mocks. This tests actual scan orchestration, not SQL execution, PG races or notice delivery                             |
| Original notice producer/transport and worker controls                | Actual unchanged producer/transport guards, same-client outbox and original worker lifecycle tests                                                                                         | `pnpm exec vitest run tests/unit/pax-payment-core-20261009/recovery-notice-scan.test.ts tests/unit/pax-payment-core-20261009/charge-worker.test.ts tests/unit/pax-payment-core-20261009/recovery-notice-producer.test.ts tests/unit/pax-payment-core-20261009/recovery-notice-transport.test.ts`: **4 files / 51 PASS / 0 SKIP**, exit 0, `scoped.log` | Existing PG/provider/credential/device replies remain synthetic boundaries                                                                                                 |
| Original two required acceptance keys                                 | **Not recorded**                                                                                                                                                                           | Full regression, publication and CI follow-up are retained in `.local/pax-payment-core-20261011-notice-scan/`, copied to canonical `.local/` before closeout                                                                                                                                                                                           | Exact foreign helper scope/root CI, independent Codex2 review/protected merge, approved real policy/expiry/lawful route and genuine PG/HTTP/FCM/PSP acceptance remain open |

This is another original-task source checkpoint. This dispatch again inherited
canonical dependency symlinks and omitted generated Husky wrappers. Only the
canonical generated wrappers were copied into the worktree; `h` matches the
installed Husky script hash `70200b200ca709b0622784f93839a5b2872333a917a09afddefd7dc2d8cdc680`.
The Supervisor hooksPath is unchanged; no hook bypass, dependency install or
canonical dependency mutation was performed. Unit runners may update their
shared result cache. No product/dev/preview/API/PG/browser/Docker runtime was
started; the worker lifecycle tests use fake timers and mocked dependencies.

## 2026-10-11 continuation: partner-only harness type boundary

Supervisor registered
`PAX-PAYMENT-EXACT-PARTNER-ONLY-TEST-HARNESS-TYPE-SUPPLEMENT.md` and added only
`tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport-harness.ts`
to the original task's exact scope after checking parallel ownership. Baseline
`19d41b3a4c628b21c27ced9f4bfed7642857436b` was freshly equal to the local,
remote and draft PR #2555 heads. An initial evidence audit expected the old
missing scope and exited 1 when the fresh slice revealed this coordination;
the initial snapshot is retained, not treated as a product failure.

The existing partner-only helper's row annotation included the first-party-only
payment event through the consumer union. Actual production
`PartnerNotificationDispatchFacade.resolveNotificationRoute` correctly accepts
only `PartnerPassengerEventType`. Fresh `pnpm typecheck:root` on unchanged
19d41b3 exited 2 with exactly TS2345 at `governance.test.ts:229,427`.
This is a compiler/fixture failure, not a reproduced runtime payment defect.

The authorized repair adds the authoritative type-only import and intersects
the row's consumer record type with `{ eventType: PartnerPassengerEventType }`.
Every fixture value, assertion, caller, facade, external mock, runtime guard,
six-event partner map and TTL remains unchanged. No payment event becomes a
partner webhook. No new mirror test is added for this type-only correction.

| Finding / acceptance                 | Actual source / verification boundary                                                                                   | Commands and evidence                                                                                                                                                                                           | Remaining limit                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Partner-only caller type mismatch    | Actual root compiler and helper; baseline exit 2, exactly two TS2345 errors                                             | `pnpm typecheck:root`, `root-baseline.log`; repaired compiler, original transport and affected Payment/Booking/account/Billing/channel/FCM checks retained with completed exits in the evidence directory below | Compiler success is not runtime payment or PG acceptance                                                                              |
| Runtime preservation                 | Type-only import and row intersection; compare baseline and repaired transpilation, retain exact diff and helper hashes | `runtime-equivalence.log`, `source.diff`; whole immutable62 range exact scopes/trailers/bypass/whitespace and publication identity retained with final results                                                  | No facade/caller/contract/TTL runtime change                                                                                          |
| `pax-payment_bind_charge_and_states` | Original formal SQL/source/fault matrix preserved; not recorded                                                         | Final check results, matching source SHA, remote/PR identity and hosted CI are retained in the same evidence directory                                                                                          | Independent Codex2 review/protected merge and genuine PG/HTTP/PSP remain pending                                                      |
| `pax-payment_security_and_recovery`  | Original security, unknown-ack readback-only and disabled policy/expiry guards preserved; not recorded                  | Original tests and failures/skips remain visible; this checkpoint does not supply financial policy or expiry values                                                                                             | Approved real policy/explicit expiry, lawful captured first-party route/device/provider and genuine PG/FCM/PSP acceptance remain open |

Evidence: canonical `.local/pax-payment-core-20261011-partner-harness/`, continuing
the original recovery-notice scope-boundary and notice-scan artifacts. Actual
completed result counts/exits and published SHA belong to its final sidecar;
pending checks are not passes. Node 22.23.2, pnpm 10.33.0, TypeScript 5.9.3,
Vitest 4.1.4. Existing generated Husky wrappers were copied only into the
worktree; Supervisor hooksPath and original hook chain are preserved. Inherited
canonical dependency symlinks were not installed/relinked/removed; unit runners
may write their shared results cache. No VM product/dev/preview/API/PG/browser/
Docker runtime, real provider, secrets or deployment was started.

## 2026-10-14 continuation: actual PostgreSQL binding parameter inference

Original owner Codex normally reopened the original task before editing, then
started this precise repair under the frozen source specification
`PAX-PAYMENT-CORE-ACTUAL-PG-BINDING-SQL-REPAIR-20261014.md` (SHA256
`e0a025dd3216a8ae4aa60579642bd76afb43f627a09d9c44ff48481cd7530c9f`).
Independent reviewer remains Codex2. The accepted old candidate
`bed2fa8baafefeaa243283a68915eb36374165f7`, generation
`764b3e32d40248f892938258fbf24eda`, PR #2555 and protected merge
`fc77f579d087c019660128d85c6ec4a8644a989e` remain historical evidence;
their review/CI credit does not apply to this new candidate.
This isolated branch starts at accepted dev
`32eb87f19e2a7ccb978057785bfad4116246916f`.

The real call path is `PaymentMethodService.bind` → committed
`PaymentMethodRepository.claimBinding` → external PSP exchange → encrypted
`PaymentMethodRepository.completeBinding` → account-first transaction → token
INSERT and completed journal UPDATE. V0115 declares
`passenger.psp_tokens.drts_passenger_id varchar(100)` referencing the V0109
account. In the INSERT, the same unknown `$2` occurred in the varchar target
assignment and the default-card comparison inside `NOT EXISTS`. PostgreSQL
deduced incompatible text/varchar types before executing the INSERT; the
repository sanitized the exception and the lawful mounted bind returned 503.

Immutable QA source `7c65bc2ab66922d97997eebe31ab2b320763fe1d`, hosted run
[38507808648](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38507808648),
job `115669387402`, executed 27 cases: **2 PASS / 25 FAIL / 0 SKIP** after
verifying all **115 formal files / 114 distinct checksum payloads**.
Production checkout was synthetic merge
`ddbe6e74e2536cdc1d6de589724a761a8655fa7c`, tree-equal to 7c65.
The first binding/default PG case and lawful mounted POST both failed at this
SQL prerequisite. Twenty-six log occurrences are not 26 cases; downstream
charge/refund behavior was not proved. The earlier migration-beforeAll failure
with 27 skips is separate history. Qualification is retained at canonical
`.local/goal-continuation-20261014T0238-root/qa-payment-prerequisite/hosted-ci/corrected-H1/genuine-binding-SQL-failure-qualification.json`.

The only production change explicitly types both occurrences as `$2::varchar`.
There is no length typmod on either cast; the existing column still enforces
100 characters rather than silently truncating an identifier. The statement's
nine columns, eight parameter values, default predicate, encrypted envelope,
account/claim locks, replay branch, journal outcome and rollback/error handling
are retained. No schema, migration, financial policy, PSP interface, QA harness,
workflow, notice or security mechanism changes accompany this repair.

`tests/unit/pax-payment-core-20261009/binding.postgres.test.ts` calls the actual
service, repository, DatabaseService and cipher with the existing nonproduction
fake provider as the external PSP boundary. It uses the formal `db-apply.sh`
runner in a randomly named, owned hosted database, verifies every checkout
migration signature and checks filename/version provenance. It neither copies
business SQL nor creates substitute tables. Native psql is required before the
runner, preventing Docker fallback. Each case has distinct synthetic accounts;
cleanup drops only the successfully created test database. On this VM the whole
file skips before opening any connection, even with an inherited database URL.
On GitHub Actions missing DATABASE_URL or psql is a failure.

| Finding / acceptance                          | Source and old → repaired result                                                                                                                                                                                                                                                                                                                                           | Commands / completed evidence                                                                                                                                                                                                                                                                            | Remaining limits                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lawful bind rejected by mixed `$2` inference  | `PaymentMethodRepository.completeBinding` INSERT, V0115 varchar(100); actual old hosted failure above → six own repaired-source PG cases pending hosted execution                                                                                                                                                                                                          | New PG file tests first/default + second/nondefault encrypted storage, same-key service/repository replay after default change, foreign claim refusal, inactive-account refusal, real V0115 CHECK rollback with pending-claim retry, full 100-character owner. VM result: **6 SKIP**, no PG pass claimed | New hosted results must identify actual production checkout and executed cases; original QA owns unchanged 19 PG / 8 HTTP predicates after accepted source integration |
| Existing affected Payment regression          | Actual original binding/charge/refund/guards/cipher/notice units; DB/provider responses remain disclosed external mocks                                                                                                                                                                                                                                                    | `pnpm exec vitest run tests/unit/pax-payment-core-20261009`: exit 0, **15 files / 305 PASS**, new PG file **6 SKIP**; `payment-units.log`                                                                                                                                                                | Unit pass does not prove PostgreSQL or HTTP behavior                                                                                                                   |
| Existing API config regression                | Actual module factories/injection with mocked external dependencies                                                                                                                                                                                                                                                                                                        | `pnpm --filter @drts/api exec vitest run tests/unit/payment-capture-config.test.ts tests/unit/payment-recovery-notice-config.test.ts`: exit 0, **2 files / 26 PASS / 0 SKIP**; `api-units.log`                                                                                                           | No real financial policy or notice expiry supplied                                                                                                                     |
| Static checks / inherited build prerequisites | Scoped ESLint exit 0; first API typecheck exit 2 from absent/stale branch-local contract/auth dist outputs → own-worktree package builds and API typecheck exit 0. Original root typecheck exit 2 from inherited foreign-worktree ApiClient type identity / missing passenger-client output → identical root include/options with explicit own-source package paths exit 0 | `lint.log`, `api-typecheck.log`, `contracts-build.log`, `auth-build.log`, `api-typecheck-fixed.log`, `root-typecheck.log`, `source-typecheck.log`, `tsconfig.source-check.json` in the sidecar                                                                                                           | Both initial compiler failures retained; the own-source follow-up is not a claim that the original unmodified root command passed                                      |
| `pax-payment_bind_charge_and_states`          | **Unrecorded**, original source/SQL/fault matrix preserved                                                                                                                                                                                                                                                                                                                 | Exact new SHA, remote/PR identity, completed checks and matching CI are retained in canonical `.local/pax-payment-binding-sql-20261014/`                                                                                                                                                                 | Codex2 independent review, protected merge, unchanged full Payment PG/HTTP/PSP acceptance still required                                                               |
| `pax-payment_security_and_recovery`           | **Unrecorded**, existing account/claim/encryption/refusal/unknown/readback controls retained                                                                                                                                                                                                                                                                               | Original rejection/rollback tests plus new hosted binding cases above; full result sidecar preserves fail/pass/skip separately                                                                                                                                                                           | Approved actual financial policy/explicit notice expiry/lawful captured route/device/provider and genuine native/manual/global acceptance remain open                  |

Commands run in the assigned isolated worker cwd on 2026-10-14 UTC using
Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4 and TypeScript 5.9.3. Publication
identity and final result logs/hashes are recorded in the canonical sidecar to
avoid a self-referential commit SHA. Existing generated Husky wrappers were
copied into this worktree so the original hook chain executes; hooksPath,
canonical dependency symlinks and guard configuration remain intact. Package
builds generate ignored outputs only in this worktree. Unit runners may write
shared caches. No VM product/API/PG/preview/browser/Docker runtime, real
provider call, deployment, acceptance credit or owner self-review occurred.
