# Fleet Partner Portal — 車行供給自主建檔 提交流程（Design Hand-off）

**日期：** 2026-06-19
**Feature：** 車行（車隊合作方）在 Fleet Partner Portal 自主提交司機／車輛／保險／契約，並追蹤審核與 readiness 的「建檔 + 送審」write-flow 畫面
**Recipient team：** 視覺設計團隊（含 UX）
**Status：** Hand-off input. **No visual decisions in this document.**
**Author lane：** Claude
**Authority for behaviour/data/API：**
[SA §4](./../02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md) ·
[SD §2/§3.1/§6.1](./../02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md)
**Visual authority（既有殼／IA，請延用不重畫）：** `drts-design-canvas/fleet-screens.jsx`（`FlpShell`、`FLP_NAV`、`FLP_*` 既有 read 畫面）、`fleet-data.jsx`、`Fleet Partner Portal.html`

> 與 `partner-booking-program-forms-handoff-20260618.md`、`credit-card-airport-transfer-screen-requirements-20260610.md` 同型：§2 personas · §3 context · §4 scope · §5 per-screen field briefs · §6 狀態 · §7 錯誤 · §8 visual open questions · §9 out of scope。**No visual decisions.**

---

## 1. 為什麼有這份 packet

Fleet Partner Portal（`apps/fleet-partner-portal-web`）目前只有 **read** 路由：dashboard / drivers / vehicles / trips / cases / quality / training / documents / revenue / statements，且 documents/training/cases 多用 fixture fallback。

SA §4 與 SD §6.1 要求新增一條 **車行自主送件 → 平台審核 → canonical registry** 的 write-flow。SD §6.1 新增路由：`/supply`、`/supply/drivers/new`、`/supply/vehicles/new`、`/supply/submissions`、`/supply/submissions/[submissionId]`、`/documents`（由 fixture 升級為真資料）。

`drts-design-canvas/fleet-screens.jsx` **沒有**任何 submission / new-driver / new-vehicle 寫入稿，因此這些 write 畫面需要人工視覺設計。本 packet 把欄位、驗證、狀態、API 整理交付，**不替設計團隊做版面決定**。

## 2. Personas

| Code                  | Persona    | 在這裡做什麼                                             |
| --------------------- | ---------- | -------------------------------------------------------- |
| `fleet_partner_admin` | 車行管理者 | 建立／編輯司機、車輛、保險、契約 draft；送審；撤回；補正 |
| `fleet_partner_ops`   | 車行行政   | 補附件、更新到期資料、追蹤 submission 狀態               |

權責邊界（SA §8.1）：車行**只能**存取自己車行的資料；**不得**核可自己的 submission，**不得**直接改 canonical registry。

## 3. Operating context

- **兩層資料模型**：車行編輯的是 **submission（draft）**；核可後才由平台寫入 **canonical registry**。已核可資料要更新，必須建立**新 submission**（不可直接改 canonical）。
- **Fleet-scope 隔離**：所有清單／詳情只顯示登入車行自己的資料。
- zh-TW 主、en 次。走 `lib/translations.ts` t()，無內聯 i18n。
- 既有 `FlpShell` / `FLP_NAV` 為殼，新畫面掛在同一殼內（Supply 入口為新的 nav 區）。

## 4. Scope

| 畫面 / 路由                                                                                                     | 狀態                                                 |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Supply Dashboard（`/supply`）                                                                                   | 本 packet（新）                                      |
| Drivers — 新增／編輯 draft（`/supply/drivers/new`、編輯）                                                       | 本 packet（新 write 流程）                           |
| Vehicles — 新增／編輯 draft（`/supply/vehicles/new`、編輯）                                                     | 本 packet（新 write 流程）                           |
| Documents（`/documents`，pre-signed 上傳 + 到期 + 審核狀態）                                                    | 本 packet（由 fixture 升級）                         |
| Submissions list（`/supply/submissions`）                                                                       | 本 packet（新）                                      |
| Submission detail（`/supply/submissions/[submissionId]`，含 revision、reviewer note、submit/withdraw/resubmit） | 本 packet（新）                                      |
| Readiness 顯示（嵌在 Drivers / Vehicles / Dashboard）                                                           | 本 packet（新區塊）                                  |
| 既有 Dashboard / Drivers / Vehicles / Trips / Quality / Statements（read）                                      | 已建（延用，僅加入送件入口與 status/readiness 區塊） |

Out of scope：後端審核流程、settlement、車行自己的會計後台、既有 read loader。

## 5. Per-screen field briefs

> 每個欄位：**label（中 · en）· required? · input type · validation · masking/notes**。版面權威＝設計團隊。此處不做視覺決定。

### 5.1 Supply Dashboard（`/supply`）

用途：車行一眼看到自己供給的待辦與缺口。
顯示分組（SA §4.10）：Draft · 待審（submitted/in_review）· 附件補正（needs_revision）· 已核可（approved）· 即將到期（保險/證照）· 不可派原因（not_ready reason codes）。
動作：前往「新增司機 / 新增車輛 / 上傳文件」、跳至對應 submission。
API：`GET /api/fleet-partner/supply-submissions`（含 status filter）、`GET /api/fleet-partner/readiness`。
狀態：每組可空（empty state）；到期項需可點入對應 `insurance_update` 送件流程。

### 5.2 Drivers — 新增 / 編輯 driver draft

對應 contract `DriverSupplyDraft`（SD §2.2）、SA §4.3。

| Field                                            | Req | Type                           | Notes                                          |
| ------------------------------------------------ | --- | ------------------------------ | ---------------------------------------------- |
| 姓名 · name                                      | ✓   | text                           |                                                |
| 手機 · mobile                                    | ✓   | text/phone                     | 同平台手機重複→提示（非硬擋）                  |
| 職業駕駛執照號 · professional driver license no  | ✓   | text                           |                                                |
| 駕照到期 · license expiry                        | ✓   | date                           | 日期格式驗證；過期→readiness 影響              |
| 計程車駕駛登記證號 · taxi driver registration no | ✓   | text                           |                                                |
| 登記區域 · registration area                     | ✓   | text                           |                                                |
| 登記證到期 · registration expiry                 | ✓   | date                           |                                                |
| 支援服務產品 · supported service products        | ✓   | multi-select                   | 必須是存在且 active 的 product code（SA §4.3） |
| 偏好車輛 · preferred vehicle                     | —   | select（draft/canonical 車輛） | `preferredVehicleSubmissionId`                 |
| 文件 · documents                                 | ✓   | doc refs                       | 見 §5.4；類型與附件需齊全                      |

驗證/錯誤：同平台身分證重複 → `DRIVER_IDENTITY_ALREADY_EXISTS`；缺件 → `SUBMISSION_INCOMPLETE` / `DOCUMENT_REQUIRED`。
API：`POST /api/fleet-partner/supply-submissions/drivers`、`PUT …/{submissionId}/driver`。

### 5.3 Vehicles — 新增 / 編輯 vehicle draft

對應 `VehicleSupplyDraft`（SD §2.3）、SA §4.4。

| Field                                     | Req | Type         | Notes                                                            |
| ----------------------------------------- | --- | ------------ | ---------------------------------------------------------------- |
| 車牌 · plate no                           | ✓   | text         | 同平台唯一→`PLATE_ALREADY_EXISTS`；已在 canonical→轉 update flow |
| 牌照類型 · license type                   | ✓   | select       | 須存在                                                           |
| 廠牌 · brand                              | —   | text         |                                                                  |
| 車型 · model                              | —   | text         |                                                                  |
| 年份 · model year                         | —   | number       |                                                                  |
| 座位數 · seat count                       | ✓   | number       | 合理範圍                                                         |
| 行李容量 · luggage capacity               | ✓   | number       | 合理範圍                                                         |
| 營業區 · business area                    | ✓   | text/select  |                                                                  |
| 支援服務產品 · supported service products | ✓   | multi-select | 須對應合法 matrix item                                           |
| 機場接送資格 · airport transfer eligible  | —   | toggle       | 影響機場產品 eligibility                                         |
| 固定價可行 · fixed fare allowed           | —   | toggle       |                                                                  |
| 目前司機 · current driver                 | —   | select       | 須屬同車行或有有效 affiliation                                   |
| 文件 · documents                          | ✓   | doc refs     | 見 §5.4                                                          |

API：`POST /api/fleet-partner/supply-submissions/vehicles`、`PUT …/{submissionId}/vehicle`。

### 5.4 Documents（`/documents`）

對應 `SupplyDocumentRecord`（SD §2.4）。**pre-signed 上傳**（SD §3.1）：
`POST …/{submissionId}/documents/upload-url`（取簽名 URL）→ 前端直傳檔案至物件儲存 → `POST …/documents/confirm`（回填 objectKey/checksum/size）；刪除 `DELETE …/documents/{documentId}`。API 不直接接大檔。
每筆顯示：文件類型（professional_driver_license / taxi_driver_registration / vehicle_registration / insurance_policy / \*\_contract / other）· 原始檔名 · 生效起迄（effectiveFrom/Until）· 審核狀態（pending / approved / rejected / expired）· reviewer comment。
保險送件（SA §4.5，`insurance_update`）欄位：保單關聯車輛、insuranceType、insurer、policyNo、effectiveFrom/Until、coverageAmount、policyFile。
契約送件（SA §4.6，`contract_update`）：contractType（fleet_participation / driver_management / vehicle_management / service_product_authorization）、關聯 fleet/driver/vehicle、effective 起迄、contractFile。

### 5.5 Submissions list（`/supply/submissions`）

每列：submissionType、status、revisionNo、subject（driver/vehicle）、submittedAt、reviewer note 摘要、missing items。
篩選：status、submissionType、subjectDriverId、subjectVehicleId（SD §3.1）。
API：`GET /api/fleet-partner/supply-submissions`。

### 5.6 Submission detail（`/supply/submissions/[submissionId]`）

顯示：本體欄位、所有文件、目前狀態、**revision history**（每次 resubmit 一個 revision）、reviewer note 與 reason code、canonical IDs（核可後）。
動作（依狀態）：`submit`（draft→submitted）、`withdraw`（submitted→withdrawn）、`resubmit`（needs_revision→submitted）、編輯（draft / needs_revision）。
API：`GET …/{submissionId}`、`POST …/{submissionId}/submit`、`POST …/{submissionId}/withdraw`。
規則：`approved` 不可編輯（顯示「需新建 submission 才能更新」）；編輯衝突 → `SUBMISSION_REVISION_CONFLICT`。

### 5.7 Readiness 顯示（嵌入 Drivers / Vehicles / Dashboard）

state：`ready` / `not_ready` / `suspended`；附 reason codes（SA §4.9：DRIVER_LICENSE_MISSING/EXPIRED、DRIVER_REGISTRATION_MISSING/EXPIRED、VEHICLE_DOCUMENT_MISSING、INSURANCE_MISSING/EXPIRED、CONTRACT_MISSING/INACTIVE、DRIVER/VEHICLE_AFFILIATION_MISSING、SERVICE_PRODUCT_NOT_SUPPORTED、TRAINING_REQUIRED、FLEET_PARTNER_INACTIVE、MANUALLY_SUSPENDED）。每個 reason 應可解釋並（若可行）連到補件動作。
API：`GET /api/fleet-partner/readiness`、`/readiness/drivers/{driverId}`、`/readiness/vehicles/{vehicleId}`。

## 6. Submission 狀態機（UI 須能呈現）

`draft → submit → submitted → (reviewer picks) in_review → approve | request changes(needs_revision) | reject`；`needs_revision → 編輯 → draft → resubmit → submitted`；`approved →（要改）建立新 submission`；`rejected → clone as new draft`（SA §4.7）。
行為對應（非視覺）：每個狀態決定哪些動作可用、是否可編輯、是否顯示 reviewer note / reason code / canonical 結果。

## 7. 錯誤 / edge states（SA §9 Supply）

`SUBMISSION_NOT_EDITABLE`（approved/in_review 嘗試改）、`SUBMISSION_REVISION_CONFLICT`（revision 已被別人改）、`SUBMISSION_INCOMPLETE`、`DOCUMENT_REQUIRED`、`DOCUMENT_EXPIRED`、`PLATE_ALREADY_EXISTS`、`DRIVER_IDENTITY_ALREADY_EXISTS`、`FLEET_SCOPE_DENIED`（存取他車行）。每個都需要可讀的中文訊息與後續動作指引。

## 8. 純視覺 open questions（交設計團隊）

- VQ-1 送件是 **multi-step wizard**（基本→文件→確認送審）還是單頁長表單？
- VQ-2 在車行端如何呈現「draft 值 vs 已核可 canonical 值」的差異（提醒「改 canonical 要重新送審」）？
- VQ-3 Readiness 的視覺（清單 reason chips vs 儀表）與「點 reason → 去補件」的連動。
- VQ-4 文件上傳 + 到期日 + 審核狀態的 chip / 列表密度。
- VQ-5 Submission detail 的 revision history（timeline vs 折疊清單）。
- VQ-6 Dashboard 六個分組（draft/待審/補正/已核可/到期/不可派）在一個頁面的優先序與密度。

## 9. Out of scope for design

平台審核端畫面（見 `platform-admin-supply-review-screen-requirements-20260619.md`）、後端 provisioning/affiliation 邏輯、物件儲存基建、既有 read 頁的資料來源、Training/Cases（本次維持 read-only gap）。
