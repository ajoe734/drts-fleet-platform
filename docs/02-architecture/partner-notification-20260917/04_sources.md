# Sources and Case Matrix

正式依據：同目錄 `01_system_sa_sd.md` §4–14 與 `02_partner_integration_contract.md`
§3–9（canonical root可讀，未把held設計複製發布）。完整finding/SHA與證據沿用
[原UAT artifact](../../04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-QA-20260917.md)。

## SD §14 Case Matrix

| Scenario                                         | 正式期望與現有位置                                                                                             | 驗收狀態                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 正向worker delivery                              | C201；200/201/202 + 相符durable accepted/duplicate receipt；partner_accepted，downstream unknown               | 單元2已改權威fixture；hosted setup仍失敗，未驗       |
| accepted後timeout與dedupe                        | C202；大於10秒deadline、同notification/delivery/body hash、同receipt duplicate、只入列一次                     | 單元2已改durable receiver；待hosted案例執行          |
| 缺route                                          | C203；typed route_missing/manual_only、不猜entry、receiver count=0                                             | 單元2要求typed reason/no-send；待hosted執行          |
| 204、HTML200、錯receipt                          | C204；partner_ack_invalid/manual_only，不能自動retry                                                           | 單元2已改durable receiver；待hosted案例執行          |
| 同tenant兩entry、跨tenant同URL、同住戶兩App      | 僅原entry/tenant/subject收到，payload不串單                                                                    | 缺整合案例                                           |
| entry移轉與link撤銷                              | 舊消息不移轉；owner_changed/manual_only與recipient_revoked/terminal；零外送                                    | 缺整合案例                                           |
| endpoint停用、secret輪替重測、未配置availability | 明確configuration_blocked；測試就緒後才enable                                                                  | 缺整合案例                                           |
| ack後DB失敗、lease/fence、兩worker競爭           | durable transaction、舊fence不可commit、dedupe且單retry owner                                                  | PG歷史21/21；缺整合fault evidence                    |
| maxAttempts=5與expiry                            | 總共五次、最多四次retry、超expiresAt停止                                                                       | 缺整合案例                                           |
| 舊ETA、取消後舊到場、payload confidentiality     | superseded/obsolete terminal；缺driver情報不洩漏敏感資料                                                       | 缺整合案例                                           |
| admin readiness/stage/failure與手動retry         | C205；真route/auth、點control、觀察request及durable readback                                                   | 已改真route/control及hosted port；待browser執行      |
| notification-navigation                          | fresh single-use handoff、HttpOnly session、returnTo、最新ride readback、錯entry/subject/logout/account switch | 缺hosted runtime案例                                 |
| 一般tenant webhook C111–C115與restart            | 獨立既有gate不可由partner數量取代                                                                              | checkpoint C111/112 passed；C113–115/restart skipped |

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
重送control。以上runtime尚未通過，完整逐SHA失敗與修復鏈見原UAT artifact「修復單元2」。
最新程式 `00f0bfbf82488a8a8ac403a1c8c9a9b690a86f3e` 的run36338535726執行中；
不得把先前291/291或PG21/21帶到此SHA，三項required_acceptance仍NOT MET。
另有正式 `t()` 已重現的accepted_unknown raw-key產品文案缺陷，待Supervisor協調scope/child。
