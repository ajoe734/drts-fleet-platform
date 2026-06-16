# Round 6 — Platform Presence (`平台` / `app/platform-presence.tsx`)

## Plan

- Display: 平台連線 screen — counts (個平台 / 可接單 / 需處理), Platform Health
  Center, KPI tiles (可接單 / 需重新授權 / 同步異常), filter chips, rebind methods,
  unbound empty-state.
- Functional: `GET /api/platform-presence`; `POST /api/platform-presence/online`
  flips a platform to online; verify the presence record reflects it.

## Execution

- `GET /api/platform-presence` (driver realm) → `presences: []` initially (no bound
  platforms for drv-demo-001).
- `drts-driver://platform-presence` → `screens/r6-platform-unbound.png`.
- `POST /api/platform-presence/online {platformCode:"uber"}` → **201**; record:
  `{platform_code:"uber", status:"online", eligibility:"eligible", last_online_at:…}`.

## Results — PASS

| Check                    | Expected                                              | Observed                                                                         | Verdict |
| ------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------- |
| Screen renders           | 平台連線 + health center                              | rendered                                                                         | PASS    |
| Unbound empty-state      | clear guidance                                        | "尚未完成平台綁定 … 前往設定"                                                    | PASS    |
| Rebind methods           | OAuth / app deep-link / manual code / dispatch-assist | all 4 shown (外部瀏覽器 OAuth / 平台 App 深連結 / 手動憑證輸入 / 派車台協助綁定) | PASS    |
| KPI tiles                | 可接單 / 需重新授權 / 同步異常                        | 0 / 0 / 0                                                                        | PASS    |
| Filter chips             | 全部 / 需處理 / 可接單 / 重新授權                     | rendered                                                                         | PASS    |
| go-online (API)          | 201, presence online                                  | uber → status=online, eligibility=eligible                                       | PASS    |
| Consistency with cockpit | 平台 0/1 在線                                         | matches (no bound platforms)                                                     | PASS    |

## Defects / Findings

1. **[Open, low] API/UI divergence — online without binding.**
   `POST /platform-presence/online` succeeds for an unbound platform
   (`account_id:null`) and the presence API then reports `uber:online`, but the
   binding-centric 平台 screen still shows "0 個平台 / 尚未完成平台綁定" (it surfaces
   only bound accounts). Either reject/await-binding on the API, or surface
   online-but-unbound platforms in the UI, for consistency.

## Test-case impact

Platform presence + by-platform earnings are exercised by `E2E-006`. The
online-without-binding divergence (finding 1) is a candidate for a small API
contract test (online requires/accompanies a binding) — tracked for finalize.
