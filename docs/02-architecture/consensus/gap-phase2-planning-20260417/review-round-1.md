# Review Round 1 — Codex

**Reviewer：** Codex  
**焦點：** contracts 完整性、schema / 依賴鏈正確性、範圍修正  
**接棒時間：** 2026-04-17T14:33:25Z  
**工作模式：** planning-only；共享 L0 仍將本 workspace 鎖在 `discussion_planning`，目前 baton owner 仍是 Codex，且只有在 human accept 後才會切回 execution，因此本 round 僅修正文檔與規劃，不進入實作或提交（`ai-status.json:3,68-105`; `current-work.md:26-35`; `ai-activity-log.jsonl` at `2026-04-17T14:33:25Z`; `docs-site/index.html:40-55`）。

---

## 0. Baton State Sanity Check

- 共享 L0 目前仍以 `discussion_planning` 運作，`discussion_loop.current_owner` 是 Codex，review order 仍是 Codex → Qwen → Gemini → Copilot；也就是說，目前 canonical baton 還停在 R1，而不是後續 round 或 execution（`ai-status.json:3,68-105`; `current-work.md:26-35`; `docs-site/index.html:40-55`）。
- `ai-activity-log.jsonl` 對這次 planning baton 的唯一 shared wake-up 事件是 Codex 在 `2026-04-17T14:33:25Z` 被喚醒處理 `starter-draft.md`；共享狀態裡還沒有對 Qwen / Gemini / Copilot 的正式交棒紀錄（`ai-activity-log.jsonl` at `2026-04-17T14:33:25Z`; `current-work.md:32-35`）。
- `ai-activity-log.jsonl` 在 `2026-04-17T14:42:36Z`、`14:49:39Z`、`14:53:18Z`、`14:56:38Z` 又連續記錄了 Codex planning worker 的 `worker_failed` / `worker_started` retry，但這些都只是同一個 R1 dispatch 的重送；shared L0 並沒有因此前移 baton owner 或新增任何 Qwen handoff 事件（`ai-activity-log.jsonl` at `2026-04-17T14:42:36Z`, `2026-04-17T14:49:39Z`, `2026-04-17T14:53:18Z`, `2026-04-17T14:56:38Z`; `ai-status.json:93-105`; `current-work.md:26-35`）。
- 但工作區內已有 ahead-of-state artifact：`baton-log.md` 已把 R1 標為完成，而 `review-round-2.md`、`review-round-3.md`、`review-round-4.md` 的「接棒時間」分別寫成 `2026-04-17T13:30:00Z`、`13:40:00Z`、`13:50:00Z`，都早於 Codex 的 canonical wake-up；`consensus-packet.md` 也已經以「4 輪 review 後」口吻起草（`baton-log.md:5-10`; `review-round-2.md:3-5`; `review-round-3.md:3-5`; `review-round-4.md:3-5`; `consensus-packet.md:3-20`）。

**R1 解讀規則：** 這些後續 round / 仲裁稿目前只能視為提案輸入，不能覆蓋共享 L0 的 baton 狀態；在 `discussion_loop.current_owner` 尚未從 Codex 前移前，`review-round-1.md` 仍是本輪 active planning artifact 的 canonical contract / dependency checkpoint。

---

## Round 1 結論

`starter-draft.md` 已吸收一部分 R1 的 contract / dependency 修正，但還沒有完全收斂。已被正確寫回的部分包含：

1. A-0 被提升成 A-1 / A-2 / A-5 的共同 capability bootstrap，而不是單一 UI patch（`starter-draft.md:45-59`）。
2. B-1 被校正成 forwarder runtime seam，而不是「從零建立 platform routing」（`starter-draft.md:148-159`）。
3. G-2 已改寫成 consumer-side smoke / UI verification，而不是懷疑後端 payload 是否已更新（`starter-draft.md:306-317`; `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1072-1139`; `/home/edna/workspace/tenant-commute-hub/src/pages/WebhookManagement.tsx:215-233`）。
4. D-1 已被標示為外部阻塞，不是單純 repo 內 code slice（`starter-draft.md:193-209`; `current-work.md:117-118`）。
5. E-1 已改寫成 capability audit，而不是把 switchboard 當作空殼 stub（`starter-draft.md:215-223`; `apps/platform-admin-web/app/switchboard/page.tsx:64-214`; `apps/api/src/modules/platform-admin/platform-admin.controller.ts:18-78`）。

但目前至少還有 7 個不能被後續 round 或仲裁稿覆寫的 guardrails：

1. **A-1 proof bundle 不能在沒有重新仲裁的前提下，從既有 `photoIds` / `attachmentId` 語義默默改成 inline base64。**
2. **A-0 / Sprint 2 PREP 不能只安裝 `expo-image-picker` 與 `expo-location`；若 A-1/A-2/A-5 共享前置成立，至少還要明示 `expo-task-manager` 與 attachment-id issuance strategy。**
3. **F-1 / GAP-P2S3-006 不能預設被壓縮成純 index；若 canonical backlog 仍要求 per-driver settlement trip query，packet 必須保留這個差異。**
4. **`G-3` 這個 shorthand 目前在不同 artifact 被拿來指兩個不同問題；在 human accept 前，`GAP-P2S3-008` 仍應專指 driver-app settings → driver-profile API，不應被 tenant-commute-hub CI/CD portability 佔用。**
5. **owner 重分配與 Cloud IAP 執行前置目前都只能算 packet proposal，不能覆蓋 discussion-planning 階段的共享 canonical 任務板。**
6. **C-1 / C-2 不能預設 web `EventSource` 能帶 `x-drts-internal-key` custom headers；SSE auth 邊界仍待規劃定案。**
7. **tenant-commute-hub build portability 不能靠 vendored `@drts/api-client` / `@drts/contracts` stub 解決，否則會建立第二份 contract truth。**

本 R1 artifact 的用途，因而不是重寫 starter draft，而是保留這些**不可回退的 contract / dependency guardrails**，避免後續 review 或仲裁稿把已修正的假設重新寫錯。

---

## 1. Contracts / Schema 校正

### 1.1 A-1 proof bundle：contracts 已齊，但附件取得機制仍是前置缺口

**已確認存在：**

- `CompletionProofBundle.photoIds: string[]` 與 `CompletionExpenseItem.attachmentId: string` 已在 contracts 定義完成（`packages/contracts/src/index.ts:467-476`）。
- `DriverCompleteTaskCommand.proof?: CompletionProofBundle` 已存在（`packages/contracts/src/index.ts:609-614`）。
- 後端 `completeDriverTask()` 目前只做 proof id 數量與 signoff 驗證，直接消費 `photoIds` / `expenseItems`，不處理 raw bytes（`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1666-1707`）。
- `apps/driver-app/package.json` 目前也還沒有 `expo-image-picker`、`expo-location`、`expo-task-manager` 等依賴，表示 proof capture、距離/時間追蹤、GPS heartbeat 都仍有共同 capability setup 成本（`apps/driver-app/package.json:15-35`）。

**規劃修正：**

- A-1 本身不用再改 contracts。
- 若後續有人主張「base64 內嵌 proof」，那不是小修，而是**改變 `photoIds` / `attachmentId` 的語義**。這會直接影響 contracts、task record 儲存格式，以及後續審計/檔案治理。
- 因此 A-0 不應只是 package install checklist，而應明確包含 `proof artifact acquisition + attachment-id issuance strategy`。

**R1 建議：**

1. 保留 starter draft 目前的「A-0 是共用前置」方向。
2. 不要在 planning loop 內偷渡 `CompletionProofBundle` 的 schema change。
3. 若要改 raw payload，應升級成明確的 contracts 變更決策，而不是放在 app-side implementation 描述中帶過。

### 1.2 B-1 / F-2：platformCode 已存在，但 registry 還沒被型別收斂

**已確認存在：**

- `ServiceBucket` 目前只有 `"standard_taxi" | "business_dispatch" | "av_pilot"`（`packages/contracts/src/index.ts:4-18`）。
- forwarder contracts 與 records 已普遍帶 `platformCode: string`，但仍是 free-form string，沒有 registry / enum（`packages/contracts/src/index.ts:1499-1536`）。
- `ForwarderService` 目前也確實已用 `platformCode` 寫 mirror order 與 adapter health state，不是零基礎（`apps/api/src/modules/forwarder/forwarder.service.ts:67-108`）。

**規劃修正：**

- `GAP-P2S2-006` 可以維持為 runtime refactor：抽 `ForwarderAdapterInterface`、加 `GrabTaiwanAdapter` stub，不必先碰 contracts。
- `GAP-P2S3-007` 若保留「platform code registry + service bucket enum expansion」，就仍是**後續的 contracts hardening / routing catalog task**，不能在 B-1 被完成時一併視為 done。

**R1 建議：**

- 在 consensus packet 中把兩個任務拆清楚：
  - `P2S2-006`: runtime adapter seam
  - `P2S3-007`: typed registry / platform capability catalog

### 1.3 F-1 / GAP-P2S3-006：不能預設只剩 index

**已確認存在：**

- canonical shared board 仍把 `GAP-P2S3-006` 寫成 `V0020__settlement_driver_index.sql + per-driver settlement trip query`，不是單純 migration（`current-work.md:68,100`）。
- `BillingSettlementRepository.listLiveDriverTripsInPeriod()` 已存在，但只接受 `periodStart, periodEnd`，**沒有 `driverId` 參數**（`apps/api/src/modules/billing-settlement/billing-settlement.repository.ts:206-230`）。
- service 端目前也是用它做全月全司機掃描，再在記憶體層面映射 statement trip snapshots（`apps/api/src/modules/billing-settlement/billing-settlement.service.ts:996-1010`）。

**規劃修正：**

- 我不同意把 `GAP-P2S3-006` 直接降成「純 index」作為唯一解。
- 比較精確的說法應是：它與 `GAP-P2S1-003` **部分重疊**；如果 Sprint 3 目標仍是 canonical board 上寫的「per-driver settlement trip query」，那 repo 目前還缺一個真正帶 `driverId` predicate 的查詢路徑。

**R1 建議：**

1. packet 至少保留兩種落地版本的區分：
   - `index-only`
   - `index + driver-scoped query`
2. 尺寸評估應同步區分：
   - index only：XS
   - index + query signature / SQL filter：S

---

## 2. API Surface / Dependency 校正

### 2.1 G-3 driver profile：starter draft 仍未完全校正

**已確認存在：**

- 後端 controller 是 `@Controller("driver/profile")`，提供 `GET / POST / PATCH /api/driver/profile`，且 driver identity 來自 `@CurrentIdentity()`，不是 path param（`apps/api/src/modules/driver-profile/driver-profile.controller.ts:14-59`）。
- API client 也已對應 `getDriverProfile() / createDriverProfile() / updateDriverProfile()`，路徑同樣是 `/api/driver/profile`（`packages/api-client/src/index.ts:1161-1178`）。
- 目前 `settings.tsx` 還只打 `getDriverSettings("driver-demo-001")` / `updateDriverSettings("driver-demo-001", ...)`（`apps/driver-app/app/settings.tsx:25-54`）。
- 但 starter draft 的 G-3 段落仍寫成 path-param 風格的 `GET /api/driver-profile/:driverId` 與 `PUT /api/driver-profile/:driverId`（`starter-draft.md:321-333`）。

**規劃修正：**

- `GAP-P2S3-008` 不應描述成新增 driver-profile route。
- 正確任務是：
  - settings 畫面新增 profile 區塊；
  - 優先呼叫 `getDriverProfile()` / `updateDriverProfile()`；
  - 如 profile 尚未建立，再視 UX 決定是否先走 `createDriverProfile()`。

**結論：**

- G-3 在 starter draft 內**尚未完全吸收 R1 修正**；後續 round 與仲裁稿應以 repo 既有 `/api/driver/profile` identity flow 為準。

### 2.2 G-2 webhook 測試狀態：API 格式已定，剩 UI / consumer 驗證

**已確認存在：**

- `sendTestWebhook()` 已同步 `dispatchWebhookAttempt()`，並直接回傳 `{ deliveryId, httpStatus, attempt, nextAttemptAt }`（`apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1072-1139`）。
- tenant-commute-hub 的 `WebhookManagement.tsx` 目前也已直接讀取 `httpStatus` / `deliveryId` 來組 toast（`/home/edna/workspace/tenant-commute-hub/src/pages/WebhookManagement.tsx:215-233`）。

**規劃修正：**

- `G-2` 不應再把「後端是否回真實 httpStatus」當成開放問題。
- 後續 review 應聚焦：
  - 前端是否正確 unwrap API envelope；
  - `attempt` / `nextAttemptAt` 是否需要顯示；
  - 前後端 smoke 是否能在相同 tenant webhook 狀態上對齊。

### 2.3 `G-3` shorthand 已經出現跨 artifact 指涉衝突

**已確認存在：**

- starter draft 的 `G-3` 是 `settings.tsx → driver-profile API`，且它對應 canonical backlog `GAP-P2S3-008`（`starter-draft.md:321-333`; `current-work.md:70,102`）。
- 但 consensus packet 內的 `G-3` 已被改寫成 tenant-commute-hub 的 `CI/CD multi-repo checkout`（`consensus-packet.md:16,47-49,93`）。

**為什麼這是問題：**

- 這會讓 reviewer 與後續執行者無法判斷 `G-3` 到底是在講 driver-app settings integration，還是在講 tenant-commute-hub build portability。
- 它也會破壞既有 dependency 鏈：canonical shared board 明確把 `GAP-P2S3-008` 綁在 `GAP-P2S1-004-API` 上，這不是 tenant-commute-hub CI/CD 問題（`current-work.md:70,102`）。

**R1 建議：**

1. 保留 `GAP-P2S3-008 = settings.tsx → driver-profile API`。
2. tenant-commute-hub 的 build portability / multi-repo checkout 應另立新 label / task id，不應重用 `G-3`。

### 2.4 C-1 / C-2 的 SSE auth 仍是未定 dependency

**已確認存在：**

- Qwen R2 提議在前端直接使用 `new EventSource('/api/ops/dispatch-events', { headers: { 'x-drts-internal-key': ... } })` 來建立 SSE 連線（`review-round-2.md:79-90`）。
- Gemini R3 也同步把「SSE endpoint 需要跳過 `x-drts-internal-key` middleware，或在連線建立時一次性驗證」列為實作注意點，代表 auth boundary 仍未定案（`review-round-3.md:24-44`）。

**規劃修正：**

- `EventSource` custom headers 目前不能被當成已定義好的 web contract；Qwen R2 的 code sketch 只能視為方向性提案，不是可直接實作的介面約束。
- 因此 C-1 / C-2 若要進 execution，packet 需另外明示 auth model，例如：same-origin session/cookie、signed query token、或由 server-side proxy 轉接到 internal SSE。
- reconnect policy 與 multi-instance 行為也應放進 acceptance，不能只在後續實作時臨場補。

**R1 建議：**

1. C-1 / C-2 的 acceptance 文字應顯式包含 `auth boundary + reconnect policy + single-instance assumption`。
2. 在 auth path 未寫清楚前，不要把 `x-drts-internal-key` header 視為 web client 的既定方案。

---

## 3. 其他確認

### 3.1 C-1 / C-2 / A-4 目前仍是 net-new 能力

- `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts` 目前沒有 `driver-location` / `driver-eta` 路由（`apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts:18-206`）。
- repo 搜尋目前也找不到既有 `@Sse()`、`EventSource`、`task-events`、`dispatch-events` 實作，因此 starter draft 把 SSE 與 driver-location 列成 Sprint 2/3 新任務，方向上是對的。

### 3.2 A-1 / A-2 現況仍是硬碼完成

`trip.tsx` 在完成任務時仍直接送 `actualDistanceKm: 0` / `actualDurationSec: 0`，也沒有帶 proof（`apps/driver-app/app/trip.tsx:66-90`）。  
因此 A-1 與 A-2 仍是明確 backlog，不是文檔幻影。

### 3.3 tenant-commute-hub build portability 仍是獨立風險，不該與 driver-profile 串接混成同一票

- `vite.config.ts` 目前仍直接 alias 到本機相對路徑 `../drts-fleet-platform/packages/...`，這是 build portability / CI packaging 風險（`/home/edna/workspace/tenant-commute-hub/vite.config.ts:16-27`）。
- 這個風險與 `GAP-P2S3-008` 的 driver-profile API 串接是兩個不同 dependency graph，不能共用同一個 shorthand label。

### 3.4 tenant-commute-hub portability 修正不應複製 canonical client/contracts

- Copilot R4 建議在 `tenant-commute-hub/src/lib/` 放一份精簡版 `@drts/api-client` stub，讓 Lovable cloud build 可以通過（`review-round-4.md:65-77`）。
- 但目前 tenant repo 之所以能與主 repo 對齊，是因為 Vite alias 直接指向 canonical `@drts/api-client` / `@drts/contracts` source；若改成手工 vendored stub，就會把 portability 問題轉換成第二份 client/contracts truth 的維護問題（`/home/edna/workspace/tenant-commute-hub/vite.config.ts:16-27`）。

**R1 結論：**

- 我同意 portability / Lovable preview failure 是真風險，也同意它應在規劃中獨立列項。
- 但我不同意用手工 stub copy 當仲裁預設解；這應優先被建模成 package distribution / multi-repo checkout / build packaging 問題，而不是 contracts duplication 問題。

---

## 4. 建議回寫到 Starter Draft / 仲裁稿 的修正清單

| 項目                                    | Codex 修正                                                                                         | 理由                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A-1 proof bundle                        | 保留 contracts 不變；新增 A-0「attachment-id issuance strategy」                                   | 現況 proof 只接受 ids，不接受 raw payload               |
| A-0 / Sprint 2 PREP                     | 至少寫出 `expo-image-picker`、`expo-location`、`expo-task-manager` + permission / background model | A-1/A-2/A-5 是共同 capability bootstrap                 |
| B-1                                     | 維持 runtime adapter seam                                                                          | `platformCode` 已存在於 forwarder contracts / state     |
| F-1 / P2S3-006                          | 改成「index-only vs index + driver-scoped query」二分                                              | canonical backlog 還保留 per-driver query               |
| G-2                                     | 改成 UI / consumer 驗證                                                                            | 後端已回真實 `httpStatus` / `attempt` / `nextAttemptAt` |
| G-3 / P2S3-008                          | 改成 `/api/driver/profile` identity flow                                                           | 現有 controller / api-client 已定案                     |
| C-1 / C-2 auth                          | 不要假設 `EventSource` 可帶 custom headers；另列 SSE auth boundary                                 | Qwen R2 的 sketch 不是可直接執行的 web contract         |
| tenant-commute-hub build portability    | 另立新 label / task id，不要重用 `G-3`                                                             | 否則會與 `GAP-P2S3-008` 混淆                            |
| tenant-commute-hub portability 修正形狀 | 優先 package distribution / multi-repo checkout，不要 vendored stub                                | 否則會建立第二份 contracts truth                        |
| D-1                                     | 顯式拆出 `D-0 provisioning` 與 `D-1 repo auth`                                                     | shared blocker 已證明這不是 repo-only slice             |

---

## 5. Post-R1 Downstream Drift Check

### 5.0 下游 round 與仲裁稿目前仍屬 ahead-of-state prewrite

- 共享 L0 仍把 R1 視為 in-progress，current baton owner 仍是 Codex（`ai-status.json:93-105`; `current-work.md:26-35`）。
- `review-round-2.md`、`review-round-3.md`、`review-round-4.md` 雖已存在，但它們的接棒時間都早於 Codex 的 canonical wake-up，與共享 baton 順序不一致（`review-round-2.md:3-5`; `review-round-3.md:3-5`; `review-round-4.md:3-5`; `ai-activity-log.jsonl` at `2026-04-17T14:33:25Z`）。
- 因此這些檔案與 `consensus-packet.md` 的內容只能當作「待仲裁提案」，不能直接視為已完成的 review 結果或已生效的 execution 改派。

**R1 guardrail：** 後續 round 若要沿用這些 prewrite 內容，必須先與共享 canonical baton 狀態對齊，再逐項處理下列 drift。

### 5.1 Qwen R2 與 Gemini R3 對 A-1 acquisition strategy 仍互斥

- Qwen R2 主張新增 `GAP-P2S2-009`，以 `POST /api/media/upload` 或 presigned upload 作為 `photoId` 來源，維持 `CompletionProofBundle.photoIds` 模式（`review-round-2.md:9-35`）。
- Gemini R3 則直接取消 `GAP-P2S2-009`，並把 A-1 改寫成 `CompletionProofBundle.photos: string[]` 的 base64 contract 變更（`review-round-3.md:47-91`）。
- 這兩個提案處理的是同一個 A-0/A-1 前置缺口，但它們對 API surface、contracts、儲存語義的影響完全不同。

**R1 guardrail：** 在仲裁前，R1 只確認「A-0 需要 attachment acquisition / issuance strategy」，不接受把 `GAP-P2S2-009` 視為既定 backlog，也不接受把 base64 schema change 視為既定結論。

### 5.2 A-1 在仲裁稿中已重新漂回 base64 contracts 方案

- `consensus-packet.md` 目前把 A-1 寫成 `CompletionProofBundle.photos: string[]` 的 base64 contract 變更，且把 Sprint 2 PREP 縮成只安裝 `expo-image-picker + expo-location`（`consensus-packet.md:13-14,30,38-40,69-73`）。
- 這和 repo 現況不一致：contracts 仍是 `photoIds` / `attachmentId`，後端 `completeDriverTask()` 也是只驗證 proof ids 與 signoff，不處理 raw payload（`packages/contracts/src/index.ts:467-476,609-614`; `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1666-1707`）。
- driver app 目前也尚未具備 `expo-task-manager` 等背景定位依賴，因此若要把 A-1/A-2/A-5 視為共同前置，PREP 不能只寫 image-picker/location（`apps/driver-app/package.json:15-35`）。

**R1 guardrail：** 除非後續 round 明確接受 contracts / persistence 語義變更，否則 A-1 應維持 `photoIds` / `attachmentId` 模式，並把 attachment-id issuance strategy 視為前置決策，而不是在 packet 內直接偷渡成 base64。

### 5.3 F-1 在仲裁稿中被過度壓縮成純 index

- shared canonical board 仍把 `GAP-P2S3-006` 定義成 `V0020__settlement_driver_index.sql + per-driver settlement trip query`（`current-work.md:68,100`）。
- repo 內現有 `listLiveDriverTripsInPeriod()` 仍只有 period filter，沒有 `driverId` predicate；service 端也還是先掃整段 period 再映射 statement trips（`apps/api/src/modules/billing-settlement/billing-settlement.repository.ts:206-230`; `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:996-1010`）。
- 但 `consensus-packet.md` 已把 `GAP-P2S3-006` 定義成「純 index，~10 LOC」（`consensus-packet.md:60,80`）。

**R1 guardrail：** 仲裁稿至少要保留 `index-only` 與 `index + driver-scoped query` 的區分；否則它會與共享 canonical backlog 脫鉤。

### 5.4 `G-3` 在仲裁稿中被改寫成另一個議題

- starter draft 與 canonical task board 都把 driver-profile settings integration 綁在 `GAP-P2S3-008`（`starter-draft.md:321-333`; `current-work.md:70,102`）。
- 但 consensus packet 已把 `G-3` 用來表示 tenant-commute-hub 的 CI/CD multi-repo checkout（`consensus-packet.md:16,47-49,93`）。

**R1 guardrail：** `G-3` 這個 shorthand 不應跨 artifact 指涉不同任務；若要保留 tenant-commute-hub build portability，請另立新 label / task id。

### 5.5 D-1 仍缺少顯式 D-0 provisioning split

- starter draft 已把 Cloud IAP / OIDC 任務標成外部阻塞，並建議拆成 `D-0: GCP/IAM/secret provisioning` 與 `D-1: repo 內 auth 實作`（`starter-draft.md:193-209`）。
- shared blocker 也已把缺失的 GCP vars/secrets 與 Cloud Run 權限不足寫成當前阻塞（`current-work.md:117-118`）。
- 但 consensus packet 目前只把 `GAP-P2S3-001` 註成「需人工 GCP Console 配合」，尚未把 provisioning 工作本身獨立成前置（`consensus-packet.md:18,63,112-114`）。

**R1 guardrail：** 若仲裁維持 D-1 進 Sprint 3，packet 應顯式保留外部 provisioning 前置，而不是只用一句「需人工配合」帶過。

### 5.6 owner 重分配目前仍是提案，不是 canonical execution truth

- shared canonical context 仍顯示專案處於 `discussion_planning`，目前 baton owner 是 Codex，review order 仍是 Codex → Qwen → Gemini → Copilot（`ai-status.json:68-105`; `current-work.md:26-35`; `docs-site/index.html:40-55`）。
- shared task board 也仍將多個 Sprint 2 / Sprint 3 任務掛在 Qwen 與 Gemini 名下（`current-work.md:55-70,87-102`）。
- 但 consensus packet 已先寫入「Qwen 任務全部重新分配」與新的 owner matrix（`consensus-packet.md:17,38-48,56-63`）。

**R1 guardrail：** 這些 owner 變更在 human accept 前只能視為 arbitration proposal；在 consensus 尚未被接受前，不應被後續 round 當成既成 execution truth。

### 5.7 可安全吸收的後續訊號 vs 仍待仲裁的提案

後續 prewrite 不是全部都要退回。R1 可以吸收那些**只提高優先級或補強風險描述、但不改寫既有 contract / task identity / shared board truth** 的部分；相對地，凡是會改 schema、重命名 canonical task、或提前改 owner 的內容，仍必須保留為待仲裁提案。

| 後續主張                                                                | R1 disposition                         | 依據                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 proof bundle 應升為 Sprint 2 P0 / UAT gate                          | **可吸收**                             | 這只提升優先級，不改 schema。canonical acceptance pack 已要求 signoff、expense proof、min photo count，且 driver app 目前仍直接以無 proof 完成任務（`phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md:231-249,353-357`; `apps/driver-app/app/trip.tsx:84-89`; `review-round-4.md:27-40`）。                                                              |
| G-2 webhook test status 已解決，不應再列為新 backlog                    | **可吸收**                             | Qwen R2 還把它當待確認事項，但 Copilot R4 與 repo 現況一致指出 `sendTestWebhook()` 已回真實 `httpStatus`；這裡只剩 smoke verification，不需要再起一張 Sprint 2 任務（`review-round-2.md:106-117`; `review-round-4.md:9-23`; `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1072-1139`; `/home/edna/workspace/tenant-commute-hub/src/pages/WebhookManagement.tsx:215-233`）。 |
| tenant-commute-hub build portability / Lovable preview failure 是真風險 | **可吸收，但必須另立 label / task id** | R3 與 R4 都指出 `vite.config.ts` 依賴 `../drts-fleet-platform` 相對路徑，這會讓雲端 preview / CI 環境失敗；R1 同意這是獨立 planning line item，但不同意重用 `G-3` shorthand（`review-round-3.md:121-149`; `review-round-4.md:65-77`; `/home/edna/workspace/tenant-commute-hub/vite.config.ts:16-27`; `consensus-packet.md:16,47-49,93`）。                                                   |
| D-1 / Cloud IAP 需要人工配合，且應視為 Sprint 3 前置門檻                | **可吸收，且應再強化成顯式前置**       | 這與 shared blocker 完全一致；R3/R4 只是把既有阻塞講清楚，並沒有改變 repo 內 contract（`current-work.md:117-118`; `review-round-3.md:95-117`; `review-round-4.md:90-99`; `consensus-packet.md:18,63,112-114`）。                                                                                                                                                                             |
| Qwen R2 新增 `GAP-P2S2-009` media upload endpoint                       | **不可直接吸收**                       | 這是新的 API surface，且它與 Gemini R3 的 base64 contracts 方案互斥；R1 目前只承認 A-0 需要 acquisition / issuance decision，尚未核准新的 upload 任務（`review-round-2.md:9-35`; `review-round-3.md:47-91`; `packages/contracts/src/index.ts:467-476,609-614`）。                                                                                                                            |
| A-1 直接改成 `CompletionProofBundle.photos: string[]` base64 contract   | **不可直接吸收**                       | 這會改寫現有 `photoIds` / `attachmentId` 語義，屬於 schema / persistence 決策，而不是單純優先級調整（`review-round-3.md:68-91`; `review-round-4.md:53-63`; `packages/contracts/src/index.ts:467-476,609-614`; `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1666-1707`）。                                                                                                  |
| C-1 / C-2 直接用 `EventSource(..., { headers })` 帶 internal key        | **不可直接吸收**                       | 這仍不是穩定的 web client contract；packet 需先補齊 SSE auth boundary，否則前後端依賴鏈不完整（`review-round-2.md:79-90`; `review-round-3.md:24-44`）。                                                                                                                                                                                                                                      |
| GAP-P2S3-006 可直接縮成純 index                                         | **不可直接吸收**                       | 這會把 canonical backlog 上的 `per-driver settlement trip query` 需求提前刪掉；若要這樣改，仲裁稿至少要明示 scope reduction，而不是默認消失（`current-work.md:68,100`; `review-round-3.md:23-27`; `consensus-packet.md:60`; `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts:206-230`）。                                                                           |
| 用 tenant repo vendored `@drts/api-client` stub 修 Lovable build        | **不可直接吸收**                       | 這會把 build portability 問題轉成第二份 client/contracts truth；若要保留 G-tenant-portability，應優先解 package distribution / checkout，而不是複製 canonical surface（`review-round-4.md:65-77`; `/home/edna/workspace/tenant-commute-hub/vite.config.ts:16-27`）。                                                                                                                         |

**R1 synthesis：** 後續 round 真正補強的是「A-1 urgency」「G-2 已解」「tenant-commute-hub portability 需獨立列項」「Cloud IAP 必須先過人工/環境門」，不是「可以直接改 proof schema」「可以覆寫 canonical task identity」「可以在 accept 前重排 owner」。

---

## 6. 傳棒與後續 round 建議

### 傳給 Qwen（Round 2）

請集中確認 4 件事：

1. A-0 / A-1 的 app-side acquisition flow：相片取得、attachment id 來源、proof UX 是否要拆兩步。
2. G-3 / `GAP-P2S3-008` 的 settings UI 方案：profile 不存在時的 create-vs-edit UX，且以 `/api/driver/profile` identity flow 為準。
3. C-1 / C-2 / A-4 / A-5 的前後端串接順序，尤其是 SSE 與 driver-location heartbeat 是否需要共用事件 / polling model。
4. tenant-commute-hub build portability 若要保留在本輪規劃，應另立新 label / task id，不要覆蓋 `G-3`。

### 傳給 Gemini（Round 3）預告

若 Qwen 或仲裁稿接受「driver-scoped query 仍未完成」這個前提，Gemini Round 3 應同步評估：

1. `V0020` index 是否足夠；
2. 是否需要把 `driver_id` filter 一併下推到 SQL，避免 driver statement 月結算做全表 period 掃描；
3. D-0 provisioning 需要哪些 GCP/IAM/secret 前置，才能讓 `GAP-P2S3-001` 從「人工配合」變成真正可執行的 repo task。

---

**Round 1 狀態：** artifact 已補強，且目前仍應視為 active baton checkpoint；是否正式傳棒給 Qwen，應先由 supervisor 將 shared L0 與下游 prewrite artifacts 對齊。  
**本輪未執行任何 implementation / commit。**
