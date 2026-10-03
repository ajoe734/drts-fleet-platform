# AUDIT-RECOVERY-PROVIDERS-20261002 UAT Notes

Audit F07: `PAYMENT_RECOVERY_PORT` and `FARE_QUOTE_RECOVERY_PORT` were both wired
to `Unavailable*` stubs that reject every action. This task inventories the two
ports' actions against what is actually configured in this repository, implements
a real adapter wherever an action has no external dependency to fabricate, and
leaves everything else explicitly blocked with the exact missing authorization.

## 1. Inventory: what each action actually needs

### `PaymentRecoveryPort` (`apps/api/src/modules/billing-settlement/payment-recovery.port.ts`)

| Action                  | What it would do                                                                                             | External dependency?                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `retry_capture`         | Re-present a failed multi-taxi passenger charge to a card/PSP processor for capture.                         | **Yes.** Requires a real payment gateway/issuer integration. |
| `begin_manual_recovery` | Record that an operator is taking the failed payment outside the automated system for manual reconciliation. | **No.** Pure internal state transition.                      |

Full-repository search confirms there is **no payment gateway, PSP, or issuer
adapter integrated anywhere** in this codebase:

- `grep -rn "PaymentGateway\|PAYMENT_GATEWAY\|PspAdapter\|PaymentProvider\|StripeAdapter\|ECPay\|NewebPay\|TapPay\|LinePay" apps/api/src` returns zero matches.
- `providerPaymentRef` (`billing-settlement.repository.ts:115`) is the only
  "provider" field on a passenger payment, and nothing in the service ever
  calls an external endpoint to produce it -- it is populated by whatever
  upstream system records the multi-taxi exception, not by this codebase.
- `docs/02-architecture/phase1-money-path-audit-20260823.md` independently
  confirms the money path is internal settlement bookkeeping (integer minor
  units, basis-point rates) with no card-network or PSP leg.
- SR-LIVE-FINANCE-001 (the live-acceptance gate for this area) is still open
  and explicitly requires "授權 issuer/payment/ERP sandbox" (an authorized
  issuer/payment/ERP sandbox) before any real capture call can exist.

For `begin_manual_recovery`, the persistence contract already exists and is
confirmed, independent of which port is wired:
`BillingSettlementRepository.completeMultiTaxiPaymentRecoveryCommand`
(`billing-settlement.repository.ts:491-546`) unconditionally sets
`multi_taxi_passenger_payments.status = 'manual_recovery'` when
`action = 'begin_manual_recovery'`. The port's only job for this action is to
acknowledge the request; the database contract that records the handoff to a
human was already real.

**Confirmed:** `begin_manual_recovery` has a real, internal contract.
`retry_capture` has no confirmed provider contract anywhere in this repository.

### `FareQuoteRecoveryPort` (`apps/api/src/modules/product-rule/fare-quote-recovery.port.ts`)

The port has a single action, `retry_quote`. It would need to re-run the fare
computation that produced one of the three retryable anomaly reasons
(`quote_provider_unavailable`, `route_unresolved`, `calculation_mismatch`).
That computation is `OwnedMobilityService.buildFareQuoteSnapshot`
(`owned-mobility.service.ts:10367-10417`), outside this task's write scope
(`apps/api/src/modules/product-rule/`), and -- for the `fixedPrice` case this
port's only currently-reachable reason (`quote_provider_unavailable`) guards
(`owned-mobility.service.ts:10441-10446`) -- the fare itself is not computed
from a real quoting engine at all. It is a hardcoded constant,
`DEFAULT_PLATFORM_QUOTED_FARE` (`owned-mobility.service.ts:419-422`), stamped
onto every such order with `quotedFareSource: "platform_pricing_rule"`
(`owned-mobility.service.ts:1748-1749`). There is no accepted external
fare-quote vendor contract anywhere in this repository (same grep sweep as
above returns nothing fare-quote-specific either), and the one candidate
computation to "retry" is itself a placeholder, not a confirmed pricing
engine. Wiring a cross-module adapter against a hardcoded constant would not
be implementing a confirmed contract -- it would be inventing one.

**Confirmed:** no provider contract exists for `retry_quote`. It stays
blocked, as it was, with the exact reason now on record.

## 2. What was implemented

`PlatformManualPaymentRecoveryPort` (new, in `payment-recovery.port.ts`)
replaces `UnavailablePaymentRecoveryPort` in `billing-settlement.module.ts`'s
DI wiring:

- `isAvailable("begin_manual_recovery")` → `true`; `isAvailable("retry_capture")` → `false`.
- `recover("begin_manual_recovery", ...)` → `{ status: "accepted" }`. No
  external call is made; this does not claim money moved or a processor
  responded, only that the system accepted the hand-off to manual ops, which
  is the literal meaning of the action name and matches the persisted
  `manual_recovery` status the repository already writes for it.
- `recover("retry_capture", ...)` → throws `"Payment recovery adapter is not
provisioned."`, same as before. `BillingSettlementService`'s own
  `UnavailablePaymentRecoveryPort` default (used when nothing is injected,
  e.g. in isolated unit construction) is untouched.

`UnavailableFareQuoteRecoveryPort` (`fare-quote-recovery.port.ts`) is
unchanged in behavior; only its doc comment now records the exact reason
(above) so a future worker does not have to re-derive it.

## 3. Denial and idempotency regressions

`tests/unit/audit-recovery-providers-20261002.test.ts` (8 tests, all new):

- `PlatformManualPaymentRecoveryPort`: confirms the per-action availability
  split and that `retry_capture` rejects rather than fabricating a capture.
- `BillingSettlementService.executeMultiTaxiPaymentRecovery`, wired with the
  real module adapter and a repository double:
  - **Denial**: `retry_capture` is rejected with
    `409 payment_recovery_provider_not_provisioned`, and
    `claimMultiTaxiPaymentRecoveryCommand` is never called -- no command is
    opened and no provider call is attempted for an action that cannot
    honestly complete.
  - **Idempotency**: `begin_manual_recovery` called twice with the same
    `Idempotency-Key` claims/completes a command exactly once; the second
    call returns the identical cached receipt from the recovery-command
    ledger without re-claiming or re-invoking the port.
- `FareAnomalyService` wired with the real `UnavailableFareQuoteRecoveryPort`:
  - **Denial**: the `retry_quote` action descriptor is exposed as
    `enabled: false, disabledReasonCode: "FARE_QUOTE_PROVIDER_NOT_PROVISIONED"`,
    and calling `retryQuote` throws `409 FARE_QUOTE_PROVIDER_NOT_PROVISIONED`.
  - **Idempotency**: with an available fake port, two `retryQuote` calls using
    the same `Idempotency-Key` invoke the port exactly once and return the
    identical cached receipt on replay.
- `UnavailablePaymentRecoveryPort`: confirms the DI-less default (used when no
  adapter is wired at all, e.g. a bare unit-test construction) still rejects
  every action.

## §0.7 Candidate Evidence Table

| Property / Finding / Key                      | Value / Resolution                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base SHA                                      | `9780f0bc2` (origin/dev, fast-forward merged into this branch after `AUDIT-PROOF-CLOSURE-20261002` and `AUDIT-DEPENDENCY-GATES-20261002` landed; `billing-settlement.module.ts` auto-merged cleanly, re-validated below)                                                                                                                                                                                                |
| CWD                                           | `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-audit-recovery-providers-20261002`                                                                                                                                                                                                                                                                                                          |
| Branch                                        | `claude/audit-recovery-providers-20261002`                                                                                                                                                                                                                                                                                                                                                                              |
| Files changed                                 | `apps/api/src/modules/billing-settlement/payment-recovery.port.ts`, `apps/api/src/modules/billing-settlement/billing-settlement.module.ts`, `apps/api/src/modules/product-rule/fare-quote-recovery.port.ts`, `tests/unit/audit-recovery-providers-20261002.test.ts`, this document                                                                                                                                      |
| Validation command (new + related unit tests) | `NODE_ENV=test pnpm exec vitest run tests/unit/audit-recovery-providers-20261002.test.ts tests/unit/billing-settlement.test.ts tests/unit/system-remediation/sr-qa-reports-001/c095-p5-fare-anomalies-ratings.test.ts tests/integration/conf-idem-005-client-intent.integration.test.ts --no-cache`                                                                                                                     |
| Validation result                             | 4 files, 34/34 passed, exit 0                                                                                                                                                                                                                                                                                                                                                                                           |
| Typecheck                                     | `pnpm --filter @drts/api exec tsc --noEmit -p tsconfig.json` → exit 0; `pnpm exec tsc -p tsconfig.json --noEmit` (root, covers `tests/unit/`) → exit 0. (`@drts/contracts` and `@drts/control-plane-auth` were built locally first via `pnpm --filter <pkg> build`; their `dist/` is gitignored output, not a source change.)                                                                                           |
| Lint                                          | `pnpm --filter @drts/api exec eslint src/modules/billing-settlement/payment-recovery.port.ts src/modules/billing-settlement/billing-settlement.module.ts src/modules/product-rule/fare-quote-recovery.port.ts --max-warnings=0` → exit 0; `pnpm exec eslint tests/unit/audit-recovery-providers-20261002.test.ts --max-warnings=0` → exit 0                                                                             |
| Environment note                              | Shared `node_modules` symlinks in this worktree were broken (pointed at a reaped sibling worktree); ran a private `CI=true pnpm install --frozen-lockfile --prefer-offline` scoped to this worktree only (17.8s, 0 downloads, resolved from the local store) to restore a working install, per the "no installs through shared symlinks; use a private frozen install" constraint. No lockfile or manifest was changed. |
| VM restrictions observed                      | No product/dev/browser/Compose servers were started; only unit tests, typecheck and lint were run, as authorized for this task. No live payment, ERP, or fare-quote provider was called or configured.                                                                                                                                                                                                                  |
| `confirmed_provider_contracts`                | Confirmed via repository-wide inventory (§1): no payment gateway/PSP/issuer and no fare-quote vendor is integrated anywhere in this repository. `begin_manual_recovery`'s internal persistence contract (`completeMultiTaxiPaymentRecoveryCommand`) is confirmed and already real.                                                                                                                                      |
| `real_adapter_or_explicit_blocker`            | `begin_manual_recovery` now has a real, non-fabricating adapter (`PlatformManualPaymentRecoveryPort`), wired into `BillingSettlementModule`. `retry_capture` and `retry_quote` remain explicitly blocked with the exact missing authorization/contract documented in §1, not silently disabled.                                                                                                                         |
| `denial_and_idempotency_regressions`          | `tests/unit/audit-recovery-providers-20261002.test.ts`, 8/8 passing (§3): fail-closed denial for both still-unprovisioned actions, and idempotent replay (provider/claim invoked exactly once per idempotency key) for both the now-real action and the fare-quote port's available-port path.                                                                                                                          |
| `same_sha_review_ci`                          | Pending: recorded by reviewer/CI/merge against the `CANDIDATE_SHA` in this task's handoff, not by this document.                                                                                                                                                                                                                                                                                                        |
| Remaining blockers for future work            | `retry_capture`: needs an authorized issuer/payment/ERP sandbox contract (SR-LIVE-FINANCE-001). `retry_quote`: needs either a confirmed external fare-quote vendor contract, or the `owned-mobility` fixed-price quoting path to move off its hardcoded placeholder onto a real, accepted pricing engine -- neither exists today, and inventing either was out of this task's authority.                                |
