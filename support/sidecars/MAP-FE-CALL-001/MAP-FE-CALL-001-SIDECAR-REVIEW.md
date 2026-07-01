# MAP-FE-CALL-001 Review Packet & Evidence Summary

- **Sidecar Task:** `MAP-FE-CALL-001-SIDECAR-REVIEW`
- **Parent Task:** `MAP-FE-CALL-001` - Callcenter P0 map booking
- **Helper Kind:** `review_packet`
- **Current Owner / Reviewer:** `Codex` / `Codex2`
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Last Revised:** `2026-07-01T16:02:00Z`
- **Scope Boundary:** support-only artifact; no canonical truth, runtime, contract, or governance edits.

## 1. Purpose

This sidecar exists only to package the current review state for `MAP-FE-CALL-001`.

- In scope: current machine-truth snapshot, dependency/evidence anchors, reviewer hotspots, and handoff wording.
- Out of scope: editing `apps/ops-console-web`, changing backend service-area behavior, changing L1/L2 truth, or claiming Gate A production readiness.

This refresh replaces the stale morning packet content. The same task ID had an earlier completed cycle on `2026-07-01`, but the orchestrator auto-created a new helper cycle at `2026-07-01T15:45:17Z` after a Gemini worker exit and reassigned ownership to `Codex` at `2026-07-01T15:45:27Z`. Review should be based on this new cycle, not on the older `04:xxZ` wording.

## 2. Current Machine-Truth Snapshot

### 2.1 Sidecar task

`AI_NAME=Codex2 scripts/ai-status.sh show MAP-FE-CALL-001-SIDECAR-REVIEW` currently records:

- owner=`Codex`
- reviewer=`Codex2`
- status=`review`
- helper_parent=`MAP-FE-CALL-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- last_update=`2026-07-01T15:50:15Z`

Activity-log context for the current cycle:

1. `2026-07-01T15:45:17Z`: task assigned to `Gemini`
2. `2026-07-01T15:45:26Z`: Gemini worker exited before terminal status
3. `2026-07-01T15:45:27Z`: ownership moved to `Codex`, reviewer moved to `Codex2`
4. `2026-07-01T15:46:01Z`: owner `start` recorded for this refresh
5. `2026-07-01T15:50:15Z`: owner handed the refreshed packet to reviewer `Codex2`

Review implication:

- this packet was prepared from the live owner state `in_progress@2026-07-01T15:46:01Z`
- live machine truth is now `review@2026-07-01T15:50:15Z` after owner handoff to `Codex2`
- the earlier morning sidecar cycle is historical context only and should not drive this review

### 2.2 Parent task

`AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CALL-001` currently records:

- owner / reviewer: `Codex` / `Claude2`
- status=`review`
- last_update=`2026-07-01T09:32:00Z`
- dependencies:
  - `MAP-UI-001`
  - `MAP-BE-004`
  - `MAP-BE-005`

Current parent note from machine truth:

- provider-unavailable anti-bypass proof was added for Callcenter phone booking
- `map_provider_unavailable` plus legacy text-only pickup/dropoff routes to spatial `manual_review`
- the flow writes an audit summary, enters `manual_review_queue`, and blocks auto dispatch
- machine truth names `support/sidecars/MAP-QA-002/artifacts/vitest-owned-mobility-callcenter-provider-unavailable-20260701T0932Z.json` as the supporting artifact and says it reported `73 passed`
- parent is still not production-ready until review acceptance, persisted DB/stage/API snapshot/audit evidence, OBS, final QA, and REL closeout are complete

Earlier parent review notes that still matter:

- `2026-07-01T03:37:38Z`: callcenter gating switched to shared `@drts/contracts` `hasAddressCoordinateProvenance`, with targeted unit coverage and `ops-console-web` test/typecheck verification
- `2026-07-01T04:17:57Z`: Gate A smoke hardening added responsive `AddressMapPairPicker` layout, accessible labels, and browser-test coverage around coordinate provenance submission

Review implication:

- the parent remains in active `review`, not `review_approved` or `done`
- this sidecar can summarize review evidence, but it cannot close the parent review or claim Gate A pass

### 2.3 Dependency anchors

`MAP-BE-004`

- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-004` currently records `status=done`
- machine-truth closeout anchor:
  - commit `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
  - subject: `MAP-BE-004: finalize service-area booking creation enforcement (#1013)`
  - push target: `origin/dev`

`MAP-BE-005`

- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005` currently records:
  - owner / reviewer: `Claude2` / `Codex2`
  - status=`in_progress`
  - last_update=`2026-07-01T08:50:14Z`
  - dependency on `MAP-BE-004`
- current note says branch-level spatial-audit proof was added for partner booking and names `support/sidecars/MAP-QA-002/artifacts/vitest-owned-mobility-spatial-audit-20260701T0849Z.json` as the supporting artifact (`71 passed`)

`MAP-UI-001`

- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001` currently records:
  - owner / reviewer: `Claude2` / `Codex2`
  - status=`in_progress`
  - last_update=`2026-07-01T08:42:02Z`
- current note says the reviewer lane was reassigned to `Codex2`

Practical meaning:

- the parent has one backend dependency already closed on `origin/dev`
- two upstream dependencies remain open in machine truth: `MAP-BE-005` and `MAP-UI-001`
- this sidecar should not pretend those open dependencies are already absorbed into a parent closeout

## 3. Evidence Surface

| ID | Evidence | Direct anchor | Why it matters |
| --- | --- | --- | --- |
| E-1 | Current sidecar state | `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CALL-001-SIDECAR-REVIEW` | Confirms the helper is a fresh `in_progress` cycle owned by `Codex`. |
| E-2 | Current parent state | `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CALL-001` | Confirms the parent remains in `review` with a `2026-07-01T09:32:00Z` update. |
| E-3 | Current-cycle activity log | `ai-activity-log.jsonl` lines around `2026-07-01T15:45Z` | Shows the auto-created sidecar cycle, Gemini worker failure, and reassignment to `Codex`. |
| E-4 | Prior Gate A caution packet | `origin/codex/map-fe-call-001-sidecar-gatea@54604cf6fd` -> `support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-GATE-A-EVIDENCE.md` | Preserves the strongest explicit statement of what is still missing before Gate A can pass. |
| E-5 | Service-area enforcement done | `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-004` | Confirms backend service-area enforcement is closed and merged to `origin/dev`. |
| E-6 | Snapshot/audit dependency still open | `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005` | Confirms persisted snapshot/audit work is still `in_progress`. |
| E-7 | Shared picker dependency still open | `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001` | Confirms the upstream shared UI slice is still `in_progress`. |
| E-8 | Artifact visibility limit | `find . -name 'vitest-owned-mobility-callcenter-provider-unavailable-20260701T0932Z.json' -o -name 'vitest-owned-mobility-spatial-audit-20260701T0849Z.json'` returned nothing in this branch snapshot | The packet can cite those artifact paths from machine truth, but it cannot claim their contents were directly inspected here. |

### 3.1 What the Gate A packet still contributes

The Gate A packet at `origin/codex/map-fe-call-001-sidecar-gatea@54604cf6fd` remains the clearest support artifact for what is still missing:

- full serviceable/manual-review/blocked/provider-degraded end-to-end proof
- persisted snapshot and backend-authority proof
- Ops-visibility and observability proof
- conservative release wording that avoids a premature Gate A claim

### 3.2 Visibility limits for this helper

This helper can inspect:

- live task slices through `scripts/ai-status.sh show ...`
- the pushed Gate A sidecar branch
- the current local support packet branch

This helper cannot safely claim:

- the parent implementation branch SHA
- that `Claude2` has already validated the parent diff
- that the two named `MAP-QA-002` JSON artifacts were opened from this branch snapshot
- that Gate A is already proven end to end

## 4. Reviewer Focus

`Codex2` should approve this sidecar only if the following remain true:

1. The helper changed support material only.
2. The packet is aligned to the current sidecar cycle at `2026-07-01T15:45Z`, not to the earlier morning cycle.
3. The parent is described as `review@2026-07-01T09:32:00Z`, not as `review_approved` or `done`.
4. `MAP-BE-004` is described as `done` on `origin/dev`, while `MAP-BE-005` and `MAP-UI-001` remain `in_progress`.
5. The provider-unavailable anti-bypass note is preserved as the current parent review headline.
6. The Gate A packet at `54604cf6fd` remains the cautionary anchor for missing end-to-end proof.
7. The two `MAP-QA-002` JSON paths are treated as machine-truth references only, not as directly inspected artifacts in this helper workspace.
8. Nothing in this packet pretends to replace the actual parent code review by `Claude2`.

Suggested approval conclusion:

> `審查通過：MAP-FE-CALL-001 sidecar review packet 已改寫為目前 2026-07-01T15:45Z helper cycle，明確記錄 parent MAP-FE-CALL-001 仍在 review@2026-07-01T09:32:00Z，保留 provider-unavailable anti-bypass 作為目前 review 焦點，並正確區分 MAP-BE-004 已 done 與 MAP-BE-005 / MAP-UI-001 仍 in_progress。packet 仍維持 support-only，且沒有把 MAP-QA-002 artifact path 過度描述成已在此 branch 直接檢視。`

Suggested reopen conclusion:

> `packet needs refresh: [sidecar cycle timestamp drift / parent review snapshot drift / dependency status drift / Gate A anchor changed / support-scope violation]`

## 5. Handoff Commands

Owner handoff to `Codex2`:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MAP-FE-CALL-001-SIDECAR-REVIEW Codex2 "Review packet refreshed at support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-SIDECAR-REVIEW.md for the current 2026-07-01T15:45Z sidecar cycle. The packet stays support-only, records MAP-FE-CALL-001 as still in review@2026-07-01T09:32:00Z, preserves the provider-unavailable anti-bypass note as the current review headline, distinguishes MAP-BE-004 done-on-dev from MAP-BE-005 and MAP-UI-001 still in_progress, keeps origin/codex/map-fe-call-001-sidecar-gatea@54604cf6fd as the Gate A caution anchor, and explicitly notes that the named MAP-QA-002 JSON artifacts are machine-truth references not directly inspected from this branch snapshot."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MAP-FE-CALL-001-SIDECAR-REVIEW "Review approved. The packet stays support-only, is aligned to the current 2026-07-01T15:45Z helper cycle, matches parent MAP-FE-CALL-001 review state at 2026-07-01T09:32:00Z, preserves the provider-unavailable anti-bypass note and Gate A caution anchor, and keeps dependency/artifact wording appropriately bounded."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen MAP-FE-CALL-001-SIDECAR-REVIEW "packet needs refresh: [sidecar cycle timestamp drift / parent review snapshot drift / dependency status drift / Gate A anchor changed / support-scope violation]"
```

## 6. Verification For This Refresh

Commands run for this packet refresh:

- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CALL-001-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-CALL-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-004`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-001`
- `git show origin/codex/map-fe-call-001-sidecar-gatea:support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-GATE-A-EVIDENCE.md`
- `find . -name 'vitest-owned-mobility-callcenter-provider-unavailable-20260701T0932Z.json' -o -name 'vitest-owned-mobility-spatial-audit-20260701T0849Z.json'`

Not performed from this helper workspace:

- parent implementation tests
- parent code review
- direct inspection of the two `MAP-QA-002` JSON artifacts named by machine truth

## 7. Change Note

- The stale morning packet language was removed.
- The incorrect `MAP-BE-004` "Task not found" statement was removed.
- The packet now matches the current sidecar cycle and the parent's `2026-07-01T09:32:00Z` review snapshot.
