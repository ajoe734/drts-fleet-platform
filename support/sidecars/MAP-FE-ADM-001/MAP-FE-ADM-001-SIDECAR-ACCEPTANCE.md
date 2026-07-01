# MAP-FE-ADM-001 Sidecar Acceptance Packet

- **Parent Task:** `MAP-FE-ADM-001` - Platform Admin geofence governance UI
- **Sidecar Task:** `MAP-FE-ADM-001-SIDECAR-ACCEPTANCE`
- **Packet Scope:** support artifact only; no canonical truth, runtime, or parent-branch edits
- **Current Sidecar Status:** `in_progress` (`owner=Codex`, `reviewer=Codex2`, `last_update=2026-07-01T14:50:29Z`)
- **Current Parent Status:** `in_progress` (`owner=Codex2`, `reviewer=Gemini`, `last_update=2026-07-01T10:16:22Z`)

## 1. Why This Refresh Exists

This packet supersedes the earlier closeout-oriented sidecar snapshot.

Current machine truth shows:

- `MAP-FE-ADM-001-SIDECAR-ACCEPTANCE` was redispatched to `Codex` at
  `2026-07-01T14:50:00Z` via availability-first reassignment.
- `MAP-FE-ADM-001` is still `in_progress`; it is not in a closeout-ready state.
- the earlier `MAP-FE-ADM-001-SIDECAR-REVIEW` packet is no longer a live task
  slice; it is archived as `done` and must not be described as pending review.

The purpose of this refresh is narrow: give reviewer `Codex2` an updated
acceptance checklist, dependency map, and handoff summary that match the live
board and archived dependency evidence.

## 2. Source Basis

This packet relies only on sources available from the current worktree and
machine-truth helpers:

- live task slices from `AI_NAME=Codex scripts/ai-status.sh show ...`
- archived task slices from `"$AI_STATUS_ROOT/ai-task-archive.jsonl"`
- dispatch/activity records from `"$AI_STATUS_ROOT/ai-activity-log.jsonl"`
- dependency topology from:
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Important boundary:

- the live `MAP-FE-ADM-001` task slice points at `20260701` planning/gap docs,
  but those paths are not present on this task branch snapshot
- no claim in this packet depends on unreadable files

## 3. Machine-Truth Snapshot

| Task | Status | Owner -> Reviewer | Snapshot for this packet |
| --- | --- | --- | --- |
| `MAP-FE-ADM-001-SIDECAR-ACCEPTANCE` | `in_progress` | `Codex` -> `Codex2` | Live sidecar helper. Current work is limited to this support packet. |
| `MAP-FE-ADM-001` | `in_progress` | `Codex2` -> `Gemini` | Parent remains open. The `next` field is the acceptance baseline for this packet. |
| `MAP-UI-002` | `review` | `Codex2` -> `Claude2` | Shared `GeometryEditor` primitive is still under review. |
| `MAP-UI-002-HARDEN-001` | `review` | `Codex2` -> `Claude2` | Validation hardening is still under review and still blocks safe governance publish claims. |
| `MAP-UI-002-INTEGRATE-001` | `review` | `Codex` -> `Claude2` | Integrated primitive + hardening branch is still review-gated. |
| `MAP-REL-001` | `in_progress` | `Codex2` -> `Gemini` | Release readiness remains open; latest summary says readiness is still `FAIL` with 34 failures. |
| `MAP-BE-006` | `done` (archived) | `Codex` -> `Codex2` | Backend lifecycle authority is complete; this sidecar uses archive evidence because the task is no longer live. |
| `MAP-FE-ADM-001-SIDECAR-REVIEW` | `done` (archived) | `Codex` -> `Codex2` | Earlier review packet is closed out and archived; it is context only, not a live queue item. |

## 4. Parent Acceptance Baseline

Live machine truth still lists the parent acceptance targets as:

1. `admin can publish no-pickup zone without SQL`
2. `published zone affects evaluator`
3. `audit actor version effect direction effective date visible`
4. `platform-admin checks pass`

The current parent `next` field says the task is still blocked by these open
gaps:

1. `/service-areas` shipped with only a fallback screen-requirements note.
2. affected-preview freshness ignores `effectiveFrom` changes.
3. submit-review reason is required in UI but never reaches API audit.
4. GeoJSON import does not surface mutation receipts.

Operational implication:

- this sidecar may summarize acceptance criteria and dependency posture
- it must not imply the parent is ready for `review_approved`, `done`, or Gate B
  production closure

## 5. Dependency Map

### 5.1 Direct sidecar dependency

The sidecar task itself still lists only one direct dependency:

- `MAP-BE-006`

Archive evidence for `MAP-BE-006` shows:

- `status=done`
- `commit_hash=55dad2ca4c79fc7370cf069996efb2ddf2cf704a`
- `merge_commit=1c06a5cfb56ac94e117d2ed773f5938750be67c0`
- `integration_status=merged_to_dev`
- `pr_url=https://github.com/ajoe734/drts-fleet-platform/pull/1020`

That archived closeout says backend governance already owns:

- service-area boundary and stop-policy lifecycle APIs
- draft/review/publish/retire and effective dating
- version refs
- geometry validation
- audit
- published-geometry evaluator refresh

Reviewer conclusion:

- `MAP-FE-ADM-001` should consume backend authority
- it must not invent a parallel lifecycle or audit contract in the UI packet

### 5.2 Parent implementation dependency chain

The execution packet's dependency graph states:

```text
MAP-BE-006 + MAP-UI-002
  -> MAP-FE-ADM-001
```

The same execution packet describes `MAP-FE-ADM-001` as the Platform Admin
surface that must:

- add the service-area governance route
- use `GeometryEditor`
- support draft/review/publish/retire/effective-date workflow
- preview affected samples before publish

The gap inventory adds an important boundary:

- `MAP-BE-006` already covers backend lifecycle APIs and evaluator refresh
- the Platform Admin map editor, review workflow UI, and publish/retire
  operator experience remain open in `MAP-UI-002` and `MAP-FE-ADM-001`

Reviewer conclusion:

- current parent acceptance must still track the live `MAP-UI-002*` review chain
- backend completion alone is not enough to close the Platform Admin acceptance

### 5.3 Release-gate dependency chain

The execution packet also records:

```text
All implementation tasks
  -> MAP-QA-002 -> MAP-REL-001
```

Current live `MAP-REL-001` status matters because its `next` field says:

- latest blocker report:
  `support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md`
- dispatch integrity remains `PASS`
- production readiness remains `FAIL` (`14 ok / 0 warnings / 34 failures`)
- no one should claim production-ready status until QA/OBS/REL final evidence
  exists, Gate A-E tasks are done, and the readiness verifier passes

Reviewer conclusion:

- even if the parent branch proves repo-local fixes, this acceptance packet must
  stop short of any production-readiness claim

## 6. Reviewer Handoff Notes

Reviewer `Codex2` should check only the following:

1. the packet matches the current live owner/reviewer map:
   `MAP-FE-ADM-001` is `Codex2 -> Gemini`, not `Codex2 -> Codex`
2. the packet treats `MAP-FE-ADM-001-SIDECAR-REVIEW` as archived context, not
   as a live `review` or `review_approved` task
3. the packet distinguishes:
   - archived backend completion from `MAP-BE-006`
   - live geometry-review gates from `MAP-UI-002*`
   - live release-readiness blockers from `MAP-REL-001`
4. the packet preserves the current parent blocker summary from live machine
   truth and does not overclaim readiness
5. the packet remains support-only and does not modify canonical truth

This packet is not:

- approval of the parent implementation
- proof that Gate B is closed
- proof that QA/OBS/REL release evidence is complete

## 7. Verification

Commands used to refresh this packet:

- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001-SIDECAR-ACCEPTANCE`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002-HARDEN-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002-INTEGRATE-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-REL-001`
- `grep -n '"id": "MAP-BE-006"' "$AI_STATUS_ROOT/ai-task-archive.jsonl"`
- `grep -n '"id": "MAP-FE-ADM-001-SIDECAR-REVIEW"' "$AI_STATUS_ROOT/ai-task-archive.jsonl"`
- `grep -n 'MAP-FE-ADM-001-SIDECAR-ACCEPTANCE' "$AI_STATUS_ROOT/ai-activity-log.jsonl" | tail -n 8`
- `sed -n '739,820p' docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `sed -n '920,950p' docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `sed -n '410,424p' docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `git diff --check -- support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-ACCEPTANCE.md`

No runtime or package verification commands were run for this sidecar refresh
because the change is support-only and does not alter executable behavior.
