# Phase 1 Consensus Workspace

This directory stores the working artifacts for Phase 1 discussion, cited review, and consensus, including re-entry from execution.

## Current planning cycle — 2026-09-13

- Mode: `supervisor_managed_execution`; user confirmed the current packet on 2026-09-13. No planning reviewer is assigned; supervisor dispatches registered implementation tasks with Codex review.
- Active artifact: [review-round-1.md](review-round-1.md), Entries 5–27. Entries 20–22 and 23–25 submitted initial technical designs; Entry 26 provided root source corrections against repository truth at `6eec9635c17674b89b8519c642eb48b51dbd6479`; Entry 27 (Gemini) verified and accepted root's finite operational launch proposal in [consensus-packet.md](consensus-packet.md) (§§B1–B9, C, D), confirming clock-in persistence, Academy projection rules, WIRE tsconfig runtime loading, Registry expiry catch-up, outbox durable handoff intents, voice runner schema & safe drain, failed work repair, isolated C113–C115 runner steps, and non-overlapping worker scopes. Single-order launch scope is strictly maintained.
- Routing: [supervisor-queue.md](supervisor-queue.md); history: [baton-log.md](baton-log.md).
- [starter-draft.md](starter-draft.md) retains the April synthesis as history. The April packet and round-2 “not required” note do not authorize the current return to execution.
- Latest scope: board snapshot `2026-09-13T14:02:27Z` records the user's subsequent direction to use **one call / one order for the first operational release**. `SR-CALL-MULTIORDER-20260913` is withdrawn, retained as blocked for history, and removed from release dependencies. It must not auto-resume after SA/SD or be reported as a launch blocker/completed implementation.
- Technical SA/SD review and current user acceptance are complete. WIRE, launch schema, recording recovery, credential expiry and C115 harness work use the existing canonical task lifecycle; required product/live acceptance remains outstanding.
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
- current implementation is supervisor-managed; root reviews results. VM product hosting remains prohibited; serving acceptance stays hosted/shared dev.
