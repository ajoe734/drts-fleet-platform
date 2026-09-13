# Phase 1 Consensus Workspace

This directory stores the working artifacts for Phase 1 discussion, cited review, and consensus, including re-entry from execution.

## Current planning cycle — 2026-09-13

- Mode: `discussion_planning`; recorded baton owner: Gemini; supervisor: Claude.
- Active artifact: [review-round-1.md](review-round-1.md), Entries 5–25. Entries 20–22 resolve runtime packaging (P03 tsconfig), API lifecycle hooks, outbox deployment compatibility, voice handler composition, clock-in persistence contract, Academy single-transaction derivation, credential fingerprinting/renewal supersession, vehicle insurance mapping (SC-024), close-event replay with ordinary/zero-order recording recovery, C113/C114 real-persistence and fail-closed runner boundaries, and P06 shared-dev /healthz deployment verification under the accepted realm auth matrix. Entries 23–25 resolve crash points across commit boundaries, transactional outbox recovery, multi-replica concurrency, lease epoch fencing, credential renewal race supersession, zero-order compliance audio preservation, and isolated CI runner architecture for C111–C115 while preserving tenant gates. Entries 16–17 preserve the single-order launch scope. Baton advanced to Copilot for contradiction scan and credential identity check.
- Routing: [supervisor-queue.md](supervisor-queue.md); history: [baton-log.md](baton-log.md).
- [starter-draft.md](starter-draft.md) retains the April synthesis as history. The April packet and round-2 “not required” note do not authorize the current return to execution.
- Latest scope: board snapshot `2026-09-13T14:02:27Z` records the user's subsequent direction to use **one call / one order for the first operational release**. `SR-CALL-MULTIORDER-20260913` is withdrawn, retained as blocked for history, and removed from release dependencies. It must not auto-resume after SA/SD or be reported as a launch blocker/completed implementation.
- Entry 16 supersedes the earlier 1:N planning direction. The supervisor synchronized the shared Q-001 question record and `product-remediation-sa-sd-20260913.md` during review; their publication remains supervisor-owned. Board snapshot `2026-09-13T14:18:58Z` now also reconciles the withdrawn task’s older note and clears its active dependencies/acceptance keys; do not keep routing that reconciliation as pending. Multi-order intent/UI/migration/fan-out proposals remain historical; C115 recording recovery and credential-expiry/alert work remain required.
- The inventory's §§3.9–3.12 now propose a shared Academy transaction and API lifecycle integration for recording/credential recovery. Entries 18–19 identified the remaining source-version, notification handoff, event replay, retry and coverage decisions; Entries 20–22 dispositioned these technical boundaries; Entries 23–25 resolved crash points, multi-replica concurrency, lease fencing, renewal races, zero/one-order recording recovery, and CI runner gate preservation. P03 loading is diagnosed; full WIRE acceptance, C111–C115 coverage, P05's existing decision route and live evidence remain pending.
- Authority: `ai-status.json` (shared runtime machine truth), `execution_mode`, `discussion_loop` and current task notes; [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§0, 2, 4–6. This dated summary does not override later machine truth or user instructions.

## Files

- `starter-draft.md`
- `baton-log.md`
- `supervisor-queue.md`
- `claude-readout.md`
- `gemini-readout.md`
- `codex-readout.md`
- `qwen-readout.md`
- `copilot-readout.md`
- `review-round-1.md`
- `review-round-2.md`
- `consensus-packet.md`

## Rules

- start with individual readouts
- let the supervisor assign one starter lane to own `starter-draft.md`
- then append cited cross-review comments
- then refine through later discussion rounds
- only the current baton owner edits `starter-draft.md`
- only after convergence should `consensus-packet.md` be edited
- unresolved items that need a human decision must also be mirrored into `PHASE1_OPEN_QUESTIONS.md`
- current dispatch is planning-only; no implementation assignments or implementation commits, and no product runtime or deployment
