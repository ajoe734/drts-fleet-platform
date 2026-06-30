# MAP-FE-ADM-001 Gate B Governance Evidence Packet

**Sidecar task:** `MAP-FE-ADM-001-SIDECAR-GATEB`

**Parent task:** `MAP-FE-ADM-001` - Platform Admin geofence governance UI

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This packet defines Platform Admin / Phase 2 governance acceptance and release evidence; it does not implement the admin UI itself.

## 1. Gate B Verdict

Do **not** claim Gate B until Platform Admin can create, review, publish, retire, and audit governed geometry without SQL, and until a published rule changes backend service-area evaluation used by booking creation.

Current state:

- Platform Admin has normal management routes, but no dedicated service-area/geofence governance route in `apps/platform-admin-web/app/`.
- Backend service-area admin endpoints exist for service-area boundary and stop-policy create/update/submit-review/publish/retire in `apps/api/src/modules/service-area/service-area.controller.ts`.
- Backend Phase 2 sandbox-governance endpoints exist for operating-area, pickup/dropoff-zone, and route GeoJSON/export/draft/review/publish/retire flows in `apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts`.
- `MAP-FE-ADM-001` is correctly gated on `MAP-UI-002-HARDEN-001` and `MAP-UI-002-INTEGRATE-001`; the admin UI must not build on a half-integrated `GeometryEditor`.
- Typed API-client service-area methods may depend on `MAP-BE-003` being present in the tested branch. If unavailable, `MAP-FE-ADM-001` must add the typed methods or document a temporary wrapper with equivalent tests.

Gate B is the production safety line for "who can define the operating/service area and no-stop rules." It is not satisfied by a visual drawing tool alone.

## 2. Production Acceptance

`MAP-FE-ADM-001` should not close unless all rows below have evidence.

| Capability                  | Required behavior                                                                                                                                                                                         | Must not happen                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Governance route            | Platform Admin exposes a dedicated route for service-area boundaries and stop policies with stable test hooks.                                                                                            | Geometry governance is hidden in an unrelated page or requires SQL/manual API calls.                        |
| Geometry editor integration | Admin uses the integrated `GeometryEditor` with coordinate range validation, polygon self-intersection blocking, circle/polygon/route support where applicable, GeoJSON import/export, and preview state. | Invalid or self-intersecting geometry reaches a publish-ready action.                                       |
| Lifecycle workflow          | UI supports draft, update, submit-review, publish, retire, effective-from/effective-to, reason, and version refs.                                                                                         | Active/retired geometry can be edited in place without creating a new version.                              |
| Stop-policy semantics       | UI captures direction (`pickup`, `dropoff`, `both`), effect (`allow`, `deny`, `manual_review`), service products, and operator/customer-safe reason copy.                                                 | No-pickup/no-dropoff/manual-review rules are represented only as generic polygons with no policy semantics. |
| Evaluator proof             | Published boundary/policy changes backend evaluation and booking creation behavior.                                                                                                                       | UI publish succeeds but evaluator still uses old geometry or stale version refs.                            |
| Audit proof                 | Publish/retire and geometry mutations expose actor, version, effect, direction, effective date, reason, request ID, and geometry version ref.                                                             | Audit only shows a screenshot or UI toast without backend event fields.                                     |
| Phase 2 split               | Phase 2 ODD operating areas, approved routes, and pickup/dropoff zones share geometry primitives but remain separate from normal taxi service-area authority.                                             | Sandbox ODD/route layers are mixed into taxi service-area policy or vice versa.                             |
| Rollback/retire             | Retire/rollback path is visible and tested; prior active versions are traceable.                                                                                                                          | A bad publish can only be repaired by database edits.                                                       |

## 3. Required UI Slices

Recommended implementation slices:

| Slice                         | Expected artifacts                                                                                  | Required evidence                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Service-area governance route | `apps/platform-admin-web/app/service-area-governance/page.tsx` or equivalent route.                 | Route renders list/detail/editor/review states with stable `data-*` hooks.                                           |
| Boundary editor               | Boundary draft/update/review/publish/retire UI using `GeometryEditor`.                              | Unit/component tests reject invalid coordinates and self-intersecting polygons before publish.                       |
| Stop-policy editor            | Direction/effect/product/reason/effective-date form tied to geometry.                               | Tests prove no-pickup, no-dropoff, and manual-review states serialize to backend commands.                           |
| Affected preview              | Preview sample stops/orders or evaluator result before publish.                                     | UI shows impacted sample plus backend evaluation result/version refs.                                                |
| Audit panel                   | Mutation receipt and history drawer/card.                                                           | Actor/version/effect/direction/effective-date/request ID appear after publish/retire.                                |
| Phase 2 layers                | Separate UI mode or route group for ODD operating areas, pickup/dropoff zones, and approved routes. | Tests prove sandbox layers use `/api/admin/sandbox-governance/*` and do not mutate normal taxi service-area records. |

## 4. Backend/API Anchors

The UI should use or wrap these backend surfaces:

| Domain                       | API anchor                                             | Gate B usage                                                                  |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Service-area boundary        | `POST /api/service-area/admin/service-areas`           | Create governed service-area draft.                                           |
| Service-area lifecycle       | `.../submit-review`, `.../publish`, `.../retire`       | Move boundary through draft/review/active/retired states.                     |
| Stop policy                  | `POST /api/service-area/admin/stop-policies`           | Create no-pickup/no-dropoff/manual-review policy with geometry and semantics. |
| Stop-policy lifecycle        | `.../submit-review`, `.../publish`, `.../retire`       | Govern pickup/dropoff policy publication and rollback.                        |
| Evaluator                    | `POST /api/service-area/evaluate`                      | Prove a published version affects booking/serviceability decisions.           |
| Phase 2 ODD areas            | `/api/admin/sandbox-governance/operating-areas/*`      | Govern sandbox operating areas separately from taxi service areas.            |
| Phase 2 pickup/dropoff zones | `/api/admin/sandbox-governance/pickup-dropoff-zones/*` | Govern sandbox pickup/dropoff zones separately from taxi stop policies.       |
| Phase 2 approved routes      | `/api/admin/sandbox-governance/routes/*`               | Govern approved route geometry and GeoJSON exports.                           |

Typed client expectation:

- Prefer `@drts/api-client` methods from `MAP-BE-003` for service-area admin and evaluation calls.
- If the tested branch lacks those methods, add them in `MAP-FE-ADM-001` or use a small typed Platform Admin wrapper with unit tests and an explicit follow-up to collapse it back into `@drts/api-client`.

## 5. Gate B E2E Scenarios

`MAP-QA-002` should cover these under `E2E-MAP-002` and release Gate B.

| Scenario                                           | Required assertions                                                                                                                                                                            | Gate risk covered                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `E2E-ADM-GOV-001 publish no-pickup zone`           | Admin draws/imports a valid polygon, submits review, publishes with actor/reason/effective date; audit receipt shows version/effect/direction; evaluator returns blocked for an inside pickup. | Proves governance publish changes backend authority.                             |
| `E2E-ADM-GOV-002 callcenter blocked after publish` | After publish, callcenter attempts pickup inside no-pickup zone; normal dispatch is blocked and operator-visible reason matches policy reason code.                                            | Connects Gate B to Gate A production safety.                                     |
| `E2E-ADM-GOV-003 retire rollback`                  | Retire active policy with reason; evaluator no longer blocks the same point or uses next active version; audit records retire actor/version/time.                                              | Proves bad policy can be safely retired without SQL.                             |
| `E2E-ADM-GOV-004 invalid geometry blocked`         | Self-intersecting polygon/out-of-range coordinate cannot enter publish-ready state in UI and backend rejects tampered payload.                                                                 | Proves GeometryEditor hardening is integrated, not merely unit-tested elsewhere. |
| `E2E-ADM-GOV-005 manual-review policy`             | Publish manual-review zone; booking routes to manual review, not normal dispatch; snapshot includes geometryVersionRef/reason.                                                                 | Proves policy effects other than hard deny are safe.                             |
| `E2E-ADM-GOV-006 Phase 2 separation`               | Create/publish sandbox ODD operating area or approved route; GeoJSON layer exports; normal taxi service-area definitions/evaluator are not mutated.                                            | Prevents regulatory-domain cross-contamination.                                  |

## 6. Minimum Verification Commands

Parent task handoff should include exact branch/SHA and at least:

```bash
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web test
pnpm --filter @drts/platform-admin-web lint
pnpm --filter @drts/ui-web typecheck
pnpm --filter @drts/ui-web test
pnpm --filter @drts/ui-web lint
pnpm --filter @drts/api-client typecheck
pnpm exec playwright test -c playwright.map-geofence-harness.config.ts --grep "admin|governance|no-pickup|publish|retire"
```

If the final E2E uses a narrower config, the handoff must explain how it still proves publish, evaluator, callcenter block, audit, retire, invalid-geometry, and Phase 2 separation paths.

## 7. Release Evidence Required

Before `MAP-REL-001` can mark Gate B pass, evidence must include:

- Admin route URL and screenshot/trace for governance editor.
- Published service-area or stop-policy ID/version/effective date.
- Audit event payload with actor, action, version, effect/direction, reason, request ID, and geometry version ref.
- Evaluator response before and after publish/retire.
- Callcenter blocked/manual-review assertion using the published policy.
- Invalid geometry UI and backend rejection assertion.
- Phase 2 sandbox layer evidence showing separate endpoints/data domain.
- Rollback/retire evidence and rollout flag state.

## 8. Do-Not-Claim Rules

`MAP-FE-ADM-001`, `MAP-QA-002`, and `MAP-REL-001` must not claim:

- "Gate B pass"
- "Governance safe to publish"
- "Platform Admin can manage geofences"
- "Phase 2 ODD/route governance complete"
- "No-pickup/no-dropoff production-ready"

unless the evidence packet includes UI, backend, evaluator, audit, and E2E proof for the exact claim.

Safe interim wording:

- "Platform Admin governance UI is scoped and assigned."
- "Backend lifecycle APIs exist, but admin UI and E2E evidence are pending."
- "Gate B remains pending integrated GeometryEditor, admin publish/retire UI, evaluator proof, and audit evidence."

## 9. Parent And QA Handoff

Recommended note for `MAP-FE-ADM-001`:

```text
Use support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-GATE-B-GOVERNANCE.md as the Gate B implementation/evidence checklist. Do not close Platform Admin governance until the integrated GeometryEditor, service-area boundary/stop-policy lifecycle UI, Phase 2 ODD/route separation, audit receipt, evaluator proof, callcenter blocked-after-publish path, retire/rollback path, and admin E2E evidence are all present.
```

Recommended note for `MAP-QA-002`:

```text
Use MAP-FE-ADM-001-SIDECAR-GATEB for E2E-MAP-002. Gate B E2E must prove admin publish/retire, evaluator refresh, callcenter blocked/manual-review behavior, audit payloads, invalid geometry rejection, and Phase 2 sandbox governance separation.
```

Recommended note for `MAP-REL-001`:

```text
Gate B release closeout must reference MAP-FE-ADM-001-SIDECAR-GATEB before claiming governance-safe publish. No Gate B pass without Platform Admin publish/retire UI evidence, backend evaluator proof, audit payloads, invalid-geometry rejection, callcenter blocked-after-publish, rollback/retire, and Phase 2 ODD/route separation evidence.
```

## 10. Owner Closeout Note

- Reviewed source approval: `origin/codex/map-fe-adm-001-sidecar-gateb@3c460c150`.
- Closeout scope: metadata-only owner finalization for this support packet after reviewer approval.
- This sidecar still does not claim Platform Admin publish E2E, evaluator proof, audit proof, or Gate B pass.
