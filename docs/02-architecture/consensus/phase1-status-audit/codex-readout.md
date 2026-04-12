# Codex Status Audit Readout

Status: complete

## non-negotiables

- SQL migration files remain the schema authority for Phase 1. `phase1_service_contracts_v1.md` assigns persisted domain truth to service-owned records, `phase1_migration_plan_v1.md` defines expand/backfill/switch/contract rollout, and `phase1_db_migration_extracted/README.md` provides the concrete forward-only migration pack. The current repo still keeps `infra/migrations/` and `infra/seeds/` as landing zones only, so schema authority has not yet been adopted into the repo execution path.
- `owned` and `forwarded` stay separated, and `business_dispatch` must remain booking-backed. The order and dispatch contracts in `phase1_service_contracts_v1.md` freeze that boundary, and the current code mostly respects it. That is aligned and must not be loosened during later hardening work.
- Canonical wire JSON must be `snake_case`, while TypeScript internals may remain `camelCase`. The current API layer still leaks internal key names over the wire, which means the repo is not yet contract-conformant even where business behavior is otherwise correct.
- Phase 1 scope is broader than the current runtime baseline. Service contracts still require queue/rank, order cancellation, reservation scheduler flows, tenant passenger/address book/API key responsibilities, driver shift/attendance read models, and regulatory/admin master data that are not fully implemented today.

## source of truth / ownership

- Order truth is still overly collapsed into `OwnedMobilityService`. The service contracts split owned order truth, dispatch truth, and driver-task truth into distinct responsibilities. In the current repo, one in-memory service still holds order, dispatch job, assignment, and driver task state together, which is fine for bootstrap execution but not aligned with the target ownership model.
- Tenant and partner ownership is only partially realized. `phase1_service_contracts_v1.md` gives this lane ownership of passenger directory, address book, tenant users/roles, API keys, webhook endpoint metadata, and billing profile. The current `tenant-partner` slice exposes notifications, SLA, webhook basics, and audit listing, but does not yet implement passenger/address book/API key/tenant role operations as real source-of-truth surfaces.
- Regulatory ownership is also partial. The contracts assign vehicle, driver, contract, insurance, exclusivity, placard, and brand profile truth to the regulatory registry. Current code exposes vehicle and driver summaries plus compliance checks, but it does not yet implement the wider contract/insurance/exclusivity/public-info versioning set as adopted runtime truth.
- Reporting, filing, billing, complaints, and forwarder all exist as baseline slices, but each remains process-local rather than repository-backed. This means the repo has semantic scaffolding for the domains, but not yet the durable ownership model that the canonical docs require.

## state machine / enum constraints

- Enum coverage is mostly aligned. `packages/contracts/src/index.ts` already contains canonical values for `order_domain`, `service_bucket`, `dispatch_semantics`, `business_dispatch_subtype`, and `driver_work_state`, and the repo continues to preserve `owned` / `forwarded` separation in behavior.
- State-machine coverage is only partial. The current runtime covers create, dispatch, assign, accept/reject, depart, arrive, start, complete, complaint reopen rules, billing issue, report generation, and forwarder mirror states. But the service contracts still define additional commands and states that are not surfaced yet, including `cancel_owned_order`, `booking.updated`, `order.cancelled`, `create_reservation_hold`, `release_reservation_hold`, `queue_check_in`, `queue_check_out`, `clock_in`, `clock_out`, `request_driver_payout`, and tenant passenger/address lifecycle events.
- The report and filing job lifecycle is structurally present but not deployment-accurate. The services model `queued -> running -> completed`, yet they complete in the same request path instead of a durable async job boundary. That is a mismatch against the execution rules even though the enum names themselves align.
- There is still no visible API-boundary serializer that transforms internal camelCase records into canonical snake_case JSON. That is the cleanest single cross-domain contract gap surfaced by the audit.

## open questions

- Should we treat missing Passenger App / Web implementation as official repo backlog, or as an intentional repo-surface omission because the latest explicit user scope listed tenant portal, platform admin, ops console, driver app, and API but not a passenger app? This is a real precedence question, not just an implementation detail.
- Should the missing `phase1_system_design_v1.md` be reconstructed into the repo as a canonical artifact, or should SA + PRD + service contracts remain the working source until a system design file is supplied?
- For Wave 7 persistence, do we keep the current modular-monolith Nest boundaries and add repositories underneath, or do we first split domain service ownership more explicitly before adopting migrations?

## implementation impact

- The official backlog cannot stop at W7 persistence/auth/runtime hardening and W8 client rollout. The audit shows additional target-state gaps that are not represented in the current task board.
- At minimum, the task board needs new official tasks for:
  - wire-contract normalization and async job boundary conformance
  - dispatch and booking domain completion for reservation/queue/cancel flows
  - tenant/regulatory/admin source-of-truth completion for passenger, address book, API key, role, contract, insurance, and placard/public-info responsibilities
  - ops/driver domain completion for incident, maintenance, shift/attendance, and driver read-model surfaces
- Passenger App / Web should remain `human_required` until the scope conflict is resolved. Everything else above is already inside the canonical Phase 1 documents and should be treated as official remaining work.
