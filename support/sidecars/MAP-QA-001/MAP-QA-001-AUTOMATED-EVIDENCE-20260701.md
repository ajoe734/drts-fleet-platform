# MAP-QA-001 Automated Evidence

Recorded: `2026-07-03T16:37:51Z`

Branch under verification: `codex/map-qa-001`

Verified code ref during the automation run:

- committed implementation: `codex/map-qa-001@e74721c1367d4ec82f57df5d51eb4ae5037a0d7a`

Environment preparation:

- existing root `node_modules` satisfied the targeted verification run

Review context:

- prior 2026-07-03 review failure referenced `codex2/map-qa-001`, which did not contain the owner branch commits for this task
- this rerun verifies the owner branch contents directly on `codex/map-qa-001`

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
