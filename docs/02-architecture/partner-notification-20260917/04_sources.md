# Sources and Case Matrix

正式依據：同目錄 `01_system_sa_sd.md` §4–14 與 `02_partner_integration_contract.md`
§3–9（canonical root可讀，未把held設計複製發布）。完整finding/SHA與證據沿用
[原UAT artifact](../../04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md)。

## SD §14 Case Matrix

| Scenario                                         | 正式期望與現有位置                                                                                             | 驗收狀態                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 正向worker delivery                              | C201；200/201/202 + 相符durable accepted/duplicate receipt；partner_accepted，downstream unknown               | 58081594 C201真worker/PG/receiver passed（非全矩陣）   |
| accepted後timeout與dedupe                        | C202；大於10秒deadline、同notification/delivery/body hash、同receipt duplicate、只入列一次                     | 58081594 C202 passed；同bytes/receipt duplicate        |
| 缺route                                          | C203；typed route_missing/manual_only、不猜entry、receiver count=0                                             | 58081594 C203 passed；typed reason、零外送             |
| 204、HTML200、錯receipt                          | C204/C212；partner_ack_invalid/manual_only，不能自動retry                                                      | 8039453e C204與C212五種invalid ack均passed             |
| 同tenant兩entry、跨tenant同URL、同住戶兩App      | 僅原entry/tenant/subject收到，payload不串單                                                                    | 0638617e C206/C207/C208 passed；C208含resolve隔離       |
| entry移轉與link撤銷                              | 舊消息不移轉；owner_changed/manual_only與recipient_revoked/terminal；零外送                                    | 0638617e C209/C210 passed；C210注入撤銷狀態，非撤銷API驗收 |
| endpoint停用、secret輪替重測、未配置availability | 明確configuration_blocked；測試就緒後才enable                                                                  | 0638617e C211 passed；availability C220仍缺             |
| ack後DB失敗、lease/fence、兩worker競爭           | durable transaction、舊fence不可commit、dedupe且單retry owner                                                  | PG歷史21/21；缺整合fault evidence                      |
| maxAttempts=5與expiry                            | 總共五次、最多四次retry、超expiresAt停止                                                                       | 8039453e C217過期零外送passed；C216仍缺                 |
| 舊ETA、取消後舊到場、payload confidentiality     | superseded/obsolete terminal；缺driver情報不洩漏敏感資料                                                       | 8039453e C219真wire allowlist passed；C218仍缺          |
| admin readiness/stage/failure與手動retry         | C205；真route/auth、點control、觀察request及durable readback                                                   | C205真browser fail：日期DTO為{}，React崩潰；picker400  |
| notification-navigation                          | fresh single-use handoff、HttpOnly session、returnTo、最新ride readback、錯entry/subject/logout/account switch | 缺hosted runtime案例                                   |
| 一般tenant webhook C111–C115與restart            | 獨立既有gate不可由partner數量取代                                                                              | 8039453e既有reports passed；tenant restart verified15 |

## Acceptance Matrix

- `integrated_controlled_receiver_negative_matrix_same_sha`：**NOT MET**（R1/R2/R6/R9）。
- `navigation_and_admin_ui_hosted_real_runtime_evidence`：**NOT MET**（R5）。
- `existing_webhook_tenant_gates_preserved_and_live_not_claimed`：**NOT MET**（R2/R3/R9）。

A：DRTS受控receiver/PG/browser全套同SHA通過才是 `controlled_receiver_verified`；目前未達。
B：`SR-LIVE-PUSH-001` 真夥伴HTTPS request/response、receipt/outbox才是 `partner_endpoint_verified`；未執行。
C：真夥伴native App背景/冷啟動通知與fresh handoff正確ride（支援雙平台須iOS/Android）；未執行。
A不能代替B，B不能代替C；本案無真夥伴/真機通過宣稱。

## Pinned Evidence

最新獨立review候選 `62962c9eb4bc10652c9e8314cc145064fa3c56ff`：REOPEN；
[run36331863431](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36331863431/job/108655212817)
API build failed、runtime skipped，artifact10936380053；完整hash在原UAT artifact。

交接checkpoint `91b1d4ac122b1373ac7beb05df902cb991b62232`：
[run36333604497/job108660116702](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36333604497/job/108660116702)，
artifact10936532926，ZIP SHA256 `4307d12373836309d2e565e00de208ab1c912d104efdf8f597914da14381f0e8`。
unit280/280、PG21/21是真實該SHA歷史；partner E2E fail、restart skipped；整體failed。
本輪修復仍在進行，尚未handoff新candidate，不把歷史綠燈帶到新SHA。

## 本輪 gate 修復（不等於 runtime acceptance）

`tests/unit/system-remediation/sr-partner-notify-qa-20260917/required-cases.json`
凍結逐suite/case身份與C201–C224整合需求；單元1時C206–C224缺實作；單元2已補C206/C207，C208–C224仍缺，gate必須拒絕缺案例。
`probe-gate-regression.py` 實際執行兩個相鄰舊候選PY_GATE與本輪PY_GATE：
六種漏驗輸入old exit0→new exit1，完整synthetic報告皆exit0。
64 workflow tests、API typecheck通過；此處不將synthetic gate稱產品280/284或PG通過。
詳細命令、邊界與剩餘R1/R5/scope限制見原UAT artifact「Codex 修復單元1」。

修復checkpoint `5db78fdc185c6a7be6a110a691df3ff99d00e307` 已在
[草稿PR #2179](https://github.com/ajoe734/drts-fleet-platform/pull/2179) 發布，未handoff。
[CI run36335019850](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36335019850)
已完成failure：17個繼承commit trailers + scope外transport動態require的API lint。
Integration run36335019853主要工作skip，不是產品通過；完整job/source證據沿用原UAT artifact。

## 單元2 source／case 邊界

`controlled-receiver.ts` 在原始bytes驗HMAC與tenant/entry/recipient後，以fsync/atomic rename
同時持久化dedupe + pending native delivery；`WebhookDispatchService.dispatchAttempt` 的
7個本機boundary tests驗accepted/duplicate等契約，**不代表真夥伴／原生投遞**。
`partner-fixture.ts` 沿正式HTTP governance/handoff/建單；`enqueue-notification.ts` 僅將
synthetic event交正式 `OwnedMobilityRepository.persistChanges` transaction分配sequence，
不手造route/link/schema。C201–C204/C206/C207驗真worker與typed outcome；C205改真管理UI
重送control。以上6個worker/runtime案例已通過，UI仍fail；完整逐SHA結果見原UAT artifact「修復單元2」。
最新程式 `580815945070942923d5c5740a5ae807a0d4e769` 的
[run36339890321](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36339890321) completed failure；
同SHA unit291/291（PG21）、webhook34/34、tenant HTTP10/10、webhook E2E1/1，partner6 passed/1 failed/0 skipped；
C113–C115/restart skipped。Artifact10938113863/hash與相鄰失敗歷史均在原UAT artifact。
三項required_acceptance仍NOT MET；C208–C224缺實作，沒有handoff新review candidate。
R5產品定位：repository raw PG Date → deepToSnakeCase {} → panel React error #31；
webhook picker的tenant header被control-plane proxy blocklist移除而400；accepted_unknown raw-key probe亦成立。
上述產品scope/child與既有transport/history修復仍需Supervisor協調，不能弱化fixture斷言、auth或gate。

## 單元3 source／case 邊界

程式 `8039453e93b7aa78ff6cb56b1f99b31066c73955` 的
[run36341144117/job108681345612](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36341144117/job/108681345612)
completed **failure**，partner **10 passed／1 failed／0 skipped**：新增C209、C212、C217、C219
與既有C201–C204/C206/C207均passed；C205仍Date→{}／React31、picker400。
Artifact10938394046，ZIP SHA256 `6d0485e24d7e01a53038dc2df301b677186c090dc20fdf119e54e60892423ac0`。

`PartnerNotificationTransport.send/resolve`、`resolveNotificationRoute`、正式worker/claim/outcome、
正式entry API均未mock。C209只延後synthetic event的排程後以API移轉tenant；C212只污染外部
receiver response（HTML200／錯notification、delivery、entry／缺receipt），DRTS仍須拒絕；
C217/C219只提供synthetic expired/private-canary事件，經 `OwnedMobilityRepository.persistChanges`
寫入與分配sequence，再驗真PG outcome和receiver raw bytes。詳情沿用原UAT artifact。

同SHA unit291（PG21）、webhook34、tenant HTTP10、webhook E2E1皆passed；原tenant restart
report verified15、C111–C115既有capability report passed。既有gates移到partner faults之前，
不再被C205失敗跳過，未改寫原harness邏輯或擴稱真實外部驗收。Partner獨立unit step skipped、
strict gate failed、run-status failed；本機Python64／QAunit12／scoped tsc+lint完成pass。
R5/R8/R9產品與history blockers未解；13個必需case仍缺，三項required_acceptance **NOT MET**，
沒有新candidate handoff／merge／live或device通過宣稱。

## 單元4 source／case 邊界

最新程式 `0638617e08b2773870b4813081c3e2446af414a9` 的
[run36343023791/job108686675674](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36343023791/job/108686675674)
completed **failure**：partner **13 passed／1 failed／0 skipped**，新增 C208/C210/C211 passed，
C205 仍是 React31／Date→{}／picker400。Artifact10939418920，ZIP SHA256
`31aeb175ab07e6fe254d6b81587349f37f8b33724eebff513bb08dc232b1511a`。

C208 沿真 handoff／建單／worker 驗兩 App 同住戶的 entry／subject 隔離，2 個自身 resolve
成功與6個拒絕；只驗 resolve，不能代替完整 NAV。C210 在 V0030 正式表對既有測試 link
注入 revoked 狀態，真 `PartnerUserIdentityLinkRepository.find`／façade／worker 必須拒送，
NAV亦拒絕；另一 entry 及還原後新事件仍正向，舊 terminal 不重送。現無 revoke writer/API，
故不是撤銷管理流程驗收。C211 全部沿 HTTP governance＋step-up，輪替後先驗 endpoint test
不足，再經 binding test/enable 才可送；真 receiver HMAC驗 version2，blocked舊事件不自動重送。

相鄰 `1b279b880e0fa5f513ac84cb4ba8f1d3d1434b0b` /
[run36342461507](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36342461507)
是12pass/2fail：C210清理SQL型別衝突、C205產品缺陷；前者以明確text cast及restore readback
修正後重跑，不能把首輪算通過。完整相鄰 SHA／hash／命令／限制沿用原 UAT artifact「單元4」。

兩次各自同SHA unit291（PG21）、webhook34、tenant HTTP10、webhook E2E1、C111–C115與
restart verified15 passed；partner獨立unit step skipped、strict gate failed。一般CI仍因17個
歷史trailers及scope外transport lint失敗，integration主要jobs skipped。新增程式scoped tsc/lint
通過、本機QA12 passed（boundary）；無VM服務、handoff或live/device完成宣稱。
C213–C216、C218、C220–C224共10個必需case仍缺，R5/R8/R9 blockers與三項acceptance **NOT MET** 保留。
