# `@drts/partner-booking-web`

White-label partner booking surface for DRTS Phase 1. Each tenant (e.g.
CTBC World Elite) is reached through the `[tenantSlug]` route segment so a
single deployable can serve any number of partner brands.

## Status

This is the PBK-UI-001 bootstrap slice. Per
`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`:

- **Wave 5 — not deployed.** CI must build / lint / typecheck cleanly, but no
  live deploy in this wave.
- Brand layering now resolves through
  `packages/ui-tokens/src/brands.ts` with shared CTBC / CATHAY / GRAND demo
  templates.
- The CTBC reference funnel (7 screens) and authority-safe negative paths land
  in **PBK-UI-003** and **PBK-UI-004**.
- The cutover policy between this app and the legacy
  `tenant-console-web/app/partner/` route is a **PBK-UI-005** decision doc.

## Routing rules (white-label invariant)

- The root path `/` is **not** a product surface. It is a developer-facing
  index that lists known brand slugs to make tenant entry obvious during
  bring-up.
- Every functional surface lives under `/[tenantSlug]/...`. The dynamic
  segment is required — there is no "default tenant" in this app.
- Screen routes are explicit path states: `/[tenantSlug]/book`,
  `/[tenantSlug]/confirmed`, `/[tenantSlug]/help`, etc. The tenant root still
  accepts `?screen=` / `?scenario=` for backward-compatible demo entry, but
  the canonical PBK-UI-004 negative-path states are direct routes.
- Authority-safe negative paths are preserved as
  `/[tenantSlug]/eligible`, `/[tenantSlug]/ineligible`,
  `/[tenantSlug]/manual_review`, `/[tenantSlug]/inactive`, and
  `/[tenantSlug]/eligibility-required`. These routes resolve to the correct
  eligibility or booking gate instead of silently falling through to another
  screen.
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

Storybook is wired centrally in `packages/ui-web` (see SBK-UI-001). Per
`PBK-UI-003` acceptance, partner-booking surfaces will be rendered against
the `partner-screens.jsx::PB_*` artboards once those screens land. PBK-UI-001
itself does not ship Storybook stories.
