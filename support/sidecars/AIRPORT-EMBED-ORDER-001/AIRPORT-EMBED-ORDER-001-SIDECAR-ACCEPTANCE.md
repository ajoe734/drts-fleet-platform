# AIRPORT-EMBED-ORDER-001 Sidecar Acceptance Packet

This document is the support-only acceptance packet for `AIRPORT-EMBED-ORDER-001` ("Airport embed real backend order creation"). It does not change canonical truth. It consolidates machine-truth anchors, current repo baselines, dependency paths, and reviewer-facing acceptance gates for the parent owner (`Gemini`) and assigned reviewer (`Claude`).

Anchors used here come from:

- `ai-status.json` task slices via `scripts/ai-status.sh show`
- `apps/partner-booking-web/app/[tenantSlug]/program/embed/page.tsx`
- `apps/partner-booking-web/lib/program-screens.tsx`
- `apps/partner-booking-web/lib/api-client.ts`
- `apps/partner-booking-web/lib/program-route-context.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
- `apps/partner-booking-web/tests/integration/bff-wiring.test.ts`
- `tests/e2e/E2E-007-partner-airport-transfer.sh`
- `docs/01-product/credit-card-airport-transfer-requirements-20260610.md`

## 1. Scope and boundary

- **Task ID:** `AIRPORT-EMBED-ORDER-001-SIDECAR-ACCEPTANCE`
- **Parent task:** `AIRPORT-EMBED-ORDER-001`
- **Helper kind:** `acceptance_packet`
- **Sidecar owner:** `Codex`
- **Sidecar reviewer:** `Gemini`
- **Parent owner:** `Gemini`
- **Parent reviewer:** `Claude`
- **Mutates canonical:** `false`
- **Objective:** hand off a reviewer-facing acceptance checklist, dependency map, and repo baseline for the airport program embed order-creation task without editing runtime code, parent task truth, or L1/L2 documents.

Guardrails for this packet:

- Keep output confined to `support/sidecars/AIRPORT-EMBED-ORDER-001/`.
- Do not reinterpret the parent scope beyond the `ai-status.json` slice.
- Treat this as support for a real booking-creation path, not permission to add a parallel API or fixture-only success path.

## 2. Machine-truth anchors

### 2.1 Parent task: `AIRPORT-EMBED-ORDER-001`

| Field | Value |
| --- | --- |
| Title | `Airport embed real backend order creation` |
| Owner | `Gemini` |
| Reviewer | `Claude` |
| Status | `in_progress` |
| Depends on | `none` |
| Artifacts | `apps/partner-booking-web/app/[tenantSlug]/program/embed/`, `apps/partner-booking-web/lib/api-client.ts`, `apps/partner-booking-web/lib/program-route-context.ts`, `apps/api/src/modules/owned-mobility/` |
| Acceptance | `embed 送出建立真後端 booking 回 bookingId(非 validation-only)`; `复用認證後 book 流程同一 create 路徑不另建平行 API`; `program 脈絡+資格驗證保留`; `production 禁 fixture 假成功`; `回 confirmed/receipt 真資料`; `unit+e2e green + reviewer PASS` |
| Next | `Fixing review feedback from Claude on airport embed order creation` |
| Last update | `2026-07-26T17:01:52Z` |

### 2.2 Sidecar task: `AIRPORT-EMBED-ORDER-001-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Gemini` |
| Status at packet creation | `in_progress` |
| `task_class` | `sidecar` |
| `helper_parent` | `AIRPORT-EMBED-ORDER-001` |
| `helper_kind` | `acceptance_packet` |
| `mutates_canonical` | `false` |
| Artifact | `support/sidecars/AIRPORT-EMBED-ORDER-001/AIRPORT-EMBED-ORDER-001-SIDECAR-ACCEPTANCE.md` |

## 3. Current repo baseline

These are the important "before" facts the reviewer should preserve while reading the parent diff.

### 3.1 Embed entry is still a handoff shell, not a real submit path

- `apps/partner-booking-web/app/[tenantSlug]/program/embed/page.tsx` currently renders `ProgramBookingFlow` with `screen="embed_handoff"` and `surface="embed"`.
- `apps/partner-booking-web/lib/program-screens.tsx` still treats `embed_handoff` as the bank-app entry shell. The copy around the booking flow still includes validation/handoff language, including `book.success = "Form validation passed"` and the zh-TW detail that the booking data is ready for a later partner-channel order creation.
- Reviewer implication: the parent task must replace validation-only completion semantics with real booking creation, not merely restyle or rename the current handoff/success states.

### 3.2 The program-route context already exists and must stay

- `apps/partner-booking-web/lib/program-route-context.ts` resolves theme state from `getPartnerRouteContext(...)` and `getProgramThemeForTenantSlug(...)`.
- Reviewer implication: parent work should keep the `program` route identity/theming path intact rather than bypassing it with embed-only hardcoding.

### 3.3 The BFF already exposes the needed booking and read-back methods

- `apps/partner-booking-web/lib/api-client.ts` already exports:
  - `createPartnerBooking(...)` -> `createTenantBooking(...)`
  - `getPartnerConfirmation(...)` -> `getTenantBooking(...)`
  - `getPartnerTrip(...)` -> `getOrder(...)`
  - `getPartnerReceipt(...)` -> `getPartnerTrip(...)`
- Reviewer implication: the parent task's "reuse authenticated booking path" requirement is concrete. There is already a shared authority-client path; a new embed-only booking API would violate scope.

### 3.4 Backend authority path is already canonical

- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` exposes `POST tenant/bookings`, `GET tenant/bookings/:bookingId`, and `GET orders/:orderId`.
- Reviewer implication: acceptance should reject any parent diff that creates a parallel "embed order create" backend endpoint when the canonical booking/order path already exists.

## 4. Dependency map

### A. Upstream runtime dependency: partner embed shell

| Path | Why it matters |
| --- | --- |
| `apps/partner-booking-web/app/[tenantSlug]/program/embed/page.tsx` | Current embed route entry is the place where handoff-only flow starts. |
| `apps/partner-booking-web/lib/program-screens.tsx` | Holds screen sequencing and current validation/success copy that will need to reflect real backend creation. |
| `apps/partner-booking-web/lib/program-route-context.ts` | Preserves tenant/program context and theme resolution that the parent task must retain. |

### B. Upstream runtime dependency: shared booking BFF

| Path | Why it matters |
| --- | --- |
| `apps/partner-booking-web/lib/api-client.ts` | Already routes partner-side booking creation and confirmation/trip/receipt reads through the authority client. |
| `apps/partner-booking-web/tests/integration/bff-wiring.test.ts` | Proves the expected contract: booking create hits `/api/tenant/bookings`, confirmation hits `/api/tenant/bookings/:bookingId`, trip/receipt hit `/api/orders/:orderId`. |

### C. Upstream backend dependency: canonical owned-mobility booking path

| Path | Why it matters |
| --- | --- |
| `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | Defines the existing canonical tenant booking and order read-back endpoints. |
| `apps/api/src/modules/owned-mobility/` | Parent task scope explicitly says to reuse the same owned-mobility create path as authenticated booking. |

### D. End-to-end acceptance dependency

| Path | Why it matters |
| --- | --- |
| `tests/e2e/E2E-007-partner-airport-transfer.sh` | End-to-end chain already expects partner eligibility -> `POST /tenant/bookings` -> booking/order read-back with airport-transfer metadata preserved. |

### E. Product-truth anchor

| Path | Why it matters |
| --- | --- |
| `docs/01-product/credit-card-airport-transfer-requirements-20260610.md` | Feature-level acceptance still says the cardholder should track the ride to completion and get a receipt across S1/S2; embed cannot stop at local validation. |

## 5. Reviewer-facing acceptance checklist for the parent task

These are the concrete gates the parent task should satisfy when it returns for review.

### A. Scope gates

- [ ] Embed submit creates a real backend booking and returns a real `bookingId`; completion is not validation-only.
- [ ] The implementation reuses the same authority-client/create path as the authenticated booking flow through `createTenantBooking`, not a new embed-only API.
- [ ] Program route context, issuer/program theming, and eligibility context remain intact for the embed surface.
- [ ] Production code does not depend on fixture-only fake success states.
- [ ] Confirmed and receipt screens read real confirmation/trip data rather than static success placeholders.

### B. API and data-continuity gates

- [ ] `partnerEntrySlug`, eligibility identifiers, and airport-transfer context survive booking creation and read-back.
- [ ] `bookingId` comes from backend response and can be used for confirmation fetches.
- [ ] Receipt/trip screens use canonical order read-back (`GET /orders/:orderId`) rather than local fake payloads.
- [ ] No parallel backend endpoint is introduced for embed booking creation when `POST /tenant/bookings` already exists.

### C. Regression guards

- [ ] The embed route still enters through the program route family under `app/[tenantSlug]/program/embed`.
- [ ] The parent diff does not break `program-route-context` theme resolution or eligibility preservation.
- [ ] Validation, eligibility, and program copy changes stay consistent with the embed flow semantics after real booking creation.

### D. Verification gates

- [ ] Parent owner records the exact unit test commands run for the touched partner-booking-web and owned-mobility surfaces.
- [ ] Parent owner records the exact e2e evidence for airport-transfer flow, including the booking/order continuity expected by `tests/e2e/E2E-007-partner-airport-transfer.sh`.
- [ ] Reviewer verifies the result against the parent acceptance line `unit+e2e green + reviewer PASS`, not against this sidecar alone.

## 6. Suggested evidence map for parent closeout

The parent owner should be able to cite evidence in roughly this order:

1. Booking submit path in `apps/partner-booking-web` now calls shared booking creation instead of ending at validation-only success.
2. Confirmation screen reads `bookingId`-backed booking data.
3. Receipt/tracking read canonical order data.
4. Tests prove both API wiring and end-to-end airport metadata continuity.

Useful evidence anchors already in repo:

- `apps/partner-booking-web/tests/integration/bff-wiring.test.ts`
- `tests/e2e/E2E-007-partner-airport-transfer.sh`

## 7. Packet completeness check

- [x] This artifact stays support-only and does not edit canonical truth.
- [x] Parent task machine truth and sidecar task machine truth are both captured.
- [x] The packet names the actual shared BFF methods already present in `apps/partner-booking-web/lib/api-client.ts`.
- [x] The packet names the canonical backend booking/order endpoints already present in `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`.
- [x] The packet records the current embed baseline as `embed_handoff` plus validation-oriented success copy.
- [x] The packet ties review expectations to the existing E2E airport-transfer chain and product requirement for real receipt/tracking outcomes.

## 8. Reviewer handoff notes for `Gemini`

1. Reconfirm the parent task slice still shows owner=`Gemini`, reviewer=`Claude`, and status=`in_progress`; this packet is anchored to that machine-truth state as of `2026-07-26`.
2. Reconfirm the embed entry is still `embed_handoff` at review time. If the parent branch has already rewritten the entry semantics, check that the rewrite truly lands on real booking creation and not renamed local success.
3. Treat `apps/partner-booking-web/lib/api-client.ts` as the strongest anti-regression signal against parallel API creation, because the shared BFF methods already exist.
4. Treat `tests/e2e/E2E-007-partner-airport-transfer.sh` as the strongest end-to-end continuity anchor, because it already expects partner eligibility data to survive into booking and order records.
5. Approval for this sidecar should only confirm packet quality and support usefulness. Parent implementation acceptance still belongs to `AIRPORT-EMBED-ORDER-001` review.
