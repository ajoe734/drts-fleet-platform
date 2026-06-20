# MOB-APP-002 Sidecar Review Packet

This document is the parallel review-support packet for `MOB-APP-002`
("Driver App: durable SQLite offline queue"). It does not change canonical
truth, does not touch the parent runtime branch, and only packages reviewer
evidence for the assigned sidecar reviewer (`Claude2`).

Anchors used here:

- `AI_NAME=Codex scripts/ai-status.sh show MOB-APP-002`
- targeted `ai-activity-log.jsonl` entries for `MOB-APP-002`
- `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`
- `docs/02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md`
- `origin/codex/mob-app-002` commits `c86fdf398` and `577d19c99`
- `git diff --name-only origin/dev...origin/codex/mob-app-002`

## §1 Scope & Boundary

- **Task ID:** `MOB-APP-002-SIDECAR-REVIEW`
- **Parent Task:** `MOB-APP-002`
- **Helper Kind:** `review_packet`
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Mutates Canonical:** `false`
- **Artifact:** `support/sidecars/MOB-APP-002/MOB-APP-002-SIDECAR-REVIEW.md`

Guardrails for this packet:

- Only this sidecar artifact is edited.
- Machine-truth updates must go through `scripts/ai-status.sh` or
  `python3 scripts/ai_status.py`.
- The packet describes the parent branch and review evidence as they exist; it
  does not invent new product/runtime policy.

## §2 Machine-Truth Anchors

### A. Parent task: `MOB-APP-002`

| Field         | Value |
| --- | --- |
| Title | `Driver App: durable SQLite offline queue` |
| Owner | `Claude2` |
| Reviewer | `Claude` |
| Status | `review_approved` |
| Depends on | `P1D-WP0`, `MOB-BE-002` |
| Artifact | `apps/driver-app/` |
| `last_update` | `2026-06-20T11:18:54Z` |
| Current `next` | `Chairman reassigned owner from Codex to Claude2: review_approved closeout/integration stuck on auth-paused Codex; reviewer Claude, so owner to Claude2 keeps separation and unblocks finalization.` |

Important lifecycle notes from `ai-activity-log.jsonl`:

1. `2026-06-20T08:28:23Z` `Codex` handed the parent task to `Claude2` with:
   - durable SQLite queue implemented in driver app
   - ordered replay, retry/backoff, 24-hour retention, `>5000` compression
   - validation recorded as:
     - `node .../typescript/bin/tsc --noEmit -p apps/driver-app/tsconfig.json`
     - `node .../vitest/vitest.mjs run apps/driver-app/tests/unit/driver-location-heartbeat.test.ts apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts apps/driver-app/tests/unit/driver-location-offline-queue.test.ts`
     - result: `10 tests passed`
   - pushed branch/evidence: `origin/codex/mob-app-002` at `577d19c99`
2. `2026-06-20T10:35:31Z` `Claude` approved the parent task with stronger
   review evidence:
   - `typecheck PASS`
   - `lint 0-warn PASS`
   - `vitest 52/52 PASS`
   - `pnpm install --frozen-lockfile PASS`
   - non-blocking notes:
     - HTTP `429` is currently treated as permanent rather than retryable
     - real `expo-sqlite` SQL is not exercised directly under Vitest; runtime
       confidence rests on the contract double plus straightforward SQL
3. `2026-06-20T11:03:42Z` the original Codex closeout worker failed with
   `401 Unauthorized`, so `2026-06-20T11:18:55Z` ownership moved to `Claude2`
   for formal closeout/integration.

### B. This sidecar task: `MOB-APP-002-SIDECAR-REVIEW`

| Field | Value |
| --- | --- |
| Owner | `Codex` |
| Reviewer | `Claude2` |
| Status at authoring | `in_progress` |
| Task class | `sidecar` |
| Helper kind | `review_packet` |
| Mutates canonical | `false` |

## §3 Parent Branch Surface

The parent implementation branch is `origin/codex/mob-app-002`.

Important nuance:

- `git show --stat 577d19c99` only shows the final commit delta (`3` files).
- The actual task surface is the branch diff against the merge base:
  `git diff origin/dev...origin/codex/mob-app-002`.
- That triple-dot diff resolves to `12` paths, which is the correct review
  surface for this slice.

Branch commits:

| Commit | Role |
| --- | --- |
| `c86fdf398` | anchor commit for the first integrated offline-queue slice |
| `577d19c99` | final task commit currently at branch tip |

Triple-dot branch surface:

| Area | Paths | Purpose |
| --- | --- | --- |
| Core queue runtime | `apps/driver-app/lib/driver-location-offline-queue.ts` | SQLite-backed durable queue, replay, pruning, compression, retry state |
| Heartbeat integration | `apps/driver-app/lib/driver-location-heartbeat.ts`, `apps/driver-app/app/trip.tsx`, `apps/driver-app/lib/driver-identity-bootstrap.ts` | wires the queue into trip lifecycle, background/foreground transport, and identity/bootstrap recovery |
| Auth/session recovery | `apps/driver-app/lib/api-client.ts`, `packages/api-client/src/index.ts` | lets heartbeat flushes clear invalid device sessions cleanly |
| Driver-app typing/tooling | `apps/driver-app/expo-sqlite.d.ts`, `apps/driver-app/package.json` | adds `expo-sqlite` type surface and dependency wiring |
| Test evidence | `apps/driver-app/tests/unit/driver-location-offline-queue.test.ts`, `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts`, `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts` | covers replay, retry, compression, transport ownership, bootstrap recovery |
| Lockfile churn | `pnpm-lock.yaml` | reviewer explicitly recorded this as cosmetic `pnpm 10.33.0` quote normalization, not a dependency-resolution change |

Negative scope checks:

- No L1/L2 canonical truth file is changed by the parent branch.
- No backend contract/governance doc is changed by this sidecar packet.
- This support slice does not add or alter runtime implementation itself.

## §4 Requirement To Implementation Map

| Requirement | Spec anchor | Implementation evidence on `origin/codex/mob-app-002` |
| --- | --- | --- |
| Use device-side SQLite table `pending_location_events` | SD `§5.3 Mobile Offline Queue`; SA `§6.4 Durable Offline Queue` | `driver-location-offline-queue.ts` creates `pending_location_events` plus `queue_metadata`, runs SQLite in WAL mode, and persists full payload JSON |
| Statuses `pending` / `sending` / `acked` / `failed_retryable` / `failed_permanent` | SD `§5.3` | queue module defines exactly those statuses and persists them in table rows |
| Flush online every `10` seconds in batches of `50` | SD `§5.3` | `FLUSH_INTERVAL_MS = 10_000`, `FLUSH_BATCH_SIZE = 50`, interval-driven flush loop and `getReadyBatch(... LIMIT ?)` |
| Exponential backoff on retryable failure | SD `§5.3` | `buildBackoffMs()` caps retry delay at `5` minutes and `markRetryableFailures()` stores `next_attempt_at` |
| Retain at most `24` hours | SD `§5.3` | init and each flush call `pruneExpired(now - 24h)` |
| Preserve state-change events, per-minute samples, incident rows, and key arrival/start/complete events when queue exceeds `5000` | SD `§5.3`; SA `§6.4` | `compressQueueIfNeeded()` keeps `isKeyEvent`, `isIncident`, first row per minute bucket, and every work-state transition |
| Do not delete until server ack | SA `§6.4` | `applyFlushResponse()` deletes only acked IDs after `markAcked()`; failures stay queued |
| Replay in `sequenceNo` order after restart | SA `§6.4` | `reserveSequenceNo()` uses `BEGIN IMMEDIATE` + `queue_metadata`; `getReadyBatch()` orders by `sequence_no ASC`; init runs `resetSendingToPending()` |
| Use `eventId` and device-sequence identity for dedupe | SA `§6.4`; SD `§5.4` | enqueued payloads use `eventId = ${deviceId}:${sequenceNo}` and preserve sequence ordering through replay |
| Keep heartbeat/runtime integration aligned with trip lifecycle | parent acceptance text plus SD/SA queue rules | `driver-location-heartbeat.ts` routes background and foreground updates through `enqueueDriverLocationEvent()`, emits `preserveKeyEvent` snapshots on work-state transitions, and flushes on stop/restart/bootstrap |

## §5 Evidence Summary

### A. Parent owner handoff evidence

The `2026-06-20T08:28:23Z` handoff message claims:

- durable SQLite offline queue is implemented
- replay is ordered
- retry/backoff, 24-hour retention, and `>5000` compression landed
- heartbeat tracking widened across trip lifecycle states
- branch was pushed to `origin/codex/mob-app-002` at `577d19c99`

Repo inspection supports those claims:

- `driver-location-offline-queue.ts` contains the queue constants, replay,
  pruning, compression, and SQLite store implementation.
- `driver-location-heartbeat.ts` imports the queue module, initializes it, and
  sends `preserveKeyEvent` state snapshots instead of relying on an in-memory
  promise queue only.
- `driver-identity-bootstrap.ts` now calls `syncDriverLocationHeartbeat(...)`
  against the active task and forces `null` on unprovisioned/routed flows so
  background tracking is not left stale.

### B. Reviewer approval evidence

The `2026-06-20T10:35:31Z` `review_approved` note is stronger than the owner
handoff and should be treated as the current best evidence baseline:

- Acceptance explicitly called out:
  - durable SQLite `pending_location_events`
  - WAL mode
  - atomic sequence reservation via `BEGIN IMMEDIATE + queue_metadata`
  - `resetSendingToPending()` restart safety
  - `ORDER BY sequence_no ASC` in replay
  - `10s` / `50` flush cadence
  - exponential backoff capped at `5` minutes
  - `24h` prune
  - `>5000` compression retaining key events, incidents, state changes, and
    per-minute samples
  - deletion only after ack
- Integration explicitly called out:
  - durable enqueue + flush in heartbeat flow
  - lifecycle snapshots queued with `preserveKeyEvent`
  - `arrive` / `start` / `complete` not lost

### C. Test coverage anchors

Targeted unit cases on the parent branch:

- `driver-location-offline-queue.test.ts`
  - `replays persisted rows in sequence order after a restart reset`
  - `applies exponential backoff to retryable failures before replaying`
  - `compresses oversized queues while preserving key state changes and minute samples`
- `driver-location-heartbeat.test.ts`
  - `keeps foreground updates for trip metrics while background transport owns heartbeats`
  - `uses a throttled foreground fallback when background permission is unavailable`
- `driver-identity-bootstrap.test.ts`
  - `routes suspended drivers back to onboarding after foreground refresh fails`
  - `syncs the active trip heartbeat when the driver session remains valid`

## §6 Reviewer Focus For `Claude2`

Use this packet to accelerate closeout, not to reopen the parent design.

1. Treat the parent review as already passed. The remaining work is evidence
   hygiene and closeout correctness, not functional redesign.
2. Review the parent branch surface with triple-dot diff, not only
   `git show --stat 577d19c99`, because the branch contains two commits.
3. Re-check branch divergence before formal `done`.
   - As inspected from this sidecar worktree on `2026-06-20`, `git rev-list --left-right --count origin/dev...origin/codex/mob-app-002` returned `12 2`.
   - That means the branch is currently `12` commits behind `origin/dev` and
     `2` commits ahead.
   - If you are finalizing the parent task, refresh/rebase evidence before the
     final machine-truth `done`.
4. Keep the reviewer-approved non-blocking notes visible:
   - HTTP `429` is still classified as permanent rather than retryable.
   - Real SQLite SQL is not executed directly under Vitest.
5. Do not treat `pnpm-lock.yaml` churn as a semantic dependency change unless a
   fresh install on the parent branch proves otherwise; the stored review note
   explicitly called it cosmetic.

## §7 Suggested Sidecar Handoff Payload

When this support packet is ready to hand off:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MOB-APP-002-SIDECAR-REVIEW Claude2 "Prepared support/sidecars/MOB-APP-002/MOB-APP-002-SIDECAR-REVIEW.md as a reviewer-facing packet for parent task MOB-APP-002. It captures the parent review_approved machine-truth state, the real branch surface on origin/codex/mob-app-002, spec-to-implementation evidence for the durable SQLite queue, the recorded validation commands/results, current branch divergence against origin/dev, and Claude's two non-blocking review notes. Support artifact only; no canonical truth or runtime files changed."
```

## §8 Sidecar Verification

Checks performed while preparing this packet:

- `AI_NAME=Codex scripts/ai-status.sh show MOB-APP-002`
- targeted `git show`, `git log`, `git diff ...` inspection against
  `origin/codex/mob-app-002`
- targeted `ai-activity-log.jsonl` review for the parent handoff, approval, and
  owner reassignment events
- confirmed this sidecar slice only creates/updates support material under
  `support/sidecars/MOB-APP-002/`
