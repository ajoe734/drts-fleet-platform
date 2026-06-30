# MAP-UI-002-INTEGRATE-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `MAP-UI-002-INTEGRATE-001` - GeometryEditor primitive/hardening integration closeout  
**Parent Owner / Reviewer:** `Codex` / `Claude2`  
**Sidecar Owner / Reviewer:** `Codex2` / `Codex`  
**Generated:** `2026-06-30` (UTC)  
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime code, parent acceptance, or parent review outcome.

This packet exists to hand reviewer `Codex` a compact, machine-truth-anchored summary for
`MAP-UI-002-INTEGRATE-001`. The parent task is already in `review`; this sidecar only
collects the integration evidence, the prior `MAP-UI-002` blocker lineage, and the
specific checks the reviewer should repeat before deciding whether the integrated branch
is acceptable for downstream governance work.

---

## 1. Scope Boundary

In scope:

- summarize the live machine-truth posture of `MAP-UI-002-INTEGRATE-001`
- connect the parent integration branch to the earlier `MAP-UI-002` sidecar blockers and
  the `MAP-UI-002-HARDEN-001` remediation branch
- record the integrated artifact set and the verification evidence already reported by the
  parent owner
- provide reviewer handoff notes for this support-only slice

Out of scope:

- editing `packages/ui-web/**`, `apps/platform-admin-web/**`, or any other runtime file
- changing `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, or `MAP-UI-002-INTEGRATE-001`
  machine-truth fields by hand
- re-arguing the geometry-editor acceptance contract from the execution packet
- claiming Gate B production pass; this integration only prepares the reusable primitive
  and preview adapter for downstream governance work

---

## 2. Machine-Truth Anchors

### Sidecar task - `MAP-UI-002-INTEGRATE-001-SIDECAR-REVIEW`

Stable fields recorded in `ai-status.json`:

- owner=`Codex2`
- reviewer=`Codex`
- task_class=`sidecar`
- helper_parent=`MAP-UI-002-INTEGRATE-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/MAP-UI-002-INTEGRATE-001/MAP-UI-002-INTEGRATE-001-SIDECAR-REVIEW.md`

Volatile lifecycle fields intentionally stay in machine truth:

- `status`
- `next`
- `last_update`

### Parent integration task - `MAP-UI-002-INTEGRATE-001`

`ai-status.json` currently records:

- owner=`Codex`
- reviewer=`Claude2`
- status=`review`
- depends_on=`MAP-UI-002`, `MAP-UI-002-HARDEN-001`
- artifacts:
  - `packages/ui-web/src/geometry-editor.tsx`
  - `packages/ui-web/src/index.tsx`
  - `packages/ui-web/tests/unit/`
  - `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx`
  - `support/sidecars/MAP-UI-002/`
- acceptance:
  - final integrated branch contains GeometryEditor primitive and hardening validation
  - no root-level React test dependency leak remains
  - package-local geometry-editor tests cover invalid coordinates and self-intersection
  - sandbox/admin preview adapter from `MAP-UI-002` is preserved
  - ui-web and platform-admin typecheck/lint/test evidence recorded
  - integration status recorded before downstream governance starts

Parent `next` text points reviewer to:

- branch=`origin/codex/map-ui-002-integrate-001`
- head=`4c08c6a28a0d0795992aa97006ea8f59d2969f02`
- closeout artifact=`support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`

Interpretation:

- the parent is already past owner implementation and waiting on reviewer action
- this sidecar does not replace the parent closeout artifact; it makes that artifact easier
  to review in the context of the earlier blocker chain

---

## 3. Lineage From Earlier Blockers

### A. Original blocker packet on `MAP-UI-002`

The parent `MAP-UI-002` task currently records, in its `next` field, that
`support/sidecars/MAP-UI-002/MAP-UI-002-SIDECAR-REVIEW.md` recommended against approval.
That packet reviewed branch `codex2/map-ui-002 @ 58cb496ef01f4e76e7ebe24b1e539596da38d06f`
and called out three production blockers:

1. the claimed root vitest command was not reproducible because the root test imported
   `react`/`react-dom` without root runtime dependencies
2. out-of-range latitude/longitude values could still produce `canSubmit=true`
3. self-intersecting polygons were not rejected before publish-ready state

### B. Hardening follow-up

`MAP-UI-002-HARDEN-001` is also in `review` and records the remediation branch as commit
`414f27484` with these owner claims:

- geometry-editor tests now run under package-local `@drts/ui-web` verification
- out-of-range lat/lng can no longer be `canSubmit=true`
- self-intersecting polygons can no longer be `canSubmit=true`
- GeoJSON import rejects invalid coordinates

### C. Integration task purpose

`MAP-UI-002-INTEGRATE-001` exists so downstream work does not accidentally absorb only one
half of the solution. The integrated branch combines:

- `58cb496ef` - primitive branch from `MAP-UI-002`
- `414f27484` - hardening branch from `MAP-UI-002-HARDEN-001`
- `4c08c6a28` - closeout commit adding the integrated Storybook preview and closeout note

That means the review question for `MAP-UI-002-INTEGRATE-001` is narrower than the
original parent review question:

- not "does the primitive exist at all?"
- instead "does the integrated branch preserve the primitive while also closing the known
  validation and verification gaps?"

---

## 4. Integrated Artifact Set

Artifacts present on `origin/codex/map-ui-002-integrate-001` and called out by the parent
closeout evidence:

| Artifact | Reviewer relevance |
| --- | --- |
| `packages/ui-web/src/geometry-editor.tsx` | Shared primitive with backend-ready payload builders, import/export, validation, and review diff hooks. |
| `packages/ui-web/src/index.tsx` | Confirms `@drts/ui-web` exports `GeometryEditor`, `GeometryPreviewSurface`, and supporting helpers/types from one stable package boundary. |
| `packages/ui-web/tests/unit/geometry-editor.test.ts` | Package-local React test surface that replaces the earlier root-level dependency leak and adds negative cases for invalid coordinates and self-intersection. |
| `packages/ui-web/src/geometry-editor.stories.tsx` | Reviewer-facing Storybook surface restored in the integrated closeout commit `4c08c6a28`. |
| `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx` | Preserves the Platform Admin sandbox preview adapter, which renders approved area/route geometry without claiming full governance workflow coverage. |
| `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md` | Parent-owned closeout evidence artifact; this sidecar summarizes it but does not supersede it. |

Two code anchors worth spot-checking:

- `packages/ui-web/src/geometry-editor.tsx`
  - `validateGeometryDraft(...)` now calls shared point validation before setting
    `canSubmit`
  - line anchors visible from the reviewed branch include:
    - `226` - `"Polygon cannot self-intersect."`
    - `281-293` - snapshot creation and `canSubmit: validation.valid`
    - `1303` - `"GeoJSON latitude must be between -90 and 90."`
    - `1338` - per-point latitude range validation
- `packages/ui-web/src/index.tsx`
  - exports `GeometryEditor`, `GeometryPreviewSurface`,
    `buildGeometryEditorSnapshot`, `geometryDraftToGeoJson`,
    `parseGeometryDraftGeoJson`, and `validateGeometryDraft`

---

## 5. Evidence Summary

### A. Parent-reported verification state

The parent `next` field reports these commands passed on the integration branch after
`pnpm install --frozen-lockfile`:

- `pnpm --filter @drts/ui-web typecheck`
- `pnpm --filter @drts/ui-web test` - reported as `2 files / 10 tests`
- `pnpm --filter @drts/ui-web lint`
- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/platform-admin-web test` - command passed, no test files present
- `pnpm --filter @drts/platform-admin-web lint`

### B. Closeout evidence consistency

The parent closeout artifact on `origin/codex/map-ui-002-integrate-001` is consistent
with the recorded blocker lineage:

- the old root-level test file `tests/unit/ui-web-geometry-editor.test.ts` is absent from
  the integrated branch
- package-local `packages/ui-web/tests/unit/geometry-editor.test.ts` exists and includes
  explicit checks for:
  - out-of-range coordinates
  - self-intersecting polygons
  - invalid GeoJSON import
  - review diff hooks
  - degraded preview rendering
- `packages/ui-web/src/geometry-editor.stories.tsx` was restored by the final closeout
  commit `4c08c6a28`
- the Platform Admin sandbox preview adapter remains present at
  `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx`

### C. What this packet does not claim

- it does not claim `MAP-UI-002` or `MAP-UI-002-HARDEN-001` should be independently
  closed from this sidecar alone
- it does not claim the Platform Admin governance workflow is complete
- it does not claim Gate B production evidence; `MAP-FE-ADM-001`, `MAP-QA-002`,
  `MAP-OBS-001`, and `MAP-REL-001` still gate that outcome per the parent closeout note

---

## 6. Reviewer Handoff

Primary reviewer for the parent task remains `Claude2`. This sidecar is handed to
reviewer `Codex` only for the support slice.

Recommended reviewer flow:

1. Confirm the sidecar remains support-only.
   - only this file should be changed on `codex2/map-ui-002-integrate-001-sidecar-review`

2. Confirm machine truth still matches the packet.
   - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-UI-002-INTEGRATE-001`
   - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-UI-002`
   - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-UI-002-HARDEN-001`

3. Confirm the reviewed integration branch still contains the expected artifact set.
   - `git ls-tree --name-only -r origin/codex/map-ui-002-integrate-001 packages/ui-web apps/platform-admin-web support/sidecars/MAP-UI-002`

4. Spot-check the three previously blocked areas on the integration branch.
   - package-local geometry-editor test location
   - coordinate range validation before `canSubmit`
   - polygon self-intersection rejection

5. Use the parent closeout artifact as the runtime-evidence source for any final
   recommendation to `Claude2`.

Suggested sidecar review conclusion if the above checks hold:

```text
MAP-UI-002-INTEGRATE-001 sidecar packet reviewed. The packet accurately summarizes the
integration branch at origin/codex/map-ui-002-integrate-001@4c08c6a28, ties it back to
the earlier MAP-UI-002 blocker packet, and correctly limits its claim to integration
evidence rather than Gate B production approval.
```
