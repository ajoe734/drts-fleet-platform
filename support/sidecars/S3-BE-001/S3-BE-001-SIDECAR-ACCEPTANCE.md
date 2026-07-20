# S3-BE-001 SIDECAR ACCEPTANCE

Status: review_approved
Owner: Gemini
Reviewer: Codex
Last Update: 2026-07-20

> Snapshot note: this packet mirrors the machine-truth lifecycle at the time of handoff (`review`, awaiting Codex). Authoritative state lives in `ai-status.json` for `S3-BE-001-SIDECAR-ACCEPTANCE`; treat this header as a derived summary only.

## 目的

為 S3-BE-001（S-3 driver SOS backend + incident correlation）準備非侵入式的 acceptance 支援包。本檔案整理驗收清單、依賴關係圖與驗收證據指標，**不修改任何 L1/L2 canonical truth**（保留主線合約、資料庫與 spec 定義）。Parent owner（Codex）負責 canonical 實作，本 sidecar 作為平行支援包。

Parent task: `S3-BE-001` — S-3 driver SOS backend + incident correlation (在 safety schema 上建立獨立 driver-sos 模組：server 端由 bearer 解 context，POST sos-events 冪等於 (driverId, clientEventId)，並交易式產生關聯 incident + timeline + 緊急告警 outbox)。
Parent dependency: `P5S3-FOUND-001` — P-5/S-3 foundation anchors (合約 TypeScript 類型定義與 V0051/V0052 地基 migration)。

## Canonical 來源 (read-only references)

本 acceptance 包依據以下主線文件與合約，僅作引用，不作修改：

- 產品規格：`phase1_prd_detailed_v1.md` §`9.4.5 SOS & Incident Report`
- 系統分析：`phase1_system_analysis_v1.md` §`6.3 Driver App` / §`6.4 Host/OpCo/ROC 後台`
- 合約定義（基礎）：`packages/contracts/src/phase1-p5-s3-multi-taxi.ts`
- 資料庫 Schema（基礎）：
  - `infra/migrations/V0051__p5_vehicle_disclosure_and_driver_credentials.sql`
  - `infra/migrations/V0052__s3_driver_sos.sql`

## Acceptance Checklist (deliverables)

- [x] Acceptance checklist (本檔)
- [x] Dependency map scoped to S3-BE-001
- [x] Support packet metadata 與 verification evidence
- [x] Handoff via `scripts/ai-status.sh` 給 reviewer Codex

### Verification steps (owner - Codex 主線，本 sidecar 由 Gemini 提供 packet)

1. 確認 canonical 寫入檔僅限於：
   - `apps/api/src/modules/driver-sos/`
   - `apps/api/src/modules/incident/incident.service.ts`
   - `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`
   - `apps/api/src/app.module.ts`
   - `apps/api/src/common/auth/auth.policy.ts`
   - `infra/migrations/V0053__s3_driver_sos_urgent_alert_outbox.sql`
2. 驗證 driver SOS 提交的權限控制與 Self-scoping（POST `driver/sos-events` 必須由 driver 角色 bearer 驗證並解出 context，不接受 client 任意上報的 driverId）。
3. 驗證 `clientEventId` 與 `driverId` 的聯手冪等性（Idempotency），重複送出時應直接回傳既有的 receipt 並標示為 duplicate。
4. 驗證交易邊界（SOS txn），確認一次成功提交會同時產生對應的 SOS event、Timeline 留痕（`sos_local_triggered`）、一個對應的 Incident、一個 Incident Timeline 以及一個 Urgent-Alert outbox 紀錄。
5. 驗證產生的事件編號 `event_no` 的唯一性（格式符合 `SOS-YYYYMMDDHHMMSS-<6 random hex>`）。
6. 確認沒有包含任何多平台/AV/ODD 等非 Phase 1 範圍欄位。
7. 執行驗證指令：
   - `pnpm --dir apps/api typecheck`
   - `pnpm --dir apps/api lint`
   - `pnpm --dir apps/api exec vitest run tests/unit/driver-sos-incident.test.ts tests/unit/driver-sos.service.test.ts tests/integration/int-s3-001-driver-sos-idempotency.test.ts`
   - `pnpm db:verify`
   - `pnpm check`

### Verification checklist (reviewer - Codex)

- 確認 driver SOS 邏輯（Controller、Service、Repository）能與 `P5S3-FOUND-001` 提供之 safety schema 順暢對接。
- 確認 idempotency (driverId, clientEventId) 重複上報處理邏輯無誤。
- 確認 outbox 實作（V0053 遷移與 repository 儲存）為 transactional 寫入。
- 確認 API 存取安全策略符合預期（排除 driver 直接 POST `incidents`，限制其只能呼叫專屬 `driver/sos-events`）。
- 通過時執行：
  ```bash
  AI_NAME=Codex scripts/ai-status.sh approve S3-BE-001-SIDECAR-ACCEPTANCE "Reviewed: S3-BE-001 acceptance packet complete and verified"
  ```

## S3-BE-001 Dependency Map

### Hard prerequisites

| 來源 | 內容 | 為什麼 S3-BE-001 需要 |
| --- | --- | --- |
| `P5S3-FOUND-001` (Foundation anchors) | 提供 TypeScript 類型定義、基礎 `safety` schema 與 `V0051`/`V0052` 資料庫遷移案。 | 提供 driver-sos 所需的資料結構宣告與底層資料庫資料表（`safety.driver_sos_events`、`safety.driver_sos_timeline`）。 |

### Soft / co-evolving dependencies

| 來源 | 性質 | 註解 |
| --- | --- | --- |
| `apps/api/src/modules/incident/incident.service.ts` | 關聯 Incident 建立服務 | SOS 觸發時必須自動關聯建立恰好一筆 `Incident` 以供營運 ROC 後台追蹤，需呼叫 IncidentService 提供之 API。 |
| `apps/api/src/common/auth/auth.policy.ts` | API 存取控制政策 | 需註冊 `driver/sos-events` 的安全策略與 realm 要求，並收回原 driver 直接 POST `/incidents` 的權限以防越權。 |

### Out of scope (do NOT bundle into S3-BE-001)

- 自動駕駛（AV/FSD）接管日誌 or ODD 能力規則之整合。
- 派單引擎對 SOS 事件的即時迴避算法（由後續派單邏輯處理，S3-BE-001 僅透過 `matchingSuppression` 進行靜態標記）。
- 多平台轉送與鏡像機制（Mirroring/Forwarding）。

## Acceptance 對照（spec 條列 → 驗證指標）

| Spec 條列與驗收點 | 實作邏輯 / 證據 | 驗證指令與結果 |
| --- | --- | --- |
| **dedicated driver-sos module using safety.\* tables** | 實作 `DriverSosModule`、`DriverSosController`、`DriverSosService`、`DriverSosRepository`，使用 `safety.driver_sos_events`、`safety.driver_sos_timeline` 與 `safety.driver_sos_urgent_alert_outbox` 資料表。 | `tests/unit/driver-sos.service.test.ts` PASS |
| **server resolves context from bearer client-claimed ignored** | `DriverSosController` 通過 `@CurrentIdentity()` 注入身分認證資訊，`DriverSosService.requireDriverIdentity` 限制必須為 `driver` realm，並強行以 Token 中的 `actorId` 作為 event owner，忽略 client 傳送之 `driverId`。 | `tests/integration/int-s3-001-driver-sos-idempotency.test.ts` 與 E2E-017 腳本 Step 1.1 驗證。 |
| **POST sos-events idempotent on (driverId clientEventId)** | `DriverSosService` 緩存 `driverId:clientEventId` 映射。當重送相同 ID 時，回傳原 receipts 並將 `duplicate` 標記為 `true`。 | `tests/integration/int-s3-001-driver-sos-idempotency.test.ts` PASS |
| **SOS txn = exactly one correlated incident + timeline + urgent-alert outbox** | 寫入時包裹於單一交易區間，同時寫入一筆 `safety.driver_sos_events` 紀錄、一筆 `safety.driver_sos_timeline` 事件、一筆 correlated incident 紀錄、一筆 incident timeline、以及一筆 `safety.driver_sos_urgent_alert_outbox`。 | `tests/unit/driver-sos-incident.test.ts` PASS |
| **event_no unique** | 系統依據目前 timestamp 與 6 碼隨機 Hex 產生 `SOS-YYYYMMDDHHMMSS-XXXXXX` 格式的唯一 event_no。 | `driver-sos.service.test.ts` 驗證 `eventNo` 格式與唯一性。 |
| **no multi-platform/mirror/forwarded/AV fields** | 合約與 `V0053` outbox 欄位中，除 standard parameters（driverId、orderId、location、eventType 等）外，無 AV 或 ODD Takeover 欄位。 | 審閱 `V0053__s3_driver_sos_urgent_alert_outbox.sql` 無額外 AV/Takeover schema。 |
| **unit+integration+lint green** | 所有測試、類型檢查與 lint 指令皆處於 green 狀態。 | `pnpm --dir apps/api typecheck` PASS<br>`pnpm --dir apps/api lint` PASS<br>Vitest 測試全數通過。 |

## Support Packet 檔案清單

本 sidecar 提供的驗收輔助材料：

- `support/sidecars/S3-BE-001/S3-BE-001-SIDECAR-ACCEPTANCE.md` (本檔)

不提供 (屬於 canonical owner Codex 範圍)：

- 對產品主線程式碼 (`apps/api/*`、`packages/contracts/*`) 的修改 (本分支 `gemini/s3-be-001-sidecar-acceptance` 僅用於拉取驗收並放置本 packet，最終 PR 與 merge 由 parent task owner 執行)。

## Handoff / Evidence

- **Artifact Path**: `support/sidecars/S3-BE-001/S3-BE-001-SIDECAR-ACCEPTANCE.md`
- **Owner Action Log**:
  1. `AI_NAME=Gemini scripts/ai-status.sh start S3-BE-001-SIDECAR-ACCEPTANCE "Preparing S3-BE-001 acceptance packet: dependency map and support artifacts"`
  2. 合併 `origin/codex/s3-be-001` (commit `fc7ef225d9b3bd2d321233dc6c3c41cc29e03289`)，拉取 Codex 最新主線實作。
  3. 執行 TypeScript typecheck、linter 與 vitest 單元與整合測試，確認皆為綠燈。
  4. 執行 `pnpm db:verify`，確認安全 outbox schema 遷移及驗證全數通過。
  5. 撰寫本 sidecar 驗收報告並落盤。
  6. `AI_NAME=Gemini scripts/ai-status.sh handoff S3-BE-001-SIDECAR-ACCEPTANCE Codex "Acceptance packet ready: dependency map + spec-to-verification mapping; parent task implementation verified green."`

### Reviewer Approval (Codex)

通過時，請執行以下命令以標示 approval：

```bash
AI_NAME=Codex scripts/ai-status.sh approve S3-BE-001-SIDECAR-ACCEPTANCE "Reviewed: S3-BE-001 acceptance packet verified green"
```

不通過時，請執行：

```bash
AI_NAME=Codex scripts/ai-status.sh reopen S3-BE-001-SIDECAR-ACCEPTANCE "<Reason for rejection>"
```

---

Support artifact prepared by Gemini (infra/ops lane). Mainline implementation verified.
