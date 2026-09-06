# 無人語音叫車 SA／SD 兩輪可行性盤點

- 文件代號：`UV-AUDIT-001`；日期：2026-09-06。
- 盤點要求：驗證實作可行性、情境正確性及架構合理性，找出無依據或過度樂觀的假設並修正。
- 第一輪起始設計：commit `0fbf20cf61d2a46648b7bdd9a1b8111484664710`；[SA](phase1-unattended-voice-booking-sa-20260906.md)、[SD](phase1-unattended-voice-booking-sd-20260906.md)。
- 程式基準：同一工作樹；原盤點 `88cf38048c6b6bb565fd2c11d8a9db2706919fca` 與當時 `origin/dev` 的產品程式相同。本次不使用主工作樹其他任務的未提交修改。
- 狀態：兩輪盤點與交叉複核已完成，SA／SD 修訂為 v0.2。本次列出的設計問題已修訂並在文件層關閉；新增功能仍需實作與上線驗證。

本報告的測試與變更範圍記錄截至設計盤點提交 `512cbec4849fc82e309fcb9364f25bf53b0a1606`。使用者後續授權的任務化、派工角色及 worker 設定調整，另由 [execution packet](../03-runbooks/unattended-voice-booking-execution-tasks-20260906.md) 與正式 task board 記錄，不能把後續執行狀態倒填成先前盤點已完成的能力。

## 1. 方法與證據範圍

第一輪依能力沿程式、契約、資料模型、部署與官方文件反查；第二輪在修正版本上，以具體通話和故障順序重走，交換交易與業務審查範圍。兩輪有不同輸入版本和 finding，不以同一原稿重讀兩遍冒充驗證。

- `E`：原始碼／現有測試可支持的事實。
- `D`：本功能新增設計，仍需實作及測試。
- `V`：官方供應商文件支持接口語義，仍需正式帳號／電話驗證。
- `U`：尚未確認，沒有足夠證據；不因缺文件就斷言供應商不支持。

嚴重度：P0 會直接破壞無人主流程；P1 可能造成錯單、錯誤回覆、資料／權限失真；P2 為部署與體驗可行性或證據精度缺口。修正文件表示已明確處理設計，不表示程式缺口已完成。

本次沒有部署、採購、撥打正式電話、操作真實訂單或更動應用程式。執行的單元／in-process 整合測試，不代表真實 DB 交易、正式電話、供應商並發與 SLA 已通過。

## 2. 第一輪：程式與契約可行性

### 2.1 交易與資料

| Finding        | 等級／證據 | 原始碼依據與反例                                                                                                                                                                                                                                                                                                                                                              | 修訂位置／處理                                                                                                                          |
| -------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| R1-T01         | P1／E→D    | OwnedMobility 啟動載入 arrays，requireOrder 讀記憶體；repository 整筆 upsert。DB 新單可能看不到，舊快照可能覆寫新狀態。來源：[service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 556、1873、9004；[repository](../../apps/api/src/modules/owned-mobility/owned-mobility.repository.ts) 765                                                         | SD §7.5：DB 權威、aggregateVersion/CAS、commit 後投影、miss 查 DB；列出所有 voice-related writer／reader 改造範圍                       |
| R1-T02         | P1／E→D    | Runtime 寫 ops.phase1_owned_orders／crm.phase1_call_sessions；V0082 唯一鍵位於另一張 ops.orders。來源：[migration V0011](../../infra/migrations/V0011__phase1_runtime_snapshots.sql)、[V0082](../../infra/migrations/V0082__call_session_order_cardinality.sql)、[call repository](../../apps/api/src/modules/callcenter/callcenter.repository.ts) 51                         | SD §7.5、§15.2：在真正 runtime 表新增可約束欄位／FK／唯一鍵及 JSON 一致性，先查歷史重複／懸空資料                                       |
| R1-T03         | P1／E→D    | persistChangesRequired 只 await 個別寫入；call/audit 各用自己的 DB service，DB 未配置可能 return，舊建單先改 arrays／事件。來源：[service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 1178、8388；[repository](../../apps/api/src/modules/owned-mobility/owned-mobility.repository.ts) 329、337、366                                                | SD §7.1、§7.5：沿用 PoolClient UoW，pure prepare→同交易寫入→commit 後投影；audit intent 同交易、sink delivery 在後；DB unavailable 拒絕 |
| R1-T04／R1-S01 | P0／E→D    | mode:auto 有候選只建立 matching；真正 assignDispatch 需外部車／司機。來源：[service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 2597、2757、3570；[ops 指派按鈕](../../apps/ops-console-web/components/ops-dispatch-assignment-button.tsx) 35                                                                                                       | SD §7.6、WP-09；SA §5.1、AC-035/036：owned-domain 自動選車／保留／offer／accept／reject／timeout，正常流程不得等 ops 點選               |
| R1-T05         | P1／E→D    | dispatch／assign 舊 idempotency scope 相同，副作用及 receipt 分開保存，例外可刪 key。來源：[service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 2517、2783、3611；[idempotency service](../../apps/api/src/common/idempotency/idempotency.service.ts) 218                                                                                           | SD §7.6：request／offer／notify／timeout 分 action key；域內 receipt、assignment 唯一約束與 outbox；unknown 先查，不盲目重送            |
| R1-T06         | P1／E→D    | 還有多元電話 create 及 call link-order 可繞過普通建單入口；agentId 仍可取 body。來源：[multi-taxi controller](../../apps/api/src/modules/multi-taxi/multi-taxi.controller.ts) 68；[callcenter controller](../../apps/api/src/modules/callcenter/callcenter.controller.ts) 116；[owned controller](../../apps/api/src/modules/owned-mobility/owned-mobility.controller.ts) 227 | SD §7.4/7.5：所有同 callId 入口共用 fence；成功主 link 不覆寫；真人 actor 由認證 identity 注入                                          |
| R1-T07         | P1／E→D    | 現有 JWT/workload exchange 簽 system，未知 actor 可能視為 human；沒有 session/epoch claims。來源：[auth types](../../apps/api/src/common/auth/auth.types.ts)、[JWT service](../../apps/api/src/common/auth/jwt-auth.service.ts) 508、835、1083                                                                                                                                | SD §4.2：既有 system/service principal＋專用 session capability verifier；業務 actor voice_agent 分開映射與 audit                       |
| R1-T08         | P1／E→D    | 舊 recording missing listener 可清 recordingId、將進行中單倒退 recording_pending。來源：[service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 1703；[callcenter service](../../apps/api/src/modules/callcenter/callcenter.service.ts) 421、765                                                                                                       | SD §8.4、§7.5；SA AC-037：voice-aware listener、manifest version、證據狀態不倒退 order lifecycle                                        |

### 2.2 業務情境與操作介面

| Finding | 等級／證據 | 原始碼依據與反例                                                                                                                                                                                                                                                                                  | 修訂位置／處理                                                                                                             |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| R1-S02  | P1／E→D    | assigned 的 task 仍 pending_acceptance；no_supply 可仍在 delayed/manual queue。來源：[service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 2683、4508、7626                                                                                                              | SD §7.6 狀態投影表；§12.3 不以 no_supply 推論終止、不把 offer 當司機接單                                                   |
| R1-S03  | P1／E→D    | 多元電話 on_demand 仍是 taxi_reservation／platform_reserved，需營運授權。來源：[multi-taxi service](../../apps/api/src/modules/multi-taxi/multi-taxi.service.ts) 392；[多元契約](../../packages/contracts/src/phase1-p5-s3-multi-taxi.ts) 40、122                                                 | SA §3；SD §4.3：初次開通明確只限普通電話單，多元入口按其業務權威路由；列 profile→runtime／商品／授權映射                   |
| R1-S04  | P1／E→D    | 普通電話 command 無完整人數／能力欄位，候選未帶當筆需求；五人可能派四席車。來源：[contracts](../../packages/contracts/src/index.ts) 3262、3497；[eligibility resolver](../../apps/api/src/modules/vehicle-eligibility/eligibility-context-resolver.service.ts) 25                                 | SD §6.4：typed BookingRequirements 貫穿 draft/order/candidate/assignment/task；未具強制能力的需求轉例外                    |
| R1-S05  | P1／E→D    | passenger.phone 覆寫 callerPhone，callback 又取 callerPhone；A 替 B 叫車後可能回撥錯人。來源：[service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 1178；[callcenter](../../apps/api/src/modules/callcenter/callcenter.service.ts) 651、802                             | SD §6.4/12.5；SA AC-040：原來電、booker、乘客、司機聯絡與回撥 target 分開，保存同意                                        |
| R1-S06  | P1／E→D    | callback 只有 pending/completed，重建重置；ops 在 call closed 禁用完成。來源：[contracts](../../packages/contracts/src/index.ts) 4445、4482；[callcenter](../../apps/api/src/modules/callcenter/callcenter.service.ts) 659、730；[ops 頁](../../apps/ops-console-web/app/callcenter/page.tsx) 783 | SD §12.5：task/attempt、claim/transfer/complete/cancel/unreachable，掛斷後仍可處理，新的工作台及 API 負責                  |
| R1-S07  | P1／D      | handoff 凍結所有 mutation 後又要求建 callback；舊 AI token 已失效                                                                                                                                                                                                                                 | SD §12.5：只凍結訂單 mutation，handoff coordinator 持新 epoch 的有限控制能力，不恢復 AI 建單權                             |
| R1-S08  | P1／E→D    | 舊 call/order 無 brand ownership；既有 ops 讀取不按 brand，linkedOrderId 可改，不宜當 passenger proof。來源：[contracts](../../packages/contracts/src/index.ts) 3475、4508；[auth policy](../../apps/api/src/common/auth/auth.policy.ts) 467、737                                                 | SD §4.2/4.3/7.5：resource scope 與 ops membership、legacy read/link 同限制；本通 proof 源自 intent＋durable create receipt |
| R1-S09  | P1／E→D    | 服務區 manual_review 不是可自動受理；醫院入口可建單後才卡派遣。來源：[service-area](../../apps/api/src/modules/service-area/service-area.service.ts) 131；[owned service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 9257、9290                                         | SD §6.4：保留三態、reason/policy/stop限制；未解除 review 提交前轉例外或換合法入口後重新確認                                |

### 2.3 語音與外部媒體

本輪重新經 Drive connector 讀取 [TWM Streaming V3.22](https://drive.google.com/file/d/1qVPH4tCGOLfAv43QU2eQBeh5x1h0niv3/view) 與 [TWM TTS v2.07](https://drive.google.com/file/d/1jGU_d-mBTSz4UL1oWaj-I5JeHxXsiroh/view)。FAQ 本輪讀取失敗，舊紀錄的 5 秒／15 線／延遲不能當此次重新驗證結果。

| Finding | 等級／證據 | 官方依據與反例                                                                                                                                                    | 修訂位置／處理                                                                                                                                       |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1-V01  | P1／V→D    | [Twilio mark](https://www.twilio.com/docs/voice/media-streams/websocket-messages#mark-message) 正常播畢及 clear 都可能回覆；clear 後舊 mark 可錯復活確認          | SD §11.2/11.5：generation／cancel epoch／pending mark 集合，invalidated 不復活；無法判定記 unknown，offset標精度                                     |
| R1-V02  | P1／V/U→D  | TWM Streaming §2.2 無已文件化 frame ACK、resume cursor／segment offset；斷線後不知道哪些音訊已處理                                                                | SD §11.4/11.5、§8.2：基線不支持可依賴的 cursor，未提交確認失效後重新詢問；replay 不產生同意；保守 coverage window                                    |
| R1-V03  | P1／V/U→D  | [雙向 Media Streams](https://www.twilio.com/docs/voice/media-streams#bidirectional-media-streams) 只給應用 inbound track，不等於已取得雙向錄音；生成 TTS 可能未播 | SD §8.2、WP-10：明列 CTI fork／[SIPREC](https://www.twilio.com/docs/voice/twiml/siprec)→可信 recorder→片段→object 驗證原型；與轉接共存／延遲仍須實測 |
| R1-V04  | P1／V→D    | [SIPREC](https://www.twilio.com/docs/voice/twiml/siprec) 不送 DTMF tones，錄音不能要求含按鍵肯定音                                                                | SD §6.2/8.2：speech coverage 與 DTMF 回讀音訊＋可信 digit receipt 分開，順序及 prompt binding代替虛構sample offset                                   |
| R1-V05  | P2／V/U→D  | Streaming §2.2 分 minSilenceDurMs、maxPacketLossDurSec、noSpeechTimeout；不能混成一個idle。8秒提示可能晚於ASR退出                                                 | SD §11.5：三類 timeout、EOS/drain、開場／查車送音策略、最大會話時長與正式帳號測試各自配置                                                            |
| R1-V06  | P2／V/U→D  | TTS §3 僅 HTTP chunked，未定 cancel API／ACK／停止計費；等待取消回執會拖延停播                                                                                    | SD §11.4：先 fence/clear，再best-effort abort，播放停止與合成／計費停止分開                                                                          |
| R1-V07  | P2／U→D    | 國台英 baseline 不保證能先聽懂純客語以切模型；Streaming response 未提供可依賴的語言辨識欄位                                                                       | SA §5.1；SD §11.5：多語短提示＋DTMF入口，語言來源標記，切換EOS/drain＋重新確認                                                                       |
| R1-V08  | P1／U→D    | VAD／echo 無法單獨證明遠端清晰「好」來自訂車者而非電視；TWM schema 無此身份證據                                                                                   | SA §6.3；SD §6.2：來源疑慮與背景風險需量測，追問具叫車語意的確認／DTMF，不把 VAD 當 speaker attribution                                              |

### 2.4 架構與交付檢查

| Finding | 等級／證據 | 發現                                                                                                                                                                                                                                                                                 | 修訂                                                                                                                       |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| R1-A01  | P1／E/V→D  | [Dev workflow](../../.github/workflows/deploy-dev.yml) 859起 min0/max1；[stage 範本](../../infra/gcp/staging/api-service.yaml) 有CPU throttling，不能保證掛斷後runner續作；WebSocket還受timeout／重連限制。[Cloud Run](https://docs.cloud.google.com/run/docs/triggering/websockets) | SD §3.4、WP-10：獨立媒體部署、API內domain runner、背景CPU／存活／drain、跨revision DB fencing；不是直接沿用現有部署即上線  |
| R1-A02  | P2／E→D    | [共用 LLM gateway](../../apps/api/src/common/llm-gateway/llm-gateway.service.ts) 20起只有文字completion契約；[ops gateway](../../apps/api/src/modules/assistant/assistant-llm-gateway.service.ts) 含規則選工具／固定分塊，不是現成語音引擎                                           | SD §3.5：沿用transport基礎但新增 typed voice provider、deadline/abort、structured output/tool loop、獨立配置／預算、禁mock |
| R1-A03  | P2／CI     | [原 PR canonical consistency](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34005897489/job/101412880885) 命中 docs/README 既有引用的未追蹤 local 檔案；本機存在不代表 clean checkout存在                                                                              | 文件索引改指同目錄下本機生成的檔名，明示不是版本庫文件；不略過CI、不修改檢查器                                             |

上述 28 個 finding ID 含不同審查者對同一派遣缺口的獨立確認，不代表 28 個互不相干的缺陷。

## 3. 第二輪：修正後情境反查

第二輪輸入為第一輪修訂後的 checkpoint commit `9099d2820098127a419f073326beb0e71bcc88fe`。交易審查者改查情境與 callback／scope，業務審查者改查資料與交易閉環，語音審查者核對修正後媒體證據與架構；主代理逐條反查需求和實作依賴。修正後，三位審查者再限定複核各自 finding 及殘留文字，全部在文件層關閉。

### 3.1 反例與修正

| Finding | 等級／證據 | 重走情境與發現                                                                                                                                                                                                | 最終設計處理與驗收追溯                                                                                                                                                                                            |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-T01  | P1／D      | 乘客已同意回撥，call.ended 比 callback 建立回覆先到；若一律禁止 closed 寫入，會漏掉已承諾的任務                                                                                                               | SD §12.5：consent＋task 或可恢復 command／receipt 同交易，掛斷後依 sealed proof 接續，重試查原 receipt；SA AC-046                                                                                                 |
| R2-T02  | P1／D      | 建單已受理但尚未 commit，轉接等待時又說回撥電話或更正地址；一律失效會丟掉有效叫車，一律忽略會下錯單                                                                                                           | SD §5.4／§12.5：pendingInput 阻擋，解析後區分實質更正與明確無關輸入；不可解析／來源不明繼續阻擋，coordinator 可安全失效而無新建單權；SA AC-045/046                                                                |
| R2-T03  | P1／D      | 代叫人更正乘客電話或回撥對象；「所有 contact 不可變」會阻止合法更正，「永久保留」又與保存政策矛盾                                                                                                             | SD §6.4：不可變的是 revision 歷史，允許新版本及新同意；原 assertedCallerPhone 在適用保存期間不可覆寫，到期按 §9.2；SA AC-040                                                                                      |
| R2-T04  | P1／E→D    | 舊文字仍可能將 no_supply 當結案，或引用不存在的 in_trip 狀態，導致仍在找車卻播報結束                                                                                                                          | SD §7.6／§12.3 只依 terminal 投影及有效工作判斷；§8.4 使用實際 on_trip 與 handleCallRecordingStateChanged；SA AC-035/037                                                                                          |
| R2-T05  | P1／E→D    | 機器身分段落誤用 principalKind，實際 [auth types](../../apps/api/src/common/auth/auth.types.ts) 使用 principalType；照抄會接錯 IAM 契約                                                                       | SD §4.2：actorType=system、principalType=service；voice_agent 只屬業務 actor／專用 capability 映射，不能當既有 JWT actor 值；SA AC-043                                                                            |
| R2-S01  | P1／E→D    | A offer 已接受或被 B 取代，A timeout 才執行；既有 [handleDispatchTimeout](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 7017 起按 orderId 查當前 assignment，單有 CAS 不足以分辨舊事件 | SD §7.6：timeout 綁 job／round／assignmentId／version／deadline，只對仍待接受且已到期的原 offer 生效；accepted／superseded no-op，接受／拒接／逾時互斥；SA AC-047                                                 |
| R2-S02  | P1／E→D    | AI 單與人工／企業單在不同 API revision 同搶司機／車輛；只保護 voice writer 仍可重複派車                                                                                                                       | SD §7.6／§9.1：共用 dispatch_resource_reservations、有效占用唯一、司機及車輛同交易取得，所有競爭入口共用；否則須後端強制隔離供給。拒接／取消／完成／有效 timeout／原子改派按原 assignment/version 釋放；SA AC-048 |
| R2-V01  | P1／D      | 乘客插話時 API 故障或 executor 正持 session DB 鎖；若先等持久化才 clear，電話仍持續播放舊內容                                                                                                                 | SD §5.3／§7.1：本地先 invalidate／clear／abort，不等 API 或 DB；交易內禁網路及長運算並設 deadline，CTI 失聯停播結果記 unknown；SA AC-045                                                                          |
| R2-V02  | P1／D      | speech-start、clear、DTMF 跨 HTTP 亂序或缺號；僅有 sequence 欄位但沒有連續套用規則，肯定可能越過更正                                                                                                          | SD §5.4／§6.2／§10：controlSequence 連續套用、缺號補送、controlCutoff 綁 confirmation／command，pendingInput 阻擋；§11.4 區分 none 重問及 pending 封存 proof；SA AC-041/045                                       |
| R2-V03  | P1／D      | 已撤銷 AI token 但電話 buffer 還有 AI 音訊，真人接通後兩邊同時說話；或舊 AI 重新申請新 epoch token                                                                                                            | SD §5.4：唯一 output owner／epoch、sink 每批 fencing、切手前 clear、issuer 驗角色及 owner；無法隔離記 handoff pending，不能假報完成；SA AC-021/045                                                                |

第二輪共 10 個 finding ID。它們是對修正版新增或殘留缺口的盤點，與第一輪的 28 個 ID 分開記錄；不將總數解讀為 38 個獨立程式 bug。SA 現有 32 項功能需求、48 項驗收案例；新增案例是待執行的規格，不是已通過的測試。

### 3.2 架構合理性與可行性判定

**判定：修訂後架構有條件可實作；前版低估了自動派遣、既有資料一致性及電話媒體的整合工作，不能按「串接 ASR／TTS 和現有建單 API 即完成」估工。**

| 架構範圍                | 判定與落地條件                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 電話／ASR／LLM／TTS     | 各負責媒體、辨識、受約束的對話規劃及發聲，分工合理。TWM 有分開的 ASR／TTS API；這不能推論已有電話控制、叫車業務推理或派遣能力。電話品質、方言與正式帳號能力仍須驗證。                                       |
| media worker 與業務 API | 媒體採獨立部署以處理連線、停播及轉接；業務命令透過 API 留在現有領域模組，由 DB job／lease 恢復。可避免把電話即時路徑卡在訂單鎖上，無須在第一版引入全平台訊息匯流排或強制 Redis。                            |
| 訂單與交易              | 沿用既有訂單域合理，但必須改真正 runtime 表及其快照讀寫路徑。新資料表、CAS、UoW、receipt、audit intent 與 commit 後投影都是新增工程，不能視為既有方法已提供的保證。                                         |
| 自動派遣                | 必須新增 owned-domain executor，連接候選選擇、資源保留、driver task 與接拒單／逾時。司機自行接單屬正常派車流程，客服無須逐筆點選；matching 不能當成派車成功。                                               |
| 共用資源與舊入口        | 保護範圍必須跨語音、人工、企業與舊 revision。共享司機／車輛卻只改 voice API 的方案不成立；若分階段導入，隔離必須由後端授權及可分派資源規則實際保證。                                                        |
| 人工例外與第一版範圍    | 需要新的受限 coordinator、callback task／attempt 及工作台。普通即時叫車作為初次開通範圍是設計提案；查單／取消／預約／特殊需求按能力開通。未開通與故障都須計入全來電人工率，不能排除後宣稱只剩少數真人處理。 |

對「有無憑空想像」的結論：前版確有把既有能力描述得過於完整、把未驗證媒體能力當成可直接依賴、以及新舊契約用詞不一致的地方，本報告已逐項更正並標明 E／D／V／U。新增設計本身不等於既有能力；目前沒有足夠證據宣稱所有通話情境均正確或已達到少數人工介入。是否達成該產品目標，須以 SA 定義的完整來電分母、逐語言資料及 §5 上線證據驗收。

## 4. 已執行的驗證與限制

### 4.1 既有程式回歸

- 第一組：根目錄 Vitest，callcenter、idempotency-foundation、CRM webhook idempotency、owned-mobility idempotency、api-client geo/service-area，共 **5 個檔案、49 項通過**。
- 第二組：以本機臨時 Vitest config 選取既有 apps/api 單元測試，callcenter、geo、service-area、owned-mobility-durable-sinks、llm-gateway、llm-gateway-config，共 **6 個檔案、87 項通過**。
- 合計 **11 個檔案、136 項通過**。測試名稱包含 integration 不表示連到真實 DB；這批主要採記憶體／mock repository、controller 或 fake provider。
- 初次第一組因隔離工作樹未有 API dependency links，4 個 suite 在載入 @nestjs/common 前失敗；連結到既有安裝依賴後重跑全部通過。沒有為通過測試修改應用程式或測試。
- durable-sinks log 中的 NOTIFY／outbox 錯誤是既有測試主動注入，suite 通過；不能據此聲稱 live NOTIFY 已測。

這些測試確認沿用基礎在目前基準可運作，不證明新增 voice UoW、真正雙向錄音、自動選車、品牌權限、人工電話bridge或生產並發已完成。

### 4.2 文件與來源

- 5 份文件完成 Prettier 格式化與 diff whitespace 檢查；83 個本機相對連結存在，5 個 JSON 範例可解析，程式碼區塊標記成對。
- SA 的 UV-FR-001～032、UV-AC-001～048 唯一且連續，32 項 FR 全部有 AC 追溯。audit 的第一輪 28 個、第二輪 10 個 finding ID 數量與紀錄相符。
- canonical consistency 通過，L1 authority、cited paths、decisions、task claims 均無 finding；不透過 bypass 略過檢查。
- 變更範圍只有 SA、SD、本報告及兩份索引，共 5 份文件。既有程式測試、應用程式、migration 與部署設定均未修改。
- 提交 trailer 與遠端 CI 依 [draft PR #1608](https://github.com/ajoe734/drts-fleet-platform/pull/1608) 的最新提交紀錄確認，不以舊版本的通過結果替代最新 head 檢查。§2.4 保留前版 CI 發現及其修正原因。

兩輪均保留已驗／未驗差別；這些文件檢查不取代 §5 的實作驗收。

## 5. 上線前必須取得的證據

- 真實 runtime DB migration、全部 voice writer CAS/UoW、兩實例／跨 revision 競態與 crash 恢復，不能只跑 memory idempotency。
- 自動選車至 driver task、accept／reject／timeout／改派，不經 ops 人工指派；全部競爭入口共用 driver／vehicle 保留約束，舊 timeout 不能影響已接單或新 offer。
- 正式CTI、雙向錄音原型、播放回執映射、DTMF、轉接／掉線、錄音片段持久化與實際時間精度。
- 逐語言的真實電話資料、背景聲誤確認、純客語入口、地址／人數／特殊需求落入實際派遣。
- ops品牌授權、legacy入口一致限制、caller/booker/passenger/callback角色、掛斷後回撥任務終態。
- 各供應商正式帳號、配額／計費／資料條件、背景runner部署、容量與回退演練。

上述是明確的實作／外部驗證門檻；本次設計盤點不把它們改寫為已通過，也不把正常流程退回真人逐筆批准。
