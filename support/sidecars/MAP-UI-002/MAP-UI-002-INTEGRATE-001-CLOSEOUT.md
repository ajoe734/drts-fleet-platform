# MAP-UI-002-INTEGRATE-001 Closeout Evidence

**Task:** `MAP-UI-002-INTEGRATE-001` - GeometryEditor primitive/hardening integration closeout

**Owner / reviewer:** `Codex` / `Claude2`

**Integration branch:** `codex/map-ui-002-integrate-001`

**Base branch:** `dev`

**Closeout refresh:** rebased onto current `origin/dev` tip `f452f019f` on `2026-07-03`

**Source commits included:**

- `58cb496ef` - `MAP-UI-002` primitive branch (`feat(MAP-UI-002): add geometry editor primitive`)
- `414f27484` - `MAP-UI-002-HARDEN-001` hardening branch (`wip(MAP-UI-002-HARDEN-001): anchor geometry editor hardening`)

## Scope Boundary

This closeout proves the shared `GeometryEditor` primitive, validation hardening, package-local tests, exports, and Platform Admin preview adapter are present together on one branch.

It does **not** claim Gate B production pass. Gate B still requires `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`, and `MAP-REL-001` final evidence.

## Integrated Artifacts

| Artifact                                                              | Evidence                                                                                                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-web/src/geometry-editor.tsx`                             | Contains `GeometryEditor`, backend-ready payload builders, GeoJSON import/export, coordinate range validation, and self-intersection blocking.                                               |
| `packages/ui-web/src/index.tsx`                                       | Exports `GeometryEditor`, `GeometryPreviewSurface`, helpers, and geometry types from `@drts/ui-web`.                                                                                         |
| `packages/ui-web/tests/unit/geometry-editor.test.ts`                  | Package-local tests cover backend payloads, invalid route/circle states, out-of-range coordinates, self-intersecting polygons, GeoJSON import rejection, review diffs, and degraded preview. |
| `packages/ui-web/src/geometry-editor.stories.tsx`                     | Restores the reviewer/PM Storybook preview for the integrated primitive.                                                                                                                     |
| `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx` | Preserves the Platform Admin sandbox preview adapter for real approved operating-area and route geometry.                                                                                    |

## Production Blocker Coverage

| Prior blocker                                | Current evidence                                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root-level React test dependency leak        | `tests/unit/ui-web-geometry-editor.test.ts` is absent; geometry tests now live under `packages/ui-web/tests/unit/geometry-editor.test.ts`, run with `pnpm --filter @drts/ui-web test`, and root `pnpm test:unit` stays green with `51` files / `377` tests because root `vitest.config.ts` only includes top-level `tests/**`. |
| Coordinate range validation missing          | `buildGeometryEditorSnapshot` returns `canSubmit=false` for out-of-range latitude/longitude; covered by package-local test.                                                               |
| Polygon self-intersection validation missing | `buildGeometryEditorSnapshot` returns `canSubmit=false` for self-intersecting polygon; covered by package-local test.                                                                     |
| Half-merged primitive/hardening risk         | Integration branch contains primitive exports, hardening validation, tests, Storybook preview, and Platform Admin preview adapter together.                                               |

## Verification Commands

Run from the repo root after `pnpm install --frozen-lockfile`.

| Command                                            | Result                                                      |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm --filter @drts/ui-web typecheck`             | Pass                                                        |
| `pnpm --filter @drts/ui-web test`                  | Pass - 2 files / 10 tests                                   |
| `pnpm --filter @drts/ui-web lint`                  | Pass                                                        |
| `pnpm --filter @drts/platform-admin-web typecheck` | Pass                                                        |
| `pnpm --filter @drts/platform-admin-web test`      | Pass command, but no Platform Admin test files were present |
| `pnpm --filter @drts/platform-admin-web lint`      | Pass                                                        |
| `pnpm test:unit`                                   | Pass - 51 files / 377 tests; package-local GeometryEditor test not collected by root config |

## Handoff Notes

- `MAP-FE-ADM-001` may use this branch as the integrated GeometryEditor baseline once reviewer accepts `MAP-UI-002-INTEGRATE-001`.
- `MAP-FE-ADM-001` still must implement publish/retire governance flows and prove backend evaluator/audit behavior; this branch only supplies the reusable UI primitive and preview adapter.
- `MAP-QA-002` must not count this as Gate B E2E evidence until Platform Admin workflow tests exercise a real publish/retire path with backend assertions.
- Owner closeout rebased the branch onto current `origin/dev` tip `f452f019f` with no conflicts before final verification and push.
