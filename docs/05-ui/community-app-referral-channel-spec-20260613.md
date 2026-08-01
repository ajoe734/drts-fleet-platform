# 社區物業 App 叫車嵌入 + 渠道分潤 — 架構設計 Spec（20260613）

> Status: DRAFT — 架構鎖定，待派工。Owner: chair。
> 本文是「社區物業管理 App 內嵌叫車 + 第三方渠道歸因 + 分潤」的設計依據，供後續 Phase 派工使用。
> 這是 **referral channel**（DRTS 付分潤給渠道），與信用卡機場接送的 `partner_airport`（issuer 付 DRTS）是**同一套機制的鏡像方向**，不是新系統。

## 1. 目標（business intent）

1. 社區物業 App 的住戶，能在物業 App 內**直接叫車**（內嵌頁面，不跳出宿主 App）。
2. DRTS 能**精確歸因**每一筆叫車是哪個渠道（哪個物業 App）帶來的。
3. 依歸因結果**分潤**給渠道夥伴；夥伴能看到「自家有多少用戶用了叫車、產生多少行程/金額」。
4. 住戶**重開頁面 / 重開 App** 後，仍能在物業 App 內看到自己在 DRTS 的**行程進度與歷史**（持久身分，非一次性）。

## 2. 鎖定的決策（chair 已拍板 20260613）

| # | 決策 | 選定 | 備註 |
|---|---|---|---|
| D1 | 身分交接 | **(a) Server-to-server handoff token** + **持久乘客綁定** | 物業 App 後端持 ingress 憑證換短期 token；token 解回**固定同一個 DRTS 乘客**。短期 token 管安全、持久綁定管「找得回行程」。 |
| D2 | 分潤基準 | **(a) 每筆完成行程抽成** | 引擎現成有 `tripCount` / `fareTotal`。費率 % 或固定 referral fee，落地時設定。 |
| D3 | 夥伴看數字 | **(a) 輕量 Channel Partner Portal** | 複製 `fleet-partner-portal-web` 的 `/revenue` + `/statements` 版型。 |
| D4 | 供給 | **(a) 沿用既有 owned-mobility 車隊派遣** | 不另建供給池。 |

**前置依賴**：D1(a) 要求物業 App **有自己的後端**保管 ingress 憑證、執行 s2s 換 token（憑證**不可**放前端）。若僅有純前端，須退回弱歸因（OTP），D1~D3 需重評。

## 3. 複用地圖（80% 已存在）

| 能力 | 既有積木 | 狀態 |
|---|---|---|
| 渠道夥伴實體 | `PartnerChannelEntryRecord`（`packages/contracts/src/index.ts:460`）：`partnerType`/`entrySlug`/`displayName`/`entryHost`/`entryPath`/`themeAccent`/`brandingMetadata`/`authMode`/`eligibilityMode`/`status` | ✅ 直接用，新增一個 `partnerType` 值 |
| 渠道管理 API | `tenant-partner.controller.ts:289-396`：partner-entries CRUD + activate/deactivate/revoke + ingress 憑證 issue/revoke | ✅ 直接用 |
| 歸因鏈 | `partnerEntrySlug` 已串：JWT 身分（`common/auth/jwt-auth.service.ts:19`）→ `order.partnerEntrySlug` → 結算 repository → 對帳單行 | ✅ 直接用 |
| 結算/對帳引擎 | `settlement-matrix.ts`（channel-keyed）+ `settlement-statement.types.ts`（每夥伴/每期/每渠道，含 `tripCount`/`fareTotal`/明細/方向/artifact hash） | ⚠️ 需泛化方向（見 §6） |
| Embed 身分狀態機 | partner-booking `PB-EMBED-20260611`：5 態 Handoff/Reauth/Unsupported/Consent/Fallback，host-resolved 入口，非授權 host 擋掉 | ✅ 鏡像沿用（identity 換成 partner token） |
| 嵌入頁殼 | `apps/passenger-web`（book/trip/trips/receipts + 負向流程路由齊全） | ⚠️ 目前僅 UI 殼：無 API 串接、無 env、`lang="en"`、不在 deploy-dev → 需接身分+API |

## 4. 端到端流程

### 4.1 首次叫車（handoff + 建綁定）
```
住戶在物業App點「叫車」
  → 物業App前端 向 物業App後端 要嵌入URL
  → 物業App後端 用 ingress憑證(PARTNER_INGRESS_KEY) 呼叫 DRTS:
        POST /partner/ingress/handoff  { partnerUserRef, entrySlug, ...consent }
  → DRTS:
        1) 查/建 身分綁定 (entrySlug, partnerUserRef) → drtsPassengerId   ← 持久
        2) 簽發短期乘客 session JWT（含 partnerEntrySlug, drtsPassengerId, exp 短）
        3) 回 { handoffToken }
  → 物業App後端 把 handoffToken 注入 iframe（簽名URL 或 postMessage）
  → passenger-web /embed 用 token 建立 session → 叫車流程
  → 建立 order：order.partnerEntrySlug = entrySlug   ← 歸因落地
```

### 4.2 重開頁面（持久身分 — D1 的關鍵需求）
```
住戶稍後重開物業App的叫車頁
  → 物業App後端 再次 s2s 換 token（同 partnerUserRef）
  → DRTS 解出 **同一個 drtsPassengerId**（綁定已存在，不新建）
  → passenger-web /embed 顯示 **既有行程進度 + 歷史 + 收據**
```
重點：短期 token 會過期（安全），但 `(entrySlug, partnerUserRef) → drtsPassengerId` 綁定是持久的，所以「找得回資料」由綁定保證，不靠 token 存活。

### 4.3 分潤對帳（月結）
```
完成行程 → 結算引擎依 channelKey = partner_referral 歸集該 entrySlug 的行程
  → 月底產生對帳單：tripCount / GMV(fareTotal) / 分潤金額（方向 = drts_pays_partner）
  → Channel Partner Portal 顯示；DRTS 照單付款
```

## 5. 資料模型 deltas（新增）

1. **`partnerType = "referral_channel"`**（或對應既有 `PartnerEntryAuthMode`/enum 值，落地前確認 enum 真實值）— 標記這類「導流渠道」夥伴，與 `card`/`enterprise` 區隔。
2. **身分綁定表** `partner_user_identity_link`（新）：
   - PK: `(partnerEntrySlug, partnerUserRef)` → `drtsPassengerId`
   - 欄位：`createdAt`、`lastSeenAt`、`consentScope`、`status`
   - 用途：§4.2 持久解析。`partnerUserRef` 是物業 App 端的穩定使用者 id（對 DRTS 不透明）。
3. **settlement-matrix 新增 channel** `partner_referral`（見 §6）。
4. 分潤費率設定（attach 在 partner entry 或獨立 rate 表）：% of fare 或固定 per-trip fee + 生效期間。

> 不需新增的：`partnerEntrySlug` 在 order/JWT/結算已是一級欄位，§4 歸因免改 schema。

## 6. 結算引擎泛化（唯一較重的後端工作）

現況：`settlement-statement.types.ts` 把方向與渠道**寫死**：
- `SETTLEMENT_STATEMENT_DIRECTION = "issuer_pays_drts"`
- `SETTLEMENT_STATEMENT_CHANNEL_KEY = "partner_airport"`

需要：
1. `settlement-matrix.ts` 新增一筆 `channelKey: "partner_referral"`：
   - `payerType`: DRTS（平台付分潤給渠道）
   - 方向：**`drts_pays_partner`**（新方向，與 `issuer_pays_drts` 相反）
   - `reconciliationPath`: referral 對帳單 + 歸因稽核
2. 把 statement 引擎從單一寫死方向，泛化成「依 channelKey 取方向」。對帳單行對 referral 而言計：完成行程、fare、分潤額（fare × rate）。
3. 沿用既有 `artifactRef` / `manifestHash` 機制（稽核不變）。

## 7. Embed 安全（鏡像 PB-EMBED）

- iframe CSP `frame-ancestors` 以 partner entry 的 `entryHost` 白名單；非授權 host → Unsupported 態。
- `postMessage` origin 白名單同 `entryHost`。
- token 短期、單次或短窗；換發走 s2s（憑證不落前端）。
- 5 態沿用：Handoff / Reauth（token 過期重換）/ Unsupported / Consent（首次同意叫車/PII 範圍）/ Fallback（回獨立 passenger-web）。

## 8. 分階段派工

| Phase | 範圍 | 風險 | 依賴 |
|---|---|---|---|
| **P0 驗證歸因** | platform-admin 用既有 partner-entries API 建一個 `referral_channel` 測試渠道，跑一筆 order 確認 `partnerEntrySlug` 寫到底 | 極低（幾乎零開發） | 需 dev API 在線 |
| **P1 Embed 殼** | passenger-web 加 `/embed/[entrySlug]`、依 entry 解品牌/主題、CSP/postMessage 安全、接 API（目前未串） | 中 | 需先定 UI realm token / canvas |
| **P2 身分 handoff** | `POST /partner/ingress/handoff` 端點 + `partner_user_identity_link` 綁定表 + 乘客 JWT 燒 partnerEntrySlug + 重開解析 | 中高（身分/安全核心） | P0 |
| **P3 分潤引擎** | settlement-matrix 加 `partner_referral` + statement 引擎泛化方向 + 費率設定 | 中 | P0 |
| **P4 夥伴面板** | Channel Partner Portal：複製 fleet-partner-portal `/revenue`+`/statements` | 中 | P3 |

建議順序：**P0 先行驗證歸因可信** → 再投 P1/P2/P3 並行 → P4 收尾。

## 9. 待確認 / 開放項

1. 物業 App 是否有後端（D1(a) 硬依賴）— 預設「有」。
2. 分潤費率形式與數值（% vs 固定）、結算幣別、付款週期。
3. `partnerUserRef` 的穩定性保證（物業 App 端不可換 id，否則綁定斷裂、行程「消失」）。
4. PII / 同意範圍：Consent 態要取得哪些（行程、地址、聯絡方式）。
5. UI 視覺真實來源：embed 殼的 realm token / canvas（依 §UI Design Contract，視覺不可自創）。

## 10. Guardrails（沿用全專案規範）

- 視覺一律走 `@drts/ui-tokens` realm token + design canvas，**不得自創/套皮**；canvas 缺頁則寫 screen-requirements 後停手。
- 歸因/結算改動需 typecheck + build + vitest 三關（vitest ≠ typecheck）。
- partner ingress 憑證測試需 `beforeAll` 種 `PARTNER_INGRESS_KEY_*`（見既有 TenantPartnerService 規範）。
- 分支從 `origin/dev` 切；done 必須真的進 dev（integration_gate），不可 branch-only。
