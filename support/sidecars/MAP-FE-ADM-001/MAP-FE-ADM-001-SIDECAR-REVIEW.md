# MAP-FE-ADM-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `MAP-FE-ADM-001` - Platform Admin geofence governance UI
**Parent Owner / Reviewer:** `Codex2` / `Codex`
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`
**Reviewed branch / head:** `codex/map-fe-adm-001-gateb-corrective @ 69b0980c6`
**Generated:** `2026-07-01` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent branch.

This packet supports review handoff for `MAP-FE-ADM-001`. It does not replace the
parent branch evidence or reinterpret the parent acceptance. Its job is to pin the current
machine-truth baseline, summarize the actual reviewed corrective branch, and separate the
repo-local corrective proof from the still-open MAP-QA / MAP-REL production gates.

---

## 1. Scope Boundary

In scope:

- summarize the current machine-truth state for `MAP-FE-ADM-001` and this sidecar
- identify the active reviewed branch/head and the evidence already present there
- tell reviewer `Codex2` what the current corrective branch does prove versus what still
  remains outside this packet

Out of scope:

- editing the parent branch implementation
- changing L1/L2 canonical truth, contracts, runtime code, or governance semantics
- approving the parent task by implication
- claiming full production readiness, MAP-QA closeout, or MAP-REL closeout

---

## 2. Machine-Truth Anchors

### Sidecar task - `MAP-FE-ADM-001-SIDECAR-REVIEW`

Stable fields from `scripts/ai-status.sh show MAP-FE-ADM-001-SIDECAR-REVIEW`:

- owner=`Codex`
- reviewer=`Codex2`
- depends_on=`MAP-BE-006`
- helper_parent=`MAP-FE-ADM-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-REVIEW.md`

Live sidecar lifecycle truth remains in machine truth. Do not treat this file as the source of
truth for the sidecar's transient `status` or `last_update`.

### Parent task - `MAP-FE-ADM-001`

Current machine-truth snapshot:

- owner=`Codex2`
- reviewer=`Codex`
- status=`review`
- dependencies=`MAP-BE-006`, `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`
- planning ref=`docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- gap ref=`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Current parent `next` summary in machine truth says:

- `Codex2` handed the parent back to reviewer `Codex` at `2026-07-01T02:03:18Z`
- the active review target is stacked draft `PR #1026` on `codex/map-fe-adm-001-gateb-corrective @ 69b0980c6`
- the corrective branch claims screen-requirements fallback, task-scoped `GeometryEditor`,
  backend affected sample preview, mutation receipt audit/version hooks, helper unit coverage,
  and Playwright Gate B smoke are all implemented
- validated commands in the handoff were `platform-admin` typecheck/lint, `api-client`
  typecheck, unit helper test, e2e eslint, prettier check, contracts build, Playwright
  `platform-admin-service-area-governance`, and `git diff --check`
- the parent is still not claiming full production readiness; `MAP-QA-002` and `MAP-REL`
  remain open

### Routing trail

Task-specific `ai-activity-log.jsonl` anchors show the transition that this packet must match:

- `2026-07-01T01:20:02Z` - `Codex` reopened the parent because the earlier branch lacked a
  matching screen handoff, first-class geometry flow, affected sample preview, and publish /
  retire acceptance proof
- `2026-07-01T01:24:16Z` - `Codex2` re-handed the earlier branch `9ff0d1113`, explicitly
  keeping those concerns open
- `2026-07-01T01:28:40Z` - `Codex` reopened again because the packet still described an
  invented full UI without the required fallback/evidence
- `2026-07-01T02:03:18Z` - `Codex2` handed off the corrective review target `69b0980c6`
  with the new evidence list and validation summary

Practical meaning:

- parent `MAP-FE-ADM-001` is no longer in the old failed-review posture captured by the prior
  sidecar packet
- the current reviewer framing must talk about a live `review` on the corrective branch, not a
  stale `in_progress` or reopened state

### Dependency baseline

Related machine-truth slices at packet time:

- `MAP-UI-002` remains `review`
- `MAP-UI-002-HARDEN-001` remains `review`
- `MAP-UI-002-INTEGRATE-001` remains `review`
- `scripts/ai-status.sh show MAP-BE-006` currently returns `Task not found`

Practical meaning:

- the corrective branch answers the reopen with a task-scoped Platform Admin geometry surface;
  it does not claim that a shared design-system `GeometryEditor` already exists
- reviewer should read the parent evidence as a corrective branch proving repo-local governance
  wiring and test coverage, while still respecting the remaining QA / release gates

---

## 3. Reviewed Evidence Surface

Primary evidence anchors on `codex/map-fe-adm-001-gateb-corrective @ 69b0980c6`:

- `apps/platform-admin-web/app/service-areas/page.tsx`
  - keeps `/service-areas` as the dedicated Platform Admin governance route
  - lifecycle controls require reason-gated review / publish / retire actions
    (`page.tsx:861-949`)
  - task-scoped `ServiceAreaGeometryEditor` is mounted with read-only behavior for active /
    retired records and explicit save/reset flows (`page.tsx:951-1019`)
  - affected sample preview is now a first-class publish gate that must be fresh before publish
    and records evaluator decisions / geometry version refs (`page.tsx:1021-1149`)
  - mutation receipt exposes backend audit ID, generated timestamp, record identity, and
    version ref after actions (`page.tsx:1245-1294`)
- `apps/platform-admin-web/components/service-area-geometry-editor.tsx`
  - provides the task-scoped geometry surface for polygon/circle editing, validation state,
    GeoJSON/native import/export, and preview summary (`service-area-geometry-editor.tsx:18-198`)
- `apps/platform-admin-web/lib/service-area-governance.ts`
  - blocks invalid coordinates and self-intersecting polygons (`service-area-governance.ts:65-103`)
  - builds affected evaluator samples and summarizes evaluator proof for publish gating
    (`service-area-governance.ts:186-260`)
- `packages/api-client/src/index.ts`
  - exposes typed service-area helpers for definitions, GeoJSON export, evaluate, create/update,
    submit-review, publish, retire, and stop-policy mutations (`index.ts:2920-3025`)
- `tests/unit/platform-admin-service-area-governance.test.ts`
  - proves self-intersection rejection, affected sample generation, and evaluator summary logic
    (`platform-admin-service-area-governance.test.ts:37-117`)
- `tests/unit/platform-admin-assistant-route-context.test.ts`
  - proves `/service-areas` is registered as a Platform Admin write surface with route metadata
    (`platform-admin-assistant-route-context.test.ts:137-146`)
- `tests/e2e/platform-admin-service-area-governance.spec.ts`
  - mocks definitions, GeoJSON export, evaluator, publish, and retire endpoints
  - asserts GeometryEditor valid state, fresh affected preview, evaluator decision/version refs,
    publish receipt, and retire receipt (`platform-admin-service-area-governance.spec.ts:180-370`)
- `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md`
  - supplies the screen-requirements fallback the earlier review reopen demanded
  - defines required regions, test hooks, publish safety rules, and explicit evidence boundary
    (`platform-admin-service-area-governance-screen-requirements-20260701.md:13-46`)
- `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`
  - states the corrective scope pass and its exact remaining-work boundary
    (`MAP-FE-ADM-001-FINAL-EVIDENCE.md:11-25`, `:102-107`)

---

## 4. Evidence Summary

| Review question | Current posture | Evidence anchor |
| --- | --- | --- |
| Is there a dedicated Platform Admin governance route? | `YES_FOR_UI_SURFACE` | `/service-areas` route, route-context coverage, and page test hooks |
| Are typed client methods present for service-area governance APIs? | `YES_FOR_CLIENT_WIRING` | `packages/api-client/src/index.ts:2920-3025` |
| Is the earlier missing screen handoff now addressed? | `YES_FOR_SCREEN_REQUIREMENTS_FALLBACK` | `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md:13-46` |
| Does the branch now include a geometry editor flow? | `YES_FOR_TASK_SCOPED_FIX` | `service-areas/page.tsx:951-1019` plus `service-area-geometry-editor.tsx:18-198` |
| Is invalid geometry blocked before publish? | `YES_FOR_REPO_LOCAL_PROOF` | validation helpers and unit test coverage for self-intersection / coordinate errors |
| Is affected sample preview required before publish? | `YES_FOR_REPO_LOCAL_PROOF` | publish gate + preview summary in `service-areas/page.tsx:524-540` and `:1021-1149` |
| Does the branch now capture mutation receipt / audit-version hooks? | `YES_FOR_REPO_LOCAL_PROOF` | mutation receipt panel in `service-areas/page.tsx:1245-1294` |
| Does the Playwright smoke exercise preview + publish + retire flow? | `YES_FOR_MOCKED_SMOKE_SCOPE` | `platform-admin-service-area-governance.spec.ts:180-370` |
| Does this branch alone prove downstream callcenter / full production readiness? | `NO` | parent machine truth and final evidence both keep `MAP-QA-002` / `MAP-REL` open |

The cleanest way to read the reviewed branch is:

- it fixes the exact repo-local gaps that caused the prior parent reopen
- it proves a task-scoped governance surface now exists with geometry editing, preview gating,
  mutation receipt hooks, and mocked smoke coverage
- it does not collapse the remaining QA / release obligations into this branch, and it does not
  by itself prove cross-surface callcenter behavior or full production release readiness

---

## 5. Reviewer Hotspots

Reviewer `Codex2` should verify:

1. This sidecar now matches machine truth: parent `MAP-FE-ADM-001` is `review`, not
   `in_progress`.
2. The active reviewed head is `codex/map-fe-adm-001-gateb-corrective @ 69b0980c6` on draft
   `PR #1026`, not the earlier `9ff0d1113` branch state.
3. The packet no longer describes `GeometryEditor`, affected preview, or mutation receipt as
   missing; it describes them as corrective-scope evidence now present on the reviewed branch.
4. The packet still preserves the evidence boundary from the parent handoff and final evidence:
   this is a corrective-scope pass, not a claim that `MAP-QA-002`, callcenter downstream proof,
   or `MAP-REL` are complete.
5. The screen-requirements fallback doc, page-level publish gate, helper unit tests, and
   Playwright smoke are all called out explicitly, so the reviewer can cross-check the reopen
   reasons against the new evidence.
6. The packet remains support-only and does not mutate parent code, canonical truth, or task
   acceptance.

Suggested sidecar approval wording:

> `審查通過：MAP-FE-ADM-001 sidecar review packet 已更新為目前 machine truth 的 parent review 狀態，並正確對齊 corrective branch codex/map-fe-adm-001-gateb-corrective@69b0980c6 的證據。packet 清楚區分了已補齊的 screen-requirements fallback、task-scoped GeometryEditor、affected preview、mutation receipt 與 mocked Playwright smoke，並保留 MAP-QA-002 / MAP-REL / downstream callcenter proof 仍未關閉的邊界，未改 canonical truth。`

Suggested reopen wording:

> `packet needs refresh: [machine-truth mismatch / reviewed-head moved / evidence summary underclaims or overclaims corrective scope / support-scope violation]`

---

## 6. Owner Verification

Verification run for this sidecar refresh:

- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002-HARDEN-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002-INTEGRATE-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-006` (returned `Task not found`)
- task-scoped `grep` against `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- `git show 69b0980c6:apps/platform-admin-web/app/service-areas/page.tsx`
- `git show 69b0980c6:apps/platform-admin-web/components/service-area-geometry-editor.tsx`
- `git show 69b0980c6:apps/platform-admin-web/lib/service-area-governance.ts`
- `git show 69b0980c6:packages/api-client/src/index.ts`
- `git show 69b0980c6:tests/unit/platform-admin-service-area-governance.test.ts`
- `git show 69b0980c6:tests/unit/platform-admin-assistant-route-context.test.ts`
- `git show 69b0980c6:tests/e2e/platform-admin-service-area-governance.spec.ts`
- `git show 69b0980c6:docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md`
- `git show 69b0980c6:support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`
- `git diff --check -- support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-REVIEW.md`
- `git diff --no-index --check /dev/null support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-REVIEW.md`

Not applicable:

- runtime tests
- typecheck
- lint
- app execution

Reason: this sidecar writes one support artifact only and summarizes already-recorded parent
evidence rather than changing runtime or canonical truth.
