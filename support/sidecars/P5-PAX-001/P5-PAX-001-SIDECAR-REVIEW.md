# P5-PAX-001 Sidecar Review Packet (R1 Revision)

- Sidecar Task: `P5-PAX-001-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Gemini` / `Claude2`
- Parent Task: `P5-PAX-001` — Fleet E Live Passenger Authority
- Parent Owner / Reviewer: `Claude2` / `Codex2`
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Parent Ref & Commit SHA: `origin/claude2/p5-pax-001` (`6d9230d20ac5d987754fad37e5568a3cc7d3ad53` / short `6d9230d20`)
- Baseline Commit: `a03e32ea2` (`origin/dev`)
- Date: 2026-07-25

## Purpose

Provide a parallel **review packet** and **evidence summary** for `P5-PAX-001` (Fleet E Live Passenger Authority).

This packet synthesizes and verifies the parent deliverable on branch `origin/claude2/p5-pax-001` (commit `6d9230d20`, +1999/-204 across 24 delta files) so sidecar reviewer `Claude2` can verify in one place:

1. How the live passenger authority implementation in `apps/api/src/modules/multi-taxi/` and `apps/passenger-web/` satisfies all 7 acceptance criteria;
2. Precise code file and line anchors on parent commit `6d9230d20` backing each acceptance claim;
3. Complete citation of all 24 delta files created or modified by `P5-PAX-001`;
4. Verification results from API unit/integration, passenger-web unit, and Playwright E2E test suites;
5. Alignment with the parent's own evidence doc `support/sidecars/P5-PAX-001/preflight-and-acceptance.md`.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/P5-PAX-001/`.
- Do not modify L1 product truth (`phase1_*` specs, contracts, migration plan).
- Do not modify canonical execution tasks or system architecture truth.
- Do not modify parent implementation code (`apps/api/src/modules/multi-taxi/**`, `apps/passenger-web/**`).
- Hand off the review packet to the assigned reviewer (`Claude2`) via `scripts/ai-status.sh handoff`.

## Parent Commit & Delta File Catalog

- Parent branch tip: `origin/claude2/p5-pax-001` (`6d9230d20ac5d987754fad37e5568a3cc7d3ad53`)
- Baseline: `origin/dev` (`a03e32ea2`)
- Total delta: 24 files (+1999 / -204)

### Delta Files Breakdown

1. **`apps/api/src/common/sensitive-data-policy.ts`** (+29): exports shared `resolvePassengerSubjectRef` to hash phone-only passenger refs and `maskOpaqueToken`.
2. **`apps/api/src/modules/multi-taxi/masked-call.port.ts`** (+52, new): defines `MaskedCallPort`, `MaskedCallSubject`, and fail-closed `UnavailableMaskedCallPort`.
3. **`apps/api/src/modules/multi-taxi/passenger-push.port.ts`** (+55, new): defines `PassengerPushPort`, `PassengerPushMessage`, and fail-closed `UnavailablePassengerPushPort`.
4. **`apps/api/src/modules/multi-taxi/multi-taxi.module.ts`** (+17 / -2): registers DI bindings for `MASKED_CALL_PORT` -> `UnavailableMaskedCallPort` and `PASSENGER_PUSH_PORT` -> `UnavailablePassengerPushPort`.
5. **`apps/api/src/modules/multi-taxi/multi-taxi.repository.ts`** (+33): adds `findRideAccessTokenByDigest` and database persistence methods.
6. **`apps/api/src/modules/multi-taxi/multi-taxi.service.ts`** (+215 / -10): raw token destructuring, SHA-256 peppered token digesting, monotonic SSE event sequence allocation, masked-call integration, support fallback, and scope enforcement.
7. **`apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`** (+1 / -1): SSE endpoint mapping and access token header / param binding.
8. **`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`** (+6 / -2): uses `resolvePassengerSubjectRef` for consistent pseudonymous identity across outbox and access tokens.
9. **`apps/api/tests/unit/multi-taxi-passenger-authority.test.ts`** (+529, new): 15 unit/integration tests covering token hashing, 404/403 errors, contact masking, and outbox delivery.
10. **`apps/passenger-web/lib/passenger-fixture-loader.ts`** (+29, new): fail-closed dynamic fixture loader preventing fixture inclusion in production bundles.
11. **`apps/passenger-web/lib/passenger-view-model.ts`** (+138, new): decouples view-model types from fixture data payloads.
12. **`apps/passenger-web/lib/passenger-fixtures.ts`** (+144 deleted): removes static exports of fixture data.
13. **`apps/passenger-web/lib/passenger-live.ts`** (+27 / -12): SSE stream listener with `isFreshPassengerEvent` monotonic ordering guard (`appliedEventVersion`).
14. **`apps/passenger-web/lib/passenger-presentation.ts`** (+36): UI state mapping for live ride authority.
15. **`apps/passenger-web/lib/runtime-config.tsx`** (+26): production environment config guard rejecting fixture mode.
16. **`apps/passenger-web/app/passenger-rides/components/passenger-ride-page.tsx`** (+35): async fixture loading and live SSE state bindings.
17. **`apps/passenger-web/tests/unit/passenger-fixtures.test.ts`** (+6 / -2): tests fixture mode restrictions.
18. **`apps/passenger-web/tests/unit/passenger-live-stream.test.ts`** (+192, new): 7 unit tests verifying monotonic SSE event filtering and out-of-order rejection.
19. **`apps/passenger-web/tests/unit/passenger-live.test.ts`** (+6 / -2): live client unit test updates.
20. **`apps/passenger-web/tests/unit/passenger-production-fixture-gate.test.ts`** (+132, new): static dependency graph audit proving no production-reachable module statically imports fixtures.
21. **`packages/contracts/src/phase1-p5-s3-multi-taxi.ts`** (+52): contract schemas for `PassengerRideSseEventEnvelope`, `PassengerRideContactOption`, and `PassengerRideTokenScope`.
22. **`playwright.config.ts`** (+44): E2E test runner configuration for passenger web.
23. **`tests/e2e/p5-passenger-live-authority.spec.ts`** (+284, new): Playwright E2E browser acceptance suite (5 test scenarios).
24. **`support/sidecars/P5-PAX-001/preflight-and-acceptance.md`** (+114, new): parent preflight analysis, acceptance evidence, and bundle A/B summary.

## Dependency Snapshot

The declared parent dependency is settled in machine truth:
- `P5-RATE-001` — `done` in `ai-status.json` (Rating governance & assignment authority with version-safe redispatch guard).

## Evidence Summary — Acceptance Criteria Decomposition

The items below reflect the 7 acceptance criteria defined for `P5-PAX-001`, re-anchored to parent commit `6d9230d20`:

| # | Acceptance Criterion | Verdict | Evidence Anchor & Implementation Detail (Commit `6d9230d20`) |
|---|---|---|---|
| 1 | `raw token never persisted or logged` | `met` | **Implementation**: `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1157-1166` destructures `{ accessToken, ...tokenRecord }` off `passengerAccess` before persisting to repo with `this.digestAccessToken(accessToken)`. `multi-taxi.service.ts:1192` caches in memory via `accessTokensByDigest.set(digestAccessToken(accessToken), token)`. `multi-taxi.service.ts:1272-1277` hashes tokens using SHA-256 with `PASSENGER_RIDE_TOKEN_PEPPER`. Log masking enforced via `maskOpaqueToken` in `apps/api/src/common/sensitive-data-policy.ts:50-58`.<br>**Test Evidence**: `apps/api/tests/unit/multi-taxi-passenger-authority.test.ts:32-68` ("persists only a peppered digest and never the raw token") asserts raw tokens never exist in repository rows or error payloads. |
| 2 | `wrong/expired token denied` | `met` | **Implementation**: `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1232-1270` (`requireAccessToken`) throws `404 PASSENGER_RIDE_TOKEN_INVALID` for unknown, expired, or revoked tokens (L1243-1250, L1266-1270) and `403 PASSENGER_RIDE_SCOPE_FORBIDDEN` for missing scope (L1254-1264).<br>**Test Evidence**: `apps/api/tests/unit/multi-taxi-passenger-authority.test.ts:70-112` confirms invalid/expired tokens return 404 and unauthorized scopes return 403. |
| 3 | `stale event ignored` | `met` | **Implementation**: `apps/passenger-web/lib/passenger-live.ts:112-152` implements `isFreshPassengerEvent` checking `envelope.eventVersion > appliedEventVersion` and discarding out-of-order SSE envelopes. `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1013-1047` allocates strictly increasing sequence numbers via `nextPassengerEventVersion(orderId)`.<br>**Test Evidence**: `apps/passenger-web/tests/unit/passenger-live-stream.test.ts:1-192` (7 unit tests for sequence ordering) and `tests/e2e/p5-passenger-live-authority.spec.ts:40-85` (E2E test verifying out-of-order SSE frames do not rewind ride state). |
| 4 | `production bundle cannot resolve fixture data` | `met` | **Implementation**: `apps/passenger-web/lib/passenger-fixture-loader.ts:1-29` fail-closed dynamic loader; `apps/passenger-web/lib/passenger-view-model.ts:1-138` decouples view-model types from fixture payloads.<br>**Test Evidence**: `apps/passenger-web/tests/unit/passenger-production-fixture-gate.test.ts:1-132` (132 lines, static dependency graph scan ensuring no production module statically imports fixtures) and Webpack Production Bundle A/B (`support/sidecars/P5-PAX-001/preflight-and-acceptance.md:43-58`: 0 occurrences of sentinel strings `snap-p5-demo-001`, `吳明翰`, `BKR-2208`, `珍珠白`, `P5_RATING_STATE_UNINITIALIZED` in production build output vs 3 files at baseline). |
| 5 | `raw driver phone never reaches passenger` | `met` | **Implementation**: `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:797-848` (`getPassengerContact`) returns masked call proxy session or support hotline (`MULTI_TAXI_SUPPORT_TEL_URI`), never raw driver numbers. `apps/api/src/modules/multi-taxi/masked-call.port.ts:1-52` (`MaskedCallSubject` is identifier-only with `driverId`). `apps/api/src/common/sensitive-data-policy.ts:30-58` (`resolvePassengerSubjectRef`) hashes phone numbers for pseudonymous subject references.<br>**Test Evidence**: `tests/e2e/p5-passenger-live-authority.spec.ts:87-130` scans rendered DOM for dialable numbers and `tel:` URIs. |
| 6 | `provider absence explicit not simulated` | `met` | **Implementation**: `apps/api/src/modules/multi-taxi/masked-call.port.ts:34-48` (`UnavailableMaskedCallPort` returns `isAvailable() = false` and throws), `apps/api/src/modules/multi-taxi/passenger-push.port.ts:33-51` (`UnavailablePassengerPushPort` returns `isAvailable() = false` and throws), `apps/api/src/modules/multi-taxi/multi-taxi.module.ts:32-36` (registers Unavailable ports as default DI bindings), `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:797-848` (returns `mode: "unavailable"` / `mode: "support_fallback"` with explicit `unavailableReason`).<br>**Architecture & Evidence Anchor**: `support/sidecars/P5-PAX-001/preflight-and-acceptance.md:94-96` documents `P5-CALL-001` and `P5-PUSH-001` as `blocked_ext`. |
| 7 | `unit+integration+e2e green + reviewer PASS` | `met` | **Parent Build & Test Suite Results** (from `support/sidecars/P5-PAX-001/preflight-and-acceptance.md:68-80` on commit `6d9230d20`):<br>- `pnpm --filter @drts/api typecheck` PASS<br>- `pnpm --filter @drts/api lint` PASS<br>- `pnpm --filter @drts/passenger-web typecheck` PASS<br>- `pnpm --filter @drts/passenger-web lint` PASS<br>- `apps/api vitest run`: 140 files / 986 tests PASS (15 new unit/integration tests in `multi-taxi-passenger-authority.test.ts`)<br>- `apps/passenger-web vitest run`: 5 files / 37 tests PASS (16 new unit tests in `passenger-live-stream.test.ts` & `passenger-production-fixture-gate.test.ts`)<br>- `playwright test --project=passenger-web`: 5 tests PASS (`tests/e2e/p5-passenger-live-authority.spec.ts`) |

## Sidecar Execution Isolation Note

As documented in the review feedback, vitest runs are avoided inside this sidecar task worktree because `@drts/api` vitest execution modifies shared fixture artifacts across parallel task worktrees. Full test suite verification is anchored to parent commit `6d9230d20` execution evidence in `support/sidecars/P5-PAX-001/preflight-and-acceptance.md`.

## Cross-Cuts For Sidecar Reviewer (`Claude2`)

Checks for sidecar reviewer `Claude2` to verify upon handoff:

1. **Support-Only Compliance**: Confirm `P5-PAX-001-SIDECAR-REVIEW.md` is strictly a support review packet under `support/sidecars/P5-PAX-001/` with zero modifications to canonical files or parent implementation.
2. **Commit Anchoring**: Confirm all 24 delta files and line numbers match parent commit `6d9230d20` (`origin/claude2/p5-pax-001`).
3. **Blocking Issue Resolution (R1)**:
   - (B2) Stale event guard anchored to `passenger-live.ts:112-152`, `multi-taxi.service.ts:1013-1047`, and `passenger-live-stream.test.ts:1-192`.
   - (B3) Contact masking anchored to `multi-taxi.service.ts:797-848`, `masked-call.port.ts:1-52`, and `sensitive-data-policy.ts:30-58`.
   - (B4) Provider absence anchored to `masked-call.port.ts:34-48`, `passenger-push.port.ts:33-51`, and `multi-taxi.module.ts:32-36`.
   - (B5) E2E and test evidence anchored to `tests/e2e/p5-passenger-live-authority.spec.ts:1-284`, `playwright.config.ts`, and parent `preflight-and-acceptance.md`.
4. **Durability & Branch Push**: Confirm owner branch `gemini/p5-pax-001-sidecar-review` is pushed to `origin`.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — lives in `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md`.
- [x] Do not edit canonical truth — no L1/L2 specs or primary implementation code modified.
- [x] Hand off the packet to assigned reviewer (`Claude2`).

## Out Of Scope For This Sidecar

- Modifying parent implementation files in `apps/api/` or `apps/passenger-web/`.
- Changing task lifecycle or canonical backlog assignments of parent task `P5-PAX-001`.
- Editing system architecture or product specifications.

## Files Created / Updated By This Sidecar

```text
support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md
```
