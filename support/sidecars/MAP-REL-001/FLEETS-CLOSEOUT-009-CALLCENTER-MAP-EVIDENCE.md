# FLEETS-CLOSEOUT-009 Callcenter Production Map Evidence

Status: `REVIEW_PENDING`

Base: `origin/dev@c60c03d975678d8ba9070b4c8bc3148afe1952a8`

Branch: `codex/fleets-closeout-009-callcenter-map`

## Production Gap Closed

- Replaces the Callcenter coordinate grid with configured Web Mercator tiles.
- Shows only active and currently effective service areas and stop policies.
- Filters pickup/dropoff policy overlays by direction and service product.
- Renders deny and manual-review fences with visible legends and stable DOM evidence hooks.
- Converts map clicks to exact coordinates, preserves candidate lineage, records
  `manual_pin` / `agent_map_click`, reverse geocodes when available, and reruns
  serviceability before enabling normal order submission.
- Keeps a vector fallback when tiles fail and keeps backend policy evaluation
  authoritative when overlay loading fails.
- Fails staging/production preflight when the build-time HTTPS tile template is
  absent or lacks `{z}`, `{x}`, or `{y}` placeholders.

## Verification

| Layer               | Command                                                                                                                                                                        | Result                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| UI types            | `pnpm --filter @drts/ui-web typecheck`                                                                                                                                         | PASS                  |
| API types           | `pnpm --filter @drts/api typecheck`                                                                                                                                            | PASS                  |
| Ops types           | `pnpm --filter @drts/ops-console-web typecheck`                                                                                                                                | PASS                  |
| Service-area API    | `pnpm --filter @drts/api exec vitest run tests/unit/service-area.service.test.ts`                                                                                              | PASS, 20 tests        |
| Ops map and booking | `pnpm --filter @drts/ops-console-web exec vitest run tests/unit/callcenter-map-booking.test.ts tests/unit/callcenter-interactive-map.test.ts tests/unit/ops-map-board.test.ts` | PASS, 12 tests        |
| Shared picker       | `pnpm --filter @drts/ui-web exec vitest run tests/unit/address-map-picker.test.ts`                                                                                             | PASS, 30 tests        |
| API client          | `pnpm exec vitest run tests/unit/api-client-geo-service-area.test.ts`                                                                                                          | PASS, 4 tests         |
| Deploy preflight    | `pnpm exec vitest run tests/unit/map-provider-config.test.ts`                                                                                                                  | PASS, 4 tests         |
| Browser E2E         | `CI=1 pnpm exec playwright test -c playwright.map-fleets-closeout.config.ts --reporter=list`                                                                                   | PASS, 1 test in 19.8s |
| Production build    | `NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE=https://tiles.example/{z}/{x}/{y}.png pnpm --filter @drts/ops-console-web build`                                                            | PASS                  |

Browser evidence:

- `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.json`
- `support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.png`
- `support/sidecars/MAP-REL-001/artifacts/fleets-closeout-009-callcenter-map-blocked.png`

The E2E starts inside `TPE_STATION_PICKUP_BLOCK`, proves the visible policy
disables submission, clicks a tile-backed map point outside the fence, waits for
reverse geocoding and serviceability reevaluation, then verifies the order API
receives the corrected coordinates and complete provenance.

## Promotion Rule

This packet does not claim production deployment or reviewer acceptance.
Promotion remains blocked until the branch is pushed, independently reviewed,
merged to `dev`, built with the production tile variable, and accepted by the
parent MAP-QA/MAP-REL readiness gates.
