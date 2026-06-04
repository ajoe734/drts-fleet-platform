# DRTS 多語系（i18n）規範 — Ops Console & Platform Admin

- 日期：2026-06-04
- 範圍：`apps/ops-console-web`、`apps/platform-admin-web`
- 目標語系：`en`（English）、`zh`（繁體中文 zh-TW）
- 狀態：**規範（normative）**。所有 i18n 修正與新頁面都必須遵循本文件。
- 配套文件：
  - 盤點與逐檔修正清單：[i18n-remediation-implementation-20260604.md](./i18n-remediation-implementation-20260604.md)
  - 完整原始證據（逐行）：
    - [appendix-ops-console-cjk-lines.txt](./i18n-audit-20260604/appendix-ops-console-cjk-lines.txt)
    - [appendix-platform-admin-cjk-lines.txt](./i18n-audit-20260604/appendix-platform-admin-cjk-lines.txt)

---

## 0. 為什麼要這份規範（盤點結論）

對兩個平台做了**逐頁、逐欄位、逐字句**的盤點（覆蓋 Ops Console 21 個 `.tsx`、Platform Admin 22 個 `.tsx`，共 2,173 行含中文的程式碼，外加 `translations.ts` 字典比對）。結論：

1. **字典本身是好的，但幾乎沒被用到。** 兩 app 各有 `lib/translations.ts`（`en`/`zh` 雙字典，鍵值對齊 100%，TS 強制 parity），但**頁面主體完全沒走 `t()`**。中央字典只服務 nav/shell/common，頁面 body 全部繞過它。
2. **每一頁各自重造雙語輪子。** 盤點到 **30+ 個各自定義的 `copy()` / `tx()` / `copyText()` 內聯函式**，外加滿地的 `locale === "en" ? A : B` 三元、`{ en, zh }` 內聯字典、以及每頁一個 `const copy = locale === "en" ? {…} : {…}` 巨型物件。完全去中心化 → 無法集中 QA、無法建術語表、無法 lint。
3. **整頁未接雙語（只有中文）的破頁。** 切到 English 仍顯示中文。已確認：
   - Platform Admin：`pricing/page.tsx`（發佈版本／生效開始／名稱／`NT$ 85 / 起` 全硬編中文）、`tenants/[tenantId]/page.tsx`、`payments/reimbursements/page.tsx`、`tenant-governance` 與 `health` 的狀態詞（超標／警戒／正常／降級／中斷）。
   - Ops Console：`dashboard/page.tsx` L736–746（訂單／租戶／上車地／時窗／狀態／司機）、`dispatch/[dispatchId]/page.tsx` L79「建立」、L415「人工覆核」。
4. **大量中英夾雜的「半翻譯」。** zh 字串裡塞著未翻的英文技術詞。出現頻率（unique 字串內嵌）：`adapter`×34、`override`×22、`dispatch`×21、`credential`×18、`session`×16、`callback`×14、`fallback`×13、`rollout`×12、`queue`×12、`scope`×10…。例：「開新 call session」「回覆 ETA」「載入 adapter registry 中」「Active alerts · 跨模組告警總覽」「候選 driver · ranked」「Workspace 訊號」。
5. **術語不一致。** 同一概念多種譯法：dispatch＝派遣／派車／派送；forwarded＝轉派／forwarded；Refresh＝重新整理／刷新／重整／立即刷新；manual fallback＝人工 fallback／人工轉派／人工備援。
6. **預設語系小不一致。** `getServerLocale()` 兩 app 皆預設 `zh`；Admin client `i18n.tsx` 也預設 `zh`（一致）；但 Ops `i18n.tsx` 的 React context fallback 仍是 `en`（provider 外才會踩到，屬潛在 hydration/閃爍風險）。
7. **字典殘留未翻值（次要）。** `translations.ts` 內 zh==en 的鍵：Ops 21 個、Admin 13 個。多數可接受（ETA／Email／ID／`{name} · {driverId}`），少數該補譯：Accept pending／Manual fallback／Sync failed／Channel mix／Settlement matrix／Mismatch review／Insight／Legal Hold／Forwarded reconciliation。

> 一句話：**雙語不是「沒翻」，是「翻得到處都是、各自為政、半中半英、還有幾頁根本沒接」**。本規範訂定唯一正確做法，配套文件給出逐頁修正清單。

---

## 1. 架構決策（ADR）

### 決策：以中央 `translations.ts` + `t()` 為唯一 i18n 來源；廢除所有頁面內聯雙語機制。

- **MUST** 所有使用者可見字串都經由 `t("key")`（client，`useTranslation()`）或 `t(key, locale)`（server，`getServerLocale()`）取得。
- **MUST NOT** 在頁面/元件內定義 `copy()`、`tx()`、`copyText()` 等內聯雙語 helper。
- **MUST NOT** 使用 `locale === "en" ? "…" : "…"`、`zh ? "…" : "…"`、或內聯 `{ en: "…", zh: "…" }` 來產生顯示字串。
- **MUST NOT** 在 `.tsx`/`.ts` 內出現任何硬編碼的使用者可見字面字串（中文或英文皆然），除非它在 `translations.ts` 的 `en`/`zh` 字典內。
- **例外（允許硬編碼字面值）**：純標點/符號（`·`、`—`、`/`、`-`）、數字格式、CSS class、`data-*`、test id、URL、icon 名、enum/code 值（僅供邏輯判斷、不直接顯示）。顯示用的 code 值必須經 `formatOpsCodeLabel()` / `formatPlatformCodeLabel()`（這些函式本身須改為查 `translations.ts`）。

**理由**：盤點顯示去中心化是所有問題的根，集中化一次解決 QA、術語一致、lint、未來第三語系擴充。

### 過渡規則
- 既有頁面改寫時，**整檔**移除內聯機制；不允許新增內聯、只改一半。
- 新增鍵一律加進**兩個**字典（`en` 與 `zh`），靠 TS `Record<keyof typeof en, string>` parity 保證不漏鍵。

---

## 2. Key 命名規範

格式：`<domain>.<section>.<element>`，全小寫 camelCase 段，點分隔。

- domain = 路由/模組：`dashboard`、`dispatch`、`complaints`、`callcenter`、`reports`、`revenue`、`attendance`、`incidents`、`maintenance`、`vehicles`、`drivers`、`contracts`、`approvals`、`featureFlags`；Admin：`home`、`tenants`、`tenantGov`、`partners`、`users`、`fleet`、`switchboard`、`pricing`、`payments`、`reimbursements`、`health`、`notices`、`audit`、`adapters`。
- 共用：`common.*`（按鈕、狀態、空狀態通用詞）、`nav.*`、`app.*`。
- 表格欄位：`<domain>.col.<field>`。空狀態：`<domain>.empty.<variant>.{title,body,cta}`。動作：`<domain>.action.<verb>`。確認框：`<domain>.confirm.<verb>.{title,body}`。
- 參數插值用 `{name}`：`"driver.subtitle": "{name} · {driverId}"`，呼叫 `t("driver.subtitle", { name, driverId })`。
- **MUST NOT** 把整句英文當 key（如 `t("Create complaint")`）。key 是穩定識別碼，不是英文文案。

---

## 3. zh-TW 術語表（Glossary）— 正規譯法

修正中英夾雜時，**MUST** 採用下表「正規 zh-TW」。標記 `KEEP` 者維持英文（業界通用縮寫/產品詞），但前後仍須是中文語境。

| 英文 | 正規 zh-TW | 規則 | 盤點到的錯誤譯法（須修正） |
|---|---|---|---|
| dispatch | 派遣 | 譯 | 派車、派送 |
| forwarded (order/mirror) | 轉派（單／鏡像） | 譯 | forwarded、轉接 |
| adapter | 轉接器 | 譯 | adapter（「載入 adapter registry 中」） |
| adapter registry | 轉接器登錄 | 譯 | adapter registry |
| reconciliation | 對帳 | 譯 | reconciliation |
| override (fare) | 車資覆寫 | 譯 | override、fare override |
| override (exception) | 例外覆核 | 譯 | override |
| manual fallback | 人工備援 | 譯 | 人工 fallback、人工轉派 |
| session (call) | 通話工作階段（簡：工作階段） | 譯 | session、call session（「開新 call session」） |
| callback | 回撥 | 譯 | callback（「Callback 佇列」「建立 callback」） |
| queue | 佇列 | 譯 | queue |
| gate | 資格關卡（簡：關卡） | 譯 | gate |
| scope | 權限範圍 | 譯 | scope |
| credential | 憑證 | 譯 | credential |
| secret | 密鑰 | 譯 | secret |
| token | 權杖 | 譯（縮寫情境可 KEEP） | token |
| rollout | 推行 | 譯 | rollout（「進行中 rollout」） |
| workspace | 工作區 | 譯 | workspace（「Workspace 訊號」） |
| snapshot | 快照 | 譯 | snapshot |
| provision | 開通 | 譯 | provision（「尚未 provision」） |
| banner | 橫幅 | 譯 | banner |
| audit receipt | 稽核收據 | 譯 | audit receipt |
| readiness | 上線準備度 | 譯 | readiness |
| posture | 態勢（traffic posture＝流量態勢） | 譯 | 姿態、posture |
| backlog | 待辦積壓 | 譯 | backlog |
| stepper | 步驟列 | 譯 | stepper |
| placard | 牌貼 | 譯（已一致） | — |
| tenant | 租戶 | 譯 | — |
| partner entry | 合作夥伴入口 | 譯 | partner entry |
| complaint | 客訴 | 譯 | — |
| incident | 事故 | 譯 | — |
| maintenance (work order) | 維修（工單） | 譯（現用「保修」，統一改「維修」） | 保修 |
| ETA / SLA / API / RBAC / TTL / CSV / PDF / ZIP / URL / ID / KPI | （同左） | KEEP | — |

> 完整 code-switch 清單見 appendix；上表為高頻必修項。新增術語請先在此表登記再使用。

---

## 4. 文案風格

- zh-TW 句尾用全形句號「。」；en 用半形「.」。
- 全形/半形：中文夾英文/數字時，中英之間**不**強制空格，但同一字串內須一致；標點一律對應語系（zh 用「，。、（）」，en 用 `, . ()`）。
- 大小寫：en 表頭可全大寫（既有風格 `REQUEST`/`TENANT`），但須整頁一致；對應 zh 用一般詞（請求／租戶）。
- 不可在 en 文案殘留中文，反之亦然（除 KEEP 術語）。

---

## 5. 預設語系與 hydration

- server 與 client 預設一律 `zh`。**MUST** 修正 Ops `lib/i18n.tsx` 的 `createContext` 預設值與 `LanguageProvider` 參數預設由 `en` 改為 `zh`，與 `getServerLocale()` 對齊，避免 provider 外 fallback 不一致。
- cookie key 統一 `drts-locale-v2`（現況一致，保留）。localStorage 與 cookie 須同步寫入（現況 `setLocale` 已同步，保留）。
- `<html lang>` 須隨 locale（現況已做，保留）。

---

## 6. 防回歸：Lint / CI Guard

新增一支 i18n guard（建議 `scripts/i18n-guard.mjs`，掛 CI 與 pre-commit），對 `apps/*/app/**` 與 `apps/*/components/**` 的 `.tsx`/`.ts`（排除 `translations.ts`）檢查並**fail**：

1. **無內聯雙語 helper**：禁止出現 `function copy(`/`function tx(`/`function copyText(`、`const copy = locale === `、`locale === "en" ?`、`locale === "zh" ?`、`zh ? "`、內聯 `{ en: "…", zh: "…" }`。
2. **無硬編碼 CJK**：`.tsx`/`.ts`（非註解、非 `translations.ts`）不得出現 `[一-鿿]`。
3. **無硬編碼 JSX 英文文字節點**：JSX text node 與 `placeholder|title|label|aria-label|alt` props 內不得是裸字面字串（須為 `{t(...)}`）。允許白名單：符號/數字/KEEP 術語。
4. **字典 parity**：`zh` 必須涵蓋 `en` 全部 key（TS 已強制，guard 再做執行期確認）。
5. **術語檢查（warn→error）**：zh 值不得包含 §3 表「錯誤譯法」字串（adapter／session／callback／override／fallback…的未翻形）。

guard 必須能輸出「檔案:行」清單，供 worker 逐條清。

---

## 7. 驗收準則（Definition of Done，每個頁面）

一個頁面視為「雙語完成」當且僅當：

- [ ] 全檔無內聯雙語 helper、無 `locale ===` 顯示分支、無內聯 `{en,zh}`。
- [ ] 全檔無硬編碼 CJK、無硬編碼 JSX 文字（除白名單）。
- [ ] 所有顯示字串來自 `translations.ts`，且 `en`/`zh` 兩側皆存在、皆正確、無中英夾雜（除 KEEP 術語）。
- [ ] 術語符合 §3 glossary。
- [ ] `en` 模式整頁無中文殘留；`zh` 模式整頁無英文殘留（除 KEEP）。
- [ ] i18n guard 對該檔 0 violation。
- [ ] 切換語言（語言鈕）整頁即時切換，無閃爍、無遺漏欄位。
