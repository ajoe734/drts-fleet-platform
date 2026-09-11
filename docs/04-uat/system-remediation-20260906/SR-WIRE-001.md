# SR-WIRE-001 — 新功能模組／導航／資格的唯一整合寫入

- **Task ID**: `SR-WIRE-001`
- **Owner**: `Claude2`
- **Reviewer**: `Claude`
- **Base SHA**: `75136fe3e7c9d143e6a0dbd012e8ec8856ae8127`（`origin/dev` tip，`claude2/sr-wire-001` 由此分出，未落後）
- **Workstream**: `wire` / **Class**: `implementation`
- **Planning Ref**: `docs/04-uat/system-remediation-20260906/source/capabilities.json`（`C012`, `C052`, `C059`, `C071`）
- **Gap IDs**: `N01`, `N02`, `N03`
- **Date**: 2026-09-11 UTC

---

## 1. 任務目標與追溯來源 (Objective & Traceability)

三個既已 `done` 的後端模組（`SR-LEAVE-BE-001`、`SR-ACADEMY-BE-001`、`SR-HOST-BE-001`）與其對應前端各自完成，但實際檢視 `apps/api/src/app.module.ts` 確認三者從未被 import／註冊——`driver-academy.module.ts` 甚至留有明確註記：「Not registered in the root app module by this task. Root wiring ... is owned by SR-WIRE-001.」。三個模組的 controller 因此完全無法從真實 NestJS app 觸達，無論各自模組內部程式碼多正確。同時 IAM 目錄（`iam-policy-catalog.ts`）與 driver-app／fleet-partner-portal-web／ops-console-web 的導覽層也缺對應整合點。本任務為這些新模組、Host 角色映射、以及三端導覽的**唯一**整合寫入者。

---

## 2. 交付內容 (Delivered Changes)

### 2.1 根模組註冊 (`apps/api/src/app.module.ts`)

新增並註冊三個既完成但從未掛載的模組：`DriverLeaveModule`（SR-LEAVE-BE-001）、`DriverAcademyModule`（SR-ACADEMY-BE-001）、`HostViewModule`（SR-HOST-BE-001）。這是三者的 HTTP 路由第一次能從真實 `AppModule` 觸達。

### 2.2 Host 角色映射 (`packages/contracts/src/iam-policy-catalog.ts`)

實際追蹤 Host 的請求路徑（`apps/fleet-partner-portal-web/app/host/lib/host-auth.server.ts` 送出 `x-actor-type: partner_user`）發現一個真實、可重現的缺口：

- `apps/api/src/common/auth/auth.types.ts` 的 `AUTH_ACTOR_TYPES` 已經有 `"partner_user"`（給即時請求解析用），但 `packages/contracts/src/iam-policy-catalog.ts` 的 `IamActorType`／`IAM_ACTOR_POLICY_DEFINITIONS`（僅 7 種，無 `partner_user`）並沒有對應項目。
- `apps/api/src/common/auth/auth.constants.ts` 用 `AUTH_SCOPE_PRESETS = getIamActorScopePresets() as Record<AuthActorType, ...>` 把 catalog 的結果**直接型別斷言**成 `AuthActorType` 的 Record——這個斷言在編譯期通過但執行期是假的：`AUTH_SCOPE_PRESETS.partner_user` 實際上是 `undefined`。
- `auth.extractor.ts` 的 `deriveScopes(actorType, explicitScopes)` 在 `explicitScopes.length === 0` 時執行 `[...AUTH_SCOPE_PRESETS[actorType]]`——對 `partner_user` 而言即 `[...undefined]`，會直接丟出 `TypeError`。
- `host-auth.server.ts` 目前**永遠**明確送出 `x-scopes` header（`HOST_SCOPES` 常數）繞開了這個缺口，所以尚未在生產路徑上炸掉，但這是防禦性巧合，不是設計保證；任何未來省略 `x-scopes` 的 Host 呼叫路徑（或改走 default-preset 的內部服務對服務呼叫）都會撞上這個 `undefined` 展開例外。

修正內容：
- `IAM_ACTOR_TYPES` 新增 `"partner_user"`。
- 新增 `IAM_ACTOR_POLICY_DEFINITIONS` 項目：`{ actorType: "partner_user", realm: "partner", roleFamilies: ["partner"], defaultRoles: ["partner_user"], scopes: ["owned:read", "reports:read", "maintenance:read"] }`，逐字對齊 `host-auth.server.ts` 的 `HOST_SCOPES`。
- `owned:read` / `reports:read` / `maintenance:read` 三個 `IamScopeDefinition.allowedRealms` 加入 `"partner"`（原本都不含 partner realm，與新登記的 `partner_user` 政策自相矛盾）。這是純增補（widen），未移除既有 realm，`tests/unit/system-remediation/sr-iam-001/iam-role-api-matrix.test.ts` 與 `tests/security/*` 全數保持通過（見第 3 節）。

**範圍界線聲明**：`bootstrap-auth.guard.ts` 的路由層授權實際上是 `routePolicy`（`auth.policy.ts`，非本檔案）與 decorator（`@RequireRealms`/`@RequireScopes`）的聯集；`host-view.controller.ts` 本身只用 `@RequireRealms("partner")` 沒有 `@RequireScopes`，所以本次修正**不影響**現有 Host 路由的可達性——它修的是一個獨立、真實存在、目前靠呼叫端防禦性寫死 header 才沒有炸開的 `AUTH_SCOPE_PRESETS` 缺口。

### 2.3 Fleet-partner readiness：training 接入 driver-academy 原 authority (`apps/api/src/modules/fleet-partner/supply-readiness.service.ts`)

`SupplyReadinessService.evaluateDriverReadiness` 之前只有 vehicle 側的 `TRAINING_REQUIRED`（來自 `VehicleEligibilityService`），driver 側從未檢查 `driver-academy` 的必修課程完成狀態。`fleet-partner.module.ts` 並未 import `DriverAcademyModule`（且不在本任務 write_scopes 內，不可修改），因此改用 `ModuleRef.get(AcademyService, { strict: false })`（NestJS 官方支援的跨模組唯讀查找，只要 provider 有在**任一**已啟動模組註冊即可解析，不需要宣告方 import）在 `onModuleInit()` 中惰性解析：

- `isDriverTrainingIncomplete(driverId)`：呼叫 `AcademyService.listCourses(driverId)`（driver-academy 自己的權威資料，含每門課的 `isRequired` 與該司機的 `userStatus`），任一必修課程 `userStatus !== "passed"` 即回傳 `true`。
- `evaluateDriverReadiness` 在此為 `true` 時 push `TRAINING_REQUIRED`（既有 reason code，未新增）。
- **可回復 (reversible)**：無任何快取或持久化旗標，每次請求即時重新查詢 `AcademyService.listCourses`，訓練完成後下一次呼叫立即清除該 reason code（見測試 3）。
- **不污染排除 AV 條件**：完全未觸碰 `RegulatoryRegistryService` 的 `dispatchEligible` / `eligibilityBlockedReasons`（AV/車輛派遣排除的唯一權威欄位）；只新增一個獨立的 readiness reason code，語意上與車輛派遣資格完全分離（見測試 5）。
- **不影響既有呼叫端**：`ModuleRef` 加在建構子**最後**且為 `@Optional()`，既有 4 個參數的手動 `new SupplyReadinessService(...)` 呼叫（`apps/api/tests/unit/supply-readiness.service.test.ts`、`fleet-partner.controller.test.ts`，皆非本任務 write_scopes）維持完全相同的參數綁定與行為，未受影響（見第 3 節重跑結果）。

### 2.4 三端導覽整合

- **`apps/driver-app/app/_layout.tsx`**：`app/leave.tsx`（SR-LEAVE-FE-001）與 `app/academy.tsx`（SR-ACADEMY-FE-001）先前都已合併但從未在 `<Tabs>` 中登記為 `Tabs.Screen`（Expo Router 檔案式路由仍可導覽，但缺少 tab 佈局/主題整合）。比照既有 `shift`/`earnings`/`sos` 的 `href: null` 模式新增兩個 `Tabs.Screen`（`leave` 標題「請假」、`academy` 標題「學院」），不影響底部導覽列（`DriverBottomTabBar` 有自己獨立的 tab 清單，不吃 `Tabs.Screen` 順序），亦未移除或重排任何既有 DRV-NAV 路由。
- **`apps/ops-console-web/lib/ops-shell-nav.ts`**：`app/leave/page.tsx`（司機請假審核佇列，SR-LEAVE-BE-001 已完成的 ops 端頁面）先前沒有任何導覽入口，新增 `key: "leave"` 項目指到 `/leave`。
- **`apps/fleet-partner-portal-web/lib/fleet-portal-nav.ts`**：依 `docs/05-ui/drts-design-canvas/host-screen-contract.md` §1，Host 是與 fleet-admin 完全不同的 actor，**不得**看到 fleet-admin 導覽（`drivers`/`vehicles`/`supply`/`revenue`/`training` 等），因此新增獨立的 `buildHostPortalNav()`（單一項目「自有車輛」→ `/host/vehicles`，逐字對齊該 contract 的 `HOST_NAV`），而不是把 Host 塞進 `buildFleetPortalNav()` 既有清單裡。

---

## 3. 驗證指令與執行結果 (Verification Results)

於本 worktree（`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-wire-001`，branch `claude2/sr-wire-001`，base = candidate SHA，兩者相同因為尚未產生新 commit 前即完整驗證）實際執行：

| 測試指令 | Exit Code | 實際結果摘要 |
| :--- | :---: | :--- |
| `pnpm --filter @drts/contracts build` | 0 | 補建 `packages/contracts/dist`（`apps/api/tsconfig.json` 的 `@drts/contracts` path 指向 dist 非 src；此步驟為既有相依建置順序需求，非本任務引入） |
| `pnpm --filter @drts/api typecheck` | 0 | `@drts/api` 完整 TypeScript 型別檢查 100% 通過（含新的 `ModuleRef` 注入與 `exactOptionalPropertyTypes` 相容） |
| `pnpm --filter @drts/driver-app typecheck` | 0 | 100% 通過 |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck` | 0 | `next typegen` + `tsc --noEmit` 100% 通過 |
| `pnpm --filter @drts/ops-console-web typecheck` | 0 | `next typegen` + `tsc --noEmit` 100% 通過 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-wire-001/` | 0 | 4 test files, **21 passed**（module registration 3、IAM host role 4、supply-readiness training gate 5、nav wiring 9） |
| `pnpm exec vitest run apps/api/tests/unit/supply-readiness.service.test.ts apps/api/tests/unit/fleet-partner.controller.test.ts`（於 `apps/api/`） | 0 | 2 test files, **14 passed**（既有 4 參數建構呼叫無回歸） |
| `pnpm exec vitest run tests/unit/system-remediation/sr-iam-001/ tests/security/ apps/api/tests/unit/auth-bootstrap.test.ts apps/api/tests/unit/ops-driver-tasks-scope.test.ts apps/api/tests/unit/owned-mobility-task-events.test.ts apps/api/tests/unit/driver-sos-incident.test.ts apps/api/tests/unit/multi-taxi-controlled-export.test.ts` | 1（見下） | 18 test files, **173 passed, 2 failed**。唯二失敗為 `tests/security/audit-log-immutability-negative.test.ts`，錯誤訊息為 `psql is not installed and no usable postgres container is running`——與本任務無關的既有環境限制（VM 規則禁止啟動 Docker Compose／DB），非本次變更引入的回歸。 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-leave-be-001/ tests/unit/system-remediation/sr-leave-fe-001/ tests/unit/system-remediation/sr-academy-fe-001/ tests/unit/system-remediation/sr-academy-be-001/ tests/unit/system-remediation/sr-host-be-001/ tests/unit/system-remediation/sr-host-fe-001/` | 0 | 12 test files, **166 passed**（新掛載的三模組與其前端各自既有驗收測試無回歸） |
| `git diff --check` | 0 | 格式與空白檢查 100% 通過，零錯誤 |

---

## 4. 驗收條件對齊說明 (Acceptance Criteria Mapping)

- **「三功能不再依 mock；真 API/DB 從正常 UI 可用、scope 一致」**：`DriverLeaveModule`/`DriverAcademyModule`/`HostViewModule` 現已在 `AppModule` 註冊，其 controller 路由（`/api/driver-leave/*`、`/api/driver-academy/*`、`/api/fleet-partner/training/*`、`/api/host/*`）首次可從真實啟動的 API 觸達；三者內部本就是各自 BE 任務完成的真實 DB-backed 實作（本任務未新增任何 fixture/mock）。
- **「必要 training/leave 與 dispatchability 接入原 authority 且可回復，不污染排除 AV 條件」**：
  - Training：見 §2.3，透過 `ModuleRef` 接入 `AcademyService`（driver-academy 自己的原 authority），reversible，不動 AV/vehicle 派遣排除欄位。
  - Leave：**誠實聲明未完成**，見第 5 節——`DriverLeaveService.assertDriverCanClockIn` 這個現成的「原 authority」入口本應在 `ShiftAttendanceService.clockIn` 呼叫，但因技術限制無法在不擴大 write_scopes 的前提下安全完成，詳見下節。
- **「證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功」**：見第 3 節與第 5 節。
- **「先 commit＋普通 push，再 handoff；owner 不直接 done」**：本文件完成後將以 `git commit` + 普通 push，再以 `handoff` 交付 reviewer `Claude`，不呼叫 `done`。

---

## 5. 未完成事項與誠實聲明 (Known Gaps — Not Faked)

### 5.1 `ShiftAttendanceService.clockIn` 未接入 `DriverLeaveService`（需要 scope 擴大）

`DriverLeaveService.assertDriverCanClockIn(driverId)` 是 driver-leave 模組自己設計、專門給這個呼叫點用的「原 authority」（其 docstring 明寫「cannot clock in」），理論上是最乾淨的整合點。實際嘗試接入後發現兩個非本任務 write_scopes 內、且無法安全繞過的阻塞：

1. **DI 邊界**：`assertDriverCanClockIn` 需要查資料庫（`this.repository.findByDriver(...)`），是 `async`。`ShiftAttendanceService.clockIn()` 目前是**同步**方法。
2. **Controller 邊界**：`apps/api/src/modules/shift-attendance/shift-attendance.controller.ts`（非本任務 write_scopes）目前是 `toApiSuccessEnvelope(this.shiftAttendanceService.clockIn(effectiveCommand, requestId), requestId)`——**沒有 `await`**，`toApiSuccessEnvelope` 也是純同步函式，直接把傳入值放進 `{ data, meta }`。若把 `clockIn` 改成回傳 `Promise`，controller 不會等待它 resolve，回應會把未展開的 `Promise` 物件序列化進 `data`（等同回傳 `{}`），造成真實 API 回應損毀的回歸——這比完全不做還糟。

`supply-readiness.service.ts` 的 training 整合之所以能在不動 `.module.ts`/`.controller.ts` 的前提下完成，是因為它的對外方法本來就已經是 `async`（controller 那端已經 `await` 了，見 `fleet-partner.controller.ts` 第 624–667 行），只是內部呼叫鏈是同步——這正是 leave/clockIn 這條路徑不成立的原因：`shift-attendance.controller.ts` 的 `clockIn` handler 本身就不是 `async`。

**未做（誠實聲明）**：本任務**未**修改 `shift-attendance.service.ts` 的行為，`clockIn` 目前仍只檢查既有的 vehicle dispatchability（`RegulatoryRegistryService.getVehicleDispatchability`），不檢查 driver 請假狀態。這不是遺漏，是評估後判定：在不擴大 scope 到 `apps/api/src/modules/shift-attendance/shift-attendance.controller.ts`（改成 `async clockIn` 並 `await`）與 `apps/api/src/modules/shift-attendance/shift-attendance.module.ts`（若改用直接 DI 而非 `ModuleRef`）的前提下，任何實作都會是要嘛不生效（silent no-op）要嘛破壞現有 API 回應——兩者都比誠實地不做更差。**需要 supervisor 明確擴大 write_scopes 至上述兩個檔案，才能安全完成這部分。**

（附註：driver-leave 模組自己已經把 `DRIVER_ON_LEAVE` 寫進 `ops.phase1_driver_matching_suppressions`——這是給「派單媒合」引擎讀的排除清單，但實際檢視 `RegulatoryRegistryService.getEligibleCandidates`（媒合候選查詢的唯一實作）後確認它完全不讀這張表，只用 `decorateDriver(...).dispatchEligible`。這是另一個獨立、更深層的「leave 未真正接入派單媒合原 authority」缺口，落在 `regulatory-registry.service.ts`——同樣不在本任務 write_scopes 內，一併記錄供 supervisor 排入後續 scope。）

### 5.2 Host 專屬 shell／導覽尚未真正切換（需要 scope 擴大）

`buildHostPortalNav()`（§2.4）已經寫好、也有測試涵蓋其形狀完全符合 `host-screen-contract.md` 的 `HOST_NAV`，但**尚未被任何地方呼叫**：`apps/fleet-partner-portal-web/app/layout.tsx`（非本任務 write_scopes）目前對**所有**路由（含 `/host/*`）一律套用 `FleetPortalShell` + `buildFleetPortalNav()`（fleet-admin 完整導覽）。要讓 Host session 真正只看到「自有車輛」單一入口，需要 `app/layout.tsx`（偵測 `x-actor-type: partner_user` 或等價的 Host 身分信號，改呼叫 `buildHostPortalNav()`）與可能的 `components/fleet-portal-shell.tsx` 一併擴大 scope 才能完成切換邏輯。本任務刻意**不**把 Host 項目塞進 `buildFleetPortalNav()`（那樣會讓 fleet-admin 使用者的導覽多一個不相關項目，且與 host-screen-contract.md §1「Host must not see fleet-admin nav items」的精神互相矛盾的反向情況——fleet-admin 也不該看到 Host 專屬捷徑），而是準備好一個獨立、正確的建構函式等待後續 scope 擴大接上。

### 5.3 未執行之 live／真機環境項目

依 VM 環境限制（不得啟動 Docker Compose、product dev server 或瀏覽器測試），以下項目明列未執行，不冒充成功：
1. 未啟動真實瀏覽器對 `apps/fleet-partner-portal-web`／`apps/ops-console-web`／`apps/driver-app` 進行實機導覽點擊驗證；本次僅以 typecheck 與單元測試（含 UI nav builder 的純函式輸出驗證）確認邏輯正確。
2. 未啟動 Postgres 對 `SupplyReadinessService` 的 training gate 做真實 DB 整合測試；`tests/unit/system-remediation/sr-wire-001/supply-readiness-training-gate.test.ts` 以受控 stub 驗證 `ModuleRef` 解析與 reason code 邏輯，真實環境下 `AcademyService.listCourses` 對 DB 的查詢已由 `SR-ACADEMY-BE-001` 自己的驗收證據涵蓋。
