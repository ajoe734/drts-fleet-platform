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
                            │ S3 bank-console-web (NEW)  │  (issuer/benefit back-office; bank = issuer tenant in data only)
                            └────────────────────────────┘
```

**Decision D1 (REVISED 2026-06-10) — separate `bank-console-web` app; bank is an issuer tenant only at the data/billing layer.** The bank back-office (S3) is a **new, dedicated app** (`apps/bank-console-web`), NOT a reuse of `tenant-console-web`. Two layers, kept distinct:

- **Data / billing layer:** the bank IS an *issuer tenant* — settlement, statements, audit, users ride the existing `tenant/*` plane and BFF. ✓
- **UI / back-office layer:** the bank does NOT wear the corporate-commute skin (YAMATO / 成本中心 / 員工乘客). It gets its own card/卡友/機場/quota surface.

Rationale (corrected): `tenant-console-web`'s program model is hard-typed to `programType: "enterprise_dispatch"`, and **`SD-DP-20260508-004` explicitly forbids non-corporate flows from reusing the full tenant console** ("must live as a constrained sub-surface with a separate route group and auth scope, not an accidental reuse"). The card-benefit business diverges from corporate commute on subject (cardholder vs employee), money (issuer-sponsored vs corporate-paid), identity (card eligibility vs roster), and persona — enough to warrant a separate app, which also generalises to future issuers/programs (insurance, travel). Shared logic stays in `packages/*` (api-client, contracts, ui-web, ui-tokens), not a shared app shell. (Supersedes the earlier "reuse tenant-console" draft; resolves OPQ-1.)

## 2. Surface design

### S1 Cardholder booking web — **[built]**
`apps/partner-booking-web`, `card` program. Fixed 7-screen funnel (entry → eligibility → review → success → tracking → error → manual-review) themed per issuer (`lib/program-theme.ts` `card` = CTBC blue/gold). Airport fields via `partner-booking-form` (`flightNo`, `terminal`, `direction`). **Action:** deploy it (mirror the `tenant-console`/FLP Dockerfile + deploy workflow). No redesign.

### S2 Online-banking app embed — **[new]**
Reuse S1 as a host-resolved entry rendered in the bank app webview. Identity via issuer **reference token** (`reference-token-eligibility`), not inline card capture (NFR-2, R4). Strip the standalone bootstrap/login; accept a signed issuer session → `VerifyPartnerEligibilityCommand`. No new screens beyond an embed wrapper + entry resolution.

### S3 Bank / issuer back-office console — **[new app: `apps/bank-console-web`]**
A dedicated issuer/benefit back-office, NOT `tenant-console-web`. It consumes the same issuer-tenant-scoped `tenant/*` plane (settlement, statements, audit, users) via the shared `@drts/api-client`, but presents a card-benefit IA (卡友 / 機場 / 趟次配額 / 合約 / 對帳), never the corporate-commute IA. Screens per the design-team canvas (R5). Scaffolding mirrors the FLP/tenant-console app (Dockerfile + deploy workflow + `@drts/ui-web`/`@drts/ui-tokens` `tenant` realm chrome + issuer brand).

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
| Scaffold `apps/bank-console-web` (app + Dockerfile + deploy) | new | S3 | mirror FLP/tenant-console PR #602 |
| Order list + program dimension (bookings) | new (in bank-console) | S3/API | §3.2 |
| `GET /api/tenant/contracts` + UI | new | S3/API | fulfilment model; **design canvas (R5)** |
| `GET /api/tenant/settlement-statements` + UI | new | S3/API | billing-settlement; **design canvas (R5)** |
| `GET /api/tenant/program-usage` + dashboard | new | S3/API | quota model; **design canvas (R5)** |
| Airport context on dispatch detail | extend | S4 | order fields (likely present) |
| Cross-app impact (see §6.5) | extend | Platform Admin / Ops / Fleet Partner / contracts / deploy | — |

**Sequencing.** API-first for the three new `tenant/*` endpoints (they have backing models). In parallel, scaffold `bank-console-web` (app shell + deploy) and the cross-app wiring (§6.5). UI screens wait on the **design-team canvas** (contract, settlement-statement, program/quota, bookings). The S3 UI is a *new app*, so even the bookings list needs canvas — there is no existing tenant-console canvas to extend.

## 6.5 Cross-app impact (the other three live apps must adjust)

Adding `bank-console-web` is not isolated. The existing apps need corresponding changes:

### Contracts / shared (do first)
- **`CrossAppSurface` enum + deep-link registry** ([extend], `packages/contracts`): add a `bank_console` (issuer) surface so other apps can produce access-gated deep links to it (today the enum is `platform_admin | ops_console | tenant_console | driver_app | partner_booking`). NB the `bank_card_inline` / `issuer_*` values already in contracts are **eligibility decision-sources**, not UI surfaces — distinct.
- **`programType`** ([extend]): add a card-benefit value (e.g. `card_benefit_airport`) alongside `enterprise_dispatch`; the tenant program model is currently single-valued.

### Platform Admin (`platform-admin-web`) — issuer onboarding & settlement oversight
- Onboard the **bank as an issuer tenant** + register the **card-benefit program** (reuse `partners`/`service-products`); wire the **eligibility integration** (`adapter-registry`: bank-card-inline / reference-token); oversee **sponsor reimbursement batches** (`payments/reimbursements`). Mostly existing surfaces, extended for `programType: card_benefit_airport`.
- Add a cross-app link to the issuer's `bank-console-web`.

### Ops Console (`ops-console-web`) — dispatch & contract
- Surface **airport context** (flight / terminal / direction) + the `credit_card_airport_transfer` subtype on the dispatch board/detail. (Partly present — `dispatch/[dispatchId]`, `dispatch-workflow`, `forwarded-order-board` already reference airport.)
- The issuer **service-contract/SLA** in ops `/contracts/[contractId]` is the authority that the bank-console contract view reads from.
- Provide the access-gated cross-link target so `bank_ops_viewer` deep-links resolve (read-only).

### Fleet Partner Portal (`fleet-partner-portal-web`) — sponsor-funded attribution
- The fulfilling fleet's **trips / revenue / statements must attribute sponsor-funded (card-benefit) trips** and the reimbursement-batch portion correctly. Currently weak (~2 `subsid` references) — **[gap]**: ensure driver/fleet payout stays whole while sponsor settlement closes later (per the settlement-matrix card-benefit channel).

### Deploy / infra (`deploy-dev.yml` + repo vars)
- New app needs: a standalone deploy workflow (like `deploy-tenant-console.yml`), repo vars `DEV_GCP_BANK_CONSOLE_SERVICE` + `DEV_BANK_CONSOLE_ORIGIN`, a build/deploy job, and registration in the **cross-app origin maps** of platform-admin / ops / fleet-partner / tenant-console so deep-links resolve. (The canonical `deploy-dev.yml` wires each app via `DEV_GCP_<APP>_SERVICE` + `DEV_<APP>_ORIGIN` — mirror that pattern.)

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
