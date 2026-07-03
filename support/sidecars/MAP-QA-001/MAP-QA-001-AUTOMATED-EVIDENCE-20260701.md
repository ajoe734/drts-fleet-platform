# MAP-QA-001 Automated Evidence

Recorded: `2026-07-03T16:29:41Z`

Branch under verification: `codex/map-qa-001`

Verified code ref during the automation run:

- base anchor: `codex/map-qa-001@a1ef993cb5d2b044bdb41144678750fe5ed191c6`
- targeted harness/spec/docs changes were still in the working tree during the final verification run

Environment preparation:

- `CI=true pnpm install --frozen-lockfile --ignore-scripts`
  - required because the isolated task worktree did not have root `node_modules`

## Verification summary

| Command | Result | Evidence |
| ------- | ------ | -------- |
| `pnpm --filter @drts/shared-test-fixtures lint` | PASS | shared fixture package lint clean |
| `pnpm --filter @drts/shared-test-fixtures typecheck` | PASS | shared fixture package typecheck clean |
| `pnpm --filter @drts/shared-test-fixtures test` | PASS | `support/sidecars/MAP-QA-001/artifacts/vitest-map-geofence-fixtures-20260701T1020Z.json` |
| `pnpm exec eslint playwright.map-geofence-harness.config.ts tests/e2e/map-geofence-harness.ts tests/e2e/map-geofence-harness.spec.ts --max-warnings=0` | PASS | targeted root lint clean |
| `pnpm exec tsc -p tsconfig.json --noEmit` | PASS | targeted root TS compile clean after harness fixes |
| `pnpm exec playwright test -c playwright.map-geofence-harness.config.ts` | PASS | `support/sidecars/MAP-QA-001/artifacts/playwright-map-geofence-harness-20260701T1020Z.json` |

## Acceptance mapping

- mock fixtures cover all service decisions: PASS
- CI runs offline: PASS
- test helpers documented: PASS
- targeted harness tests pass: PASS
