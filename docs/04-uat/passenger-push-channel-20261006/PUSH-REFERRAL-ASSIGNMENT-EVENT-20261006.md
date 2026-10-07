# PUSH-REFERRAL-ASSIGNMENT-EVENT-20261006

Owner: Codex2 · Reviewer: Claude

## 依據與定位

- 依本 task spec、common.md、AI_COLLABORATION_GUIDE.md §0.7 執行。基底 `ca7cd7022c36634e6e5df3262bf54677378f927b`，已含 ROUTE-WRITE 與 TRIP-CANCELLED。
- `OwnedMobilityService.createDispatchAssignment` / `cancelOwnedOrder` 共用 `OwnedMobilityRepository.loadOrderCancellationForUpdate`，在 assignment → task → job → order 鎖序下取得正式派車總數；`DispatchAssignmentRecord` 沒有 version 欄位。
- `buildPassengerAssignmentAuthority` 排除 business_dispatch，`cancelOwnedOrder` 的通知 gate 也只接受 multi_taxi_direct。referral 路由存在但沒有這兩類 outbox。
- `MultiTaxiRepository.findPartnerNotificationRelevance` 只讀 disclosure MAX，referral 無 snapshot 時為 0。
- 額外定位：正式 `updateDriverTaskEta` 寫入 `assignmentVersion: null`。只修 relevance 仍無法取代這類 ETA；需在允許的 owned-mobility.repository 寫入範圍內，從該 task 所屬 assignment 的通知取得已持久化代次，不能用測試自行塞入 version 冒充正式 ETA。
- 不要求或偽造 P-5 snapshot，不改 multi_taxi_direct 原 disclosure／取消流程。資料庫與 browser 驗證依任務約定交 hosted PG-QA；本機僅 repository checks。

## 實作

1. `loadOrderCancellationForUpdate` 在既有 order lock 後、同一 tx 讀可信路由，逐欄比對 order、tenant、partner、entry、passenger。business_dispatch 必須有匹配路由才回傳 `referralPassengerSubjectRef`；不用 request body、電話或單獨 lifecycle 標記判斷。
2. `createDispatchAssignment` 以該交易讀出的持久化 assignment count + 1 作新派車代次，首次產生 `assignment_disclosure_ready`，之後 `assignment_replaced`。outbox ID 為 `referral-assignment:<assignmentId>`，payload 為空（repository 追加 eventSequence）。同 tx persist assignment、outbox、資源占用；outbox 失敗則 rollback，不 publish。
3. `cancelOwnedOrder` 只擴充通知 gate／recipient，保留原取消狀態、原因分類與交易邏輯。referral 以 `referral-cancelled:<orderId>` 去重；只存 `passenger_cancelled`，不複製取消自由文字。未派車的正式代次是 0。
4. `persistChangesWithExecutor` 對 version-null ETA 用 `payload.taskId` 找到實際 assignment 的已持久化 referral 通知版本。延遲寫入舊 task 的 ETA 仍保留舊代次，不以最新代次覆蓋它。沿用既有 insert-on-conflict 後才 allocate sequence 的流程，重試不消耗序號。
5. `findPartnerNotificationRelevance` 保留 disclosure MAX 優先；只在 business_dispatch 無 disclosure 時 fallback 到所有持久化 assignment count（含取消／取代的歷史列），multi_taxi_direct fallback 仍為 0。

沒有修改 schema、transport、navigation 或第一方管道。沒有新增 disclosure snapshot。service 的取消通知小範圍修改依本 task 2026-10-06 補充的取消驗收要求，未擴充取消業務規則。

## Findings／驗收證據

實作 commit：`a9d5760caa6965814e507aff3d28fbc60d4e43a8`；後續 closeout 僅完善測試 fixture、導航 probe 與此文件。表內結果對應這組產品變更；handoff 的完整 candidate SHA 另由 CLI 鎖定。

| Finding／驗收項                                                     | 原始碼依據與修改位置                                                                                                             | 舊版重現 → 修正版結果                                                                                                                                                             | 命令、退出碼、執行版本與證據                                                                                                               | 未驗項與限制                                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| push-referral-assignment_events_produced_for_routed_referral_orders | service `createDispatchAssignment`；repository `loadOrderCancellationForUpdate` / `persistChangesWithExecutor`                   | 基底 outbox 空、注入 outbox 故障仍完成派車 → 產生代次 1/2、序號 1/2，重放不增序號，故障 rollback 不 publish                                                                       | 下列 scoped 命令；舊版 baseline-extended.log exit 1，新版 scoped-final.log exit 0；SQL I/O mock 呼叫正式 service/repository                | 真實 SQL、併發派車、commit 原子性由 hosted PG-QA 補                                                |
| push-referral-cancel_event_produced_for_routed_referral_orders      | service `cancelOwnedOrder`；原 transport obsolete exception                                                                      | 基底取消前／後派車都無取消 outbox → 代次 0/1、分類碼與同交易寫入通過，重複取消被拒；舊 assignment/ETA/arrival obsolete，取消事件 delivered（HTTP mock）                           | 同上；正式取消 repository 及 transport path，scoped-final.log exit 0                                                                       | 真實 PG 取消／資源釋放 rollback、真實端點未驗                                                      |
| push-referral-assignment_supersede_and_regression                   | multi-taxi repository relevance；owned repository ETA generation                                                                 | 基底正式 ETA 為 null → 正式 updateDriverTaskEta 產生 version 1，改派後被 transport 判為 superseded，延遲寫入仍為 1；企業／人員代訂無 route 不通知；multi_taxi_direct 原測試不放寬 | baseline-extended.log 的 ETA 行為失敗；新版 scoped-final.log、root-regression.log（381 passed）、api-regression.log（193 passed）皆 exit 0 | relevance SQL 只有 query contract／逐欄核對，不能當 PG 執行證據；既存 null-version 歷史 ETA 不回填 |
| 通知導航回行程／已取消頁                                            | navigation repository `resolveRoute`、controller `resolvePartnerNotificationNavigation`；BFF GET、`TripScreen` / `OutcomeScreen` | business_dispatch 有正確 route/identity 時可取得 trip／cancelled handoff，原路徑無 profile 排除                                                                                   | 新 referral-navigation 2 tests 及原 NAV resolver／production-path tests 都通過；包含 root-regression.log                                   | 無 browser／hosted 點擊 smoke；結論為原碼與正式函式單元路徑支持，非真機點擊驗收                    |

### SQL／正式 schema 比對

- V0011 `ops.phase1_dispatch_assignments` 有 order_id、assignment_id、created_at、record，**沒有 assignment_version**；採既有 cancellation loader 的 count 定義，沒有臆造欄位。V0056 的 `ops.phase1_owned_orders.runtime_profile_code` 支持 profile gate。
- V0104 route 有 order_id、tenant_id、partner_id、entry_slug、drts_passenger_id、passenger_subject_ref。路由 PK 確保至多一列；order lock 與既有不可變 route 保證交易內讀到同一歸屬。
- V0011 driver task 有 task_id、assignment_id、order_id；ETA JOIN 使用這些實體欄位與 V0056 outbox 的 outbox_id／assignment_version；outbox ID varchar(255) 支援有前綴的穩定識別。
- V0056 outbox PK 與 V0104 sequence allocator 不變；同 tx 先 INSERT RETURNING，衝突不 allocate，成功才更新 payload.eventSequence。
- reviewer 應逐欄核對上述 SQL。PG-QA 應用正式 migrations 與 production repository 補首次／改派／取消、序號並行重試、rollback、ETA task 對應、MAX 優先與 business-only count fallback；本 mock DB 不模擬約束或真正 rollback。

### 導航結論與邊界

ROUTE-WRITE 的 rideRef 是 referral orderId，passengerId 對應 drtsPassengerId。`PartnerNotificationNavigationRepository.resolveRoute` 由 entrySlug/rideRef/partnerUserRef 查 route 並核對 passenger/tenant，沒有 multi_taxi_direct 限制。controller 再核對 entry 的 tenant/partner、active identity link，簽發 fresh handoff：assigned → trip、cancelled → cancelled。

`apps/referral-embed-web/app/api/referral/notification-navigation/route.ts` 消耗 handoff 後導至 `/embed/<entrySlug>?screen=<screen>&orderId=<orderId>`；page 讀 active/history，`TripScreen` 核對指定 orderId，`OutcomeScreen` 以 cancelled status/history 顯示指定行程。原 NAV production-path suite 驗證真正 handoff/session/BFF（只 mock HTTP、cookie store 與時鐘），含跨身分／entry、撤銷、過期、重放拒絕。未發現需擴 scope 修導航的斷點。須由 partner 使用核身住戶與 entry 憑證，並有有效 consent；本 task 未部署或跑 browser。

## 檢查紀錄

Node `v22.23.2`、pnpm `10.33.0`。證據目錄為本 worker 絕對路徑下的 `.local/push-referral-assignment-event-20261006/`；沒有啟動 API、DB、preview、browser/receiver server 或 Docker。

```bash
# 舊版：git archive ca7cd7022c36634e6e5df3262bf54677378f927b 到 .local/baseline-tree
# 覆蓋同一份新測試、連結此 worker 的依賴；未 reset 活躍工作樹。
pnpm --dir .local/push-referral-assignment-event-20261006/baseline-tree exec vitest run tests/unit/push-referral-assignment-event-20261006/referral-events.test.ts
# exit 1: 8 failed / 8 passed（6 個行為缺陷 + 2 個 SQL contract probe；不是 PG 證據）
pnpm exec vitest run tests/unit/push-referral-assignment-event-20261006 --maxWorkers=2
# exit 0: 18 passed，scoped-final.log
pnpm exec vitest run tests/unit/push-referral-assignment-event-20261006 tests/unit/push-referral-route-write-20261006 tests/unit/owned-mobility.test.ts tests/unit/system-remediation/sr-partner-notify- tests/unit/system-remediation/sr-qa-booking-001/c022-referral-lifecycle-continuity.test.ts --exclude '**/*.postgres.test.ts' --maxWorkers=2
# exit 0: 32 files / 381 passed，root-regression.log
pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility.service.test.ts tests/unit/owned-mobility.repository.test.ts tests/unit/multi-taxi --maxWorkers=2
# exit 0: 8 files / 193 passed，api-regression.log
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm --filter @drts/api typecheck
pnpm typecheck:root
# 每項 exit 0，各自 *-build.log / *-typecheck.log
pnpm exec eslint apps/api/src/modules/owned-mobility/owned-mobility.service.ts apps/api/src/modules/owned-mobility/owned-mobility.repository.ts apps/api/src/modules/multi-taxi/multi-taxi.repository.ts tests/unit/push-referral-assignment-event-20261006 --max-warnings=0
# exit 0，lint.log
```

前期環境與 fixture 失敗分開記錄：首次 node_modules 是失效跨 worktree symlink，移除本 worker link 後以 offline frozen install 修復（未改 lockfile/canonical root）；baseline archive 首次缺 packages/contracts 的套件 link，補全後才得到上述有效 8 個失敗。根目錄 typecheck 曾指出新 fixture 的 orderSource/job status 不符合契約，已改為 portal/matching 並補 mode/latestEtaMinutes，重跑通過。這些不是產品缺陷重現或 reviewer 退修。

## 候選與交接

分支 `codex2/push-referral-assignment-event-20261006`。owner 普通 push 後以 `git rev-parse HEAD` 的完整 SHA 與 PR head 比對，透過 active-release CLI handoff 給 Claude；PR URL、最終 SHA 與 CI run 結果附在同一 handoff 的 machine truth／PR 描述（文件不能自引包含自己的 commit SHA）。

此文件提交時同 SHA hosted CI／獨立 review／merge／具名 acceptance 尚待 lifecycle 記錄；本地 pass 不取代它們。必須讀完已啟動 CI，PG 詳項由 PUSH-CHANNEL-PG-QA-20261006 補。尚未部署，亦未向真實夥伴／裝置發送通知。
