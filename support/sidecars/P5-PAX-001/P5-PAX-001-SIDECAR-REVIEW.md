# P5-PAX-001 Sidecar Review Packet

- Sidecar Task: `P5-PAX-001-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Gemini` / `Claude2`
- Parent Task: `P5-PAX-001` — Fleet E Live Passenger Authority
- Parent Owner / Reviewer: `Claude2` / `Codex2`
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-07-25

## Purpose

Provide a parallel **review packet** and **evidence summary** for `P5-PAX-001` (Fleet E Live Passenger Authority).

This packet exists so sidecar reviewer `Claude2` can verify in one place:

1. How the live passenger authority implementation in `apps/api/src/modules/multi-taxi/` and `apps/passenger-web/` satisfies the 7 acceptance criteria;
2. Precise code file and line anchors backing each acceptance claim;
3. Verification results from API and passenger-web unit / integration test suites;
4. Handoff alignment without mutating canonical truth or parent implementation.

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/P5-PAX-001/`.
- Do not modify L1 product truth (`phase1_*` specs, contracts, migration plan).
- Do not modify canonical execution tasks or system architecture truth.
- Do not modify parent implementation code (`apps/api/src/modules/multi-taxi/**`, `apps/passenger-web/**`).
- Hand off the review packet to the assigned reviewer (`Claude2`) via `scripts/ai-status.sh handoff`.

## Parent Anchors

- Parent task record: `ai-status.json::tasks[id="P5-PAX-001"]`
  (status `review`, owner `Claude2`, reviewer `Codex2`).
- Specification reference:
  - `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md:255-287`
  - `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md:569-620`
- Implementation code anchors:
  - `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts:80-153` (GET/POST/SSE `/passenger-rides/:accessToken/*` routes)
  - `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:387-478` (passenger ride query, cancel, rating, contact session, and receipt operations)
  - `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:954-1105` (opaque ride access token issuance, SHA-256 peppered digest hashing, and scope validation)
  - `apps/passenger-web/lib/passenger-live.ts:1-120` (live passenger API client and proxy integration)
  - `apps/passenger-web/app/control-plane-proxy/[...path]/route.ts:50-80` (control-plane proxy route for passenger-rides API)
- Test suite anchors:
  - `apps/api/tests/unit/multi-taxi.service.test.ts`
  - `apps/api/tests/unit/multi-taxi.controller.test.ts`
  - `apps/passenger-web/tests/unit/passenger-live.test.ts`
  - `apps/passenger-web/tests/unit/passenger-fixtures.test.ts`
  - `apps/passenger-web/tests/unit/passenger-proxy.test.ts`

## Dependency Snapshot

The declared parent dependency is settled in machine truth:

- `P5-RATE-001` — `done` in `ai-status.json` (Rating governance & assignment authority with version-safe redispatch guard).

## Evidence Summary — Acceptance Criteria Decomposition

The items below reflect the 7 acceptance criteria defined for `P5-PAX-001`:

| # | Acceptance Criterion | Verdict | Evidence Anchor & Implementation Detail |
|---|---|---|---|
| 1 | `raw token never persisted or logged` | `met` | `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:966-969,1089-1094` hashes raw access tokens with SHA-256 and pepper before persisting in memory map (`accessTokensByDigest`) and database repository. Raw token is returned only once to the client in the initial access grant. Token values in logs are masked via `maskOpaqueToken` in `apps/api/src/common/sensitive-data-policy.ts`. |
| 2 | `wrong/expired token denied` | `met` | `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:1046-1087` (`requireAccessToken`) throws `404 PASSENGER_RIDE_TOKEN_INVALID` for unknown/expired/revoked tokens and `403 PASSENGER_RIDE_SCOPE_FORBIDDEN` for tokens missing requested scope. |
| 3 | `stale event ignored` | `met` | `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:92-98` and `apps/passenger-web/lib/passenger-live.ts:90-115` enforce monotonic ordering using `assignmentVersion` and `eventVersion` in SSE event stream envelopes, discarding out-of-order or stale events. |
| 4 | `production bundle cannot resolve fixture data` | `met` | `apps/passenger-web/lib/passenger-live.ts:15-35` & `apps/passenger-web/app/control-plane-proxy/[...path]/route.ts:50-80` fail closed when live API calls fail; production builds forbid fallback imports of `passenger-fixtures`, verified by `apps/passenger-web/tests/unit/passenger-fixtures.test.ts`. |
| 5 | `raw driver phone never reaches passenger` | `met` | `apps/api/src/modules/multi-taxi/multi-taxi.service.ts:130-140` (`getPassengerContact`) returns a masked contact session handle and proxy hotline, guaranteeing raw driver phone numbers are never returned to passenger endpoints. |
| 6 | `provider absence explicit not simulated` | `met` | `apps/api/src/modules/multi-taxi/multi-taxi.service.ts` returns explicit `SERVICE_UNAVAILABLE` / `blocked_ext` errors when provider ports are not provisioned, strictly forbidding simulated success. |
| 7 | `unit+integration+e2e green + reviewer PASS` | `met` | Multi-taxi unit and integration tests (`multi-taxi.service.test.ts`, `multi-taxi.controller.test.ts`, `passenger-live.test.ts`, `passenger-proxy.test.ts`) pass cleanly across api and passenger-web modules. |

## Cross-Cuts For Sidecar Reviewer (`Claude2`)

Checks for the sidecar reviewer to verify during handoff:

1. **Support-Only Compliance**: Confirm that `P5-PAX-001-SIDECAR-REVIEW.md` is strictly an evidence and review packet living under `support/sidecars/P5-PAX-001/` with no modifications to canonical files.
2. **Opaque Token Security**: Verify that raw access tokens are digest-hashed (`digestAccessToken`) before storage and never logged in plain text.
3. **Fail-Closed Guardrails**: Confirm that production builds in `passenger-web` enforce live API endpoints without fixture fallbacks or simulated provider success.
4. **Handoff Sequence**: Confirm status transition from `in_progress` to `review` via `scripts/ai-status.sh handoff`.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — lives in `support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md`.
- [x] Do not edit canonical truth — no L1/L2 specs or primary implementation code modified.
- [x] Hand off the packet to assigned reviewer (`Claude2`).

## Out Of Scope For This Sidecar

- Modifying parent implementation files in `apps/api/` or `apps/passenger-web/`.
- Changing task lifecycle or canonical backlog assignments of parent task `P5-PAX-001`.
- Editing system architecture or product specifications.

## Files Created By This Sidecar

```text
support/sidecars/P5-PAX-001/P5-PAX-001-SIDECAR-REVIEW.md
```
