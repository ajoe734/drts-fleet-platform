# Canonical Document Map

This file defines how collaboration state, Phase 1 product truth, execution rules, and provisional design artifacts fit together in this repo.

## 1. Current Mode

- Active mode: `supervisor_managed_execution`
- Meaning: accepted planning has already been converted into execution / closeout truth
- Constraint: current execution truth should be read from `ai-status.json` and `current-work.md`; historical planning workspaces are context, not the live task board
- Supported modes overall: `discussion_planning` and `supervisor_managed_execution`

## 2. Canonical Layers

### L0 Collaboration

- `AI_COLLABORATION_GUIDE.md`
- `ai-status.json`
- `current-work.md`

### L1 Product Truth

- `phase1_system_analysis_v1.md`
- `phase1_prd_detailed_v1.md`
- `phase1_service_contracts_v1.md`
- `phase1_migration_plan_v1.md`

### L1.5 Accepted System Design Decisions

These are scoped superseding records used during execution when a human-accepted
decision temporarily overrides older conflicting L1 wording without rewriting
the canonical PRD / SA files in the same wave.

- `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`
- `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md`

Optional future addition beyond the accepted packets above:

- if a dedicated system design file is introduced, add it explicitly here and update precedence notes in the same change

### L2 Execution Rules

- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/README.md`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`
- `phase1_db_migration_extracted/README.md`

## 3. Provisional Design Inputs

These files are intentionally editable and reviewable. They are inputs to consensus, not consensus itself.

- `TARGET_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEVELOPMENT_WORKBREAKDOWN.md`
- `PHASE1_DECISION_LEDGER.md`
- `PHASE1_OPEN_QUESTIONS.md`
- `MULTI_LLM_CONSENSUS_WORKFLOW.md`
- `PHASE1_DISCUSSION_ASSIGNMENTS.md`
- `docs/02-architecture/consensus/phase1/*`

## 4. Precedence By Scope

### Collaboration and process state

1. latest explicit user instruction
2. `AI_COLLABORATION_GUIDE.md`
3. `ai-status.json`
4. `current-work.md`
5. `ai-activity-log.jsonl`

### Product semantics and business truth

1. latest explicit user instruction
2. accepted decision packets within their explicit scoped conflict area
3. `phase1_prd_detailed_v1.md`
4. `phase1_system_analysis_v1.md`
5. `phase1_service_contracts_v1.md`
6. `phase1_migration_plan_v1.md`
7. L2 execution-rule documents
8. OpenAPI examples, UI skeletons, generated artifacts, and local placeholders

### Design proposals before consensus

1. latest explicit user instruction
2. accepted consensus packet once it exists
3. current seed design docs

Important:

- provisional design docs must not override product truth
- accepted decision packets may temporarily supersede older L1 wording, but
  only within the scope they name explicitly
- extracted zip docs are now stable repo-local references and should be cited by path
- if a future system design file is added, it must be inserted explicitly rather than assumed

## 5. Stable Reference Locations

- Documentation index:
  - `docs/README.md`
- Current code-backed audit:
  - `docs/00-context/current-system-blueprint-alignment-audit-20260421.md`
- Cross-repo code-backed annex audit:
  - `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`
- Core specs:
  - `phase1_system_analysis_v1.md`
  - `phase1_prd_detailed_v1.md`
  - `phase1_service_contracts_v1.md`
  - `phase1_migration_plan_v1.md`
- Accepted system-design decisions:
  - `docs/01-decisions/`
- Extracted execution pack:
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/`
- Extracted DB bundle:
  - `phase1_db_migration_extracted/`
- Discussion workspace:
  - `docs/02-architecture/consensus/phase1/`

## 6. Working Rule

When two documents conflict:

1. pick the higher-precedence source for the relevant scope
2. cite the exact file and section
3. if an accepted decision packet already covers the conflict, follow it within scope and defer L1 edits to controlled design sync
4. otherwise record the conflict in the review round or open questions
5. do not convert the interpretation into implementation work until the consensus packet or the human resolves it
