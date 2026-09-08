# SR-QA-WEBHOOK-001 — 驗收進度（未完成）

本文件取代先前將 local fixture smoke、連線中斷及單實例去重描述為完整驗收的聲明。Owner Codex；Reviewer Gemini（本次 dispatch）。未 handoff、未完成 review/CI/merge。

## 2026-09-08 17:13 UTC C111 HTTP lifecycle 續驗（最新）

- base `d44bd28142f238ef9d40507685a9423ef5c814f7`；最後執行 SHA `5ff69a26c`，尚非 lifecycle candidate。按指示 rebase 重播歷史 a119ec0bb 再遇四檔 add/add 衝突，已 abort，以 merge 納入 dev 保留已發布歷史；兩個測試 anchor 均已普通 push。
- 真 Nest HTTP issue/rotate/revoke 各返回 201；PostgreSQL 回讀原 key 的 supersededByApiKeyId 指向新 key，新 key 最終 revoked，該 tenant 共三筆 record 且不含兩次回傳的明文密鑰；HTTP GET 再確認撤銷 key 可見及明文遮罩。匿名401、缺scope403、缺proof403後 DB 不變的既有案例保留。
- 限制：JWT由產品 service 本機簽發，預設 AMR 是 `tenant_bootstrap_fixture`，proof 由真 StepUpProofService 對 verified durable session 建立。這是本機管理 API regression，**不是實際登入／MFA 驗收**；未用此測試取代部署認證。未修改產品、共用設定或 UI。
- 獨立命令 `DRTS_WEBHOOK_AUTH_EVIDENCE=tests/e2e/system-remediation/sr-qa-webhook-001/evidence-auth-http.json bash tests/unit/system-remediation/sr-qa-webhook-001/run-auth-http.sh` → exit 0，1 passed / 3.56s（首次執行時程式尚為 dirty diff，故以後述 anchor 整合重驗為正式證據）。
- 整合首輪 exit 1：wrapper 仍讀舊 databaseUnchanged 欄位；已改讀 rejectedWritesDatabaseUnchanged 並核對 persistedRevoked 及三次 201。最後 `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 0，5 passed / 1.5m，含25 local、3 PostgreSQL與1 auth HTTP，另4 shared harness。
- 最後 HTTP key `api_key_39017ce1-e5df-476c-9f03-6550e58f4cf9`，輪替 key `api_key_baba7510-f995-4362-a9e1-175cbabe41e7`；完整 SHA、tenant/session/DB ID與stdout見同 task evidence-auth-http.json、evidence-postgres.json、evidence-sr-qa-webhook-001.json。結束後查 pg_database 本 task prefix 計數 0。
- `DRTS_WEBHOOK_LIVE=1 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 1，1 failed / 4 passed / 1.5s；缺部署認證及外部證據明確失敗。`pnpm exec eslint tests/unit/system-remediation/sr-qa-webhook-001/auth-http.test.ts tests/e2e/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.spec.ts --max-warnings=0`、`bash -n tests/unit/system-remediation/sr-qa-webhook-001/run-auth-http.sh`、`git diff --check` → exit 0。
- 維持 in_progress，不 handoff。仍需完整 AppModule middleware 跨租戶負向、tenant key消費／使用量、真登入MFA；C112 deadline契約、C113 sandbox、C114 provider、C115部署排程／告警回執需 supervisor 協調。未發現新產品缺陷，不在本驗收 scope 改業務碼。

## 2026-09-08 17:00 UTC C111 本機 HTTP 身分驗證續驗（最新）

- base `c171ea5126c1a7c19fa090429b2965bbac106768`；測試入口 anchor `4a6bd78006babeeed6969821688540d79a56b14d`，不是 lifecycle candidate。依指示 rebase 重播歷史 a119ec0bb 時遇四個 task 檔 add/add 衝突，已 abort，再 merge dev 保留已發布歷史；普通 push 成功。
- 新增 `auth-http.test.ts` 與隔離 DB runner `run-auth-http.sh`，並接入指定 Playwright 入口。真 Nest listener 繼承產品 controller routes，使用真 BootstrapAuthGuard、JwtAuthService、StepUpProofService、IdentityRepository、TenantPartnerRepository。JWT 經產品服務簽發且 session 寫入 PostgreSQL；未覆寫 guard 或偽造 JWT。
- key 先由產品 service 寫入，再以 HTTP bearer GET 回讀該 ID，確認不含 plaintext/hash；匿名 GET 為 401，read-only bearer POST 為 `AUTH_SCOPE_DENIED` 403，write-scope bearer 缺 proof POST 為 `STEP_UP_REQUIRED` 403；兩次拒絕後比對該 tenant 的完整 DB key records 不變。
- 獨立命令 `DRTS_WEBHOOK_AUTH_EVIDENCE=tests/e2e/system-remediation/sr-qa-webhook-001/evidence-auth-http.json bash tests/unit/system-remediation/sr-qa-webhook-001/run-auth-http.sh` → exit 0，1 passed / 4.36s，執行 SHA `6f6c9b3c1cd202f74ee93d7103646a69a570e8e1`。key `api_key_a0ca8efd-378b-4599-aefc-153d5fb8688e`；read session `sid_e5aee1b0258e423d9eea228b3ed19310`；write session `sid_ec195199378a4bebb8e525e8189197d4`。整合入口會用最新執行資源覆寫 JSON，歷史資源保留在本段。
- 初次 runner exit 1（root 無 reflect-metadata 依賴），第二次 exit 1（Nest 繼承 constructor metadata）；均屬測試組裝問題，已改從 API package 解析依賴並明確定義測試 subclass 的空 constructor metadata。未改產品或共用設定。這四次獨立執行建立的隔離 DB，結束後 `pg_database` 回讀同名計數為 0。
- 更正前節證據解讀：既有 credential lifecycle suite 使用 durable **記憶體 double**，不是 PostgreSQL 持久化證據；既有 JWT suite 才使用真 DB。此次新增案例才補上 HTTP read/auth rejection + DB 回讀。
- 整合入口首輪（`4a6bd7800`）exit 1：key 非同步持久化尚未完成即回讀，得到空陣列；改用 `expect.poll` 等待實際 key ID 寫入。該輪同時執行 live 命令，Playwright 共用 test-results 另有 trace ENOENT，故最後整合重跑獨立執行。
- 最後執行 SHA `1e09eb890`：`pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 0，5 passed / 1.6m，含 25 local、3 PostgreSQL（含 SIGKILL／新程序恢復）、1 auth HTTP 及 4 shared harness 案例。完整 SHA、真資源、指令 stdout 見同 task `evidence-auth-http.json`、`evidence-postgres.json`、`evidence-sr-qa-webhook-001.json`；最後回讀 `pg_database` 本 task prefix 計數 0。
- `DRTS_WEBHOOK_LIVE=1 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001`（`4a6bd7800`）→ exit 1，1 failed / 4 passed / 1.2s：缺部署認證與外部證據而 fail closed，保留 `evidence-live-unavailable.json`。`pnpm exec eslint tests/unit/system-remediation/sr-qa-webhook-001/auth-http.test.ts tests/e2e/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.spec.ts --max-warnings=0`、`bash -n tests/unit/system-remediation/sr-qa-webhook-001/run-auth-http.sh`、`git diff --check` → exit 0。
- 本機測試使用窄範圍 controller module，不含完整 AppModule middleware；成功 HTTP issue/rotate/revoke、跨租戶 middleware、tenant key 消費與使用量、部署登入/MFA 均尚未驗。C112 預設 deadline、C113 sandbox、C114 provider、C115 部署排程／告警證據仍缺。維持 in_progress，不 handoff；請 supervisor 協調外部驗收證據。

## 2026-09-08 16:50 UTC C111 身分驗證前置回歸（歷史）

- base `890548b4f357542968c8b14f33f23e0685be007a`；執行 SHA `9cf47045c75f0bc657fd52ae91e137246f979db6`，尚非 lifecycle candidate。fetch 後確認 base 已是 HEAD 祖先（`git merge-base --is-ancestor origin/dev HEAD` exit 0）。一般 rebase 重播舊提交遇到 add/add 衝突，已 abort，原已發布歷史保留。
- 追溯 C111 `source/capabilities.json`：管理 API 為 `tenant/api-keys`；`auth.policy.ts` 要求 GET `tenant:read`、寫入 `tenant:write`；`step-up.policy.ts` 的 issue/rotate/revoke 要求 tenant/platform 的 15 分鐘 freshness。這是程式追查，不能當作 HTTP 權限驗收。
- `pnpm --filter @drts/api exec vitest run tests/integration/jwt-session-claims.integration.test.ts tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts` → exit 1，9 passed / 5 failed；5 個失敗皆因未配置 `DATABASE_URL`，不是已重現產品缺陷。
- 新增可重跑入口：`bash tests/unit/system-remediation/sr-qa-webhook-001/run-auth-prerequisites.sh` → exit 0，2 files / 14 tests passed，Vitest 5.91s。沿用 schema-only 本機隔離 DB，未修改來源 DB。資料庫資源 ID `sr_qa_webhook_001_1788886189_3389223`；結束後查 `pg_database` 同名計數為 0，確認清理。
- 此入口實際執行既有 durable JWT session 的發行／驗證、過期版本／principal suspension／membership 變更失效、簽章演算法負向案例，以及 tenant credential controller lifecycle 回歸。測試沒有經過 HTTP listener；不宣稱 C111 authenticated 管理 API、tenant key 消費與使用量已通過。個別 session/key ID 未另存證據包，此次只記錄隔離 DB ID。
- `bash -n tests/unit/system-remediation/sr-qa-webhook-001/run-auth-prerequisites.sh`、`git diff --check` → exit 0。runner anchor 已普通 push；本輪未改產品碼或 UI。

下一步以 durable session 加 step-up proof 建立 authenticated 管理 API 的正向與權限負向測試；tenant key 消費路由／使用量仍需確認。C112 default deadline、C113 sandbox、C114 provider、C115 部署排程告警證據仍未完備，維持 in_progress，不 handoff。

## 2026-09-08 16:45 UTC 預設 transport 停滯觀察（歷史）

本節優先於歷史紀錄。base `890548b4f357542968c8b14f33f23e0685be007a`；執行 anchor `b52204d602e91056a381d86f160b991b1ec1f113`，非 lifecycle candidate。一般 rebase 重播 a119ec0bb 再次遇到四個 task 檔 add/add 衝突，已 abort；以 merge 納入 dev 保留發布歷史，普通 push 成功，未覆蓋新版產品碼。

- 新增 C112-default-transport：真 `WebhookDispatchService()`，沒有注入 fetch、AbortSignal 或 fake timer。接收器收到 HTTP 後保持連線，實測 1000ms 仍未完成；接收器關閉 TCP 後，服務返回 httpStatus null，按 webhook ID 回讀唯一 delivery 為 queued、attempt 1 且有 nextAttemptAt。這是停滯／斷線恢復觀察，**不是預設 deadline 通過，也不能由一秒觀察推論永遠不會逾時**。
- 真實 webhook `wh_1bd62d95-5b69-4c16-adf1-4eff78ef4635`、delivery `wd_78431702-9409-4467-b904-7c239fb93177`。完整 stdout、base/執行 SHA、DB 與 OS process 資源保存於同 task `evidence-sr-qa-webhook-001.json` / `evidence-postgres.json`。recorder 的 candidateSha 欄是執行 HEAD，尚未 handoff 鎖定。
- `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 0，5 passed / 1.3m；含 25 local、3 PostgreSQL（含 SIGKILL／新程序恢復），其餘 4 個是 shared harness。
- `DRTS_WEBHOOK_LIVE=1 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 1，1 failed / 4 passed / 1.4s；缺 live 證據明確失敗，另存 `evidence-live-unavailable.json`。
- `pnpm exec eslint tests/unit/system-remediation/sr-qa-webhook-001/*.ts tests/e2e/system-remediation/sr-qa-webhook-001/*.ts --max-warnings=0` → exit 0；`git diff --check` → exit 0。

仍 in_progress，未 handoff。C111 authenticated 管理 API 權限／tenant key 使用量尚待驗；讀碼發現 partner ingress 更新的是 partner credential 使用時間，不能作為 tenant key 證據。請 supervisor 協調 tenant key 消費路由／測試身份、C112 deadline 契約、C113 sandbox、C114 真 provider 與 C115 部署排程／告警回執。本輪沒有認定新產品缺陷，未修改產品或 UI。

## 2026-09-08 16:38 UTC replay 接收器負向續驗（歷史）

本節優先於歷史紀錄。已納入 base `8de85170b07ab7eb3d773e0845abebf12babc7e0`；執行 anchor `3e4d30f4c98b3d7b7ac06a27a27cf1d646b8c0e7`，非 lifecycle candidate。按指示 rebase 再次於歷史提交 a119ec0bb 出現 task 檔 add/add 衝突，已 abort 並 merge dev，保留已發布歷史且普通 push 成功。

- 修正測試接收器漏判 `sig.valid` 與無效 timestamp 的缺陷。真服務送出第一筆 HTTP/HMAC 後，以實際 bytes 測六種負向：body 追加空白、錯誤／缺少 signature（401），有效 HMAC 但過期／未來／無效 timestamp（400），最後原始 request 重送（409）。驗證拒絕前後 dedup set 不變，並由 service 按 webhook ID 回讀原 delivery 仍 delivered。共 8 次真 HTTP；300 秒 freshness 是測試接收器政策，不宣稱部署接收器已採用。
- 原 24 個案例數不變，C112-6 擴充六個負向子案例；stdout 的 `SR-QA-WEBHOOK-001 replay resources` 保存實際 webhook/delivery ID、負向結果及政策，收錄於 `evidence-sr-qa-webhook-001.json`。這是測試缺陷修正，未發現或修改產品缺陷，未改 UI。
- `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 0，5 passed / 1.4m，含 24 local、3 PostgreSQL（含 SIGKILL／新 OS process 恢復）及 4 shared harness 案例。
- `DRTS_WEBHOOK_LIVE=1 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-webhook-001` → exit 1，1 failed / 4 passed / 1.6s；缺部署認證與外部證據時失敗，另存 live unavailable artifact。
- `pnpm exec eslint tests/unit/system-remediation/sr-qa-webhook-001/*.ts tests/e2e/system-remediation/sr-qa-webhook-001/*.ts --max-warnings=0` → exit 0；`git diff --check` → exit 0。
- PostgreSQL key `api_key_6bd259cd-b790-452c-8328-b48393b3b2e1`；恢復 delivery `wd_6dd4ea7a-34b2-4b3b-a2dc-f49779cffe3b`。其租戶／webhook 關聯及其他資源見 `evidence-postgres.json`。

仍 in_progress，未 handoff。C112 受控接收器 replay 負向已補驗；產品預設 dispatch 沒有傳 AbortSignal，權威 governance runbook 定義 retry 但未定義 deadline，仍需確認契約並驗證，不能以注入 100ms deadline 宣稱預設行為完成。C111 authenticated API 最小權限／使用量仍待驗；C113 ERP/SSO/bank sandbox、C114 真 provider、C115 部署排程與告警回執需 supervisor 協調外部證據。

## 2026-09-08 16:32 UTC 跨租戶負向續驗（歷史）

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
