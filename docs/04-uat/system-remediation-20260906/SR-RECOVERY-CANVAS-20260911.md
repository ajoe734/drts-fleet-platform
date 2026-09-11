# Task Evidence Report: SR-RECOVERY-CANVAS-20260911

## 1. 任務基本資訊 (Task Metadata)

- **Task ID**: `SR-RECOVERY-CANVAS-20260911`
- **任務名稱**: 補齊代墊匯款證明與 Adapter 治理 canvas 缺漏狀態
- **Owner**: `Claude`
- **Reviewer**: `Claude2`
- **工作類型**: `design` (canvas-only, non-canonical implementation)
- **優先級**: `P0`
- **Planning Ref**: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- **Branch**: `claude/sr-recovery-canvas-20260911` (base `dev`)
- **Worker Cwd**: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-recovery-canvas-20260911`
- **Canonical Root**: `/home/lupin/workspace/drts-fleet-platform`
- **Anchor Commit**: `d849154ba` — `wip(SR-RECOVERY-CANVAS-20260911): anchor reimbursement-proof and adapter-registry canvas states`

---

## 2. 範圍與依賴 (Scope & Dependencies)

- Depends on: `SR-DESIGN-001` (design-contract precedent; establishes the same envelope/state-machine/IAM conventions this canvas follows).
- Producer sibling: `SR-RECOVERY-CONTRACTS-20260911` supplies the eventual typed contract for proof/push/adapter-registry; this task is canvas-only and does not allocate contracts, migrations, or backend code.
- Read dependencies consulted:
  - `support/unblock/SR-PROOF-001/SR-PROOF-001-UNBLOCK-PLANNING-DECISION.md` — routes the exact missing screen states (upload/progress/error/retry, pending scan, rejected, server-confirmed metadata, authorized readback with re-authorization on expiry) that PR #1699 already documented.
  - `support/unblock/SR-ADMIN-ADAPTER-001/SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION.md` — routes the missing registration/configuration/credential forms, server readback states (pending/rejected/unavailable/saved), and the nullable authoritative expiry contract (`unknown` is an explicit state, never inferred as valid or far-future).
- Write scope respected: only `docs/05-ui/drts-design-canvas/platform-screens-2.jsx`, `docs/05-ui/drts-design-canvas/platform-screens-3.jsx`, and this report. No shared fixture file (`mgmt-data.jsx`, `mgmt-primitives.jsx`, `mgmt-auth.jsx`, `mgmt-tokens.jsx`) was touched — new fixtures/components are declared locally in the two owned files, following the existing convention already used by `FX_EXCLUSIVITY`/`FX_OFFBOARD`/`FX_REIMBURSE` in these same files.

---

## 3. 交付內容 (Deliverables)

### 3.1 `platform-screens-3.jsx` — `PA_Reimbursements` / `PA_ReimbursementDetail`

- **列表頁 (`PA_Reimbursements`)**: 新增 `PROOF` 欄位，以 `FX_REIMBURSE_PROOF_SUMMARY` 呈現每個批次的伺服器回報證明狀態 (`not_uploaded` / `pending_scan` / `rejected` / `confirmed`)。
- **詳情頁 (`PA_ReimbursementDetail`)** 新增「匯款證明 · Remittance proof」卡片：
  - `FX_PROOF_ATTEMPTS` 以四筆歷史紀錄呈現完整狀態機：`upload_failed`（含重試 ActionButton）、`uploading`（含即時 progress bar，沿用 `driver-safety-operator.jsx` `SO_IncidentUpload` 既有的上傳進度視覺慣例）、`pending_scan`（伺服器端掃描中）、`rejected`（掃描標記/浮水印比對失敗，`scan`/`ownership` 欄位明示伺服器判定）。
  - `FX_PROOF_CONFIRMED` 呈現伺服器確認後的證明中繼資料（檔名、雜湊、批次歸屬、掃描結果、歸屬核對結果）— 不使用自由文字 proof ID，全部欄位皆為伺服器回報值。
  - `FX_PROOF_READBACK` + `Banner` 呈現「authorized readback」與到期後需重新授權的行為（Q-SR-PROOF-001 對應 PR #1699 的既有規格）。
  - 新增「標記已付款 · 前置條件」卡片：以 `GateRow` 明確列出兩個獨立閘門（批次已核准 / 證明已 confirmed 且掃描通過且歸屬核對一致），並將 `mark_paid` ActionButton 的 `enabled`/`disabledReasonCode` 同時綁定這兩個條件 —— 在批次尚未核准或證明未確認時，`mark-paid` 會可見地停用並顯示對應原因碼（`batch_not_approved` / `proof_not_confirmed`），符合「mark-paid visibly disabled with a reason until approval and valid scan/ownership evidence」驗收。

### 3.2 `platform-screens-2.jsx` — `PA_AdapterRegistry`

- **註冊表單 (`AdapterRegisterModal`)**: 來源名稱 / kind / 初始 credential / 必填 reason，送出後進入 `pending` 由伺服器健康探測與稽核確認；secret 欄位標示「僅顯示一次，平台不儲存可還原明碼值」，呼應 secret non-readback 原則。
- **設定 Drawer (`AdapterConfigDrawer`)**: 僅暴露 platform-admin 層設定值（timeout / retry / 到期告警天數），並以 `Banner` 明示「ops 暫停 / 恢復與其 TTL 僅能在 Ops Console 操作」—— 保留 Q-ADM17 configuration-vs-ops-TTL 權責切分，未新增任何可讓 platform-admin 代為執行 ops TTL 操作的按鈕。
- **Credential 輪替**: 重用既有 `SecretRevealModal`（`mgmt-auth.jsx` 既有的 plaintext-once 元件）作為輪替流程的示範疊層，維持 secret 僅顯示一次、不可回讀的既有治理模式。
- **伺服器回報送出紀錄卡片**: `FX_ADAPTER_SUBMISSIONS` 以 Table 呈現 `pending` / `rejected` / `saved` / `unavailable` 四種真實伺服器回報結果（含一筆 `rejected`：告警天數超過伺服器上限；一筆 `unavailable`：adapter 離線導致設定端點無回應），全部為 server-reported 結果，不憑空假設操作已成功。
- **到期 / unknown 狀態 (`AdapterExpiryPill` + `FX_ADAPTER_EXPIRY`)**: 每張 adapter 卡片新增 `CREDENTIAL EXPIRY` 欄位，涵蓋四種狀態：`ok`（正常）、`expiring`（於 warning window 內）、`expired`（已過期）、`unknown`（`expiresAt: null` 時明確顯示「unknown · 無到期資料」，不推斷為有效或遠期到期）。

---

## 4. 設計依循與 Canon 對齊

- 顏色/字型全數延用 `mgmt-tokens.jsx` 既有 `buildMgmtTheme`/`th.*` 與 `SHELL_MONO`，未引入任何硬編色票或自訂調色盤。
- 所有互動元件（`ActionButton`/`Modal`/`Drawer`/`Banner`/`Pill`/`Field`/`Input`/`Select`）均重用 `mgmt-primitives.jsx`/`mgmt-auth.jsx` 既有元件，未重新發明或用 shadcn/Canvas 預設樣式套皮。
- 疊層示範模式（Modal/Drawer 以 `xxxOpen`/`xxxId` prop 條件渲染）沿用本檔案集既有慣例（`platform-screens-1.jsx` 的 `showSecretModal` prop、`tenant-screens-2.jsx` 的 `showSecret` prop）。
- 上傳進度／多狀態列表呈現方式沿用 `driver-safety-operator.jsx` `SO_IncidentUpload` 與 `roc-screens-2.jsx` 既有的 evidence-upload 視覺慣例（檔名 + Pill 狀態 + 進度條）。
- 未發明任何新畫面；兩個 unblock planning decision 文件中明確列出的缺漏狀態已逐項對應到本次新增的卡片/元件，未超出兩份 routing 文件所記錄的範圍。

---

## 5. 驗證指令與結果記錄 (Verification Evidence)

### 5.1 `git diff --check`（本任務宣告的 `test_commands`）

- **Command**: `git diff --check origin/dev..HEAD`
- **Working Directory**: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-recovery-canvas-20260911`
- **Exit Code**: `0`
- **Output**: `(clean, no trailing whitespace or merge conflict markers)`

### 5.2 JSX 語法驗證 (esbuild transform)

這兩個檔案是無建置流程的靜態設計稿（純瀏覽器 Babel-in-browser 載入），倉庫內無專屬 lint/build script；改用倉庫既有 pnpm store 內的 `esbuild@0.27.7` 對兩個檔案執行 `loader: 'jsx'` transform 驗證語法正確性。

- **Command**: `node -e "require(esbuildPath).transformSync(fs.readFileSync(f,'utf8'), { loader: 'jsx', jsx: 'transform' })"` for each file
- **Working Directory**: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-recovery-canvas-20260911`
- **Result**:
  ```text
  docs/05-ui/drts-design-canvas/platform-screens-2.jsx OK
  docs/05-ui/drts-design-canvas/platform-screens-3.jsx OK
  ```

### 5.3 全域符號衝突檢查

兩檔案透過 `Object.assign(window, {...})` 於瀏覽器全域共享符號；以 `grep` 確認新增的所有 fixture/component 識別字（`FX_ADAPTER_EXPIRY`、`FX_ADAPTER_SUBMISSIONS`、`AdapterExpiryPill`、`AdapterRegisterModal`、`AdapterConfigDrawer`、`FX_REIMBURSE_PROOF_SUMMARY`、`FX_PROOF_ATTEMPTS`、`FX_PROOF_CONFIRMED`、`FX_PROOF_READBACK`、`ProofAttemptRow`、`GateRow` 等）在整個 `docs/05-ui/drts-design-canvas/*.jsx` 範圍內僅各宣告一次，與既有畫面（含 `mgmt-*.jsx`、`platform-screens-1.jsx`、`platform-screens.jsx`）無命名衝突。

### 5.4 Prettier 格式檢查（基線比對，非本次迴歸）

- **Command**: `node node_modules/prettier/bin/prettier.cjs --check docs/05-ui/drts-design-canvas/platform-screens-2.jsx docs/05-ui/drts-design-canvas/platform-screens-3.jsx`
- **Exit Code**: 非 0（warn：兩檔皆不符 Prettier 預設樣式）
- **對照基線**: 對同目錄未變更的既有檔案（`platform-screens-1.jsx`、`mgmt-primitives.jsx`）執行同一指令同樣回報 warn — 證實整個 `docs/05-ui/drts-design-canvas/` 目錄本來就不納入 Prettier 強制格式（密集單行 JSX 為此設計稿集的既定風格），本次變更未引入新的格式迴歸，僅延續既有檔案風格撰寫。

---

## 6. 未執行 / 明確排除項目 (Explicit Non-Live Exclusions)

本任務性質為 canvas-only 設計稿補完，非可執行程式碼；為維持審查誠信，明確宣告以下項目未執行亦不冒充完成：

1. **未啟動任何前端開發伺服器或瀏覽器渲染**：依派工限制未於本 VM 執行 `pnpm dev` / Playwright / Docker Compose；未做視覺截圖驗收，僅完成語法與符號一致性的靜態驗證。
2. **未實作對應的真實 API/contract/migration**：`remittance-proof` / `passenger-push-delivery` / `platform-adapter-registry` 之型別、端點與資料庫遷移由 `SR-RECOVERY-CONTRACTS-20260911` 與下游 `SR-PROOF-001` / `SR-PUSH-001` / `SR-ADMIN-ADAPTER-001` 負責；本次交付的欄位命名與狀態列舉僅供該契約交付前的畫面規格參考，最終欄位名稱仍需於契約合併後對照收斂（已於 task brief `integration_notes` 中預先聲明）。
3. **未變更任何 shared fixture/primitive 檔案**：所有新增 fixture 與元件皆為 `platform-screens-2.jsx` / `platform-screens-3.jsx` 本地宣告，未修改 `mgmt-data.jsx`、`mgmt-primitives.jsx`、`mgmt-auth.jsx`、`mgmt-tokens.jsx`。
4. **未執行 CI / 遠端合併**：本報告僅記錄本地驗證；candidate SHA、CI 結果與 merge provenance 由 handoff 後的 candidate lifecycle 與 reviewer 各自記錄。
