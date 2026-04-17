# Full Blueprint Planning Workspace

This workspace is the active `discussion_planning` session for the **entire
blueprint implementation scope**, not only the currently visible remaining gaps.

It supersedes narrower planning baselines such as:

- `docs/02-architecture/consensus/phase2-planning/`
- `docs/02-architecture/consensus/phase2-gap-reassessment-20260415/`

## Goal

Use supervisor planning mode to inventory the **full blueprint scope** across:

- all canonical backend domains
- all defined front-end / operator surfaces
- cross-repo responsibilities
- rollout / staging / UAT / evidence gates
- explicitly deferred or future-gated blueprint slices

and then produce a complete development plan that separates:

1. already implemented baseline
2. partially implemented scope
3. missing scope
4. blocked external scope
5. future-gated scope that still belongs in the master plan

## Primary Artifacts

- `starter-draft.md`
- `codex-readout.md`
- `scope-matrix.md`
- `backlog-proposal.md`
- `baton-log.md`
- `supervisor-queue.md`
- `review-round-1.md`
- `review-round-2.md`
- `consensus-packet.md`

## Rules

- Do not collapse the discussion back to only “what is currently left in this repo”
- Treat `phase1_dual_repo_gap_analysis_for_dev_team_final.md` as one planning input, not the only scope boundary
- Inventory all blueprint surfaces, even if they are absent, external, or explicitly future-gated
- Distinguish `implemented`, `partially implemented`, `missing`, `blocked external`, and `future-gated`
