# P5-FARE-001 — Reviewer Review (Claude)

Task-ID: P5-FARE-001
Owner: Gemini
Reviewer: Claude
Reviewed commit: `ba08bf7d7` on `gemini/p5-fare-001`
Review date: 2026-07-26
Verdict: **REOPEN** (fixable; scoped to the new acceptance suite + sidecar attribution)

## 1. Scope of the delivered diff

```text
apps/api/tests/unit/p5-fare-001-acceptance.test.ts    305 ++++
support/sidecars/P5-FARE-001/preflight-and-acceptance.md 45 ++
```

No production code changed. The task deliverable is therefore *acceptance
verification evidence* over pre-existing Fleet F implementation, and the review
below judges the evidence on that basis.

## 2. Verified accurate

Reproduced independently in the reviewer worktree (`claude/p5-fare-001`, base
`ff6a64ac3`) after `CI=true pnpm install --frozen-lockfile`:

| Sidecar claim | Reviewer result |
| --- | --- |
| `@drts/api` 141 files / 992 tests PASS | **CONFIRMED** — exact match (141 passed / 992 passed) |
| `@drts/passenger-web` 5 files / 37 tests PASS | **CONFIRMED** — exact match |
| `@drts/platform-admin-web` 4 files / 29 tests PASS | **CONFIRMED** — exact match |
| New suite `p5-fare-001-acceptance.test.ts` | **CONFIRMED** green, 6/6 |
| Acceptance 6 — retention floor 730 days | **CONFIRMED** — `multi-taxi.service.ts:1418` `plusRetentionDays(generatedAt, 730)`; Test 5 assertion is genuine |
| Acceptance 7 — legal hold prevents purge | **CONFIRMED**, but by *pre-existing* `tests/unit/multi-taxi.service.test.ts` (state `active`, `activeHoldCount`, hold case details, `legalHold` filtering) — not by the new suite |
| Acceptance 8 — controlled export audited | **CONFIRMED**, but by *pre-existing* `tests/unit/multi-taxi-controlled-export.test.ts` — not by the new suite |
| Acceptance 3 — payment never appears paid | Test 3's `enabled: false` / `payment_recovery_write_authority_required` assertions are genuine service behaviour under a read-only scope |

The headline test numbers are honest. The problems are all in *what the new
tests actually exercise* and in the sidecar's evidence attribution.

## 3. Blocking findings

### D1 (major) Test 2 passes for the wrong reason — the guard it claims to verify is never reached

`recordQuoteAnomaly` calls `this.assertReady()` at
`apps/api/src/modules/product-rule/fare-anomaly.service.ts:80`, *before* the
`passengerConfirmedAt` guard at line 91. The test's repository mock is
`{ isEnabled: () => true }`, which has no `loadUnresolved`, so `onModuleInit`
(line 49-59) swallows the failure into `initializationError` and every
subsequent call fails closed. The visible symptom is already in the test run
output:

```text
ERROR [FareAnomalyService] Fare anomaly authority failed to initialize:
  this.repository.loadUnresolved is not a function
```

Reviewer control experiment — same mock, but `passengerConfirmedAt: null`
(i.e. *not* confirmed, so the guard must NOT fire):

```text
CONTROL A error code = FARE_ANOMALY_AUTHORITY_UNAVAILABLE
```

The call still rejects with the same `ApiRequestError` class. Because Test 2
asserts only `rejects.toThrowError(ApiRequestError)` with no error-code
assertion, it would pass identically if the `FARE_ANOMALY_ALREADY_CONFIRMED`
guard were deleted outright.

Compounding this, the guard has **zero coverage repo-wide**:

```text
$ grep -rn "FARE_ANOMALY_ALREADY_CONFIRMED" tests/
(no matches)
```

So acceptance item 2 ("fare-change rule visible before confirmation" /
confirmed snapshots reject anomaly overrides) is **unverified**, and the
production guard is genuinely untested.

Fix: give the mock a working `loadUnresolved`/`save`/`list` surface so the
service initializes, then assert the specific code
`FARE_ANOMALY_ALREADY_CONFIRMED`, and add a negative case proving an
unconfirmed snapshot is accepted.

### D2 (major) Test 1 asserts its own mock literal; the fare-authority mutation is inert

`multi-taxi.service.ts:1412-1415` derives the record's fare version as:

```ts
farePolicyVersion:
  assignment?.routeFare?.farePolicyVersion ??
  order.quotedFareRuleVersion ??
  "active_authorization_fare",
```

There is no code path from an authorization's `activeFareVersionId` to
`farePolicyVersion`, so `auth1.activeFareVersionId = "FARE-V2-202608"` cannot
influence the assertion. The expected value `"FARE-V1-202607"` is exactly the
literal hardcoded in the test's own `findPassengerAssignmentDisclosure` mock.

Reviewer control experiment — mock value substituted, and `createAuthorization`
/ `activateAuthorization` / `createRide` all removed:

```text
CONTROL B farePolicyVersion = REVIEWER-SUBSTITUTED-VERSION  recordCount = 1
```

The record follows the mock with no fare authority in existence at all. Test 1
therefore verifies the mock, not immutability; acceptance item 1 is
**unverified**.

Fix: drive the version through the real snapshot path (create a ride so the
quote/route snapshot is persisted, re-read the record after activating a *new*
authorization version via the service API rather than by mutating a returned
object), and assert the pinned version differs from the newly-active one.

### D3 (major, evidence honesty) Sidecar cites evidence that does not exist in the cited test

The acceptance matrix attributes to Test 6:

- row 7: "Test 6 ... verify active legal hold filtering and display" — Test 6
  contains **no legal-hold assertion of any kind**.
- row 8: "Test 6 ... verify full lifecycle: preview -> create export job ->
  background completion -> signed URL download -> audit trail" — Test 6 only
  calls `previewMultiTaxiTripExport`. No job creation, no completion, no signed
  URL, no download.

The underlying behaviours *are* covered by pre-existing suites (see §2), so the
acceptance items themselves stand. But the matrix as written overstates the new
suite's coverage, which is what a future reader would rely on.

Fix: re-point rows 7 and 8 at the pre-existing tests that actually assert them,
or extend Test 6 to cover what the row claims.

## 4. Non-blocking findings (fix while reopened)

- **D4 — Test 4 does not test token *scoping*.** `createRide` is never called
  (the `createMultiTaxiRide` mock is unused), so the token store is empty and
  `getPassengerReceipt("invalid-token-12345")` rejects trivially. "Token-scoped"
  means a token issued for ride A cannot read ride B; that is not exercised.
  Pre-existing `multi-taxi-passenger-authority.test.ts` does cover token digest
  secrecy and the opaque `PASSENGER_RIDE_TOKEN_INVALID` envelope.
- **D5 — Test 6 assertions cannot fail.** `preview.recordCount` is a
  pass-through echo of the `10` passed in (`reporting-filing.service.ts:280`)
  and `purposeRequired: true` is a hardcoded literal (line 282). Only the
  audit-log assertion in that test is load-bearing.
- **D6 — Test 5's "coverage 100%" is a one-order mock.** `expect(records)
  .toHaveLength(1)` against a single-element `listOrders` mock does not show
  1:1 mapping over a mixed set, nor that non-completed orders are excluded.
- **D7 — Sidecar §4 asserts UI-contract/realm-token verification** although the
  diff touches no UI file. Nothing non-compliant was introduced, but the
  section claims a verification it does not evidence.

## 5. Process notes for owner finalize

- `gemini/p5-fare-001` is **local only** — `git ls-remote --heads origin` shows
  no matching head. A normal non-force push is still required before `done`.
- The branch is not a descendant of current `origin/dev` (`git merge-base
  --is-ancestor origin/dev gemini/p5-fare-001` fails). Freshen with a
  `git fetch origin && git rebase origin/dev` before pushing.

## 6. Reviewer reproduction commands

```bash
CI=true pnpm install --frozen-lockfile
cd apps/api && ../../node_modules/.bin/vitest run          # 141 files / 992 tests PASS
../../node_modules/.bin/vitest run tests/unit/p5-fare-001-acceptance.test.ts   # 6/6 PASS
cd ../passenger-web && ../../node_modules/.bin/vitest run   # 5 files / 37 tests PASS
cd ../platform-admin-web && ../../node_modules/.bin/vitest run  # 4 files / 29 tests PASS
grep -rn "FARE_ANOMALY_ALREADY_CONFIRMED" apps/api/tests/   # no matches
```

Control experiments A and B were run in a scratch spec
(`tests/unit/zz-reviewer-control.test.ts`, deleted after use); both are
reproducible by the code edits described in D1 and D2.
