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

The bank / issuer back-office is a **brand-new app — `apps/bank-console-web`** (decision revised 2026-06-10, SD §1 D1). It is **NOT** `tenant-console-web`: that app's `drts-design-canvas/Tenant Console.html` was drawn for a **corporate-commute tenant** (YAMATO 大和商務集團; 成本中心, 員工乘客, cost-centre approval rules), and `SD-DP-20260508-004` forbids non-corporate flows from reusing it. So the bank console needs a **full, fresh canvas** in its own card-benefit IA (issuer / 卡友 / 機場 / 趟次配額 / 合約 / 對帳) — not an extension of the corporate canvas. The corporate `Tenant Console.html` may inform shell/chrome conventions only (it uses the `tenant` realm tokens), never the data IA. This packet specifies every screen the new app needs.

The **customer-facing** surfaces (S1 cardholder web, S2 banking-app embed) already have a canvas (`Partner Booking Web.html` / `pb-screens.jsx`, `card` program theme = CTBC blue/gold) — they need **no new design**, only deployment/embed. They are listed in §4 for completeness, not for design work.

## 2. Personas (design-relevant)

| Code                 | Persona        | Reads                                     | Acts                  |
| -------------------- | -------------- | ----------------------------------------- | --------------------- |
| `bank_program_admin` | 銀行方案管理員 | program config, quota usage               | configure/view policy |
| `bank_ops_viewer`    | 銀行客服/營運  | booking + dispatch + contract (read-only) | look up, no mutation  |
| `bank_finance`       | 銀行財務       | settlement statement                      | reconcile, download   |

(Cardholder personas for S1/S2 are covered by the existing partner-booking canvas.)

## 3. Operating context

- S3 is a **tenant-plane** surface scoped to the **issuer tenant** (the bank). It is the same shell as `tenant-console-web` but the data dimension is card-benefit, not corporate commute.
- All cardholder/card references are **PII-masked** in lists, detail, exports, and statements. Designs must assume masked tokens (e.g. `**** 4821`), never raw card numbers.
- zh-TW primary / en secondary. Issuer brand (中信/CTBC) appears as tenant identity; **chrome uses the `tenant` realm tokens** (teal) per `@drts/ui-tokens` — see §7.

## 4. Sitemap

### 4.1 New design needed — **the whole `bank-console-web` app** (design all of these)

This is a new app, so **every screen needs a canvas** — there is no corporate tenant-console canvas to extend.
| Screen | Route (proposed) | Note |
|---|---|---|
| Home / overview | `/` | issuer dashboard: today's bookings, quota burn, SLA posture |
| Bookings list — card/airport dimension | `/bookings` | cardholder/program/flight/direction/state — NOT corporate cost-centre columns |
| Booking detail — airport + benefit + dispatch | `/bookings/[bookingId]` | read-only fulfilment view |
| Contract & SLA status | `/contracts` (+ `/[contractId]`) | no precedent in tenant canvas |
| Settlement statement (period + per-trip detail) | `/statements` (+ `/[period]`) | per-trip benefit/subsidy reconciliation |
| Program & quota usage dashboard | `/programs` | 趟次 consumed vs quota, by program/period |
| Users & roles | `/users` | bank back-office roles (program-admin / ops-viewer / finance) |
| Audit | `/audit` | eligibility/dispatch/settlement trail |

### 4.2 No new design (reference only)

| Screen                                                                                    | Where                                  | Status                                                            |
| ----------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| Cardholder booking funnel (entry→eligibility→review→success→tracking→error→manual-review) | `partner-booking-web` `card` program   | has canvas (`pb-screens.jsx`)                                     |
| Shell/chrome conventions (realm tokens, density)                                          | `tenant-console` `Tenant Console.html` | **reference for chrome only**, never for the card-benefit data IA |

## 5. Per-screen functional briefs (design these — all 8 screens of `bank-console-web`)

> Each brief is design-ready: **purpose · persona · data to surface · states · actions · cross-links · constraints · API**. No visual decisions. All cardholder/card references are **masked** (e.g. `**** 4821`). zh-TW primary / en secondary. Chrome uses `@drts/ui-tokens` `tenant` realm + issuer brand.

### 5.1 Home / Overview — route `/`

- **Purpose:** landing for bank staff; at-a-glance posture of the card-benefit airport program(s).
- **Persona:** all three (content gated by role).
- **Data to surface:** period summary (bookings by state 預約/進行中/已完成/取消; next N airport pickups with flight/terminal/time); **quota posture** (禮遇趟次 consumed vs total, per program); **SLA posture** (pickup punctuality % + completion rate % vs target, healthy/at-risk/breached); **settlement posture** (current period statement status + amount); recent exceptions (manual-review / no-supply / missed-SLA).
- **States:** loading; not-provisioned (program not set up); role-scoped (finance→settlement card, ops→bookings+exceptions, admin→all); downstream-unavailable (degraded read).
- **Actions:** navigate to each section; open an exception → booking detail.
- **Cross-links:** booking detail, statement (read-only).
- **Constraints:** read-only; masked refs; figures must reconcile with the detail pages.
- **API:** aggregates `tenant/orders`, `tenant/program-usage`, `tenant/contracts`, `tenant/settlement-statements`.

### 5.2 Bookings list — card/airport dimension — route `/bookings`

- **Purpose:** `bank_ops_viewer` sees which cardholder booked, as card-airport rides.
- **Persona:** `bank_ops_viewer` (primary), `bank_program_admin`.
- **Data (columns):** order id; **cardholder ref (masked)**; **program (中信機場 / programCode)**; **direction (去程/回程)**; **flight no. + terminal**; pickup→drop (short); time window; **dispatch state** (預約/已指派/進行中/已完成/取消); benefit reference (masked).
- **Filters:** program, direction, dispatch state, period, cardholder-ref search.
- **States:** loading; empty (no match / none yet); permission-denied; data-unavailable; load-failed; deep-link-stale.
- **Actions:** open detail; export (masked). **Read-only — no dispatch mutation from the bank side.**
- **Cross-links:** row → booking detail.
- **Constraints:** the corporate `成本中心 (CC)` column has **no meaning** here — design issuer/program columns in its place; dense list; masked PII.
- **API:** `GET /api/tenant/orders?programCode&direction&state&period&cardholderRef`.

### 5.3 Booking detail — airport + benefit + dispatch — route `/bookings/[bookingId]`

- **Purpose:** read-only fulfilment view of one airport ride.
- **Persona:** `bank_ops_viewer`.
- **Data (blocks):** header (order id, program, cardholder ref masked, state); **dispatch timeline** (created → [approval] → driver assigned → en route → completed/cancelled, with timestamps, current step highlighted); **airport block** (flight no., terminal, direction 去程/回程, pickup/drop, scheduled window, flight-delay tolerance if modelled); **benefit block** (program, benefit reference masked, issuer authorisation ref masked, **quota impact** — this ride consumed/refunded N 趟次); driver/vehicle (masked per policy).
- **States:** loading; no-data; not-provisioned; load-failed; permission-denied; linked-ops-unavailable; deep-link-stale; driver-no-longer-eligible (informational).
- **Actions:** **read-only cross-link to ops dispatch detail** (access-gated; disabled/hidden if forbidden); export (masked).
- **Constraints:** **no dispatch mutation** from this surface; all refs masked.
- **API:** `GET /api/tenant/orders/:orderId`.

### 5.4 Contracts & SLA — routes `/contracts` (+ `/[contractId]`)

- **Purpose:** the bank sees the service-contract posture between the program and DRTS.
- **Persona:** `bank_program_admin`, `bank_ops_viewer`.
- **List data:** contract id, program, term (start–end), status (healthy/at-risk/breached), current-period attainment summary.
- **Detail data:** contract/programme term; **SLA targets** (pickup punctuality %, completion rate %, response time); **current-period attainment vs each target** (value + delta); **exception list** (missed SLA, disputed trips, each linked to booking detail); contract status; provenance/notes.
- **States:** loading; empty/not-provisioned; permission-denied; downstream-unavailable; per-SLA healthy/at-risk/breached.
- **Actions:** open detail; open an exception → booking detail; export.
- **Constraints:** **no precedent in the tenant canvas — fresh design.** Read-only for the bank (DRTS owns the contract authority via ops `/contracts`); attainment numbers reconcile with statements/bookings.
- **API:** `GET /api/tenant/contracts`, `/:contractId`.

### 5.5 Statements — routes `/statements` (+ `/[period]`)

- **Purpose:** `bank_finance` reconciles and settles with DRTS for a period.
- **Persona:** `bank_finance`.
- **List data (periods):** period, total amount, status (published/paid/due), issued date, due date, download (signed artifact).
- **Detail data (per-trip lines):** trip id, date, **fare**, **subsidised vs paid split**, **benefit reference (masked)**, **cardholder ref (masked)**; period **totals**; **money direction = issuer-pays-DRTS**; status; **signed-artifact download**.
- **States:** pending (period not published); ready; paid; due; artifact-expired (re-issue path); line-item-disputed (flag to DRTS); permission-denied; empty.
- **Actions:** select period; download signed artifact; flag a disputed line → to DRTS settlement; export.
- **Constraints:** **distinct from corporate invoices** — this is per-trip reconciliation; masked refs; direction issuer-pays-DRTS; lines reconcilable against the bank's own records.
- **API:** `GET /api/tenant/settlement-statements`, `/:period`.

### 5.6 Programs & quota usage — route `/programs`

- **Purpose:** `bank_program_admin` sees benefit consumption and program config.
- **Persona:** `bank_program_admin`.
- **Data:** per program/period — program name/code, issuer, coverage, benefit terms; **cardholders served**; **禮遇趟次 consumed vs quota (remaining)**; trend over periods; top exceptions; eligibility policy summary.
- **States:** loading; empty/not-provisioned; permission-denied; quota healthy/low/exhausted indicator.
- **Actions:** drill into a program; edit policy **only if permitted**; export.
- **Constraints:** quota is the bank's headline metric — must be unambiguous; read unless policy allows edit.
- **API:** `GET /api/tenant/program-usage`, `tenant/service-programs`.

### 5.7 Users & roles — route `/users`

- **Purpose:** manage bank back-office staff access.
- **Persona:** `bank_program_admin` (admin capability).
- **Data:** user name, role (`bank_program_admin` / `bank_ops_viewer` / `bank_finance`), status (active/invited/suspended), last activity.
- **States:** loading; empty; permission-denied.
- **Actions:** invite; change role; suspend/reactivate (per admin permission).
- **Constraints:** role set = the three bank personas (+admin); scoped to the issuer tenant; every change audited.
- **API:** tenant users endpoint (issuer-scoped).

### 5.8 Audit — route `/audit`

- **Purpose:** trace eligibility, dispatch, and settlement events for accountability.
- **Persona:** `bank_program_admin` (+ compliance).
- **Data:** event time, actor, event type (eligibility decision / dispatch action / settlement close / access), subject (masked refs), outcome/reason code, linked entity (→ booking / statement).
- **Filters:** type, actor, period, subject ref.
- **States:** loading; empty; permission-denied; external-unavailable.
- **Actions:** filter; open linked entity; export (masked).
- **Constraints:** issuer/benefit references intact but masked; read-only; **self-audit-aware** (listing audit logs is itself an audited event — never assume row ordering, use find/some).
- **API:** tenant audit endpoint (issuer-scoped).

## 6. API mapping (behaviour authority = SD §3)

| Screen                      | Endpoint(s)                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Bookings list (program)     | `GET /api/tenant/orders?programCode&direction&state&period&cardholderRef` (extended projection) |
| Booking detail              | `GET /api/tenant/orders/:orderId` (+ airport/benefit fields)                                    |
| Contract & SLA              | `GET /api/tenant/contracts` (+ `/:contractId`) — **new**                                        |
| Settlement statement detail | `GET /api/tenant/settlement-statements/:period` — **new**                                       |
| Program & quota usage       | `GET /api/tenant/program-usage` — **new**                                                       |

(Customer S1/S2: `POST /api/partner/eligibility`, `POST /api/partner/bookings` — existing.)

## 7. Purely-visual open questions (for design)

- VQ-1 **Realm vs issuer brand:** S3 chrome should use the `tenant` realm tokens (teal `#0F766E`) from `@drts/ui-tokens`; the issuer (中信/CTBC blue-gold) appears as tenant identity/branding within that chrome. Confirm the balance — do not hand-pick a new palette (a raw-hex palette fails `tools/ci/check_ui_realm_tokens.py`).
- VQ-2 How to represent **direction (去程/回程)** and **flight/terminal** compactly in a dense list row.
- VQ-3 SLA attainment visualisation (gauge vs bar vs delta-to-target) for the contract screen.
- VQ-4 Settlement statement: per-trip table density + masked-reference treatment + subsidised/paid split visual.
- VQ-5 Quota: remaining-趟次 representation (counter, ring, progress) at program and cardholder level.

## 8. Out of scope for design

- Cardholder funnel (has canvas), corporate-commute screens, fleet/driver supply, settlement engine internals, the bank's own card/KYC/points UI.
