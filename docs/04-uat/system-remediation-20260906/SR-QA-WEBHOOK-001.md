# SR-QA-WEBHOOK-001 — 驗收進度（未完成）

本文件取代先前將 local fixture smoke、連線中斷及單實例去重描述為完整驗收的聲明。Owner Codex；Reviewer Gemini（本次 dispatch）。未 handoff、未完成 review/CI/merge。

## 2026-09-08 16:32 UTC 跨租戶負向續驗（最新）

本節優先於以下歷史紀錄。base `5cff9b36082998a0295f2550039306dc1f84c3d2`；執行 SHA `936e5e136286d43b64359a3a28094fec920475a6`（已普通 push 的測試 anchor，非 lifecycle candidate）。rebase 再次在歷史提交 a119ec0bb 發生 task 檔 add/add 衝突，已 abort，使用 merge 納入 dev 並保留已發布歷史。

- C111 新增 service 層跨租戶 list 空結果、rotate/revoke 拒絕並核對 `API_KEY_NOT_FOUND`；SQL 比對拒絕前後原租戶兩筆完整 record 相同，再確認合法租戶撤銷仍能持久化。未用此結果替代 authenticated HTTP scope 驗收。
- 真實 key `api_key_2ebd8946-1c5c-4831-9fcf-d5eee11ff2e7`、輪替後 key `api_key_22a05a5e-ab4c-4b78-910f-ed5f54ca3996`；兩個租戶與 webhook/process recovery 資源 ID 見 `tests/e2e/system-remediation/sr-qa-webhook-001/evidence-postgres.json`。
- `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 0，5 passed / 1.4m；24 個本機 regression、3 個 PostgreSQL 案例（包含 SIGKILL writer 後新程序自動重試）及 4 個 shared harness 案例。
- `DRTS_WEBHOOK_LIVE=1 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 1，1 failed / 4 passed，3.1s。缺部署認證／外部證據時明確失敗，另存 live unavailable artifact。
- `pnpm exec eslint tests/unit/system-remediation/sr-qa-webhook-001/*.ts tests/e2e/system-remediation/sr-qa-webhook-001/*.ts --max-warnings=0` → exit 0；`git diff --check` → exit 0。

維持 in_progress，不 handoff。尚需 C111 authenticated API 最小權限／使用量、C112 預設 deadline／replay 接收策略；請 supervisor 協調 C113 ERP/SSO/bank sandbox、C114 真 provider、C115 部署排程與告警回執。此次未發現新的產品缺陷，未修改產品或 UI；以下表格與環境下一步是歷史紀錄，DB 與 OS process 恢復缺口已由後續章節補證據。

## 2026-09-08 15:39 UTC OS process 恢復續驗（最新）

本節優先於以下歷史紀錄；仍未 handoff，沒有 lifecycle candidate。

- 本輪 fetch 時 `origin/dev`：`40c231ba6718dbf7a7ee6662e446d44e48eabcb3`。一般 rebase 及指定舊 base 的 rebase 均重播重複歷史，造成 task 檔 add/add 衝突；均已 abort，改以 merge 整合 dev 並保留已發布歷史，普通 push 成功。沒有採用衝突中的歷史假驗收版本。
- 執行 SHA：`b7f046ea1cd1f7f562782c794fe769161355e70e`。其他 worker 的 fetch 會推進共用 `origin/dev` ref，因此 runner 改用 `git merge-base HEAD origin/dev` 記錄已納入的 base；本輪三份證據均使用 `40c231ba…`，不把遠端前進當成已測版本。
- 新增獨立 Vitest 子程序：writer 用真服務寫 PostgreSQL queued delivery，父程序觀察持久化完成後對該 process group 發送 `SIGKILL`，確認退出 signal；另一個 OS process 初始化真服務，等待原始約 30 秒 retry timer 自動送達。沒有手動 retry、改 DB deadline 或 fake timer。
- recovery 程序回讀同一 tenant/webhook/delivery 關聯，重送同一 outbox key 回傳同一 delivery，DB 同 ID 只有一筆；受控 receiver 共收到 3 次 HTTP（test 200、event 503、retry 200），核對實際 bytes/HMAC 及 payload delivery ID。
- 真實資源：webhook `wh_86d657ff-4cf3-4e40-bbbd-d74521f3dcc5`、delivery `wd_6efe5509-dfbb-4ee6-ac27-37d0cf7bdda2`；writer PID `2564273`、recovery PID `2564529`。完整 tenant/outbox ID 在 `tests/e2e/system-remediation/sr-qa-webhook-001/evidence-postgres.json`。
- `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 0，5 passed / 1.4m；包含原 24 個本機 regression、3 個 PostgreSQL 案例（含兩個子程序）及 4 個 shared harness 案例。這不是部署環境驗收。
- `DRTS_WEBHOOK_LIVE=1 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 1，1 failed / 4 passed，1.3s；缺外部證據即失敗，另存 `evidence-live-unavailable.json`。
- `pnpm exec eslint tests/unit/system-remediation/sr-qa-webhook-001/*.ts tests/e2e/system-remediation/sr-qa-webhook-001/*.ts --max-warnings=0` → exit 0；`git diff --check` → exit 0。最初 lint 發現 finally 直接 throw，已抽成 cleanup helper 並在上述執行 SHA 重驗。

本輪只修改 task 測試與證據；沒有改產品、共用設定或 UI。仍待 C111 authenticated API 最小權限與使用量、C112 預設傳輸 deadline／完整 replay 接收策略；C113 sandbox、C114 真 provider、C115 部署排程及告警回執需 supervisor 協調。OS process 中斷恢復已補證據，主機 reboot／部署重啟沒有驗證；不將本機程序測試等同主機驗收。

## 2026-09-08 15:26 UTC 整合入口續驗（歷史）

以下更新優先於下方歷史紀錄中的「尚未建立 DB 資料集」及 C111/C112 DB 待驗項目。

- fetch 後 base `origin/dev`：`c4c4a35f88907df6bf68e781059dde397c06ba03`，已是本分支祖先，無需再次 rebase。
- 執行 HEAD：`aa6f9295a32da6c8c1fea8d65f5d2c80c7bcfaee`；尚無 lifecycle candidate。本輪後續只分開 live 失敗 artifact 路徑及更新證據，沒有修改產品碼。
- `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 0，5 passed，50.4s；本 task wrapper 48.6s，包含 24 個本機 regression 與 2 個 PostgreSQL 案例，其餘 4 個為 shared harness。
- DB runner `bash tests/unit/system-remediation/sr-qa-webhook-001/run-postgres.sh` 由 wrapper 實際執行。從本機 DB 複製 schema 到獨立暫存 DB，結束後 drop；沒有寫入來源 DB。獨立執行時可設定 `DRTS_WEBHOOK_DB_EVIDENCE` 指定 JSON 輸出路徑。
- C111：SQL 回讀兩筆 key、確認無 plaintext、輪替關聯正確；重新初始化後 overlap 狀態存在；撤銷持久化後再次初始化仍 revoked，拒絕再 rotate。
- C112：受控 HTTP 503 產生 queued delivery；重新初始化 service 後真實約 30 秒 backoff 自動送達，DB 回讀 delivered；接收 bytes/HMAC 相符且竄改不符；相同 outbox key 再發布不新增送達。這是 service instance 恢復，尚非 OS process 重啟。
- 完整資源 ID：`tests/e2e/system-remediation/sr-qa-webhook-001/evidence-postgres.json`。例如 webhook `wh_c04b755d-02cf-4502-b612-964ebb8c0379`、delivery `wd_06cbe21a-4c5a-4bdb-a714-97aa6b26de46`，接收器共收到 3 次 HTTP。
- 修正 artifact 路徑後執行 `DRTS_WEBHOOK_LIVE=1 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 1，1 failed / 4 passed，2.3s；缺 live 證據明確失敗，成功 artifact 保留，失敗另寫 `evidence-live-unavailable.json`。
- `pnpm exec eslint tests/unit/system-remediation/sr-qa-webhook-001/*.ts tests/e2e/system-remediation/sr-qa-webhook-001/*.ts --max-warnings=0` → exit 0；`git diff --check` → exit 0。

尚缺 C111 authenticated API 最小權限、使用量；C112 OS process 重啟、產品預設 deadline 及完整 replay 接收端策略；C113 ERP/SSO/bank sandbox；C114 真 provider；C115 部署排程、積壓、重啟補跑與告警回執。後三項需 supervisor 協調外部環境與證據；本地測試成功不能取代這些驗收，仍維持 in_progress，不 handoff。

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
