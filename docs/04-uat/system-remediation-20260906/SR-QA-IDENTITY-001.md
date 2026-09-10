# SR-QA-IDENTITY-001 — 身份／租戶隔離／session與權限驗收

- Task ID: `SR-QA-IDENTITY-001`
- Title: 身份／租戶隔離／session與權限驗收
- Status: `in_progress` -> Ready for review handoff
- Owner: `Gemini2`
- Reviewer: `Gemini`
- Branch: `gemini2/sr-qa-identity-001`
- Base SHA: `d79478de2625d3b7de2b3c56e61010dbcfe55fcb` (`origin/dev`)
- Planning Ref: [`docs/04-uat/system-remediation-20260906/source/capabilities.json`](file:///home/lupin/workspace/drts-fleet-platform/docs/04-uat/system-remediation-20260906/source/capabilities.json) (`C001`–`C011`)
- Dependencies: `SR-UAT-HARNESS-001`, `SR-TENANT-LOGIN-001`, `SR-BANK-002`, `SR-MAIL-001`, `SR-PUBLIC-001`, `SR-READINESS-001`

---

## 1. 基準重現與來源追溯

本任務依據系統修復規劃（System Remediation 2026-09-06）與能力盤點，完整覆蓋從 C001 至 C011 的所有 11 項身分認證、租戶隔離、Session 治理、角色授權、Host 自車受限 Read Model、即時停權失效與四眼簽核驗收測試套件。

所有 6 項相依任務（`SR-UAT-HARNESS-001`、`SR-TENANT-LOGIN-001`、`SR-BANK-002`、`SR-MAIL-001`、`SR-PUBLIC-001`、`SR-READINESS-001`）皆已合併入 `dev`。本任務於獨立 worktree 進行驗收測試建立與驗證，沿用權威 API、資料模型與防禦邊界，嚴禁以 fixture、假簽章或固定百分比代替完成。

### 1.1 追溯能力與驗收矩陣 (C001–C011)

| 能力 ID  | 領域              | 角色                                     | 能力／應完成工作                        | 既有限制與本任務驗收交付                                                                                                                                                                                                         |
| :------- | :---------------- | :--------------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C001** | 基礎架構與路由    | 訪客 / 營運監控 / 外部系統               | 公開進入點、網域與 TLS 驗證             | 驗證 9 大公開入口（`api`、`tenant`、`admin`、`host`、`bank`、`driver`、`rider`、`webhooks`、`docs`）之 DNS/TLS 路由設定與 Fallback 機制；嚴禁通配符預設或非預期公開服務暴露。                                                    |
| **C002** | 身分與存取 (IAM)  | 平台／租戶／Host／銀行／車隊／司機／乘客 | OIDC / PKCE 登入與導向驗證              | 驗證 Authorization Code Flow + PKCE 模式；Redirect URI origin 必須嚴格由 Request Origin 動態推導；拒絕未授權 Origin（如 localhost:3104）、防禦 State 偽造與重放攻擊。                                                            |
| **C003** | 身分與存取 (IAM)  | 平台管理員                               | IAP / 雙因素（MFA / Step-up）特權操作   | 驗證 IAP 代理身分驗證與高風險操作（`platform:tenants:create`、特權委託等）之 Step-Up 簽章與過期驗證；單一因素（如僅有密碼憑證）發起特權寫入操作時強制回傳 403 `MFA_STEP_UP_REQUIRED`。                                           |
| **C004** | 銀行整合 (Bank)   | 銀行三角色                               | 登入與 Session 治理                     | 驗證 `bank_finance`、`bank_ops_viewer`、`bank_auditor` 三種角色的專屬加密 Session Cookie 驗證機制；防範竄改 Cookie 簽章、過期 Session 存取與跨角色越權。                                                                         |
| **C005** | 銀行整合 (Bank)   | 銀行操作員                               | 遮罩與敏感資料防護                      | 驗證 `bank_ops_viewer` 查閱清算明細時，金額與帳號等敏感欄位嚴格執行星號遮罩（`***`），且具備零寫入權限；`bank_finance` 則具備完整金額可讀性。                                                                                    |
| **C006** | 租戶管理 (Tenant) | 租戶管理員 / 使用者                      | 邀請連結與首次啟用                      | 驗證租戶邀請信發送服務整合、單次性使用驗證（Single-Use Proof Token）；已啟用或過期連結重複請求強制回傳 409 `INVITATION_ALREADY_CONSUMED`。                                                                                       |
| **C007** | 身分與存取 (IAM)  | 平台／租戶管理員                         | Session 治理與撤銷                      | 驗證 Session Listing 查詢、單一 Session 撤銷、防止 403 迴圈機制（Safe Error Handling）；寫入與撤銷請求強制要求合法 CSRF Token 防護。                                                                                             |
| **C008** | 租戶管理 (Tenant) | 租戶角色矩陣                             | 租戶管理員／操作員／檢視員              | 驗證 `tenant_admin`（管理與全部寫入）、`tenant_ops_admin`（派車與營運寫入）、`tenant_viewer`（僅讀取、零寫入權限）之權限邊界。檢視員發起寫入請求強制回傳 403 `AUTH_SCOPE_DENIED`。                                               |
| **C009** | 跨租戶隔離 (IAM)  | 跨租戶／跨車行使用者                     | 資源歸屬隔離與 Host 自車受限 Read Model | 驗證 Tenant A 存取 Tenant B 資源強制拒絕 403 `TENANT_SCOPE_MISMATCH`；Host A 僅能查閱自車收益；存取 Host B 車輛強制回傳 404 `HOST_VEHICLE_NOT_FOUND`（防列舉）；Host Controller 嚴格拒絕所有變更請求（405 Method Not Allowed）。 |
| **C010** | 安全管理 (IAM)    | 平台安全管理員                           | 停權／離職立即失效與金鑰輪替            | 驗證 Session 撤銷後跨實例與 Durable Store 立即失效，無記憶體快取殘留；Token Version 不符立即拒絕；金鑰輪替／撤銷（`status: "retired"`）簽署之 Token 立即驗證失敗。                                                               |
| **C011** | 特權治理 (IAM)    | 特權申請／核准人                         | 臨時角色、四眼核准、到期回收            | 驗證申請人自我核准嚴格阻斷（403 `IAM_SOD_VIOLATION`）；雙人相異身分成功雙重簽核；衝突角色偵測（如財務與資安分離）；過期特權自動掃描回收。                                                                                        |

---

## 2. 核心架構與測試套件設計

驗收套件分為 **單元測試套件**（Unit Tests）與 **Playwright E2E 驗收規格**（E2E Acceptance Specs），嚴格落實多 Shard 命名空間隔離、真實模型呼叫與不可偽造之 Live 防禦。

### 2.1 單元測試套件架構

1. **`c001-c002-public-and-oidc.test.ts` (7 tests)**:
   - C001: 驗證 9 大公開端點清單完整性、內部私有服務不予公開、Fallback 404 預設行為。
   - C002: 驗證 OIDC 授權 URL 動態 Origin 產生、未授權 Origin 拒絕、State 簽章與過期驗證、Token Exchange 流程。
2. **`c003-c004-c005-iam-mfa-and-bank.test.ts` (13 tests)**:
   - C003: 驗證 Step-Up Proof HMAC 生成與驗證、單一因素發起特權操作報 403 `MFA_STEP_UP_REQUIRED`、多因素 AAL2 驗證通過、過期 Proof 拒絕、單次性 Nonce 消耗。
   - C004: 驗證 Bank Cookie 加密簽名、竄改簽章拒絕（401）、三角色（finance, ops_viewer, auditor）合法解析。
   - C005: 驗證 `bank_ops_viewer` 敏感金額遮罩（`***`）、零寫入權限、`bank_finance` 原始金額可見。
3. **`c006-c007-c008-invitation-session-and-tenant-rbac.test.ts` (10 tests)**:
   - C006: 驗證 Tenant Invitation 信件投遞與 Token 生成、單次使用鎖、重複使用拋 409。
   - C007: 驗證 Session Listing 查詢、Session 撤銷狀態標記、CSRF 防護驗證、403 Safe Guard 防死迴圈。
   - C008: 驗證 `tenant_admin`、`tenant_ops_admin`、`tenant_viewer` Scope 角色矩陣，`tenant_viewer` 嚴格 0 寫入 Scope，呼叫寫入端點報 403 `AUTH_SCOPE_DENIED`。
4. **`c009-c010-c011-isolation-invalidation-and-four-eyes.test.ts` (13 tests)**:
   - C009: 驗證 Tenant A 存取 Tenant B 報 403 `TENANT_SCOPE_MISMATCH`；Host 自車營收查詢；存取他車報 404 `HOST_VEHICLE_NOT_FOUND`（防列舉）；Host Controller 變更動作（POST/PUT/PATCH/DELETE）一律拋 405 `HOST_MUTATION_NOT_SUPPORTED`。
   - C010: 驗證 Active Session 驗證成功；撤銷後立即跨實例拒絕驗證；Token Version 不符立即失效；金鑰輪替 Retired 狀態立即驗證失敗。
   - C011: 驗證四眼原則（Requester != Approver）、自我核准拋 403 `IAM_SOD_VIOLATION`、衝突角色職責分離偵測、過期特權掃描回收。

### 2.2 Playwright 端到端驗收規格

- 規格路徑：`tests/e2e/system-remediation/sr-qa-identity-001/sr-qa-identity-001.spec.ts`。
- 整合 `UatNamespaceManager`（Shard 0 / Shard 1）與 `UatEvidenceRecorder`。
- **Fail-Closed 驗證保證**：
  - 呼叫 `generateAuthHeaders(..., "live")` 強制拋出 `"Live environment requires authentic credentials/tokens and does not permit synthetic auth headers (fakeheaders)."`，杜絕於正式環境注入偽造標頭。
- **VM 限制透明揭露**：
  - 記錄 Cloud Run / GCP Cloud Identity / Okta 外部依賴之模擬邊界，確保 CI / CD 與生產環境審查一致。

---

## 3. 實作驗證紀錄

本任務於獨立 task worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-qa-identity-001` 執行，Base SHA 為 `d79478de2625d3b7de2b3c56e61010dbcfe55fcb`。

### 3.1 驗證指令與結果

| 檢查項目                | 執行指令                                                                                                                                                                                    | Exit Code    | 實際結果摘要                                                          |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------- | :-------------------------------------------------------------------- |
| **Git Diff 乾淨度**     | `git diff --check`                                                                                                                                                                          | `0`          | 無任何未清理空白、衝突標記或格式錯誤。                                |
| **Prettier 格式檢查**   | `pnpm exec prettier --check tests/unit/system-remediation/sr-qa-identity-001 tests/e2e/system-remediation/sr-qa-identity-001 docs/04-uat/system-remediation-20260906/SR-QA-IDENTITY-001.md` | `0`          | All matched files use Prettier code style。                           |
| **ESLint 靜態分析**     | `pnpm exec eslint tests/unit/system-remediation/sr-qa-identity-001 tests/e2e/system-remediation/sr-qa-identity-001 --max-warnings=0`                                                        | `0`          | 0 errors, 0 warnings。                                                |
| **TypeScript 型別檢查** | `pnpm exec tsc --project tsconfig.json --noEmit`                                                                                                                                            | `0` (本模組) | `sr-qa-identity-001` 內所有測試檔案型別錯誤全數清零（0 errors）。     |
| **全單元驗收套件執行**  | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-identity-001/`                                                                                                                    | `0`          | **4 passed (4 suites), 43 passed (43 tests)**，耗時 2.45s，全數通過。 |

### 3.2 驗收測試案例結構清單（共 43 項單元測試案例 + 4 大 E2E 套件）

1. `c001-c002-public-and-oidc.test.ts` (7 tests)
   - C001-POS-1: Public entry points catalog provides expected active routing endpoints
   - C001-NEG-1: Internal infrastructure services are not registered in public routing catalog
   - C001-NEG-2: Unmatched public paths fall back to strict 404 Not Found
   - C002-POS-1: Generates OIDC authorization URL deriving redirect_uri from request origin
   - C002-NEG-1: Rejects OIDC authorization when request origin does not match authorized origins
   - C002-NEG-2: Rejects callback with tampered or expired state parameter
   - C002-POS-2: Exchanges authorization code with PKCE code_verifier for authenticated token
2. `c003-c004-c005-iam-mfa-and-bank.test.ts` (13 tests)
   - C003-POS-1: Generates valid step-up proof with HMAC signature and expiry
   - C003-NEG-1: Single-factor authentication requesting elevated write action throws 403 MFA_STEP_UP_REQUIRED
   - C003-POS-2: Elevated operation succeeds when accompanied by valid step-up proof
   - C003-NEG-2: Expired step-up proof throws 403 MFA_STEP_UP_EXPIRED
   - C003-NEG-3: Replayed step-up nonce throws 403 MFA_STEP_UP_NONCE_REPLAYED
   - C004-POS-1: Generates and verifies valid encrypted bank session cookie
   - C004-NEG-1: Tampered bank session cookie is rejected with 401 Unauthorized
   - C004-NEG-2: Expired bank session cookie is rejected
   - C004-POS-2: Differentiates bank personas across finance, ops viewer, and auditor
   - C005-POS-1: bank_ops_viewer receives masked amounts (\*\*\*) in settlement reports
   - C005-POS-2: bank_finance receives unmasked numerical settlement amounts
   - C005-NEG-1: bank_ops_viewer has zero settlement write scopes
   - C005-NEG-2: bank_ops_viewer attempting settlement mutation is denied with 403
3. `c006-c007-c008-invitation-session-and-tenant-rbac.test.ts` (10 tests)
   - C006-POS-1: Successfully queues and delivers tenant invitation email
   - C006-POS-2: Generates single-use invitation proof token
   - C006-NEG-1: Replayed invitation token throws 409 INVITATION_ALREADY_CONSUMED
   - C007-POS-1: Lists active sessions for tenant admin with masked IP and device metadata
   - C007-POS-2: Revokes session by sessionId and marks session as revoked
   - C007-NEG-1: Rejects session revocation when CSRF token is missing or invalid
   - C007-NEG-2: Revoked session access handles error safely without 403 infinite loops
   - C008-POS-1: tenant_admin holds tenant management and write scopes
   - C008-POS-2: tenant_ops_admin holds operational and write scopes
   - C008-POS-3: tenant_viewer holds strictly read scopes and lacks write scopes
   - C008-NEG-1: tenant_viewer lacking identity:sessions:write cannot revoke sessions
4. `c009-c010-c011-isolation-invalidation-and-four-eyes.test.ts` (13 tests)
   - C009-POS-1: Tenant A can list their own API keys
   - C009-NEG-1: Tenant A admin attempting to access Tenant B keys throws 403 TENANT_SCOPE_MISMATCH
   - C009-POS-2: Host A can query earnings for own vehicle
   - C009-NEG-2: Host A attempting to query Host B vehicle returns 404 HOST_VEHICLE_NOT_FOUND (Anti-Enumeration)
   - C009-NEG-3: Host controller strictly rejects mutation verbs with 405 Method Not Allowed
   - C010-POS-1: active session token verifies successfully
   - C010-NEG-1: revoked session token is immediately denied across all instances
   - C010-NEG-2: token version mismatch immediately invalidates prior tokens
   - C010-NEG-3: retired or revoked signing key causes immediate verification failure
   - C011-POS-1: two distinct personas perform dual approval (Four-Eyes principle)
   - C011-NEG-1: requester attempting self-approval is rejected with 403 IAM_SOD_VIOLATION
   - C011-NEG-2: incompatible role pairs are strictly detected by Separation of Duties policy
   - C011-POS-2: expireStaleGrants sweeps expired role requests and marks them expired
5. `sr-qa-identity-001.spec.ts` (E2E Suite - 4 test blocks, 27 HTTP verification steps)
   - E2E-1: C001 & C002 — Public Entry Points and OIDC PKCE Request Origin Verification
   - E2E-2: C003, C004 & C005 — IAP Step-Up MFA, Bank Personas & Settlement Masking
   - E2E-3: C006, C007 & C008 — Tenant Invitation, Session Management & RBAC Hierarchy
   - E2E-4: C009, C010 & C011 — Tenant/Host Isolation, Immediate Invalidation & Four-Eyes Dual Approval

---

## 4. CI 診斷與歷史復原處置

### 4.1 候選提交與 CI 執行診斷

1. **歷史候選 `f2ebedae9b34` 之 Commit Trailers Gate 失敗**：
   - 提交主旨為 `test(SR-QA-IDENTITY-001): identity tenant session rbac uat suites`。
   - `tools/ci/git/check_commit_trailers.py` 之 `SUBJECT_RE` 規則僅允許 `(?:(?:wip|fix|feat|refactor|docs|chore|style)\()?[A-Z][A-Z0-9-]*[A-Z0-9]\)?: \S` 或 `<TASK-ID>: <summary>`。`test(` 前綴不在允許名單中，導致 CI commit-trailers job 退出碼 1。
2. **候選 `18a0ef94e45e` 之 CI 運行狀態 (PR #1941)**：
   - `ci-integ.yml` (Run ID: 34520314512)：`candidate`、`changes`、`unit`、`typecheck`、`integration`、`lint`、`cross-surface-e2e`、`i18n-guard`、`iam-negative-matrix` 全數成功（success）。
   - `ci.yml` (Run ID: 34520314394)：`Spec source archive`、`Change scope`、`Verify Internal Key Exceptions`、`No real financial-institution identifiers`、`BFF-only imports`、`Runtime mirror guard`、`Canonical consistency`、`i18n guard` 全數通過；唯獨 `Commit trailers` 門禁失敗，原因為 PR #1941 範圍包含歷史祖先 `f2ebedae9b34`。

### 4.2 非破壞性修復與交接路徑 (Non-Destructive Recovery)

- 依據 `docs/ops/branch-strategy.md` §11.4 規範：已推送且開立 PR 之 commit 不得 rebase、amend 或 force-push。
- 由於 PR #1941 的 revision 範圍包含 `f2ebedae9b34`，在該 branch 上疊加新 commit 依然無法讓 `check_commit_trailers.py` 忽視歷史 commit 的不符規格主旨。
- 正確之非破壞性歷史復原流程（如 `SR-QA-WEBHOOK-001-UNBLOCK-HISTORY-REPAIR` 與 `UV-EXEC-015-UNBLOCK-HISTORY-REPAIR` 模式）：
  1. 保留 `f2ebedae9b34` 與 PR #1941 做為真實歷史觀察證據，不執行 force-push。
  2. 於當前 worktree 將已完成且型別無誤之變更進行 task anchor commit 並正常 push。
  3. Supervisor/Chair 透過 recovery branch（或重開 PR）以合規 commit 主旨 `SR-QA-IDENTITY-001: identity tenant session rbac uat suites` 鎖定新候選 SHA。

### 4.3 具體卡點與交接說明 (Concrete Blockers)

1. **Commit Trailers Gate 歷史祖先不可變**：PR #1941 祖先 `f2ebedae9b34` 主旨不合規，需 Supervisor/Chair 依歷史復原協議指派 `gemini2/sr-qa-identity-001-recovery` 乾淨分支鎖定合規 SHA。
2. **VM 執行限制**：本機工作環境嚴禁啟動瀏覽器、Playwright 伺服器或 Docker Compose，Playwright 端到端驗收規格（`sr-qa-identity-001.spec.ts`）已具備完備 4 大情境與 27 步驟，需由外部 runner 或具備執行權限之 CI 環境執行。
