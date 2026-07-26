# P5-PAX-001 Sidecar Review Packet (R2 Revision)

- Sidecar Task: `P5-PAX-001-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Gemini` / `Claude`
- Parent Task: `P5-PAX-001` — Fleet E Live Passenger Authority
- Parent Owner / Reviewer: `Claude` / `Gemini`
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Parent Ref & Delivered Commit SHA: `origin/dev` (`ff6a64ac30418f3281f3f0d1a4b33e1751110980` / short `ff6a64ac3041`)
  - Note: byte-identical pre-merge tip was `origin/claude2/p5-pax-001` (`6d9230d20`)
- Baseline Commit: `a03e32ea2` (`origin/dev`)
- Date: 2026-07-26

## Purpose

Provide a parallel **review packet** and **evidence summary** for `P5-PAX-001` (Fleet E Live Passenger Authority).

This packet synthesizes and verifies the delivered parent deliverable on `origin/dev` (commit `ff6a64ac3041`, +1999/-204 across 24 delta files) so sidecar reviewer `Claude` can verify in one place:

1. How the live passenger authority implementation in `apps/api/src/modules/multi-taxi/` and `apps/passenger-web/` satisfies all 7 acceptance criteria;
2. Precise code file and line anchors on delivered parent commit `ff6a64ac3041` backing each acceptance claim;
3. Complete citation of all 24 delta files created or modified by `P5-PAX-001`;
4. Verification results from API unit/integration, passenger-web unit, and Playwright E2E test suites;
5. Alignment with the parent's own evidence doc `support/sidecars/P5-PAX-001/preflight-and-acceptance.md`.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/P5-PAX-001/`.
- Do not modify L1 product truth (`phase1_*` specs, contracts, migration plan).
- Do not modify canonical execution tasks or system architecture truth.
- Do not modify parent implementation code (`apps/api/src/modules/multi-taxi/**`, `apps/passenger-web/**`).
- Hand off the review packet to the assigned reviewer (`Claude`) via `scripts/ai-status.sh handoff`.

## Parent Commit & Delta File Catalog

- Delivered Commit: `origin/dev` (`ff6a64ac30418f3281f3f0d1a4b33e1751110980`, short `ff6a64ac3041`)
- Pre-merge Lane Tip: `origin/claude2/p5-pax-001` (`6d9230d20ac5d987754fad37e5568a3cc7d3ad53`, byte-identical tree)
- Baseline: `origin/dev` (`a03e32ea2`)
- Total delta: 24 files (+1999 / -204)

### Delta Files Breakdown (Derived via `git diff --numstat a03e32ea2 ff6a64ac3041`)

1. **`apps/api/src/common/sensitive-data-policy.ts`** (+29 / -0): exports shared `resolvePassengerSubjectRef` (L52-67) to hash phone-only passenger refs and `maskOpaqueToken` (L131-149).
2. **`apps/api/src/modules/multi-taxi/masked-call.port.ts`** (+52 / -0, new): defines `MaskedCallPort`, `MaskedCallSubject`, and fail-closed `UnavailableMaskedCallPort`.
3. **`apps/api/src/modules/multi-taxi/passenger-push.port.ts`** (+55 / -0, new): defines `PassengerPushPort`, `PassengerPushMessage`, and fail-closed `UnavailablePassengerPushPort`.
4. **`apps/api/src/modules/multi-taxi/multi-taxi.module.ts`** (+16 / -1): registers DI bindings for `MASKED_CALL_PORT` -> `UnavailableMaskedCallPort` and `PASSENGER_PUSH_PORT` -> `UnavailablePassengerPushPort`.
5. **`apps/api/src/modules/multi-taxi/multi-taxi.repository.ts`** (+33 / -0): adds `findRideAccessTokenByDigest` and database persistence methods.
6. **`apps/api/src/modules/multi-taxi/multi-taxi.service.ts`** (+199 / -16): raw token destructuring, SHA-256 peppered token digesting, monotonic SSE event sequence allocation, masked-call integration, support fallback, and scope enforcement.
7. **`apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`** (+1 / -1): SSE endpoint mapping and access token header / param binding.
8. **`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`** (+4 / -2): uses `resolvePassengerSubjectRef` for consistent pseudonymous identity across outbox and access tokens.
9. **`apps/api/tests/unit/multi-taxi-passenger-authority.test.ts`** (+529 / -0, new): 15 unit/integration tests covering token hashing, 404/403 errors, contact masking, and outbox delivery.
10. **`apps/passenger-web/components/passenger-ride-page.tsx`** (+26 / -9): async fixture loading and live SSE state bindings.
11. **`apps/passenger-web/lib/passenger-fixture-loader.ts`** (+29 / -0, new): fail-closed dynamic fixture loader preventing fixture inclusion in production bundles.
12. **`apps/passenger-web/lib/passenger-fixtures.ts`** (+24 / -120): removes static exports of fixture data (+24 added / -120 deleted, net reduction).
13. **`apps/passenger-web/lib/passenger-live.ts`** (+26 / -1): SSE stream listener with `isFreshPassengerEvent` monotonic ordering guard (`appliedEventVersion`).
14. **`apps/passenger-web/lib/passenger-presentation.ts`** (+5 / -31): UI state mapping for live ride authority (+5 added / -31 deleted, net reduction).
15. **`apps/passenger-web/lib/passenger-view-model.ts`** (+138 / -0, new): decouples view-model types from fixture data payloads.
16. **`apps/passenger-web/lib/runtime-config.tsx`** (+22 / -4): production environment config guard rejecting fixture mode.
17. **`apps/passenger-web/tests/unit/passenger-fixtures.test.ts`** (+2 / -4): tests fixture mode restrictions.
18. **`apps/passenger-web/tests/unit/passenger-live-stream.test.ts`** (+192 / -0, new): 7 unit tests verifying monotonic SSE event filtering and out-of-order rejection.
19. **`apps/passenger-web/tests/unit/passenger-live.test.ts`** (+2 / -4): live client unit test updates.
20. **`apps/passenger-web/tests/unit/passenger-production-fixture-gate.test.ts`** (+132 / -0, new): static dependency graph audit proving no production-reachable module statically imports fixtures.
21. **`packages/contracts/src/phase1-p5-s3-multi-taxi.ts`** (+52 / -0): contract schemas for `PassengerRideSseEventEnvelope`, `PassengerRideContactOption`, and `PassengerRideTokenScope`.
22. **`playwright.config.ts`** (+33 / -11): E2E test runner configuration for passenger web.
23. **`support/sidecars/P5-PAX-001/preflight-and-acceptance.md`** (+114 / -0, new): parent preflight analysis, acceptance evidence, and bundle A/B summary.
24. **`tests/e2e/p5-passenger-live-authority.spec.ts`** (+284 / -0, new): Playwright E2E browser acceptance suite (5 test scenarios).

## Dependency Snapshot

The declared parent dependency is settled in machine truth:
- `P5-RATE-001` — `done` in `ai-status.json` (Rating governance & assignment authority with version-safe redispatch guard).

## Evidence Summary — Acceptance Criteria Decomposition

The items below reflect the 7 acceptance criteria defined for `P5-PAX-001`, anchored to delivered parent commit `ff6a64ac3041`:

| # | Acceptance Criterion | Verdict | Evidence Anchor & Implementation Detail (Commit `ff6a64ac3041`) |
|---|---|---|---|
| 1 | `raw token never persisted or logged` | `met` | **Implementation**: `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1157-1166` destructures `{ accessToken, ...tokenRecord }` off `passengerAccess` before persisting to repo with `this.digestAccessToken(accessToken)`. `multi-taxi.service.ts:1192` caches in memory via `accessTokensByDigest.set(this.digestAccessToken(accessToken), token)`. `multi-taxi.service.ts:1272-1277` hashes tokens using SHA-256 with `PASSENGER_RIDE_TOKEN_PEPPER`. Log masking enforced via `maskOpaqueToken` in `apps/api/src/common/sensitive-data-policy.ts:131-149`.<br>**Test Evidence**: `apps/api/tests/unit/multi-taxi-passenger-authority.test.ts:32-68` ("persists only a peppered digest and never the raw token") asserts raw tokens never exist in repository rows or error payloads. |
| 2 | `wrong/expired token denied` | `met` | **Implementation**: `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1229-1270` (`requireAccessToken`) throws `404 PASSENGER_RIDE_TOKEN_INVALID` for unknown, expired, or revoked tokens (L1243-1250, L1266-1270) and `403 PASSENGER_RIDE_SCOPE_FORBIDDEN` for missing scope (L1254-1264).<br>**Test Evidence**: `apps/api/tests/unit/multi-taxi-passenger-authority.test.ts:70-112` confirms invalid/expired tokens return 404 and unauthorized scopes return 403. |
| 3 | `stale event ignored` | `met` | **Implementation**: `apps/passenger-web/lib/passenger-live.ts:121, 142-152` implements `isFreshPassengerEvent` checking `envelope.eventVersion > appliedEventVersion` and discarding out-of-order SSE envelopes. `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1013-1047` allocates strictly increasing sequence numbers via `nextPassengerEventVersion(orderId)`.<br>**Test Evidence**: `apps/passenger-web/tests/unit/passenger-live-stream.test.ts:1-192` (7 unit tests for sequence ordering) and `tests/e2e/p5-passenger-live-authority.spec.ts:40-85` (E2E test verifying out-of-order SSE frames do not rewind ride state). |
| 4 | `production bundle cannot resolve fixture data` | `met` | **Implementation**: `apps/passenger-web/lib/passenger-fixture-loader.ts:1-29` fail-closed dynamic loader; `apps/passenger-web/lib/passenger-view-model.ts:1-138` decouples view-model types from fixture payloads.<br>**Test Evidence**: `apps/passenger-web/tests/unit/passenger-production-fixture-gate.test.ts:1-132` (132 lines, static dependency graph scan ensuring no production module statically imports fixtures) and Webpack Production Bundle A/B (`support/sidecars/P5-PAX-001/preflight-and-acceptance.md:43-58`: 0 occurrences of sentinel strings `snap-p5-demo-001`, `吳明翰`, `BKR-2208`, `珍珠白`, `P5_RATING_STATE_UNINITIALIZED` in production build output vs 3 files at baseline). |
| 5 | `raw driver phone never reaches passenger` | `met` | **Implementation**: `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:797-848` (`getPassengerContact`) returns masked call proxy session or support hotline (`MULTI_TAXI_SUPPORT_TEL_URI`), never raw driver numbers. `apps/api/src/modules/multi-taxi/masked-call.port.ts:1-52` (`MaskedCallSubject` is identifier-only with `driverId`). `apps/api/src/common/sensitive-data-policy.ts:52-67` (`resolvePassengerSubjectRef`) hashes phone numbers for pseudonymous subject references.<br>**Test Evidence**: `tests/e2e/p5-passenger-live-authority.spec.ts:87-130` scans rendered DOM for dialable numbers and `tel:` URIs. |
| 6 | `provider absence explicit not simulated` | `met` | **Implementation**: `apps/api/src/modules/multi-taxi/masked-call.port.ts:34-48` (`UnavailableMaskedCallPort` returns `isAvailable() = false` and throws), `apps/api/src/modules/multi-taxi/passenger-push.port.ts:33-51` (`UnavailablePassengerPushPort` returns `isAvailable() = false` and throws), `apps/api/src/modules/multi-taxi/multi-taxi.module.ts:32-36` (registers Unavailable ports as default DI bindings), `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:797-848` (returns `mode: "unavailable"` / `mode: "support_fallback"` with explicit `unavailableReason`).<br>**Architecture & Evidence Anchor**: `support/sidecars/P5-PAX-001/preflight-and-acceptance.md:94-96` documents `P5-CALL-001` and `P5-PUSH-001` as `blocked_ext`. |
| 7 | `unit+integration+e2e green + reviewer PASS` | `met` | **Parent Build & Test Suite Results** (from `support/sidecars/P5-PAX-001/preflight-and-acceptance.md:68-80` on commit `ff6a64ac3041`):<br>- `pnpm --filter @drts/api typecheck` PASS<br>- `pnpm --filter @drts/api lint` PASS<br>- `pnpm --filter @drts/passenger-web typecheck` PASS<br>- `pnpm --filter @drts/passenger-web lint` PASS<br>- `apps/api vitest run`: 140 files / 986 tests PASS (15 new unit/integration tests in `multi-taxi-passenger-authority.test.ts`)<br>- `apps/passenger-web vitest run`: 5 files / 37 tests PASS (16 new unit tests in `passenger-live-stream.test.ts` & `passenger-production-fixture-gate.test.ts`)<br>- `playwright test --project=passenger-web`: 5 tests PASS (`tests/e2e/p5-passenger-live-authority.spec.ts`) |

## Sidecar Execution Isolation Note

As documented in the review feedback, vitest runs are avoided inside this sidecar task worktree because `@drts/api` vitest execution modifies shared fixture artifacts across parallel task worktrees. Full test suite verification is anchored to delivered parent commit `ff6a64ac3041` execution evidence in `support/sidecars/P5-PAX-001/preflight-and-acceptance.md`.

## Cross-Cuts For Sidecar Reviewer (`Claude`)

Checks for sidecar reviewer `Claude` to verify upon handoff:

1. **Support-Only Compliance**: Confirm `P5-PAX-001-SIDECAR-REVIEW.md` is strictly a support review packet under `support/sidecars/P5-PAX-001/` with zero modifications to canonical files or parent implementation.
2. **Commit Anchoring**: Confirm all 24 delta files and line numbers match delivered parent commit `ff6a64ac3041` (`origin/dev`).
3. **Blocking Issue Resolution (R2)**:
   - (B1) Reviewer correctly named `Claude` across header, purpose, cross-cuts, checklist, and commit trailer.
   - (B2) Parent owner/reviewer correctly stated as `Claude` / `Gemini`.
   - (B3) Evidence primary anchor updated to delivered commit `ff6a64ac3041` on `origin/dev`.
   - (A1) Catalog item 10 file path fixed to `apps/passenger-web/components/passenger-ride-page.tsx`.
   - (A2) Catalog item 12 `passenger-fixtures.ts` diff fixed to `+24 / -120`.
   - (A3) `maskOpaqueToken` anchored to `sensitive-data-policy.ts:131-149`; `resolvePassengerSubjectRef` anchored to `L52-67`.
   - (A4) All 24 delta file line counts regenerated from `git diff --numstat a03e32ea2 ff6a64ac3041` using uniform `+added / -deleted` notation.
4. **Durability & Branch Push**: Confirm owner branch `gemini/p5-pax-001-sidecar-review` is pushed to `origin`.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — lives in `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md`.
- [x] Do not edit canonical truth — no L1/L2 specs or primary implementation code modified.
- [x] Hand off the packet to assigned reviewer (`Claude`).

## Out Of Scope For This Sidecar

- Modifying parent implementation files in `apps/api/` or `apps/passenger-web/`.
- Changing task lifecycle or canonical backlog assignments of parent task `P5-PAX-001`.
- Editing system architecture or product specifications.

## Files Created / Updated By This Sidecar

```text
support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md
```
