# Starter Draft — Gap Phase 2 Planning

**起草人：** Claude（Supervisor）
**日期：** 2026-04-17
**基準：** 實際程式碼 + phase1_dual_repo_gap_analysis_for_dev_team_final.md + 既有 consensus-packet（impl-gap-fix-planning-20260417）

---

## 0. Round 1 Synthesis（Codex / contracts-schema-dependencies）

本輪 review 先用共享 canonical context 對齊目前 baton 狀態：專案目前處於 `discussion_planning`，本 workspace 為 `docs/02-architecture/consensus/gap-phase2-planning-20260417`，R1 baton owner 為 Codex，因此以下修正僅更新規劃與依賴，不啟動任何實作任務（`ai-status.json:3,69,93-105`; `current-work.md:27-35`; `ai-activity-log.jsonl` at `2026-04-17T14:33:25Z`; `docs-site/index.html:38-48`）。

- Driver App 完成流程仍在 `completeTask` 時硬寫 `actualDistanceKm: 0`、`actualDurationSec: 0`，且沒有送 `proof`；另一方面 `CompletionProofBundle` 與 `DriverCompleteTaskCommand.proof` 已存在於 contracts，所以 A-1/A-2/A-5 的核心不是改 contract，而是補齊 driver-app capability 與上傳/定位前置能力（`apps/driver-app/app/trip.tsx:85-89`; `packages/contracts/src/index.ts:471-614`）。
- `apps/driver-app/package.json` 目前沒有 `expo-image-picker`、`expo-location`、`expo-task-manager` 等依賴，因此 proof bundle、距離/時間追蹤、GPS heartbeat 不應被視為三個完全獨立的零前置任務；至少要在 Sprint 2 明示同一組 capability bootstrap（`apps/driver-app/package.json`）。
- Forwarder 已經用 `platformCode` 管理 mirror order 與 adapter health，所以 B-1 不應再被描述成「從零建立 platform routing」，而是抽出 adapter interface 並接入 Grab Taiwan stub（`apps/api/src/modules/forwarder/forwarder.service.ts:60-110`）。
- `listLiveDriverTripsInPeriod` 已經存在於 `billing-settlement.repository.ts`，但 shared blocker 明確指出 GAP-P2S1-003 的正式 closeout 被 GAP-P2S1-009 的重構重疊卡住；因此 F-1 應縮成「index-only / review-after-009-stabilization」，不要再把查詢方法重算成 Sprint 3 主工作量（`apps/api/src/modules/billing-settlement/billing-settlement.repository.ts:206-255`; `current-work.md:117-118`）。
- `sendTestWebhook` 已直接回傳 `deliveryId`、`httpStatus`、`attempt`、`nextAttemptAt`，所以 G-2 的 open question 不再是「回傳格式有沒有更新」，而是 tenant-commute-hub 是否正確消費這個既有 payload（`apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1072-1139`; `/home/edna/workspace/tenant-commute-hub/src/pages/WebhookManagement.tsx:223-233`）。
- Platform Admin Switchboard 並非空殼頁面，已經有 list/create/publish public info 與 generate placard 的 UI/contract 連線；E-1 應改成「能力審計 / gap audit」而不是單純判斷是否為 stub（`apps/platform-admin-web/app/switchboard/page.tsx:64-201`; `apps/api/src/modules/platform-admin/platform-admin.controller.ts:20-69`）。
- Cloud IAP / OIDC 規劃需要保留外部前置條件：shared blocker 顯示 staging deploy 缺少 GCP vars/secrets，且目前機器對 Cloud Run 權限不足；D-1 不能被當成純 repo 內 code slice 排進 Sprint 3 即可落地（`current-work.md:117`; `ai-status.json:147-157`）。
- tenant-commute-hub 的 Supabase edge functions 雖然在 `src/` 已無引用、`package.json` 也無 Supabase 依賴，但 build 目前靠 Vite alias 直接指向本機 `../drts-fleet-platform` 路徑，這是另一個獨立的交付風險，不能和 G-1 混為同一件事（`/home/edna/workspace/tenant-commute-hub/src`; `/home/edna/workspace/tenant-commute-hub/package.json`; `/home/edna/workspace/tenant-commute-hub/vite.config.ts:16-27`）。

---

## 1. 背景與範圍

Sprint 1 已完成或進行中的任務涵蓋：

- GAP-P1-003（webhook disclaimer）
- GAP-P2S1-001~002（SOS、incident severity）
- GAP-P2S1-004-CONTRACTS（DriverProfileRecord）
- GAP-P2S1-005~008（earnings seed、internal-key、minPhotoCount comment、audit log cap）
- GAP-P2S1-013（WebhookDispatchService）
- 進行中：003（driver statement）、004-API、009、010、012、014

本規劃文件涵蓋**尚未排程的所有落差**，分為四個領域：

1. **Sprint 2 backlog**（即時功能、GPS、proof bundle）
2. **Sprint 3 backlog**（Auth、Feature Gate、Settlement index、SOS queue）
3. **tenant-commute-hub 前端側**（Lovable repo 特定清理與串接）
4. **Platform Admin Switchboard 驗查**

---

## 2. 領域 A：Driver App — 行程完成 + GPS

### A-0：driver-app media/location capability bootstrap（新增前置）

**現況：**

- `apps/driver-app/package.json` 尚未安裝 `expo-image-picker`、`expo-location`、`expo-task-manager`
- `apps/driver-app/app/trip.tsx:85-89` 仍直接送零值完成任務

**需要：**

- 決定並安裝 A-1/A-2/A-5 共用的 Expo capability 組合
- 明確列出 permission、背景定位與開發/測試環境需求
- 將 proof capture、距離/時間計算、heartbeat sender 視為同一組 driver runtime 能力，而不是三個彼此無關的 UI patch

**預估規模：** S（0.5-1 天）

**注意：** 可作為獨立 prerequisite，也可由 A-1/A-2/A-5 其中一個 owner 一次吃完，但規劃文件必須顯式承認這個前置。

---

### A-1：行程照片 proof bundle（GAP-P2S2-001）

**現況程式碼：**
`apps/driver-app/app/trip.tsx:85-90`

```typescript
await client.completeTask(taskId, {
  actualDistanceKm: 0, // ← 硬碼 0
  actualDurationSec: 0, // ← 硬碼 0
  // proof: 缺少
});
```

**藍圖要求：**

- 司機完成行程前先拍照（1+ 張），組成 `CompletionProofBundle`
- contracts 已有：`CompletionProofBundle` 與 `DriverCompleteTaskCommand.proof`（`packages/contracts/src/index.ts:471-614`）
- 需要：Expo ImagePicker + photo/file-id 取得流程 + 組 bundle 後送給 `completeTask`
- 本輪 review 建議保留既有 `photoIds` contract，不在此 planning loop 直接改成 inline base64；若沒有現成媒體服務，需另外補一個輕量 upload / file-id issuance 前置
- 依賴：A-0 capability bootstrap

**影響：** enterprise dispatch 訂單（minPhotoCount: 1）目前無法正確完成

**預估規模：** M（若另起 upload/file-id 前置則接近 M-L）

---

### A-2：行程 Expo Location 指標（GAP-P2S2-002）

**現況：** `actualDistanceKm: 0, actualDurationSec: 0` 硬碼

**需要：**

- 在行程進行中用 Expo Location 追蹤距離與時間，完成時填入真實值
- 與 A-5 共用同一個 location session / tracker，避免前景計算與背景 heartbeat 各自維護一套定位邏輯
- 依賴：A-0 capability bootstrap

**預估規模：** M（1-2 天，~100 LOC）

---

### A-3：DB Migration V0019\_\_driver_locations.sql（GAP-P2S2-003）

**Gemini Round 3 已設計 schema：**

```sql
CREATE TABLE IF NOT EXISTS ops.phase1_driver_locations (
  driver_id       TEXT NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  accuracy_m      DOUBLE PRECISION,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id)
);
CREATE INDEX ON ops.phase1_driver_locations (updated_at DESC);
```

**預估規模：** S（< 4 小時，~20 LOC SQL）

---

### A-4：regulatory-registry 司機位置心跳 endpoint（GAP-P2S2-004）

**需要：**

- `POST /api/regulatory-registry/driver-location` — 接收 `{ driverId, lat, lng, accuracyM }` → upsert ops.phase1_driver_locations
- Haversine ETA 計算：`GET /api/regulatory-registry/driver-eta?driverId=X&destLat=Y&destLng=Z`
- 阻斷依賴：V0019 migration 必須先完成

**預估規模：** M（~120 LOC）

---

### A-5：Driver App GPS 位置 heartbeat sender（GAP-P2S2-005）

**需要：**

- 使用 Expo Location `watchPositionAsync` 或 `TaskManager`（background）
- 每 15 秒向 `/api/regulatory-registry/driver-location` POST 一次
- 只在有進行中任務時啟動

**預估規模：** M（~80 LOC）

**依賴：** A-0 capability bootstrap + A-4 完成

**規劃提醒：** 若 A-2 已建立前景 location tracker，A-5 應優先重用而非重寫第二套定位狀態機。

---

## 3. 領域 B：Forwarder Adapter

### B-1：ForwarderAdapterInterface + Grab Taiwan stub（GAP-P2S2-006）

**現況：**
`apps/api/src/modules/forwarder/forwarder.service.ts` 已有 forwarded order state、`platformCode` 與 adapter health 管理；缺的是顯式 plug-in interface 與 concrete adapter 邊界，不是 platform routing 從零開始。

**需要：**

- `ForwarderAdapterInterface { accept, reject, complete, heartbeat, fetchEarnings }`
- `GrabTaiwanAdapter`（stub，只做 log + mock response）
- 保留現有 `platformCode`/mirror order 流程，避免重寫 `ForwarderService` 的既有 state machine
- 外部 partner 憑證（Grab Taiwan API key）依賴商務開發，stub 可先完成

**預估規模：** M（~150 LOC）

---

## 4. 領域 C：即時推送（SSE）

### C-1：NestJS SSE endpoint for driver task events（GAP-P2S2-007）

**架構決定（Gemini Round 3）：** Cloud Run 無法做 sticky session → 使用 SSE 而非 WebSocket

**需要：**

- `GET /api/driver/task-events` → `text/event-stream`
- NestJS `@Sse()` decorator + `fromEvent(EventEmitter)`
- 事件：`task_assigned`、`task_updated`、`task_cancelled`

**預估規模：** M（~100 LOC）

---

### C-2：ops-console SSE dispatch board live updates（GAP-P2S3-004）

**需要：**

- `GET /api/ops/dispatch-events` → SSE stream
- ops-console 前端 EventSource 客戶端
- 事件：新訂單、派遣狀態更新、司機位置更新

**阻斷依賴：** C-1 + A-4（司機位置資料）

**預估規模：** M（~120 LOC + 前端）

---

## 5. 領域 D：Auth 升級

### D-1：Cloud IAP / OIDC JWT production（GAP-P2S3-001）

**現況：**
`.github/workflows/deploy-staging.yml:317,342,356` 三個 Cloud Run deploy 都包含 `--allow-unauthenticated`

**Sprint 1 已做的過渡：** `x-drts-internal-key` middleware（GAP-P2S1-006）

**最終需要：**

- 移除 `--allow-unauthenticated`
- 設定 Cloud IAP（GCP Console）
- NestJS 改驗 OIDC JWT（`Authorization: Bearer <JWT>`）
- E2E tests 改用 Service Account token

**規模：** XL（架構級，1-2 週）
**注意：** 需要 GCP Console 操作，不是純程式碼任務

**外部阻塞：** shared blocker 已確認 staging deploy 缺少 GCP vars / secrets，且目前無法直接檢視 Cloud Run；建議拆成「D-0：GCP/IAM/secret provisioning」與「D-1：repo 內 auth 實作」兩段，不要只排一張程式碼票（`current-work.md:117`）。

---

## 6. 領域 E：Platform Admin 與 Ops Console 補完

### E-1：Platform Admin Switchboard 驗查（GAP-P2S2-008）

**現況：**
`apps/platform-admin-web/app/switchboard/page.tsx` 不是空白 shell，已經會讀取 `listPublicInfo()` / `listPlacards()`，並提供 create public info、publish、generate placard 等操作；對應後端 contract 也已存在（`apps/platform-admin-web/app/switchboard/page.tsx:83-201`; `apps/api/src/modules/platform-admin/platform-admin.controller.ts:20-69`）。

**任務：** 改成 capability audit：確認 UI 是否覆蓋 public info versioning / placard lifecycle 的必要操作、是否缺少 smoke path、是否有 hidden gap 或資料一致性問題

**預估規模：** XS（< 1 小時）

---

### E-2：ops-console SOS/Critical Incident 優先佇列（GAP-P2S3-002）

**現況：** ops-console 的 incidents 頁面有清單，但沒有根據 `severity=critical` 過濾的優先視圖

**需要：** Incident 清單頂端加「Critical / SOS」區塊，自動篩選 severity=critical

**預估規模：** S（~60 LOC 前端）

**依賴：** GAP-P2S1-001（SOS 畫面）已完成 ✅

---

## 7. 領域 F：Settlement 與 Feature Gate

### F-1：DB Migration V0020 + per-driver settlement query（GAP-P2S3-006）

**需要：**

```sql
CREATE INDEX IF NOT EXISTS idx_phase1_dispatch_jobs_driver
  ON ops.phase1_dispatch_jobs (driver_id, completed_at DESC);
```

本輪 repo 檢查顯示 `billing-settlement.repository.ts` 已經有 `listLiveDriverTripsInPeriod(periodStart, periodEnd)`；Sprint 3 不需要再把這個 query 當成新功能重做。

**注意：**

- GAP-P2S1-003 的功能已經落在 repo 內，但 shared blocker 顯示它被 GAP-P2S1-009 的重構重疊卡住正式 closeout
- 因此 F-1 應縮成 index-only / performance slice，並放在 billing-settlement surface 穩定後再 review

**預估規模：** XS-S（偏向純 SQL）

---

### F-2：forwarder platform code registry + service bucket enum（GAP-P2S3-007）

**需要：**

- contracts 增加 platform code registry（Grab、Uber、InDriver 等）
- `ServiceBucket` enum 擴展
- ForwarderAdapter 用 platform code 做路由

**依賴：** B-1（ForwarderAdapterInterface）

**預估規模：** S（~60 LOC）

---

### F-3：@FeatureGated decorator + NestJS guard（GAP-P2S3-005）

**現況：** Feature flags 已有 service（`feature-flags.service.ts`），但沒有 decorator-level enforcement

**需要：**

```typescript
@FeatureGated('grab_taiwan_integration')
@Get('grab/webhook')
handleGrabWebhook() { ... }
```

**預估規模：** M（~80 LOC）

---

## 8. 領域 G：tenant-commute-hub（Lovable Repo）前端清理與串接

### G-1：Supabase edge functions 刪除

**現況：**
`supabase/functions/` 下有 6 個 edge function：

- `calculate-price`
- `generate-report`
- `seed-demo-data`
- `seed-test-user`
- `send-notification`
- `webhook-trigger`

src 已無引用，全為殘留。**直接刪除**，無 regression 風險。

**補充：** 刪除 edge functions 與修正 tenant-commute-hub build portability 是兩件事。即便 G-1 安全，`vite.config.ts` 仍透過本機相對路徑 alias 到 `../drts-fleet-platform/packages/...`，這個 CI/CD 風險需另列 open question。

**預估規模：** XS（< 30 分鐘）

---

### G-2：WebhookManagement.tsx 真實投遞狀態顯示

**現況：**
`src/pages/WebhookManagement.tsx:233` toast 訊息：

```
`Test webhook queued with status ${result.httpStatus} and delivery ${result.deliveryId ?? "n/a"}.`
```

但 `result.httpStatus` 依賴後端真正 dispatch（GAP-P2S1-013 已完成），只要後端回傳真實 HTTP status code，前端邏輯即可正確顯示

**Round 1 結論：** backend 的 `sendTestWebhook` 已直接回傳 `deliveryId`、`httpStatus`、`attempt`、`nextAttemptAt`，所以這裡不是 contract 未更新，而是要做一次前後端 smoke 驗證，確認 tenant-commute-hub 沒有自行假設舊格式（`apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1072-1139`; `/home/edna/workspace/tenant-commute-hub/src/pages/WebhookManagement.tsx:223-233`）。

**預估規模：** XS（smoke 驗證 + 若需要 UI 調整 ~20 LOC）

---

### G-3：settings.tsx → driver-profile API 串接（GAP-P2S3-008）

**現況：**
`apps/driver-app/app/settings.tsx` 用 `getDriverSettings("driver-demo-001")` 只管 App 偏好，沒有個人資料區塊

**需要：**

- Settings 畫面增加「個人資料」區塊
- 呼叫 `GET /api/driver-profile/:driverId`（GAP-P2S1-004-API）
- 呼叫 `PUT /api/driver-profile/:driverId`（更新姓名、電話、緊急聯絡人）

**依賴：** GAP-P2S1-004-API（進行中）

**預估規模：** S（~80 LOC）

---

## 9. 依賴圖

```
A-0 driver-app capability bootstrap
    ├── A-1 proof bundle
    ├── A-2 Expo Location metrics
    └── A-5 GPS heartbeat sender

V0019 migration (A-3)
    └── regulatory-registry heartbeat endpoint (A-4)
            ├── driver-app GPS sender (A-5)
            └── ops-console SSE board (C-2)  ← 也依賴 C-1

ForwarderAdapterInterface (B-1)
    └── platform code registry (F-2)

@FeatureGated guard (F-3)
    └── 可直接套用到 forwarder / partner / future-gated routes，與 F-2 平行

SSE task events endpoint (C-1)
    └── ops-console SSE board (C-2)

GAP-P2S1-004-API [進行中]
    └── driver-profile settings (G-3 / GAP-P2S3-008)

GAP-P2S1-009 stabilization
    └── V0020 settlement index (F-1)

以下可完全平行：
- B-1 ForwarderAdapterInterface
- C-1 SSE task events
- E-1 Switchboard capability audit
- E-2 SOS priority queue（前端）
- G-1 Supabase 刪除
- G-2 WebhookManagement smoke 驗證
- D-1 Cloud IAP 規劃（但實作依賴外部 GCP provisioning）
```

---

## 10. 建議 Sprint 劃分（修訂版）

### Sprint 2（目標：即時功能 + GPS + proof bundle）

| Task ID      | 標題                                           | Owner  | 規模 |
| ------------ | ---------------------------------------------- | ------ | ---- |
| A-0 (new)    | driver-app media/location capability bootstrap | Qwen   | S    |
| GAP-P2S2-003 | V0019 driver_locations migration               | Gemini | S    |
| GAP-P2S2-004 | regulatory-registry heartbeat + haversine      | Qwen   | M    |
| GAP-P2S2-001 | driver-app proof bundle                        | Qwen   | M    |
| GAP-P2S2-002 | driver-app Expo Location metrics               | Qwen   | M    |
| GAP-P2S2-005 | driver-app GPS heartbeat sender                | Qwen   | M    |
| GAP-P2S2-006 | ForwarderAdapterInterface + Grab stub          | Codex  | M    |
| GAP-P2S2-007 | NestJS SSE task events                         | Qwen   | M    |
| GAP-P2S2-008 | Switchboard capability audit                   | Codex  | XS   |
| G-1          | tenant-commute-hub: 刪 Supabase functions      | Codex  | XS   |
| G-2          | tenant-commute-hub: Webhook smoke 驗證         | Codex  | XS   |

### Sprint 3（目標：Auth、Feature Gate、SOS queue、real-time 收尾）

| Task ID      | 標題                                 | Owner  | 規模 |
| ------------ | ------------------------------------ | ------ | ---- |
| GAP-P2S3-002 | ops-console SOS priority queue       | Qwen   | S    |
| GAP-P2S3-004 | ops-console SSE dispatch board       | Qwen   | M    |
| GAP-P2S3-005 | @FeatureGated decorator              | Codex  | M    |
| GAP-P2S3-006 | V0020 settlement index（index-only） | Gemini | XS-S |
| GAP-P2S3-007 | forwarder platform registry          | Codex  | S    |
| GAP-P2S3-008 | driver-app settings → profile API    | Qwen   | S    |
| GAP-P2S3-001 | Cloud IAP / OIDC auth                | Gemini | XL   |
| GAP-P2S3-003 | regulatory-registry real-time ETA    | Qwen   | M    |

**Owner risk note：** shared status 目前仍標記 Qwen blocked，因此 Sprint 2 內由 Qwen 承接的 A-0/A-1/A-2/A-4/A-5/C-1 需要在 Round 2 明確確認 token 恢復；若未恢復，需先重排 owner（`ai-status.json:160-170`; `current-work.md:43-45`）。

---

## 11. 開放問題（需在 Review 中解決）

1. **A-1/A-0 決策**：Phase 2 要如何產生 `CompletionProofBundle.photoIds`？是新增輕量 upload/file-id issuance path，還是有既有 file service 可重用？本輪不建議直接改 contracts 結構。
2. **D-1 timing**：Cloud IAP 需要 GCP Console、IAM、secret/vars provisioning；是否先拆成人工 / infra 前置票，再排 repo 內 JWT 驗證實作？
3. **Qwen lane 可用性**：Qwen 目前在 shared status 仍為 blocked，Sprint 2 大量任務標給 Qwen 是否需要先確認 token 恢復，或直接重新分配？
4. **tenant-commute-hub 建置**：目前 Vite alias 指向本機路徑 `../drts-fleet-platform/packages/api-client/src/index.ts` / `packages/contracts/src/index.ts`，CI/CD 環境如何保證可建置？
5. **GAP-P2S2-006（Grab Taiwan）**：需要外部 API 憑證，stub 可先完成，但真正整合的 credential 何時可取得？

---

## 12. 不在本次規劃範圍

- Passenger App / Web（future-gated，另立 roadmap）
- Call Point / Concierge Portal（future-gated）
- Tesla Fleet integration（future-gated）
- Energy / Charging Scheduler（future-gated）
