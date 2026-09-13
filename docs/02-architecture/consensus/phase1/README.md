# Phase 1 Consensus Workspace

This directory stores the working artifacts for Phase 1 discussion, cited review, and consensus, including re-entry from execution.

## Current planning cycle — 2026-09-13

- Mode: `discussion_planning`; recorded baton owner: Codex; supervisor: Claude.
- Active artifact: [review-round-1.md](review-round-1.md), Entries 5–10. Codex's cited review is submitted; supervisor disposition and further review are pending.
- Routing: [supervisor-queue.md](supervisor-queue.md); history: [baton-log.md](baton-log.md).
- [starter-draft.md](starter-draft.md) retains the April synthesis and points to the reopened review. The April packet and round-2 “not required” note remain historical; neither authorizes the current return to execution.
- The supervisor’s `product-remediation-sa-sd-20260913.md` is the current P01–P06 discussion inventory. It became available during this review and remains a proposal; Entries 7, 8, and 10 cover its authority, acceptance, and pending decision boundaries.
- Authority: `ai-status.json` (shared runtime machine truth), `execution_mode` and `discussion_loop`; [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§0, 2, 4–6. This dated summary does not override later machine truth or user instructions.

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
