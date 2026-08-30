# Driver-Facing Endpoints Authorization Matrix

This document provides the canonical server-side authorization matrix for all driver-facing endpoints across the backend API, satisfying task requirements for `BE-DRV-AUTHZ-001`.

## Overview

The backend enforces strict server-side authorization:
1. **Authentication Boundary**: All protected routes require a valid authenticated identity (JWT or control-plane assertion). Unauthenticated requests are rejected with `401 Unauthorized` (`AUTH_REQUIRED` / `JWT_INVALID`).
2. **Realm Boundary**: Routes require appropriate realm membership (`driver`, `ops`, `platform`, `system`). Unauthorized realms receive `403 Forbidden` (`AUTH_REALM_DENIED`).
3. **Scope Boundary**: Routes require specific scopes matching the IAM Policy Catalogue (`driver:read`, `driver:write`, `incident:write`, `dispatch:read`, `notifications:write`). Missing scopes receive `403 Forbidden` (`AUTH_SCOPE_DENIED`).
4. **Resource Isolation (Cross-Driver Enforcement)**: Authenticated drivers are strictly prevented from querying or mutating resources belonging to other drivers. Mismatches are rejected with `403 Forbidden` (`DRIVER_IDENTITY_MISMATCH`, `SAFETY_OPERATOR_IDENTITY_MISMATCH`, `DRIVER_DEVICE_BINDING_FORBIDDEN`, `NOTIFICATION_ACTOR_MISMATCH`) or non-leaking `404 Not Found` (`DRIVER_SETTINGS_NOT_FOUND`, `DRIVER_SOS_EVENT_NOT_FOUND`, `DRIVER_NOT_FOUND`, `NOT_FOUND`).

---

## Endpoint Authorization Matrix

| Controller | Method | Route Path | Required Realms | Required Scopes | Unauthenticated (401) | Cross-Driver Authorization Enforcement (403 / 404) | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `DriverProfileController` | `GET` | `/api/driver/profile` | `system`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | Implicitly scoped to caller `identity.actorId`. | Retrieve driver self profile |
| `DriverProfileController` | `POST` | `/api/driver/profile` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | Implicitly scoped to caller `identity.actorId`. | Create driver self profile |
| `DriverProfileController` | `PATCH` | `/api/driver/profile` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | Implicitly scoped to caller `identity.actorId`. | Update driver self profile |
| `DriverSettingsController` | `GET` | `/api/driver-settings` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | Implicitly scoped to caller `identity.actorId`. | List driver settings |
| `DriverSettingsController` | `GET` | `/api/driver-settings/:driverId` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 404 `DRIVER_SETTINGS_NOT_FOUND` on cross-driver mismatch | Retrieve driver settings |
| `DriverSettingsController` | `PATCH` | `/api/driver-settings/:driverId` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_SETTINGS_NOT_FOUND` on cross-driver mismatch | Update driver settings |
| `DriverSosController` | `POST` | `/api/driver/sos-events` | `driver` | `incident:write` | 401 `AUTH_REQUIRED` | Binds SOS event driverId to `identity.actorId`. | Submit driver SOS event |
| `DriverSosController` | `POST` | `/api/driver/sos-events/:sosEventId/attachments/upload-intents` | `driver` | `incident:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_SOS_EVENT_NOT_FOUND` on cross-driver event | Create SOS attachment upload intent |
| `DriverSosController` | `POST` | `/api/driver/sos-events/:sosEventId/attachments/confirm` | `driver` | `incident:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_SOS_EVENT_NOT_FOUND` on cross-driver event | Confirm SOS attachment upload |
| `DriverSosController` | `GET` | `/api/driver/sos-events/:sosEventId/attachments` | `driver` | `incident:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_SOS_EVENT_NOT_FOUND` on cross-driver event | List SOS attachments |
| `DriverSosController` | `POST` | `/api/driver/sos-events/:sosEventId/attachments/:attachmentId/retry-scan` | `driver` | `incident:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_SOS_EVENT_NOT_FOUND` on cross-driver event | Retry attachment virus scan |
| `PlatformPresenceController` | `GET` | `/api/platform-presence` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` if requestedDriverId !== actorId | Get platform presence summary |
| `PlatformPresenceController` | `POST` | `/api/platform-presence/online` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` if requestedDriverId !== actorId | Set driver platform online |
| `PlatformPresenceController` | `POST` | `/api/platform-presence/offline` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` if requestedDriverId !== actorId | Set driver platform offline |
| `PlatformEarningsController` | `GET` | `/api/platform-earnings/summary` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` if requestedDriverId !== actorId | Get platform earnings summary |
| `PlatformEarningsController` | `GET` | `/api/platform-earnings/by-platform` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` if requestedDriverId !== actorId | Get earnings breakdown by platform |
| `DriverHeartbeatController` | `POST` | `/api/driver/location-heartbeats/batch` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` if item.driverId !== actorId | Record batch of driver heartbeats |
| `DriverHeartbeatController` | `GET` | `/api/driver/tracking-status` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` if driverId !== actorId | Get driver tracking status |
| `ShiftAttendanceController` | `POST` | `/api/shift-attendance/clock-in` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_NOT_FOUND` if command.driverId !== actorId | Clock in driver shift |
| `ShiftAttendanceController` | `POST` | `/api/shift-attendance/clock-out` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_NOT_FOUND` if command.driverId !== actorId | Clock out driver shift |
| `ShiftAttendanceController` | `GET` | `/api/shift-attendance/shifts` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | Scoped to caller `identity.actorId` (returns empty for other IDs) | List driver shifts |
| `ShiftAttendanceController` | `GET` | `/api/shift-attendance/shifts/:shiftId` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 404 `NOT_FOUND` on cross-driver shift access | Get shift detail |
| `ShiftAttendanceController` | `POST` | `/api/shift-attendance/shifts/:shiftId/abandon` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 404 `NOT_FOUND` on cross-driver shift mutation | Abandon shift |
| `ShiftAttendanceController` | `GET` | `/api/shift-attendance/attendance` | `system`, `platform`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | Scoped to caller `identity.actorId` (returns empty for other IDs) | List driver attendance records |
| `OwnedMobilityController` | `GET` | `/api/driver/tasks` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | Scoped to `identity.actorId`; 403 `DRIVER_IDENTITY_MISMATCH` on query mismatch | List driver assigned tasks |
| `OwnedMobilityController` | `GET` | `/api/driver/task-events` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` if requestedDriverId !== actorId | SSE stream of driver task events |
| `OwnedMobilityController` | `GET` | `/api/driver/tasks/:taskId` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` on cross-driver task access | Get driver task detail |
| `OwnedMobilityController` | `POST` | `/api/driver/tasks/:taskId/accept` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` on cross-driver task mutation | Accept driver task |
| `OwnedMobilityController` | `POST` | `/api/driver/tasks/:taskId/reject` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` on cross-driver task mutation | Reject driver task |
| `OwnedMobilityController` | `POST` | `/api/driver/tasks/:taskId/depart` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` on cross-driver task mutation | Mark driver departed towards pickup |
| `OwnedMobilityController` | `POST` | `/api/driver/tasks/:taskId/arrived_pickup` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` on cross-driver task mutation | Mark driver arrived at pickup |
| `OwnedMobilityController` | `POST` | `/api/driver/tasks/:taskId/start` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` on cross-driver task mutation | Start driver task / trip |
| `OwnedMobilityController` | `POST` | `/api/driver/tasks/:taskId/complete` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `DRIVER_IDENTITY_MISMATCH` on cross-driver task mutation | Complete driver task / trip |
| `ForwarderController` | `GET` | `/api/driver/task-views` | `system`, `driver` | `dispatch:read` | 401 `AUTH_REQUIRED` | Scoped to caller `identity.actorId` | List unified forwarded driver task views |
| `ForwarderController` | `GET` | `/api/driver/task-views/:taskId` | `system`, `driver` | `dispatch:read` | 401 `AUTH_REQUIRED` | 404 `DRIVER_TASK_VIEW_NOT_FOUND` on cross-driver task access | Get unified forwarded driver task view |
| `ForwarderController` | `POST` | `/api/driver/forwarded-orders/:taskId/accept` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_TASK_VIEW_NOT_FOUND` on cross-driver task mutation | Accept forwarded external order |
| `ForwarderController` | `POST` | `/api/driver/forwarded-orders/:taskId/reject` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 404 `DRIVER_TASK_VIEW_NOT_FOUND` on cross-driver task mutation | Reject forwarded external order |
| `SafetyOperatorController` | `GET` | `/api/safety-operator/qualification` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator query | Check safety operator qualification |
| `SafetyOperatorController` | `GET` | `/api/safety-operator/assignments` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator query | List safety operator assignments |
| `SafetyOperatorController` | `POST` | `/api/safety-operator/assignments` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator creation | Create safety operator assignment |
| `SafetyOperatorController` | `POST` | `/api/safety-operator/assignments/:assignmentId/engage` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator mutation | Engage safety operator assignment |
| `SafetyOperatorController` | `POST` | `/api/safety-operator/assignments/:assignmentId/release` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator mutation | Release safety operator assignment |
| `SafetyOperatorController` | `GET` | `/api/safety-operator/shifts` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator query | List safety operator shifts |
| `SafetyOperatorController` | `POST` | `/api/safety-operator/shifts/start` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator shift start | Start safety operator shift |
| `SafetyOperatorController` | `POST` | `/api/safety-operator/shifts/:shiftId/end` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator shift end | End safety operator shift |
| `SafetyOperatorController` | `GET` | `/api/safety-operator/pre-trip-checklists` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator query | List pre-trip checklists |
| `SafetyOperatorController` | `POST` | `/api/safety-operator/pre-trip-checklists` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator submission | Submit pre-trip checklist |
| `SafetyOperatorController` | `GET` | `/api/safety-operator/takeover-reports` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator query | List takeover reports |
| `SafetyOperatorController` | `POST` | `/api/safety-operator/takeover-reports` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator submission | Submit takeover report |
| `SafetyOperatorController` | `GET` | `/api/safety-operator/trip-closeouts` | `system`, `ops`, `driver` | `driver:read` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator query | List trip closeout reports |
| `SafetyOperatorController` | `POST` | `/api/safety-operator/trip-closeouts` | `system`, `driver` | `driver:write` | 401 `AUTH_REQUIRED` | 403 `SAFETY_OPERATOR_IDENTITY_MISMATCH` on cross-operator creation | Create trip closeout report |
| `AuthController` | `POST` | `/api/auth/driver/device/register` | Open (Public) | None (`@OpenRoute()`) | Allowed (`@OpenRoute()`) | N/A (Initial registration with invitation code) | Register driver device binding |
| `AuthController` | `POST` | `/api/auth/driver/device/refresh` | Open (Public) | None (`@OpenRoute()`) | Allowed (`@OpenRoute()`) | N/A (Refresh token exchange with device check) | Refresh driver device session |
| `AuthController` | `POST` | `/api/auth/driver/device/revoke` | `system`, `platform`, `ops`, `driver` | None | 401 `AUTH_REQUIRED` | 403 `DRIVER_DEVICE_BINDING_FORBIDDEN` if caller is another driver | Revoke driver device session binding |
| `NotificationsController` | `POST` | `/api/notifications/read` | `system`, `platform`, `ops`, `driver` | `notifications:write` | 401 `AUTH_REQUIRED` | 403 `NOTIFICATION_ACTOR_MISMATCH` if notification belongs to another recipient | Mark notifications as read |
| `IncidentController` | `*` | `/api/incidents/*` (10 routes) | `system`, `platform`, `ops` | `incident:read` / `incident:write` | 401 `AUTH_REQUIRED` | 403 `AUTH_REALM_DENIED` for `driver` realm callers | Control-plane incident management |

---

## Automated Test Coverage

This matrix is derived and tested at runtime via automated test suites:
- `tests/security/iam-driver-authz-enforcement.test.ts`: Dynamically discovers all driver-facing endpoints via TypeScript AST, asserts unauthenticated rejection (`401`), asserts runtime classification / guards, and tests cross-driver isolation (`403` / `404`) across all controllers.
- `tests/security/iam-route-inventory.test.ts`: Validates 100% route classification, scope conformance, and realm compatibility against the IAM Policy Catalogue.
- `tests/security/iam-route-driver-negative.test.ts`: Negative test matrix for driver routes across diverse error conditions and existence leakage prevention.
