# Round 1 — Workspace Cockpit (`工作台` / `app/index.tsx`)

## Plan

Verify the driver landing cockpit's **display** and **functional** behaviour:

- Display: header (title, identity badge, freshness, refresh/bell/alert icons),
  Next-Best-Action card, Readiness summary tiles (身份/班次/平台/Urgent), bottom
  KPI strip (待處理 / 平台在線 / 今日淨收).
- Functional: cockpit fetches live state from the API; the next-best-action
  engine surfaces an actionable task; readiness + counts reflect API truth;
  identity is bound to the dev-override driver.

## Execution

- Driver `drv-demo-001`; API seeded via `E2E-006` (task-views=6: owned + forwarded).
- Launched app (dev-client → Metro `:8081`, API `10.0.2.2:3001`), opened `drts-driver://`.
- Screenshot: `screens/r1-cockpit.png` (clean, dev-menu dismissed).
- Cross-checked against `GET /api/driver/task-views` (driver realm).

## Results — PASS

| Check                          | Expected                 | Observed                                                                                   | Verdict |
| ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| Page renders, no error overlay | clean cockpit            | clean; **LogBox count = 0** after Pill fix                                                 | PASS    |
| Identity badge                 | dev driver               | `drv-demo-001` shown                                                                       | PASS    |
| Next-Best-Action               | surfaces actionable task | "優先回應 99 E2E Destination Ave" + route + `availableAction · accept` + 接受任務/婉拒任務 | PASS    |
| Readiness — 身份               | ready                    | 已啟用 / ready                                                                             | PASS    |
| Readiness — 班次               | off-shift                | 未上班 / idle                                                                              | PASS    |
| Readiness — 平台               | reflects bindings        | 0/1 在線 / idle                                                                            | PASS    |
| Readiness — Urgent count       | == task-views count      | 6 件 (active) == task-views 6                                                              | PASS    |
| Freshness indicator            | live timestamp           | "Fresh · live · 6/15 …"                                                                    | PASS    |

## Defects / Findings

1. **[Fixed this PR] `<Text>` LogBox on every canvas screen** — `renderInlineText`
   in `components/canvas-primitives/index.tsx` only wrapped a scalar string; when
   children compile to an **array** (`<Pill>{label} {value}</Pill>`) the raw
   strings were returned unwrapped → "Text strings must be rendered within a
   <Text> component." Fixed by wrapping string/number items inside arrays. Verified:
   logcat `Text strings must be rendered` count dropped from many → **0**.
2. **[Open, low] Cockpit `今日淨收` shows `0 NT$`** while the Earnings screen shows
   本日 net `2,050 NT$` for the same driver/day. Likely different semantics
   (cockpit = completed-today vs earnings = seeded period summary); flagged to
   confirm intended source. Not a crash; display only.

## Test-case impact

Cockpit state is data-derived from `/api/driver/task-views` + earnings/presence,
already exercised by `E2E-006`. No new automated case required for R1; finding (2)
tracked for a future earnings-consistency check (see Round 5).
