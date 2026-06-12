# Enterprise Dispatch Web

Dedicated Next.js frontend for `enterprise_dispatch`, the tenant-branded employee self-service booking surface.

## Product Boundary

This app owns both Enterprise Dispatch frontstage surfaces:

- `S1 web`: the enterprise internal website version for employees, delegates, and riders.
- `S2 embed`: the enterprise internal app embedded webview version with host hand-off identity states.

Explicit non-goals:

- This is not the credit-card airport transfer product. Airport fields are only conditional enterprise dispatch context.
- This is not `apps/partner-booking-web`, which owns partner / cardholder style program flows.
- This does not extend the sunset `apps/tenant-portal-web`.
- This is not `apps/tenant-console-web` admin, and must not show tenant governance or management-console navigation.

## Design Source

Slice A only establishes the app skeleton and product-boundary shell. Slice B must build the production shell and primitives from `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` and `docs/05-ui/drts-design-canvas/ent-kit.jsx`.

The scaffold `app/globals.css` custom properties are taken directly from the
canonical Enterprise Dispatch design kit `buildEnt()` in
`docs/05-ui/drts-design-canvas/ent-kit.jsx` (the light theme), not a hand-picked
palette:

- `--ent-accent` `#2457D6` is the canvas default `accent`; `--ent-accent-strong`
  `#1A45AD` is `primaryHi`; `--ent-accent-soft` `#EBF1FE` is `primaryBg`;
  `--ent-line-strong` `#C7D9FB` is `primaryBd`.
- `--ent-bg` `#F4F6FA`, `--ent-surface` `#FFFFFF`, `--ent-surface-soft`
  `#F7F9FC`, `--ent-ink` `#19223A`, `--ent-ink-soft` `#43506B`, `--ent-muted`
  `#6B7689` mirror the same `buildEnt` light tokens.

Enterprise Dispatch is **tenant-branded** (ent-kit header: "Tenant-branded — NOT
issuer/card white-label"), so it does not reuse the old `tenant-console-web`
teal/terracotta management realm, the credit-card airport-transfer white-label
styling, or the `partner-booking-web` IA. Slice B should promote these canvas
tokens into reusable production primitives rather than leaving raw hex in
`globals.css`.

## Commands

```sh
pnpm --filter @drts/enterprise-dispatch-web dev
pnpm --filter @drts/enterprise-dispatch-web typecheck
pnpm --filter @drts/enterprise-dispatch-web lint
pnpm --filter @drts/enterprise-dispatch-web test
```

The local dev server listens on port `3010`. Keep this app on that dedicated port so it does not collide with existing local app assumptions.

## Current Slice

`ENT-DISP-FE-20260612-A` includes package wiring, Next config, TypeScript config, lint config, a basic `/` shell, global CSS, public placeholder, and this README.

Later slices should add the real Enterprise Dispatch design kit, S1/S2 route shells, booking flow, gate states, fixture-backed data, API contract wiring, and tests.
