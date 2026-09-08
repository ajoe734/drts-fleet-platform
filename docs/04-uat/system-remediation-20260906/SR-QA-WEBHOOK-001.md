# SR-QA-WEBHOOK-001 — 驗收進度（未完成）

本文件取代先前將 local fixture smoke、連線中斷及單實例去重描述為完整驗收的聲明。Owner Codex；Reviewer Codex2。未 handoff、未完成 review/CI/merge。

## 基準與追溯

- 2026-09-08 dispatch 起始 origin/dev：`3b60a3757238663572f16f010c94f446f2c71eaa`。
- 本次測試程式 anchor：`f08c8bc94e491cf3c90c5c6f50331ab2d01b7574`；後續修改僅 runner import 和證據文件。此 SHA 是測試時 HEAD，尚非 lifecycle candidate。
- 最終 progress commit 可由 `git log -1 --format=%H -- docs/04-uat/system-remediation-20260906/SR-QA-WEBHOOK-001.md` 取得；未鎖定 candidate，不能把本次證據當成同 candidate CI。
- 已依指示 fetch/rebase origin/dev；merge 已發布的 task 分支歷史以保留普通 non-force push 能力，沒有回退產品碼。
- 權威來源：`docs/03-runbooks/system-remediation-execution-tasks-20260906.md`、task spec、`source/capabilities.json` C111–C115；API 語義見 `phase1_service_contracts_v1.md` tenant governance / delivery contracts。9/6 audit 是歷史觀察。

## 實際涵蓋與不足

| 能力 | 現有本機案例                                                                                                | 仍未驗收                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| C111 | issue/list 遮罩、預設到期及上限拒絕、rotation overlap、auto revoke、manual revoke 後拒絕 rotate             | authenticated HTTP API 權限、實際 DB 寫入與回讀、API key 使用量                     |
| C112 | 真 HTTP bytes/HMAC、200、503/backoff 計算、socket drop、非重試失敗停用、secret rotation、單實例 outbox 去重 | 持久 DB 重啟去重、自動 retry worker 恢復、預設傳輸 deadline、完整 replay 接收端策略 |
| C113 | fixture ledger 結構與無效期別拒絕，僅 local smoke                                                           | ERP/SSO/bank sandbox、權限、mapping、重送與對帳差異                                 |
| C114 | MockGeoProvider 座標及空地址拒絕，僅 local smoke                                                            | 真 provider、路由/ETA、配額、斷線與過期位置                                         |
| C115 | sandbox callback 正常及失敗路徑，僅 local smoke                                                             | 部署排程、積壓、重啟補跑、告警回執                                                  |

新增 C112-timeout 使用保持 TCP 連線但不送 headers 的本機接收器，以真 fetch + 測試注入 `AbortSignal.timeout(100)` 觸發逾時；回讀該 webhook 的 delivery，確認 queued 和 nextAttemptAt。這不是假送達，但也不能證明產品預設 fetch 有 deadline。`WebhookDispatchService` 預設未傳 signal；deadline 的產品契約尚需確認，不在本 task 偷改業務碼。

原 23 案全部通過不代表 23 個外部能力成功，其中包含 fixture 和限制宣告。新增後為 24 案。E2E wrapper 現在從執行 stdout 擷取真正產生的 webhook/delivery ID，移除未被服務使用的虛構 tenant namespace 與角色證據；不再只比對固定的 passed 數字。HTTP 送達是在 nested suite 驗證，wrapper 沒有捏造 API transcript。

## 本次可重跑指令與結果

所有命令在指定 isolated worker cwd 執行。

| 命令                                                                                                                                                                                   | exit code | 實際結果                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `pnpm exec vitest run tests/unit/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.test.ts`（修改前）                                                                             | 0         | 23 passed，3.25s                                                                       |
| 同命令（加入真 timeout 後）                                                                                                                                                            | 0         | 24 passed，3.58s                                                                       |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001`                                                                                               | 0         | 5 passed；只有 1 個是本 task runner，其餘 4 個是 shared harness，不是額外 webhook 案例 |
| `DRTS_WEBHOOK_LIVE=1 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001`                                                                           | 1         | 1 failed / 4 passed；live 未實作時 fail closed，沒有 skip 後 pass                      |
| `pnpm exec eslint tests/unit/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.test.ts tests/e2e/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.spec.ts --max-warnings=0` | 0         | 無錯誤                                                                                 |

成功執行的 stdout、base/HEAD、資源 ID 見 `tests/e2e/system-remediation/sr-qa-webhook-001/evidence-sr-qa-webhook-001.json`。缺 live 證據的失敗 artifact 另存 `evidence-live-unavailable.json`。local bundle 的 passed 只表示 local regression 命令成功。

## 環境與下一步

`docker ps` 確認本機有 drts-postgres / redis / mailpit，因此不宣稱沒有 DB。此 worker 環境未設定 DATABASE_URL、DRTS_API_BASE_URL、DRTS_UAT_API_BASE_URL、GOOGLE_MAPS_API_KEY（僅查是否存在，未輸出秘密）。尚未建立本 task 的持久化隔離資料集與 authenticated API fixture；這是待做工作，不是已證明的產品缺陷。

下一輪應優先補 C111/C112 真 DB 回讀、兩次 service 初始化的重啟去重及 retry worker 恢復，再由 supervisor 協調 C113/C114 外部 sandbox 與 C115 部署證據。若實測發現產品缺陷，用 canonical command 建立有來源的修復子任務並由 supervisor 指定 scope/dependency；本次沒有修改產品或共用設定。UI 未修改。
