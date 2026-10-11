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
