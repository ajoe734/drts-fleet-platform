# MAP-FE-ADM-001 Final Evidence

Task: `MAP-FE-ADM-001` - Platform Admin geofence governance UI

Owner: `Codex`

Branch: `codex/map-fe-adm-001-governance-ui`

Base: `origin/codex/map-rel-001-dev-guardrails`

Status: **PARTIAL PASS - UI/API-client/test hooks implemented; live Gate B E2E remains blocked by backend/API boot issue.**

## Scope Implemented

- Added Platform Admin route `/service-areas`.
- Added shell navigation and assistant route metadata for service-area governance.
- Added typed `@drts/api-client` service-area authority helpers for definitions, GeoJSON export, evaluate, create/update, submit-review, publish, and retire.
- Added service-area governance UI using existing `@drts/ui-web` Canvas primitives instead of creating new UI primitives.
- Added lifecycle controls for `draft -> review -> publish -> retire`, effective-window overrides, version refs, audit reason gating, GeoJSON import/export entry points, validation summary, and stable Gate B test hooks.
- Added explicit copy and `data-testid` evidence separating taxi service-area/stop-policy authority from Phase2 sandbox operating areas/routes.
- Added Playwright smoke spec with mocked service-area endpoints for MAP-QA-002 locator handoff.

## Route And Hooks

- Route: `/service-areas`
- Page root: `data-testid="service-area-governance-page"`
- Boundary table: `data-testid="service-area-boundary-table"`
- Stop-policy table: `data-testid="service-area-stop-policy-table"`
- Lifecycle controls: `data-testid="service-area-lifecycle-controls"`
- GeoJSON panel: `data-testid="service-area-geojson-panel"`
- Audit/version summary: `data-testid="service-area-audit-version-summary"`
- Sandbox separation warning: `data-testid="service-area-sandbox-boundary-warning"`

## Reuse / Primitive Audit

- `packages/ui-web` did not expose a first-class `GeometryEditor` in this branch.
- UI reuses exported Canvas primitives: `CanvasPageHeader`, `CanvasBanner`, `CanvasBtn`, `CanvasCard`, `CanvasPill`, `CanvasTable`, and `buildCanvasTheme`.
- Backend service-area controller/contracts exist in the branch; `packages/api-client` lacked the documented service-area admin helpers, so this task added typed helpers rather than using ad hoc `fetch`.

## Files Changed

- `apps/platform-admin-web/app/service-areas/page.tsx`
- `apps/platform-admin-web/components/admin-shell.tsx`
- `apps/platform-admin-web/components/assistant/assistant-types.ts`
- `apps/platform-admin-web/components/assistant/route-context.ts`
- `apps/platform-admin-web/lib/translations.ts`
- `packages/api-client/src/index.ts`
- `tests/e2e/platform-admin-service-area-governance.spec.ts`
- `tests/unit/platform-admin-assistant-route-context.test.ts`
- `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`

## Verification Commands

Passed:

```bash
pnpm install --frozen-lockfile
pnpm exec prettier --write apps/platform-admin-web/app/service-areas/page.tsx apps/platform-admin-web/components/admin-shell.tsx apps/platform-admin-web/components/assistant/assistant-types.ts apps/platform-admin-web/components/assistant/route-context.ts apps/platform-admin-web/lib/translations.ts packages/api-client/src/index.ts tests/unit/platform-admin-assistant-route-context.test.ts tests/e2e/platform-admin-service-area-governance.spec.ts
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web lint
pnpm --filter @drts/api-client typecheck
pnpm typecheck:root
pnpm exec eslint tests/e2e/platform-admin-service-area-governance.spec.ts --max-warnings=0
pnpm test:unit -- tests/unit/platform-admin-assistant-route-context.test.ts
git diff --check
```

Notes:

- `pnpm test:unit -- tests/unit/platform-admin-assistant-route-context.test.ts` currently runs the full configured Vitest unit suite in this repo; result was `51 passed (51)` files and `378 passed (378)` tests.
- `pnpm --filter @drts/contracts build`, `pnpm --filter @drts/ui-tokens build`, and `pnpm --filter @drts/control-plane-auth build` were run to satisfy Playwright/webServer prerequisites before retrying E2E.

Blocked:

```bash
pnpm exec playwright test tests/e2e/platform-admin-service-area-governance.spec.ts --project=platform-admin-assistant-off
```

Result: **BLOCKED before UI assertions**. The Playwright webServer starts `pnpm --filter @drts/api dev`; API boot fails with an existing Nest DI error:

```text
UnknownDependenciesException: Nest can't resolve dependencies of the GeoProviderConfigService (?).
```

An earlier attempt also failed before prerequisite builds because `@drts/contracts/dist/index.js` was missing after fresh install; after building contracts/ui-tokens/control-plane-auth, the blocker became the API DI failure above.

## Remaining Work / Do Not Claim

- Do not claim Gate B production readiness yet.
- Live Playwright E2E remains pending until API dev boot is fixed.
- Backend evaluator before/after publish evidence is not captured in this task.
- Callcenter blocked/manual-review behavior after publish is not captured in this task.
- Backend audit payload inspection for publish/retire is not captured in this task.
- GeometryEditor integration remains pending because no first-class `GeometryEditor` export exists in this branch; current UI provides GeoJSON import/export and backend lifecycle controls with fail-safe copy.
