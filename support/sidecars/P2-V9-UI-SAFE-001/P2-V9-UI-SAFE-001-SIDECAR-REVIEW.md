# P2-V9-UI-SAFE-001 Sidecar Review Packet

- Sidecar Task: `P2-V9-UI-SAFE-001-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Codex` / `Codex2`
- Parent Task: `P2-V9-UI-SAFE-001`
- Parent Owner / Reviewer: `Codex` / `Codex2`
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Date: `2026-06-29`

## Purpose

Provide the finalized reviewer packet for `P2-V9-UI-SAFE-001` after sidecar
review approval on `2026-06-29` UTC.

This packet does not alter the parent implementation. It records the approved
support-only evidence summary, the reviewer handoff/approval trail, and the
parent-branch anchor caveats needed for owner closeout.

## Scope Of This Sidecar

- Create and update support artifacts only under
  `support/sidecars/P2-V9-UI-SAFE-001/`.
- Do not edit `apps/driver-app/`, `packages/ui-tokens/`, `docs/05-ui/`, or any
  machine-truth file directly.
- Preserve the reviewer-approved parent evidence anchor at `db0b03042` even
  though the parent branch later advanced.
- Refresh stale reviewer / closeout metadata so the packet matches current
  machine truth for this sidecar closeout.

## Machine-Truth Snapshot

### Parent task — `P2-V9-UI-SAFE-001`

- Status: `review`
- Last update: `2026-06-29T03:30:32Z`
- Owner / reviewer: `Codex` / `Codex2`
- Current machine-truth `next` summary:
  `/safety-operator` is now allowed as an unprovisioned route through the
  shared driver identity routing helper so `DriverHeartbeatBootstrap` no longer
  redirects unbound safety operators to `/onboarding`. Regression coverage was
  added in driver-identity routing tests. Recorded verification:
  `pnpm --filter @drts/driver-app test -- tests/unit/driver-identity-routing.test.ts tests/unit/driver-identity-bootstrap.test.ts`
  (`19 files / 89 tests passed`),
  `pnpm --filter @drts/driver-app typecheck`,
  `cd apps/driver-app && npm run build --ignore-scripts`.
- Current parent review branch tip observed during sidecar closeout:
  `origin/codex/p2-v9-ui-safe-001 @ 13d481573`
  (`wip(P2-V9-UI-SAFE-001): anchor safety-operator route gate`).

### Sidecar task — `P2-V9-UI-SAFE-001-SIDECAR-REVIEW`

- Status: `review_approved`
- Last update: `2026-06-29T03:27:38Z`
- Owner / reviewer: `Codex` / `Codex2`
- Recorded `next` summary:
  Review passed on `2026-06-29` UTC. The reviewer-approved packet exists in
  the `Codex2` review worktree, stays support-only, keeps parent evidence
  anchored to `db0b03042`, and refreshes stale reviewer metadata after the
  `Gemini2 -> Codex2` and `Claude2 -> Codex2` reassignments. Recorded
  verification: `git diff --check`; no canonical files changed. Reviewer-lane
  anchor commit: `aad79432c`
  (`wip(P2-V9-UI-SAFE-001-SIDECAR-REVIEW): refresh reviewer packet`).
- This owner closeout branch mirrors that approved packet into
  `codex/p2-v9-ui-safe-001-sidecar-review` and adds only closeout-critical
  support metadata.

## Parent Branch Anchors

- Reviewer-approved parent evidence snapshot:
  `db0b0304292f91330f8d78f71c736f63a71bcbd5`
- Snapshot subject:
  `wip(P2-V9-UI-SAFE-001): anchor safety-operator realm scope`
- Snapshot trailers:
  `LLM-Agent: Codex`, `Task-ID: P2-V9-UI-SAFE-001`, `Reviewer: Claude2`
- Snapshot diff shape versus `origin/dev` at the time of review:
  5 files changed, focused on
  `apps/driver-app/app/safety-operator.tsx`,
  `apps/driver-app/lib/safety-operator-fixtures.ts`,
  `apps/driver-app/lib/safety-operator-takeover-draft.ts`,
  `apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts`,
  `apps/driver-app/tests/unit/safety-operator-takeover-draft.test.ts`.
- Later parent follow-up observed during closeout:
  `13d481573d5378c84d18b89add9b3a21d9f7f9f5`
  (`wip(P2-V9-UI-SAFE-001): anchor safety-operator route gate`).
- Why this packet still uses `db0b03042`:
  the sidecar task reached `review_approved` with that earlier parent snapshot
  as its explicit evidence anchor, so this closeout preserves the approved
  review target instead of silently retargeting the packet to the later route-
  gate follow-up.

Important review posture:

- This owner closeout worktree is the isolated support branch
  `codex/p2-v9-ui-safe-001-sidecar-review`.
- The reviewer-approved packet was prepared in the separate reviewer worktree
  `codex2/p2-v9-ui-safe-001-sidecar-review` at commit `aad79432c`.
- Parent evidence in this packet should therefore be read from
  `git show db0b03042:<path>` and the machine-truth task record, not from the
  current remote branch tip.

## Design Authority Note

The main review caveat is still visual authority availability:

- `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:6`
  states the canonical safety-operator canvas is authored upstream and not yet
  published to `dev`.
- `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:14-16`
  says the binding visual authority is
  `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx` at
  `origin/phase2-tesla-sandbox-docs-20260625@67113d786`, and the supplement
  must not be used to invent fallback UI.
- The current `dev` worktree still does not contain
  `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx`.

Implication:

- This packet can verify the parent's non-visual contract alignment, queue
  behavior, takeover-audit preservation, and token usage.
- Full visual parity still needs comparison against the upstream
  `driver-safety-operator.jsx` authority once that canvas is present in the
  reviewer lane.

## Evidence Summary

| Review point | Verdict | Evidence anchors | Why it matters |
| --- | --- | --- | --- |
| Separate Safety Operator realm and screen map are explicitly materialized | `met-with-note` | `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:4-6,51-67,71-76`; parent snapshot `db0b03042` in `apps/driver-app/app/safety-operator.tsx:52-86,909-947,950-1263` | Confirms the parent did not collapse the feature into the normal driver shell. The note is that visual parity still depends on the unpublished upstream canvas. |
| Offline queue is durable and exposes honest `queued/syncing/failed/synced` state | `met` | `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:78-86`; parent snapshot `db0b03042` in `apps/driver-app/lib/safety-operator-offline-queue.ts:1-185`, `apps/driver-app/app/safety-operator.tsx:386-510,518-580,1266-1271`, and `apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts:34-142` | Matches the acceptance requirement that offline queue and unsynced state stay visible, and that the queue is durable rather than memory-only. |
| Takeover draft preserves original system time, editable `occurredAt`, and local correction audit before first submit | `met` | `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:96-120`; parent snapshot `db0b03042` in `apps/driver-app/lib/safety-operator-takeover-draft.ts:3-92`, `apps/driver-app/app/safety-operator.tsx:594-603,734-780,1064-1124`, and `apps/driver-app/tests/unit/safety-operator-takeover-draft.test.ts:10-112` | This is the most specific parent acceptance point and the most likely regression surface if the draft/audit state is simplified later. |
| `clientGeneratedReportId` idempotency and duplicate replay merge are carried through queueing and receipt presentation | `met` | `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:88-95,105-113`; parent snapshot `db0b03042` in `apps/driver-app/lib/safety-operator-offline-queue.ts:89-179`, `apps/driver-app/app/safety-operator.tsx:606-643,749-767,1126-1159`, and `apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts:34-119` | Confirms duplicate replay does not create a second accepted report body and that the UI shows the receipt/duplicate state explicitly. |
| No Tesla / FSD control UI is exposed on the implemented safety-operator surface | `met` | `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:43-49`; parent snapshot `db0b03042` in `apps/driver-app/app/safety-operator.tsx:941-945,997-1000` | Directly maps to the parent acceptance rule `no FSD control UI`. |
| Token-based styling is used and no raw hex palette is introduced in the parent screen file | `met` | parent snapshot `db0b03042` in `apps/driver-app/app/safety-operator.tsx:11,63-66,1277-1315`; raw-hex scan over the same snapshot returned no matches | Satisfies the UI design contract guardrail that colors come from `@drts/ui-tokens`, not hardcoded hex values. |
| Closeout and handover are separated instead of being flattened into one ambiguous form | `met` | `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md:4,56-67`; parent snapshot `db0b03042` in `apps/driver-app/app/safety-operator.tsx:1204-1262` | Matches the named screen split in the supplement and keeps `SO_TripCloseout` distinct from `SO_ShiftHandover`. |
| Parent verification evidence exists in machine truth, but was not rerun in this sidecar worktree | `met-with-note` | `scripts/ai-status.sh show P2-V9-UI-SAFE-001` snapshot at `2026-06-29T03:30:32Z` plus the reviewer-approved sidecar `next` summary at `2026-06-29T03:27:38Z` | This packet relies on already-recorded parent review evidence and the approved sidecar summary, but it does not independently re-execute the parent tests/typecheck/build because the support worktree is not the parent branch snapshot. |

Result: 6 points `met`, 2 points `met-with-note`, 0 points `unmet`.

## Review Hotspots

The approved sidecar review focused on these spots:

1. Visual-authority gap:
   confirm the packet clearly distinguishes the non-visual supplement from the
   true safety-operator canvas at
   `origin/phase2-tesla-sandbox-docs-20260625@67113d786`.
2. Parent branch anchoring:
   confirm the packet keeps review evidence on snapshot `db0b03042` rather than
   silently following the later parent branch tip `13d481573`.
3. Takeover audit contract:
   confirm the local draft audit and duplicate-replay handling are both cited,
   since those are the highest-risk behavioral requirements.
4. Incident upload posture:
   `retryQueueEntry` intentionally keeps `incident_upload` in the local queue
   with an explicit not-wired message at
   parent snapshot `db0b03042` in
   `apps/driver-app/app/safety-operator.tsx:715-718`.
   That is acceptable only because the parent acceptance requires visibility of
   offline/unsynced state, not a completed incident-sync backend in this slice.

## Reusable Spot-Checks

1. `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-SAFE-001`
   should still report parent `status=review`, `reviewer=Codex2`, and the route-
   gate follow-up summary recorded on `2026-06-29T03:30:32Z`.
2. `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-SAFE-001-SIDECAR-REVIEW`
   should report sidecar `status=review_approved` with the reviewer-approved
   `aad79432c` summary recorded on `2026-06-29T03:27:38Z`.
3. `git show --stat db0b03042`
   should still show the five-file parent snapshot cited above.
4. `git show db0b03042:apps/driver-app/app/safety-operator.tsx`
   should still contain the nine-view safety realm shell plus the no-FSD copy,
   takeover audit UI, and queue ledger sections cited in this packet.
5. `git show db0b03042:apps/driver-app/lib/safety-operator-offline-queue.ts`
   should still persist the queue through `expo-secure-store`.
6. `git show db0b03042:apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts`
   and `git show db0b03042:apps/driver-app/tests/unit/safety-operator-takeover-draft.test.ts`
   should still cover duplicate replay and audit preservation.
7. This sidecar change set should stay limited to
   `support/sidecars/P2-V9-UI-SAFE-001/P2-V9-UI-SAFE-001-SIDECAR-REVIEW.md`.

## Out-Of-Scope Items

- Approving or reopening parent `P2-V9-UI-SAFE-001`. That remains a separate
  parent lifecycle decision even though the current parent reviewer is also
  `Codex2`.
- Repointing the packet's approved evidence anchor from `db0b03042` to the
  later parent follow-up `13d481573`.
- Publishing `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx` into
  `dev`.
- Adding backend support for incident evidence replay beyond the visible local
  queue posture already implemented in the parent slice.
- Any change to `apps/driver-app/`, `packages/ui-tokens/`, contracts, runtime,
  or machine-truth control-plane files.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Hand off the packet to the assigned reviewer.
- [x] Preserve the reviewer-approved evidence anchor during owner closeout.

## Local Verification For This Sidecar

This sidecar is support-only. Local verification is intentionally limited to
the support artifact and closeout metadata:

- `git diff --check -- support/sidecars/P2-V9-UI-SAFE-001/P2-V9-UI-SAFE-001-SIDECAR-REVIEW.md`
- `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-SAFE-001-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show P2-V9-UI-SAFE-001`

Parent verification remains the already-recorded review evidence in machine
truth:

- `pnpm --filter @drts/driver-app test -- safety-operator-offline-queue safety-operator-takeover-draft`
- `pnpm --filter @drts/driver-app test -- tests/unit/driver-identity-routing.test.ts tests/unit/driver-identity-bootstrap.test.ts`
- `pnpm --filter @drts/driver-app typecheck`
- `cd apps/driver-app && npm run build --ignore-scripts`

## Recorded Handoff / Approval Wording

Recorded reviewer handoff command:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-V9-UI-SAFE-001-SIDECAR-REVIEW Codex2 "P2-V9-UI-SAFE-001 sidecar review packet is ready at support/sidecars/P2-V9-UI-SAFE-001/P2-V9-UI-SAFE-001-SIDECAR-REVIEW.md. It freezes the reviewer-approved evidence snapshot at db0b03042, summarizes the durable queue / takeover-audit / no-FSD-control evidence, and flags that the binding driver-safety-operator canvas still lives upstream at origin/phase2-tesla-sandbox-docs-20260625@67113d786 rather than in the current dev worktree."
```

Recorded reviewer approve / reopen commands:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-V9-UI-SAFE-001-SIDECAR-REVIEW "<review conclusion>"
AI_NAME=Codex2 scripts/ai-status.sh reopen P2-V9-UI-SAFE-001-SIDECAR-REVIEW "<what is stale, incorrect, or over-claimed>"
```

Owner finalize command template after `review_approved`:

```bash
AI_NAME=Codex COMMIT_HASH=<sha> COMMIT_SUBJECT="<subject>" PUSH_REMOTE=origin PUSH_BRANCH=codex/p2-v9-ui-safe-001-sidecar-review INTEGRATION_STATUS=not_applicable scripts/ai-status.sh done P2-V9-UI-SAFE-001-SIDECAR-REVIEW "Completed support-only review packet for P2-V9-UI-SAFE-001. INTEGRATION_STATUS=not_applicable. The packet records the reviewer-approved parent evidence anchor, the upstream safety-operator canvas caveat, and the reviewer hotspots without mutating canonical truth."
```
