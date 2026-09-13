# Supervisor Queue

This file is the live routing note for the pre-implementation discussion loop.

## Active user-directed planning round — 2026-09-13

- Latest user scope: prioritize operational launch and retain one call / one order. Withdraw the earlier multi-order schema/service/UI proposal. Complete the necessary SA/SD, then use supervisor/auto workers for implementation.
- Active packet: [Product remediation SA/SD discussion draft](product-remediation-sa-sd-20260913.md).
- `discussion_planning` is active. Supervisor remains running; WIRE and Webhook execution workers are stopped and their WIP is preserved.
- Do not treat the earlier consensus or the historical disposition below as authorization to resume this round's implementation. Complete the current SA/SD discussion, then dispatch through supervisor and auto workers.
- This conversation prepares and reviews the design; implementation belongs to the dispatched auto workers.

## Root source correction — Entry 26

Entries 20–25 are submitted proposals, with concrete source corrections still open in Entry 26. References below to “resolving” those entries are review summaries, not acceptance. Copilot must disposition Entry 26; Claude must carry the corrected finite design into the operational launch packet. Preserve P05 and all original gates.

## Current assignment

- Supervisor: Claude
- Current baton owner: Copilot
- Active working file: `review-round-1.md`
- Planning status: Gemini2 second-pass review submitted through Entries 23–25 (dispositioning crash points across commit boundaries, transactional outbox recovery, multi-replica concurrency, lease epoch fencing, credential renewal race supersession, zero-order compliance audio preservation, and isolated CI runner step preservation for C111–C115 while maintaining tenant gates). Baton advanced to Copilot.
- Mode: `discussion_planning`
- Current discussion inventory: `product-remediation-sa-sd-20260913.md`, P01–P06 and §§3.7–3.12; one-call/one-order launch scope is settled.
- Next required output: Copilot checks stable credential identity versus general driver updated_at, notification payload conflicts, early dedupe returns, unsupported-handler completion and expiry coverage; preserves single-order scope and the pending Academy waiver disposition.

Authority: current `ai-status.json.discussion_loop`, unchanged planning mode, completed Codex receipt, verified Claude2 weekly-limit response under `.local/product-completion-20260913/sa-sd-pause/`, Gemini Entries 20–22, and Gemini2 Entries 23–25.

## Current review order

1. Claude2
2. Gemini
3. Gemini2
4. Copilot
5. Claude

This is `ai-status.json.discussion_loop.review_order`. Qwen's April readout and review remain historical evidence, not a current lane assignment.

## Current advance rule

- Operator routing advanced Codex → Claude2 after completed Entries 18–19, Claude2 → Gemini after Claude2 returned a verified weekly-limit error, Gemini → Gemini2 after completed Entries 20–22, and Gemini2 → Copilot after completed Entries 23–25.
- Reviewers comment through the round file; only the current baton owner changes the shared draft.
- Preserve the existing `SR-WIRE-001` and `SR-QA-WEBHOOK-001` planning pause, WIP, and required acceptance. These review proposals establish no new implementation backlog.
- First-release call scope is one call / one order. `SR-CALL-MULTIORDER-20260913` is withdrawn, retained blocked with empty scopes for history and removed from release dependencies. Do not allocate scopes, request more 1:N SD, recreate the task, or auto-resume it. Earlier acceptance/integration notes cannot override its latest withdrawal note.
- Complete the current SA/SD discussion and record the user's acceptance of the packet before a later mode change. The user's existing instruction already directs supervisor/auto-worker execution after that discussion; do not add a second request for the same execution authorization. April's convergence cannot satisfy this cycle's gate.

## Current disposition and review follow-up

Codex submitted [review-round-1.md](review-round-1.md), Entries 5–19. Gemini submitted Entries 20–22, resolving runtime packaging (P03 tsconfig), API lifecycle hooks, outbox deployment compatibility, voice handler composition, clock-in persistence, Academy single-transaction derivation, credential fingerprinting/renewal supersession, vehicle insurance mapping (SC-024), close-event replay with ordinary/zero-order recording recovery, C113/C114 real-persistence and fail-closed runner boundaries, and P06 shared-dev /healthz deployment verification under the accepted realm auth matrix. Gemini2 submitted Entries 23–25, resolving crash points across commit boundaries, transactional outbox recovery, multi-replica concurrency, lease epoch fencing, credential renewal race supersession, zero-order compliance audio preservation, and isolated CI runner architecture for C111–C115 while preserving tenant gates. Earlier 1:N proposals are historical and withdrawn. The historical packet and round-2 file remain unchanged. This cycle has not converged.

| Lane    | Cited planning output requested                                                                                                                                                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude2 | [LANE LIMIT] Exited with weekly limit; technical review obligations transferred to Gemini and dispositioned in Entries 20–21.                                                                                                                                                                             |
| Gemini  | [SUBMITTED] Entries 20–22 dispositioned WIRE tsconfig loader, lifecycle hooks, outbox persistence compatibility, handler composition, clock-in persistence, Academy transaction/write grant, credential fingerprinting, vehicle insurance, close-event replay/ordinary-call recovery, C113/C114 runner test boundaries, and P06 shared-dev deployment health. |
| Gemini2 | [SUBMITTED] Entries 23–25 dispositioned crash points across commit boundaries, transactional outbox recovery, multi-replica concurrency, lease epoch fencing, credential renewal race supersession, zero-order audio compliance preservation, single-order launch boundaries, and isolated CI runner step preservation for C111–C115 while maintaining tenant gates. |
| Copilot | Check stable credential identity versus general driver updated_at, notification payload conflicts, early dedupe returns, unsupported-handler completion and expiry coverage; preserve single-order scope and the pending Academy waiver disposition.                                                      |
| Claude  | Publish the synchronized Q-001/inventory records, preserve the reconciled withdrawal and disposition Entries 11–13 and 17–25 under Entry 16. Record accepted scoped design/backlog before any later execution and any actual baton transition; preserve P05 and original acceptance gates.                |

The supervisor has synchronized inventory §§3.5/3.7–3.8/3.10/4 and the shared question board with the later single-order direction, including the historical backlog-count distinction. Preserve that update and publish it through the owning document flow; board snapshot `2026-09-13T14:18:58Z` now reconciles the withdrawn task’s older integration note and clears its active dependencies/acceptance keys. That follow-up is complete as a supervisor record change, not product implementation. The withdrawal is not completed implementation and does not remove original QA/live acceptance. P05 remains on its separate existing human-decision route; call scope does not select a passenger push provider or topology.

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
