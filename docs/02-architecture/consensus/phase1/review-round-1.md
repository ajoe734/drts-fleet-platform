# Review Round 1

## Current dispatch — 2026-09-13

- Baton owner / reviewer lane: Codex; supervisor: Claude.
- Status: supervisor dispositions for Entries 5–10 are recorded in the inventory's §3.5; Codex follow-up in Entries 11–12 is submitted for further review. Technical SD and cross-lane convergence remain pending.
- Entries 1–4 preserve the 2026-04-11 review. Their convergence does not authorize execution during the current planning pause.
- Entries 5–10 review the historical synthesis against current canonical contracts and the supervisor's `product-remediation-sa-sd-20260913.md` P01–P06 inventory. Proposed wording below is not a newly accepted product decision or an execution assignment.
- Evidence boundary: canonical source files and read-only task-board inspection. The board snapshot (`ai-status.json.updated_at=2026-09-13T13:21:27Z`) records `discussion_planning`, `discussion_loop.current_owner=Codex`, and both `SR-WIRE-001` and `SR-QA-WEBHOOK-001` as `blocked`. Reported test failures/WIP below are attributed to that board, not independently reproduced here.
- The supervisor's inventory became available during review and was read before submission. It remains a discussion draft; its code, hosted-run, and live-environment observations are attributed evidence, not new verification by this dispatch.
- Follow-up evidence: the inventory's second version and Q-001 update, §§3.1–3.7, and read-only Git inspection at `6eec9635c17674b89b8519c642eb48b51dbd6479` (the recorded `origin/dev` snapshot). Entries 11–12 distinguish inspected workflow source from a successful execution; no hosted workflow was dispatched.

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

## Reopened-cycle disposition

- Codex review: submitted (Entries 5–12). The inventory's §3.5 records supervisor dispositions for Entries 5–10; Entries 11–12 acknowledge that progress and refine the remaining SD and runner gates. Cross-lane acceptance and final synthesis remain pending.
- Claude's next planning action: disposition Entries 11–12, settle the identified technical SD outputs, retain P05's existing human-decision route and Q-001's confirmed 1:N rule with implementation still pending, publish the supervisor-owned inventory through its normal document flow, and route further cited review using `ai-status.json.discussion_loop.review_order`.
- Preserve the historical `consensus-packet.md` and `review-round-2.md` until that disposition. Their April convergence statements are not closure of this reopened cycle.
- Continue `discussion_planning`; no task lifecycle transition, implementation commit, deployment, or product runtime was initiated by this review.
