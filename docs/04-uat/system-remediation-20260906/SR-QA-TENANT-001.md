# SR-QA-TENANT-001 — 租戶日常工作、配額與整合設定驗收

| 欄位          | 內容                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-QA-TENANT-001.md`            |
| Owner         | Claude                                                                        |
| Reviewer      | Claude2                                                                       |
| Base SHA      | `75136fe3e7c9d143e6a0dbd012e8ec8856ae8127` (= `origin/dev` tip at task start) |
| Candidate SHA | recorded at `handoff` via `git rev-parse HEAD` (see task board)               |

## 1. 重現與基準

`origin/dev` 在本任務開始時基準為 `75136fe3e7c9d143e6a0dbd012e8ec8856ae8127`（已含 SR-HOST-FE-001、SR-DISPATCH-SCHEDULER-001 等前置修復；四個相依任務 `SR-UAT-HARNESS-001`、`SR-TENANT-LOGIN-001`、`SR-MAIL-001`、`SR-MAIL-002` 均已 `done` 並 merge 到 dev）。9/6 audit SHA 是歷史觀察而非當前程式真值，本任務直接從 `75136fe3e7c9d143e6a0dbd012e8ec8856ae8127` 出發，不重做或回退既有修復。

### 歷史分支盤點

本任務在此之前已有三條並行分支各自產出過 write_scopes 範圍內的測試（`origin/claude/sr-qa-tenant-001`、`origin/codex/sr-qa-tenant-001`、`origin/codex2/sr-qa-tenant-001`），但沒有一條 merge 到 dev，dev 上本任務的 write_scopes 目錄在任務開始時完全不存在。依 supervisor recovery 決策，本任務比對三條分支後：

- 從 `origin/claude/sr-qa-tenant-001`（HEAD `3cc1a3911`）移植 `tests/unit/system-remediation/sr-qa-tenant-001/` 下兩個既有、獨立驗證過的服務層單元測試檔（`tenant-approval-and-quota-lifecycle.test.ts`、`tenant-directory-and-settings.test.ts`），這是三條分支中對 unit 矩陣覆蓋最完整的版本。
- 從 `origin/codex2/sr-qa-tenant-001`（HEAD `0f06b8745`）移植 `tests/e2e/system-remediation/sr-qa-tenant-001/` 下五個 Playwright HTTP 驗收 spec（`users.spec.ts`、`passenger-address.spec.ts`、`cost-center.spec.ts`、`approval-rules.spec.ts`、`sla.spec.ts`），這是三條分支中 e2e 矩陣覆蓋最完整、最新的版本（比 `origin/codex/sr-qa-tenant-001` 多出 `users.spec.ts`／`passenger-address.spec.ts`，並將 `directory.spec.ts` 拆分為更聚焦的兩檔）。
- 移植方式為 `git checkout <歷史SHA> -- <path>`（逐檔案取出既有內容到目前 worktree），不使用 `git merge`／`git cherry-pick`（worker sandbox 環境已知對這兩者有限制），因此完整保留了兩條歷史分支本身不被觸碰。
- 移植後對照目前 `dev` tip 重新執行下列驗證（見第 4 節），確認既有程式碼未偏移、測試仍能通過，而非盲目複製。

本任務新增（三條歷史分支皆未產出）：

- `tests/e2e/system-remediation/sr-qa-tenant-001/appmodule-acceptance-seed.ts` — 透過真實 `TenantPartnerService`／`JwtAuthService`（非直接寫表、非偽造 session）在真實 AppModule + 已 migrate 的 Postgres 上，為 tenant A/B 建立可用的 admin session 與一個唯讀 `tenant_viewer` session，供 e2e spec 消費 `DRTS_UAT_*` 環境變數。
- `.github/workflows/tenant-uat-acceptance.yml` 與 `tools/ci/test_tenant_uat_acceptance_workflow.py` — 專用、可手動 dispatch 的 GitHub Actions 驗收 runner，因為此 VM 禁止啟動任何 product server／Postgres／Docker Compose，真正的 live HTTP/DB 驗收證據只能在 GitHub-hosted runner 上產生。

## 2. 涵蓋能力與驗收對應

| 能力（134 能力盤點對應）                         | 正常案例                                         | 負向案例                                                                                          | 驗證層級 |
| ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| 使用者與邀請（C006/C008）                         | 建立、列出、更新角色                              | 重複 email（`TENANT_USER_EXISTS`）、跨租戶更新（`TENANT_USER_NOT_FOUND`）、撤銷後 accept 被拒、重複撤銷 | unit + e2e（HTTP） |
| 常用地址／預約乘客（C027）                        | 建立並用獨立 getter／HTTP 讀回，含關聯            | 位址掛靠不存在的乘客（`PASSENGER_NOT_FOUND`）、跨租戶讀取（`PASSENGER_NOT_FOUND`/`ADDRESS_NOT_FOUND`） | unit + e2e（HTTP） |
| 成本中心（C027）                                  | 建立、更新名稱、停用後可再讀回                    | 查無成本中心（`COST_CENTER_NOT_FOUND`）、跨租戶讀取／停用被拒                                        | unit + e2e（HTTP） |
| 用車規則／審批規則（C028）                        | 建立、重排序、停用、dry-run 評估比對              | 重排序清單不完整（`TENANT_APPROVAL_RULE_REORDER_INCOMPLETE`）、跨租戶讀寫被拒                        | unit + e2e（HTTP） |
| SLA 設定（C028）                                  | 讀回、寫入後兩種讀模型皆更新                      | 唯讀 session 寫入被拒（403，非 401）、跨租戶 header 冒用被拒、無 reason 重算被拒、負值欄位被拒        | unit + e2e（HTTP，含唯讀角色） |
| 額度／配額（C027/C028）                           | 成功扣配額後 ledger 與 summary 皆可獨立讀回       | 零配額阻擋新單且 ledger 不留痕（regression）                                                          | unit |
| 送審流程（C025）approve happy path                | 核准後 approval-request／booking／dispatch 三處皆可讀回一致狀態 | 重複核准（`APPROVAL_DECISION_ALREADY_RECORDED`）、非核准人核准（`APPROVAL_NOT_AUTHORIZED`）           | unit |
| Feature flags 租戶覆寫（C109）                    | 租戶覆寫寫入後三個獨立讀路徑（本租戶／他租戶／全域）皆正確 | 未知 flag key 安全預設為 disabled                                                                     | unit |
| 租戶生命週期（C102）                              | 建立、改設定、暫停／恢復，皆可獨立讀回            | 重複 code（`TENANT_CODE_CONFLICT`）、操作不存在租戶（`TENANT_NOT_FOUND`）                            | unit |

## 3. 驗收條件對應

| 驗收條件                                                                          | 對應實作與證據                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **每個列出能力有正常＋關鍵負向案例與可重跑命令；已有功能先驗而非重寫**             | 上表列出每項能力的正常／負向案例；所有測試呼叫的都是既有、已實作的 `TenantPartnerService`／`TenantsService`／`OwnedMobilityService`／`FeatureFlagsService`／HTTP controller，本任務未修改任何 `apps/api/src` 業務程式碼。 |
| **不能只跑 render/常數檢查；檢驗 write 後 DB/API 回讀以及必要資源間關聯**          | Unit 測試每案例皆為「WRITE → 透過獨立 getter/list 方法 READ BACK」（非直接讀寫入呼叫的回傳值）；E2E spec 透過真實 HTTP `GET`/`POST` 對 `/api/tenant/*` 讀回，並驗證跨資源關聯（如 address↔passenger、approval-request↔booking↔dispatch）。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功** | 見本文件第 1 節（SHA）、第 4 節（實際指令與 exit code）、第 5 節（未做部分明列）。E2E spec 本身透過 `UatEvidenceRecorder` 記錄每次寫入產生的資源 ID（`recordResourceId`）與明確的 `recordLiveLimitation` 聲明。 |
| **先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案** | 本任務將於本文件與程式碼一併 commit 後以普通（非 force）push 上遠端，再以 `ai-status.sh handoff` 交付 `Claude2`；`done` 由後續 review + candidate CI/merge + `required_acceptance` 自動推導，本任務不自行宣告 `done`。 |

## 4. 實際指令與結果（在本 worktree，非 GitHub Actions runner）

```bash
# Base/candidate 基準
$ git rev-parse HEAD
75136fe3e7c9d143e6a0dbd012e8ec8856ae8127   # 移植前；候選 SHA 見 task board handoff 記錄

# 1. 檢查 whitespace 與程式碼排版
$ git diff --check
(exit 0，無任何空白字元錯誤)

# 2. ESLint（僅本任務新增/移植的檔案）
$ pnpm exec eslint tests/unit/system-remediation/sr-qa-tenant-001/ tests/e2e/system-remediation/sr-qa-tenant-001/ --max-warnings=0
(exit 0，0 errors, 0 warnings)

# 3. TypeScript 型別檢查（root tsconfig，全庫）
$ pnpm exec tsc -p tsconfig.json --noEmit
(既有、與本任務無關的預存錯誤：apps/fleet-partner-portal-web 的 host-data.server.ts／
 academy-data.server.ts 缺少 ApiClient 方法、多個檔案缺少 'pg'/'pdfjs-dist' 型別宣告、
 以及本 worktree 路徑本身與 canonical root 重複匯入 ApiClient 型別造成的 duplicate-
 declaration 錯誤 —— 這些錯誤在移植前即已存在，且不觸及本任務 write_scopes 內任何檔案；
 逐行核對 tsc 輸出，本任務新增/移植的 7 個檔案不出現在錯誤清單中，exit code 非零屬於
 上述既有、非本任務範圍的錯誤)

# 4. Vitest 單元測試套件（本任務 write_scopes）
$ pnpm exec vitest run tests/unit/system-remediation/sr-qa-tenant-001/
 Test Files  2 passed (2)
      Tests  24 passed (24)
   Duration  4.30s
(exit 0)

# 5. 列出 Playwright 系統補救 UAT 測試清單（含本任務新增的 5 個 spec）
$ pnpm exec playwright test -c playwright.system-remediation.config.ts tests/e2e/system-remediation/sr-qa-tenant-001 --list
Listing tests:
  sr-qa-tenant-001/approval-rules.spec.ts:11:5 › C028 approval rule writes, evaluation and tenant isolation
  sr-qa-tenant-001/cost-center.spec.ts:8:5 › C027 cost center writes, disable and tenant isolation
  sr-qa-tenant-001/passenger-address.spec.ts:11:5 › C027 passenger/address writes, relation readback and tenant isolation
  sr-qa-tenant-001/sla.spec.ts:9:5 › C028 SLA settings readback, invalid input and tenant isolation
  sr-qa-tenant-001/users.spec.ts:9:5 › Tenant users create, role update and tenant isolation
Total: 5 tests in 5 files
(exit 0)

# 6. 驗證 live HTTP 驗收在缺少必要環境變數時「失敗且非零」，而非「skip 後 pass」
$ pnpm exec playwright test -c playwright.system-remediation.config.ts tests/e2e/system-remediation/sr-qa-tenant-001/users.spec.ts
  1) … › Tenant users create, role update and tenant isolation
     Error: Missing required DRTS_UAT_ENV; HTTP acceptance did not run
  1 failed
$ echo $?
1
(exit 1，符合驗收條件「live測試必須缺證據即nonzero，不可skip後pass」)

# 7. CI workflow 契約測試（純靜態＋對嵌入的 run-status Python heredoc 實際執行）
$ python3 tools/ci/test_tenant_uat_acceptance_workflow.py -v
Ran 21 tests in 0.380s
OK
(exit 0)

# 8. YAML 語法驗證
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/tenant-uat-acceptance.yml')); print('YAML OK')"
YAML OK
```

## 5. 未做的部分（明列，不冒充成功）

- **`.github/workflows/tenant-uat-acceptance.yml` 尚未在 GitHub Actions 上實際 dispatch 執行**：此 VM 明確禁止啟動 product dev server、Postgres、Docker Compose（見 dispatch 指示的 VM restriction），因此本任務只能在本 worktree 完成程式碼撰寫、靜態驗證（YAML 語法、workflow 契約測試 21 項全過、TypeScript/ESLint 對新檔案零錯誤）與可執行部分（unit 測試 24 項全過、Playwright `--list` 與缺環境變數時的 fail-closed 行為）。真正對真實 Postgres + 真實編譯後 AppModule + 真實 JWT session 的 HTTP 讀寫驗收，必須由 reviewer 或後續流程實際 dispatch 此 workflow 才能產生（`workflow_dispatch` 或推送到 `claude/sr-qa-tenant-001-acceptance-runner`/`claude2/sr-qa-tenant-001-acceptance-runner` 分支）。在此之前，`required_acceptance` 中的 `tenant_daily_work_quota_and_integrations_write_readback` 與 `tenant_role_and_cross_tenant_negative_evidence` 只有「unit 測試對應之服務層等效驗證」與「e2e spec 程式碼＋fail-closed 行為」證據，尚未有該 workflow 實際跑過的 run URL／artifact。
- **`DRTS_UAT_USER_EMAIL` 真實可送達信箱**：`users.spec.ts` 建立使用者會觸發邀請信；`appmodule-acceptance-seed.ts` 目前提供的是虛構、不可送達的 `@qa-tenant-uat.example` 網域信箱（`TenantInvitationDeliveryService` 在缺少 `NOTIFICATION_OUTBOX_DIRECTORY` 時會優雅降級為「not available」而非假造已送達，見 SR-UAT-HARNESS-001 的既有行為），因此本任務不驗證、也不冒充驗證真實信件送達；此為 `SR-LIVE-MAIL-001` 等 live 任務的範疇。
- **實體/真機、PSTN、推播等**：與本任務能力無關，未涉及。
- **配額/成本中心之 DB 重啟後持久化（restart durability）**：e2e spec 僅驗證 HTTP 讀回，未驗證伺服器重啟後資料仍存在；這需要更長流程的持久化驗收，超出本任務時間範圍，已在對應 spec 的 `recordLiveLimitation` 中明列。

## 6. Write scope 遵守情況

本任務僅在指定的五個 write_scopes 內新增檔案，未修改任何全域或非專屬範圍檔案，亦未修改任何 `apps/api/src` 業務程式碼：

- `tests/unit/system-remediation/sr-qa-tenant-001/`：
  - `tenant-approval-and-quota-lifecycle.test.ts`（移植自 `origin/claude/sr-qa-tenant-001@3cc1a3911`）
  - `tenant-directory-and-settings.test.ts`（移植自 `origin/claude/sr-qa-tenant-001@3cc1a3911`）
- `tests/e2e/system-remediation/sr-qa-tenant-001/`：
  - `users.spec.ts`、`passenger-address.spec.ts`、`cost-center.spec.ts`、`approval-rules.spec.ts`、`sla.spec.ts`（移植自 `origin/codex2/sr-qa-tenant-001@0f06b8745`）
  - `appmodule-acceptance-seed.ts`（本任務新增）
- `docs/04-uat/system-remediation-20260906/SR-QA-TENANT-001.md`（本檔案）
- `.github/workflows/tenant-uat-acceptance.yml`（本任務新增）
- `tools/ci/test_tenant_uat_acceptance_workflow.py`（本任務新增）
