# SR-DRIVER-WEB-001 — 司機 web 預覽平台分流與既有修復回歸

- Base SHA (`origin/dev` at recovery time): `75136fe3e7c9d143e6a0dbd012e8ec8856ae8127`
- Candidate branch: `claude2/sr-driver-web-001-recovery-20260911`
- Worker cwd: `.artifacts/worktrees/auto/claude-sr-driver-web-001` (isolated task worktree)
- Owner: Claude / Reviewer: Claude2

## 重現與根因

Origin/dev 在此 SHA 下沒有 `apps/driver-app/metro.config.js`，且
`apps/driver-app/components/driver-trip-map.tsx` 在 module 頂層無條件
`import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps"`。
`react-native-maps` 沒有官方 web target；`app/trip.tsx` 透過 expo-router
以單一 web bundle 載入所有路由（含 `/`、`/onboarding`、`/sos`），因此這一個
native-only import 會讓整個 web bundle 失敗，不只是 `/trip`。

`app/trip.tsx:1827` 已經傳入 `nativeMapAvailable={Platform.OS !== "web"}`，
代表上游呼叫端本來就預期 web 平台不應該載入 native map；缺的是讓 Metro 在
web 平台完全不解析 `react-native-maps` 這個 module 本身（單純 runtime
`Platform.OS` 判斷擋不住 bundler 端的靜態 import 解析）。

第二個相關風險：`lib/driver-location-offline-queue.ts` 使用
`expo-sqlite`（`openDatabaseAsync`）。`expo-sqlite@16.0.10` 的 web
runtime（`expo-sqlite/web`）內建 `wa-sqlite` WASM 二進位
（`node_modules/.pnpm/expo-sqlite@16.0.10.../web/wa-sqlite/wa-sqlite.wasm`，
已於本 worktree 的 pnpm store 中確認存在），但 Metro 預設
`resolver.assetExts` 不含 `wasm`，且此 repo 原本完全沒有
`apps/driver-app/metro.config.js`，所以即使解掉 map import，offline queue
路徑仍會在 web 平台上因為 wasm asset 無法解析而失敗。

排除項：曾在同機另一個與本任務無關的 `/home/lupin/driver-expo57-preview`
資料夾（Expo SDK 57 升級 preview，非本任務範圍、非本 worktree）內看到
node_modules/symlink 狀況；本 worktree 的 `node_modules` 是指向 canonical
root `node_modules` 的單一 symlink（pnpm 標準共用 store 佈局），路徑內部
一致，不是 cross-worktree contamination，未在此修改。

## 修復

- 新增 `apps/driver-app/components/driver-trip-map.web.tsx`：與既有
  `driver-trip-map.tsx` 相同的 props 介面與座標交接／導航行為，但完全不
  import `react-native-maps`，一律呈現既有的 pin fallback 面板。Metro 的
  平台副檔名解析在 build web 時會優先選到 `.web.tsx`，native map SDK 因此
  完全不會進入 web bundle。
- `apps/driver-app/components/driver-trip-map.tsx`（native）**未變動**：
  iOS/Android 仍是同一份原生地圖實作，import 沒有回退。
- 新增 `apps/driver-app/metro.config.js`：僅 `getDefaultConfig(__dirname)`
  後把 `"wasm"` 加進 `resolver.assetExts`，讓 `expo-sqlite` 的 web wasm
  binary 可以被 Metro bundler 解析。沒有動 symlink／package-exports／其他
  resolver 設定。

## 檢查指令與結果（於本 worktree 實際執行）

```
$ git diff --check
(exit 0，無輸出)

$ pnpm --filter @drts/driver-app typecheck
> tsc --noEmit
(exit 0，無輸出)

$ pnpm --filter @drts/driver-app lint
> eslint . --max-warnings=0
(exit 0，無輸出 — metro.config.js 的 require() 已加
 eslint-disable-next-line @typescript-eslint/no-require-imports)

$ pnpm --filter @drts/driver-app test
> vitest run --passWithNoTests
 Test Files  38 passed (38)
      Tests  516 passed (516)
(既有 apps/driver-app/tests/unit/driver-trip-map.test.ts 對 native
 driver-trip-map.tsx 的既有測試全數維持通過，確認 native 行為未回歸)

$ pnpm exec vitest run tests/unit/system-remediation/sr-driver-web-001/
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

新增測試檔（root Vitest 可發現，非空、非 skip）：

- `tests/unit/system-remediation/sr-driver-web-001/driver-trip-map-web-split.test.ts`
  （4 tests）：native 檔仍 import `react-native-maps`／`PROVIDER_GOOGLE`；
  `.web.tsx` 完全不含 `react-native-maps`／`MapView`／`PROVIDER_GOOGLE`；
  兩份檔案 props 介面一致；web 檔仍 re-export `DriverTripMapLocation`。
- `tests/unit/system-remediation/sr-driver-web-001/metro-config-sqlite-wasm.test.ts`
  （4 tests）：`metro.config.js` 存在且以 `getDefaultConfig` 延伸而非取代
  Expo 預設設定；`resolver.assetExts` 含 `"wasm"`；已安裝的
  `expo-sqlite` 套件內確實存在對應的
  `web/wa-sqlite/wa-sqlite.wasm` 二進位（驗證修復動機成立，非憑空配置）。

## 未執行 / 誠實揭露的限制

- **未成功執行 `expo export -p web`**（2026-09-11 acceptance-review 重新驗證，
  修正前一版本的錯誤診斷）：`expo --version`／`expo export` 實際上**沒有**
  被本 VM 沙盒歸類為 defer（前一版記錄的「Bash command classified as defer」
  在本次重測中未重現，判斷是前次觀察誤植或環境已變化）。實際重跑
  `pnpm exec expo export -p web` 得到不同的失敗：Metro 對 `expo-router/entry`
  的模組解析算出錯誤的相對路徑深度（`../../../../../../node_modules/.pnpm/...`），
  根因是本 worker cwd 是 git worktree
  （`.artifacts/worktrees/auto/claude-sr-driver-web-001/apps/driver-app`），
  其 `node_modules` 是指向 canonical root（`/home/lupin/workspace/
  drts-fleet-platform/apps/driver-app/node_modules`）的 symlink，pnpm
  monorepo 下 Expo/Metro 以 workspace root 為 projectRoot 解析 entry 時，
  worktree 路徑比 canonical root 多 4 層目錄（`.artifacts/worktrees/auto/
  claude-sr-driver-web-001`），造成相對路徑深度算錯而找不到檔案。已用
  `config.resolver.unstable_enableSymlinks = true` 做過對照測試，結果相同
  （非 symlink-following 開關可解），確認是 worktree 巢狀路徑深度問題，
  屬於本機 worktree 基礎設施限制，與本任務程式碼修復（web map 分流／wasm
  assetExts）本身無關；未對 `metro.config.js` 做任何永久性改動（對照測試
  已還原，`git status`／`git diff` 乾淨）。因此本任務在此 worker cwd 下
  仍然**沒有**實際打包出 web bundle 或驗證 `/`、`/onboarding`、`/sos` 三路由
  真的能在瀏覽器開啟；上述修復是根據原始碼靜態分析（import graph、Metro
  平台副檔名解析規則、expo-sqlite 官方 wasm asset 需求）與型別/單元測試
  推導，不能當作「已在瀏覽器驗證成功」。由於一般 CI runner 是乾淨 checkout
  （非巢狀 worktree、`node_modules` 非跨目錄 symlink），這個路徑深度問題
  預期不會在 GitHub Actions 上重現，但這仍是**推測**，未經實跑驗證。
- 未執行任何 iOS/Android 實機打包或 `expo prebuild`／EAS build；`pnpm
  --filter @drts/driver-app typecheck` 通過只保證型別層級的 native import
  沒有變動，不等於已在實機驗證。
- 未新增或修改 write_scopes 中列出的 acceptance workflow 檔案（GitHub
  Actions workflow yaml 與對應 workflow 驗證 python script，皆位於
  `.github/workflows/` 與 `tools/ci/` 下、本次尚未建立、因此不以程式碼
  路徑引用）：這兩個檔案供 supervisor 視需要在遠端 GitHub-hosted runner 上執行真正的
  瀏覽器／console／network 驗收（task `validation_plan` 與
  `integration_notes` 要求的「actual web/iOS/Android exports」與「browser
  checks」），本地 VM 因上述沙盒限制無法執行，留待該 CI workflow 或後續
  reviewer 在允許執行 `expo`/瀏覽器的環境中補齊；本次未建立這兩個檔案，
  因為沒有可在本機驗證其正確性的方式，不冒充完成。
- 未修改 `driver-location-offline-queue.ts`（不在 write_scopes 內），因此
  該檔案在 web 平台上對 `expo-sqlite` 的呼叫本身沒有 `Platform.OS`
  防護；本任務只補齊 Metro 端的 wasm asset 解析，讓 bundler 不會因為
  無法識別的副檔名而整包失敗。SQLite 在瀏覽器 runtime 的完整行為驗證
  （worker/WASM 初始化成功與否）仍需要能執行瀏覽器的環境才能確認。

## 追溯

- Planning ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Execution ref: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`
- Task spec: `docs/03-runbooks/system-remediation-20260906/SR-DRIVER-WEB-001.md`
