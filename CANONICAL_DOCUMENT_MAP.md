# Canonical Document Map

This file defines how collaboration state, Phase 1 product truth, execution rules, and provisional design artifacts fit together in this repo.

## 1. Current Mode

- Active mode: `discussion_planning`
- Meaning: the repo is in multi-LLM reading, review, and synthesis mode
- Constraint: no supervisor or auto worker implementation fan-out until the human accepts the consensus packet
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

Optional future addition:

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
2. `phase1_prd_detailed_v1.md`
3. `phase1_system_analysis_v1.md`
4. `phase1_service_contracts_v1.md`
5. `phase1_migration_plan_v1.md`
6. L2 execution-rule documents
7. OpenAPI examples, UI skeletons, generated artifacts, and local placeholders

### Design proposals before consensus

1. latest explicit user instruction
2. accepted consensus packet once it exists
3. current seed design docs

Important:

- provisional design docs must not override product truth
- extracted zip docs are now stable repo-local references and should be cited by path
- if a future system design file is added, it must be inserted explicitly rather than assumed

## 5. Stable Reference Locations

- Core specs:
  - `phase1_system_analysis_v1.md`
  - `phase1_prd_detailed_v1.md`
  - `phase1_service_contracts_v1.md`
  - `phase1_migration_plan_v1.md`
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
3. record the conflict in the review round or open questions
4. do not convert the interpretation into implementation work until the consensus packet or the human resolves it
