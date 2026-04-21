# MSC-T1-001 Tenant Surface Closeout

**Task:** `MSC-T1-001`  
**Owner:** Codex2  
**Reviewer:** Claude  
**Date:** 2026-04-20  
**Status:** submitted for review

---

## Purpose

This packet closes the three acceptance questions on `MSC-T1-001`:

1. confirm the production tenant surface contract with `tenant-commute-hub`
2. verify that the required tenant workflows map to `drts-fleet-platform` APIs and authority boundaries
3. record whether any Phase 1 tenant flow is still blocked by retired `apps/tenant-portal-web` assumptions

This is a closeout packet only. It does not change canonical product truth.

---

## Evidence Sources

| Source                                                                            | Why it matters                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ROADMAP.md` "Tenant Portal Topology Note"                                        | fixes `tenant-commute-hub` as the sole production tenant UI                      |
| `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`              | records that `apps/tenant-portal-web` is retired and outside production topology |
| `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md` §§1-6 | canonical cutover, route inventory, and `/api/tenant/*` mapping                  |
| `docs/02-architecture/tenant-commute-hub-boundary.md` §§1-5                       | consumer obligations and forbidden authority leaks                               |
| `docs/02-architecture/authority/rgp-002-authority-map.md` §§2-5                   | cross-repo source-of-truth matrix                                                |
| `docs/04-uat/phase1-uat-scenarios.md` Overview and §1                             | UAT now treats `tenant-commute-hub` as the tenant portal surface                 |
| `docs/04-uat/fbp-014a-e2e-matrix.md` §§2, 4.1, 4.4                                | cross-surface E2E guardrails and tenant-booking chains                           |
| `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`                | repo implementation evidence for tenant-facing authority endpoints               |
| `apps/tenant-portal-web/README.md`                                                | frozen-reference shell posture for the retired app                               |
| `../tenant-commute-hub/src/App.tsx`, `../tenant-commute-hub/src/lib/drtsApi.ts`   | local external checkout confirms routed pages and shared API-client posture      |

---

## Closeout Answer

### 1. Production tenant surface contract

The production tenant surface contract is stable and already recorded:

- `tenant-commute-hub` is the only production tenant UI.
- `drts-fleet-platform` owns tenant authority behind `/api/tenant/*`.
- `apps/tenant-portal-web` is retired, frozen for reference, and explicitly outside production topology.

This is consistent across `ROADMAP.md`, the `FBP-007` sunset record, the `FBP-006` cutover spec, the cross-repo authority map, and the tenant boundary contract. There is no conflicting active topology statement in the current repo.

### 2. Tenant workflows vs. repo authority

The required tenant workflows map to this repo's APIs and authority boundaries rather than to a local frontend-owned backend:

| Tenant workflow                         | External tenant route(s)                                     | Backend authority in this repo                                                                  |
| --------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Dashboard / tenant summary              | `/`                                                          | `GET /api/identity/context` plus tenant reads enumerated in `FBP-006`                           |
| Booking create / list / detail / cancel | `/bookings/new`, `/booking-list`, `/booking-list/:bookingId` | `POST/GET/PUT /api/tenant/bookings*`                                                            |
| Passenger directory                     | `/passengers`                                                | `GET/POST /api/tenant/passengers`                                                               |
| Address book                            | `/addresses`                                                 | `GET/POST /api/tenant/addresses`                                                                |
| Reports                                 | `/reports`                                                   | `GET/POST /api/tenant/reports/jobs`, `GET /api/tenant/reports/:jobId`                           |
| API keys                                | `/api-keys`                                                  | `GET/POST /api/tenant/api-keys`, rotate/revoke commands                                         |
| Webhooks                                | `/webhooks`                                                  | webhook CRUD/test/delivery reads under `/api/tenant/webhooks*`                                  |
| Billing / invoices                      | `/billing`                                                   | billing profile and invoice endpoints under `/api/tenant/billing/*` and `/api/tenant/invoices*` |
| Notifications                           | `/notifications`                                             | `/api/tenant/notifications*`                                                                    |
| SLA profile                             | `/sla`                                                       | `/api/tenant/sla*`                                                                              |
| Tenant users / roles                    | `/users`                                                     | `/api/tenant/users*`, `/api/tenant/roles`                                                       |
| Audit trail                             | `/audit`                                                     | `GET /api/tenant/audit`                                                                         |

`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` confirms that this repo already exposes the tenant-partner authority slice for passengers, addresses, users, roles, API keys, notifications, and related command paths. `FBP-006` supplies the complementary route inventory for bookings, reports, billing, webhooks, SLA, and audit.

`docs/04-uat/phase1-uat-scenarios.md` and `docs/04-uat/fbp-014a-e2e-matrix.md` both assume the same topology: tenant entry begins at `tenant-commute-hub`, but the workflow evidence chain proceeds through this repo's APIs, dispatch surfaces, billing, and audit.

### 3. Retired shell blocker check

No critical Phase 1 tenant workflow is currently blocked by the retired `apps/tenant-portal-web` shell.

Reasons:

- `apps/tenant-portal-web/README.md` marks the internal app as `SUNSET - NOT PRODUCTION`, frozen reference only.
- `docs/04-uat/phase1-uat-scenarios.md` moved tenant UAT coverage to `tenant-commute-hub`.
- `docs/04-uat/fbp-014a-e2e-matrix.md` guardrail `G1` forbids using the retired shell as the tenant entry surface.
- The local `../tenant-commute-hub` checkout still contains the actual tenant routes (`/booking-list`, `/bookings/new`, `/passengers`, `/addresses`, `/reports`, `/api-keys`, `/webhooks`, `/billing`, `/notifications`, `/sla`, `/users`, `/audit`) in `src/App.tsx`.
- The same checkout uses shared `@drts/api-client` wiring in `src/lib/drtsApi.ts` and shows no current Supabase runtime/import hits via `rg -n '@supabase|createClient|supabase/functions|supabase/migrations'`.

The only residual artifacts observed in the external checkout are empty scaffolding directories:

- `../tenant-commute-hub/src/integrations/supabase/`
- `../tenant-commute-hub/supabase/migrations/`

These are cleanup leftovers, not active authority paths. They do not reintroduce a Phase 1 dependency on `apps/tenant-portal-web`, and they do not block tenant workflows in this repo.

---

## Findings

| Finding                                                                                          | Result                                                          |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Production tenant topology is unambiguous                                                        | PASS                                                            |
| Cross-repo authority boundary is documented and consistent                                       | PASS                                                            |
| Required tenant workflows map to `/api/tenant/*` or related backend-owned endpoints in this repo | PASS                                                            |
| UAT and E2E evidence families use `tenant-commute-hub` rather than the retired shell             | PASS                                                            |
| Local external checkout still depends on Supabase runtime or local backend authority             | PASS - no runtime/import hits found                             |
| Retired `apps/tenant-portal-web` remains a blocker for Phase 1 tenant flows                      | PASS - no blocker found                                         |
| External repo cleanup is cosmetically perfect                                                    | PARTIAL - empty legacy directories remain, but are non-blocking |

---

## Closeout Statement

`MSC-T1-001` can be closed from a tenant-surface authority perspective once reviewer confirmation is complete.

The current repo state supports the following claim:

> Phase 1 tenant workflows are expected to enter through external `tenant-commute-hub`, consume backend authority from `drts-fleet-platform`, and are not blocked by the retired `apps/tenant-portal-web` shell.

What remains is narrow and non-blocking:

- optional cleanup of empty legacy directories in `../tenant-commute-hub`
- broader cross-surface operational hardening handled by `MSC-I1-001`
- final narrative synchronization handled by `MSC-N1-001`

---

## Reviewer Notes

Please verify:

1. the packet does not over-claim code-level authority beyond what `FBP-006`, `RGP-002`, and the local checkout support
2. the "no blocker from retired shell" conclusion is justified by the UAT/E2E topology and local route/client evidence
3. the residual empty external directories are correctly treated as non-blocking cleanup rather than reopened product-semantic drift

If accepted, approve this task back to owner for final status handling.
