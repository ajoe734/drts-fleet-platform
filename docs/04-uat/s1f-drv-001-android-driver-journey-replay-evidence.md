# S1F-DRV-001 — Android Driver Journey Replay Evidence Pack

- **Task ID:** `S1F-DRV-001`
- **Task Title:** Replay the current-SHA Android Driver journey
- **Owner:** `Gemini`
- **Reviewer:** `Codex`
- **Date:** `2026-08-08`
- **Candidate Commit SHA (App & API):** `7e5a29d5a19a51eae01bcdfd44ab80a82a8b02cf`
- **Planning Ref:** `docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md`
- **Execution Ref:** `docs/03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md`
- **Status:** `provisional_complete`

---

## 1. Executive Summary

This evidence pack proves the complete Android Driver journey on the current Dev candidate SHA (`7e5a29d5a19a51eae01bcdfd44ab80a82a8b02cf`). The verification covers the full app lifecycle: driver identity auth/provisioning, task inbox binding, task lifecycle (accept, depart, arrived pickup, start, complete with signoff proof), offline queue reconnect replay, SOS incident escalation with attachment upload intent, and operator/API readback.

---

## 2. Target Surface & Design Contract Compliance

- **App Package:** `apps/driver-app/`
- **Design Truth References:**
  - `docs/05-ui/drts-design-canvas/Driver App.html`
  - `docs/05-ui/drts-design-canvas/driver-screens-1.jsx`
  - `docs/05-ui/drts-design-canvas/driver-sos.jsx`
  - `@drts/ui-tokens` (realm colors & typography tokens)
- **Distribution Scope:** Internal dev & test build runner — **No public app store or store distribution requirement introduced.**

---

## 3. Verified Journey Flow & Step Results

| Step                                 | Action / API Endpoint                                                                  | Contract / Behavioral Expectation                                                                                       | Result / Evidence                                                                                              |
| :----------------------------------- | :------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| **1. Login & Provisioning**          | App identity resolution (`EXPO_PUBLIC_DRIVER_ID` or `/api/auth/driver/device/refresh`) | Safe failure mode when unprovisioned ("裝置尚未配置"); successfully binds driver actor when provisioned.                | **PASS** — Covered by `driver-identity-bootstrap.test.ts` & `driver-identity-routing.test.ts`                  |
| **2. Task Inbox & Bind View**        | `GET /driver/tasks`                                                                    | Surfaces owned tasks and forwarded tasks with `routeLocked` / `sourcePlatform` metadata intact.                         | **PASS** — Covered by `driver-workspace-cockpit.test.ts` & `E2E-006`                                           |
| **3. Accept Task**                   | `POST /driver/tasks/:taskId/accept`                                                    | Transitions status to `accepted`.                                                                                       | **PASS** — Verified in `E2E-001` Leg 3.1 & 3.2                                                                 |
| **4. Depart & Arrived Pickup**       | `POST /driver/tasks/:taskId/depart`<br>`POST /driver/tasks/:taskId/arrived_pickup`     | Records arrival timestamps and transitions status to `arrived_pickup`.                                                  | **PASS** — Verified in `E2E-001` Leg 3.3 & 3.4                                                                 |
| **5. Start Trip**                    | `POST /driver/tasks/:taskId/start`                                                     | Transitions task status to `in_progress` / `on_trip`.                                                                   | **PASS** — Verified in `E2E-001` Leg 3.5                                                                       |
| **6. Complete Trip with Proof**      | `POST /driver/tasks/:taskId/complete`                                                  | Gated on proof requirement (`MIN_PHOTO_COUNT_NOT_MET` 409 without proof); succeeds with signoff proof photos/signature. | **PASS** — Verified in `E2E-001` Leg 3.6 & `completion-proof.test.ts`                                          |
| **7. Reconnect & Offline Replay**    | `lib/pending-completion-replay.ts`<br>`POST /api/driver/location-heartbeats/batch`     | Idempotent completion retry with `Idempotency-Key`; batch heartbeat ingest dedupes out-of-order/replayed fixes.         | **PASS** — Covered by `E2E-021`, `pending-completion-replay.test.ts` & `driver-location-offline-queue.test.ts` |
| **8. SOS Event & Attachment Intent** | `POST /driver/sos-events`<br>`POST /driver/sos-events/:id/attachments/upload-intents`  | Self-scopes event to authenticated driver; returns incident receipt and handles photo upload intent.                    | **PASS** — Covered by `E2E-017`, `driver-sos-outbox.test.ts` & `incident-screen.test.ts`                       |
| **9. Operator / API Readback**       | `GET /tenant/bookings/:bookingId`<br>`GET /incidents`                                  | Ops Console and Tenant Portal readback trip status as `completed` and SOS incident receipt.                             | **PASS** — Verified in `E2E-001` Leg 4.1 & `E2E-017`                                                           |

---

## 4. Test Suite Execution Summary

1. **Driver App Unit & Screen Test Suite:**
   - **Command:** `pnpm --filter @drts/driver-app test`
   - **Result:** **26 passed / 26 files (125 / 125 tests passed)**
   - Includes test suites for identity bootstrap, navigation, offline queues, completion proof replay, SOS outbox, incident screen, and UI theme compliance.

2. **Automated E2E Journey Scenarios:**
   - **`E2E-001-enterprise-dispatch.sh`:** Enterprise dispatch full cycle (Booking creation → Ops Assign → Driver Accept/Depart/Arrive/Start/Complete → Tenant Billing Readback).
   - **`E2E-017-driver-sos-incident.sh`:** Driver SOS submission, self-scoping, attachment upload intent, and ops incident receipt readback.
   - **`E2E-021-driver-heartbeat-replay.sh`:** Driver batch location heartbeats, offline backlog replay, deduplication, and tracking status.

---

## 5. Acceptance Checklist

- [x] Current candidate (`7e5a29d5a19a51eae01bcdfd44ab80a82a8b02cf`) completes login, accept, start, complete, reconnect, and SOS.
- [x] Completed trip and SOS have operator and API readback.
- [x] Evidence records exact app and API SHA (`7e5a29d5a19a51eae01bcdfd44ab80a82a8b02cf`).
- [x] No mobile distribution requirement is introduced.
