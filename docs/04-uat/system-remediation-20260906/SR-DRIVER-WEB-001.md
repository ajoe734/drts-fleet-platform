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
3. **隔離環境與 Worktree Bundler 支援**：
   - 在測試寫入範圍 `tests/unit/system-remediation/sr-driver-web-001/metro-worktree-harness.cjs` 中提供工作區模組路徑支援與 WebAssembly (`.wasm`) asset 副檔名識別，解決 `expo-sqlite` 在 Web worker 中的 `wa-sqlite.wasm` 打包解析，確保不更動未授權的中央設定檔即能完成完整打包驗證。

---

## 2. 驗收檢查指令與實際執行結果

所有命令皆於指派的工作區 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-driver-web-001` 內實際執行。

| 檢查項目 | 實際執行指令 | Exit Code | 實際輸出摘要 |
| :--- | :--- | :---: | :--- |
| **程式碼格式校驗** | `git diff --check` | `0` | 無任何空白或格式錯誤。 |
| **TypeScript 型別檢查** | `pnpm --filter @drts/driver-app typecheck` | `0` | `tsc --noEmit` 檢查通過，無型別錯誤。 |
| **專屬回歸測試** | `pnpm exec vitest run tests/unit/system-remediation/sr-driver-web-001/` | `0` | 1 個測試檔、7 項測試全部通過（涵蓋原生地圖邊界、Web 座標交接、導航授權、iOS/Android 標記、Web import 隔離與路由無原生依賴校驗）。 |
| **既有修復回歸測試** | `pnpm --filter @drts/driver-app exec vitest run tests/unit/driver-navigation.test.ts tests/unit/driver-trip-map.test.ts tests/unit/driver-root-navigator.test.ts tests/unit/driver-bottom-tab-bar.test.ts tests/unit/driver-auth-token-lifecycle.test.ts tests/unit/driver-auth-states.test.ts tests/unit/driver-sos-no-os-dialer.test.ts tests/unit/driver-sos-end-to-end-platform.test.ts tests/unit/keyboard-avoiding-container.test.ts tests/unit/responsive-layout-and-overflow.test.ts tests/unit/driver-route-guards-and-feature-entries.test.ts` | `0` | 11 個測試檔、91 項既有修復測試全部通過，確認未對 DRV-NAV、AUTH、SOS、KBD、RWD 既有功能造成回退。 |
| **原生打包檢查 (iOS & Android)** | `NODE_OPTIONS=--require="/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-driver-web-001/tests/unit/system-remediation/sr-driver-web-001/metro-worktree-harness.cjs" pnpm --filter @drts/driver-app exec expo export --platform ios --platform android --max-workers 2 --source-maps --output-dir /tmp/sr-driver-web-001-native-recheck` | `0` | 產出 iOS (`entry-a4e20dc104ada20339044b9c01980de2.hbc`) 及 Android (`entry-61590477ca965e3b1c9b827959f9f357.hbc`) Hermes bytecode。經 source map 驗證：iOS/Android 均載入 `driver-trip-map.tsx` 與 22 個 `react-native-maps` 原生模組，未載入 `.web.tsx`。 |
| **Web 預覽打包檢查** | `NODE_OPTIONS=--require="/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-driver-web-001/tests/unit/system-remediation/sr-driver-web-001/metro-worktree-harness.cjs" pnpm --filter @drts/driver-app exec expo export --platform web --max-workers 2 --source-maps --output-dir /tmp/sr-driver-web-001-web-recheck` | `0` | 產出 Web bundle (`entry-58b6cd43a7d32f3ee5a454cf1e3f824a.js`)、Worker (`worker-9ea877d459d6e29953328f87def19803.js`) 與 `wa-sqlite.wasm`。經 source map 驗證：Web bundle 載入 `driver-trip-map.web.tsx`，完全排除 `react-native-maps`（0 個來源）；完整包含首頁 `/`、`/onboarding`、`/sos` 及 `/trip` 等所有司機端路由。 |

---

## 3. 打包模組驗證詳細證據

### 3.1 原生打包驗證 (iOS / Android)
- **輸出目錄**: `/tmp/sr-driver-web-001-native-recheck`
- **iOS Source Map 解析**:
  ```text
  driver-trip-map 來源: ['/apps/driver-app/components/driver-trip-map.tsx']
  react-native-maps 來源數: 22 個
  ```
- **Android Source Map 解析**:
  ```text
  driver-trip-map 來源: ['/apps/driver-app/components/driver-trip-map.tsx']
  react-native-maps 來源數: 22 個
  ```
- **結論**: 原生雙平台嚴格保留原生地圖 SDK 及其綁定，未引用 Web 分流檔案。

### 3.2 Web 預覽打包驗證 (Web)
- **輸出目錄**: `/tmp/sr-driver-web-001-web-recheck`
- **Web Source Map 解析**:
  ```text
  driver-trip-map 來源: ['/apps/driver-app/components/driver-trip-map.web.tsx']
  react-native-maps 來源數: 0 個 (完全隔離)
  ```
- **Web 包含的關鍵司機路由**:
  - `apps/driver-app/app/_layout.tsx` (根佈局)
  - `apps/driver-app/app/index.tsx` (司機工作台首頁)
  - `apps/driver-app/app/onboarding.tsx` (司機開通註冊)
  - `apps/driver-app/app/sos.tsx` (緊急求助 SOS)
  - `apps/driver-app/app/trip.tsx` (行程任務與地圖預覽)
  - `apps/driver-app/app/earnings.tsx`, `app/jobs.tsx`, `app/shift.tsx` 等其餘司機頁面
- **SQLite WASM 資產輸出**:
  - `wa-sqlite.783a2e11efab57e42036efde040ea8fd.wasm` (618 kB) 成功隨 Web worker 導出，離線佇列於 Web 端可正常載入。

---

## 4. 實體界限與未執行項目聲明 (No False Claims)

依據環境限制與任務守則，本驗證明確區分靜態打包／單元測試與 Live／真機環境：
1. **Web Export 打包成功，不等於瀏覽器端端操作驗收**：已成功產出無 native 地圖依賴之靜態 web bundle，但受限於 VM 禁止啟動產品預覽服務器（`pnpm dev` / `playwright`），本機未於 Chrome/Safari 等瀏覽器開啟端對端使用者會話。
2. **原生 Hermes 打包成功，不等於真機硬體驗收**：已驗證 iOS/Android Hermes bytecode 正確包含 native map 模組與既有導航邏輯，但未產出簽章之 IPA/APK，亦未在實體手機上驗證 GPS 晶片定位或真機權限彈窗。
3. **SOS 測試成功，不等於真實緊急撥號**：既有 SOS 測試係在單元層級驗證狀態轉移與備用號碼顯示邏輯，並未向 110/119 或實際值班系統發送緊急警報。
