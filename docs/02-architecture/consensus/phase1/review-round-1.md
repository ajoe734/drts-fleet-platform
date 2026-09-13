# Review Round 1

> Latest user scope (2026-09-13): one call / one order; prioritize operational launch. The earlier 1:N answer and multi-order action items in Entries 9 and 13–15 are superseded. See the appended user-scope disposition and current inventory §§3.7–3.8. Historical reviewer statements below are preserved, not current dispatch instructions.

## Current dispatch — 2026-09-13

- Baton owner / reviewer lane: Gemini2; supervisor: Claude.
- Status: Gemini2 second-pass review submitted in Entries 23–25, following Gemini technical review and synthesis in Entries 20–22. Entries 23–25 provide exhaustive second-pass review of crash points across commit boundaries (atomic PostgreSQL transactions pairing domain mutations with outbox/work-item enqueue, handling post-commit crash recovery), multi-replica concurrency and lease fencing (`lease_epoch`, `FOR UPDATE SKIP LOCKED`, Cloud Run graceful drain on SIGTERM), credential renewal race arbitration (content fingerprinting `sha256(expiryDate + credentialNumber)` supersession, late provider callback handling), zero-order compliance audio preservation alongside single-order launch scope, and runner gate preservation (modular, isolated step jobs in `tenant-uat-acceptance.yml` for C113–C115 while strictly preserving original tenant thresholds). Baton advanced to Copilot.
- Prior dispatch records: Gemini review submitted in Entries 20–22 (settling P03 WIRE tsconfig runtime packaging, API lifecycle hooks, outbox deployment compatibility, voice handler composition, clock-in persistence contract, Academy atomic projection and write grant amendment, credential fingerprinting and renewal supersession, vehicle insurance mapping (SC-024), close-event replay with ordinary/zero-order recording recovery, C113/C114 real-persistence and fail-closed runner boundaries, and P06 shared-dev /healthz deployment verification under the accepted realm auth matrix); Codex recovery design review submitted in Entries 18–19, following Entries 16–17’s scope reconciliation and technical synthesis. The board records first-release one-call/one-order scope and withdrawal of multi-order work. Earlier 1:N proposals are superseded for this release; remaining WIRE/C111–C115 SD and cross-lane convergence remain pending.
- Entries 1–4 preserve the 2026-04-11 review. Their convergence does not authorize execution during the current planning pause.
- Entries 5–10 review the historical synthesis against current canonical contracts and the supervisor's `product-remediation-sa-sd-20260913.md` P01–P06 inventory. Proposed wording below is not a newly accepted product decision or an execution assignment.
- Evidence boundary: canonical source files and read-only task-board inspection. The board snapshot (`ai-status.json.updated_at=2026-09-13T14:33:06Z`) records `discussion_planning`, `discussion_loop.current_owner=Gemini`, and both `SR-WIRE-001` and `SR-QA-WEBHOOK-001` as `blocked`. Reported test failures/WIP below are attributed to that board, not independently reproduced here.
- The supervisor's inventory became available during review and was read before submission. It remains a discussion draft; its code, hosted-run, and live-environment observations are attributed evidence, not new verification by this dispatch.
- Follow-up evidence: the inventory's second version and Q-001 update, §§3.1–3.7, and read-only Git inspection at `6eec9635c17674b89b8519c642eb48b51dbd6479` (the recorded `origin/dev` snapshot). Entries 11–12 distinguish inspected workflow source from a successful execution; no hosted workflow was dispatched.
- Prior technical follow-up: inventory §§3.2, 3.6–3.8 and board snapshot `updated_at=2026-09-13T13:48:04Z`. Entry 13 supersedes the earlier outstanding P03 root-cause investigation and records the supervisor-created, blocked Q-001 task. Entries 14–15 are static design review against the same product-source SHA above; the WIRE workflow is inspected separately at candidate `becf4ecdb32dac2a89e272db87243b1d4c38757f`. No product check or runtime was executed.
- Current evidence: `ai-status.json.updated_at=2026-09-13T14:02:27Z` and closeout snapshot `2026-09-13T14:18:58Z`, `discussion_planning`, owner Gemini (transferred from Claude2 after verified weekly-limit exit); `SR-CALL-MULTIORDER-20260913.next` records user withdrawal and `SR-RELEASE-001` no longer depends on it. Entry 16 acknowledges the supervisor-synchronized question board/inventory and preserves the appended user-scope disposition; Entry 17 reviews inventory §§3.9–3.10 against source at `6eec9635c17674b89b8519c642eb48b51dbd6479`. Entries 18–19 reviewed proposed transaction/lifecycle integrations. Entries 20–22 supply Gemini's technical resolution and synthesis. This dispatch ran documentation and source-contract checks only.

## Entries

### Entry 1

## Metadata

- Reviewer lane: Qwen
- Target lane: Codex
- Round: 1
- Date: 2026-04-11

## Claim Under Review

- Codex claims that the first stable vertical slice is owned order -> dispatch -> driver task, and that forwarded flows must remain out of owned assignment endpoints.

## Review Outcome

- `confirm`

## Evidence

- File: `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
- Section or heading: `SC-001`, `SC-005`, `SC-007`, `SC-015` to `SC-017`
- Short explanation: The acceptance pack gives much denser, testable coverage for owned dispatch and explicitly forbids forwarded orders from using owned assignment flow.

## Impact On Consensus

- Keep owned order-dispatch-driver as the first backbone execution slice and preserve a hard adapter seam for forwarder work.

## Remaining Question

- None.

### Entry 2

## Metadata

- Reviewer lane: Gemini
- Target lane: Codex
- Round: 1
- Date: 2026-04-11

## Claim Under Review

- Codex claims that schema authority belongs to SQL migrations and that rollout should follow foundation -> regulatory -> owned core before broader UI work.

## Review Outcome

- `confirm`

## Evidence

- File: `phase1_migration_plan_v1.md`
- Section or heading: `3. Migration 原則`, `4. 發版波次`, `5 Schema Migration 分期`
- Short explanation: The rollout plan and migration packs explicitly sequence foundation and regulatory before owned core cutover, and treat forward-only migrations as the executable truth.

## Impact On Consensus

- Consensus should explicitly state that persistence-backed packs and migration sequencing take precedence over page-level integration work.

## Remaining Question

- The notification/webhook/audit persistence gap between the migration plan and extracted DB bundle remains unresolved.

### Entry 3

## Metadata

- Reviewer lane: Copilot
- Target lane: Starter Draft
- Round: 1
- Date: 2026-04-11

## Claim Under Review

- The starter draft assumes the collaboration control plane can safely switch between discussion and execution using `ai-status.json` and `current-work.md`.

## Review Outcome

- `refine`

## Evidence

- File: `AI_COLLABORATION_GUIDE.md`
- Section or heading: `0. Repository Scope`
- Short explanation: Earlier wording hardcoded `discussion_planning` as active, which could drift from runtime state. The control-plane rule should be mode-agnostic and let `ai-status.json` carry the live mode.

## Impact On Consensus

- Treat `ai-status.json` as the active-mode truth and keep `AI_COLLABORATION_GUIDE.md` mode-agnostic so workers do not receive contradictory instructions.

## Remaining Question

- None.

### Entry 4

## Metadata

- Reviewer lane: Claude
- Target lane: All Readouts
- Round: 1
- Date: 2026-04-11

## Claim Under Review

- The four lanes converge on the same governance rules: strict owned/forwarded separation, frozen Phase 1 buckets, append-only audit/trace behavior, command-first APIs, and wave-ordered execution.

## Review Outcome

- `confirm`

## Evidence

- File: `phase1_prd_detailed_v1.md`
- Section or heading: `2.4 Product Principles`, `4.2 產品桶`, `14.2 不得發生的產品錯誤`
- Short explanation: PRD hard rules align with the glossary, service contracts, decision tables, and migration plan, so there is no material contradiction across lanes on the central execution boundaries.

## Impact On Consensus

- Promote these shared rules into the consensus packet and treat the remaining open questions as explicit human or later-discussion items rather than blockers to all execution.

## Remaining Question

- Missing `phase1_system_design_v1.md` still limits how far service-boundary disputes can be settled without escalation.

### Entry 5 — Reopen planning without an execution handoff

#### Metadata

- Reviewer lane: Codex
- Target lane: Copilot / Claude; `supervisor-queue.md` Current assignment and Current disposition; Entry 3
- Round: 1, reopened review
- Date: 2026-09-13

#### Claim Under Review

- The historical queue assigns Claude to publish the packet and switch to execution because Round 1 converged.

#### Review Outcome

- `refine`: confirm Entry 3's machine-truth rule; reject applying April's handoff to this dispatch.

#### Evidence

- [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§0, 0.5, 2, 4–6: planning permits cited review and synthesis; the latest user instruction takes precedence; the supervisor advances the baton; human acceptance and authorization gate execution.
- `ai-status.json` (shared runtime machine truth), `execution_mode`, `discussion_loop`, and `tasks[id=SR-WIRE-001 or SR-QA-WEBHOOK-001].next`: the recorded pause requires SA/SD discussion before implementation resumes. The current user dispatch explicitly limits this turn to planning.

#### Impact On Consensus

- Suggested routing wording: “Codex has submitted Entries 5–10 in `review-round-1.md`. Claude dispositions the feedback and schedules further cited review. Codex remains the recorded baton owner until the supervisor changes ownership. Execution remains paused pending completed SA/SD discussion and explicit human acceptance/authorization.”
- The April packet, wave order, and `W1-003A` / `W2-002B` / `W3-001A` / `W3-001B` list are historical planning records, not a current task assignment or completion report. No new official backlog or task status is created by this review.

#### Remaining Question

- Supervisor disposition and any subsequent baton transition remain pending; this is not an authentication, quota, or environment blocker.

### Entry 6 — Use the accepted contract baseline when refining the draft

#### Metadata

- Reviewer lane: Codex
- Target lane: all readouts; Entry 4; `starter-draft.md` Proposed Architecture Direction and Open Questions
- Round: 1, reopened review
- Date: 2026-09-13

#### Claim Under Review

- The April synthesis treats frozen enums, abstract service boundaries, passenger launch timing, and a missing SD filename as an unchanged planning baseline.

#### Review Outcome

- `refine`: preserve owned/forwarded separation, command-first writes, and regulatory guards; apply the later accepted decisions within their stated scope.

#### Evidence

| Topic                        | Cited source and section                                                                                                                                                                                         | Required refinement                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision precedence          | [SD-DP-20260422-003](../../../01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md), Decision Record / superseding_decision                                                                         | An accepted human/system-design packet can supersede older L1 wording within scope. Implementation alone cannot do so.                                                                                                                                                                                     |
| Driver and forwarded states  | [PRD](../../../../phase1_prd_detailed_v1.md), §§11.2, 11.4; [SD-DP-20260817-010](../../../01-decisions/SD-DP-20260817-010-state-models-conformance-resolution.md), accepted_scope_note and §§1.3, 2.3            | Preserve the eight-state forwarded mirror and separate regulatory, attendance/presence, task, qualification, and reservation concerns. Do not restore the L2 glossary §0.5.6 monolithic `driver_work_state` or driver-selected service buckets.                                                            |
| Write authority and recovery | [Service Contracts](../../../../phase1_service_contracts_v1.md), §§5.2, 6, 7.1; [SD-DP-20260817-009](../../../01-decisions/SD-DP-20260817-009-domain-event-contract-and-write-authority.md), accepted_scope_note | `owned-mobility` owns the owned order/dispatch/core-task writes. Use the documented calls, persisted state, and reconciliation boundaries; the old domain-topic list is a future target. Migration-plan Wave 0 and playbook §5.2.4 do not authorize adding an event bus or a partial topic implementation. |
| Available SD                 | [Operational SD blueprint](../../phase1-operational-system-design-blueprint-20260429.md), §§1, 2.1, 3.2; [SA](../../../../phase1_system_analysis_v1.md), §0.1                                                    | A missing `phase1_system_design_v1.md` filename is not evidence that no SD exists. Read the operational supplements and accepted decisions before escalating a specific uncovered boundary.                                                                                                                |
| Passenger surface            | [SD-DP-20260422-001](../../../01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md), superseding_decision and completion_bar                                                                     | First-party passenger UI and receipt-center launch are outside the recorded Phase 1 completion bar. April's timing question cannot itself reopen that scope.                                                                                                                                               |

#### Impact On Consensus

- Suggested draft wording: “Maintain the current accepted contract baseline and its source-of-truth owners. Any proposed change names the affected decision, canonical contract, failure behavior, and acceptance consequence before implementation is assigned.”
- These are source-backed corrections to historical assumptions, not assertions that current code or deployed behavior conforms. Do not erase existing remediation or live-evidence requirements based on older architectural acceptance.

#### Remaining Question

- Claude should carry these citations into the next synthesis after review; no new enum, service split, or passenger topology decision is requested here.

### Entry 7 — Specify WIRE's authority and failure behavior before repair

#### Metadata

- Reviewer lane: Codex
- Target lane: starter draft Hard Rules; current `SR-WIRE-001` planning pause
- Round: 1, reopened review
- Date: 2026-09-13

#### Claim Under Review

- “Eligibility gates are hard write guards” is correct but insufficient to define the pending leave/training/Host integration and asynchronous clock-in behavior.

#### Review Outcome

- `refine`: turn the invariant into a reviewable SA/SD acceptance contract.

#### Evidence

- [PRD](../../../../phase1_prd_detailed_v1.md), §§9.3.4, 9.4.7, 9.6.2, 11.4, 12.6–12.7: backend qualification, suspension/vehicle guards, training requirements, and self/owned-vehicle access apply independently of navigation.
- [Service Contracts](../../../../phase1_service_contracts_v1.md), §§3.3, 3.8, 4.3, 7.1: regulatory truth is separate from attendance and core task writes; suspend must reject clock-in; assignment requires current eligibility and no scheduling conflict.
- [SR-WIRE-001 task specification](../../../03-runbooks/system-remediation-20260906/SR-WIRE-001.md), Execution prompt and 驗收條件: preserve existing authority, reversible leave/training eligibility, normal UI → real API/DB behavior, and AV exclusions.
- `ai-status.json` (shared runtime machine truth), `tasks[id=SR-WIRE-001].next`, `.integration_notes`, `.required_acceptance`: the supervisor reports an invalid `ShiftRecord & Promise<ShiftRecord>` compatibility result with fabricated active fields, a private eligibility-resolver dependency, and 5/29 focused failures including four attributed to a staged guard omitted during restore. These are recorded observations of preserved WIP, not a verified defect count for current dev.
- `product-remediation-sa-sd-20260913.md`, §2 P01–P03 and §3: the inventory explicitly attributes the omitted guard to root's restoration, reports an additional unhandled rejection, and separates the published WIRE candidate from uncommitted merge/WIP. It reports 5/5 hosted API/SQL cases followed by `MAINTENANCE_STATUSES is not iterable` during server startup; the five browser cases remain unproven and the module-loading root cause remains undetermined.

#### Impact On Consensus

Proposed review matrix for the SA/SD inventory:

| Boundary                        | Required behavior to specify                                                                                                                                                                                         | Acceptance consequence                                                                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clock-in                        | Await the authoritative eligibility decision and persistence before returning the real `ShiftRecord`. A rejection or unavailable authority cannot yield fabricated active shift fields.                              | Success returns a persisted shift; suspension, invalid qualification, applicable leave/training rejection, and dependency failure produce no successful clock-in result. Callers and tests must await the same asynchronous contract. |
| Online / candidate / assignment | Consume the established public eligibility boundary. Keep regulatory status, presence, task occupancy, leave/training, and reservation checks distinct; recheck eligibility at the write boundary.                   | Include direct assignment, redispatch, and scarcity/fallback paths, plus a change of eligibility between candidate read and assignment. An empty UI list or missing leave record cannot certify eligibility.                          |
| Recovery                        | Removing a leave/training restriction triggers normal eligibility evaluation; it does not clear suspension, invalid vehicle/insurance, reservation conflicts, or AV exclusions.                                      | Prove both restored availability when all guards pass and continued rejection when another independent guard fails.                                                                                                                   |
| Training requirement (P02)      | Resolve `trainingRequired=true`, `false`, and missing data against the existing capability contract through the evaluator's public interface. A training exemption cannot bypass leave or another independent guard. | Cross required/exempt/unknown with completed/expired training and leave; unknown is not automatically eligible. The exact missing-data result must be cited and settled in SD, not invented by this review.                           |
| Host / Driver UI                | Normal role entry reads the authoritative resources and renders real empty/error states. Host access remains limited to owned vehicles; Driver access remains self-scoped.                                           | Normal-browser journeys and API/SQL readback include two-Host isolation and unauthorized direct API access, not only navigation visibility.                                                                                           |

- Retain `wire_real_api_db_ui_and_reversible_dispatchability` unchanged. Agree the authority calls, asynchronous return/error contract, persistence boundary, affected callers, and exact acceptance cases before the supervisor resumes scoped implementation.
- P03 requires a documented comparison of contracts export, build order, and module resolution before selecting a fix. A new build step or require-cache patch is not evidence of successful product composition. Keep the final same-SHA requirement of 5 API/SQL plus 5 browser cases, zero skips, and required CI; the earlier API-only result cannot close it.
- The canonical inventory is now available in the shared workspace. Preserve its P01 attribution and HEAD-versus-staged-merge distinction when the supervisor records future implementation scopes.

#### Remaining Question

- Required planning follow-up: the capability-based P02 matrix, P03 root-cause evidence, and a reviewed integration baseline separating root's restore regression, asynchronous test assertions, and published candidate behavior. No execution was resumed to reproduce these findings.

### Entry 8 — Preserve the full webhook/provider/scheduler acceptance boundary

#### Metadata

- Reviewer lane: Codex
- Target lane: Gemini / Gemini2 review scope; current `SR-QA-WEBHOOK-001` planning pause
- Round: 1, reopened review
- Date: 2026-09-13

#### Claim Under Review

- April's general persistence and rollout conclusions do not define what proves the paused C113–C115 integration/recovery work complete.

#### Review Outcome

- `refine`: specify recovery and evidence requirements without treating historical C111/C112 results or unfinished test source as full acceptance.

#### Evidence

- [SR-QA-WEBHOOK-001 task specification](../../../03-runbooks/system-remediation-20260906/SR-QA-WEBHOOK-001.md), capability list and 驗收條件: C111–C115 require positive/negative cases and write → DB/API readback; discovered product defects need separately authorized repair scope.
- [Service Contracts](../../../../phase1_service_contracts_v1.md), §§3.13, 5.2, 6, 8.1–8.4: delivery retry, recording reconciliation, provider trace/reference IDs, explicit finance discrepancies, and external forwarder authority have distinct owners.
- [PRD](../../../../phase1_prd_detailed_v1.md), §§9.2.1, 9.2.4, 13.2: mapping versions are auditable, ETA must not be fabricated, and workflow identifiers must remain traceable.
- `ai-status.json` (shared runtime machine truth), `tasks[id=SR-QA-WEBHOOK-001].next`, `.required_acceptance`, `.acceptance_evidence`: 424 uncommitted added test lines are preserved WIP; all three acceptance keys remain required, including `webhook_c113_c114_c115_provider_scheduler_and_alert_receipts`. Historical service-level, injected-timeout, and repository-double results carry the limitations recorded with them.
- `product-remediation-sa-sd-20260913.md`, §2 P04 and §3 P04: capability-source mapping/resend/reconciliation, routing/ETA degradation, and durable backlog/restart/catch-up are separate gaps. The named `webhook-uat-acceptance.yml` was not found in the inventory's dev/candidate inspection; available transport/tenant workflows must be inventoried before choosing a runner.
- User-supplied `AGENTS.md`, Deployment scope and VM restriction: product, browser/E2E, and Compose servers may not run on this VM. Repository checks are permitted; environment-dependent acceptance must use an authorized remote environment in a later execution dispatch.

#### Impact On Consensus

| Capability                                | SA/SD detail to settle                                                                                                                                                                     | Required evidence distinction                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C113 mapping / resend / reconciliation    | Source and mapping version, receiving authority, idempotency identity, failure record, retry/reconciliation owner, and provider reference/readback.                                        | Controlled integration proves the designed failure/recovery path; genuine ERP/SSO/bank sandbox receipts remain separate external acceptance.                           |
| C114 route / ETA degradation              | Provider trace, timeout/unavailable response, persisted estimate/snapshot, permitted manual fallback and its audit marker.                                                                 | Demonstrate unavailable/degraded behavior without a fabricated ETA. A controlled provider double does not prove the actual provider integration.                       |
| C115 durable backlog / restart / catch-up | Durable pending work, claim/retry identity, restart recovery, duplicate prevention, scheduler trigger, and alert ownership. Use accepted module/call boundaries, not an assumed event bus. | Persist → restart → catch-up → readback must use real storage/process behavior on the authorized remote runner; deployed scheduler and alert receipts remain required. |

- C111 tenant isolation and C112 actual transport timeout/retry/rotation/dedup stay in the final candidate matrix. A prior successful child or controlled receiver cannot waive these or the parent’s C113–C115 receipt gate.
- Before resumption, record each case's source, existing producer/task, expected failure and recovery, runtime/candidate SHA, verification layer, resource IDs, and required receipt. Name a verified existing hosted workflow, or disposition the missing runner in SD before proposing one. Missing evidence remains explicit; this planning turn creates no test harness, repair child, or runtime.

#### Remaining Question

- Complete P04's input → state transition → persistence → observable-result mapping and verified runner selection before defining new scopes. Missing provider access alone is not evidence that source-level planning is blocked.

### Entry 9 — Call-to-order cardinality has conflicting recorded resolutions

#### Metadata

- Reviewer lane: Codex
- Target lane: Qwen / Gemini / Claude; historical call-session open question
- Round: 1, reopened review
- Date: 2026-09-13

#### Claim Under Review

- The April artifacts treat call-to-order cardinality as unanswered; the later question board labels it resolved.

#### Review Outcome

- `refine`: the recorded answer and the migration disagree, so neither “still unanswered” nor “consistently closed” is a sufficient synthesis.

#### Evidence

- [PHASE1_OPEN_QUESTIONS.md](../../../../PHASE1_OPEN_QUESTIONS.md), Resolved Items / Q-001: the recorded 2026-08-19 decision permits multiple orders per call and calls for consistency across schema, contracts, service, and UI.
- The same file, Contract & Schema Synchronisation Backlog / call-session item: the 2026-08-23 closure instead cites a partial unique index as implementing Q-001.
- [V0082\_\_call_session_order_cardinality.sql](../../../../infra/migrations/V0082__call_session_order_cardinality.sql), decision comment and `ops_orders_call_id_unique`: the migration asserts a one-order-per-call decision and enforces uniqueness for non-null `call_id`. This proves the migration's constraint, not the intended product decision or its deployment.
- [Service Contracts](../../../../phase1_service_contracts_v1.md), §§3.9, 4.5, 10: one active session per telephone call does not establish one order per call; open-question ownership is centralized in `PHASE1_OPEN_QUESTIONS.md`.

#### Impact On Consensus

- Carry the conflict against existing Q-001 into the next review. Claude should reconcile the decision provenance with Codex/Claude2 before changing either the answer or the implementation direction. Do not add a duplicate human-decision question or silently select the SQL interpretation as product truth.
- Keep migrations forward-only and preserve data ([Migration Plan](../../../../phase1_migration_plan_v1.md), §§3.1, 9.1). No index removal, migration edit, cardinality change, or new implementation task is authorized by this entry.
- This conflict limits cardinality-specific synthesis; independent WIRE and webhook SA/SD review can continue.

#### Remaining Question

- Which accepted decision record supports the conflicting one-order claim in V0082? Recover its provenance, or explicitly route the existing Q-001 conflict for human resolution through the canonical question board before implementation.

#### User resolution recorded 2026-09-13

The user explicitly confirmed: 「一通電話可建幾張訂單，允許可以建多張訂單阿」. The product rule is **one call to multiple orders (1:N)**. This resolves the decision question above and supersedes V0082's one-order interpretation; the historical review remains preserved. The existing `PHASE1_OPEN_QUESTIONS.md` Q-001 record and `product-remediation-sa-sd-20260913.md` §3.7 now carry the answer and the pending schema/contracts/service/UI work. This documentation update does not resume execution or claim that the database has been migrated.

#### Subsequent scope correction — see Entry 16

The board snapshot at `2026-09-13T14:02:27Z` records a later user direction: first operational release uses one call / one order; multi-order implementation is withdrawn. The preceding 1:N decision and its follow-up proposals remain historical. Do not resume them or require their acceptance gates for this release. The supervisor has synchronized the question board and inventory with that later direction; Entry 16 records that disposition.

### Entry 10 — Keep P05's product decision and P06's environment evidence distinct

#### Metadata

- Reviewer lane: Codex
- Target lane: supervisor's `product-remediation-sa-sd-20260913.md`, P05–P06 and §5
- Round: 1, reopened review
- Date: 2026-09-13

#### Claim Under Review

- Passenger push needs a receiving-product/device contract, while shared-dev access and provider readiness need evidence under the existing role model.

#### Review Outcome

- `confirm`, with explicit disposition boundaries for the next synthesis.

#### Evidence

- `product-remediation-sa-sd-20260913.md`, §2 P05, §3 P05: the existing passenger push question remains open; durability work is already complete and must be reused. The receiving product, supported platforms, subject/device mapping, registration/revocation source, and provider contract remain undefined.
- [Service Contracts](../../../../phase1_service_contracts_v1.md), §§3.1, 3.13: identity/session device binding and notification delivery are distinct responsibilities. Driver binding does not answer the passenger device contract.
- `product-remediation-sa-sd-20260913.md`, §2 P06, §3 P06: the recorded anonymous 403 responses, failed deployment health gate, mock map status, and local gcloud reauthentication failure have different meanings. None establishes that IAM should be weakened or that cloud resources do not exist.
- [SD-DP-20260429-001](../../../01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md), Realm Matrix; [SD-DP-20260422-002](../../../01-decisions/SD-DP-20260422-002-identity-cutover-topology.md), superseding_decision: authenticate each caller through its designated plane and app boundary; no universal anonymous/IAP assumption is valid.

#### Impact On Consensus

- P05 remains `human_required` under the existing `PHASE1_OPEN_QUESTIONS.md` item `Q-SR-PUSH-001` (present on fetched `origin/dev`; the shared checkout's older question-board copy omits it). The supervisor should synchronize that existing record, not create another question. No provider, receiving app, or new first-party passenger topology is selected by this review; retain the separate `SR-LIVE-PUSH-001` device gate.
- P06 requires a role/entry matrix with expected authenticated response, actual resource/readiness probe, candidate SHA, and receipt source. Confirm the observed failure's layer before changing configuration. This dispatch does not rerun live probes, inspect credentials, change IAM, or prepare deployment.
- The inventory's §5 correctly leaves later scoped implementation to supervisor-dispatched workers and independent review. The 19-task table is the inventory's dated task snapshot, not 19 newly established defects or a fresh backlog count from this review.

#### Remaining Question

- P05's existing product/device decision remains pending. P06 needs role-correct environment verification in an authorized later dispatch. Neither removes the current planning pause or the original acceptance gates.

### Entry 11 — Carry the supervisor's dispositions forward without declaring convergence

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude; Entries 5, 7–10; supervisor inventory §§3.1–3.7
- Round: 1, reopened follow-up
- Date: 2026-09-13

#### Claim Under Review

- The routing notes still say that all supervisor disposition is pending, while the second inventory records dispositions and narrows the unanswered technical questions.

#### Review Outcome

- `refine`: acknowledge the recorded dispositions, retain the remaining SD work, and correct the earlier wording that could imply a second execution-authorization request.

#### Evidence

- [Product remediation inventory](product-remediation-sa-sd-20260913.md), §§3.1–3.3, 3.5–3.7: the supervisor records dispositions for Entries 5–10, established WIRE error/eligibility rules, and outstanding Academy projection, contracts loading, and C115 job boundaries. The document explicitly remains a discussion draft.
- [PHASE1_OPEN_QUESTIONS.md](../../../../PHASE1_OPEN_QUESTIONS.md), Resolved Items / Q-001 and Contract & Schema Synchronisation Backlog, updated during this follow-up: the recorded 2026-09-13 user decision confirms one call to multiple orders (1:N). Entry 9's appended resolution preserves this update; implementation remains pending.
- [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§2, 4–5: latest user direction controls the process; a lane's disposition is distinct from completed cross-review and accepted consensus. `ai-status.json.discussion_loop` still names Codex as owner and retains the five-lane review order.
- [Service Contracts](../../../../phase1_service_contracts_v1.md), §§2.5, 7.1: source-of-truth owners remain authoritative. The inventory's P01 background-persistence observation is a separate durability concern, not evidence that the five previously reported WIRE test failures have a new cause.

#### Impact On Consensus

| Prior review                | Follow-up disposition to carry forward                                                                                                                                                         | Still required before synthesis                                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry 5: planning authority | Record that the supervisor has responded. The user's existing instruction already directs supervisor/auto-worker execution after accepted SA/SD; do not ask again for that same authorization. | Record acceptance of the current SA/SD and the supervisor's later mode/baton transition. April convergence cannot supply either.                                                                                                   |
| Entry 7: WIRE P01–P03       | Use §3.1's established guards and error cases; preserve the root restore-regression attribution. Treat async completion and successful persistence as separate obligations.                    | Identify the persistence acknowledgement/failure boundary and shared caller impact; settle Academy's authoritative operation/projection consistency and the contracts-loading root cause. Keep the original full WIRE acceptance.  |
| Entry 8: webhook P04        | Carry §3.4's input → authority → state → persistence → receipt matrix. C115 means recording recovery and credential-expiry work.                                                               | Review the concrete trigger and durable pending-work source for each C115 job; review runner gates in Entry 12.                                                                                                                    |
| Entry 9: Q-001              | Carry the recorded user resolution: one call may create multiple orders (1:N). V0082's one-order interpretation is superseded; do not ask the product question again.                          | Schema/contracts/service/UI alignment, distinct creation-intent idempotency, multi-order recording linkage, and data-preserving verification need technical SD and supervisor routing. This review does not perform those changes. |
| Entry 10: P05, P06          | Preserve the Q-SR-PUSH-001 route and use the accepted realm matrix for environment checks. Q-001 does not select a passenger push topology.                                                    | The passenger receiving-product/device decision and role-correct live evidence remain pending and distinct.                                                                                                                        |

- Suggested routing wording: “Entries 5–10 have supervisor dispositions in inventory §3.5. Entries 11–12 refine the remaining technical SD and runner evidence requirements. Codex remains the recorded owner; further cited review and current-packet acceptance remain pending. Once the accepted design satisfies the gate, use the user's existing direction to route implementation through supervisor and auto workers.”
- The inventory remains supervisor-owned and untracked in the shared checkout at this inspection. Its publication and transfer of accepted additions into canonical specifications remain pending; this review preserves its relevant dispositions without presenting it as a published consensus packet.

#### Remaining Question

- Technical SD and the existing product-decision route still need their stated outputs. The supervisor should route the next cited review; this entry neither changes machine truth nor self-approves the packet.

### Entry 12 — Reuse the tenant runner only with explicit capability and recovery gates

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude2 / Gemini / Gemini2; Entry 8; supervisor inventory §§3.2, 3.4
- Round: 1, reopened follow-up
- Date: 2026-09-13

#### Claim Under Review

- The existing `tenant-uat-acceptance.yml` can host controlled C113–C115 verification, and C115 must retain its recording/credential scope.

#### Review Outcome

- `confirm` the C115 correction; `refine` runner reuse as a feasible source-backed proposal whose current pass gate does not verify webhook coverage.

#### Evidence

- [Capability inventory](../../../04-uat/system-remediation-20260906/source/capabilities.json), `ID=C113`, `C114`, `C115`: C113 names ERP/enterprise SSO/bank synchronization; C114 names real geocoding/routing/ETA; C115 names recording and credential preservation, background recovery, expiry scans, alert receipts, backlog, restart and catch-up. A dispatch timeout cannot substitute for C115.
- [Service Contracts](../../../../phase1_service_contracts_v1.md), §§3.9, 3.13, 5.2, 6.2: Callcenter owns recording indexes; Audit/Notification owns delivery records; recording reconciliation uses calls and persisted state, not an assumed event bus. [Acceptance scenarios](../../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md), SC-003–004, SC-024–025, and [API examples](../../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md), §3.16, require recording linkage/idempotency and independent expiry guards.
- [Tenant runner](../../../../.github/workflows/tenant-uat-acceptance.yml), `acceptance` job / candidate validation, `build_api`, `seed`, `restart_api`, `restart_readback`, `gate`, and `Record run status`, inspected at `6eec9635c17674b89b8519c642eb48b51dbd6479`: it validates a full candidate SHA, builds the real API, creates tenant A/B sessions, replaces the API process without resetting PostgreSQL, and records candidate/workflow SHAs. Its gate filters `sr-qa-tenant-001`, requires at least 10 HTTP tests and eight named tenant spec files, at least 27 unit tests, and at least 12 restart readbacks. It contains no C113–C115 completeness gate.
- At that same snapshot, [transport runner](../../../../.github/workflows/webhook-transport-acceptance.yml), `Run hosted receiver acceptance`, and [tenant-binding runner](../../../../.github/workflows/tenant-binding-acceptance.yml), `Run full AppModule two-tenant JWT HTTP/SQL acceptance harness`, provide distinct reusable verification paths. The tree has no `webhook-uat-acceptance.yml`. This is file inspection, not a new statement about any run result or current cloud readiness.

#### Impact On Consensus

Proposed runner acceptance contract, for supervisor disposition before any scope change:

| Boundary                  | Required design refinement                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing tenant coverage  | Preserve all existing tenant spec-file, count, zero-skip, restart and run-status gates. Passing these gates alone cannot certify any new webhook cases.                                                                                                                                                                                                                                                                                                                                |
| Added capability coverage | Define an explicit C111–C115 case manifest with positive/negative cases, each case's authority, candidate SHA, verification layer and evidence reference. Fail the relevant acceptance result when a required case/report is absent, skipped or unsuccessful. Keep all three parent `required_acceptance` keys.                                                                                                                                                                        |
| C115 process recovery     | For recording recovery and credential expiry separately, capture pending resource IDs before stopping the responsible process, accumulate due work while it is stopped, start a replacement against the retained DB, invoke the actual recovery path, and verify the same IDs plus alert/delivery outcomes. Repeating the trigger must not duplicate business effects. Identify the responsible job process; restarting only the API is sufficient only if it actually hosts that job. |
| Domain-specific readback  | Extend readback beyond the tenant resources: call/recording/order linkage and compliance flags; credential/vehicle eligibility and alert/delivery IDs. The existing tenant readback count is not a proxy for these results.                                                                                                                                                                                                                                                            |
| Evidence layers           | Keep controlled adapter/receiver results separate from genuine provider, deployed-scheduler and alert receipts. Record workflow SHA as well as candidate SHA when evidence spans runners; historical fixed-candidate results cannot be attributed to a later candidate. Missing external receipts keep the parent gate open.                                                                                                                                                           |
| Future edit scope         | Reuse is a proposal for the existing QA task. Before implementation, the supervisor must specify the workflow, verifier, fixtures and readback files and preserve the tenant owner's coverage. Product repair, if established, needs its own authorized scope; the QA task must not repair business services silently.                                                                                                                                                                 |

- Suggested synthesis wording: “The existing tenant runner supplies useful full-API/SQL and process-replacement infrastructure. It does not yet supply C113–C115 cases or their pass gate. Reuse requires explicit capability coverage and domain readback while preserving the tenant suite. C115 retains recording recovery and credential-expiry/alert jobs, whose concrete triggers and durable pending-work sources must be settled before implementation.”
- The VM restriction remains in force. This follow-up reads workflow definitions only; it creates no runner, provider adapter, scheduler, migration or execution task.

#### Remaining Question

- Locate and review the actual trigger, persistence and receipt path for both C115 jobs, then settle the smallest runner extension. The inventory's §3.6 still records this as technical SD work; neither credentials nor a green tenant-only run can answer it.

### Entry 13 — Record the WIRE loading diagnosis and existing Q-001 task

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude / Gemini; Entries 7, 11; supervisor inventory §§2 P03, 3.2, 3.6–3.8
- Round: 1, technical follow-up
- Date: 2026-09-13

#### Claim Under Review

- Earlier routing still requests the P03 loading root cause and treats Q-001 task registration as future work; the supervisor has now recorded both.

#### Review Outcome

- `refine`: carry the new evidence and recorded task forward; implementation and full acceptance remain pending.

#### Evidence

- [Product remediation inventory](product-remediation-sa-sd-20260913.md), §2 P03 and §3.2, reports an A/B package-loading probe: plain Node resolves runtime JS, tsx using the API tsconfig resolves declarations, and explicitly selecting the existing root config restores JS exports. The saved probe was read from the inventory's §6 evidence location; it was not rerun by this dispatch.
- [API tsconfig](../../../../apps/api/tsconfig.json), `compilerOptions.paths`, and [root tsconfig](../../../../tsconfig.base.json), `compilerOptions`, at `6eec9635c17674b89b8519c642eb48b51dbd6479`: the API maps both packages to `dist/index.d.ts`; the root config has no such paths. The WIRE workflow at `becf4ecdb32dac2a89e272db87243b1d4c38757f`, “Start candidate servers on this GitHub-hosted runner only,” invokes tsx through the API package without an explicit config. That workflow is absent from the inspected dev SHA; do not conflate these source baselines.
- `ai-status.json` (shared runtime machine truth), snapshot `2026-09-13T13:48:04Z`, `tasks[id=SR-CALL-MULTIORDER-20260913]`: status `blocked`, owner Gemini, reviewer Codex, `write_scopes=[]`, dependencies WIRE/Webhook. `SR-RELEASE-001.depends_on` includes it. [Question board](../../../../PHASE1_OPEN_QUESTIONS.md), Q-001 / Contract & Schema Synchronisation Backlog, and inventory §3.8 record the same planning hold.
- [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§0.5, 2, 4–5: acknowledge existing machine truth without self-authorizing execution or adding duplicate backlog.

#### Impact On Consensus

- Replace “P03 root cause undetermined” in current routing with “declaration-path runtime resolution diagnosed; review the proposed explicit root-config selection in the existing WIRE command, then verify the final candidate's complete hosted 5 API/SQL + 5 browser cases, zero skips and required CI.” The saved local probe does not certify hosted startup or product acceptance.
- Use the existing `SR-CALL-MULTIORDER-20260913` task for the §3.8 design refinements. Preserve its three acceptance keys: `call_multiorder_same_candidate_http_sql_ui_restart`, `call_multiorder_manual_voice_intent_idempotency`, and `call_multiorder_recording_scope_and_migration_integrity`. Empty scopes are a hold, not broad write permission.
- The registration was performed by the supervisor before this review; this dispatch creates or changes no task. Entries 14–15 supply further technical SD feedback for that existing route.

#### Remaining Question

- Disposition the proposed WIRE command change and Q-001 refinements; Academy projection consistency and C115 job discovery from Entries 11–12 still need their independent SD outputs.

### Entry 14 — Make voice command admission and execution intent-specific

Scope status: historical 1:N proposal, withdrawn from first-release work by the later board-recorded user direction in Entry 16. Independent C115 recording recovery remains in scope.

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude2 / Gemini / Claude; supervisor inventory §3.8
- Round: 1, technical follow-up
- Date: 2026-09-13

#### Claim Under Review

- The 1:N design removes per-call/per-session uniqueness, selects a verified intent, and preserves each intent's confirmation and receipt. Its listed executor change concentrates on the singular call-session link.

#### Review Outcome

- `confirm` the one-authority and per-intent deduplication direction; `refine` the admission/execution boundary and explicitly supersede the affected voice SD clauses.

#### Evidence

- [Question board](../../../../PHASE1_OPEN_QUESTIONS.md), Q-001, and [inventory](product-remediation-sa-sd-20260913.md), §§3.7–3.8: the user's confirmed 1:N rule permits a distinct order B after A; retrying A must still return A.
- [Voice SD](../../phase1-unattended-voice-booking-sd-20260906.md), §§1.9, 4.3, 5.2–5.4, 7.1–7.5, 9.1: the recorded engineering baseline combines one mutation controller per call, session-level commit/confirmation state, a one-create-intent limit and receipt-backed authorization. The latest Q-001 decision supersedes the cardinality limit; it does not remove controller ownership, confirmation evidence, scope checks or replay rules.
- [VoiceBookingCommandService](../../../../apps/api/src/modules/voice-booking/voice-booking-command.service.ts), `acceptNew`, at `6eec9635c17674b89b8519c642eb48b51dbd6479`: a new command requires session `commitStatus === "none"`, then writes session `commit_status='pending'`. [VoiceCommandRunnerService](../../../../apps/api/src/modules/voice-booking/voice-command-runner.service.ts), `execute`, at the same SHA: the bound-order query uses `voice_intent_id = $1 OR call_id = $2`; any matching row rejects execution, and success sets the session commit status to `succeeded`. These are additional barriers to B even if the unique indexes and singular link condition are changed.
- [VoiceBookingRepository](../../../../apps/api/src/modules/voice-booking/voice-booking.repository.ts), `findActiveCreateIntent`, and [authorization service](../../../../apps/api/src/modules/voice-booking/voice-booking-authorization.service.ts), `resolveBoundOrderId` / `getBoundBookingStatus`, at the same SHA: `LIMIT 1` currently selects the sole intent; the public bound-status operation takes capability claims without an intent selector and verifies a matching successful receipt. Multiple intents require an explicit selection contract through this public operation, not only a repository lookup change.

#### Impact On Consensus

| Boundary                        | Required SD refinement                                                                                                                                                                                                                                   | Acceptance consequence                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New intent after a result       | Specify how the current operation is selected and how dialog/commit/confirmation projections advance to B. Preserve A's durable intent, receipt and consumed confirmation. A blind reset of session flags cannot be the authorization for B.             | A succeeds; B obtains its own confirmation and reaches durable acceptance/execution; querying or replaying A throughout still returns A. B cannot consume A's ticket.                                         |
| Executor collision check        | Review the `OR call_id` bound-order query as well as the singular session update. Detect duplicate/conflicting effects for the selected intent using receipt/order identity, while retaining call/session/scope validation.                              | An order for A on the same call does not make B “manual reconciliation required.” Duplicate execution of B, including replacement-worker recovery, creates only B once.                                       |
| Public read and mutation target | Carry a server-verified intent/order selection through status, cancel and manual handoff. Validate the selected intent's session and resource scope plus matching receipt; missing or ambiguous selection must not choose an arbitrary first/last order. | Read/cancel A and B independently; deny a substituted foreign intent/order and receipt mismatch; manual retry of pending A cannot bypass its receipt by claiming a new key.                                   |
| Call-level concurrency          | Retain the single mutation controller, lease/input fences and fixed transaction lock order. Separate concurrent HTTP attempts from permission for simultaneous AI and human controllers.                                                                 | Distinct valid intents serialize safely; same-intent races deduplicate; a stale AI after human takeover cannot submit B. Unknown A results continue reconciliation, not automatic creation of another intent. |

- Suggested synthesis wording: “Q-001 changes the count of independently requested orders per call. Voice transaction identity remains intent/action based. Define the transition to a separately confirmed intent and update admission, executor collision checks, public selection and result projections together; retain the existing controller and receipt protections.”
- Before promotion, the supervisor should carry the scoped supersession into the existing voice SA/SD and linked task references, including SD §§7.2, 7.4–7.5 and 9.1. The inventory alone must not leave future workers reading an apparently current one-intent rule. This review does not edit those canonical sources or add execution scopes.

#### Remaining Question

- Review a concrete new-intent/continue-intent transition and public selection contract with the voice owner. The product cardinality is settled; the technical state projection is not yet specified by §3.8.

### Entry 15 — Specify recording recovery and the compatibility sequence for 1:N

Scope status: historical 1:N proposal, withdrawn from first-release work by the later board-recorded user direction in Entry 16. Independent C115 recording recovery remains in scope.

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude2 / Gemini / Gemini2 / Claude; Entry 12; supervisor inventory §§3.4, 3.8
- Round: 1, technical follow-up
- Date: 2026-09-13

#### Claim Under Review

- Querying all orders by callId and applying existing recording rules, then removing singular session fields after consumer cleanup, is sufficient for the 1:N transition.

#### Review Outcome

- `refine`: the direction needs explicit recovery and release compatibility conditions before it can be accepted.

#### Evidence

- [PRD](../../../../phase1_prd_detailed_v1.md), §§9.1.4, 9.7.1, 13.2, and [Service Contracts](../../../../phase1_service_contracts_v1.md), §§3.9, 4.5, 6.2, 7.1: every phone order remains traceable to its call/recording, CTI failure cannot silently lose orders, and recording reconciliation preserves the separate order and recording authorities.
- [CallcenterService](../../../../apps/api/src/modules/callcenter/callcenter.service.ts), `notifyRecordingStateChange`, at `6eec9635c17674b89b8519c642eb48b51dbd6479`: notification is skipped without `linkedOrderId`, and listeners are invoked without awaiting their results. [OwnedMobilityService](../../../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts), `handleCallRecordingStateChanged` / `handleVoiceCallRecordingStateChanged`, at the same SHA: voice processing catches and logs failures and has lifecycle/version guards; the non-voice non-ready branch directly sets `recording_pending`. Thus “existing rules” are not a uniform no-regression or durable fan-out guarantee. This is a source finding, not a reproduced production failure.
- [Migration Plan](../../../../phase1_migration_plan_v1.md), §§3.1–3.3, 7.1–7.2, 9.1–9.2: expand/backfill precede switching reads and cleanup; schema changes are forward-only and runtime rollback uses routing. [V0088](../../../../infra/migrations/V0088__voice_runtime_identity_linkage.sql), runtime linkage/index definitions, and [voice integrity check](../../../../operations/database/voice-runtime-integrity-check.sql), “Remediation runbook” and duplicate-call query, at the same SHA: the old checks classify multiple orders sharing a call as a conflict and even advise nulling conflicting fields. That instruction is incompatible with the accepted 1:N rule.

#### Impact On Consensus

| Boundary                       | Required design and verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording propagation          | Use call authority to identify related orders and existing owned-order operations to update each one. Define when the recording callback is acknowledged and how incomplete per-order work is rediscovered durably. A callback replay or a replacement process must complete B after A succeeded, without duplicating A's business effects. A loop over listeners or `Promise.all` alone does not establish durable recovery.                                                                                           |
| Ordering and late associations | Include recording-ready before B is created/linked, callback concurrent with B creation, and failure after updating only A. On recovery, both authorized associations must receive the applicable recording evidence. Reconcile from authoritative call/order state rather than depending on a later provider callback that may never arrive.                                                                                                                                                                           |
| Lifecycle protection           | Cross manual and voice orders with pre-dispatch, dispatched and terminal states. Apply the inventory's no-regression requirement explicitly; do not assume the voice-only guard already protects manual orders. Preserve voice checkpoint/manifest checks and record evidence exceptions without undoing completed dispatch. Any required service repair belongs to the existing supervisor-scoped repair route.                                                                                                        |
| Expand and backfill            | Inventory legacy singular links, missing reverse callId values and conflicting associations with resource IDs; define deterministic, audited backfill and checkpoint/retry behavior. Preserve valid A/B links and per-intent uniqueness. Update integrity queries and their remediation instructions together so legitimate shared callId values cannot trigger destructive “deduplication.”                                                                                                                            |
| Switch and cleanup             | State which API/worker/UI revisions can run against each schema step, how old writers/readers are drained or gated before B becomes possible, and which compatible runtime remains a rollback target after multi-order data exists. Remove singular generated fields only after consumer and data validation. One candidate SHA alone cannot make independently running revisions switch atomically. Any temporary compatibility projection is derived from the single authority, never a second writable relationship. |

- Add these cases to the existing Q-001 acceptance matrix and coordinate recording recovery with C115's still-pending job design in Entry 12. Preserve both parent acceptance gates; earlier webhook/voice results cannot be relabeled as verification of the later multi-order candidate.
- Suggested synthesis wording: “The order-side call association is authoritative. Callcenter derives all permitted linked orders. Durable reconciliation covers partial and late recording propagation; migration proceeds through validated compatibility steps, with no return to a one-order runtime after multi-order writes unless it can preserve and correctly handle those records.”

#### Remaining Question

- Name the existing durable recovery operation and its completion/acknowledgement rule, then specify the migration compatibility and rollback matrix. These are technical SD outputs for the existing tasks, not a request to reconsider 1:N or permission to execute a migration.

### Entry 16 — Apply the recorded launch-scope correction to Q-001

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude / all current reviewers; Entries 9, 11, 13–15; inventory §§3.5, 3.7–3.8, 3.10, 4
- Round: 1, scope reconciliation
- Date: 2026-09-13

#### Claim Under Review

- Earlier review pointers treated multi-order technical SD, migration and acceptance as required before release; the supervisor has now withdrawn that scope.

#### Review Outcome

- `confirm` the supervisor's scope correction; `reject` carrying the earlier multi-order release requirement forward. Preserve the earlier discussion as history.

#### Evidence

- `ai-status.json` (shared runtime machine truth), snapshot `updated_at=2026-09-13T14:02:27Z`, `tasks[id=SR-CALL-MULTIORDER-20260913].title`, `.next`, `.last_update`: the supervisor records “WITHDRAWN BY USER” and first operational release as one call / one order. The task remains `blocked` with empty write scopes because the board has no cancellation state; its latest note explicitly says it is neither a launch blocker nor completed implementation.
- The same snapshot, `tasks[id=SR-RELEASE-001].depends_on` and `.next`: only the withdrawn multi-order dependency was removed; the previous QA dependencies and acceptance remain. `execution_mode=discussion_planning` and `discussion_loop.current_owner=Codex` are unchanged. This is the supervisor's recorded user direction, not a new user quotation supplied by this review.
- [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§0.5, 2, 4–6: latest user direction controls scope; machine truth controls routing; the supervisor records transitions. A historical task's older acceptance or integration notes cannot reinstate withdrawn work.
- [Question board](../../../../PHASE1_OPEN_QUESTIONS.md), Resolved Items / Q-001 and Contract & Schema Synchronisation Backlog; [inventory](product-remediation-sa-sd-20260913.md), §§3.5, 3.7–3.8, 3.10, 4; [baton log](baton-log.md), User launch-scope revision at `2026-09-13T14:04:55.309086+00:00`: the supervisor synchronized these shared records during review. They now retain at most one order per call, withdraw the multi-order proposal, apply recording recovery to the single linked order, and separate the withdrawn record from launch backlog. This supersedes the stale copies seen at initial inspection.

#### Impact On Consensus

| Earlier material                                                               | Current disposition                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry 9 resolution; Entry 11 Q-001 row                                         | Superseded for first-release scope. Do not repeat the cardinality question or present 1:N as the active answer.                                                                                                                    |
| Entry 13 Q-001 registration; inventory §4 release prerequisite                 | Retain the registration as history. The task is withdrawn, not waiting for SD completion, credentials or expanded scopes; it is no longer a release prerequisite.                                                                  |
| Entry 14; Entry 15 multi-order association, fan-out and migration requirements | Archive as unaccepted design for withdrawn work. No index removal, new-intent redesign, multi-order UI or compatibility migration is requested for this release.                                                                   |
| Entry 12 and independent recording concerns in Entry 15; inventory §3.10       | Retain C115 recovery for the existing call/order relationship: durable pending work, verified recording evidence, restart, replay and lifecycle protection. Remove the dependency on multi-order fan-out from the active proposal. |

- Suggested synthesis wording: “The first operational release uses one call / one order. Multi-order work is withdrawn and excluded from release prerequisites. Continue the existing booking, dispatch, driver, billing and required QA/live closure. Recording recovery and credential-expiry/alert acceptance remain required under their existing tasks.”
- Carry inventory §§3.7–3.8's current-flow acceptance into the existing booking/callcenter QA: same request returns the original order; distinct/manual/voice races create at most one; cancel/complete do not release the call limit; rejection preserves the first order and recording; restart and cross-scope negatives remain covered. Preserve any conflicting historical data for investigation rather than deleting it. This is review of the recorded design, not a new implementation task.
- Q-001 and the inventory are already synchronized. The withdrawn task's older `integration_notes` still describe resuming 1:N after SD; the supervisor should reconcile that stale note with its latest `next` field when publishing the disposition. Preserve history and the blocked-state explanation; do not mark implementation done, recreate the task or automatically resume it. This dispatch performs no board transition.

#### Remaining Question

- None on call cardinality for this release. Publish the synchronized records and reconcile the older task note through the supervisor; continue the remaining operational SA/SD review.

### Entry 17 — Carry the new Academy and recording findings into bounded SD review

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude2 / Gemini / Gemini2 / Claude; Entries 7, 11–12; inventory §§3.9–3.10
- Round: 1, technical synthesis
- Date: 2026-09-13

#### Claim Under Review

- Academy should reuse one qualification derivation and synchronize its regulatory projection; C115 recording work should reuse the existing voice queue and complete only after verified durable effects.

#### Review Outcome

- `confirm` the inspected reuse direction and source findings; `refine` the remaining completion and authority boundaries. These proposals still need cross-lane disposition, not another product cardinality decision.

#### Evidence

- [PRD](../../../../phase1_prd_detailed_v1.md), §§9.6.2, 9.7.1, and [Service Contracts](../../../../phase1_service_contracts_v1.md), §§2.5, 3.3, 3.9: qualification guards and recording traceability remain separate domain responsibilities. [Acceptance scenarios](../../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md), SC-003–004 and SC-024–025, retain recording completion, expiry alerts and backend eligibility guards under one-call/one-order scope.
- [AcademyService](../../../../apps/api/src/modules/driver-academy/academy.service.ts), `listRecords` / `recomputeRegulatoryProjection`, and [academy-domain](../../../../apps/api/src/modules/driver-academy/academy-domain.ts), `trainingRecord`, inspected at `6eec9635c17674b89b8519c642eb48b51dbd6479`: records and projection are currently derived from separate reads/times; projection writes cover passed/expired and return early with no required courses. Current-version filtering and expiry calculation already exist in `trainingRecord`. This confirms inventory §3.9's static finding; no database failure was reproduced.
- [Academy identity decision](../../../04-uat/system-remediation-20260906/academy-identity-decision.md), §§2.2–2.3, and [inventory](product-remediation-sa-sd-20260913.md), §3.9: the existing regulatory write grant is narrow; proposed invalidation back to pending and treatment of existing waived records require explicit design disposition and scoped authority before workers change them.
- [VoiceCommandRunnerService](../../../../apps/api/src/modules/voice-booking/voice-command-runner.service.ts), `enqueueWorkItem`, `runOnce`, `dispatchWorkItem`, `handleFinalizeRecording`, at the same SHA: enqueue accepts a transaction; claim/retry/completion use durable work and lease epochs. The built-in finalizer only returns metadata, after which `runOnce` completes the item. Unknown work types also return without domain work. This confirms the built-in handler gap; it does not establish which handlers or processes run in shared dev.

#### Impact On Consensus

| Boundary                             | Concrete SD output still needed                                                                                                                                                                                                                                                                       | Acceptance consequence                                                                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Academy derivation / projection      | One current-course/attempt snapshot and `asOf` for the existing calculation; define projection invalidation, waiver provenance and the narrow write-grant amendment. Specify how concurrent quiz/course updates prevent an older result overwriting a newer projection.                               | Same-input records/qualification/projection agree; course changes, expiry, empty required courses and existing waived data are explicit cases. Failed persistence cannot be reported as synchronized; assignment rechecks current qualification. |
| Recording producer / completion      | Identify the trusted close-event or pending-recording source, enqueue transaction boundary, existing media/API result transport, verification step and acknowledged call/order persistence. Use the current single linked order after Entry 16.                                                       | Persist pending work, replace the process, recover the same work/resource IDs and verify recording/domain readback. A returned `handled=true` or a completed work row alone is insufficient.                                                     |
| Recording leases / handler readiness | Name the actual deployment start/drain hook and supported handler types. Specify protection for domain writes and external finalization when a lease expires; completion-row fencing alone does not prove those effects are fenced. Unhandled recording work must not count as successful completion. | A stale worker cannot overwrite the replacement worker's result. Interruption after media finalization but before acknowledgement reuses the verified result; replay creates no duplicate business effects.                                      |
| Credential expiry / alerts           | Keep a separate regulatory domain trigger and durable due-work/alert receipt path; the Academy authority supplies training results where applicable. Inventory §3.10 still lacks the concrete deployed entry and durable delivery path.                                                               | Catch-up works without user reads. Expiry blocks dispatch immediately; alert creation, durable delivery and recipient receipt remain distinguishable evidence.                                                                                   |

- Carry these outputs into the existing WIRE and C115 design routes. The inspection identifies no need for a second eligibility algorithm, queue or delivery service. If accepted findings require product repair beyond QA scopes, the supervisor must record that repair and exact ownership before execution, as required by the collaboration guide §§0.5 and 5.
- Entries 11–12 still govern clock-in persistence and runner coverage; Entry 13's P03 loading diagnosis stands independently of its withdrawn Q-001 route. Keep WIRE's full same-candidate 5 API/SQL + 5 browser cases, zero skips and CI, all three webhook acceptance keys, and the separate live receipt gates. No new test or hosted-run result is claimed.

#### Remaining Question

- Supervisor/capability-owner disposition of the four technical outputs above, including the concrete persistence and deployed trigger/transport choices. P05 remains on its existing product/device decision route. No implementation is dispatched by this synthesis.

### Entry 18 — Define credential event identity and notification handoff recovery

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude2 / Gemini / Gemini2 / Claude; Entry 17; inventory §§3.9, 3.11
- Round: 1, recovery design review
- Date: 2026-09-13

#### Claim Under Review

- The new Registry reconciliation operation can recover overdue credentials from PostgreSQL, suppress obsolete renewal events and reuse the existing notification service with an idempotency key.

#### Review Outcome

- `confirm` the bounded Registry operation and overdue-work direction; `refine` event identity, renewal ordering and the durable handoff to notification delivery. The new inventory supplies proposed trigger/transaction choices; do not keep describing those choices as wholly unspecified.

#### Evidence

- [Inventory](product-remediation-sa-sd-20260913.md), §3.9 item 4 and §3.11 items 1–6: the supervisor now proposes a shared Academy transaction, an API lifecycle trigger, overdue-source discovery, a dedicated Registry processing record, lease protection and separate notification results. These remain submitted SD, not accepted implementation scopes.
- [PRD](../../../../phase1_prd_detailed_v1.md), §§9.6.2, 9.6.4; [Service Contracts](../../../../phase1_service_contracts_v1.md), §§3.3, 3.13, 7.1; [acceptance scenarios](../../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md), SC-024–025: current eligibility and expiry alerts retain their existing authorities, including the vehicle-insurance case.
- [RegulatoryRegistryService](../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts), `listExpiringDriverLicenses` / `areDriverLicensesValid`, at `6eec9635c17674b89b8519c642eb48b51dbd6479`: the query selects active drivers with at least one expiry in the future window, while the validity helper rejects a date at or before the reference time. Repeating that query misses drivers whose dated credentials are all overdue. [Registry repository](../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts), `persistChangesInternal` / driver upsert, at the same SHA: expiry fields are in the JSON record; every driver write sets the row's `updated_at` anew. That timestamp is not a credential-specific revision.
- [NotificationDeliveryService](../../../../apps/api/src/modules/notification-delivery/notification-delivery.service.ts), `enqueue`, `dispatch`, `drain`, and [delivery types](../../../../apps/api/src/modules/notification-delivery/notification-delivery.types.ts), `EnqueueMail`, `ProviderAcknowledgement`, at the same SHA: deduplication uses tenant plus key and rejects a changed recipient/content hash. The core preserves uncertain attempts and late provider acceptance; `sent` means provider acceptance, not recipient receipt. [FileMailOutbox](../../../../apps/api/src/modules/notification-delivery/file-mail-outbox.ts), class contract / `transaction`, provides a separate storage transaction with a single-host/shared-local-volume guarantee.

#### Impact On Consensus

| Boundary                | Proposed refinement before acceptance                                                                                                                                                                                                                                                                                                                                                                            | Verification consequence                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential identity     | Name the exact credential source revision or canonical fingerprint and its authorized scope mapping. Do not use the driver's general `updated_at` as the event version. Compare the current credential again within the transaction that records the event disposition; a claim lease alone does not serialize renewal writes.                                                                                   | Unrelated driver writes do not create another expiry alert; a real renewal/correction is distinguishable. Cover renewal before claim and between validation and persistence, using retained IDs.                                                    |
| Event → delivery        | Persist the authorized notification request identity and stable recipient/content snapshot with the pending handoff. Re-enqueue with that same key and payload after a crash, then persist/read back its delivery ID. A Registry transaction cannot by itself make the separate outbox commit atomic. Recipient/routing changes need an explicit disposition rather than changing the payload under the old key. | Crash after event commit but before enqueue, and after enqueue but before saving the receipt reference. Recovery reaches the original delivery without an idempotency conflict or duplicate logical alert. Missing durable storage remains visible. |
| Renewal / late evidence | Keep event supersession separate from delivery-attempt history. Recheck obsolete unsent work before sending; preserve acceptance already returned by the provider for an earlier attempt, even after renewal or lease replacement. Fence stale Registry state writes without erasing that evidence or claiming a sent alert was recalled.                                                                        | Late failure cannot overwrite known acceptance. Distinguish pending handoff, provider acceptance and actual recipient evidence; local deduplication alone does not establish exactly-once external delivery.                                        |
| Expiry coverage         | Map Academy expiry and SC-024 insurance expiry to their existing due-work sources and owners alongside the three driver date fields. The driver-date scan alone does not enumerate either population. Carry §3.9's proposed shared transaction forward for review; preserve its pending waiver/write-grant disposition.                                                                                          | An expired course with all driver licenses valid, and an expired vehicle policy, retain their independent guards/alert requirements. Record where each case is covered before claiming C115 complete.                                               |

- Suggested synthesis wording: “Registry owns expiry reconciliation and event disposition; notification delivery owns its attempts and receipts. Recovery retains a stable credential identity and notification request across both persistence boundaries. Academy and insurance cases retain their own source mapping and qualification rules.”
- These are refinements to the existing C115/WIRE design routes. Before execution, the supervisor must publish the accepted design and record any required product repair beyond the QA task's scopes. No new event bus, delivery service, task or migration is created by this review.

#### Remaining Question

- Capability owners should disposition the credential-version/scope mapping, event-to-delivery recovery contract and Academy/insurance coverage. The inventory's proposed API trigger still needs environment evidence; this review performs no live check.

### Entry 19 — Make recording close replay and runner activation explicit

#### Metadata

- Reviewer lane: Codex
- Target lane: Claude2 / Gemini / Gemini2 / Claude; Entries 12, 17; inventory §3.12
- Round: 1, recovery design review
- Date: 2026-09-13

#### Claim Under Review

- Trusted close events can use the existing session-event authority, create finalization work with session closure, call the recorder adapter and activate the existing API runner lifecycle.

#### Review Outcome

- `confirm` the reuse and explicit missing-adapter disclosure; `refine` the close-event replay boundary, supported work types and recovery coverage. This advances §3.12 without accepting unspecified transports or claiming a deployed loop exists.

#### Evidence

- [Voice SD](../../phase1-unattended-voice-booking-sd-20260906.md), §§3.4, 5.4, 7.3, 9.1: closed sessions stop new passenger commands while accepted commands and reconciliation continue; session events are append-only and work is durable. [Service Contracts](../../../../phase1_service_contracts_v1.md), §§6.2, 8.1, and [API examples](../../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md), §3.16: recording callbacks retain trusted provider timestamps, replay protection and call-only indexing when no order exists.
- [VoiceSessionService](../../../../apps/api/src/modules/voice-booking/voice-session.service.ts), `recordControlEvent` / `closeSession`, and [session repository](../../../../apps/api/src/modules/voice-booking/voice-session.repository.ts), `insertControlEvent`, at `6eec9635c17674b89b8519c642eb48b51dbd6479`: event insertion and later application are separate calls; a duplicate event returns early. `closeSession` also returns early for an already closed session. Event deduplication alone therefore does not establish that the proposed close/enqueue effects occurred.
- [VoiceCommandRunnerService](../../../../apps/api/src/modules/voice-booking/voice-command-runner.service.ts), `enqueueWorkItem`, `runOnce`, `dispatchWorkItem`, `startBackgroundLoop`, at the same SHA: enqueue does nothing on a duplicate key; claims default to every work type unless `supportedTypes` is supplied. Several built-in downstream handlers return metadata, and unknown types return `unhandled` before completion. Exhausted failures remain `failed`, outside the pending/expired-lease claim query.
- [FinalRecordingManifests](../../../../apps/voice-media-worker/src/recording/final-manifest.ts), `seal` / `read`, and [VoiceEvidenceService](../../../../apps/api/src/modules/voice-booking/voice-evidence.service.ts), access/reader interfaces, at the same SHA: finalization uses the close ledger and checkpoint references, while the current API reader is confirmation-oriented. Inventory §3.12 correctly describes the final-manifest adapter/verification extension as proposed, rather than an existing HTTP/RPC endpoint.
- Concurrent [inventory](product-remediation-sa-sd-20260913.md), §3.12 addition: the supervisor now explicitly includes ordinary Callcenter close/pending producers, nullable voice-session linkage, recovery of historical pending sessions and server-selected evidence requirements. Confirm this proposal; retain its separate controlled-adapter versus actual-provider evidence boundary.

#### Impact On Consensus

| Boundary                | Proposed refinement before acceptance                                                                                                                                                                                                                                                                                                                                  | Verification consequence                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Close-event application | Specify either the same transaction for trusted event acceptance, closure and enqueue, or a durable unapplied-event recovery rule. A duplicate event or already closed dialog must verify the matching finalization work/effects. Validate the retained event/work binding and payload on a dedupe hit; a reused identifier is not proof of an equivalent close event. | Crash after event insertion and before closure/enqueue; replay after closed state; conflicting payload under the same event/work key; stale leg/media epoch. Exactly one matching work item survives, and accepted booking receipts remain unchanged. |
| Runner activation       | Inventory each claimed work type and its actual registered handler before connecting the lifecycle hook. Supply an explicit supported-type composition; do not let a newly started loop silently complete unrelated metadata-only handlers. Preserve already accepted command recovery through the reviewed composition.                                               | Mixed pending work includes recording, accepted commands and an unsupported type. Only verified durable outcomes can complete their work; absent adapter/handler readiness is observable.                                                             |
| Retry exhaustion        | Specify an authorized repair/retry operation through the existing voice owner for exhausted recording work, retaining its identity and attempt history. Re-enqueueing the same key currently cannot revive a failed row. Never manufacture a new key merely to evade a failure or erase earlier evidence.                                                              | Exhaust attempts, restore the dependency and use the reviewed recovery path. Reuse verified media results after interruption; stale workers cannot overwrite newer domain results.                                                                    |
| Call/order coverage     | Carry the newly recorded ordinary-call producer/recovery map forward, including historical pending calls. Add explicit no-order coverage. Preserve call-only recording indexes, the ordinary callback's own evidence rules and the sole linked order where present. Do not fabricate a voice session or require a booking confirmation for a call that never booked.   | Voice and ordinary phone paths recover with zero or one order. Ready-before-link, failed/late callbacks and terminal orders preserve existing evidence and lifecycle; multi-order fan-out remains withdrawn.                                          |

- Carry the new lifecycle/adapter proposals forward to the current review order. Keep Entry 12's hosted process replacement and domain readback, full WIRE acceptance, all three webhook keys and UV-EXEC-028's separate live/PSTN gates. Source inspection and a deployment-check script's exit status cannot establish those outcomes.

#### Remaining Question

- Disposition the event transaction/replay rule, actual adapter and handler composition, exhausted-work recovery and zero-order/historical-backlog verification of the newly recorded ordinary-call map. These are bounded engineering outputs for the supervisor's existing routes; no implementation or environment operation is dispatched here.

### Entry 20 — Settle API lifecycle hooks, outbox deployment compatibility, and handler composition

#### Metadata

- Reviewer lane: Gemini
- Target lane: Codex / Claude2; Entries 7, 12, 18, 19; supervisor inventory §§3.2, 3.10–3.12
- Round: 1, reopened technical review
- Date: 2026-09-13

#### Claim Under Review

- Adding `startBackgroundLoop` to API startup, running `FileMailOutbox` in Cloud Run, and relying on `handleFinalizeRecording`'s metadata return provides durable execution for C115 background jobs.

#### Review Outcome

- `refine`: specify production lifecycle hooks (`OnApplicationBootstrap` / `BeforeApplicationShutdown`), DB-backed outbox or persistent staging volume constraints, and explicit `supportedTypes` composition to prevent silent metadata-only completion of unhandled items.

#### Evidence

- [VoiceCommandRunnerService](../../../../apps/api/src/modules/voice-booking/voice-command-runner.service.ts), `handleFinalizeRecording` (:562), `dispatchWorkItem` (:451), `startBackgroundLoop` (:621), `drain` (:647) at `6eec9635c17674b89b8519c642eb48b51dbd6479`: claims default to all work types unless `supportedTypes` is passed; unknown types log and return `unhandled`, but several downstream handlers return metadata only while `runOnce` marks the item completed.
- [FileMailOutbox](../../../../apps/api/src/modules/notification-delivery/file-mail-outbox.ts), class contract and `transaction` (:45): explicitly specifies a single-host / shared POSIX filesystem requirement.
- [Cloud Run staging descriptor](../../../../infra/gcp/staging/api-service.yaml): Cloud Run is a stateless container execution environment where local filesystem `/tmp` is ephemeral per-instance and discarded on scale-to-zero or replacement.
- [API tsconfig](../../../../apps/api/tsconfig.json), `compilerOptions.paths` mapping `@drts/contracts` to `dist/index.d.ts`, versus [root tsconfig](../../../../tsconfig.base.json) mapping to package exports: confirms P03 diagnosis where `tsx` loader from `apps/api` resolves declarations instead of JS exports, resulting in `MAINTENANCE_STATUSES is not iterable`.
- [Tenant runner](../../../../.github/workflows/tenant-uat-acceptance.yml): candidate validation, API restart, DB retention, and restart readback are proven on GitHub Actions hosted runners.
- [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §0.5 and user `AGENTS.md` VM restriction: product, browser/E2E, and Compose servers must not run on this local planning VM.

#### Impact On Consensus

| Boundary | Concrete engineering specification | Verification and runtime consequence |
| --- | --- | --- |
| P03 WIRE runtime packaging | WIRE workflow startup command explicitly invokes `tsx --tsconfig ../../tsconfig.base.json` (or root config) from `apps/api`. No runtime `require.cache` patching or build-order hack. | Packages resolve runtime JS `dist/index.js`; `MAINTENANCE_STATUSES` is an iterable array; `extractIapJwtAssertion` is a callable function. Candidate server boots cleanly on hosted CI. |
| API lifecycle hooks | Wire `VoiceCommandRunnerService.startBackgroundLoop` to NestJS `OnApplicationBootstrap` in `VoiceBookingModule` and `drain` to `BeforeApplicationShutdown` (or `OnModuleDestroy`). | Background runner starts only once with the API server lifecycle and drains cleanly on SIGTERM. Container termination waits for in-flight lease release rather than dropping work mid-execution. |
| Handler composition & type filtering | `VoiceCommandRunnerService.runOnce` must pass `supportedTypes: ['finalize_recording']` (plus verified active handlers) into `claimWorkItems`. Stubs and metadata-only handlers must not be claimed. | Work items for unsupported or stub handlers remain pending or rejected rather than falsely marked `completed` with metadata. |
| Outbox deployment compatibility | Because Cloud Run local storage is ephemeral, `FileMailOutbox` cannot guarantee durable delivery across container restarts unless mounted on persistent volume. The canonical outbox pattern must persist pending handoffs in PostgreSQL (`notif.phase1_mail_outbox`) before delivery. | Container replacement or restart during notification delivery recovers pending records from DB; local disk wiping does not lose notification backlog. |
| VM restriction & runner execution | Reaffirm strict VM restriction: no product servers, DB instances, or Cypress/Playwright browsers may run on this development VM. | Controlled C111–C115 verification runs via extended `tenant-uat-acceptance.yml` on hosted GitHub Actions runners; this planning session generates documentation and configuration specifications only. |

- Suggested synthesis wording: “API lifecycle hooks manage runner activation and graceful drain; worker claims enforce strict supported-type whitelisting. Notification outbox durability requires database-backed pending persistence for stateless Cloud Run compatibility. P03 loader fix uses explicit root tsconfig in runner startup without altering package export contracts.”
- This resolves the runtime packaging, lifecycle hooks, and outbox compatibility requirements from Gemini's capability lane.

#### Remaining Question

- None on API lifecycle hooks, loader invocation, or VM restriction. Final CI verification awaits hosted workflow execution in post-planning dispatch.

### Entry 21 — Reconcile Academy/Insurance authority, credential renewal ordering, and close-event replay boundaries

#### Metadata

- Reviewer lane: Gemini (incorporating Claude2 transferred review obligations)
- Target lane: Codex / Claude2 / Claude; Entries 8, 11, 17, 18, 19; supervisor inventory §§3.1, 3.9, 3.11, 3.12
- Round: 1, reopened technical review
- Date: 2026-09-13

#### Claim Under Review

- Academy projection recomputation and Registry credential expiry can be treated as generic background sweeps without coordinated database transactions, credential fingerprints, vehicle insurance mapping, or ordinary-call close replay.

#### Review Outcome

- `refine`: establish strict single-transaction authority boundaries for Academy projection, credential fingerprinting and renewal supersession, SC-024 vehicle insurance expiry mapping, and atomic close-event recording enqueue across voice and ordinary calls.

#### Evidence

- [AcademyService](../../../../apps/api/src/modules/driver-academy/academy.service.ts), `listRecords` / `recomputeRegulatoryProjection`, and [academy-domain.ts](../../../../apps/api/src/modules/driver-academy/academy-domain.ts), `trainingRecord` (:134) at `6eec9635c17674b89b8519c642eb48b51dbd6479`: current dual-read creates race conditions between query output and regulatory projection; `academy-identity-decision.md` §2.3 lacks explicit authority to invalidate stale `passed` status to `pending`.
- [ShiftAttendanceService](../../../../apps/api/src/modules/shift-attendance/shift-attendance.service.ts), `clockIn` (:96) and `persist` (:320): `this.persist` is un-awaited background `void`, risking in-memory shift survival without durable DB record.
- [RegulatoryRegistryService](../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts), `listExpiringDriverLicenses` (:1840) and `areDriverLicensesValid` (:1910): queries only forward window `[now, cutoff]`; historical expired records are excluded.
- [Contracts and Acceptance Scenarios](../../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md), SC-024: vehicle insurance policy expiration (`valid_until`) is an independent dispatch barrier and alert requirement alongside driver license expiration.
- [CallcenterService](../../../../apps/api/src/modules/callcenter/callcenter.service.ts), `notifyRecordingStateChange`, and [VoiceSessionService](../../../../apps/api/src/modules/voice-booking/voice-session.service.ts), `closeSession`: call closure and recording finalization enqueue must share atomic transaction semantics.
- [FinalRecordingManifests](../../../../apps/voice-media-worker/src/recording/final-manifest.ts), `seal` (:29): final manifest sealing uses immutable checkpoints and ledger verification.

#### Impact On Consensus

| Domain Boundary | Required engineering specification | Verification and integrity consequence |
| --- | --- | --- |
| Clock-in persistence contract | `ShiftAttendanceService.clockIn` must return `Promise<ShiftRecord>` that awaits `repository.persistChanges(...)`. Rejection or DB failure must throw `ApiRequestError` and rollback in-memory state; no synthetic active shift may be returned. | Calling clock-in succeeds only when durable DB row exists. Server crash immediately after clock-in preserves shift state on restart readback. |
| Academy atomic projection | `recomputeRegulatoryProjection` must execute in a single PoolClient transaction: read current courses/attempts with immutable `asOf`, evaluate status via `trainingRecord`, and update `reg.driver_reg_profiles.training_status`. Amend `academy-identity-decision.md` §2.3 to explicitly authorize invalidating stale `passed` status to `pending`. | Incomplete or expired mandatory courses immediately invalidate `passed` to `pending`. Empty course catalogs evaluate to `pending`, never `passed`. Soft overrides cannot bypass `trainingRequired: true`. |
| Credential identity & renewal ordering | Expiry event identity is defined as `(scope, driverId, credentialType, credentialFingerprint)` where `credentialFingerprint = sha256(expiryDate + credentialNumber)`. Driver table `updated_at` must not be used as version. | Unrelated driver profile edits do not create false expiry alerts. When a driver renews a license before or during sweep, the processing transaction detects the changed fingerprint and marks the older event `superseded`. |
| Vehicle insurance mapping (SC-024) | `reconcileExpiredCredentials` must map `reg.phase1_insurance_policies.valid_until` alongside driver licenses. Overdue vehicle insurance blocks vehicle dispatchability and triggers a fleet-level alert receipt. | Vehicle insurance expiry is verified independently of driver licensing, fulfilling SC-024 without requiring separate scheduler jobs. |
| Close-event atomic replay & ordinary calls | `VoiceSessionService.closeSession` must wrap session dialog status update and `enqueueWorkItem('finalize_recording')` in `VoiceSessionRepository.withTransaction`. Duplicate close events verify the existing work item and return idempotently without duplicate enqueues. Ordinary callcenter calls enqueue `finalize_recording` with `voice_session_id = NULL` and `call_id`. | Process crash after event receipt cannot lose finalization work. Replayed close events do not create redundant work items. Ordinary and AI phone calls use the unified recording runner. |
| Zero-order & single-order coverage | When a call terminates without booking an order (0 orders), recording is sealed and indexed to `call_id` in callcenter audit without requiring an order reference. For booked calls, exactly one order is linked per user launch scope. | Calls with 0 orders preserve compliance audio. Multi-order fan-out remains withdrawn; single-order linkage is verified. |
| Retry exhaustion & ops recovery | Work items reaching `max_retries` transition to `failed` with captured error stack. An authorized ops retry operation re-enqueues the item using the same work item ID and audit trail, preserving historical attempt logs. | Failed recordings cannot be silently discarded or bypassed with fabricated keys. |

- Suggested synthesis wording: “Clock-in and Academy projection enforce atomic database persistence before success acknowledgement. Credential expiry relies on content-fingerprinted event identity, renewal supersession, and unified driver/vehicle insurance mapping. Recording finalization operates atomically across ordinary and voice calls, guaranteeing zero-order audio compliance and single-order operational launch bounds.”
- This satisfies the technical review obligations transferred from Claude2 and establishes the concrete engineering boundaries for Gemini2's second-pass review.

#### Remaining Question

- None on domain boundaries or transaction semantics. Next review by Gemini2 will examine crash points across commit boundaries and multi-replica concurrency.

### Entry 22 — Settle C113/C114 runner test boundaries, and resolve P06 shared-dev deployment health under accepted realm auth

#### Metadata

- Reviewer lane: Gemini
- Target lane: Codex / Claude; Entries 8, 10, 12; supervisor inventory §§2 P04, P06, §§3.2, 3.4
- Round: 1, reopened technical review
- Date: 2026-09-13

#### Claim Under Review

- C113 billing resend/reconcile and C114 geocoding fail-closed can be verified with in-memory repository stubs or unconfigured provider assertions, and shared-dev 403 responses indicate Cloud Run deployment failure requiring public IAM relaxation.

#### Review Outcome

- `refine`: mandate real PostgreSQL persistence for C113 reconciliation/idempotency in the hosted runner, require mock upstream HTTP error simulation (timeout/500) for C114 fail-closed and error mapping, and resolve P06 by separating unauthenticated container health probes (`/healthz`) from authenticated role verification under `SD-DP-20260429-001` without weakening Cloud Run IAM.

#### Evidence

- [SD-DP-20260429-001](../../../01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md), Realm Matrix: control-plane (`platform`, `ops`) requires perimeter Cloud IAP (`x-drts-authorization`), while business-plane (`tenant`, `partner`, `driver`) uses application auth. Anonymous curl returning 403 from Google Frontend (GFE) is expected perimeter defense, not a container defect.
- [GeoService](../../../../apps/api/src/modules/geo/geo.service.ts), `assertProviderUsable` (:207), `withProviderErrorMapping` (:240): `MAP_PROVIDER_FAIL_CLOSED=true` with unconfigured provider throws `GEO_PROVIDER_NOT_CONFIGURED`. Verifying fail-closed behavior under provider failure requires a configured provider mock returning HTTP 504 (timeout) or HTTP 429/500 to exercise `withProviderErrorMapping` and emit typed `ApiRequestError` with metrics recording.
- [BillingSettlementService](../../../../apps/api/src/modules/billing-settlement/billing-settlement.service.ts), `reconcile` / `resolveReconciliationIssue`: ledger differences and resends must execute transactional adjustments against `BillingSettlementRepository` and PostgreSQL, ensuring duplicate webhook transmissions with the same idempotency key return idempotent receipts without duplicate financial entries.
- [Tenant runner](../../../../.github/workflows/tenant-uat-acceptance.yml) at `6eec9635c17674b89b8519c642eb48b51dbd6479`: provides hosted PostgreSQL container lifecycle, candidate SHA validation, and API restart verification. Extending it with sub-suites for C113 and C114 avoids redundant runners while enforcing real database persistence.
- [Cloud Run staging descriptor](../../../../infra/gcp/staging/api-service.yaml) and [deploy-dev workflow](../../../../.github/workflows/deploy-dev.yml): deployment health check must target dedicated unauthenticated health endpoints (`/healthz`) rather than protected application routes.
- [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §0.5 and user `AGENTS.md` VM restriction: strictly enforce VM restriction; no live servers, databases, or browsers run on this development VM.

#### Impact On Consensus

| Domain Boundary | Required engineering specification | Verification and runtime consequence |
| --- | --- | --- |
| C113 Billing mapping, resend & reconcile | Webhook test harness must execute against real PostgreSQL in hosted CI (`tenant-uat-acceptance.yml`). Assert duplicate event delivery with identical idempotency key returns HTTP 200 with matching receipt and zero new ledger records. Discrepancy resolution must generate an auditable ledger adjustment transaction, not an in-memory flag flip. | Multi-tenant financial data is protected from duplicate settlement execution; reconciliation produces immutable audit entries linked to source receipts. |
| C114 Geocoding & ETA fail-closed | Test harness must configure mock provider simulating HTTP 504 timeout and HTTP 500 outage. Verify `GeoService.withProviderErrorMapping` captures `GeoProviderError` and returns typed `ApiRequestError` (`GEO_PROVIDER_TIMEOUT`, `GEO_PROVIDER_UNAVAILABLE`) with metrics emitted to `MapGeofenceObservabilityService`. Catch-and-swallow or fake 0 ETA fallbacks are strictly prohibited. | Upstream provider outages trigger fail-closed dispatch protection with full metric traceability rather than silently dispatching drivers on invalid zero-distance estimates. |
| P06 Shared Dev 403 & Deployment Health | Container readiness probe in Cloud Run must query `/healthz` or unauthenticated `/api/health`. Separate automated deployment smoke check into unauthenticated infra health (`/healthz`) and authenticated role probe using synthetic test tokens per `SD-DP-20260429-001`. Do not relax Cloud Run IAM or remove IAP perimeter defense to satisfy naive curl commands. | Cloud Run health check passes cleanly while perimeter IAP and application authentication boundaries remain intact; tenant and ops planes stay isolated. |
| Runner harness architecture | Extend `tenant-uat-acceptance.yml` with isolated step jobs for C113, C114, and C115 against candidate SHA, preserving original tenant gate thresholds (>=10 HTTP tests, 8 spec files, >=27 unit tests, >=12 restart readbacks). | Reuses proven DB-persistence and restart harness without spawning fragmented runner configurations or bypassing existing tenant coverage. |

- Suggested synthesis wording: “C113 financial reconciliation and C114 geocoding fail-closed behavior require real database persistence and explicit provider-failure simulation in the hosted runner. P06 deployment health check targets dedicated /healthz endpoints without compromising Cloud Run IAM or perimeter IAP boundaries.”
- This completes the technical review obligations of Gemini's capability lane across runtime packaging, CI/CD, and infrastructure boundaries.

#### Remaining Question

- None on test harness architecture, error mapping, or realm authentication posture. Execution of the extended runner awaits auto-worker implementation and hosted CI execution.

### Entry 23 — Second-pass review: crash points, commit boundaries, and transactional outbox recovery across event/enqueue/receipt lifecycles

#### Metadata

- Reviewer lane: Gemini2
- Target lane: Gemini / Codex; Entries 18, 20, 21; supervisor inventory §§3.10–3.12
- Round: 1, reopened second-pass review
- Date: 2026-09-13

#### Claim Under Review

- Atomic transactions within application domain boundaries combined with post-commit enqueue or in-memory queues are sufficient to prevent data loss or duplicate execution during process crashes and container recycling.

#### Review Outcome

- `refine`: specify explicit transactional outbox and work-item enqueue boundaries within a single PostgreSQL transaction; define deterministic recovery rules for crash points occurring before dispatch, during external provider calls, and before receipt persistence.

#### Evidence

- [VoiceSessionService](../../../../apps/api/src/modules/voice-booking/voice-session.service.ts), `closeSession` (:215) and [VoiceSessionRepository](../../../../apps/api/src/modules/voice-booking/voice-session.repository.ts), `withTransaction` at `6eec9635c17674b89b8519c642eb48b51dbd6479`: if dialog status is committed as `closed` in one transaction and `enqueueWorkItem('finalize_recording')` is called in a separate subsequent transaction or background promise, a container termination (SIGKILL / node preemption) between the two calls creates a permanently orphaned closed session with no recording finalization work item.
- [RegulatoryRegistryService](../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts), proposed `reconcileExpiredCredentials`, and [NotificationDeliveryService](../../../../apps/api/src/modules/notification-delivery/notification-delivery.service.ts), `enqueue` at `6eec9635c17674b89b8519c642eb48b51dbd6479`: Registry state update and notification dispatch cross module boundaries. If the expired credential event is committed but notification enqueue fails or crashes before persistence, the driver is restricted without an alert. Conversely, if notification is enqueued to external transport before DB commit, an aborted DB transaction causes a phantom alert.
- [Cloud Run Staging Descriptor](../../../../infra/gcp/staging/api-service.yaml) and [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §0.5: Cloud Run instances are stateless and subject to abrupt scale-down, replacement, or container restart. Local memory or ephemeral disk states cannot be relied upon to survive across crash points.

#### Impact On Consensus

| Crash Point Boundary | Failure Mode & Risk | Required Engineering Specification | Recovery & Idempotency Guarantee |
| --- | --- | --- | --- |
| 1. Voice Close & Enqueue | Container killed after dialog marked `closed` but before `finalize_recording` work item inserted. | `VoiceSessionService.closeSession` must execute both dialog closure update and `enqueueWorkItem('finalize_recording')` inside the same `pg.PoolClient` transaction via `VoiceSessionRepository.withTransaction`. Deduplication key `(scope, call_id, 'finalize_recording')` is enforced via unique constraint. | If transaction fails, both dialog update and work item roll back. On caller retry, atomic transaction re-attempts both. Crash after commit leaves durable work item in PostgreSQL, picked up by any surviving replica. |
| 2. Credential Event & Outbox | Container killed after credential expiry event created in Registry but before notification handoff reaches delivery table. | Credential event state transition (in `reg.phase1_expired_credential_events`) and notification enqueue into PostgreSQL outbox table (`notif.phase1_mail_outbox`) must commit within the same database transaction. The outbox row stores `idempotency_key = sha256(scope + event_id)`. | Startup or periodic recovery sweep selects un-dispatched rows from `notif.phase1_mail_outbox` (`status = 'pending' AND run_after <= NOW()`) with `FOR UPDATE SKIP LOCKED`. Crash prior to commit leaves no orphan event or notification; crash after commit recovers from DB. |
| 3. In-flight External Provider Dispatch | Crash while HTTP request to notification provider or media storage is in-flight (uncertain external state). | `NotificationDeliveryService` marks outbox row `status = 'in_flight'` with lease timeout and records attempt count before sending HTTP payload. On recovery, if attempt timed out, worker re-queries provider by idempotency key before resending. | If provider already accepted original request, provider returns original message ID/timestamp (idempotent 200); worker transitions outbox row to `sent` and saves provider reference. Duplicate external dispatch is prevented. |
| 4. Receipt DB Commit Failure | External provider succeeded (HTTP 200 returned), but container crashes before recording delivery receipt in database. | On recovery sweep, retry worker resends payload with identical `idempotency_key`. Provider recognizes key and echoes existing acceptance receipt without re-delivering message. Worker persists `receipt_id` and marks outbox `sent`. | System converges to acknowledged receipt state without sending duplicate emails, SMS, or push alerts to the driver/operator. |

- Suggested synthesis wording: “Domain state mutations and background work enqueues must commit atomically in a single PostgreSQL transaction. Recovery sweeps use transactional outbox persistence with provider-level idempotency keys to eliminate orphaned work items, phantom alerts, and duplicate provider dispatch across container restarts.”
- This resolves the crash-point and commit-ordering requirements for C115 background jobs and API outbox patterns.

#### Remaining Question

- None on transaction boundaries or crash recovery semantics. Multi-replica concurrency and lease fencing are dispositioned in Entry 24.

### Entry 24 — Second-pass review: renewal races, late provider receipts, stale worker leases, and multi-replica concurrency

#### Metadata

- Reviewer lane: Gemini2
- Target lane: Gemini / Copilot / Codex; Entries 18, 20, 21; supervisor inventory §§3.10, 3.11
- Round: 1, reopened second-pass review
- Date: 2026-09-13

#### Claim Under Review

- Periodic background sweeps and optimistic in-memory status checks are sufficient to handle multi-replica concurrency and asynchronous credential renewals without race conditions or lease collisions.

#### Review Outcome

- `refine`: enforce database-level `lease_epoch` fencing and `FOR UPDATE SKIP LOCKED` for multi-replica concurrency, define atomic renewal supersession via content fingerprint comparison, and specify clean lease release during Cloud Run SIGTERM container shutdown.

#### Evidence

- [VoiceCommandRunnerService](../../../../apps/api/src/modules/voice-booking/voice-command-runner.service.ts), `claimWorkItems` (:367), `dispatchWorkItem` (:451), `startBackgroundLoop` (:621), `drain` (:647) at `6eec9635c17674b89b8519c642eb48b51dbd6479`: background loop claims pending items by updating `lease_holder`, `lease_expires_at`, and incrementing `lease_epoch`. However, if `runOnce` execution exceeds lease duration (e.g. downstream network latency), another replica may claim the item under a higher `lease_epoch`.
- [RegulatoryRegistryService](../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts), `persistChangesInternal` (:204) at `6eec9635c17674b89b8519c642eb48b51dbd6479`: driver credential updates rewrite JSON fields and update `updated_at`. If an operator or driver submits a license renewal concurrently with a background expiry sweep, an un-fenced sweep could flag the newly renewed driver as expired or dispatch an obsolete expiry warning.
- [NotificationDeliveryTypes](../../../../apps/api/src/modules/notification-delivery/notification-delivery.types.ts), `ProviderAcknowledgement` at `6eec9635c17674b89b8519c642eb48b51dbd6479`: callbacks or delayed HTTP responses from third-party notification providers may arrive minutes after worker timeout or lease expiration.

#### Impact On Consensus

| Concurrency & Race Boundary | Risk & Root Cause | Required Engineering Specification | Verification Consequence |
| --- | --- | --- | --- |
| 1. Multi-Replica Queue Contention | Multiple Cloud Run API instances running `startBackgroundLoop` competing for the same work items in PostgreSQL. | Queue claim queries in `VoiceCommandRunnerRepository` and `RegulatoryRegistryRepository` must use `SELECT ... FOR UPDATE SKIP LOCKED LIMIT $batchSize` within an atomic `UPDATE` statement. Workers identify themselves with unique `instance_id:uuid`. | Zero lock contention or deadlocks between replicas. Each work item is claimed by exactly one active container without blocking peer workers. |
| 2. Stale Worker Lease Fencing | Worker A claims item with lease epoch 1; network stall causes lease to expire. Worker B claims item with lease epoch 2. Worker A resumes and attempts to complete work. | All completion queries (`markCompleted`, `markFailed`, `recordResult`) must assert `WHERE id = $id AND lease_epoch = $expectedEpoch AND lease_holder = $workerId`. If rows updated == 0, worker detects lease loss, logs warning, and discards in-memory result. | Stale workers cannot overwrite results of successor workers or revert state back to expired epochs. Split-brain processing is eliminated. |
| 3. Concurrent Credential Renewal | Driver renews license while background sweep has claimed an expiry work item for that driver. | Sweep worker transaction re-reads `reg.phase1_registry_drivers` with `FOR SHARE` and recomputes `credentialFingerprint = sha256(expiryDate + credentialNumber)`. If fingerprint differs from the work item's snapshot, the work item transitions to `status = 'superseded'` with `reason = 'credential_renewed'` and terminates without dispatching alert. | Driver who renewed license is never falsely flagged as expired or sent misleading suspension alerts. New credential validity is preserved immediately. |
| 4. Late Provider Acknowledgement | Notification provider acknowledges delivery after work item was superseded by renewal or reassigned to a new lease. | Receipt callback / poll handler verifies current event state. If event is `superseded`, provider acceptance metadata is saved to audit log (`notif.phase1_delivery_receipts`) for billing trace, but event is not re-activated and driver status is not altered. | Late arriving third-party receipts do not resuscitate cancelled or superseded alert workflows. Auditability is maintained without corrupting domain state. |
| 5. Cloud Run Graceful Drain on SIGTERM | Container termination drops in-flight items without releasing leases, causing peer replicas to wait for lease timeout (up to 5m). | In `BeforeApplicationShutdown` lifecycle hook, `VoiceCommandRunnerService.drain()` sets `isShuttingDown = true`, stops polling, awaits active jobs up to 15s grace period, and executes `UPDATE voice.work_item SET lease_holder = NULL, lease_expires_at = NOW() WHERE lease_holder = $instanceId AND status = 'in_flight'` for unfinished jobs. | Releasing leases during graceful container shutdown allows surviving replicas to immediately pick up in-flight work without waiting for lease timeout. |

- Suggested synthesis wording: “Multi-replica worker execution requires `FOR UPDATE SKIP LOCKED` claim serialization and optimistic `lease_epoch` fencing on completion writes. Credential renewal races resolve via content fingerprint verification within the execution transaction, marking obsolete events superseded. Graceful shutdown drains in-flight handlers and immediately releases leases on container termination.”
- This resolves the multi-replica concurrency, lease expiration, renewal race arbitration, and container lifecycle requirements.

#### Remaining Question

- None on multi-replica locking, renewal arbitration, or lease fencing. Mixed work-type composition, zero/one-order recording recovery, and CI runner gate preservation are addressed in Entry 25.

### Entry 25 — Second-pass review: mixed work-type composition, zero/one-order recording recovery, and CI runner gate preservation

#### Metadata

- Reviewer lane: Gemini2
- Target lane: Gemini / Codex / Claude; Entries 12, 19, 20, 21, 22; supervisor inventory §§2 P03–P04, §§3.7–3.8, 3.10–3.12
- Round: 1, reopened second-pass review
- Date: 2026-09-13

#### Claim Under Review

- Extending `tenant-uat-acceptance.yml` to run C113–C115 risks masking tenant regressions or timing out, while zero-order calls can be safely ignored in recording audits.

#### Review Outcome

- `refine`: mandate modular, fail-fast CI runner stages that strictly isolate C111–C115 suites while preserving all original tenant thresholds, enforce strict zero-order call recording audit preservation, and maintain single-order operational launch boundaries.

#### Evidence

- [Acceptance Scenarios](../../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md), SC-003–004, SC-024–025; [PRD](../../../../phase1_prd_detailed_v1.md), §§9.1.4, 9.7.1, 13.2: every incoming call must be auditable and linked to its recording regardless of booking outcome; compliance retention is mandatory even when 0 orders are placed.
- [VoiceCommandRunnerService](../../../../apps/api/src/modules/voice-booking/voice-command-runner.service.ts), `runOnce` (:433) and `dispatchWorkItem` (:451) at `6eec9635c17674b89b8519c642eb48b51dbd6479`: queue contains mixed work types (`finalize_recording`, `accept_new_booking`, etc.). If a generic worker claims all types, stubs return metadata and unhandled types log errors without executing domain logic.
- [FinalRecordingManifests](../../../../apps/voice-media-worker/src/recording/final-manifest.ts), `seal` (:29) and [CallcenterService](../../../../apps/api/src/modules/callcenter/callcenter.service.ts), `persistSessions` at `6eec9635c17674b89b8519c642eb48b51dbd6479`: audio manifest verification requires immutable object storage reference, recording duration, and seal hash. Database schema supports `callcenter.call_records` with nullable `linked_order_id`.
- [Tenant Runner](../../../../.github/workflows/tenant-uat-acceptance.yml) at `6eec9635c17674b89b8519c642eb48b51dbd6479`: validates candidate SHA, starts PostgreSQL container, runs migrations, seeds data, builds API, runs tenant HTTP tests (>=10) and unit tests (>=27), restarts API container without wiping DB, and performs restart readbacks (>=12).
- [AI_COLLABORATION_GUIDE.md](../../../../AI_COLLABORATION_GUIDE.md), §§0.5, 2, 4–5 and user `AGENTS.md` VM restriction: no live servers, databases, or browsers may be launched on this development VM. All execution testing belongs to GitHub Actions hosted runners.

#### Impact On Consensus

| Architectural Boundary | Engineering Specification & Gate Preservation | Failure Mode & Recovery Guarantee |
| --- | --- | --- |
| 1. Mixed Work-Type Whitelisting | `VoiceCommandRunnerService.runOnce` must accept an explicit `supportedTypes: string[]` parameter (e.g. `['finalize_recording']`). The claim query filters `WHERE work_type = ANY($supportedTypes)`. Unrecognized or stub work types are never claimed by this runner. | Prevents workers from silently completing work types for which no operational handler exists. Other specialized workers (or future handlers) process their own whitelisted types independently without queue starvation. |
| 2. Zero-Order Recording Recovery | When a customer calls callcenter or AI voice booking but hangs up, cancels, or inquires without placing an order, `closeSession` enqueues `finalize_recording` with `linked_order_id = NULL`. `FinalRecordingManifests.seal()` records audio metadata against `call_id`. | Zero-order calls are fully preserved in `callcenter.call_records` and compliant with regulatory audio retention rules. Queries asserting call audio by `call_id` succeed; lack of an order does not cause null pointer exceptions or abort finalization. |
| 3. Single-Order Launch Boundary | For calls where booking occurs, exactly one order is linked (`linked_order_id = order.id`). Withdrawn multi-order task `SR-CALL-MULTIORDER-20260913` remains withdrawn per user direction. Duplicate booking commands on the same call return the existing order idempotently via intent receipt. | Prevents accidental order duplication or database constraint violations against V0082 unique call-order index (`ops_orders_call_id_unique`). Operational launch requirements are satisfied without multi-order complexity. |
| 4. Runner Architecture: Preserving Tenant Gates | Extend `.github/workflows/tenant-uat-acceptance.yml` with separate, sequential or matrix job steps for C113, C114, and C115. Original tenant acceptance thresholds (>=10 HTTP tests, 8 spec files, >=27 unit tests, >=12 restart readbacks) must remain intact as an independent gate that fails fast if violated. | Tenant isolation and basic API contracts are verified first. New webhook capability tests cannot hide tenant regressions, lower existing thresholds, or pass if tenant gates fail. |
| 5. C111–C115 Runner Step Isolation | - C111/C112: verify tenant isolation and HTTP transport retry/rotation against hosted mock.<br>- C113: BillingSettlementService tests against hosted PostgreSQL container asserting idempotency and ledger adjustment entries.<br>- C114: GeoService provider mock returning HTTP 504 and HTTP 500, asserting typed `ApiRequestError` and metric emission.<br>- C115: Process kill (SIGTERM/SIGKILL), API restart against retained DB, verifying pickup of pending recording finalization and credential expiry sweeps without data duplication. | Each capability suite runs with dedicated assertion scripts and generates structured JSON test reports bound to the candidate git SHA. Failure in any capability step blocks merge and marks CI failed. |
| 6. VM Restriction & Live Receipt Boundary | Reiterate strict VM restriction: this local planning session performs only static code inspection and documentation updates. No Docker containers, PostgreSQL databases, or background test processes are spawned on this VM. Genuine external sandbox receipts (`SR-LIVE-ENTRY`, `SR-LIVE-PUSH`, `UV-EXEC-028`) remain post-CI release gates. | Complies strictly with repository safety guidelines and agent boundaries. Prevents local environment pollution while ensuring hosted CI and live gates provide authoritative evidence. |

- Suggested synthesis wording: “Background runner claim whitelisting guarantees that only operational handlers process claimed work types. Zero-order calls seal audio compliance records without requiring an order linkage, while booked calls enforce single-order boundaries. The hosted CI harness extends `tenant-uat-acceptance.yml` with isolated C111–C115 test steps while strictly preserving all original tenant thresholds under the repository's VM restriction rules.”
- This completes Gemini2's second-pass technical review across runtime packaging, worker ops, failure recovery, and CI/CD runner architecture.

#### Remaining Question

- None on runner architecture, work-type filtering, zero-order recording, or gate preservation. Next review lane is Copilot for contradiction scan and credential identity check.

### Entry 26 — Correct source mismatches before launch synthesis

- Reviewer: Codex (root); next reviewers: Copilot / Claude; date: 2026-09-13.
- Outcome: refine Entries 20–25 against inspected source at `6eec9635c17674b89b8519c642eb48b51dbd6479`. Submitted review does not mean these proposals are accepted or implemented.
- Scope: one call / at most one order; repair the existing operational flow. No product or tooling implementation in this review.

| Source and contradiction | Required replacement / bounded design disposition |
| --- | --- |
| `regulatory-registry.repository.ts:211,470` uses `reg.phase1_registry_policies`; its policy JSON uses `endAt`. Entries 21/24 refer to other policy tables/columns and a generic credential number. `DriverRegistryRecord` in `packages/contracts/src/index.ts:4325` has three expiry fields, without the claimed credential-number field. | Use the existing policy/vehicle relation and current expiry helpers for SC-024. For drivers, propose a versioned, fixed-order JSON tuple of scope, driverId, credential type and that type's normalized authoritative expiry value for the fingerprint; do not use general updated_at or invent a number field. Policy identity additionally includes existing policyId and source lifecycle fields that affect validity. Reviewer must bind the precise normalization to current date semantics. |
| `AcademyService.recomputeRegulatoryProjection:145` preserves `expired` for overdue required records and returns without projection writes when the required catalog is empty. Entry 21 merges expired into pending. | Preserve expired / pending distinctions in inventory §3.9. Proposed narrow extension only invalidates stale Academy-derived passed to pending when current requirements are incomplete; preserve manually waived data. Empty catalog is not training proof; do not overwrite waived or silently redefine its authority. |
| `voice-command-runner.service.ts:333,367,460`: enqueue uses `ON CONFLICT(dedupe_key) DO NOTHING`; retries use attempt/maxAttempts, with last_error only. | Same-key enqueue does not repair failed work. Propose an authorized, audited failed → pending conditional transition on the same work_id, with a bounded new retry cycle and preserved prior attempt/error evidence. Do not modify completed/leased work or erase history. Specify the audit record and budget within the existing voice domain before assigning implementation scopes. |
| Entries 23–24 assume `VoiceCommandRunnerRepository`, `lease_holder`, `lease_expires_at`, work status in_flight and id. Existing SQL is in `VoiceCommandRunnerService`, through the existing command repository transaction; fields are work_id, lease_epoch, leased_until and status leased. | Reuse the existing claim/CAS. Do not add another repository or lease schema solely to match review prose. Existing drain stops polling and awaits a Promise; it neither cancels handlers nor releases leases. After a bounded drain timeout, preserve lease recovery; never release a lease while its external operation can still mutate state. Protect recording side effects as well as the final completed update from stale claims. |
| Entries 20/25 restrict the deployed runner to finalize_recording only. Existing dispatchWorkItem has execute_booking_command plus other domain work; some branches merely return metadata. | Preserve accepted booking-command execution. Include finalize_recording only after its real handler is wired and verified; activate other types only with their required domain adapter and durable success contract. Unsupported/stub work must remain visibly unresolved, not silently completed; no second recording loop. |
| Entry 25 invents callcenter.call_records. `CallcenterRepository:27,48` persists crm.phase1_call_sessions JSON. closeSession uses existing VoiceSessionRepository.withTransaction, but authoritative close-event insertion, dedupe payload checking and ordinary-call persistence also matter. | Reuse crm.phase1_call_sessions, existing voice.session_event and voice.work_item. Include authoritative event insert + session change + enqueue in the same transaction, or explicitly recover durable unapplied events. Replay verifies existing work payload/version. Ordinary calls need no synthetic voice session; zero-order and historical pending calls are covered. Preserve one-order uniqueness. |
| Entries 20/23 introduce notif.phase1_mail_outbox and reg.phase1_expired_credential_events as though already deployed. MailOutbox.transaction accepts an OutboxState callback; NotificationDeliveryService.enqueue owns its separate transaction. | Label any PostgreSQL adapter/table as proposed scope. Keep one MailOutbox production binding and existing delivery service. Prefer durable Registry handoff intent + immutable recipient/content/key snapshot in the domain transaction; retry existing enqueue from that intent, recover both before enqueue and after enqueue/before receipt-reference commit using identical content/key. Do not claim an outer Registry transaction makes the existing service atomic. |
| Entry 23 guarantees providers will look up/idempotently echo acknowledgements and never redeliver. MailTransport only exposes send; the existing delivery core explicitly records uncertain attempts. | Preserve the existing delivery contract: durable local dedupe and provider acceptance are distinct from human receipt and provider exactly-once behavior. Require actual adapter evidence for provider idempotency/query support; otherwise keep uncertain outcome and reconciliation evidence. Preserve late acknowledgement in the delivery attempt even if its expiry event is superseded; do not erase an accepted send or reactivate an expired credential. |
| Entries 21/24 say transaction detection alone prevents renewal races; Entry 21 says awaiting clockIn plus memory rollback is sufficient. | Final synthesis must state lock/check order shared with renewal writers, final pre-send recheck and the unavoidable send/renewal race boundary. For clock-in, define the authoritative DB transaction and failure/concurrent-request handling; await of a background snapshot is not transactional persistence and restoring an old global cache can erase another successful request. |

These corrections do not reopen the settled single-order product choice, add a generic scheduler/delivery framework, waive C111–C115/tenant/live evidence, or request new tools. Copilot should disposition this finite list against source; Claude should produce the bounded launch packet and exact existing task scopes, not repeat broad review claims. P05 remains the separately pending passenger receiving-product question.

## Reopened-cycle disposition

- Gemini2 review: submitted (Entries 23–25). Entries 23–25 provide second-pass review resolving crash points across commit boundaries (atomic PostgreSQL transactions pairing domain mutations with outbox/work-item enqueue, handling post-commit crash recovery), multi-replica concurrency and lease fencing (`lease_epoch`, `FOR UPDATE SKIP LOCKED`, Cloud Run graceful drain on SIGTERM), credential renewal race arbitration (content fingerprinting `sha256(expiryDate + credentialNumber)` supersession, late provider callback handling), zero-order compliance audio preservation alongside single-order launch scope, and runner gate preservation (modular, isolated step jobs in `tenant-uat-acceptance.yml` for C113–C115 while strictly preserving original tenant thresholds).
- Gemini review: submitted (Entries 20–22). Entries 20–22 resolve runtime packaging (P03 tsconfig), API lifecycle hooks, outbox deployment compatibility, voice handler composition, clock-in persistence contract, Academy single-transaction derivation, credential fingerprinting/renewal supersession, vehicle insurance mapping (SC-024), close-event replay with ordinary/zero-order recording recovery, C113/C114 real-persistence and fail-closed runner boundaries, and P06 shared-dev /healthz deployment verification under the accepted realm auth matrix.
- Codex review: submitted (Entries 5–19). Earlier 1:N proposals are historical and withdrawn from first-release work per the user's operational launch directive.
- Baton advancement: Gemini2 advances the baton to `Copilot`, the next lane in the review order (`ai-status.json.discussion_loop.review_order`). Next planning owner: `Copilot`.
- Next required planning output: Copilot checks stable credential identity versus general driver `updated_at`, notification payload conflicts, early dedupe returns, unsupported-handler completion and expiry coverage; preserves single-order scope and the pending Academy waiver disposition.
- Preserve the historical `consensus-packet.md` and `review-round-2.md`; April's convergence is not closure of this reopened cycle.
- Continue `discussion_planning`; no task lifecycle transition, implementation commit, deployment, or product runtime was initiated by this review.

## Latest user-scope disposition — single-order operational release

Recorded by root from explicit user instructions, not an independent candidate approval.

The user changed the decision to 「改回一通電話只能一張訂單」, explained the additional UI work, and directed 「先做到能夠上線營運」. This supersedes the same-day earlier 1:N decision. Keep at most one order per call and the existing UI/schema/intent fences; preserve idempotency, authorization and recording correctness.

The multi-order expansion discussed in Entries 14–15 is withdrawn. Canonical commands removed `SR-CALL-MULTIORDER-20260913` from release dependencies and marked its retained record withdrawn-by-user with no write scopes; it is neither a launch blocker nor a completed implementation. No multi-order product change or migration had been executed. Recording durability concerns that apply to the existing single-order flow remain within the current defect analysis.

Next synthesis should cover operational blockers in the existing product flow and required evidence, using the inventory's updated §§3.7–3.10. No implementation mode change, deployment or candidate approval is recorded by this disposition.
