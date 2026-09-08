# UV-EXEC-013 qualification and dispatch evidence

Owner: Codex2 (chairman fallback from the paused Claude lane). Independent reviewer: Codex.

Implements SD §4.3 and §6.4 without opening a new public booking endpoint.

## Domain flow

`VoiceBookingDraftService.qualify(sessionId, command)` reads the server's session and resource scope. The approved scope mapping must contain exactly `runtimeProfileCode: ordinary_taxi` and `serviceProductCode: taxi_realtime`; an active runtime/product policy and realtime product are also required. Unknown, multi-taxi and scheduled requests fail closed for operator handoff. They never become ordinary immediate commands.

The service resolves customer-selected provider candidates through the existing GeoService. Exact provider address identity, valid coordinates, current resolution, and an explicit provider entrance for campus/hospital/university/airport candidates are required. Missing entrance metadata cannot be filled by the model. Provider mock/degraded/outage responses fail closed. Both stop decisions and the aggregate service-area decision must be serviceable.

Explicit offset timestamps normalize to UTC with `Asia/Taipei` retained for readback. Immediate timestamps outside the 120-second qualification window are rejected. Requirements receive server-generated validation references and versioned policy provenance. Caller and passenger contacts stay separate.

`OwnedMobilityService.prepareQualifiedVoiceOrder` is a pure mapping for the forthcoming UV-EXEC-014/015 confirmation/receipt flow. It copies addresses, selected entrances, absolute time, product, service-area evidence and requirements into the owned aggregate without creating an order. Existing `createVoiceOrder` validates/copies a supplied qualification before its shared UoW insertion. Public ordinary call-center commands reject qualification/product/scheduling overrides. Historical unqualified voice records remain compatible; UV-EXEC-015 must consume the qualified, confirmed snapshot rather than its legacy compatibility shape.

Candidate filtering checks requirements, including synchronous/no-evaluator fallback paths. Qualified voice candidates additionally require current service-area/product/runtime approval. Assignment repeats the checks against the current order (inside the existing DB transaction when enabled), before supply reservation. Conditional capabilities and unsatisfied runtime conditions cannot be overridden on this path. Assignment and driver-task JSON records carry the same qualification, requirements, contact roles and validation references; readers return detached snapshots.

Current capability data is license-class based. More than four passengers, wheelchair, child-seat and oversized-luggage requests therefore require human handling rather than an equipment promise. Supported passenger/luggage counts constrain actual candidates and are rechecked at assignment.

## Verification

- `pnpm exec vitest run tests/unit/uv-exec-013.test.ts tests/unit/owned-mobility.test.ts tests/unit/vehicle-eligibility.test.ts tests/unit/uv-exec-012.test.ts`: 106 passed, including 27 UV-EXEC-013 cases.
- From `apps/api`: `pnpm exec vitest run tests/unit/runtime-eligibility-evaluator.service.test.ts tests/unit/vehicle-eligibility.service.test.ts tests/unit/service-area.service.test.ts tests/unit/owned-mobility.service.test.ts`: 145 passed.
- Contracts build and `pnpm --filter @drts/api typecheck` passed.

The qualification-to-task scenario uses provider/ETA fixtures, a captured UoW repository insert, and a runtime evaluator fixture to inject condition changes. It proves the domain mapping and assignment fences, not PostgreSQL concurrency or live telephone/map acceptance. Reservation/CAS SQL is unchanged; UV-EXEC-006 owns its PostgreSQL race evidence. No live provider, deployment, confirmation receipt, or external acceptance is claimed here.
