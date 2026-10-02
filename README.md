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

A completion claim in this repo means one of four distinct things, and none
of them implies the others:

1. **Implementation** — code is merged to `dev`/`main`.
2. **CI** — the trunk's automated build/lint/typecheck/unit/integration
   suite is green for that SHA.
3. **Dev deployment** — that same SHA is live on the shared GCP Cloud Run
   dev environment, driven by `.github/workflows/deploy-dev.yml` and the
   `DEV_GCP_*` repository variables (see `docs/ops/branch-strategy.md`).
   This is the authoritative shared dev target; docs citing GCP project
   `nodal-alloy-503700-s3` describe a now-suspended predecessor (see
   `AGENTS.md`, `docs/03-runbooks/smarttransport-tw-custom-domains.md`).
4. **Live acceptance** — the `SR-LIVE-*` / `UV-EXEC-*` / `SR-ACCEPT-001`
   gates in `ai-status.json`, each needing externally authorized
   credentials, real provider/partner sandboxes, native device builds, or
   production-like rollout evidence bound to one release-candidate SHA.

The broader blueprint-completion and master-closeout execution waves closed
layers 1-2 on the current remote baseline: core Phase 1 operator surfaces are
implemented and the trunk CI graph is green. That is not the same as layers
3-4 being closed. A 2026-10-02 code-backed audit
(`docs/04-uat/audit-docs-truth-20261002.md`) found concrete gaps still open
against the live/production bar: a legacy payment endpoint that bypasses real
remittance-proof validation, proof/document storage that is not durable
across instances, an unaddressed production dependency-security backlog with
no CI gate, a voice "live" evaluation mode that still only computes fixture
metrics, and stub/unavailable payment-recovery, fare-quote-recovery, and
forwarder adapters. Read the bullets below as implementation/CI-layer
statements, not as live-acceptance claims:

- core Phase 1 operator surfaces are implemented in code and pass trunk CI
- rollout evidence, tenant boundary, and finance/reporting *implementation*
  waves are closed; full *live* rollout/finance/integration acceptance is
  not — see `docs/04-uat/audit-docs-truth-20261002.md` and the open
  `SR-LIVE-*` gates in `ai-status.json`
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

Dashboard: `tools/development-orchestrator/dashboard/index.html`, served by `./tools/development-orchestrator/bin/run-dashboard.sh`. It reads the live `ai-status.json`, `ai-activity-log.jsonl`, and `.orchestrator/state.json` directly; there is no generated copy to regenerate.

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

- Use `./tools/local-development/init-local-workspace.sh` to create the local-only workspace
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
