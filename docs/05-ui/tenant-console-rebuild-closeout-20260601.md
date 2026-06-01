# Tenant Console Rebuild Closeout

- Task: `UI-FE-TEN-UMBRELLA`
- Date: `2026-06-01`
- Canonical app: `apps/tenant-console-web` per `docs/05-ui/tenant-console-design-handoff-packet-20260525.md` Q-TEN01
- Owner: `Codex`
- Reviewer: `Codex2`

## Scope

This closeout clears the umbrella blocker called out in machine truth on `2026-06-01T13:31:59Z`:

- the missing rebuild routes now exist in `apps/tenant-console-web`
- the umbrella closeout artifact now exists under `docs/05-ui/`

## Routes Shipped

Q-TEN02 acceptance for the tenant-console rebuild requires 9 route surfaces to be present in the canonical app. This umbrella closeout confirms all 9 are now available in `apps/tenant-console-web`:

1. `/bookings/new`
2. `/addresses`
3. `/notifications`
4. `/sla`
5. `/billing`
6. `/invoices`
7. `/integration-governance`
8. `/reports`
9. `/feature-flags`

Routes added by this umbrella branch:

1. `/addresses`
2. `/notifications`
3. `/sla`
4. `/billing`
5. `/integration-governance`
6. `/reports`
7. `/feature-flags`

Routes already present and explicitly counted toward the Q-TEN02 required 9-route inventory:

1. `/bookings/new`
2. `/invoices`

Navigation was updated in `apps/tenant-console-web/lib/navigation.ts` so the new pages are reachable from the tenant shell, rather than existing only as direct URLs. The shell already exposes `/bookings/new` and `/invoices`, so the full required route set is navigable from the canonical tenant console.

## Implementation Notes

- `/addresses` exposes tenant address-book quality, masking, ownership, and geocode posture.
- `/notifications` splits subscription posture from recent feed activity.
- `/sla` surfaces the tenant SLA thresholds on a dedicated route.
- `/billing` combines tenant billing profile context with invoice visibility.
- `/integration-governance` provides an aggregated readiness view from the currently available tenant contracts and links into the module routes.
- `/reports` exposes the tenant report-job queue with route-level filtering.
- `/feature-flags` shows tenant-resolved flag visibility and override scope.

## Q-TEN01 / Cutover Reference

Q-TEN01 is satisfied by keeping `apps/tenant-console-web` as the canonical tenant-console app. This matches:

- `docs/05-ui/tenant-console-design-handoff-packet-20260525.md:4`
- `docs/05-ui/tenant-console-design-handoff-packet-20260525.md:28`

No cutover was redirected back to `tenant-portal-web`; the rebuild routes ship on the canonical tenant console surface.

## Verification

Executed in the isolated task worktree after installing local workspace dependencies and building required package artifacts:

1. `pnpm install --offline --frozen-lockfile`
2. `pnpm --filter @drts/contracts build`
3. `pnpm --filter @drts/ui-tokens build`
4. `pnpm --filter @drts/ui-web build`
5. `pnpm --filter @drts/api-client typecheck`
6. `pnpm --filter @drts/tenant-console-web typecheck`
7. `pnpm --filter @drts/tenant-console-web build`
8. `pnpm --filter @drts/tenant-console-web test`
9. `git diff --check`

Results:

- `typecheck`: PASS
- `build`: PASS
- `test`: PASS (`1` file, `4` tests)
- `git diff --check`: PASS

Route inventory in `apps/tenant-console-web/app/**/page.tsx` confirms the full required Q-TEN02 surface is present:

- `/bookings/new`
- `/addresses`
- `/notifications`
- `/sla`
- `/billing`
- `/invoices`
- `/integration-governance`
- `/reports`
- `/feature-flags`

## Residual Notes

- `/integration-governance` currently derives readiness from the available tenant module contracts plus `TenantIntegrationGovernancePackage`. The dedicated aggregated readiness endpoint described in Q-TEN10 is not introduced by this closeout.
- `/feature-flags` currently uses the tenant-resolved flag view available through the existing flag service path; this closeout does not introduce a new backend endpoint.

## Closeout Summary

The umbrella route gap identified by machine truth is resolved in `apps/tenant-console-web`: all 9 Q-TEN02 required route surfaces are present, the 7 missing rebuild routes are added and navigable, and the canonical closeout artifact now matches the accepted route inventory for review.
