# SR-PARTNER-NOTIFY-QA-20260917

## 2026-09-29 最新處置：R13 管理 UI 回讀仍被本地 queued 覆蓋

**產品 blocker，尚未 handoff／收完整 A 層。** 自動化 24 案首次全綠後，逐張讀取
同 SHA screenshot 與 HTTP 附件發現新的真狀態矛盾；不能以 aggregate success 關閉 UI 驗收。
本次只補 scope 內 C205 斷言與本文件定位，產品由 Supervisor 協調 repair child／scope。

### 已完成的完整同 SHA 執行

程式／workflow SHA：`502b51342b656ec42c2bdbb5b8e323369db2abb6`。
[UAT36502578681／job109196624110](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36502578681/job/109196624110)
completed **success**；artifact **11006691019**，ZIP SHA256
`f761c3e94c2f4dfd9d153da84f556d139c917ca7fb1779b5bbb94c6271a3f20f`。
完整 log／所有 JSON／43 個附件已讀或解碼核對：C201–C224 **24/24、零 fail/skip/flaky**，
tenant/partner unit **331/331**（三 PG 各 7/7）、webhook unit **34/34**、dedicated partner
unit **12/12**、tenant HTTP **10/10**、webhook E2E **1/1**、C111–C115 passed、restart
verified15。每份執行報告 candidate/workflow SHA 相符、exit_code=0，run-status passed。
C205 **2.975 秒**；C218 **18.860 秒**；C214 **128.127 秒**；C216 **460.263 秒**；
C224 **183.310 秒**。這是該版斷言的真結果，不表示斷言已涵蓋下面新發現的 R13。

[一般 CI36502578599](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36502578599)
completed **success**，已讀完整 log 與 artifact11005049849：lint 21/21、typecheck 28/28、
root **4136 pass／39 pending／0 fail**、API **1438/1438**、PG21 零 skip。
CI ZIP SHA256 `4718280ec55e0db5317c76c1b4343ab49a34512c54238e6618f0358e3f494a83`。
draft integration36502578349 success 僅 scope checks，完整產品 jobs skipped。
這三個 run 均已完成；不可把其 SHA 換成新增 R13 斷言後的 checkpoint。

### R13 [P2] 最小重現、正式呼叫鏈與修正邊界

同一 C205：真 retry POST201 → worker 第二次 attempt 完成 → refresh GET200 返回
outbox `91b7c74d-0cc8-4f05-9543-b98f2325d8f5` 的 `status=delivered`、
`delivery_stage=partner_accepted`、`retry_disposition=none`、`failure_reason=null`、
`receipt_id=controlled-3a883241-e00c-4f91-a267-c79d7a434557`、`attempts=2`。
但 screenshot 同列顯示「夥伴已接受（狀態未知）」及「已受理重新入列／入列中 · 待 claim」。

- HTTP 附件：`C205-admin-retry-http-readback-d49f03e494fa.json`，SHA256
  `d49f03e494fa` 為解碼工具加入的內容 hash 前綴；完整 hash 在 `inspection.json`。
- Screenshot：`C205-admin-retry-readback-35694f04bc97.png`，同上保留完整 hash。
- 正式來源：`apps/platform-admin-web/components/partner-notification-panel.tsx` 的
  `handleRetry`（約1681）成功後 `setRetryState("queued")`；`fetchState`（約1321）
  刷新只 `setDeliveries`，未解除該本地狀態；`PnDeliveries` 的 `rows.map`（約916）
  每次仍覆蓋 `status="queued"`、`failureReason="已受理重新入列"`、
  `retryDisposition="inflight"`，最後 `PnRetryCell`（約608）顯示等待 claim。
- 正式規格：SA/SD §12 Platform/Ops「真實 stage 與受控 retry」、§16 要求 UI 真狀態；
  receipt 已持久化後，刷新必須以正式 read model 為準，不能無限保留 transient overlay。

非 serving 最小 probe 使用 production `PartnerNotificationPanel`、Canvas 元件、正式
翻譯及真正 React click/refresh/state，只替代 admin HTTP client 邊界。依序 failed/manual_only
→ click retry → 確認 queued → 回傳 delivered/none/receipt → click refresh → accepted label
成立，但要求「入列中 · 待 claim」消失的 assertion **failed**。Node22.23.2／Vitest4.1.2，
exit **1**、**1 test failed**、約4.42秒；不是缺套件或服務啟動錯誤。
命令：`pnpm exec vitest run --config .local/sr-partner-notify-qa-20260928/vitest-repro.config.ts .local/sr-partner-notify-qa-20260928/admin-retry-readback.test.tsx`。
最初 alias setup failure 另存 `r13-local-probe-setup-failure.log`，不算重現；修正 alias 後的
實際 assertion failure 在 `r13-local-probe.log`，probe 未修改任何產品來源。

本次 QA 修正：C205 在保存原 HTTP／screenshot 後，要求同列不再有「已受理重新入列」
或「入列中／待 claim」，並要求 `title=none` 的正式「無重試機制」狀態。此 guard
預期會在未修 R13 的產品上失敗；沒有為再取得綠燈而省略問題，也未重跑已知有缺陷的全套 hosted。

Supervisor 所需產品修正範圍：上述 panel 的 `handleRetry`／`fetchState`／`PnDeliveries`
本地狀態與權威回讀協調；必要 regression 放既有
`tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui-component.test.tsx`。
先讓本地最小 probe 的 queued→delivered/none 通過，保留初始 pending／送出中及拒絕重送
邊界；child merge 後 parent 正常 merge dev，再完整同新 SHA 重跑24案及全部既有 gates。
這兩個產品／既有 UI unit 路徑都在本 task write_scopes 外，owner 未自行修改。

| Required acceptance                                            | 本輪實際證據與剩餘條件                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `integrated_controlled_receiver_negative_matrix_same_sha`      | 502b 的24案與PG全綠；新增 R13 guard 後仍需產品修復及新SHA完整重跑，不拼接結果                                 |
| `navigation_and_admin_ui_hosted_real_runtime_evidence`         | NAV 真 browser/BFF/session/PG 已驗；admin真 retry/readback已驗但R13畫面矛盾，**NOT MET**                      |
| `existing_webhook_tenant_gates_preserved_and_live_not_claimed` | 502b tenant/webhook/C111–C115/restart 全通過；新候選仍須重跑。B/C真夥伴及原生裝置未執行，保留SR-LIVE-PUSH-001 |

完整機器證據保存在 canonical `.local/sr-partner-notify-qa-20260929-502b51342b65/`；
包含原 ZIP、解碼附件、逐案 inspection、CI、最小 probe 及本次 blocker receipt。
Supervisor 尚未安排 R13 前，本任務不得宣稱整合完成、進行最終 handoff 或直接 done。

## 2026-09-28 successor 恢復（先前 checkpoint）

Successor PR：[#2220](https://github.com/ajoe734/drts-fleet-platform/pull/2220)。
下列為提交時已完成的證據；最終 candidate 的完整 SHA、同 SHA hosted run／artifact
及驗收結果由本 task 的 canonical `handoff` receipt 鎖定，不能把下列 checkpoint
或 draft integration aggregate 當作最終通過。handoff 後交 Codex2 獨立審查。

Owner: Codex；Reviewer: Codex2。依本次 Supervisor dispatch，於乾淨的
`gemini/sr-partner-notify-qa-20260927-successor` 接續工作，base 為
`2c3d4baa39133de3d740238e5e0f227033b94e59`（含五項 FIX 與 history helper）。
目前為 recovery checkpoint，尚未交審；三項 required_acceptance 仍待本候選完整 hosted 驗證。

指定 `qa-owned-recovery.patch` 的 apply-check 與 apply 均 exit 0，20 個 QA 檔案
逐一比對 `3d50ba809825dfb4a5691f85519016af3575eccc` blob 全部相符。
未匯入舊分支 ancestry 或三個產品檔；PR #2175／#2177／#2179 與 refs 保留。
本機恢復證據：`.local/sr-partner-notify-qa-20260928/recovery.json`。
後續格式整理及測試適配另記；既有 unit1–7 與失敗定位全文保留於下方。

完整 C201–C224、三個 PG suite、NAV/admin UI、tenant/webhook/C111–C115 與
restart gates 將在同 SHA 的 GitHub-hosted workflow 重驗。
本 VM 僅執行非 serving repository checks；A 層尚未驗收，B/C 真夥伴／原生裝置
仍為 `SR-LIVE-PUSH-001` 外部門檻。

### Successor 適配與已完成檢查

原 20 個 blob 恢復後，只有以下行為適配（另有 Prettier 格式整理）：

- `PartnerFixture.start` 移除 R11 的 10 秒 entry readback polling；POST 返回後
  立即查正式 `admin.phase1_partner_channel_entries`，必須已是正確 tenant／partner。
  正式 `TenantPartnerService.createPlatformPartnerEntry` 已 await `persistChangesRequired`。
- C205 增加真 browser tenant webhook picker GET 必須 200，並要求修復後正式
  `PartnerNotificationPanel` 的 `Accepted (Unknown Device State)`／`夥伴已接受（狀態未知）`
  正式中英文案；刷新 GET 200 的 wire 必須與同筆 durable receipt／兩次 attempt 相符。保留
  真重送按鈕、POST 201、durable outbox、同 payload／兩次 attempt 與 screenshot。
- C222 按 FIX-HISTORY 正式 BFF 契約要求 foreign history **404**；receipt 仍 **400**。
  加入同 session 自有 history **200 + 正確 orderId**、unknown history **404**、
  清 cookie 後 history **400**。不是接受多種 status，也未省略任何跨 scope 斷言。
- Manifest 的四個 unsafe-endpoint titles 加上 TRANSPORT 已合併的
  `(default behavior)` 後綴；加入同檔 production／false-unset／explicit-opt-in
  三個正式案例。逐 assertion passed、同 SHA、三個 PG suite 與所有 24 案身份仍強制。

本機 Node 22.23.2、pnpm 10.33.0、Python 3.12.3，無 server／PG／browser：

| 檢查                                                                                           | 實際結果與界線                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `python3 -m unittest tools.ci.test_tenant_uat_acceptance_workflow`                             | 64 passed，exit 0；報告 gate 測試，不是產品驗收                                                                                                             |
| `python3 tests/unit/system-remediation/sr-partner-notify-qa-20260917/probe-gate-regression.py` | exit 0；舊 `62962c9e` 接受六種錯誤報告，新 gate 全拒絕，合法 synthetic control 保留                                                                         |
| `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-qa-20260917/`            | 12 passed／0 skipped，exit 0；只替代 socket／DNS／HTTP 邊界                                                                                                 |
| task 13 個 TS root files 的 production TypeScript program、scoped ESLint                       | 各 exit 0，0 diagnostics／warnings；沒有執行 Playwright                                                                                                     |
| `pnpm exec tsc -p tsconfig.json --noEmit --incremental false`                                  | 本機 exit 2：shared workspace 缺 `@drts/api-client`／`ui-web`／`ui-tokens` 解析及衍生診斷；不改 shared dependencies。下述 hosted 同 SHA 完整 typecheck 通過 |
| 全範圍 trailers／whitespace／scope                                                             | successor 通過；舊 `931eabb0..3d50ba80` 確認 18 invalid commits、exit 1；新分支無舊祖先，仍只 20 QA 檔，產品檔等於 base                                     |

### `bedd915a7aee1076aad6f10c2751d95c9bfc261a` checkpoint 結果

[一般 CI 36498312272](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36498312272)
completed **success**，完整 log 與兩份 JSON 已讀：lint 21/21 tasks、typecheck 28/28 tasks，
root unit **4136 pass／39 pending／0 fail**，API unit **1438 pass／0 skip**；三個指定 PG
suite 各 **7/7、零 skip**。39 pending 不記成 pass。
[integration 36498312282](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36498312282)
completed success 僅是 draft scope／64 workflow checks；完整產品 jobs **skipped**。

[UAT 36498275373／job109182848572](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36498275373/job/109182848572)
於 23:45 completed **cancelled**：owner 已從正式 route 確認 C222 舊 400 斷言不符
已合併的 404 契約，因此中止並準備完整新 SHA 重跑。artifact **11004583577**，ZIP SHA256
`75ea8686f6406577d268adcdccd7147eb7d82b273f95b374193684e66d61300c`。
candidate／workflow SHA 均為 bedd；run-status **failed**，gate **failure**，partner unit
**skipped**、partner E2E JSON **未產出**。不得拼接 console 片段為完整通過。

已完整產出的報告：tenant/partner unit **331/331**（含 PG21）、webhook unit **34/34**、
tenant HTTP **10/10**、webhook E2E **1/1**、C111–C115 **passed**、restart **verified15**。
partner console 只有 **19 passed／C222 failed**；C216 執行中被取消，C217/C219/C205
未完成。C218 console 此次走過正式 snapshot／取消／receipt（18.8s），仍須新候選全套重驗。
取消後 gate 另精確指出四個已改名的 unsafe-endpoint titles 不符 manifest；上述適配保留原案例。

### `fffb77077ce5b5c7a2adb4849a5a0781b738f98b` checkpoint 與 C205 最小定位

[一般 CI 36500000464](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36500000464)
completed **success**：完整 lint/typecheck 通過，root **4136 pass／39 pending／0 fail**、
API **1438 pass／0 skip**、三個 PG suite 各 **7/7**。draft integration
36500000399 的 scope／64 workflow checks 成功，完整產品 jobs 仍 skipped。

[UAT 36499996287／job109188313399](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36499996287/job/109188313399)
completed **failure**：partner **23/24 pass／C205 failed／0 skipped／0 flaky**，24 個
manifest identity 全相符。artifact **11005182726**，ZIP SHA256
`ab427f5b1fba65e185c66f62892cdf3749b53acc05794647a0e3764ba604418c`。
candidate／workflow SHA 都是 fffb；dedicated partner unit 被前一步 failure 跳過，strict
gate 正確拒絕；不能收完整 A 層。其餘完整 reports：tenant/partner unit **331/331**
（PG21）、webhook unit **34/34**、tenant HTTP **10/10**、webhook E2E **1/1**、
C111–C115 passed、restart verified15。所有啟動的檢查已結束並讀取結果。

C222 正反向 history／receipt 已通過；C218 正式 SQL、supersede／取消／receipt 通過。
C214 真 DB rollback／自然 lease、C215 兩 worker、C216 五次 attempt 與兩次 API restart、
C224 61+120 秒自然 TTL 均通過。新 candidate 仍須完整重跑，不能拼接兩輪結果。

C205 最小重現：真 browser 開啟 Notifications → tenant picker GET **200** → 真重送
POST **201** → DB delivered／attempt_count=2／receiver 同 bytes 兩次／durable receipt
斷言均通過 → 舊 exact refresh locator 等待 45 秒超時。原 trace／screenshot 顯示按鈕
accessible name 是 `refresh重新整理`，畫面已 hydration 成繁體中文。
正式 `CanvasBtn` → `renderIcon` 對 icon registry 未收錄的 `refresh` 回傳原文字；
`PartnerNotificationPanel` 與 translations 提供上述兩個 accepted label。

修正邊界僅 C205：refresh locator 只允許正式中英文 label 加可選 `refresh` icon prefix；
觀察此 control 觸發的真 delivery GET **200**，精確驗同 outbox 的 delivered／attempts=2／
partner_accepted／同 DB receipt／unknown downstream／none retry／null failure，保存原 wire
JSON 與最終 screenshot，再要求正式 accepted label 及重送按鈕消失。
未修改產品、mock browser response、放寬 HTTP status、減少矩陣或增加等待時間。
三項 required_acceptance 在本提交仍 **PENDING**；完整新 SHA 結果以 canonical handoff
receipt 鎖定，B/C 真夥伴／真機仍未執行。

### §0.7 本輪 finding／required_acceptance 對照

| Finding／驗收                                                  | 正式來源／修改位置                                                                                 | 舊→本輪證據                                                                                   | 尚待驗證／限制                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| R1/R10/R11                                                     | worker／正式 snapshot repository／`createPlatformPartnerEntry`；恢復 C201–C220、移除 entry polling | 舊 84c C218 SQL42P08；bedd C218 console passed、即時 entry readback 未失敗；完整本輪仍待 JSON | 不用 partial run 收 A 層                                   |
| R2/R6/R7/R9                                                    | 原 workflow strict gate、manifest；TRANSPORT 已合併 typed transport 與 bounded opt-in              | 64 gate tests＋六種舊 fail-open 反例；bedd PG21 零 skip；四個重命名精確適配                   | production/default 拒絕獨立保留，無 job-wide bypass        |
| R3/R4/R8                                                       | 本文件、04_sources、PR2220／乾淨 successor                                                         | 20 blobs 相符；old 18 invalid→新完整 range pass；local=remote=PR bedd                         | 舊 PR2175/2177/2179 保留；最终 SHA 以 handoff receipt 核對 |
| R5/R12                                                         | 管理 panel／history BFF；C205 picker/文案，C222 正反向讀取                                         | 舊 84c admin crash/foreign history200；bedd C222 因 400→404 契約適配待重跑，C205 未到達       | 仍須真 browser 與 HTTP/PG 證據，native 不在本輪            |
| `integrated_controlled_receiver_negative_matrix_same_sha`      | C201–C224、三 PG suite、原 strict gate                                                             | 本提交時 **PENDING**；bedd cancelled 不符合                                                   | 完整新 candidate SHA 0 fail／0 skip／0 flaky               |
| `navigation_and_admin_ui_hosted_real_runtime_evidence`         | C205、C221–C224，真 BFF/session/control/PG                                                         | 本提交時 **PENDING**                                                                          | 讀完整 reports、screenshots、HTTP/SQL 附件                 |
| `existing_webhook_tenant_gates_preserved_and_live_not_claimed` | tenant10、webhook1/34、C111–C115/restart；A/B/C 界線                                               | bedd 個別 reports passed；本提交時整體 **PENDING**                                            | 新候選同 SHA strict gate；B/C 仍未執行                     |

本機 logs／JSON／ZIP／hash 在 `.local/sr-partner-notify-qa-20260928/`。
所有本輪啟動的 bedd checks 均已結束並讀取；新候選 hosted 結果不得沿用 bedd。

## 2026-09-27 歷史 checkpoint（不作 successor 通過證據）

Owner: Codex（2026-09-27 Supervisor 直接交接）；Reviewer: Codex2。
狀態：整合驗收未通過，待 Supervisor 排產品修復與 history recovery；尚無新的 review candidate。交接 checkpoint 為
`91b1d4ac122b1373ac7beb05df902cb991b62232`，沿用既有實作與發布歷史。
最新程式 checkpoint `84c5d9e3cf499863de0b2838892508b3972e8093` 的 hosted run36352402864 已完成並讀完：
**21 passed／3 failed（C205、C218、C222）／0 skipped／0 flaky**，全部24個manifest identity吻合。
C216/C217及C221/C223/C224同SHA通過；認證fixture已修，但產品R5/R10/R11/R12與publication R8/R9未解。
全部24案已實作，三項required_acceptance仍 **NOT MET**；詳「修復單元7」。

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

## Codex 修復單元 3（2026-09-27，checkpoint，未 handoff）

起點 `09e2277f09931c9ca7d8373db6c4f97085c1c058`；同一 published branch／草稿 PR2179，
scope 未擴充。R5 日期 DTO／tenant picker／translation、R9 transport lint 與 R8 歷史提交
仍待 Supervisor 協調產品修復及 preserving-refs recovery；本單元不修改上述 scope 外檔案。

| Finding／驗收項          | 原始碼依據與修改位置                                                            | 舊版 → 本單元                                                                                                                                  | 驗證與邊界                                                                                                   | 未驗項                               |
| ------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| R1／C209 entry ownership | `resolveNotificationRoute` 先比 entry.tenantId 與 frozen route；正式 entry POST | 09e2277f 缺案例 → 新增先排入通知、再以 HTTP 移轉 tenant、檢查 owner_changed/manual_only、零外送、route 不改；恢復 owner 後新事件正向           | synthetic event 僅用 `OwnedMobilityRepository.persistChanges`；不寫 route／claim SQL；8039453e hosted passed | 其餘 SD14 仍缺                       |
| R1／C212 invalid ack     | `WebhookDispatchService`／transport 真正驗 receipt identity                     | 舊版只204 → 新增 HTML200、錯 notification/delivery/entry、缺 receipt；均須 manual_only、無 acknowledged receipt，endpoint 正式重測仍不自動重送 | 只替換受控 receiver 回應，保留 HMAC/durable inbox；8039453e hosted passed                                    | 不稱真夥伴驗收                       |
| R1／C217 expiry          | `notificationExpiresAt`、真 worker claim/outcome                                | 缺案例 → 八日前 receipt_ready 終止、零外送，同ride fresh receipt sequence=2可送                                                                | synthetic event timestamp，無時鐘／worker mock；8039453e hosted passed                                       | expiry during retry 仍待完整故障矩陣 |
| R1／C219 privacy         | `PartnerNotificationTransport.send` allowlist                                   | 缺案例 → synthetic 私密欄位留在PG，wire只允許正式欄位；缺driver仍可交付                                                                        | receiver raw bytes＋PG readback；8039453e hosted passed                                                      | 不含真個資或真裝置                   |
| R2／R3 既有 gates        | 原 workflow `c113_c115_acceptance`、restart/readback                            | C205失敗時全部skip → 把 partner specs 放在既有 restart gates 之後，所有 gate 及 strict case manifest 保留                                      | 原 Python ordering/assertion checks 與 8039453e hosted passed                                                | C205已知產品缺陷仍保留必需且可能失敗 |

本 checkpoint 只保存已實作待驗案例，不是通過／交審；三項 required_acceptance 仍 **NOT MET**。
C208、C210–C211、C213–C216、C218、C220–C224 仍缺；C205完整UI受產品缺陷阻塞。
VM 不啟任何產品／receiver／DB／browser服務。後續實際命令、SHA/run/artifact及結果續記於本節。

### 單元3完成的驗證（已等待結束、讀取結果）

程式 SHA `8039453e93b7aa78ff6cb56b1f99b31066c73955` 已普通 push，當時 local／remote／
草稿 PR2179 head 一致；沒有 handoff。NAV `c2d94aaa`、UI `931eabb0`、LEGACY `d6177129`、
PG `318b44b6` 的正式 merge commit 均為此 SHA ancestor（四次 `git merge-base --is-ancestor` exit0）。

| 命令／證據                                                                                                                                                                                                         | 已讀取結果                                                                                                                                                       | 限制                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `python3 -m unittest tools.ci.test_tenant_uat_acceptance_workflow`                                                                                                                                                 | exit0，64 passed                                                                                                                                                 | workflow/report判斷，不是產品驗收                                    |
| `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-qa-20260917/ --reporter=default`                                                                                                             | exit0，12 passed                                                                                                                                                 | 7 receiver＋5安全boundary，不開socket/server                         |
| `pnpm exec tsc -p .local/sr-partner-notify-qa-20260927-unit3/tsconfig.json --noEmit`；`pnpm exec eslint tests/e2e/system-remediation/sr-partner-notify-qa-20260917/ --max-warnings=0`；`git diff 09e2277f --check` | 各exit0                                                                                                                                                          | scoped編譯／lint／whitespace                                         |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts tests/e2e/system-remediation/sr-partner-notify-qa-20260917 --list --reporter=list`                                                           | exit0，11案例可收集                                                                                                                                              | 僅collection，未執行browser或beforeAll                               |
| `gh workflow run tenant-uat-acceptance.yml --ref codex/sr-partner-notify-qa-20260917 -f candidate_sha=8039453e93b7aa78ff6cb56b1f99b31066c73955`                                                                    | dispatch exit0；[run36341144117/job108681345612](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36341144117/job/108681345612) completed **failure** | 整體未通過，非review candidate                                       |
| Artifact10938394046 ZIP                                                                                                                                                                                            | SHA256 `6d0485e24d7e01a53038dc2df301b677186c090dc20fdf119e54e60892423ac0`；下載、解壓、JSON核對exit0                                                             | 原始機器證據存本工作樹 `.local/sr-partner-notify-qa-20260927-unit3/` |

同 SHA hosted 報告核對：

- Partner **10 passed／1 failed／0 skipped／0 flaky**：C201–C204、C206、C207、
  **C209、C212、C217、C219 passed**；C205 failed。舊 checkpoint 缺四案例，本輪真 worker/
  HMAC/PG/receiver路徑已執行；沒有用synthetic報告冒充runtime。
- C209 真正先以repository排入pending通知，再以正式API把entry移到另一tenant；
  `owner_changed/manual_only`、零外送、frozen route保持原tenant，恢復owner後新事件成功。
- C212 五種外部回應故障均 `partner_ack_invalid/manual_only`：HTML200、錯notification_id、
  delivery_id、entry_slug與缺receipt。receiver已durable接受而DRTS無acknowledged receipt；
  正式endpoint重測後舊事件仍不自動重送，fresh事件正向成功。
- C217 過期事件 `notification_expired/terminal` 零外送；同ride新事件sequence=2成功。
  C219 私密canary留於outbox payload、wire exact allowlist不洩漏；driver=null亦正向成功。
- Tenant/partner units **291/291**，其中三個正式PG suites各**7/7**；webhook units **34/34**；
  tenant HTTP **10/10**；webhook E2E **1/1**。上述JSON的execution candidate/workflow SHA皆為8039453e。
- 原 tenant restart report **passed／verified=15**；C111–C115既有capability report **passed**，
  API restart與HTTP/PG readback步驟均success。相鄰58081594的C205 failure使其skip，
  本輪順序修正後已執行；此為既有harness結果，其內部fixture/provider邊界未擴稱真實外部驗收。
- Partner獨立unit step因C205 failure而**skipped**（前面291總suite已包含QA12）；
  strict aggregate gate **failed**，run-status=failed。13個缺實作case仍列為必需，沒有刪除gate。

R5在本輪真browser再次失敗：trace內 deliveries HTTP200的日期仍 `{}`，React error #31；
tenant webhook picker仍400 `TENANT_ID_REQUIRED`。trace位置為artifact的
`test-results/partner-notify-artifacts/sr-partner-notify-qa-20260-d6d16-n-binding-and-enables-retry/trace.zip`。
最小重現命令 `./apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json .local/sr-partner-notify-qa-20260927-unit3/probe-ui-date.ts`
exit0（成功重現缺陷，**不是產品通過**）：實際serializer把Date變空object，實際React拒絕child；
未開server。修復邊界仍為前節的delivery DTO、授權tenant picker及translation；不能修改fixture回應來掩蓋。

[CI36341115170](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36341115170) completed **failure**，
job108681262871為同17個繼承commit格式，job108681322837為scope外transport `no-require-imports`。
完整failed log已讀，存 `.local/sr-partner-notify-qa-20260927-unit3/ci-failed.log`。
Integration36341115198 completed **success**但主要build/unit/typecheck/lint/integration均**skipped**。

三項required_acceptance仍 **NOT MET**；既有gates已有本SHA局部證據，但尚無完整矩陣、
完整NAV/UI、合格CI／獨立review／merge候選。C208、C210–C211、C213–C216、C218、C220–C224
仍缺；R5/R9產品scope及R8 history recovery仍待Supervisor協調。B/C維持未執行的真夥伴／
真機gate。本節後續純文件commit不冒充8039453e的runtime SHA。

## Codex 修復單元 4（2026-09-27，checkpoint，未 handoff）

起點 `9fb031efc070b454e6be56618ac11c72eb422b52`；同一 branch／草稿 PR2179，
local／remote／PR head 核對一致後續做。只修改 QA scope；本單元保留 R1–R9 歷史與
R5/R8/R9 的 Supervisor scope／history recovery 請求，沒有改產品或已發布歷史。

| Finding／驗收項       | 原始碼依據與修改位置                                                                                                                       | 舊版 → 修復結果                                                                                                                                                                              | 證據與邊界                                                                                                                                                                    | 未驗項                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1／C208 同住戶兩 App | `PartnerUserIdentityLinkRepository`、正式建單 frozen route、`resolvePartnerNotificationNavigation`／`resolveRoute`；QA spec／fixture       | 9fb031ef 缺案例 → 1b279b88 與 0638617e hosted passed：相同外部住戶參照在兩 entry 產生各自乘客身份、通知只含原 ride／entry；2 個 own resolve 成功、6 個 wrong entry／subject／key resolve 403 | 真 API key、HTTP、worker、PG、receiver；不輸出 credential／handoff artifact                                                                                                   | 僅 resolve 權限，不代替 C221–C224 browser/session/readback                                                                                                                           |
| R1／C210 revoked link | façade `resolveNotificationRoute` → production identity repository `find` → `recipient_revoked`；NAV 同樣查 link；V0030 正式 schema        | 1b279b88 清理 fixture 的 `$3` 同時推導 varchar/text，case failed；0638617e 將兩處明確為 text，新增還原讀回後 passed                                                                          | 排入 pending → 撤銷狀態注入 → terminal／零外送／無成功receipt／resolve403；另一 entry 同住戶可送；還原後新事件可送，舊事件不自動重送                                          | production repository 沒有 revoke writer/API；僅在 hosted 正式表中修改既有 fixture 的 status 與 record.status，模擬 lifecycle fault，不驗收撤銷管理流程、不複製 gate/worker 業務邏輯 |
| R1／C211 停用／輪替   | `updateWebhookEndpoint`、`rotateWebhookSecret`、`computeEndpointFingerprint`、binding test/enable、真 route gate                           | 9fb031ef 缺案例 → 1b279b88 與 0638617e passed：disabled 零外送，active 操作仍 test_pending；輪替後 endpoint test 不足，須 binding 重測才可派送                                               | 全部治理透過正式 HTTP＋step-up；receiver 僅更新自己的 secret，驗真 HMAC version=2；四筆 configuration_blocked 不自動重送；finally 以正式重測恢復所有共用 endpoint 的 bindings | 不宣稱真夥伴／native device；未驗 overlap 全矩陣                                                                                                                                     |
| R5／C205              | `listPartnerNotificationDeliveries` raw PG Date → `deepToSnakeCase` → panel `createdAt` React child；picker header 被 proxy blocklist 移除 | 8039453e → 1b279b88 → 0638617e 同樣 fail，沒有透過 fixture 改回應掩蓋                                                                                                                        | 兩次新 hosted trace：React31、HTTP200 delivery dates={}、picker400 TENANT_ID_REQUIRED；下列 actual serializer／React probe exit0 表示重現缺陷                                 | 需 Supervisor 協調 delivery DTO、授權 tenant picker、translation 原產品 owner／scope；不能解除 auth blocklist                                                                        |
| R8／R9 CI 與歷史      | inherited 17 commits；`partner-notification-https.ts:63`                                                                                   | 兩個程式 checkpoint CI 均 fail，scope 外 no-require-imports 未修；本輪兩新 commits trailers pass                                                                                             | 下列 CI runs/log；普通 push，未 force/rebase/amend                                                                                                                            | typed safe transport／既有 security tests 的 scope/child；preserving-refs publication/history recovery                                                                               |

### 同 SHA hosted 結果與相鄰失敗歷史

1. `1b279b880e0fa5f513ac84cb4ba8f1d3d1434b0b`：
   [run36342461507/job108685085198](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36342461507/job/108685085198)
   completed **failure**；partner **12 passed／2 failed／0 skipped**。
   C208/C211 passed；C210 fixture cleanup 型別錯誤，**不算產品通過**；C205 fail。
   Artifact10940000863，ZIP SHA256 `2d6ff4ecd6ad13180e430bb70fc2506f3f1e91eaf0e320750b45dade01c60428`。
2. `0638617e08b2773870b4813081c3e2446af414a9`：
   [run36343023791/job108686675674](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36343023791/job/108686675674)
   completed **failure**；partner **13 passed／1 failed／0 skipped／0 flaky**。
   C201–C204、C206–C212、C217、C219 全部 passed；C205 fail。
   Artifact10939418920，ZIP SHA256 `31aeb175ab07e6fe254d6b81587349f37f8b33724eebff513bb08dc232b1511a`。

兩次 run 各自的 candidate/workflow SHA 與 execution report 均已核對；各自 tenant/partner
unit **291/291**（三 PG suites 各 **7/7**）、webhook unit **34/34**、tenant HTTP **10/10**、
webhook E2E **1/1**；C111–C115 capability reports passed、restart verified **15**。
Partner 獨立 unit step **skipped**，strict gate **failed**，run-status=failed；沒有降低 gate。
上列 step 通過只代表既有 harness 邊界，不擴稱外部 provider／真夥伴通過。

執行命令：`gh workflow run tenant-uat-acceptance.yml --ref codex/sr-partner-notify-qa-20260917
-f candidate_sha=<上述完整SHA>`，兩次 dispatch exit0；等到 completed 後下載 artifact ZIP、
SHA256／逐 case JSON／run-status／failed logs／C205 trace 均已讀取，原始資料在工作樹
`.local/sr-partner-notify-qa-20260927-unit4/`（第二次為 `artifact-0638617e/`）。

本機 checks：`pnpm exec tsc -p .local/sr-partner-notify-qa-20260927-unit4/tsconfig.json --noEmit`
在兩個程式 SHA 均 exit0；scoped ESLint exit0；QA unit 命令同單元3，**12 passed**，
只驗純函式／receiver boundary，未開服務；Playwright `--list --reporter=list` 收集 **14** 案例，
僅 collection；`git diff 9fb031ef --check` exit0；`check_commit_trailers.py --base 9fb031ef --head HEAD`
兩個新 commits passed。四 dependency merge `c2d94aaa/931eabb0/d6177129/318b44b6` 均為祖先。
日期缺陷 probe：`./apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json
.local/sr-partner-notify-qa-20260927-unit4/probe-ui-date.ts` exit0＝實際 serializer/React 成功重現，
**不是產品通過**，未啟 VM server／browser／DB。

[CI36342453228](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36342453228) 與
[CI36343006928](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36343006928)
均 completed **failure** 並讀完（17 inherited trailers + scope 外 transport lint）；
integration36342453244／36343006908 completed success，但主要 build/unit/typecheck/lint/integration
jobs **skipped**，不作 acceptance。所有本單元程式 checks 均已結束，沒有背景測試未讀。

仍缺 C213–C216、C218、C220–C224 共 **10** 個必需案例；C205 需產品修復。
三項 `required_acceptance`：`integrated_controlled_receiver_negative_matrix_same_sha`、
`navigation_and_admin_ui_hosted_real_runtime_evidence`、
`existing_webhook_tenant_gates_preserved_and_live_not_claimed` 均 **NOT MET**。
R1 完整故障矩陣、R5 NAV/UI、R8/R9 publication/scope blockers 仍開放；原 R2/R3 strict gate 與
證據邊界持續保留，沒有 handoff／merge／A 層完成宣稱；B/C 真夥伴／真機 gates 均未執行。
後續文件 checkpoint 不冒充 0638617e 的 runtime SHA。

## Codex 修復單元 5（2026-09-27，checkpoint，未 handoff）

起點 `c68f4908f24fa8ab7e3a654d67319d71f251bf04`；local／remote／draft PR2179
相同，工作樹乾淨。沿用 R1–R9 finding、三個 NOT MET acceptance 與 B/C live gates。
只改授權 QA 檔案；沒有產品修復、force/rebase/amend 或 VM runtime。

| Finding／驗收項                     | 原始碼依據與修改位置                                                                                                                                       | 舊版 → 本單元                                                                                                                            | 證據與邊界                                                                                                                          | 未驗項                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| R1／C213 timeout後durable duplicate | `ControlledReceiver` fsync/rename、`PartnerNotificationWorker`、transport immutable context；spec C213、fixture `reopenReceiver`                           | c68f4908 缺此case → 8c23e9a0 hosted passed：accepted後timeout、重建receiver物件讀disk、真backoff重送同bytes/receipt/duplicate            | receiver只是外部邊界；不改 worker/DB時間，不手動send；reopen不是OS process restart                                                  | C214–C216 DB/lease/多worker/restart仍缺                    |
| R1／C218 relevance → 新 R10         | `OwnedMobilityRepository.persistChanges`、`findPartnerNotificationRelevance`、transport `resolve`、`cancelOwnedOrder`；`synthetic-event.ts`、enqueue、spec | c68f4908 缺case → 8c23e9a0 hosted failed：第一筆snapshot即正式repository SQL42P08，後續ETA／取消arrival／receipt斷言未執行               | 上游snapshot/event為明列synthetic fixture，使用完整正式型別及repository transaction；不驗收派車/driver資格流程、不複製relevance SQL | 產品SQL修復需scope/child，詳下方最小重現；**不是C218通過** |
| R1／C220 缺設定availability         | `MultiTaxiModule` DI、adapter/transport `isAvailableFor`、façade `resolveNotificationRoute`；第四entry fixture、`probe-availability.ts`、spec              | c68f4908 缺case → 8c23e9a0 hosted passed：無binding/test_pending皆零外送；正式test/enable後route available、新事件可送，舊held不自動解封 | hosted compiled full AppModule context、真repositories、無provider override；context正常scheduler啟動/關閉，只在hosted              | 不作device證據                                             |
| R5／C205、R8／R9                    | 原產品日期DTO/picker/translation、transport lint、17 inherited trailers                                                                                    | 保留單元4已定位產品／publication blockers；本單元不改scope外檔案                                                                         | 需Supervisor排原owner修復child／scope與preserving-refs history recovery                                                             | UI/NAV与合格review/CI/merge仍未完成                        |

本機初次 typecheck exit2：synthetic address 使用不合法 `geocodeConfidence=high`，
已依正式 union 改 `manual`；這是 fixture 型別錯誤，不算產品缺陷重現。
ESLint與diff check exit0；QA unit 12 passed；Playwright `--list` 收集17案，只是discovery。
正式C201–C224 manifest保持24必需case與sameSHA gate，未降低要求。
三項required_acceptance仍 **NOT MET**；下列hosted結果不代表全24案例完成。

### 單元5 同 SHA 結果（已結束並讀完）

程式 `8c23e9a07fdd6ed858199f06a180325d356d5179`，
[run36344513008/job108690910239](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36344513008/job/108690910239)
completed **failure**，partner **15 passed／2 failed／0 skipped／0 flaky**。
C201–C204、C206–C213、C217、C219、C220 passed；C205與C218 failed。
Artifact **10940415836**，ZIP SHA256
`ce1d2c4fd1edaf4289e2a3330d0c0160437947b56de8b9efa2fd5e1bbe1454eb`。
dispatch命令：`gh workflow run tenant-uat-acceptance.yml --ref codex/sr-partner-notify-qa-20260917
-f candidate_sha=8c23e9a07fdd6ed858199f06a180325d356d5179`，exit0；下載ZIP、hash、
report逐case與execution候選/工作流SHA均核對，原始證據存
`.local/sr-partner-notify-qa-20260927-unit5/artifact-8c23e9a0/`。

同 SHA tenant/partner unit **291/291**（三PG suites各 **7/7**）、webhook unit **34/34**、
tenant HTTP **10/10**、webhook E2E **1/1**；既有 C111–C115 report passed、restart verified **15**。
Partner獨立unit step **skipped**，strict gate **failed**，run-status=failed。舊gates／外部限制未變。
兩個新增passed案例的JSON附件 `durable-receiver-reopen`、`route-availability` 已讀回：
C213只有一筆durable inbox、兩次同hash的request、原receipt accepted→duplicate；
C220正式DI為partner_webhook，serviceAvailable=false，route readiness false→true，
兩筆held皆一次attempt／零receiver request，新事件取得真受控receipt。

C205同run真browser trace仍有React #31；deliveries HTTP200中的created_at/expires_at/
next_attempt_at皆{}；tenant/webhooks HTTP400 `TENANT_ID_REQUIRED`。實際serializer+React
最小probe：`./apps/api/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json
.local/sr-partner-notify-qa-20260927-unit5/probe-ui-date.ts` exit0＝成功重現缺陷，不是產品通過。
DTO／授權picker／translation修復仍交Supervisor排原owner/scope，不解除auth blocklist。

### 新 finding R10：正式 disclosure snapshot SQL 參數衝突

- 觸發：`enqueue-notification.ts` 呼叫正式 `OwnedMobilityRepository.persistChanges`，
  在真migration schema中同transaction存一筆符合 `PassengerDispatchDisclosureSnapshot`
  型別的version1 snapshot與ETA outbox。沒有手寫snapshot SQL或替代schema。
- 實際：第一個snapshot寫入即 **PostgreSQL42P08**，`inconsistent types deduced for parameter $7`，
  detail=`text versus timestamp with time zone`。compiled stack指
  `owned-mobility.repository.js:1320` → `withTransaction` → `persistChanges` → enqueue main:57。
  API/build/PG可用、套件完整；不是缺套件或測試自己SQL的錯誤。C218所有後續通知斷言未到達。
- 靜態定位：`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts:1803–1843`
  的 `persistChangesWithExecutor`，同 `$7` 用於 `superseded_at=$7`、
  `to_jsonb($7::text)` 與 INSERT `created_at`。正式 V0056 的兩日期欄皆timestamptz。
  c68f4908與8c23e9a0產品檔完全相同；舊checkpoint沒有C218，**未聲稱舊SHA動態跑過**。
- caller範圍：`persistChanges` 與 `persistOrderWorkflow` 共用此函式；
  `OwnedMobilityService` 的 reassign durable workflow（snapshot caller:5256）及
  `applyDispatchAssignmentBundle`（:10660）均可帶snapshot。真派車受影響是依呼叫圖推論，
  本輪只動態重現repository路徑，沒有宣稱跑過整個派車API。
- 修復邊界：請Supervisor核對平行scope並交agy產品owner，最窄產品檔為
  `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`；統一明確參數型別，
  同時保留JSON日期格式、supersede規則、snapshot/outbox/sequence的原交易。
  必要回歸：真PG初次snapshot、v2 supersede v1、重放不多配置sequence、錯誤整筆rollback、
  同SHA C218正向ETA/過期指派拒送/取消後arrival拒送/receipt獨立。
  QA write_scopes沒有該產品檔，不能直接改碼、改fixture成手寫SQL或降低assertion。
- 可重跑probe：既有hosted workflow在同SHA用C218（或完整partner spec），
  fixture會自行建立合法entry/identity/order並呼叫該正式repository；API/PG/browser只能hosted。
  具體命令、錯誤與stack在 `hosted-8c23e9a0-failed.log:63–105` 與上列artifact的partner JSON。

### 單元5 本機與 publication 檢查

本機 Node22.23.2、pnpm10.33.0、Python3.12.3；scoped tsc修正fixture enum後exit0、
scoped ESLint exit0、QA unit **12 passed**、workflow unittest **64 passed**、
Playwright `--list --reporter=list` **17**案（discovery）、`git diff c68f4908 --check` exit0。
`python3 tools/ci/git/check_commit_trailers.py --base c68f4908 --head HEAD`：兩個程式提交pass；
曾誤用缺少git/的script路徑exit2，已改正，不算check成功。四dependency merge仍是祖先。

[CI36344323807](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36344323807)（a4a790af）與
[CI36344493261](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36344493261)（8c23e9a0）
均completed **failure**並讀完：17 inherited trailers與scope外transport no-require-imports。
Integration36344323797／36344493214 completed success，但主要產品jobs **skipped**，不是acceptance。
所有本單元程式checks均已結束、讀取結果；後續docs checkpoint不冒充本程式SHA的runtime。

仍缺C214–C216、C221–C224共 **7** 個必需case；C218新增但由R10阻塞，C205由R5阻塞。
R8/R9 publication/scope限制保留。三項required_acceptance全部 **NOT MET**；
未handoff、未merge、未稱A層verified，B/C真夥伴／native device gates均未執行。

## Codex 修復單元 6（2026-09-27，checkpoint，未 handoff）

起點 `ad697af45c79d1c3d4a3b3c846e32c059d959322`，local／remote／草稿 PR2179
一致且乾淨。只改 QA scopes，保留所有 R1–R10 findings、既有 gates 及 B/C 限制。

| Finding／驗收項                          | 原始碼依據與修改位置                                                                                                                                                | 舊版 → 本輪結果                                                                                             | 命令／證據與邊界                                                                                                                                                            | 未驗項與限制                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| R1／C214 ack 後 DB 失敗與 lease recovery | `MultiTaxiService.deliverPartnerNotification`、`MultiTaxiRepository.recordPushDeliveryOutcome/claimPartnerNotification`；QA spec、fixture、`probe-stale-outcome.ts` | ad697af4 缺 case → 068a990e 因 setup 失敗未執行 → 6d6fdb77 **passed**（128.146 秒）                         | 正式表上的單一 outbox trigger 注入 outcome status 寫入錯誤；sequence 僅作不隨 rollback 消失的故障計數；production repository、transaction、worker、120 秒 lease 均未替代    | 注入 DB 寫入例外，不宣稱 DB 主機重啟；C216 五次重試／API restart 仍缺                                        |
| R1／C215 兩 worker 競爭及失效 fence      | `PartnerNotificationWorker.dispatchDue`、正式 claim/outcome repository；`competing-worker.ts`、fixture、spec                                                        | ad697af4 缺 case → 6d6fdb77 **passed**（12.573 秒）                                                         | 第二個 OS process 啟動 compiled full AppModule；PG row lock 同步兩個真 scheduler，以 pg_stat_activity 確認兩個 claim 都在等鎖；釋鎖後只一次外送／一次 attempt／一筆 receipt | C215 驗 released fence 拒寫；C214 另驗被新 fence 取代的 token1 拒寫。沒有把 C215 冒稱跨 lease 的慢 HTTP 回覆 |
| 新 R11／entry 建立回應早於 durable write | `createPlatformPartnerEntry` → 未 await 的 `persistChanges`；V0104 entry FK；QA setup readback                                                                      | 068a990e 真 HTTP201 後 binding PUT500、PG 明示缺 entry → 6d6fdb77 fixture bounded readback 後可跑完整 suite | 下方原始 log 與 caller 定位；只讀正式 PG 前置資料，不寫 entry SQL、不重試失敗 PUT                                                                                           | **產品競態未修**，需要 Supervisor 協調 agy owner/scope；QA readback 不是 create API durability 驗收          |
| R5／C205、R10／C218                      | 原管理 DTO/picker/translations；snapshot CTE `$7`                                                                                                                   | 6d6fdb77 **兩案仍 failed**；C218 後續 ETA／取消斷言未到達                                                   | 同 SHA browser trace：React31、日期{}、TENANT_ID_REQUIRED；C218 production repository PostgreSQL42P08                                                                       | 原 scope／修復 child 請求保留；不以 fixture bypass 產品邏輯                                                  |
| R8／R9、三個 required_acceptance         | 既有 publication／transport scope；required-cases manifest                                                                                                          | 本輪新 commits 合規，普通 CI 仍 fail；三項 acceptance **NOT MET**                                           | 所有舊 gates 保留，未降低 manifest 的24案需求；下列同 SHA regression 與 run 身份                                                                                            | C216、C221–C224 共5案未實作；未 review handoff／merge／A層放行／真夥伴或裝置宣稱                             |

### 單元6 同 SHA 執行與附件（全部已結束並讀完）

- 錯填 candidate_sha 的 dispatch [36345997432](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36345997432)
  在 container 初始化階段取消，終態 **cancelled**；checkout、build、tests 全 skipped，沒有驗收證據。
  隨後用 `-f candidate_sha="$(git rev-parse HEAD)"` dispatch 正確完整 SHA。
- 第一個程式 checkpoint `068a990e119e385b310378713a492957b842444f`：
  [run36346008535/job108695166580](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36346008535/job/108695166580)
  **failure**，partner **0 passed／1 failed（beforeAll）／18 not-run**。
  Artifact **10940264658**，ZIP SHA256
  `d50118d9bb5723f23df81070b54e9cbcf408c18f9eb927adbee1fcd722636c85`。
  新 C214/C215 沒有跑到；不得稱產品故障案例失敗或通過。
- 最後程式 checkpoint `6d6fdb77c8db54c45c99a36af6f75a5573f09648`：
  [run36346488294/job108696546272](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36346488294/job/108696546272)
  **failure**，partner **17 passed／2 failed（C205、C218）／0 skipped／0 flaky**。
  Artifact **10940424368**，ZIP SHA256
  `7678c78d96b71a2c369b51976441c340d1a8004b128a2a516d8d0303d5b0d477`。

兩次各自同 SHA 的 tenant/partner unit **291/291**（三個 PG suite 各7，合計21）、
webhook unit **34/34**、tenant HTTP **10/10**、webhook E2E **1/1**、
C111–C115 capability report **passed**、tenant restart **15 verified**。
Partner 獨立 unit step **skipped**、strict gate **failed**、run-status=failed。
JSON execution.candidate_sha／workflow_sha 與執行版本一致；報告、ZIP hash 已讀回。

新附件 `ack-db-rollback-lease-recovery`：故障計數=1；第一次真 accepted 後 receipt／
context outcome／outbox metadata 全 rollback，保留 sending、attempt1、claim1 與 immutable hash。
原 lease 為 `20:09:41.750Z → 20:11:41.750Z`，第二次 claim 在 `20:11:41.939Z`，
自然到期後才重送；attempt2、fence2，兩次同 bytes/hash 與原 receipt、accepted→duplicate，
只有一筆 durable inbox/native pending 與 acknowledged receipt。正式 repository 拒絕舊 fence1，
完整 outcome 讀回不變。未修改 DB 時間、lease、policy，未自行 send／合成回執。

新附件 `two-workers-one-claim`：兩個 PG backends（1827 與1846，後者 application_name=
qa-partner-competitor）同時等 claim 鎖；第二個 AppModule OS PID18257，與 API process 分開。
勝者只產生一次 attempt／HTTP／receipt；released fence1 的 replay 回 fence_lost，讀回不變。
新增 process 在 finally 透過 AppModule.close 正常退出並驗 exit0；沒有背景檢查遺留。

### R11 最小重現、caller 與產品修正邊界

- 觸發序列：正式 POST `/api/platform-admin/partner-entries` 回201 → credential issue →
  PUT 該 entry 的 notification-binding 回500。此時尚未呼叫本輪新增的 fault helpers。
- 直接 DB 證據：第一輪完整 hosted log `hosted-068a990e-full.log:6271–6284`，
  `phase1_partner_notification_bindings_entry_slug_fkey` 違反，key
  `qa-notify-8cb96a5f` 不存在於 `phase1_partner_channel_entries`。API exception filter 抹成
  INTERNAL_SERVER_ERROR；不能只從 API log 無 stack 推定沒有 DB 失敗。
- 呼叫圖：`tenant-partner.controller.ts:832–840` 同步把 service 回值包成 success；
  `tenant-partner.service.ts:createPlatformPartnerEntry:4880–4973` 先改 memory，:4943 呼叫
  `persistChanges` 後直接 return；:15194–15222 的 helper 回傳 promise 且 catch persistence error。
  Binding service `putBinding:85` → repository `put:179` 立即使用 V0104 正式 FK。
- 最窄修復 scope 請 Supervisor 排給 agy：`tenant-partner.service.ts`、
  `tenant-partner.controller.ts` 及相應 durability regression；需要 shared helper/repository
  變更時先核對平行 scope。修復需等待真正 durable write 並正確傳遞失敗，不能只對成功 envelope
  包 promise，也不能把 persistence error catch 吞掉後仍回201。
- 搜過實際 callers：platform-admin `app/partners/page.tsx:355`、api-client `index.ts:3846`，
  API service unit:1000、route binding service test:77、transport governance test:78。
  同步 service callers／測試可能需一起調整；不得由 QA worker 直接改產品。
- 必要回歸：真 PG 建立後立刻 binding PUT、延遲／拒絕 entry persistence、failed create 不留可用
  memory-only entry、一般 entry 建立／既有 binding governance 及同 SHA partner矩陣。
  6d6fdb77 的 QA readback 有10秒上限，只核對正式 rows，不修也不宣稱驗收產品的回應時序。

### 單元6 本機與 CI

Node22.23.2、pnpm10.33.0、Python3.12.3。本機只跑 repository checks：
`pnpm exec tsc --noEmit -p .local/sr-partner-notify-qa-20260927-unit6/tsconfig.json`、
QA E2E目錄 scoped ESLint、`git diff --check` 均exit0；`pnpm exec vitest run
tests/unit/system-remediation/sr-partner-notify-qa-20260917/ --reporter=dot` **12 passed**；
`python3 -m unittest tools.ci.test_tenant_uat_acceptance_workflow` **64 passed**。
Playwright `--list --reporter=list` 收集 **19** 案，僅 discovery；沒有本機 runtime／DB／browser。
四 dependency 的 merge commit仍是祖先；本輪兩程式 commits 的 trailer check exit0。

[CI36345997544](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36345997544)（068a990e）及
[CI36346489291](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36346489291)（6d6fdb77）
已完成 **failure** 並讀 log：仍是17個 inherited trailers 與 scope外
`partner-notification-https.ts:63` no-require-imports。Integration36345997642／36346489377
completed success，但主要產品 jobs skipped，非 acceptance。沒有 force/rebase/amend。
本機證據皆在此 task worktree `.local/sr-partner-notify-qa-20260927-unit6/`；
原 logs/ZIP 包含 disposable hosted 資料，不複製進公開文件。後續文件 checkpoint 不冒稱 runtime SHA。

## Codex 修復單元 7（2026-09-27，checkpoint，未 handoff）

本單元從 `196f09b0a323a050a186059eeaffe39c2a8ed80e` 接續，只改派定 QA／workflow／文件 scopes。
C216 由真 AppModule OS process 重啟與正式 30/60/120/240 秒 backoff 驗證五次上限；
C221–C224 改用真 referral BFF、browser、HttpOnly session 與 PG handoff ledger。
required-cases 仍要求全部24案；四個 NAV identity 移到 `navigation-uat.spec.ts`，沒有刪除或放寬 gate。

### 實作／fixture 邊界與已知失敗

- `3f346cc13944407570bb22df51ffb3896ccaa8d2` 增 C216：外部 receiver 在驗簽並 durable
  接收後固定回503；正式 outbox 是唯一 retry owner。第一次失敗後重啟完整 API，終止重試後再重啟；
  五個 receiver request 必須同 bytes/hash/delivery ID，於每次 durable next_attempt_at 之後發生。
  不改 DB due date／lease／policy、不自行 send；檢查終態、無 acknowledged receipt、單筆 inbox。
- `8621e6fbad79a129d5e0a38459f7cfc69df28c88` 為恢復用 checkpoint，nested `test.use({trace:'off'})`
  被 Playwright collection 拒絕；未 dispatch tenant UAT，非產品失敗。原 `--list | tail` pipeline
  只回傳 tail 的exit0，診斷並未通過；後續改成直接 `--list > .local/.../collection.txt` 核對真 exit0。
- `ae4b1d690733128bd6f0f8a14b654946622517f8` 將 NAV 獨立到允許 top-level trace option 的 spec；
  collection24成功。hosted run36348414924 / job108702186746 已 completed failure 並讀完：
  partner **0 passed / 5 failed / 19 not-run**。C221–C223 在 BFF consent grant 得400；
  C224及C201 beforeAll因重複 setup 觸發 step-up429。不能把這些 setup 問題算正式導航負向通過。
- QA原因定位：Next production session cookie 保留 Secure；Playwright1.59.1
  `Cookie.matches` → `network.isLocalHostname` 僅允許 localhost／\*.localhost 的HTTP例外。
  實際非serving probe：HTTP127.0.0.1=false、HTTPS127.0.0.1=true、HTTPlocalhost=true。
  `a1395e634ecfab61de89ac4e73637de6c98d9528` 將 hosted referral origin/entry host/allowlist
  一致改 localhost:3002；step-up setup 僅遇429時依 Retry-After（最多60秒）等待一次，再要求201。
  不關閉 throttle、不重試成功mutation、不宣稱rate-limit產品驗收。
- C221 真瀏覽器 GET handoff → consent → 原行程頁，檢查 HttpOnly、replay、PG120s。
  再點實際取消按鈕，核對POST/PG，舊handoff頁須讀到已更新狀態，新resolve須導向cancelled。
- C222 逐項拒絕 wrong entry/subject/key/tenant resolve與三種consume，保留原cookie、不消耗他人handoff；
  真history/receipt HTTP read 必須拒絕他人行程，不能以假CONFIRMED回應當成功。
- C223 的外部邊界明列為「夥伴 logout 清掉 WebView cookie jar」；之後真BFF拒絕舊consumed artifact，
  fresh其他subject登入後三種入口拒絕stale前subject。這不是原生App logout整合、8h expiry等待或
  server-side signed-cookie revocation驗收，不關閉SR-LIVE-PUSH真機gate。
- C224 每個 GET/JSON/form consumer 的正向與跨入口 replay，另驗受保護API consume409，
  external returnTo拒絕／same-origin保留，實際等待120秒到期。未加長或繞過正式TTL。
- NAV trace刻意關閉，避免handoff/cookie credential進上傳附件；保留真browser截圖、PG ledger、
  遮罩狀態證據。ae4b1d69 ZIP已查無NAV trace.zip；C205仍保留既有失敗trace。

### R12：history BFF 對不存在於授權清單的行程回造成功

來源：`apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts:11–15` 的
`GET` 在 `getReferralTripHistoryServer()` 已過濾的 items 裡找不到指定 orderId，仍回
`{ok:true,data:{orderId,status:'CONFIRMED'}}`／HTTP200。其正式上游為
`lib/embed-booking-api.ts:getReferralTripHistoryServer` →
`OwnedMobilityController.listReferralPassengerHistory` →
`OwnedMobilityService.listReferralPassengerHistory`（核對entry/subject/tenant/partner/program）。
BFF fallback 會抹掉上游的「查無授權行程」；不以此反例宣称洩漏真實他人行程資料。

非serving最小反例：
`node .local/sr-partner-notify-qa-20260927-unit7/probe-history.cjs`，exit0，Node22.23.2。
以 `git show` 載入196f09b0與ae4b1d69的原GET，TypeScript僅transpile，NextResponse用實際Next套件；
只替代外部授權history回傳 `owned-order/cancelled`。兩SHA皆 own→200/cancelled，
foreign→200/CONFIRMED。測到的是原handler控制流程；不 mock 此查找/fallback。
原probe與JSONL在本worktree `.local/sr-partner-notify-qa-20260927-unit7/`。

請 Supervisor 以 agy owner/Codex reviewer 排最窄 child/scope：上述BFF route及相應NAV負向unit；
確認 clients 對deny envelope的處理，保留合法own read。必要回歸：wrong subject、同tenant兩entry、
跨tenant、未知order、無session、正常own歷史；不以fake status/fallback掩飾失敗，不由QA改產品。

### 本機檢查與既有阻塞

Node22.23.2、pnpm10.33.0、Python3.12.3。
`pnpm exec tsc --noEmit -p .local/sr-partner-notify-qa-20260927-unit7/tsconfig.json`、
QA E2E scoped ESLint與 `git diff --check` exit0；`python3 -m unittest
 tools.ci.test_tenant_uat_acceptance_workflow` **64 passed**；QA Vitest **12 passed**。
Playwright `--list` **24** 案，只代表collection，沒有本機runtime／DB／browser。
四dependency mergeSHA均是ancestor；本輪新commits trailers合規，普通push、未force/rebase/amend。

以上合規紀錄截至676b3359。後續6f3a1e36的三個trailers存在，但Codex誤用`test(TASK-ID)`
subject，被現有regex拒絕；R8因此是17個繼承失敗加本輪1個新失敗，**共18**。
不以新增正確commit消除祖先失敗，不改寫已發布歷史。84c5d9e3單commit格式檢查exit0。

既有R5日期DTO/picker/translation、R10 snapshot SQL42P08、R11 entry持久化race，及
R9 transport/security-tests scope、R8 preserving-refs history recovery仍需Supervisor排產品修復。
這些finding保留原單元定位，不以新增案例替代修復。

### 單元7已讀完的 hosted checkpoints

| 程式 SHA                                   | run／job                                                                                                                               | partner 結果                                                                                                                                       | artifact／SHA256                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `3f346cc13944407570bb22df51ffb3896ccaa8d2` | [36347973557/108700947475](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36347973557/job/108700947475) completed failure | **17 pass / 3 fail (C205/C218/C217) / 0 skip**；C216 **457.856秒 passed**；當時NAV四案尚未包含                                                     | `10941279820` / `ba4e1a1e7d4b0715f9105ed1a5cc40385cc83f2ff63ff34810b50700dc725e84` |
| `ae4b1d690733128bd6f0f8a14b654946622517f8` | [36348414924/108702186746](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36348414924/job/108702186746) completed failure | **0 pass / 5 fail / 19 not-run**；NAV consent400、後续setup429                                                                                     | `10941537383` / `3bc3738d41c78c28672f50d8fb5328744fa6cc6a548e21ec7094f3e86c1db67a` |
| `a1395e634ecfab61de89ac4e73637de6c98d9528` | [36348975121](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36348975121) completed cancelled                             | 發現C216污染下一fixture後取消，實際停於webhook unit step；API/browser未啟動，run-status **not_run**                                                | `10941985632` / `8a346480638a1123b79c44b6e297a4592f6291f9d230602b9d39c006e20d5f37` |
| `7f0032c512bcae1f59028f6217c5fb692c93e5dd` | [36349279855/108704646111](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36349279855/job/108704646111) completed failure | **20 pass / 4 fail (C222/C224/C218/C205) / 0 skip**；C216 endpoint cleanup及C217通過；C221/C223真browser通過；C224 direct replay遇429，未到TTL     | `10941713690` / `066a974df4c3c1ac8bcbf8969933eaa76f767365f5d7777fa3a0822f10bebc39` |
| `6f3a1e3659417fcafe1ed8566a13f3c0f87654bf` | [36350774384/108708902951](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36350774384/job/108708902951) completed failure | **18 pass / 4 fail / 2 skip**；C224 **183.268秒 passed**；C222/R12、C218/R10 failed；C216清理step-up403、C217 setup JWT_INVALID，C219/C205 skipped | `10942523183` / `8a3f15a73ab39e4e846d065997d3f611c7b6fa46a3fc6954e6cb7d3150a902d1` |
| `84c5d9e3cf499863de0b2838892508b3972e8093` | [36352402864/108713466759](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36352402864/job/108713466759) completed failure | **21 pass / 3 fail (C205/C218/C222) / 0 skip / 0 flaky**；C216含cleanup **460.020秒 passed**，C224 **183.300秒 passed**；C217/C219亦passed         | `10942708339` / `ec817672a9b74666539e7fe2cca0e3b01c6d55157cb17f9d2ec7bb137ac063a9` |

3f346cc13、ae4b1d69、7f0032c5、6f3a1e36、84c5d9e3各自同SHA的tenant291（PG21）、webhook34、tenantHTTP10、webhookE2E1，
及C111–C115/restart verified15均passed；dedicated partner-unit step skipped，strict gate failed。
Cancelled a139僅已完成tenant291，不能借前述runtime綠燈。所有ZIP與report execution SHA均讀回核對。

3f C216附件 `five-attempts-api-restart`：API PID15120→18711→21485；HTTP503五次時間為
20:36:13.434 / 20:36:44.118 / 20:37:44.166 / 20:39:44.319 / 20:43:44.635 UTC，均在正式due時間後，
同hash `aa829589b2b4130337bd316366b5b58823093cd1166e3771de818b285f43e4ef`。
前四次automatic，第五次terminal；兩次重啟保留outbox/delivery identity，沒有第六次外送。
C217後續失敗的原因是共享endpoint按治理規則停用；7f0032c5透過正式endpoint/binding重測恢復fixture，
再確認終態outbox與五次receiver count不變。7f0032c5的C216 **458.264秒 passed**，C217亦passed。

### NAV throttle與長時間fixture認證的相鄰結果

7f的C222附件`navigation-cross-scope`已讀：四種wrong entry/subject/key/tenant resolve均403；
三種consume為403/400/400且未消耗foreign handoff；receipt讀回400/ok=false，history卻200/ok=true，
回造foreign order的成功狀態。**R12已有真hosted HTTP重現**，不只前述非serving probe。
C221實際取消行程與最新頁面、C223其他帳戶行程截圖已讀；仍保留清cookie與native邊界。

6f3a1e36為C224在簽發handoff前自然等待61秒，尊重正式`OPEN_ROUTE_RATE_LIMIT`的30/min。
三次positive consume，各跨GET/JSON/form replay為403/400/400，受保護direct consumer必須409；
same-origin returnTo保留、external拒絕、自然120秒到期後不消耗ledger均通過。
沒有把429當replay防護，也沒有調整正式TTL或limit。

6f後段失敗是fixture生命週期：`JwtAuthService.SERVICE_EXPIRES_IN=15m`，step-up policy
freshness=10min；先前NAV自然等待讓共用seed credential變舊。C216已完成五次／兩次重啟的核心
斷言並產生附件，但最後正式endpoint重測的step-up403使**整案failed**；下一worker setup的
platform JWT已失效，C217 beforeAll失敗，C219/C205未執行。不能借7f結果補成6f全pass。

84c5d9e3新增hosted-only `fixture-sessions.ts`，沿既有seed的可信測試認證邊界：compiled
full AppModule的`verifyAccessToken`先檢查原credential及durable authority有效，再由正式
`issueSessionToken`為同一principal/roles/scopes建立新session，重新驗durable validity。
只在fixture開始、C216開始前呼叫；不延長舊session、不接受過期/revoked authority、不改JWT／
step-up／通知TTL。新secret只經0600暫存檔回傳並刪除，不進CLI參數/stdout/report。
這不是產品refresh endpoint或MFA登入驗收；原API所有認證與step-up guard仍執行。
本機tsc／scoped lint／collection24／84c單commit check均exit0；run36352402864已讀完。

84c最終附件核對：C216 API PID15022→20291→23630；五次503於21:51:11.469、21:51:42.076、
21:52:42.113、21:54:42.225、21:58:42.481 UTC，全部同wire hash
`7cc5cd3ed74588623192876d16faab77a74f3826c3b19d5fcba4a0efd6884dd3`，無第六次；正式endpoint與
binding重測恢復後，原terminal outcome/count不變。C224三個consumer各自正向後，跨入口皆403/400/400、
direct皆409，same-origin returnTo保留／external拒絕與自然120秒到期皆完成。C221/C223亦同SHA passed。

84c C205仍是產品失敗：離線讀取`d6d16.../trace.zip`，delivery HTTP200的created_at/expires_at/
next_attempt_at均{}、React **#31**；tenant webhook picker仍400 **TENANT_ID_REQUIRED**。
C218仍正式repository SQL42P08，後續ETA/取消arrival斷言未到達；C222仍foreign history200/ok=true，
receipt400/ok=false。R11沒有產品修復，bounded prerequisite readback只讓fixture可建立。
最新JSON的candidate_sha/workflow_sha均為84c；24案逐title與manifest一致，三個PG suite各7 passed。
dedicated partner-unit step **skipped**，strict overall gate **failed**，不能把上述21pass當全套驗收。

### 單元7 finding／required_acceptance disposition（84c結果已讀完）

| Finding／驗收                                                  | source／修改                                                                                  | 舊→新／證據                                                                                             | 尚未满足                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| R1 C216                                                        | `PartnerNotificationWorker`、claim/context/outcome、tenant單attempt façade；QA restart helper | 196f缺案→3f/7f pass→6f stale fixture auth失敗→84c整案與cleanup pass                                     | C218產品SQL未修，完整受控矩陣未通過                                 |
| R5 C205／C221–C224                                             | `NavigationFixture`、真BFF/session/PG、取消control；原delivery DTO/picker/translation         | 84c C221/C223/C224同SHA passed；C205仍Date{}／React31／picker400；C222見R12                             | Supervisor安排原產品owner；native/logout/session-revocation限制保留 |
| R12 fabricated history                                         | 原BFF `GET`、正式過濾history，上述最小probe                                                   | 7f/6f/84c真HTTP：foreign receipt400，history200/ok=true                                                 | Supervisor agy child/scope；合法own與wrong-scope回歸要求見上文      |
| R8 publication history                                         | commit subject/trailer gate                                                                   | 現18個失敗，含Codex本輪6f subject；後續84c/191d格式檢查pass不抵消祖先                                   | preserving-refs recovery，不force/rebase/amend                      |
| R9 transport/security scope                                    | `partner-notification-https.ts:63`、原security tests；workflow local flag邊界                 | 一般CI仍no-require-imports；QA scoped lint pass不代表產品lint pass                                      | Supervisor排產品與原test scopes；不解除安全gates                    |
| R10 snapshot SQL                                               | `OwnedMobilityRepository.persistChangesWithExecutor`，單元5 caller/scope                      | 84c C218仍42P08；後續ETA/取消/receipt斷言未執行                                                         | agy產品修復＋真PG transaction/supersede回歸                         |
| R11 entry durability                                           | `createPlatformPartnerEntry`，單元6 caller/scope                                              | 原POST201→binding FK失敗反例保留；QA bounded readback不是產品修復                                       | await durable write、傳遞失敗、同SHA立即binding回歸                 |
| R2/R3/R4/R6/R7 證據邊界                                        | 原gate/evidence/publication/PG/transport finding                                              | strict manifest全24保留；84c PG21/21；草稿PR2179保留SHA身份；production transport拒絕的local probes如前 | 無review/merge/full acceptance；security scope仍見R9，B/C未執行     |
| `integrated_controlled_receiver_negative_matrix_same_sha`      | SD14全24案／manifest／原gates                                                                 | **NOT MET**                                                                                             | C218/R10及R11產品修復，之後新同SHA完整矩陣                          |
| `navigation_and_admin_ui_hosted_real_runtime_evidence`         | NAV/管理UI真runtime                                                                           | **NOT MET**                                                                                             | C205/R5、C222/R12未修                                               |
| `existing_webhook_tenant_gates_preserved_and_live_not_claimed` | 原獨立tenant/webhook/restart gate與A/B/C邊界                                                  | **NOT MET**；上述既有gate有逐SHA正向證據但完整run未過                                                   | strict gate與未解R9；A未放行，B/C仍SR-LIVE-PUSH-001                 |

CI36347968917／36348413247／36348971044／36349265466均completed failure，讀過log，
同17歷史commits與scope外transport no-require-imports。中途8621的CI36348320920 completed cancelled。
Integration36347968868／36348320921／36348413295／36348971038／36349265476均completed success，
主要product jobs skipped，不能稱產品回歸通過。尚未handoff、review/merge或記錄三項acceptance。

676b文件CI36349684853 completed failure/read（17 inherited＋transport lint），integration36349684827
completed success/main jobs skipped。6f CI36350755940 completed failure/read（**18** subject/trailer
＋transport lint），integration36350755933 completed success/main jobs skipped。
84c CI36352396249及191d文件CI36352551655均completed failure/read，仍18個subject/trailer與
transport lint；integration36352396297／36352551647均completed success/main jobs skipped。
不改寫先前失敗或把partial/assertion附件當整案通過。

本輪證據在worker `.local/sr-partner-notify-qa-20260927-unit7/`，另保存到canonical root
`/home/lupin/workspace/drts-fleet-platform/.local/sr-partner-notify-qa-20260927-unit7-codex-84c5d9e3/`。
最後文件checkpoint的完整head／CI結果另記canonical task狀態與該目錄`final-checkpoint.json`；
文件SHA不冒充84c runtime SHA。後續需Supervisor排agy owner/Codex reviewer產品child／scope與R8 recovery；
不handoff、不done、不關閉三項acceptance，也無shared-dev部署或真夥伴／裝置宣稱。
