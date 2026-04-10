# 01. 決策表集（Decision Tables）

## 1.1 使用方式

本文件把敘述型規則轉成 **可判斷的 decision table**。  
LLM 不應自行用自然語意猜規則，而應先查本表。

---

## 1.2 訂單來源分類表

| 條件                  | order_source        | source_partner_type  | order_domain | service_bucket      | dispatch_semantics    | controlling workflow               |
| --------------------- | ------------------- | -------------------- | ------------ | ------------------- | --------------------- | ---------------------------------- |
| 乘客自有 App 立即叫車 | `app`               | self                 | `owned`      | `standard_taxi`     | `realtime`            | Passenger → Order → Dispatch       |
| 乘客自有 Web 立即叫車 | `web`               | self                 | `owned`      | `standard_taxi`     | `realtime`            | Passenger → Order → Dispatch       |
| 電話叫車              | `phone`             | self                 | `owned`      | `standard_taxi`     | `realtime`            | CTI → Call Center → Dispatch       |
| 櫃台 / 定點代叫即時單 | `concierge`         | site                 | `owned`      | `standard_taxi`     | `realtime` or `queue` | Concierge → Order → Dispatch/Queue |
| 企業 Portal 預約派車  | `portal`            | tenant_enterprise    | `owned`      | `business_dispatch` | `reservation`         | Tenant Portal → Reservation        |
| 企業 API 派車         | `api`               | tenant_enterprise    | `owned`      | `business_dispatch` | `reservation`         | Tenant API → Reservation           |
| 信用卡 / 禮賓機場接送 | `api` or `portal`   | card_benefit_partner | `owned`      | `business_dispatch` | `reservation`         | Partner API/Portal → Reservation   |
| 第三方平台司機轉送單  | `external_platform` | forwarder_partner    | `forwarded`  | N/A                 | `forwarder_broadcast` | External Adapter → Forwarder Hub   |

### 補充規則

1. `external_platform` 一律先判成 `forwarded`，不得進 `owned`。
2. `service_bucket` 只對 `owned` 訂單有正式值；`forwarded` 保留來源商品映射資訊，但不等於自有產品桶。
3. `queue` 只可發生在定點 / call point 已配置 queue policy 的站點。

---

## 1.3 standard_taxi vs business_dispatch 判斷表

| 判斷條件                    | standard_taxi | business_dispatch |
| --------------------------- | ------------- | ----------------- |
| 是否以即時叫車為主          | 是            | 否                |
| 是否允許無預約就派          | 是            | 原則否            |
| 是否需要 reservation window | 否            | 是                |
| 是否可能需要鎖車 / 鎖司機   | 否            | 是                |
| 是否可能需要簽收 / 憑證     | 低            | 高                |
| 是否可由企業 / 卡權方案驅動 | 否            | 是                |
| 是否預設用 `realtime`       | 是            | 否                |
| 是否預設用 `reservation`    | 否            | 是                |

### Hard Rule

- 只要來源商品屬於「信用卡機場接送」或「大型公司派車」，就不得落到 `standard_taxi`。

---

## 1.4 business_dispatch 子產品判斷表

| 條件                               | subtype                        | 必填欄位                                    | proof_required | default priority |
| ---------------------------------- | ------------------------------ | ------------------------------------------- | -------------- | ---------------- |
| 合作方案含機場 / 航班 / 接送機權益 | `credit_card_airport_transfer` | 航班號、航廈、接機/送機、乘客姓名、聯絡方式 | 高             | high             |
| 合作方為企業 / 部門 / 秘書 / 行政  | `enterprise_dispatch`          | 公司、下單人、乘客、窗口、成本中心          | 中高           | normal-high      |

---

## 1.5 同營業區域派遣資格表

| pickup operating_area 與 vehicle operating_area | 可派結果 | 說明                              |
| ----------------------------------------------- | -------- | --------------------------------- |
| 完全相同                                        | 可派     | 正常                              |
| 由人工白名單允許跨區                            | 可派     | 需有 explicit allow rule          |
| 無白名單且不同區                                | 不可派   | 回 `not_serviceable` 或改人工處理 |
| operating_area 無法判斷                         | 不可派   | 不可假設可派                      |

### 補充規則

- Call Center 也不能手動略過營業區域限制。
- ETA engine 在不可派時，不得回假 ETA。

---

## 1.6 車輛可派資格決策表

| 條件                                          | 結果                         |
| --------------------------------------------- | ---------------------------- |
| `vehicle.current_status != active`            | 不可派                       |
| `vehicle.dispatchable_flag != true`           | 不可派                       |
| 保單過期                                      | 不可派                       |
| 排他審核未核准                                | 不可派                       |
| branding / placard 未就緒但法規要求上線前完成 | 不可派                       |
| 車輛維保狀態 = maintenance                    | 不可派                       |
| 車輛在線 / 心跳狀態失效                       | 依產品決定；owned 原則不可派 |

---

## 1.7 司機可派資格決策表

| 條件                                                       | 結果   |
| ---------------------------------------------------------- | ------ |
| 駕照過期                                                   | 不可派 |
| 執業登記證過期                                             | 不可派 |
| training_status = failed / missing 且任務要求訓練          | 不可派 |
| driver_work_state = suspended / incident_hold              | 不可派 |
| driver_work_state = paused                                 | 不可派 |
| driver_work_state = on_trip / enroute / reserved(衝突時窗) | 不可派 |
| 其他條件皆正常且產品相符                                   | 可派   |

---

## 1.8 產品資格矩陣

| 條件                         | standard_taxi | credit_card_airport_transfer | enterprise_dispatch |
| ---------------------------- | ------------- | ---------------------------- | ------------------- |
| `license_class = taxi`       | 可            | 視合作要求                   | 視合作要求          |
| `license_class = rental`     | 否            | 可                           | 可                  |
| `license_class = multi_taxi` | 可            | 視合作要求                   | 可                  |
| `vehicle_form = sedan`       | 可            | 可                           | 可                  |
| `vehicle_form = mpv`         | 可            | 可                           | 可                  |
| `service_tag = airport`      | 非必須        | 必須                         | 視規則              |
| `service_tag = vip`          | 非必須        | 視規則                       | 常見必須            |
| `service_tag = english`      | 非必須        | 視合作要求                   | 視合作要求          |
| `tenant_whitelist` 命中      | 非必須        | 常見必須                     | 常見必須            |

### 說明

- `business_dispatch` 不等於一定要 rental car，但若合作方案明定需租賃車 / 多元計程車，則按方案白名單過濾。
- 不得用 fuel / EV 直接判斷是否可履約。

---

## 1.9 商務子產品欄位必填矩陣

### 1.9.1 credit_card_airport_transfer

| 欄位                    | 必填     | 說明              |
| ----------------------- | -------- | ----------------- |
| 乘客姓名                | 是       | 不得僅留訂購人    |
| 乘客聯絡方式            | 是       | 可用匿名號碼對外  |
| 航班號                  | 接機必填 | 送機可選          |
| 航廈                    | 是       | T1/T2/國內/國際   |
| 接機 / 送機             | 是       | enum              |
| 目的地 / 出發地         | 是       | 依接送方向        |
| 方案代碼 / 權益單號     | 是       | 對帳主鍵          |
| 行李需求                | 建議     | MPV 判斷依據      |
| 停車費 / 過路費存證要求 | 視方案   | 影響 proof bundle |

### 1.9.2 enterprise_dispatch

| 欄位            | 必填     | 說明               |
| --------------- | -------- | ------------------ |
| 公司 / tenant   | 是       |                    |
| 下單人          | 是       |                    |
| 實際乘客        | 是       | 可與下單人不同     |
| 現場窗口        | 視需要   |                    |
| 成本中心 / 部門 | 視合約   |                    |
| 用車時窗        | 是       | reservation window |
| 接送地點        | 是       |                    |
| 車型要求        | 視規則   |                    |
| 簽收要求        | 視規則   | 決定收尾 proof     |
| 指定司機 / 車輛 | 視白名單 | 需由規則允許       |

---

## 1.10 Proof Required 決策表

| 條件                                                                                        | required proof                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `service_bucket = standard_taxi` 且無特殊要求                                               | 無或最小收尾                             |
| `business_dispatch subtype = enterprise_dispatch` 且 `signoff_required=true`                | 簽名或電子簽收                           |
| `business_dispatch subtype = credit_card_airport_transfer` 且 `expense_proof_required=true` | 停車費 / 過路費憑證                      |
| 合約規定 `min_photo_count = 1`                                                              | 至少 1 張照片                            |
| 固定價企業單                                                                                | 不可改價；如有增減費需附原因與憑證       |
| 外部 forwarder 單                                                                           | 依外部平台規則，鏡像保存，不改寫原生語意 |

---

## 1.11 訂單修改 / 取消決策表

| 條件                                         | 可修改 | 可取消                   | 備註                                     |
| -------------------------------------------- | ------ | ------------------------ | ---------------------------------------- |
| owned + standard_taxi + 未指派               | 可     | 可                       | 即時生效                                 |
| owned + standard_taxi + 已指派未出發         | 受限   | 可                       | 需重算 ETA                               |
| owned + standard_taxi + 已到上車點           | 原則否 | 視 no-show / cancel 規則 |                                          |
| business_dispatch + 在 `modifiable_until` 前 | 可     | 視 `cancelable_until`    |                                          |
| business_dispatch + 超過修改截止             | 否     | 視取消規則               |                                          |
| forwarded                                    | 否     | 否                       | 只能送 external action，不改本地核心資料 |

---

## 1.12 派單模式決策表

| 條件                                          | dispatch mode         |
| --------------------------------------------- | --------------------- |
| `service_bucket=standard_taxi` 且非定點 queue | `realtime`            |
| `service_bucket=standard_taxi` 且站點設 queue | `queue`               |
| `service_bucket=business_dispatch`            | `reservation`         |
| `order_domain=forwarded`                      | `forwarder_broadcast` |

---

## 1.13 Owned 派不到車的 fallback 表

| 條件                                 | fallback action                           |
| ------------------------------------ | ----------------------------------------- |
| realtime 無候選車                    | 標記 `dispatch_failed`，回覆不可派 / 延遲 |
| reservation 預派失敗且仍在時窗前     | 進 redispatch queue                       |
| reservation 臨近出車仍失敗           | 升級人工派單                              |
| business_dispatch 要求特定車型但無車 | 回 tenant / partner 異常通知              |
| 合約允許 downgrade                   | 可改派較低階可接受車型                    |
| 合約不允許 downgrade                 | 不可自動降級                              |

---

## 1.14 Forwarder 行為決策表

| 狀況                       | 系統行為                                                        |
| -------------------------- | --------------------------------------------------------------- |
| inbound order 到達         | 建立 local forwarded order mirror                               |
| 本地司機按接受             | 送 external accept，不代表已成功                                |
| 外部回 confirmed           | local status → confirmed_by_platform                            |
| 外部回 lost race / expired | local status → lost_race / expired                              |
| 外部取消                   | local status → cancelled_by_platform                            |
| 外部未回應                 | local status → sync_error / pending according to adapter policy |
| 外部完成                   | 以外部 authoritative result 鏡像結案                            |

### Hard Rule

- local forwarded order 不得被 ops console 直接 assign。
- 外部平台的最終接單結果優先於本地暫存狀態。

---

## 1.15 申訴 SLA 決策表（平台預設）

> 下表為平台預設值；若租戶合約有更嚴格 SLA，從嚴適用。  
> 若法規或事故通報要求更快，法規優先。

| category            | acknowledge SLA | owner assignment SLA | target resolution SLA |
| ------------------- | --------------- | -------------------- | --------------------- |
| `safety_concern`    | 15 分鐘         | 1 小時               | 24 小時內提出處置方案 |
| `fare_dispute`      | 30 分鐘         | 4 小時               | 2 個工作日            |
| `late_arrival`      | 30 分鐘         | 4 小時               | 1 個工作日            |
| `no_arrival`        | 30 分鐘         | 4 小時               | 1 個工作日            |
| `driver_service`    | 30 分鐘         | 4 小時               | 2 個工作日            |
| `vehicle_condition` | 30 分鐘         | 4 小時               | 2 個工作日            |
| `route_issue`       | 30 分鐘         | 4 小時               | 2 個工作日            |
| `lost_and_found`    | 30 分鐘         | 4 小時               | 3 個工作日            |
| `other`             | 30 分鐘         | 4 小時               | 3 個工作日            |

---

## 1.16 Driver Fee / Reimbursement 決策表

### 1.16.1 對駕駛服務費

| 條件                       | 行為                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| Trip 已完成且屬 owned 履約 | 納入 driver fee statement                                            |
| Trip 取消且無完成履約      | 不計入已完成收入，但可依費率方案計入取消費                           |
| Forwarded order            | 是否計入以 partner contract 決定；預設僅鏡像收入，不做本地服務費計算 |
| Driver fee plan 已發布     | 按版本生效日套用                                                     |
| Driver fee plan 未發布     | 不得自行推算                                                         |

### 1.16.2 補差 / subsidy

| 條件                               | 是否補差                       |
| ---------------------------------- | ------------------------------ |
| 乘客優惠由平台承擔，且不得轉嫁司機 | 是                             |
| 企業合約指定平台補貼               | 是                             |
| 票面折扣已由外部平台結算吸收       | 否，除非 contract 明訂         |
| fixed fare 任務因平台策略給折扣    | 視補貼政策；若不得轉嫁司機則是 |
| 無明確補貼政策                     | 否，需人工核准                 |

---

## 1.17 報表納入規則

| 報表               | 納入資料                                                     |
| ------------------ | ------------------------------------------------------------ |
| 租戶月度行程       | owned 訂單 + 該 tenant 範圍                                  |
| 平台營運總表       | owned + forwarded 鏡像分欄統計                               |
| 司機收益表         | driver statement 已結算資料                                  |
| 六個月監理統計     | owned 派遣資料為主；forwarded 可列輔助欄但不得混成派遣主統計 |
| 派遣紀錄與錄音索引 | 所有 phone / callcenter 來源 order + call_session            |
| 申訴明細           | complaint_case 主資料，不從 incident 代替                    |

---

## 1.18 公開資訊版本發布決策表

| 條件                        | 行為                         |
| --------------------------- | ---------------------------- |
| 公開叫車電話 / 申訴電話變更 | 產生新 `public_info_version` |
| 收費標準變更                | 產生新版本，不覆寫舊版       |
| 車內 placard 文字調整       | 需同步新 placard version     |
| 舊車尚未更換新 placard      | 車輛不得標記為揭示完成       |
| version 未經核准            | 不得上線                     |

---

## 1.19 何時需要人工確認

| 狀況                               | 是否需人工 |
| ---------------------------------- | ---------- |
| 新增 `service_bucket`              | 必須       |
| 新增 `business_dispatch` 子產品    | 必須       |
| 新增外部平台 adapter               | 必須       |
| 改 complaint SLA 類別或時限        | 必須       |
| 更動對駕駛收費公式                 | 必須       |
| 變更營業區域可派規則               | 必須       |
| 讓 forwarded 單進入 owned dispatch | 必須       |
