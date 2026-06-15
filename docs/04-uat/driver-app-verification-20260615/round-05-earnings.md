# Round 5 — Earnings (`收入` / `app/earnings.tsx`)

## Plan

- Display: summary card (淨收入 / 毛收 / 平台抽成 / 外部平台), per-platform
  breakdown (平台分項), monthly statements (月結報表) section.
- Functional: figures equal the API; per-platform aggregation sums to the
  summary; **statements graceful degradation** — the back-office `/driver-statements`
  403 must NOT blank the screen (verifies the merged DRV-APP-BUILD-EARNINGS fix).

## Execution

API truth (driver realm):

- `GET /platform-earnings/summary` → net `205000` (2,050.00), gross `230000`,
  service fee `30000`.
- `GET /platform-earnings/by-platform` → 3 items: uber, grab, forwarder_sandbox.
- `GET /driver-statements` → **403** (driver realm denied, by design).

Screens: `screens/r5-earnings-top.png`, `screens/r5-earnings-breakdown.png`.

## Results — PASS

| Check                               | Expected                   | Observed                                                         | Verdict |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------------- | ------- |
| Summary net                         | 2,050                      | 淨收入·本日 2,050 NT$                                            | PASS    |
| Summary gross                       | 2,300                      | 毛收 2,300                                                       | PASS    |
| Platform fee                        | -300                       | 平台抽成 -300                                                    | PASS    |
| External total                      | 1,750                      | 外部平台 1,750                                                   | PASS    |
| Per-platform breakdown              | uber/grab/forwarder        | UBER 1,070 / Grab 680 / Forwarder Sandbox 300 (鏡像)             | PASS    |
| Aggregation consistency             | owned platforms sum        | uber 1,070 + grab 680 = 1,750 (外部平台)                         | PASS    |
| Forwarded = reference only          | not double-counted         | Forwarder Sandbox marked 鏡像/鏡像參考                           | PASS    |
| **Statements graceful degradation** | screen renders despite 403 | 月結報表 → "尚無月結報表" empty state, **no blank**, no RN error | PASS    |

## Defects / Findings

1. **[Resolved — verifies merged fix]** Pre-fix, the `/driver-statements` 403 blanked
   the whole earnings dashboard. Post-fix (`DRV-APP-BUILD-EARNINGS-20260615`,
   `listDriverStatements().catch(()=>[])`), the summary + per-platform render and the
   月結報表 section degrades to an empty state. Confirmed on-device (no "收益資料同步失敗").
2. **[Open, low] Cockpit `今日淨收` 0 vs Earnings `本日` 2,050** (from Round 1):
   the cockpit KPI and earnings summary use different sources for "today". Display
   inconsistency only; recommend aligning the cockpit KPI to the earnings summary
   source.

## Test-case impact

`E2E-006` LEG 4 asserts summary + by-platform + forwarded platform presence. The
graceful-degradation path (statements 403 → screen still renders) is a UI
behaviour not capturable by the shell E2E; covered by this on-device round.
