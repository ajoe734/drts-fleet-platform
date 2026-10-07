# PUSH-REFERRAL-ASSIGNMENT-EVENT-20261006

Owner: Codex2 · Reviewer: Claude

## 依據與定位

- 依本 task spec、common.md、AI_COLLABORATION_GUIDE.md §0.7 執行。基底 `ca7cd7022c36634e6e5df3262bf54677378f927b`，已含 ROUTE-WRITE 與 TRIP-CANCELLED。
- `OwnedMobilityService.createDispatchAssignment` / `cancelOwnedOrder` 共用 `OwnedMobilityRepository.loadOrderCancellationForUpdate`，在 assignment → task → job → order 鎖序下取得正式派車總數；`DispatchAssignmentRecord` 沒有 version 欄位。
- `buildPassengerAssignmentAuthority` 排除 business_dispatch，`cancelOwnedOrder` 的通知 gate 也只接受 multi_taxi_direct。referral 路由存在但沒有這兩類 outbox。
- `MultiTaxiRepository.findPartnerNotificationRelevance` 只讀 disclosure MAX，referral 無 snapshot 時為 0。
- 額外定位：正式 `updateDriverTaskEta` 寫入 `assignmentVersion: null`。只修 relevance 仍無法取代這類 ETA；需在允許的 owned-mobility.repository 寫入範圍內，從該 task 所屬 assignment 的通知取得已持久化代次，不能用測試自行塞入 version 冒充正式 ETA。
- 不要求或偽造 P-5 snapshot，不改 multi_taxi_direct 原 disclosure／取消流程。資料庫與 browser 驗證依任務約定交 hosted PG-QA；本機僅 repository checks。

## Findings／驗收證據（進行中）

| Finding／驗收項                                                     | 原始碼依據與修改位置                                                                                     | 舊版重現 → 修正版結果                                                         | 命令、退出碼、版本與證據                                                                                                                                                                           | 未驗項與限制                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| push-referral-assignment_events_produced_for_routed_referral_orders | service createDispatchAssignment；repository loadOrderCancellationForUpdate / persistChangesWithExecutor | 基底正式 service+repository 的新回歸：派車後 outbox 為空，預期 2 筆；修正待驗 | `pnpm exec vitest run tests/unit/push-referral-assignment-event-20261006/referral-events.test.ts`，exit 1，4 failed / 4 passed；本機 `.local/push-referral-assignment-event-20261006/baseline.log` | SQL I/O 是 mock，不宣稱 PG 原子性或併發驗證 |
| push-referral-cancel_event_produced_for_routed_referral_orders      | service cancelOwnedOrder                                                                                 | 基底取消前／後派車兩案例都無取消 outbox；修正待驗                             | 同上，取消通知為 undefined                                                                                                                                                                         | hosted PG pending                           |
| push-referral-assignment_supersede_and_regression                   | multi-taxi.repository findPartnerNotificationRelevance；owned repository ETA version                     | ETA null 與 relevance 0 已定位；修正待驗                                      | 原碼核對；目前 3 個 transport 取代案例用明確 version 作前置測試，尚不能證明正式 ETA                                                                                                                | 導航、完整回歸及同 SHA CI pending           |

首次測試因既有 node_modules 連到已失效的其他 worktree 而未載入，**不算重現**。僅移除本 worker 的套件 symlink，以 `pnpm install --offline --frozen-lockfile --ignore-scripts` 建立隔離依賴，exit 0；之後 baseline.log 才是有效舊版重現。未改 lockfile 或 canonical root。

## 候選與交接

目前為測試／定位 anchor，尚未提交 candidate。最終 SHA、PR、CI 與 reviewer 結果以 machine truth 同一候選記錄為準。
