# drts-fleet-platform

Bootstrap monorepo for the DRTS fleet platform.

This repository now contains two layers of scaffolding:

- tenant portal web
- platform admin web
- ops console web
- driver mobile app
- backend API
- docs, infra, and scripts
- local multi-LLM orchestrator control plane
- tracked Phase 1 specification files and extracted reference bundles
- canonical architecture, roadmap, and work breakdown docs

Phase 1 focuses on fleet management and dispatch compliance core. Phase 2 may add autonomous-driving management capabilities such as FSD, ODD, and Tesla-related integrations.

## Status

Architecture bootstrap in progress. The repo is still intentionally avoiding deep business workflow code, but the canonical Phase 1 document system and implementation landing zones are now part of the repository.

Current working rule:

- architecture and planning are being built directly first
- supervisor and auto workers are kept for later execution, after a human-approved work breakdown exists

Canonical starting points:

- `AI_COLLABORATION_GUIDE.md`
- `CANONICAL_DOCUMENT_MAP.md`
- `TARGET_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEVELOPMENT_WORKBREAKDOWN.md`

## Orchestrator Control Plane

The repository now also contains a portable orchestrator bundle for shared multi-LLM coordination:

- setup: `pnpm orchestrator:setup`
- supervisor: `pnpm orchestrator:supervisor`
- dashboard: `pnpm orchestrator:dashboard`
- tests: `pnpm orchestrator:test`

The dashboard serves from `http://127.0.0.1:4173/index.html` by default.

Important:

- before consensus, the control plane is used for visibility and coordination scaffolding only
- after consensus, work packages from `DEVELOPMENT_WORKBREAKDOWN.md` can be converted into supervisor-managed tasks
