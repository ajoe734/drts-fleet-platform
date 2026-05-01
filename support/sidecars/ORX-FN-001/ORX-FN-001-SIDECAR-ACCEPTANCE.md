# ORX-FN-001 Acceptance Packet

Task: `ORX-FN-001` — Channel-aware payer / sponsor / payout matrix implementation  
Owner: `Codex2`  
Reviewer: `Codex`  
Sidecar Author: `Claude`  
Date: `2026-04-30`

---

## 1. Dependency Map

### Direct Dependencies (both `done`)

| Dep ID       | Title                                                              | Status | Commit    | Relevance                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------ | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPX-CM-004` | Channel-aware settlement and reconciliation matrix materialization | `done` | `fa9a0ec` | Provides the base settlement matrix with `channelKey`, `orderDomain`, `localLedgerMode`, invoice/receipt/reconciliation paths. ORX-FN-001 extends this with payer/sponsor/payout/discount/reimbursement semantics. |
| `OPX-CM-003` | Pricing authority and manual fare override governance              | `done` | `8df45d9` | Establishes that quoted fare source is canonical and manual overrides require actor/reason/trace. ORX-FN-001's discount funding and reimbursement rules must align with these override governance constraints.     |

### Downstream Dependents (blocked until ORX-FN-001 completes)

| Task ID      | Title                                                         | Why Blocked                                                                                                        |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `ORX-FN-002` | Reconciliation issue queue, ownership, and dispute resolution | Needs the finalized channel-aware settlement semantics to define mismatch types and dispute ownership per channel. |
| `ORX-GV-001` | Negative-path UAT pack and release gate expansion             | Includes ORX-FN-001 in its dependency set for finance negative-path UAT scenarios.                                 |

---

## 2. Acceptance Criteria Checklist

Source: execution packet `ORX-20260430`, section `ORX-FN-001`.

### AC-1: Every channel answers payer, sponsor, invoice owner, receipt owner, and driver payout authority

| Channel             | `payerType`                            | `sponsorType`                                      | `invoiceOwner`                                | `receiptOwner`                                   | `driverPayoutAuthority`          |
| ------------------- | -------------------------------------- | -------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ | -------------------------------- |
| `tenant_enterprise` | tenant                                 | tenant contract owner                              | platform finance for tenant billing           | tenant / partner channel                         | platform settlement engine       |
| `partner_airport`   | partner program / card-benefit sponsor | partner bank / issuer benefit program              | platform finance with partner statement owner | credit-card / service platform / partner channel | platform settlement engine       |
| `phone_dispatch`    | passenger or backoffice collection     | none by default; ops backoffice if manual takeover | platform backoffice finance                   | backoffice / tenant portal                       | platform settlement engine       |
| `forwarded_shadow`  | external platform                      | external platform / forwarder contract             | external platform settlement owner            | external platform                                | external platform payout program |

- **Verification path**: `settlement-matrix.ts` — all 4 channels define all 5 fields.
- **Test**: `billing-settlement.service.test.ts` — asserts `sponsorType`, `invoiceOwner`, `driverPayoutAuthority` per channel.
- **API surface**: `BillingSettlementService.listSettlementMatrix()` exposes the full matrix via `/settlement/matrix`.

### AC-2: Discount and reimbursement behavior is consistent with sponsor truth

| Channel             | `discountFundingSource`                                              | `reimbursementRule`                                                                                                        |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tenant_enterprise` | tenant-approved contract pricing; no external sponsor subsidy        | No reimbursement batch unless a platform-funded discount is explicitly recorded on the trip.                               |
| `partner_airport`   | sponsor-funded benefit subsidy with issuer and eligibility trace     | Platform-funded discounts create reimbursement batches so driver payout stays whole while sponsor settlement closes later. |
| `phone_dispatch`    | manual fare adjustments or waivers require named backoffice approval | Driver reimbursement only applies when finance records a platform-funded concession for the call-created order.            |
| `forwarded_shadow`  | external-platform promotions and compensation stay off-platform      | No local reimbursement batch; the platform stores shadow payout context only for audit and dispute handling.               |

- **Verification path**: `settlement-matrix.ts` — each channel defines `discountFundingSource` and `reimbursementRule`.
- **Test**: `billing-settlement.service.test.ts` — validates `discountFundingSource` contains `"manual"` for `phone_dispatch`, and `reimbursementRule` contains `"reimbursement"` for `partner_airport`.
- **Reimbursement batch test**: asserts `partner_airport` creates reimbursement batch items with reason `platform_funded_discount`.

### AC-3: Reporting and settlement use the same channel semantics

- **Verification path**: `reporting-filing.service.test.ts` — validates that report job artifacts carry `channelKey` and `localLedgerMode` from the settlement matrix.
- **Shared source**: Both `BillingSettlementService` and `ReportingFilingService` consume `buildSettlementMatrix()` from the same `settlement-matrix.ts` module.
- **Channel key derivation**: `settlementChannelKeyForTrip()` deterministically maps `orderSource`, `businessDispatchSubtype`, and `partnerId` to channel keys.
- **Invoice/statement tests**: `billing-settlement.service.test.ts` validates that generated invoices and driver statements carry correct `channelKey` per line item.

---

## 3. Open Issues From Review

The Codex review (`ORX-FN-001-REVIEW.md`, status: `changes_requested`) identified one blocking issue:

### Localization Regression (L10N)

**Problem**: Both `payments/page.tsx` and `revenue/page.tsx` render `row.payerType`, `row.sponsorType`, `row.invoiceOwner`, `row.receiptOwner`, `row.driverPayoutAuthority`, `row.discountFundingSource`, `row.reimbursementRule`, and `row.reconciliationPath` as raw backend English strings. The new sponsor/payout/discount fields have no zh locale entries at all.

**Evidence**:

- `platform-admin-web/app/payments/page.tsx:493` — renders `{row.payerType}` directly
- `ops-console-web/app/revenue/page.tsx:591` — renders `{row.payerType}` directly
- `platform-admin-web/lib/translations.ts` — has zh entries for payer and reconciliation per channel (lines 1061-1091) but missing entries for `sponsorType`, `invoiceOwner`, `receiptOwner`, `driverPayoutAuthority`, `discountFundingSource`, and `reimbursementRule`
- `ops-console-web/lib/translations.ts` — same gap

**Impact**: Chinese-locale operators see mixed-language settlement guidance on both finance consoles.

**Required fix**: Wire cell rendering through localized translation keys instead of raw backend strings, and add zh translations for all new matrix fields.

**Status**: This must be resolved before ORX-FN-001 can move to `review_approved`.

---

## 4. Verification Commands

```bash
# Settlement matrix + billing/reporting unit tests
pnpm --filter @drts/api exec vitest run tests/unit/billing-settlement.service.test.ts tests/unit/reporting-filing.service.test.ts

# TypeScript compilation checks
pnpm --filter @drts/platform-admin-web exec tsc --noEmit
pnpm --filter @drts/ops-console-web exec tsc --noEmit

# Contracts build (settlement matrix type)
pnpm --filter @drts/contracts run build
```

---

## 5. Handoff Summary

- **Dependencies**: Both `OPX-CM-004` and `OPX-CM-003` are `done` with commit evidence. No upstream blocker.
- **Acceptance coverage**: All 3 acceptance criteria have corresponding test coverage and can be verified deterministically.
- **Blocking review finding**: The L10N regression (section 3) is the sole outstanding `changes_requested` item. The implementation owner (`Codex2`) must resolve this before the task can proceed to `review_approved`.
- **Downstream impact**: `ORX-FN-002` and `ORX-GV-001` are blocked on ORX-FN-001 completion.
- **Sidecar scope**: This packet is a support artifact only. No canonical truth was modified.
