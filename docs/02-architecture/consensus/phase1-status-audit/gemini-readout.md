# Gemini Status Audit Readout

## non-negotiables

- `phase1_service_contracts_v1.md:83-94`, `phase1_migration_plan_v1.md:34-76`, `phase1_db_migration_extracted/README.md:1-15`, and `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md:45-51,175-193` all require PostgreSQL SQL migration files as schema truth, forward-only migration discipline, replayable seeds, S3-compatible object storage, Redis, and append-only tables. The repo is still operating with in-memory service state and no adopted migration set under `infra/migrations/`.
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md:13-77` and `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md:132-164` require snake_case JSON over the wire, signed download URLs, HMAC webhooks, and async jobs. Current API handlers return camelCase TS objects directly, and report / filing completion still runs synchronously inside request handlers.
- `phase1_migration_plan_v1.md:68-76` explicitly isolates CTI/recording, Forwarder, Billing, Reporting/filing, and Audit/notification as high-risk cutover domains. Those domains are implemented only as bootstrap runtime slices, not as durable rollout-ready services.
- `infra/migrations/README.md:1-11` and `infra/seeds/README.md:1-9` are landing-zone placeholders only. They confirm the intended path, but the repo has not yet converged the extracted migration bundle into the canonical execution location.

## source of truth / ownership

- `phase1_service_contracts_v1.md:83-94` assigns source of truth to domain services and external authoritative state. In the current code, that ownership still lives in process-local arrays and maps: `RegulatoryRegistryService` keeps `vehicles`, `drivers`, and `supplyPairs` in memory; `OwnedMobilityService` keeps `orders`, `dispatchJobs`, `dispatchAttempts`, `dispatchAssignments`, `driverTasks`, and `dispatchTraceLogs` in memory; `CallcenterService` keeps `callSessions`; `ComplaintService` keeps `complaintCases` and `complaintTimelines`; `BillingSettlementService` keeps `tenantInvoices`, `driverFeePlans`, `driverStatements`, and `reimbursementBatches`; `ReportingFilingService` keeps `reportJobs` and `filingPackages`; `ForwarderService` keeps `forwardedOrders` and `adapterHealth`; `TenantPartnerService` keeps `webhookEndpoints`, `webhookDeliveries`, and `slaProfile`; `AuditNotificationService` keeps `notifications` and `auditLogs`.
- `phase1_migration_plan_v1.md:82-103` says Wave 0 should establish the real base plumbing, including object storage, event bus, and auth middleware. The current repo only has landing-zone READMEs for infra, so the persistence and rollout ownership is still advisory rather than executed.
- `apps/api/README.md:5-44` still describes the API as bootstrap scope, while the runtime already contains Waves 1-6 in-memory. That is a documentation drift symptom: the codebase has more functional surface than the operational landing zones acknowledge, but none of it is persisted.

## state machine / enum constraints

- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md` (sections `0.4` and `0.5`) and `01_decision_tables.md:1.2-1.16` freeze `order_domain`, `service_bucket`, `dispatch_semantics`, and the business dispatch subtypes. The current services mostly respect those enums, but they still expose them via camelCase wire objects such as `serviceBucket`, `businessDispatchSubtype`, and `dispatchSemantics` instead of the mandated snake_case JSON shape.
- `05_engineering_conventions_and_ai_dev_playbook.md:134-138` says TypeScript keys may be camelCase internally, but JSON over the wire must be snake_case. The current API paths in `OwnedMobilityService`, `CallcenterService`, `ComplaintService`, `BillingSettlementService`, `ReportingFilingService`, and `ForwarderService` all return camelCase payload fields directly, so the wire contract is not aligned.
- `IdentityController` still returns `authMode: "bootstrap_placeholder"` and a static `supportedExecutionModes` array at `apps/api/src/modules/identity/identity.controller.ts:9-21`. That is a bootstrap flag, not the real auth/session/RBAC state machine required by `phase1_service_contracts_v1.md:100-134`.
- `ReportingFilingService` drives `ReportJob` and `FilingPackage` from `queued -> running -> completed` inside the same request path at `reporting-filing.service.ts:83-177,185-299`. That contradicts `05_engineering_conventions_and_ai_dev_playbook.md:155-164`, which requires job/export/report flows to be async.
- `ForwarderService` models `received -> broadcasted -> accept_pending -> confirmed_by_platform / lost_race / cancelled_by_platform`, which matches the intended lifecycle, but the authoritative state still stays in a local mirror object and is not reconciled against a durable projection or external platform truth.

## open questions

- Should Wave 7 convert the current service classes into repository-backed modules, or should we split them into domain services plus adapter/repository layers before touching persistence?
- Should the public wire format switch to snake_case globally now, or should we introduce boundary mappers while keeping camelCase internally?
- Should report jobs and filing packages move to a queue-backed worker before client integration, or can the synchronous bootstrap behavior remain until the infra wave lands?
- Where should webhook retry, retention, and signed artifact lifecycle live: PostgreSQL only, PostgreSQL plus Redis delay queues, or a separate worker service?
- Should `identity.context` remain a bootstrap placeholder until the auth wave, or do we need to pull auth/RBAC forward because rollout readiness is otherwise blocked?

## implementation impact

- Adopt the extracted migration bundle into `/infra/migrations/` as versioned SQL, and add the corresponding seed/bootstrap scripts so schema truth is no longer only referenced from the extracted bundle.
- Replace the in-memory arrays and maps in `RegulatoryRegistryService`, `OwnedMobilityService`, `CallcenterService`, `ComplaintService`, `BillingSettlementService`, `ReportingFilingService`, `ForwarderService`, `TenantPartnerService`, and `AuditNotificationService` with durable repositories and append-only storage.
- Add real webhook delivery persistence, retry policy, and retention, instead of the current in-memory `webhookDeliveries` list and one-shot HMAC test delivery flow.
- Replace hardcoded or pseudo-signed artifact URLs such as `download.example.com` and `downloads.drts.local` with object-storage-backed signed downloads and retention metadata.
- Add auth middleware / RBAC / realm enforcement before rollout, because `identity` is still scaffolded and the current state machine is not yet production-grade.
- Expand CI and rollout checks to include migration verification, async job execution, signed artifact validation, and wire-contract conformance so the `W7/W8` backlog becomes executable rather than only documented.
