# Phase 1 Starter Draft

This is the single shared working draft for the supervisor baton loop.

Rules:

- only the current baton owner edits this file
- reviewers must place cited objections or refinements in the review round files
- accepted changes are merged back into this file by the current baton owner

## Current Round

- Round: 1, reopened planning review on 2026-09-13
- Current owner: Codex
- Supervisor: Claude
- Active artifact: [review-round-1.md](review-round-1.md), Entries 5–15
- Goal: reconcile the historical synthesis with accepted contract decisions and the paused WIRE/webhook/Q-001 SA/SD inventory before supervisor-led synthesis
- Status: supervisor dispositions for Entries 5–10 recorded; Codex follow-up submitted; technical SD and cross-lane convergence pending; execution remains paused

## Reopened Review Inputs

The cited claims and proposed wording live in [review-round-1.md](review-round-1.md). They cover current planning authority (Entry 5), accepted state/ownership/topology decisions (Entry 6), WIRE authority and failure behavior (Entry 7), C111–C115 acceptance boundaries (Entry 8), Q-001's historical conflict and appended 1:N user resolution (Entry 9), P05/P06 decision and evidence boundaries (Entry 10), supervisor dispositions (Entry 11), and capability-specific runner/recovery gates (Entry 12).

The supervisor’s `product-remediation-sa-sd-20260913.md` supplies the current P01–P06 inventory and records dispositions for Entries 5–10 in §3.5. Preserve its distinction between root’s restore regression, worker compatibility code, published candidate evidence, and unverified WIP. Entries 11–12 refine the remaining technical SD and runner coverage; they are not accepted synthesis. The supervisor must disposition the follow-up and obtain the remaining cited reviews before promotion. [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§4–5, governs convergence and human acceptance, subject to the user's existing direction to route implementation through supervisor/auto workers after accepted SA/SD.

The inventory's newer §§3.2, 3.6–3.8 and board snapshot `2026-09-13T13:48:04Z` are reviewed in Entries 13–15. P03's declaration-path loading cause is documented; the proposed WIRE command fix and full hosted acceptance remain pending. Q-001 already has the blocked task `SR-CALL-MULTIORDER-20260913`, with empty scopes. Its 1:N proposal still needs explicit voice intent admission/execution and public selection contracts, durable recording propagation, and migration compatibility steps. These refinements preserve the settled product answer; they are submitted feedback, not accepted state-machine changes or implementation assignments.

## Working Synthesis

The text below is the preserved 2026-04-11 synthesis. Its wave order and open questions are historical inputs, not current assignments or a claim that later decisions remain unanswered. Apply the accepted-source corrections in Entry 6 and Q-001's recorded 1:N resolution in Entry 9 when preparing the next synthesis; cardinality implementation is still pending.

### Scope

- Phase 1 is a dispatch-compliance core that must stand alone operationally; Phase 2 autonomy/Tesla/FSD/ODD remains extension-only and must not change Phase 1 primary workflows.
- Product surfaces stay broad at the repo level, but backend execution order remains domain-first: foundation/governance, regulatory, owned order-dispatch-driver, callcenter/complaint, billing, reporting/filing, then forwarder.

### Hard Rules

- `owned` and `forwarded` remain separate domains with separate lifecycle and assignment semantics.
- Formal Phase 1 buckets are only `standard_taxi` and `business_dispatch`; `business_dispatch` only supports `enterprise_dispatch` and `credit_card_airport_transfer`.
- Append-only governance is mandatory for audit, dispatch trace, complaint timelines, and delivery logs.
- APIs stay command-first, idempotent, and enum-stable; Driver App and UI surfaces send commands rather than patching canonical state directly.
- Eligibility gates from regulatory data are hard write guards for dispatch, not presentation hints.

### Proposed Architecture Direction

- Keep a modular monolith in `apps/api` for Phase 1 execution, but align modules, migrations, and tasks to service-contract ownership boundaries.
- Treat SQL migrations as schema truth and use the extracted DB bundle as implementation evidence to reconcile, not as authority above PRD/SA/contracts.
- Route any enum expansion, ownership drift, forwarded/owned mixing, retention-policy change, or missing SD-level boundary question back to `discussion_planning`.

### Proposed Wave Order

- Wave 0: foundation, identity, audit, notification, webhook governance
- Wave 1: regulatory registry and supply eligibility
- Wave 2: owned order + dispatch + driver-task core
- Wave 3: callcenter + complaint + CTI correlation
- Wave 4: billing + settlement
- Wave 5: reporting + filing + artifact policy
- Wave 6: forwarder mirror + reconciliation, only after owned core is stable

### Open Questions

- `call_session` to `order` cardinality and CTI recording retention model
- notification/webhook/audit persistence gaps between migration plan and extracted DB bundle
- whether forwarder belongs to Phase 1 GA or later rollout after owned core stabilization
- missing `phase1_system_design_v1.md` and any service-boundary decisions that would normally rely on it
