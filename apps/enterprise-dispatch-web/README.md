# Enterprise Dispatch Web

Next.js scaffold for the enterprise dispatch surface.

## Product Boundary

- This app is a dedicated enterprise dispatch operator surface.
- Do not reuse or extend `tenant-portal-web`, `tenant-console-web`, or `partner-booking-web` as the product baseline for this app.
- Shared packages such as `@drts/ui-web` and `@drts/ui-tokens` are allowed. Product flows, route structure, copy, and information architecture must remain dispatch-specific.

## Design Contract

- The canonical visual source must be `packages/ui-tokens` plus a future `docs/05-ui/drts-design-canvas/Enterprise Dispatch.*` canvas artifact.
- That canvas artifact does not exist yet in this branch.
- Until it exists, only a minimal shell and requirements note may be implemented. Do not invent production screens or reskin another app.
