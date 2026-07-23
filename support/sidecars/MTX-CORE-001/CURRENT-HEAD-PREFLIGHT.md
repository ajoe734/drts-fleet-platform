# MTX-CORE-001 Current-Head Preflight

Date: 2026-07-23
Owner: Codex
Reviewer: Gemini
Task: Fleet A runtime authority

## Scope check

- Worktree/branch matched dispatch: `codex/mtx-core-001`
- Machine-truth status was `backlog` on entry and moved to `in_progress`
- `support/sidecars/MTX-CORE-001/` did not exist on entry, so this packet is created as part of the task

## Current-head findings before edits

- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts` already defined the canonical Fleet A runtime context, allowed `platform_reserved` acquisition, and disallowed non-virtual queue usage at the contract layer.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` already created multi-taxi orders with server-authored runtime fields:
  `runtimeProfileCode=multi_taxi_direct`, `serviceProductCode=taxi_reservation`, `acquisitionMode=platform_reserved`, `queueMode=virtual_matching`.
- `apps/api/src/modules/service-product/service-product.service.ts` already exposed runtime-profile policy enforcement through `assertRuntimeProfileServiceProductActive(...)`.
- Existing unit coverage already proved:
  spoofed public runtime-profile headers are denied;
  multi-taxi queue entries reject non-virtual matching;
  multi-taxi orders persist canonical runtime context.

## Gaps identified

- Multi-taxi intake did not explicitly reject client-supplied server-authoritative fields such as `acquisitionMode`, `queueMode`, `runtimeProfileCode`, `serviceProductCode`, or `operatingAuthorizationId`.
- There was no restart/readback-focused Fleet A integration proof covering persisted passenger access token lookup plus order readback after service rehydration.
- The task-specific sidecar evidence packet was missing.

## Reuse decision

- Reused existing runtime-context creation, service-product policy enforcement, queue-policy enforcement, and passenger ride authority wiring.
- Implemented only the fail-closed override guard and the missing Fleet A verification coverage; no runtime flow was rewritten.
