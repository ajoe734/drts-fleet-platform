# drts-fleet-platform

Core monorepo for the DRTS fleet platform.

This repository contains:

- platform admin web
- ops console web
- driver mobile app
- backend API
- a frozen internal tenant-portal reference shell (`apps/tenant-portal-web`)
- docs, infra, and scripts
- local multi-LLM orchestrator control plane
- tracked Phase 1 specification files and extracted reference bundles
- accepted planning, closeout, and authority records

Phase 1 focuses on fleet management and dispatch compliance core. Phase 2 may add autonomous-driving management capabilities such as FSD, ODD, and Tesla-related integrations.

## Status

The repo is in `supervisor_managed_execution` mode.

The broader blueprint-completion and master-closeout execution waves are now
materially closed on the current remote baseline. The repo truth currently
says:

- core Phase 1 operator surfaces are implemented in code
- rollout evidence, tenant boundary, finance/reporting completeness, and
  integration hardening are closed
- the protected control-plane auth cutover (`GAP-P2S3-001`) is closed on
  protected staging and the remaining visible delta is limited to
  external-gated integrations plus consciously deferred families
- Passenger App / Web, Call Point / Concierge Portal, and AV / live-board scope
  remain explicit deferred or future-gated families

Current working rule:

- the supervisor has two continuous modes: `discussion_planning` and `supervisor_managed_execution`
- accepted planning archives explain how the current execution backlog was formed
- current execution truth lives in `ai-status.json` and `current-work.md`
- if implementation discovers unresolved design semantics, the supervisor routes back into `discussion_planning` without restarting the control plane

Dashboard mirror: `docs-site/index.html` (regenerated via `./scripts/sync-state.sh`).

Canonical starting points:

- `AI_COLLABORATION_GUIDE.md`
- `ai-status.json`
- `current-work.md`
- `docs/README.md`
- `docs/00-context/current-system-blueprint-alignment-audit-20260421.md`
- `MULTI_LLM_CONSENSUS_WORKFLOW.md`
- `PHASE1_DISCUSSION_ASSIGNMENTS.md`
- `CANONICAL_DOCUMENT_MAP.md`

## Local Workspace Hygiene

Machine-specific notes and scratch artifacts should not be written into tracked
documentation.

- Use `./scripts/init-local-workspace.sh` to create the local-only workspace
  scaffolding.
- Use `docs/03-runbooks/local-development.local.md` for VM dev endpoint and
  review access notes.
- Use `.local/` for personal scratch files, temporary URLs, ad hoc commands,
  and other local-only artifacts.
- Use `.env` / `.env.local` for environment overrides instead of editing
  tracked defaults.

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
- dashboard service start: `pnpm orchestrator:dashboard:start`
- dashboard service stop: `pnpm orchestrator:dashboard:stop`
- dashboard service status: `pnpm orchestrator:dashboard:status`
- dashboard tunnel: `pnpm orchestrator:dashboard:tunnel`
- dashboard tunnel service start: `pnpm orchestrator:dashboard:tunnel:start`
- dashboard tunnel service stop: `pnpm orchestrator:dashboard:tunnel:stop`
- dashboard tunnel service status: `pnpm orchestrator:dashboard:tunnel:status`
- public dashboard: `pnpm orchestrator:dashboard:public`
- tests: `pnpm orchestrator:test`

The dashboard serves from `http://127.0.0.1:4174/index.html` by default.
`pnpm orchestrator:dashboard:tunnel` prints a temporary public `trycloudflare.com` URL for external viewing.
`pnpm orchestrator:dashboard:tunnel:start` starts a detached local dashboard service plus a detached quick tunnel and writes the current URL to `.orchestrator/dashboard-tunnel-url.txt`.
For direct port exposure on a VM, use `pnpm orchestrator:dashboard:public` and expose TCP `4174`.

Important:

- before consensus, the control plane is used for visibility and discussion scaffolding only
- after consensus, work packages can be converted into supervisor-managed tasks
