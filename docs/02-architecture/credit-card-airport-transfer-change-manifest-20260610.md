# Credit-Card Airport Transfer — Change Manifest (every app / package / infra)

**Date:** 2026-06-10
**Feature:** 信用卡卡友機場接送 · `credit_card_airport_transfer`
**Decision:** separate `apps/bank-console-web` app (SD §1 D1); bank = issuer tenant in data only.
**Authority:** [Requirements](../01-product/credit-card-airport-transfer-requirements-20260610.md) · [SA](./credit-card-airport-transfer-sa-20260610.md) · [SD](./credit-card-airport-transfer-sd-20260610.md) · [Screen Requirements](../05-ui/credit-card-airport-transfer-screen-requirements-20260610.md)

> Single checklist of **everything that changes, in every app/package/infra**. `[built]` exists/reuse · `[extend]` additive change to existing · `[new]` net-new. **D** = dispatched as an execution task (2026-06-10); **design** = waits on a design-team canvas.

---

## A. `apps/bank-console-web` — NEW app (the bank back-office)
- **A1 [new][D]** Scaffold the app: Next app router, `@drts/ui-web` + `@drts/ui-tokens` `tenant` realm chrome, nav skeleton, **placeholder pages**, Dockerfile, `deploy-bank-console.yml`. *(Task `CCAT-APP-SCAFFOLD-20260610`.)*
- **A2 [new][design]** The 8 screens (full briefs in screen-requirements §5): `/` home · `/bookings` · `/bookings/[bookingId]` · `/contracts`(+`/[id]`) · `/statements`(+`/[period]`) · `/programs` · `/users` · `/audit`. **Each needs a design-team canvas before build** (no agent-invented screens).

## B. `apps/partner-booking-web` — cardholder surfaces (S1/S2)
- **B1 [built]** `card` program funnel (中信機場, CTBC theme), airport form (`flightNo`/`terminal`/`direction`). No redesign.
- **B2 [extend]** **Deploy to dev** — add Dockerfile + `deploy-partner-booking.yml` (mirror `deploy-tenant-console`); currently 404/undeployed.
- **B3 [new][design?]** **Online-banking app embed (S2):** host-resolved/webview entry reusing the funnel; identity via issuer **reference token**; strip standalone login. Mostly an embed wrapper (minimal new design).

## C. `apps/platform-admin-web` — issuer onboarding & settlement oversight (control plane)
- **C1 [extend]** Onboard the **bank as an issuer tenant** + register the **card-benefit program** (reuse `partners` / `service-products`), supporting the new `programType: card_benefit_airport`.
- **C2 [extend]** Wire the **eligibility integration** in `adapter-registry` (bank-card-inline / reference-token).
- **C3 [extend]** **Reimbursement-batch oversight** for sponsor-funded trips in `payments/reimbursements`.
- **C4 [extend]** Add an access-gated **cross-app link** to the issuer's `bank-console-web`.

## D. `apps/ops-console-web` — dispatch & contract (control plane)
- **D1 [extend]** Surface **airport context** (flight / terminal / direction) + the `credit_card_airport_transfer` subtype on the dispatch board/detail. *(Partly present in `dispatch/[dispatchId]`, `dispatch-workflow`, `forwarded-order-board`.)* — touches UI; confirm against ops canvas.
- **D2 [built]** `/contracts/[contractId]` is the **authority** the bank-console contract view reads from — keep it the source of truth.
- **D3 [extend]** Provide the access-gated **cross-link target** so `bank_ops_viewer` deep-links resolve (read-only).

## E. `apps/fleet-partner-portal-web` + `fleet-partner` API — sponsor attribution (supply)
- **E1 [extend][D]** `trips` / `revenue` / `statements` must **attribute sponsor-funded (card-benefit) trips** and the reimbursement-batch portion; driver/fleet payout stays whole while sponsor settlement closes later. *(Currently ~absent. Task `CCAT-FLEET-SPONSOR-20260610`.)*

## F. `apps/tenant-console-web` — NO CHANGE
- **F1** Explicitly **not reused** for the bank (it is the corporate-commute tenant console, `programType: enterprise_dispatch`; `SD-DP-20260508-004` forbids reuse). It may serve as a **chrome reference only**.

## G. `packages/contracts` — shared types (do first; others depend)
- **G1 [extend][D]** `CrossAppSurface` += `bank_console` (+ deep-link route pattern). *(Task `CCAT-CONTRACTS-20260610`.)*
- **G2 [extend][D]** `programType` union += `card_benefit_airport` (without breaking `enterprise_dispatch`). *(Same task.)*
- **G3 [new][D]** New records: `IssuerContractStatusRecord`, `SettlementStatementRecord`, `ProgramUsageRecord`; extend the **order list projection** with `programCode`/`businessDispatchSubtype`/`flightNo`/`terminal`/`direction`/`benefitReferenceMasked`/`cardholderRefMasked`. *(Records land with the API tasks G/H.)*

## H. `apps/api` — BFF endpoints (issuer-tenant scoped, PII-masked)
- **H1 [new][D]** `GET /api/tenant/contracts` (+`/:contractId`) — issuer contract & SLA. *(Task `CCAT-API-CONTRACTS-20260610`.)*
- **H2 [new][D]** `GET /api/tenant/settlement-statements` (+`/:period`) — per-trip reconciliation. *(Task `CCAT-API-STATEMENTS-20260610`.)*
- **H3 [new][D]** `GET /api/tenant/program-usage` — quota consumption. *(Task `CCAT-API-USAGE-20260610`.)*
- **H4 [extend]** `GET /api/tenant/orders` — accept `programCode`/`businessDispatchSubtype`/`cardholderRef` filters + return the airport/program dimension in the list projection.
- **H5 [built]** Reuse: `POST /api/partner/eligibility`, `POST /api/partner/bookings`, `tenant/service-programs`, `tenant/orders/:orderId`, `tenant/trips`, `billing-settlement` (card-benefit channel).

## I. Deploy / infra
- **I1 [new][D]** `deploy-bank-console.yml` (mirror `deploy-tenant-console.yml`); repo vars `DEV_GCP_BANK_CONSOLE_SERVICE` + `DEV_BANK_CONSOLE_ORIGIN`. *(Part of `CCAT-APP-SCAFFOLD`.)*
- **I2 [extend]** Register `bank-console-web` in the **cross-app origin maps** of platform-admin / ops / fleet-partner / tenant-console so deep-links resolve.
- **I3 [extend]** Add the app to the canonical `deploy-dev.yml` once it stabilises (new build/deploy job + `DEV_GCP_<APP>_SERVICE`/`DEV_<APP>_ORIGIN`).

---

## J. Status snapshot (2026-06-10)
**Dispatched now (design-independent, 6 tasks):** G1/G2 (`CCAT-CONTRACTS`) · H1 (`CCAT-API-CONTRACTS`) · H2 (`CCAT-API-STATEMENTS`) · H3 (`CCAT-API-USAGE`) · A1+I1 (`CCAT-APP-SCAFFOLD`) · E1 (`CCAT-FLEET-SPONSOR`). Hub `CCAT-CONTRACTS` runs first; the rest are dependency-gated on it.

**Pending design-team canvas:** A2 (the 8 bank-console screens).

**Follow-on (not yet dispatched):** B2/B3 (partner-booking deploy + embed), C1–C4 (platform-admin), D1/D3 (ops UI surfacing), H4 (order projection filters), I2/I3 (cross-app origin maps + canonical deploy).
