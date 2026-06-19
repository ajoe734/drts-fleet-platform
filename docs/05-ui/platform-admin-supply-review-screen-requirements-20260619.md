# Platform Admin — 供給審核 Supply Review（Design Hand-off）

**日期：** 2026-06-19
**Feature：** Platform Admin 平台審核人受理車行 supply submission：審核佇列 + 審核詳情（side-by-side diff、文件檢視、核可/補正/駁回），核可即 provision canonical registry
**Recipient team：** 視覺設計團隊（含 UX）
**Status：** Hand-off input. **No visual decisions in this document.**
**Author lane：** Claude
**Authority：**
[SA §4.8/§4.11/§8.2/§9](./../02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md) ·
[SD §3.2/§5.1/§6.2/§8](./../02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md)
**Visual authority（既有殼／IA，請延用）：** `drts-design-canvas/platform-screens-3.jsx`、`platform-screens-1.jsx`、`mgmt-shell.jsx`、`mgmt-primitives.jsx`、`mgmt-tokens.jsx`、`Platform Admin.html`

> 與 `credit-card-airport-transfer-screen-requirements-20260610.md` 同型。**No visual decisions.**

---

## 1. 為什麼有這份 packet

Platform Admin（`apps/platform-admin-web`）已有 service-products / vehicle-eligibility / fleet-partners / tenants 等路由，但**沒有 `/supply-review`**，canvas 也無對應稿。SA §4.11 與 SD §6.2 要求新增審核佇列與審核詳情，作為車行 submission → canonical registry 的把關點。本 packet 整理行為/資料/API，交付人工視覺設計。

## 2. Personas

| Code                       | Persona    | 責任                                                                      |
| -------------------------- | ---------- | ------------------------------------------------------------------------- |
| `platform_supply_reviewer` | 供給審核人 | start review / request revision / approve / reject                        |
| `platform_admin`           | 平台管理者 | 管理 service product、matrix、車行與審核權限（本 packet 主聚焦 reviewer） |

**硬性 guardrail（SA §8.2）：** 審核人**不得**以 fleet partner 身分核可自己提交的資料（`REVIEWER_SELF_APPROVAL_DENIED`），**不得**繞過必填文件。

## 3. Operating context

- 流程：submission（in_review）→ 審核動作 → 核可時在**單一交易**內 provision canonical driver/vehicle/contract/insurance + affiliation + 重算 readiness（SD §5.1）。
- **Optimistic concurrency**：所有審核 command 帶 `expectedRevisionNo`；revision 已變 → 409 / `SUBMISSION_REVISION_CONFLICT`。
- 所有 mutation 寫 audit（SD §8）。zh-TW 主 / en 次，走 t()，無內聯 i18n。
- 掛在既有 `mgmt-shell` 內，作為新 nav 項。

## 4. Scope

| 畫面                                             | 狀態            |
| ------------------------------------------------ | --------------- |
| Supply Review Queue（`/supply-review`）          | 本 packet（新） |
| Review Detail（`/supply-review/[submissionId]`） | 本 packet（新） |

Out of scope：車行端送件畫面（另份 packet）、provisioning 後端、service-product/matrix CRUD（已建）。

## 5. Per-screen briefs

### 5.1 Supply Review Queue（`/supply-review`）

用途：審核人挑待審 submission。
篩選（SA §4.11）：車行 fleet partner · submission type · submitted date · status · missing items · service product · business area。
每列顯示：submissionType、車行、subject（driver/vehicle）、revisionNo、status、submittedAt、缺件數/warnings 摘要、是否已被他人 in_review（lock 指示）。
動作：開啟詳情；（可選）直接 start review。
狀態：依 status 呈現（submitted 可挑、in_review 顯示審核人、needs_revision/approved/rejected 為歷史）；empty / loading state。
API：`GET /api/admin/supply-review/submissions`、`GET …/{submissionId}`。

### 5.2 Review Detail（`/supply-review/[submissionId]`）

顯示（SD §6.2 / SA §4.11）：

- **Side-by-side diff**：車行提交值（submission） vs 目前 canonical 值（若是更新）。逐欄位對照。
- **文件檢視**：所有 supply documents（類型、檔名、生效起迄、審核狀態），可預覽。
- **Validation warnings**：缺件、過期、重複、格式。
- **Reviewer note** 輸入 + **reason code** 選擇器（request-revision / reject 必填）。
- 核可後的 **audit receipt**（canonical IDs、affiliation、readiness 結果）。

動作與前置條件（SD §3.2）：

| 動作               | 前置                            | command 帶                                               | 效果                                                                           |
| ------------------ | ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `start_review`     | submission = submitted          | —                                                        | submitted → in_review，鎖給該審核人                                            |
| `request_revision` | in_review                       | expectedRevisionNo + reasonCode + comment                | → needs_revision，退回車行補正                                                 |
| `approve`          | in_review + 完整性通過 + 非自審 | expectedRevisionNo                                       | 單交易 provision canonical + affiliation + readiness + audit + 通知（SD §5.1） |
| `reject`           | in_review                       | expectedRevisionNo + reasonCode（final reason）+ comment | → rejected                                                                     |

行為要點：approve 會**改動 canonical registry**（不可逆語意），UI 須在送出前明確讓審核人理解將建立/更新哪些 canonical 紀錄；完整性不過 → `SUBMISSION_INCOMPLETE` / `DOCUMENT_REQUIRED`，不可核可。

## 6. 狀態機與衝突處理

UI 須反映 SA §4.7 狀態機（submitted / in_review / needs_revision / approved / rejected / withdrawn）。
**Revision conflict**：送出任一審核動作時若 `expectedRevisionNo` 與後端不符 → 409 `SUBMISSION_REVISION_CONFLICT`；UI 須提示「此 submission 已被更新」並要求重新載入後再審，不可盲蓋。

## 7. 錯誤 / edge（SA §9 Supply）

`REVIEWER_SELF_APPROVAL_DENIED`、`SUBMISSION_REVISION_CONFLICT`、`SUBMISSION_INCOMPLETE`、`DOCUMENT_REQUIRED`、`DOCUMENT_EXPIRED`、`SUBMISSION_NOT_EDITABLE`。每個須可讀訊息 + 後續指引。

## 8. 純視覺 open questions（交設計團隊）

- VQ-1 當多欄位不同時，diff 的密度與「只看差異 / 看全部」切換。
- VQ-2 文件檢視 inline 還是 modal？多文件 submission 的並排。
- VQ-3 reason-code + comment 的呈現（核可不需 reason、補正/駁回需要）。
- VQ-4 approve 因會改 canonical，是否需確認步驟 / 預覽「將建立的 canonical 紀錄」？視覺如何呈現此確認。
- VQ-5 佇列中 in_review lock（被他人鎖）與 missing-items 摘要的呈現。
- VQ-6 audit receipt（canonical IDs + readiness 結果）核可後的呈現位置。

## 9. Out of scope for design

車行送件端、canonical provisioning/affiliation 後端邏輯、service-product/eligibility-matrix CRUD（已建）、通知投遞。
