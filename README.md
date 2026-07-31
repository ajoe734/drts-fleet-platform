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

- core Phase 1 operator surfaces are fully implemented, verified, and deployed (`dev_deployed` via [deploy run 30663746297](https://github.com/ajoe734/drts-fleet-platform/actions/runs/30663746297), SHA `2123330182d3`, release tag `publish/v2026.07.31.5`)
- Stage 1 controllable truth and UAT closeout is complete (100% Playwright smoke pass 3000/3000, see [`docs/04-uat/stage1-controllable-truth-closeout-20260731.md`](docs/04-uat/stage1-controllable-truth-closeout-20260731.md))
- 10 official active Cloud Run services deployed (`api`, `platform-admin-web`, `ops-console-web`, `fleet-partner-portal-web`, `tenant-console-web`, `bank-console-web`, `partner-booking-web`, `enterprise-dispatch-web`, `channel-partner-portal-web`, `referral-embed-web`)
- Concierge portal (`concierge-portal-web`, `assisted-entry-web`) is permanently retired/decommissioned; zero active concierge services remain
- Referral entry is strictly partner-scoped under `referral-embed-web` (`/embed/referral-demo-community`)
- External-gated dependencies (external bank API keys, live forwarder sandbox adapters, mobile store app keys, external CTI/filing services) are isolated in sidecar documentation and excluded from Stage 1 controllable scope evaluation

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
- dashboard tunnel: `pnpm orchestrator:dashboard:tunnel`
- public dashboard: `pnpm orchestrator:dashboard:public`
- tests: `pnpm orchestrator:test`

The dashboard serves from `http://127.0.0.1:4174/index.html` by default.
`pnpm orchestrator:dashboard:tunnel` prints a temporary public `trycloudflare.com` URL for external viewing.
For external access on a VM, use `pnpm orchestrator:dashboard:public` and expose TCP `4174`.

Important:

- before consensus, the control plane is used for visibility and discussion scaffolding only
- after consensus, work packages can be converted into supervisor-managed tasks
