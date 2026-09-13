# Supervisor Queue

This file is the live routing note for the pre-implementation discussion loop.

## Active user-directed planning round — 2026-09-13

- Latest user scope: prioritize operational launch and retain one call / one order. Withdraw the earlier multi-order schema/service/UI proposal. Complete the necessary SA/SD, then use supervisor/auto workers for implementation.
- Active packet: [Product remediation SA/SD discussion draft](product-remediation-sa-sd-20260913.md).
- `discussion_planning` is active. Supervisor remains running; WIRE and Webhook execution workers are stopped and their WIP is preserved.
- Do not treat the earlier consensus or the historical disposition below as authorization to resume this round's implementation. Complete the current SA/SD discussion, then dispatch through supervisor and auto workers.
- This conversation prepares and reviews the design; implementation belongs to the dispatched auto workers.

## Current assignment

- Supervisor: Claude
- Current baton owner: Codex
- Active working file: `review-round-1.md`
- Planning status: Codex scope reconciliation and technical synthesis review_submitted, Entries 16–17; further cited review and convergence pending (2026-09-13)
- Mode: `discussion_planning`
- Current discussion inventory: `product-remediation-sa-sd-20260913.md`, P01–P06 including newer §§3.9–3.10; its §§3.7–3.8 now record single-order launch scope and withdrawal
- Next required output: carry the synchronized Q-001 scope forward, disposition the remaining WIRE/C111–C115 SD with citations, and collect further review before a new synthesis

Authority checked: `ai-status.json` (shared runtime machine truth), `updated_at=2026-09-13T14:02:27Z`, `execution_mode`, `discussion_loop`, WIRE/webhook pauses, `SR-CALL-MULTIORDER-20260913.next` and `SR-RELEASE-001.depends_on/next`; [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§0, 2, 4–6. This note records no ownership or task-lifecycle transition.

## Current review order

1. Claude2
2. Gemini
3. Gemini2
4. Copilot
5. Claude

This is `ai-status.json.discussion_loop.review_order`. Qwen's April readout and review remain historical evidence, not a current lane assignment.

## Current advance rule

- The supervisor records disposition and any actual baton transition; Codex remains owner until then.
- Reviewers comment through the round file; only the current baton owner changes the shared draft.
- Preserve the existing `SR-WIRE-001` and `SR-QA-WEBHOOK-001` planning pause, WIP, and required acceptance. These review proposals establish no new implementation backlog.
- First-release call scope is one call / one order. `SR-CALL-MULTIORDER-20260913` is withdrawn, retained blocked with empty scopes for history and removed from release dependencies. Do not allocate scopes, request more 1:N SD, recreate the task, or auto-resume it. Earlier acceptance/integration notes cannot override its latest withdrawal note.
- Complete the current SA/SD discussion and record the user's acceptance of the packet before a later mode change. The user's existing instruction already directs supervisor/auto-worker execution after that discussion; do not add a second request for the same execution authorization. April's convergence cannot satisfy this cycle's gate.

## Current disposition and review follow-up

Codex submitted [review-round-1.md](review-round-1.md), Entries 5–17. Inventory §3.5 records earlier dispositions for Entries 5–10, with its Q-001 row now superseded by Entry 16's board-backed correction. Retain Entries 11–13's independent WIRE/runner findings and Entry 17's Academy/C115 synthesis. Entries 14–15's multi-order proposals are historical; single-order recording recovery remains required. The historical packet and round-2 file remain unchanged. This cycle has not converged.

| Lane    | Cited planning output requested                                                                                                                                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude2 | Review clock-in acknowledgement and Academy's shared derivation/projection write boundary; identify recording producer, existing media/API result transport and acknowledged domain effects; retain C113 source mapping/resend/reconciliation.                                     |
| Gemini  | Review the proposed WIRE command correction and C115's actual recording start/drain hook, supported handlers and separate credential-expiry trigger/durable alert path. Retain the VM restriction.                                                                                 |
| Gemini2 | Review preserved C111–C115 case gates, actual process replacement, domain/receipt readback and stale-worker recording effects. Full WIRE 5 API/SQL + 5 browser acceptance remains required.                                                                                        |
| Copilot | Check first-release one-call/one-order scope across Q-001, inventory and task notes; distinguish withdrawn multi-order work from required single-order recovery. Check Academy invalidation/waiver authority and limits of completion-row lease fencing.                           |
| Claude  | Publish the synchronized Q-001/inventory records and reconcile the older withdrawn-task note; disposition remaining Entries 11–13 and 17 under Entry 16; preserve P05's question route, publish the inventory and accepted scoped updates, and record any actual baton transition. |

The supervisor has synchronized inventory §§3.5/3.7–3.8/3.10/4 and the shared question board with the later single-order direction, including the historical backlog-count distinction. Preserve that update and publish it through the owning document flow; the withdrawn task's older integration note still needs reconciliation. The withdrawal is not completed implementation and does not remove original QA/live acceptance. P05 remains on its separate existing human-decision route; call scope does not select a passenger push provider or topology.

These are proposed discussion outputs for supervisor routing, not dispatched workers or implementation tasks.

## Historical assignment (before this planning round)

- Supervisor: Claude
- Current baton owner: Claude
- Active working file: `consensus-packet.md`
- Next required outputs:
  - final consensus packet publication
  - switch to `supervisor_managed_execution`

## Historical review order (before this planning round)

1. Qwen
2. Gemini
3. Copilot
4. Claude

## Historical advance rule (before this planning round)

- move the baton only after the current owner has updated the shared draft
- reviewers comment through the review round file, not by directly editing the shared draft
- when a round stabilizes, Claude either merges accepted changes or returns the baton for a deeper rewrite
- only the accepted consensus packet unlocks supervisor-managed implementation

## Historical disposition (before this planning round)

- Round 1 converged without material contradiction across lanes
- unresolved items are recorded in `consensus-packet.md` as explicit human or later-discussion decisions
- the next action is to switch the supervisor back to execution mode and assign the next approved slices
