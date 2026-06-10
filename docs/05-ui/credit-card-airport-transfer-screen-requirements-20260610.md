# Credit-Card Airport Transfer — Screen Requirements (Design Hand-off)

**Date:** 2026-06-10
**Feature:** 信用卡卡友機場接送
**Recipient team:** 視覺設計團隊（含 UX）
**Status:** Hand-off input. **No visual decisions in this document.**
**Author lane:** Claude
**Authority for behaviour/data/API:** [Requirements](../01-product/credit-card-airport-transfer-requirements-20260610.md) · [SA](../02-architecture/credit-card-airport-transfer-sa-20260610.md) · [SD](../02-architecture/credit-card-airport-transfer-sd-20260610.md)

> Same shape as the ops-console / platform-admin / tenant-console hand-off packets: §2 personas, §3 context, §4 sitemap, §5 per-page functional briefs, §6 API mapping, §7 visual open questions. **No visual decisions.**

---

## 1. Why this packet exists

The existing **`drts-design-canvas/Tenant Console.html`** was drawn for a **corporate-commute tenant** (fixture: YAMATO 大和商務集團; concepts: 成本中心, 員工乘客, cost-centre approval rules). The bank back-office for card-benefit airport transfer reuses the same skeleton but needs a **program-aware (issuer / 卡友 / 機場)** dimension and **two screens the current canvas does not contain at all** (contract status, settlement statement detail). This packet specifies those gaps for design.

The **customer-facing** surfaces (S1 cardholder web, S2 banking-app embed) already have a canvas (`Partner Booking Web.html` / `pb-screens.jsx`, `card` program theme = CTBC blue/gold) — they need **no new design**, only deployment/embed. They are listed in §4 for completeness, not for design work.

## 2. Personas (design-relevant)

| Code | Persona | Reads | Acts |
|---|---|---|---|
| `bank_program_admin` | 銀行方案管理員 | program config, quota usage | configure/view policy |
| `bank_ops_viewer` | 銀行客服/營運 | booking + dispatch + contract (read-only) | look up, no mutation |
| `bank_finance` | 銀行財務 | settlement statement | reconcile, download |

(Cardholder personas for S1/S2 are covered by the existing partner-booking canvas.)

## 3. Operating context

- S3 is a **tenant-plane** surface scoped to the **issuer tenant** (the bank). It is the same shell as `tenant-console-web` but the data dimension is card-benefit, not corporate commute.
- All cardholder/card references are **PII-masked** in lists, detail, exports, and statements. Designs must assume masked tokens (e.g. `**** 4821`), never raw card numbers.
- zh-TW primary / en secondary. Issuer brand (中信/CTBC) appears as tenant identity; **chrome uses the `tenant` realm tokens** (teal) per `@drts/ui-tokens` — see §7.

## 4. Sitemap

### 4.1 New design needed (S3 — bank back-office) — **design these**
| Screen | Route (proposed) | New? |
|---|---|---|
| Contract & SLA status | `/contracts` (+ `/[contractId]`) | **NEW screen — not in current canvas** |
| Settlement statement detail (對帳單明細) | `/statements/[period]` (or `/invoices/[period]` detail) | **NEW detail — list exists as 對帳單/invoices** |
| Program & quota usage dashboard | `/programs` or home widget | **NEW** |
| Bookings list — program dimension | `/bookings` (extend) | **EXTEND existing canvas** |
| Booking detail — airport/benefit panel | `/bookings/[bookingId]` (extend) | **EXTEND** |

### 4.2 No new design (reference only)
| Screen | Where | Status |
|---|---|---|
| Cardholder booking funnel (entry→eligibility→review→success→tracking→error→manual-review) | `partner-booking-web` `card` program | has canvas (`pb-screens.jsx`) |
| 對帳單 list, 報表, 審批與配額(quota rules), 稽核, 人員與角色 | `tenant-console` | has canvas (`Tenant Console.html`) |

## 5. Per-screen functional briefs (design these)

### 5.1 Bookings list — program dimension (EXTEND)
- **Purpose:** `bank_ops_viewer` sees which cardholder booked, at a glance, as **card-airport** rides (not generic corporate bookings).
- **Must surface (data):** order id, **cardholder ref (masked)**, **program (中信機場 / programCode)**, **direction (去程/回程)**, **flight no. + terminal**, pickup→drop, time window, **dispatch state** (assigned / en route / completed / cancelled), benefit-reference (masked).
- **Filters:** by program, by direction, by state, by period, by cardholder ref.
- **Replaces (semantics):** the corporate `成本中心 (CC)` column has no meaning here — design the issuer/program columns in its place.
- **Actions:** open detail; export (masked). Read-only — no dispatch mutation from the bank side.

### 5.2 Booking detail — airport & benefit panel (EXTEND)
- **Purpose:** read-only fulfilment view of one ride.
- **Must surface:** the dispatch lifecycle timeline (created → assigned → en route → completed/cancelled), **airport block** (flight, terminal, direction), **benefit block** (program, benefitReference masked, issuer authorisation ref masked, quota impact), and a **read-only cross-link to ops detail** (access-gated; show disabled if forbidden).
- **No mutation** of dispatch from this surface.

### 5.3 Contract & SLA status (NEW)
- **Purpose:** `bank_ops_viewer` / `bank_program_admin` see the service-contract posture between the program and DRTS.
- **Must surface:** contract/programme term, **SLA targets** (e.g. pickup punctuality %, completion rate %), **current-period attainment** vs each target, exception list (missed SLA, disputed trips), contract status.
- **States:** healthy / at-risk / breached per SLA; empty/not-provisioned; permission-denied; downstream-unavailable.
- **Note for design:** this screen has **no precedent** in the current tenant canvas; ops-console has a `/contracts` screen whose IA may inform (but must not be copied as-is — different persona/plane).

### 5.4 Settlement statement detail (NEW detail of an existing list)
- **Purpose:** `bank_finance` reconciles and settles with DRTS for a period.
- **Must surface (line-item):** per trip — trip id, date, **fare**, **subsidised vs paid split**, **benefit reference (masked)**, **cardholder ref (masked)**; period **totals**; **status** (published / paid / due); **money direction = issuer-pays-DRTS**; **download signed artifact**.
- **Distinct from** the existing 對帳單/invoices *list* (which shows period-level invoices) — this is the **per-trip reconciliation detail** behind a period.
- **States:** pending (period not published), ready, artifact-expired (re-issue), line-item-disputed (flag to DRTS).

### 5.5 Program & quota usage dashboard (NEW)
- **Purpose:** `bank_program_admin` sees benefit consumption.
- **Must surface:** per program/period — cardholders served, **趟次 consumed vs quota** (禮遇趟次 remaining), trend, top exceptions. Read; edit policy only if permitted.

## 6. API mapping (behaviour authority = SD §3)

| Screen | Endpoint(s) |
|---|---|
| Bookings list (program) | `GET /api/tenant/orders?programCode&direction&state&period&cardholderRef` (extended projection) |
| Booking detail | `GET /api/tenant/orders/:orderId` (+ airport/benefit fields) |
| Contract & SLA | `GET /api/tenant/contracts` (+ `/:contractId`) — **new** |
| Settlement statement detail | `GET /api/tenant/settlement-statements/:period` — **new** |
| Program & quota usage | `GET /api/tenant/program-usage` — **new** |

(Customer S1/S2: `POST /api/partner/eligibility`, `POST /api/partner/bookings` — existing.)

## 7. Purely-visual open questions (for design)

- VQ-1 **Realm vs issuer brand:** S3 chrome should use the `tenant` realm tokens (teal `#0F766E`) from `@drts/ui-tokens`; the issuer (中信/CTBC blue-gold) appears as tenant identity/branding within that chrome. Confirm the balance — do not hand-pick a new palette (a raw-hex palette fails `scripts/check_ui_realm_tokens.py`).
- VQ-2 How to represent **direction (去程/回程)** and **flight/terminal** compactly in a dense list row.
- VQ-3 SLA attainment visualisation (gauge vs bar vs delta-to-target) for the contract screen.
- VQ-4 Settlement statement: per-trip table density + masked-reference treatment + subsidised/paid split visual.
- VQ-5 Quota: remaining-趟次 representation (counter, ring, progress) at program and cardholder level.

## 8. Out of scope for design

- Cardholder funnel (has canvas), corporate-commute screens, fleet/driver supply, settlement engine internals, the bank's own card/KYC/points UI.
