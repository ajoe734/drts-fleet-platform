# SD-DP-20260508-004: Tenant Console Productization Topology

Status: accepted system-design decision for tenant console productization topology
Date: 2026-05-08
Task: `TEN-UI-001`
Owner: `Codex`
Reviewer: `Claude`

## Decision

As of 2026-05-08, this repo will **not** reactivate `apps/tenant-portal-web`
for tenant-console product work.

The formal in-repo landing zone for the new tenant console is a **new planned
target**: `apps/tenant-console-web`.

The existing `apps/tenant-portal-web` app remains sunset under
`SUNSET-001-tenant-portal-web` / `FBP-007` and stays in the repo only as a
historical reference shell.

`tenant-commute-hub` remains the **current production tenant UI** until a
separate cutover task explicitly changes live production topology. Both the
current external UI and the future in-repo tenant console remain pure UI
consumers of `drts-fleet-platform` `/api/tenant/*`.

## Route Ownership

`apps/tenant-console-web` owns the formal tenant-admin surface once created:

- `/`
- `/bookings`
- `/bookings/[bookingId]`
- `/bookings/new`
- `/passengers`
- `/addresses`
- `/cost-centers`
- `/rules`
- `/invoices`
- `/reports`
- `/api-keys`
- `/webhooks`
- `/audit`
- `/users`
- `/settings`

Partner booking mode may live in the same app only as a constrained sub-surface
with a separate route group and auth scope. It must not reuse the full
tenant-admin navigation or expose tenant-admin modules by default.

`apps/tenant-portal-web` owns **no active tenant-console routes** after this
decision. Its existing pages remain frozen historical placeholders only.

`tenant-commute-hub` continues to own current production traffic until an
explicit later cutover decision says otherwise.

## Migration Rules

1. Do not add new product features, route renames, or auth model upgrades to
   `apps/tenant-portal-web`.
2. `TEN-UI-002` and all downstream tenant-console UI tasks must target the new
   `apps/tenant-console-web` landing zone plus shared packages such as
   `@drts/ui-web`, `@drts/contracts`, and `@drts/api-client`.
3. If useful view logic or fixtures exist in the sunset shell, promote them
   into shared packages or reimplement them in the new target. Do not
   "unsunset" `apps/tenant-portal-web` by continuing feature work there.
4. `/api/tenant/*` remains the only backend authority surface. No tenant UI may
   fork its own state machine, billing truth, audit truth, or webhook delivery
   behavior.
5. A later cutover task must explicitly decide whether production traffic stays
   on external `tenant-commute-hub`, migrates to `apps/tenant-console-web`, or
   keeps both with documented role separation. Dual-maintaining two ambiguous
   tenant-admin products is not allowed.

## Rationale

- `FBP-007` already retired `apps/tenant-portal-web` as a production target,
  so reactivating it would create a direct contradiction with accepted sunset
  machine truth.
- The current shell still carries retired naming, minimal bootstrap layout, and
  demo-style cookie RBAC assumptions, which makes "evolve in place" a semantic
  rollback instead of a clean productization move.
- The 2026-05-08 tenant-console product spec and design execution packet define
  a broader management-console information architecture than the sunset shell
  currently expresses.
- Keeping the sunset shell frozen preserves historical implementation evidence,
  including `TEN-MP-001`, without forcing new product work into a path that was
  explicitly retired.

## Consequences

- `TEN-UI-002` is expected to create `apps/tenant-console-web` and establish
  the shared management shell there.
- `XS-UI-001` should map tenant-console routes and commands against the new app
  target, not against `apps/tenant-portal-web`.
- Partner mode stays an explicit constrained mode rather than an accidental
  subset of tenant-admin navigation.
