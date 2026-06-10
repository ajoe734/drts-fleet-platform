# Credit-Card Airport Transfer — System Analysis (SA)

**Date:** 2026-06-10
**Feature:** 信用卡卡友機場接送 · `businessDispatchSubtype: credit_card_airport_transfer`
**Author lane:** Claude
**Baseline:** `origin/dev`
**Requirements:** [`../01-product/credit-card-airport-transfer-requirements-20260610.md`](../01-product/credit-card-airport-transfer-requirements-20260610.md)

> Method: cross-read the live code (`apps/partner-booking-web` `card` program, `apps/api/src/modules/tenant-partner/*`, `billing-settlement/settlement-matrix.ts`, `tenant/service-programs`, `packages/contracts`) against the four-surface model. Every actor, scenario, and entity below is reconciled to what the system actually does today; `[built] / [partial] / [gap]` markers carry through from requirements.

---

## 1. Actors

### 1.1 Human actors

| Actor | Realm | Surface | Notes |
|---|---|---|---|
| `cardholder` 卡友 | external consumer | S1 booking web / S2 banking-app embed | identity from issuer session or reference token |
| `bank_program_admin` | tenant business plane (issuer tenant) | S3 tenant-console | owns program config & policy view |
| `bank_ops_viewer` | tenant business plane | S3 | read-only booking + dispatch + contract lookup |
| `bank_finance` | tenant business plane | S3 | settlement statement + reconciliation |
| `drts_dispatcher` | control plane | S4 ops-console | assigns / redispatches |
| `drts_settlement_operator` | control plane | S4 | closes settlement, issues reimbursement batches |

### 1.2 System / machine actors

| Actor | Role |
|---|---|
| `partner_ingress` | accepts S1/S2 bookings under a partner entry (host/slug/program code) |
| `eligibility_adapter` | `bank-card-inline` or `reference-token` — verifies cardholder benefit |
| `dispatch_engine` | platform dispatch lifecycle |
| `settlement_engine` | applies the settlement matrix; produces sponsor reconciliation + reimbursement batches |
| `issuer_benefit_system` | the bank's own benefit/quota authority (external; DRTS consumes a decision) |

## 2. Use-case scenarios (positive + negative)

### UC-1 Cardholder books a benefit airport transfer (S1/S2)
**Positive:** open issuer-branded entry → eligibility verified (inline or reference token) → quota check passes → enter flight/terminal/direction + pickup/time → review → confirm → booking accepted → dispatch lifecycle begins → ride tracked → completed → receipt.
**Negative paths (each a named state):**
- N1 ineligible (program/zone not authorised) → `ineligible` with reason, PII-safe.
- N2 inline-required (need card last-4 / reference) → `inline_required`.
- N3 quota exhausted (禮遇趟次 用罄) → `blocked` / quota-exhausted.
- N4 no supply at window → `no-supply`.
- N5 manual review (risk/ambiguous) → `manual_review`.
- N6 degraded (booking creation blocked, status visible) → `degraded`.

### UC-2 Bank ops looks up a cardholder's ride (S3) **[gap]**
**Positive:** `bank_ops_viewer` searches by cardholder reference / order → sees booking (flight/terminal/direction), dispatch status (assigned / en route / completed), and contract/SLA posture. Read-only; deep-links to ops detail are access-gated.
**Negative:** N1 actor lacks permission → forbidden; N2 order outside issuer tenant scope → not found; N3 linked ops system unavailable → degraded read.

### UC-3 Bank finance reconciles & settles (S3) **[gap]**
**Positive:** `bank_finance` selects a period → sees the settlement statement: trips delivered, per-trip fare, subsidised vs paid split, benefit reference, masked cardholder reference, totals, status, signed artifact download → reconciles against the bank's records → marks/agrees settlement.
**Negative:** N1 period not yet published → empty/pending; N2 artifact expired → re-issue path; N3 dispute on a line item → flag for DRTS settlement operator.

### UC-4 DRTS dispatches & settles (S4) **[built]**
**Positive:** dispatcher assigns driver to the airport ride (flight/terminal context visible) → completion recorded → settlement engine applies the card-benefit channel → driver payout whole via platform engine → reimbursement batch created for the platform-funded portion → sponsor (issuer) settlement closes later with benefit references intact.
**Negative:** N1 driver no longer eligible → reassign; N2 cancellation → quota refund per policy (OPQ-4); N3 fare waiver/adjustment → named back-office approval.

### UC-5 Program administration (S3) **[partial]**
`bank_program_admin` views program config (programCode, coverage, benefit, quota) and usage (cardholders served, 趟次 consumed vs quota). Edit scope per policy.

## 3. Data entities (grounded in contracts/modules)

| Entity | Key fields (live) | Source |
|---|---|---|
| **ServiceProgram** | `programId`, `programCode`, `programType`, `issuer`, `coverage`, `benefit`, `quota` | `tenant/service-programs` |
| **EligibilityDecision** | `verificationStatus`, `decisionSource`, `verificationReasonCode`, `cardProgramCode`, `benefitReference`, `issuerAuthorizationRef`, `referenceTokenHash`, `eligibilityVerificationId` | `PartnerEligibilityAdapterResult` |
| **Quota** | per cardholder/program/period; `quotaSnapshotVersion`, `quotaImpacts` | eligibility/quota model |
| **Booking (airport subtype)** | `businessDispatchSubtype: credit_card_airport_transfer`, `passengerName`, `flightNo`, `terminal`, `direction`, pickup/drop, window | `partner-booking-form` + order model |
| **Order / Trip** | order/trip lifecycle, driver assignment, completion | `tenant/orders`, `tenant/trips` |
| **SettlementMatrixRecord (card channel)** | `payerType: partner program / card-benefit sponsor`, `sponsorType: partner bank / issuer benefit program`, `reconciliationPath`, reimbursement-batch rule | `billing-settlement/settlement-matrix.ts` |
| **Statement / Invoice (對帳單)** | period, amount, status (paid/published/due), issued, due, signed artifact | `tenant/invoices` (period statement) |
| **Contract / Fulfilment** | service term, SLA targets, period attainment | `fulfilment` modelling (**no bank-facing surface — [gap]**) |

## 4. State machines

### 4.1 Eligibility
`unverified → (adapter) → {eligible | inline_required | ineligible | blocked(quota) | manual_review}`; `eligible` carries benefit/issuer references forward.

### 4.2 Booking / dispatch lifecycle
`created → [approval?] → driver_assigned → en_route → completed | cancelled`; airport context (flight/terminal/direction) attached throughout; cancellation may trigger quota refund (OPQ-4).

### 4.3 Settlement
`trip_completed → settlement_pending → {sponsor_reconciliation + reimbursement_batch} → statement_published → settled`; benefit/issuer references required at every transition (FR-STL-2).

## 5. Cross-surface flow (end to end)

```
卡友 (S1/S2)
  └─ partner_ingress ─ eligibility_adapter ─ quota check
        └─ Booking(credit_card_airport_transfer) ─ dispatch_engine (S4 ops)
              └─ Trip completed ─ settlement_engine (card-benefit channel)
                    ├─ driver payout (platform engine, whole)
                    ├─ reimbursement_batch (platform-funded portion)
                    └─ sponsor reconciliation ─► Statement (S3 bank_finance)
銀行內部 (S3): bank_ops_viewer ─ read booking+dispatch+contract ; bank_finance ─ statement ; bank_program_admin ─ program+quota usage
```

## 6. Existing vs gap (analysis summary)

| Capability | State | Where |
|---|---|---|
| Eligibility verify (inline + reference token) | **[built]** | `tenant-partner/*-eligibility.adapter.ts` |
| Quota model + impacts | **[built]** | contracts (`quota*`) |
| Airport booking subtype + form | **[built]** | `partner-booking-web`, `partner-booking-form` |
| Issuer-branded customer flow (S1) | **[built]**, not deployed | `card` program theme/screens |
| Online-banking embed (S2) | **[gap]** | new host-resolved/webview entry |
| Dispatch + completion | **[built]** | ops-console / dispatch engine |
| Settlement (card-benefit channel) | **[built]** | `settlement-matrix.ts` |
| Bank booking lookup w/ program dimension (S3) | **[gap]** | tenant-console bookings are corporate-shaped |
| Bank contract/SLA posture (S3) | **[gap]** | no bank-facing contract surface |
| Bank settlement statement content (S3) | **[partial]** | `/invoices` exists; lacks per-trip benefit/subsidy itemisation |
| Program usage / quota dashboard (S3) | **[gap]** | not surfaced |

## 7. Risks & constraints

- **R1 Persona mismatch:** `tenant-console` design canvas is corporate-commute (YAMATO, cost-centres, employees). Reusing it for an issuer tenant requires a program-aware extension, not a re-skin (see screen-requirements).
- **R2 PII surface:** bank-facing lists/statements must mask cardholder + card references; only hashed/derived references cross the boundary.
- **R3 Reference integrity:** issuer/benefit/eligibility references must survive dispatch → settlement → statement; breaking the chain breaks reconciliation (FR-STL-2).
- **R4 Identity for S2:** banking-app embed must not leak management-only resources; reference-token flow preferred.
- **R5 Design dependency:** the S3 gaps (contract page, program dimension, statement itemisation, quota dashboard) need a **design-team canvas** before implementation — per the UI design contract, workers must not invent these screens.
