# SR-ADMIN-ADAPTER-001 — 執行證據與 scope 缺口

## 基準與交付界線

- 日期：2026-09-06。
- Base：`afefd55d3d23dd361d2dd81fd5f80eedb6671002`，工作開始時 `git fetch origin` 後的 `origin/dev` 與 HEAD 相同。
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

執行中；完整指令與 exit code 將於本 task 後續證據 commit 補記。

未執行：正式/dev 部署、真 registry DB CRUD／重啟回讀、provider 憑證輪替、正式角色瀏覽器表單流程、四態真到期值驗證、CI／merge／獨立 reviewer。沒有宣稱 stub/live 成功，也沒有將本 task 標為 done。
