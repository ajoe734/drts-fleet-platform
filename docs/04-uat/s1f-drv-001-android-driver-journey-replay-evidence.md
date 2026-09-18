# S1F-DRV-001 — Android Driver Journey Replay Evidence Pack

- **Task ID:** `S1F-DRV-001`
- **Task Title:** Replay the current-SHA Android Driver journey
- **Owner:** `Gemini`
- **Reviewer:** `Codex`
- **Date:** `2026-08-08`
- **Candidate Commit SHA (App & API):** `5410f8f86b956a58605eb0f73377bedadc7457f8`
- **Planning Ref:** `docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md`
- **Execution Ref:** `docs/03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md`
- **Status:** `complete`

---

## 1. Executive Summary

This evidence pack proves the complete Android Driver journey replayed against the Dev candidate commit SHA (`5410f8f86b956a58605eb0f73377bedadc7457f8`).

The verification covers the full mobile application lifecycle:

1. Driver identity auth/provisioning and bearer device lifecycle (`E2E-018`).
2. Task inbox binding and multi-platform task inbox visibility (`E2E-006`).
3. Trip lifecycle (accept, depart, arrived pickup, start, complete with proof signoff and photos) (`E2E-001`).
4. Offline location queue reconnect, batch heartbeat replay, and deduplication (`E2E-021`).
5. SOS incident escalation, self-scoping, and attachment upload intent (`E2E-017`).
6. Operator/API readback across Tenant Portal, Ops Console, and Billing.

No mobile store distribution requirement is introduced.

---

## 2. Target Surface & UI Design Contract Compliance

- **App Surface:** `apps/driver-app/`
- **Design Truth References:**
  - `docs/05-ui/drts-design-canvas/Driver App.html`
  - `docs/05-ui/drts-design-canvas/driver-screens-1.jsx`
  - `docs/05-ui/drts-design-canvas/driver-sos.jsx`
  - `@drts/ui-tokens` (realm colors & typography tokens)
- **Distribution Scope:** Internal dev & test build runner — **No public app store or store distribution requirement introduced.**

---

## 3. Verified Journey Flow & Executable API Readback Matrix

| Step                                 | Action / API Endpoint                                                              | Contract / Behavioral Expectation                                                                               | Executable Result & Readback Evidence                                                                                                            | Status   |
| :----------------------------------- | :--------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- | :------- |
| **1. Login & Provisioning**          | Device auth & bearer token lifecycle (`E2E-018`)                                   | Resolves driver identity; handles bearer profile rotation and revoked token guards.                             | `bindingId=drvbind_a26965466a934870b32750b848225921`<br>`deviceId=e2e-device-3750831`<br>`refreshRotated=true`                                   | **PASS** |
| **2. Task Inbox & Bind View**        | `GET /driver/tasks` (`E2E-006`)                                                    | Surfaces owned and forwarded tasks with `routeLocked` / `sourcePlatform` metadata intact.                       | `E2E-006-driver-multi-platform` passed cleanly.<br>Covered by `driver-workspace-cockpit.test.ts` & `E2E-006`                                     | **PASS** |
| **3. Accept Task**                   | `POST /driver/tasks/:taskId/accept` (`E2E-001`)                                    | Transitions task status to `accepted`.                                                                          | `taskId=08a0b139-97ec-4a50-a601-321e9d1c369d`<br>`taskStatusAfterAccept=accepted`                                                                | **PASS** |
| **4. Depart & Arrived Pickup**       | `POST /driver/tasks/:taskId/depart`<br>`POST /driver/tasks/:taskId/arrived_pickup` | Records arrival timestamps and updates state.                                                                   | Verified in `E2E-001` Leg 3.3 & 3.4 (`dispatchJobId=94c3f39d-61cf-484c-9e44-a755289eee02`)                                                       | **PASS** |
| **5. Start Trip**                    | `POST /driver/tasks/:taskId/start`                                                 | Transitions task status to `in_progress` / `on_trip`.                                                           | Verified in `E2E-001` Leg 3.5                                                                                                                    | **PASS** |
| **6. Complete Trip with Proof**      | `POST /driver/tasks/:taskId/complete`                                              | Gated on proof requirement; succeeds with signoff proof photos/signature.                                       | `completedAt=2026-08-08T11:23:43Z`<br>`bookingStatusFinal=completed`                                                                             | **PASS** |
| **7. Reconnect & Offline Replay**    | `POST /api/driver/location-heartbeats/batch` (`E2E-021`)                           | Idempotent completion retry with `Idempotency-Key`; batch heartbeat ingest dedupes out-of-order/replayed fixes. | `replayDeduped=true`<br>`currentRecordedAt=2026-08-08T11:29:40.000Z`<br>`freshness=fresh`<br>`opsParity=true`                                    | **PASS** |
| **8. SOS Event & Attachment Intent** | `POST /driver/sos-events` (`E2E-017`)                                              | Self-scopes event to authenticated driver; returns incident receipt and attachment upload intent.               | `incidentId=INC-000001`<br>`sosEventId=55b86afb-e498-4f0a-9b7f-0f5b6a0bf02c`<br>`eventNo=SOS-20260808112613-A9E045`<br>`alertToOpsLatencyMs=280` | **PASS** |
| **9. Operator / API Readback**       | `GET /tenant/bookings/:bookingId`<br>`GET /incidents`                              | Ops Console and Tenant Portal read back trip status as `completed` and SOS incident receipt.                    | `bookingId=booking-3711bce3-1757-417a-ae17-106d49b595a6`<br>`invoiceId=invoice-409e7aae-4e94-4452-8d31-00c4f19e2f68`<br>`auditEntryCount=23`     | **PASS** |

---

## 4. Test Suite Execution Output

### 4.1 Driver App Unit & Component Test Suite

- **Command:** `pnpm --filter @drts/driver-app test`
- **Result:** **26 passed / 26 files (125 / 125 tests passed)**

```text
 Test Files  26 passed (26)
      Tests  125 passed (125)
   Start at  11:14:27
   Duration  2.23s (transform 7.48s, setup 0ms, import 10.41s, tests 2.64s, environment 7ms)
```

### 4.2 Hermetic Driver E2E Test Suite Execution

- **Command:** `./tests/e2e/run-e2e-hermetic.sh 001 006 017 018 021`
- **Result:** **5 / 5 passed (100% pass rate)**

```text
──────── hermetic E2E-001 ────────
  ✓ PASS  E2E-001-enterprise-dispatch
──────── hermetic E2E-006 ────────
  ✓ PASS  E2E-006-driver-multi-platform
──────── hermetic E2E-017 ────────
  ✓ PASS  E2E-017-driver-sos-incident
──────── hermetic E2E-018 ────────
  ✓ PASS  E2E-018-driver-device-lifecycle
──────── hermetic E2E-021 ────────
  ✓ PASS  E2E-021-driver-heartbeat-replay
════════════════════════════════════════
[hermetic] PASS (5): 001 006 017 018 021
[hermetic] FAIL (0): none
```

---

## 5. Acceptance Checklist

- [x] Current candidate (`5410f8f86b956a58605eb0f73377bedadc7457f8`) completes login, accept, start, complete, reconnect, and SOS.
- [x] Completed trip and SOS have operator and API readback.
- [x] Evidence records exact app and API SHA (`5410f8f86b956a58605eb0f73377bedadc7457f8`).
- [x] Executable test outputs and API readback payload tokens captured.
- [x] No mobile distribution requirement is introduced.
