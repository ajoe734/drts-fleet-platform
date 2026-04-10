# Canonical Document Map

This file defines how collaboration state, local architecture, and Phase 1 product truth fit together in this repo.

## 1. Current Mode

- Active mode: `architect_bootstrap`
- Meaning: Codex may directly build canonical architecture and planning artifacts.
- Constraint: development task fan-out through supervisor and auto workers starts only after a human approves the work breakdown.

## 2. Precedence By Scope

### Collaboration and execution state

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
5. `phase1_openapi_v1.yaml`
6. `phase1_db_migration_extracted/*`
7. UI skeletons and bootstrap placeholders

### Local implementation shape and delivery planning

1. latest explicit user instruction
2. `TARGET_ARCHITECTURE.md`
3. `ROADMAP.md`
4. `DEVELOPMENT_WORKBREAKDOWN.md`
5. `PHASE1_DECISION_LEDGER.md`
6. `PHASE1_OPEN_QUESTIONS.md`

Important:

- local architecture and planning docs must not override PRD semantics
- extracted LLM dev pack docs add execution constraints, but they do not outrank PRD or SA
- there is no `phase1_system_design_v1.md` in the repo right now, so service boundaries come from service contracts plus migration plan until an SD is added

## 3. Canonical Read Paths

### Architecture bootstrap

1. `AI_COLLABORATION_GUIDE.md`
2. `CANONICAL_DOCUMENT_MAP.md`
3. `TARGET_ARCHITECTURE.md`
4. `ROADMAP.md`
5. `DEVELOPMENT_WORKBREAKDOWN.md`
6. `phase1_prd_detailed_v1.md`
7. `phase1_service_contracts_v1.md`
8. `phase1_system_analysis_v1.md`
9. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`
10. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`

### Implementation slice after consensus

1. `AI_COLLABORATION_GUIDE.md`
2. `current-work.md`
3. `ai-status.json`
4. `TARGET_ARCHITECTURE.md`
5. the specific work item in `DEVELOPMENT_WORKBREAKDOWN.md`
6. the relevant Phase 1 spec sections
7. the matching acceptance, API, and migration reference documents

## 4. Stable Reference Locations

- Core specs:
  - `phase1_system_analysis_v1.md`
  - `phase1_prd_detailed_v1.md`
  - `phase1_service_contracts_v1.md`
  - `phase1_migration_plan_v1.md`
  - `phase1_openapi_v1.yaml`
- Extracted LLM execution pack:
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/`
- Extracted DB bundle:
  - `phase1_db_migration_extracted/`

## 5. Working Rule

When two documents conflict, do not average them mentally. Pick the higher-precedence source for that scope, record the decision in `PHASE1_DECISION_LEDGER.md`, and move any unresolved product choice into `PHASE1_OPEN_QUESTIONS.md`.
