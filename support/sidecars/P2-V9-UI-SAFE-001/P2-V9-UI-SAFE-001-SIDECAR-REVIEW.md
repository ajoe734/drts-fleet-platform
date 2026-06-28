# P2-V9-UI-SAFE-001 Sidecar Review Packet

- Sidecar Task: `P2-V9-UI-SAFE-001-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Codex` / `Gemini2`
- Parent Task: `P2-V9-UI-SAFE-001`
- Parent Owner / Reviewer: `Codex` / `Claude2`
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-06-28

## Purpose

Provide a reviewer-facing packet for `P2-V9-UI-SAFE-001` that freezes the
current machine-truth state, the parent branch evidence anchors, the review
hotspots, and the handoff wording in one place.

This packet does not approve the parent task. Parent `P2-V9-UI-SAFE-001`
remains `review` in machine truth while reviewer `Claude2` owns the canonical
implementation decision.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/P2-V9-UI-SAFE-001/`.
- Do not edit `apps/driver-app/`, `packages/ui-tokens/`, `docs/05-ui/`, or any
  machine-truth file directly.
- Summarize the parent implementation from its pushed review branch and the
  recorded machine-truth verification text.
- Hand this packet to the assigned sidecar reviewer (`Gemini2`) through
  `scripts/ai-status.sh handoff`.

## Machine-Truth Snapshot

### Parent task — `P2-V9-UI-SAFE-001`

- Status: `review`
- Last update: `2026-06-28T07:52:38Z`
- Owner / reviewer: `Codex` / `Claude2`
- Recorded `next` summary:
  separate Safety Operator realm scope implemented with `SOFrame`,
  `SOModeBar`, `SOSyncStrip`, expanded shift start / vehicle assign / takeover /
  closeout / handover views, visible offline queue ledger, retry surface, and
  local takeover `occurredAt` audit preservation.
- Recorded verification in machine truth:
  `pnpm --filter @drts/driver-app test -- safety-operator-offline-queue safety-operator-takeover-draft`
  (`19 files / 87 tests passed`),
  `pnpm --filter @drts/driver-app typecheck`,
  `pnpm --filter @drts/driver-app build`.
- Recorded branch push in machine truth:
  `origin/codex/p2-v9-ui-safe-001 @ db0b03042`.

### Sidecar task — `P2-V9-UI-SAFE-001-SIDECAR-REVIEW`

- Status when this packet was drafted: `in_progress`
- Last update: `2026-06-28T17:31:30Z`
- Owner / reviewer: `Codex` / `Gemini2`
- Activity trail of note:
  sidecar auto-created for `Gemini2` at `2026-06-28T17:04:24Z`,
  two `Gemini2` worker attempts failed before terminal state,
  then the orchestrator rebalanced the task to `Codex` at
  `2026-06-28T17:31:06Z` while flipping the reviewer to `Gemini2`.

## Parent Branch Anchors

- Parent review branch: `origin/codex/p2-v9-ui-safe-001`
- Parent review commit:
  `db0b0304292f91330f8d78f71c736f63a71bcbd5`
- Commit subject:
  `wip(P2-V9-UI-SAFE-001): anchor safety-operator realm scope`
- Commit trailers:
  `LLM-Agent: Codex`, `Task-ID: P2-V9-UI-SAFE-001`, `Reviewer: Claude2`
- Diff shape versus `origin/dev`:
  5 files changed, focused on
  `apps/driver-app/app/safety-operator.tsx`,
  `apps/driver-app/lib/safety-operator-fixtures.ts`,
  `apps/driver-app/lib/safety-operator-takeover-draft.ts`,
  `apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts`,
  `apps/driver-app/tests/unit/safety-operator-takeover-draft.test.ts`.

Important review posture:

- This sidecar worktree is the isolated support branch
  `codex/p2-v9-ui-safe-001-sidecar-review`, not the parent implementation
  branch.
- The parent review evidence in this packet is therefore anchored to
  `git show origin/codex/p2-v9-ui-safe-001:<path>` and the machine-truth task
  record, not to the current sidecar working tree contents.

## Design Authority Note

The most important review caveat is visual authority availability:

- `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:6`
  states the canonical safety-operator canvas is authored upstream and not yet
  published to `dev`.
- `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:14-16`
  says the binding visual authority is
  `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx` at
  `origin/phase2-tesla-sandbox-docs-20260625@67113d786`, and the supplement
  must not be used to invent fallback UI.
- Local check at packet draft time:
  `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx` is absent from the
  current `dev` worktree.

Implication:

- This packet can independently verify the parent's non-visual contract
  alignment and token usage.
- Full visual parity still needs reviewer comparison against the upstream
  `driver-safety-operator.jsx` authority once available in the reviewer lane.

## Evidence Summary

| Review point | Verdict | Evidence anchors | Why it matters |
| --- | --- | --- | --- |
| Separate Safety Operator realm and screen map are explicitly materialized | `met-with-note` | `driver-app-safety-operator-screen-requirements-20260626.md:4-6,51-67,71-76`; parent `apps/driver-app/app/safety-operator.tsx:52-86,856-879,909-1271` on branch `origin/codex/p2-v9-ui-safe-001` | Confirms the parent did not collapse the feature into the normal driver shell. The note is that visual parity still depends on the unpublished upstream canvas. |
| Offline queue is durable and exposes honest `queued/syncing/failed/synced` state | `met` | `driver-app-safety-operator-screen-requirements-20260626.md:78-86`; parent `apps/driver-app/lib/safety-operator-offline-queue.ts:1-185`; parent `apps/driver-app/app/safety-operator.tsx:386-449,518-580,856-879,1266-1271`; parent `apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts:121-142` | Matches the acceptance requirement that offline queue and unsynced state stay visible, and that the queue is durable rather than memory-only. |
| Takeover draft preserves original system time, editable `occurredAt`, and local correction audit before first submit | `met` | `driver-app-safety-operator-screen-requirements-20260626.md:96-120`; parent `apps/driver-app/lib/safety-operator-takeover-draft.ts:3-92`; parent `apps/driver-app/app/safety-operator.tsx:522-539,594-603,734-780,1064-1124`; parent `apps/driver-app/tests/unit/safety-operator-takeover-draft.test.ts:10-112` | This is the most specific parent acceptance point and the most likely regression surface if the draft/audit state is simplified later. |
| `clientGeneratedReportId` idempotency and duplicate replay merge are carried through queueing and receipt presentation | `met` | `driver-app-safety-operator-screen-requirements-20260626.md:88-95,105-113`; parent `apps/driver-app/lib/safety-operator-offline-queue.ts:89-179`; parent `apps/driver-app/app/safety-operator.tsx:606-643,749-767,1126-1159`; parent `apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts:34-119` | Confirms duplicate replay does not create a second accepted report body and that the UI shows the receipt/duplicate state explicitly. |
| No Tesla / FSD control UI is exposed on the implemented safety-operator surface | `met` | `driver-app-safety-operator-screen-requirements-20260626.md:43-49`; parent `apps/driver-app/app/safety-operator.tsx:941-945,997-1000` | Directly maps to the parent acceptance rule `no FSD control UI`. |
| Token-based styling is used and no raw hex palette is introduced in the parent screen file | `met` | parent `apps/driver-app/app/safety-operator.tsx:11,63-66,1277-1285`; raw-hex scan over parent `safety-operator.tsx` returned no matches | Satisfies the UI design contract guardrail that colors come from `@drts/ui-tokens`, not hardcoded hex values. |
| Closeout and handover are separated instead of being flattened into one ambiguous form | `met` | `driver-app-safety-operator-screen-requirements-20260626.md:4,56-67`; parent `apps/driver-app/app/safety-operator.tsx:1204-1262` | Matches the named screen split in the supplement and keeps `SO_TripCloseout` distinct from `SO_ShiftHandover`. |
| Parent verification evidence exists in machine truth, but was not rerun in this sidecar worktree | `met-with-note` | `ai-status` slice for `P2-V9-UI-SAFE-001` recorded at `2026-06-28T07:52:38Z` | This packet can rely on the already-recorded review evidence, but it does not independently re-execute the parent tests/typecheck/build because the support worktree is not the parent branch snapshot. |

Result: 6 points `met`, 2 points `met-with-note`, 0 points `unmet`.

## Reviewer Hotspots

The sidecar reviewer (`Gemini2`) should focus on these spots first:

1. Visual-authority gap:
   confirm the packet clearly distinguishes the non-visual supplement from the
   true safety-operator canvas at
   `origin/phase2-tesla-sandbox-docs-20260625@67113d786`.
2. Parent branch anchoring:
   confirm the packet points review to `origin/codex/p2-v9-ui-safe-001` /
   `db0b03042`, not to the sidecar worktree that tracks `origin/dev`.
3. Takeover audit contract:
   confirm the local draft audit and duplicate-replay handling are both cited,
   since those are the highest-risk behavioral requirements.
4. Incident upload posture:
   `retryQueueEntry` intentionally keeps `incident_upload` in the local queue
   with an explicit not-wired message at
   parent `apps/driver-app/app/safety-operator.tsx:715-718`.
   That is acceptable only because the parent acceptance requires visibility of
   offline/unsynced state, not a completed incident-sync backend in this slice.

## Suggested Reviewer Spot-Checks

1. `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-SAFE-001`
   still reports parent `status=review`, `reviewer=Claude2`, and the recorded
   verification / branch-push summary.
2. `git show --stat db0b03042`
   still shows the five-file parent diff cited above.
3. `git show origin/codex/p2-v9-ui-safe-001:apps/driver-app/app/safety-operator.tsx`
   still contains the nine-view safety realm shell plus the no-FSD copy,
   takeover audit UI, and queue ledger sections cited in this packet.
4. `git show origin/codex/p2-v9-ui-safe-001:apps/driver-app/lib/safety-operator-offline-queue.ts`
   still persists the queue through `expo-secure-store`.
5. `git show origin/codex/p2-v9-ui-safe-001:apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts`
   and `.../safety-operator-takeover-draft.test.ts`
   still cover duplicate replay and audit preservation.
6. This sidecar change set is limited to
   `support/sidecars/P2-V9-UI-SAFE-001/P2-V9-UI-SAFE-001-SIDECAR-REVIEW.md`.

## Out-Of-Scope Items

- Approving or reopening parent `P2-V9-UI-SAFE-001`. That remains the canonical
  reviewer's job (`Claude2`).
- Publishing `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx` into
  `dev`.
- Adding backend support for incident evidence replay beyond the visible local
  queue posture already implemented here.
- Any change to `apps/driver-app/`, `packages/ui-tokens/`, contracts, runtime,
  or machine-truth control-plane files.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Hand off the packet to the assigned sidecar reviewer (`Gemini2`).

## Local Verification For This Sidecar

This sidecar is support-only. Local verification is intentionally limited to the
support artifact itself:

- `git diff --check -- support/sidecars/P2-V9-UI-SAFE-001/P2-V9-UI-SAFE-001-SIDECAR-REVIEW.md`

Parent verification remains the already-recorded review evidence in machine
truth:

- `pnpm --filter @drts/driver-app test -- safety-operator-offline-queue safety-operator-takeover-draft`
- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app build`

## Reviewer Handoff Wording

Owner handoff command:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-V9-UI-SAFE-001-SIDECAR-REVIEW Gemini2 "P2-V9-UI-SAFE-001 sidecar review packet is ready at support/sidecars/P2-V9-UI-SAFE-001/P2-V9-UI-SAFE-001-SIDECAR-REVIEW.md. It freezes the parent review state, points review to branch origin/codex/p2-v9-ui-safe-001 at db0b03042, summarizes the durable queue / takeover-audit / no-FSD-control evidence, and flags that the binding driver-safety-operator canvas still lives upstream at origin/phase2-tesla-sandbox-docs-20260625@67113d786 rather than in the current dev worktree."
```

Reviewer approve / reopen commands:

```bash
AI_NAME=Gemini2 scripts/ai-status.sh approve P2-V9-UI-SAFE-001-SIDECAR-REVIEW "<review conclusion>"
AI_NAME=Gemini2 scripts/ai-status.sh reopen P2-V9-UI-SAFE-001-SIDECAR-REVIEW "<what is stale, incorrect, or over-claimed>"
```

Owner finalize command after `review_approved`:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 scripts/ai-status.sh done P2-V9-UI-SAFE-001-SIDECAR-REVIEW "Completed support-only review packet for P2-V9-UI-SAFE-001. INTEGRATION_STATUS=not_applicable. The packet records the parent review branch evidence, the upstream safety-operator canvas caveat, and the reviewer hotspots without mutating canonical truth."
```
