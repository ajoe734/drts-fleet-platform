# DRV-UI-010 SIDECAR ACCEPTANCE

Status: in_progress
Owner: Claude2
Reviewer: Codex2
Last Update: 2026-05-08

> Snapshot note: this packet mirrors the machine-truth lifecycle of `DRV-UI-010-SIDECAR-ACCEPTANCE` at the time of authoring (`in_progress`, owner Claude2). Authoritative state lives in `ai-status.json`; this header is a derived summary only and will lag the real state once handoff/approval occurs.

## 目的

為 `DRV-UI-010`（Driver App Design QA And Android Verification Packet）準備非侵入式的 acceptance 支援包。本檔案僅整理：

1. parent task 的驗收清單與證據對照
2. 依賴的 DRV-UI-002 ~ DRV-UI-009 結果與其交付介面之 dependency map
3. 現有 sidecar 證據（screenshots / XML dumps / UI text snapshots）的索引

**不修改任何 canonical truth**：不動 L1 產品真相、L2 執行包、`packages/contracts/*`、`apps/driver-app/*` runtime、orchestrator runtime/registry、governance 規則或主線 spec 文件。Parent owner（Codex2）負責 canonical QA 紀錄；本 sidecar 為平行支援。

Parent task: `DRV-UI-010` — Driver App Design QA And Android Verification Packet（QA 對照設計稿、跑 typecheck/test、記錄 Android/emulator 視覺驗證）。

## Canonical 來源（read-only references）

本 acceptance 包以下列來源為依據，僅引用，不修改：

- 執行包：`docs/03-runbooks/driver-app-design-rebuild-execution-packet-20260507.md` §`DRV-UI-010`（lines 522–542）
- 設計來源（read reference）：`docs/05-ui/driver-app-design-20260507/`
  - `driver-screens-1.jsx`、`driver-screens-2.jsx`、`driver-screens-3.jsx`
  - `mgmt-screens.jsx`、`components.jsx`、`tokens.jsx`、`android-frame.jsx`
- Runtime（read reference，QA 對照目標，**不應在本 sidecar 內被修改**）：
  - `apps/driver-app/app/onboarding.tsx`
  - `apps/driver-app/app/index.tsx`
  - `apps/driver-app/app/jobs.tsx`
  - `apps/driver-app/app/trip.tsx`
  - `apps/driver-app/app/platform-presence.tsx`
  - `apps/driver-app/app/earnings.tsx`
  - `apps/driver-app/app/shift.tsx`
  - `apps/driver-app/app/incident.tsx`
  - `apps/driver-app/app/settings.tsx`
  - `apps/driver-app/components/ui/*`
  - `apps/driver-app/components/platform-task-badge.tsx`
  - `apps/driver-app/components/platform-status-card.tsx`
  - `apps/driver-app/components/route-display.tsx`
  - `apps/driver-app/components/earnings-by-platform.tsx`
  - `apps/driver-app/components/platform-binding.tsx`
- Tests（read reference）：`apps/driver-app/tests/unit/`

## Acceptance Checklist (deliverables, sidecar scope)

- [x] 整理 parent task 的 acceptance checklist 與驗證指令對照（本檔）
- [x] 為 DRV-UI-002 ~ DRV-UI-009 建立 scoped dependency map（artifact 與設計章節對應）
- [x] 索引 `support/sidecars/DRV-UI-010/` 既存 evidence（screenshots / XML / text snapshots）
- [x] 標示 sidecar 與 canonical 寫入邊界（明列哪些檔案不可動）
- [ ] 透過 `scripts/ai-status.sh` 將本 sidecar 任務交給 reviewer（Codex2）

> Sidecar 不負責執行 `pnpm typecheck`、`pnpm test`、Android 視覺驗證——那些屬 parent owner（Codex2）在 `DRV-UI-010` 主任務內的責任。本檔只標示證據要存放在哪、結果應該對照哪一條 spec。

## DRV-UI-010 Parent Acceptance（引用，不變更）

來自 `docs/03-runbooks/driver-app-design-rebuild-execution-packet-20260507.md`：

| 條目                                       | 條文                                    | 證據存放建議                                                          |
| ------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------- |
| `pnpm --filter @drts/driver-app typecheck` | parent owner 必須執行並回報通過         | 在 `DRV-UI-010` handoff message 中附上 PASS 摘要；不需另存 transcript |
| `pnpm --filter @drts/driver-app test`      | parent owner 必須執行並回報通過         | 同上；如有 fail，記在 parent task 的 `progress` 訊息                  |
| Visual verification packet filed           | 以截圖 / XML / 文字 snapshot 對照設計稿 | 已存在 `support/sidecars/DRV-UI-010/`（見下方 Evidence Index）        |

> 提醒：parent task 屬 canonical implementation slice（`task_class` 不是 sidecar）；它走一般 commit/push 規則，需要 `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH`。本 sidecar 走 `NO_COMMIT_REQUIRED=1` 路徑。

## DRV-UI-010 Dependency Map（scoped, 可驗證）

所有依賴在 `ai-status.json` 中均為 `done`，本表只彙整要在 QA 對照階段檢查的 surface。

### Hard prerequisites（每一條都是 QA 比對目標）

| 來源       | 標題                               | Canonical artifact                                                                                                            | 設計章節（read-only）                                                | QA 對照重點                                                   |
| ---------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| DRV-UI-002 | Provisioning And Workspace Rebuild | `apps/driver-app/app/onboarding.tsx`、`apps/driver-app/app/index.tsx`                                                         | `driver-screens-1.jsx`（onboarding / 工作台 hero、KPI、quick links） | test default 註冊碼路徑、降級訊息、下一步動作卡               |
| DRV-UI-003 | Unified Task Inbox Rebuild         | `apps/driver-app/app/jobs.tsx`、`apps/driver-app/components/platform-task-badge.tsx`                                          | `driver-screens-1.jsx` / `driver-screens-2.jsx`（任務收件匣）        | filter pills、owned vs forwarded 分區、sync failed 文案       |
| DRV-UI-004 | Trip Race Flow Rebuild             | `apps/driver-app/app/trip.tsx`、`apps/driver-app/components/route-display.tsx`、`apps/driver-app/lib/trip-workflow.ts`        | `driver-screens-2.jsx`（行程作業台）                                 | 自營 / 外部 / 等待 / 確認 / lost race / sync failed 狀態      |
| DRV-UI-005 | Platform Presence Rebuild          | `apps/driver-app/app/platform-presence.tsx`、`apps/driver-app/components/platform-status-card.tsx`                            | `driver-screens-2.jsx` / `mgmt-screens.jsx`（平台連線）              | DRTS / SRX / METR 卡、token / reauth / last sync / today 數字 |
| DRV-UI-006 | Earnings Rebuild                   | `apps/driver-app/app/earnings.tsx`、`apps/driver-app/components/earnings-by-platform.tsx`、`apps/driver-app/lib/money.ts`     | `driver-screens-3.jsx`（收入頁）                                     | 淨收入卡、平台分項、月結報表、money 格式                      |
| DRV-UI-007 | Shift Rebuild                      | `apps/driver-app/app/shift.tsx`                                                                                               | `driver-screens-3.jsx`（班次頁）                                     | 上班中卡、車輛 / 里程 / 地點、今日總結、下班打卡              |
| DRV-UI-008 | SOS Incident Rebuild               | `apps/driver-app/app/incident.tsx`、`apps/driver-app/tests/unit/incident-screen.test.ts`                                      | `driver-screens-3.jsx`（SOS）                                        | 情境分類、外部訂單情境、長按確認求援                          |
| DRV-UI-009 | Settings Rebuild                   | `apps/driver-app/app/settings.tsx`、`apps/driver-app/components/platform-binding.tsx`、`apps/driver-app/lib/settings-form.ts` | `mgmt-screens.jsx`（設定）                                           | 個人資料、平台綁定、偏好、緊急聯絡人、裝置資訊                |

### 共用基礎（read reference, 不在 DRV-UI-010 寫入範圍）

| 來源       | 內容                                                                                       | 為何相關                                                         |
| ---------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| DRV-UI-001 | Design Token And Primitive Rebuild — `apps/driver-app/components/ui/*`、tokens、primitives | QA 比對的視覺一致性、間距、色票、圓角、字體都要落在同一份 tokens |

### Out of scope（DO NOT bundle into DRV-UI-010 / 本 sidecar）

- 修改 `apps/driver-app/components/ui/*` tokens 或 primitives（需另案 DRV-UI-001 follow-up）。
- 重寫已 done 的 DRV-UI-002 ~ DRV-UI-009 任一螢幕邏輯（QA 發現 bug 應另案，不在 DRV-UI-010 順手改）。
- 觸及 multi-platform 系列（DRV-MP-_ / API-MP-_ / OPS-MP-\*）。
- 動 `docs/05-ui/driver-app-design-20260507/*` 設計來源檔（read-only reference）。
- 動 `docs/03-runbooks/driver-app-design-rebuild-execution-packet-20260507.md`（執行包）。
- 動 `packages/contracts/*`、`apps/api/*`、orchestrator runtime / registry / governance。

## Evidence Index（已存在於本 sidecar 目錄）

下列證據檔在 `support/sidecars/DRV-UI-010/` 中由 parent owner（Codex2）抓取，本 sidecar 不修改、只索引：

| 檔案                              | 類型                        | 對應螢幕                               | 對應依賴         |
| --------------------------------- | --------------------------- | -------------------------------------- | ---------------- |
| `onboarding.png`                  | Android emulator screenshot | onboarding（含降級狀態）               | DRV-UI-002       |
| `onboarding.xml`                  | UIAutomator XML dump        | onboarding                             | DRV-UI-002       |
| `current-screen.png`              | Android emulator screenshot | 工作台 / index 螢幕                    | DRV-UI-002       |
| `drv-ui-010-current.xml`          | UIAutomator XML dump        | 工作台 / index 螢幕                    | DRV-UI-002       |
| `jobs.png`、`jobs-screen.png`     | Android emulator screenshot | 任務收件匣                             | DRV-UI-003       |
| `jobs.xml`、`drv-ui-010-jobs.xml` | UIAutomator XML dump        | 任務收件匣                             | DRV-UI-003       |
| `trip.png`                        | Android emulator screenshot | 行程作業台（empty / sync failed 狀態） | DRV-UI-004       |
| `trip.xml`                        | UIAutomator XML dump        | 行程作業台                             | DRV-UI-004       |
| `earnings.png`                    | Android emulator screenshot | 收入頁                                 | DRV-UI-006       |
| `incident.png`                    | Android emulator screenshot | SOS                                    | DRV-UI-008       |
| `incident.xml`                    | UIAutomator XML dump        | SOS                                    | DRV-UI-008       |
| `ui-text-snapshots.md`            | 抽出的繁中 UI 文字          | onboarding、jobs、trip、incident       | DRV-UI-002/3/4/8 |

### Evidence gap（建議 parent owner 補拍）

下列依賴目前在本 sidecar 目錄中尚無對應的 PNG/XML 證據；建議 Codex2 在主任務 `DRV-UI-010` 收束前補上 emulator 截圖以完成 visual verification packet：

- DRV-UI-005 Platform Presence — `platform-presence` 畫面（DRTS/SRX/METR 卡）尚無獨立截圖。
- DRV-UI-007 Shift — `shift` 畫面（班次卡 / 今日總結 / 下班打卡）尚無獨立截圖。
- DRV-UI-009 Settings — `settings` 畫面（個人資料 / 綁定 / 偏好 / 緊急聯絡人 / 裝置資訊）尚無獨立截圖。

> 此為 sidecar 提示，不是 parent acceptance 失敗；parent owner 可選擇以 manual smoke note 取代或補拍截圖。

## Acceptance 對照（spec → 證據 → 驗證指令）

| Spec 條列                                  | 驗證點                                                | 證據位置                                                                             | 由誰執行                               |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| Compare implemented screens vs design      | 各螢幕視覺對照設計稿，記錄 delta                      | `support/sidecars/DRV-UI-010/*.png` 與 `docs/05-ui/driver-app-design-20260507/*.jsx` | parent owner（Codex2）                 |
| Record missing deltas                      | QA 中找到的不一致需記在 parent handoff 訊息或 sidecar | parent task `next` 或本 sidecar 之後追加章節                                         | parent owner（Codex2），sidecar 可協助 |
| `pnpm --filter @drts/driver-app typecheck` | 司機 app typecheck 通過                               | parent task handoff message                                                          | parent owner（Codex2）                 |
| `pnpm --filter @drts/driver-app test`      | 司機 app 單元測試通過                                 | parent task handoff message                                                          | parent owner（Codex2）                 |
| Visual verification packet filed           | screenshots / XML / text snapshots 已落盤             | `support/sidecars/DRV-UI-010/`                                                       | parent owner（Codex2）                 |

## Sidecar Boundary（明列）

本 sidecar 提供：

- `support/sidecars/DRV-UI-010/DRV-UI-010-SIDECAR-ACCEPTANCE.md`（本檔）

本 sidecar 不提供 / 不允許修改：

- `apps/driver-app/**`（runtime；屬 parent owner 範圍）
- `docs/01-product/**`、`docs/03-runbooks/**`、`docs/05-ui/**`（canonical / reference）
- `packages/contracts/**`、`apps/api/**`
- `ai-status.json`（除了透過 `scripts/ai-status.sh` 推進本 sidecar 任務本身的生命週期）
- `current-work.md`、`docs-site/**`（mirror）
- 既存 sidecar evidence 檔（PNG/XML/text snapshots）

## Handoff / Evidence

- Sidecar artifact path：`support/sidecars/DRV-UI-010/DRV-UI-010-SIDECAR-ACCEPTANCE.md`
- 預期 handoff 行為（NO_COMMIT_REQUIRED）：
  1. `AI_NAME=Claude2 scripts/ai-status.sh start DRV-UI-010-SIDECAR-ACCEPTANCE "<已執行>"`（已完成）
  2. 撰寫本檔；列出 dependency map、evidence index、boundary。
  3. `AI_NAME=Claude2 scripts/ai-status.sh handoff DRV-UI-010-SIDECAR-ACCEPTANCE Codex2 "<handoff 摘要>"`
  4. Reviewer（Codex2）approve 或 reopen。
  5. Owner closeout（`done`）使用 `NO_COMMIT_REQUIRED=1` 因為這是 sidecar acceptance packet。

### Reviewer approval（Codex2）

通過：

```
AI_NAME=Codex2 scripts/ai-status.sh approve DRV-UI-010-SIDECAR-ACCEPTANCE "Reviewed: acceptance packet complete"
```

不通過：

```
AI_NAME=Codex2 scripts/ai-status.sh reopen DRV-UI-010-SIDECAR-ACCEPTANCE "<原因>"
```

reopen 時請具體指出哪一條 dependency map 不正確、哪個 acceptance 條目沒對應到證據、或 boundary 哪裡寫錯，以利 owner 立即修。

---

Support artifact prepared by Claude2（API/integration lane）。No canonical files modified; no driver-app runtime files touched.
