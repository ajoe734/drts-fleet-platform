# Round 2 — Jobs Inbox (`任務` / `app/jobs.tsx`)

## Plan

- Display: header (同步 + 佇列 toggle), KPI counts (總計 / 需動作 / 外部平台),
  5 filter chips (全部 / 待處理 / 進行中 / 平台結案 / 需同步), task cards with
  domain badge (自營派單 vs forwarded/外部平台), status pill, route, SLA, actions.
- Functional: KPI counts equal API truth; filter chips re-scope the list; owned
  vs forwarded are visually distinct; no error overlay.

## Execution

- Reset API baseline + reseed; `GET /api/driver/task-views` truth:
  `total 8, domains {owned:4, forwarded:4}`.
- `drts-driver://jobs`; captured `screens/r2-jobs-all.png` (全部) and
  `screens/r2-jobs-pending.png` (待處理 chip selected).

## Results — PASS

| Check               | Expected                                                                | Observed                                      | Verdict |
| ------------------- | ----------------------------------------------------------------------- | --------------------------------------------- | ------- |
| 總計                | 8                                                                       | 8                                             | PASS    |
| 需動作              | actionable count                                                        | 8                                             | PASS    |
| 外部平台            | == forwarded (4)                                                        | 4                                             | PASS    |
| Filter chips render | 5 chips                                                                 | 全部/待處理/進行中/平台結案/需同步            | PASS    |
| 待處理 filter       | re-scopes list, chip active                                             | chip highlighted; list shows 待司機處理 cards | PASS    |
| Owned card          | 自營派單 + DRTS 任務主控 + 接受/婉拒 + 開啟目前行程 + SLA "2小時內處理" | rendered                                      | PASS    |
| Forwarded card      | distinct (外部平台)                                                     | present (4 external)                          | PASS    |
| Bottom tab badge    | == 需動作                                                               | 任務 badge = 8                                | PASS    |
| Error overlay       | none                                                                    | none (Pill fix holding, LogBox 0)             | PASS    |

## Defects / Findings

None for R2. Counts are consistent with the API; filtering and domain
distinction work. (Task data persists in the DB across API restarts — the earlier
"empty after restart" was an API-down artifact, not an in-memory read model.)

## Test-case impact

Jobs inbox visibility (owned + forwarded in one list, external count) is asserted
by `E2E-006` LEG 1 (`/driver/task-views`). No new automated case required.
