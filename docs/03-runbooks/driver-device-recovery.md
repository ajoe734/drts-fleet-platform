# Driver Device Recovery & Compromised-Session Runbook (IAM-DRV-002)

## Overview

This runbook documents the mobile secure storage architecture, remote logout workflows, compromised-session handling, offline work preservation, and device recovery procedures for the DRTS Driver App (`apps/driver-app/`).

---

## 1. Secure Storage Posture & Token Isolation

### Platform Secure Storage
All sensitive authentication materials—including backend-issued access tokens and rotated refresh tokens—are strictly isolated within platform-provided secure storage:
- **iOS**: Apple Keychain Services (`expo-secure-store`)
- **Android**: Android Keystore System (`expo-secure-store`)

Insecure storage mechanisms (such as `AsyncStorage`, `localStorage`, or plaintext files) are forbidden for token storage.

### Log Sanitation & Privacy Enforcement
- Access tokens, refresh tokens, and raw Bearer Authorization headers must never be emitted into application logs, console output, telemetry, or crash reporting pipelines.
- Exception logger wrappers sanitize error parameters, stripping sensitive credential fields before outputting diagnostic summaries.

---

## 2. Declared Driver Mobile Auth States & Deterministic UX

The Driver App evaluates authentication status and API response errors to maintain a deterministic user experience across all declared states:

| Auth State | Code / Trigger | User Interface & Deterministic UX | Operational Behavior |
| :--- | :--- | :--- | :--- |
| **`not_provisioned`** | Initial app launch without stored session | Onboarding screen with Registration Code and Device Label input fields. | Blocks task reception; waits for valid registration code. |
| **`register`** | Active registration submission | Loading indicator with single-use registration code validation. | Binds `deviceId` and receives initial access/refresh token pair. |
| **`expired`** | `DRIVER_SESSION_EXPIRED`, `JWT_INVALID`, expired token | Banner: *"裝置登入 Session 已過期，請重新登入。"* | Clears expired credentials; routes to re-authentication. |
| **`revoked`** | `DRIVER_AUTH_REVOKED`, `DRIVER_DEVICE_SESSION_INVALID`, `DRIVER_DEVICE_REFRESH_INVALID` | Banner: *"此司機帳號已退役或撤銷，請聯絡平台管理員。"* or *"此裝置的司機綁定已失效或被撤銷，請重新輸入註冊碼綁定。"* | Clears device credentials from SecureStore; halts task reception; preserves offline proofs. |
| **`suspended`** | `DRIVER_AUTH_SUSPENDED` | Banner: *"此司機帳號已被停權，暫時無法刷新裝置登入。"* | Clears credentials; disables online status; preserves offline proofs. |
| **`reuse`** | `DRIVER_REFRESH_REUSE_DETECTED` | Banner: *"偵測到安全性例外（Session 重複使用），金鑰已自動清除，請重新登入綁定。"* | Triggers immediate security wipe of tokens; invalidates refresh family on backend; preserves offline proofs. |
| **`rebind`** | `DRIVER_DEVICE_REBOUND` | Banner: *"此裝置已被重新綁定至其他帳號，請重新輸入註冊碼。"* | Clears old session credentials; prompts driver for new registration code. |

---

## 3. Remote Logout & Compromised Session Procedures

### Remote Revocation Workflow
1. **Trigger**: An admin or operator revokes a driver's device binding via Platform Admin Console, or the driver initiates device logout via Settings screen (`POST /auth/driver/device/revoke`).
2. **Backend Action**: The server marks the `driver_device_binding` as `revoked` and revokes all active refresh tokens within the family.
3. **Mobile Client Reaction**:
   - The next background refresh or API request receives `DRIVER_AUTH_REVOKED` or `DRIVER_DEVICE_SESSION_INVALID`.
   - `recoverDriverSessionFromApiError()` immediately deletes `drts.driver.session` from `SecureStore`.
   - The UI displays the revoked identity issue banner and routes the application back to the onboarding screen.

### Token Reuse Detection Workflow
1. **Trigger**: An attacker attempts to replay an old, already-rotated refresh token.
2. **Backend Action**: The backend detects token reuse (`consumeAndRotateRefreshToken`), invalidates the entire refresh family, returns `DRIVER_REFRESH_REUSE_DETECTED`, and records an audit security event (`driver_device_session.revoked`).
3. **Mobile Client Reaction**:
   - The legitimate driver device receives `DRIVER_REFRESH_REUSE_DETECTED` on its next refresh attempt.
   - `recoverDriverSessionFromApiError()` automatically purges stored tokens, alerts the driver of the security exception, and requires re-registration.

---

## 4. Offline Work & Unsynchronized Proof Preservation

### Architecture Rule
Authentication state invalidation **must never delete unsynchronized offline trip work or completion proof bundles**.

### Preserved Offline Stores
When credentials are wiped due to remote revocation, suspension, or token reuse:
- **Pending Task Completion Proofs** (`drts.driver.pendingTaskCompletion`): Preserved in `SecureStore`. Includes captured photos, notes, expense items, and signoff signatures.
- **Offline Location Heartbeats** (`drts.driver.locationOfflineQueue`): Preserved in local storage queue.
- **SOS Incident Outbox** (`drts.driver.sosOutbox`): Preserved in local outbox.

### Recovery Replay Workflow
1. Driver resolves authentication issue (e.g., enters a new registration code or receives account unsuspension).
2. Upon successful re-authentication, `replayPendingDriverTaskCompletion()` automatically re-transmits preserved offline task completion proofs using original idempotency keys (`X-Request-Id`).
3. Preserved location heartbeats and SOS reports resume replay once valid Bearer credentials are re-established.

---

## 5. Incident Response & Operator Checklist

### Stolen / Compromised Device Checklist
1. **Revoke Device Binding**: Navigate to Admin Console -> Driver Management -> Device Bindings, locate target device ID, and click **Revoke Binding**.
2. **Verify Security Audit Logs**:
   ```bash
   # Search for revocation audit events
   grep "driver_device_session.revoked" /var/log/drts/audit.log
   ```
3. **Issue Single-Use Registration Code**: Generate a fresh single-use registration code for the driver's replacement device.
4. **Re-bind & Synchronize**: Have the driver enter the registration code on the replacement device. Any pending offline completion proof will be replayed automatically upon registration completion.
