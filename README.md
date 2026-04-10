# drts-fleet-platform

Bootstrap monorepo for the DRTS fleet platform.

This repository currently contains engineering scaffolding only:

- tenant portal web
- platform admin web
- ops console web
- driver mobile app
- backend API
- docs, infra, and scripts
- local multi-LLM orchestrator control plane

Phase 1 focuses on fleet management and dispatch compliance core. Phase 2 may add autonomous-driving management capabilities such as FSD, ODD, and Tesla-related integrations.

## Status

Bootstrap in progress. Business workflows, production schema design, and deep domain logic are intentionally deferred.

## Orchestrator Control Plane

The repository now also contains a portable orchestrator bundle for shared multi-LLM coordination:

- setup: `pnpm orchestrator:setup`
- supervisor: `pnpm orchestrator:supervisor`
- dashboard: `pnpm orchestrator:dashboard`
- tests: `pnpm orchestrator:test`

The dashboard serves from `http://127.0.0.1:4173/index.html` by default.
