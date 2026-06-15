# Round 8 — Identity / Onboarding / Device Provisioning (`app/onboarding.tsx`)

## Plan

- Display: with **no** dev override (no `EXPO_PUBLIC_DRIVER_ID`), the app must show
  the device-activation/onboarding registration screen — never a silent demo
  workspace.
- Functional: device register rejects an invalid code (no silent fallback);
  identity routing/bootstrap logic is unit-covered.

## Execution

- Restarted Metro **without** `EXPO_PUBLIC_DRIVER_ID`, reloaded the app →
  `screens/r8-onboarding.png`.
- `POST /api/auth/driver/device/register {registrationCode:"INVALID-R8-CODE", …}`.
- `vitest driver-identity-routing driver-identity-bootstrap`.
- Restored Metro **with** `EXPO_PUBLIC_DRIVER_ID=drv-demo-001` (app returns to the
  authenticated workspace).

## Results — PASS

| Check                    | Expected                               | Observed                                              | Verdict |
| ------------------------ | -------------------------------------- | ----------------------------------------------------- | ------- |
| No silent fallback       | onboarding shown, not demo workspace   | 裝置啟用 screen rendered                              | PASS    |
| 3-step provisioning flow | 裝置註冊 → 駕駛身份驗證 → 平台帳號連線 | all 3 steps rendered                                  | PASS    |
| Registration inputs      | 註冊代碼 + 裝置名稱 + 註冊此裝置       | rendered (code/device-name inputs + button)           | PASS    |
| Safety guidance          | use fleet code, not personal account   | "未啟用裝置無法接收派單…避免使用個人帳號註冊"         | PASS    |
| Invalid code rejected    | error, no fallback                     | **403 DRIVER_REGISTRATION_INVALID** (retryable:false) | PASS    |
| Routing/bootstrap logic  | unit-covered                           | 7/7 unit tests pass (routing 2 + bootstrap 5)         | PASS    |
| Dev override restore     | authenticated workspace returns        | restored with EXPO_PUBLIC_DRIVER_ID                   | PASS    |

## Defects / Findings

None. The "explicitly provisioned identity, no silent demo fallback" contract
holds: unprovisioned → onboarding; invalid code → 403; dev override → workspace.

## Test-case impact

Covered by driver-app unit tests (driver-identity-routing / driver-identity-bootstrap)
plus the negative register API check here. Full register→bind→refresh→revoke
device handoff (needs a provisionable registration code in seed) remains a gap —
recommended future seed + E2E (noted for finalize).
