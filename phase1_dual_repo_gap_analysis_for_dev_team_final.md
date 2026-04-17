# Phase 1 雙 Repo 盤點與開發落差分析（給開發團隊）

## 0. 文件目的

本文件用來讓開發團隊對照：

1. 目前兩個主要 repo 的實作現況
2. 與既定 Phase 1 開發藍圖之間的差異
3. 哪些地方方向正確、哪些地方已偏離
4. 接下來應如何收斂，讓 Phase 1 可完整落地

本文件採用的正式藍圖基準為：

- Tenant Portal 藍圖
- Platform Admin 藍圖
- Driver App 藍圖
- Host / OpCo / ROC Web 後台藍圖

---

## 1. 正式藍圖基準（本次盤點採用）

### 1.1 Tenant Portal 正式定位

Tenant Portal 應是 **租戶前端 Web Portal**，頁面應包含：

- 登入與租戶首頁
- 建立預約
- 預約清單
- 乘客名單與地址簿
- 報表下載
- API Keys & Webhooks
- Billing & Invoicing
- Notifications & SLA
- Tenant Admin & Roles
- Audit Trail

正式資料繫結應走 `/api/tenant/*`，因此它應是 **消費 core API 的前端**，不是自行長出第二套 tenant authority。fileciteturn80file5

### 1.2 Platform Admin 正式定位

Platform Admin 應是 **平台級高敏感 control plane**，頁面應包含：

- Tenants
- Users & Roles
- Fleet & Devices
- Switchboard & External APIs
- Split & Pricing Engine
- Payments & Acquiring
- ODD Policy Templates
- System Health & Quotas
- Audit & Compliance
- Notices & Maintenance Mode
- Feature Flags & Experiments

正式資料繫結應走 `/api/admin/*`。它必須是平台級權威後台，不應只是 UI shell。fileciteturn80file6

### 1.3 Driver App 正式定位

原始 Driver App 藍圖包含：

- Onboarding & Auth
- Jobs Inbox
- Job Detail & Go-to-Pickup
- Drive Console
- SOS & Incident
- Handover & Proof
- Takeover Quick-Report
- Shift & Attendance
- Earnings & Wallet
- Settings & Academyfileciteturn80file7

但依目前已確認的商業模式，**Phase 1 的正式定位已修正**：

Driver App 不應被做成自家中央派遣執行器，而必須做成：

### 多平台司機工作台

- 同一個 App 顯示不同叫車平台任務
- 司機可對各平台 individually 上線 / 下線
- forwarded 單只做 mirror / sync / earnings aggregation
- 不重寫第三方平台派單規則
- 不重算第三方平台既有 route intent
- 司機可看平台別收益與總收益

### 1.4 Ops / Host / OpCo / ROC 後台正式定位

此後台應是 **營運控制台**，而不是普通查表頁。正式頁面應包含：

- Dashboard
- Revenue Management
- Dispatch Scheduling（列表 + 地圖）
- FSD Takeover Logs
- ODD Capability Rules
- Maintenance Logs
- Incident Reporting
- Energy & Charging Scheduler
- Tesla Fleet Integrations
- Notifications
- Settings & Access
- Reports Centerfileciteturn80file8

---

## 2. 盤點對象

### Repo A

`ajoe734/drts-fleet-platform`

正式定位應為：

- core / source-of-truth repo
- API / BFF / contracts / adapters / forwarder / billing / reporting / admin / ops / driver app

### Repo B

`ajoe734/tenant-commute-hub`

正式定位應為：

- Tenant Portal frontend repo
- Lovable 驅動的 UI / page / component / interaction repo
- 所有 production data 由 core repo 的 `/api/tenant/*` 提供

---

## 3. 總結論（先講結論）

### 3.1 整體狀態

目前不是「兩個 repo 都沒做出來」，而是：

- `drts-fleet-platform` 已經有相當厚的核心 backend 與 domain skeleton
- `tenant-commute-hub` 已經有相當完整的 Tenant Portal UI 與 CRUD 骨架

### 3.2 最大問題不是做太少，而是邊界重疊

目前最大的架構問題是：

## 雙真值（dual truth）

也就是：

- `drts-fleet-platform` 想當 canonical backend
- `tenant-commute-hub` 又長出自己的 tenant auth / booking / invoice / api key / webhook / audit / report authority

這會造成：

- tenant data truth 分裂
- users / roles truth 分裂
- api key / webhook lifecycle 分裂
- billing / invoice truth 分裂
- audit truth 分裂

### 3.3 必須立刻修正的第二個大問題

Driver App 現在不能再往「自家中央派遣執行器」方向走，必須正式改成：

## 多平台司機工作台

否則 Tenant Portal、Driver App、forwarder、平台 presence、收益統計都會越做越偏。

---

## 4. Repo A：`drts-fleet-platform` 盤點結果

## 4.1 方向正確的部分

### A. 核心 backend 已經成形

此 repo 已不是 bootstrap。現況更像：

- modular backend 已成形
- source-of-truth 雛形已存在
- 主要 domain 已切分清楚
- 已進入 Phase 1 後段收斂期，而不是前期概念期

目前可視為已具備的主體能力包含：

- identity / tenant / auth 類模組
- owned mobility / booking / dispatch / driver task
- platform admin 類模組
- billing / settlement
- reporting / filing
- forwarder
- incident / maintenance / shift / driver settings

### B. 核心派遣與任務流已不是假資料

`owned-mobility` 主體已進入真正 Phase 1 domain：

- tenant booking
- owned order
- dispatch / redispatch
- queue / assignment
- driver task lifecycle
- cancel / proof / reservation / rules

### C. 工程底座完整

repo 已具備：

- monorepo
- package / app 切分
- CI
- migration 結構
- 多前端 / API / mobile 並行開發基礎

---

## 4.2 與藍圖的主要差異

### Gap A1：Platform Admin 前台完成度明顯不足

雖然 backend 已有 platform-admin 概念，但前台操作面仍明顯落後於藍圖。

和正式藍圖相比，應有但尚未完整落地的重點包括：

- Tenants
- Users & Roles
- Fleet & Devices
- Switchboard & External APIs
- Split & Pricing Engine
- Payments & Acquiring
- ODD Policy Templates
- System Health & Quotas
- Audit & Compliance
- Notices & Maintenance Mode
- Feature Flags & Experimentsfileciteturn80file6

### Gap A2：Ops Console 還不是正式 dispatch console

現況較像列表頁，而不是真正的 dispatch scheduling control plane。

和正式藍圖相比，仍缺：

- 待派任務表
- 候選車 / 司機清單
- ETA 比較
- 地圖板
- 指派流程
- 衝突與例外處理
- live board

這與正式的 Dispatch Scheduling 頁面要求仍有明顯落差。fileciteturn80file8

### Gap A3：Driver App 現在還是 generic trip runtime，不是多平台工作台

目前 mobile 主體仍偏向：

- 任務清單
- 任務詳情
- 行車介面
- 收尾
- 收益
- 設定

這些頁面本身符合原始 mobile prompt 的骨架，但尚未收斂成你們現在真正要的產品責任。fileciteturn80file7

缺的正式能力包含：

- 平台別任務來源顯示
- 平台 badge
- 平台別上線 / 下線
- 平台帳號綁定 / token expiry / 重新授權
- forwarded task mirror semantics
- route intent / route locked 顯示
- 平台別收益與總收益

### Gap A4：Forwarder / Platform Presence / Platform Earnings 尚未成 formal domain

依目前商業模式，core repo 應正式長出：

- `platform_accounts`
- `platform_presence`
- `platform_task_mirror`
- `platform_task_status_map`
- `platform_earnings_ledger`
- `platform_payout_summary`

目前 forwarder 概念已有，但還不夠完整支撐：

- 多平台 online/offline
- 多平台任務 mirror
- 平台別收益彙總

### Gap A5：前台完成度沒有跟上 backend 厚度

這是 repo A 最典型的現況：

- backend：厚
- contracts：厚
- module：厚
- UI shell：有
- 真正可操作的 control plane：未完成

---

## 4.3 Repo A 判定

### 判定一句話

`drts-fleet-platform` 沒走歪，不需要推倒重來；但它現在是 **後端主體已成形、前台控制面與 driver runtime 尚未收尾**。

### 建議判讀

- backend / domain：高完成度
- Platform Admin：中低完成度
- Ops Console：中完成度
- Driver App：中低完成度，但更重要的是方向需修正

---

## 5. Repo B：`tenant-commute-hub` 盤點結果

## 5.1 方向正確的部分

### A. Tenant Portal 頁面覆蓋率高

這個 repo 不是單純首頁雛形，而是主要 Tenant Portal 頁面大多已存在。

它對應到藍圖中的頁面範圍其實很完整：

- 租戶首頁
- 建立預約
- 預約清單
- 乘客名單與地址簿
- 報表
- API Keys & Webhooks
- Billing & Invoicing
- Notifications & SLA
- Tenant Admin & Roles
- Audit Trailfileciteturn80file5

### B. 它不只是畫面，已具備可操作 portal 骨架

現況更像：

- Vite + React + Router 的獨立 web app
- Lovable 驅動前端
- 多頁面、多 CRUD、多表單流
- 能做 demo、能互動、能操作

這代表它作為 **Tenant Portal frontend 生產線** 是有價值的，不應整個廢掉。

---

## 5.2 與藍圖的主要差異

### Gap B1：它現在不只是前端，已長成第二套 tenant authority

這是 Repo B 最大的問題。

目前它不是單純吃 `/api/tenant/*` 的前端，而是自己長出：

- auth
- profiles
- bookings
- invoices
- api_keys
- webhooks
- notifications
- audit_logs
- reports
- RLS / triggers / edge functions

但依正式藍圖，Tenant Portal 應該是 **租戶前端**，正式資料繫結走 `/api/tenant/*`。fileciteturn80file5

也就是說，Repo B 現在的最大偏差不是 UI，而是：

## 它已經超出前端 repo 的責任範圍

### Gap B2：Dashboard 類頁面仍有 demo / hardcoded 成分

Portal UI 雖完整，但部分首頁與摘要頁仍偏 demo / hardcoded read model，而不是正式 tenant home runtime。

這表示：

- 視覺骨架完整
- 真實整合深度不一致

### Gap B3：通知 / 偏好 / SLA 等頁面仍有半完成狀態

部分設定頁已具備表單與資料呈現，但最終偏好設定、正式事件訂閱、完整 SLA rule persistence 仍未完全收斂成 canonical backend integration。

### Gap B4：API Keys / Webhooks / Audit / Billing 類敏感資料不應由前端 repo 直持 authority

依正式藍圖，API Keys/Webhooks、Billing、Audit 都屬核心敏感域，正式資料繫結仍應由 `/api/tenant/*` 提供。fileciteturn80file5

因此 Repo B 現況最大風險是：

- UI 看起來完整
- 但敏感資料與敏感流程由前端 repo 自己持有過多權威

### Gap B5：Booking flow 的產品語意已有偏移

這是最需要提醒開發團隊的部分。

目前 tenant booking flow 已朝「平台內自行決定人駕 / 自駕指派語意」的方向生長，這與目前正式商業模式不一致。

Tenant Portal 應該做的是：

- 企業 / 社區租戶建立預約
- 顯示狀態 / ETA / 帳務 / 報表 / webhook / 通知

不應由 Tenant Portal 自己成為：

- 最終派遣語意權威
- vehicle assignment truth
- 自駕 / 人駕折扣與指派邏輯 authority

---

## 5.3 Repo B 判定

### 判定一句話

`tenant-commute-hub` 不是做太少，而是 **前端做得不錯、但後端 authority 做過頭**。

### 正確定位

它應保留作為：

- Tenant Portal UI repo
- Lovable + VS Code 協作前端 repo
- 頁面 / component / UX 生產線

它不應繼續承擔：

- auth authority
- booking authority
- invoice authority
- api key / webhook authority
- audit authority
- report authority

---

## 6. 兩個 repo 的關鍵差異與衝突

## 6.1 Source-of-truth 重疊

目前：

- Repo A 在做 canonical backend
- Repo B 又長出自己的 tenant mini-backend

這直接違反「Tenant Portal 應走 `/api/tenant/*`」的正式藍圖。fileciteturn80file5

## 6.2 Auth / RBAC / Audit 有分裂風險

正式藍圖裡：

- Tenant Portal、Platform Admin、Driver App、Ops/ROC 各有清楚 API 面與角色邊界fileciteturn80file5 fileciteturn80file6 fileciteturn80file7 fileciteturn80file8

若 Repo B 繼續持有 auth / roles / audit truth，會導致：

- invitation flow 分裂
- RBAC 分裂
- audit actor 分裂
- tenant 與 platform 的身份真值分裂

## 6.3 Driver App 方向與 Portal booking 語意正在一起偏向「自家中央派遣」

這是最危險的產品偏移。

如果：

- Tenant Portal 開始長自家 vehicle assignment semantics
- Driver App 又沿著單一自家任務執行器去做

最後產品會變成：

## 自家中央派遣平台 + 自家自駕派車系統

而不是你們現在定下來的：

## canonical backend + tenant frontend + 多平台司機工作台 + forwarder / mirror / earnings aggregation

---

## 7. Phase 1 應如何收斂

## 7.1 正式 repo 邊界（必須定案）

### `drts-fleet-platform`

唯一 source-of-truth：

- contracts
- backend / BFF
- auth / RBAC / audit
- booking / dispatch / forwarder
- platform presence
- platform task mirror
- platform earnings
- platform admin
- ops / roc
- driver app
- billing / invoice / report authority

### `tenant-commute-hub`

正式前端 repo：

- Tenant Portal UI
- 頁面流程
- component / state / UX
- 透過 `/api/tenant/*` 讀寫正式資料

---

## 7.2 Driver App 必須改成多平台司機工作台

Phase 1 的 Driver App，從現在開始必須依下列原則修正：

### 必須新增

- platform source badge
- platform task list
- platform online / offline toggle
- platform account binding / token status / re-auth
- route intent display
- route locked flag
- platform earnings by source
- total earnings summary

### forwarded 單原則

- 只做 mirror
- 只做 status sync
- 只做 accept/reject relay
- 只做 started/completed/cancelled mapping
- 只做 earnings aggregation
- 不重寫平台派單規則
- 不重算平台原始 route intent

這個收斂方向，才符合目前正式商業模式。

---

## 7.3 Tenant Portal 必須回到前端身份

### 應保留

- UI
- 頁面流程
- 多步預約向導
- 列表、查詢、管理、報表、設定體驗

### 應下沉到 core repo 的權威邏輯

- auth authority
- booking truth
- invoice truth
- api key / webhook truth
- audit truth
- report truth
- pricing / settlement authority

### 過渡做法

- 頁面繼續存在
- 但資料與規則逐步改成來自 core API

---

## 7.4 Platform Admin 與 Ops Console 必須補成真 control plane

### Platform Admin P0

先補：

- Tenants
- Users & Roles
- Switchboard & External APIs
- Split & Pricing Engine
- Feature Flags
- Audit & Compliance

### Ops Console P0

先補：

- Dashboard
- Dispatch Scheduling
- Incident Reporting
- Maintenance Logs
- Revenue Management
- Reports Center

這些都不是額外需求，而是原始藍圖本來就定義的正式頁面。fileciteturn80file6 fileciteturn80file8

---

## 8. 給開發團隊的修改規劃方向

## 8.1 第一優先：邊界收斂

1. 正式宣告 `drts-fleet-platform` 為唯一 source-of-truth
2. 凍結 `tenant-commute-hub` 新增 production authority
3. 新需求先進 core repo，再由 tenant repo 消費 API

## 8.2 第二優先：Driver App 方向修正

1. 停止新增「單一自家派遣執行器」需求
2. 補 platform presence / task mirror / earnings domain
3. Driver App backlog 全改成多平台司機工作台

## 8.3 第三優先：Portal 改接 canonical backend

1. 先從 booking / passengers / addresses / billing / api keys / webhooks / audit 開始
2. 逐步把 tenant repo 從直打自身 authority，改成打 `/api/tenant/*`
3. 保留 UI，移除權威

## 8.4 第四優先：Platform Admin / Ops 收尾

1. Platform Admin 從 shell 補成真的 platform control plane
2. Ops 從表格頁補成 dispatch / incident / revenue / reports console

---

## 9. 最終一句話（給開發會議開場用）

目前兩個 repo 都不是空殼：

- `drts-fleet-platform` 已經有相當成熟的 core backend 主體
- `tenant-commute-hub` 已經有相當完整的 Tenant Portal UI 與操作骨架

但與既定 Phase 1 藍圖相比，最大的問題不是做不出來，而是：

## repo 邊界重疊、權威分裂、Driver App 方向偏向自家中央派遣

因此接下來不應再讓兩邊各自自由生長，而應回到既定藍圖統一收斂：

- `drts-fleet-platform` 當 canonical backend / BFF / contracts / admin / ops / driver 主線
- `tenant-commute-hub` 收斂為 Tenant Portal frontend repo
- Driver App 正式改為多平台司機工作台
- Platform Admin 與 Ops Console 補成真 control plane
