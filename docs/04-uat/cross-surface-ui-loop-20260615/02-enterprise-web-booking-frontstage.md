# enterprise-dispatch-web booking is frontstage-only (submit not wired) — 2026-06-16

## Finding

The rebuilt `enterprise-dispatch-web` booking flow (`/bookings/new` →
`/bookings/review` → `/bookings/submitted`) is **purely navigational**. The review
page (`app/bookings/review/page.tsx`) is a server component whose submit is a
`<Link href="/bookings/submitted">` — it **never calls the API**. So submitting
always shows the same static `已受理 / EB-7K2E1D` and **no booking is created**
(`ops.phase1_owned_orders` stays 0; the "real" orders seen during this work were
direct `POST /api/tenant/bookings` calls, not the web app).

The client to do it **already exists and is unused**:
`lib/api-client.ts` → `EnterpriseDispatchTenantClient.createBookingFromFixture()`
→ `client.createTenantBooking(adaptBookingFixtureToCreateCommand(fixture))`,
routing through `/control-plane-proxy` (bootstrap `tenant_admin` headers, no
session/JWT needed). `lib/tenant-api-gap-map.ts` even marks booking as `"wired"`.

## Precise fix (for the enterprise-web owners; in-flight app — not drive-byed here)

1. Replace the review-page submit `<Link>` with a `"use client"` button that, on
   click, calls `getEnterpriseDispatchTenantClient(tenantId).createBookingFromFixture(draft)`
   and then routes to `/bookings/submitted` with the real `bookingId`.
2. Supply a `tenantId` — the fixtures (`enterpriseTenant`) currently have **no id**;
   add the demo tenant id (`10000000-0000-0000-0000-000000000201`, matches the seed)
   or resolve it from a bootstrapped session.
3. Confirm `getEnterpriseBookingDraft()` output satisfies
   `adaptBookingFixtureToCreateCommand` (the draft is display-shaped; the adapter
   maps it to `CreateTenantBookingCommand`).
4. Render the real result on `/bookings/submitted` (bookingId/orderId/status)
   instead of the static `EB-7K2E1D`.

Until this is wired, a 100% pure-UI cross-surface loop cannot START from
enterprise-web. The full DATA-PATH loop is proven via API-direct booking →
dispatch → assign → driver APP → ops board (see E2E-006 + the driver-app
verification rounds). A pure-UI loop is achievable today from a real-wired entry
(e.g. ops-console dispatch board, which reads/writes the live API).
