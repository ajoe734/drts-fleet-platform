# Supervisor Operating Model

This repo uses one continuous supervisor with two operating modes.

## Modes

### 1. `discussion_planning`

Purpose:

- read system analysis, product, design, contract, and execution documents
- let one lane organize the shared draft
- let the other lanes critique, refine, and challenge it
- produce an accepted consensus packet and work arrangement

Primary artifacts:

- `docs/02-architecture/consensus/phase1/starter-draft.md`
- `docs/02-architecture/consensus/phase1/baton-log.md`
- `docs/02-architecture/consensus/phase1/supervisor-queue.md`
- `docs/02-architecture/consensus/phase1/consensus-packet.md`

### 2. `supervisor_managed_execution`

Purpose:

- convert the accepted consensus into concrete tasks
- assign owners and reviewers
- run the standard implementation lifecycle through the supervisor
- keep review, blocker, and handoff state in `ai-status.json`

Primary artifacts:

- `ai-status.json`
- `.orchestrator/task-briefs/<task-id>.md`
- `.orchestrator/state.json`
- `.orchestrator/evidence/<run-id>.json`
- `current-work.md` as a human summary
- `ai-activity-log.jsonl` as append-only history
- the accepted consensus packet

Control-plane rule:

- any work item that the supervisor considers part of the official remaining backlog must be recorded in `ai-status.json`
- the dashboard is never allowed to infer hidden backlog from prose, memory, or chat-only statements
- canonical implementation tasks are not allowed to move to `done` without recorded commit evidence

## Continuous Loop

The supervisor does not stop when the repo changes mode.

Instead, it keeps running and changes routing policy:

- in `discussion_planning`, the supervisor routes baton ownership and review order
- in `supervisor_managed_execution`, the supervisor routes implementation tasks

## Machine Truth

Two files describe different parts of the same control plane:

- `ai-status.json` is the desired collaboration truth:
  - the active `execution_mode`
  - the active `discussion_workspace`
  - the current baton owner and review order
  - the official implementation task board
- `.orchestrator/state.json` is the live runtime truth:
  - the running supervisor `pid`
  - `focus_mode`
  - heartbeat and runtime occupancy
  - queued wake-ups and worker runs

The dashboard must show both layers instead of collapsing them into one field.

Practical rule:

- trust `ai-status.json` for what mode the repo is supposed to be in
- trust `.orchestrator/state.json` for what the live daemon is actually doing right now
- if those drift, treat it as a control-plane problem rather than assuming planning or execution is truly active

## Live Runtime Routing

The canonical supervisor process is `tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`, launched through `tools/development-orchestrator/bin/run-supervisor.sh`. Its routing differs by live focus:

- in `discussion_planning`
  - the supervisor reads `ai-status.json`
  - derives `focus_mode=planning`
  - queues a planning baton wake-up for the current owner
  - records planning worker activity and mode occupancy in `.orchestrator/state.json`
- in `supervisor_managed_execution`
  - the same process derives `focus_mode=execution`
  - scans the task board
  - dispatches owners/reviewers through the implementation lifecycle

Planning dispatch therefore is not a second hidden daemon.
It is the planning routing policy of the same canonical supervisor process.

## Start Condition

The loop can start as soon as the canonical design packet is available in the repo.

Minimum input set:

- system analysis or equivalent scope/boundary file
- system design, PRD, or equivalent architecture/design input
- service contracts or API/interface constraints
- migration or rollout guidance

If a dedicated system design file is added later, it must be inserted into the canonical map explicitly instead of assumed implicitly.

## Transition Rules

### `discussion_planning -> supervisor_managed_execution`

Allowed only when:

- readouts exist
- cited review rounds exist
- the consensus packet exists
- the human accepts the consensus packet
- all official remaining backlog implied by the accepted consensus packet has been written into `ai-status.json`

### `supervisor_managed_execution -> discussion_planning`

Trigger when implementation finds:

- unresolved product semantics
- conflicting ownership or source-of-truth claims
- contract or lifecycle contradictions
- wave order changes large enough to invalidate current task slicing

When this happens:

- pause or contain the affected implementation slice
- open or update the discussion artifacts
- let the supervisor run another baton loop
- resume execution only after the issue is resolved or explicitly accepted

If that discussion reveals new official backlog:

- add the new tasks to `ai-status.json`
- sync the mirrors
- only then report project status externally

## Candidate Lifecycle

Canonical implementation tasks have one lifecycle and one state writer:

`backlog/todo -> in_progress -> review -> integrating -> acceptance -> done`

- Owners may make ordinary checkpoint commits while a task is `in_progress`; those commits never start the full gate.
- `handoff` locks `candidate_sha` and `candidate_branch`. A reviewer only reviews that SHA and cannot commit, rebase, or push.
- A changed PR head invalidates the candidate, review and CI evidence, and returns the task to its owner.
- GitHub bus is the only CI/PR/merge reconciler. It records `reviewed_sha`, `ci_sha`, `ci_status`, `ci_run_url`, `pr_url`, and `merge_sha` through the canonical status transaction.
- Auto-merge is allowed only when review and green CI both name the locked candidate SHA. It targets `dev` and uses normal GitHub protections.
- `acceptance` records only the task's explicit required evidence. `done` is derived after merge and all required acceptance keys are present; workers never write `done` directly.
- On its first reconcile tick, the supervisor detects any task without `candidate_lifecycle_version=1` and runs the one-way canonical migration. New tasks are created at version 1, so this never becomes a recurring sync job.

Workers must leave a progress or blocker note when they cannot construct a candidate. They must not invent a separate closeout task or infer completion from a local branch, git log, or a prior CI run.

Support-only sidecars use the same review transaction, with `candidate_sha=not_applicable`; their required acceptance may complete without a product merge.

## Chairman Operational Review

The chairman lane is a rotating supervisor-operations reviewer. It is not the
discussion supervisor, not the starter lane, and not the owner of normal product
implementation tasks.

The supervisor queues a chairman review when it needs an operational decision,
including:

- pending approval triage
- repeated worker failure or reassignment loops
- sidecar-wave approval while the system is underutilized
- focused recommendations for unhealthy routing or blocked execution

The chairman must write both a Markdown report and a JSON decision file. The
supervisor reads the JSON back and may apply only the supported operational
actions:

- allow or deny routine-safe approval requests
- approve a sidecar window with a TTL and maximum sidecar count
- block sidecar parents for the current approval window
- reassign a reviewer only while a task is in `review`
- reassign an owner only while a task is in `todo` or `in_progress`
- trigger `dispatch_now` only for tasks that are already eligible under machine truth
- pause or clear an exact provider lane through `provider_actions`

The chairman still must not bypass dependency gates, review gates, or commit
evidence rules. In particular, chairman actions cannot directly mark canonical
implementation tasks `done`.

The chairman does not bypass product acceptance, change product semantics, or
implement the main task. When the JSON decision is missing or invalid, the
supervisor invalidates the chair review instead of guessing.

Practical templates live in:

- `.orchestrator/templates/chairman-review-report-template.md`
- `.orchestrator/templates/chairman-decision-packet.example.json`

## Recommended Default

- discussion supervisor: `Claude`
- starter lane: `Codex`
- first review order: `Claude2 -> Gemini -> Gemini2 -> Copilot -> Claude`
- execution ownership later follows the accepted consensus packet
