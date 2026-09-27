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
