# Phase 1 Consensus Packet

## Metadata

- Date: 2026-04-11
- Editor: Codex synthesis from Qwen, Gemini, Copilot, and Claude readouts
- Based on rounds: lane readouts + review round 1

## 1. Accepted Conclusions

- Phase 1 is a fleet-management + dispatch-compliance core that must be independently operable and auditable; Phase 2 autonomy/Tesla/FSD/ODD work remains extension-only and must not reshape Phase 1 flows.
- `owned` and `forwarded` are separate domains with separate lifecycle, assignment, settlement, and API semantics. Forwarded flows never enter owned dispatch assignment.
- Formal Phase 1 service buckets are only `standard_taxi` and `business_dispatch`. `business_dispatch` is limited to `enterprise_dispatch` and `credit_card_airport_transfer`.
- Canonical enums are frozen for Phase 1 and must stay serialized in canonical `snake_case` across APIs, callbacks, reports, and artifacts.
- Audit, dispatch trace, complaint timeline, and delivery histories are append-only governance artifacts. Complaint, incident, notification, and audit are separate lifecycles.
- APIs stay command-first, idempotent, and envelope-stable. Driver App and web UIs send commands rather than directly patching canonical state.
- Regulatory eligibility is a hard dispatch gate. Vehicle/driver compliance data is authoritative input to dispatch decisions, not a UI hint.
- SQL migrations are the schema authority. Prisma may assist implementation but must not override migration truth.
- The accepted execution wave order is: foundation/governance -> regulatory -> owned order/dispatch/driver-task -> callcenter/complaint/CTI -> billing/settlement -> reporting/filing -> forwarder.
- Execution must re-enter `discussion_planning` whenever a slice proposes enum expansion, lifecycle changes, source-of-truth ownership changes, retention-policy changes, or forwarded/owned seam changes.

## 2. Rejected Interpretations

- Reject any interpretation that lets `forwarded` orders reuse owned assignment endpoints or become owned dispatch truth.
- Reject any interpretation that treats Phase 2 AV/Tesla/FSD/ODD runtime work as a prerequisite for Phase 1 launch.
- Reject any interpretation that expands Phase 1 product buckets or `business_dispatch` subtypes without explicit human approval.
- Reject any implementation style that relies on giant PATCH-style status mutation instead of command-first APIs with idempotency.
- Reject any design that merges complaint lifecycle into incident, notification, or audit, or that overwrites append-only operational trace history.

## 3. Unresolved Human Decisions

- `call_session` to `order` cardinality and the canonical CTI correlation model.
- CTI recording retention/source-of-record capabilities and how far Phase 1 controls raw recording storage versus indexed metadata.
- Final notification/webhook/audit persistence shape where the migration plan and extracted DB bundle still diverge.
- Whether forwarder belongs inside Phase 1 GA or remains a later rollout after owned-core stabilization.
- Missing `phase1_system_design_v1.md` boundaries that would normally arbitrate deeper runtime/service split questions.
- Passenger app launch timing relative to owned-order cutover.

## 4. Execution Waves

- Wave 0: foundation, identity, audit, notification, webhook governance, and control-plane discipline.
- Wave 1: regulatory registry, vehicle/driver/contract/insurance/exclusivity readiness, and dispatch eligibility.
- Wave 2: owned order + dispatch + driver-task core for `standard_taxi` and `business_dispatch`, including redispatch and proof gates.
- Wave 3: callcenter + CTI correlation + complaint lifecycle.
- Wave 4: billing + settlement, including statements, reimbursements, and payout semantics.
- Wave 5: reporting + filing + signed artifact/download policy.
- Wave 6: forwarder mirror + reconciliation after owned core is stable.
- Current repo status: foundation governance and the first owned mobility baseline slices already exist, but persistence-backed migrations and later waves remain incomplete.

## 5. Task Ownership / Reviewer Map

- `Codex`: contracts, schema, state machines, acceptance tests, and canonical execution slices that touch cross-domain invariants.
- `Qwen`: API seams, callcenter/CTI adapters, complaint and integration-facing vertical slices.
- `Gemini`: migrations, runtime/infra, rollout safety, persistence packs, CI smoke paths, and reporting/billing implementation risk.
- `Copilot`: contradiction scan, test-gap review, roadmap drift detection, and second-pass critique of execution slices.
- `Claude`: governance review, baton control, consensus arbitration, and execution-to-discussion re-entry decisions.
- Near-term execution backlog after this consensus:
- `W1-003A` regulatory persistence and compliance gate hardening
- `W2-002B` persistence-backed owned order/dispatch repositories and migration alignment
- `W3-001A` callcenter + CTI correlation baseline
- `W3-001B` complaint case lifecycle baseline
