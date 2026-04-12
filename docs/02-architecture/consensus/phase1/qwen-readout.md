# Qwen Readout

## Metadata

- Lane: Qwen
- Model: delegated API/integration lane
- Date: 2026-04-11
- Files emphasized: service contracts, migration plan, API examples, acceptance scenarios

## 1. Non-Negotiables

- `owned` and `forwarded` must stay separate and must not share assignment truth or dispatch endpoints. Sources: `phase1_service_contracts_v1.md` sections `3.5`, `3.7`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` sections `0.3`, `0.5.1`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.2`, `1.14`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-015` to `SC-017`.
- Phase 1 only activates `standard_taxi` and `business_dispatch`, and `business_dispatch` is limited to `credit_card_airport_transfer` and `enterprise_dispatch`. Sources: `phase1_prd_detailed_v1.md` section `4.2`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` sections `0.5.2`, `0.5.5`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.3`, `1.4`.
- Complaint, incident, notification, and audit are separate lanes; append-only traces and formal complaint cases are mandatory governance features. Sources: `phase1_service_contracts_v1.md` sections `3.6`, `3.9`, `3.10`, `3.13`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` sections `0.3`, `0.4.5`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-027`, `SC-029`, `SC-037`.
- APIs must stay command-first with idempotency and canonical success/error envelopes rather than UI-driven status patching. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` sections `3.2.3`, `3.2.4`, `3.2.6`, `3.19`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md` section `5.5`.

## 2. Source Of Truth / Ownership

- Identity, tenant/partner, regulatory, order, dispatch, forwarder, callcenter, complaint, billing, reporting, and audit ownership are explicitly split in the service contracts. Source: `phase1_service_contracts_v1.md` sections `3.1` through `3.13`.
- SQL migrations are schema truth; ORM state must follow the migration layer instead of redefining it. Sources: `phase1_db_migration_extracted/README.md` sections `設計原則`, `建議執行順序`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md` sections `5.2.5`, `5.6`.
- CTI callbacks, forwarder callbacks, webhook delivery, and signed-download/report generation need dedicated service ownership behind ports and contracts. Sources: `phase1_service_contracts_v1.md` sections `8.1` to `8.4`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` sections `3.15` to `3.17`.

## 3. State Machine / Enum Constraints

- Canonical enums are frozen for Phase 1: `order_domain`, `service_bucket`, `dispatch_semantics`, `business_dispatch_subtype`, `driver_work_state`, and `complaint_category`. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` section `0.5`; `phase1_service_contracts_v1.md`.
- Owned flows must support deterministic progression and redispatch with preserved history. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-001`, `SC-005`, `SC-006`, `SC-007`; `phase1_service_contracts_v1.md` sections `3.5`, `3.6`, `3.8`.
- Business dispatch adds reservation/preassignment and proof gates, including hard errors such as `FLIGHT_NO_REQUIRED`, `PROOF_REQUIRED`, `FIXED_PRICE_IMMUTABLE`, and `MIN_PHOTO_COUNT_NOT_MET`. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-008` to `SC-014`, `SC-021`, `SC-022`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` sections `3.3`, `3.6`, `3.9`.
- `recording_pending` is a valid compliance state for phone bookings, and `sla_breach` is a flag effect rather than a replacement lifecycle state. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-004`, `SC-029`.

## 4. Open Questions

- `call_session` to `order` cardinality is unresolved and affects CTI correlation. Source: `phase1_service_contracts_v1.md` section `10.1`.
- Airport transfer flight data is required operationally, but final canonical modeling of `flight_ref` versus subtype-only payload still needs closure. Sources: `phase1_service_contracts_v1.md` section `10.2`; `phase1_prd_detailed_v1.md` section `9.1.2`.
- Forwarded completion persistence and analytics projection boundaries are still open. Source: `phase1_service_contracts_v1.md` section `10.4`.
- Driver payout semantics and reporting artifact immutability still need product closure. Sources: `phase1_service_contracts_v1.md` sections `10.3`, `10.5`; `phase1_migration_plan_v1.md` Waves `4` and `5`.

## 5. Implementation Impact

- The safest first vertical slice is owned order + dispatch + driver-task, followed by separate adapter-backed slices for callcenter, complaint, billing, reporting, and forwarder. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`; `phase1_migration_plan_v1.md` sections `Wave 2` to `Wave 6`.
- API work should remain narrow and command-oriented: async jobs for reports, signed URLs for downloads, and no sync big-file generation or direct status mutation. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` sections `3.13`, `3.14`, `3.19`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md` section `5.5`.
- If implementation hits enum expansion, ownership drift, or a forwarded/owned boundary leak, it should route back to `discussion_planning` before widening the seam. Sources: `AI_COLLABORATION_GUIDE.md` sections `4`, `5`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` MVP regression set.
