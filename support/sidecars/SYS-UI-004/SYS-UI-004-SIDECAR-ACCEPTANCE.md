# SYS-UI-004 Sidecar Acceptance Packet

- Task: `SYS-UI-004` — Passenger Booking, Status, And Negative-Flow Materialization
- Owner: `Claude`
- Reviewer: `Codex2`
- Parent execution packet:
  `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
- Predecessor (passenger shell): `SYS-UI-003`
  (`support/sidecars/SYS-UI-003/SYS-UI-003-SIDECAR-ACCEPTANCE.md`)
- Date: 2026-05-09
- Artifact class: support-only acceptance packet for the SYS-UI-004 slice

## Purpose

Materialize the passenger-facing booking, status, completion, and
negative-flow routes inside `apps/passenger-web` as concrete subroutes —
one route per outcome — so the complete-system passenger bar can be
audited route-by-route rather than behind hidden conditional branches.

This sidecar records what the slice added, the route inventory that backs
the acceptance line, the authority and ETA framing guardrails preserved,
and the local verification that satisfies the canonical acceptance bar.

## Acceptance Mapping

Acceptance from the parent execution packet
(`docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`,
`SYS-UI-004` section):

| Acceptance line                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| passenger positive and negative core flows are represented route-by-route | Booking request (`/book`), active trip status (`/trip`), cancel (`/trip/cancel`), completion (`/trip/completed`), read-only authority (`/trip/read-only`), and the negative outcomes booking-denied (`/book/denied`), ineligible (`/book/ineligible`), no-supply (`/book/no-supply`), degraded (`/book/degraded`), cancelled (`/trip/cancelled`), and reauth-required (`/trip/reauth-required`) are all materialized as separate static routes in `apps/passenger-web`. |

## Route Inventory

### Positive flows

| Route             | Outcome             | Notes                                                                                            |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `/book`           | Request submitted   | Booking entry; quote-then-confirm framing; ETA always shown as estimate; links to all neg flows. |
| `/trip`           | Trip in progress    | Active trip status with ETA, vehicle, driver, authority, and lifecycle phases.                   |
| `/trip/cancel`    | Cancel requested    | Cancel-window mirror; reason capture optional; offered only when authority allows.               |
| `/trip/completed` | Completed           | Post-trip summary; routes to receipt center; defers tip / complaint / rating to future lanes.    |
| `/trip/read-only` | Read-only authority | Trip owned by tenant / partner / concierge; explicit ownership matrix; no fake mutation buttons. |

### Negative flows

| Route                   | Outcome            | Notes                                                                                              |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `/book/denied`          | Denied by policy   | Public-facing reason; internal codes hidden; support exit; no auto-retry, no silent downgrade.     |
| `/book/ineligible`      | Eligibility failed | Gate-by-gate result (identity / payment / program); no PII leakage; no silent downgrade.           |
| `/book/no-supply`       | No driver matched  | Distinct from `denied` and `unsupported`; explicit retry / schedule / fallback affordances.        |
| `/book/degraded`        | Read-only fallback | Affordance matrix (read available, mutation blocked); no fake retries; signal-driven.              |
| `/trip/cancelled`       | Cancelled          | Cancelling actor named (rider / driver / platform); cancellation receipt deferred to receipt lane. |
| `/trip/reauth-required` | Session expired    | Trip data hidden until reauth; routes to `/auth`; reuses unauthenticated guardrails.               |

### Pre-existing baseline (from SYS-UI-003)

The following routes were materialized by `SYS-UI-003` and are still in
place. SYS-UI-004 only enriches the home / trips / receipts pages with
links into the new outcome routes; it does not replace them.

| Route              | Owner task                                               |
| ------------------ | -------------------------------------------------------- |
| `/`                | SYS-UI-003 (now also surfaces SYS-UI-004 flow inventory) |
| `/auth`            | SYS-UI-003                                               |
| `/trips`           | SYS-UI-003 (extended cross-links)                        |
| `/receipts`        | SYS-UI-003 (extended cross-links)                        |
| `/unauthenticated` | SYS-UI-003                                               |
| `/unsupported`     | SYS-UI-003                                               |

## Authority & ETA Guardrails Preserved

- **ETA stays an estimate.** Every surface that displays a time window
  frames it as an estimate (`/book`, `/trip`, `/trip/completed`). No route
  shows a guaranteed pickup minute.
- **Mutation maps to authority.** Cancel only appears on `/trip` and
  `/trip/cancel` (rider authority). Read-only trips at `/trip/read-only`
  intentionally omit cancel/reschedule/override entirely — they are not
  rendered as disabled buttons because that would mislead.
- **No invented receipt delivery channel.** `/receipts` and
  `/trip/completed` route to the receipt lane and never claim a new
  email/SMS delivery surface.
- **No silent retries or auto-downgrade.** Negative routes
  (`/book/denied`, `/book/ineligible`, `/book/no-supply`, `/book/degraded`,
  `/trip/cancelled`, `/trip/reauth-required`) all surface explicit rider
  actions; none of them silently retry, auto-issue credits, or auto-switch
  fare program.
- **Source-channel ownership stays authoritative.** Tenant / partner /
  concierge bookings flow through `/trip/read-only` and the cross-channel
  matrix names where mutation actually lives, instead of duplicating
  authority into the passenger surface.

## What Changed

### New routes (`apps/passenger-web/app/`)

```
app/book/page.tsx
app/book/denied/page.tsx
app/book/ineligible/page.tsx
app/book/no-supply/page.tsx
app/book/degraded/page.tsx
app/trip/page.tsx
app/trip/cancel/page.tsx
app/trip/completed/page.tsx
app/trip/read-only/page.tsx
app/trip/cancelled/page.tsx
app/trip/reauth-required/page.tsx
```

### New shared component

```
components/flow-route-cards.tsx
```

`FlowRouteCards` renders the booking / trip flow inventory consistently
on the home page, the booking request page, and the active trip page so
each outcome route is reachable from at least one parent surface.

### Edited

```
app/page.tsx                       (home — surfaces booking + trip flow inventories and new entry CTAs)
app/trips/page.tsx                 (history — links into completed / read-only / cancelled outcome routes)
app/receipts/page.tsx              (receipts — links into completed / read-only / unsupported outcomes)
app/globals.css                    (state pills, kv grid, check list, matrix table, page-shell-block, flow card styles)
components/passenger-shell.tsx     (sidebar footnote and topbar meta-pill copy refreshed for SYS-UI-004 scope)
lib/navigation.ts                  (Adds Request a Ride and Active Trip nav entries; exports flow-route inventories; subroute-aware active-item match)
```

### Sidecar artifact

```
support/sidecars/SYS-UI-004/SYS-UI-004-SIDECAR-ACCEPTANCE.md  (this file)
```

## What Is Intentionally Out Of Scope

- **Live backend integration.** The booking / cancel / status routes do
  not call a real API in this slice. The contract is route topology and
  authority framing; live `POST /bookings`, `POST /trips/:id/cancel`, and
  status streaming belong to a downstream wave.
- **Tip flow, complaint flow, rating flow.** Each lives in its own future
  lane and is intentionally not added here, even though `/trip/completed`
  is the natural anchor for them.
- **Cancellation fee receipt rendering.** Receipt artifacts are owned by
  the receipt lane; this slice only links to the receipt center.
- **Cross-surface auth matrix.** Login / invite / suspend / rotate / RBAC
  matrix is `SYS-UI-006` scope.
- **Concierge / call-point.** Materialization is `SYS-UI-005` scope.
- **Forwarded driver/ops/admin authority completion.** Owned by
  `SYS-UI-007`.

## Verification

Run from `apps/passenger-web`:

```
pnpm typecheck   # tsc --noEmit                   PASS
pnpm lint        # eslint . --max-warnings=0      PASS
pnpm test        # vitest run --passWithNoTests   PASS (no tests in target)
pnpm build       # next build (Turbopack)         PASS — 17 application routes registered
```

`pnpm build` registers the following application routes:

```
○ /
○ /auth
○ /book
○ /book/degraded
○ /book/denied
○ /book/ineligible
○ /book/no-supply
○ /receipts
○ /trip
○ /trip/cancel
○ /trip/cancelled
○ /trip/completed
○ /trip/read-only
○ /trip/reauth-required
○ /trips
○ /unauthenticated
○ /unsupported
```

(`_not-found` is the framework default and is omitted from this list.)

No live HTTP verification was performed because this slice intentionally
does not wire to a live booking backend; route topology and authority
framing are the contract this slice satisfies. Downstream booking
integration will inherit these routes as the materialized acceptance
bar.

## Reviewer Focus

Reviewer `Codex2` should focus on:

1. **Route inventory completeness** — confirm that `/book` and `/trip`
   have outcome routes for the full set named in the acceptance line:
   denial, ineligible, no-supply, degraded, cancelled, plus completion
   and read-only. The matrix in `Route Inventory` mirrors the build
   output above.
2. **Authority discipline** — confirm `/trip/read-only` does not surface
   mutating affordances and that `/trip/cancel` is reachable only when
   the parent trip framing actually owns cancel authority (the page
   itself reflects the policy snapshot in copy, not in fake JS).
3. **ETA framing** — spot-check that no route claims a guaranteed pickup
   minute. The home, `/book`, `/trip`, and `/trip/completed` surfaces
   all explicitly frame the pickup window as an estimate.
4. **No invented delivery channels** — confirm `/receipts` and
   `/trip/completed` route to the receipt lane and do not claim a new
   email/SMS channel.
5. **Negative-route honesty** — confirm denial / ineligible /
   no-supply / degraded / cancelled / reauth surfaces each name an
   explicit safe action and do not silently retry, downgrade, or blame
   the rider.
6. **Boundary discipline** — confirm SYS-UI-004 did not modify any path
   outside `apps/passenger-web/` and `support/sidecars/SYS-UI-004/`.

## Files Changed / Added

```
apps/passenger-web/app/book/degraded/page.tsx              (new)
apps/passenger-web/app/book/denied/page.tsx                (new)
apps/passenger-web/app/book/ineligible/page.tsx            (new)
apps/passenger-web/app/book/no-supply/page.tsx             (new)
apps/passenger-web/app/book/page.tsx                       (new)
apps/passenger-web/app/trip/cancel/page.tsx                (new)
apps/passenger-web/app/trip/cancelled/page.tsx             (new)
apps/passenger-web/app/trip/completed/page.tsx             (new)
apps/passenger-web/app/trip/page.tsx                       (new)
apps/passenger-web/app/trip/reauth-required/page.tsx       (new)
apps/passenger-web/app/trip/read-only/page.tsx             (new)
apps/passenger-web/app/page.tsx                            (edited)
apps/passenger-web/app/trips/page.tsx                      (edited)
apps/passenger-web/app/receipts/page.tsx                   (edited)
apps/passenger-web/app/globals.css                         (edited)
apps/passenger-web/components/flow-route-cards.tsx         (new)
apps/passenger-web/components/passenger-shell.tsx          (edited)
apps/passenger-web/lib/navigation.ts                       (edited)
support/sidecars/SYS-UI-004/SYS-UI-004-SIDECAR-ACCEPTANCE.md (this file, new)
```
