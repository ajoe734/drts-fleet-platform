# MTX-QUEUE-001 Sidecar Acceptance Packet

- Task: `MTX-QUEUE-001-SIDECAR-ACCEPTANCE`
- Parent Task: `MTX-QUEUE-001`
- Helper Kind: `acceptance_packet`
- Owner: `Codex`
- Reviewer: `Gemini`
- Parent Owner / Reviewer: `Gemini` / `Codex`
- Machine-Truth Status on Entry: `todo`
- Parent Task Status Snapshot: `review_approved`
- Scope Guardrail: support artifact only; no canonical truth, runtime code, registry contract truth, or governance files changed

## Acceptance Mapping

| Brief Acceptance | Packet Coverage |
| --- | --- |
| Create support artifacts only | This packet is the only task-owned artifact created by the sidecar task. |
| Do not edit canonical truth | The packet references existing execution docs, task-board state, and parent evidence only; it does not alter L1/L2 truth or runtime implementation. |
| Hand off the packet to the assigned reviewer | The closeout path for this sidecar is reviewer handoff to `Gemini` after packet creation, commit, and push. |

## Dependency Map

### Upstream

- `MTX-CORE-001`
  Fleet A runtime authority is the required upstream base. Its machine-truth status is `done`, recorded with `origin/dev` commit `725317b16c14b1e9b8d9448687a4aa9daf92d246` (`MTX-CORE-001: enforce Fleet A canonical runtime authority (#1125)`).
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
  Defines Fleet C scope: persisted queue mode, explicit profile queue policy, Ops queue labels/denial copy, and negative E2E for `physical_rank` and `taxi_stand`.

### Parent Scope Anchors

- `MTX-QUEUE-001` machine-truth slice
  Confirms acceptance targets, dependency on `MTX-CORE-001`, reviewer-approved state, and pushed closeout commit `196292b1b0b67d5154ee8b0e57b35b4e0376263a`.
- Parent evidence recorded in commit `196292b1b0b67d5154ee8b0e57b35b4e0376263a`
  Contains `support/sidecars/MTX-QUEUE-001/CURRENT-HEAD-PREFLIGHT.md` and `support/sidecars/MTX-QUEUE-001/MTX-QUEUE-001-ACCEPTANCE.md` with the queue-policy implementation/evidence summary.

### Downstream Consumers

- `MTX-QUEUE-002`
  Should reuse the Fleet C queue vocabulary and the explicit profile queue-policy map instead of redefining queue semantics.
- `MTX-QUEUE-003`
  UI labels and inline denial copy must stay aligned with the runtime-side queue policy captured by `MTX-QUEUE-001`.
- `MTX-QUEUE-QA-001`
  Negative E2E and verification should treat this packet as the runtime acceptance checklist baseline, not as new canonical truth.

## Parent Acceptance Checklist

### Runtime Queue Policy

- `multi_taxi_direct` must continue to allow `virtual_matching`.
- `multi_taxi_direct` must continue to deny `physical_rank`.
- `multi_taxi_direct` must continue to deny `taxi_stand`.
- `ordinary_taxi` queue policy must remain independently configurable without loosening the `multi_taxi_direct` restriction.

### Contract and Service Boundaries

- Queue policy map definitions live in contracts, not ad hoc runtime-only constants.
- Runtime enforcement remains in the existing owned-mobility queue check-in path.
- Queue-policy validation stays scoped to check-in so existing checked-in vehicles can check out after a later policy change.

### Sidecar Review Focus

- Verify the dependency on `MTX-CORE-001` is explicit and not reimplemented here.
- Verify the parent packet evidence is sufficient for the four Fleet C acceptance items.
- Verify downstream tasks inherit queue semantics from parent evidence rather than introducing drift.

## Evidence Summary

- `MTX-CORE-001` preflight and acceptance packet show the upstream runtime-authority baseline already enforced server-authored multi-taxi runtime context and virtual-matching-only queue use.
- `MTX-QUEUE-001` preflight classified all four acceptance items as `verified` or `implemented`+`verified` before closeout.
- Parent acceptance evidence records:
  `ProfileQueuePolicyMap` and `DEFAULT_PROFILE_QUEUE_POLICY_MAP` in `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`;
  `setProfileQueuePolicy`, `getProfileQueuePolicy`, and queue-policy enforcement behavior in `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`;
  verification via `pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility.service.test.ts`.
- Parent machine-truth notes say `MTX-QUEUE-001` already has a pushed task-scoped closeout commit on `origin/gemini/mtx-queue-001` and is awaiting auto-integrate merge to `origin/dev`.

## Reviewer Handoff Notes

- This sidecar packet does not add new product requirements.
- If reviewer finds drift between this packet and parent evidence, parent evidence wins because this file is support-only.
- If parent owner later changes Fleet C queue semantics, regenerate this packet instead of treating it as canonical truth.
