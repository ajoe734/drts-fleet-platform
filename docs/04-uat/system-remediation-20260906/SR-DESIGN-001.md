# Task Evidence Report: SR-DESIGN-001

## 1. 任務基本資訊 (Task Metadata)

- **Task ID**: `SR-DESIGN-001`
- **任務名稱**: 補齊請假／學院／Host的最小可實作契約
- **Owner**: `Gemini2`
- **Reviewer**: `Gemini`
- **工作類型**: `documentation`
- **優先級**: `P2`
- **Workstream**: `design`
- **狀態**: `review` (待 handoff)
- **Base SHA**: `afefd55d3d23dd361d2dd81fd5f80eedb6671002`
- **Branch**: `gemini2/sr-design-001`
- **Worker Cwd**: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001`
- **Canonical Root**: `/home/lupin/drts-fleet-platform`

---

## 2. 追溯矩陣與範圍對齊 (Traceability Matrix)

| Gap ID | Capability ID | 角色 | 領域 | 規格依據 | 交付契約規範 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **N01** | **C052** | 司機／排班主管 | 請假工作流程 | PRD §9.4.7 Shift & Attendance | `docs/04-uat/system-remediation-20260906/feature-contracts.md` §2 |
| **N02** | **C059** | 司機 | 學院培訓與測驗 | PRD §9.4.9 Settings & Academy | `docs/04-uat/system-remediation-20260906/feature-contracts.md` §3 |
| **N02** | **C071** | 車行訓練管理員 | 車行完訓真值看板 | PRD §9.4.9 Settings & Academy | `docs/04-uat/system-remediation-20260906/feature-contracts.md` §3 |
| **N03** | **C012** | 車主 Host | 自車受限唯讀投影 | PRD §12.6 Host 自車四項權限 | `docs/04-uat/system-remediation-20260906/feature-contracts.md` §4 |

---

## 3. 交付 Artifacts 清單

本任務僅在授權之 `write_scopes` 內建立檔案，未變更任何非授權之中央設定檔：
1. `docs/04-uat/system-remediation-20260906/feature-contracts.md`:
   - 定義請假、學院、Host 自車投影三大家族完整契約。
   - 逐一規範 API 路徑、HTTP 方法、請求/回應 Schema、狀態機模型、IAM Realm 與 Role 映射、錯誤代碼矩陣、正負驗收條件 (AC)。
   - 明確落實不確定點與邊界條件，指引 FE 與 BE 能依同一契約獨立實作。
2. `tests/unit/system-remediation/sr-design-001/sr-design-contracts.test.ts`:
   - 單元測試套件（10 項測試），驗證契約之不變式（時間區間、重疊判定、狀態移轉、出勤防護、真值完訓計算、測驗計分、車主物主隔離與防枚舉、PII 去識別化）。
3. `docs/04-uat/system-remediation-20260906/SR-DESIGN-001.md`:
   - 本任務執行證據與結案交接報告。

---

## 4. 下游 Migration 與任務對照 (Downstream Migration Plan)

保留專屬 Migration 序號，不與既有遷移或 UV schema 衝突：
- **SR-LEAVE-BE-001**: `infra/migrations/V0086__sr_driver_leave.sql`
- **SR-ACADEMY-BE-001**: `infra/migrations/V0087__sr_driver_academy.sql`
- **SR-HOST-BE-001**: `infra/migrations/V0088__sr_host_vehicle_access.sql`
- **SR-CONTRACT-001**: 一次整合上述型別至 `@drts/contracts` 與 `@drts/api-client`，並寫入 `docs/04-uat/system-remediation-20260906/schema-allocation.json`。

---

## 5. 驗證指令與結果記錄 (Verification Evidence)

### 5.1 git diff --check
- **Command**: `git diff --check`
- **Working Directory**: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001`
- **Exit Code**: `0`
- **Output**:
  ```text
  (clean, no trailing whitespace or merge conflict markers)
  ```

### 5.2 Vitest 契約不變式單元測試
- **Command**: `pnpm exec vitest run tests/unit/system-remediation/sr-design-001/`
- **Working Directory**: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001`
- **Exit Code**: `0`
- **Output**:
  ```text
   RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001

   Test Files  1 passed (1)
        Tests  10 passed (10)
     Start at  06:16:22
     Duration  311ms (transform 64ms, setup 0ms, import 87ms, tests 12ms, environment 0ms)
  ```

---

## 6. 未執行的 Live / 真機項目說明 (Explicit Non-Live Exclusions)

本任務為 `documentation` 與設計契約任務，以下真實環境操作依規劃留待後續實作與 UAT 任務驗證，本任務不冒充成功：
1. **真機行動端硬體操作**: iOS / Android 真機之鍵盤焦點、安全區、推播與背景 GPS 定位。
2. **外部郵件/簡訊傳輸**: 未呼叫第三方真實 SMTP / Twilio 送出通知。
3. **車輛硬體遙測 (OBD)**: 未連接實體車輛 CAN bus 或硬體感測器。
