# MAP-FE-ADM-001 Final Evidence

Task: `MAP-FE-ADM-001` - Platform Admin geofence governance UI

Owner: `Codex2`

Branch: `codex/map-fe-adm-001-gateb-corrective`

Base: `origin/codex/map-fe-adm-001-governance-ui`

Status: **PASS for MAP-FE-ADM-001 corrective scope - Platform Admin UI/API-client/test hooks, task-scoped GeometryEditor, affected evaluator preview, mutation receipt hooks, and live Gate B Playwright smoke implemented.**

## Scope Implemented

- Added Platform Admin route `/service-areas`.
- Added shell navigation and assistant route metadata for service-area governance.
- Added typed `@drts/api-client` service-area authority helpers for definitions, GeoJSON export, evaluate, create/update, submit-review, publish, and retire.
- Added service-area governance UI using existing `@drts/ui-web` Canvas primitives instead of creating new UI primitives.
- Added lifecycle controls for `draft -> review -> publish -> retire`, effective-window overrides, version refs, audit reason gating, GeoJSON import/export entry points, validation summary, and stable Gate B test hooks.
- Added task-scoped `ServiceAreaGeometryEditor` for polygon/circle editing, GeoJSON/native geometry import/export, coordinate validation, and self-intersection rejection.
- Added affected sample preview that calls the backend service-area evaluator before publish and displays decisions, policy reasons, service-area codes, and geometry version refs.
- Added mutation receipt panel showing backend `auditId`, generated timestamp, record identity/status, and geometry version ref after publish/retire/geometry save/import.
- Added screen-requirements fallback doc at `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md`.
- Added explicit copy and `data-testid` evidence separating taxi service-area/stop-policy authority from Phase2 sandbox operating areas/routes.
- Added Playwright smoke spec with mocked service-area endpoints that exercises affected preview, publish receipt, and retire receipt.

## Route And Hooks

- Route: `/service-areas`
- Page root: `data-testid="service-area-governance-page"`
- Boundary table: `data-testid="service-area-boundary-table"`
- Stop-policy table: `data-testid="service-area-stop-policy-table"`
- Lifecycle controls: `data-testid="service-area-lifecycle-controls"`
- Geometry editor: `data-testid="service-area-geometry-editor"`
- Affected preview: `data-testid="service-area-affected-preview"`
- Mutation receipt: `data-testid="service-area-mutation-receipt"`
- GeoJSON panel: `data-testid="service-area-geojson-panel"`
- Audit/version summary: `data-testid="service-area-audit-version-summary"`
- Sandbox separation warning: `data-testid="service-area-sandbox-boundary-warning"`

## Reuse / Primitive Audit

- `packages/ui-web` did not expose a first-class `GeometryEditor` in this branch, so this corrective pass added a task-scoped Platform Admin `ServiceAreaGeometryEditor` rather than claiming a shared design-system primitive exists.
- UI reuses exported Canvas primitives: `CanvasPageHeader`, `CanvasBanner`, `CanvasBtn`, `CanvasCard`, `CanvasPill`, `CanvasTable`, and `buildCanvasTheme`.
- Backend service-area controller/contracts exist in the branch; `packages/api-client` lacked the documented service-area admin helpers, so this task added typed helpers rather than using ad hoc `fetch`.

## Files Changed

- `apps/platform-admin-web/app/service-areas/page.tsx`
- `apps/platform-admin-web/components/service-area-geometry-editor.tsx`
- `apps/platform-admin-web/lib/service-area-governance.ts`
- `apps/platform-admin-web/components/admin-shell.tsx`
- `apps/platform-admin-web/components/assistant/assistant-types.ts`
- `apps/platform-admin-web/components/assistant/route-context.ts`
- `apps/platform-admin-web/lib/translations.ts`
- `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md`
- `packages/api-client/src/index.ts`
- `apps/api/src/modules/geo/geo-provider-config.service.ts`
- `apps/api/src/modules/geo/geo.module.ts`
- `tests/e2e/platform-admin-service-area-governance.spec.ts`
- `tests/unit/platform-admin-assistant-route-context.test.ts`
- `tests/unit/platform-admin-service-area-governance.test.ts`
- `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`

## Verification Commands

Passed:

```bash
pnpm install --frozen-lockfile
pnpm exec prettier --write apps/platform-admin-web/app/service-areas/page.tsx apps/platform-admin-web/components/admin-shell.tsx apps/platform-admin-web/components/assistant/assistant-types.ts apps/platform-admin-web/components/assistant/route-context.ts apps/platform-admin-web/lib/translations.ts packages/api-client/src/index.ts tests/unit/platform-admin-assistant-route-context.test.ts tests/e2e/platform-admin-service-area-governance.spec.ts
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web lint
pnpm --filter @drts/api-client typecheck
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api test -- tests/unit/geo.service.test.ts
pnpm typecheck:root
pnpm exec eslint tests/e2e/platform-admin-service-area-governance.spec.ts --max-warnings=0
pnpm test:unit -- tests/unit/platform-admin-assistant-route-context.test.ts
pnpm test:unit -- tests/unit/platform-admin-service-area-governance.test.ts
API_PORT=3401 API_HOST=127.0.0.1 NODE_ENV=test DRTS_ENV=test MAP_PROVIDER_MODE=mock pnpm --filter @drts/api dev
curl -sS --max-time 5 http://127.0.0.1:3401/health
curl -sS --max-time 5 http://127.0.0.1:3401/api/geo/health
pnpm exec playwright test tests/e2e/platform-admin-service-area-governance.spec.ts --project=platform-admin-assistant-off
git diff --check
```

Notes:

- `pnpm test:unit -- tests/unit/platform-admin-assistant-route-context.test.ts` currently runs the full configured Vitest unit suite in this repo; result was `51 passed (51)` files and `378 passed (378)` tests.
- `pnpm --filter @drts/api test -- tests/unit/geo.service.test.ts` currently runs the full configured API Vitest suite in this repo; result was `111 passed (111)` files and `795 passed (795)` tests.
- `pnpm --filter @drts/contracts build`, `pnpm --filter @drts/ui-tokens build`, and `pnpm --filter @drts/control-plane-auth build` were run to satisfy Playwright/webServer prerequisites before retrying E2E.
- API runtime smoke passed with `/health` and `/api/geo/health`; both reported healthy mock-provider state.
- Corrective Playwright scope now asserts GeometryEditor valid state, affected preview evaluator decisions/version refs, publish audit receipt, and retire audit receipt.

## API Boot Unblock

- Fixed the existing Nest DI blocker by adding an explicit `GEO_PROVIDER_ENV` token and registering it in `GeoModule`.
- Preserved isolated unit-test construction via `new GeoProviderConfigService(customEnv)`.
- Verified `GeoModule dependencies initialized` and `Nest application successfully started` during local API runtime smoke.

## Remaining Work / Do Not Claim

- Do not claim full map/geofence production readiness from this PR alone.
- This branch captures mocked Platform Admin publish/retire receipt proof and backend evaluator-preview wiring, but MAP-QA-002 must still capture the final cross-surface backend/callcenter E2E evidence.
- Callcenter blocked/manual-review behavior after publish is not captured in this task and remains owned by MAP-QA-002 / Gate A evidence.
- Android/iOS driver UAT, deployed observability, and MAP-REL release evidence remain separate production gates.
