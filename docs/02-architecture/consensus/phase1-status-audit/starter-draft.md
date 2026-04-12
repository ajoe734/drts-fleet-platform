# Phase 1 Status Audit Starter Draft

Status: in progress
Mode: `discussion_planning`
Audit objective: compare current implementation state against canonical Phase 1 target docs and record every material mismatch.

## Scope

- API modules currently implemented in `apps/api/src/modules/`
- shared contracts in `packages/contracts/src/index.ts`
- test coverage in `tests/unit/`
- current task board in `ai-status.json`

## Initial framing

- Wave 1 through Wave 6 baseline slices exist and are executable.
- The current repo is not yet production-complete for Phase 1.
- The audit must verify where the current baseline diverges from the target documents and whether the remaining work is fully represented in the task board.

## Working sections

### 1. Aligned areas

- The repo preserves the highest-risk product invariants correctly:
  - `owned` and `forwarded` remain separate order domains.
  - Phase 1 formal service buckets remain `standard_taxi` and `business_dispatch`.
  - `forwarded` flow is still isolated from owned dispatch assignment.
  - complaint, notification, audit, and incident are still treated as distinct concepts in the foundational rules.
- Waves 1 through 6 baseline slices exist as executable runtime surfaces:
  - foundation / audit / notification
  - owned order / dispatch / driver task baseline
  - callcenter / complaint
  - billing / settlement
  - reporting / filing
  - forwarder mirror / relay
- Machine-truth synchronization is currently healthy:
  - `ai-status.json`
  - `current-work.md`
  - `docs-site/current-work.md`
    are in sync for the already-recorded board.

### 2. Partial alignments

- Persistence and ownership are only partially aligned.
  - The repo has domain modules and contracts for the major Phase 1 surfaces.
  - But most services still keep authoritative state in process-local arrays/maps, and `infra/migrations` / `infra/seeds` have not yet adopted the extracted SQL bundle.
- Client surfaces are only partially aligned.
  - The repo has the expected top-level apps for tenant portal, platform admin, ops console, and driver app.
  - But those apps remain placeholder shells and are not yet wired to the Phase 1 API/runtime expectations in the PRD.
- Business dispatch is only partially aligned.
  - The repo can create a booking-backed `business_dispatch` baseline.
  - It does not yet implement the fuller reservation scheduler, modify/cancel windows, queue/rank behavior, and business subtype operational flows required by the canonical docs.
- Reporting / filing / webhook behavior is only partially aligned.
  - The repo exposes baseline report and filing endpoints plus webhook basics.
  - It does not yet provide durable async job execution, retry/retention semantics, or object-storage-backed signed artifacts.

### 3. Material mismatches

- Persistence mismatch
  - Canonical docs require forward-only SQL migration truth, replayable seeds, and durable domain records.
  - Current repo still uses in-memory state across owned mobility, callcenter, complaint, billing, reporting, forwarder, tenant-partner, and audit-notification services.
- Auth / RBAC mismatch
  - Canonical docs require real login/session/realm/scope enforcement.
  - Current `identity` lane still returns `authMode: "bootstrap_placeholder"`, and foundation notes explicitly say real auth/session/RBAC remain future work.
- Wire-contract mismatch
  - Canonical execution rules require `snake_case` JSON over the wire.
  - Current API responses still expose camelCase payload fields such as `orderId`, `dispatchJobId`, `artifactUrl`, and `downloadUrl`.
- Async-job mismatch
  - Canonical rules require background-style report/export/download flows.
  - Current reporting/filing behavior completes in the request path instead of a durable async runtime.
- Product-scope mismatch
  - Canonical Phase 1 docs still require additional target-state scope that is not represented in the current implementation backlog:
    - reservation scheduler and queue/rank completion
    - owned order cancel / booking update / booking cancel flows
    - tenant passenger / address book / role / API key responsibilities
    - regulatory contract / insurance / exclusivity / placard / public-info versioning responsibilities
    - ops incident / maintenance / driver shift-attendance / earnings-read-model completion
- Documentation mismatch
  - `apps/api/README.md` is stale and still describes only the foundation plus first owned loop, even though the repo now includes later baseline slices.

### 4. Backlog truth check

- Current machine truth correctly records the already-known backlog:
  - `W7-001A` persistence and migration alignment
  - `W7-001B` auth and RBAC hardening
  - `W7-001C` webhook and artifact runtime hardening
  - `W8-001A` client integration and feature-flag rollout
  - `W8-001B` backfill, UAT, and rollout packs
- Audit conclusion: the current task board is synchronized, but not yet complete relative to the canonical target docs.
- Backlog corrections recommended by this audit:
  - add a task for wire-contract normalization and async job boundary conformance
  - add a task for reservation / queue / cancel / booking-flow completion
  - add a task for tenant/regulatory/admin source-of-truth completion
  - add a task for ops/driver domain completion
- Keep these items outside the official backlog until human clarification:
  - Passenger App / Web as a repo surface
  - missing `phase1_system_design_v1.md`
