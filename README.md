# drts-fleet-platform

Bootstrap monorepo for the DRTS fleet platform.

This repository contains:

- tenant portal web
- platform admin web
- ops console web
- driver mobile app
- backend API
- docs, infra, and scripts
- local multi-LLM orchestrator control plane
- tracked Phase 1 specification files and extracted reference bundles
- seed architecture and planning docs for pre-implementation review

Phase 1 focuses on fleet management and dispatch compliance core. Phase 2 may add autonomous-driving management capabilities such as FSD, ODD, and Tesla-related integrations.

## Status

The repo is currently in `discussion_planning` mode.

Current working rule:

- the supervisor has two continuous modes: `discussion_planning` and `supervisor_managed_execution`
- implementation does not start through supervisor or auto workers yet
- multiple LLM lanes first read the same canonical Phase 1 documents
- supervisor assigns one starter lane to build the first shared draft
- each lane submits a structured readout
- the team runs cited review rounds and baton-based discussion rounds
- only an accepted consensus packet can unlock supervisor-managed execution

Canonical starting points:

- `AI_COLLABORATION_GUIDE.md`
- `ai-status.json`
- `current-work.md`
- `MULTI_LLM_CONSENSUS_WORKFLOW.md`
- `PHASE1_DISCUSSION_ASSIGNMENTS.md`
- `CANONICAL_DOCUMENT_MAP.md`

Seed design inputs:

- `TARGET_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEVELOPMENT_WORKBREAKDOWN.md`
- `PHASE1_DECISION_LEDGER.md`
- `PHASE1_OPEN_QUESTIONS.md`

## Orchestrator Control Plane

The repository also contains a portable orchestrator bundle for shared multi-LLM coordination:

- setup: `pnpm orchestrator:setup`
- supervisor: `pnpm orchestrator:supervisor`
- dashboard: `pnpm orchestrator:dashboard`
- dashboard tunnel: `pnpm orchestrator:dashboard:tunnel`
- public dashboard: `pnpm orchestrator:dashboard:public`
- tests: `pnpm orchestrator:test`

The dashboard serves from `http://127.0.0.1:4174/index.html` by default.
`pnpm orchestrator:dashboard:tunnel` prints a temporary public `trycloudflare.com` URL for external viewing.
For external access on a VM, use `pnpm orchestrator:dashboard:public` and expose TCP `4174`.

Important:

- before consensus, the control plane is used for visibility and discussion scaffolding only
- after consensus, work packages can be converted into supervisor-managed tasks
