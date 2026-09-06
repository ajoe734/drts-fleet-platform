# 無人語音叫車 SA／SD 兩輪可行性盤點

- 文件代號：`UV-AUDIT-001`；日期：2026-09-06。
- 盤點要求：驗證實作可行性、情境正確性及架構合理性，找出無依據或過度樂觀的假設並修正。
- 第一輪起始設計：commit `0fbf20cf61d2a46648b7bdd9a1b8111484664710`；[SA](phase1-unattended-voice-booking-sa-20260906.md)、[SD](phase1-unattended-voice-booking-sd-20260906.md)。
- 程式基準：同一工作樹；原盤點 `88cf38048c6b6bb565fd2c11d8a9db2706919fca` 與當時 `origin/dev` 的產品程式相同。本次不使用主工作樹其他任務的未提交修改。
- 狀態：第一輪已完成並修訂 v0.2；第二輪待修正版本交叉審查後記錄結論。

## 1. 方法與證據範圍

第一輪依能力沿程式、契約、資料模型、部署與官方文件反查；第二輪在修正版本上，以具体通話和故障順序重走，交換交易與業務審查範圍。兩輪有不同輸入版本和 finding，不以同一原稿重讀兩遍冒充驗證。

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
| R1-S05  | P1／E→D    | passenger.phone 覆寫 callerPhone，callback 又取 callerPhone；A 替 B 叫車後可能回撥错人。來源：[service](../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts) 1178；[callcenter](../../apps/api/src/modules/callcenter/callcenter.service.ts) 651、802                             | SD §6.4/12.5；SA AC-040：原來電、booker、乘客、司機聯絡與回撥 target 分開，保存同意                                        |
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
| R1-V07  | P2／U→D    | 國台英 baseline 不保證能先聽懂纯客語以切模型；Streaming response 未提供可依賴的語言辨識欄位                                                                       | SA §5.1；SD §11.5：多語短提示＋DTMF入口，語言來源標記，切換EOS/drain＋重新確認                                                                       |
| R1-V08  | P1／U→D    | VAD／echo 無法單獨證明遠端清晰「好」來自訂車者而非電視；TWM schema 無此身份證據                                                                                   | SA §6.3；SD §6.2：來源疑慮與背景風險需量測，追問具叫車語意的確認／DTMF，不把 VAD 當 speaker attribution                                              |

### 2.4 架構與交付檢查

| Finding | 等級／證據 | 發現                                                                                                                                                                                                                                                                                 | 修訂                                                                                                                       |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| R1-A01  | P1／E/V→D  | [Dev workflow](../../.github/workflows/deploy-dev.yml) 859起 min0/max1；[stage 範本](../../infra/gcp/staging/api-service.yaml) 有CPU throttling，不能保證掛斷後runner續作；WebSocket還受timeout／重連限制。[Cloud Run](https://docs.cloud.google.com/run/docs/triggering/websockets) | SD §3.4、WP-10：獨立媒體部署、API內domain runner、背景CPU／存活／drain、跨revision DB fencing；不是直接沿用現有部署即上線  |
| R1-A02  | P2／E→D    | [共用 LLM gateway](../../apps/api/src/common/llm-gateway/llm-gateway.service.ts) 20起只有文字completion契約；[ops gateway](../../apps/api/src/modules/assistant/assistant-llm-gateway.service.ts) 含規則選工具／固定分塊，不是現成語音引擎                                           | SD §3.5：沿用transport基礎但新增 typed voice provider、deadline/abort、structured output/tool loop、獨立配置／預算、禁mock |
| R1-A03  | P2／CI     | [原 PR canonical consistency](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34005897489/job/101412880885) 命中 docs/README 既有引用的未追蹤 local 檔案；本機存在不代表 clean checkout存在                                                                              | 文件索引改指同目錄下本機生成的檔名，明示不是版本庫文件；不略過CI、不修改檢查器                                             |

上述 28 個 finding ID 含不同審查者對同一派遣缺口的獨立確認，不代表 28 個互不相干的缺陷。

## 3. 第二輪：修正後情境反查

第二輪輸入為第一輪修訂後的 checkpoint commit。交易審查者改查情境與callback／scope，業務審查者改查資料與交易閉環，語音審查者核對修正後媒體證據與架構；主代理逐條反查需求和實作依賴。

本節待第二輪完成後填入案例、發現與修正結果，不提前宣稱通過。

## 4. 已執行的驗證與限制

### 4.1 既有程式回歸

- 第一組：根目錄 Vitest，callcenter、idempotency-foundation、CRM webhook idempotency、owned-mobility idempotency、api-client geo/service-area，共 **5 個檔案、49 項通過**。
- 第二組：以本機臨時 Vitest config 選取既有 apps/api 單元測試，callcenter、geo、service-area、owned-mobility-durable-sinks、llm-gateway、llm-gateway-config，共 **6 個檔案、87 項通過**。
- 合計 **11 個檔案、136 項通過**。測試名稱包含 integration 不表示連到真實 DB；這批主要採記憶體／mock repository、controller 或 fake provider。
- 初次第一組因隔離工作樹未有 API dependency links，4 個 suite 在載入 @nestjs/common 前失敗；連結到既有安裝依賴後重跑全部通過。沒有為通過測試修改應用程式或測試。
- durable-sinks log 中的 NOTIFY／outbox 錯誤是既有測試主動注入，suite 通過；不能據此聲稱 live NOTIFY 已測。

這些測試確認沿用基礎在目前基準可運作，不證明新增 voice UoW、真正雙向錄音、自動選車、品牌權限、人工電話bridge或生產並發已完成。

### 4.2 文件與來源

待最終版本執行：Markdown／JSON範例／相對連結／需求追溯、canonical consistency、commit trailers、變更範圍及遠端 CI。兩轮都保留來源與已驗／未驗差別。

## 5. 上線前必須取得的證據

- 真實 runtime DB migration、全部 voice writer CAS/UoW、兩實例／跨revision競態與crash恢復，不能只跑memory idempotency。
- 自動選車至driver task、accept／reject／timeout／改派，不經ops人工指派；driver／vehicle 同時保留約束。
- 正式CTI、雙向錄音原型、播放回執映射、DTMF、轉接／掉線、錄音片段持久化與實際時間精度。
- 逐語言的真實電話資料、背景聲誤確認、純客語入口、地址／人數／特殊需求落入實際派遣。
- ops品牌授權、legacy入口一致限制、caller/booker/passenger/callback角色、掛斷後回撥任務終態。
- 各供應商正式帳號、配額／計費／資料條件、背景runner部署、容量與回退演練。

上述是明確的實作／外部驗證門檻；本次設計盤點不把它們改寫為已通過，也不把正常流程退回真人逐筆批准。
