# Phase 1 Discussion Assignments

This file distributes the initial reading and review emphasis across the LLM lanes. All lanes still read the canonical layers first.

This assignment file is used while the supervisor is in `discussion_planning` mode.

## Shared rules

- Everyone must read the canonical L0, L1, and L2 layers.
- Everyone writes to the assigned file under `docs/02-architecture/consensus/phase1/`.
- Everyone uses `LLM_READOUT_TEMPLATE.md` for the first pass.
- Review comments must use `LLM_CROSS_REVIEW_TEMPLATE.md`.
- No one may create implementation tasks yet.

## Lane assignments

### Claude

- emphasis: governance, source-of-truth arbitration, execution wave coherence
- output: `docs/02-architecture/consensus/phase1/claude-readout.md`
- must especially review: `TARGET_ARCHITECTURE.md`, `ROADMAP.md`, `PHASE1_DECISION_LEDGER.md`

### Gemini

- emphasis: migration sequencing, infra implications, CI/runtime risk
- output: `docs/02-architecture/consensus/phase1/gemini-readout.md`
- must especially review: `phase1_migration_plan_v1.md`, DB bundle README, engineering playbook

### Codex

- emphasis: contracts, enums, state machines, acceptance baselines
- output: `docs/02-architecture/consensus/phase1/codex-readout.md`
- must especially review: service contracts, decision tables, acceptance scenarios

### Qwen

- emphasis: API seams, flow feasibility, adapter boundaries, vertical-slice implications
- output: `docs/02-architecture/consensus/phase1/qwen-readout.md`
- must especially review: service contracts, migration plan, API examples, acceptance scenarios

### Copilot

- emphasis: contradiction scan, gap finding, critique of assumptions
- output: `docs/02-architecture/consensus/phase1/copilot-readout.md`
- must especially review: PRD, SA, open questions, roadmap

## Review rounds

- Round 1: every lane reviews at least two other readouts
- Round 2: every unresolved disagreement is either narrowed or escalated
- Final synthesis: Claude or the human editor compiles `consensus-packet.md` from the accepted outcomes

## Default baton loop

### Starter pass

- owner: `Codex`
- outputs:
  - `docs/02-architecture/consensus/phase1/codex-readout.md`
  - `docs/02-architecture/consensus/phase1/starter-draft.md`
  - first entry in `docs/02-architecture/consensus/phase1/baton-log.md`

### Review pass

- `Qwen` reviews the starter draft for end-to-end feasibility
- `Gemini` reviews the starter draft for rollout and infra risk
- `Copilot` reviews the starter draft for contradiction and unsupported assumptions
- `Claude` performs the synthesis decision and either:
  - updates the draft directly for the next round, or
  - hands the baton back to `Codex` for a deeper rewrite

### Repeat rule

- repeat the baton loop until only accepted conclusions and `human_required` questions remain
- only then promote the outcome into `consensus-packet.md`
