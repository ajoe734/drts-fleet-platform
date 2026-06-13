# 社區物業 App 叫車嵌入 + 渠道分潤 — 前端畫面需求（設計團隊 handoff，20260613）

> 本文是**畫面需求 + 商業流程**，交設計團隊做視覺。**不含視覺設計**（依專案規範：LLM 不設計 UI）。
> 上位架構見 [community-app-referral-channel-spec-20260613.md](community-app-referral-channel-spec-20260613.md)。
> 後端/非頁面工作已另行派工（`scripts/dispatch-community-referral-channel-20260613.py`），**不在設計範圍**。
> 視覺真實來源：`@drts/ui-tokens` realm token + design canvas；下列每個畫面標注該擴充哪個既有 canvas 或需新建 canvas。

## 設計總原則

- **zh-TW 為主**，文案走中央 `lib/translations.ts` `t()`，不得 inline。
- **內嵌情境（embed/webview）**：宿主是社區物業 App，畫面要 **compact chrome**（無獨立站的大導覽列/頁尾），能塞進宿主的 webview 視窗；品牌用 partner entry 的 `themeAccent` / `brandingMetadata`（不可寫死 hex）。
- 顏色/字體一律 realm token；缺畫面時寫需求、不自創。
- 參考既有 partner-booking 的 **PB-EMBED**（5 態 embed 身分狀態機）作為互動範式來源。

---

## 群組 A｜passenger-web 內嵌叫車前台（複用 `apps/passenger-web`，新增 `/embed/[entrySlug]`）

> 現況：passenger-web 已有 book / trip / trips / receipts 與負向流程路由，但只是英文 UI 殼。本群組是把它包進**內嵌＋品牌＋身分交接**的情境。
> Canvas：passenger-web **目前無 design canvas → 需新建** `docs/05-ui/drts-design-canvas/Passenger Embed.html` + `passenger-embed-screens.jsx`。

### A1. 身分交接狀態機（`/embed/[entrySlug]` 進入點）— 鏡像 PB-EMBED 5 態
住戶從物業 App 點「叫車」進來，畫面先落在身分狀態，再進叫車。需設計 5 態：
1. **Handoff（交接中/已登入）**：宿主已帶 token 進來，顯示「以 〔物業品牌〕 身分為您準備叫車」過場，成功即進 A2。
2. **Reauth（重新認證）**：短期 token 過期，請住戶回宿主 App 重新進入（不在內嵌頁要求帳密）。
3. **Unsupported（非授權宿主）**：非白名單 host 內嵌 → 明確擋下，不洩任何資料。
4. **Consent（同意範圍）**：首次使用，取得叫車/必要 PII（行程、上下車地址、聯絡方式）同意。
5. **Fallback（回獨立站）**：內嵌異常時，導引至獨立 passenger-web 入口。

### A2. 叫車請求（book）
- 內嵌版的叫車表單：上車/下車、時間、車種（沿用 owned-mobility 服務）。
- 負向狀態沿用既有路由設計，但要 compact：denied / ineligible / no-supply / degraded。

### A3. 進行中行程（active trip status）
- 司機媒合、ETA（**框為估計值非保證**）、可取消視窗。
- **重點**：此頁要能在住戶**重開宿主 App / 重開頁面**後，仍顯示其進行中行程（持久身分需求）。

### A4. 行程歷史（trips）＋ A5. 收據（receipts）
- 住戶重開後找得回過往行程與收據（持久綁定保證資料可重得）。
- 內嵌 compact 版；收據需符合既有 PII 遮罩規範。

### A6. 完成 / 取消（completed / cancelled / cancel）
- 沿用既有 trip/completed、trip/cancelled、trip/cancel 流程，compact 化。

---

## 群組 B｜Channel Partner Portal（渠道夥伴看自己的數字）

> 目的：物業 App 夥伴看「自家有多少用戶用叫車、產生多少行程/金額、分潤多少」。
> 建議**複製 `apps/fleet-partner-portal-web` 的 `/revenue` + `/statements` 版型**起手。
> Canvas：**擴充** `docs/05-ui/drts-design-canvas/Fleet Partner Portal.html` / `fleet-screens.jsx`（沿用同一 portal realm），新增 referral 專屬區塊。

### B1. 渠道總覽 / Dashboard
- 本期重點數字：**去重活躍叫車用戶數**、完成行程數、GMV、預估分潤額。
- 期間切換（月）。

### B2. 用量明細（usage）
- 依期間列出：活躍用戶數、行程數趨勢；可下探到行程層級（去識別/遮罩後）。

### B3. 分潤對帳單（statements：列表 + 明細）
- 列表：每期一張（period、tripCount、GMV、分潤額、狀態 published/paid/due）。
- 明細：對帳單行（完成行程、fare、分潤額）；沿用既有 statement artifact/hash 呈現。
- 金額方向為 **DRTS 付給夥伴**（與信用卡線相反），文案需正確表達「應收分潤」。

---

## 群組 C｜platform-admin 渠道管理（DRTS 內部營運方）

> 目的：DRTS 營運方建立/維運 referral 渠道夥伴與費率。
> 建議**擴充既有 partner-entries 管理畫面**（後端 API 已存在：`platform-admin/partner-entries` CRUD + activate/deactivate/revoke + 憑證 issue/revoke）。
> Canvas：**擴充** platform-admin 既有 partner/entries 相關 canvas（`docs/05-ui/drts-design-canvas/platform-*`），新增 referral 類型欄位。

### C1. 建立 / 編輯 referral 渠道
- 欄位：displayName、entrySlug、`partnerType=referral_channel`、**entryHost 白名單**（embed CSP 用）、themeAccent / brandingMetadata。
- 狀態：active / inactive / revoked。

### C2. 分潤費率設定
- rateType（百分比 / 每趟固定）、value、currency、生效期間；變更需顯示已寫 audit。

### C3. Ingress 憑證管理
- 簽發 / 撤銷 s2s ingress 憑證（供物業 App 後端換 token）；憑證僅顯示一次、之後遮罩。

---

## 設計團隊輸入需求 / 待澄清

1. **內嵌尺寸與宿主約束**：物業 App webview 的最小寬高、是否深色模式、是否要無捲動單頁。
2. **品牌客製深度**：只換主色 + logo，還是要更深的 white-label（字體/圓角）？對應 `brandingMetadata` 欄位範圍。
3. **Consent 文案範圍**（A1.4）：法務需要的同意項目清單。
4. **分潤對帳單**對外可揭露的明細粒度（行程層級是否對夥伴顯示去識別後資訊）。
5. 新建的 Passenger Embed canvas 是否沿用某既有 realm，或要新的 referral realm 配色。

## 交付建議順序

1. 先出 **群組 A（內嵌叫車 5 態 + 叫車/行程/歷史）** canvas — 這是住戶直接接觸面、也是後端 handoff/attribution 對接點。
2. 再出 **群組 B（Channel Partner Portal）** — 等後端 referral 對帳 API（CRC-BE-007）就緒前可先設計。
3. **群組 C** 擴充既有 admin，最後收。
