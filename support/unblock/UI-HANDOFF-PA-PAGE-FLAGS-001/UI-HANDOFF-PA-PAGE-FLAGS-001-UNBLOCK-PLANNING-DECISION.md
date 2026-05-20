# UI-HANDOFF-PA-PAGE-FLAGS-001 — Unblock Planning Decision

## Task

- Task ID: `UI-HANDOFF-PA-PAGE-FLAGS-001-UNBLOCK-PLANNING-DECISION`
- Parent: `UI-HANDOFF-PA-PAGE-FLAGS-001`
- Owner: `Codex2`
- Reviewer: `Codex`

## Blocker

`PA_Flags` lacked an explicit planning decision on whether this canvas-parity slice
must include tenant-targeted override editing, or only the platform-default/global
flag controls.

That ambiguity mattered because:

- the backend contract already supports tenant overrides via `GET /api/admin/flags`
  with `x-tenant-id` and `POST /api/admin/flags/:key/tenant-overrides`
- the tenant console product surface already treats `/feature-flags` as read-only
  visibility, not a tenant editing surface
- the parent UI branch (`codex2/ui-handoff-pa-page-flags-001`, anchor
  `71f9f5a8`) already implements override visibility as read-only context while
  keeping only the platform default toggle mutable

## Canonical Decision

Decision: `UI-HANDOFF-PA-PAGE-FLAGS-001` is a scope cut to **global/platform-default
flag governance only**.

For this slice:

- `PA_Flags` must allow toggling the platform default/global flag state
- existing tenant override context may be shown as read-only blast-radius context
- dedicated tenant-targeted override create/edit UX is **not** part of this canvas
  parity task

This decision is now recorded in canonical planning truth at
`docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`:

- route map: `/feature-flags` = global switch governance; tenant override is
  platform-admin follow-up scope
- `7.4.12 Feature Flags & Adapter Registry`: Phase 1 `PA_Flags` is global
  governance first; tenant override summary is read-only context if available;
  dedicated override create/edit remains follow-up until separately taskized

## Why This Is The Correct Cut

1. Product consistency:
   `Tenant Console` already defines `/feature-flags` as `Feature Visibility` with
   read-only module visibility, so moving tenant-targeted editing into this
   platform-admin parity slice would expand scope beyond the existing product
   surface split.
2. Contract consistency:
   the backend may keep tenant override authority and endpoints, but a supported
   contract does not require this specific UI slice to expose every mutation path.
3. Parent-branch fit:
   the parent branch wording and interaction model already align to this cut:
   override rows remain visible, while only the global default toggle is mutable.

## Parent Task Impact

`UI-HANDOFF-PA-PAGE-FLAGS-001` is unblocked on product semantics.

Concrete next step for the parent task:

- continue/review the `PA_Flags` rebuild against the clarified contract:
  mutable global default toggle + read-only tenant override visibility
- do not add tenant-targeted override create/edit UX to this slice
- keep any remaining blocker focused on repo-wide verification baseline issues,
  not on missing product direction

## Follow-up

Explicit follow-up still needed, but outside this slice:

- taskize a dedicated platform-admin tenant-targeting / override editing flow if
  Phase 1 later requires operators to create or edit tenant overrides from UI

No additional canonical contract change is required for the current parent slice
to proceed.
