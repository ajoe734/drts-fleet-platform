# Sources and Case Matrix

正式依據：同目錄 `01_system_sa_sd.md` §4–14 與 `02_partner_integration_contract.md`
§3–9（canonical root可讀，未把held設計複製發布）。完整finding/SHA與證據沿用
[原UAT artifact](../../04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md)。

## SD §14 Case Matrix

| Scenario                                         | 正式期望與現有位置                                                                                             | 驗收狀態                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 正向worker delivery                              | C201；200/201/202 + 相符durable accepted/duplicate receipt；partner_accepted，downstream unknown               | 58081594 C201真worker/PG/receiver passed（非全矩陣）   |
| accepted後timeout與dedupe                        | C202/C213；大於10秒deadline、同notification/delivery/body hash、同receipt duplicate、只入列一次                     | 8c23e9a0 C202/C213 passed；C213重建receiver物件讀durable inbox |
| 缺route                                          | C203；typed route_missing/manual_only、不猜entry、receiver count=0                                             | 58081594 C203 passed；typed reason、零外送             |
| 204、HTML200、錯receipt                          | C204/C212；partner_ack_invalid/manual_only，不能自動retry                                                      | 8039453e C204與C212五種invalid ack均passed             |
| 同tenant兩entry、跨tenant同URL、同住戶兩App      | 僅原entry/tenant/subject收到，payload不串單                                                                    | 0638617e C206/C207/C208 passed；C208含resolve隔離       |
| entry移轉與link撤銷                              | 舊消息不移轉；owner_changed/manual_only與recipient_revoked/terminal；零外送                                    | 0638617e C209/C210 passed；C210注入撤銷狀態，非撤銷API驗收 |
| endpoint停用、secret輪替重測、未配置availability | 明確configuration_blocked；測試就緒後才enable                                                                  | 8c23e9a0 C211/C220 passed；full AppModule route readiness false→true |
| ack後DB失敗、lease/fence、兩worker競爭           | durable transaction、舊fence不可commit、dedupe且單retry owner                                                  | 3f346cc13 C214/C215/C216 passed；真rollback／自然lease／兩process／API restart |
| maxAttempts=5與expiry                            | 總共五次、最多四次retry、超expiresAt停止                                                                       | 3f346cc13 C216五次上限passed；C217共享endpoint停用的setup已修，7f待驗                 |
| 舊ETA、取消後舊到場、payload confidentiality     | superseded/obsolete terminal；缺driver情報不洩漏敏感資料                                                       | 8c23e9a0 C219 passed；C218正式repository SQL42P08，後續未驗 |
| admin readiness/stage/failure與手動retry         | C205；真route/auth、點control、觀察request及durable readback                                                   | C205真browser fail：日期DTO為{}，React崩潰；picker400  |
| notification-navigation                          | fresh single-use handoff、HttpOnly session、returnTo、最新ride readback、錯entry/subject/logout/account switch | C221–C224已實作；ae4b1d69 setup失敗，7f0032c5 hosted待驗                                   |
| 一般tenant webhook C111–C115與restart            | 獨立既有gate不可由partner數量取代                                                                              | 8039453e既有reports passed；tenant restart verified15 |

## Acceptance Matrix

- `integrated_controlled_receiver_negative_matrix_same_sha`：**NOT MET**（R1/R2/R6/R9/R10/R11）。
- `navigation_and_admin_ui_hosted_real_runtime_evidence`：**NOT MET**（R5/R12）。
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

## 單元5 source／case 邊界

最新程式 `8c23e9a07fdd6ed858199f06a180325d356d5179`，
[run36344513008/job108690910239](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36344513008/job/108690910239)
completed **failure**：partner **15 passed／2 failed（C205、C218）／0 skipped**。
新增 C213/C220 passed；Artifact10940415836，ZIP SHA256
`ce1d2c4fd1edaf4289e2a3330d0c0160437947b56de8b9efa2fd5e1bbe1454eb`。
同SHA unit291（PG21）、webhook34、tenant HTTP10、webhook E2E1、C111–C115與restart15
皆passed；partner独立unit step skipped、strict gate failed。原gates及B/C live限制全保留。

C213沿真10秒timeout及30秒backoff，在外部receiver物件重建後從fsynced inbox讀原receipt，
兩次request完全相同bytes/hash，第二次回duplicate，只有一筆pending native delivery；
沒有真的原生投遞，也不是receiver OS process restart。C220以正式API建立第四entry但不綁定，
無binding/test_pending都configuration_blocked且零外送；`probe-availability.ts` 在hosted
啟動／關閉compiled full AppModule context、真DI/repos，route readiness false→true；
只有正式test/enable後的新事件可送，舊held不自動解封，沒有provider override或fallback。

C218第一次正式 `OwnedMobilityRepository.persistChanges` 即遇 **42P08**：
`persistChangesWithExecutor` snapshot CTE同 `$7` 用於timestamptz及text，
`text versus timestamp with time zone`；不是fixture自己SQL。完整typed snapshot是明列的
上游synthetic邊界，正式migration/schema/repository/transaction未mock；未驗派車資格流程。
新 **R10** 請Supervisor安排agy修復child/scope：
`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts:1803–1843`，
保留snapshot/outbox/sequence原子性並回歸初次/v2 supersede/replay/rollback/C218。
最小重現、實際stack、affected callers及修正邊界均沿用原UAT artifact「單元5」，不繞過產品SQL。

C205真browser仍React31／Date→{}／picker400；R5/R8/R9原scope/history blockers仍在。
C214–C216、C221–C224 **7**案未實作，C218已實作但阻塞；三項required_acceptance **NOT MET**。
沒有handoff／merge／真夥伴或裝置驗收宣稱。

## 單元6 source／case 邊界

程式 `6d6fdb77c8db54c45c99a36af6f75a5573f09648`，
[run36346488294/job108696546272](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36346488294/job/108696546272)
completed **failure**：partner **17 passed／2 failed（C205、C218）／0 skipped**，
新增 C214/C215 **passed**。Artifact10940424368，ZIP SHA256
`7678c78d96b71a2c369b51976441c340d1a8004b128a2a516d8d0303d5b0d477`。
同SHA unit291（PG21）、webhook34、tenant HTTP10、webhook E2E1、C111–C115／restart15
均passed；partner獨立unit step skipped、strict gate failed。B/C live gates全保留。

C214只用正式表 trigger 注入單筆 outcome 寫入例外，非交易式 sequence 證明觸發一次；
真 `recordPushDeliveryOutcome` 必須 rollback receipt/context/outbox metadata，原 immutable
context 與 claim 保留。等待正式120秒lease自然到期後，真 worker以同bytes/hash/receipt重送，
accepted→duplicate、fence1→2，只有一筆inbox及成功receipt。`probe-stale-outcome.ts` 呼叫
compiled production repository 拒絕舊 fence1，讀回不變；没有改 DB時間或合成ack。
C215用 `competing-worker.ts` 啟動第二個 full AppModule OS process，無provider override。
PG row lock同步兩個真scheduler，pg_stat_activity證明兩個claim都等鎖；勝者僅一次外送，
released fence拒寫，child正常close/exit0。C215不是跨lease慢HTTP測試，該舊fence證據在C214。

前輪 `068a990e119e385b310378713a492957b842444f` 的
[run36346008535](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36346008535)
是 **0pass／1fail（setup）／18not-run**，Artifact10940264658，ZIP SHA256
`d50118d9bb5723f23df81070b54e9cbcf408c18f9eb927adbee1fcd722636c85`。
新 **R11**：entry POST201後 binding PUT500，PG container log明示entry_slug FK缺entry；
service `createPlatformPartnerEntry` 未await `persistChanges`。QA增加bounded PG prerequisite
readback才繼續binding；沒有重試500或手寫entry SQL，**產品競態未修**。
完整最小重現、affected callers、Supervisor agy scope／必要回歸在原 UAT「單元6」。

C205仍React31／日期{}／picker400；C218仍正式snapshot SQL42P08，後續未驗。
C216、C221–C224共 **5** 案未實作；R5/R8/R9/R10/R11保留，三項acceptance **NOT MET**。
本機tsc/lint/diff0、QA12／Python64、兩新commit trailers passed；一般CI仍17 inherited trailers
及scope外transport lint，integration主要jobs skipped；原artifact保留所有逐SHA失敗紀錄。


## 單元7 source／case 邊界

C216使用正式 `PartnerNotificationWorker`、`claimPartnerNotification`／context／outcome transaction，
`TenantPartnerService.dispatchNotificationAttemptByWebhookId` 一次遠端送出；QA receiver僅外部固定503。
3f346cc13 [run36347973557](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36347973557)
**C216 passed457.856秒**：自然30/60/120/240秒退避、共五次、兩次真API重啟、同wire/hash/ID，
terminal後無第六次；沒有改DB時間或手動send。該run partner17pass/3fail，仍不是完整A層。

NAV四案改放 `navigation-uat.spec.ts`，manifest保留全部24案。
真resolve→fresh120s handoff→GET/JSON/form BFF→HttpOnly session／正式PG replay ledger；
C221含實際取消按鈕與最新行程狀態讀回，C222含wrong scope及history/receipt read，
C223明列外部partner logout清cookie邊界（不是原生整合或server cookie revocation），
C224含三種consumer互相replay與direct API consume、returnTo與自然TTL。
NAV trace關閉以免上傳handoff/cookie，保留實際截圖與遮罩證據。
ae4b1d69首次hosted因Secure-cookie origin及setup429失敗；7f0032c5修為localhost並尊重throttle、
恢復C216耗盡後endpoint readiness，完整run36349279855 **執行中**，不能預填pass。

R12 source：`app/api/referral/history/[orderId]/route.ts:GET` 對上游授權history未包含的ID
回造200/CONFIRMED。原handler+實際NextResponse的非serving probe在196f與ae4b均重現；
只stub外部授權history，不mock GET，不宣稱真實他人資料洩漏。修復scope/必要回歸與各SHA/run/
artifact/hash、全部未解findings／三項acceptance **NOT MET** 逐項沿用原UAT「修復單元7」。
