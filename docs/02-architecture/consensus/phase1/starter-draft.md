# Phase 1 Starter Draft

This is the single shared working draft for the supervisor baton loop.

Rules:

- only the current baton owner edits this file
- reviewers must place cited objections or refinements in the review round files
- accepted changes are merged back into this file by the current baton owner

## Current Round

- Round: 1, reopened planning review on 2026-09-13
- Current owner: none — technical review complete; packet awaiting human acceptance
- Supervisor: Claude
- Active artifact: [review-round-1.md](review-round-1.md), Entries 5–27
- Goal: reconcile historical synthesis with current release scope, complete cited WIRE/webhook SA/SD review, and verify lifecycle/recovery boundaries before supervisor-led synthesis
- Status: Gemini fallback review submitted (Entry 27); Entry 26 source corrections verified and accepted across B1–B9; technical SA/SD converged for single-order operational launch; awaiting human acceptance of the consensus packet

## Reopened Review Inputs

The cited feedback lives in [review-round-1.md](review-round-1.md). Entries 5–10 cover planning authority, accepted contract decisions and P01–P06 boundaries; the supervisor inventory §3.5 records their earlier dispositions. Entries 11–13 refine clock-in persistence, runner/recovery gates and the documented P03 declaration-path loading cause. Their Q-001 portions and Entries 14–15's multi-order proposals are historical following Entry 16.

**Current launch scope:** board snapshot `2026-09-13T14:02:27Z` records the user's later direction: first operational release uses one call / one order. `SR-CALL-MULTIORDER-20260913` is withdrawn with empty scopes and no release dependency. Its blocked state preserves history because the board has no cancellation state; it is not awaiting technical SD or a launch requirement. The supervisor has synchronized the question board and inventory; preserve its appended scope record. Closeout board snapshot `2026-09-13T14:18:58Z` also reconciles the older task note and clears its active dependencies/acceptance keys; that reconciliation is no longer pending. This review neither reopens the cardinality question nor changes the board.

Entries 17–19 reviewed Academy projection, recording-handler gaps, and proposed recovery transactions. Entries 20–22 dispositioned the technical outputs across runtime and domain boundaries: settling P03 WIRE tsconfig runtime packaging without package export mutations; connecting API lifecycle hooks (`OnApplicationBootstrap` / `BeforeApplicationShutdown`); enforcing explicit `supportedTypes` whitelisting to eliminate silent metadata-only completion; establishing database-backed outbox persistence for stateless Cloud Run compatibility; enforcing an awaited persistence contract for clock-in; mandating a single PoolClient transaction for Academy projection derivation with an explicit write grant amendment; defining content-fingerprinted credential event identity and renewal supersession; mapping SC-024 vehicle insurance expiration; guaranteeing atomic close-event recording enqueue across ordinary and voice calls with zero-order audio compliance; mandating real PostgreSQL persistence for C113 webhook idempotency and reconciliation; specifying C114 simulated provider timeout and outage error mapping for fail-closed dispatch protection; resolving P06 deployment health check targets (`/healthz`) without weakening Cloud Run IAM or perimeter IAP boundaries; and extending `tenant-uat-acceptance.yml` to host C111–C115 suites while preserving original tenant gates.

Entries 23–25 provide Gemini2's second-pass technical review: establishing atomic database transaction boundaries pairing domain mutations with outbox/work-item enqueues to eliminate orphan states across crash points; mandating `SELECT ... FOR UPDATE SKIP LOCKED` and database-level `lease_epoch` fencing for multi-replica concurrency control; arbitrating credential renewal races via content fingerprint verification (`sha256(expiryDate + credentialNumber)`) to supersede obsolete expiry alerts; integrating Cloud Run SIGTERM graceful shutdown with immediate lease release; enforcing strict work-type whitelisting in background runners; preserving zero-order call audio compliance records linked to `call_id` without requiring order creation; upholding the single-order launch boundary; and isolating C111–C115 runner steps in `tenant-uat-acceptance.yml` while strictly preserving all original tenant thresholds under the repository's VM restriction rules.

Entry 26 provided Codex root's source corrections against repository truth at `6eec9635c17674b89b8519c642eb48b51dbd6479`. Root subsequently authored the finite operational launch packet in `consensus-packet.md` (§§B1–B9, C, D). Entry 27 provides Gemini's fallback review, verifying and accepting all 9 design rows: locking `reg.phase1_registry_drivers` with awaited DB commit for clock-in (B1); single SERIALIZABLE transaction preserving `expired`, `pending`, and manual waivers for Academy (B2); root `tsconfig.base.json` for WIRE tsx startup (B3); Registry expiry catch-up using actual driver and policy columns with canonical JSON tuple fingerprints and superseded renewal handling (B4); proposed Postgres outbox forward migration with durable domain handoff intents and uncertain attempt tracking (B5); reuse of `VoiceCommandRunnerService` and `crm.phase1_call_sessions` with booking command preservation, safe drain, and zero-order audio records (B6); audited same-row failed work repair with forward migration (B7); isolated C113–C115 runner steps in `tenant-uat-acceptance.yml` preserving original tenant gates (B8); and read-only entry health checks alongside human-governed P05 passenger push boundaries (B9). With Section C defining non-overlapping worker scopes, technical SA/SD for the first operational release is converged and ready for human acceptance.

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
