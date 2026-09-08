# SR-IAM-001 — 工作階段 scope 與角色 API 權限回歸證據

Owner：Gemini；獨立 Reviewer：Claude。日期：2026-09-06 UTC。

## 版本與追溯

- 工作分支：`gemini/sr-iam-001`，使用 supervisor 指定之獨立 worktree。
- 本輪派工初始 base SHA：`2093cf7e38526a7a7c027600be92004f7275efd3`；最新 fast-forward base SHA：`a4876ac529abfb634c2b96f237116202abf3d87d`（對齊 `origin/dev` 最新狀態）。
- 相關依賴：`FIX-IAM-UNGRANTABLE-002`、`UV-EXEC-003`（已於 `dev` 分支完成合併）。
- 稽核追溯來源：[R05](source/findings.json)（7 秒 31 次 403 請求無限循環）、[C092](source/capabilities.json)（Session scopes 與 API 權限控管矩陣）。
- 歷史 audit SHA `08b7a32f6fdaa00d8d1894f91569a7d72860cec2` 僅為歷史觀察紀錄，非當前程式真值。本任務不重做或回退既有修復。
- 最終 machine truth 狀態可透過以下指令檢驗：

```bash
/home/lupin/drts-fleet-platform/.artifacts/releases/orchestrator-99f7e0e56/tools/development-orchestrator/bin/ai-status.sh show SR-IAM-001
```

---

## 根因分析與修復說明

### 1. R05 循環成因與修復 (7-second 31-requests loop)

**成因診斷**：
在前端使用者治理抽屜元件 `apps/platform-admin-web/app/users/users-governance-components.tsx` 中：

- `UserDetailDrawer` 在元件主體內未 memoize 地呼叫 `const iamClient = createPlatformAdminIamClient(rawClient);`。
- 當使用者點擊檢視工作階段清單時，若遇到 403（例如 `platform_admin` 先前缺少 `identity:sessions:read`），`loadSessions` 捕捉到錯誤後會呼叫 `setError(message)` 及 `setLoadingSessions(false)`。
- 此狀態更新引發 `UserDetailDrawer` 重新渲染，進而重新執行 `createPlatformAdminIamClient(rawClient)`，產生物件位址不同的全新 `iamClient` 實例。
- 由於 `loadSessions` 的 `useCallback` 依賴包含 `[iamClient, user.userId]`，`iamClient` 的參考變化使得 `loadSessions` 產生新的函式參照。
- 隨後 `useEffect(() => { void loadSessions(); }, [loadSessions])` 被觸發，立即再次呼叫 `loadSessions()`，並重設 `setLoadingSessions(true)`，進入無限重複發送 API 請求的惡性循環（實測約每 225ms 一次，7 秒累計達 31 次請求）。

**修復方案**：

1. **Memoize IAM 客戶端實例**：
   在 `UserDetailDrawer`、`RoleApprovalPanel`、`AccessReviewPanel` 與 `BreakGlassPanel` 中，統一將 `createPlatformAdminIamClient` 以 `useMemo(() => createPlatformAdminIamClient(rawClient), [rawClient])` 包裹，確保客戶端實例之參照穩定性。
2. **穩定回呼與終止條件**：
   `loadSessions` 在 403 時正確記錄錯誤狀態並設定 `loadingSessions = false`，不再因重繪造成回呼參照變更，嚴格確保 403 後只請求 1 次即穩定停止。
3. **明確且可理解的雙語錯誤訊息**：
   針對 403 / `AUTH_SCOPE_DENIED` / `AUTH_REALM_DENIED` 錯誤提供明確的使用者端雙語說明：
   - 查詢清單 403：`存取被拒 (403 權限不足)：目前角色缺乏檢視工作階段清單授權 (需具備 identity:sessions:read)。` / `Access Denied (403 Forbidden): Insufficient authority to inspect user session inventory (requires identity:sessions:read).`
   - 撤銷連線 403：`存取被拒 (403 權限不足)：目前角色缺乏撤銷工作階段授權 (需具備 identity:sessions:write)。` / `Access Denied (403 Forbidden): Insufficient authority to revoke session (requires identity:sessions:write).`
4. **UI 卡片渲染防禦**：
   發生錯誤時，抽屜呈現具體之 danger `CanvasBanner`，不會誤判為 empty state，亦不會卡在 loading 狀態。

---

### 2. IAM Scope Catalog 與角色權限回歸 (Role API Matrix)

**成因診斷**：
在 `packages/contracts/src/iam-policy-catalog.ts` 中：

- `IAM_SCOPE_DEFINITIONS` 僅定義了 `identity:sessions:read`，遺漏了 `identity:sessions:write`（造成無法合法授權工作階段撤銷操作）。
- 在 `IAM_ACTOR_POLICY_DEFINITIONS` 中，`platform_admin` 與 `tenant_admin` 角色預設 scopes 均未包含 `identity:sessions:read` 及 `identity:sessions:write`，導致合法的管理員呼叫 `/identity/sessions` 時遭到 403 拒絕。

**修復方案與最小權限原則**：

1. 在 `IAM_SCOPE_DEFINITIONS` 中補齊 `identity:sessions:write`，設定 `allowedRealms: ["system", "platform", "tenant", "ops"]` 並綁定租戶與主體資源條件。
2. 在 `IAM_ACTOR_POLICY_DEFINITIONS` 與 `IAM_TENANT_ROLE_POLICY_DEFINITIONS` 中：
   - `system`：配置 `identity:sessions:read` 與 `identity:sessions:write`。
   - `platform_admin`：配置 `identity:sessions:read` 與 `identity:sessions:write`。
   - `tenant_admin`：配置 `identity:sessions:read` 與 `identity:sessions:write`。
3. **嚴守最小權限原則，不擴權掩蓋錯誤**：
   - `ops_user`：保有維運與 `assistant:write` 授權，但**絕不授予** `identity:sessions:read`、`identity:sessions:write` 或 P5 `multi_taxi_records:export`。
   - `driver_user`：**絕不授予** session 管理或控制台權限。
   - `partner_api_key` / `referral_passenger`：**絕不授予** session 管理或平台內部治理權限。
   - 唯讀角色（如持 `identity:sessions:read` 或 `tenant_viewer`）：僅能執行 GET 查詢，任何 POST/DELETE 撤銷與變更操作一律由 guard 拒絕並回傳 403 `AUTH_SCOPE_DENIED`。

---

## 驗證指令與實際執行結果

所有指令均於隔離工作樹 `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-iam-001` 內實際執行。

| 檢查項目 / 指令                                                   | Exit Code | 執行結果摘要                                           |
| ----------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| `git diff --check`                                                | 0         | 無任何 trailing whitespace 或格式錯誤                  |
| `pnpm --filter @drts/contracts build`                             | 0         | `@drts/contracts` TypeScript 編譯成功，生成 d.ts 與 js |
| `pnpm --filter @drts/api typecheck`                               | 0         | `tsc -p tsconfig.json --noEmit` 無型別錯誤             |
| `pnpm --filter @drts/platform-admin-web typecheck`                | 0         | Next.js route typegen 與 TypeScript 檢查通過           |
| `pnpm run i18n:guard`                                             | 0         | 518 檔掃描通過，無違反 i18n 規範                       |
| `pnpm run lint:root`                                              | 0         | eslint 通過，無 unused vars 或 lint 錯誤               |
| `pnpm exec vitest run tests/security/iam-route-inventory.test.ts` | 0         | 1 file, 10 passed (全路由安全目錄清點)                 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-iam-001/`  | 0         | 2 files, 28 passed (R05 防護 6 題 + API 矩陣 22 題)    |

---

## 測試場景與測試資源 ID

以下資源均為**受控測試資源**，絕非 production live database 或實體硬體 ID：

| 測試場景                          | 測試角色 / 請求身份                    | 目標 API / 路由                                            | 預期與實際結果                                | 測試資源 ID                                         |
| --------------------------------- | -------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| R05 防護：單次 403 即終止         | `platform_admin` (模擬缺乏 read scope) | `GET /identity/sessions`                                   | 403 後停止，API 僅被呼叫 1 次，無迴圈         | `test-user-r05-001`, `sess-r05-denied-001`          |
| R05 防護：403 錯誤訊息可讀性      | `platform_admin`                       | `GET /identity/sessions`                                   | 顯示包含 `identity:sessions:read` 之明確警示  | `test-user-r05-002`                                 |
| R05 防護：撤銷 403 錯誤訊息       | `platform_admin`                       | `POST /identity/sessions/:id/revoke`                       | 顯示包含 `identity:sessions:write` 之明確警示 | `test-user-r05-003`, `sess-r05-003`                 |
| R05 防護：正常流程穩定載入        | `platform_admin` (具 read 權限)        | `GET /identity/sessions`                                   | 200 成功載入，顯示工作階段列表                | `test-user-r05-004`, `sess-r05-ok-001`              |
| 矩陣 1：Platform Admin 合法讀取   | `platform_admin`                       | `GET /identity/sessions`                                   | 200 合法成功允許存取                          | `test-actor-001`, `req-test-001`                    |
| 矩陣 1：Platform Admin 合法撤銷   | `platform_admin`                       | `POST /identity/sessions/sess_123/revoke`                  | 200 合法成功允許撤銷                          | `test-actor-001`, `sess_123`                        |
| 矩陣 2：Ops User 非法存取 Session | `ops_user`                             | `GET /identity/sessions`                                   | 403 `AUTH_SCOPE_DENIED` 拒絕                  | `test-actor-001`                                    |
| 矩陣 2：Ops User 非法撤銷 Session | `ops_user`                             | `POST /identity/sessions/sess_123/revoke`                  | 403 `AUTH_SCOPE_DENIED` 拒絕                  | `test-actor-001`, `sess_123`                        |
| 矩陣 2：Ops User 非法匯出 P5      | `ops_user`                             | `POST /platform-admin/multi-taxi-trip-records/export-jobs` | 403 拒絕 (無 `multi_taxi_records:export`)     | `test-actor-001`                                    |
| 矩陣 3：P5 營運紀錄讀取授權       | `platform_admin`                       | `GET /platform-admin/multi-taxi-trip-records`              | 200 合法成功                                  | `test-actor-001`                                    |
| 矩陣 3：P5 營運紀錄跨 realm 隔離  | `tenant_admin`, `driver_user`          | `GET /platform-admin/multi-taxi-trip-records`              | 403 `AUTH_REALM_DENIED` 拒絕                  | `test-actor-001`                                    |
| 矩陣 4：Tenant Admin Session 存取 | `tenant_admin`                         | `GET /identity/sessions`                                   | 200 合法成功（受限於租戶邊界）                | `test-actor-001`, `t-001`                           |
| 矩陣 4：Tenant 越權存取控制台     | `tenant_admin`                         | `GET /platform-admin/tenants`                              | 403 `AUTH_REALM_DENIED` 拒絕                  | `test-actor-001`, `t-001`                           |
| 矩陣 5：司機越權存取 Session/審計 | `driver_user`                          | `GET /identity/sessions`, `GET /audit`                     | 403 `AUTH_REALM_DENIED` 拒絕                  | `test-actor-001`                                    |
| 矩陣 6：外部合作夥伴越權存取      | `partner_api_key`                      | `GET /identity/sessions`, `POST /.../revoke`               | 403 `AUTH_REALM_DENIED` 拒絕                  | `test-actor-001`, `sess_999`                        |
| 矩陣 7：唯讀身份寫入隔離          | `platform_admin` (僅持有 read scope)   | `POST /identity/sessions/sess_123/revoke`                  | 讀取成功；寫入以 403 `AUTH_SCOPE_DENIED` 拒絕 | `test-actor-001`, `sess_123`                        |
| 矩陣 7：租戶檢視者寫入隔離        | `tenant_admin` (僅持有 viewer scopes)  | `POST /tenant/t-001/cost-centers`                          | 讀取成功；寫入以 403 `AUTH_SCOPE_DENIED` 拒絕 | `test-actor-001`, `t-001`                           |
| 矩陣 8：Catalog 完整性與可授權性  | 全局 Policy 驗證                       | `getIamScopeDefinition` / presets                          | 驗證所有路由 scope 均可被合法 actor 指派      | `identity:sessions:read`, `identity:sessions:write` |

---

## 驗證界線與未驗證項目說明

依據協作規範與任務界線要求，明確揭示本次驗證之邊界：

1. **未驗證項目 (Unverified Boundaries)**：
   - 本次未在真實 Cloud Run 或生產負載平衡器（GCP IAP）環境下測試 live Google Workspace 帳號登入與轉址。
   - 本次未連接生產 PostgreSQL 或 Redis 實體資料庫，session 撤銷於單元測試中由模擬身份與 guard 政策進行邏輯驗證。
   - 本次未在真實車載終端機（driver tablet / MDT）或真實手機硬體上執行物理按鈕點擊測試。
   - 本次未發出真實 SMS 驗證碼或外部 Webhook 物理推送通知。
2. **已驗證真值 (Verified Truths)**：
   - 程式碼層級完全修復 R05 無限 re-render 循環，403 時不再重複觸發請求。
   - 契約層級補齊 `identity:sessions:write` 定義及合法管理員角色的 preset 配賦。
   - 角色權限矩陣涵蓋 platform, ops, tenant, driver, partner 及 read-only 角色，合法存取全數通過，非法越權全數精確拒絕。
   - 所有單元測試、型別檢查及 contracts 建置均在本地 isolated worktree 中通過且 Exit 0。

---

## 交接聲明

Owner（Gemini）完成程式碼修改、各項標準檢查（包含 i18n:guard、lint、typecheck 與單元測試）及本回歸證據文檔後，以標準任務 commit 與 non-force push 提交至 `gemini/sr-iam-001`，並移交予 Reviewer（Claude）。Owner 不得亦不會自稱 done。
