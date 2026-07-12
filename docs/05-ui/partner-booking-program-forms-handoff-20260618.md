# Partner-Booking — Insurance & Travel Form-Field Requirements (Design Hand-off)

**Date:** 2026-06-18
**Feature:** 合作叫車前台 — 保險理賠代步 / 旅行社團體接送的「建立行程」表單 + 收據
**Recipient team:** 視覺設計團隊（含 UX）
**Status:** Hand-off input. **No visual decisions in this document.**
**Author lane:** Claude
**Authority for behaviour/data/API:**
[CCAT Requirements](./../01-product/credit-card-airport-transfer-requirements-20260610.md) ·
[SA](./../02-architecture/credit-card-airport-transfer-sa-20260610.md) ·
[SD](./../02-architecture/credit-card-airport-transfer-sd-20260610.md) ·
[Design follow-up A1/A2](./credit-card-airport-transfer-design-followup-request-20260610.md)
**Visual authority (already drawn):** `drts-design-canvas/pb-screens.jsx` →
`PB_BookInsurance`, `PB_BookTravel`, `PB_Eligibility`, `PB_Review`, `PB_Error`.

> Same shape as the CCAT screen-requirements packet: §2 personas · §3 context ·
> §4 scope · §5 per-program field briefs · §6 done-vs-not · §7 visual open
> questions. **No visual decisions.**

---

## 1. Why this packet exists

The shared partner-booking funnel (`@drts/ui-web` `PartnerBookingReferenceFunnel`)
was a **single credit-card template** rendered for every partner. As of dev:

- **DONE (PR #772, #779, live on dev):** the funnel's **wording, entitlement
  framing and identity** are now per-program — `card` = 趟次, `insurance` =
  理賠代步額度, `travel` = 團體席次, `hotel` = concierge 禮遇; the card-art line
  shows the program identity (e.g. `理賠案號 ••8814`, `團號 ••0628`) instead of
  a credit-card number; landing/terms/consent/help all read in the right frame.
- **NOT DONE — this packet:** the **「建立行程」booking-form fields** and the
  **收據/行程明細 fields** are still the **credit-card airport set** for every
  program (航班 / 航廈 / 行李 / 機場附加費 …). Insurance and travel need their
  own field set.

The field-level **design already exists** in the canvas (`PB_BookInsurance`,
`PB_BookTravel`) and was scoped in the follow-up (A1/A2). This packet
**consolidates those fields for the build** and asks the design team to confirm
/ refine the field list, validation and masking before implementation. It is
**not** a request for net-new visual design where the canvas already answers it.

## 2. Personas (form-relevant)

| Code | Persona | Books for | Key reference held |
|---|---|---|---|
| `insurance_claimant` | 保險理賠申請人 | 自己（理賠期間代步） | 保單號 / 理賠號 |
| `insurance_handler` (assist) | 產險承辦人 | 代客建立 | 理賠案件 |
| `travel_group_contact` | 旅行社領隊 / 導遊 | 整團旅客 | 團號 / roster |

(Card persona is the existing `cardholder`; hotel persona = `hotel_guest`,
not in this packet's two-program scope.)

## 3. Operating context

- White-label funnel scoped per partner entry (`/[tenantSlug]`); identity comes
  from the partner reference (理賠案件 / 團號), never raw card/ID capture.
- All references **masked** in summary/receipt (e.g. `CLM-••••-8142`,
  `LION-••••-0628`). zh-TW primary / en secondary.
- The **fixed 7-screen funnel shape stays** (entry → eligibility → book →
  review → success → tracking → error/manual-review); only the **book-form
  fields + entitlement framing + receipt lines** change per program. Theme &
  brand are already wired (`lib/program-theme.ts`).

## 4. Scope

| Screen | Card (done) | Insurance (this packet) | Travel (this packet) |
|---|---|---|---|
| Book 「建立行程」 | 機場/航班 form | 理賠代步 form | 團體接送 form |
| Review 確認 | fare 摘要 | 理賠給付摘要 | 團費/席次摘要 |
| Receipt 行程明細 | 機場附加/車資 | 理賠給付明細 | 段次/團費明細 |
| Eligibility states | card_bin | 7 insurance states (A1) | roster/seat states |

Out of scope: backend eligibility/settlement, the card/hotel programs, the
funnel chrome (already themed).

## 5. Per-program field briefs

> Each field: **label (zh · en) · required? · input type · validation ·
> masking**. Visual layout authority = `pb-screens.jsx`. No visual decisions
> here. Entitlement noun differs from card (**趟次**): insurance = **理賠代步
> 額度（天 / 趟）**, travel = **團體席次（段 / 人）**.

### 5.1 Insurance — 建立代步行程（`PB_BookInsurance`）

**Block A — 理賠資訊（claim block）**
| Field | Req | Type | Notes |
|---|---|---|---|
| 保單號 · policy number | ✓ | text (masked in summary) | format per insurer; validate against eligibility |
| 理賠號 · claim number | ✓ | text (masked) | the entitlement key (not 卡號) |
| 理賠申請人 · claimant | ✓ | text | maps to passenger by default |
| 代步期間 · replacement period | — | date-range (read-only from claim) | show 剩餘天數；drives 額度 |
| 承辦人 · case handler | — | text (read-only) | 產險承辦窗口 |

**Block B — 行程地點（trip block）**
| Field | Req | Type | Notes |
|---|---|---|---|
| 上車 · pickup | ✓ | place | |
| 目的地 · dropoff | ✓ | place | 常為醫院/回診地點（非機場航廈） |
| 車型權益 · vehicle class | — | select (一般 / 商務，權益內) | from claim entitlement |
| 出發時間 · departure | ✓ | datetime | |

**Entitlement / 費用 block:** 代步權益狀態（核定通過）· 本趟費用「理賠給付」·
您將支付「免費」。**No 8折 / no 卡帳單.**

**States (A1 — give each a screen state on the eligibility/blocked path):**
`insurance_policy`(valid) · `insurance_replacement_vehicle` ·
`insurance_roster` · and negatives `insurance_pending` / `insurance_missing` /
`insurance_expired` / `insurance_cancelled`. Each maps to an eligibility/blocked
state on the funnel (reference/claim-driven, **not** free-quota).

### 5.2 Insurance — 行程明細 / 收據

理賠案號（masked）· 代步期間 · 車型 · 車資 · **理賠給付（保險核銷）** · 自付差額
(if any) · 核銷序號. **Money direction = insurer-settled**, no card statement
period, no 機場附加費 unless actually incurred.

### 5.3 Travel — 建立團體接送（`PB_BookTravel`）

**Block A — 團體資訊（group block）**
| Field | Req | Type | Notes |
|---|---|---|---|
| 團號 · group number | ✓ | text (masked) | entitlement key |
| 旅客人數 · traveler count | ✓ | number | drives 席次 |
| 行李件數 · luggage | ✓ | number | |
| 領隊 / 導遊 · guide contact | ✓ | text + phone | the booking contact |
| 航班編號 · flight number | — | text | optional (arrival batching) |

**Block B — 接送行程（itinerary block）**
| Field | Req | Type | Notes |
|---|---|---|---|
| 上車 · pickup | ✓ | place | 常為機場入境大廳 |
| 多點停靠 · multi-stop | — | place list | 團體多點（非單一 dropoff） |
| 舉牌需求 · signage | — | text | 雄獅旅遊 + 團號 |
| 出發時間 · departure | ✓ | datetime | |

**Vehicle / 席次 block:** 車輛配置（中型巴士 ×N）· **接送段數（第 X / N 段）** ·
費用「已含團費」. Entitlement = **團體席次 / 段數**, not 趟次.

**Roster / batching (A2):** multi-passenger roster (席次 count) + pickup
batching (第 1 批入境接機 / 第 2 批飯店接駁). Reuse the `PB_Landing` travel
roster + batch list already drawn in `pb-screens.jsx`.

### 5.4 Travel — 行程明細 / 收據

團號（masked）· 段次 · 車輛配置 · 人數 / 行李 · 費用「已含團費」· 行程連結
(tour itinerary). No card statement, no per-ride fare unless add-on.

## 6. What is already done vs needs build

| Item | Status |
|---|---|
| Funnel **wording / entitlement / identity** per program | ✅ live on dev (#772, #779) |
| Landing / consent / terms / help per program | ✅ live |
| Card-art shows program identity (not card no.) | ✅ live |
| Per-program **book-form fields** (§5.1, §5.3) | ❌ build needed |
| Per-program **receipt lines** (§5.2, §5.4) | ❌ build needed |
| Insurance 7 eligibility states (A1) as screen states | ❌ build needed |
| Travel roster + batching on book/review | ⚠️ drawn in canvas landing; not on book |

**Implementation note (for eng, not design):** the funnel is the shared
`@drts/ui-web/partner-booking-funnel.tsx`; the book screen currently hard-codes
the airport field set. A program-aware form layer (mirroring the existing
`programVariant()` wording layer) should drive the fields from program kind.

## 7. Purely-visual open questions (for design)

- VQ-1 Insurance **车型權益 / 代步期間** read-only chips vs editable — visual
  treatment of claim-derived (locked) fields.
- VQ-2 Travel **multi-stop + roster + batching** density on one phone screen —
  collapse/expand vs stepper.
- VQ-3 Masked-reference treatment for 理賠號 / 團號 in form vs summary vs receipt.
- VQ-4 Entitlement meter: insurance **天/趟 remaining** and travel **段/席次
  remaining** representation (vs the card 趟次 ring already drawn).
- VQ-5 Receipt money-direction badge: insurer-settled / tour-included (vs the
  card 卡帳單合併 already drawn).

## 8. Out of scope for design

- Card & hotel programs, funnel chrome/theme (done), backend
  eligibility/settlement, the partner's own claim/tour back-office.
