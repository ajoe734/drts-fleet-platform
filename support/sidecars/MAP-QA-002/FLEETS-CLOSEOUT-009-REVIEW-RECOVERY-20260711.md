# FLEETS-CLOSEOUT-009 Review Recovery

Task: `FLEETS-CLOSEOUT-009`  
Owner: `Codex`  
Reviewer: `Codex2`  
Branch: `codex/fleets-closeout-009`  
Verified tree: `0644366a3` (`origin/dev` at verification time)  
Date: `2026-07-11`

## Summary

The review rejection about hardcoded map colors no longer reproduces on the
current worktree source. The active map UI surface is the shared
`packages/ui-web/src/address-map-picker.tsx` primitive plus the Callcenter
consumer at `apps/ops-console-web/app/callcenter/page.tsx`; the reviewer path
`apps/ops-console-web/app/callcenter/callcenter-interactive-map.tsx` is not a
live file in this tree.

Current source evidence shows:

- `packages/ui-web/src/address-map-picker.tsx:48` builds its default surface
  through `buildCanvasTheme(...)`.
- `packages/ui-web/src/address-map-picker.tsx:70` routes pin/banner/pill tones
  through `toneColor(theme, tone)`.
- `packages/ui-web/src/address-map-picker.tsx:291-329` renders the pin preview
  using `theme.surface`, `theme.border`, and other theme fields rather than raw
  hex values.
- `apps/ops-console-web/app/callcenter/page.tsx:70` resolves the Callcenter
  theme with `buildCanvasTheme({ surface: "ops", dark: true, density:
"compact" })`.
- `apps/ops-console-web/app/callcenter/page.tsx:2562-2588` mounts the shared
  picker for pickup/dropoff under the ops theme.

The owned-surface hardcoded color audit returned zero matches for raw hex or
`rgba(...)` values. Artifact:
`support/sidecars/MAP-QA-002/artifacts/fleets-closeout-009-token-audit-20260711T0352Z.txt`

## Typecheck Drift Recovery

Initial `@drts/ops-console-web` typecheck failed because this task worktree was
resolving `apps/ops-console-web/node_modules/@drts/ui-web` and
`@drts/api-client` back to the canonical-root package sources instead of the
assigned worktree packages. Those stale workspace links exposed older public
types, which produced false negatives unrelated to the current task source.

Recovery action:

- `CI=true pnpm install --frozen-lockfile`

Post-relink proof:

- `support/sidecars/MAP-QA-002/artifacts/workspace-link-check-fleets-closeout-009-20260711T0355Z.txt`
- `support/sidecars/MAP-QA-002/artifacts/ops-console-typecheck-fleets-closeout-009-20260711T0355Z.txt`

The relink is environment-local only. No product source change was required to
clear this drift.

## Verification

| Command                                                                                                                      | Result | Artifact                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm --dir apps/ops-console-web exec vitest run tests/unit/callcenter-map-booking.test.ts --reporter=json --outputFile ...` | PASS   | `support/sidecars/MAP-QA-002/artifacts/callcenter-map-booking-vitest-20260711T0352Z.json`            |
| `pnpm --dir apps/api exec vitest run tests/unit/service-area.service.test.ts --reporter=json --outputFile ...`               | PASS   | `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260711T0352Z.json`              |
| `pnpm exec tsc -p tsconfig.json --noEmit`                                                                                    | PASS   | `support/sidecars/MAP-QA-002/artifacts/tsc-fleets-closeout-009-20260711T0352Z.txt`                   |
| `pnpm --filter @drts/ops-console-web typecheck`                                                                              | PASS   | `support/sidecars/MAP-QA-002/artifacts/ops-console-typecheck-fleets-closeout-009-20260711T0355Z.txt` |
| `pnpm exec playwright test -c playwright.ops-console-parity.config.ts --grep "callcenter" --reporter=json`                   | PASS   | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260711T0352Z.json`    |

## Closeout Position

`FLEETS-CLOSEOUT-009` is ready to re-enter reviewer pass. The current blocker
was stale workspace-link resolution during package-level typecheck, not a
remaining raw-color defect in the live Callcenter map surface.
