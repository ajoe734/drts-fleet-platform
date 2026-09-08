# SR-ADMIN-ADAPTER-001 — 執行證據與 scope 缺口

## 基準與交付界線

- 日期：2026-09-06。
- Base：`afefd55d3d23dd361d2dd81fd5f80eedb6671002`，工作開始時 `git fetch origin` 後的 `origin/dev` 與 HEAD 相同。
- 本輪 rebase base：`70355aba97c23dd1cd592b71f1d3dfe6315d91ff`（fresh `origin/dev`）。2026-09-08 已重新套用既有 task commits；重放期間的重複 patch 已由 Git 正常略過。
- 工作分支：`codex/sr-admin-adapter-001`；使用 supervisor 指定的 isolated worktree。
- Candidate：尚未 handoff；本文件所述為部分修正，完整驗收未達成。
- 追溯：`source/new-gaps.json` N11/N12、`source/capabilities.json` C104/C105；歷史 audit 不作為目前程式真值。

## 當前程式重現與權威來源

1. `packages/api-client/src/index.ts:4014` 的列表／單筆／更新呼叫 `/api/platform-admin/adapters`，但 `platform-admin.controller.ts` 與 `platform-admin.service.ts` 沒有相應 route、管理方法或儲存。
2. `apps/platform-admin-web/lib/AdapterManager.ts` 與 `PlatformAdapterRegistry.ts` 是前端記憶體 demo registry（`owned-dispatch`、`cityride-forwarder`）。不能搬到 API 當正式資料來源。
3. Forwarder 的權威讀取為 `ForwarderService.listAdapterHealth()`、注入的 `FORWARDER_ADAPTERS` 與 `PLATFORM_CODE_REGISTRY`；健康資料持久化於 `ops.phase1_adapter_health`。這些沒有註冊／設定／停用管理命令，也没有憑證到期時間，不能替代管理 registry。
4. `packages/contracts/src/platform-adapter-registry.ts` 只有 credential status，沒有 expiresAt 或憑證 reference。Tenant-partner ingress 憑證雖有到期時間，沒有可證實的 adapter 關聯，不能冒用。
5. 目前頁面無條件渲染 Banner；沒有資料、API 404 或健康列表都會回退到 `mof-bgmt`、6 天、`2026-05-31` 的固定文案。健康異常也被稱為 token expiry review。

## 已授權範圍內的部分修正

- 列表正在載入、API 失敗、空列表或全部正常時不顯示 adapter 告警。
- API 失敗清除舊列表與 flash，避免舊資料或成功提示繼續展示。
- 真實回應指出健康／憑證狀態異常時才顯示相應狀態；不從健康狀態推算到期，也不建議無依據的立即輪替。
- 明示憑證到期時間未知。尚無權威時間欄位，因此四態到期計算仍未完成。
- 沿用既有 platform Canvas 元件與佈局；flash 背景改用 theme 語意 token，沒有新增硬編碼色盤。

## Screen requirements note — 禁止自行補設計

已讀 `packages/ui-tokens/src/{colors,realms}.ts`、`docs/05-ui/drts-design-canvas/Platform Admin.html` 的 adapters artboard，及 `platform-screens-2.jsx:368–410`。

畫布提供 registry 列表、告警與 split-authority 操作按鈕，未提供註冊、設定編輯、credential 編輯／輪替的表單畫面。依 dispatch 的「If the canvas lacks a screen, write a screen-requirements note and STOP」，停止新增這些表單；既有列表的錯誤文案與告警修正可獨立完成。

請 supervisor 安排設計來源補齊：註冊必填欄位與初始狀態、設定可編輯欄位與回讀、credential reference／到期時間／輪替狀態、變更原因與確認、權限不足／寫入失敗／回讀失敗狀態。沿用 platform realm tokens 與 Q-ADM17 的治理／Ops 分工。

## 需要 supervisor 擴 scope／加入相依

- 由 SR-CONTRACT writer 協調 registry 管理及 credential expiry／reference、mutation reason 與 audit receipt 契約，以及 API client／OpenAPI；目前本 task 不可寫 shared contracts/client。
- 分配持久化 registry schema 與專屬 migration、repository 寫入範圍；不能以記憶體 Map 假造治理完成。
- 配置 `platform-admin.module.ts` 與實際 runtime adapter config 的接線範圍，使停用真正影響 adapter 使用，而非只改畫面。若重用 Forwarder，需對應 module/service/config provider 的 scope 與相依。
- 憑證治理的授權／step-up 與設計表單須隨契約確認。目前 generic `/platform-admin/*` policy 為 platform/system realm、GET `foundation:read`、PATCH `foundation:write`，並非已完成新的 credential governance 驗收。

## 驗證記錄

### 命令與結果

所有命令由 task worktree 執行；沒有使用 `--passWithNoTests`。

| 命令                                                                                                                                                                                                                                                                                                                 | Exit | 實際結果                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin`                                                                                                                                                                                                                                                                                                   | 0    | 初始 base 為 afefd55d；後續 rebase 至 3014f9a4                                                                                                                                |
| `git diff --check`                                                                                                                                                                                                                                                                                                   | 0    | 無 whitespace error                                                                                                                                                           |
| `git diff 3014f9a4942f73f89c0a6f8458dc8b042c1034d0 HEAD --check`                                                                                                                                                                                                                                                     | 0    | 已提交 task diff 無 whitespace error                                                                                                                                          |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-adapter-001/`                                                                                                                                                                                                                                           | 0    | 最後執行：1 test file、9 tests passed；真實 RegistryNotice HTML render，涵蓋 loading、empty、healthy、403/404/503/空錯誤訊息、stale reload、中英文 degraded 與 EXPIRED status |
| `pnpm --filter @drts/platform-admin-web typecheck`                                                                                                                                                                                                                                                                   | 0    | 補本地依賴連結後 route type generation 與 TypeScript 通過；空錯誤訊息補測後再次執行亦 exit 0                                                                                  |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                                                                                                                                  | 0    | 2026-09-08 fresh-rebase 後通過；本 task 沒有修改 backend，這只表示目前 worktree 依賴解析可用，不替代 adapter API 驗收                                                         |
| `pnpm exec eslint apps/platform-admin-web/app/adapter-registry/page.tsx apps/platform-admin-web/app/adapter-registry/registry-notice.ts tests/unit/system-remediation/sr-admin-adapter-001/registry-notice.test.ts tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.ts --max-warnings=0` | 0    | 相關 TypeScript／TSX 無 lint error                                                                                                                                            |
| `pnpm exec prettier --write apps/platform-admin-web/app/adapter-registry/page.tsx apps/platform-admin-web/app/adapter-registry/registry-notice.ts tests/unit/system-remediation/sr-admin-adapter-001/registry-notice.test.ts docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md`                        | 0    | 格式化本 task 檔案                                                                                                                                                            |
| `pnpm exec prettier --write tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.ts tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.tsconfig.json`                                                                                                              | 0    | 診斷檔案格式化                                                                                                                                                                |

測試範圍僅為 notice 元件渲染；未測父頁完整 fetch/flash 互動、代理、角色、表單寫入或 provider，到期四態也未冒稱完成。既有 toggle 成功提示仍沒有後端 audit receipt／reason 契約且使用要求值，必須在後續管理接線一起修復。

### Fresh-rebase revalidation（2026-09-08；不是 acceptance）

Base 為 `70355aba97c23dd1cd592b71f1d3dfe6315d91ff`。候選 SHA 會由 owner 在普通 push 後以同一 SHA 寫入 supervisor machine truth；不得以本段的舊 anchor SHA 取代候選。

| 命令                                                                                                                                                                                                                                                                                                                 | Exit | 實際結果                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------- |
| `git diff --check origin/dev...HEAD`                                                                                                                                                                                                                                                                                 | 0    | task diff 無 whitespace error                 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-adapter-001/`                                                                                                                                                                                                                                           | 0    | 1 test file、9 tests passed                   |
| `pnpm --filter @drts/platform-admin-web typecheck`                                                                                                                                                                                                                                                                   | 0    | Next route types generated，TypeScript 通過   |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                                                                                                                                  | 0    | TypeScript 通過；未主張 adapter routes 已存在 |
| `pnpm exec eslint apps/platform-admin-web/app/adapter-registry/page.tsx apps/platform-admin-web/app/adapter-registry/registry-notice.ts tests/unit/system-remediation/sr-admin-adapter-001/registry-notice.test.ts tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.ts --max-warnings=0` | 0    | scoped lint 通過                              |

### HTTP 診斷（不是 acceptance）

```bash
NODE_ENV=test pnpm --filter @drts/api exec tsx --tsconfig ../../tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.tsconfig.json ../../tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.ts
```

Exit `0` 代表診斷程式正常結束，**不代表 API 修復通過**。

- 最新讀取 source SHA：`5a8c0f73b19040b7d31260694159ffc13ad5e946`；時間 `2026-09-08T08:45:47.593Z`。controller/service 仍沒有 adapter management route；與原始問題一致。
- 先前 source SHA：`b93ab98f0031da821b1583c9f7968fa26106c426`；時間 `2026-09-06T06:34:29.386Z`，port 44639，同樣結果。
- 最新 loopback：`http://127.0.0.1:38351`，結束時已關閉。
- 請求資源 ID：`grab_taiwan`（已知 catalog code；不存在管理 endpoint，沒有建立 registry record）。
- 控制組：`public-info-demo-001` 是 service 原有 seed，只證明 controller router 正常掛載，並非本 task 產生的真資料。

| 方法與 path                                      | HTTP | 實際結果                                                                   |
| ------------------------------------------------ | ---- | -------------------------------------------------------------------------- |
| `GET /api/platform-admin/public-info`            | 200  | 既有 endpoint 回傳 items；requestId `62feffeb-866e-42bd-9c95-e5e440c06886` |
| `GET /api/platform-admin/adapters`               | 404  | `Cannot GET /api/platform-admin/adapters`                                  |
| `GET /api/platform-admin/adapters/grab_taiwan`   | 404  | `Cannot GET /api/platform-admin/adapters/grab_taiwan`                      |
| `PATCH /api/platform-admin/adapters/grab_taiwan` | 404  | `Cannot PATCH /api/platform-admin/adapters/grab_taiwan`                    |

本機 host 使用實際 controller/service，無 DB、proxy、auth guard 或 live provider；沒有將 404 當作成功 assertion。單元測試資源 `sr-admin-adapter-unit-001` 明確標為隔離 UI contract fixture，不是正式 adapter。

### 環境限制與先前失敗

- 初次 `pnpm --filter @drts/api typecheck` 在原 base exit `0`；依賴連結之後改指其他 worker，最新結果如上為 exit `2`，不保留舊通過來掩蓋失敗。
- 初次 frontend typecheck exit `2`，兩次 Vitest import exit `1`（0 tests）：本地 `packages/contracts/node_modules` 缺失，`unattended-voice.ts` 無法找到 `zod`。以本工作樹 ignored symlink 連到已有 `.pnpm/node_modules` 後，前端與 9 個回歸測試可通過；未改 manifest／lockfile 或共享 dependency store。
- `pnpm --filter @drts/contracts build` 曾因相同 `TS2307 zod` exit `2`；僅有 ignored build output。
- 診斷早期的 `pnpm --filter @drts/api exec tsx --tsconfig ../../tsconfig.json ../../tests/unit/system-remediation/sr-admin-adapter-001/registry-api-reproduction.ts` exit `1`：先遇相對依賴 symlink／tsx 缺失，之後 root tsconfig 沒有涵蓋 API 的 legacy parameter decorators。改用 task-local config 並設定 `NODE_ENV=test` 才可執行；這不是 production runtime 驗證。
- API 與 root `node_modules` 為 canonical 目錄的共享 symlink；最後 `apps/api/node_modules/@drts/control-plane-auth` 實際指到 `gemini-sr-enterprise-data-001/packages/control-plane-auth`，缺少 build 型別。需先修本地依賴隔離／建置，再重跑 API typecheck；未修改另一個 worker 的套件。

### 可恢復交付

部分修正與證據以 task-scoped commits 保存並普通 push。fresh-rebase 之後的 candidate SHA 由 handoff command 以 machine truth 記錄；尚無獨立 review、CI 或合併驗收。此 candidate 只交付已授權的 UI truthfulness regression 與可重現 scope finding；它不聲稱完成 API CRUD、角色／表單回讀、持久化 credential governance 或四態真到期驗收，仍需要 supervisor 擴 scope／安排設計與相依。

未執行：正式/dev 部署、真 registry DB CRUD／重啟回讀、provider 憑證輪替、正式角色瀏覽器表單流程、四態真到期值驗證、CI／merge／獨立 reviewer。沒有宣稱 stub/live 成功，也沒有將本 task 標為 done。
