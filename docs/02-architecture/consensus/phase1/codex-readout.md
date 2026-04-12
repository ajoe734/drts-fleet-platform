# Codex Readout

## Metadata

- Lane: Codex
- Model: GPT-5 Codex
- Date: 2026-04-10
- Files emphasized: service contracts, decision tables, acceptance scenarios

## 1. Non-Negotiables

- `owned` and `forwarded` are separate order domains and cannot share one lifecycle or one dispatch flow. This is repeated in the glossary hard rules, PRD product principles, and the API anti-pattern list. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` section `Hard Rules`; `phase1_prd_detailed_v1.md` section `2.4 Product Principles > P2`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` section `3.19 不允許的 API 行為`.
- Phase 1 has only two formal service buckets, `standard_taxi` and `business_dispatch`; `av_pilot` is preserved only as a Phase 2 extension. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` sections `Hard Rules` and `0.5.2`; `phase1_prd_detailed_v1.md` section `4.2 產品桶`.
- `business_dispatch` is restricted to `enterprise_dispatch` and `credit_card_airport_transfer` in Phase 1. Any new subtype requires human confirmation. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` section `Hard Rules`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.4 business_dispatch 子產品判斷表` and `1.19 何時需要人工確認`.
- Append-only traces are not optional. `dispatch_trace_log`, `dispatch_attempt`, complaint timelines, audit logs, and webhook delivery histories must be appended instead of overwritten. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` sections `Hard Rules`, `dispatch_attempt`, and `dispatch_trace_log`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md` sections about append-only entities.
- API semantics must stay command-oriented with idempotency, canonical success/error envelopes, and strict enum serialization. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` sections `3.2.3`, `3.2.4`, `3.2.6`, and `3.18 Enum Serialization Rules`.

## 2. Source Of Truth / Ownership

- Tenant / partner / site / call point ownership belongs to the tenant-partner lane, not to portal UIs. The current repo should treat UI surfaces as command emitters and read-model consumers. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` table around source-of-truth ownership; `phase1_service_contracts_v1.md` tenant and partner contract sections.
- Vehicle, driver, qualification, insurance, exclusivity, placard, and dispatchable readiness are owned by regulatory registry. Order or dispatch code may read eligibility but must not invent compliance truth locally. Sources: `phase1_prd_detailed_v1.md` sections `3.1.4 合規主資料` and `4.4 供給資格`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.5`, `1.6`, `1.7`.
- Order owns canonical owned-order intent and status transitions up to dispatch entry; dispatch owns matching, attempts, assignments, queueing, and redispatch; driver task owns human fulfillment commands; billing/reporting consume the resulting facts. Sources: `phase1_prd_detailed_v1.md` sections `3.1.2 訂單與派遣`, `3.1.3 履約`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` entries for `dispatch_job`, `dispatch_attempt`, `dispatch_assignment`, `trip`, `proof_bundle`.
- Forwarder owns forwarded mirror and callback semantics. Local owned assignment endpoints must never become the write path for forwarded orders. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` section `1.14 Forwarder 行為決策表`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` section `3.19 不允許的 API 行為`.
- SQL migrations are the schema authority; Prisma remains a placeholder and must not redefine the domain model. Sources: `phase1_migration_plan_v1.md` sections `3.1`, `3.2`, `5 Schema Migration 分期`; `phase1_db_migration_extracted/README.md` sections `設計原則` and `注意事項`.

## 3. State Machine / Enum Constraints

- Source classification determines `order_domain`, `service_bucket`, and `dispatch_semantics`, and that mapping is not discretionary. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.2 訂單來源分類表`, `1.3 standard_taxi vs business_dispatch 判斷表`, `1.12 派單模式決策表`.
- Minimum owned `standard_taxi` flow is: create owned order -> `ready_for_dispatch` -> dispatch job -> dispatch attempt -> dispatch assignment -> driver task accepted/departed/arrived/start/complete, with redispatch preserved historically. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-001`, `SC-005`, `SC-007`, `SC-018`, `SC-020`; `phase1_prd_detailed_v1.md` sections under owned order / dispatch.
- `business_dispatch` uses `reservation` semantics, enters preassignment/reservation flow, and loads proof requirements from contract rules. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-008`, `SC-010`, `SC-013`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.9` and `1.10`.
- Driver lifecycle has hard guards: reject requires reason, `start` before `arrived_pickup` must fail, fixed-price trips cannot alter fare, and proof requirements are contract-driven. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-019`, `SC-020`, `SC-021`, `SC-022`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` sections `3.9 Driver Task Examples` and error code registry.
- Regulatory eligibility must gate dispatch: vehicle dispatchable flag, exclusivity approval, insurance validity, and driver license validity all affect assignment eligibility. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` sections `1.5`, `1.6`, `1.7`; `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md` scenarios `SC-023`, `SC-024`.

## 4. Open Questions

- Whether passenger app launch is same-wave as owned order cutover remains explicitly unresolved in the migration plan. Source: `phase1_migration_plan_v1.md` section `14. 待決議項`.
- The migration plan and DB bundle imply notification / webhook / artifact persistence, but the exact long-term table ownership and read-model split still need to be reconciled with the current in-memory bootstrap code before production persistence work proceeds. Sources: `phase1_migration_plan_v1.md` sections `Wave 0`, `Wave 5`, `5 Schema Migration 分期`; `phase1_db_migration_extracted/README.md`.
- Call-session cardinality and recording ingestion details exist conceptually, but the repo still needs a single canonical write path for CTI callbacks versus manual call-center order creation. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` section `3.16 CTI Callback Contract`; `phase1_migration_plan_v1.md` section `6.4 CTI bootstrap`.

## 5. Implementation Impact

- Execution should continue as a modular monolith inside `apps/api`, but slicing must follow source-of-truth boundaries instead of UI pages: foundation -> regulatory -> owned order/dispatch -> callcenter/complaint -> billing -> reporting -> forwarder. Sources: `phase1_migration_plan_v1.md` sections `4 發版波次` and `11 Launch 波次建議`.
- The next safe backend slices after the current bootstrap are persistence-backed regulatory and owned order/dispatch packs, then CTI/callcenter/complaint. That aligns better with the migration packs than jumping to tenant portal polish. Sources: `phase1_migration_plan_v1.md` sections `5.2 Migration pack B`, `5.3 Migration pack C`, `5.4 Migration pack D`.
- Supervisor execution must preserve a return path into discussion mode whenever a slice proposes new enums, new service buckets, cross-domain write ownership changes, or forwarded/owned flow mixing. Sources: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md` section `1.19 何時需要人工確認`; `AI_COLLABORATION_GUIDE.md`; `MULTI_LLM_CONSENSUS_WORKFLOW.md`.
