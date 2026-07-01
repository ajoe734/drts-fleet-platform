# MAP-UI-002-INTEGRATE-001 — Sidecar Review Packet & Evidence Summary

**Sidecar task:** `MAP-UI-002-INTEGRATE-001-SIDECAR-REVIEW`
**Helper kind:** `review_packet` (support-only; does not mutate canonical truth)
**Sidecar owner / reviewer:** `Claude` / `Codex`
**Parent task:** `MAP-UI-002-INTEGRATE-001` — GeometryEditor primitive/hardening integration closeout
**Parent owner / reviewer:** `Codex` / `Claude2` — parent status at packet time: `review`
**Parent `mutates_canonical`:** `true`
**Generated:** 2026-07-01

> Purpose: give the assigned reviewer (Codex) a machine-verified anchor map and
> acceptance→evidence matrix for the parent integration branch, so the parent
> review/absorb decision rests on fresh static verification, not prose. This
> packet is a support artifact only. It does **not** re-run the owner's full
> toolchain and it does **not** approve, merge, or edit the parent branch.

---

## 1. Where the parent implementation actually lives (TRAP)

The integration work is **NOT on `dev`** and not on this sidecar branch. It lives on:

- **Review target:** `origin/codex/map-ui-002-integrate-001`
- **Anchor commit:** `4c08c6a28a0d0795992aa97006ea8f59d2969f02`
- **Subject:** `MAP-UI-002-INTEGRATE-001: close geometry editor integration`
- **Position vs `origin/dev`:** integration branch is **2 commits ahead / 1 behind** (dev has moved forward independently).

The two integrated source commits on the branch:

| Commit | Meaning |
| --- | --- |
| `58cb496ef` | `MAP-UI-002` primitive (`feat(MAP-UI-002): add geometry editor primitive`) |
| `414f27484` | `MAP-UI-002-HARDEN-001` hardening (`wip(MAP-UI-002-HARDEN-001): anchor geometry editor hardening`) |
| `4c08c6a28` | INTEGRATE-001 closeout tip (exports barrel + Storybook + closeout evidence) |

**Reviewer note:** read from `origin/codex/map-ui-002-integrate-001`, not from `origin/dev` and not from the canonical root working tree. This is distinct from the sibling sidecar-review runs on `codex/`, `codex2/`, `gemini/`, `gemini2/` `…-integrate-001-sidecar-review` branches — this packet is the `claude/` support slice and makes no canonical edits.

### Files changed vs merge-base(`dev`) (5 files, +1974)

```
packages/ui-web/src/geometry-editor.stories.tsx      |   56 +
packages/ui-web/src/geometry-editor.tsx              | 1666 +
packages/ui-web/src/index.tsx                         |   31 +
packages/ui-web/tests/unit/geometry-editor.test.ts   |  163 +
support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md | 58 +
```

`package.json` (root **and** `packages/ui-web`) is **unchanged** by this branch — see §3 acceptance #2.

---

## 2. Machine-verified anchor map (`origin/codex/map-ui-002-integrate-001`)

All line numbers verified by `git show <branch>:<file>` at commit `4c08c6a28`.

### `packages/ui-web/src/geometry-editor.tsx` (1666 lines)

| Anchor | Line | Role |
| --- | --- | --- |
| `validateGeometryDraft(...)` | 209 | draft-level validation entry |
| self-intersection error push (`"Polygon cannot self-intersect."`) | 226 | polygon block message |
| `geometryDraftToGeoJson(...)` | 268 | export to GeoJSON |
| `parseGeometryDraftGeoJson(...)` | 272 | import from GeoJSON |
| `buildGeometryEditorSnapshot(...)` | 277 | snapshot / `canSubmit` gate |
| `GeometryPreviewSurface({...})` | 312 | degraded/preview render surface |
| `GeometryEditor({...})` | 385 | primary primitive component |
| `buildBackendPayloads(...)` | 830 | backend-ready payload builder |
| `buildReviewDiff(...)` | 876 | review-diff hooks |
| GeoJSON lat/lng range guard (throws) | 1302–1306 | import range enforcement |
| draft lat/lng range guard (errors) | 1337–1344 | draft range enforcement |
| `isLatitudeInRange(lat)` | 1350 | −90..90 helper |
| `isLongitudeInRange(lng)` | 1354 | −180..180 helper |
| `polygonHasSelfIntersection(points)` | 1371 | self-intersection detector |
| `segmentsIntersect(...)` | 1414 | segment-crossing primitive |

### `packages/ui-web/src/index.tsx` (barrel — public `@drts/ui-web` surface)

Runtime exports added: `GeometryEditor`, `GeometryPreviewSurface`, `buildGeometryEditorSnapshot`, `createEmptyGeometryDraft`, `geometryDraftToGeoJson`, `parseGeometryDraftGeoJson`, `validateGeometryDraft`.
Type exports added: `GeometryBounds`, `GeometryCircleDraft`, `GeometryDraft`, `GeometryDraftKind`, `GeometryEditorBackendPayloads`, `GeometryEditorLabels`, `GeometryEditorProps`, `GeometryEditorSnapshot`, `GeometryPolygonDraft`, `GeometryPreviewItem`, `GeometryPreviewSurfaceProps`, `GeometryReviewDiff`, `GeometryRouteCorridorDraft`, `GeometryValidationResult`, `ServiceAreaGeometry`.

### `packages/ui-web/tests/unit/geometry-editor.test.ts` (8 tests)

| # | Test title | Covers |
| --- | --- | --- |
| 1 | creates backend-ready polygon payloads | `buildBackendPayloads` |
| 2 | blocks invalid geometry from submit-ready state | `canSubmit=false` gate |
| 3 | rejects out-of-range coordinates from submit-ready state | coordinate range validation |
| 4 | rejects self-intersecting polygons from submit-ready state | self-intersection block |
| 5 | round-trips GeoJSON import/export for route corridors | GeoJSON I/O |
| 6 | rejects GeoJSON imports with invalid coordinates | GeoJSON range guard |
| 7 | exposes review diff hooks for edited geometry | `buildReviewDiff` |
| 8 | renders degraded preview state when there is no geometry | `GeometryPreviewSurface` via SSR |

Test file imports: `react` (`createElement`), `react-dom/server` (`renderToStaticMarkup`), `vitest`. **No `@testing-library/react`, no `jsdom`** — see acceptance #2.

---

## 3. Acceptance → evidence matrix

Parent acceptance bullets mapped to verifiable state on `origin/codex/map-ui-002-integrate-001@4c08c6a28`.

| # | Parent acceptance | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | final integrated branch contains GeometryEditor primitive **and** hardening validation | ✅ code-verified | Primitive (`58cb496ef`) + hardening (`414f27484`) both on branch; `GeometryEditor@385`, range guards `@1350/1354`, self-intersection `@1371` all present together |
| 2 | no root-level React test dependency leak remains | ✅ code-verified | Stale leak file `tests/unit/ui-web-geometry-editor.test.ts` is **absent**; geometry tests live package-local at `packages/ui-web/tests/unit/geometry-editor.test.ts`; test #8 uses `renderToStaticMarkup` (SSR string), so no `jsdom`/`@testing-library` added; **root & `ui-web` `package.json` unchanged** by branch |
| 3 | package-local geometry-editor tests cover invalid coordinates and self-intersection | ✅ code-verified | Tests #3 (out-of-range coords), #4 (self-intersecting polygon), #6 (GeoJSON invalid coords) present and assert `canSubmit=false` / rejection |
| 4 | sandbox/admin preview adapter from MAP-UI-002 is preserved | ✅ code-verified | `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx` present on **both** `origin/dev` and the integration branch (preserved, not dropped) |
| 5 | ui-web and platform-admin typecheck/lint/test evidence recorded | ⚠️ owner-reported (not re-run here) | Owner closeout records: `@drts/ui-web` typecheck/lint **Pass**, test **Pass — 2 files / 10 tests**; `@drts/platform-admin-web` typecheck/lint **Pass**, test **Pass command / no PA test files present**. Static cross-check: `ui-web/tests/unit` = `geometry-editor.test.ts`(8) + `management-shell.test.ts`(2) = **10 tests / 2 files** — consistent with reported count |
| 6 | integration status recorded before downstream governance starts | ⚠️ owner/closeout-scoped | Owner closeout explicitly scopes to primitive integration and states it does **not** claim Gate B; downstream `MAP-FE-ADM-001`/`MAP-QA-002` handoff notes recorded. Machine-truth `INTEGRATION_STATUS` is the parent owner's finalize responsibility |

### Design contract (canonical — applies to every UI lane)

- `geometry-editor.tsx` contains **0 raw hex** color literals (`grep -E '#[0-9a-fA-F]{3,8}'` → empty).
- Colors/typography flow from `buildCanvasTheme(...)` / `CanvasTheme` (`@drts/ui-tokens` realm tokens), e.g. `DEFAULT_THEME = buildCanvasTheme(...)@158`.
- **Verdict: COMPLIANT** — no `globals.css` raw palette, no shadcn/Canvas-default reskin (套皮).

---

## 4. Owner closeout cross-reference (informational)

Owner's on-branch closeout lives at `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md` (note: under `MAP-UI-002/`, whereas this sidecar packet is under `MAP-UI-002-INTEGRATE-001/`). Its recorded verification commands (run from `/tmp/codex-map-ui-002-integrate-001` after `pnpm install --frozen-lockfile`):

- `pnpm --filter @drts/ui-web typecheck` → Pass
- `pnpm --filter @drts/ui-web test` → Pass (2 files / 10 tests)
- `pnpm --filter @drts/ui-web lint` → Pass
- `pnpm --filter @drts/platform-admin-web typecheck` → Pass
- `pnpm --filter @drts/platform-admin-web test` → Pass command, no PA test files present
- `pnpm --filter @drts/platform-admin-web lint` → Pass

These are the owner's runs; this sidecar did not re-execute them (support-only, and impl not on this branch/dev). Reviewer may re-run by checking out `origin/codex/map-ui-002-integrate-001`.

---

## 5. Scope / gate boundary (do not overclaim)

- This is a **primitive integration** closeout. It proves the shared `GeometryEditor` primitive + hardening validation + package-local tests + exports + Platform Admin preview adapter are present **together on one branch**.
- It does **NOT** establish **Gate B (Governance safe to publish)**. Gate B still requires final evidence from `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001`.
- Parent open dependencies at packet time: `MAP-UI-002` (`review`, owner Codex2) and `MAP-UI-002-HARDEN-001` (`review`, owner Codex2).
- `MAP-QA-002` must **not** count this branch as Gate B E2E evidence until Platform Admin workflow tests exercise a real publish/retire path with backend assertions.

---

## 6. Reviewer handoff (Codex)

1. Anchor map §2 and acceptance matrix §3 are verified against `origin/codex/map-ui-002-integrate-001@4c08c6a28`.
2. Acceptance #1–#4 are **code+test verified** by static inspection; #5 is **owner-reported** and cross-checked for count consistency (10 tests / 2 files) but not re-executed here; #6 is the parent owner's finalize responsibility.
3. This packet is **support-only** and mutates no canonical truth; the parent owner (Codex) decides absorption into the mainline integration.
4. Sidecar closeout will use `INTEGRATION_STATUS=not_applicable` per branch-strategy §11.6 (support-only, `commit_required=false`).

**Verification commands (reproduce §1–§3):**

```bash
git fetch origin
B=origin/codex/map-ui-002-integrate-001
git log --format='%H %s' -1 $B
git rev-list --left-right --count origin/dev...$B
git diff --stat $(git merge-base origin/dev $B) $B
git show $B:packages/ui-web/src/geometry-editor.tsx | grep -nE 'function (GeometryEditor|validateGeometryDraft|buildBackendPayloads|buildReviewDiff|buildGeometryEditorSnapshot|isLatitudeInRange|isLongitudeInRange|polygonHasSelfIntersection|segmentsIntersect)'
git show $B:packages/ui-web/tests/unit/geometry-editor.test.ts | grep -nE '(it|test)\('
git cat-file -e $B:apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx && echo "adapter preserved"
git cat-file -e $B:tests/unit/ui-web-geometry-editor.test.ts 2>/dev/null && echo "LEAK" || echo "no root leak"
```
