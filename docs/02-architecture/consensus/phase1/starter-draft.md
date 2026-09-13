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
- Active artifact: [review-round-1.md](review-round-1.md), Entries 5–19
- Goal: reconcile historical synthesis with current release scope and complete cited WIRE/webhook SA/SD review before supervisor-led synthesis
- Status: recovery design review submitted; cross-lane disposition and convergence pending; execution remains paused

## Reopened Review Inputs

The cited feedback lives in [review-round-1.md](review-round-1.md). Entries 5–10 cover planning authority, accepted contract decisions and P01–P06 boundaries; the supervisor inventory §3.5 records their earlier dispositions. Entries 11–13 refine clock-in persistence, runner/recovery gates and the documented P03 declaration-path loading cause. Their Q-001 portions and Entries 14–15's multi-order proposals are historical following Entry 16.

**Current launch scope:** board snapshot `2026-09-13T14:02:27Z` records the user's later direction: first operational release uses one call / one order. `SR-CALL-MULTIORDER-20260913` is withdrawn with empty scopes and no release dependency. Its blocked state preserves history because the board has no cancellation state; it is not awaiting technical SD or a launch requirement. The supervisor has synchronized the question board and inventory; preserve its appended scope record. Closeout board snapshot `2026-09-13T14:18:58Z` also reconciles the older task note and clears its active dependencies/acceptance keys; that reconciliation is no longer pending. This review neither reopens the cardinality question nor changes the board.

Entry 17 reviews Academy projection and recording-handler gaps. The inventory now proposes a shared Academy transaction (§3.9), Registry expiry processing (§3.11) and recording adapters/API lifecycle integration (§3.12). Entries 18–19 carry those proposals forward and specify the remaining credential identity, renewal/delivery ordering, close-event replay, handler readiness, exhausted-work recovery and ordinary-call coverage. These remain submitted technical outputs for cross-review, not accepted state-machine changes, execution assignments or evidence of running services.

Preserve the inventory's distinction between root's restore regression, worker compatibility code, published candidate evidence and unverified WIP. Keep original WIRE, C111–C115 and live acceptance gates, and P05's existing product/device decision route. [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§4–5, governs convergence and current-packet acceptance; the user's existing direction already assigns subsequent implementation to supervisor/auto workers.

## Working Synthesis

The text below is the preserved 2026-04-11 synthesis. Its wave order and open questions are historical inputs, not current assignments or a claim that later decisions remain unanswered. Apply Entry 6's accepted-source corrections and Entry 16's later first-release one-call/one-order scope when preparing the next synthesis. The historical cardinality question below does not reopen withdrawn multi-order work.

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
