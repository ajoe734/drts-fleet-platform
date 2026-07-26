# AIRPORT-EMBED-ORDER-001 Sidecar Review Packet

> **Parent Task:** AIRPORT-EMBED-ORDER-001 — Airport embed real backend order creation
> **Parent Owner:** Gemini | **Parent Reviewer:** Claude
> **Sidecar Owner:** Gemini2 | **Sidecar Reviewer:** Gemini
> **Helper Kind:** review_packet
> **Mutates Canonical:** false
> **Created:** 2026-07-26T16:42:00Z

This packet is a **support artifact** prepared by **Gemini2**. It does not modify L1 canonical truth, core contract definitions, or primary runtime schemas. It organizes evidence, verification results, and acceptance audits for parent task `AIRPORT-EMBED-ORDER-001` so that the reviewer (`Gemini`) and parent owner (`Gemini`) can complete handoff efficiently.

---

## 1. Parent Task Summary

**AIRPORT-EMBED-ORDER-001** — Airport embed real backend order creation

**Goal:** Connect the airport embed flow (`apps/partner-booking-web/app/[tenantSlug]/program/embed/page.tsx`) to real backend order creation via `lib/api-client.ts` (`createEmbedPartnerBooking`), replacing validation-only / fixture handoffs with genuine backend order creation while preserving program route context and eligibility verification.

**Parent Status:** `review` — Gemini submitted the parent implementation for review; commit `8ceffb582a7c4333b87d999ce2ff40677cf02c55`.

**Dependencies:** None

**Handoff Claim:**

> "Fixed all 4 review blockers: 1) Wired EmbedBookingSubmitButton to POST /api/embed-booking, preserving embed surface path (/ctbc/program/embed/\*) in all nav and button links. 2) Verified typecheck and vitest green (7 files / 61 tests PASS). 3) Removed all client-controlled apiKey inputs and hardcoded fake fixture fallbacks, enforcing required pickup/dropoff/passenger fields. 4) Added IDOR verification in getEmbedPartnerBooking to enforce tenant scoping. Pushed commit 8ceffb582."

---

## 2. Acceptance Criteria Audit

### AC-1 — Embed submit creates real backend booking returning `bookingId` (Non validation-only)

**Criterion:** Submitting on the embed surface sends order parameters to the backend and returns a real `bookingId` rather than doing validation-only check.

**Evidence:**

- `apps/partner-booking-web/components/embed-booking-submit-button.tsx`:
  `EmbedBookingSubmitButton` performs an HTTP `POST /api/embed-booking` payload containing `tenantSlug`, `eligibilityVerificationId`, `pickup`, `dropoff`, `passenger`, etc.
- `apps/partner-booking-web/app/api/embed-booking/route.ts`:
  Receives `POST`, validates request fields, and delegates directly to `createEmbedPartnerBooking(...)` in `lib/api-client.ts`.
- `apps/partner-booking-web/lib/api-client.ts`:
  Executes POST call to backend `/api/v1/public/tenants/${tenantSlug}/bookings/owned-mobility`, returning `{ success: true, bookingId, booking }`.

**Verdict:** ✅ PASS — Real backend booking flow is fully connected.

---

### AC-2 — Reuses same order creation path as authenticated `/book` flow without parallel API proliferation

**Criterion:** Embed order creation reuses the unified `createEmbedPartnerBooking` / `owned-mobility` contract rather than creating a duplicate parallel backend API.

**Evidence:**

- `apps/partner-booking-web/lib/api-client.ts`:
  Reuses the established payload structure (`pickup`, `dropoff`, `reservationWindowStart`, `reservationWindowEnd`, `passenger`, `notes`, `flightNumber`, `vehicleClass`) matching the authenticated booking client.
- `apps/partner-booking-web/app/api/embed-booking/route.ts`:
  Serves as the Next.js BFF proxy to normalize client requests into `createEmbedPartnerBooking`.

**Verdict:** ✅ PASS — Single, unified order creation contract reused cleanly.

---

### AC-3 — Program route context and eligibility verification preserved

**Criterion:** Embed navigation and submit retain program route context (`/ctbc/program/embed/*`) and pass `eligibilityVerificationId`.

**Evidence:**

- `apps/partner-booking-web/app/api/embed-booking/route.ts` lines 27-37:
  ```ts
  if (
    !eligibilityVerificationId ||
    typeof eligibilityVerificationId !== "string" ||
    !eligibilityVerificationId.trim()
  ) {
    return NextResponse.json(
      {
        error: "ELIGIBILITY_VERIFICATION_REQUIRED",
        message: "eligibilityVerificationId is required",
      },
      { status: 422 },
    );
  }
  ```
- `apps/partner-booking-web/lib/program-screens.tsx` & `components/embed-booking-submit-button.tsx`:
  Preserves `/ctbc/program/embed/*` route prefix across all UI navigation, buttons, and screen switches.

**Verdict:** ✅ PASS — Eligibility verification context enforced and route context preserved.

---

### AC-4 — Production fixture fallback and client-controlled API keys forbidden

**Criterion:** Production code must not use hardcoded mock fixture successes or expose client-controlled API key inputs.

**Evidence:**

- `apps/partner-booking-web/lib/api-client.ts`:
  Removed client-configurable `apiKey` overrides and fallback mock returns. Failing calls throw standard API exceptions.
- `apps/partner-booking-web/app/api/embed-booking/route.ts`:
  All inputs are validated against non-empty string types. Missing fields return explicit `400` or `422` error responses.

**Verdict:** ✅ PASS — Hardcoded fixture fallbacks and security antipatterns eliminated.

---

### AC-5 — Returns confirmed / receipt real data

**Criterion:** On successful order submission, return confirmed booking data with receipt details.

**Evidence:**

- `apps/partner-booking-web/app/api/embed-booking/route.ts` lines 86-90:
  ```ts
  return NextResponse.json({
    success: true,
    bookingId: booking.bookingId,
    booking,
  });
  ```
- `apps/partner-booking-web/lib/api-client.ts`:
  Parses full booking object containing `bookingId`, `status: "CONFIRMED"`, `pickup`, `dropoff`, and timing information.

**Verdict:** ✅ PASS — Confirmed booking structure with receipt payload returned.

---

### AC-6 — Unit + integration test suites green and typecheck PASS

**Criterion:** All unit and integration test suites pass, TypeScript compiles cleanly with zero errors.

**Evidence (Empirical Runtime Verification):**

- **Vitest Test Suite:** `pnpm --filter partner-booking-web test`
  - 7 Test Files Passed (100%)
  - 61 Total Tests Passed (100%)
  - Test files:
    - `tests/integration/embed-booking-route.test.ts` (6 tests)
    - `tests/integration/embed-flow-ui.test.ts` (4 tests)
    - `tests/integration/bff-wiring.test.ts` (17 tests)
    - `tests/integration/program-form-utils.test.ts` (10 tests)
    - `tests/integration/program-theme.test.ts` (12 tests)
    - `tests/integration/translations.test.ts` (8 tests)
    - `tests/integration/control-plane-proxy.test.ts` (4 tests)
- **TypeScript Typecheck:** `pnpm --filter partner-booking-web exec tsc --noEmit`
  - Exit Code: 0 (Clean build, zero type errors).

**Verdict:** ✅ PASS — 100% empirical test & build verification achieved.

---

## 3. Security & Architecture Audit Highlights

1. **IDOR Tenant Scoping Verification:**
   - In `lib/api-client.ts` (`getEmbedPartnerBooking`), tenant verification explicitly checks `booking.tenantSlug === requestedTenantSlug`. Mismatched requests reject with `403 Forbidden`, preventing cross-tenant information disclosure.

2. **Strict Request Validation in BFF Route:**
   - `route.ts` validates `tenantSlug` (400), `eligibilityVerificationId` (422), `pickup.address` (400), `dropoff.address` (400), and `passenger.name`/`passenger.phone` (400) before invoking backend handlers.

3. **No Canonical Truth Drift:**
   - All changes strictly adhere to Phase 1 service contract conventions (`phase1_service_contracts_v1.md`) and airport embed product specs.

---

## 4. Verification Commands & Log Digest

```bash
# 1. Run Vitest integration & unit test suite
pnpm --filter partner-booking-web test
# Output: Test Files 7 passed (7) | Tests 61 passed (61) | Duration 1.07s

# 2. Run TypeScript check
pnpm --filter partner-booking-web exec tsc --noEmit
# Output: Exit code 0 (No type errors)
```

---

## 5. Gemini2 Sidecar Owner Closeout

Prepared and verified by **Gemini2** on 2026-07-26 against task HEAD commit `8ceffb582a7c4333b87d999ce2ff40677cf02c55`.

- All 6 acceptance criteria for `AIRPORT-EMBED-ORDER-001` passed verification.
- Support artifact `support/sidecars/AIRPORT-EMBED-ORDER-001/AIRPORT-EMBED-ORDER-001-SIDECAR-REVIEW.md` created.
- Zero changes to canonical truth or primary core logic in this sidecar slice.

**Recommendation:** Hand off this sidecar review packet to assigned reviewer **Gemini**.

---

## 6. Reviewer Handoff & Disposition

_Reserved for Gemini reviewer handoff & approval._
