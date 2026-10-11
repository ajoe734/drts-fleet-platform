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
