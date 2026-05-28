# SD-DP-20260512-006: Partner Booking App Cutover Topology

Status: accepted system-design decision for partner booking repo-local topology and cutover gating
Date: 2026-05-12
Task: `PBK-UI-005`
Owner: `Codex`
Reviewer: `Codex2`

## Decision

As of `2026-05-12`, `apps/partner-booking-web` becomes the only repo-local
landing zone for new partner-booking UI implementation, white-label branding,
and Storybook parity work.

`apps/tenant-console-web/app/partner/` is reclassified as a legacy
compatibility and behavior-reference surface. It may receive only
production-safety fixes, parity fixes, or rollback aids. It is no longer the
place for new partner-booking UI scope.

`tenant-commute-hub` partner mode remains the current live production owner
until a later cutover task records pilot/production gates, named
`cutoverOwner` / `rollbackOwner`, and rollback evidence. This decision does
not switch live traffic.

Partner booking remains a channel layer over existing backend authority. The
new app, the legacy tenant-console partner route, and the external
`tenant-commute-hub` surface may not fork eligibility, booking, audit,
billing, webhook, or partner-entry truth away from `tenant-partner` and the
tenant API authority path.

Live migration granularity is a single partner entry (`entrySlug` or future
host-resolved entry), not a whole tenant. The current Wave 5 `tenantSlug`
route in `apps/partner-booking-web` is valid as a repo-local white-label demo
surface, but it is not itself a production cutover contract.

## Coexistence Policy

| Surface                                 | Role during coexistence                             | Allowed changes                                                                 | Not allowed                                                                                | Exit condition                                                                                   |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `apps/partner-booking-web`              | canonical repo-local partner-booking surface        | new partner UI work, brand work, parity work, future auth/bootstrap integration | inventing backend authority or claiming live cutover without a separate release task       | remains the primary repo-local surface after cutover                                             |
| `apps/tenant-console-web/app/partner/*` | legacy compatibility and behavior-reference surface | production-safety fixes, negative-path parity confirmation, rollback support    | new IA, new partner-only features, broad redesign scope, tenant-admin navigation expansion | remove only through a dedicated cleanup task after all migrated entries clear rollback retention |
| `tenant-commute-hub` partner mode       | current live production owner outside this repo     | existing live traffic, upstream production support                              | repo-local topology claims that it has already been replaced                               | upstream retirement after a later live cutover and rollback closeout                             |

## Cutover Gates

### 1. Repo-local readiness gate

Before any live-routing work is planned, the repo-local UI baseline must stay
true:

1. `PBK-UI-003` parity remains intact for the seven `PB_*` funnel screens.
2. `PBK-UI-004` parity remains intact for the five authority-safe negative
   paths.
3. `apps/partner-booking-web` continues to pass build, lint, and typecheck.
4. Storybook parity for the existing partner-booking artboards stays green.

### 2. Pilot / live-readiness gate

No partner entry may switch live traffic to `apps/partner-booking-web` until a
future task proves all of the following:

1. real auth / bootstrap, eligibility, booking-create, and minimal-tracking
   flows are wired to backend authority instead of mock-only UI state
2. ingress identity resolves by `entrySlug` or host-owned partner entry, not
   by the current Wave 5 `tenantSlug` demo route
3. support hotline, branding metadata, and partner-entry activation data are
   finalized per entry
4. smoke / UAT evidence exists for both happy-path booking and the five
   negative paths
5. named `cutoverOwner` and `rollbackOwner` exist, and the rollout record is
   `rollbackPrepared` before production promotion

### 3. Production cutover gate

Live production switching requires a separate cutover task or runbook with
supervisor and governance sign-off. That later task must record:

1. the specific partner entries being migrated
2. the old route or host that remains valid for rollback
3. the monitoring and support path for the migrated entry
4. the production promotion timestamp and rollback decision record

`PBK-UI-005` resolves topology, transition length, and retirement strategy. It
does not authorize production promotion by itself.

## Transition Length

Two coexistence windows apply:

1. **Repo-local coexistence** starts immediately on `2026-05-12` and remains in
   force until a future live-cutover task reaches `done`.
2. **Per-entry live rollback retention** starts when a specific partner entry is
   promoted to production on the new app and lasts for at least `14` calendar
   days for that entry.

The repo-local legacy route under `apps/tenant-console-web/app/partner/*` may
not be removed until the last actively migrated partner entry has completed its
`14`-day rollback-retention window and no rollback is pending.

## Deprecation Strategy

1. Freeze `apps/tenant-console-web/app/partner/*` to compatibility, safety, and
   rollback-support changes only.
2. Keep all new partner-booking visual, branding, and route work in
   `apps/partner-booking-web`.
3. Land live cutover in dedicated follow-up tasks. Do not piggyback live
   traffic switching into Wave 5 UI-only redesign slices.
4. After all active partner entries migrate and clear rollback retention, open
   a dedicated cleanup task to remove the repo-local legacy route and refresh
   topology docs.
5. Any retirement of external `tenant-commute-hub` partner mode remains an
   upstream production action and must not be claimed from repo-local code
   changes alone.

## Supersession

This decision supersedes the partner-booking landing-zone clauses in:

- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`
- `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`

The supersession is narrow:

- the constrained-capability rule stays in force
- partner booking still may not expose tenant-admin navigation or modules
- backend authority still stays outside the UI shell

## Rationale

- The accepted tenant-console and full-system topology decisions were written
  before Wave 5 produced a dedicated `apps/partner-booking-web` surface. They
  left partner booking inside `apps/tenant-console-web` as a constrained
  sub-surface.
- `PBK-UI-001` through `PBK-UI-004` now provide a dedicated white-label app,
  the seven-screen CTBC reference funnel, and the five authority-safe negative
  paths. Keeping new work split between a new app and the legacy tenant-console
  route would recreate dual ownership.
- The product spec requires partner mode to expose only bootstrap, eligibility,
  booking creation, and minimal tracking while hiding tenant-admin modules. A
  dedicated app preserves that boundary more cleanly than continuing to grow a
  route group inside the tenant console.
- The role and system blueprints still treat `tenant-commute-hub` partner mode
  as the currently implemented live surface. That means repo-local completion
  and live production cutover must remain separate claims.
- The partner-entry setup workflow already models activation at the entry level.
  Using partner entry as the migration unit enables phased cutover and targeted
  rollback instead of a tenant-wide big-bang switch.

## References

- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
  - §`7.5.2 Partner entry setup workflow`
  - §`9.4.2 Partner Booking Mode`
  - §`9.7.1 Tenant login and workspace bootstrap`
- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`
- `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- `docs/02-architecture/phase1-role-scenario-and-negative-flow-matrix-20260430.md`
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- `apps/partner-booking-web/README.md`
