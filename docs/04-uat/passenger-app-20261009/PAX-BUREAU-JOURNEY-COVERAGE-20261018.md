# PAX-BUREAU-JOURNEY-COVERAGE-20261018

本文件保留原五組缺口、UC01–16、兩個驗收 key，以及既有 Source、單元、正式 PG 與共享瀏覽器證據各自的範圍。寫出測試不等於測試已執行；hosted 通過也不等於同版本 shared 已驗。

原 Claude2 的五檔 WIP 原樣保管於 custody commit `b16393935ef51406ba0bf69ea4b31605dc8d54d9`。Supervisor 正常交接後，Codex2 接續實作，Codex 獨立審查；原作者信用、任務規格與驗收不變。分支正常合併 accepted dev `61fa7cf44fb25d8be36634357fa3549286b96b84`，沒有 rebase 或 force push。`4264e3524` 是第一個修補 checkpoint，並非完整候選。

## 五組缺口的 Source 與驗證狀態

| Finding／驗收項                       | 正式 caller 與新增測試                                                                                      | 修補／覆蓋範圍                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 實際結果與界線                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1：首次 OTP、條款、回訪               | `pax-bureau-acceptance.spec.ts`、`otp-consent-journey.ts`                                                   | 普通 `/login`、真 OTP、未勾不能繼續、拒絕後 `/me` 401；五次錯碼鎖定；原 60 秒重寄；真正 `301_000ms` 過期後 UI disabled 與 server `400 invalid_code`；同意、登出、再登入後略過已同意條款                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 五個既有案例完整保留。跨登入／跨裝置共用 server target cooldown，helper 真等原 60 秒，沒有以立即重登取得 429 假充 OTP 成功。全部新瀏覽器分支仍待自己的 hosted／shared 執行。                                                                                                                                  |
| 2：允許取消零錯費、上車後拒絕         | `on-trip-cancellation-journey.ts`、`reliability.spec.ts`；既有四階段取消原旅程保留                          | 真 Passenger OTP／first consent 後 bind；真 Ops／Driver 到 `on_trip`；真 UI disabled，同 session、正確 Origin／payload 的 POST 必須回 `409 ORDER_NOT_CANCELABLE`；比對同 order、task、assignment、payment、charge 與正式 readback；之後走原 Driver 正常完程                                                                                                                                                                                                                                                                                                                                                                                              | `canCancel`／enabled 只稱可操作，不當免費證據。新未派遣取消比對無 charge／payment，並驗原在途卡不能刪、取消後可正常刪。舊 C/D/H/F 的原無 paymentId 讀回信用保留。`proof_pending` 未假造，見下方阻塞。                                                                                                         |
| 3：60／90 秒與真正產品入口            | `matching-timeout.spec.ts`；原 `pax-real-dispatch-timeout.spec.ts` 不改                                     | 60 秒是 assignment acceptance；90 秒是 unassigned matching job。新案例使用**已存在的 ordinary realtime API** `/control-plane-proxy/orders`，再走一般 Ops UI 建派遣、真背景排程等 90 秒、同 UUID 重派、真 Driver 接受及正常上車前取消清理                                                                                                                                                                                                                                                                                                                                                                                                                 | 沒有增加 Passenger instant 產品，也沒有手動 `/dispatch-timeout`、fake clock 或假 PG 狀態。hosted 保留原 90000ms；shared job 先讀 live timeout；原90秒設定經完整 runtime SHA 綁定時跑相同案例，供給須真 prepare／create／assign 成功，未由 seed 保證。設定非90秒或未驗證才明示 skip，不能拿 scheduled60 代替。 |
| 4：必要資料、圖資、斷線、冪等、跨裝置 | `supply-disclosure-journey.ts`、`external-map-port.cjs`、`reliability.spec.ts`、`booking-draft-recovery.ts` | hosted disposable PG 只暫改明示合成車的外部 disclosure color／incomplete，真 assign 應回 `P5_VEHICLE_DISCLOSURE_INCOMPLETE`／`missingFieldCodes`，Passenger 不顯示完整指派；原 row 精確復原後再原 assign。外部 Google fetch 才替換，真 GeoService 驗斷線、原 timeout、零候選、同名地址選擇與正式 quote 恢復。草稿重載須重新報價／勾選；真 `route.fetch()` 讓內部 BFF/API/PG commit，僅丟 browser ACK；原 UI 重載後重送原 key/body，並行重送仍同 UUID，真列表只一單；另一時區的新 context 用真 OTP 回同帳戶／付款方式／原單。另使 Passenger／Ops／兩 Driver contexts 真同時斷網65秒，各 role fetch 真拒絕，再恢復原在途 task／assignment／payment／charge | 不 mock 訂單、資格判定、授權、費用、派遣或 PG。shared 沒有 hosted 外部 Google fetch 或 disposable 供給 row 控制時，只記這兩項未執行，其餘可分離流程續跑。全斷線 Source 待 hosted 實跑；65秒不稱數小時長離線或實體 OS 終止。                                                                                   |
| 5：文件、原單申訴、福利／無障礙       | `receipt-complaint-journey.ts`；下方七產品對應                                                              | 同一未完程原單真 receipt-not-ready；真 browser offline 的讀取錯誤／重試；正常完程後同單 immutable receipt／payment 不變；五星首次評價及重送／改分拒絕；fare／service 表單到同單案件、一般 Ops 備註／指派／resolve／close、真 actionReceipt／audit／timeline 與原圖                                                                                                                                                                                                                                                                                                                                                                                       | 新分支都待 own hosted／same-release shared。正式 E04、USER 未答決定、真人聯絡及真車供給不由合成結果替代，亦不因這些界線停止前四組。                                                                                                                                                                           |
| B：補繳後舊等待訊息                   | `ride-controls.tsx`、`translations.ts`、`ride-controls-payment-feedback.test.tsx`                           | 讀真 retry-payment 回應的 payment.status，經原 `passengerPaymentDisplay` 顯示 captured／authorized／manual_recovery／失敗結果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 原 `ae0d2192a` Source 與四個 unit 的信用保留；這次受影響 suite 亦包含該 unit。尚未把 checkpoint 或 unit 當新共享補繳點擊結果。                                                                                                                                                                                |

## UC10 的真正產品修補

原 `BookingScreen` 的 draft 是 `useState`，unknown create acknowledgement 是 `useRef`。原碼 `4264e3524` 在送出丟 ACK 後尚可同頁 retry，但 unmount 後找不到「重試同一筆叫車請求」，原 key/body 失去。這次以同一個真正 BookingScreen／portable client／BFF 的 HTTP 邊界單測實際重現，修前 exit 1；不是把新測試缺少 address provenance 的測試準備錯誤當產品修前證據。

新 `booking-draft-recovery.ts` 只在目前分頁的 sessionStorage 存帳戶 ID、地址草稿、原報價、opaque method ID 與原不可變 command/key；不存 OTP、session／refresh 或 GCP credential。普通未送草稿重載後必須重新報價、重新勾費用。已送且 ACK 未知的原 command 可沿原 key 重試，即使舊 quote 後來到期也不換新 command 或延長期限，結果由正式服務的冪等與 ownership 判定。

401 仍導向普通登入並清除畫面中的未驗證身分。若原結果未知，保留綁原帳戶的 recovery record；真登入確認同帳戶後才恢復並成功重送，確認另一帳戶則清除，不能跨身分重送。另有真 BookingScreen 單測分開驗這兩條分支。瀏覽器禁用 storage 時仍保留同一掛載實例的既有恢復；關閉分頁／不同裝置不會搬運未確認 command。實體 OS 終止後是否恢復原分頁 storage 尚未實跑，不作保證。

獨立 review 發現的 401 分支亦有真正修前比較：套回保留的原 recovery WIP，同一個最新測試檔為 1 pass／2 fail，兩者皆在 401 後原 record 被清除處失敗；修後三案 pass。修前原檔與當前修正版皆保存 hash，測試後逐 byte 還原修正版。這些是 socket-free 元件／BFF HTTP 邊界測試，並非自然 session 到期的共享瀏覽器證據。

後續沿真正 server caller 找出獨立後端缺口：原 `PassengerBookingController` 把 `x-request-id` 傳給 service，但原 service／trusted creation／owned creation 沒有以它查重，每次仍產生新 UUID。新真正 production service／mobility／access／repository 單測在原碼實際失敗：同 key/body 得到不同 UUID、舊 quote 到期無法找回、改 body 仍成功等；不是只比較前端常數。單元只替換 SQL transport／帳戶與 quote 外部邊界，沒有把它稱作 PostgreSQL。

Supervisor 正常補配兩個 API 原檔後，`passenger-booking.service.ts` 用現有 canonical hash，先核已登入帳戶，再讀帳戶 scope 的原 command result；成功結果的 owner 仍由 booking history 查核。`passenger-booking.repository.ts::commitBooking` 在原 transaction 內，以既有 `ops.idempotency_records` 的 unique scope/key、row lock、payload hash，將原 order／access token／history 與只含原 orderId 的結果一起 commit。不是在業務 commit 後另存 idempotency reply。另一個並行 caller 已準備的臨時 order／access grant 若碰到完成結果，沿既有 rejection cleanup 捨棄並讀回原 owned UUID，不進入 memory 或 publish 第二單。

同 key／異 body 回原 `409 IDEMPOTENCY_KEY_REUSED`；不同帳戶有不同 scope、不能讀原 result，仍須過原 quote／method ownership。新 command 的電話、付款、lead、fee、quote expiry 與原3秒lock／8秒statement timeout不變；成功舊 command 的結果可在 quote 到期後讀回，沒有延長新報價期限。沒有 request key 的舊 service caller 沿原行為，普通 UI 一直送不可變 key。新七個單元包含 lost COMMIT reply／rollback／race cleanup／account scope，已先窄跑通過；首輪 e3a 的四項真 PostgreSQL hosted 案例亦已執行通過，來源與界線見下方。普通 UI lostACK／跨裝置旅程尚未走到；不能把前端恢復、單元或 hosted PG 當成真共享查重成功。

原 lock timeout 仍為3秒：成功重播指向同 UUID，不承諾所有長時間競爭都立即回201。逾時／未知結果保留原 key 正常重試，不延長鎖定期限。unknown COMMIT 案例只核 receipt／order／history／access token；audit 與通知實際送達尚未驗證，不從 durable booking 自動授予它們信用。

## UC01–16 逐案帳

| 案例                    | 保留的既有信用／這次 Source                                                                                                                                                                                                                      | 待執行或具體未解條件                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC01 首次使用與正常預約 | 五 OTP／terms 案例；trip／reliability／matching 都沿普通 OTP／first consent                                                                                                                                                                      | 新版五項 hosted、shared fresh account；真正 session 自然到期的完整瀏覽器旅程另驗，不能用壞 token 代替。                                                          |
| UC02 回訪付款與歷史     | default switch、放棄刪卡零 DELETE、在途卡真 409、取消後可刪；另一時區 context 真 OTP 讀同 account/method/order；401 後同／不同帳戶恢復 unit                                                                                                      | 新版完整 UI／PG／shared 證據；其他已結清歷史畫面與真自然到期回訪仍需適用操作。測試既有 UI 屬原 test/helper scope，不要求預先新增 payment/account 產品權限。      |
| UC03 費用確認           | 原未勾不能送出保留；返回修改／新報價清舊勾選，新確認才送出                                                                                                                                                                                       | own hosted／shared；演練費用文案不是正式營運採認。                                                                                                               |
| UC04 時間／quote TTL    | 原 .6 I 真十五分鐘過期、拒單、重新報價、唯一新單信用保留；新 reliability 選下一日午夜並由 UTC 第二裝置讀同絕對原單                                                                                                                               | 新版實際十五分鐘專用 suite／不同日曆操作；不借 .6 當新版本通過，原 15 分鐘及最少提前規則不改。                                                                   |
| UC05 各階段取消         | 舊四階段各自原單保留；新零 charge 未派遣取消；on_trip disabled＋真 409、order/task/assignment/payment/charge 不變、正常完程                                                                                                                      | own hosted／shared；proof_pending 原產品分支仍缺可達 photo producer／上傳 UI，不改 task state 或塞假 proof。                                                     |
| UC06 供給／拒接／逾時   | .6 K 真60、L 真409同派遣恢復保留；新 ordinary real90 matching 背景 timeout、同 UUID 重派及真 Driver 接受                                                                                                                                         | 新90 hosted／shared 都待 own 執行；shared 先真讀 live config，ordinary 供給與重派接受須實際成功；scheduled job 為 reserved 不等於所有90不適用。                  |
| UC07 改派揭露           | 原 A/G 信用保留；新 on_trip 情境在上車前由 A 接受後重派 B，A 舊 task 取消、B 真 device/session 開啟新 task 並接受，同單新車牌與兩 Driver 原圖                                                                                                    | own hosted／shared；真實車牌／證照與現場上車仍外部未驗。                                                                                                         |
| UC08 必要資料／聯絡     | 原真聯絡 fallback 保留；新 hosted 外部 disclosure color 缺漏→真派遣拒絕→不完整資料不冒認→原 row 復原→同單正常指派                                                                                                                                | shared 沒有正常可發布 incomplete disclosure 的演練入口，故該控制未執行；電話接通不能從 API201 推得。其他必要欄位逐欄及真人通話仍列未驗。                         |
| UC09 圖資／選址         | 原定位拒絕、超區與真 Google .6 信用保留；新 hosted 外部 fetch 斷線／真 timeout／零候選／同名候選／恢復後真 quote                                                                                                                                 | shared 外部故障控制、真 GNSS／原生圖層與道路導航另驗。固定演練點不代普通搜尋。                                                                                   |
| UC10 離線／重連         | 原離線改派、freshness 失效恢復保留；新草稿重載、真正 commit 後 lostACK、連點／reload／原 key/body／並行 replay／唯一 UUID；三角色所有 contexts 真同時斷網65秒／各自 fetch 拒絕／原單任務恢復後正常完程；產品 per-tab 恢復及 401 同／不同帳戶單測 | own hosted／shared；數小時長離線、真系統終止仍需實際裝置／環境，65秒與 unit 均不充當已演這兩者。                                                                 |
| UC11 欠款／補繳         | 原 B 同 paymentId failed→captured 及欠款拒約保留；原 B stale message 修補 retained                                                                                                                                                               | 新共享同單補繳文字；真 PSP 清算、worker 多實例、退款依原 payment authority，不從一次合成 capture 推全部完成。                                                    |
| UC12 文件               | 新同單 not-ready、真讀取斷線／恢復、正常完程後 receipt immutable readback；舊四份完整合成 HTML 保留                                                                                                                                              | own hosted／shared；正式 E04 issuer、歷史 operator、settled-payment binding、總額／toll 採認仍原 `PAX-RECEIPT-E04-CAPTURE-20261015`，USER decline 未答維持未答。 |
| UC13 高分／不可改       | 新五星真 UI、兩次真改分409、原 rating 不變、重整隱藏入口；原 E 低分 first-write 信用保留                                                                                                                                                         | own hosted／shared；其他合法星等、標籤與文字組合不由兩分／五分自動算全驗。                                                                                       |
| UC14 低分／聯絡意願     | 原 .6 B contact=true、E false／無案內部結果保留                                                                                                                                                                                                  | 同版共享及適用回歸；真人接案／通知送達／聯繫成功未驗，無需重造 CRM。                                                                                             |
| UC15 三類申訴           | 原 lost-item 內部處理保留；新 fare／service 原表單→原單→Ops 五歷程與四次真稽核回執                                                                                                                                                               | own hosted／shared；PAX 失物同單 voice callback／真人聯繫／物品返還不能借另一 Voice 原單證明。                                                                   |
| UC16 福利／輪椅         | 七既有產品映射如下；輪椅 production 是能力需求及真 409 轉人工，不是普通車替代                                                                                                                                                                    | 未有明確福利方案、資格／區域／費用來源與真專車供給證據；未提供依據列未解，不新增產品或刪除原需求。                                                               |

## UC16：七既有產品、資格與供給來源

`packages/contracts/src/index.ts::SERVICE_PRODUCT_TYPES` 列七產品；`service-product.service.ts` 的 timing／billing／license defaults 是 catalog 初始資料，**不是 live active、福利資格或可用車司證據**。`vehicle-eligibility.service.ts::resolveServiceProductForOwnedOrder` 優先讀原 intake 的 precise code；legacy ordinary 為 taxi_realtime，四個 business subtype 各映射同名產品。

| Service product               | 真正入口／runtime 對應                                                                                                                       | 資格／費用來源與界線                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| taxi_realtime                 | 既有 ordinary API／Voice。`applyVoiceBookingQualification` 明確限制 ordinary_taxi／taxi_realtime／on_demand，不能轉換其他產品或 reservation  | 原 service-area qualification、vehicle eligibility、meter catalog；不由此推有福利身分。新 matching case 只驗 existing ordinary API/Driver/Ops，沒有宣稱 Passenger 可即時叫車。                              |
| taxi_reservation              | 普通 Passenger `/login`→quote/create；`PassengerBookingService` 拒非 scheduled snapshot；原 create stamp multi_taxi_direct／taxi_reservation | 原 multi-taxi authorization、owned payment／fare snapshot；create 的 benefitReference 為 null。`prepareRuntimeProfileServiceProduct` 與真 authorization 必須通過，不從 seed active=false 推論 live 不支援。 |
| enterprise_dispatch           | tenant／partner 既有 booking；business_dispatch serviceBucket＋enterprise_dispatch subtype                                                   | `listTenantServicePrograms` 的 allowedServiceProducts、pricingPlan／eligibilityRule／serviceRuleSet；企業預設月結或該 partner 合約各自採認，不當福利方案證據。                                              |
| credit_card_airport_transfer  | partner entry→eligibility→booking，business_dispatch＋同名 subtype                                                                           | bank_card_inline／reference_required 合約、真 eligibility verification、issuerAuthorizationRef／benefitReference；卡友機場權益不能自動等同福利身分；航班、區域、固定價／車輛 permit 依原規則。              |
| insurance_replacement_vehicle | 原 tenant／partner booking capability，需 active product／entry；business_dispatch＋同名 subtype                                             | 原 partner program／qualification／settlement；不從 inactive catalog default 推 live availability，也不造保險或福利憑證。                                                                                   |
| travel_agency_transfer        | 原 tenant／partner booking capability，需 active product／entry；business_dispatch＋同名 subtype                                             | 原 partner program／qualification／settlement 與區域／車輛資格，不以一般預約的車司互替。                                                                                                                    |
| third_party_forwarded_order   | forwarder／外部平台原流程；`ForwarderService.broadcastOrder` 明確查此產品的 eligible supply                                                  | external-defined timing／external-platform settlement；不硬套 owned runtime 或把外部付款、優惠當本 Passenger 已驗。                                                                                         |

`TenantPartnerService.verifyPartnerEligibility` 先檢 accessible entry 與既有 identity，再執行既有合約，verification 綁 entry／program／business subtype，保存 benefitReference、issuerAuthorizationRef、decision／manual fallback。這只證既有機制存在。福利須原方案明確提供「服務產品、適用身分、區域、費用來源、入口、合格／不符／無供給／取消」對應；當前沒有該完整輸入或當次旅程 UUID，明列未驗。

`packages/contracts/src/booking-requirements.ts` 的 wheelchair／child_seat 是 requiredCapabilities。`validateBookingRequirements` 對非空能力、超四人或 oversized luggage 真回 `409 BOOKING_REQUIREMENTS_UNSUPPORTED`，訊息要求 verified capabilities 與 human handling。license-class defaults／matrix seed 不證設備或座位實測，也不證目前可派的專車。原 production 拒絕已有既有 unit；人工轉介後完整服務與真正專車正向、資格不符、無供給、取消及照護者協助仍缺具體 producer／供給與實跑。不用 409 當完整無障礙旅程通過。

## 執行契約與證據

- VM 僅 socket-free lint／unit／typecheck；不開產品、browser、HTTP、Postgres、Compose 或 Expo runtime。
- config 延用原 hosted job／正式 migrations／disposable database，保留舊 suite。bureau job 的原五 OTP 加新多角色案例；40 分鐘 job budget 與每案例等待分開，業務 OTP300000／resend60000／quote15min／acceptance60／matching90 不縮短。新增跨角色案例包含正常完程與兩條 CRM 旅程，case budget 八分鐘，仍待自己的 hosted 實測時長。
- shared `webServer=[]`；Driver 用 `PAX_REVIEW_DRIVER_ORIGIN/review-driver`（目前 private Ops mount），非 shared 用原3101 standalone。Ops／Driver 分別沿 `PAX_REVIEW_OPS_ID_TOKEN`／`PAX_REVIEW_DRIVER_ID_TOKEN` 正確 audience；public Passenger context 不附 GCP token，僅非 public Passenger 沿其原 token。app OTP/session/Driver JWT 全保留。
- shared fresh identities 由 `PAX_BUREAU_PHONES` JSON 明示分配既有 `09000000xx` 合成池，keys 為 consent／wrong／resend／expiry／returning／trip／reliability／matching。各 case 分配號碼不可重複；wrong-code 案分配的帳戶亦供真跨帳戶拒絕驗證，其首次合法 OTP 仍須實際看見 first-consent gate；不假設兩案先後順序。沒有清使用者、偽造驗證或注入 storageState。
- 用原 `recordOrderEvidence` 保存正式 PG joins／共享 owned readback 與原圖；不開 trace/video 記錄 OTP、Driver registration 或 headers。失敗仍失敗；原 interrupted recovery 只處置自身新單，on_trip／proof_pending 不強制取消。UC08 僅 hosted external supply row 精確復原，不刪資料。

### 可執行的 shared hosted 入口

原 `deploy-dev` 只執行 core／additional／quote／60 秒／decline，沒有新增 bureau suite。新增入口是**既有** `ci-integ.yml` 的 opt-in `shared-bureau-acceptance` job；原完整 CI jobs、門檻與 deadline 均保留。此 job 不部署，不變更 IAM／API enable／runtime；只沿用既有 WIF 身分、固定 `drts-dev-devcc-20260825/us-central1` 三個現存 Cloud Run service，並執行普通產品旅程。不得與 Root 正在進行的 shared acceptance 競跑。

由 Root 正常接受並部署這批 Source 後，在有此 workflow 的完整不可變 definition SHA 上觸發。`EXPECTED_RUNTIME_SHA` 是實際部署後的新完整 SHA；normal squash 後須用該 accepted SHA，不能拿舊 checkpoint 的 checks 或 61fa 當本批通過。先分配八個互異且仍可實際出現首次條款的既有合成池帳戶，再執行：

```bash
# 三個值先由該輪接受／部署與正常合成身分分配收據取得。
# DEFINITION_SHA、RUNTIME_SHA 都是完整40位SHA；PAX_BUREAU_PHONES 是JSON字串，
# 必含 consent/wrong/resend/expiry/returning/trip/reliability/matching 八個 keys。
gh workflow run ci-integ.yml --ref "$DEFINITION_SHA" \
  -f ref="$DEFINITION_SHA" \
  -f shared_bureau=true \
  -f expected_runtime_sha="$RUNTIME_SHA" \
  -f bureau_phones="$PAX_BUREAU_PHONES"
```

job 首先驗 definition／實際 checkout 完整 SHA、現行 project／region；再唯讀核 API／Ops／Passenger 都將 100% traffic 指向 ready revision，且各 `DRTS_CANDIDATE_SHA` 符合 runtime SHA。Ops 必須仍 private、Passenger 必須仍 public-only。之後只 mint Ops origin audience，供 Ops／private Driver；匿名 Passenger `/login` 與帶各自 credential 的 Ops／Driver 入口都須真 HTTP200 且 `x-drts-candidate-sha` 相符，才執行 suite。Passenger request 與 browser context 都不附 GCP token。

shared config 的 `webServer=[]`，不啟本機產品或 PG。Google 外部故障／disclosure fixture 如無 shared 控制則保留具體未執行 attachment，ordinary90 只有 live 設定已驗90秒才執行，其他設定明示 skip；供給缺漏或背景排程失敗保留真失敗，不能因其他案例成功授予這些分支信用。八個分配不是 fresh 的證明，實際 first-consent gate 缺少仍直接失敗，不清帳戶。

結束後再核三端 revisions 未變；artifact `shared-pax-bureau-<runtimeSHA>-<runId>` 保存 before／after runtime manifest、served-entry 事實、Playwright report、原圖、readback 與未執行原因。definition／runtime 不符、途中換版、產品斷言失敗都是真失敗。此入口已寫 Source，尚未觸發或取得 hosted／shared 綠燈。

實際本機證據位於 `.local/passenger-bureau-gap-correction-20261018/journey-normal-fallback-20261019/source-checks/`。`booking-remount-before.json` 保存原4264 caller exit1及 fixed 檔 byte 還原 hash；`booking-401-before.json` 保存真 401 原 caller 的 1 pass／2 fail；`server-booking-before-61fa.json` 保存真正 production caller 的五項語意失敗。第一次135pass／1測試準備失敗、修後單案pass、舊136pass、並行負載下135pass／3原5秒timeout、修後138pass、早期SQL wire fixture失敗及修後結果皆保留，沒有把測試準備錯誤稱產品修前。

首輪 e3a 凍結程式的本機檢查為 `final-frozen-unit.json`：23檔、333 pass／19 hosted-only skip、原 deadline、maxWorkers=1、exit0（2026-10-19 03:28:43 UTC）。19 skip 包含四項新增原生 PostgreSQL 情境；VM 沒有執行 PG。`final-root-typecheck.json`、`api-typecheck-atomic.json`、`passenger-typecheck-fixed.json` 與 `final-scoped-eslint.json` 均 exit0；`shared-runtime-unit-final.json` 為七項 Python 單元 pass。每份 JSON 保存實際命令、退出碼、原 log 及開始時 Source hash；該輪最後僅補證據文字，不借舊版檢查給後續程式。這些結果沒有啟 VM 產品或 PG，也沒有授予 browser／shared／正式 E04 信用。

### 首輪 hosted 真結果與原 consumer 退修

原候選 `e3a22291903289539780696b9cef991707771a35` 的 READY 主 CI `39195252634` 真 success（17 jobs success／3原 scope skip）；quote `39195248212`、60秒 `39195248177`、拒單 `39195248257` 亦各真 success。quote 原等待約901秒後拒絕舊快照、重報價及唯一新單正常取消；60秒與拒單各沿同原 UUID 恢復。這些是該輪自身結果，不能授予新候選整版信用。

主 CI 原 artifact `12162034297` 的四項新 native PostgreSQL 案例為4 pass／0 skip：兩獨立 pool 真 unique／row-lock 競爭同 UUID、異 body 409／真帳戶隔離、actual COMMIT 後失去回應由新 actor 找回、actual history INSERT 後 rollback／同 key 重試。它們沿既有正式 migration 與 production repository。Root 已獨立讀原 ZIP／JSON／GitHub source binding；第二個 integration unit-shard3 原報告亦四項 pass。VM 的19 skip紀錄仍原樣保留，不能改稱本機 PG 通過。

GitHub 的 artifact workflow head 是 e3a；原 PR 預設 checkout 為 synthetic merge `dee038e19028e3abe6a6513214b128200cba5b6e`，parents 是 accepted Guide `a7ec8281ff35399eb35728facca75c54af0d5cf1` 與 e3a。兩個 tree 不同，差異只為已 accepted Guide 五檔；本 task 的 booking／API／nativePG Source 相同。原始 commit／tree 比較另存 `hosted-e3a-watch/ci-integ-actual-merge-checkout-binding.json`，不把 workflow head 與實際 checkout 混寫。修補分支已普通 merge 該 accepted dev，沒有 rebase／force。

同輪 bureau job `117879312318`（integration `39195252739`）真 **2 pass／3 fail／3 skip，0 retry**，不能由主 CI 或 PG 綠燈掩蓋。原 artifact `12162546063`、ZIP SHA256 `ceee72ef864d97bb156a099a674c2f9e0215de78853acbe67d6892f404e5048e`、原 JSON／error-context／safe-progress 與逐案診斷存 `source-checks/hosted-e3a-watch/`。

三項真 consumer 失敗為：OTP alert 同時含錯誤與剩餘次數，舊 exact 全文 selector 找不到；舊 Driver task 已在真 API 取消，但 caller 沒操作產品既有的手動刷新；零候選同時有 visually hidden live 公告與 visible StatusBanner，舊 selector 真找到兩個節點。Root 正常 reopen 後，只修原 alert 及剩餘次數的同容器斷言、重用原60秒旅程的正常 Driver 刷新與同 UUID／取消／操作阻擋核對、限定真正可見 no-match banner。三檔 scoped ESLint exit0，語法 transpile exit0（不當 typecheck）；沒有修改產品或任一原業務／測試期限，新的完整 hosted CI 仍必須執行。

首輪 bureau 只有首次 consent 與新 ordinary90 matching 完整 pass；後者真 elapsed98532ms、reason=matching_timeout、manualTimeoutCalls=0，原 UUID 重派／Driver接受／正常取消。UC08 color 缺漏真409且 Passenger assignment null，以及外部 Google 斷線／timeout／零候選 API 到達只列部分結果。五次錯碼未完成，重寄／真正301000ms／回訪因原 serial 前案失敗而真 skip；on_trip409／65秒全斷線／正常完程／receipt與aftercare、lostACK／跨裝置均未走到。原五組與 UC01–16 全部保留，不能把這些列為通過；上方表格的待驗 Source 以本段逐案實際結果為準。

## 第二輪 c338 自身 hosted 結果與後續修補

候選 `c3382efd5d41da5f8a4f0fe01c27773ac703b7bc` 的完整候選仍為34檔／原18 scopes；最後 repair commit 只有4檔，兩者分開。自身主 CI `39198273287` 真成功（17 jobs success／3 scope skip）；quote `39198273309`、60秒 `39198273316`、decline `39198273334` 各自成功。主 CI 與 integration `39198273391` 的 native PostgreSQL 四案都實際執行，各4 passed／0 skip；原 artifacts `12163551408`、`12163782964` 的 ZIP SHA256 分別為 `4ff6d3df92531fd74c8bb875c14dea105151e06e451d92b870437af9910e960b`、`9019da8a42b265e43703574df008f25f719933021ff56e0145e1d2a242cb0653`。PR checkout 為 `b1cad8ad4403fa292de05688cedec2ec16d67802`，與候選 SHA 不同；兩者 tree 同為 `0faa346cc2a5de2956a91a2821e656ea680da013`，不是把 checkout SHA 冒稱為候選。

自身 bureau job `117887749912` 真為 **5 passed／3 failed／0 skipped／0 retry**。原 artifact `12163897336` ZIP SHA256=`c14df08ffc936d0a95d63e6d09004815b9c81f423b5d97f8f407428694349275`。完整成功的是 ordinary90 matching（110680ms）、首次 consent、五次錯碼、真60秒重寄（61486ms）、真五分鐘過期（301622ms，原 `301_000` wait 不變）。UC08 缺車色409與UC07真 Driver B 原單亦有部分附件，但 on_trip UI／API409／不變量、65秒斷線／正常完程／receipt及申訴尚未走到完整成功；UC09停在選擇第二個同名地址後，lostACK／跨裝置分支未執行。回訪第二次 OTP 真429，沒有把前五項成功擴稱成回訪或全16案通過。原 JSON／各 error-context／safe-progress／raw logs 與 Source binding 留在 `source-checks/hosted-c338-watch/`。

Root 正常 request_changes 後，沿原任務處理三個實證原因：

- `P5-07` on_trip 專用 `RideContent` 漏掉既有 `Actions`；原 mapper 已回 `canCancel=false`、原 `Actions` 也已有 disabled 邏輯。Supervisor 正常精確加配此 product path（19 scopes），只在該分支重用原 `Actions`，不改授權、API、聯絡政策或其他畫面。新增真正 `RideContent`＋production mapper 的 socket-free DOM 回歸：原 c338 同2案為 arrived_pickup enabled PASS、on_trip missing-button FAIL（exit1）；六行修補後同2案 PASS（exit0），disabled click 不觸發 confirm／fetch。這不是 hosted API409 或共享瀏覽器通過；原真 UI disabled＋API409＋同 order/task/assignment/payment/charge 不變斷言全部保留。
- 真 picker 選擇已有座標的搜尋候選時直接套用地址，不會呼叫 `/geo/resolve`。刪除不存在 caller 的等待，改從真正 quote POST body 核對所選第二候選座標，仍要求真201及 serviceable／可見選點，不改300秒 test budget。
- OTP 演練端點實際送本地 `0…` target，helper cooldown lookup 用 `+886…`，造成同號登出重登入漏掉等待。issue 與 lookup 同用正規化 key，保留原真60000ms與 server limiter，沒有重設帳戶或縮短期限。

必要現值 socket-free checks：受影響原 ride 元件／live screen／role runtime 與新回歸共5 suites、34 tests全 pass（原 deadlines、maxWorkers1）、Passenger app `tsc --noEmit` exit0、四檔 scoped ESLint exit0。未變動的 API／booking／root 大型 compiler 不重跑；它們原檢查時間與舊 head 保留，新 own full CI 尚待執行。第二輪 c338 integration 最終正常 failure（19 jobs success／4 scope skip／bureau及兩 aggregates共3 failure）；core／additional 原 job 成功，沒有取消仍在執行的舊旅程。這些各自不等於 shared-bureau 或新 Source 通過。

safe-progress 的 `/rides` GET 亦可能是 review 導覽的 Next Link prefetch；未當成已證明的錯誤導航。新 Source 須重新產生完整 immutable candidate、自身 full CI、獨立 review 與正常 merge，舊 c338 的窄通過及真失敗各自保留，不借給新版本。全部五組、UC01–16 與下列兩 keys 的未解來源／shared 條件維持。

凍結前普通合併最新 accepted dev `2460749f9a0d097973c71d91bedcc481466486dc`，peer Environment／SOS／Platform Source 保留原作者信用。第一次 merge commit 因 subject 漏 TASK-ID prefix，被正常 commit-msg hook 真拒絕（exit1，原記錄保留）；修正 subject 後正常 merge completion／hooks exit0，未 bypass／amend／rebase／force。原36個 Journey 路徑的程式保持 byte 相同，但正常 lint-staged 對43個 incoming accepted 檔案中的6檔產生精確 Prettier 重排；沒有宣稱43檔全 byte 相同。Root 獨立核6檔恰等於既有 installed formatter 輸出後，正常有限加配6個機械 hunk（25 scopes）；無 auth／SOS 語義修補或額外測試 gate。完整候選相對該 accepted base 是 **42 paths＝原36 Journey＋6機械格式**；格式中的兩處 JSX 只拆相鄰字串、可見文字相同。兩 keys／全部 acceptances／五組與 UC01–16 不變；accepted peer 祖先不列本 task 新功能信用。

## 第三輪 4b16 自身結果與 receipt／fixed 草稿修補

候選 `4b1696dd4118f397e3d781da5ef1445ccc029e5e` 自身五 runs 均正常終態，沒有取消或重派：主 CI `39202670906` 成功（17 success／3 scope skip），quote `39202670872`、60秒 `39202670981`、decline `39202670856` 均成功；原 core／additional 各1 passed（9.1／7.1分鐘）。Integration `39202670869` 最終 failure（19 success／4 scope skip／bureau與兩 aggregates共3 failure）。主 CI／integration 的 native PostgreSQL 各四案均真正4 passed／0 skip；新 RideContent 兩案也實際 hosted pass。實際 synthetic checkout `f60cb42b30bfecea2c5e209e55bf09b68e4b8f0b` 與 workflow head 不同，但 tree 同為 `27cc295bfe986f4663ef27a65ea9d6631960e299`，原 log／ZIP／JSON 與 enriched binding 各自保存。

Bureau job `117900036203` 真為 **6 passed／2 failed／0 skipped／0 timeout／0 retry**。原 artifact `12165218714` ZIP SHA256=`5b1b57c06780e2330281a33e0379b508d3bd631423078c7c69b6bd0a3c60c553`。ordinary90（108414ms）及全部五 OTP 通過，含真五分鐘301674ms、回訪60580ms。on_trip 的實際 disabled 按鈕、同 session API409 `ORDER_NOT_CANCELABLE`、原 order/task/assignment/payment/charge 與前後 SQL rows不變已有原圖／facts；後續 receipt 頁初始 pending 缺失才使整案 fail。外部圖資故障／候選選擇／真201恢復報價及兩卡 default／放棄刪除已到；草稿重載午夜時間也通過，但錯用 standard picker selector 而 fail。65秒全斷線、正常完程與 aftercare，以及 lostACK／跨裝置／最後零 charge取消仍未走到，不能算這些已驗。完整記錄在 `source-checks/hosted-4b1696-watch/final-summary.json`（SHA256=`eebcdafa9e8c98d34c83b627c14888084e8d3e6129548a02ac8adcc552912ced`）。

Root 正常 reopen，並精確加配原 Web mapper path（26 scopes）：receipt route 已選 P5-10、owned authority 也有 `canReadReceipt=true`，但 mapper 只為 completed／已有 receipt 建 certificate，未完成原單因而沒有 pending Card。只加 `kind === "receipt"`，保留原 capability 判斷與普通 on_trip ride 不顯示證明。真正 mapper＋RideContent 的原3案在4b16為2 semantic FAIL／1 PASS；補 condition後顯露同檔 account receipt wrapper 把真 `PassengerApiError(404, PASSENGER_RECEIPT_NOT_READY, English message)` 丟成500／message。Root 另正常核同檔第二窄 hunk，沿既有 authority reader pattern 保留原 status/code；未知網路錯誤仍是 error，不改 token route、API、授權或任何 E04 欄位。實際 client error adapter→Card 的同3案為1 FAIL／2 PASS→3 PASS，包含404 pending、斷線 error、重試404恢復 pending、denied無retry與普通畫面不變。新增直接 status/code 回歸與後續必要 checks另留實際結果，這些 socket-free 單元不是 hosted／shared通過。

草稿 consumer 仍沿原 `prepareBooking` 的 fixed UI；重載後驗兩個真 select 的原 `review-banqiao`／`review-city-hall` address IDs，並以第一筆真 quote POST 的兩端座標對照重載後真201 quote及合法午夜ISO。原 sessionStorage 保存／時間還原、未報價前無費用勾選、重新報價後未勾／確認 disabled等斷言全保留，不延原300秒 budget、不換訂單／授權假資料。全部五組、UC01–16、兩 keys及所有外部／shared條件仍保留；此修補須產生新 immutable candidate及自己的完整 CI。

本輪普通合併 accepted dev `e4d962152e6b51ef72c2b5469d5e6dbdb38f347c`（含 accepted Complaint／public-info），無衝突；原 Journey程式／測試與合併前 repair逐byte相同，peer差異沒有被改寫。先前六個機械格式檔已屬 accepted ancestry，因此本輪完整差異是38 paths／原26 scopes。必要現值回歸在合併後實跑7 suites／47 tests全 pass、0 skip（含新增receipt四案及原ride／live presentation／role cases，原deadline、maxWorkers1）；Passenger app `tsc --noEmit`、三檔 scoped ESLint與正常hooks均exit0。新immutable候選仍須自己的完整hosted CI，沒有借4b16主CI或原PG／OTP／on_trip窄成功當新版通過。Root獨立literal review與兩keys仍循原流程。

## 第四輪 3b08 的靜態 consumer 退修

候選 `3b087fdfff2393ba4ebec02e6dd67ee7e85bb797` 的自身 runs 為 main `39206809985`、integration `39206809914`、quote `39206809889`、60秒 `39206809886`、decline `39206809883`；退修時尚未全部終態，不預寫成功。Root 已獨立核該候選38 paths／26 scopes並實跑 receipt四案4 pass／0 skip；這些仍限該 SHA，非完整 hosted／shared 信用。

後續唯讀預檢發現 reliability 的固定卡片 consumer 錯配：前段保留第一張卡作原單測試，另將第二張設為 default；UC03 reload 後產品正常重新選 current default，原測試卻繼續刪第一張並期待 active-order409。Root 正常 reopen 後，只在重報價原費用勾選前以真 radio 重新選第一張，並斷言實際 lostACK 建單 body 的 `paymentMethodId` 正是該張。原 default 切換、未勾費用／確認 disabled、原 key/body／UUID、不准刪 active 卡409及取消後可刪200全部保留；不改產品卡片持久化或期限。這是靜態 caller 修補，未把它當 hosted fail／fixed pass。

有限預檢亦核對原建單重送、跨裝置、異 body／異帳戶與最後取消／刪卡契約；未見其他確定錯配。原 workers1、retries0 下，成功跨檔沿同 worker/module cache 共用 OTP helper 的 normalized target Map，仍真等原60秒；未新增 setter、時鐘替換或無條件等待。新 immutable 候選須重新取得自身 CI，3b08 後續真結果另存原 SHA 證據，不手動取消執行中的 runs。

本次僅 E2E consumer／文件變動；單檔 scoped ESLint與含其真 imports 的 TypeScript `--noEmit` 均exit0。未變動產品與47項單元的原檢查保留原6636／3b08 Source byte／時間界線，未重跑或改標新版完整通過。

## 第五輪 f85 自身結果與最後兩項 consumer／fixture 修補

上一輪3b08最終 main／integration 因正常新 push 自動取代而 cancelled，三專用各自 success；沒有手動取消。舊 bureau ZIP只有兩份部分 safe-progress、沒有 report.json，原 collector exit1保留，不能造八案 counts；原 main native四案4 pass／0 skip仍僅保留其實際 Source／checkout窄信用。

候選 `f85be4c9d391bad5a2a0fb1b42a3b053ed678076` 五 runs 全部自然終態：main `39208456680` failure（14 success／4 skip／2 failure）；4 skip中前三項為原 Repo classification／Dependency security／i18n guard，Product smoke acceptance則因 unit failure未執行。Integration `39208456689` failure（19 success／4 skip／3 failure，bureau與兩 aggregates）；core／additional真各1 pass（9.8／7.1分鐘）。quote `39208456674` 真1 pass／15.4分鐘，60秒 `39208456690` 真1 pass／1.7分鐘，decline `39208456699` 真1 pass／19.2秒，三者原 log的實際 checkout均完整f85。

兩個 unit lanes的 native PostgreSQL四案、receipt四案及 on_trip control兩案均實際全部 pass／0 skip。原 log／GitHub commit核對 actual synthetic checkout `b912f438c935afa21749bd14993b9829a6c57bfc`，與f85 tree同為 `037867e73a82ed479ecbe40bc3eab4b6744efdd4`。原 artifact／JSON／原圖及逐案事實保存於 `source-checks/hosted-f85be4-watch/`；`final-enriched-evidence.json` SHA256=`4f8e5bc9df324a92ee772b63a83059123e2fc88ebcf6397a848902e79b600d57`。這些正向不掩蓋同輪 main／bureau真 failure，也不授予新 Source或 shared信用。

本輪 bureau原 artifact `12168416111` ZIP SHA256=`8f1c7644a8d7cd07027c2a019a6c24a98759119f5154104e6f2924457b6a14da`，真 **7 pass／1 fail／0 skip／0 timeout／0 retry**。ordinary90為112214ms；reliability63098ms真通過外部圖資故障／真201恢復報價、午夜草稿重載／費用重確認、原卡建單、原 BFF/API/PG commit後只丟ACK、原key/body重送及並行同UUID、另一裝置／真異帳戶、active卡409／無charge取消後可刪。五個OTP全 pass，wrong57681ms實際等待跨檔同target原cooldown，resend61369ms、expiry301413ms（原301000ms不變）、returning60381ms；不另加無條件等待。

on_trip原單 `0d3e6428-ef52-40b5-93c6-8b87a0cc6105` 的禁止取消UI／同session API409／SQL不變量、65秒全角色離線恢復、Driver正常完程、同單receipt斷線／重試／immutable及五星首次寫入／409均已實際走過；本輪全部案例共保留22份facts與34張原PNG。本案237067ms最後在UC15 fare首個notes後狀態斷言失敗：期待new，真writer依原規則回under_investigation；notes的成功actionReceipt、audit UUID及audit查詢都已通過。尚未走到fare assign／resolve／close／完整timeline或service類別，不把它們當通過。Root及另一位唯讀reviewer各自核原規格與writer後，只修既有helper：初始新案加精確status:new，notes加精確under_investigation；其餘四動作、雙類別、原case/order/category、receipt/audit/timeline及期限全部保留，產品不改。

main的真失敗是既有C114合成PG fixture清理race：shard2原JSON為2565 assertions pass／19 skip／零failed assertion，但Vitest真catch一個未處理PG `57P01`並exit1。pool.end可早於idle backend真正退出，原FORCE DROP打到仍ending的本隨機DB連線；不歸咎同輪accepted Driver差異，也不吞error或重試舊版湊綠。Root正常加配第27個精確scope後，只修該fixture的原afterAll：關自己pool後以admin查本dbName的pg_stat_activity，最多20秒等0，再普通DROP；原30秒hook、六項native業務assert及global DatabaseService不變。VM只做scoped lint／真imports TypeScript，皆exit0，沒有執行PG；新清理仍須下一候選自身hosted驗證。

本次等f85 bureau與additional全部終態後才整理修補。Fresh accepted dev `88bde9b6df9826d6a52b5297ebbc91b692ff112e` 的Voice／Tenant72檔與Journey原38檔及新fixture零重疊；已普通合併為 `f228d62df1127b21d38aa86a1e56a3730df91290`，72個peer blobs與39個自有committed blobs跨合併均逐byte核對不變，peer作者／Source保留。整批差異39 paths／27 scopes；合併後兩個受影響檔及其真imports TypeScript亦exit0，未變動47unit不重跑，C114仍未取得修後PG信用。實際immutable及byte manifest另存機器證據。全部五組、UC01–16、原兩keys及外部E04／USER／真車供給／same-release shared界線保留，新完整CI及Root獨立review不可省。

## 第六輪 faf6 的八案正向、hook 退修與完程畫面等待

候選 `faf6475fdf94b36187204c93d10f909e8bdb80ce` 的五 runs 全部自然終態，沒有手動取消。main `39213303382` failure（14 success／4 skip／2 failure）；前三個 skip 為原 scope，Product smoke acceptance 因 unit failure未執行。Integration `39213303583` failure（19 success／4原 scope skip／3 failure，unit shard2及兩 aggregates），但 bureau、core／additional均 success。quote `39213303490`、60秒 `39213303450`、decline `39213303548` 各自 success。原 reports／raw logs／實際 checkout與逐檔 hash 保存於 `source-checks/hosted-faf647-watch/`，不把 workflow head 與 synthetic checkout `50d39e54ea3814b858611004d45615b76024bcde` 混寫；兩者 tree 同為 `73e3e113fefce0e3750df9ed5e525b83ddebff42`。

Bureau 原 artifact `12169687003` ZIP SHA256=`90b75b6551c0f15db292e5c4b059a2b190d66a70003af471bb92187e4f01e3f6`，真 **8 pass／0 fail／0 skip／0 timeout／0 retry**，保留24份 JSON facts與36張原PNG。ordinary90為110115ms、on_trip及aftercare258954ms、reliability64075ms；五OTP分別801／56937／61502／301662／60552ms，原301000ms過期等待與60秒cooldown未縮短。UC15同原order `534be8a1-0aac-4c0a-97c5-b2047f7fcab0`，fare案 `PAX-36e8d199-cb7d-4390-9053-318648ec450c` 與service案 `PAX-6b7104ac-19bb-423b-9c5f-284caf96c844` 均完成四個真action receipts／audit UUID／狀態readback，及精確五筆 created／note／assigned／resolved／closed timeline。Root已獨立核原ZIP／報告／雙類別facts；此成功僅屬faf的hosted disposable CI，不是新Source或shared全16案通過。

兩個 unit lanes的原booking nativePG四案、receipt四案與on_trip兩案各實際pass／0 skip；C114六項native業務assert也各pass，但**兩lane的C114 suite及job都失敗**。本次Source使用 `expect.poll` 於afterAll，installed Vitest明確要求它只能在test內；原log為 `expect.poll() must be called inside a test`，不是外部阻塞，也不能以六assert成功採認清理修復。Root正常reopen後，只換為 `vi.waitFor`，在原hook內真查自己dbName的pg_stat_activity並expect連線0，保留20秒／50ms、原30秒afterAll、普通DROP及六assert。socket-free實際afterAll framework probe在原API為1 test pass但suite fail／exit1；同hook改用vi.waitFor後1 suite／1 test pass／exit0。這只證明framework context可用，尚未驗新PG清理；前次Source no-findings初review與其後修正歷史均保留。

原完程PNG亦不能代替Passenger主ride終態：`22-UC05-normal-completion-pax.png` 取圖時仍為「行程進行中」並有live driver marker；Driver原圖已見「追蹤 · 已結束」。API／SQL完成與後續receipt頁已完成均不授予主ride／Driver全部終態畫面信用。依Root及supervisor授權，在原handled=true後、原recordOrderEvidence前加有界真UI等待：Passenger仍原UUID，精確「行程已完成」可見且live driver position消失；Driver仍/trip、原order/task可見、完成追蹤與停止定位文字可見且待開始文字不存在，再附actual innerText／URLs／IDs及原三角色圖。沒有reload、sleep、產品改動或延長原deadline；新guard仍須下一候選hosted實跑。

兩項小修與真imports TypeScript／scoped ESLint均exit0；未變動47unit不重跑或改標新版本信用。五組、UC01–16、兩keys與正式E04／USER／真車供給／same-runtime shared條件全部保留。新immutable候選仍須自身完整CI與Root獨立review，不借faf的八案正向、PG窄成功或舊版檢查當新清理與終態畫面通過。

## 第七輪 7bd8 的清理正向與 Driver reference consumer 退修

候選 `7bd8df4fdb9852881a2877e6058c7ce8b5288101` 五 runs 全部自然終態，無手動取消。main `39216988970` 真success（17 success／3原scope skip）；quote `39216988764`、60秒 `39216989033`、decline `39216989469` 真success，各原log為1 pass／15.3分鐘、1.7分鐘、28.5秒，實際checkout均完整7bd。Integration `39216989113` failure（19 success／4原scope skip／3 failure，bureau及兩aggregates）；core／additional各成功。原log的synthetic checkout `8e49a0486b069737fcb934aef598dee708fb7fa5` 與7bd tree相同，各job的原git marker分別核對。完整封存 `source-checks/hosted-7bd8df-watch/final-enriched-evidence.json` SHA256=`e96bfc98623b89af668b7fee6c68296f32b078934a408bef3ce604a68d612df3`。

新版C114在main與integration各自完整suite／job真success，六項native業務assert各6 pass／0 skip，原logs各2579 pass／19 skip、218 files pass／3 skip，無hook／unhandled／failed-suite錯誤；Root分別獨立核原ZIP／JSON／raw git marker。這次可採各lane的vi.waitFor真PG清理成功，前兩輪57P01及expect.poll錯誤仍保留。兩lane的booking native四案、receipt四案與on_trip control兩案亦各真pass／0 skip；這些不等於整體integration或shared成功。

Bureau原artifact `12170654559` ZIP SHA256=`31dc0ba7d15e12762a579ff6fe8b8dfc781ca0f1fa0e75cd9fbe85debf97c7e3`，真 **7 pass／1 fail／0 skip／0 timeout／0 retry**，19份JSON facts／27張原PNG。ordinary90為111943ms、reliability63362ms、五OTP為752／57670／61453／301428／60455ms，原等待與政策不變。on_trip／同session API409／同單SQL不變量、65秒全角色斷線恢復與Driver正常完程均已走過；新終態step在Passenger原UUID頁精確完成可見／live marker消失之後，於Driver裸orderUUID的exact文字selector失敗（原30000ms）。後面的Driver task／追蹤／定位guard、terminal facts／三角色完程圖與aftercare雙申訴未執行；不能借faf雙類別成功當7bd成功，也不把整個新UIstep列通過。

真正Driver頁首原本是單一 `${taskId} · ${orderId}` subtitle，另有exact taskId Pill；原readAssignedTripAndAccept使用 `/trip$` 無query及orderUUID substring。成功complete只重讀原任務，不會增加URL query或render裸orderUUID。Root正常reopen後，只把該錯誤consumer改為精確完整task／order pair，actual innerText欄名改為 `driverTaskOrderReference`；原orderId／taskId獨立facts欄、exact taskPill、authority綁定、Passenger及Driver所有正負guard／期限完整保留。不改產品、不加不存在的query、不reload或sleep。必要單檔lint與真imports TypeScript須各保留實際結果，新候選仍須自己的完整CI；未變動47unit／大型compiler不重跑。

本輪Source仍完整39 paths／27 scopes、五組／UC01–16／兩keys及所有外部E04／USER／真車供給／same-runtime shared界線不變。7bd清理正向、七案正向及唯一consumer失敗各自保留；新reference selector與完整終態／雙申訴仍待新immutable hosted結果。

## 第八輪 2e3e 全部 CI 正向與 lostACK 地圖文案退修

候選 `2e3e0035cb54c9ec486903e2512c6a504c075fd2` 五 runs 全部自然success：main `39221019883` 為17 success／3原scope skip，integration `39221019783` 為22 success／4 skip；quote `39221019796`、60秒 `39221019757`、decline `39221019939` 各真1 pass（15.4分鐘／1.7分鐘／29.6秒），三者實際checkout均完整2e3e。Integration四個skip精確為readonly-dev-metadata、readonly-api-startup-readback、shared-bureau-acceptance與orchestrator-tests，沒有把PR未觸發的shared dispatch列通過。core／additional原log各1 pass（9.7／7.1分鐘）。最終證據 `source-checks/hosted-2e3e00-watch/final-enriched-evidence.json` SHA256=`bf3aa4c53640376c4b6fd472df0296b15678a25c4f3daab8e8e0a36406ed37ce`；所有歷史失敗、skip與collector初次相等檢查exit1均保留。

main／integration各job自己的原git marker為synthetic checkout `c6ffa034851eb8a71b56af695c015fa371ee5d08`，parents是新accepted Fleet `ec454273715c84df0972b54d5fccf1cdd19e723f` 與2e3e；**整棵tree不同**。GitHub primary完整tree逐blob核原39個Journey檔與candidate相同，新增29個Fleet差異與accepted peer相同，沒有為正常accepted peer漂移重推／重跑。兩lane各自booking native四案、receipt四案、on_trip control兩案與C114完整六案suite／job全pass、0 skip；C114原logs各2591 pass／19 skip，無hook／unhandled錯誤。巢狀原JSON的早期pending文字保留，由各job原raw／actualJobBindings補足，不改標VM的19 skip或其他SHA的窄信用。

Bureau原artifact `12172104496` ZIP SHA256=`4c7dd3862b2eef6c2c5394ddf4fb665ece55e9b65328c2fbd900ab73431ec769`，真 **8 pass／0 fail／0 skip／0 timeout／0 retry**，25份JSON facts／36張原PNG。ordinary90為109218ms、on_trip及售後251485ms、reliability63875ms、五OTP為772／57108／61500／301603／60540ms，原期限未變。新terminal facts與原完程圖已核Passenger原ride完成／live marker0，Driver仍原/trip、原task及完整task／order pair、追蹤已結束與停止定位。UC15原order `99eccb0b-74f4-4f59-828c-6979a68d2ebc` 的fare案 `PAX-5007682f-05fe-4711-b471-74b8d8c94037` 與service案 `PAX-d4308767-2fd9-403f-899e-908ea0b368a3` 各4個completed action receipts／audit UUID及精確五筆timeline均完整，humanContactExecuted=false。這些是2e3e自身hosted disposable結果，仍不是same-runtime shared／正式E04／真車供給驗證。

Root／supervisor另親看本輪原 `32-UC10-lost-ACK-UI.png`（SHA256=`67484866716f3ffe7134f7033a132834af7ca72fa2bfbfd9e6980f61031abf1d`）發現新產品文案錯誤：上方已如實顯示尚未確認叫車結果，下方Booking unavailable使用的共用P5Map missing fallback卻固定稱「正在取得司機位置」。正常reopen並精確加配兩個既有paths後，只把共用fallback改為「目前沒有可顯示的地圖資料」，同步原既有P5Map fresh-without-position測試的expected literal；不新增測試、state、prop或framework，不改導航、位置marker、binding、重送／同key／原UUID、費用或任何期限。原三個既有case及所有marker／route／registration斷言保留，正常hook必要同檔機械排版如實記錄。

本次完整Source為41 paths／29 scopes，原五組／UC01–16／兩keys不變；必要scoped lint與既有三案須保留實際結果，不重跑未變47案／native fixture或大型compiler。2e3e全五CI與八案正向原物不改寫，新中性文案仍須新immutable候選自己的CI與原lostACK畫面驗證。正常一次納入最新accepted dev後freeze；正式approve／merge／shared部署與外部條件仍由Root沿原流程處理。

## 原兩個 acceptance keys

- `pax-bureau-coverage_each-finding-real-evidence-and-applicability`
- `pax-bureau-coverage_same-release-hosted-journeys`

兩者都未由本文件或 checkpoint 授予。先完成自身 Source 檢查、完整候選、同 SHA 獨立 review／必要 CI／正常 merge，再由 Root 在統一同版本 shared deployment 實際走各適用案例、保留原 UUID／UI／原圖及 pass／fail／未執行。原 .6 十一單163步、舊十五分鐘與60秒及已完成的 parent／Terminal 信用保留，不能充當本候選或原缺漏分支的新結果。

Root／supervisor 的 `parallel-readonly-audit-20261019/bureau-16case-live-audit.md` 是本次只讀參照：61fa 入口可達與頁面內48d94/.4歷史案例各自保留。另有61fa core／additional 當輪首次 consent 正向（含85元）是該輪自身證據，不能替代本批負向 OTP 或新旅程。Terminal 已交付的 completed／cancelled／declined tracking 與獨立電話提示窄 Source 及其自身驗證不重新列為全未修；既有 Voice callback durability／operation receipt 亦與同 PAX 案件 callback、完整 Voice／真人聯絡剩餘條件分開。本 task 不改未核配 guide，亦不重開已完成的窄任務。

## Current16 Guide followup WIP — exact technical limits retained

Root normally reopened the SAME Guide task and coordinated only the original
Journey UAT as its sixth Source scope. The original two Source-only keys and
historical acceptances remain; the accepted functional Journey is not reopened.
The current16 public copy uses reader language, with all83 operating steps and
per-case expected/evidence/missing fields separate from the frozen historical16
cases/75 steps/163 stages in `content.ts`.

These are the precise internal limits behind the public wording; none is removed
or treated as a new runtime gate:

- Formal E04 issuer, historical operator, settled-payment binding, total/toll
  authority and the existing `PAX-RECEIPT-E04-CAPTURE-20261015` conditions remain
  unresolved where originally unresolved. Existing USER unanswered conditions
  stay unanswered; this Guide does not answer them or add USER questions.
- Unknown COMMIT evidence remains scoped to the original booking/receipt paths,
  not every audit/outbox/notification delivery. Original3s lock timeout under
  prolonged contention may require retry with the same idempotency key and
  original command identity; no rebase to a new intent is implied by public
  “retry the original request” wording.
- PSP is simulated. Real authorization, settlement, refunds, multiple workers
  and duplicate callbacks still require their original applicable verification;
  no real-money success is inferred from synthetic attempts.
- UC16's seven-product/capability Source mapping is specification evidence only:
  seed/catalog/license/active flags and ordinary synthetic vehicles do not prove
  qualified equipment, actual wheelchair supply or successful human referral.
  Welfare identity/region/fare authority and the full applicable journey remain.
- UC15's61fa lost-item five historical action receipts are distinct from the new
  fare/service cases: each has four subsequent action receipts and exactly five
  timeline entries including creation. Human contact/recording/physical return
  is not established by internal closure.

The preceding technical limits remain current. The initial pre-readback draft
did not claim runtime success; actualR evidence and all16 case qualifications
are now recorded below. HostedN remains a separate evidence source. Guide Source
validation, its own candidate/CI and review are not supplied by that runtime run.

## 4cf8 同版共享原物採認與完整16案回填（Guide followup）

本段沿同一 Guide task 的六個正常 scopes 更新資料，不改 accepted Journey 功能或其角色／兩keys。
原歷史16案／75步／163階段及61fa兩測試／8張新訂單／48+60=108階段完整保留。
目前公開程序為16案／83步，每案的情境、前提、步驟、預期、已驗及缺漏都保留；A/B/C等為演練情境代碼，跨版本同字母不是同一訂單，各取消情境亦各用獨立訂單。八個測試不能改寫成八張新訂單，亦不代表全部16案完整通過。

| 證據來源                                                                                | 真實結果與界線                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| own hosted definition N=`2fd89764be352843bfa545158a7083add5197029`                      | 五個自身CI SUCCESS；integration39225527925原bureau8PASS／0skip／0retry、25facts／36PNG，artifact12176230958。actual checkout93bd948e…與N的tree相同，各job自己的raw marker獨立綁定。這是隔離CI，不換成共享結果。                                                                                                                      |
| authorized deployment39229683109 / runtime R=`4cf8eadadb4e74e736c1c5f88286645e0fa84aa0` | 18個job成功、1個operational job失敗；11images均從R建置，migration成功，10services原日誌各100%traffic且health通過。Fleet setup四案401 JWT_INVALID，使原operational16案為12PASS／4FAIL，原Passenger core／additional／quote／60秒／decline五流程未執行；空artifact upload是後續失敗，不能掩蓋原Fleet contract或稱整deploy成功。        |
| independent shared dispatch39233244101 / job117996060055                                | frozen definition N、runtime R，原shared artifact12179385626 ZIP SHA256=`8f2941d1f25a0953a9c1237aeaa75a4f427da80f2398d7e8b9db410458a91074`，CRC正常；8PASS／0fail／0skip／0retry、26JSONfacts／33原PNG。不是同run隔離ui-bureau的結果。                                                                                               |
| runtime binding                                                                         | before／after API `drts-dev-api-00123-8p7`、Ops `drts-dev-ops-console-web-00117-ssf`、Passenger `drts-dev-passenger-app-web-00055-r9c`完全相同且全R；servedPassenger／Ops／privateDriver皆200及R。PublicPassenger沒有GCPcredential，privateOps／Driver沿Ops audience既有身分。                                                       |
| actual waits and invariants                                                             | matching原90000ms政策，103723ms實際觀察background timeout；OTP過期測試總時長302645ms；原程式真wait301000ms，保留原60秒cooldown；三角色offline67015ms。on_trip disabled＋同乘客session409 ORDER_NOT_CANCELABLE，原order/task/assignment/payment/charge不變，再正常Driver完程。                                                        |
| actual aftercare                                                                        | 原order `ee97f5b5-83d2-4964-b70d-66d4bc6fcd93`／task `aee75c2c-d498-4ad5-8bbf-60c132950556`；fare `PAX-e15afa02-da97-458d-b361-661839c8c559`與service `PAX-ef1d9ab8-f0fa-48d8-8ec1-f2b35edaf2ae`各四completed receipts／audit UUID及精確五timeline，humanContactExecuted=false。原主ride／Driver終態及lostACK中性copy已實際看原PNG。 |
| explicit unexecuted                                                                     | UC08共享沒有正常發布不完整disclosure資料的操作；UC09共享沒有外部Google fetch替換控制。兩份executed:false原facts保留；不可借隔離fixture/fault正向當共享驗證。                                                                                                                                                                         |
| whole manual workflow                                                                   | 停止冗餘本地watch的最後原snapshot10:14:42 UTC為20success／2skip／2inprogress（隔離ui-bureau與core/additional）；只採已完成shared job，未把當時尚未完成的全workflow標綠。Root後續終態若有補證另記，不重派或取消GitHub run。                                                                                                           |

原始機器證據在 `.local/passenger-bureau-gap-correction-20261018/journey-normal-fallback-20261019/source-checks/hosted-shared-bureau-39233244101/`。
`shared-runtime-actual-readback.json` SHA256=`fc65378a4e7a766401a9dd49d7653c5c0895d36169ca572a3347b6bff4722d05`；Root獨立親讀原ZIP、全部26facts／33PNG及7張關鍵原圖的report SHA256=`2997b86e4b7cd90f1b62629e00674205d506d775d40fa78ad928ded277bea81d`。
原文件中的各輪失敗／hook／consumer退修、provider限額、外部USER未答、formal E04、真車供給等歷史不改寫。

| 案例                            | 本版已驗／各自來源                                                                                                                                                                                                                                         | 仍缺或本輪未執行                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UC01 首次使用與正常預約搭乘     | 4cf8共享實跑確認首次勾選門檻、拒絕後登出且讀帳戶回401、五次錯碼鎖定、原60秒重送、真實等301秒後的過期拒絕與重取恢復，以及同帳戶有效同意回訪；同版原單正常完程、付款與五星也已核對。2fd897隔離驗證另存。                                                     | 自然登入期限到期及舊條款／隱私版本過期後重新同意仍缺。圖片只證明實際拍到的狀態，其他狀態依操作紀錄核對；真實簡訊送達及正式條款採認另驗。                                           |
| UC02 回訪登入付款方式與歷史恢復 | 4cf8共享實跑確認兩張本人付款方式、唯一預設切換、放棄刪除不送請求、使用中的卡片刪除被拒及取消後刪除；另一瀏覽器登入後恢復同帳戶與同一原單，改用其他帳戶不能取用原請求。                                                                                     | 另一瀏覽器不等於兩支實體手機；真實簡訊、真實支付服務及自然登入到期後恢復仍缺。綁卡前的選址圖不能當作兩張卡與預設切換的原圖。                                                       |
| UC03 費用告知與未勾選確認       | 4cf8共享實跑確認草稿重載、重新報價後清除舊費用確認、未勾不能叫車、重新選本人付款方式，以及新確認後以同一原請求恢復唯一訂單。                                                                                                                               | 正式營運費用與條款文案採認仍待，不以演練文字代替。                                                                                                                                 |
| UC04 預約時間錯誤與報價過期     | 4cf8共享實跑確認合法午夜草稿保存／重載與重新報價。2fd897的獨立隔離驗證另真等15分鐘報價到期後恢復；這不是本次共享八測試的內容。                                                                                                                             | 本版共享的完整15分鐘報價到期流程尚未執行；完整跨裝置／跨時區及正式提前時間規則組合仍未全部覆蓋。                                                                                   |
| UC05 各階段取消與取消確認       | 4cf8共享原單行程中取消鍵確實停用，同乘客身分直接取消回409 ORDER_NOT_CANCELABLE，原訂單／任務／指派／付款不變；之後同單正常完程。其他本次原單在允許的上車前階段正常取消，沒有強制改狀態或行程扣款。61fa接受前／後與抵達後放棄及確認取消仍保留為舊共享證據。 | 本次未重跑全部接受前／後、抵達後取消確認組合。允許取消時不收取消費；退款僅適用已實際扣款。待補憑證仍缺可達拍照及上傳入口，不可塞假憑證或改任務狀態。                               |
| UC06 無車拒接接單逾時與拒派恢復 | 4cf8共享沿既有一般即時訂單流程真等90秒媒合政策與背景排程，實際103723毫秒讀到逾時，再沿同一原單恢復、接單及正常取消。2fd897另有60秒接單逾時與拒派恢復的獨立隔離通過紀錄；乘客預約入口沒有新增即時服務選項。                                                 | 本次共享未執行60秒接單逾時及拒派409恢復。有候選但未指派不等於無供給；合成供給控制不證明真實市場或真人接送。                                                                        |
| UC07 改派後重新核對司機與車牌   | 4cf8共享原單舊司機任務取消、新司機接受／前往／抵達／開始，離線重連後同單正常完程；乘客、新舊司機與調度關係讀回及主頁完成／追蹤結束原圖均已保存。                                                                                                           | 真人實車、實體證照及現場上車核對仍缺，合成車牌不能代替。                                                                                                                           |
| UC08 司機資料不足與聯絡不可用   | 2fd897隔離驗證確認必要車色缺漏時拒絕指派、原單沒有指派司機。本次4cf8共享沒有正常發布不完整揭露資料的操作，已明記該分支未執行。61fa聯絡不可用提示、客服及重試仍屬舊共享證據，未表示真人通話成功。                                                           | 本版共享缺資料情境未執行；其餘必要欄位、司機資料缺漏與聯絡故障組合仍缺。登入及聯絡手機獨立，未要求SMS聯絡驗證不得冒作阻擋預約。真人通話及真資格資料仍待。                          |
| UC09 定位拒絕超區地址與圖資故障 | 4cf8共享沿固定演練地點走真報價、草稿及建單；本次沒有替換Google外部來源，受控故障分支明記未執行。2fd897隔離另通過圖資斷線／逾時／零候選、消歧與恢復；61fa真Google反查／搜尋／路線及超區恢復仍是舊共享證據。                                                 | 本版共享受控外部供應商故障及一般Google選址全流程未在本次八測試重跑；不能把隔離受控故障當共享Google實際故障。實體GNSS、原生底圖、道路導航未驗，恢復圖不能代替每張故障圖。           |
| UC10 位置延遲離線與重連         | 4cf8共享三端真離線67015毫秒後恢復原單／任務／指派／金流。真建單已完成但瀏覽器遺失回應後，重載及另一瀏覽器仍沿原請求取得同一訂單；改內容回409、其他帳戶不能取用。原圖顯示「目前沒有可顯示的地圖資料」與同請求重試，沒有聲稱已取得司機位置。                 | 數小時長離線、手機系統關閉應用程式或終止背景運作仍缺。處理結果不明時應沿原請求重試；其他稽核紀錄及通知是否送達須另驗。                                                             |
| UC11 扣款失敗欠款拒約與補繳     | 4cf8共享本次正常完程單的演練付款為85元，沒有另執行B付款失敗與補繳。61fa B沿同一付款紀錄由第1次失敗至第2次成功、欠款拒約及補繳保留；2fd897原核心與加驗的隔離通過紀錄亦另列。                                                                                | 本版共享B付款失敗／補繳的原頁面與同一付款讀回尚未執行。真卡授權、清算、退款、重複付款通知及多個處理程序同時執行仍須另驗，不把模擬支付當正式通過。                                  |
| UC12 乘車文件下載與未就緒恢復   | 4cf8共享未完程原單顯示文件準備中，斷線失敗後有重試，恢復仍為未就緒；正常完程後同一原單文件恢復，付款與不可變快照讀回一致。                                                                                                                                 | 正式E04開立業者、行程當時所屬業者、已結清付款連結、總額及通行費規格仍待確認。圖上PDF／HTML按鈕不等於已查驗下載檔內容，合成文件不能當正式開立。                                     |
| UC13 高分評價與送出後不可修改   | 4cf8共享原完程單五星後以1星及4星重送均回409；重整隱藏評價入口，原五星及不要求聯絡保持。61fa E兩星及拒絕改分仍是舊共享證據。                                                                                                                                | 其他合法星等、標籤、留言及快速重送組合未因本次五星分支全部通過。                                                                                                                   |
| UC14 低分評價與客服聯絡意願     | 61fa B一星同意聯絡建立同單案、E兩星拒絕聯絡無案保留；2fd897原核心與加驗的隔離流程亦通過。4cf8本次五星不要求聯絡及另行車資／服務申訴，不能替代B／E低分分支。                                                                                                | 本版共享B／E低分頁面與案件讀回尚未執行；真人客服接案、實際聯繫及通知送達未證明，建案不代表已聯繫本人。                                                                             |
| UC15 遺失物車資與服務申訴       | 4cf8共享同一完程單建立車資與服務兩案，各經備註、指派、解決及關閉，保留建立加四動作的精確五筆歷程，以及各四筆後續完成回執與稽核編號。61fa遺失物五次原回執仍屬舊共享證據，不與本輪四次混計。                                                                 | 本次沒有重跑遺失物分支；真人聯繫、電話與錄音、實際爭議處理、失物認領及物品返還均未執行，系統結案不代表物品已歸還。                                                                 |
| UC16 福利優惠與輪椅無障礙服務   | 既有七種服務產品、資格／權益與輪椅能力需求的規格對應已有程式核對；2fd897隔離及4cf8共享八測試均沒有真正福利資格或無障礙車司完整正向旅程。一般預約、無福利參考值與合成車司不構成本案通過。                                                                   | 福利方案／身分／區域／費用、真正合格供給、完整選址至完程，以及無專車／資格不符／取消／照護者協助均待。原轉人工提示只證明系統拒絕處理，不能聲稱轉介成功、可用專車或永久排除原需求。 |

保留所有原五組與完整UC01–16條件。E04正式開立業者／歷史營運業者／已結清付款／總額通行費規格及原USER未答條件仍待；本Guide不自行回答或新增USER問題。
unknown COMMIT只採原booking/receipt範圍，非全部audit／outbox／通知送達；3s鎖競爭仍需同key/body正常重試。
合成PSP不證真卡授權、清算、退款、多worker或duplicate callback。實際browser context斷線不等於physical OS kill或數小時離線。
七既有product／eligibility／benefit／wheelchair能力mapping不證福利身分／區域／費用或真正設備供給，轉人工409也不是人工轉介完成。
61fa遺失物五次歷史回執與本R fare/service各四個後續回執、五timeline分開；結案不證真人聯繫、錄音、認領或物品交還。

本次 Guide Source 的必要DOM／lint／typecheck結果見下節；正常候選、自身CI、Root獨立review／protected merge仍待完成，以上runtime結果不替代Guide自身Source驗證。

## 本次 Guide Source 必要驗證（正常提交前）

- 既有同一 `bureau-review-page.test.tsx` 實跑12／12 PASS、0failed／0skip，原九項及新增current16三項均保留；每案情境／前提／83個有序步驟／預期／已驗／缺漏與歷史16詳情均核對。
- 四個受影響TS／TSX檔的scoped ESLint exit0；i18n guard exit0（686 files、原81 exemptions，沒有新增例外）。
- Passenger單次 `pnpm exec tsc --noEmit --incremental false -p apps/passenger-app-web/tsconfig.json` exit0／28.21秒，沒有typegen／wholebuild或增量產物；未重跑Journey47／native或其他大compiler。
- 原資料 `content.ts` 與acceptedR逐byte相同，SHA256=`5ff1320b7350042fb340cfbe215781e00de1b5f147aefc5ed5105dbf1bf108ba`。只對正常六scope做程式與文件更新；未改Journey功能或原候選。
- 原log／JSON在同Guide evidence目錄：`guide-current16-page`、`guide-current16-eslint`、`guide-current16-i18n`、`guide-current16-passenger-tsc`，各保存當時六Sourcehash與真exit。Root隨後指正兩處純字串：將302645ms明確標為整個OTP測試時長，並分開歷史遺失物五次回執與本輪fare/service各四次。83步數及五timeline不變；該字串修正後再跑DOM與lint，原TSC僅保留其當時hash信用，不宣稱重跑或讀過未來文字。文件後續只補真結果及必要排版。

聯絡手機提示的原窄Source信用與本R八測試分開：`booking-screen.tsx` 的phoneReady保留requireSmsVerification判斷，登入手機與聯絡手機驗證獨立；已登入不代表聯絡手機自動驗證。本次八測試沒有另驗提示的兩種狀態，不廣稱全覆蓋或新增產品／gate。

本次仍需正常checkpoint／plainpush／完整literal candidate handoff、自身必需CI、Root獨立review及protected merge；Source驗證不錄runtime key，也不自行部署。

最後純文案修正後，同一12DOM再實跑12PASS／0skip／0fail，scoped lint與i18n均exit0，記錄為`guide-current16-page-copy-final`、`guide-current16-eslint-copy-final`與`guide-current16-i18n-copy-final`。原28.21秒TSC不重跑；其後只有UC15一句回執數量說明字串變更，三個其他程式檔byte相同，未宣稱TSC讀過未來字串。

## 2026-10-19 完整送審圖續作：接車時刻、行程路線與首頁費用入口

此為原 `PAX-BUREAU-JOURNEY-COVERAGE-20261018` 的正常續作，原五組、兩個驗收及 UC01–16 完整條件均保留。基底為 accepted `ae8d42cba48500e3a93a3b790781641d06665645`；不改寫上列 2fd／4cf8 等各輪 Source、隔離 CI 或共享執行信用，也不將本輪單元測試充作新版本共享操作。

完整圖的聯絡開關其實為「預設開」。Root 最初讀成「關」的錯誤前提已在正常後續修改中更正，沒有 reset、amend 或重寫 checkpoint `5218e22385d23331c0a9564c0e9d9d302b7a217c`。該 checkpoint 的 9 案 before／fixed、56 案及其後 109 案回歸原物保留為當時歷史，不能以其中預設關閉的正向當成本次正確規格信用。現行低分開關維持初始 true，使用可鍵盤操作、有名稱的原生 switch；帳戶及 token 提交皆只有明確關閉才傳 false，三至五星仍傳 false。使用者另已確認「兩星以下都建案，開關只決定聯絡」，由原客訴作者處理後端政策；本續作不自行聲稱已改建案政策，歷史「拒絕聯絡無案」紀錄也不代表新規格。

接車頁同時顯示原「預計 N 分鐘抵達」、原更新時間及「約 HH:MM 抵達」。時刻由已接受的 `pickupEta.calculatedAt + minutes` 推算，固定 Asia/Taipei 的 24 小時表示法，跨午夜仍正確；不以瀏覽器現在時間或事件接收時間改寫估計基準。現行 tracking 為 missing／stale／low_accuracy、無有效估計或已到站／終態時，不復活舊接車 ETA。舊 producer 省略 tracking 的相容分支只接受原 assignment 明確標示 fresh 的估計；原 pickup ETA 正向 fixture 因此前提由 missing 校正為 fresh，Web／Native 原斷言全保留，另以真 tracking 負向驗證拒絕舊估計。

行程中的 `dropoffRoute` 是獨立、可為空的 live contract，不改不可變報價總距離。既有 `GeoService.route` 使用當前已指派司機／車輛／on-trip 任務的準確新鮮 GPS，路線終點為訂單的 canonical dropoff；回傳 provider、生成時間、GPS 觀測、指派版本、道路剩餘公尺及秒數。只有綁定一致且有效才顯示「約 HH:MM 抵達目的地」與「剩餘 X.X 公里」。沒有拿原報價總里程、已行駛里程或自行直線計算代替剩餘道路距離，也沒有新增供應商、憑證、端點或資料表。

同一指派／任務／GPS／終點的既有三秒串流讀取共用請求，快取期限 30 秒、最多 128 筆；尚未完成的 provider 工作最多八筆，單次等候上限 2500 毫秒，provider 自身既有逾時保留。回應後重新讀實際訂單、指派、任務與定位；換派、換目的地、更新 GPS 或完程後的舊回應不能成為新估計。失敗、逾時、不準確、舊觀測及無定位都回空，不造備援數字。既有 SSE 的版本比較包含路線數值／生成／觀測，路線改變送出 eta_changed；真 mounted Passenger 頁面隨兩個觀測更新，拒絕同連線舊版本，斷線時不顯示舊 ETA；既有地圖的一秒本機觀測時鐘由地圖與 ETA 共用，沒有新 GPS 時也會在原 60 秒新鮮度界線移除估計，重連不復活過期資料。行程頁無可用估計時明示目前無法預估抵達時間與剩餘距離；沒有新 client poller、sleep 或 reload。

首頁在載入、未登入、可預約、付款讀取失敗及首次費率確認狀態皆提供普通 `/fares` 費用與優惠入口。連結不寫費率 ACK、不送訂單、不繞過首次「我已閱讀並同意」或送出前費用確認。完整 E19a 正文與運送契約的逐字修正由 Root 的獨立精確文案層處理，本層保留原版本化確認與實際 booking/session 行為。

### 原五組與完整案例的本輪界線

| 原工作組                       | 完整案例   | 本輪新增 Source／本地查驗的範圍與仍待事項                                                                                                                                                 |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次登入、OTP、同意與回訪      | UC01–04    | 原真 301000ms／60 秒／15 分鐘等待及全部原案例不變；首頁費用入口與費率 ACK 門檻另以真元件驗證。本版本尚未取得新共享案例信用。                                                              |
| 取消與各階段派遣               | UC05–07    | 原取消 disabled／409、原單／任務／指派／付款不變及正常完程斷言不減。新路線估計綁當前指派、任務、GPS與目的地；換派／完程遲到回應負向另驗。                                                 |
| 產品適用與 60／90 秒           | UC06、UC16 | 不新增 instant 產品、不改任何業務期限；七產品、資格、福利與輪椅原對應及真供給缺項保留。                                                                                                   |
| 揭露、圖資、定位、斷線與原請求 | UC07–10    | 新道路剩餘距離與時刻只採 provider live route；舊圖資故障、失去 ACK、跨瀏覽器／帳戶、67 秒斷線案例與全部原斷言保留。真 provider、實體 GNSS／裝置及道路導航仍待同版本實跑。                 |
| 付款、文件、評價、申訴與福利   | UC11–16    | 只驗本次評價 switch／payload 與其他星等抑制；低分全部建案屬並行原作者政策修復。正式 E04／業者與付款來源、真 PSP、通知送達、真聯繫／失物交還及福利無障礙實車條件仍缺；不借舊結果代新版本。 |

本輪證據存於 `.local/passenger-bureau-gap-correction-20261018/screenshot-submission-corrections-20261019/journey-codex2-source-20261019/`，每次保留實際 Source hash、command、exit 與 raw log。原第一次路線測試的產品 fixture 前提錯誤、TTL 測試準備時序錯誤、首次 true-imports 的三個自家 fixture 型別錯誤及未變舊 Ride 測試的 strict 錯誤均保留，沒有改 deadline 或壓低斷言湊綠。舊 Ride 檔已回到 accepted base 的相同 bytes，保留真 runtime 回歸；必要 true-imports 檢查只針對本輪實際變更檔及其真實匯入依賴，未放寬 strict flags。

React checklist 已套用於兩個修改的 TSX 元件：hooks 無條件呼叫、狀態由既有控制項管理；原生 switch 有可讀名稱與 checked 狀態；費用入口為真 anchor；不新增 client 請求或額外計時器／重複 state 或樣式框架。新路線請求去重在既有 server producer，元件只顯示 authority 估計。

本輪最終本地驗證依各次真執行分列，沒有偽造一輪全綠：

- `final-clock-units.json` 原111案為110PASS／1FAIL／0skip；唯一失敗是新 pickup 測試把觀測放在假時鐘未前進的未來十秒，現行五秒未來觀測守衛正確拒絕。只把該單元的現在時間前進到觀測時間，沒有改期限或正式邏輯；`final-clock-fixed-units.json` 對應三個受影響 UI 檔實跑37PASS／0FAIL／0skip，涵蓋修後新 pickup 事件、default-on account/token true→明確 opt-out false、五星 false、午夜、路線變化、舊事件、斷線、60秒老化與終態。
- 同一111案中的45個其他案例（pickup14、home6、live-authority13、live-presentation9、tracking-map3）當次均真PASS，之後其產品／測試 bytes未變；沒有為了改報告數字再重跑。producer 的29案另以故意不同的舊指派目的地及真正會被逐出的第一個 GPS key 加強 fixture，`final-route-fixture-controls.json` 實跑29PASS／0FAIL／0skip。這是跨真執行的111個相異案例範圍，不稱單輪111全綠。
- `affected-native-api.json` 原生 API 的 OwnedMobility／MultiTaxi／Passenger authority 三檔159PASS／0FAIL／0skip，無 PG／HTTP／server。其後只有 UI 與測試 fixture 修改，沒有重跑或擴借信用。
- `final-true-imports` noEmit／incrementalfalse exit0（26.79秒）；`final-passenger-noemit` 同參數完整 Passenger app exit0（15.96秒）。後續只加強 route unit 的 fixture 數值與同型別欄位，未改產品；不宣稱 compiler 讀過未來測試 bytes。scoped ESLint 及後續受影響 UI／tests ESLint 均exit0，正常 hooks仍必須執行。

以上是 Source 與 socket-free 檢查，尚不是新 immutable 候選的自身 hosted CI 或 shared runtime。仍須正常 commit／plain push／新 PR、完整 handoff、自身必要 CI、Root獨立 review／protected merge，以及 Root 統一版本的實際操作。原正式來源、真車、真支付、福利無障礙與所有逐案缺項保留，不因本輪時刻／距離／入口／switch 改善而標為全16通過。
