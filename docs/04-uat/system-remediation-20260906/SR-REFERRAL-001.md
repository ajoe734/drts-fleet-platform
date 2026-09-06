# System Remediation Evidence: SR-REFERRAL-001

## 任務基本資訊

- **Task ID**: `SR-REFERRAL-001`
- **任務名稱**: 修復轉介 handoff 與可用 fallback
- **Owner**: `Gemini2`
- **Reviewer**: `Claude`
- **Base SHA**: `bb265b286d718e61d2c50479deb0ddcd031a4597`
- **Candidate Branch**: `gemini2/sr-referral-001`
- **審計關聯項**: R07, C020, C021

---

## 根因分析與問題定位

### 1. 轉介點擊 CTA 出現 403 (R07)

- **現象**: 點擊社區 App 內叫車轉介時，導向內嵌頁出現 403 封鎖。
- **根因**:
  1. `apps/referral-embed-web/lib/embed-security.ts` 原先在未設定環境變數 `REFERRAL_EMBED_ALLOWED_HOSTS` 時，`parseAllowedEntryHosts(undefined)` 回傳空陣列 `[]`，導致合法正式社區宿主（如 `app.yuhe-living.com.tw`）在進行安全判定時觸發 `embed_allowlist_missing` 而被阻擋。
  2. `TenantPartnerController.issueReferralEmbedHandoffArtifact` 無條件執行 `requireScopedInternalKey`，導致使用正式/測試 partner `apiKey`（例如合法測試 issuer）呼叫時因缺乏內部金鑰標頭而遭到 401/403 拒絕。
  3. 單次性 handoff artifact 若直接以 query 參數渲染，在頁面刷新或轉跳時會二次消費而觸發重播失敗 (`REFERRAL_HANDOFF_REPLAYED`)。

### 2. 未交接狀態虛假聲明簽章有效 (C020)

- **現象**: 未經身份驗證的使用者直接訪問 `state=handoff` 頁面時，畫面顯示「社區簽章有效 valid」與假住戶姓名。
- **根因**:
  - `resolveEmbedContext` 在無 session 且請求 state 為 handoff 時未標記錯誤；`HandoffScreen` 元件未檢查 `context.session` 是否存在，直接寫死 `TokenRow ok label="社區簽章有效" value="valid"`。

### 3. FallbackScreen 自迴圈導向與無獨立網站時死路 (C021)

- **現象**: 點擊「前往獨立叫車網站」按鈕時，導向回自身 `/embed/[entrySlug]?state=fallback`，造成無限迴圈；在未配置獨立叫車網站時無可復原途徑。
- **根因**:
  - `FallbackScreen` 的 `ActionButton` 寫死 `href={buildHref(context, { state: "fallback" })}`。
  - 當無外部叫車網站時，缺少來源標註資訊與客戶服務聯絡途徑。

---

## 修復與實作說明

### 1. 規範化合法宿主白名單與 Fail-Closed 防護 (`lib/embed-security.ts`)

- 引入 `CANONICAL_PARTNER_ENTRY_HOSTS`，以正式 partner seed 紀錄（`app.yuhe-living.com.tw`、`app-stg.yuhe-living.com.tw`、`localhost:3005` 等）作為預設白名單。
- 當環境變數未提供時安全回退至正式合法清單；未在白名單內之未授權 host 維持 fail-closed，嚴格拒絕並設定 `frame-ancestors 'none'` 與 `X-Frame-Options: DENY`。

### 2. 開放測試發行者 Partner API Key 認證 (`tenant-partner.controller.ts`)

- `issueReferralEmbedHandoffArtifact` 將內部金鑰保護限定於 `allowInternalBootstrap = !command.apiKey?.trim()`。
- 當呼叫端提供有效 partner `apiKey` 時，正常進入授權簽章發行流程，允許合法測試與正式合作夥伴簽章。

### 3. Middleware 與 Route Handler 權杖安全交換 (`middleware.ts`, `app/api/referral/session/route.ts`)

- 在 Next.js middleware 中偵測 `artifact` / `token` 查詢參數，通過 entryHost 授權檢驗後重定向至 `/api/referral/session?action=exchange`。
- Session route GET handler 調用 `consumeReferralEmbedHandoffArtifact` 消費權杖，寫入 HTTP-only 安全 session cookie (`writeReferralEmbedSession`)，並將網址乾淨重定向至 `returnTo`（去除 artifact query），防止單次使用權杖二次消費。
- 精確攔截異常：
  - `REFERRAL_HANDOFF_EXPIRED` -> `state=reauth&issue=expired`
  - `REFERRAL_HANDOFF_REPLAYED` -> `state=reauth&issue=replayed`
  - `REFERRAL_HANDOFF_HOST_MISMATCH` -> `state=unsupported&issue=wrong_host`

### 4. 內嵌介面身分真實性與 Fallback 非迴圈設計 (`components/passenger-embed.tsx`, `lib/embed-context.ts`)

- **`HandoffScreen`**: 透過 `const isAuthenticated = Boolean(context.session)` 控制：
  - 已交接驗證: 顯示「社區簽章有效 valid」、真實住戶識別與戶別，CTA 為「開始叫車」。
  - 未交接狀態: 顯示「等待社區簽章權杖 / 未交接」、簽章狀態為 `missing_or_invalid`、住戶「未解析」，CTA 為「回社區 App 重新進入」，嚴格禁止虛假宣稱。
- **`FallbackScreen`**:
  - 將 `buildStandaloneFallbackUrl` 拆分移至 client-safe 模組 `apps/referral-embed-web/lib/embed-fallback.ts`，並於 `embed-context.ts` 重新導出維持雙向相容；`components/passenger-embed.tsx` 改由 client-safe 模組載入，避免 client component 打包時連帶引入 `next/headers` 導致 Next.js build 失敗。
  - 移除無用 `_demo` 參數，保證 `pnpm run lint` 零警告零錯誤。
  - 當有配置外部獨立網站（環境變數或品牌後設資料）時，透過 `buildStandaloneFallbackUrl` 帶入來源標註參數 (`source=referral_embed`、`entrySlug`、`partnerCode`、`partnerUserRef`、`drtsPassengerId`)，連結直接指向外部獨立叫車網站，不回連內嵌頁。
  - 當無配置外部獨立網站時，呈現清晰的可復原狀態與「轉介來源資訊」（包含轉介入口、合作夥伴代碼、住戶識別、客服專線），並提供撥打客服按鈕 (`tel:`) 與回社區 App 按鈕，完全杜絕自迴圈。
- **`ReauthScreen`**: 根據 issue 標記準確區分過期 (`expired`) 與重播 (`replayed`)，避免含糊錯誤。

---

## 驗證測試與執行結果

### 1. 單元測試套件

新增測試檔案：`tests/unit/system-remediation/sr-referral-001/referral-handoff-fallback.test.ts`（涵蓋 18 項測試）。

執行指令：

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-referral-001/
```

執行結果：

- **Exit Code**: `0`
- **測試結果**: 18 passed (18)

### 2. 既有轉介單元測試回歸

執行指令：

```bash
pnpm exec vitest run tests/unit/referral-embed-security.test.ts tests/unit/referral-embed-routing.test.ts tests/unit/referral-embed-passenger-lifecycle.test.ts
```

執行結果：

- **Exit Code**: `0`
- **測試結果**: 23 passed (23)

### 3. 專案 TypeScript 型別與建置檢查

- `pnpm --filter @drts/referral-embed-web typecheck` -> **Exit Code: 0**
- `pnpm --filter @drts/api typecheck` -> **Exit Code: 0**
- `pnpm --filter @drts/referral-embed-web build` -> **Exit Code: 0** (`next build --webpack` 成功，無 client-side next/headers 錯誤)
- `pnpm --filter @drts/referral-embed-web lint` -> **Exit Code: 0** (`eslint . --max-warnings=0` 通過)

### 4. Git 差異與空白檢查

```bash
git diff --check
```

- **Exit Code**: `0` (無空白或衝突標記)

---

## Live Boundaries 說明

1. **內部金鑰 vs 夥伴金鑰邊界**:
   - `/partner/ingress/referral-embed-handoff` 僅在無 `apiKey` 時強制要求 `DRTS_REFERRAL_EMBED_HANDOFF_KEY` 內部標頭。
   - `/partner/ingress/referral-embed-handoff/consume` 與 `/consent` 為平台後台內部通道，維持嚴格內部金鑰驗證。
2. **安全白名單邊界**:
   - 未在白名單中的 `entryHost` 嚴格維持 fail-closed 阻擋 (`403 Forbidden`)，並送出 `X-Frame-Options: DENY` 與 `frame-ancestors 'none'`。
3. **Session Cookie 隔離**:
   - `drts_referral_embed_session` 設為 `httpOnly: true`, `sameSite: lax`, 安全簽名與防竄改，驗證 `partnerEntrySlug` 與 `entryHost` 綁定，跨 entry 或跨 host 自動失效。
4. **寫入範圍邊界**:
   - 嚴格遵守 5 項指定寫入範圍，未修改超出範圍之程式碼。
