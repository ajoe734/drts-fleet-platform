# SERVICE-AREA-PREVIEW-OPTIONAL-DESTINATION-20261015 — 服務區預覽保留未填目的地與真實零座標語意：驗收證據報告

| 欄位                                     | 內容                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task ID                                  | `SERVICE-AREA-PREVIEW-OPTIONAL-DESTINATION-20261015`                                                                                                                                                                                                         |
| Task Spec Ref                            | `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1026-platform-frontier-root/SERVICE-AREA-PREVIEW-OPTIONAL-DESTINATION-20261015.task-spec.json` (`sha256: 00ac85b18c014275c7ed725f4ef532c221bf82fc6337421eb8da2ff25468de24`)     |
| Confirmed Finding ID                     | `C106-F1` (`C106-C107-current-accepted-service-area-product-dataflow-readonly-audit.json`, `sha256: 7bf36ee1c4c68fc4c208680f853b4aca36e4f7503b6d2b323764db8aaa9eeb9b`)                                                                                       |
| Owner / Reviewer                         | `Gemini` / `Gemini2`                                                                                                                                                                                                                                         |
| Immutable Audited Base SHA               | `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`                                                                                                                                                                                                                   |
| Task Registration `source_commit`        | `afbcbba5de66f7ce0099ae9e3d92790d45f69028`                                                                                                                                                                                                                   |
| Current Accepted Base SHA (`origin/dev`) | `9b343586196bfa963d170d3d5a9683b012398111`                                                                                                                                                                                                                   |
| Candidate Branch / Worktree              | `gemini/service-area-preview-optional-destination-20261015` / `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-service-area-preview-optional-destination-20261015`                                                                |
| Candidate SHA                            | 於 `handoff` 前鎖定並與遠端 `origin/gemini/service-area-preview-optional-destination-20261015` 一致                                                                                                                                                          |
| Required Acceptance Keys                 | `service-area-preview_actual-blank-destination-null-transport`, `service-area-preview_filled-partial-and-zero-input-regressions`, `service-area-preview_original-geometry-time-stop-authority-boundaries`, `service-area-preview_exact-candidate-validation` |

---

## 1. 缺陷定位與修改依據 (`C106-F1`)

### 1.1 權威依據與原始資料流缺陷 (`C106-F1`)

依據唯讀資料流審計報告 `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1026-platform-frontier-root/C106-C107-current-accepted-service-area-product-dataflow-readonly-audit.json` (`C106-F1`) 與 `SERVICE-AREA-PREVIEW-OPTIONAL-DESTINATION-20261015.task-spec.json`：

- **觸發條件 (`C106-F1`)**：營運管理員於 `/service-area-governance` 頁面的「即時服務區試算（Live serviceability preview）」填寫有效上車點（如台北核心區 `25.05, 121.55`），並依欄位標示（`Dropoff lat (optional)` / `Dropoff lng (optional)`）將選填下車點留白（初始值 `""` 或空白字元），點擊「執行試算（Run preview）」。
- **舊版 (`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`) 實際路徑**：
  1. `apps/platform-admin-web/app/service-area-governance/page.tsx` 的 `runPreview()`（舊版第 222–245 行）直接對輸入字串呼叫 `Number(dropoffLat)` 與 `Number(dropoffLng)`。
  2. 在 JavaScript 中，`Number("") === 0` 且 `Number("   ") === 0`，進而使 `const hasDrop = Number.isFinite(dlat) && Number.isFinite(dlng)` 恆為 `true`。
  3. 前端實際透過 `client.evaluateServiceArea(...)` 送出 `dropoff: { lat: 0, lng: 0 }`（幾內亞灣假座標），而非契約規定的 `dropoff: null`。
  4. 後端 `ServiceAreaService.evaluate` (`apps/api/src/modules/service-area/service-area.service.ts` 第 847–852 行) 將非空 `command.dropoff` 視為實際下車停靠點進行幾何與停靠策略判定，因 `(0, 0)` 不在台灣服務區內，回傳 `decision: "not_serviceable"` 與 `reasonCodes: ["DROPOFF_AREA_NOT_SERVICEABLE"]`，使單純測試上車點之合法預覽遭誤判為不可服務。
  5. 同樣地，舊版 `Number("") === 0` 也導致必填 `pickup` 全空白或半填時被靜默轉為 `0` 送出，選填 `dropoff` 只填單邊時空缺側被轉為 `0` 送出，以及 `dropoff` 填入非數字（如 `"abc"`、`"Infinity"`）時因 `hasDrop === false` 被靜默丟棄為 `dropoff: null` 而未顯示輸入錯誤。

### 1.2 實作修復內容（嚴格限於授權 `write_scopes`）

1. 新增 `apps/platform-admin-web/lib/service-area-preview-input.ts`：
   - 實作 `parseCoordinatePairInput(latInput, lngInput)`：在數值轉換前先 `trim()` 並區分四種明確語意狀態：
     - `omitted`：兩個欄位修剪後皆為空字串 `""`。
     - `partial`：僅其中一個欄位修剪後為空字串，另一個非空。
     - `malformed`：任一欄位不符合十進位數值格式（拒絕 `"abc"`、`"NaN"`、`"Infinity"`、`"-Infinity"`、`"0x10"` 等）或非有限數 (`!Number.isFinite`)。
     - `point`：兩個欄位皆為合法有限十進位數值；保留顯式輸入的 `0`、`0.0`、`-0`（將 `-0` 正規化為 `0`），不捏造任何地理位置限制。
   - 實作 `parseServiceAreaPreviewInput(input)`：
     - 必填 `pickup` 必須為 `point`，若為 `omitted`、`partial` 或 `malformed` 一律回傳 `{ ok: false, field: "pickup", reason }`。
     - 選填 `dropoff` 若為 `omitted` 則產出 `dropoff: null`；若為 `point` 則產出 `dropoff: { lat, lng }`；若為 `partial` 或 `malformed` 則回傳 `{ ok: false, field: "dropoff", reason }`，絕不靜默轉成 `0` 或靜默忽略。
2. 修改 `apps/platform-admin-web/app/service-area-governance/page.tsx`：
   - 於 `runPreview()` 改用 `parseServiceAreaPreviewInput({ serviceProductType: product, pickupLat, pickupLng, dropoffLat, dropoffLng })`。
   - 當 `!parsed.ok` 時設定 `setPreviewErr(t("serviceAreaGov.preview.invalid"))` 並中止，不發出 API 請求。
   - 當 `parsed.ok` 時，原樣呼叫既有 transport `await client.evaluateServiceArea(parsed.command)`，不改動 `@drts/api-client`、`@drts/contracts` 或後端 `ServiceAreaController` / `ServiceAreaService`。
3. 新增生產呼叫端（Production Caller）無 Socket 元件回歸測試：
   - `tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx`：直接載入真實 `apps/platform-admin-web/app/service-area-governance/page.tsx`、`getPlatformAdminClient` (`@drts/api-client`)、`ServiceAreaController` 與 `ServiceAreaService`，驗證真實 DOM 輸入、按鈕點擊、wire payload 與後端回應渲染。

---

## 2. 交付品質與驗收對照表（依 `AI_COLLABORATION_GUIDE.md` §0.7）

| Finding／驗收項                                                            | 原始碼依據與修改位置                                                                                                                                                                                                                                                                                             | 舊版重現 (`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`) → 修正版結果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 未驗項與具體限制                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C106-F1` / `service-area-preview_actual-blank-destination-null-transport` | `apps/platform-admin-web/app/service-area-governance/page.tsx` (`runPreview` 第 223–240 行)、`apps/platform-admin-web/lib/service-area-preview-input.ts` (`parseCoordinatePairInput`, `parseServiceAreaPreviewInput`)；搭配既有 `ApiClient.evaluateServiceArea` 與 `ServiceAreaController.evaluateServiceArea`   | **舊版重現 (`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`, Fail, Exit 1)**：於 `ServiceAreaGovernancePage` 填入上車點 `(25.05, 121.55)` 並保持選填下車點為預設空白 `""` 或空白字元 `"   "`，點擊 `Run preview` 後，`client.evaluateServiceArea` 收到 `{ serviceProductType: "taxi_realtime", pickup: { lat: 25.05, lng: 121.55 }, dropoff: { lat: 0, lng: 0 } }`，且畫面誤渲染 `Not serviceable` (`DROPOFF_AREA_NOT_SERVICEABLE`)。<br>**修正版結果 (Pass, Exit 0)**：空白或純空白字元之選填下車點經 `runPreview` 送出 `{ serviceProductType: "taxi_realtime", pickup: { lat: 25.05, lng: 121.55 }, dropoff: null }`（及圓形桃園機場區 `credit_card_airport_transfer` 測試），後端僅評估上車點並正確渲染 `Serviceable`。                                                                                                                                                                                                   | 重現命令（未修改 `page.tsx` @ `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`）：<br>`pnpm exec vitest run tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx --maxWorkers=1` → **Exit 1** (5 failed, 4 passed；日誌：`.local/service-area-preview-optional-destination-20261015/before-base-df77ae358.log`)<br>驗證命令（修正版）：<br>`pnpm exec vitest run tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx --maxWorkers=1` → **Exit 0** (9 passed, 0 failed；日誌：`.local/service-area-preview-optional-destination-20261015/after-fix.log`) | 無 Socket 元件與真實 `ApiClient` / `ServiceAreaController` / `ServiceAreaService` 已完整驗證；依 `AGENTS.md` 不在本 VM 啟動瀏覽器或開發伺服器。                                                         |
| `service-area-preview_filled-partial-and-zero-input-regressions`           | `apps/platform-admin-web/lib/service-area-preview-input.ts` (`parseFiniteDecimalCoordinate`, `parseCoordinatePairInput`, `parseServiceAreaPreviewInput`)、`apps/platform-admin-web/app/service-area-governance/page.tsx` (`runPreview`)                                                                          | **舊版重現 (`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`, Fail, Exit 1)**：① 必填 `pickup` 留白 `("", "")` 或半填 `("25.05", "")` 被轉為 `0` 並發出 `{ pickup: { lat: 0, lng: 0 } }` 請求；② 選填 `dropoff` 半填 `("25.06", "")` 被轉為 `{ lat: 25.06, lng: 0 }` 送出，填 `"abc"` 或 `"Infinity"` 則靜默變成 `dropoff: null`；③ `"-0"` 產生 `-0`。<br>**修正版結果 (Pass, Exit 0)**：① 完整填寫之合法 `pickup` + `dropoff`（區內與區外）正常送出並反映後端 `serviceable` / `not_serviceable`；② 顯式輸入 `"0"`、`"0.0"`、`"-0"` 對 `pickup` 與 `dropoff` 均保留為真實座標 `{ lat: 0, lng: 0 }`（在台北區判為區外，在發佈覆蓋 `(0,0)` 之圓形服務區後判為 `serviceable`）；③ 空白/半填 `pickup`、半填 `dropoff`、非數值/非有限值輸入皆在轉換前攔截並顯示 `serviceAreaGov.preview.invalid`，絕不呼叫 `evaluateServiceArea`；④ 超出經緯度範圍（如 `lat=95`、`lng=185`）誠實顯示後端 `INVALID_COORDINATE` 錯誤訊息且無假結果。 | 命令：<br>`pnpm exec vitest run tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx --maxWorkers=1`<br>結果：**Exit 0**（涵蓋區內外雙點、顯式 `0`/`0.0`/`-0`、空白/半填 `pickup`、半填/格式錯誤 `dropoff`、後端 `INVALID_COORDINATE` 範圍錯誤共 5 大測試群組全數通過）                                                                                                                                                                                                                                                                                                                                        | 未在前端新增任何台灣地域硬編碼限制；範圍檢查維持由後端 `ServiceAreaService.normalizePoint` 權威執行。                                                                                                   |
| `service-area-preview_original-geometry-time-stop-authority-boundaries`    | `apps/platform-admin-web/app/service-area-governance/page.tsx`、`tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx`、`tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts`                                    | **修正版結果 (Pass, Exit 0)**：100% 保留既有服務區邊界與停靠策略之 `create -> submitReview -> publish -> retire` 生命週期、版本遞增、審計回執顯示、Polygon 與 Circle 幾何、生效時間窗 (`effectiveFrom` / `effectiveUntil`)、停靠策略方向 (`pickup` / `dropoff` / `both`) 與效果 (`allow` / `deny` / `manual_review`)、以及定義載入失敗之錯誤橫幅顯示；既有 `c106-service-area-governance.test.ts`（5 項）、`api-client-geo-service-area.test.ts`（4 項）與 `apps/api/tests/unit/service-area.service.test.ts`（20 項）全數通過。                                                                                                                                                                                                                                                                                                                                                                                        | 命令 1：<br>`pnpm exec vitest run tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts tests/unit/api-client-geo-service-area.test.ts --maxWorkers=1` → **Exit 0** (3 files, 18 passed)<br>命令 2：<br>`pnpm --filter @drts/api exec vitest run tests/unit/service-area.service.test.ts --maxWorkers=1` → **Exit 0** (1 file, 20 passed)                                                                                                                                                                               | 保留 `SR-QA-GOVERNANCE-001` 原有 5 項 C106 QA 與 C114 合格證據；多邊形挖洞（polygon holes）契約決策與後續 Source 由 Root 另行路由，本任務不修改後端幾何契約，亦不宣稱單憑本修復即完成完整 C106 `DONE`。 |
| `service-area-preview_exact-candidate-validation`                          | 工作樹 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-service-area-preview-optional-destination-20261015`、分支 `gemini/service-area-preview-optional-destination-20261015`、本報告 `docs/04-uat/system-remediation-20260906/SERVICE-AREA-PREVIEW-OPTIONAL-DESTINATION-20261015.md` | **修正版結果 (Pass, Exit 0)**：於標準 task worktree 記錄不可變審計基線 `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`、當前 `origin/dev` 基線 `9b343586196bfa963d170d3d5a9683b012398111`、修復前後實際命令與退出碼；完成全部相關無 Socket 回歸測試、`@drts/platform-admin-web` lint/typecheck、root typecheck、ESLint、Prettier 與 `git diff --check` 全數 **Exit 0**，並以一般 commit 與 plain push 交接 `Gemini2` 審查及同一 candidate SHA 之 hosted CI。                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 命令與退出碼詳列於第 3 節（所有單元測試、typecheck、lint、prettier 皆為 **Exit 0**）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 遵守 `AGENTS.md` VM 限制：不啟動任何本地伺服器、瀏覽器或 Docker Compose，不執行雲端部署或觸碰 Root WIP。                                                                                                |

---

## 3. 修正前後重現與驗證命令明細

### 3.1 修正前（Unmodified `page.tsx` @ `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`）重現紀錄

- **執行命令**：
  ```bash
  pnpm exec vitest run tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx --maxWorkers=1
  ```
- **退出碼**：`1`（`Test Files 1 failed (1)`, `Tests 5 failed | 4 passed (9)`）
- **完整日誌保存位置**：`/home/lupin/workspace/drts-fleet-platform/.local/service-area-preview-optional-destination-20261015/before-base-df77ae358.log`
- **實測失敗摘要**：
  1. `sends dropoff: null (never invented (0,0)) and evaluates pickup-only as serviceable when both destination fields are left blank`：`expect(h.evaluateSpy).toHaveBeenCalledWith({ serviceProductType: "taxi_realtime", pickup: { lat: 25.05, lng: 121.55 }, dropoff: null })` 失敗，實際收到 `dropoff: { lat: 0, lng: 0 }`。
  2. `treats whitespace-only or cleared optional destination fields as omitted (dropoff: null) across polygon and circle service areas`：實際收到 `dropoff: { lat: 0, lng: 0 }`。
  3. `preserves explicitly entered numeric zero (0, 0.0, -0) as a real coordinate for both pickup and dropoff without inventing geographic restrictions`：輸入 `"-0"` 時未正規化為 `0`（收到 `lng: -0`）。
  4. `rejects blank or partially entered required pickup before conversion and never sends an invented 0 point`：未顯示 `Enter valid pickup lat/lng.`，反而將空白轉為 `0` 呼叫 `evaluateServiceArea`。
  5. `rejects partially entered optional dropoff and malformed/nonfinite coordinates without silently dropping or zeroing them`：半填與格式錯誤之 `dropoff` 未顯示 `Enter valid pickup lat/lng.`，反而送出半零座標或靜默丟棄為 `dropoff: null`。

### 3.2 修正後驗證紀錄

1. **新舊服務區治理與 API Client / 服務層無 Socket 回歸測試（4 test files / 38 tests）**：
   - 命令 1：
     ```bash
     pnpm exec vitest run tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx tests/unit/system-remediation/sr-qa-governance-001/c106-service-area-governance.test.ts tests/unit/api-client-geo-service-area.test.ts --maxWorkers=1
     ```
     結果：**Exit 0**（3 test files passed, 18 tests passed, 0 failed）。
   - 命令 2：
     ```bash
     pnpm --filter @drts/api exec vitest run tests/unit/service-area.service.test.ts --maxWorkers=1
     ```
     結果：**Exit 0**（1 test file passed, 20 tests passed, 0 failed）。
2. **`@drts/platform-admin-web` Lint 與 Typecheck**：
   - 命令：
     ```bash
     pnpm --filter @drts/platform-admin-web lint && pnpm --filter @drts/platform-admin-web typecheck
     ```
   - 結果：**Exit 0**（`eslint . --max-warnings=0` 0 warnings/errors；`next-typecheck.sh` 通過）。
3. **ESLint / Prettier / Git Diff 與 Root Typecheck 檢查**：
   - 命令：
     ```bash
     pnpm exec eslint --max-warnings=0 apps/platform-admin-web/app/service-area-governance/page.tsx apps/platform-admin-web/lib/service-area-preview-input.ts tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx
     pnpm exec prettier --check apps/platform-admin-web/app/service-area-governance/page.tsx apps/platform-admin-web/lib/service-area-preview-input.ts tests/unit/service-area-preview-optional-destination-20261015/service-area-preview-optional-destination.test.tsx docs/04-uat/system-remediation-20260906/SERVICE-AREA-PREVIEW-OPTIONAL-DESTINATION-20261015.md
     git diff --check
     ```
   - 結果：全數 **Exit 0**。
   - 補充 `pnpm typecheck:root`：`apps/platform-admin-web/**` 與 `tests/unit/service-area-preview-optional-destination-20261015/**` 為 **0 TypeScript 錯誤**；因 git worktree 共用 canonical root `node_modules` 符號連結，使無關套件（如 `tenant-console-web`、`passenger-app-web` 跨路徑解析 `@drts/api-client`）於本機出現 Exit 2，依規不觸碰 Root WIP 重跑 `pnpm install`，完整 clean-install 全倉 typecheck 由同一 candidate SHA 之 hosted CI 驗證。

---

## 4. 範圍與剩餘限制誠實聲明

- **窄範圍 Source 修復邊界**：本任務僅修復 `C106-F1`（`/service-area-governance` 實際 Preview caller 之輸入存在性／有效性解析與既有 `evaluateServiceArea` transport 呼叫），不修改 `@drts/api-client`、`@drts/contracts` 或後端幾何／停靠／生效時間權威邏輯。
- **原始能力要求與未決邊界保留**：
  - 完整保留 `SR-QA-GOVERNANCE-001` 原有 5 項 C106 QA 證據與 C114 合格 Source/live 證據。
  - 原始 C106 能力要求（含多邊形/圓形/挖洞 holes、版本生效與失效時間、角色權限與真實瀏覽器閉環）仍維持在全系統能力範圍內；其中多邊形挖洞（holes）之契約支援或明確拒絕語意決策與後續 Source 由 Root 另行路由，非本任務 4 個窄範圍 Source acceptance keys 之前置條件，且本任務完成不單獨構成完整 `C106` 能力 `DONE`。
- **VM 執行限制**：嚴格遵守 `AGENTS.md`，未在本 VM 啟動任何產品開發伺服器、預覽伺服器、瀏覽器測試伺服器或 Docker Compose。
