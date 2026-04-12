# Claude Readout

## Metadata

- Lane: Claude
- Model: delegated governance-review lane
- Date: 2026-04-11
- Files emphasized: PRD, SA, local seed design docs

## 1. Non-Negotiables

- Phase 1 must be shippable, operable, and auditable on its own; Phase 2 is overlay only. Sources: `phase1_system_analysis_v1.md` section `3.3`; `phase1_prd_detailed_v1.md` section `2.4 > P5`.
- `owned` and `forwarded` are separate order domains with separate lifecycle, settlement, and API semantics. Sources: `phase1_prd_detailed_v1.md` section `P2`; `phase1_service_contracts_v1.md` sections `3.5`, `3.7`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` sections `0.3`, `0.8`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.2`, `1.14`.
- Only `standard_taxi` and `business_dispatch` are active Phase 1 buckets, with only two business dispatch subtypes. Sources: `phase1_system_analysis_v1.md` sections `4.2`, `4.4`; `phase1_prd_detailed_v1.md` sections `4.2`, `18`.
- Audit and dispatch trace stay append-only, and sensitive governance actions must always be auditable. Sources: `phase1_system_analysis_v1.md` section `11.3`; `phase1_service_contracts_v1.md` section `3.13`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` sections `0.3`, `0.6`.
- Any new enum, lifecycle, ownership boundary, billing model, retention policy, or forwarded/owned seam change must return to discussion. Sources: `AI_COLLABORATION_GUIDE.md` sections `2`, `5`; `ai-status.json` `mode_transition_rules`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` sections `0.9`, `0.10`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` section `1.19`.

## 2. Source Of Truth / Ownership

- Conflict precedence is user latest instruction -> PRD -> SA -> service contracts -> migration/execution docs. Sources: `AI_COLLABORATION_GUIDE.md` section `2`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` section `0.2`.
- Service ownership is explicit enough to govern execution slicing: tenant/partner, regulatory, order, dispatch, forwarder, callcenter, complaint, billing, reporting, audit. Source: `phase1_service_contracts_v1.md` sections `2.5`, `3.2` to `3.13`.
- Field-level authority is also explicit enough to prevent silent cross-domain writes. Source: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` section `0.6`.
- Execution waves are part of governance, not just scheduling preference. Source: `phase1_migration_plan_v1.md` section `4 發版波次`.

## 3. State Machine / Enum Constraints

- Canonical enums must remain in `snake_case` and travel consistently across APIs, webhooks, CSV, and reports. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` section `0.5`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` section `3.18`.
- Complaint, dispatch, driver, and forwarded states are independent lifecycles; flags such as `SLA_BREACH` or `recording_pending` must not overwrite the main lifecycle state. Sources: `phase1_prd_detailed_v1.md`; `phase1_service_contracts_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-004`, `SC-029`.
- Supply eligibility is a hard execution gate, not a UI hint. Sources: `phase1_system_analysis_v1.md` section `4.3`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.5`, `1.6`, `1.7`; acceptance scenarios `SC-023`, `SC-024`, `SC-025`.

## 4. Open Questions

- Collaboration-state mismatch across `AI_COLLABORATION_GUIDE.md`, `ai-status.json`, and `current-work.md` must be corrected so workers see one control-plane truth.
- `phase1_system_design_v1.md` is referenced in precedence logic but is not present in the canonical packet; service-boundary disputes therefore need explicit escalation instead of silent assumption.
- Forwarder GA timing, CTI provider retention capability, and DB-bundle-vs-contract drift remain governance-level open questions. Sources: `phase1_migration_plan_v1.md` sections `Wave 6`, `14`; `phase1_db_migration_extracted/README.md` `注意事項`.

## 5. Implementation Impact

- Execution should follow the rollout waves strictly: foundation -> regulatory -> owned order/dispatch -> callcenter/complaint -> billing -> reporting/filing -> forwarder. Sources: `phase1_migration_plan_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/README.md`.
- All workers should remain command-first, contract-first, and regression-gated against the MVP scenarios. Sources: `phase1_service_contracts_v1.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`.
- Claude governance review in execution mode should explicitly bounce tasks back to discussion when semantic drift appears, not merely leave review comments.
