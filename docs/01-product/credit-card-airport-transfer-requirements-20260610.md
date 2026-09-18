# Credit-Card Airport Transfer — Functional Requirements

**Date:** 2026-06-10
**Feature:** 信用卡卡友機場接送（card-benefit airport transfer）
**Business dispatch subtype:** `credit_card_airport_transfer`
**Author lane:** Claude
**Status:** Requirements baseline. **No visual decisions in this document.**
**Companion docs:**

- System Analysis — [`../02-architecture/credit-card-airport-transfer-sa-20260610.md`](../02-architecture/credit-card-airport-transfer-sa-20260610.md)
- System Design — [`../02-architecture/credit-card-airport-transfer-sd-20260610.md`](../02-architecture/credit-card-airport-transfer-sd-20260610.md)
- Screen Requirements (design hand-off) — [`../05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`](../05-ui/credit-card-airport-transfer-screen-requirements-20260610.md)

---

## 0. How to read this

This document captures **what** the credit-card airport-transfer feature must do, across all four surfaces, at the level needed to drive SA/SD and a design hand-off. It is grounded in the **existing implementation** (`businessDispatchSubtype: "credit_card_airport_transfer"`, the `partner-booking-web` `card` program, the `tenant-partner` eligibility adapters, and the `billing-settlement` settlement matrix). Where a requirement is already satisfied it is marked **[built]**; where it is partial or absent it is marked **[gap]**.

## 1. Scope and intent

A bank (card issuer, e.g. 中信銀行 / CTBC) offers its cardholders a benefit: a number of **free or subsidised airport transfer rides per period** (禮遇趟次). DRTS provides the booking, dispatch, fulfilment, and settlement rails. The bank's own back-office staff need visibility into who booked, whether the car was dispatched and completed, the contract/SLA posture, and the periodic reconciliation statement the bank settles against.

### 1.1 The four surfaces

| #   | Surface                             | Audience                                 | Repo home                                                                       | Status                                   |
| --- | ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| S1  | Cardholder booking website          | 卡友 (external consumer)                 | `apps/partner-booking-web` `card` program                                       | **[built]** flow, **[gap]** not deployed |
| S2  | Online-banking app embedded booking | 卡友 inside the bank's app (webview/SDK) | new embed of S1 / host-resolved entry                                           | **[gap]**                                |
| S3  | Bank / issuer back-office console   | 銀行內部人員                             | **`apps/bank-console-web` (NEW app)** — bank is an issuer _tenant_ in data only | **[new]**                                |
| S4  | Dispatch / fulfilment / settlement  | DRTS ops + platform                      | `apps/ops-console-web`, `billing-settlement`                                    | **[built]** mostly                       |

> **S3 is a SEPARATE new app, not `tenant-console-web`** (decision revised 2026-06-10 — see SD §1 D1). `tenant-console-web` is the _corporate-commute_ tenant back-office (programType `enterprise_dispatch`); `SD-DP-20260508-004` forbids non-corporate flows from reusing it. The bank rides the same issuer-tenant data/billing plane but gets its own card-benefit UI. Adding this app requires cross-app adjustments in Platform Admin / Ops / Fleet Partner / contracts / deploy — see SD §6.5.

### 1.2 Out of scope

- Card-issuance, the bank's own KYC, and the bank's reward-points ledger (the bank owns these; DRTS consumes an eligibility decision only).
- Driver supply / fleet management (covered by `fleet-partner` surfaces).
- Non-card programs (`insurance_*`, `travel_agency_transfer`) — siblings that reuse the same rails; out of scope here except where shared.

## 2. Personas

| Code                 | Persona        | Surface | Goal                                                                            |
| -------------------- | -------------- | ------- | ------------------------------------------------------------------------------- |
| `cardholder`         | 卡友（持卡人） | S1, S2  | Book a benefit airport transfer; see quota left; track the ride; get a receipt  |
| `bank_program_admin` | 銀行方案管理員 | S3      | Configure the program, see usage, manage eligibility policy                     |
| `bank_ops_viewer`    | 銀行客服/營運  | S3      | Look up which cardholder booked, dispatch + completion status, contract posture |
| `bank_finance`       | 銀行財務       | S3      | Pull the periodic settlement statement; reconcile and settle with DRTS          |
| `drts_dispatcher`    | DRTS 派遣      | S4      | Dispatch/assign/redispatch the airport ride                                     |
| `drts_settlement`    | DRTS 結算      | S4      | Close settlement; produce sponsor reconciliation + reimbursement batches        |

## 3. Functional requirements

### 3.1 Eligibility & quota (卡友資格與趟次)

- **FR-ELG-1 [built]** The system MUST verify cardholder eligibility before a benefit booking is accepted, via a pluggable adapter (`bank-card-inline-eligibility` for inline card verification, `reference-token-eligibility` for an issuer-issued reference token).
- **FR-ELG-2 [built]** An eligibility decision MUST carry: `verificationStatus`, `decisionSource`, `verificationReasonCode`, `cardProgramCode`, `benefitReference`, `issuerAuthorizationRef`, and (for reference flows) a `referenceTokenHash` — and these MUST survive end-to-end into settlement and reporting.
- **FR-ELG-3 [built]** The system MUST track a **quota** per cardholder/program/period (禮遇趟次 remaining) including snapshot versioning and quota impacts when a booking consumes/refunds a trip.
- **FR-ELG-4** Negative eligibility outcomes MUST be explicit and PII-safe: ineligible (program/zone), inline-required (more info needed), blocked, quota-exhausted, manual-review. Each maps to a named cardholder-facing state.
- **FR-ELG-5 [gap]** `bank_program_admin` MUST be able to view the program's eligibility policy and quota rules from S3 (read at minimum; edit if policy allows).

### 3.2 Booking (預約)

- **FR-BKG-1 [built]** A cardholder MUST be able to create a `credit_card_airport_transfer` booking capturing at least: `passengerName`, `flightNo`, `terminal`, `direction` (pickup ⇄ dropoff), pickup/drop, and time window.
- **FR-BKG-2** `direction` MUST distinguish **去程 (home → airport / dropoff)** and **回程 (airport → home / pickup)**; flight number + terminal are required for the airport leg.
- **FR-BKG-3** The booking MUST be branded to the issuer (中信/CTBC) per the `card` program theme; the SAME route set serves other programs by switching theme only.
- **FR-BKG-4** Every reachable rejection MUST have its own named state (eligibility, no-supply, degraded, manual-review) — no silent failures.
- **FR-BKG-5 [gap S2]** The booking flow MUST be embeddable inside the bank's online-banking app (host-resolved entry / webview), reusing S1 with the bank session as the identity source.

### 3.3 Dispatch & fulfilment (派車與履約)

- **FR-DSP-1 [built]** An accepted booking MUST enter the platform dispatch lifecycle: created → approval (if required) → driver assignment → en route → completed / cancelled.
- **FR-DSP-2** Airport context (flight, terminal, direction) MUST be visible to the dispatcher and driver; flight-delay tolerance for airport pickups SHOULD be representable.
- **FR-DSP-3 [gap S3]** `bank_ops_viewer` MUST see, per booking, the dispatch + completion status and the linked fulfilment/contract posture, **without** mutating the dispatch (read-only cross-surface link to ops).

### 3.4 Contract & SLA posture (合約與履約狀況)

- **FR-CON-1 [gap]** The bank MUST be able to see the **service contract status** between the issuer program and DRTS: contract/programme term, SLA targets (pickup punctuality, completion rate), and current-period attainment.
- **FR-CON-2 [gap]** Per-period fulfilment posture (trips delivered vs SLA, exceptions) MUST roll up to a bank-facing contract view. (Backend `fulfilment` modelling exists; a bank-facing surface does not.)

### 3.5 Settlement & reconciliation (結算與對帳)

- **FR-STL-1 [built]** Settlement MUST follow the card-benefit channel of the settlement matrix: payer = **partner program / card-benefit sponsor (issuer)**, driver payout via the platform settlement engine, with **platform-funded discounts creating reimbursement batches** so driver payout stays whole while sponsor settlement closes later.
- **FR-STL-2 [built]** Reconciliation path MUST be **partner revenue summary + benefit-reference audit**; issuer/eligibility/benefit references MUST be present on every settled trip.
- **FR-STL-3 [gap S3]** `bank_finance` MUST be able to pull a **periodic settlement statement (對帳單)** that itemises, for the period: trips delivered, per-trip fare, subsidised vs paid split, benefit-reference, cardholder reference (PII-masked), totals, status (published/paid/due), and a downloadable signed artifact.
- **FR-STL-4 [gap S3]** The statement MUST be reconcilable against the bank's own records (line-item benefit references), and its money direction MUST be **issuer-pays-DRTS** (sponsor funds the benefit subsidy).

### 3.6 Program management & usage (方案管理與用量)

- **FR-PRG-1 [built]** A bank program MUST be modelled with `programId`/`programCode`/`programType`, issuer, coverage, benefit and quota (`tenant/service-programs`).
- **FR-PRG-2 [gap S3]** `bank_program_admin` MUST have a usage dashboard: cardholders served, 禮遇趟次 consumed vs quota, by period — at program level.

## 4. Non-functional requirements

- **NFR-1 PII** Cardholder identity, card number, recording/benefit references MUST be masked in any bank-facing list, export, or statement per the platform masking rules (`maskOpaqueToken`); raw references derive from hashes.
- **NFR-2 Auth/plane separation** S3 is a tenant-plane surface scoped to the issuer tenant; S1/S2 are constrained partner-ingress; S4 is control-plane. No surface may read another plane's management-only resources.
- **NFR-3 Audit** Eligibility decisions, dispatch actions, and settlement closes MUST be auditable end-to-end with issuer/benefit references intact.
- **NFR-4 i18n** All cardholder- and bank-facing copy MUST be zh-TW primary / en secondary via the central `translations.ts` `t()`; no inline locale ternaries.
- **NFR-5 Theming** All UI colours/typography MUST come from `@drts/ui-tokens` realm tokens or the per-program brand theme (issuer brand); no hand-picked raw hex.

## 5. Acceptance (feature-level)

1. A cardholder books a 去程 + 回程 airport transfer with flight/terminal, sees quota decremented, tracks the ride to completion, and gets a receipt. **[S1/S2]**
2. A `bank_ops_viewer` looks up that cardholder's booking and sees dispatch + completion + contract posture, read-only. **[S3]**
3. A `bank_finance` pulls the period statement, sees the trip itemised with benefit reference + subsidised/paid split, and downloads the signed artifact. **[S3]**
4. Settlement closes: driver payout whole, sponsor (issuer) reconciliation produced with benefit references intact. **[S4]**
5. `python3 tools/ci/check_ui_realm_tokens.py` passes for every touched web app; all new copy is bilingual via `t()`.

## 6. Open product questions

- OPQ-1 **[RESOLVED 2026-06-10]**: The bank back-office is a **separate new app `apps/bank-console-web`** (bank = issuer tenant in the data/billing layer only), NOT a reuse of `tenant-console-web`. See SD §1 D1 and `SD-DP-20260508-004`.
- OPQ-2: For S2 (online-banking app), is identity passed via issuer reference token (preferred, `reference-token-eligibility`) or inline card verification (`bank-card-inline-eligibility`)?
- OPQ-3: Statement cadence and money direction confirmation (monthly issuer-pays-DRTS assumed).
- OPQ-4: Quota refund policy on cancellation (does a cancelled 趟次 return to quota, and within what window?).
