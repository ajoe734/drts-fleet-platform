# Baton Log

This file is append-only. It records who owned the shared draft in each round and why the baton moved.

## Entries

### Round 0

- Supervisor: Claude
- Baton owner: Codex
- Goal: create the first shared synthesis draft from canonical sources
- Expected reviewers: Qwen, Gemini, Copilot, Claude
- Status: completed

### Round 1

- Supervisor: Claude
- Baton owner: Codex
- Goal: merge five lane readouts into a cited starter draft and collect review confirmations/refinements
- Expected reviewers: Qwen, Gemini, Copilot, Claude
- Status: converged
- Outcome: promoted to `consensus-packet.md` after review round 1

### Round 1 reopened — 2026-09-13

- Supervisor: Claude
- Baton owner: Codex (unchanged; no supervisor ownership transition performed)
- Basis: current planning dispatch; `ai-status.json` (shared runtime machine truth), `execution_mode=discussion_planning`, `discussion_loop.current_owner=Codex`, snapshot updated at `2026-09-13T13:21:27Z`
- Goal: add cited feedback to the active round before resuming any implementation
- Output: [review-round-1.md](review-round-1.md), Entries 5–10; planning pointers in README/starter draft; live queue reconciled with the current dispatch
- Status: review_submitted; awaiting supervisor disposition and further cited review
- Findings: April execution handoff is historical; later accepted contracts refine the baseline; WIRE and webhook need explicit SA/SD acceptance boundaries; the supervisor’s newly available P01–P06 inventory is reviewed without promoting its proposals; P05 retains its existing human-decision route; Q-001 and V0082 record conflicting cardinality decisions
- Next planning step: Claude dispositions Entries 5–10 and routes the current review order (`Claude2`, `Gemini`, `Gemini2`, `Copilot`, `Claude`). Ownership remains with Codex until the supervisor records a transition.
- Scope: planning documents only. No execution task started or changed; no implementation commit, product server, or deployment. April's convergence entry is preserved as history, not reused as current authorization.

### Round 1 follow-up — 2026-09-13

- Supervisor: Claude
- Baton owner: Codex (unchanged; the supervisor has not recorded a transition)
- Basis: current planning dispatch; machine-truth snapshot remains `updated_at=2026-09-13T13:21:27Z`, `execution_mode=discussion_planning`, `discussion_loop.current_owner=Codex`.
- Output: [review-round-1.md](review-round-1.md), Entries 11–12; synchronized current pointers in README, starter draft and supervisor queue. Preserved the concurrent Entry 9 user-resolution addendum and the queue's existing authorization clarification.
- Status: review_submitted; supervisor dispositions for Entries 5–10 are acknowledged from inventory §3.5; further disposition, technical SD and cross-lane convergence remain pending.
- Findings: Q-001's recorded 1:N user decision settles the product question; its implementation remains pending. The existing tenant runner provides useful API/SQL/restart infrastructure, but its tenant-only gates do not prove C113–C115 coverage. C115 retains recording recovery and credential-expiry/alert jobs, with actual triggers and durable pending-work sources still to be reviewed.
- Evidence boundary: canonical specifications and read-only Git inspection at `6eec9635c17674b89b8519c642eb48b51dbd6479`; supervisor inventory observations remain attributed. No tests, hosted runs or live probes were executed by this follow-up.
- Next planning step: supervisor dispositions Entries 11–12 and routes the existing review order. Use the user's existing supervisor/auto-worker execution direction after current SA/SD acceptance; do not repeat the authorization request.
- Scope: documentation-only planning update on the existing planning branch. No task lifecycle or mode change, implementation commit, product runtime or deployment; historical consensus packet and round 2 preserved.

### Round 1 technical follow-up — 2026-09-13

- Supervisor: Claude
- Baton owner: Codex (unchanged; no supervisor transition recorded)
- Basis: current planning dispatch; machine-truth snapshot `updated_at=2026-09-13T13:48:04Z`, `execution_mode=discussion_planning`, `discussion_loop.current_owner=Codex`; inventory updates in §§3.2, 3.6–3.8.
- Output: [review-round-1.md](review-round-1.md), Entries 13–15; synchronized README, starter draft and supervisor queue.
- Status: review_submitted; Entries 11–15 await supervisor disposition and further cited review. Historical entries remain intact.
- Findings: acknowledge P03's documented declaration-path loading diagnosis and the supervisor's existing blocked Q-001 task. The 1:N design additionally needs intent-specific voice command admission/execution, verified public selection, partial/late recording recovery and a migration compatibility sequence. Preserve controller ownership, confirmations, per-intent deduplication and all existing acceptance gates.
- Evidence boundary: read-only source inspection at `6eec9635c17674b89b8519c642eb48b51dbd6479`; WIRE workflow separately inspected at `becf4ecdb32dac2a89e272db87243b1d4c38757f`; supervisor's saved loader probe read without rerunning it. No product tests, hosted runs or live probes executed.
- Next planning step: Claude dispositions Entries 11–15 and routes the unchanged review order. Academy projection and C115 trigger/persistence questions remain; Q-001's cardinality and execution-task registration are settled, while technical SD and scopes remain pending.
- Delivery: documentation-only continuation on the existing `codex/planning-phase1-codex` branch and draft PR #2017; shared planning files updated with the reviewed text. No implementation commit or task/mode transition; consensus packet and round 2 remain historical.

## User launch-scope revision — 2026-09-13T14:04:55.309086+00:00

- Source: latest explicit user instruction to revert to one call / one order and prioritize operational launch.
- Supersedes: the earlier same-day 1:N decision and multi-order action items; prior entries remain history.
- Action: updated Q-001/current inventory/routing; canonical commands removed the multi-order release dependency and recorded withdrawal without claiming implementation done.
- Next: complete launch-required SA/SD for existing flows and route implementation through supervisor/auto workers. No baton transition or mode change is claimed.

### Round 1 scope reconciliation and technical synthesis — 2026-09-13

- Supervisor: Claude
- Baton owner: Codex (unchanged; no supervisor transition recorded)
- Basis: current planning dispatch; machine-truth snapshot `updated_at=2026-09-13T14:02:27Z`, `execution_mode=discussion_planning`, `discussion_loop.current_owner=Codex`.
- Output: [review-round-1.md](review-round-1.md), Entries 16–17 and explicit supersession notes on the prior 1:N discussion; synchronized README, starter draft and supervisor queue.
- Status: review_submitted; further supervisor/cross-lane disposition and current-packet acceptance remain pending.
- Scope correction: the board records the user's later first-release one-call/one-order direction. `SR-CALL-MULTIORDER-20260913` is withdrawn, retained blocked with empty scopes for history, and removed from release dependencies. Earlier log entries describing required multi-order work remain historical and are superseded for current routing; do not auto-resume that task.
- Technical findings: inventory §§3.9–3.10 now identify Academy's duplicate derivation/projection gap and the built-in recording finalizer's metadata-only result. Entry 17 confirms the inspected source and narrows the remaining authority, persistence, trigger, lease and receipt outputs. Independent C115 recording/credential recovery remains required under the current single-order scope.
- Concurrent update preserved: supervisor's `User launch-scope revision` log entry and `Latest user-scope disposition` in the review round, plus the synchronized Q-001/inventory direction. No superseded multi-order routing was restored.
- Evidence boundary: read-only board/source inspection at the dated snapshot and product SHA `6eec9635c17674b89b8519c642eb48b51dbd6479`; documentation validation only. No product tests, hosted runs, live probes, or new completion claims.
- Next planning step: Claude publishes the already synchronized Q-001/inventory records, reconciles the older withdrawn-task note, dispositions the remaining WIRE/C111–C115 feedback and routes the unchanged review order. Preserve P05's existing decision route and all original QA/live gates; no new cardinality decision is needed.
- Delivery: documentation-only continuation on `codex/planning-phase1-codex` for existing draft PR #2017. Consensus packet and round 2 remain historical. No implementation commit, task/mode transition, product runtime or deployment.

### Round 1 recovery design review — 2026-09-13

- Supervisor: Claude
- Baton owner: Codex (unchanged; no supervisor transition recorded)
- Basis: current planning dispatch; initial board snapshot `updated_at=2026-09-13T14:02:27Z`, closeout snapshot `2026-09-13T14:18:58Z`, `execution_mode=discussion_planning`, `discussion_loop.current_owner=Codex`. Single-order launch scope and multi-order withdrawal remain in force.
- Output: [review-round-1.md](review-round-1.md), Entries 18–19; synchronized README, starter draft and supervisor queue.
- Status: review_submitted; supervisor/cross-lane disposition and current-packet acceptance remain pending.
- Findings: inventory §§3.9/3.11–3.12 now propose shared Academy transactions and API lifecycle integration. Review adds credential-specific event identity, recoverable notification handoff, renewal/late-receipt ordering, complete expiry source mapping, close-event replay, verified handler composition, failed-work recovery and ordinary-call/zero-order coverage. No new product cardinality decision is requested.
- Concurrent supervisor disposition: the later board reconciles the withdrawn multi-order task’s older note and clears its active dependencies/acceptance keys; WIRE/webhook notes carry the new proposals. Inventory §3.12 now includes ordinary-call producers and historical pending-call recovery. These are acknowledged rather than repeated as missing outputs. No board mutation was performed by this review.
- Evidence boundary: read-only product source at `6eec9635c17674b89b8519c642eb48b51dbd6479` and the supervisor's shared inventory. Machine-specific input snapshots are retained under `.local/planning-phase1-codex-followup-20260913/`. No tests, hosted runs or live probes are claimed; only documentation validation was performed.
- Next planning step: supervisor dispositions Entries 18–19 with the remaining earlier review, publishes owned design inputs and routes the existing review order. Product repairs beyond QA scopes need recorded ownership/scopes before execution.
- Delivery: documentation-only continuation on `codex/planning-phase1-codex` and draft PR #2017. Existing supervisor annotations, append-only history, historical consensus packet and round 2 are preserved. No implementation commit, task/mode transition, product runtime or deployment.

## Planning baton advanced — 2026-09-13T14:30:02.979640+00:00

- Recorded by Codex as an operator routing action under the user's supervisor/auto-worker instruction; no Claude2 review is claimed yet.
- Completed source: `codex-20260913T141405Z-4fc346c8`, outcome advanced / review_submitted, Entries 18–19, planning commit ace679836 on draft PR #2017.
- Stopped only the newly repeated Codex planning attempt `codex-20260913T142621Z-15d1fdb2` after verifying its unit; its working files remain preserved.
- Baton: Codex → Claude2, the first lane in the existing review order. Mode remains discussion_planning.
- Scope: resolve Entries 18–19 with concrete bounded engineering decisions; preserve one-call/one-order, pending P05 product information, Academy/insurance coverage and all original acceptance gates. No product implementation or deployment.

## Planning route after verified lane limit — 2026-09-13T14:33:06.540564+00:00

- Operator: Codex. Claude2 run `claude2-20260913T143057Z-9a14d58d` started, then exited with the CLI result “weekly limit”; unit inactive/dead was checked directly. No review was completed.
- Source: `.local/product-completion-20260913/sa-sd-pause/claude2-planning-weekly-limit-evidence.json`. Do not infer a reset date beyond the response.
- Baton: Claude2 → Gemini, next in the existing review order. Pending design questions are transferred, not waived; no product task status, execution mode or provider-pause policy is changed.

### Round 1 Gemini technical review and synthesis — 2026-09-13

- Supervisor: Claude
- Baton owner: Gemini
- Basis: current planning dispatch; machine-truth snapshot `updated_at=2026-09-13T14:33:06Z`, `execution_mode=discussion_planning`, `discussion_loop.current_owner=Gemini`; inventory §§3.2, 3.4, 3.9–3.12 and Entries 18–19.
- Output: [review-round-1.md](review-round-1.md), Entries 20–22; updated [starter-draft.md](starter-draft.md), [README.md](README.md), and [supervisor-queue.md](supervisor-queue.md).
- Status: review_submitted; baton advanced to `Gemini2`.
- Technical findings:
  - Runtime packaging (P03): WIRE workflow startup command explicitly specifies root `--tsconfig ../../tsconfig.base.json` from `apps/api` to resolve runtime JS exports (`dist/index.js`) rather than declaration `.d.ts` paths, ensuring `MAINTENANCE_STATUSES` is iterable and `extractIapJwtAssertion` is callable, with no package export modifications or require-cache hacks.
  - Lifecycle hooks: `VoiceCommandRunnerService.startBackgroundLoop` integrates with NestJS `OnApplicationBootstrap` in `VoiceBookingModule`, and `drain` integrates with `BeforeApplicationShutdown` to guarantee clean lease termination on SIGTERM.
  - Handler composition: `runOnce` enforces strict `supportedTypes: ['finalize_recording']` claim whitelisting to eliminate silent metadata-only completion of unhandled items.
  - Deployment outbox compatibility: stateless Cloud Run container execution requires DB-backed persistence (`notif.phase1_mail_outbox`) for pending notification handoffs before dispatch, avoiding data loss on container replacement.
  - Clock-in persistence: `ShiftAttendanceService.clockIn` returns `Promise<ShiftRecord>` awaiting durable `repository.persistChanges(...)`, aborting on DB failure and eliminating synthetic in-memory active shifts.
  - Academy atomic projection: `recomputeRegulatoryProjection` executes within a single PoolClient transaction with immutable `asOf`, updating `reg.driver_reg_profiles.training_status` and amending `academy-identity-decision.md` §2.3 to explicitly authorize invalidating stale `passed` status to `pending`.
  - Credential identity & renewal ordering: Expiry events use content fingerprinting `sha256(expiryDate + credentialNumber)` instead of driver `updated_at`; renewal during sweep marks prior event `superseded`.
  - Vehicle insurance mapping: `reconcileExpiredCredentials` maps `reg.phase1_insurance_policies.valid_until` alongside driver licenses, fulfilling SC-024 without additional schedulers.
  - Recording atomic replay & single-order launch: `VoiceSessionService.closeSession` wraps dialog closure and `finalize_recording` enqueue in a single transaction; ordinary callcenter calls enqueue with `voice_session_id = NULL`; zero-order calls preserve audio compliance without requiring order linkage; single-order launch scope is maintained per user directive.
  - Retry exhaustion: Work items reaching `max_retries` transition to `failed`; an authorized ops retry path preserves work item ID and error audit trail.
  - Financial webhook idempotency & reconciliation (C113): Webhook test harness must verify `BillingSettlementService` against real PostgreSQL in hosted CI, guaranteeing duplicate transmissions return idempotent receipts without duplicate financial entries, and discrepancy resolution produces immutable ledger audit entries.
  - Geocoding & ETA fail-closed (C114): Harness simulates configured provider timeout (HTTP 504) and outages (HTTP 500) to verify `GeoService.withProviderErrorMapping` emits typed `ApiRequestError` and records observability metrics rather than masking failures with fallback 0s.
  - Shared dev deployment health & realm auth (P06): Cloud Run readiness check targets dedicated unauthenticated `/healthz` endpoints. Deployment smoke tests separate unauthenticated infra health from authenticated role probes under `SD-DP-20260429-001`, preserving Cloud Run IAM and perimeter IAP defense.
  - CI/CD runner architecture: Extend `tenant-uat-acceptance.yml` with isolated step jobs for C113, C114, and C115 against candidate SHA, preserving original tenant gate thresholds (>=10 HTTP tests, 8 spec files, >=27 unit tests, >=12 restart readbacks).
- Evidence boundary: read-only inspection of product source at `6eec9635c17674b89b8519c642eb48b51dbd6479` and supervisor inventory. Strictly respects VM restriction; no product runtime, containers, or DB instances executed.
- Baton advancement: Gemini → Gemini2, next in the review order (`ai-status.json.discussion_loop.review_order`). Mode remains `discussion_planning`.
- Delivery: documentation-only planning update on the planning branch. Historical consensus packet and round 2 remain preserved. No implementation commit, task/mode transition, product runtime or deployment.

### Round 1 Gemini2 second-pass review and synthesis — 2026-09-13

- Supervisor: Claude
- Baton owner: Gemini2
- Basis: current planning dispatch; machine-truth snapshot `updated_at=2026-09-13T14:47:59Z`, `execution_mode=discussion_planning`, `discussion_loop.current_owner=Gemini2`; inventory §§3.2, 3.4, 3.9–3.12 and Entries 18–22.
- Output: [review-round-1.md](review-round-1.md), Entries 23–25; updated [starter-draft.md](starter-draft.md), [README.md](README.md), and [supervisor-queue.md](supervisor-queue.md).
- Status: review_submitted; baton advanced to `Copilot`.
- Technical findings:
  - Crash points across commit boundaries (Entry 23): Voice session closure and `finalize_recording` work-item enqueue must share the same `pg.PoolClient` transaction via `VoiceSessionRepository.withTransaction` to prevent orphaned closed dialogs. Credential expiry event creation in `reg.phase1_expired_credential_events` and notification outbox enqueue in `notif.phase1_mail_outbox` must commit within the same database transaction with idempotency key `sha256(scope + event_id)`. Recovery sweeps query un-dispatched outbox records (`status = 'pending' AND run_after <= NOW()`) using `FOR UPDATE SKIP LOCKED`. Crash during in-flight provider dispatch relies on provider idempotency keys to echo original message acceptance without sending duplicate alerts.
  - Multi-replica concurrency & lease fencing (Entry 24): Background loop queue claims in `VoiceCommandRunnerRepository` and `RegulatoryRegistryRepository` execute `SELECT ... FOR UPDATE SKIP LOCKED` with unique worker instance IDs. All completion and state-mutation queries enforce `WHERE id = $id AND lease_epoch = $expectedEpoch AND lease_holder = $workerId` to eliminate split-brain updates from stale workers whose lease expired. Credential renewal races resolve by re-reading `reg.phase1_registry_drivers` with `FOR SHARE` and verifying content fingerprint `sha256(expiryDate + credentialNumber)`; if renewed, the event transitions to `superseded` and aborts notification. Cloud Run SIGTERM signal triggers `drain()` in `BeforeApplicationShutdown`, awaiting active handlers up to 15s and immediately releasing uncompleted leases to peer replicas.
  - Mixed work-type whitelisting (Entry 25): `VoiceCommandRunnerService.runOnce` enforces strict `supportedTypes: string[]` filtering (`['finalize_recording']`), ensuring unhandled or stub work types are never claimed or silently completed.
  - Zero-order & single-order recording recovery (Entry 25): Calls ending without an order link `linked_order_id = NULL` while sealing `FinalRecordingManifests` audio records against `call_id` in `callcenter.call_records`, ensuring complete regulatory compliance. Booked calls enforce the single-order launch boundary, rejecting duplicate booking commands idempotently.
  - Runner architecture & tenant gate preservation (Entry 25): Extend `tenant-uat-acceptance.yml` with isolated step jobs for C113 (Billing PostgreSQL idempotency and ledger adjustment), C114 (Geo provider timeout/500 mock simulation asserting typed `ApiRequestError` and metrics), and C115 (Process kill/restart against retained PostgreSQL testing recording recovery and credential expiry sweep catch-up). Original tenant thresholds (>=10 HTTP tests, 8 spec files, >=27 unit tests, >=12 restart readbacks) remain strictly preserved as an independent, uncompromised pass gate.
- Evidence boundary: read-only inspection of product source at `6eec9635c17674b89b8519c642eb48b51dbd6479` and supervisor inventory. Strictly respects VM restriction; no product runtime, containers, or DB instances executed.
- Baton advancement: Gemini2 → Copilot, next in the review order (`ai-status.json.discussion_loop.review_order`). Mode remains `discussion_planning`.
- Delivery: documentation-only planning update on the planning branch. Historical consensus packet and round 2 remain preserved. No implementation commit, task/mode transition, product runtime or deployment.

## Operator confirms Copilot route and source correction — 2026-09-13T14:56:26.580645+00:00

- Operator: Codex. Completed Gemini2 run `gemini2-20260913T144754Z-49ff8edd` submitted Entries 23–25 and exited; actual unit inactive/dead was checked. Document handoff alone left the board at Gemini2.
- Stopped only duplicate planning run `gemini2-20260913T145245Z-0ff91082`; files preserved. Machine baton Gemini2 → Copilot through the existing transaction/sync authority.
- Source correction Entry 26 is required input to Copilot and Claude. This is routing and root review, not another lane's approval.
- Product tasks/candidates and discussion_planning mode remain unchanged.
