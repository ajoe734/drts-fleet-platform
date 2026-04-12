# Copilot Readout

## Metadata

- Lane: Copilot
- Model: delegated critique lane
- Date: 2026-04-11
- Files emphasized: PRD, SA, open questions, roadmap

## 1. Non-Negotiables

- Phase 1 is not an AV runtime and must stand alone operationally. Phase 2 autonomy work must not rewrite Phase 1. Sources: `phase1_system_analysis_v1.md`; `phase1_prd_detailed_v1.md`; `phase1_service_contracts_v1.md`.
- `owned`/`forwarded` separation, fixed product buckets, append-only governance logs, and process-vs-product truth separation are convergent hard rules across the canonical docs. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`; `phase1_service_contracts_v1.md`; `AI_COLLABORATION_GUIDE.md`.

## 2. Source Of Truth / Ownership

- Product scope lives in SA + PRD; commands, queries, events, and ownership live in service contracts; migration plan controls persistence order and rollout. Sources: `phase1_system_analysis_v1.md`; `phase1_prd_detailed_v1.md`; `phase1_service_contracts_v1.md`; `phase1_migration_plan_v1.md`.
- Decision tables and glossary freeze vocabulary and decision logic; acceptance scenarios are the minimum regression truth. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`.

## 3. State Machine / Enum Constraints

- Canonical enums are closed in Phase 1 and lifecycle assertions must be deterministic enough for Gherkin coverage. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`.
- Implicit auto-advance, reversible state rewrites, or hidden side effects conflict with the contract-first model. Source: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md`.

## 4. Open Questions

- Collaboration docs and runtime state need a single truth for which supervisor mode is active. Sources: `AI_COLLABORATION_GUIDE.md`; `ai-status.json`; `current-work.md`.
- Notification/audit persistence gaps, call-session cardinality, subtype extension path, and tenant/platform write authority around SLA/webhooks need explicit resolution. Sources: `phase1_migration_plan_v1.md`; `phase1_service_contracts_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md`.

## 5. Implementation Impact

- Contract layer and migration truth must land before broader UI work; otherwise roadmap drift becomes likely. Sources: `phase1_migration_plan_v1.md`; `phase1_db_migration_extracted/README.md`.
- Use the MVP regression set as the execution gate and route ambiguity back into discussion rather than letting the roadmap silently expand. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`; `AI_COLLABORATION_GUIDE.md`; `current-work.md`.
