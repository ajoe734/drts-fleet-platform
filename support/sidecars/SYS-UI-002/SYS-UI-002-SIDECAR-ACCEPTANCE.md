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
  - cookie name `drts_partner_session_v2`, HMAC-SHA256-signed payload
    (format `<v2>.<base64url(json)>.<base64url(hmac)>`), HTTP-only,
    `sameSite=lax`, `secure` in production
  - parses ISO-8601 (`PTxHyMzS`) and numeric `expiresIn` from
    `PartnerBootstrapSession`
  - `requirePartnerSession()` redirects to `/partner/login` when missing
  - `buildPartnerClient(session)` returns a bearer-auth `ApiClient` stamped
    with `x-realm: partner` (and `x-tenant-id` when available)

#### Cookie tamper hardening (Round 2 fix)

The reviewer flagged that the v1 partner cookie stored the full
`PartnerSessionRecord` as unsigned base64url JSON, so a caller could mutate
`partnerEntry.status`, `partnerEntry.eligibilityMode`, `partnerEntry.entrySlug`,
`identity.tenantId`, or `expiresAt` client-side and bypass the local active-entry
or eligibility gate before the backend ever saw the request. The fix:

- Signing — `encodeSession` HMAC-SHA256s the payload with a server secret
  (`DRTS_PARTNER_SESSION_SECRET`), prepended with the version tag, and emits
  `<v2>.<payload>.<sig>`. `decodeSession` recomputes the HMAC and rejects on
  any mismatch via `crypto.timingSafeEqual`.
- Versioned cookie name — bumped to `drts_partner_session_v2`, so any
  in-flight unsigned `_v1` cookie from prior dev sessions is treated as
  absent (forced re-login). `clearPartnerSession` deletes both the active
  cookie and the legacy `_v1` cookie.
- Production hard-fail — `getSessionSecret()` requires
  `DRTS_PARTNER_SESSION_SECRET` (>=32 chars) when `NODE_ENV === "production"`
  and throws otherwise. In non-production, a deterministic dev fallback secret
  keeps local development unblocked.
- Threat coverage — any tampered payload (e.g. flipping `status` to
  `"active"` or replacing `entrySlug`/`tenantId`) yields a different HMAC and
  fails verification, so `getPartnerSession()` returns `null` and the route
  layer responds 401 / redirects to `/partner/login`. The bearer access token
  itself is still backend-issued and unmodified by the client; the cookie
  signature now binds the cached `partnerEntry` / `identity` snapshot to the
  same trust root.

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
   `httpOnly`, `sameSite=lax`, HMAC-signed (`v2.<payload>.<sig>`), that
   tampered payloads are rejected via `timingSafeEqual` in `decodeSession`,
   that `requirePartnerSession` always redirects when the cookie is absent,
   tampered, or expired, and that `DRTS_PARTNER_SESSION_SECRET` is enforced
   in production.
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

---

## Sidecar Addendum (SYS-UI-002-SIDECAR-ACCEPTANCE)

- Sidecar Task: `SYS-UI-002-SIDECAR-ACCEPTANCE`
- Parent Task: `SYS-UI-002`
- Helper Kind: `acceptance_packet`
- Sidecar Owner / Reviewer: `Claude` / `Claude2`
- Parent Owner / Reviewer: `Claude2` / `Codex2`
- Class: support-only; no canonical-truth mutation

This addendum is appended by the sidecar owner. It does not rewrite the parent
acceptance content above; it adds the explicit acceptance checklist and the
dependency map that the sidecar brief is responsible for.

### Acceptance Checklist (parent SYS-UI-002)

The parent execution packet acceptance lines decompose into the following
explicit, individually verifiable items. Each item maps to a section above.

- [x] Chosen target app typecheck passes —
      `pnpm --filter @drts/tenant-console-web typecheck`
      (Acceptance Mapping; Verification).
- [x] Chosen target app lint passes (`--max-warnings=0`) —
      `pnpm --filter @drts/tenant-console-web lint` (Verification).
- [x] Chosen target app test passes (`vitest run --passWithNoTests`) —
      `pnpm --filter @drts/tenant-console-web test` (Verification).
- [x] Chosen target app production build passes (Turbopack); 9 partner routes
      registered (Verification, Files Changed / Added).
- [x] Partner positive flow: login → start → eligibility (eligible) → booking
      create → confirmation (Positive Path Coverage).
- [x] Partner negative flow: bad credentials, missing/expired session,
      ineligible, manual_review, missing eligibility verification id, inactive
      entry, backend rejection, sign-out, attempted tenant-admin command
      (Negative Path Coverage).
- [x] Boundary discipline: partner subtree carries no tenant-admin nav; the
      tenant shell short-circuits inside `/partner/*` (Landing-Zone Conformance;
      `apps/tenant-console-web/components/tenant-shell.tsx`).
- [x] Cookie / session safety: `httpOnly`, `sameSite=lax`, HMAC-SHA256-signed
      payload (`v2.<payload>.<sig>`), `timingSafeEqual` rejection, legacy v1
      cookies wiped, production hard-fails without
      `DRTS_PARTNER_SESSION_SECRET` (Cookie tamper hardening — Round 2 fix).
- [x] Contract conformance: `CreateTenantBookingCommand` is stamped with
      `partnerEntrySlug` and (when present) `eligibilityVerificationId`;
      `businessDispatchSubtype` is sourced from the entry record only
      (Authenticated partner surface; What Is Intentionally Out Of Scope).
- [x] No drift into sunset surfaces: `apps/tenant-portal-web` is not
      modified (Landing-Zone Conformance).
- [x] Out-of-scope authority is explicitly disclaimed on the confirmation
      surface (no edit / cancel / override) (Authenticated partner surface;
      What Is Intentionally Out Of Scope).

### Acceptance Checklist (sidecar SYS-UI-002-SIDECAR-ACCEPTANCE)

- [x] Create support artifacts only — this addendum lives entirely under
      `support/sidecars/SYS-UI-002/`.
- [x] Do not edit canonical truth — no L1 product truth, contract truth,
      runtime/registry/governance code, or parent acceptance content above this
      divider was modified by the sidecar owner.
- [ ] Hand off the packet to the assigned reviewer (`Claude2`) — to be
      performed via `scripts/ai-status.sh handoff` after this content lands.

### Dependency Map

The parent task `SYS-UI-002` lists three upstream dependencies. This map
records what each upstream actually contributed to the SYS-UI-002 slice and
where the seam between them is enforced.

| Upstream                                         | Status | What it contributed to SYS-UI-002                                                                                                                                                                                                                                                                                                                                   | Seam in this slice                                                                                                                                                                               |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SYS-UI-001` (this repo)                         | done   | Topology decision (`SD-DP-20260509-005`): partner mode lives inside `apps/tenant-console-web` under a constrained route group; `apps/tenant-portal-web` is sunset; partner shell must not leak tenant-admin nav. Execution packet `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md` defines the acceptance lines that this slice satisfies. | Implemented as `apps/tenant-console-web/app/partner/*` route group plus `pathname.startsWith("/partner")` short-circuit in `components/tenant-shell.tsx`. `apps/tenant-portal-web` is untouched. |
| `P1PX-FE-001` (sister repo `tenant-commute-hub`) | done   | Branded partner booking funnel pattern: entry-slug-driven login, partner-only chrome, eligibility / branding carried through auth → layout → booking. Reference for partner shell composition and entry-driven theming. The sister repo is not consumed at runtime by SYS-UI-002.                                                                                   | Materialized in repo-local form via `components/partner-shell.tsx` (`PartnerAuthenticatedShell` / `PartnerPublicShell`) and entry-driven `--partner-accent` CSS variable in `app/globals.css`.   |
| `TEN-UI-008` (this repo)                         | done   | Real tenant identity / RBAC cutover (`apps/tenant-portal-web`, `packages/api-client`). Confirms the bearer-auth + `x-tenant-id` transport contract and the `ApiClient` surface that the partner client wraps.                                                                                                                                                       | Reused via `buildPartnerClient(session)` in `lib/partner-session.ts` returning a bearer-auth `ApiClient` stamped with `x-realm: partner` and `x-tenant-id` when available.                       |

Notes:

- All three upstream tasks are recorded `done` in `ai-status.json` at the
  time this addendum lands, so the sidecar publishes against a settled
  dependency baseline.
- `P1PX-FE-001` shipped its commit in a sister repo (`tenant-commute-hub`).
  SYS-UI-002 does not depend on that artifact at build or runtime; it only
  inherits the design pattern. Recording this explicitly so the reviewer
  does not look for a cross-repo wiring step that does not exist.

### Reviewer Pointers (sidecar)

For sidecar reviewer `Claude2`, the verification surface is small:

1. Open `support/sidecars/SYS-UI-002/SYS-UI-002-SIDECAR-ACCEPTANCE.md` and
   confirm only this addendum was added by the sidecar owner; the parent
   acceptance body above the divider is unchanged.
2. Spot-check that the Acceptance Checklist items map to existing sections
   (Acceptance Mapping, Negative/Positive Path Coverage, Cookie tamper
   hardening, Files Changed / Added, Verification).
3. Spot-check that the Dependency Map matches `ai-status.json` (`SYS-UI-001`,
   `P1PX-FE-001`, `TEN-UI-008` all `done`).
4. Confirm no canonical truth (L1 product specs, service contracts,
   migration plan, or implementation code outside the parent slice) was
   modified by the sidecar.

### Out Of Scope For The Sidecar

- Re-verifying parent typecheck / lint / test / build. The parent acceptance
  packet records those runs; rerunning is the parent reviewer (`Codex2`)'s
  authority, not the sidecar reviewer's.
- Approving or rejecting the parent SYS-UI-002 task. The sidecar approves
  only the support packet itself.
- Mutating any path outside `support/sidecars/SYS-UI-002/`.
