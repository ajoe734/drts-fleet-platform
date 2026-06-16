# Driver App Verification — Summary & Findings Rollup (2026-06-15)

10 rounds, all executed on the `drts-android-dev-vm` emulator against a live,
seeded API. Page display + functional operation results verified each round.

## Round outcomes

| Round | Surface                    | Result                                                             |
| ----: | -------------------------- | ------------------------------------------------------------------ |
|     1 | Workspace Cockpit          | PASS (+ fixed Pill `<Text>` bug)                                   |
|     2 | Jobs Inbox                 | PASS                                                               |
|     3 | Trip Lifecycle             | PASS (drove accept→on_trip)                                        |
|     4 | Forwarded Orders           | PASS (accept preserves routeLocked/sourcePlatform; reject removes) |
|     5 | Earnings                   | PASS (+ confirms merged graceful-degradation fix)                  |
|     6 | Platform Presence          | PASS (finding: online-without-binding API/UI divergence)           |
|     7 | Completion Proof + Replay  | PASS (proof gate + idempotent replay + 14 unit tests)              |
|     8 | Identity / Onboarding      | PASS (no silent fallback; invalid code → 403)                      |
|     9 | Settings                   | PASS (PATCH persists)                                              |
|    10 | Incident / SOS + Heartbeat | PASS display/logic; **FAIL driver incident creation (403)**        |

## Automated coverage exercised

- Unit (driver-app): completion-proof, pending-completion-replay,
  use-pending-completion-replay (14), driver-identity-routing, driver-identity-bootstrap (7),
  driver-location-heartbeat, incident-screen, route-display (7) → **28 tests green**.
- E2E shell: `E2E-001` (owned lifecycle), `E2E-006` (driver multi-platform) exercised live.

## Findings (priority order)

1. **[HIGH — safety] Driver SOS/incident creation returns 403** (Round 10). The
   安全求援 screen is enabled & actionable but `POST /api/incidents` excludes the
   `driver` realm → SOS never reaches dispatch/safety. Fix: allow driver-scoped
   incident creation (`reportedBy=relatedDriverId=self`) or a dedicated driver SOS
   endpoint; add a driver-SOS E2E once fixed. (Route has no explicit auth-matrix
   entry — it falls under the default policy; change deliberately + review.)
2. **[FIXED] Pill `<Text>` LogBox on every canvas screen** — fixed in this branch
   (`DRV-APP-PILL-TEXT-20260615`), verified logcat error count → 0.
3. **[FIXED, earlier PR #712] Earnings blank on /driver-statements 403** — verified
   resolved in Round 5 (statements degrade to empty; dashboard renders).
4. **[LOW] Platform online-without-binding API/UI divergence** (Round 6).
5. **[LOW] Cockpit `今日淨收` 0 vs Earnings `本日` 2,050** inconsistency (Rounds 1/5).
6. **[LOW/UX] Active-trip background-location gate** routes to Settings without an
   in-app rationale (Round 3).

## Recommended test-case additions (land WITH their fixes, kept green)

- Driver-SOS E2E (with finding 1 fix).
- Forwarded reject-removes-from-inbox assertion (extend `E2E-006`).
- Device register→bind→refresh→revoke E2E (needs a provisionable registration code in seed).
