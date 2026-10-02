# SR-LIVE-MAIL-001 — 邀請與簽核真郵件驗收

- Owner / Reviewer：Claude / Claude2（2026-10-02 supervisor resume dispatch：「SMTP、allowlist aliases、WIF registry and scheduler are live on dev」）。
- 判定：**configured_mail_provider 與 live_candidate_sha 有真實可取回證據；authorized_test_mailbox 的信箱／別名資源已由 operator 建立（見 §2.5），但本輪 harness 尚未實際跑過 hosted workflow 取得通過證據；provider_message_receipts 需靠該次真實執行才能坐實。已知現行 live 缺陷（排程觸發失敗，task ID `SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002`）不在本任務 write_scopes 內修復，且不阻擋本 runner 的同步送信路徑。**
- 本輪新增可重跑的 live 驗收 harness（session 真實 mint、正／負向送信、readback、unit tests、手動 dispatch workflow），並記錄本機可取回的真實 metadata/部署證據；沒有修改任何產品行為。
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
與簽核逾時提醒實際被 Cloud Scheduler 觸發」目前在 dev 上並未穩定達成：排程本身存在、指向正確端點，但真實
觸發仍會失敗。**

**2026-10-02T01:05Z Supervisor 確認（讀自 `ai-status.sh show SR-LIVE-MAIL-001` 的 `integration_notes`，
非本輪自行臆測）**：此缺陷已有獨立 task ID `SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002`，Supervisor 原話
「about half the scheduler drain triggers return 401」。「約一半」而非「全部」失敗，與 principal 完全未登記
（會導致每次都 403／401、不會有約一半成功）的解釋不符，而與上面第 4 點的 token 重用／重放假說高度吻合——
Google 為同一來源簽發的 OIDC token 在有效期內可能被重複使用，第一次消耗掉一次性使用帳本後，同一 token 的
後續觸發即被 `WORKLOAD_ASSERTION_REPLAYED` 拒絕並映射為 401，直到 Google 簽發新 token 後才又能成功一次，
形成「約一半成功、一半失敗」的間歇模式。Supervisor 同時指示：「Build and run the harness now, but collect
the automatic-retry evidence only after that fix is deployed; record it as pending until then instead of
claiming it」——即本任務仍可／應該建置並執行 harness，但排程觸發的自動重試證據要等 `SR-MAIL-SCHEDULER-
TOKEN-REUSE-20261002` 修好後才能宣稱通過；本 runner 的同步送信（`POST tenant/users` 當下即呼叫
`NotificationDeliveryService.dispatch`，見 `SR-MAIL-DELIVERY-READBACK-20261001` 的「enqueue 成功、dispatch
失敗」分析）不依賴排程，不受此缺陷阻擋。

本任務的 write_scopes 不含 `bootstrap-auth.guard.ts`／`google-workload-identity.adapter.ts`／WIF registry
內容，依「只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope」的指示，這裡不嘗試修復，只如實記錄並
在 §4 標註 task ID，交由 `SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002` 的 owner 修復。

### 2.4 `provider_message_receipts` 的讀回基礎設施 — 已部署；需要實際跑一次 hosted run 才有真實收據

`GET tenant/mail-deliveries/:deliveryId`（`SR-MAIL-DELIVERY-READBACK-20261001`，#2260 已 merge 進
`ddd0d786a` 所在的 `origin/dev`）已部署且可讀回 `MailDeliveryReceiptView`（`status`/`attempts[].outcome`/
`attempts[].errorCode`/`attempts[].acknowledgement.providerMessageId`，見
`packages/contracts/src/index.ts:2707-2726`）。`TenantInvitationDeliveryService.deliver()`
（`tenant-invitation-delivery.service.ts`）在 `POST tenant/users` 當下即同步呼叫 `enqueue()`／`dispatch()`，
不是只靠 §2.3 的排程 drain 才會送出——這點已由 `SR-MAIL-DELIVERY-READBACK-20261001` 的「enqueue 成功、
dispatch 失敗」測試案例證實（見該任務 round 2 記錄）。因此即使 §2.3 的排程缺陷尚未修復，本輪新增的
runner（§3）走的是這條同步路徑，理論上不受阻擋；但本 session 本身沒有網路權限可以直接呼叫已部署的
`https://drts-dev-api-r6ykdme3wa-uc.a.run.app`（VM 限制、且沒有 WIF 模擬權限，見 §5），所以**尚未在本輪
實際執行過一次真實送信＋readback**，`provider_message_receipts` 仍待一次 hosted workflow run 的真實輸出
才能坐實為「通過」。

### 2.5 `authorized_test_mailbox` — 信箱與別名資源已由 operator 建立；本輪尚未實跑驗證

`gh variable list`／`gh secret list` 在本 repo 層級找不到 `DRTS_LIVE_MAIL_*`（仍需 Supervisor／operator
建立對應 GitHub repo variables，見 §3 的 workflow 需求清單），但**實際的信箱資源本身已經存在**——這不是本
session 自己查到的，是讀 `ai-status.sh show SR-LIVE-MAIL-001` 回傳的 `integration_notes` 欄位（Supervisor
2026-10-01／2026-10-02 兩次更新，只讀，machine truth）得知：

- `drts-dev-smtp-recipient-allowlist` secret 的 **version 2**（`2026-10-02T00:30:39Z`，由 user 執行別名腳本
  建立，Supervisor 本身未讀值）在 version 1（sender 信箱本身）之外，新增了 sender 信箱的 `+invite` 與
  `+approve` 別名（Gmail plus-addressing）——即 `<sender>+invite@...` 與 `<sender>+approve@...` 現在都在
  allowlist 內，且兩者收到的信都進同一個真實信箱（sender 信箱本身），用來分流邀請流程與簽核流程的測試信件。
- 這組別名位址由 `drts-dev-smtp-username` secret 衍生（同一帳號），讀取內容需要 IMAP 連到
  `imap.gmail.com:993`，用同一組 `drts-dev-smtp-username`／`drts-dev-smtp-password`，只能在 hosted runner
  內透過 WIF 認證後以 `gcloud secrets versions access` 取得並立即 masked，不可在此 session 讀取或印出。
  Supervisor 的筆記明確要求：只能讀 `[Gmail]/All Mail`（因為寄給自己的信可能只有 Sent／Inbox 其中一個
  label）、絕不可對 allowlist 內其他位址（屬於 user）發信、絕不印出 allowlist／信箱密碼／session token／
  invitation token。
- `deploy-dev run 36946449389`（`ddd0d786a`，revision `drts-dev-api-00037-qx9`，00:44:52Z 啟動）掛載的就是
  這個 version 2 allowlist，與 §2.2 記錄的 live candidate 一致——換言之，**當前部署的 candidate 已經在用
  含有這兩個別名的 allowlist**，不是舊版。

**本輪已完成、未完成的部分**：

- 已完成：§3 新增的 `session-bootstrap.ts` 落實了 Supervisor 筆記裡描述的真實 session 取得流程（WIF 鑄造
  Google ID token → `POST auth/token` 的 CI tenant-actor 授權 → `POST identity/step-up-proofs` 取得
  `tenant:users:create` 的 step-up reference），`mail-acceptance-runner.ts` 則用這組真實 session 呼叫
  `POST tenant/users` 送信給授權別名、輪詢 readback，並新增一組「寄給 allowlist 外位址」的負向案例驗證
  `SMTP_RECIPIENT_NOT_ALLOWLISTED` 確實被記錄（不實際發信，因為 transport 在送網路前就擋下）。
- **未完成**：實際讀信箱內容（IMAP `[Gmail]/All Mail` 搜尋＋確認真實送達內容，Supervisor 筆記裡「兩種流程
  收到真內容」的那一半）本輪**沒有實作**——理由不是資源不存在（§2.5 已證明存在），而是這段程式只能在 hosted
  runner 內用真實 IMAP 連線驗證，且新增 IMAP 用戶端在目前 write_scopes（不含 `package.json`／
  `pnpm-lock.yaml`）下只能靠 Node/Python 內建模組手刻協定，而手刻、從未在本 session 實際連過真實 Gmail
  IMAP 伺服器驗證過的網路協定程式碼風險偏高；建議下一輪由 Supervisor 決定是走「擴 scope 加入 vetted IMAP
  套件（如 `imapflow`）」或「這一輪先用 provider 回執／readback API 作為 `authorized_test_mailbox` 的
  configured 證據，實際信箱內容讀取另開 follow-up」。本輪同樣沒有實作 approval 流程（C026，見 §4 的端點
  追溯）與 C079（發票信，產品本身無寄信路徑，記錄為不在範圍內，比照 integration_notes 原話）。
- 不論如何，**本輪尚未實際 dispatch 過 `.github/workflows/live-mail-acceptance.yml`**——`DRTS_LIVE_MAIL_*`
  repo variables（`DRTS_LIVE_MAIL_TEST_AUTHORIZED`、`DRTS_LIVE_MAIL_API_ORIGIN`、
  `DRTS_LIVE_MAIL_TEST_TENANT_ID`、`DRTS_LIVE_MAIL_TENANT_ACTOR_ID`、`DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT`、
  `DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT`）仍需 Supervisor／operator 建立後才能真正跑一次 hosted run；
  在那之前 `authorized_test_mailbox`／`provider_message_receipts` 都只能停在「基礎設施就緒、尚未實測通過」
  這一步，不冒充已驗證。

## 3. 本輪新增的驗收骨架（不含功能行為變更）

比照 `SR-LIVE-ENTRY-MAP-RUNNER-001`（`tests/e2e/system-remediation/sr-live-entry-001/entry-acceptance-runner.ts`、
`tests/e2e/system-remediation/sr-live-map-001/session-bootstrap.ts`、
`.github/workflows/live-entry-map-acceptance.yml`）的既有模式新增：

- `tests/e2e/system-remediation/sr-live-mail-001/session-bootstrap.ts`：`validateMailSessionInputs` +
  `mintTenantAdminSession`（純函式，依賴注入 `fetch`／`readGoogleIdToken`／`mask`，自身不碰網路）+ `main()`
  （真實實作，用 `gcloud auth print-identity-token --impersonate-service-account` 等效的 WIF 身分鑄造
  Google ID token，僅在直接執行時運行）。流程：鑄造的 Google ID token 帶 `x-drts-google-id-token` 呼叫
  `POST auth/token`（CI tenant-actor 授權，`google-workload-identity.adapter.ts:508-531`
  `isCiTenantActorGateEnabled`／`resolveCiTenantActorGrant`，走的是與 §2.3 排程缺陷**不同**的 registry
  授權路徑：`auth.controller.ts:436-510`，不經過 `tryGoogleWorkloadIdentityFallback`）→ 以 `auth/session`
  核對身分確實是請求的 `tenant_admin` actor → `POST identity/step-up-proofs` 取得 `tenant:users:create`
  的 `stepUpReference`（dev 環境 `tenant_admin` 的 `amr: ["tenant_bootstrap_fixture"]` 落在
  `trusted-mfa.policy.ts` 的 `NON_STRICT_TRUSTED_AMR`，`hasTrustedMfa` 可過；已用程式碼引用核對，非執行驗證）。
  任一步失敗即 fail-closed，錯誤訊息不外洩憑證內容。
- `tests/e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner.ts`：`validateMailRunnerInputs` +
  `runMailAcceptance`（純函式，依賴注入 `issueInvitation`／`pollDeliveryReceipt`）+ `main()`（真實 `fetch`
  實作）。兩段流程：(1) 正向——`POST tenant/users`（帶 session-bootstrap 鑄造的 bearer token 與
  `x-drts-step-up-reference`，對授權別名 `DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT` 簽發邀請，觸發真實
  `NotificationDeliveryService` enqueue/dispatch）→ 核對部署的 `x-drts-candidate-sha` → 輪詢
  `GET tenant/mail-deliveries/:deliveryId` 直到 `status !== "queued"`，要求 `status === "sent"` 且
  `providerMessageId` 非空；(2) 負向——對 `DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT`（刻意選在 allowlist
  外的保留網域位址，不會真的發出網路送信）重複同一流程，要求 readback 的 `status === "failed"` 且
  `errorCode === "SMTP_RECIPIENT_NOT_ALLOWLISTED"`，證明 allowlist 閘門確實攔截而非被繞過。缺項、逾時、
  `skip`、SHA 不符、負向案例被誤判為成功，一律 fail-closed，不會靜默通過。
- `tests/unit/system-remediation/sr-live-mail-001/session-bootstrap.test.ts`：9 個測試，涵蓋必要環境變數
  缺失、Google ID token 缺失/格式錯誤、部署 SHA 不符、session 驗證回傳錯誤 actor／realm、無法取得 step-up
  proof（缺信任 MFA）、非 2xx 回應不洩漏細節。
- `tests/unit/system-remediation/sr-live-mail-001/mail-acceptance-runner.test.ts`：23 個測試，涵蓋：
  必要環境變數缺失/格式錯誤、`DRTS_LIVE_MAIL_TEST_AUTHORIZED` 必須精確等於 `"true"`、fixture/demo/example
  收件地址拒絕、非法負向收件地址拒絕、SHA 不符拒絕、非 2xx 拒絕、`deliveryId` 缺失拒絕（且不再呼叫
  readback）、逾時未達 `sent` 拒絕、`failed` 狀態拒絕、`sent` 但缺 `providerMessageId` 拒絕、負向案例被
  誤判為送達拒絕、負向案例失敗原因非 allowlist 閘門拒絕、evidence 不外洩 bearer token。
- `.github/workflows/live-mail-acceptance.yml`：`workflow_dispatch`，驗證 `candidate_sha` 為完整 40 碼、
  checkout 後核對 `git rev-parse HEAD` 與請求一致、安裝依賴、`google-github-actions/auth`（既有
  `DEV_WIF_PROVIDER`／`DEV_WIF_SERVICE_ACCOUNT`，與 `deploy-dev.yml` 同一組 WIF）、執行
  `session-bootstrap.ts`（寫 session token／step-up reference 進 `GITHUB_ENV`）、執行
  `mail-acceptance-runner.ts`、依 `run-status.json` gate（缺檔/非 `passed` 一律失敗，`skip` 不能當
  `passed`）、上傳 execution log／evidence／run-status 為 artifact。目前讀取的 `DRTS_LIVE_MAIL_*` repo
  variables 均未在本 repo 建立（§2.5），因此這個 workflow 目前手動 dispatch 會在 runner 的輸入驗證階段
  立即 fail-closed，不會冒充通過；一旦 Supervisor／operator 建立這些 variables，即可重新 dispatch 取得
  真實通過／失敗證據。

明確不在本輪範圍（已具體追溯端點，供下一輪接手，不是模糊的「之後再做」）：

- IMAP 讀信內容驗證（`authorized_test_mailbox` 的「真內容」半邊）：見 §2.5，需要 Supervisor 決定 IMAP
  套件 scope 擴充與否。
- 簽核（approval）流程：`POST tenant/approval-rules`（建立 active rule）→
  `POST tenant/bookings`（`idempotency-key` header，觸發 `new_request` 通知給 active approvers）→
  `POST ops/approval-requests/:id/approve`／`reject`（觸發決議通知）→
  `GET audit` 的 `approval_notification.*` 列出 `recipients[].deliveryId`（`audit-notification.service.ts`，
  已存在、未變更）。
- C079（發票信）：產品本身目前沒有寄信路徑，依 integration_notes 原話記錄為不在本任務範圍。

### 已執行的指令與結果（本 worktree，2026-10-02）

| 指令                                                                                                                                                                                                                                         | Exit          | 結果                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-mail-001/`                                                                                                                                                                       | 0             | 2 files / **32 tests passed**（`mail-acceptance-runner.test.ts` 23、`session-bootstrap.test.ts` 9）                                                                            |
| `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/ tests/unit/system-remediation/sr-live-entry-001/ tests/unit/system-remediation/sr-live-mail-001/ tests/e2e/system-remediation/shared/`（既有 live-acceptance 骨架回歸） | 0             | 9 files / **116 tests passed**，確認新檔未影響既有 entry/map runner 與 shared recorder                                                                                         |
| `pnpm exec tsc --noEmit --project tsconfig.json --skipLibCheck`                                                                                                                                                                              | 1             | 27 個既有錯誤，**全部位於本任務未觸碰的檔案**（`@drts/ui-tokens`/`@drts/api-client` 本機建置產物缺失、`sr-qa-ux-001` 既有 `style` possibly-undefined）；新增的四個檔案均無錯誤 |
| `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-mail-001/ tests/unit/system-remediation/sr-live-mail-001/`                                                                                                           | 0             | 無警告                                                                                                                                                                         |
| `pnpm exec prettier --check` → `--write`（四個新檔＋workflow yml）                                                                                                                                                                           | 0（write 後） | 已套用專案格式                                                                                                                                                                 |
| `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/live-mail-acceptance.yml'))"`                                                                                                                                               | 0             | YAML 可解析                                                                                                                                                                    |
| `git diff --check`                                                                                                                                                                                                                           | 0             | 無 whitespace 錯誤                                                                                                                                                             |

`pnpm exec playwright test -c playwright.system-remediation.config.ts sr-live-mail-001` **未執行**：
本 session 的 VM 限制明確禁止該命令與任何 browser/E2E server/Docker；本任務的真實送達驗證不需要瀏覽器，
故 `.github/workflows/live-mail-acceptance.yml` 本身也未安排 Playwright 步驟。

## 4. Finding / required_acceptance 對照（§0.7）

| Finding／驗收項                                                                     | 原始碼依據與修改位置                                                                                                                                                                                        | 本輪結果                                                                                                                 | 命令、退出碼與證據                                                                          | 未驗項與責任歸屬                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configured_mail_provider`                                                          | `deploy-dev.yml` 的 `api_secrets` SMTP 區塊；`drts-dev-api` 已部署修訂版本的環境變數                                                                                                                        | **有真實證據**：六個 secret 均存在且掛載，`NOTIFICATION_OUTBOX_TYPE=postgres`                                            | §2.1 的 `gcloud secrets list/describe`、`gcloud run services describe` 均 exit 0            | 未核對 secret 值本身（本 session 無讀值權限）；未證明這組憑證可成功完成一次真實 SMTP AUTH                                                                                                                                   |
| `live_candidate_sha`                                                                | `deploy-dev.yml`；`gh run list`；部署環境 `DRTS_CANDIDATE_SHA`                                                                                                                                              | **有真實證據**：`ddd0d786a`，與 `origin/dev` HEAD 一致                                                                   | §2.2，`gh run list`/`gcloud run services describe` 均 exit 0                                | 本文件 candidate（分支 commit）尚未部署；不得沿用 `ddd0d786a` 的 CI/merge 證據當作本文件 candidate 的 CI/merge                                                                                                              |
| `authorized_test_mailbox`                                                           | `drts-dev-smtp-recipient-allowlist` secret version 2（`+invite`／`+approve` 別名）；`deploy-dev run 36946449389` 掛載此版本                                                                                 | **信箱／別名資源已由 operator 建立且已部署**；本輪新增可用的 harness（§3），**但尚未實際 dispatch 過一次 hosted run**    | §2.5；§3 的 runner／session-bootstrap 本機 unit test 32/32 通過                             | 需 Supervisor／operator 建立 `DRTS_LIVE_MAIL_*` repo variables 後才能實際 dispatch；IMAP 真內容讀取本輪未實作（§2.5 說明與建議）                                                                                            |
| `provider_message_receipts`                                                         | `TenantPartnerService.getMailDeliveryReceipt`；`GET tenant/mail-deliveries/:deliveryId`                                                                                                                     | **基礎設施已部署，readback 路徑不依賴 §2.3 排程缺陷**，但本輪尚未實際執行過一次真實送信＋readback                        | §2.4；readback 端點程式碼與型別存在於已部署 `ddd0d786a`                                     | 需 `authorized_test_mailbox` 的 repo variables 到位、實際 dispatch `.github/workflows/live-mail-acceptance.yml` 後才有真實 `sent`+`providerMessageId` 可讀回                                                                |
| `SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002`（Supervisor 已登記的現行缺陷，非本輪發起） | `bootstrap-auth.guard.ts:664-702` `tryGoogleWorkloadIdentityFallback`；`google-workload-identity.adapter.ts:185-` `verifyServicePrincipal`；`drts-dev-workload-identity-google-service-principals` registry | **未執行 live 修復**，本輪補上程式碼層級根因鏈（§2.3）佐證 Supervisor「about half ... return 401」的觀察，與重放假說吻合 | §2.3：三次間隔查詢均 `status.code: 2`（非 `0`），`gcloud scheduler jobs describe` 均 exit 0 | 根因候選為重放保護誤判（Supervisor「about half」的描述與此一致）；需 Supervisor 擴 scope 到 `bootstrap-auth.guard.ts`／adapter／registry 才能修復；本任務 write_scopes 不含這些檔案；**不阻擋**本任務 runner 的同步送信路徑 |

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

owner 不寫 `done` 或 `record-acceptance`。四個 required*acceptance 中兩項（`configured_mail_provider`、
`live_candidate_sha`）已有可取回的真實證據；`authorized_test_mailbox` 的信箱／別名資源已由 operator 建立
且已部署，`provider_message_receipts` 的讀回基礎設施也已部署且不依賴 §2.3 的排程缺陷——但這兩項都還差
最後一步：Supervisor／operator 建立 `DRTS_LIVE_MAIL*\*`repo variables 後實際 dispatch 一次`.github/workflows/live-mail-acceptance.yml`，取得真實 pass/fail 輸出。本輪新增的 harness（session 真實
mint、正／負向送信、readback、32 個 unit tests）已可直接使用，不需要再等下一輪重新設計。本輪也補上了
`SR-MAIL-SCHEDULER-TOKEN-REUSE-20261002`（Supervisor 已登記的現行缺陷）的程式碼層級根因鏈，供該任務的
owner 參考；此缺陷不阻擋本任務的同步送信路徑。

實作＋測試＋本文件 commit 後普通 push；candidate handoff 見下方 `CANDIDATE_SHA`／`CANDIDATE_BRANCH`，
交給 reviewer Claude2。獨立 review、同 candidate CI／merge 及完整 required_acceptance（含 `authorized_test_mailbox`
的 repo variables 建立、`provider_message_receipts` 的實際 hosted run 通過）到位後才可結案；IMAP 真內容讀取與
approval 流程留待下一輪（§3 已列出具體端點與建議）。
