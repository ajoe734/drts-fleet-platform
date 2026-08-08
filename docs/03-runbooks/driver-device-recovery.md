# Driver Mobile Secure Storage, Remote Logout, and Device Recovery Runbook

Last Updated: 2026-08-08  
Task Reference: `IAM-DRV-002`  
Architecture Ref: `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`  
Execution Task Ref: `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`

---

## 1. Overview & Security Posture

This runbook defines the security architecture, authentication state machine, remote logout mechanisms, compromised-session UX, and device recovery procedures for the DRTS Mobile Driver Application (`@drts/driver-app`).

### Core Posture Principles
1. **Platform Secure Storage Only**: Access tokens and refresh tokens must never enter insecure storage (such as `AsyncStorage`, `localStorage`, unencrypted files, or URL parameters). Mobile session materials are stored exclusively via platform secure storage (`expo-secure-store` using iOS Keychain and Android EncryptedSharedPreferences).
2. **Zero-Token Log Hygiene**: Tokens, `Bearer` authorization headers, and raw refresh secrets must never be logged to application logs, crash reports, or UI error callouts. The app employs automated log sanitization (`sanitizeLogMessage`) on all API error messages and payloads.
3. **Deterministic UX Auth State Machine**: All declared authentication and lifecycle states (`not_provisioned`, `registering`, `registered_active`, `expired`, `revoked`, `suspended`, `cert_invalid`, `compromised_reuse`, `rebind`) map to explicit, user-friendly UI responses and routing actions.
4. **Preservation of Offline Work & Proof**: Remote logout, session revocation, token expiry, and account suspension invalidate local session credentials (`drts.driver.session`) without clearing unsynchronized offline trip completions (`drts.driver.pendingTaskCompletion`), location queues, or SOS outbox items. Upon re-authentication/rebind, offline completion proof is automatically replayed to the backend.

---

## 2. Driver Auth & Identity State Machine

```
               ┌─────────────────────────────┐
               │       not_provisioned       │
               └──────────────┬──────────────┘
                              │ Enter Registration Code
                              ▼
                       ┌──────────────┐
                       │  registering │
                       └──────┬───────┘
                              │ Device Registered & Bearer Session Issued
                              ▼
                    ┌───────────────────┐
                    │ registered_active │
                    └─────────┬─────────┘
                              │
          ┌───────────────────┼───────────────────┬───────────────────┐
          │ Refresh Failed    │ Remote Revoke /   │ Token Reuse       │ Account Suspended /
          │ / Expired         │ User Logout       │ Compromise        │ Cert Invalid
          ▼                   ▼                   ▼                   ▼
    ┌───────────┐       ┌───────────┐       ┌────────────────┐  ┌───────────┐
    │  expired  │       │  revoked  │       │compromised_reuse│  │ suspended │
    └─────┬─────┘       └─────┬─────┘       └───────┬────────┘  └─────┬─────┘
          │                   │                     │                 │
          └───────────────────┴──────────┬──────────┴─────────────────┘
                                         │ Local Credentials Wiped
                                         │ Offline Proof Preserved
                                         ▼
                                  ┌───────────┐
                                  │  rebind   │ (Returns to not_provisioned)
                                  └───────────┘
```

### State Definitions & User-Facing UX

| State | Trigger | Local Action | User Interface / UX Action |
|---|---|---|---|
| `not_provisioned` | Fresh install or cleared session | No session key | Displays onboarding screen with registration code input. |
| `registering` | User submits registration code | Calls `registerDriverDevice` | Displays loading state during device registration and initial token exchange. |
| `registered_active` | Registration / refresh success | Session stored in `SecureStore` | Navigates driver to main workspace / cockpit screens. |
| `expired` | Token expired or refresh invalid | Clears `drts.driver.session` | Prompt: `"此裝置的司機綁定已失效或被撤銷，請重新輸入註冊碼綁定。"` Redirects to onboarding. |
| `revoked` | Remote revoke API or local logout | Clears `drts.driver.session` | Prompt: `"此裝置的司機綁定已被撤銷，請重新輸入註冊碼綁定。"` Redirects to onboarding. |
| `suspended` | Account suspended (`DRIVER_AUTH_SUSPENDED`) | Clears `drts.driver.session` | Banner: `"此司機帳號已被停權，暫時無法登入系統。"` Blocks driver workspace access. |
| `cert_invalid` | Invalid/expired certs (`DRIVER_CERT_INVALID`) | Clears `drts.driver.session` | Banner: `"司機證件狀態無效，請聯絡平台管理員重新啟用。"` Blocks driver workspace access. |
| `compromised_reuse` | Refresh reuse detected (`DRIVER_DEVICE_REUSE_DETECTED`) | Clears `drts.driver.session` | Banner: `"偵測到裝置憑證異常重複使用，系統已自動撤銷憑證並安全登出，請重新註冊。"` |
| `rebind` | Re-registration on device | Wipes old session, issues new binding | Re-establishes active session and triggers replay of any preserved offline proof. |

---

## 3. Storage Architecture & Log Sanitization

### Secure Storage Keys (`expo-secure-store`)

- **`drts.driver.deviceId`**: Unique device instance identifier (persistent across rebinds).
- **`drts.driver.session`**: Secure JSON string containing `accessToken`, `refreshToken`, `bindingId`, `driverId`, and timestamps.
- **`drts.driver.pendingTaskCompletion`**: Offline unsynchronized trip completion command and proof (MUST NOT be wiped on logout).

### Token Sanitization (`sanitizeLogMessage`)
All API error messages and payload text undergo pattern-matching redaction before being stored in state or logged to stdout/stderr:
- `Bearer [JWT]` -> `Bearer [REDACTED]`
- `eyJ...` (JWT strings) -> `[REDACTED_JWT]`
- `accessToken` / `refreshToken` JSON fields -> `[REDACTED]`

---

## 4. Remote Logout & Compromised-Session Protocol

### 1. User-Initiated Logout (Settings Screen)
When a driver selects **"登出"** in the mobile Settings screen (`app/settings.tsx`):
1. The app invokes `revokeDriverDeviceBinding()` from `@/lib/api-client`.
2. `revokeDriverDeviceBinding()` sends `POST /auth/driver/device/revoke` with the binding ID and device ID.
3. Upon API completion (or network failure fallback), `clearStoredSession()` is executed:
   - Deletes `drts.driver.session` from `expo-secure-store`.
   - Clears in-memory bearer client and session state.
   - Clears `driverIdentityIssue`.
4. The router redirects the driver back to `/onboarding`.

### 2. Remote Revocation by Platform Admin / Security Control Plane
When a control plane administrator or SRE revokes a driver device binding via the backend API:
1. The backend marks the binding as `revoked` and invalidates the refresh family.
2. Next time the mobile app makes an API request or background heartbeat check, the server returns HTTP 401/403 with code `DRIVER_DEVICE_SESSION_INVALID` or `DRIVER_DEVICE_REFRESH_INVALID`.
3. `recoverDriverSessionFromApiError(error)` detects the auth failure.
4. Local session credentials (`drts.driver.session`) are deleted immediately.
5. The UI displays the deterministic invalidation banner and returns to onboarding.

### 3. Compromised-Session / Refresh Token Reuse Detection
If a refresh token is stolen or replayed:
1. The backend refresh family engine detects token reuse and revokes the entire token family (`DRIVER_DEVICE_REUSE_DETECTED`).
2. The client receives the reuse detection code during token refresh.
3. The app invalidates local credentials immediately and alerts the driver with the security notice:
   `"偵測到裝置憑證異常重複使用，系統已自動撤銷憑證並安全登出，請重新註冊。"`

---

## 5. Offline Proof Preservation & Recovery Protocol

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OFFLINE TRIP COMPLETION                         │
│  Driver completes trip offline -> Proof stored in                      │
│  drts.driver.pendingTaskCompletion (SecureStore)                      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      SESSION REVOCATION / LOGOUT                       │
│  Remote revoke or session expiry clears drts.driver.session            │
│  (drts.driver.pendingTaskCompletion is PRESERVED)                      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DEVICE REBIND / RE-AUTH                         │
│  Driver enters new registration code -> New session issued            │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTOMATIC PROOF REPLAY                          │
│  usePendingCompletionReplay detects pending completion & replays task │
│  completion to server via replayPendingDriverTaskCompletion()          │
└────────────────────────────────────────────────────────────────────────┘
```

### Technical Guarantee
In `apps/driver-app/lib/api-client.ts`, `clearStoredSession()` is scoped strictly to token deletion:
```typescript
async function clearStoredSession() {
  provisionedSession = null;
  await SecureStore.deleteItemAsync(DRIVER_SESSION_KEY);
  applySession(null);
}
```
`DRIVER_PENDING_TASK_COMPLETION_KEY` remains intact in `expo-secure-store`. When the driver re-registers or rebinds, `replayPendingDriverTaskCompletion()` is called by `usePendingCompletionReplay` to submit the preserved completion proof using idempotent replay headers (`X-Request-Id` and `Idempotency-Key`).

---

## 6. Operator & Administrative Procedures

### Procedure A: Revoking a Lost or Stolen Driver Device
1. Locate the driver's active binding ID via platform admin console or API:
   `GET /api/platform-admin/drivers/{driverId}/devices`
2. Trigger binding revocation:
   `POST /api/auth/driver/device/revoke` with `{ "bindingId": "<bindingId>", "deviceId": "<deviceId>" }`
3. Verify evidence: ensure the binding status transitions to `revoked`.

### Procedure B: Re-issuing Registration Code for Device Rebind
1. Issue a new single-use registration code for the driver.
2. Instruct the driver to open the app, which is now at the onboarding screen.
3. Have the driver input the new registration code.
4. Upon successful registration, verify that any unsynchronized offline trip completions automatically replay and update task status to `completed`.

---

## 7. Verification Evidence

- **Unit Test Suite**: `apps/driver-app/tests/unit/driver-secure-storage-logout.test.ts`
  - Verifies token redacting in error messages (`sanitizeLogMessage`).
  - Verifies auth failure handling for `DRIVER_AUTH_SUSPENDED`, `DRIVER_AUTH_REVOKED`, `DRIVER_CERT_INVALID`, and `DRIVER_DEVICE_REUSE_DETECTED`.
  - Verifies `drts.driver.pendingTaskCompletion` proof retention across `recoverDriverSessionFromApiError`.
  - Verifies `revokeDriverDeviceBinding` clearing credentials locally and remotely.
- **E2E Test Suite**: `tests/e2e/E2E-018-driver-device-lifecycle.sh`
  - Verifies device registration, profile fetch, refresh rotation, device revoke, and post-revoke token rejection.
