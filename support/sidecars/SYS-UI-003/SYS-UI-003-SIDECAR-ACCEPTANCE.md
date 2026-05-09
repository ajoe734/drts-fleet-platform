# SYS-UI-003 Passenger Shell Acceptance Packet

- Task: `SYS-UI-003`
- Owner / Reviewer: `Codex2` / `Claude`
- Date: `2026-05-09`
- Artifact class: support-only acceptance packet

## Scope

This sidecar records what the baseline passenger surface now materializes in
repo truth without over-claiming the downstream booking and negative-flow work
reserved for `SYS-UI-004`.

In scope:

- create a real `apps/passenger-web` Next.js target
- add a dedicated passenger shell and landing route
- add auth entry, booking-status home, trip-history / receipt landing, and
  explicit unauthenticated / unsupported routes
- keep receipt ownership guardrails explicit

Out of scope:

- full passenger booking create/cancel/status backend integration
- complaint flow materialization
- invented receipt delivery channels
- assisted-entry or tenant/partner surface work

## Route Inventory

| Route              | Purpose                             | Baseline outcome                                                             |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------- |
| `/`                | booking-status home                 | landing route exists and frames ETA/status-first passenger entry             |
| `/auth`            | auth / bootstrap entry              | named entry route exists with verification and fallback framing              |
| `/trips`           | trip-history landing                | history is no longer only prose-deferred                                     |
| `/receipts`        | receipt landing                     | DRTS-issued, external-reference, and unsupported receipt states are explicit |
| `/unauthenticated` | auth failure fallback               | unauthenticated state is materialized as a real route                        |
| `/unsupported`     | unsupported / source-owned fallback | unsupported and not-serviceable framing is explicit                          |

## Guardrails Preserved

- `apps/passenger-web` remains an external-consumer plane, not a tenant-admin or
  ops-console sub-surface.
- Receipt ownership remains source-driven. The UI may show DRTS-owned receipts,
  external references, or unsupported states, but it does not invent a new
  email / SMS delivery channel.
- Current routes are shell/baseline only. Positive and negative booking-flow
  materialization still belongs to `SYS-UI-004`.

## Acceptance Mapping

Acceptance: passenger target exists with a real route and shell

- satisfied by the new `apps/passenger-web` workspace, `app/layout.tsx`,
  `components/passenger-shell.tsx`, and the concrete route set under
  `app/`

Acceptance: receipt surface is no longer only deferred prose

- satisfied by concrete `/trips` and `/receipts` routes that separate DRTS
  receipts, external-reference ownership handoff, and unsupported states
