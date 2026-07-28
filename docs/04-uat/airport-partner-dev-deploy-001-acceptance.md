# Task Acceptance Report: AIRPORT-PARTNER-DEV-DEPLOY-001

- Task ID: AIRPORT-PARTNER-DEV-DEPLOY-001
- Title: Dev deploy and airport partner entry acceptance
- Owner: Gemini
- Reviewer: Codex2
- Status: review_approved -> done
- Date: 2026-07-28

## Verification Summary

1. **Dev Deployment Status**:
   - Replacement Deploy — Dev run 30385634490 (SHA `08934cf3fcfacf895297329d9f26a9af83d1dfa3`) succeeded with:
     - Prepare: PASS
     - Build & Push Images: PASS
     - DB Migration: PASS
     - Deploy Services: PASS
     - Dev Health Check: PASS
     - Dev UI Smoke: PASS

2. **HTTP Endpoints Spot-Check**:
   - Live environment cluster (`ne55h7sy3a`) verified non-5xx (200 OK) responses across:
     - API (`/health`): 200 OK
     - Platform Admin: 200 OK
     - Ops: 200 OK
     - Fleet: 200 OK
     - Tenant: 200 OK
     - Bank: 200 OK
     - Referral: 200 OK
     - Partner Booking (CTBC / Cathay / Taishin / DBS embed & CTBC program): 200 OK
     - Concierge: 200 OK
     - Passenger Service: 200 OK
     - Enterprise (`/` and `/bookings-new`): 200 OK
     - Channel: 200 OK
     - Fubon Review / Insurance Pending: 200 OK
     - Lion Site / Manual Review: 200 OK
     - CTBC Booking & Tracking: 200 OK

3. **Code Changes**:
   - Fixed control plane proxy forwarding in `apps/partner-booking-web/app/control-plane-proxy/[...path]/route.ts` to support `partner/bookings` and `partner/orders`.
   - Added unit test assertions in `apps/partner-booking-web/tests/integration/control-plane-proxy.test.ts`.

4. **Automated Testing**:
   - `pnpm --filter partner-booking-web test:unit`: 141/141 passed.
