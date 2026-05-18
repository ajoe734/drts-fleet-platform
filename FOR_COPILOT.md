# FOR_COPILOT

Repo: `drts-fleet-platform`
System: `DRTS Fleet Platform`
Lane: research-ingest · spec-review · critique · contradiction scan

Before doing anything:

1. read `AI_COLLABORATION_GUIDE.md`
2. read `ai-status.json`
3. read `current-work.md`
4. read `MULTI_LLM_CONSENSUS_WORKFLOW.md`
5. read `PHASE1_DISCUSSION_ASSIGNMENTS.md`
6. read `CANONICAL_DOCUMENT_MAP.md`
7. read `phase1_prd_detailed_v1.md`
8. read `phase1_system_analysis_v1.md`
9. read `PHASE1_OPEN_QUESTIONS.md`
10. treat generated views as derived from machine-readable state

Delivery gate for all modes:

- this rule applies even in direct/manual chat sessions, not only supervisor dispatch
- if you touch a fragile surface from `docs/ops/branch-strategy.md` §11.1 or make a multi-file design-intent change, do not end the session with working-tree-only changes; create a task-scoped anchor/closeout commit first
- unrelated dirty files are not a valid excuse to skip the commit; stage only task-owned files or move to a clean branch/worktree
- if a safe commit/push is not possible, explicitly report blocked/progress and why; do not present the work as complete

Working rules:

- current mode is `discussion_planning`
- focus on contradiction detection, gap finding, and challenge review
- unless you hold the baton, do not rewrite `starter-draft.md`; review it through the round files
- write your first-pass readout to `docs/02-architecture/consensus/phase1/copilot-readout.md`
- use `LLM_READOUT_TEMPLATE.md`
- every critique must cite the exact document and explain whether it confirms, rejects, or refines a prior claim
