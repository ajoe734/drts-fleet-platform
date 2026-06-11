# Design Follow-up Request — Partner-Booking program flows + Bank-app embed

**Date:** 2026-06-10
**To:** 視覺設計團隊（含 UX）
**From:** Claude (product/SA lane)
**Status:** Follow-up request. **No visual decisions in this document.**
**Re:** the 2026-06-10 design reply (bank-console + 機場接送 white-label site)

---

## 0. Acknowledgement (what landed — accepted)

> 2026-06-11 repository-ingestion note: this request records the design team's
> accepted deliverable shape, but the claimed canonical files
> `docs/05-ui/drts-design-canvas/bank-screens-{1,2,3}.jsx` and
> `docs/05-ui/drts-design-canvas/Bank Console.html` are not present in current
> repo machine truth. Until those files are restored or recommitted at the
> canonical paths, bank-console UI execution tasks remain blocked on missing
> visual-source artifacts. This note changes no visual decision; it only fixes
> the execution gate.

The 2026-06-10 bundle is **accepted and ingested** to `docs/05-ui/drts-design-canvas/` (PR #619):
- **Bank Console** — all 8 screens (`bank-screens-{1,2,3}.jsx`): home / bookings / booking-detail / contracts(+detail) / statements(+detail) / programs / users / audit. Verified against the screen-requirements: masked PII, 去/回程 + flight/terminal, quota/禮遇趟次, benefit/issuer refs, SLA attainment + exceptions, subsidised-vs-paid, issuer-pays-DRTS, read-only ops cross-link, **no cost-centre**. Excellent.
- **機場接送 white-label site** (`bank-sites/`) — cardholder airport-transfer booking (S1) + embed mockup (S2).

Two items remain, both flagged by your own Design Index note ("下一輪會做 … program-specific flow") and by our review.

---

## 1. Request A — the other two Partner-Booking program flows (insurance / travel)

Your Index notes the credit-card airport flow is done and **insurance / travel are next round**. We confirm they are in scope. They reuse the **same fixed 7-screen funnel** (entry → eligibility → review → success → tracking → error → manual-review) with **program theme + program-specific form** switched per program — exactly the pattern already in `lib/program-theme.ts` (`PARTNER_PROGRAM_KINDS = ["card","insurance","travel"]`). The `card` one is the template.

### A1. `insurance` — 保險理賠代步 · 富邦產險
- **Brand:** 富邦產險, host `claim.fubon-ins.com.tw`. Entitlement noun = **理賠額度** (not 趟次).
- **Program-specific form fields:** policy reference / claim reference, incident/repair context, **replacement-vehicle** eligibility window, passenger.
- **Program-specific states (already enumerated in the contract enum — please give each a screen state):** `insurance_policy` (valid), `insurance_replacement_vehicle`, `insurance_roster`, and the negative path set `insurance_pending` / `insurance_missing` / `insurance_expired` / `insurance_cancelled` — each maps to an eligibility/blocked state on the funnel.
- **Eligibility framing:** reference/claim-driven (not free-quota); show 理賠額度 / coverage window instead of 趟次配額.

### A2. `travel` — 旅行社團體接送 · 雄獅旅遊
- **Brand:** 雄獅旅遊, host `booking.lion-travel.com.tw`. Entitlement noun = **團體席次**.
- **Program-specific form fields:** group/booking reference, **multi-passenger / roster** (團體席次 count), tour/itinerary link, pickup batching.
- **Subtype:** `travel_agency_transfer`. Eligibility = booking/roster-driven.

### A3. Shared notes for A1/A2
- Keep the funnel structure identical to `card`; only theme + form + entitlement framing change.
- Per-issuer brand themes (富邦, 雄獅) — same approach as the CTBC card theme.
- The old CTBC funnel in `archive/` stays reference only.

## 2. Request B — S2 online-banking-app embed identity states

The embed exists as a mockup (`at-embed.png`), but the **identity hand-off** is unspecified. The embed runs inside the bank's own app, so identity comes from the **bank session**, not a standalone login. Please design the embed **entry + identity states**:

- **B1 Signed-in hand-off (happy path):** bank app passes a signed issuer session / **reference token**; the embed resolves the cardholder and skips the standalone bootstrap → straight into eligibility/book.
- **B2 Token expired / re-auth required:** the issuer session is stale → a state that asks the bank app to re-issue (no card capture inside the embed).
- **B3 Unsupported / wrong host:** embed opened outside an authorised bank host → blocked state.
- **B4 Consent / scope (if required):** first-time scope acknowledgement before booking.
- **B5 Fallback to standalone:** when no valid embed session is present, route to the standalone `機場接送` site entry.

Constraints: the embed must **never capture raw card data** (identity is the bank's reference token); never expose management-only resources; chrome adapts to the host app (compact). zh-TW primary.

## 3. What does NOT need design (for clarity)
- Bank Console (done, accepted), the credit-card airport funnel (done), and all the existing app canvases.
- Backend/eligibility/settlement internals.

## 4. Authority references
- Behaviour/data: [Requirements](./../01-product/credit-card-airport-transfer-requirements-20260610.md) · [SA](./../02-architecture/credit-card-airport-transfer-sa-20260610.md) · [SD](./../02-architecture/credit-card-airport-transfer-sd-20260610.md)
- Program model: `apps/partner-booking-web/lib/program-theme.ts`, `lib/program-screens.tsx`
- Subtype enum: `packages/contracts` (`credit_card_airport_transfer`, `insurance_*`, `travel_agency_transfer`)
