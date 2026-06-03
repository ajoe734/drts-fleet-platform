# Tenant Console Rebuild Closeout (2026-05-28)

Owner: Codex2  
Reviewer: Codex  
Task: `UI-FE-TEN-UMBRELLA`  
App: `apps/tenant-console-web`  
Branch: `codex2/ui-fe-ten-umbrella`

## Purpose

Umbrella closeout for the tenant-console rebuild wave. This branch consolidates the 20 tenant surfaces called out by the 2026-05-25 handoff packet, including the 9 NEW routes required by Q-TEN02, into the canonical repo-local tenant admin app `apps/tenant-console-web`.

This closeout covers:

- final route integration on the umbrella branch
- shared client / contract alignment needed by the tenant surfaces
- verification for `typecheck`, `build`, and `test`
- Q-TEN01 cutover-reference confirmation

## Shipped Surfaces

Integrated route set:

- Existing core routes: `/`, `/bookings`, `/bookings/new`, `/bookings/[bookingId]`, `/passengers`, `/users`, `/webhooks`, `/api-keys`, `/invoices`, `/cost-centers`, `/rules`, `/audit`, `/settings`
- NEW routes now shipped on this branch: `/addresses`, `/notifications`, `/sla`, `/billing`, `/integration-governance`, `/reports`, `/feature-flags`

The tenant shell navigation was updated to expose the full tenant console IA required by the packet.

## Source Integration

This umbrella branch pulls the shipped tenant surfaces from the existing task branches rather than reimplementing them from scratch. Primary source branches:

- `codex/ui-fe-ten-home`
- `codex/ui-fe-ten-bkg`
- `codex/ui-fe-ten-bkgnew`
- `codex/ui-fe-ten-bkgid`
- `codex/ui-fe-ten-psg`
- `codex/ui-fe-ten-adr`
- `codex2/ui-fe-ten-usr`
- `codex/ui-fe-ten-ntf`
- `codex/ui-fe-ten-sla`
- `codex/ui-fe-ten-wh`
- `codex/ui-fe-ten-apik`
- `codex/ui-fe-ten-bill`
- `codex/ui-fe-ten-inv`
- `codex/ui-fe-ten-cc`
- `codex/ui-fe-ten-rul`
- `codex/ui-fe-ten-ig`
- `codex/ui-fe-ten-rpt`
- `codex/ui-fe-ten-aud`
- `codex/ui-fe-ten-ff`

Shared supporting alignment landed in:

- `packages/api-client/src/index.ts`
- `packages/contracts/src/ui-runtime.ts`
- `apps/tenant-console-web/lib/navigation.ts`
- `apps/tenant-console-web/next.config.ts`
- `apps/tenant-console-web/package.json`
- `apps/tenant-console-web/tsconfig.json`

## Verification

Executed in this worktree on 2026-05-28 UTC:

- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/ui-tokens build`
- `pnpm --filter @drts/tenant-console-web build`
- `pnpm --filter @drts/tenant-console-web typecheck`
- `pnpm --filter @drts/tenant-console-web test`

Results:

- `build`: PASS
- `typecheck`: PASS
- `test`: PASS (`1` file, `5` tests)

Build route output confirms the umbrella acceptance routes are present, including:

- `/addresses`
- `/notifications`
- `/sla`
- `/billing`
- `/integration-governance`
- `/reports`
- `/feature-flags`
- `/bookings/new`
- `/bookings/[bookingId]`

## Q-TEN01 Cutover Reference

This closeout does **not** claim live production cutover. It confirms the repo-local canonical target and preserves the external live-owner rule.

Authority references:

- [`docs/05-ui/system-design-answers-all-apps-20260524.md`](./system-design-answers-all-apps-20260524.md) § `Q-TEN01. Canonical migration plan`
- [`docs/05-ui/tenant-console-design-handoff-packet-20260525.md`](./tenant-console-design-handoff-packet-20260525.md) § `Topology context (Q-TEN01 resolution)`
- [`docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`](../01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md)

Confirmed cutover posture:

- `apps/tenant-console-web` is the canonical repo-local tenant admin console.
- external `tenant-commute-hub` remains the live production owner until a separate cutover task records rollout / rollback evidence.
- this umbrella closeout is therefore a ship-ready productization checkpoint, not a production-topology switch.

## Files Added

```text
docs/05-ui/tenant-console-rebuild-closeout-20260528.md
```
