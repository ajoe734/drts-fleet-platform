# SR-DRIVER-WEB-001 — 司機 web 預覽平台分流與既有修復回歸 UAT 驗收報告

- **Task ID**: `SR-DRIVER-WEB-001`
- **Owner**: `Gemini`
- **Reviewer**: `Codex`
- **Base SHA**: `3062ea363769cc393e59384251f5aedc7e570ac5` (rebased on `origin/dev`)
- **Traceability**:
  - 問題來源: `R30` (`docs/04-uat/system-remediation-20260906/source/findings.json`)
  - 能力來源: `C049`, `C062` (`docs/04-uat/system-remediation-20260906/source/capabilities.json`)
  - 既有修復回歸基準: `DRV-NAV` (`1d4f34d92`), `DRV-AUTH` (`332db5119`), `DRV-SOS` (`6f5d34510`), `DRV-KBD` (`a095698a6`), `DRV-RWD` (`bdd7af68b`)

---

## 1. 問題分析與架構修復說明

### 1.1 R30 原問題重現與根因
在歷史審計中，司機端 Expo web 預覽在 390px 視窗載入首頁、`/onboarding`、`/sos`、`/trip` 路由時崩潰：
- 錯誤訊息：`codegenNativeComponent is not a function`，stack trace 指向 `react-native-maps` 的原生模組載入。
- 根因：`apps/driver-app/components/driver-trip-map.tsx` 靜態引用了 `import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps"`。雖然在組件內部有 `Platform.OS !== "web"` 的判斷，但在 Web 打包與模組載入時，靜態 import 會強制載入 React Native 原生地圖 bridge，導致 Web 環境直接拋出異常。

### 1.2 平台分流架構實作
依據 Expo 與 Metro 官方架構規範，採用副檔名分流機制：
1. **保留原生實作**：`apps/driver-app/components/driver-trip-map.tsx` 保持不變，專門供 iOS 與 Android 原生平台使用，完整保留 Google Map provider、Marker 標記、經緯度同步、多段路線繪製。
2. **新增 Web 預覽實作**：建立 `apps/driver-app/components/driver-trip-map.web.tsx`。
   - 完全移除 `react-native-maps` 靜態 import。
   - 呈現 Web 專屬 Coordinate handoff mode（`Web 預覽使用座標導航交接；原生地圖僅於 iOS／Android 顯示。`）。
   - 保留接單導航模型、自定義目的地座標顯示、外部導航深層連結（Google Maps、Apple Maps、系統預設）、離線與路線鎖定狀態提示。
   - 嚴格遵守 `@drts/ui-tokens` 規範，色彩皆取自 `driverCanvasTheme`（包括將文字色綁定為 `driverCanvasTheme.bg`），無任意 hardcoded 色碼。
3. **工作區路徑支援與測試輔助界線**：
   - 在 `tests/unit/system-remediation/sr-driver-web-001/metro-worktree-harness.cjs` 中提供工作區 monorepo pnpm symlink 的模組路徑支援（`watchFolders` 與 `nodeModulesPaths`），專供隔離 worktree 環境測試執行。
   - **已移除測試端 wasm 猴子補丁**：依審查意見，已徹底移除在 test preload 攔截 `@expo/metro-config` 並動態注入 `wasm` 至 `assetExts` 的測試專用 override，不再掩蓋生產環境真實行為。

---

## 2. 驗收檢查指令與實際執行結果

所有命令皆於指派的工作區 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-driver-web-001` 內實際執行。

| 檢查項目 | 實際執行指令 | Exit Code | 實際輸出摘要 |
| :--- | :--- | :---: | :--- |
| **程式碼格式校驗** | `git diff --check` | `0` | 無任何空白或格式錯誤。 |
| **ESLint 規範檢查** | `pnpm run lint` | `0` | 包含 root 與 20 個 packages/apps 全部 lint 通過 (0 errors, 0 warnings)。 |
| **i18n 多語系檢查** | `pnpm run i18n:guard` | `0` | 525 個檔案掃描通過，無違反 i18n 規範。 |
| **TypeScript 型別檢查** | `pnpm --filter @drts/driver-app typecheck` | `0` | `tsc --noEmit` 檢查通過，無型別錯誤。 |
| **專屬回歸測試** | `pnpm exec vitest run tests/unit/system-remediation/sr-driver-web-001/` | `0` | 1 個測試檔、7 項測試全部通過（涵蓋原生地圖邊界、Web 座標交接、導航授權、iOS/Android 標記、Web import 隔離與路由無原生依賴校驗）。 |
| **既有修復回歸測試** | `pnpm --filter @drts/driver-app exec vitest run tests/unit/driver-navigation.test.ts tests/unit/driver-trip-map.test.ts tests/unit/driver-root-navigator.test.ts tests/unit/driver-bottom-tab-bar.test.ts tests/unit/driver-auth-token-lifecycle.test.ts tests/unit/driver-auth-states.test.ts tests/unit/driver-sos-no-os-dialer.test.ts tests/unit/driver-sos-end-to-end-platform.test.ts tests/unit/keyboard-avoiding-container.test.ts tests/unit/responsive-layout-and-overflow.test.ts tests/unit/driver-route-guards-and-feature-entries.test.ts` | `0` | 11 個測試檔、91 項既有修復測試全部通過，確認未對 DRV-NAV、AUTH、SOS、KBD、RWD 既有功能造成回退。 |
| **預設 Metro 資產之 Web 打包檢查** | `NODE_OPTIONS="--require=.../metro-worktree-harness.cjs" pnpm --filter @drts/driver-app exec expo export --platform web --max-workers 2 --clear --output-dir /tmp/sr-driver-web-001-clear-test` | `1` | 成功重現審查發現：在預設 Metro assetExts（無 wasm override）下，`expo export --platform web` 於 98.7% 停止，報錯 `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm from expo-sqlite/web/worker.ts`。import 鏈來自 `driver-location-offline-queue` -> `driver-location-heartbeat` -> `app/_layout.tsx`。 |

---

## 3. 模組隔離與生產環境先決條件分析

### 3.1 原生地圖隔離（Map Isolation）已完全落實且驗證通過
- Web 端組件 `apps/driver-app/components/driver-trip-map.web.tsx` 經單元測試與 AST import 掃描，100% 排除 `react-native-maps` 原生模組，解決 R30 關於 `codegenNativeComponent is not a function` 的根因。
- 原生雙平台（iOS / Android）保留原生地圖模組與完整的經緯度同步機制，既有 11 個回歸測試檔案（91 項測試）全數維持綠燈。

### 3.2 生產環境 Web 打包缺口與 Supervisor 擴展 Scope 需求
- **重現與根因**：
  司機端 `app/_layout.tsx` 透過 `driver-location-heartbeat.ts` 引用了 `driver-location-offline-queue.ts`，後者使用 `import * as SQLite from "expo-sqlite"`。
  在 Expo Web 環境下，`expo-sqlite` 的 Web 實現會在 Web Worker 中載入 `./wa-sqlite/wa-sqlite.wasm`。
  由於 Metro 預設之 `assetExts` 未包含 `wasm`，且 `apps/driver-app/` 下目前並無生產用之 `metro.config.js`，導致預設的 `expo export --platform web` 無法完成所有路由打包。
- **邊界限制與權責劃分**：
  1. 本任務目前之 `write_scopes` 僅授權：
     - `apps/driver-app/components/driver-trip-map.tsx`
     - `apps/driver-app/components/driver-trip-map.web.tsx`
     - `tests/unit/system-remediation/sr-driver-web-001/`
     - `docs/04-uat/system-remediation-20260906/SR-DRIVER-WEB-001.md`
  2. 新增正式的 `apps/driver-app/metro.config.js`（配置 `config.resolver.assetExts.push('wasm')`）超出本任務之 `write_scopes`。
  3. 依據專案規範與波次守則，Worker 不得擅自修改 `write_scopes` 以外之檔案，亦不得以測試端 monkey-patch（如 harness preload wasm）代替正式產品配置。
  4. 因此，本任務如實記錄此生產先決條件缺口，並向 Supervisor 請求將 `apps/driver-app/metro.config.js` 納入 scope 擴展或由 unblock 規劃任務接入。

---

## 4. 實體界限與未執行項目聲明 (No False Claims)

依據環境限制與任務守則，本驗證明確區分靜態打包／單元測試與 Live／真機環境：
1. **地圖隔離成功，不等於離線佇列 Web 可用**：地圖隔離經測試確認無 `react-native-maps` 依賴；但在生產 Metro 配置正式支援 `.wasm` 前，不宣稱 offline queue 在 Web 端已具備端到端可用性。
2. **Web 靜態檢查通過，不等於瀏覽器端端操作驗收**：已完成型別校驗與單元測試，但受限於 VM 禁止啟動產品預覽服務器（`pnpm dev` / `playwright`），本機未於 Chrome/Safari 等瀏覽器開啟端對端使用者會話。
3. **原生 Hermes 打包驗證，不等於真機硬體驗收**：已驗證原生雙平台保持 native map 引用與既有導航邏輯，但未產出簽章之 IPA/APK，亦未在實體手機上驗證 GPS 晶片定位或真機權限彈窗。
4. **SOS 測試成功，不等於真實緊急撥號**：既有 SOS 測試係在單元層級驗證狀態轉移與備用號碼顯示邏輯，並未向 110/119 或實際值班系統發送緊急警報。
