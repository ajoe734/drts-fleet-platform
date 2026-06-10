# Credit-Card Airport Transfer — System Design (SD)

**Date:** 2026-06-10
**Feature:** 信用卡卡友機場接送 · `businessDispatchSubtype: credit_card_airport_transfer`
**Author lane:** Claude
**Baseline:** `origin/dev`
**Predecessors:** [Requirements](../01-product/credit-card-airport-transfer-requirements-20260610.md) · [SA](./credit-card-airport-transfer-sa-20260610.md)

> Grounded in the live modules: `apps/api/src/modules/tenant-partner/*`, `apps/api/src/modules/billing-settlement/*`, `apps/api/src/modules/fleet-partner/*`, `tenant/*` endpoints, `packages/contracts`, `apps/partner-booking-web`, `apps/tenant-console-web`. Each design element is labelled **[built]** (exists, reuse), **[extend]** (exists, needs additive change), or **[new]**.

---

## 1. Architecture & topology

Phase-1 keeps independent deployments and plane separation (per `cross-app-navigation-and-shell-topology` and `SD-DP-20260429-001`). The feature spans three planes:

```
 ┌── partner-ingress plane ──────────────┐    ┌── control plane ───────────┐
 │ S1 partner-booking-web (card program) │    │ S4 ops-console-web         │
 │ S2 online-banking embed (host entry)  │    │    dispatch + settlement   │
 └──────────────┬────────────────────────┘    └─────────────┬──────────────┘
                │  /api/partner/*  (eligibility, booking)    │ /api/(ops|admin)/*
                ▼                                            ▼
        ┌─────────────────────── apps/api (BFF / authority) ───────────────────────┐
        │ tenant-partner (eligibility adapters, approval, ingress)                  │
        │ dispatch / order / trip                                                    │
        │ billing-settlement (settlement-matrix: card-benefit channel)               │
        │ tenant (service-programs, orders, trips, invoices/statements)              │
        └───────────────────────────────┬───────────────────────────────────────────┘
                                         │ /api/tenant/*  (issuer-tenant scoped)
                                         ▼
                            ┌── tenant business plane ──┐
                            │ S3 tenant-console-web      │  (bank back-office; issuer tenant)
                            └────────────────────────────┘
```

**Decision D1 — bank-as-issuer-tenant.** The bank back-office (S3) is modelled as an **issuer tenant** in `tenant-console-web`, extended with a program-aware view layer, rather than a brand-new app. Rationale: the tenant plane, auth scope, BFF, and `tenant/*` endpoints already exist; only the issuer/program dimension and a contract surface are missing. (Resolves OPQ-1.)

## 2. Surface design

### S1 Cardholder booking web — **[built]**
`apps/partner-booking-web`, `card` program. Fixed 7-screen funnel (entry → eligibility → review → success → tracking → error → manual-review) themed per issuer (`lib/program-theme.ts` `card` = CTBC blue/gold). Airport fields via `partner-booking-form` (`flightNo`, `terminal`, `direction`). **Action:** deploy it (mirror the `tenant-console`/FLP Dockerfile + deploy workflow). No redesign.

### S2 Online-banking app embed — **[new]**
Reuse S1 as a host-resolved entry rendered in the bank app webview. Identity via issuer **reference token** (`reference-token-eligibility`), not inline card capture (NFR-2, R4). Strip the standalone bootstrap/login; accept a signed issuer session → `VerifyPartnerEligibilityCommand`. No new screens beyond an embed wrapper + entry resolution.

### S3 Bank back-office console — **[extend]**
`apps/tenant-console-web` for the issuer tenant. Reuse: `bookings`(+detail), `invoices`(對帳單), `reports`, `rules`(審批與配額/quota), `audit`, `users`. **Add a program-aware layer** (see §3, §4). Visual changes require a design-team canvas first (R5).

### S4 Dispatch & settlement — **[built]**
`ops-console-web` dispatch + `billing-settlement` settlement engine. Add airport context surfacing to dispatch detail if absent (flight/terminal/direction) — **[extend]**.

## 3. API design

### 3.1 Existing endpoints to reuse — **[built]**

| Endpoint | Use |
|---|---|
| `POST /api/partner/eligibility` (verify) | S1/S2 eligibility (adapters) |
| `POST /api/partner/bookings` | S1/S2 booking create |
| `GET /api/tenant/service-programs`, `/:programId` | S3 program + quota |
| `GET /api/tenant/orders`, `/:orderId` | S3 booking lookup + detail |
| `GET /api/tenant/trips` | S3 trip/fulfilment |
| `GET /api/tenant/invoices` (period statement) | S3 statement base |
| `GET /api/partner/entries` | ingress entry resolution |

### 3.2 New / extended endpoints

- **[extend] `GET /api/tenant/orders`** — accept `programCode` / `businessDispatchSubtype` / `cardholderRef` filters and return the airport/program dimension (flight, terminal, direction, benefitReference[masked], programCode) in the list projection. (Today's projection is corporate-shaped.)
- **[new] `GET /api/tenant/contracts` (+ `/:contractId`)** — issuer-tenant service-contract & SLA posture: term, SLA targets (pickup punctuality, completion rate), current-period attainment, exceptions. Backed by the existing fulfilment model.
- **[new] `GET /api/tenant/settlement-statements` (+ `/:period`)** — period settlement statement itemising trips: per-trip fare, subsidised-vs-paid split, `benefitReference`, masked cardholder ref, totals, status, signed-artifact link. Derived from `billing-settlement` + the card-benefit settlement-matrix channel. (Distinct from generic `/invoices`.)
- **[new] `GET /api/tenant/program-usage`** — program-level usage: cardholders served, 趟次 consumed vs quota, by period.

All `tenant/*` endpoints are issuer-tenant scoped; PII fields returned masked (`maskOpaqueToken`), raw refs derived from hashes (NFR-1).

## 4. Data model

### 4.1 Reuse — **[built]**
- `businessDispatchSubtype: credit_card_airport_transfer` (enum already includes `airport_transfer`, `credit_card_airport_transfer`, `travel_agency_transfer`, `insurance_*`).
- `ServiceProgram { programId, programCode, programType, issuer, coverage, benefit, quota }`.
- `EligibilityDecision { verificationStatus, decisionSource, verificationReasonCode, cardProgramCode, benefitReference, issuerAuthorizationRef, referenceTokenHash, eligibilityVerificationId }`.
- `SettlementMatrixRecord` card-benefit channel: `payerType = partner program / card-benefit sponsor`, `sponsorType = partner bank / issuer benefit program`, reimbursement-batch rule, `reconciliationPath = partner revenue summary + benefit reference audit`.

### 4.2 New / extended contracts
- **[extend] Order list projection** — add `programCode`, `businessDispatchSubtype`, `flightNo`, `terminal`, `direction`, `benefitReferenceMasked`, `cardholderRefMasked`.
- **[new] `IssuerContractStatusRecord`** — `contractId`, `programCode`, `term`, `slaTargets[]`, `periodAttainment`, `exceptions[]`, `status`.
- **[new] `SettlementStatementRecord`** — `period`, `lines[] { tripId, fare, subsidisedAmount, paidAmount, benefitReference, cardholderRefMasked }`, `totals`, `status (published|paid|due)`, `artifactRef`, `direction: issuer_pays_drts`.
- **[new] `ProgramUsageRecord`** — `programCode`, `period`, `cardholdersServed`, `tripsConsumed`, `quotaTotal`, `quotaRemaining`.

> Migration discipline (per `phase1_svc_fleet_tenantops_wave` gotchas): new contract types must not duplicate existing ones; pick a non-colliding migration version; `exactOptionalPropertyTypes` forbids assigning `undefined` (use conditional spread); widen narrow literal unions consistently if `businessDispatchSubtype` consumers narrow.

## 5. Sequence — book → dispatch → settle → reconcile

```
cardholder → S1/S2: open issuer entry
  → POST /api/partner/eligibility  (adapter: inline | reference-token)
       ↳ EligibilityDecision{eligible, benefitReference, issuerAuthorizationRef, quota✓}
  → POST /api/partner/bookings {subtype: credit_card_airport_transfer, flightNo, terminal, direction}
       ↳ Order created → dispatch_engine
  → ops S4: driver_assigned → en_route → completed
  → settlement_engine: card-benefit channel
       ↳ driver payout (whole) + reimbursement_batch(platform-funded) + sponsor reconciliation
  → S3 bank_finance: GET /api/tenant/settlement-statements/:period
  → S3 bank_ops_viewer: GET /api/tenant/orders?cardholderRef=… (+ contract status)
```

## 6. Build plan (what each surface needs)

| Item | Type | Surface | Depends on |
|---|---|---|---|
| Deploy `partner-booking-web` to dev | infra | S1 | Dockerfile + deploy workflow (mirror tenant-console PR #602) |
| Online-banking embed wrapper + entry | new | S2 | reference-token eligibility; OPQ-2 |
| Order list program filters + projection | extend | S3/API | §3.2 |
| `GET /api/tenant/contracts` + UI | new | S3/API | fulfilment model; **design canvas (R5)** |
| `GET /api/tenant/settlement-statements` + UI | new | S3/API | billing-settlement; **design canvas (R5)** |
| `GET /api/tenant/program-usage` + dashboard | new | S3/API | quota model; **design canvas (R5)** |
| Airport context on dispatch detail | extend | S4 | order fields (likely present) |

**Sequencing.** API-first for the three new `tenant/*` endpoints (they have backing models), then UI once the **design-team canvas** lands for the contract page, settlement-statement page, and program/quota dashboard. The program filters on the existing bookings list can ship ahead (additive columns within the existing canvas).

## 7. Non-functional design

- **Auth:** S3 issuer-tenant scope; S1/S2 partner-ingress with signed issuer session for S2; S4 control plane. Enforce at the BFF, never trust client surface.
- **PII:** mask at the API projection layer; bank-facing never receives raw cardholder/card refs (NFR-1).
- **Audit:** eligibility, dispatch, settlement-close emit audit with issuer/benefit refs (`AuditNotificationService` — use `.find/.some`, never `[0]`, per the self-audit rule).
- **i18n/theme:** zh-TW primary via `t()`; issuer brand theme for S1/S2, `tenant` realm tokens for S3 chrome (NFR-4/5); `scripts/check_ui_realm_tokens.py` must pass.

## 8. Rollout

1. Deploy S1 (`partner-booking-web`) to dev → cardholder flow demoable.
2. Ship S3 order-list program filters/columns (additive, within existing canvas).
3. API-first: `tenant/contracts`, `tenant/settlement-statements`, `tenant/program-usage`.
4. Design-team canvas for the three new S3 screens → implement against it.
5. S2 banking-app embed (after OPQ-2 decision).

## 9. Open design questions

- ODQ-1 (OPQ-1 resolved → D1): confirm issuer-as-tenant vs separate bank console with the chair.
- ODQ-2: money direction & statement cadence (assumed monthly issuer-pays-DRTS) — confirm with finance.
- ODQ-3: quota refund window on cancellation (OPQ-4) — affects `quotaImpacts` reversal.
- ODQ-4: S2 identity — reference token (preferred) vs inline.
