# Phase 1 Starter Draft

This is the single shared working draft for the supervisor baton loop.

Rules:

- only the current baton owner edits this file
- reviewers must place cited objections or refinements in the review round files
- accepted changes are merged back into this file by the current baton owner

## Current Round

- Round: 1
- Current owner: Codex
- Supervisor: Claude
- Goal: merge Codex, Qwen, Gemini, Copilot, and Claude readouts into a shared cited synthesis

## Working Synthesis

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
