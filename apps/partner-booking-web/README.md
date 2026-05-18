# `@drts/partner-booking-web`

White-label partner booking surface for DRTS Phase 1. Each tenant (e.g.
CTBC World Elite) is reached through the `[tenantSlug]` route segment so a
single deployable can serve any number of partner brands.

## Status

This app now carries the PBK-UI-003 CTBC reference funnel baseline. Per
`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`:

- **Wave 5 — not deployed.** CI must build / lint / typecheck cleanly, but no
  live deploy in this wave.
- Brand layering now resolves through
  `packages/ui-tokens/src/brands.ts` with shared CTBC / CATHAY / GRAND demo
  templates.
- The CTBC reference funnel (7 screens) now lands in **PBK-UI-003**.
- Authority-safe negative paths now land in **PBK-UI-004** as direct tenant
  routes that reuse the existing eligibility / book artboards with
  scenario-specific overlays.
- The cutover policy between this app and the legacy
  `tenant-console-web/app/partner/` route is a **PBK-UI-005** decision doc.

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
  `PartnerBookingReferenceFunnel` (`@drts/ui-web`) with a fixed
  `activeScreen`, so the funnel navigator's hrefs map one-to-one onto
  those routes.
- The PBK-UI-004 authority-safe negative paths are preserved as explicit
  routes under `/[tenantSlug]/eligible`, `/[tenantSlug]/ineligible`,
  `/[tenantSlug]/manual_review`, `/[tenantSlug]/inactive`, and
  `/[tenantSlug]/eligibility-required`. These routes reuse the existing
  `eligibility` / `book` screens via `activeScenario` instead of introducing
  a separate negative-path artboard family.
- `app/[tenantSlug]/layout.tsx` resolves the brand via `lib/brand.ts`. An
  unknown slug returns `notFound()` so we cannot accidentally render an
  unbranded experience.
- Brand records are sourced from `@drts/ui-tokens` `BRAND_TEMPLATES`, including
  display metadata, support hotline, card-art seed data, and per-brand surface
  ramps.

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
and PBK-UI-004 scenario routes against the matching `Partner Booking.html#PB_*`
artboard anchors:

- `PB_Landing`
- `PB_Eligibility`
- `PB_Book`
- `PB_Confirmed`
- `PB_Trips`
- `PB_Receipt`
- `PB_Help`

PBK-UI-004 reuses the existing artboards instead of introducing a separate
negative-path artboard family:

- `/eligible`, `/ineligible`, and `/manual_review` compare against
  `PB_Eligibility`
- `/inactive` and `/eligibility-required` compare against `PB_Book`
