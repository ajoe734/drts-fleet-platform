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

The following rebuild routes were added and wired into the tenant console shell:

1. `/addresses`
2. `/notifications`
3. `/sla`
4. `/billing`
5. `/integration-governance`
6. `/reports`
7. `/feature-flags`

Navigation was updated in `apps/tenant-console-web/lib/navigation.ts` so the new pages are reachable from the tenant shell, rather than existing only as direct URLs.

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

Build output confirms the new route inventory is present:

- `/addresses`
- `/billing`
- `/feature-flags`
- `/integration-governance`
- `/notifications`
- `/reports`
- `/sla`

## Residual Notes

- `/integration-governance` currently derives readiness from the available tenant module contracts plus `TenantIntegrationGovernancePackage`. The dedicated aggregated readiness endpoint described in Q-TEN10 is not introduced by this closeout.
- `/feature-flags` currently uses the tenant-resolved flag view available through the existing flag service path; this closeout does not introduce a new backend endpoint.

## Closeout Summary

The umbrella route gap identified by machine truth is resolved in `apps/tenant-console-web`, the canonical closeout artifact now exists, and the tenant console rebuild can proceed to review on this branch.
