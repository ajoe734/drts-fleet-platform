# MAP-FE-ADM-001 Admin Publish Proof

Task: `FLEETS-CLOSEOUT-003`

Branch: `codex/fleets-closeout-003-ci`

## Acceptance Proof

| Requirement                                   | Repo-backed proof                                                                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service-area draft, review and publish        | `apps/api/tests/unit/service-area.service.test.ts`, test `publishes service-area drafts and feeds the evaluator immediately`                                                                       |
| Effective-date activation                     | Test `keeps future-effective published service areas out of evaluator until active` proves `CYI_CORE@1` remains blocked before `2026-08-01T00:00:00.000Z` and becomes serviceable at the boundary. |
| Active-version overlap rejection              | Test `rejects overlapping active versions for the same service-area code` rejects a second overlapping `VERSIONED_CORE` publish.                                                                   |
| Stop-policy draft, review, publish and retire | Test `publishes and retires stop policies without losing service-area coverage` verifies `CITY_HALL_PICKUP_BLOCK@1` at every lifecycle state.                                                      |
| Policy export                                 | The same test checks review and retired GeoJSON exports, including status, version, effective window and `geometryVersionRef`.                                                                     |
| Policy audit                                  | The same test checks review, publish and retire audit events with actor, request, status, version and effective-window summaries.                                                                  |
| Invalid geometry                              | Test `rejects self-intersecting service-area geometry before persistence` proves no persistence call occurs.                                                                                       |
| Evaluator refresh                             | Published boundaries become serviceable immediately; the published deny policy returns `not_serviceable` and `PICKUP_NOT_ALLOWED`; retirement restores serviceability.                             |
| Downstream Callcenter block                   | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json` proves the phone-booking surface blocks a no-pickup selection and exposes the reason.            |

## Version And Audit Values

- Service boundary: `KHH_CORE`, version `1`, geometry ref
  `service_area:KHH_CORE@1`.
- Future boundary: `CYI_CORE`, version `1`, effective from
  `2026-08-01T00:00:00.000Z`.
- Stop policy: `CITY_HALL_PICKUP_BLOCK`, version `1`, direction `pickup`,
  effect `deny`, geometry ref `stop_policy:CITY_HALL_PICKUP_BLOCK@1`.
- Retired policy window ends at `2026-07-15T00:00:00.000Z`.
- Audit actor is `platform-admin-geo-001`, actor type `platform_admin`, request
  ID `req-service-area-admin-001`.

## Verification

```bash
pnpm --filter @drts/api exec vitest run tests/unit/service-area.service.test.ts
pnpm exec prettier --check apps/api/tests/unit/service-area.service.test.ts support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md
git diff --check
```

This is repo-backed governance proof. It does not claim a live production
publish or deployed policy version.
