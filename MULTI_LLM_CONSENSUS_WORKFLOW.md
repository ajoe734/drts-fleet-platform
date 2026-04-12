# Multi-LLM Consensus Workflow

This file defines the pre-implementation workflow for DRTS Phase 1.

It is the `discussion_planning` half of the continuous two-mode supervisor model described in `SUPERVISOR_OPERATING_MODEL.md`.

## Goal

Reach a documented multi-LLM consensus on Phase 1 architecture, delivery order, and task slicing before enabling supervisor and auto worker execution.

The same workflow may also be used for a status-conformance audit that compares the current implementation against the canonical Phase 1 target docs.

## Workflow

### Step 1. Freeze canonical read order

Use only these layers as canonical truth:

- `L0 Collaboration`: `AI_COLLABORATION_GUIDE.md`, `ai-status.json`, `current-work.md`
- `L1 Product Truth`: `phase1_system_analysis_v1.md`, `phase1_prd_detailed_v1.md`, `phase1_service_contracts_v1.md`, `phase1_migration_plan_v1.md`
- `L2 Execution Rules`: extracted LLM dev pack `README`, `00`, `01`, `02`, `03`, `05`, plus `phase1_db_migration_extracted/README.md`

### Step 2. Submit independent readouts

Each lane writes one readout using `LLM_READOUT_TEMPLATE.md`.

The readout must contain:

- `non-negotiables`
- `source of truth / ownership`
- `state machine / enum constraints`
- `open questions`
- `implementation impact`

### Step 2.5. Create the shared starter draft

The supervisor begins by assigning one starter lane to organize the first shared interpretation.

Default start:

- starter lane: `Codex`
- shared draft: `docs/02-architecture/consensus/phase1/starter-draft.md`
- baton log: `docs/02-architecture/consensus/phase1/baton-log.md`
- supervisor queue: `docs/02-architecture/consensus/phase1/supervisor-queue.md`

Only the current baton owner edits the shared starter draft.

### Step 3. Run cited cross-review

Every review must:

- point to the exact file
- cite the relevant section or heading
- say whether it confirms, refines, or rejects the earlier claim

Use `LLM_CROSS_REVIEW_TEMPLATE.md`.

Default review order for the first loop:

1. `Qwen`
2. `Gemini`
3. `Copilot`
4. `Claude`

### Step 4. Run discussion rounds

- Discussion is allowed and encouraged.
- Free-form opinion without citations is not accepted.
- Each round must shrink disagreement or explicitly mark `human_required`.
- After each round, the supervisor records the next baton owner.
- The current owner updates `starter-draft.md` to absorb accepted changes.
- The rejected or escalated interpretations are carried into the next review file until closure.

### Step 5. Publish the consensus packet

The consensus packet is the only document allowed to authorize a switch into supervisor-managed execution.

It must contain only:

- accepted conclusions
- rejected interpretations
- unresolved human decisions
- execution waves
- task ownership / reviewer map

Use `PHASE1_CONSENSUS_PACKET_TEMPLATE.md`.

If the discussion produces official backlog that is not already represented in the task board:

- create those tasks in `ai-status.json`
- sync the generated mirrors
- only then claim that the project still has open work

## Exit Criteria

Switch to supervisor mode only when:

- all readouts exist
- at least one cross-review round exists
- disagreements are either resolved or explicitly escalated
- the consensus packet is drafted
- the human approves the packet
- all official remaining backlog from the approved packet is already reflected in `ai-status.json`
