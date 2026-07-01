# MAP-FE-ADM-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `MAP-FE-ADM-001` - Platform Admin geofence governance UI
**Parent Owner / Reviewer:** `Codex2` / `Codex`
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`
**Reviewed branch / head:** `codex/map-fe-adm-001-governance-ui @ 9ff0d1113`
**Generated:** `2026-07-01` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical truth, runtime behavior, or the parent branch.

This packet exists to support review handoff for `MAP-FE-ADM-001`. It does not replace the
parent branch evidence or reinterpret the parent acceptance. Its job is to pin the current
machine-truth baseline, summarize the actual evidence surface on the reviewed branch, and
separate the implemented UI/API-client work from the still-open Gate B / acceptance gaps.

---

## 1. Scope Boundary

In scope:

- summarize the current machine-truth state for `MAP-FE-ADM-001` and this sidecar
- identify the reviewed branch/head and the evidence files already present there
- tell reviewer `Codex2` what is actually proven versus still open

Out of scope:

- editing the parent branch implementation
- changing L1/L2 canonical truth, contracts, runtime code, or governance semantics
- approving the parent task by implication
- claiming Gate B pass, production readiness, or full acceptance closure

---

## 2. Machine-Truth Anchors

### Sidecar task — `MAP-FE-ADM-001-SIDECAR-REVIEW`

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

### Parent task — `MAP-FE-ADM-001`

Current machine-truth snapshot:

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress`
- dependencies=`MAP-BE-006`, `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`
- planning ref=`docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- gap ref=`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Current parent `next` summary in machine truth says the earlier review failed because:

- `/service-areas` shipped an invented full UI without a matching Platform Admin design-canvas
  screen or screen-requirements fallback
- the required `GeometryEditor` and affected sample preview were not present
- publish -> evaluator proof and audit payload proof were not captured

### Routing trail

Task-specific `ai-activity-log.jsonl` entries show:

- `2026-07-01T01:15:50Z` — `Codex2` handed `MAP-FE-ADM-001` to reviewer `Codex` on
  `PR #1024` / `origin/codex/map-fe-adm-001-governance-ui@914b01239`
- `2026-07-01T01:20:02Z` — `Codex` reopened the parent review: no matching screen handoff,
  no `GeometryEditor`, no affected sample preview, and new Playwright only asserted Gate B hooks
- `2026-07-01T01:24:16Z` — `Codex2` re-handed off the parent on updated head `9ff0d1113`
  after fixing the API boot blocker and passing a smoke Playwright run, while explicitly keeping
  `GeometryEditor`, affected-preview, evaluator, downstream Callcenter, audit-payload,
  `MAP-QA-002`, and `MAP-REL-001` concerns open
- `2026-07-01T01:26:11Z` to `2026-07-01T01:26:29Z` — this sidecar was auto-created for
  `Gemini2` and hit two terminal worker failures
- `2026-07-01T01:28:38Z` — chair reassigned the sidecar owner from `Gemini2` to `Gemini`
- `2026-07-01T01:58:40Z` — availability-first rebalance reassigned the sidecar owner from
  `Gemini` to `Codex`

### Dependency baseline

Related machine-truth slices at packet time:

- `MAP-UI-002` is still `review`; its own sidecar review note says do not approve the primitive
  yet without the blocker fixes integrated
- `MAP-UI-002-HARDEN-001` is `review` and claims coordinate-range, self-intersection, and
  GeoJSON-import hardening with verification
- `MAP-UI-002-INTEGRATE-001` is `review` and claims the integrated branch contains both the
  primitive and the hardening fixes together
- `scripts/ai-status.sh show MAP-BE-006` currently returns `Task not found`, so this packet
  treats backend authority availability as a code / branch evidence anchor rather than assuming a
  resolvable machine-truth task slice exists

Practical meaning:

- the reviewed parent branch should be treated as a corrective UI/API-client pass over an
  existing reopen, not as a clean acceptance closeout
- `GeometryEditor` remains a dependency risk until the integrated `MAP-UI-002*` line is actually
  reviewer-approved and absorbed
- parent acceptance must still be checked against what the reviewed branch explicitly does not
  prove

---

## 3. Reviewed Evidence Surface

Primary evidence anchors on `codex/map-fe-adm-001-governance-ui`:

- `apps/platform-admin-web/app/service-areas/page.tsx`
  - adds `/service-areas` with lifecycle controls, effective-window inputs, reason gating,
    GeoJSON import/export, audit/version summary copy, and sandbox separation warning
  - relevant sections include publish / retire command wiring
    (`page.tsx:451-531` on reviewed head) and UI hooks
    (`page.tsx:555-857` on reviewed head)
- `packages/api-client/src/index.ts`
  - adds typed service-area helpers for definitions, GeoJSON export, evaluate, create/update,
    submit-review, publish, and retire (`index.ts:2922-3007` on reviewed head)
- `tests/unit/platform-admin-assistant-route-context.test.ts`
  - proves `/service-areas` is registered as a Platform Admin write surface and exposes the
    expected assistant metadata
- `tests/e2e/platform-admin-service-area-governance.spec.ts`
  - mocks definitions and GeoJSON export only, then asserts route visibility plus `data-testid`
    hooks and version-ref attributes (`spec.ts:9-206` on reviewed head)
- `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`
  - states a scoped pass for UI/API-client/test hooks and the corrected API boot smoke
  - explicitly keeps evaluator, downstream Callcenter, audit payload, and `GeometryEditor`
    integration open (`FINAL-EVIDENCE.md:90-96` on reviewed head)
- `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-GATE-B-GOVERNANCE.md`
  - already states that Gate B must not be claimed without publish/evaluator/audit/callcenter/
    rollback/Phase 2 separation evidence

---

## 4. Evidence Summary

| Review question | Current posture | Evidence anchor |
| --- | --- | --- |
| Is there now a dedicated Platform Admin governance route? | `YES_FOR_UI_SURFACE` | `/service-areas` route plus route-context test and stable `data-testid` hooks |
| Are typed client methods present for the backend service-area admin APIs? | `YES_FOR_CLIENT_WIRING` | `packages/api-client/src/index.ts:2922-3007` |
| Does the page wire submit-review / publish / retire actions to typed client methods? | `YES_FOR_COMMAND_WIRING` | `service-areas/page.tsx:440-485` and `:672-758` |
| Does the branch prove a first-class `GeometryEditor` integration? | `NO` | parent final evidence explicitly says no first-class `GeometryEditor` export exists in this branch |
| Does the branch prove affected sample preview before publish? | `NO` | current page is tables + lifecycle controls + GeoJSON import/export; no affected-preview evidence is present |
| Does the reviewed Playwright smoke prove publish / retire / evaluator / audit acceptance? | `NO` | `platform-admin-service-area-governance.spec.ts:172-206` only checks visibility and hooks after mocked reads |
| Does the branch prove publish changes backend evaluator output or Callcenter behavior? | `NO` | parent final evidence explicitly keeps evaluator and downstream Callcenter proof open |
| Does the branch prove publish / retire audit payload fields? | `NO` | page shows summary copy, but the evidence packet explicitly says audit payload inspection is not captured |
| Is Gate B or full parent acceptance ready to approve from this evidence alone? | `NO` | machine-truth reopen plus branch-side `FINAL-EVIDENCE` do-not-claim section align on remaining gaps |

The cleanest way to read the reviewed branch is:

- it proves a Platform Admin governance route now exists
- it proves typed API-client and route/test-hook scaffolding were added
- it proves the prior API boot blocker was fixed and a mocked smoke path can load the route
- it does **not** prove the still-open acceptance items that caused the parent review reopen

---

## 5. Reviewer Hotspots

Reviewer `Codex2` should verify:

1. This sidecar does not drift from machine truth: parent `MAP-FE-ADM-001` remains
   `in_progress`, not `review_approved` or `done`.
2. The packet preserves the current parent-review framing: corrected branch head `9ff0d1113`
   fixed the API boot blocker, but the acceptance concerns stayed open.
3. `MAP-FE-ADM-001-FINAL-EVIDENCE.md` is read together with its own `Remaining Work / Do Not
   Claim` section, not just the scope-pass headline.
4. The reviewed Playwright spec is locator / hook evidence only. It does not exercise
   submit-review, publish, retire, evaluator refresh, downstream Callcenter blocking, or audit
   payload inspection.
5. The current UI is based on Canvas primitives plus GeoJSON import/export and lifecycle forms,
   not on a first-class `GeometryEditor` surface with affected sample preview.
6. The packet stays support-only and does not mutate the parent branch, canonical truth, or task
   acceptance.

Suggested sidecar approval wording:

> `審查通過：MAP-FE-ADM-001 sidecar review packet 已正確對齊 machine truth 與 reviewed branch 證據。它清楚區分了已完成的 UI/API-client/test-hook 範圍與仍未滿足的 parent acceptance（GeometryEditor、affected preview、publish->evaluator、Callcenter downstream effect、audit payload、Gate B/QA/REL 證據），且未改 canonical truth。`

Suggested reopen wording:

> `packet needs refresh: [machine-truth mismatch / reviewed-head moved / evidence summary overclaims parent acceptance / support-scope violation]`

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
- `git show codex/map-fe-adm-001-governance-ui:apps/platform-admin-web/app/service-areas/page.tsx`
- `git show codex/map-fe-adm-001-governance-ui:packages/api-client/src/index.ts`
- `git show codex/map-fe-adm-001-governance-ui:tests/e2e/platform-admin-service-area-governance.spec.ts`
- `git show codex/map-fe-adm-001-governance-ui:support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`
- `git diff --check -- support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-REVIEW.md`
- `git diff --no-index --check /dev/null support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-REVIEW.md`

Not applicable:

- runtime tests
- typecheck
- lint
- app execution

Reason: this sidecar writes only one support artifact and does not change runtime or canonical
truth.
