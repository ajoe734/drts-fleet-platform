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
- `current-work.md`
- `ai-activity-log.jsonl`
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

## Commit Gate

Primary implementation tasks must not close with `done` until all of the following are true:

- the task is already `review_approved`
- the owner has created a local git commit for the delivered slice
- the owner records `COMMIT_HASH` and `COMMIT_SUBJECT` when finalizing the task
- the commit subject includes the task id
- the commit body records these trailers:
  - `LLM-Agent: <lane>`
  - `Task-ID: <task-id>`
  - `Reviewer: <reviewer>`

Support-only tasks may skip commit evidence only when they are explicitly non-canonical:

- sidecar review packets
- acceptance packets
- stale helper closures
- other no-op support artifacts

Those closeouts must use `NO_COMMIT_REQUIRED=1` and must not be used for primary delivery work.

## Recommended Default

- discussion supervisor: `Claude`
- starter lane: `Codex`
- first review order: `Qwen -> Gemini -> Copilot -> Claude`
- execution ownership later follows the accepted consensus packet
