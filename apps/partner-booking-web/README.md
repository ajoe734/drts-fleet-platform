# `@drts/partner-booking-web`

White-label partner booking surface for DRTS Phase 1. Each tenant (e.g.
CTBC World Elite) is reached through the `[tenantSlug]` route segment so a
single deployable can serve any number of partner brands.

## Status

This app now carries the PBK-UI-003 CTBC reference funnel baseline and the
2026-06 credit-card airport transfer release extension:

- **Dev deployed.** `deploy-dev.yml` builds and deploys this app alongside the
  shared dev stack so bank cardholder booking can be verified on Cloud Run.
- Brand layering now resolves through
  `packages/ui-tokens/src/brands.ts` with shared CTBC / CATHAY / TAISHIN /
  DBS credit-card airport-transfer issuer templates plus FUBON insurance,
  LION travel, and GRAND concierge reference templates.
- The CTBC reference funnel (7 screens) now lands in **PBK-UI-003**.
- The program-specific `card` / `insurance` / `travel` website funnel states
  live under `/[tenantSlug]/program/site`; banking-app embed identity states
  live under `/[tenantSlug]/program/embed`.
- Authority-safe negative paths are implemented as direct gate routes in
  **PBK-UI-004**.
- The cutover policy between this app and the legacy
  `tenant-console-web/app/partner/` route is recorded in
  `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
  (`PBK-UI-005`).

## Routing rules (white-label invariant)

- The root path `/` is **not** a product surface. It is a developer-facing
  index that lists known brand slugs to make tenant entry obvious during
  bring-up.
- Every functional surface lives under `/[tenantSlug]/...`. The dynamic
  segment is required — there is no "default tenant" in this app.
- The PBK-UI-003 CTBC reference funnel is served as seven explicit Next.js
  routes grouped under `app/[tenantSlug]/(public|authenticated)/...`:
  `landing` (the tenant root), `eligibility`, and `help` sit in
  `(public)/`; `book`, `confirmed`, `trips`, and `receipt` sit in
  `(authenticated)/`. Each page renders the shared
  `PartnerBookingReferenceFunnel` (`@drts/ui-web/partner-booking`) with a fixed
  `activeScreen`, so the funnel navigator's hrefs map one-to-one onto
  those routes.
- `app/[tenantSlug]/layout.tsx` resolves the brand via `lib/brand.ts`. An
  unknown slug returns `notFound()` so we cannot accidentally render an
  unbranded experience.
- Brand records are sourced from `@drts/ui-tokens` `BRAND_TEMPLATES`, including
  display metadata, support hotline, card-art seed data, and per-brand surface
  ramps.
- Credit-card airport-transfer website booking and banking-app embedded
  hand-off are separate surfaces:
  `http://localhost:3007/ctbc` is the standalone white-label website,
  `http://localhost:3007/ctbc/program/site` is the seven-screen funnel state
  QA surface, and `http://localhost:3007/ctbc/program/embed` is the bank-app
  identity hand-off surface. The same pattern works for `cathay`, `taishin`,
  and `dbs`; insurance (`fubon`) and travel (`lion`) expose the site funnel but
  do not expose the banking-app embed surface.

## Dev / Build / Lint / Typecheck

```bash
pnpm --filter @drts/partner-booking-web dev        # http://localhost:3007
pnpm --filter @drts/partner-booking-web build
pnpm --filter @drts/partner-booking-web typecheck
pnpm --filter @drts/partner-booking-web lint
```

### Why port 3007 instead of 3006?

The original PBK-UI-001 brief suggested port 3006 ("non-conflicting,
suggested 3006"). `apps/concierge-portal-web` has since taken 3006, so this
app uses **3007** to honor the actual non-conflicting principle. If a later
task reorganizes the port map, update both `package.json` and the
`Dockerfile` `EXPOSE`/`PORT` together.

## Storybook

Storybook is wired centrally in `packages/ui-web` (see SBK-UI-001). The
`Partner Booking/CTBC Funnel` stories compare the built white-label screens
against the matching `Partner Booking.html#PB_*` artboard anchors:

- `PB_Landing`
- `PB_Eligibility`
- `PB_Book`
- `PB_Confirmed`
- `PB_Trips`
- `PB_Receipt`
- `PB_Help`
