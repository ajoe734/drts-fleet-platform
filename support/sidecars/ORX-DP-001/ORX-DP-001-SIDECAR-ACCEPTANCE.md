# ORX-DP-001 Acceptance Packet

Task: **ORX-DP-001 — Queue-family implementation and queue-entry policy surfacing**
Prepared by: `Claude2`
Date: `2026-04-30`
Sidecar ID: `ORX-DP-001-SIDECAR-ACCEPTANCE`

---

## 1. Dependency Map

```
OPX-DP-001 (done)
  Queue-entry policy and reservation vs realtime orchestration
  Owner: Codex | Reviewer: Codex2
  Commit: 6aaa6e9 — feat(owned-mobility): tighten dispatch and compliance gates
    │
    ▼
ORX-DP-001 (done)
  Queue-family implementation and queue-entry policy surfacing
  Owner: Codex2 | Reviewer: Codex
  Commit: d1490b5 — feat(ORX-DP-001): surface dispatch queue family metadata
```

No downstream tasks depend on ORX-DP-001 at this time.

## 2. Acceptance Criteria Verification

| #   | Criterion                                                                                               | Status | Evidence                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Queue families are explicit in API and UI                                                               | PASS   | `DispatchQueueFamily` enum defines 6 families (`realtime_ready_queue`, `reservation_confirmation_queue`, `redispatch_priority_queue`, `delayed_retry_queue`, `exception_hold_queue`, `recording_gate_queue`, `manual_review_queue`) in `packages/contracts/src/index.ts:1215-1223`. `OwnedOrderRecord` exposes `queueFamily` at line 1766. |
| 2   | Operators can distinguish realtime, reservation, redispatch, recording-gated, and exception-hold queues | PASS   | Queue resolution logic implemented in `owned-mobility.service.ts:4153`. Dispatch UI renders queue-family and recording-gate badge in `dispatch-workflow.tsx:139,686`.                                                                                                                                                                      |
| 3   | Queue entry reason is explicit                                                                          | PASS   | `DispatchQueueEntryReason` enum with 12 reasons in `packages/contracts/src/index.ts:1225-1240`. `OwnedOrderRecord` exposes `queueEntryReason` at line 1767.                                                                                                                                                                                |

## 3. Artifacts Produced

### Contracts

- `packages/contracts/src/index.ts` — `DISPATCH_QUEUE_FAMILIES`, `DISPATCH_QUEUE_ENTRY_REASONS`, `QUEUE_ENTRY_POLICY_MAP` enums and policy map
- `packages/api-client/src/index.ts` — client-side exports (+26 lines)

### API

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` — queue resolution logic (+311 lines)
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` — controller wiring (+2 lines)

### UI

- `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` — queue-family display and recording-gate badge (+372 lines)
- `apps/ops-console-web/lib/localized-labels.ts` — zh/en queue-family labels (+50 lines)
- `apps/ops-console-web/lib/translations.ts` — recording-state zh wording fix (+35 lines)

### Tests

- `apps/api/tests/unit/owned-mobility.service.test.ts` — queue-state matrix assertions (+139 lines)
- `apps/api/tests/unit/owned-mobility-task-events.test.ts` — test helper correction (+1 line)

## 4. Review Evidence

- **Reviewer**: Codex
- **Review file**: `support/sidecars/ORX-DP-001/ORX-DP-001-REVIEW.md`
- **Result**: `review_approved`, no blocking findings
- **Reviewer fix applied**: Corrected shared zh recording-state label from callback semantics to recording semantics in `translations.ts:1551,1582`

### Verification commands (from review)

```bash
pnpm --filter @drts/api exec vitest run \
  tests/unit/owned-mobility.service.test.ts \
  tests/unit/owned-mobility-compliance-gates.test.ts \
  tests/unit/callcenter.service.test.ts
pnpm --filter @drts/ops-console-web typecheck
```

## 5. Commit Evidence

| Field          | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| Commit hash    | `d1490b5`                                                  |
| Commit subject | `feat(ORX-DP-001): surface dispatch queue family metadata` |
| Agent          | Codex (on behalf of Codex2)                                |
| Reviewer       | Codex                                                      |
| Recorded at    | 2026-04-30T13:18:27Z                                       |

### Predecessor commit

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| Commit hash    | `6aaa6e9`                                                     |
| Commit subject | `feat(owned-mobility): tighten dispatch and compliance gates` |
| Task           | OPX-DP-001                                                    |
| Agent          | Codex                                                         |
| Reviewer       | Codex2                                                        |

## 6. Scope Notes

- `packages/contracts/src/index.ts` contains unrelated in-flight contract edits in the worktree. This packet covers only the dispatch queue-family / queue-entry slices cited above.
- This acceptance packet is a support artifact only. It does not modify canonical truth or primary runtime implementations.
