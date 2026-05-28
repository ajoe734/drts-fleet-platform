# UI-BE-008 Sidecar Review Packet

- Sidecar Task: `UI-BE-008-SIDECAR-REVIEW`
- Sidecar Status: `review_approved` owner closeout support
- Sidecar Owner / Reviewer: `Codex` / `Claude2`
- Parent Task: `UI-BE-008`
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Last refreshed: `2026-05-28`

## Purpose

This packet is the closeout-time reviewer handoff for `UI-BE-008`. It does not
change parent runtime code or any L1/L2 canonical truth. It only records the
supporting evidence that the shipped `UI-BE-008` slice matches the approved
review anchors from commits `b3681f5f` and `f6f8aa8c`.

## Scope Boundary

Allowed:

- refresh this sidecar artifact
- summarize shipped-tree evidence for reviewer reuse
- record commit, contract, migration, and test anchors

Not allowed:

- edit parent implementation
- edit canonical product truth or governance docs
- restate support notes as new runtime truth

## Shipped Commit Anchors

- `b3681f5f` — `UI-BE-008: enforce durable driver instruction persistence`
- `f6f8aa8c` — `UI-BE-008: finalize closeout`

Closeout trailer anchor from `f6f8aa8c`:

- `LLM-Agent: Codex`
- `Task-ID: UI-BE-008`
- `Reviewer: Codex2`
- `Verification: pnpm exec vitest run tests/unit/driver-instruction.repository.test.ts; pnpm --filter @drts/api exec vitest run tests/unit/driver-instruction.service.test.ts; pnpm --filter @drts/api typecheck`

## Evidence Summary

### Contract anchor

- `packages/contracts/src/ui-runtime.ts:305` defines `DriverOpsInstruction`
  for `Q-DRV04` with `instructionId`, `taskId`, `message`, `issuedBy`,
  `issuedAt`, and optional `expiresAt`.
- The contract comment ties the record to manual-fallback driver coordination,
  which matches the parent task scope instead of inventing a local DTO.

### Persistence and migration anchor

- `infra/migrations/V0025__driver_ops_instructions.sql:1` creates
  `ops.phase1_driver_ops_instructions`.
- The migration persists `instruction_id`, `driver_id`, `task_id`,
  `issued_at`, `expires_at`, `acknowledged_at`, `updated_at`, and `record`,
  with indexes on driver, task, updated time, and non-null expiry.
- This matches the durable-storage requirement called out by the parent task
  and the later persistence-hardening commit `b3681f5f`.

### Runtime anchor

- `apps/api/src/modules/driver-instruction/driver-instruction.module.ts`
  wires `DatabaseModule`, `AuditNotificationModule`,
  `DriverInstructionRepository`, and `DriverInstructionService`.
- `apps/api/src/modules/driver-instruction/driver-instruction.controller.ts`
  exposes:
  - `POST /ops/driver-instructions`
  - `GET /driver/ops-instructions`
  - `POST /driver/ops-instructions/:instructionId/acknowledge`
- `apps/api/src/modules/driver-instruction/driver-instruction.service.ts`
  enforces:
  - ops/platform identity to issue instructions
  - driver identity to list and acknowledge
  - future-only `expiresAt`
  - durable persistence before create/ack side effects become externally
    visible
  - linked notification cleanup on create persistence failure
  - idempotent acknowledge after a successful pre-expiry ack

### Repository anchor

- `apps/api/src/modules/driver-instruction/driver-instruction.repository.ts`
  loads and upserts JSON records in
  `ops.phase1_driver_ops_instructions`.
- `tests/unit/driver-instruction.repository.test.ts` contains 2 vitest cases:
  - load persisted instructions from `ops.phase1_driver_ops_instructions`
  - upsert persisted instructions into `ops.phase1_driver_ops_instructions`

### Service-test anchor

- `apps/api/tests/unit/driver-instruction.service.test.ts` contains 9 vitest
  cases covering:
  - active unacknowledged list filtering for the current driver
  - expired instruction hiding plus linked notification read-on-ack
  - invalid and past expiry rejection
  - missing required field rejection
  - durable create gating before list exposure
  - create persistence failure cleanup with no in-memory residue
  - expired acknowledge rejection
  - durable acknowledge gating before read-state transition
  - idempotent acknowledge after later expiry

### Reopen fix anchors

Dispatch brief references reopen `#1` through `#4`. The shipped tree matches
those fixes through the durable-persistence and ack-hardening coverage above:

1. create path does not expose an instruction before persistence succeeds
2. create persistence failure removes the linked notification and leaves no
   residue
3. acknowledge path does not mark the instruction read before persistence
   succeeds
4. acknowledge remains idempotent after a prior successful ack, even if the
   instruction later expires

These are anchored by commit `b3681f5f` plus the 9 service tests and 2
repository tests named above.

## Reviewer Handoff

`Claude2` should treat this packet as support-only. The review question is not
whether to change `UI-BE-008`; it is whether this packet truthfully summarizes
what already shipped in `b3681f5f` and `f6f8aa8c`.

Spot-checks:

1. `Q-DRV04` contract anchor still matches the shipped backend shape.
2. `V0025` migration and repository code prove durable persistence rather than
   in-memory-only storage.
3. The test inventory is accurately counted as 9 service cases and 2
   repository cases.
4. The packet does not claim to be canonical truth or new implementation.
5. Closeout trailers quoted above match the shipped `f6f8aa8c` commit.

## Local Verification

- `git diff --check -- support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-REVIEW.md`

## File Owned By This Sidecar

```text
support/sidecars/UI-BE-008/UI-BE-008-SIDECAR-REVIEW.md
```
