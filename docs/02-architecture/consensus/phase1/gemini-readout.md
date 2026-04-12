# Gemini Readout

## Metadata

- Lane: Gemini
- Model: delegated infra/runtime lane
- Date: 2026-04-11
- Files emphasized: migration plan, DB bundle README, engineering playbook

## 1. Non-Negotiables

- Phase 1 is a fleet management + dispatch compliance core; Phase 2 autonomy/Tesla/FSD/ODD stays extension-only. Sources: `phase1_system_analysis_v1.md`; `phase1_prd_detailed_v1.md`; `phase1_service_contracts_v1.md`.
- `owned` and `forwarded` are separate truth domains. Forwarded is projection/mirror-only and cannot become owned dispatch truth. Sources: `phase1_service_contracts_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`.
- Audit, notification, and webhook behavior must remain append-only, idempotent, and secret-safe. Sources: `phase1_service_contracts_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`.
- Collaboration state files are control-plane truth only and must not override product docs. Sources: `AI_COLLABORATION_GUIDE.md`; `ai-status.json`; `current-work.md`.

## 2. Source Of Truth / Ownership

- SA + PRD define shipping scope; service contracts define write ownership and commands; migration plan defines rollout order. Sources: `phase1_system_analysis_v1.md`; `phase1_prd_detailed_v1.md`; `phase1_service_contracts_v1.md`; `phase1_migration_plan_v1.md`.
- The extracted DB bundle is physical schema evidence, but where it diverges from the migration plan it should trigger reconciliation rather than ad hoc invention. Sources: `phase1_migration_plan_v1.md`; `phase1_db_migration_extracted/README.md`.
- Engineering playbook owns deterministic CI/runtime discipline, forward-only migrations, and no hidden manual release steps. Source: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`.

## 3. State Machine / Enum Constraints

- Freeze canonical enums early and treat any change as a contract change that must update docs, migrations, and tests together. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`; `phase1_service_contracts_v1.md`.
- Hard operational guards such as flight number requirements, pickup-before-start, proof-required completion, and dispatchability gates are part of rollout safety, not optional API polish. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md`.
- Complaint and notification lifecycles must remain separate from dispatch lifecycles. Sources: `phase1_service_contracts_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`.

## 4. Open Questions

- Notification, audit, and webhook delivery persistence still need a final schema decision because the migration plan and extracted bundle do not fully line up yet. Sources: `phase1_migration_plan_v1.md`; `phase1_db_migration_extracted/README.md`.
- Call-session cardinality and recording retention remain open and affect CTI rollout. Sources: `phase1_service_contracts_v1.md`; `phase1_migration_plan_v1.md`.
- Forwarded reconciliation scope, billing settlement depth, and tenant webhook retention policy still need explicit closure before production hardening. Sources: `phase1_service_contracts_v1.md`; `phase1_migration_plan_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md`.

## 5. Implementation Impact

- Sequence work by persistence and rollout risk: foundation/audit -> regulatory -> owned dispatch -> business dispatch -> callcenter/complaint -> billing -> reporting/filing -> forwarder. Source: `phase1_migration_plan_v1.md`.
- Keep PostgreSQL as source of truth and Prisma as auxiliary. CI should gate lint, typecheck, unit tests, migrations, and minimal runtime smoke before contract changes merge. Sources: `phase1_migration_plan_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`.
- UI integration should wait until the write model and migrations stabilize for the corresponding domain slice. Source: `phase1_migration_plan_v1.md`.
