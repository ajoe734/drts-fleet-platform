# SYS-UI-002 Sidecar Acceptance Packet

- Task: `SYS-UI-002` — Repo-Local Partner Booking Mode Productization
- Owner: `Claude2`
- Reviewer: `Codex2`
- Parent execution packet:
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
- Topology decision:
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- Predecessor handoff:
  `support/sidecars/SYS-UI-001/SYS-UI-001-SIDECAR-BFF-HANDOFF.md`
- Date: 2026-05-09

## Purpose

Materialize partner booking mode as a first-class repo-local surface inside
`apps/tenant-console-web`, behind a constrained route group with no
tenant-admin governance leakage, covering:

- partner login / bootstrap (entry slug + API key)
- branded partner shell with partner-only navigation
- eligibility verification with explicit pass / fail / manual-review states
- partner-tagged booking creation
- post-create confirmation surface that stops short of update / cancel /
  override authority

This packet records what changed, what is intentionally out of scope, and the
local verification that satisfies the canonical acceptance bar.

## Acceptance Mapping

Acceptance from
`docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md:213-216`:

| Acceptance line                                                | Evidence                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| chosen target app typecheck passes                             | `pnpm --filter @drts/tenant-console-web typecheck` succeeds; `pnpm --filter @drts/tenant-console-web build` succeeds with 9 partner-mode routes registered.                                                                                |
| partner positive and negative flows are explicitly represented | Login, eligibility verification (eligible / ineligible / manual_review), booking create (active / inactive entry, eligibility-required gate, backend rejection), and booking confirmation surfaces are all materialized as separate pages. |

## Landing-Zone Conformance

Per the topology decision:

- partner booking mode lives inside `apps/tenant-console-web` under a
  constrained route group;
- `apps/tenant-portal-web` remains sunset (untouched in this slice);
- the shell must isolate partner mode from tenant-admin nav.

This slice satisfies all three:

- partner subtree lives at `apps/tenant-console-web/app/partner/*`;
- `apps/tenant-portal-web` was not modified;
- `components/tenant-shell.tsx` short-circuits when `pathname.startsWith("/partner")`,
  and the partner subtree provides its own `PartnerAuthenticatedShell` /
  `PartnerPublicShell` chrome that exposes only Start / Eligibility / New
  booking / Sign-out — no Users, Audit, API Keys, Webhooks, or Settings.

## What Changed

### Authentication / session

- New cookie-backed partner session helper:
  `apps/tenant-console-web/lib/partner-session.ts`
  - cookie name `drts_partner_session_v1`, base64url JSON, HTTP-only,
    `sameSite=lax`, `secure` in production
  - parses ISO-8601 (`PTxHyMzS`) and numeric `expiresIn` from
    `PartnerBootstrapSession`
  - `requirePartnerSession()` redirects to `/partner/login` when missing
  - `buildPartnerClient(session)` returns a bearer-auth `ApiClient` stamped
    with `x-realm: partner` (and `x-tenant-id` when available)

- New session API:
  `apps/tenant-console-web/app/api/partner/session/route.ts`
  - `POST` calls `createPartnerBootstrapSession({ entrySlug, apiKey })`,
    encodes the session, sets the cookie, and returns the partner entry +
    identity for client-side hydration
  - `DELETE` clears the session cookie

### Public partner surface

- `apps/tenant-console-web/app/partner/(public)/layout.tsx` — redirects
  authenticated callers to `/partner/start`, otherwise wraps children in
  `PartnerPublicShell`.
- `apps/tenant-console-web/app/partner/(public)/login/page.tsx` and
  `partner-login-form.tsx` — credential intake form with explicit error
  surface; never stores credentials client-side after submit.
- `apps/tenant-console-web/app/partner/page.tsx` — top-level redirect that
  routes authenticated callers to `/partner/start` and unauthenticated callers
  to `/partner/login`.

### Authenticated partner surface

- `apps/tenant-console-web/app/partner/(authenticated)/layout.tsx` — calls
  `requirePartnerSession()` and renders `PartnerAuthenticatedShell` with a
  partner-only nav (Start / Eligibility / New booking) plus identity strip and
  sign-out action.
- `apps/tenant-console-web/components/partner-shell.tsx` — both shell
  variants. Authenticated shell explicitly omits any tenant-admin nav entry
  and labels the boundary in the topbar copy and identity strip.
- `apps/tenant-console-web/app/partner/(authenticated)/start/page.tsx` —
  reads the session, renders entry registration snapshot, eligibility-mode
  guidance, booking entry point, and a "what partner mode does NOT get"
  panel; warns explicitly when entry status is non-active.
- `apps/tenant-console-web/app/partner/(authenticated)/eligibility/page.tsx`
  and `eligibility-form.tsx` — eligibility intake driven by entry’s
  `eligibilityMode`; renders `eligible` / `ineligible` / `manual_review`
  outcomes with distinct guidance and only surfaces a "Continue to booking"
  affordance on `eligible`.
- `apps/tenant-console-web/app/api/partner/eligibility/route.ts` — server
  route that pins `entrySlug` from the session and forwards optional fields
  (`referenceToken`, `cardLast4`, `cardholderName`, `benefitReference`,
  `flightNo`) to `verifyPartnerEligibility`.
- `apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx`
  and `booking-create-form.tsx` — booking intake fixing
  `businessDispatchSubtype` from the entry record; the page itself displays
  the eligibility-required gate when applicable and a non-active-entry warning.
- `apps/tenant-console-web/app/api/partner/bookings/route.ts` — server route
  that:
  - rejects requests without a partner session;
  - rejects creation when entry status is not `active` (negative path);
  - rejects creation when `eligibilityMode !== "none"` and no
    `eligibilityVerificationId` is provided (negative path);
  - validates payload shape (pickup/dropoff lat/lng, reservation window,
    passenger contact);
  - calls `createTenantBooking` with `partnerEntrySlug` /
    `eligibilityVerificationId` automatically stamped from the session.
- `apps/tenant-console-web/app/partner/(authenticated)/booking/[bookingId]/page.tsx`
  — confirmation surface that calls `getTenantBooking` over the partner
  bearer client and explicitly states partner mode cannot edit, cancel, or
  override; defers those commands to tenant-admin / ops.

### Tenant-admin surface adjustments

- `apps/tenant-console-web/components/tenant-shell.tsx` — adds early return
  when `pathname.startsWith("/partner")` so the tenant-admin sidebar never
  renders inside partner routes.
- `apps/tenant-console-web/app/page.tsx` — replaces the historical "Partner
  mode is restricted, but not built" callout with a link to `/partner/login`
  and an explicit description of the constrained surface.

### Styling

- `apps/tenant-console-web/app/globals.css` — adds `.partner-shell`,
  `.partner-sidebar`, `.partner-public-shell`, `.partner-login-form`, and
  `.partner-verification-result.{is-success|is-error|is-warning}` styles, plus
  responsive collapse rules. Partner shell uses an entry-driven CSS variable
  (`--partner-accent`) so brand themes can ride the entry record.

## Negative Path Coverage

The acceptance line "partner positive and negative flows are explicitly
represented" is satisfied across the following surfaces:

| Negative flow                         | Where it is represented                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bad credentials                       | `/api/partner/session` returns 401; the login form surfaces the error.                                                                                           |
| Session missing / expired             | `requirePartnerSession()` redirects to `/partner/login` for any authenticated route or API.                                                                      |
| Eligibility ineligible                | `eligibility-form.tsx` renders `Eligibility denied` panel; no booking affordance is shown.                                                                       |
| Eligibility manual_review             | `eligibility-form.tsx` renders `Manual review required` panel with degraded-state guidance.                                                                      |
| Booking attempted without eligibility | `/api/partner/bookings` returns 422; `booking/new/page.tsx` shows the gate banner up front.                                                                      |
| Booking attempted on inactive entry   | `/api/partner/bookings` returns 403; `start/page.tsx` and `booking/new/page.tsx` warn explicitly.                                                                |
| Backend rejection                     | `booking-create-form.tsx` surfaces the backend error string and stops short of redirecting.                                                                      |
| Partner attempts tenant-admin command | Partner shell has no nav entry for those routes and no API surface; tenant-admin pages stay scoped to `(public)` tenant shell only via `pathname` short-circuit. |
| Sign-out                              | `DELETE /api/partner/session` clears the cookie and the form pushes back to `/partner/login`.                                                                    |

## Positive Path Coverage

| Positive flow                                  | Surface                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Sign-in with valid entry slug + API key        | `/partner/login` → `/api/partner/session` → cookie set → `/partner/start` |
| View entry registration / eligibility guidance | `/partner/start`                                                          |
| Verify eligibility (eligible)                  | `/partner/eligibility`                                                    |
| Continue to booking with verification id       | `/partner/booking/new?eligibilityVerificationId=...`                      |
| Submit partner-tagged booking                  | `/api/partner/bookings`                                                   |
| See booking confirmation                       | `/partner/booking/[bookingId]`                                            |
| Sign out                                       | `DELETE /api/partner/session`                                             |

## What Is Intentionally Out Of Scope

- Editing or cancelling bookings from the partner surface — these belong to
  tenant-admin or ops authority per
  `phase1_service_contracts_v1.md` and the topology decision.
- Listing bookings inside partner mode beyond the immediate-confirmation
  page; partner callers are bootstrap-scoped per intake, not session-wide
  queue holders.
- Any cross-partner search or governance affordance.
- Editing the partner entry registration; that lives in platform-admin
  surfaces (`/api/platform-admin/partner-entries/*`).
- Quoted-fare authority; the contract explicitly states partners cannot set
  fare (`packages/contracts/src/index.ts:557-558`).

## Verification

Run from `apps/tenant-console-web`:

```
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint . --max-warnings=0
pnpm test        # vitest run --passWithNoTests
pnpm build       # next build (Turbopack)
```

All four pass. `pnpm build` registers the following partner routes:

```
ƒ /api/partner/bookings
ƒ /api/partner/eligibility
ƒ /api/partner/session
ƒ /partner
ƒ /partner/booking/[bookingId]
ƒ /partner/booking/new
ƒ /partner/eligibility
ƒ /partner/login
ƒ /partner/start
```

No live HTTP verification was performed because partner bootstrap requires a
running `apps/api` with seeded partner entry credentials, which is outside
the local supervisor scope. The negative paths are enforced at the route /
helper layer rather than in the client, so live verification is testable
against a backend without further code changes.

## Reviewer Focus

Reviewer `Codex2` should focus on:

1. **Boundary discipline** — verify that no partner route imports
   tenant-admin navigation or surfaces tenant-admin authority. The grep
   surface is `apps/tenant-console-web/app/partner/**`.
2. **Cookie / session safety** — confirm the partner session cookie is
   `httpOnly`, `sameSite=lax`, base64url-encoded JSON, and that
   `requirePartnerSession` always redirects when the cookie is absent or
   expired.
3. **Negative-path completeness** — verify the matrix in this packet
   matches the actual route handlers and form components. In particular,
   confirm that booking creation cannot succeed with `eligibilityMode !==
"none"` and a missing `eligibilityVerificationId`, and cannot succeed on
   a non-active entry.
4. **Contract conformance** — confirm `CreateTenantBookingCommand` is
   stamped with `partnerEntrySlug` and (when present)
   `eligibilityVerificationId`, and that `businessDispatchSubtype` is sourced
   from the entry record (no client override).
5. **No drift into sunset surfaces** — confirm no edits land in
   `apps/tenant-portal-web`.

## Files Changed / Added

```
apps/tenant-console-web/app/api/partner/bookings/route.ts            (new)
apps/tenant-console-web/app/api/partner/eligibility/route.ts         (new)
apps/tenant-console-web/app/api/partner/session/route.ts             (new)
apps/tenant-console-web/app/globals.css                              (edited)
apps/tenant-console-web/app/page.tsx                                 (edited)
apps/tenant-console-web/app/partner/(authenticated)/booking/[bookingId]/page.tsx   (new)
apps/tenant-console-web/app/partner/(authenticated)/booking/new/booking-create-form.tsx  (new)
apps/tenant-console-web/app/partner/(authenticated)/booking/new/page.tsx           (new)
apps/tenant-console-web/app/partner/(authenticated)/eligibility/eligibility-form.tsx     (new)
apps/tenant-console-web/app/partner/(authenticated)/eligibility/page.tsx          (new)
apps/tenant-console-web/app/partner/(authenticated)/layout.tsx                    (new)
apps/tenant-console-web/app/partner/(authenticated)/start/page.tsx                (new)
apps/tenant-console-web/app/partner/(public)/layout.tsx                           (new)
apps/tenant-console-web/app/partner/(public)/login/page.tsx                       (new)
apps/tenant-console-web/app/partner/(public)/login/partner-login-form.tsx         (new)
apps/tenant-console-web/app/partner/page.tsx                                       (new)
apps/tenant-console-web/components/partner-shell.tsx                  (new)
apps/tenant-console-web/components/tenant-shell.tsx                   (edited)
apps/tenant-console-web/lib/partner-session.ts                        (new)
support/sidecars/SYS-UI-002/SYS-UI-002-SIDECAR-ACCEPTANCE.md          (this file)
```
