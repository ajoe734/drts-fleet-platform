# Phase 1 雙 Repo 盤點與開發收斂指引

## 1. 文件目的

本文件用來做三件事：

1. 以既定 Phase 1 開發藍圖為唯一基準，重新盤點 `drts-fleet-platform` 與 `tenant-commute-hub` 兩個 repo。
2. 說明兩個 repo 距離原本藍圖的落差。
3. 提出開發團隊接下來應如何修改與收斂，避免兩邊越做越分裂。

---

## 2. 比對基準：Phase 1 正式藍圖

### 2.1 Tenant Portal（租戶前端）應有範圍

Tenant Portal 應包含：

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

關鍵原則：

- 這是一個 **租戶前端 Web Portal**。
- 正式資料繫結應是 `/api/tenant/*`。
- 它應是 **canonical backend 的 consumer**，不是第二套 production authority。

### 2.2 Platform Admin（平台級後台）應有範圍

應包含：

- Admin Auth & Tenant Switch
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

關鍵原則：

- 這是平台級高敏感 control plane。
- 正式資料繫結應是 `/api/admin/*`。
- 不能只停在 shell / placeholder。

### 2.3 Driver App（司機端）正式 Phase 1 定位

原始 App 藍圖有 onboarding/jobs/job detail/drive console/incident/proof/shift/earnings/settings 等頁。
但依目前已確認的商業模式，**Phase 1 正式定位必須修正為：多平台司機工作台**。

也就是：

- 同一個 App 顯示不同叫車平台任務
- 司機可對不同平台 individually 上線 / 下線
- 對第三方平台單只做 mirror / sync / status 回傳 / 收益聚合
- 不重寫第三方平台派單規則
- 不重算第三方平台既有路線規劃
- App 需顯示平台別收益與總收益

### 2.4 Ops / Host / OpCo / ROC 後台應有範圍

應包含：

- Dashboard
- Revenue Management
- Dispatch Scheduling（列表 + 地圖 + ETA + assignment）
- FSD Takeover Logs
- ODD Capability Rules
- Maintenance Logs
- Incident Reporting
- Energy & Charging Scheduler
- Tesla Fleet Integrations
- Notifications
- Settings & Access
- Reports Center

關鍵原則：

- 這是營運控制台，不是單純表格頁。
- 必須能真正操作派遣、事故、維保、監控與報表。

---

## 3. 兩個 repo 的正式責任邊界

### 3.1 `drts-fleet-platform`

正式定位：**核心平台 / canonical backend / source-of-truth repo**

應擁有：

- backend API / BFF
- contracts / DTO / SDK authority
- auth / RBAC / audit authority
- tenant/admin/ops/driver 的正式 API
- forwarder / adapter / third-party integration logic
- billing / settlement / reporting / filing authority
- Platform Admin Web
- Ops / ROC Web
- Driver App
- migrations / deploy / infra / CI/CD

### 3.2 `tenant-commute-hub`

正式定位：**Tenant Portal frontend repo**

應擁有：

- Tenant Portal routes / pages / components
- UI / UX / layout / form flow / table / report screen
- frontend state 與 interaction
- 呼叫 `drts-fleet-platform` 的 `/api/tenant/*`

不應再擁有：

- production auth authority
- production booking authority
- production invoice / billing authority
- production api key / webhook authority
- production audit authority
- production report job authority
- production pricing truth

---

## 4. Repo 盤點結論總覽

### 4.1 `drts-fleet-platform`

總判斷：

- **方向大致正確**
- **核心後端相對成熟**
- **前台完成度落後於後端厚度**
- **Driver App 尚未修正到多平台工作台方向**

一句話：

> 後端厚、前台薄、主幹可繼續，但還沒完成 Phase 1 收尾。

### 4.2 `tenant-commute-hub`

總判斷：

- **UI 覆蓋率高**
- **互動與頁面不少已可用**
- 但目前不只是前端，已長成 **第二套 tenant authority**

一句話：

> 不是沒做，而是做太深，深到與 canonical backend 重疊。

### 4.3 共同最大問題

目前兩個 repo 最大問題不是「哪個沒做」，而是：

> **兩個 repo 都做了，而且 authority 邊界重疊。**

具體重疊的 domain 至少包括：

- tenant identity / profiles
- users / roles
- bookings
- invoices / billing
- api keys
- webhooks
- notifications
- audit
- reports

---

## 5. `drts-fleet-platform` code-level 盤點

### 5.1 已完成且方向正確的部分

已實際檢視的關鍵檔案包含：

- `apps/api/src/app.module.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/platform-admin-web/app/tenants/page.tsx`
- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/driver-app/app/jobs.tsx`
- `apps/driver-app/app/earnings.tsx`
- `apps/driver-app/app/settings.tsx`
- `.github/workflows/ci.yml`
- `current-work.md`

#### A. 核心後端 module 已成形

`app.module.ts` 已掛載多個核心 module，包含 foundation、identity、tenant-partner、owned-mobility、platform-admin、billing-settlement、reporting-filing、forwarder、incident、maintenance、shift-attendance、driver-settings 等。這表示它已是正式 Phase 1 主幹，而不是 bootstrap repo。

#### B. 核心訂單 / 預約 / 派遣能力不是假的

`owned-mobility.service.ts` 已實作 tenant booking、order、dispatch、driver task lifecycle、redispatch / queue / proof / rules 等，這代表核心流程已進入可執行狀態。

#### C. CI / monorepo / module base 可用

CI、monorepo、apps/packages 分層、目前工作板等都已存在，可支撐持續開發。

### 5.2 主要落差

#### Gap A1：Platform Admin 前台明顯落後藍圖

`apps/platform-admin-web/app/tenants/page.tsx` 仍偏 placeholder。與藍圖相比，缺少真正可操作的：

- Tenants
- Users & Roles
- Fleet & Devices
- Switchboard & External APIs
- Split & Pricing Engine
- Payments & Acquiring
- ODD Policy Templates
- System Health & Quotas
- Audit & Compliance
- Notices / Maintenance
- Feature Flags

#### Gap A2：Ops Console 尚未成為真正 dispatch board

`apps/ops-console-web/app/dispatch/page.tsx` 目前較像 orders list/table，離正式 dispatch scheduling 還差：

- 待派任務清單
- 可用車/司機候選清單
- 地圖與 ETA
- assignment flow
- 衝突處理
- reservation / queue 語意
- exception handling

#### Gap A3：Driver App 目前仍偏 generic trip executor

`jobs.tsx`、`earnings.tsx`、`settings.tsx` 仍是 generic 任務/收益/設定頁，尚未進入多平台工作台模式。

目前缺少：

- 平台來源 badge
- 平台任務篩選
- 平台別上線 / 下線
- 平台帳號狀態 / token expiry / re-auth
- 平台規則提示 / route locked 顯示
- 平台別收益與總收益
- forwarded task mirror semantics

#### Gap A4：formal domain 尚未補齊

依目前商業模式，core repo 還必須正式長出：

- `platform_account_binding`
- `platform_presence`
- `platform_task_mirror`
- `platform_status_mapping`
- `platform_route_intent`
- `platform_earnings_ledger`
- `platform_payout_summary`

目前雖已有 `forwarder` 概念，但還不足以完整支撐多平台司機工作台。

### 5.3 對 repo A 的完成度判斷

- 核心平台 backend：80~85%
- Platform Admin 前台：35~45%
- Ops Console：50%左右
- Driver App：40~50%
- Phase 1 整體：70% 左右

---

## 6. `tenant-commute-hub` code-level 盤點

### 6.1 已檢視的關鍵檔案

- `README.md`
- `package.json`
- `src/App.tsx`
- `src/contexts/AuthContext.tsx`
- `src/integrations/supabase/client.ts`
- `src/components/DashboardLayout.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/BookingList.tsx`
- `src/pages/NewBooking.tsx`
- `src/pages/PassengerManagement.tsx`
- `src/pages/AddressManagement.tsx`
- `src/pages/ReportManagement.tsx`
- `src/pages/ApiKeyManagement.tsx`
- `src/pages/BillingManagement.tsx`
- `src/pages/NotificationSettings.tsx`
- `src/pages/AdminPanel.tsx`
- `src/pages/AuditLog.tsx`
- `src/hooks/useUserRole.ts`
- `supabase/functions/calculate-price/index.ts`
- `supabase/functions/seed-demo-data/index.ts`
- `supabase/migrations/*`

### 6.2 做對的地方

#### B1：Tenant Portal UI 覆蓋率其實很高

此 repo 已經涵蓋原藍圖的大多數租戶 Portal 頁面：

- 登入/首頁
- 建立預約
- 預約清單
- 乘客/地址簿
- 報表
- API Keys/Webhooks
- Billing
- Notifications
- Tenant Admin
- Audit

#### B2：它不是純 mock，而是已有實際互動與權限

`AuthContext.tsx`、`useUserRole.ts`、`DashboardLayout.tsx` 顯示它不是單純畫面稿，而有登入、角色與頁面骨架。

### 6.3 最大偏差

#### Gap B1：它不只做前端，而是長成第二套 tenant backend authority

這是最大問題。

目前 repo 內已看到：

- Supabase auth / profile
- migrations 自建 tenant 側資料表
- booking / invoice / api_keys / webhooks / notifications / audit_logs / reports 等資料結構
- edge functions（例如 `calculate-price`）

換句話說，`tenant-commute-hub` 現在不只是 tenant portal UI，而是已經長成：

> **一套獨立 tenant backend**

這直接與 `drts-fleet-platform` 應擁有的 canonical backend authority 重疊。

#### Gap B2：價格與產品邏輯正在 tenant repo 發散

`supabase/functions/calculate-price/index.ts` 表示 tenant repo 正在自行承擔 pricing / quote 邏輯。

一旦這條線繼續發散，最後會出現：

- tenant repo 一套價格邏輯
- core repo 一套 billing / settlement / pricing 邏輯

這會直接造成報價、對帳、發票與結算口徑分裂。

#### Gap B3：New Booking 正在往「自行決定履約方式」偏移

`NewBooking.tsx` 與相關資料欄位已出現 vehicle type / autonomous-human style 的語意。
這代表 tenant repo 正在吸收：

- 車型選擇
- 自駕/人駕切換決策
- fulfillment 產品邏輯

這些邏輯不應在 tenant frontend repo 成為 domain truth，應回到 core repo 的 product rules / fulfillment logic。

#### Gap B4：Supabase 目前仍像 prototype backend，不應繼續長為正式 authority

若這個 repo 要保留在正式架構中，正確方向應是：

- 只做 frontend repo
- 所有 production data 透過 `drts-fleet-platform` 的 `/api/tenant/*`
- Supabase 降級為 prototype / preview / local convenience，而不是正式真值來源

### 6.4 對 repo B 的完成度判斷

- Tenant Portal UI 覆蓋率：高
- Tenant Portal interaction：中高
- 架構是否符合原藍圖：低到中
- source-of-truth discipline：低

一句話：

> `tenant-commute-hub` 不是沒做，而是做得太深，深到和核心平台重疊。

---

## 7. 兩個 repo 對照原藍圖的主要落差

### 7.1 最大落差 1：雙真值

原藍圖中，Tenant Portal 應吃 `/api/tenant/*`；現在實際上兩邊都在承擔 tenant domain truth。

### 7.2 最大落差 2：Driver App 方向偏差

原始 App prompt 容易把團隊導向單一任務執行器，但 Phase 1 正式方向已修正為 **多平台司機工作台**。

### 7.3 最大落差 3：Platform Admin 與 Ops Console 仍偏 shell

核心 backend 很厚，但兩個 control plane 的實際前台還沒補上。

### 7.4 最大落差 4：core ↔ tenant 的 BFF / contract migration 尚未完成

目前 tenant repo 仍大量直接依賴自己的 Supabase schema，而非全面透過 core API。

---

## 8. 開發團隊必須修改的規劃方向

## P0：先修邊界，不先修邊界後面都會做歪

### P0-1：正式宣告唯一真值

必須正式定義：

- `drts-fleet-platform` = 唯一 source-of-truth
- `tenant-commute-hub` = tenant portal frontend repo

### P0-2：凍結 `tenant-commute-hub` backend authority 擴張

立即停止在 tenant repo 繼續新增 production authority：

- 新 migration 繼續長正式業務表
- 新 pricing truth
- 新 invoice truth
- 新 audit truth
- 新 webhook truth
- 新 report truth

### P0-3：建立 tenant API migration plan

要把 tenant repo 收斂回 core，至少要分波次遷移：

1. auth / profile
2. bookings
3. passengers / addresses
4. api keys / webhooks
5. billing / invoices
6. notifications / SLA
7. users / roles
8. audit / reports

---

## 9. `drts-fleet-platform` 接下來要補什麼

### 9.1 補齊 Tenant BFF / API

優先補齊與 Tenant Portal 對應的正式 API：

- `/api/tenant/home`
- `/api/tenant/bookings`
- `/api/tenant/passengers`
- `/api/tenant/addresses`
- `/api/tenant/reports/jobs`
- `/api/tenant/apiKeys`
- `/api/tenant/webhooks`
- `/api/tenant/invoices`
- `/api/tenant/billing/profile`
- `/api/tenant/notifications`
- `/api/tenant/sla`
- `/api/tenant/users`
- `/api/tenant/roles`
- `/api/tenant/audit`

### 9.2 補齊 Platform Admin 真正操作面

必須從 placeholder 升級為正式 control plane：

- Tenants
- Users & Roles
- Fleet & Devices
- Switchboard & External APIs
- Split & Pricing Engine
- Payments & Acquiring
- System Health & Quotas
- Audit & Compliance
- Notices / Maintenance
- Feature Flags

### 9.3 補齊 Ops Console 真正操作面

- Dispatch board（待派清單 + 候選車/司機 + 地圖 + ETA + assignment）
- Incidents
- Maintenance
- Revenue / Reports
- Notifications

### 9.4 補齊 Driver App 的正式 domain

新增 formal domain：

- `platform_account_binding`
- `platform_presence`
- `platform_task_mirror`
- `platform_status_map`
- `platform_route_intent`
- `platform_earnings_ledger`
- `platform_payout_summary`

### 9.5 修正 Driver App backlog

App backlog 要立即改成：

- 平台別任務展示
- 平台別上線 / 下線
- 平台帳號綁定 / 重新授權
- 平台規則提示 / route locked 顯示
- 平台別收益與總收益
- forwarded task sync / mirror / status mapping

---

## 10. `tenant-commute-hub` 接下來要改什麼

### 10.1 保留的內容

可以保留：

- routes / pages / components
- UX / UI / forms / tables
- tenant-facing interaction
- Lovable 生產前端頁面的能力

### 10.2 必須拔掉或降級的內容

要逐步拔掉或降級：

- production auth authority
- production booking truth
- production invoice / billing truth
- production api key / webhook truth
- production audit truth
- production pricing truth

### 10.3 立即調整原則

- 所有新頁面優先吃 core API
- 所有新增欄位優先到 core repo 開 contract / API
- tenant repo 不再自行定義正式 schema 真值
- 既有 Supabase 內容只作過渡，不再視為最終 authority

### 10.4 開發閉環檔案規範

為了讓 Lovable + VS Code + GitHub 真正形成閉環，`tenant-commute-hub` 應建立：

```text
.ai-loop/
  FRONTEND_CHANGE_SPEC.md
  FRONTEND_CHANGE_SPEC.json
  LOVABLE_CHANGE_FEEDBACK.md
  API_GAP_REQUESTS.json
  UI_DECISIONS.md
  QA_STATUS.md
  BACKEND_DELIVERY_NOTE.md
  CONTRACT_VERSION.lock
```

意義：

- VS Code 端 LLM 產出前端修改規範
- Lovable 讀規範修改 tenant repo
- Lovable 回寫這輪 UI 變更與 API gap
- VS Code 端 LLM 再回 core repo 補 API / contracts / SDK
- core repo 回寫 backend delivery note 給 tenant repo
- 下一輪再循環

這樣才是正式開發閉環，而不只是「兩邊都在 GitHub 上」。

---

## 11. 建議開發順序

### Wave 0：治理收斂

- 正式宣布 repo 邊界
- 凍結 tenant repo backend 擴張
- 建立 `.ai-loop/` 閉環規範

### Wave 1：core API/contract 對齊

- 補齊 `/api/tenant/*`
- 定版 contracts / SDK
- 建立 core → tenant 的 delivery note 流程

### Wave 2：Tenant Portal API cutover

- bookings / passengers / addresses 改接 core
- api keys / webhooks 改接 core
- billing / invoices / reports / audit 改接 core

### Wave 3：Platform Admin / Ops 補完

- platform admin control plane
- dispatch board
- incidents / maintenance / reports / notifications

### Wave 4：Driver App 正式修正

- multi-platform jobs inbox
- platform presence center
- platform earnings
- forwarded task mirror / sync semantics

### Wave 5：UAT / pilot hardening

- e2e
- audit consistency
- billing consistency
- webhook / api key lifecycle consistency
- staging / prod deploy governance

---

## 12. 給開發團隊的最終結論

### 12.1 不需要推倒重來

- `drts-fleet-platform` 不需要重做，它應繼續當主幹。
- `tenant-commute-hub` 也不需要廢掉，它應收斂成正式 tenant frontend repo。

### 12.2 但必須先修正兩個方向

1. **雙真值問題**
2. **Driver App 產品方向偏差**

### 12.3 若不先修這兩件事

後面會持續出現：

- tenant data truth 分裂
- role / permission 分裂
- api key / webhook lifecycle 分裂
- billing / invoice 口徑分裂
- audit truth 分裂
- mobile 越做越偏離商業模式

### 12.4 Phase 1 現在最重要的不是再多長幾頁

而是：

- 先重切 repo 邊界
- 再補真 control planes
- 再把 Driver App 修正成多平台司機工作台
- 再讓 tenant portal 全面回到 core API
