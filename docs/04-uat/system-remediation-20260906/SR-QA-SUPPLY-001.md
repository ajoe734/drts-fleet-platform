# SR-QA-SUPPLY-001 — 供給文件／資格／合約／退場驗收

Owner：Claude；Reviewer：Claude2。日期：2026-09-11 UTC。

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`claude/sr-qa-supply-001`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-qa-supply-001`
- **基準 SHA (Base SHA)**：`d9f676659` (`origin/dev` HEAD at task start)
- **候選 SHA (Candidate SHA)**：與本文件同一 commit（見 handoff 紀錄的 `CANDIDATE_SHA`）
- **任務類型與工作流**：Priority P1 / Workstream `qa` / Class `verification`
- **規劃參照 (Planning Reference)**：
  - `docs/04-uat/system-remediation-20260906/source/capabilities.json`（`C063,C064,C065,C066,C067,C069,C070,C072,C073`）
  - `docs/04-uat/system-remediation-20260906/source/findings.json`、`source/new-gaps.json`
  - `docs/03-runbooks/system-remediation-20260906/SR-QA-SUPPLY-001.md`
  - `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`
- **前置任務（皆已 canonical done 並 merge 至 `origin/dev`，先於本任務讀取其現況而非重做）**：
  - `SR-UAT-HARNESS-001`（merged `1106728a6b53`）
  - `SR-FLEET-FORM-001`（merged, PR #1723）— 提供 C070 的修復
  - `SR-ADMIN-VERIFY-001`（merged `feaf5c7f2609`）
  - `SR-OPS-CONTRACT-001`（merged, PR #1938）
  - `SR-ENTERPRISE-SEARCH-001`（merged `6cddb9cba14a`）— 提供 C069 的修復
  - `SR-FLEET-CASE-001`（merged `49d365eec908d`）— 提供 C067 的修復

### 9/6 audit SHA 與目前程式真值的差異

9/6 audit（`findings.json`/`capabilities.json`）記錄的是**歷史觀察**，不是本次 base SHA 的當前程式真值。本任務在 base SHA `d9f676659` 上重新檢驗 9 項能力，結果：

| 能力 | 9/6 audit 狀態                                    | 本次在 base SHA 重新檢驗的結果                                                                                                                                                                               |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C063 | 故障（128/96 vs 真清單 2/1 不一致，fixture 混用） | **部分修復，仍有殘留風險**——見下方「發現與未解問題」                                                                                                                                                         |
| C064 | 故障（車輛頁新增/匯出按鈕無反應）                 | **已修復**（by SR-FLEET-FORM-001 之後的迭代）——新增入口已導向 `/supply/vehicles/new`、`/supply/drivers/new` 真實表單，本任務新增之回讀測試驗證通過；匯出按鈕本次檢視已不存在於清單頁（非「有按鈕但無反應」） |
| C065 | 待驗證                                            | 本任務新增之測試**首次驗證通過**（真檔案 checksum、掃描狀態、覆蓋版本、過期補件）                                                                                                                            |
| C066 | 已測片段                                          | 本任務新增之測試**首次驗證通過**（競態、舊 revision 拒絕、核可寫 canonical registry）                                                                                                                        |
| C067 | 實作缺口                                          | 已由 `SR-FLEET-CASE-001` 修復；本任務新增回歸測試確認現況仍正確                                                                                                                                              |
| C069 | 故障                                              | 已由 `SR-ENTERPRISE-SEARCH-001` 修復；本任務新增回歸測試確認現況仍正確                                                                                                                                       |
| C070 | 故障                                              | 已由 `SR-FLEET-FORM-001` 修復；本任務新增回歸測試確認現況仍正確                                                                                                                                              |
| C072 | 待驗證                                            | 本任務新增之測試**首次驗證通過**（過期、排他性、文件缺漏均阻擋派車）                                                                                                                                         |
| C073 | 待驗證                                            | 本任務新增之測試**首次驗證通過**（退場阻擋派車、debranding 閉環與證據保存）                                                                                                                                  |

## 2. 測試涵蓋與檔案 (Test Coverage)

所有測試位於 `tests/unit/system-remediation/sr-qa-supply-001/`，共 5 個檔案、39 個測試，全數針對**現行、已上線的真實 service 類別**（非 mock 業務邏輯本身），只在缺少 Postgres 的沙箱環境下以 service 的「無 repository」in-memory 分支執行（詳見第 4 節 NOT COVERED）。

1. `sr-qa-supply-001-registry-eligibility.test.ts`（9 tests，C072 + C073）
   - 對 `RegulatoryRegistryService`（`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`）直接呼叫真實方法：
     - 零文件的新車 → `contract_missing / insurance_missing / exclusivity_missing` 阻擋派車。
     - 已過期保單（`effectiveUntil` 在過去）在核准當下即被判定 `insurance_expired`，阻擋派車；補上有效保單後恢復。
     - 已過期合約 (`contract_expired`) 阻擋派車；補上有效合約後恢復。
     - 重新申報排他性委託會**取代**（而非疊加）原委託，同一車輛不可能有兩筆「有效」委託同時存在。
     - 查詢不存在的車輛拋出 `VEHICLE_NOT_FOUND`（404）。
     - 啟動退場（`initiateVehicleOffboarding`，`debrandingRequired: true`）即使合約/保險/排他性皆健康，仍立即阻擋派車（`offboarding_pending_debranding`）並把車輛排除在 `getEligibleCandidates()` 候選清單外；狀態變更會發布 `publishSupplyLifecycleUpdated` 事件。
     - `completeVehicleDebranding` 寫入 `debrandingCompletedAt` 與保留原 `debrandingTicketId`（工單證據），並恢復派車資格。
     - 沒有待辦 debranding 時呼叫 `completeVehicleDebranding` 會被拒絕，不可重複結案。
     - 免 debranding 的退場會直接完成，不留下阻擋標記。
2. `sr-qa-supply-001-review-workflow.test.ts`（8 tests，C066）
   - 對 `SupplyReviewService` 直接呼叫真實方法（使用其內建 seed 資料 `sub_t02`、`sup-sub-demo-002` 等）：
     - 受理（`startSubmissionReview`）成功轉態並遞增 revision。
     - 兩位審核人對同一送件競態：後到者帶舊 `expectedRevisionNo` 被拒絕（`SUBMISSION_REVISION_CONFLICT`）。
     - 對已核准的送件用舊 revision 快照嘗試駁回 → 409 revision 衝突；即使補上最新 revision，`approved` 狀態仍不在 `rejectSubmission` 允許的來源狀態內 → `INVALID_STATE_TRANSITION`（舊 revision 拒絕的兩種型態都覆蓋）。
     - 送件人不可核准自己的送件（`REVIEWER_SELF_APPROVAL_DENIED`），即使 revision 正確。
     - 缺少 `reasonCode` 在任何狀態變更前即被拒絕。
     - 核准 `sup-sub-demo-002`（已有核准的合約文件、保險文件）→ 真實寫入 `RegulatoryRegistryService` 的 vehicle／contract／policy／passenger disclosure profile（比對核准前後筆數與欄位值，非 echo 假資料），且重複核准同一送件不會建立重複的 canonical 記錄。
     - 尚未進入 `in_review` 的送件不可直接要求修改。
     - 對不存在的 submissionId 動作回 `NOT_FOUND`。
3. `sr-qa-supply-001-document-lifecycle.test.ts`（11 tests，C064 + C065）
   - 對 `SupplySubmissionService` + `SupplyDocumentService` 直接呼叫真實方法：
     - 建立車輛／司機草稿後以 `getSupplySubmissionDetail` 回讀，欄位（含正規化後的車牌大寫）完全吻合（C064 各入口導向同一表單和回讀）。
     - 重複車牌（含大小寫不同）在草稿與 canonical registry 兩層都會被擋下（`PLATE_ALREADY_EXISTS`）。
     - 上傳文件使用 `node:crypto` 對實際位元組內容計算的真實 SHA-256（非固定字串），成功後文件狀態為 `pending`（待審），送件 revision 正確遞增。
     - 偽造／格式錯誤的 checksum 被拒絕（`VALIDATION_ERROR`）。
     - `objectKey` 與已核發的上傳意圖不符（偽造送達）被拒絕（`UPLOAD_URL_INVALID`）。
     - 使用 `vi.useFakeTimers()` 讓時間前進超過 15 分鐘，驗證過期的上傳意圖在 confirm 時被拒絕。
     - 缺少必要文件（`vehicle_registration`／`insurance_policy`／合約類文件其一）時送件被 `DOCUMENT_REQUIRED` 擋下；補齊三份真實文件後才可成功送出（退補閉環）。
     - 上傳一份 `effectiveUntil` 已過期的必要文件後，送件被 `DOCUMENT_EXPIRED` 擋下（過期補件）。
     - 文件層級的 revision 競態：帶舊 revision 建立上傳意圖被拒絕（`SUBMISSION_REVISION_CONFLICT`）。
     - 跨租戶刪除他人文件被拒絕（`FLEET_SCOPE_DENIED`）。
4. `sr-qa-supply-001-kpi-dashboard.test.ts`（5 tests，C063）— 見下方「發現與未解問題」。
5. `sr-qa-supply-001-regression-c067-c069-c070.test.ts`（6 tests，C067/C069/C070 回歸）
   - C067：對 `FleetPartnerCaseService` 直接呼叫 `submitReply`／`getCaseTimeline`，確認 fleet 擁有的非結案案件可回覆且立即出現在 Ops timeline；已結案案件與跨車行案件被拒絕。
   - C069：對 `buildEnterpriseBookingSearchQuery` 純函式驗證組合篩選會產生正確的查詢物件，清除篩選後查詢物件不殘留條件。
   - C070：對 `fleet-portal-supply.ts` 的 `fieldId`／`hasUnsavedDraftChanges`／`shouldConfirmDraftNavigation` 驗證欄位 id 穩定綁定、離頁草稿保護邏輯仍正確。
   - 額外健檢：`RegulatoryRegistryService` 在前置任務全部合併後的 base SHA 上仍可正常建構並提供種子資料，作為相依任務合併完整性的簡單訊號。

## 3. 驗證執行紀錄與實際結果 (Verification Evidence)

所有檢查皆於隔離任務工作樹 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-qa-supply-001` 執行，只寫入 write_scopes 內的檔案。

| 檢查項目 / 指令                                                                                                                                                                                                                                             | Exit Code | 實際結果摘要                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git diff --check` (staged sr-qa-supply-001 test files)                                                                                                                                                                                                     | 0         | 零 whitespace error                                                                                                                                    |
| `pnpm exec vitest run tests/unit/system-remediation/sr-qa-supply-001/`                                                                                                                                                                                      | 0         | 5 test files, **39 passed**（0 失敗、0 skip）                                                                                                          |
| `pnpm run test:unit tests/unit/system-remediation/sr-qa-supply-001/`                                                                                                                                                                                        | 0         | Root vitest 設定（`vitest.config.ts` 的 `tests/unit/**` glob）下同樣 39 passed                                                                         |
| `pnpm exec eslint tests/unit/system-remediation/sr-qa-supply-001/`                                                                                                                                                                                          | 0         | 零錯誤零警告                                                                                                                                           |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                                                                         | 0         | API 端型別檢查通過（零錯誤，需先 `pnpm --filter @drts/control-plane-auth build` 產生 `dist/index.d.ts`，此為既有 monorepo 建置需求，與本任務改動無關） |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck`                                                                                                                                                                                                    | 0         | `next typegen && tsc --noEmit` 通過                                                                                                                    |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck`                                                                                                                                                                                                     | 0         | `tsc --noEmit` 通過                                                                                                                                    |
| `pnpm run i18n:guard`                                                                                                                                                                                                                                       | 0         | 558 檔案掃描，零違規（55 個既有 baseline 豁免，與本任務無關）                                                                                          |
| `python3 tools/ci/check_test_coverage.py`                                                                                                                                                                                                                   | 0         | 70 test files 全數對應 CI 路徑（含本任務新增 5 檔）                                                                                                    |
| `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-case-001/ tests/unit/system-remediation/sr-enterprise-search-001/ tests/unit/system-remediation/sr-fleet-form-001/ tests/unit/system-remediation/sr-ops-contract-001/`（前置任務既有套件回歸） | 0         | 5 test files, **93 passed**，確認 C067/C069/C070/N13/N14 的既有驗收在本任務 base SHA 上仍全數維持                                                      |

環境備註：本工作樹初始 `node_modules` 為指向 canonical root 的 symlink，而 canonical root 的部分套件（`vitest`、`@nestjs/*` 等）又 symlink 進一個已被清除的其他 worker 工作樹（`claude2-sr-proof-001`），造成 `MODULE_NOT_FOUND`。修復方式：僅在本工作樹內執行 `mv node_modules node_modules.bak-broken-symlink` 後 `pnpm install`（全部套件皆命中本機 pnpm store，9.3 秒完成，未觸及 canonical root 或其他 worker 的檔案）。此為環境層級的既存缺陷，非本任務程式碼造成。

## 4. NOT COVERED（明列未做的 live／真機部分，不冒充成功）

- **Postgres／DB-backed 交易路徑**：`SupplySubmissionRepository`、`RegulatoryRegistryRepository` 在無 `DATABASE_URL` 時走 in-memory 分支（與 DB-backed 分支共用同一組驗證/業務邏輯函式，僅交易與持久層未覆蓋）。本沙箱無 Postgres、禁止啟動 Docker Compose，故 `withTransaction`/`lockSubmission` 等交易鎖定路徑未執行。
- **`tests/e2e/system-remediation/sr-qa-supply-001/`（Playwright 瀏覽器驗收）**：本次派工的 VM restriction 明確禁止在此沙箱執行 `pnpm exec playwright`、`pnpm dev`、`docker compose`。為避免「寫了測試檔卻從未真的跑過」而冒充完成，本任務**未建立**該目錄下的 e2e spec；`test_commands` 中列出的 `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-supply-001` 未執行。若需要瀏覽器層級驗收，需由具備啟動開發伺服器/瀏覽器權限的環境（例如 CI）執行。
- **真實檔案儲存後端（S3/GCS 等）**：`SupplyDocumentService.createUploadUrl` 回傳的是站內 presigned URL 格式字串，未對接真實物件儲存；本任務驗證的是「真實 SHA-256 對應真實位元組」與 service 層的驗證邏輯，未驗證真實上傳/下載往返。
- **平台供給審核員的真實登入/權限矩陣**：本任務直接呼叫 service 方法而非透過 HTTP + 認證中介層，因此未覆蓋 controller 層的角色/權限守門（該部分屬於既有 auth 模組職責，非本任務 write_scopes）。

## 5. 發現與未解問題（C063 殘留風險，已依規建立來源子任務而非本任務內直接改業務碼）

`sr-qa-supply-001-kpi-dashboard.test.ts` 對 `loadDashboard()`（`apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts`）用真實函式＋可控 fake API client 重現 9/6 audit 的確切情境（driver 清單 API 回傳 2 筆真實資料、dashboard aggregate API 回傳 `activeDriverCount: 128`）：

- **正常案例**（aggregate 與清單一致）：KPI 正確顯示與清單筆數相同的數字。
- **殘留風險案例**：目前程式碼在 `driversError === null` 分支中**優先採用 `dashboardRecord.activeDriverCount`**（聚合端點回傳值）而非同一函式內剛計算出的 `driversView.rows.length`（見 `fleet-portal-data.server.ts` 第 1099–1104 行一帶的 `driverCount = (dashboardRecord ? dashboardRecord.activeDriverCount : activeDriverCount)...`）。當聚合端點與清單端點回傳不一致的資料時（如本測試模擬的 128 vs 2），畫面 KPI 卡片會顯示與司機清單頁不同的數字——**與 9/6 audit 記錄的缺陷型態完全相同**，尚未在目前 base SHA 上被結構性修復（只是本次以健康 seed 資料驗證時剛好一致，不代表已修復）。
- 其餘三個負向/邊界案例（清單失敗時退回 aggregate、兩者皆失敗顯示「—」而非假 0、清單可達但合法為空顯示 0）皆驗證通過，行為正確。

依本任務規範「若發現產品缺陷，以 canonical task command 建立具來源的修復子任務，不在本驗收範圍偷偷改業務碼」，本任務**不**在 write_scopes 外修改 `fleet-portal-data.server.ts`。此發現與其重現測試（`sr-qa-supply-001-kpi-dashboard.test.ts` 第二個 it）作為後續修復子任務的來源證據；建立子任務需由 supervisor 以 canonical task command 派工（本任務 owner 不越權建立新任務條目）。

## 6. 整合与結案

測試依 task ID 獨立檔案（`sr-qa-supply-001-*.test.ts`），未修改任何中央 test config、lockfile、shared exports、全域 routes。本任務在獨立 worktree 執行，相依任務（見第 1 節）皆已 canonical done 並在 `origin/dev` 有正確 merge 證據，本任務據此重新驗證而非重造功能。

先 commit＋普通 push，再以 `handoff` 交給 reviewer；owner 不直接 `done`。
