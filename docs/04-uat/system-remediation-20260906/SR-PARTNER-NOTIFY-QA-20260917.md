# SR-PARTNER-NOTIFY-QA-20260917

Owner: Codex（2026-09-27 Supervisor 直接交接）；Reviewer: Codex2。
狀態：修復中，尚無新的 review candidate。交接 checkpoint 為
`91b1d4ac122b1373ac7beb05df902cb991b62232`，沿用既有實作與發布歷史。

## 證據規則與撤回

撤回舊版「Python workflow tests = 280 product tests」、「A 層 Verified」、
「C201–C205 已驗證 worker/fence/browser」及無限制的宣稱。
Python gate 測試僅驗證報告判斷，不是產品、PG、browser 或真夥伴驗收。
200/201/202 必須有符合契約的 durable accepted/duplicate receipt；204、HTML200
及不相符 ack 是 `partner_ack_invalid/manual_only`，不是 delivered 或自動 retry。

## §0.7 Finding／驗收逐項紀錄

下列 old → reviewed 指 `5d51260870da20d32740c761f205b404e56b81ca` →
`62962c9eb4bc10652c9e8314cc145064fa3c56ff`，來源是 Codex2 獨立 REOPEN，
generation `b9173b42140b469086c0900ce544229b`。checkpoint 不是第三輪通過。

| Finding／驗收項                                              | 原始碼依據與修改位置                                                                                                                                                                    | 舊版重現 → 修正版結果                                                                                                                                    | 命令、退出碼、執行版本與證據位置                                                                                                                                               | 未驗項與具體限制                                                                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-R1：無效整合 fixture、負向斷言不敏感、缺 SD14             | `partner-notification-uat.spec.ts` C201–C204；`TenantPartnerService.createPlatformPartnerEntry`、webhook/binding governance；V0104 route CHECK；`PartnerNotificationWorker.dispatchDue` | old/reviewed 均未修。checkpoint C201=500（預期201），C202/C204 缺 webhook，C203 generic failed 通過不代表 route refusal                                  | Reviewer Node22.23.2 stripTypeScriptTypes/vm probe exit0：僅 API/PG/receiver 邊界替代，零 receiver request + generic failed 仍讓 C202–C204 通過；checkpoint hosted failure見下 | 待權威 identity/order/route、HMAC durable receiver、完整 SD14；未稱整合通過                                                                  |
| QA-R2：缺 case/SHA/webhook 仍過 gate                         | workflow `PY_GATE`、`tools/ci/test_tenant_uat_acceptance_workflow.py`                                                                                                                   | old/reviewed：單一 unnamed partner、wrong SHA、兩個 partner 代 webhook、只有C201仍 exit0；reviewed 已拒絕 missing/empty partner、missing webhook，須保留 | Reviewer python3 -B actual-gate probe exit0；55 synthetic tests pass 不等於產品280 pass                                                                                        | 本輪先修獨立 case identity、三個 PG suite、逐 assertion、報告 SHA，再跑真 gate mutation                                                      |
| QA-R3：證據不實、B/C 消失                                    | 本文件及 `04_sources.md`                                                                                                                                                                | old/reviewed 同缺陷；本輪撤回未支持結論並恢復 A/B/C 與 live gates                                                                                        | 文件對照正式 SA/SD §14、integration contract §5/§9；屬內容核對，不適用 runtime pass                                                                                            | A仍未達；不得將歷史 unit/PG pass帶到新SHA                                                                                                    |
| QA-R4：PR publication identity                               | PR #2175 head vs candidate                                                                                                                                                              | reviewed identity 修正；2026-09-27 PR head=checkpoint，但PR分支仍 Gemini，Codex分支尚未新 candidate                                                      | `gh pr view 2175 --json headRefOid,headRefName,state` exit0：OPEN、head=91b1d4ac                                                                                               | 新候選需同時確認 local/remote/PR head；Supervisor 修正 dispatch routing                                                                      |
| QA-R5：NAV/admin runtime 缺失                                | C205；`app/partners/[entrySlug]/page.tsx`；`PartnerNotificationPanel.handleRetry`；notification-navigation resolve、embed session                                                       | old/reviewed 仍錯 route/auth 且只看 heading；checkpoint C205 因 Chromium缺失未執行                                                                       | checkpoint hosted browserType.launch failure；無 screenshot/trace支持控制項成功                                                                                                | 待真auth、retry request/readback、readiness/stage/failure、fresh single-use HttpOnly session、returnTo/logout/account switch/錯entry-subject |
| QA-R6：同 SHA PG 漏跑（历史）                                | workflow 三個 `PARTNER_NOTIFY_*_TEST_DATABASE_URL`；sequence/transport/UI PostgreSQL suites                                                                                             | old 5d512608 的 PG21/21、total280/280 為真實歷史；reviewed build失敗後全部skip；checkpoint再有PG21/21與280/280                                           | checkpoint artifact unit JSON：三個PG suite各7 passed，零skip；見下 run/artifact/hash                                                                                          | 僅該checkpoint證據；本輪新SHA須重跑，不能用Python gate pass替代                                                                              |
| QA-R7：production SSRF bypass                                | `partner-notification-https.ts`                                                                                                                                                         | old 非空flag可繞過；reviewed production + unset/false/true 拒HTTP loopback/DNS metadata，localized probe已修                                             | Reviewer native TS+vm只替代HTTP/DNS邊界，未開socket/server                                                                                                                     | 產品檔仍超出task scope；不宣稱所有security情境已驗                                                                                           |
| QA-R8：commit trailers/lint/whitespace                       | published history；spec unused imports/argument；`ci.yml`                                                                                                                               | reviewed CI失敗：9 commits subject/trailers不合、4 lint errors；checkpoint新增提交仍未補歷史trailers                                                     | CI run36331866556/job108655221337（trailers）及job108655274147（smoke）；reviewer diff --check exit2                                                                           | Supervisor 協調正常publication/history recovery，禁止force/rebase/amend已發布歷史；本輪只修scope內lint                                       |
| QA-R9：build與job-wide security bypass                       | transport request callback型別；workflow job env；既有https-client.test.ts                                                                                                              | reviewed TS7006四處，unit全skip；checkpoint build通過，但另改scope外security tests強制env=false，job-wide bypass仍在                                     | run36331863431 build tsc exit2；checkpoint run36333604497 build success                                                                                                        | 本輪移除job-wide bypass；繼承的產品與外部test改動需Supervisor確認scope/修復owner，不自行改產品                                               |
| integrated_controlled_receiver_negative_matrix_same_sha      | R1/R2/R6/R7/R9；SD14                                                                                                                                                                    | **NOT MET**                                                                                                                                              | 目前沒有完整同SHA受控receiver矩陣成功證據                                                                                                                                      | 需要hosted真worker/PG/receiver與fault matrix                                                                                                 |
| navigation_and_admin_ui_hosted_real_runtime_evidence         | R5；NAV/UI dependencies                                                                                                                                                                 | **NOT MET**                                                                                                                                              | checkpoint browser未啟動；無NAV runtime證據                                                                                                                                    | 需要hosted真UI controls/auth/navigation，不能推給native live gate                                                                            |
| existing_webhook_tenant_gates_preserved_and_live_not_claimed | R2/R3/R9；tenant/restart/C111–C115                                                                                                                                                      | **NOT MET**                                                                                                                                              | checkpoint tenant HTTP10/10、webhook單案pass，但C113–C115/restart跳過                                                                                                          | 獨立既有gates全保留；B/C仍SR-LIVE-PUSH-001外部gate                                                                                           |

## 連續兩輪退修：最小重現與修正邊界

R1/R2/R3/R5 在相鄰獨立候選 5d512608 → 62962c9e 重複。先完成一個可驗證單元，
保留本表所有缺陷，不原封重送。實際呼叫與定位：

- R1 setup：controller `createPlatformPartnerEntry` 原樣轉body，header不補tenantId；
  必填 tenantId/partnerCode/programId/partnerType/displayName。webhook需secret/events；
  binding需PUT→test→enable（POST預設201），不能靠enable內額外webhookId建立。
  V0104 `notification_policy_version=partner_notification_v1`、ride_ref全域唯一；route需可信order/link。
  receiver缺契約ack/HMAC/durable inbox；3000ms延遲小於正式10000ms timeout。
  修正先建立兩tenant/兩entry權威fixture、合法accepted/duplicate receipt、真worker正向及typed no-send；
  再驗完整 worker→service→claim/fence→transport/ack→receipt/outcome transaction。
- R2：舊PY_GATE只看basename、aggregate280與至少1 partner case；webhook混入partner可補總數。
  修正必須獨立要求具名case、每個實際passed assertion、三個PG suite及各report candidate；
  測錯SHA、missing-case、no-webhook，保留tenant/restart/C111–C115與既有拒絕controls。
- R3：HTTP204不成功、invalid ack不可retry；文件A Verified與280證據錯誤。
  修正只用具SHA/run/job/artifact/hash及mock邊界的pass/fail/skipped/not_run分列，恢復B/C。
- R5：localStorage `drts_platform_auth_token` 沒有product reader；真route為 `/partners/[entrySlug]`，
  authority走server-platform-admin-authority/control-plane-proxy。須按真control與API驗retry/readback，
  NAV須resolve→fresh handoff→HttpOnly session→受權限ride及錯entry/subject/logout拒絕。

## 已讀完的 hosted 證據（各自 SHA，不作本輪新候選證據）

1. reviewed `62962c9eb4bc10652c9e8314cc145064fa3c56ff`：
   [run36331863431](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36331863431) /
   [job108655212817](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36331863431/job/108655212817)，
   artifact10936380053，ZIP SHA256 `f75fd3af29a3803ae1c167f8906cfdb1d893f063fd0b9fccf94d55db084c6c84`。
   install/migrations pass；API build fail；runtime全部skip；run-status=not_run；gate fail。
   artifact只有execution-log（1347行）與run-status。由Codex2下載讀完。
2. checkpoint `91b1d4ac122b1373ac7beb05df902cb991b62232`：
   [run36333604497](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36333604497) /
   [job108660116702](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36333604497/job/108660116702)，
   artifact10936532926，ZIP SHA256 `4307d12373836309d2e565e00de208ab1c912d104efdf8f597914da14381f0e8`。
   `gh api .../actions/artifacts/10936532926/zip`、JSON讀取均exit0。
   API/UI build、tenant+partner units280/280（含三PG suites21/21）、webhook units34/34、
   tenant HTTP10/10及C111/C112單案passed；partner C201/C202/C204 failed、C203 passed但斷言不足、
   C205 browser未啟動。獨立partner steps、C113–C115及restart skipped；gate failed；run-status=failed。
   本機只下載讀取，未開任何產品/API/browser/receiver/DB server；原始證據存 `.local/sr-partner-notify-qa-20260927/`。

## 分層外部 gates

A：完整同SHA內部受控環境通過才可標 `controlled_receiver_verified`，目前 **NOT MET**。
B：`SR-LIVE-PUSH-001` 真夥伴 HTTPS endpoint、遮罩request/response、receipt與durable outbox，
才可標 `partner_endpoint_verified`，目前 **未執行**。
C：第一家真夥伴native App背景/冷啟動收到通知、點擊fresh handoff到正確ride；支援雙平台時
需iOS及Android，並記錄關閉通知/session過期/帳戶切換限制，目前 **未執行**。
受控receiver、browser與既有webhook CI都不能關閉B/C；本任務不宣稱真夥伴或裝置已達標。

## Codex 修復單元 1（2026-09-27，checkpoint，不是 handoff）

- R2：`PY_GATE` 現在逐 case 比對 `required-cases.json`。明列tenant unit284、
  webhook unit34、QA security5、tenant E2E10、webhook E2E1與partner C201–C224。
  既有三PG suites各7 case獨立要求。缺suite/具名case、空case、skip/fail/flaky、
  aggregate和assertion不一致、錯SHA/metadata、缺execution均拒絕。
  **C206–C224是正式需求對應的必需案例身份，目前尚未實作，清单不是通過證據。**
  C201–C205現有實作仍有R1/R5問題，gate修復不取代斷言品質修復。
- `run-reported.py` 在每個hosted命令前刪除舊report，核對git HEAD=CANDIDATE_SHA，
  只替本次新report記execution SHA及exit code；保留command失敗、拒metadata衝突。
  Playwright明確使用list/json reporter，tenant/webhook/partner報告獨立，保留tenant備份。
- R9 workflow部分：移除job-wide `DRTS_ALLOW_LOCAL_WEBHOOKS`；只在hosted API
  start/restart的env設true供受控receiver。新QA測試直接驗production unset/false/true、
  test unset/false的拒絕與public HTTPS正向，取代無行為的`expect(true)` marker。
  socket/DNS是唯一mock邊界；不等於hosted receiver或全面SSRF驗收。
- R5 harness部分：加入Chromium安裝、兩個UI的HTTP readiness、保留failure trace及
  admin/referral log；記錄UI build/start/browser setup outcomes；尚未修C205真auth/control/NAV。

本機完成檢查：

| 檢查                                                                                                        | 結果與邊界                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `python3 -B -m unittest tools.ci.test_tenant_uat_acceptance_workflow`                                       | exit0，64 tests；含實際PY_GATE/PY_STATUS、報告runner的failure/identity/stale-report行為；只有synthetic report，非product acceptance                                                                                                                |
| `python3 -B tests/unit/system-remediation/sr-partner-notify-qa-20260917/probe-gate-regression.py <old-sha>` | 分別指定5d512608與62962c9e，均exit0。兩版完整synthetic positive control皆0；單一unnamed、wrong candidate SHA、wrong metadata SHA、partner代webhook、C201 alone、缺UI-PG但aggregate綠六種輸入：舊0→新1。只替report/environment，actual gate原樣執行 |
| `pnpm exec tsc -p apps/api/tsconfig.json --noEmit`                                                          | exit0；repository編譯檢查，未啟API                                                                                                                                                                                                                 |
| QA檔scoped ESLint與`git diff --check`                                                                       | exit0                                                                                                                                                                                                                                              |

可重跑probe已提交；原始JSON/log在 `.local/sr-partner-notify-qa-20260927/`。
本輪未啟hosted run；舊checkpoint run已讀完。R1/R5及產品scope/history問題仍開放，
三項required_acceptance仍NOT MET，沒有送出新review candidate。

### 單元 1 補充驗證與下一修復邊界

- Node `v22.23.2`、Python `3.12.3`、Vitest `4.1.4`。
- `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-qa-20260917/
tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts
tests/unit/system-remediation/sr-partner-notify-transport-20260918/https-client.test.ts`
  （default + JSON reporter）：exit0，3 files / **42 passed**（QA5 + https21 + client16），
  零skip。JSON：`.local/sr-partner-notify-qa-20260927/security-unit.json`。
  只驗transport安全邊界，不是worker/receiver/PG/browser；既有兩https檔沿用交接版本，
  不把它們稱為「未經前owner修改」的原始回歸。
- R8 scope內lint：移除spec未使用UatEvidenceRecorder/BASELINE_PERSONAS/BASE_SHA與C203的request；
  格式化清除scope內trailing whitespace。沒有用此變更宣称R1/R5 runtime已修。

Supervisor 待協調的確切邊界（已用canonical progress回報）：

1. 繼承已發布的transport產品修改與兩個既有security tests不在write_scopes：
   `apps/api/src/modules/tenant-partner/partner-notification-https.ts`、
   `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https-client.test.ts`、
   `tests/unit/system-remediation/sr-partner-notify-transport-20260918/https.test.ts`。
   相關checkpoint提交5377a253b/5dfd0c41d/26e246a61。需確認原授權owner/scope或指定
   修復child，不能讓QA owner默認吞下超scope產品變更；Codex本輪未改這三檔。
2. 已發布歷史中不合規subject/trailers無法靠新增commit補到舊commit。
   需Supervisor走repository既有publication/history recovery；禁止改寫、amend、rebase或force push。
3. R1下一單元先做權威兩tenant/兩entry/order/link fixture、HMAC durable inbox與
   accepted/duplicate receipt、真worker正向與typed no-send。須使用完整entry/webhook/binding
   契約及正式migration，不能用目前無效route資料或寬鬆failed斷言續送review。
   之後才補C206–C224與R5真auth/control/NAV；case manifest已fail closed保留此要求。

### Publication 檢查（單元1末）

`python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`
exit1，**17個繼承的已發布commit**不合規（包含checkpoint的8個新提交）；
精確錯誤存 `.local/sr-partner-notify-qa-20260927/commit-trailers.log`。
`--base 91b1d4ac122b1373ac7beb05df902cb991b62232 --head HEAD` exit0，
本輪Codex提交符合trailers，沒有改寫任何已發布歷史。

首次雙spec scoped lint另發現C205未使用adminToken（exit1）；移除後同一條
`pnpm exec eslint <partner-notification-uat.spec.ts> <partner-notify.test.ts> --max-warnings=0`
exit0。`git diff --check`及與base931eabb0的diff --check均exit0。
R8的scope內lint/whitespace修正已驗，歷史packaging blocker仍未解。

## 單元1 PR 與 CI 結果（已讀完）

草稿 [PR #2179](https://github.com/ajoe734/drts-fleet-platform/pull/2179)，
已檢查local/remote/PR head均為 `5db78fdc185c6a7be6a110a691df3ff99d00e307`。
這是checkpoint，**未handoff**；reviewer仍Codex2。原PR #2175保留發布歷史。

- [CI run36335019850](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36335019850)：
  completed **failure**。
  [Commit trailers job108664105157](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36335019850/job/108664105157)
  再次確認17個繼承commit不合規。
  [Product smoke job108664156556](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36335019850/job/108664156556)
  根test lint通過後，API lint在
  `apps/api/src/modules/tenant-partner/partner-notification-https.ts:63:58`
  失敗：`@typescript-eslint/no-require-imports`（動態`require("node:http")`）。
  它是繼承的scope外產品碼，證實R9尚需經授權修復，不能以API typecheck pass當整體CI pass。
  正常修復邊界為typed Node HTTP import/request選擇與原安全拒絕回歸；不得降低lint規則。
- [Integration run36335019853](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36335019853)：
  completed **success**，但draft PR的build/unit/typecheck/lint/integration/UI主要工作均
  **skipped**。此綠燈不代表product/regression或任何required_acceptance通過。
- `gh run view ... --json status,conclusion,jobs` 與 `--log-failed` 已讀至完成，exit0。
  原始失敗log：`.local/sr-partner-notify-qa-20260927/checkpoint-ci-failed.log`。
  本輪未dispatch新的tenant UAT、未執行本機runtime、沒有仍在背景執行的本機測試。

上述CI以5db78fdc的程式為準；本節追加屬文件checkpoint，不能把它冒稱同一candidate。
任務仍未達三項驗收。先由Supervisor協調R9產品scope及R8已發布history recovery，
並確認下個R1 fixture/receiver小單元，再續做完整SD14/NAV；不要再次原封handoff。

## Codex 修復單元 2（2026-09-27，checkpoint，未 handoff）

本單元由 clean/published `a24a4ca7b8fd424134f43f7820fe329ab79945c1` 續做。
NAV/UI/LEGACY/PG 四個 dependency 的 machine status 均為 done，且其 merge
c2d94aaa／931eabb0／d6177129／318b44b6 均為本分支 ancestor；未改寫任何發布歷史。
以下是進度，**不是全部 finding 消除，也不是 A 層或 live 驗收通過**。

| Finding／驗收項                       | 原始碼依據與本輪修改                                                                                                                                                                                                                          | 舊版 → 本輪結果                                                                                                                                                                                                                                                                                   | 檢查／證據                                                                                                                | 未驗與修復邊界                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 receiver 泛用 JSON／無 durable ack | `controlled-receiver.ts`、`controlled-receiver.test.ts`；正式 `WebhookDispatchService.dispatchAttempt`                                                                                                                                        | a24a4ca7 的 `{ok:true,received:true}` 經正式 parser 判 invalid；新 receiver 經正式 signing/serialization/parser 得 accepted，重開後 duplicate 回同 receipt                                                                                                                                        | 本機 7/7；只替 HTTP IO，真的寫檔/fsync/rename；含併發去重、hash conflict409、簽章/tenant/entry/recipient 拒絕、storage503 | filesystem inbox 是外部夥伴邊界 fixture，dedupe + pending native delivery 同一原子文件；沒有原生推播／真夥伴 claim                                                                                                |
| R1 權威 fixture／typed outcome        | `partner-fixture.ts`、`enqueue-notification.ts`、spec C201–C204/C206/C207；`createPlatformPartnerEntry`、`sendTestWebhook`、binding PUT/test/enable、ingress handoff、`MultiTaxiService.createRide`、`OwnedMobilityRepository.persistChanges` | 移除手造 route/identity/sequence SQL；兩 tenant、同 tenant 兩 entry、共用 URL 各自 secret；真 order/link/route 讀回，synthetic receipt_ready event 由正式 repository transaction 入列；C203 要求 route_missing/manual_only、零 request、claim released；C204 要求 partner_ack_invalid/manual_only | 下列 hosted checkpoints 逐一定位 port、step-up、idempotency setup 問題；後续58081594已得6 pass/1 UI fail，詳下節          | 事件 producer 是明列的 fixture 邊界，不宣稱正式收據生成／全 SD14 已驗；C208–C224 仍未實作                                                                                                                         |
| R5 真 UI 路徑與 retry 控制            | C205 改 `/partners/{entrySlug}` → Notifications → 指定 outbox row 的重送 → 實際 POST → PG/畫面讀回；workflow UI 指向 API4102                                                                                                                  | 撤除不存在的 localStorage bearer reader／錯 route；只用正式 server authority/control-plane proxy 的 hosted test 身分；UI與API各自 SHA header 驗證                                                                                                                                                 | `--list` 7 cases，僅 discovery；沒有把它當 browser pass                                                                   | hosted test-mode control-plane authority 不代表正式 IAP/workforce 驗收；NAV C221–C224 仍缺                                                                                                                        |
| R5 UI 啟動 port                       | workflow `Start the UI applications`；兩個 package `start` 實際固定3002/3014                                                                                                                                                                  | f44a6c7e UI readiness fail → 1ba5364c 明確 `pnpm exec next start --hostname 127.0.0.1 --port 3001/3002` 後 readiness success                                                                                                                                                                      | f44a6c7e admin/referral log + 1ba5364c run-status；curl deadline5s；無 VM server                                          | 只修既有 hosted runner，不修改產品 package scripts                                                                                                                                                                |
| R1 tenant mutation authority          | `step-up.policy.ts:446–471`、controller `sendTestWebhook`                                                                                                                                                                                     | 1ba5364c POST tenant/webhooks403 STEP_UP_REQUIRED → f07af5e0 已越過此步；f07af5e0 POST tenant/webhooks/test400 IDEMPOTENCY_KEY_REQUIRED → 00f0bfbf endpoint-specific key 已補                                                                                                                     | 分別 run36337635742、36338110601；錯誤來自正式 HTTP API，非缺套件／假 mock                                                | 新 helper 向正式 policy 取得每次 authenticated mutation 的 action/session proof，不繞過 gate；00f0bfbf起已越過idempotency gate，詳下節                                                                            |
| R5 新產品定位：已接受文案顯示 raw key | `partner-notification-panel.tsx:847` 的 `t("partnerNotification.accepted_unknown") ?? ...`；`translations.ts` 的 `t` missing-key fallback                                                                                                     | 正式 `t(key,"en")` 與 `t(key,"zh")` 都回 `partnerNotification.accepted_unknown`，不是預期文案；因非 null，component fallback 不執行                                                                                                                                                               | 實際函式 tsx probe exit0，`.local/sr-partner-notify-qa-20260927-unit2/ui-translation-probe.jsonl`                         | **產品檔超 scope**：Supervisor 請安排原 owner 修復 child 或核准 scope：`apps/platform-admin-web/lib/translations.ts`、`apps/platform-admin-web/components/partner-notification-panel.tsx`；保留 C205 正式文案斷言 |
| R2/R3／三項 required_acceptance       | manifest 保留全部 C201–C224，新增 receiver7 到 tenant_unit/partner_unit；原 finding/A/B/C 不刪除                                                                                                                                              | gate64 synthetic pass；manifest 要求 tenant291、partner unit12、partner E2E24，缺 C208–C224 必須拒絕                                                                                                                                                                                              | 本機 Python64、QA12；不把 totals 當 runtime case 完成                                                                     | **三項 required_acceptance 全部 NOT MET**；B/C 繼續 SR-LIVE-PUSH-001，未執行真夥伴／裝置                                                                                                                          |
| R8/R9 繼承產品與 publication          | transport no-require-imports；已發布17 commits 不合規                                                                                                                                                                                         | 每個新 checkpoint 的 CI 仍 fail；本輪新 commits 合規且普通 push，未碰 scope 外三個 transport/security 檔                                                                                                                                                                                          | 下列 CI links；scoped ESLint/tsc/diff exit0 不代替整體 CI                                                                 | 原 Supervisor scope/child 與 preserving-refs history recovery 請求仍未解；禁止 force/rebase/amend                                                                                                                 |

本機 repository checks 全已結束：QA兩檔12 passed（receiver7 + security5）；
`python3 -B -m unittest tools.ci.test_tenant_uat_acceptance_workflow` 64 passed；
scoped `pnpm exec tsc -p .local/sr-partner-notify-qa-20260927-unit2/tsconfig.json --noEmit`
（include本單元所有TS檔及正式imported types）、ESLint、diff --check 均exit0。
`pnpm exec playwright test --config playwright.system-remediation.config.ts ... --list`
只列出7 cases，沒有啟 browser/server。原始 logs/JSON/ZIP 均在上述 `.local/`。

### 單元2 hosted 執行歷史（逐 SHA，不互借通過）

1. `19e099ef1270abd5976d50920bdf118916a0570b`：
   [run36336771098/job108669011601](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36336771098/job/108669011601)，
   **cancelled** during UI build，seed/runtime全skip、run-status=not_run。
   取消原因：讀取 Playwright1.59.1 `ArtifactsRecorder.didCreateRequestContext` 發現手動 API context
   也錄 trace；先以 Node fetch 隔離含憑證 setup，保留真正 browser trace，避免 secret 進附件。
   artifact10936879560，ZIP SHA256 `5b91243ed28f1263e7f360a063e80cb3772fedd90914cdcbeb7a9078063e99b5`；已讀完。
2. `f44a6c7e7e3645e40231bfb53538928c7c5f8ea0`：
   [run36337144950/job108670054090](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36337144950/job/108670054090)，
   **failure**：build/seed/API start成功，unit291/291（PG三suite各7）、webhook unit34/34；
   UI port readiness fail，E2E/restart全skip，run-status=not_run。
   artifact10938330464，ZIP SHA256 `8ccae4ac0830d6477d755042a9343af307caf0282f20d4b8d5180a3a3cd86f66`；已讀完。
3. `1ba5364c84c5b5f2f931012c0bf7d9192f44146d`：
   [run36337635742/job108671433064](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36337635742/job/108671433064)，
   **failure**：UI readiness成功、unit291/291（PG21）、webhook unit34/34、tenant HTTP10/10、
   webhook E2E1/1。Partner beforeAll 在tenant webhook403失敗：C201 failed、其餘6 skipped；
   C113–C115/restart全skip，run-status=failed。
   artifact10938136369，ZIP SHA256 `2fdd4cbe9193340516ce0d5d121201caf0eac3e0c4170eb1d255cd3c9f2b7484`；已讀完。
4. `f07af5e040aa58944107e82095e424d8b8aec49a`：
   [run36338110601/job108672762771](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36338110601/job/108672762771)，
   **failure**：unit291/291、webhook unit34/34、tenant HTTP10/10、webhook E2E1/1；
   Partner beforeAll 在webhook test400失敗：C201 failed、其餘6 skipped；C113–C115/restart全skip。
   artifact10937549138，ZIP SHA256 `7abc0bc3850ea7a1179056c6fa731c8f8847c656b762752280bba3b9d2d69c56`；已讀完。
5. 程式 checkpoint `00f0bfbf82488a8a8ac403a1c8c9a9b690a86f3e`：
   [run36338535726](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36338535726) completed failure；完整結果與後續修復見下節。

一般 CI（各自已讀至 completed failure）：
[36336749335](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36336749335) at19e099ef、
[36337124704](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36337124704) atf44a6c7e、
[36337610037](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36337610037) at1ba5364c、
[36338080721](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36338080721) atf07af5e0。
最後一個的 trailers job108672679129 與 smoke job108672835988
仍為相同17個歷史commits與 `partner-notification-https.ts:63:58` 動態require錯誤。
对应 integration runs36336749351／36337124715／36337610008／36338080697
completed success，但主要build/unit/typecheck/lint/integration均skip，不是驗收。

### 單元2：真 worker 結果與新產品定位

- `00f0bfbf82488a8a8ac403a1c8c9a9b690a86f3e` / run36338535726 已完成 **failure**。
  Partner 0 passed / 4 failed / 3 skipped：第一筆建單 `SERVICE_PRODUCT_INACTIVE`；
  worker 重啟重複建立授權，後續 `MULTI_TAXI_AUTHORIZATION_AMBIGUOUS`，再觸發 step-up429。
  artifact10938236899，ZIP SHA256 `83c7046d26d7dc7831a559e368831c9c19530370c21310f15207379dcabcd90d`。
- `6864d45837751b8ccd358a256062df1588bcb647` 透過正式 `admin/service-products` 與 runtime-policy
  API 啟用 reservation，沿用唯一 effective/approved 營運授權；沒有 SQL 製造治理狀態。
  [run36339238416/job108675939838](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36339238416/job/108675939838)
  completed **failure**，unit291/291（PG21）、webhook unit34/34、tenant HTTP10/10、webhook E2E1/1。
  **C201–C204、C207 共5 passed；C206/C205共2 failed；0 skipped**。
  artifact10938467378，ZIP SHA256 `aea49c39d11f530da5f9d78da869dee58676dbb53373f6bb892882f817f54b2b`。
  C201 是正式 worker/HMAC/receiver/receipt/claim 讀回；C202 真10秒 timeout後由同一 worker 等
  正式 backoff、相同 bytes/delivery/receipt duplicate，只入列一次；C203 typed route_missing
  零外送、manual_only；C204 204 invalid ack/manual_only；C207 跨 tenant 同URL隔離。
  不把5個案例稱為完整24-case matrix。
- C206 的共享 fixture 干擾：C204 永久 ack failure 沿
  `TenantPartnerService.applyWebhookPostDispatchPolicy` 停用 endpoint；後續正向需正式重測。
  `580815945070942923d5c5740a5ae807a0d4e769` 新增 `revalidateEndpoint`：讀 endpoint →
  signed `tenant/webhooks/test` → active readback；C204 重測後仍驗原 outbox 不會自動重送。
  C205 重送前同樣重測，保留原 binding/context/receipt，不改 DB status/lease/fence。

R5 新 finding（原 finding 歷史保留，均為 **scope 外產品修復**）：

1. **PG 日期 DTO 導致管理 UI 崩潰。** 6864d458 的 browser trace 中 binding/deliveries 都HTTP200；
   deliveries 的 `created_at`、`expires_at`、`next_attempt_at` 實為 `{}`，接著 React error #31，
   最後畫面 `This page couldn’t load`。原始碼：
   `MultiTaxiRepository.listPartnerNotificationDeliveries` 回傳 raw PG `result.rows`；
   `deepToSnakeCase` 對 Date 遍歷空 entries；panel 把 `r.createdAt` 直接當 React child。
   最小 probe：`./apps/api/node_modules/.bin/tsx .local/sr-partner-notify-qa-20260927-unit2/probe-ui-date.ts`
   exit0，實際 serializer 回 `{created_at:{}}`，實際 React `renderToStaticMarkup` 拒絕 object child；
   只跑純函式，未啟 server。fixture 的 wire/body 不攔截、不改寫日期來掩蓋產品錯誤。
   優先修復邊界：`apps/api/src/modules/multi-taxi/multi-taxi.repository.ts` 的 delivery DTO
   明確轉 ISO/string/number；若選擇改通用 serializer，必須另核准
   `apps/api/src/common/snake-case.interceptor.ts` 與跨 endpoint 回歸範圍。
2. **管理 UI 的 tenant webhook picker 缺 tenant authority。** 同 trace 的
   `/control-plane-proxy/tenant/webhooks` 回400 `TENANT_ID_REQUIRED`。panel傳 `x-tenant-id`，
   proxy 的 `CONTROL_PLANE_REQUEST_HEADER_BLOCKLIST` 刪除該header；這不是缺資料。
   修復要有 server 驗證的 tenant 選擇/授權路徑，不能為驗收直接解除 auth blocklist。
   Scope 邊界含 platform-admin panel/proxy、control-plane-auth，需Supervisor安排原owner。
3. **accepted_unknown raw translation key** 的正式 `t()` probe 仍成立；目前 browser先被日期
   crash 阻住，因此不宣稱 browser 已到 accepted 文案。原 translation child/scope 請求保留。

Trace：上述 artifact 的 `test-results/partner-notify-artifacts/*d6d16*/trace.zip`。
失敗附件含實際 network response、pageError 與 screenshot；只查閱離線ZIP，沒有 VM browser/server。
最小 probe、提取 frame、run logs 存 `.local/sr-partner-notify-qa-20260927-unit2/`。

一般CI at00f0bfbf（36338512812）、5e03e13c（36338720252）、6864d458（36339240363）
均completed failure並讀完：仍為繼承17 commits格式與 transport `no-require-imports`。
各 integration36338512780／36338720215／36339240278 completed success但主要工作skip；
沒有把這些綠燈當驗收，也未改寫已發布歷史。

### 單元2最後 hosted checkpoint（已結束並讀完）

`580815945070942923d5c5740a5ae807a0d4e769`：
[run36339890321/job108677788797](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36339890321/job/108677788797)，
completed **failure**、run-status=failed；artifact10938113863，ZIP SHA256
`6a58adae4a88c63d3eb777e24fb4949dcc3fef9cbb0d818d400b768aadc069b7`。

- 同SHA partner **6 passed / 1 failed / 0 skipped**：C201–C204、C206、C207 passed；C205 failed。
  C206在6864d458失敗 → 58081594正式 endpoint 重測後通過；C204仍確認先前manual_only事件
  在 endpoint 恢復後沒有自動重送。這是 fixture isolation 修復，不是削弱 endpoint治理。
- C205再現相同HTTP200日期 `{}` + React #31崩潰；webhook picker仍400。
  兩輪同一產品缺陷已定位至上節最小probe與修復邊界，下一步交原產品owner修復，
  不再原封重跑／handoff，也不把raw key/空表/隱藏錯誤當UI通過。
- 同SHA tenant unit **291/291**（含既有PG三suite各7）、webhook unit **34/34**、
  tenant HTTP **10/10**、webhook E2E **1/1**；partner獨立unit step、C113–C115、restart
  steps均因前置UI失敗而skip。Gate因缺restart-report失敗，並保留完整24-case manifest。
- 最新TS修改的scoped typecheck與ESLint exit0；`git diff --check` exit0；
  本輪9個commit trailers（base a24a4ca7）exit0。先前本機QA12/Python64只代表其記錄版本，
  不是最新SHA的完整runtime acceptance。沒有背景本機checks或VM服務。
- [CI36339892568](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36339892568)
  completed failure：同17歷史commits與scope外transport lint；
  integration36339892596 completed success但主要工作skip，兩者結果已讀完。

目前三項required_acceptance仍 **NOT MET**；C208–C224未實作、完整SD14/NAV仍缺。
B/C仍未執行，真夥伴與真機維持 `SR-LIVE-PUSH-001` gate。
草稿PR2179只是普通發布的checkpoint，未handoff、未done、未merge。
後續需要Supervisor安排上節R5產品修復及R9安全transport scope、R8保留refs的history recovery；
之後原owner續做餘下矩陣並以同一新SHA重新review/CI/runtime，不借用本次歷史通過。
本節文件提交與上述程式/runtime SHA分開；文件提交CI結果另存 `.local/` 並回報canonical progress，
不因文件checkpoint前進冒稱新SHA已跑過hosted驗收。
