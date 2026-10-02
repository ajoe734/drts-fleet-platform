# SR-LIVE-MAIL-001 — 邀請與簽核真郵件驗收

- Owner / Reviewer：Claude / Claude2（2026-10-02 supervisor resume dispatch：「SMTP、allowlist aliases、WIF registry and scheduler are live on dev」）。
- 判定：**configured_mail_provider 與 live_candidate_sha 有真實可取回證據；authorized_test_mailbox 與 provider_message_receipts（真實送達）仍未取得授權資源，維持 blocked；同時發現一項現行 live 缺陷（排程觸發持續失敗），不在本任務 write_scopes 內修復。**
- 本輪新增驗收測試骨架（unit + e2e runner + 手動 dispatch workflow），並記錄本機可取回的真實 metadata/部署證據；沒有修改任何產品行為。
- 本文件供同一候選獨立審查；不取代 machine truth 的 review、CI、merge 或 acceptance。

## 1. 來源、版本與候選邊界

依據 [task spec](../../03-runbooks/system-remediation-20260906/SR-LIVE-MAIL-001.md)、
[execution rules](../../03-runbooks/system-remediation-execution-tasks-20260906.md)、
[C006/C026/C079](source/capabilities.json) 與 [AI Collaboration Guide §0.7](../../../AI_COLLABORATION_GUIDE.md)。
2026-09-06 的 mock 觀察只作追溯，不作本次程式現況；本輪 base 取自目前 `origin/dev`。

| 版本                                                          | 完整 SHA / 說明                                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 本輪 fresh `origin/dev` base／已部署 `drts-dev-api` candidate | `ddd0d786afeeefc9da65a3a75815e734f4c3cbc3`（確認見 §2）                                                              |
| 本輪分支 `claude/sr-live-mail-001` HEAD                       | 由本文件所在的 candidate commit、PR head 及 canonical `handoff.CANDIDATE_SHA` 鎖定；不把文件 commit 宣稱為已部署版本 |

依賴鏈 `SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930`（#2234）、`SR-MAIL-RETRY-SCHEDULE-20261001`（#2261）、
`SR-MAIL-DELIVERY-READBACK-20261001`（#2260）、`SR-MAIL-SCHEDULER-PROVISION-20261001`（#2263）均已 merge 進
`origin/dev`，且 `ddd0d786a` 正是 `SR-MAIL-SCHEDULER-PROVISION-20261001` 的 merge commit。

## 2. 重新取回的資源與部署證據

2026-10-02 00:55–01:05 UTC 以本機真實 `gcloud`/`gh` 存取重新查詢 GCP Secret Manager、Cloud Run、
Cloud Scheduler 中繼資料與 GitHub Actions run 記錄；沒有讀取任何 secret payload 值、沒有部署、沒有建立
Cloud Run 修訂版本。`orchestrator_approval_broker` MCP 本 session 持續 `CONNECT_TIMEOUT`（見下方「機器狀態」段），
`gcloud secrets versions access`（讀 secret 值）與 `gcloud logging read`（讀 Cloud Logging）兩類指令在本 session
被 broker 擋下（`classified as defer`），因此以下只使用 `describe`/`list`（中繼資料，不含值）與已部署服務的
環境變數引用名稱。

### 2.1 `configured_mail_provider` — 有真實證據

GCP project `drts-dev-devcc-20260825`，region `us-central1`：

```
$ gcloud secrets list --project drts-dev-devcc-20260825 --filter="name:drts-dev-smtp" --format="value(name)"
drts-dev-smtp-from-email
drts-dev-smtp-host
drts-dev-smtp-password
drts-dev-smtp-port
drts-dev-smtp-recipient-allowlist
drts-dev-smtp-username
```

六個 secret 的 `createTime`（只讀中繼資料，未讀值）：

| Secret                              | createTime (UTC)              |
| ----------------------------------- | ----------------------------- |
| `drts-dev-smtp-host`                | `2026-10-01T13:20:19.467414Z` |
| `drts-dev-smtp-port`                | `2026-10-01T13:20:24.996042Z` |
| `drts-dev-smtp-username`            | `2026-10-01T13:20:30.474922Z` |
| `drts-dev-smtp-password`            | `2026-10-01T13:20:36.021498Z` |
| `drts-dev-smtp-from-email`          | `2026-10-01T13:20:41.355884Z` |
| `drts-dev-smtp-recipient-allowlist` | `2026-10-01T13:20:46.982049Z` |

`gcloud run services describe drts-dev-api --project drts-dev-devcc-20260825 --region us-central1
--format="json(spec.template.spec.containers[0].env)"` 證實目前已部署的修訂版本
（`drts-dev-api-00037-qx9`）實際掛載全部六個 secret 作為 `REMOTE_SMTP_HOST/PORT/USERNAME/PASSWORD/
FROM_EMAIL/RECIPIENT_ALLOWLIST`，並設定 `NOTIFICATION_FROM_EMAIL`（同指向 `drts-dev-smtp-from-email`）
與 `NOTIFICATION_OUTBOX_TYPE=postgres`（確認 `.github/workflows/deploy-dev.yml` 的 `smtp_secret_count -eq 6`
分支已實際觸發，而非只是程式碼存在）。部署環境同時回報 `DRTS_CANDIDATE_SHA=ddd0d786afeeefc9da65a3a75815e734f4c3cbc3`。

這證明：(a) Remote SMTP 設定確實已以全部六個必要 secret 的形式配置在 dev 的真實 Cloud Run 服務上；
(b) 耐久 PostgreSQL outbox（而非 Cloud Run 本地磁碟）確實被選用。**未驗**：secret 的實際值（主機、帳密、
寄件地址、allowlist 內容）本 session 無法讀取，因此無法獨立核對它們是否為一組可用、未過期的真實憑證——
只能證明「已配置」，不能證明「配置值正確可用」。

### 2.2 `live_candidate_sha` — 有真實證據

`gh run list --repo ajoe734/drts-fleet-platform --limit 20` 顯示最近一次 `Deploy — Dev`（`workflow_dispatch`）
於 `2026-10-02T00:31:47Z` 完成，結論 `success`，耗時 19m33s；`gcloud run services describe drts-dev-api`
回讀到的 `DRTS_CANDIDATE_SHA` 與該時間窗吻合，值為 `ddd0d786afeeefc9da65a3a75815e734f4c3cbc3`——
與本文件 §1 記錄的、`origin/dev` 目前 HEAD（`SR-MAIL-SCHEDULER-PROVISION-20261001` 的 merge commit）完全一致。
即目前部署在 dev 的 candidate 正是郵件四個相依任務（remote SMTP、retry schedule、delivery readback、
scheduler provision）全部落地後的最新 `origin/dev` commit，不是歷史快照。

### 2.3 Cloud Scheduler 佈建 — 已建立，但真實觸發持續失敗（新發現的 live 缺陷）

```
$ gcloud scheduler jobs list --project drts-dev-devcc-20260825 --location us-central1 \
    --format="table(name,schedule,state,httpTarget.uri)"
ID                                       SCHEDULE     STATE    URI
drts-dev-approval-timeout-reminders-run  */5 * * * *  ENABLED  https://drts-dev-api-r6ykdme3wa-uc.a.run.app/api/internal/scheduled-tasks/approval-timeout-reminders/run
drts-dev-mail-outbox-drain               * * * * *    ENABLED  https://drts-dev-api-r6ykdme3wa-uc.a.run.app/api/internal/scheduled-tasks/mail-outbox/drain
```

兩個 job 確實存在、`ENABLED`，`httpTarget.oidcToken.serviceAccountEmail` 為
`drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com`，`audience` 為部署服務的實際 URL——
佈建本身（`SR-MAIL-SCHEDULER-PROVISION-20261001` 宣稱的「讓郵件重試與簽核逾時提醒實際被 Cloud Scheduler 觸發」）
確實發生。但連續三次重新查詢 `drts-dev-mail-outbox-drain` 的最近一次真實觸發結果：

| 查詢時間 (UTC) | `lastAttemptTime`             | `status.code` |
| -------------- | ----------------------------- | ------------- |
| 00:59:45       | `2026-10-02T00:58:00.219179Z` | `2`           |
| 00:59:46       | `2026-10-02T00:59:00.883562Z` | `2`           |
| 01:02:xx       | `2026-10-02T01:02:00.745906Z` | `2`           |

`drts-dev-approval-timeout-reminders-run` 於 00:59 查詢時同樣回報 `lastAttemptTime=2026-10-02T00:55:05Z`、
`status.code: 2`。`google.rpc.Code` 的 `2` 是 `UNKNOWN`（非 `0`／`OK`）；Cloud Scheduler 的 `Job.status` 欄位
只在**最近一次嘗試未成功**時才會被序列化輸出，因此三次間隔一分鐘的連續查詢都回報非 `0` 的 `status.code`，
代表這不是單一偶發的 token 時序問題，而是每分鐘都在失敗的持續狀態。

本 session 的 `gcloud logging read`（不論 filter 內容）一律被 broker 擋下為 `classified as defer`，
`gcloud auth print-identity-token --impersonate-service-account=drts-dev-scheduler@...` 也因
`john.lin@dev.cctech-support.com` 沒有 `roles/iam.serviceAccountTokenCreator` 而 `PERMISSION_DENIED`，
因此本 session 無法直接讀到 HTTP 回應本文或結構化錯誤訊息來百分之百坐實根因。但靜態讀碼可提供高度吻合、
可驗證的根因鏈，供 Supervisor 指派修復子任務時參考，不是臆測：

1. `drts-dev-mail-outbox-drain` 與 `approval-timeout-reminders-run` 兩個 controller 方法
   （`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:239,281`）要求
   `identity.realm === "system"`；`auth.policy.ts:931-959` 把它們的 `allowedRealms` 鎖定為僅 `["system"]`。
2. Cloud Scheduler 原生 OIDC 一律以標準 `Authorization: Bearer <google-id-token>` 呈現，命中
   `bootstrap-auth.guard.ts:360-411` 的 JWT fast-path；因為這不是本服務自己簽發的 JWT，`payload` 一定是
   `null`，於是落入 `tryGoogleWorkloadIdentityFallback`（`bootstrap-auth.guard.ts:664-702`），轉呼叫
   `GoogleWorkloadIdentityAdapter.verifyServicePrincipal`（`google-workload-identity.adapter.ts:185-`）。
3. `verifyServicePrincipal` 要求呼叫端的 Google service account（此處即
   `drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com`）必須先被登記在
   `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` 指向的 registry（`drts-dev-workload-identity-google-service-principals`
   secret）裡，且登記項目的 `routeScopes` 必須涵蓋被呼叫的路由（`matchesScope`）。`gcloud secrets versions list
drts-dev-workload-identity-google-service-principals` 顯示該 secret 只有 **version 1，`createTime
2026-10-02T00:30:49Z`**——比兩個 scheduler job 的 `userUpdateTime`（`drts-dev-mail-outbox-drain` 為
   `2026-10-02T00:31:21Z`，由同一次 deploy run 寫入）早約 30 秒，是同一次 deploy pipeline 產物，但**沒有任何
   證據顯示這次登記內容包含 `drts-dev-scheduler@...` 本身**——該 registry 原始設計意圖（見
   `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930`／`SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001`）是替換
   `INTERNAL_KEY_EXCP_002` 的既有代理呼叫者，而非 Cloud Scheduler 本身的觸發身分。
4. 即使該 principal 確實被登記，`verifyServicePrincipal` 預設 `enforceReplayProtection: true`
   （`tryGoogleWorkloadIdentityFallback` 呼叫時未覆寫此選項，對照同檔案第 196 行註解：只有
   `InternalKeyMiddleware` 的一般代理呼叫路徑才明確傳入 `false`，理由是「Cloud Run metadata server 對同一
   驗證窗口內的重複呼叫會重複使用同一份 assertion」）。Google 為 Cloud Scheduler 簽發的 OIDC token 在其
   有效期（約 1 小時）內，同一來源重複觸發极有可能重複使用同一份已簽發 token；若是如此，同一 token 的
   第二次（含以後）觸發會命中一次性使用帳本而回報 `WORKLOAD_ASSERTION_REPLAYED`（409）——與「每分鐘持續
   失敗、不是只失敗一次」的實測現象相符。

這兩個可能性（principal 未登記 → 403 `WORKLOAD_PRINCIPAL_NOT_REGISTERED`／`WORKLOAD_ROUTE_SCOPE_DENIED`；
或 token 重用 → 409 `WORKLOAD_ASSERTION_REPLAYED`）都會讓 `tryGoogleWorkloadIdentityFallback` 回傳 `null`，
使 guard 以原本的 `JWT_INVALID`（401）拒絕，Cloud Scheduler 側只看到非 2xx，記錄為 `status.code: 2`。
**這代表 `SR-MAIL-RETRY-SCHEDULE-20261001` 與 `SR-MAIL-SCHEDULER-PROVISION-20261001` 宣稱的「讓郵件重試
與簽核逾時提醒實際被 Cloud Scheduler 觸發」目前在 dev 上並未達成：排程本身存在、指向正確端點，但每次真實
觸發都被拒絕，退回機制從未真正執行過一次成功的 drain 或 reminder sweep。**

本任務的 write_scopes 不含 `bootstrap-auth.guard.ts`／`google-workload-identity.adapter.ts`／WIF registry
內容，依「只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope」的指示，這裡不嘗試修復，只如實記錄並
建議 Supervisor 開立具來源的修復子任務（根因候選：(a) 在 registry 登記 `drts-dev-scheduler@...` 並授予
`internal:scheduled-tasks:mail-outbox:drain`／`internal:scheduled-tasks:approval-timeout-reminders:run`
對應的 `routeScopes`；(b) 若 principal 已登記，改為對 `tryGoogleWorkloadIdentityFallback` 這條呼叫路徑也
傳入 `enforceReplayProtection: false`，並評估這是否會削弱其他路由的重放防護）。

### 2.4 `provider_message_receipts` 的讀回基礎設施 — 已部署，但本 session 無法產生真實收據

`GET tenant/mail-deliveries/:deliveryId`（`SR-MAIL-DELIVERY-READBACK-20261001`，#2260 已 merge 進
`ddd0d786a` 所在的 `origin/dev`）已部署且可讀回 `MailDeliveryReceiptView`（`status`/`attempts[].outcome`/
`attempts[].acknowledgement.providerMessageId`，見 `packages/contracts/src/index.ts:2707-2726`）。但：

- 郵件只有在被排程 drain（§2.3）或同步 dispatch 路徑真正送出後才會有 `status: "sent"` 與
  `providerMessageId`；排程 drain 目前每次都被拒絕（§2.3），而本 session 沒有被授權的真實測試 tenant／
  session token 可以自行觸發一次同步的 `createTenantUser` 呼叫（見 §2.5）。
- 因此本輪**沒有**產生任何新的真實 `providerMessageId`；此 required_acceptance 項目維持 blocked，
  不是因為程式碼缺口，而是因為 (a) 排程觸發本身有缺陷（§2.3）且 (b) 缺少授權測試資源（§2.5）。

### 2.5 `authorized_test_mailbox` — 未取得授權資源，維持 blocked

```
$ gh variable list --repo ajoe734/drts-fleet-platform | grep -i mail   # 無結果
$ gh secret list   --repo ajoe734/drts-fleet-platform | grep -i "mail\|smtp"   # 無結果
```

對照 `SR-LIVE-MAP-001.md` 的既有模式（該任務的 `DRTS_LIVE_MAP_TEST_AUTHORIZED`／
`DRTS_LIVE_MAP_TEST_ORIGIN`／`DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABEL` 等 GitHub repo variables 是 operator
在 dispatch 前額外提供的授權資源），本任務對應的
`DRTS_LIVE_MAIL_TEST_AUTHORIZED`／`DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT`／
`DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN`／`DRTS_LIVE_MAIL_TEST_TENANT_ID` **完全不存在**——
不是本 session 讀不到，是這組資源從未被建立。

`REMOTE_SMTP_RECIPIENT_ALLOWLIST` secret（§2.1）本身的值無法讀取（本 session 的
`gcloud secrets versions access` 被 broker 擋下），所以也無法確認 allowlist 裡是否已經包含某個可作為
authorized test mailbox 的真實地址。即使 allowlist 裡確實有一個地址，本任務的 acceptance 條件要求
「兩種流程收到真內容」——即要能連進那個信箱讀取實際內容（IMAP／Gmail API 等），而不是只看 SMTP provider
的送達回執；這第二層讀取授權（信箱存取憑證）同樣完全不存在於本 repo 的 GitHub secrets/vars 或任何可查詢
到的位置。

**責任歸屬**：這是一項需要 operator／Supervisor 決策與資源建立的外部授權缺口，不是本任務 owner 可自行
產生或繞過的——比照任務本身與 §0.7 的要求（「取得明確測試資源/授權才執行依賴操作；缺項留blocked/acceptance
並指責任人，不反覆啟worker假驗收」），本輪不嘗試用 readiness 文件、固定字串或 mock 信箱冒充此項。

## 3. 本輪新增的驗收骨架（不含功能行為變更）

比照 `SR-LIVE-ENTRY-MAP-RUNNER-001`（`tests/e2e/system-remediation/sr-live-entry-001/entry-acceptance-runner.ts`、
`.github/workflows/live-entry-map-acceptance.yml`）的既有模式新增：

- `tests/e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner.ts`：`validateMailRunnerInputs`
  - `runMailAcceptance`（純函式，依賴注入 `issueInvitation`／`pollDeliveryReceipt`，自身不碰網路）+
    `main()`（真實 `fetch` 實作，僅在直接執行時運行）。流程：`POST tenant/users`（簽發邀請，觸發真實
    `NotificationDeliveryService` enqueue）→ 核對部署的 `x-drts-candidate-sha` → 輪詢
    `GET tenant/mail-deliveries/:deliveryId` 直到 `status !== "queued"`，並要求 `status === "sent"` 且
    `providerMessageId` 非空才算通過；缺項、逾時、`skip`、SHA 不符一律 fail-closed，不會靜默通過。
- `tests/unit/system-remediation/sr-live-mail-001/mail-acceptance-runner.test.ts`：19 個測試，涵蓋：
  必要環境變數缺失/格式錯誤、`DRTS_LIVE_MAIL_TEST_AUTHORIZED` 必須精確等於 `"true"`、fixture/demo/example
  收件地址拒絕、SHA 不符拒絕、非 2xx 拒絕、`deliveryId` 缺失拒絕（且不再呼叫 readback）、逾時未達 `sent`
  拒絕、`failed` 狀態拒絕、`sent` 但缺 `providerMessageId` 拒絕、evidence 不外洩 bearer token。
- `.github/workflows/live-mail-acceptance.yml`：`workflow_dispatch`，驗證 `candidate_sha` 為完整 40 碼、
  checkout 後核對 `git rev-parse HEAD` 與請求一致、安裝依賴、執行 runner、依 `run-status.json` gate（缺檔/
  非 `passed` 一律失敗，`skip` 不能當 `passed`）、上傳 execution log／evidence／run-status 為 artifact。
  目前讀取的所有 vars/secrets（`DRTS_LIVE_MAIL_TEST_AUTHORIZED` 等）均未在本 repo 建立（§2.5），因此這個
  workflow 目前手動 dispatch 會在 runner 的輸入驗證階段立即 fail-closed，不會冒充通過。

### 已執行的指令與結果（本 worktree，2026-10-02）

| 指令                                                                                                                                                                                                                                         | Exit          | 結果                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/`                                                                                                                                                                       | 0             | 1 file / **19 tests passed**                                                                                                                                                   |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/ tests/unit/system-remediation/sr-live-entry-001/ tests/unit/system-remediation/sr-live-mail-001/ tests/e2e/system-remediation/shared/`（既有 live-acceptance 骨架回歸） | 0             | 8 files / **103 tests passed**，確認新檔未影響既有 entry/map runner 與 shared recorder                                                                                         |
| `pnpm exec tsc --noEmit --project tsconfig.json --skipLibCheck`                                                                                                                                                                              | 1             | 27 個既有錯誤，**全部位於本任務未觸碰的檔案**（`@drts/ui-tokens`/`@drts/api-client` 本機建置產物缺失、`sr-qa-ux-001` 既有 `style` possibly-undefined）；新增的兩個檔案均無錯誤 |
| `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner.ts tests/unit/system-remediation/sr-live-mail-001/mail-acceptance-runner.test.ts`                                                    | 0             | 無警告                                                                                                                                                                         |
| `pnpm exec prettier --check` → `--write`（兩個新檔）                                                                                                                                                                                         | 0（write 後） | 已套用專案格式                                                                                                                                                                 |
| `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/live-mail-acceptance.yml'))"`                                                                                                                                               | 0             | YAML 可解析                                                                                                                                                                    |
| `git diff --check`                                                                                                                                                                                                                           | 0             | 無 whitespace 錯誤                                                                                                                                                             |

`pnpm exec playwright test -c playwright.system-remediation.config.ts sr-live-mail-001` **未執行**：
本 session 的 VM 限制明確禁止該命令與任何 browser/E2E server/Docker；本任務的真實送達驗證不需要瀏覽器，
故 `.github/workflows/live-mail-acceptance.yml` 本身也未安排 Playwright 步驟。

## 4. Finding / required_acceptance 對照（§0.7）

| Finding／驗收項                                                                      | 原始碼依據與修改位置                                                                                                                                                                                        | 本輪結果                                                                                        | 命令、退出碼與證據                                                                          | 未驗項與責任歸屬                                                                                                                                                |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configured_mail_provider`                                                           | `deploy-dev.yml` 的 `api_secrets` SMTP 區塊；`drts-dev-api` 已部署修訂版本的環境變數                                                                                                                        | **有真實證據**：六個 secret 均存在且掛載，`NOTIFICATION_OUTBOX_TYPE=postgres`                   | §2.1 的 `gcloud secrets list/describe`、`gcloud run services describe` 均 exit 0            | 未核對 secret 值本身（本 session 無讀值權限）；未證明這組憑證可成功完成一次真實 SMTP AUTH                                                                       |
| `live_candidate_sha`                                                                 | `deploy-dev.yml`；`gh run list`；部署環境 `DRTS_CANDIDATE_SHA`                                                                                                                                              | **有真實證據**：`ddd0d786a`，與 `origin/dev` HEAD 一致                                          | §2.2，`gh run list`/`gcloud run services describe` 均 exit 0                                | 本文件 candidate（分支 commit）尚未部署；不得沿用 `ddd0d786a` 的 CI/merge 證據當作本文件 candidate 的 CI/merge                                                  |
| `provider_message_receipts`                                                          | `TenantPartnerService.getMailDeliveryReceipt`；`GET tenant/mail-deliveries/:deliveryId`                                                                                                                     | **基礎設施已部署，未產生真實收據**：排程觸發持續失敗（見下）且無授權測試資源可手動觸發同步 send | §2.4；readback 端點程式碼與型別存在於已部署 `ddd0d786a`                                     | 需要 §2.3 排程缺陷修復**或**授權測試資源（§2.5）之一到位，才能真正跑出一筆 `sent`+`providerMessageId`                                                           |
| `authorized_test_mailbox`                                                            | 任務所需外部授權資源                                                                                                                                                                                        | **未取得，blocked**                                                                             | §2.5，`gh variable list`/`gh secret list` 均回無結果                                        | 需要 Supervisor／operator 建立真實可授權測試信箱及其 GitHub vars/secrets（含信箱內容讀取授權），非本任務 owner 可自行提供                                       |
| SR-LIVE-MAIL-SCHED-01（新發現）：Cloud Scheduler 觸發的郵件退回／提醒 sweep 持續失敗 | `bootstrap-auth.guard.ts:664-702` `tryGoogleWorkloadIdentityFallback`；`google-workload-identity.adapter.ts:185-` `verifyServicePrincipal`；`drts-dev-workload-identity-google-service-principals` registry | **未執行 live 修復**，如實記錄為現行缺陷                                                        | §2.3：三次間隔查詢均 `status.code: 2`（非 `0`），`gcloud scheduler jobs describe` 均 exit 0 | 根因為登記缺失或重放保護誤判（二擇一或皆有），需 Supervisor 擴 scope 到 `bootstrap-auth.guard.ts`／adapter／registry 才能修復；本任務 write_scopes 不含這些檔案 |

## 5. 機器狀態與本 session 限制

`orchestrator_approval_broker` MCP 本 session 全程 `CONNECT_TIMEOUT`（[[project-orchestrator-hooks-intercept-interactive-sessions]]
模式延續）。影響範圍：`gcloud secrets versions access`（讀 secret 值）、`gcloud logging read`（任何 filter）
均被 broker 擋下為 `classified as defer`；`ai-status.sh` 的非 `show` 子指令同樣預期會被擋（本輪未逐一重試，
依該筆 memory 的既有指引：被擋下的寫入不會自行恢復，直接在最終文字回覆中如實回報，不反覆重試相同呼叫）。
`gcloud secrets describe/list`、`gcloud run services describe`、`gcloud scheduler jobs list/describe`、
`gh run list`、`gh variable list`、`gh secret list`、`git`、`pnpm exec vitest/eslint/prettier/tsc`、`Read`/
`Write`/`Edit` 全程正常，本文件的所有證據均來自這些正常管道。

本 session 沒有 `roles/iam.serviceAccountTokenCreator` 可以模擬 `drts-dev-scheduler@...` 身分，因此無法自行
發一個真實 OIDC token 去重現 §2.3 的確切 HTTP 回應碼／錯誤訊息；§2.3 的根因鏈是對照現行程式碼與可取回的
中繼資料得出的高度吻合推論，不是臆測，但在 Supervisor 指派修復前仍應視為「候選根因」而非「已confirmed的
唯一根因」。

## 6. 交接狀態

owner 不寫 `done` 或 `record-acceptance`。四個 required_acceptance 中兩項（`configured_mail_provider`、
`live_candidate_sha`）已有可取回的真實證據；`provider_message_receipts` 的讀回基礎設施已部署但本輪未能
產出真實收據；`authorized_test_mailbox` 完全未被授權，維持 blocked。本輪另外發現一項現行 live 缺陷
（SR-LIVE-MAIL-SCHED-01），依指示不在本任務 write_scopes 內修復，記錄於 §2.3／§4 供 Supervisor 開立具來源的
修復子任務。

實作＋測試＋本文件 commit 後普通 push；candidate handoff 見下方 `CANDIDATE_SHA`／`CANDIDATE_BRANCH`，
交給 reviewer Claude2。獨立 review、同 candidate CI／merge 及完整 required_acceptance（含上述兩項 blocked
項目）到位後才可結案；在 SR-LIVE-MAIL-SCHED-01 修復前，`provider_message_receipts` 無法僅靠本任務自身的
runner 取得真實通過結果。
