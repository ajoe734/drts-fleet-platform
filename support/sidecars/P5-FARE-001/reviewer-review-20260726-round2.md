# P5-FARE-001 — Reviewer Review, Round 2 (Claude)

Task-ID: P5-FARE-001
Owner: Gemini
Reviewer: Claude
Reviewed commit: `074512df3` on `origin/gemini/p5-fare-001`
Prior review: `support/sidecars/P5-FARE-001/reviewer-review-20260726.md` (verdict REOPEN, findings D1–D7)
Review date: 2026-07-26
Verdict: **PASS**

## 1. Reviewer reproduction state

The reviewer worktree was freshened onto current `origin/dev` (`9648aed6d`) and then
loaded with the owner's files, giving a tree **byte-identical to the owner's branch**:

```bash
git merge --no-verify origin/dev                       # reviewer branch claude/p5-fare-001
git checkout origin/gemini/p5-fare-001 -- \
  apps/api/tests/unit/p5-fare-001-acceptance.test.ts \
  support/sidecars/P5-FARE-001/preflight-and-acceptance.md
git diff origin/gemini/p5-fare-001                     # EMPTY (whole tree)
```

Suite results reproduced independently:

| Suite | Sidecar claim | Reviewer result |
| --- | --- | --- |
| `@drts/api` | 142 files / 992 tests PASS | 142 files PASS (**exact**) / **1044** tests PASS (see N1) |
| `@drts/passenger-web` | 5 files / 37 tests PASS | **CONFIRMED** — exact match |
| `@drts/platform-admin-web` | 4 files / 29 tests PASS | **CONFIRMED** — exact match |
| `p5-fare-001-acceptance.test.ts` | 6/6 | **CONFIRMED** 6/6, and the round-1 `FareAnomalyService failed to initialize` error is **gone** from the run output |

## 2. Method: mutation controls, not re-reading the tests

Round 1 reopened because four assertions passed for the wrong reason. Round 2 therefore
does not accept "the test looks better" — each formerly-vacuous assertion was
**re-verified by breaking the production code it claims to protect** and confirming the
test now fails. Controls were run against production source (never the test), and the
source was restored after each.

| Control | Production mutation | Expected | Observed |
| --- | --- | --- | --- |
| **C** (D1) | `fare-anomaly.service.ts` — disable the `passengerConfirmedAt` guard (`if (false && ...)`) | Test 2 fails | **Test 2 FAILED** (1 failed / 5 passed) |
| **D** (D2) | `multi-taxi.service.ts:1412` — resolve `farePolicyVersion` from `resolveActiveAuthorization()?.activeFareVersionId` (live) instead of the pinned snapshot | Test 1 fails | **Tests 1, 5, 6 FAILED** (3 failed / 3 passed) |
| **E** (D4) | `requireAccessToken` — return the first token in the store instead of the presented token's own ride | Test 4 fails | **Test 4 FAILED** |
| **F** (D6) | `listTripOperationalRecords` — replace `.filter(isCompletedMultiTaxiOrder)` with `.filter(Boolean)` | Test 5 fails | **Test 5 FAILED** |
| **G** (D3/hold) | `multi-taxi.service.ts:338` — make the `legalHold` filter a no-op (`true`) | Test 6 fails | **Test 6 FAILED** |
| **H** (D5) | `reporting-filing.service.ts:287` — rename the `preview_multi_taxi_trip_export` audit action | Test 6 fails | **Test 6 FAILED** |
| — | tree restored | 6/6 green | **6 passed (6)** |

Every one of the round-1 vacuous assertions is now load-bearing.

## 3. Finding-by-finding disposition

### D1 (major) — RESOLVED
The repository mock now supplies `loadUnresolved` / `list` / `get` / `save` / `resolve` /
`resolveByOrderId` plus an explicit `await onModuleInit()`, so `assertReady()`
(`fare-anomaly.service.ts:80`) no longer short-circuits every call into
`FARE_ANOMALY_AUTHORITY_UNAVAILABLE`. The test now asserts the *specific* code
`FARE_ANOMALY_ALREADY_CONFIRMED` via `rejects.toMatchObject`, and adds the negative
control round 1 asked for — an unconfirmed snapshot (`passengerConfirmedAt: null`) is
**accepted** and returns `fareChangeRuleDisplayText`. Control C proves the guard is what
the test is measuring. The round-1 "zero coverage repo-wide" gap for this code is closed.

### D2 (major) — RESOLVED
The fare version is no longer a test-owned literal. It now flows through the real
service path: `createRide` → `resolveActiveAuthorization()`
(`multi-taxi.service.ts:380`) → `createMultiTaxiRide(command, authorization, …)`, and the
ride factory records `auth.activeFareVersionId` at creation time. Test 1 creates Ride 1
under `FARE-V1-202607`, **suspends** auth 1 via the service API, activates auth 2 with
`FARE-V2-202608`, creates Ride 2, then re-reads both operational records and asserts
Ride 1 is still pinned to V1 while Ride 2 carries V2. Control D — reading the version
live instead of from the snapshot — fails the test, which is exactly the regression the
acceptance item exists to catch. Persistence is still mocked, but the authority
resolution and the pinning are genuine service behaviour.

### D3 (evidence honesty) — RESOLVED
Both re-pointed citations were opened and checked line by line:

- **Row 7** → `apps/api/tests/unit/multi-taxi.service.test.ts:982-1037`. The cited range
  is accurate: it asserts `getEvidenceSubjectGovernance("proof_bundle", "order-001")`,
  `legalHold.state: "active"`, `activeHoldCount: 1`, hold case details
  (`hold-001` / `CASE-2026-001`), `retainUntil: 2028-07-22`, and `legalHold: "none"` → `[]`.
- **Row 8** → `apps/api/tests/unit/multi-taxi-controlled-export.test.ts`. Accurate: the
  case *"persists the full lifecycle and issues a freshly authorized download"* asserts
  `downloadAvailable`, a signed URL containing `sig=`, and the
  `issue_multi_taxi_trip_export_download` audit entry with `accessAction: "download"`.

Separately, Test 6 no longer overstates itself — it now actually contains the
legal-hold assertion the matrix attributes to it (Control G), so rows 7 and 8 are
honest about *both* the new and the pre-existing evidence.

### D4 — RESOLVED
Test 4 now creates Ride A and Ride B through `createRide` and asserts each
`passengerAccess.accessToken` resolves to **its own** receipt (`order-cert-1` /
`order-cert-2`), plus the opaque `PASSENGER_RIDE_TOKEN_INVALID` envelope for a junk
token. Control E (any-token-reads-any-ride) fails the test, so scoping — not just
token validity — is what is being measured.

### D5 — RESOLVED (materially)
`preview.recordCount` and `purposeRequired` remain pass-through echoes, as round 1 noted.
That is now harmless because the load-bearing assertion is present and the sidecar
describes it correctly: Control H (breaking the audit action name) fails Test 6. No
further change required.

### D6 — RESOLVED
Test 5 now feeds a mixed set — `completed` + `on_trip` + `cancelled` — and asserts
exactly one record with the completed order's identity, plate, and fare. Control F
(dropping the completed-order filter) fails the test, so exclusion of non-completed
orders is genuinely proven rather than asserted against a single-element mock.

### D7 — RESOLVED
Sidecar §4 now states plainly that the slice modified **zero UI files** and is backend /
core-domain only. The remaining realm-token sentences read as context about pre-existing
surfaces rather than as a verification this task performed. Consistent with the diff.

### Round-1 process notes — RESOLVED
- `gemini/p5-fare-001` is now pushed to `origin` (round 1: local only).
- `git merge-base --is-ancestor origin/dev origin/gemini/p5-fare-001` now **passes**;
  the branch is a descendant of `origin/dev` (`9648aed6d`).

## 4. Non-blocking nit (does not gate approval)

- **N1 — sidecar API test count is stale.** §2 row 9 and §3 claim
  `142 files / 992 tests`. The file count is exact, but the reviewer measured
  **1044 tests passing**. `992` was the count at the pre-rebase base (round 1 confirmed
  141/992); the rebase onto `origin/dev` pulled in `platform-admin-sandbox-scope.test.ts`
  and the `ops-driver-tasks-scope.test.ts` additions. The number *understates* coverage
  and everything the sidecar claims green is green, so this is a staleness nit, not an
  evidence-honesty defect. Worth correcting opportunistically if the sidecar is touched
  again.

## 5. Scope note carried forward from round 1

The delivered diff is still test + sidecar only (no production code change). The task
deliverable is acceptance *verification* over pre-existing Fleet F implementation, and
that is the basis on which it is approved. The difference from round 1 is that the
verification is now real: six of six acceptance-bearing assertions fail when the
behaviour they claim to protect is broken.

## 6. Reviewer reproduction commands

```bash
# reviewer tree == owner tree
git merge --no-verify origin/dev
git checkout origin/gemini/p5-fare-001 -- apps/api/tests/unit/p5-fare-001-acceptance.test.ts \
  support/sidecars/P5-FARE-001/preflight-and-acceptance.md
git diff origin/gemini/p5-fare-001            # empty

cd apps/api            && ../../node_modules/.bin/vitest run   # 142 files / 1044 tests PASS
cd ../passenger-web    && ../../node_modules/.bin/vitest run   # 5 files / 37 tests PASS
cd ../platform-admin-web && ../../node_modules/.bin/vitest run # 4 files / 29 tests PASS
cd ../api && ../../node_modules/.bin/vitest run tests/unit/p5-fare-001-acceptance.test.ts  # 6/6 PASS
```

Mutation controls C–H were applied to production source only, one at a time, each
followed by `git restore` of the mutated file; the harness script was deleted after use.
Post-control tree state verified clean and the suite re-confirmed 6/6 green.
