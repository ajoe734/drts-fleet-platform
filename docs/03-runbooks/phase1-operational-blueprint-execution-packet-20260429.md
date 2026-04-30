# Phase 1 Operational Blueprint Execution Packet — 2026-04-29

Status: ready for supervisor-managed execution dispatch  
Owner: Supervisor  
Scope: `drts-fleet-platform` plus `tenant-commute-hub`

## 1. Purpose

This packet materializes the execution tasks implied by:

- `phase1_system_analysis_v1.md`
- `docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md`
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`

The goal is to convert the newly codified operational SA/SD truth into a
single execution-ready packet with:

- task IDs
- objectives
- write scopes
- dependencies
- acceptance criteria
- verification anchors

This packet does **not** reopen:

- first-party Passenger App / Web
- passenger receipt UI
- retired `apps/tenant-portal-web` as a production target
- AV / ODD / Tesla / ROC future-gated families

## 2. Guardrails

- Keep `drts-fleet-platform` as business authority and `tenant-commute-hub` as
  frontend consumer.
- Do not create a second backend authority in `tenant-commute-hub`.
- Do not move tenant, driver, partner, adapter, or webhook paths behind the
  internal control-plane IAP boundary by default.
- Prefer extending existing domain modules over creating duplicate pseudo-domains.
- Every task must name its source of truth, owner surface, and verification path.
- External-gated work may be materialized, but it must stay explicitly marked
  as external-gated rather than presented as repo-only closure.

## 3. Dispatch Families

Task families:

- `OPX-ID-*` — identity and auth
- `OPX-MD-*` — master data and onboarding
- `OPX-IN-*` — intake and partner / platform integration
- `OPX-DP-*` — dispatch and operational workflow
- `OPX-CM-*` — compliance, finance, reporting
- `OPX-GV-*` — governance, observability, NFR, documentation

## 4. Execution Summary Table

| Task ID      | Family      | Objective                                                                 | Repo                                                                                           | Status         | Depends On                                  |
| ------------ | ----------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------- |
| `OPX-ID-001` | Identity    | Driver device-bound auth and provisioning flow                            | `drts-fleet-platform`                                                                          | ready          | —                                           |
| `OPX-ID-002` | Identity    | Plane-separation auth matrix and contract hardening                       | `drts-fleet-platform`                                                                          | ready          | —                                           |
| `OPX-ID-003` | Identity    | Data classification, masking, and secret-governance enforcement           | `drts-fleet-platform`                                                                          | ready          | `OPX-ID-002`                                |
| `OPX-MD-001` | Master Data | Driver master lifecycle and admin onboarding surface                      | `drts-fleet-platform`                                                                          | ready          | `OPX-ID-001`                                |
| `OPX-MD-002` | Master Data | Supply registry lifecycle for vehicles, contracts, insurance, exclusivity | `drts-fleet-platform`                                                                          | ready          | —                                           |
| `OPX-MD-003` | Master Data | Tenant onboarding, bootstrap defaults, and rollout gates                  | `drts-fleet-platform`, `tenant-commute-hub`                                                    | ready          | —                                           |
| `OPX-MD-004` | Master Data | Passenger and address governance model                                    | `drts-fleet-platform`, `tenant-commute-hub`                                                    | ready          | `OPX-MD-003`                                |
| `OPX-IN-001` | Intake      | Partner / bank program onboarding console and lifecycle                   | `drts-fleet-platform`                                                                          | ready          | `P1PX-BE-001`, `P1PX-BE-002`, `P1PX-FE-001` |
| `OPX-IN-002` | Intake      | Issuer / bank eligibility real integration contract                       | `drts-fleet-platform`                                                                          | external-gated | `OPX-IN-001`                                |
| `OPX-IN-003` | Intake      | Tenant API / webhook integration governance package                       | `drts-fleet-platform`, `tenant-commute-hub`                                                    | ready          | `OPX-MD-003`                                |
| `OPX-IN-004` | Intake      | Third-party / forwarder operating model hardening                         | `drts-fleet-platform`, `apps/driver-app`                                                       | ready          | —                                           |
| `OPX-IN-005` | Intake      | Call-center booking workspace and phone-order UX closure                  | `drts-fleet-platform`                                                                          | ready          | `OPX-DP-001`                                |
| `OPX-DP-001` | Dispatch    | Queue-entry policy and reservation vs realtime orchestration              | `drts-fleet-platform`                                                                          | ready          | —                                           |
| `OPX-DP-002` | Dispatch    | Dispatch / reassign / redispatch operation model and audit semantics      | `drts-fleet-platform`, `apps/ops-console-web`                                                  | ready          | `OPX-DP-001`                                |
| `OPX-DP-003` | Dispatch    | Exception-hold and manual override control flow                           | `drts-fleet-platform`, `apps/ops-console-web`                                                  | ready          | `OPX-DP-002`, `OPX-CM-001`                  |
| `OPX-DP-004` | Dispatch    | Dispatch map board and spatial operations uplift                          | `apps/ops-console-web`, `tenant-commute-hub`                                                   | ready          | `OPX-DP-001`, `OPX-GV-002`                  |
| `OPX-DP-005` | Dispatch    | Driver task / location event runtime externalization and SLA              | `drts-fleet-platform`, `apps/driver-app`                                                       | ready          | `EMC-H2-001`                                |
| `OPX-CM-001` | Compliance  | Recording, proof, and eligibility gate matrix implementation              | `drts-fleet-platform`, `apps/driver-app`, `apps/ops-console-web`                               | ready          | `OPX-IN-002`                                |
| `OPX-CM-002` | Compliance  | Complaint / incident / escalation taxonomy and workflow closure           | `drts-fleet-platform`, `apps/ops-console-web`                                                  | ready          | `OPX-IN-005`                                |
| `OPX-CM-003` | Compliance  | Pricing authority and manual fare override governance                     | `drts-fleet-platform`, `tenant-commute-hub`, `apps/platform-admin-web`                         | ready          | `OPX-MD-003`                                |
| `OPX-CM-004` | Compliance  | Channel-aware settlement and reconciliation matrix materialization        | `drts-fleet-platform`, `apps/platform-admin-web`, `apps/ops-console-web`, `tenant-commute-hub` | ready          | `MSC-F1-001`, `P1PX-BE-003`                 |
| `OPX-CM-005` | Compliance  | Retention, archival, and evidentiary-access policy enforcement            | `drts-fleet-platform`                                                                          | ready          | `OPX-ID-003`                                |
| `OPX-GV-001` | Governance  | Cross-repo authority-drift guardrail and contract lifecycle               | `drts-fleet-platform`, `tenant-commute-hub`                                                    | ready          | —                                           |
| `OPX-GV-002` | Governance  | Workflow-based acceptance matrix and release gates                        | `drts-fleet-platform`, `tenant-commute-hub`                                                    | ready          | all prior functional tasks                  |
| `OPX-GV-003` | Governance  | Observability, alerts, and role-based operational dashboards              | `drts-fleet-platform`, `apps/ops-console-web`, `apps/platform-admin-web`                       | ready          | `OPX-DP-005`, `OPX-CM-001`                  |
| `OPX-GV-004` | Governance  | Non-functional workload, SLA, and degradation model                       | `drts-fleet-platform`                                                                          | ready          | `OPX-GV-003`                                |
| `OPX-GV-005` | Governance  | Operational glossary and multilingual copy consistency                    | `drts-fleet-platform`, `tenant-commute-hub`, `apps/*`                                          | ready          | `OPX-MD-003`, `OPX-DP-004`                  |
| `OPX-GV-006` | Governance  | Decision-to-backlog and code-to-doc sync automation                       | `drts-fleet-platform`                                                                          | ready          | —                                           |

## 5. Detailed Task Definitions

## `OPX-ID-001` — Driver Device-Bound Auth And Provisioning Flow

### Objective

Replace env-var-only driver identity posture with a backend-governed
device-registration, token-issuance, and token-refresh flow.

### Write Scope

- `apps/driver-app/app/onboarding.tsx`
- `apps/driver-app/lib/api-client.ts`
- `apps/api/src/modules/auth/`
- `apps/api/src/modules/driver-profile/`
- `packages/contracts/src/index.ts`
- `docs/03-runbooks/driver-app-native-dev-runbook.md`

### Acceptance

- A device can register and receive a driver-bound token without relying on
  `EXPO_PUBLIC_DRIVER_ID`.
- A revoked or unbound device cannot access driver APIs.
- Development env-var provisioning remains available only as an explicit dev path.

### Verification

- driver-app onboarding / jobs / trip smoke
- auth and driver-profile unit coverage

## `OPX-ID-002` — Plane-Separation Auth Matrix And Contract Hardening

### Objective

Make internal control-plane auth and external tenant / partner / driver auth
rules explicit in contracts, headers, middleware, and runbooks.

### Write Scope

- `apps/api/src/common/auth/`
- `apps/api/src/modules/auth/`
- `docs/01-decisions/`
- `docs/03-runbooks/`

### Acceptance

- Each realm has one documented primary auth path.
- No production flow depends on ambiguous bootstrap-header trust.
- Tenant / partner / driver routes remain off the default IAP path.

### Verification

- API typecheck
- auth unit tests
- runbook cross-check against current decisions

## `OPX-ID-003` — Data Classification, Masking, And Secret Governance

### Objective

Materialize a single policy and enforcement path for PII, recordings, partner
references, API keys, webhook secrets, and download artifacts.

### Write Scope

- `apps/api/src/common/`
- `apps/api/src/modules/reporting-filing/`
- `apps/api/src/modules/tenant-partner/`
- `apps/api/src/modules/driver-profile/`
- `docs/02-architecture/`

### Acceptance

- Sensitive fields have documented mask / export / retention / access rules.
- Secrets are only shown plaintext on first issuance where intended.
- Signed-download rules and audit hooks are consistent.

### Verification

- unit coverage around issuance / masking paths
- document and contract review

## `OPX-MD-001` — Driver Master Lifecycle And Admin Onboarding Surface

### Objective

Create the canonical platform-side flow for creating, activating, suspending,
and retiring driver records, including their relation to eligibility and device
binding.

### Write Scope

- `apps/api/src/modules/driver-profile/`
- `apps/api/src/modules/regulatory-registry/`
- `apps/platform-admin-web/app/`
- `packages/contracts/src/index.ts`

### Acceptance

- Platform admin can create a driver master record and transition it through
  lifecycle states.
- Dispatch eligibility reflects driver state changes.
- Driver profile, registry eligibility, and device-binding links are auditable.

### Verification

- driver / registry unit tests
- platform-admin typecheck

## `OPX-MD-002` — Supply Registry Lifecycle

### Objective

Turn vehicles, contracts, insurance, and exclusivity into explicit lifecycle
objects with expiry handling and dispatch impact rules.

### Write Scope

- `apps/api/src/modules/regulatory-registry/`
- `apps/platform-admin-web/app/fleet/`
- `apps/ops-console-web/app/vehicles/`
- `packages/contracts/src/index.ts`

### Acceptance

- Expired insurance or revoked exclusivity materially affects dispatchability.
- Contract and policy lifecycles are visible to admins and operators.
- Supply invalidation emits traceable changes.

### Verification

- regulatory-registry tests
- platform-admin / ops-console typecheck

## `OPX-MD-003` — Tenant Onboarding, Bootstrap Defaults, And Rollout Gates

### Objective

Materialize a standard lifecycle for onboarding a new tenant from creation
through sandbox, pilot, and production.

### Write Scope

- `apps/platform-admin-web/app/tenants/`
- `apps/api/src/modules/platform-admin/`
- `apps/api/src/modules/tenant-partner/`
- `tenant-commute-hub/src/`
- `docs/03-runbooks/`

### Acceptance

- A new tenant can be provisioned with default roles, billing baseline, and
  optional integration package.
- Tenant rollout state is explicit.
- Cutover and rollback steps are documented.

### Verification

- tenant user / billing / notification tests
- platform-admin and tenant-hub typecheck

## `OPX-MD-004` — Passenger And Address Governance Model

### Objective

Formalize passenger and address records as governed tenant master data rather
than simple booking helpers.

### Write Scope

- `apps/api/src/modules/tenant-partner/`
- `tenant-commute-hub/src/pages/PassengerManagement.tsx`
- `tenant-commute-hub/src/pages/AddressManagement.tsx`
- `packages/contracts/src/index.ts`

### Acceptance

- Passenger and address records support quality and governance rules.
- Sensitive address display and export behavior is consistent.
- Partner / tenant booking flows consume the same master data truth.

### Verification

- tenant-partner unit tests
- tenant-hub typecheck

## `OPX-IN-001` — Partner / Bank Program Onboarding Console And Lifecycle

### Objective

Turn partner program and entry creation into a formal platform-managed flow.

### Write Scope

- `apps/api/src/modules/tenant-partner/`
- `apps/platform-admin-web/app/`
- `packages/contracts/src/index.ts`
- `docs/02-architecture/`

### Acceptance

- Admin can create partner, program, and entry records without seed edits.
- Auth mode, eligibility mode, branding, and support metadata are configurable.
- Entry changes are audited and promotion-ready.

### Verification

- tenant-partner tests
- platform-admin typecheck

## `OPX-IN-002` — Issuer / Bank Eligibility Real Integration Contract

### Objective

Replace demo-only partner eligibility rules with a real externalized issuer
integration contract and fallback model.

### Status

`external-gated`

### Write Scope

- `apps/api/src/modules/tenant-partner/`
- `packages/contracts/src/index.ts`
- `docs/02-architecture/`

### Acceptance

- A formal adapter contract exists for issuer / bank verification.
- Timeouts, retries, fallback review, and audit behavior are defined.
- Sensitive tokens and references are handled under the new governance policy.

### Verification

- contract review
- external sandbox evidence when available

## `OPX-IN-003` — Tenant API / Webhook Integration Governance Package

### Objective

Productize tenant integration onboarding around API keys, webhook reliability,
notifications, and developer-facing operating rules.

### Write Scope

- `apps/api/src/modules/tenant-partner/`
- `tenant-commute-hub/src/pages/ApiKeyManagement.tsx`
- `tenant-commute-hub/src/pages/WebhookManagement.tsx`
- `tenant-commute-hub/src/pages/NotificationSettings.tsx`
- `docs/03-runbooks/`

### Acceptance

- API key scopes, rotation cadence, and revoke semantics are documented and enforced.
- Webhook retry / disable / test behavior is explicit.
- Tenant integration onboarding has a repeatable handoff packet.

### Verification

- tenant-partner tests
- tenant-hub typecheck

## `OPX-IN-004` — Third-Party / Forwarder Operating Model Hardening

### Objective

Materialize the lifecycle, error model, and reconciliation behavior for
forwarded orders and external platform integrations.

### Write Scope

- `apps/api/src/modules/forwarder/`
- `apps/api/src/modules/owned-mobility/`
- `apps/driver-app/app/jobs.tsx`
- `packages/contracts/src/index.ts`
- `docs/02-architecture/`

### Acceptance

- Forwarded orders are source-aware across dispatch, tasks, and finance.
- Adapter failure semantics and manual fallback are explicit.
- Driver UI clearly differentiates source-owned constraints.

### Verification

- forwarder tests
- driver-app typecheck

## `OPX-IN-005` — Call-Center Booking Workspace And Phone-Order UX Closure

### Objective

Close the gap between backend phone-order support and operator-side call-taker
workflow.

### Write Scope

- `apps/api/src/modules/callcenter/`
- `apps/api/src/modules/owned-mobility/`
- `apps/ops-console-web/app/callcenter/`
- `packages/contracts/src/index.ts`

### Acceptance

- Operators can create phone orders through a dedicated workspace.
- Recording state is visible alongside order and callback context.
- CTI / screen-pop assumptions are documented even if the external CTI source
  remains gated.

### Verification

- callcenter / owned-mobility tests
- ops-console typecheck

## `OPX-DP-001` — Queue-Entry Policy And Reservation vs Realtime Orchestration

### Objective

Make queueing rules explicit for realtime, reservation, phone, tenant, and
partner-originated orders.

### Write Scope

- `apps/api/src/modules/owned-mobility/`
- `packages/contracts/src/index.ts`
- `docs/02-architecture/`

### Acceptance

- Queue-entry conditions are documented and enforced.
- Reservation hold and confirmation windows produce predictable transitions.
- Exception-hold criteria are explicit.

### Verification

- owned-mobility tests
- contract review

## `OPX-DP-002` — Dispatch / Reassign / Redispatch Operation Model

### Objective

Align backend semantics and ops-console behavior around candidate fetch,
assignment, reassign, and redispatch.

### Write Scope

- `apps/api/src/modules/owned-mobility/`
- `apps/ops-console-web/app/dispatch/`
- `packages/contracts/src/index.ts`

### Acceptance

- Reassign and redispatch are distinct, documented operations.
- Operator actions always produce attempts, traces, and assignment history.
- Queue and dispatch states remain source-aware.

### Verification

- owned-mobility tests
- ops-console typecheck

## `OPX-DP-003` — Exception-Hold And Manual Override Control Flow

### Objective

Create a controlled path for manually releasing or overriding blocked orders
while preserving compliance and audit guarantees.

### Write Scope

- `apps/api/src/modules/owned-mobility/`
- `apps/ops-console-web/app/dispatch/`
- `apps/ops-console-web/app/incidents/`
- `packages/contracts/src/index.ts`

### Acceptance

- Operators can see why an order is blocked.
- Override actions require role, reason, and audit trace.
- Compliance gates still determine downstream review duties.

### Verification

- owned-mobility / audit tests
- ops-console typecheck

## `OPX-DP-004` — Dispatch Map Board And Spatial Operations Uplift

### Objective

Introduce a map-driven visualization layer for dispatch and address workflows
without creating a second dispatch authority.

### Write Scope

- `apps/ops-console-web/app/dispatch/`
- `tenant-commute-hub/src/components/MapPicker.tsx`
- related map helpers in both repos

### Acceptance

- Operators can view spatial context for queue and candidate supply.
- Tenant / call-center address capture can use governed geospatial input.
- Map interactions remain projections over backend truth.

### Verification

- web typecheck
- manual map smoke

## `OPX-DP-005` — Driver Task / Location Event Runtime Externalization

### Objective

Replace single-instance runtime assumptions for task events and location updates
with an externalized event bus and clearer SLA.

### Write Scope

- `apps/api/src/modules/owned-mobility/owned-mobility-task-events.service.ts`
- `apps/api/src/common/ops-dispatch-events.service.ts`
- `apps/api/src/modules/regulatory-registry/`
- `apps/driver-app/`
- infra / runtime docs as needed

### Acceptance

- Task and location event delivery survive horizontal scaling.
- Event lag and retry behavior are measurable.
- Driver / ops views remain coherent under scale.

### Verification

- runtime hardening tests
- infra / docs review

## `OPX-CM-001` — Recording, Proof, And Eligibility Gate Matrix

### Objective

Implement one explicit gate model for dispatch-blocking, completion-blocking,
and settlement-affecting compliance conditions.

### Write Scope

- `apps/api/src/modules/owned-mobility/`
- `apps/api/src/modules/tenant-partner/`
- `apps/driver-app/`
- `apps/ops-console-web/`
- `packages/contracts/src/index.ts`

### Acceptance

- Each gate has required / blocking / override / reviewer semantics.
- Order, task, and settlement consequences are explicit.
- Operator and driver UIs show required evidence and next action.

### Verification

- owned-mobility / tenant-partner tests
- ops-console / driver-app typecheck

## `OPX-CM-002` — Complaint / Incident / Escalation Workflow Closure

### Objective

Clarify the boundaries and escalation paths between complaint, incident, and
callcenter follow-up work.

### Write Scope

- `apps/api/src/modules/complaint/`
- `apps/api/src/modules/incident/`
- `apps/api/src/modules/callcenter/`
- `apps/ops-console-web/app/complaints/`
- `apps/ops-console-web/app/incidents/`

### Acceptance

- Operators can distinguish complaint vs incident cases.
- Escalation ownership is explicit.
- Transfer paths between call session, complaint, and incident are auditable.

### Verification

- complaint / incident tests
- ops-console typecheck

## `OPX-CM-003` — Pricing Authority And Manual Fare Override Governance

### Objective

Consolidate price truth, quoted fare lifecycle, and manual override policy.

### Write Scope

- `apps/api/src/modules/product-rule/`
- `apps/api/src/modules/owned-mobility/`
- `apps/platform-admin-web/app/pricing/`
- `tenant-commute-hub/src/pages/NewBooking.tsx`
- `packages/contracts/src/index.ts`

### Acceptance

- Quoted fare source is canonical and documented.
- Manual override requires explicit actor, reason, and trace.
- Tenant / partner channels cannot silently become pricing authorities.

### Verification

- owned-mobility / product-rule tests
- platform-admin / tenant-hub typecheck

## `OPX-CM-004` — Channel-Aware Settlement And Reconciliation Matrix

### Objective

Make settlement responsibilities explicit for tenant, partner, phone, and
forwarded orders.

### Write Scope

- `apps/api/src/modules/billing-settlement/`
- `apps/api/src/modules/reporting-filing/`
- `apps/platform-admin-web/app/payments/`
- `apps/ops-console-web/app/revenue/`
- `tenant-commute-hub/src/pages/BillingManagement.tsx`

### Acceptance

- Each channel has defined payer, invoice, receipt-owner, and reconciliation path.
- Finance review surfaces expose enough source-aware context.
- Reporting artifacts align with the same matrix.

### Verification

- billing/reporting tests
- web typecheck

## `OPX-CM-005` — Retention, Archival, And Evidentiary-Access Policy Enforcement

### Objective

Materialize retention schedules and access controls for evidence-bearing records.

### Write Scope

- `apps/api/src/modules/audit-notification/`
- `apps/api/src/modules/reporting-filing/`
- `apps/api/src/modules/callcenter/`
- `apps/api/src/modules/tenant-partner/`
- `docs/03-runbooks/`

### Acceptance

- Each evidence family has retention and archival policy.
- Legal hold / deletion exception paths are documented.
- Access to recordings, proofs, and audit exports is controlled and auditable.

### Verification

- policy review
- targeted unit coverage where code enforcement is added

## `OPX-GV-001` — Cross-Repo Authority-Drift Guardrail And Contract Lifecycle

### Objective

Prevent `tenant-commute-hub` and future consumer surfaces from regaining backend
authority or drifting from shared contracts.

### Write Scope

- `tenant-commute-hub/src/lib/drts-shim/`
- contract sync scripts in both repos
- `docs/02-architecture/authority/`
- compatibility docs and CI if needed

### Acceptance

- Shared contract sync has a documented lifecycle.
- Breaking changes require compatibility notes.
- Consumer repos cannot silently reintroduce backend truth.

### Verification

- contract sync smoke
- doc review

## `OPX-GV-002` — Workflow-Based Acceptance Matrix And Release Gates

### Objective

Turn cross-surface workflow families into explicit release gates.

### Write Scope

- `docs/04-uat/`
- `tests/`
- `support/sidecars/`
- rollout runbooks

### Acceptance

- Each critical workflow has a named verification path.
- Release and closeout language references workflow families, not just repo-local tests.
- External-gated evidence is clearly separated from repo-only closure.

### Verification

- updated UAT / E2E docs
- smoke / test script review

## `OPX-GV-003` — Observability, Alerts, And Operational Dashboards

### Objective

Define and implement the minimum operational visibility bar for Phase 1.

### Write Scope

- `apps/api/`
- `apps/ops-console-web/`
- `apps/platform-admin-web/`
- docs / runbooks

### Acceptance

- Critical workflow metrics and alerts are named and routed.
- Operators have role-appropriate visibility into failure states.
- Dispatch, webhook, recording, and driver-state lag are measurable.

### Verification

- dashboard and alert review
- docs review

## `OPX-GV-004` — Non-Functional Workload, SLA, And Degradation Model

### Objective

Make operational assumptions explicit so scaling and degraded behavior are
designed instead of guessed.

### Write Scope

- `docs/02-architecture/`
- `docs/03-runbooks/`
- infra/runtime notes as needed

### Acceptance

- Workload assumptions exist for intake, dispatch, driver updates, webhooks, and reports.
- SLA and latency targets are stated by workflow family.
- Degradation policy is documented for partial outages.

### Verification

- design review
- runbook alignment

## `OPX-GV-005` — Operational Glossary And Multilingual Copy Consistency

### Objective

Align user-facing terminology across platform, ops, tenant, partner, and driver surfaces.

### Write Scope

- `apps/platform-admin-web/`
- `apps/ops-console-web/`
- `apps/driver-app/`
- `tenant-commute-hub/src/`
- glossary docs

### Acceptance

- Critical workflow terms have one glossary meaning.
- Traditional Chinese readiness is consistent where required.
- User-facing errors do not drift by surface for the same condition.

### Verification

- typecheck
- copy audit

## `OPX-GV-006` — Decision-To-Backlog And Code-To-Doc Sync Automation

### Objective

Create the governance mechanism that prevents the new SA/SD truth from going
stale again.

### Write Scope

- `docs/`
- `scripts/`
- optional control-plane sync helpers

### Acceptance

- New accepted SD/SA supplements have an explicit path into backlog materialization.
- Code-backed audits and execution packets are linked from the canonical map.
- Task packets and truth docs stay referenceable from one entry point.

### Verification

- doc and script review

## 6. Recommended Dispatch Order

1. `OPX-ID-001`, `OPX-ID-002`, `OPX-MD-002`, `OPX-DP-001`, `OPX-GV-001`, `OPX-GV-006`
2. `OPX-MD-001`, `OPX-MD-003`, `OPX-IN-001`, `OPX-IN-005`, `OPX-DP-002`
3. `OPX-ID-003`, `OPX-IN-003`, `OPX-CM-001`, `OPX-CM-003`, `OPX-CM-004`
4. `OPX-DP-003`, `OPX-CM-002`, `OPX-CM-005`, `OPX-GV-003`, `OPX-GV-004`
5. `OPX-MD-004`, `OPX-IN-004`, `OPX-DP-004`, `OPX-GV-002`, `OPX-GV-005`
6. `OPX-IN-002` when external issuer / bank prerequisites exist

## 7. Relationship To Existing Waves

- `P1PX-*` remains the 2026-04-28 productization wave that closed the baseline
  partner and driver posture.
- `EMC-*` remains the post-closeout hardening / parity / evidence family.
- `OPX-*` is the new operational-blueprint family derived directly from the
  SA + gap supplement + SD blueprint trio.

If these tasks are later materialized into `ai-status.json`, they should be
treated as a new execution wave rather than merged ambiguously into historical
`EMC-*` or `P1PX-*` slices.
