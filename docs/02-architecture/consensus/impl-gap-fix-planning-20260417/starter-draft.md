# Impl Gap Fix — Starter Draft

**Workspace:** `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/`  
**Starter:** Claude (Supervisor)  
**Review order:** Codex → Qwen → Gemini → Copilot  
**Created:** 2026-04-17  
**Source:** Direct source-code inspection of drts-fleet-platform (not task docs)

---

## 0. 目的

Phase 1 task board 81/81 done。本輪 planning 基於對**實際原始碼**的直接檢查，
而不是 task 文件描述，發現了 13 個落差。本 starter draft 要：

1. 記錄每個落差的確切程式碼根因
2. 對每個落差進行分類與 Phase 歸屬判定
3. 提出具體的 backlog task 分解供各 agent 審查

---

## 1. 落差清單（程式碼根因）

### GAP-001 🔴 Driver App completeTask 硬編碼零 + 無 proof bundle

**根因檔案：** `apps/driver-app/app/trip.tsx:85-90`

```typescript
await client.completeTask(taskDetail.taskId, {
  completedAt: now,
  actualDistanceKm: 0, // HARDCODED
  actualDurationSec: 0, // HARDCODED
  // proof 完全缺失
});
```

**後端驗證邏輯（owned-mobility.service.ts:1685-1694）：**

```typescript
if (proof.photoIds.length < order.proofRequirements.minPhotoCount) {
  throw new ApiRequestError(400, "MIN_PHOTO_COUNT_NOT_MET", ...)
}
```

**影響：** Enterprise dispatch 訂單預設 `minPhotoCount: 1`（service.ts:467）。
目前 demo 訂單是 `minPhotoCount: 0`，所以 demo 能跑通，但真實業務訂單一定失敗。

**提議拆解：**

- `GAP-001a`：Trip screen 加 photo picker + proof bundle 組裝
- `GAP-001b`：後端 order create 預設 `minPhotoCount: 0`（明確 Phase 1 demo intent）
- `GAP-001c`：actualDistanceKm / actualDurationSec 接入 Expo Location API

**Phase 歸屬：** 001b 屬 Phase 1 must-fix（可立即讓現有 demo 的行為符合藍圖）；001a/001c 屬 Phase 2。

---

### GAP-002 🔴 Webhook Delivery Engine 未實作

**根因檔案：** `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`

```typescript
const delivery: StoredWebhookDelivery = {
  deliveryId: `wd_${randomUUID()}`,
  status: "queued",   // 永遠 queued，從不投遞
  httpStatus: 202,    // 硬編碼 202，從未真正發 HTTP
  ...
};
```

沒有任何 `fetch()`、`axios`、或 `HttpService` 呼叫。

**影響：** Tenant Portal webhook 管理 UI 完整存在，tenant 可以設定 endpoint，
但事件永遠不會被投遞。

**提議拆解：**

- `GAP-002a`：實作 WebhookDispatchService（Node `fetch` + retry + HMAC signature）
- `GAP-002b`：接入 order status change events（booking created/cancelled/completed）
- `GAP-002c`：Delivery log 真實 httpStatus + retry count 回寫

**Phase 歸屬：** Phase 2（Phase 1 可接受標示 "webhook queued — delivery engine Phase 2"）。
建議在 UI 加 disclaimer，而非 Phase 1 實作完整引擎。

---

### GAP-003 🔴 Billing / Tenant-Partner DEMO_TENANT_ID 硬編碼

**根因檔案：**

```typescript
// billing-settlement.service.ts:41
const DEMO_TENANT_ID = "tenant-demo-001";

// getTenantBillingProfile() — 永遠回傳 DEMO_TENANT_ID 的 profile
// generateTenantInvoice() — tenantId 由 command 傳入（部分對齊）
// generateDriverStatements() — 不隔離 tenant
```

`updateTenantBillingProfile()` 把所有更新寫回 `DEMO_TENANT_ID`，
不管 caller 傳什麼 tenant context。

tenant-partner.service.ts 同樣 pattern：`this.slaProfile.tenantId = DEMO_TENANT_ID`。

**影響：** 多 tenant 環境下，所有 tenant 共用一份 billing profile / SLA profile。
雖然 BUG-001 已修 owned-mobility 的 tenant isolation，
billing/tenant-partner 仍然有相同問題。

**提議拆解：**

- `GAP-003a`：BillingSettlementService 從 request context 取 tenantId（同 BUG-001 pattern）
- `GAP-003b`：TenantPartnerService slaProfile / webhookEndpoints / passengers 按 tenantId sharding

**Phase 歸屬：** Phase 1 must-fix（multi-tenant staging demo 前必須修）。

---

### GAP-004 🟠 Bootstrap Auth — 無 JWT 驗證，任意 header 可偽造身份

**根因檔案：** `apps/api/src/common/auth/auth.extractor.ts`

```typescript
// 完全信任 header，無簽名驗證
actorId: headers["x-actor-id"],
realm:   headers["x-realm"],
tenantId: headers["x-tenant-id"],
```

**影響：** Cloud Run service 目前公開可達（staging），任何人只要帶正確 header
就能以任意 tenant_admin 身份操作。

**提議拆解：**

- `GAP-004a`：導入 Cloud IAP 或 API Gateway JWT 驗證（Cloud Run 前置）
- `GAP-004b`：Bootstrap auth 限制只在 internal VPC 可用
- `GAP-004c`：Production header 改為 OIDC-signed JWT payload

**Phase 歸屬：** Phase 2 pre-production（Phase 1 staging 可接受加 IP allowlist）。

---

### GAP-005 🟠 Driver Statement 不含 Live Orders

**根因檔案：** `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:522-537`

```typescript
// generateDriverStatements 用 this.settlementTrips（只有 seed）
const eligibleTrips = this.settlementTrips.filter(
  (trip) => this.toPeriodMonth(trip.completedAt) === command.periodMonth,
);
// 相比之下 generateTenantInvoice 有 listLiveSettlementTripsInPeriod()
```

**影響：** 司機結算單只含 3 筆 hardcoded seed trips，
不反映任何真實完成訂單。

**提議拆解：**

- `GAP-005a`：`generateDriverStatements` 加 `listLiveDriverTripsInPeriod()` 對齊 invoice pattern
- `GAP-005b`：DB migration：`ops.phase1_owned_orders` completed 訂單加入 settlement 查詢

**Phase 歸屬：** Phase 2（Phase 1 demo 只看 tenant invoice；但 driver statement 要在 Phase 2 初期修）。

---

### GAP-006 🟠 無 SOS / 緊急按鈕

**根因檔案：** `apps/driver-app/app/incident.tsx`

```typescript
await client.createIncident({
  title: "Driver-reported incident",
  category: "operational",   // 硬編碼
  severity: "medium",        // 硬編碼
  ...
});
```

Incident screen 是一般文字回報，沒有：

- 一鍵 SOS 按鈕
- 高優先 severity (`"critical"`)
- 即時位置附帶

Driver app screen list（9 screens）：`_layout`, `index`, `shift`, `incident`,
`onboarding`, `platform-presence`, `jobs`, `settings`, `earnings`, `trip` — 無 SOS screen。

**提議拆解：**

- `GAP-006a`：新增 `apps/driver-app/app/sos.tsx` screen（一鍵按鈕，category=emergency, severity=critical）
- `GAP-006b`：API `/incidents` 支援 severity=critical 的 priority queue
- `GAP-006c`：Ops console SOS queue view

**Phase 歸屬：** Phase 2（Phase 1 staging demo 不強制，但需列入 Phase 2 Sprint 1）。

---

### GAP-007 🟡 Forwarder 無真實外部 HTTP Adapter

**根因檔案：** `apps/api/src/modules/forwarder/forwarder.service.ts`

- `ingestExternalOrder()` 只建 mirror record，不 poll 任何外部 API
- `syncNativeStatus()` 需手動 API 呼叫，無自動推播接收
- `resolveServiceBucket()` 只支援 `standard_taxi` / `business_dispatch`

**提議拆解：**

- `GAP-007a`：定義 ForwarderAdapterInterface（plug-in pattern）
- `GAP-007b`：第一個 adapter stub（Grab Taiwan webhook ingest）
- `GAP-007c`：Platform code registry 擴充 service buckets

**Phase 歸屬：** Phase 2 Sprint 2（需要 external partner API 協議）。

---

### GAP-008 🟡 Driver Profile 無獨立 Module

**根因：** `apps/api/src/modules/driver-profile/` 目錄不存在。
司機資料分散在 `regulatory-registry`（read-only for driver）。

**提議拆解：**

- `GAP-008a`：`driver-profile` module with self-service update endpoints
- `GAP-008b`：Driver app `settings.tsx` 接入 profile API

**Phase 歸屬：** Phase 2 Sprint 1。

---

### GAP-009 🟡 Regulatory Registry 全靜態，無實時 GPS

**根因：** `regulatory-registry.service.ts:166-182` — 3 筆 seed pair，ETA hardcoded。

**提議拆解：**

- `GAP-009a`：Driver app 發送位置 heartbeat（Expo Location）
- `GAP-009b`：`ops.phase1_driver_locations` table + repository
- `GAP-009c`：ETA 計算基於 haversine distance（近似值）

**Phase 歸屬：** Phase 2 Sprint 2。

---

### GAP-010 🟡 WebSocket/SSE 缺失，全部 Polling

**根因：** `apps/api/` 無任何 Gateway / EventsGateway / SSE endpoint。

**提議拆解：**

- `GAP-010a`：NestJS WebSocket Gateway（Socket.IO）for driver task events
- `GAP-010b`：Ops console 訂閱 dispatch board 即時更新

**Phase 歸屬：** Phase 2 Sprint 2。

---

### GAP-011 🟢 Feature Flag 僅 UI-layer Gate

**根因：** `feature-flags.service.ts` 僅提供 `isEnabled()` 給 frontend 查詢，
API endpoints 本身不 check flag。

**提議拆解：**

- `GAP-011a`：NestJS `@FeatureGated("key")` decorator + guard

**Phase 歸屬：** Phase 2 Sprint 3。

---

### GAP-012 🟢 Platform Earnings In-Memory 無 Seed

**根因：** `platform-earnings.service.ts:29-38` — `this.memory` 初始為空 Map。

**提議拆解：**

- `GAP-012a`：加入 3 筆 demo seed records（對齊 billing settlement seed）

**Phase 歸屬：** Phase 2 Sprint 1（快速修，一兩行）。

---

## 2. Phase 歸屬總表（草案）

| Gap ID   | 描述                                       | Phase | Sprint | Priority |
| -------- | ------------------------------------------ | ----- | ------ | -------- |
| GAP-001b | Order default minPhotoCount=0 for demo     | P1    | Hotfix | Critical |
| GAP-003a | Billing tenantId from context              | P1    | Hotfix | Critical |
| GAP-003b | TenantPartner per-tenant sharding          | P1    | Hotfix | Critical |
| GAP-002c | Webhook UI disclaimer (no delivery engine) | P1    | Hotfix | High     |
| GAP-004b | Bootstrap auth VPC/IAP restrict            | P2    | S1     | High     |
| GAP-005a | Driver statement live trips                | P2    | S1     | High     |
| GAP-006a | SOS screen driver app                      | P2    | S1     | High     |
| GAP-006b | Incident severity=critical API             | P2    | S1     | High     |
| GAP-008a | Driver profile module                      | P2    | S1     | Medium   |
| GAP-012a | Platform earnings seed data                | P2    | S1     | Low      |
| GAP-001a | Trip screen proof bundle                   | P2    | S2     | High     |
| GAP-001c | Trip screen Expo Location metrics          | P2    | S2     | Medium   |
| GAP-002a | Webhook delivery engine                    | P2    | S2     | High     |
| GAP-002b | Webhook order event hooks                  | P2    | S2     | High     |
| GAP-007a | Forwarder adapter interface                | P2    | S2     | Medium   |
| GAP-007b | Grab adapter stub                          | P2    | S2     | Medium   |
| GAP-009a | Driver location heartbeat                  | P2    | S2     | Medium   |
| GAP-009b | Driver locations DB table                  | P2    | S2     | Medium   |
| GAP-010a | WebSocket gateway                          | P2    | S2     | Medium   |
| GAP-004a | Cloud IAP / JWT                            | P2    | S3     | High     |
| GAP-006c | Ops console SOS queue                      | P2    | S3     | Medium   |
| GAP-007c | Platform code registry                     | P2    | S3     | Medium   |
| GAP-009c | ETA haversine calculation                  | P2    | S3     | Medium   |
| GAP-010b | Ops console SSE dispatch                   | P2    | S3     | Medium   |
| GAP-011a | @FeatureGated decorator                    | P2    | S3     | Low      |
| GAP-008b | Driver app settings → profile API          | P2    | S3     | Low      |
| GAP-005b | Settlement DB migration                    | P2    | S3     | Medium   |

---

## 3. 待 Reviewers 回答的開放問題

**Q1（Phase boundary）：** GAP-001b（demo minPhotoCount=0）是否應該是 Phase 1 hotfix，
還是直接進 Phase 2 Sprint 1？代碼量很小（改一個常數），
但改動 enterprise dispatch order 的 proof requirement 語意。

**Q2（Webhook strategy）：** GAP-002 的 webhook delivery engine，
Phase 2 Sprint 2 是否太晚？ Tenant Portal 的 webhook UI 已完整上線，
如果持續無法投遞，客戶演示時有沒有問題？

**Q3（Auth urgency）：** GAP-004 bootstrap auth 目前 staging 公開可達。
是否應該在 Phase 1 收尾前先加 Cloud Run service-level auth
（`--no-allow-unauthenticated` + 演示用 service account）？

**Q4（Driver statement scope）：** GAP-005 的 driver statement 只含 seed data，
Phase 2 Sprint 1 修是否合理，還是需要先確認 DB schema 對齊（需要 GAP-005b 先做）？

**Q5（SOS severity）：** 後端 `/incidents` endpoint 的 severity 是否有現成的
`"critical"` 值 in contracts，還是需要擴充 enum？

---

## 4. 建議的 Supervisor Task ID 命名

Phase 1 hotfixes: `GAP-P1-001` 到 `GAP-P1-004`  
Phase 2 Sprint 1: `GAP-P2S1-001` 到 `GAP-P2S1-006`  
Phase 2 Sprint 2: `GAP-P2S2-001` 到 `GAP-P2S2-008`  
Phase 2 Sprint 3: `GAP-P2S3-001` 到 `GAP-P2S3-007`

---

_Codex：請從 Section 3 的開放問題切入，補充程式碼引用，並確認 Phase boundary 判定。_
