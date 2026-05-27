# UI-BE-008 Sidecar Review Packet

- Sidecar Task: `UI-BE-008-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Codex` / `Claude`
- Parent Task: `UI-BE-008` - DriverOpsInstruction module (ops issues, driver receives)
- Parent Owner / Reviewer: `Gemini` / `Codex2`
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-05-27

## Purpose

Provide a reviewer-ready packet for `UI-BE-008` without changing canonical
truth or parent runtime code. This sidecar exists to hand `Claude` one place
to inspect:

1. the parent task's current machine-truth position;
2. the dependency and contract anchors that define the slice;
3. the evidence that already exists before implementation starts; and
4. the exact review focus the parent owner/reviewer should preserve once the
   implementation lands.

Because parent `UI-BE-008` is still `backlog` in machine truth, this packet is
pre-implementation support material, not a completion claim.

## Scope Boundary

Allowed:

- create one support artifact under `support/sidecars/UI-BE-008/`
- summarize machine-truth, planning, contract, and design anchors
- prepare reviewer handoff notes for the eventual parent implementation review

Not allowed:

- editing L1/L2 canonical truth
- editing parent runtime code, contracts, or planning docs
- changing the parent task lifecycle or claiming parent acceptance is complete
- inventing implementation evidence that does not yet exist

## Machine-Truth Anchors

### Sidecar task intent

- `id`: `UI-BE-008-SIDECAR-REVIEW`
- `owner`: `Codex`
- `reviewer`: `Claude`
- `helper_parent`: `UI-BE-008`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- artifact path:
  `support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-REVIEW.md`

### Parent task snapshot

- `id`: `UI-BE-008`
- `status`: `backlog`
- `owner`: `Gemini`
- `reviewer`: `Codex2`
- `depends_on`: `UI-BE-003`
- `artifacts`: `apps/api/src/modules/driver-instruction/`
- `acceptance`: `Storage + ops-side create + driver-side read; expiresAt handling; vitest`
- `planning_ref`:
  `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md`

Implication:

- this sidecar may prepare reviewer context, but it cannot claim code landed or
  tests passed because machine truth still places the parent before execution.

### Dependency snapshot

- `UI-BE-003` status: `backlog`
- `UI-BE-003` owner / reviewer: `Codex2` / `Claude`
- `UI-BE-003` acceptance:
  `Endpoints implemented; per-realm filter works; vitest covers 5+ event types from Q-X06 taxonomy`

Reviewer implication:

- `UI-BE-008` depends on notification infrastructure but should still own its
  own instruction storage, ops create flow, driver read flow, and ack flow.
- parent review should verify that `UI-BE-008` consumes the notification slice
  without redefining notification taxonomy locally.

## Product And Contract Anchors

These are the authoritative anchors this sidecar found for the future parent
review:

- [packages/contracts/src/ui-runtime.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-be-008-sidecar-review/packages/contracts/src/ui-runtime.ts:305)
  defines `DriverOpsInstruction` with `instructionId`, `taskId`, `message`,
  `issuedBy`, `issuedAt`, and optional `expiresAt`.
- [docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-be-008-sidecar-review/docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:82)
  records the parent task scope and acceptance.
- [docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-be-008-sidecar-review/docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:117)
  records the dependency chain `UI-BE-003 -> UI-BE-008 -> UI-CL-005`.
- [docs/05-ui/driver-app-design-handoff-packet-20260525.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-be-008-sidecar-review/docs/05-ui/driver-app-design-handoff-packet-20260525.md:449)
  states the driver app receives `DriverOpsInstruction` with
  `instructionId`, `taskId`, `message`, `issuedBy`, `issuedAt`, and
  `expiresAt?`.
- [docs/05-ui/driver-app-design-handoff-packet-20260525.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-be-008-sidecar-review/docs/05-ui/driver-app-design-handoff-packet-20260525.md:701)
  records the unresolved display behavior question for `/trip` manual fallback
  banner auto-dismiss versus static handling after `expiresAt`.
- [docs/02-architecture/driver-platform-binding-and-offline-contract-20260524.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-be-008-sidecar-review/docs/02-architecture/driver-platform-binding-and-offline-contract-20260524.md:14)
  ties `DriverOpsInstruction` to driver-platform binding and offline/manual
  fallback behavior.

## Evidence Summary

This sidecar can only summarize evidence that already exists before the parent
implementation:

| Review point | Status | Evidence anchor | Why it matters |
| --- | --- | --- | --- |
| Parent task is registered with explicit acceptance and artifact target | `met` | `ai-status.json` task record for `UI-BE-008`; planning packet §4 Layer 1 | Confirms the slice is formally dispatched work, not an ad hoc idea. |
| Dependency on notifications is explicit | `met` | `ai-status.json` dependency record; planning dependency graph | Prevents the parent from silently re-implementing notification behavior. |
| Contract shape for `DriverOpsInstruction` already exists | `met` | `packages/contracts/src/ui-runtime.ts` | Parent implementation should emit this exact shape instead of inventing a local DTO. |
| Driver-app consumer expectation is already specified | `met` | driver-app handoff packet `/trip` instruction banner anchors | Parent API review must check backend fields against an already-defined consumer. |
| `expiresAt` is part of both acceptance and product framing | `met-with-note` | planning acceptance; contract field; driver-app open question | Parent tests must cover expiry semantics, but the product packet still leaves presentation nuance open. |
| Runtime implementation evidence exists today | `not-yet` | no `apps/api/src/modules/driver-instruction/` module found in this worktree | Important guardrail: this packet must not overclaim code or tests that do not exist yet. |

Result: 4 review points `met`, 1 review point `met-with-note`, 1 review point
`not-yet`.

## Expected Parent Review Focus

When `UI-BE-008` moves to implementation and later to `review`, the reviewer
should verify at least these points:

1. `DriverOpsInstruction` responses match the contract fields exactly, with no
   local shape drift.
2. Ops-side creation flow is separated from driver-side read and acknowledge
   flow, with auth boundaries appropriate to each realm.
3. `expiresAt` behavior is covered in vitest and reflected consistently in list
   and acknowledge behavior, even if UI presentation timing remains a frontend
   decision.
4. The module composes with `UI-BE-003` notification infrastructure instead of
   duplicating notification persistence or delivery semantics.
5. The implementation lands under the declared artifact root
   `apps/api/src/modules/driver-instruction/`.

## Reviewer Spot-Checks For This Sidecar

`Claude` should be able to review this sidecar by confirming:

1. the packet stays inside support-artifact scope only;
2. it truthfully states that parent `UI-BE-008` and dependency `UI-BE-003` are
   both still `backlog`;
3. every evidence claim is anchored to machine truth, contract files, or design
   packet docs that already exist; and
4. it does not treat planning or design references as shipped implementation.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only
- [x] Do not edit canonical truth
- [x] Prepare reviewer handoff packet for `Claude`

## Local Verification For This Sidecar

This slice is docs-only. Local verification should stay minimal:

- `git diff --check -- support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-REVIEW.md`

No parent implementation tests were run because the sidecar does not add or
modify runtime code.

## Files Added By This Sidecar

```text
support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-REVIEW.md
```
