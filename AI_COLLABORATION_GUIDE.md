# AI Collaboration Guide

Last updated: 2026-04-10
Status: canonical collaboration rules for the DRTS Phase 1 multi-LLM consensus workflow

## 0. Repository Scope

You are in the `drts-fleet-platform` repo.

This repository contains:

- product app scaffolds for web, mobile, and API
- local supervisor, dashboard, and worker adapters under `.orchestrator/`
- root Phase 1 product specification files
- extracted Phase 1 reference bundles that are now tracked at stable repo paths
- seed architecture and planning documents that must be reviewed before implementation begins

The current objective is:

> Run the continuous two-mode supervisor workflow for DRTS Phase 1: discussion and planning over the canonical specs, then supervisor-managed execution, with explicit re-entry into discussion when implementation discovers semantic drift.

Active execution mode:

- The active mode is controlled by `ai-status.json` and mirrored into `current-work.md`.
- In `discussion_planning`, only spec reading, design drafting, cross-review, conflict resolution, and consensus capture are allowed.
- In `supervisor_managed_execution`, work may be assigned to implementation owners and reviewers through the supervisor task lifecycle.
- Discussion uses a supervisor baton loop. One lane owns the shared working draft at a time, while other lanes respond through cited review artifacts.
- The supervisor stays alive across both supported modes and only changes routing policy.

## 0.5 Machine Truth Discipline

The dashboard and supervisor are only allowed to speak from machine truth.

Hard rules:

- if the repo has official remaining work, that work must exist in `ai-status.json` before anyone claims the project is incomplete
- if the repo has official accepted backlog, that backlog may be summarized into `current-work.md` and `docs-site/current-work.md` through the normal sync flow
- if a discussion round creates or confirms new official backlog, the supervisor must record those tasks in `ai-status.json` before returning to execution or reporting status to a human
- no lane may keep authoritative backlog only in chat, memory, or ad hoc notes
- if verbal status and control-plane status diverge, fix `ai-status.json` first, then continue discussion or execution
- `docs-site/*` is a read-only mirror; update the machine truth and let sync regenerate the mirror
- runtime inboxes, local logs, PID files, and ephemeral queue artifacts are not commit evidence and must not be treated as durable delivery output

This means:

- `done` in the dashboard means only the currently recorded backlog is done
- if more work is known to be required, it must be added to the task board immediately instead of explained only in prose

## 1. Canonical Read Order

Read these layers in order before starting work.

### L0 Collaboration

1. `AI_COLLABORATION_GUIDE.md`
2. `ai-status.json`
3. `current-work.md` as a human summary only

### L1 Product Truth

1. `phase1_system_analysis_v1.md`
2. `phase1_prd_detailed_v1.md`
3. `phase1_service_contracts_v1.md`
4. `phase1_migration_plan_v1.md`

### L2 Execution Rules

1. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/README.md`
2. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`
3. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`
4. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
5. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md`
6. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`
7. `phase1_db_migration_extracted/README.md`

Seed design artifacts live outside the canonical layers. They are discussion inputs, not accepted truth:

- `CANONICAL_DOCUMENT_MAP.md`
- `TARGET_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEVELOPMENT_WORKBREAKDOWN.md`
- `PHASE1_DECISION_LEDGER.md`
- `PHASE1_OPEN_QUESTIONS.md`
- `MULTI_LLM_CONSENSUS_WORKFLOW.md`
- `PHASE1_DISCUSSION_ASSIGNMENTS.md`
- `docs/02-architecture/consensus/phase1/*`

## 2. Conflict Precedence

### Collaboration and process control

1. latest explicit user instruction
2. `AI_COLLABORATION_GUIDE.md`
3. `ai-status.json`
4. `current-work.md` as a derived human summary
5. `ai-activity-log.jsonl` when recent history is needed

### Product semantics and business truth

1. latest explicit user instruction
2. `phase1_prd_detailed_v1.md`
3. `phase1_system_analysis_v1.md`
4. `phase1_service_contracts_v1.md`
5. `phase1_migration_plan_v1.md`
6. extracted execution rules and DB bundle docs
7. OpenAPI examples, UI skeletons, generated artifacts, and local placeholders

Rules:

- do not average conflicting documents
- cite the higher-precedence source and record the conflict
- unresolved product choices go to `PHASE1_OPEN_QUESTIONS.md`
- seed design docs may summarize or propose, but they do not override L1 or L2 product truth

## 3. Capability Lanes

- `Claude`: governance review, architecture arbitration, consensus synthesis
- `Claude2`: API integration, vertical slice feasibility, adapter implications, separate Claude account/quota lane
- `Gemini`: runtime packaging, CI/CD, infra, worker-ops implications
- `Gemini2`: runtime packaging, CI/CD, infra, worker-ops implications, separate Gemini account/quota lane
- `Codex`: contracts, schema, state-system, acceptance implications
- `Copilot`: contradiction scan, external critique, second-pass review

## 3.5 Two-Mode Supervisor

The supervisor has two continuous operating modes:

1. `discussion_planning`
2. `supervisor_managed_execution`

See `SUPERVISOR_OPERATING_MODEL.md` for the full state machine.

## 4. Consensus Workflow

The repo must pass through these phases in order.

### Phase A: Stable reference preparation

- keep extracted Phase 1 zip contents under stable repo paths
- maintain assignment, template, and discussion workspace files
- do not start implementation tasks

### Discussion workspace

All pre-implementation discussion happens under:

- `docs/02-architecture/consensus/phase1/starter-draft.md`
- `docs/02-architecture/consensus/phase1/baton-log.md`
- `docs/02-architecture/consensus/phase1/supervisor-queue.md`
- `docs/02-architecture/consensus/phase1/*-readout.md`
- `docs/02-architecture/consensus/phase1/review-round-*.md`
- `docs/02-architecture/consensus/phase1/consensus-packet.md`

Rules:

- only the current baton owner edits `starter-draft.md`
- reviewers do not rewrite the shared draft directly during their review turn
- reviewers write cited comments in the round file and, when needed, suggest explicit replacement wording
- the supervisor advances ownership after each round and records it in `baton-log.md` and `supervisor-queue.md`

### Phase B: Independent readouts

Each LLM reads the canonical layers and writes one structured readout using `LLM_READOUT_TEMPLATE.md`.

Required sections:

- `non-negotiables`
- `source of truth / ownership`
- `state machine / enum constraints`
- `open questions`
- `implementation impact`

### Phase C: Cited cross-review

- each review comment must cite file and section
- disagreement without citation is invalid
- use `LLM_CROSS_REVIEW_TEMPLATE.md`
- review comments target the current version of `starter-draft.md` and the individual readouts

### Phase D: Multi-round discussion

- discussion is allowed, but every objection still needs citations
- new interpretations must explicitly say whether they confirm, refine, or reject a prior claim
- any unresolved conflict must be carried forward to the next round or marked `human_required`

Default baton order:

1. `Codex` creates the first `starter-draft.md` from L1 and L2 product truth
2. `Claude2` reviews for flow feasibility, API seams, and adapter boundaries
3. `Gemini` reviews for rollout, infra, migration, and CI implications
4. `Gemini2` reviews for second-pass rollout, infra, migration, and CI implications
5. `Copilot` reviews for contradictions, weak assumptions, and missing citations
6. `Claude` either synthesizes the accepted changes into the next draft or returns the baton for another loop

Loop rule:

- if feedback is mostly clarifying, `Claude` may update the draft directly and open the next round
- if feedback requires deep contract or lifecycle reshaping, the baton returns to `Codex`
- if the disagreement is product-semantic and unresolved by precedence, mark it `human_required`

### Phase E: Consensus packet

Supervisor synthesis happens only after the review rounds settle enough to summarize.

The consensus packet must contain only:

- accepted conclusions
- rejected interpretations
- unresolved human decisions
- execution waves
- task ownership / reviewer map

If the consensus packet identifies remaining work beyond the already-recorded task board, the supervisor must add those tasks to `ai-status.json` before claiming the project still has open work.

Use `PHASE1_CONSENSUS_PACKET_TEMPLATE.md` and store the working draft at `docs/02-architecture/consensus/phase1/consensus-packet.md`.

## 5. Switch Gate To Supervisor Mode

Do not switch to supervisor-managed implementation until all of the following are true:

- each lane has submitted a readout
- at least one cited cross-review round exists
- discussion rounds have converged or been escalated
- the consensus packet is drafted
- the human accepts the packet and authorizes execution

Only after that may the repo move to `supervisor_managed_execution`.

Additional gate:

- every official post-consensus backlog item that is needed to describe project completion status must already exist in `ai-status.json`
- every canonical execution task that reaches `done` must record local commit evidence before closure

### Commit evidence rule

For canonical implementation tasks:

- `done` requires a local git commit
- the owner must provide `COMMIT_HASH` and `COMMIT_SUBJECT`
- the commit must resolve locally in the repo at finalize time
- commit subject must include the task id
- commit body must include these trailers:
  - `LLM-Agent: <lane>`
  - `Task-ID: <task-id>`
  - `Reviewer: <reviewer>`
- after committing, the owner must push the task-scoped commit with a normal non-force push
- the owner must provide `PUSH_REMOTE` and `PUSH_BRANCH` when finalizing the task
- if a safe normal push is not possible, record a blocker/progress note and do not mark `done`

For sidecar or explicit non-canonical closeout tasks:

- `NO_COMMIT_REQUIRED=1` is allowed
- use it only for review packets, acceptance packets, stale-helper closures, or other support-only artifacts
- do not use it for primary implementation slices

If implementation later reveals unresolved design or semantic conflicts, the supervisor may route the repo back into `discussion_planning` without restarting the control plane.

## 6. Status Commands

Until the switch gate is cleared, use the local runtime only for visibility.

```bash
python3 scripts/ai_status.py prompt
./scripts/sync-state.sh
```

The supervisor queue is document-driven before implementation mode. Update:

- `docs/02-architecture/consensus/phase1/supervisor-queue.md`
- `docs/02-architecture/consensus/phase1/baton-log.md`

After human approval, status transitions may resume through:

```bash
AI_NAME=Codex ./scripts/ai-status.sh assign <task-id> <owner> <reviewer> "Optional title"
AI_NAME=Codex ./scripts/ai-status.sh start <task-id> "Started implementation"
AI_NAME=Codex ./scripts/ai-status.sh progress <task-id> "Updated progress"
AI_NAME=Codex ./scripts/ai-status.sh handoff <task-id> Claude "Ready for review"
AI_NAME=Claude REVIEW_NOTES_ZH="審查通過||回到 owner 收尾" ./scripts/ai-status.sh approve <task-id> "Review approved and returned to the owner for finalization"
AI_NAME=Codex COMMIT_HASH=<sha> COMMIT_SUBJECT="feat(w8-001a): close rollout blockers" PUSH_REMOTE=origin PUSH_BRANCH=<branch> ./scripts/ai-status.sh done <task-id> "Owner finalized approved task, committed, pushed, and closed it"
./scripts/sync-state.sh
```
