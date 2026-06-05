# E2E-TENBIZ-012 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `E2E-TENBIZ-012` — E2E-012 tenant-business-operations (artifact `tests/e2e/E2E-012-tenant-business-operations.sh`)
**Sidecar Task:** `E2E-TENBIZ-012-SIDECAR-ACCEPTANCE`
**Current Sidecar Owner:** `Claude2`
**Assigned Reviewer:** `Gemini`
**Parent Owner / Reviewer:** `Gemini` / `Codex2`
**Declared Dependency:** `BE-TENBIZ-001`
**Last Revised:** `2026-06-05 (UTC)`

> Evidence base for this packet is the assigned worktree on branch `claude2/e2e-tenbiz-012-sidecar-acceptance`
> at `63d2ba58` — i.e. the current `origin/dev` tip (`P1NEW-INTEGRATION-20260605`, PR #534). Every
> endpoint/shape claim below was read directly from the checked-out `apps/api` files at that commit, so the
> packet reflects current dev truth.

---

## 1) Scope Boundary

本 sidecar 只整理 `E2E-TENBIZ-012` 的 acceptance checklist、dependency map、repo baseline、與 reviewer/owner handoff 指引；不修改 canonical truth，也不代替 parent owner（`Gemini`）撰寫 `tests/e2e/E2E-012-tenant-business-operations.sh`，更不 closeout parent。

- **In scope:** support-only acceptance framing for the tenant-business-operations E2E — dependency readiness map for `BE-TENBIZ-001`, the SD §3 endpoint/shape inventory that the E2E must traverse, SD §9 flow → SD §11 acceptance-criteria mapping, hard-fail / skip discipline suggestions, and the reviewer/owner handoff checklist.
- **Out of scope:** 撰寫或執行 E2E script、修改 L1/L2 真相、修改 `apps/api` runtime / `apps/tenant-portal-web` surfaces、把 `BE-TENBIZ-001` 重新 closeout、或改任何 `phase1_*` / `docs/02-architecture/*` 規格檔。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `scripts/ai-status.sh show` slice、`current-work.md`、與本 worktree（`63d2ba58` = origin/dev tip）程式碼掃描為準：

### Machine-truth task rows

- 父任務 `E2E-TENBIZ-012`：`owner=Gemini`、`reviewer=Codex2`、`status=todo`、`depends_on=[BE-TENBIZ-001]`、artifact `tests/e2e/E2E-012-tenant-business-operations.sh`、`acceptance=["E2E-012 passes at least in staging"]`。`next` 記錄 Chairman 於 `2026-06-05T08:19:59Z` 由 Codex 改派 owner 給 Gemini（reviewer 保留 Codex2，owner≠reviewer）。
- 依賴 `BE-TENBIZ-001`：`owner=Codex2`、`reviewer=Codex`、`status=done`、`commit_hash=4095752d`、`push_branch=codex2/be-tenbiz-001`、`integration_status=branch_pushed`（`2026-06-05T02:59:57Z`）。
- 本 sidecar `E2E-TENBIZ-012-SIDECAR-ACCEPTANCE`：`owner=Claude2`、`reviewer=Gemini`、由 supervisor 於 `2026-06-05T09:49:30Z` 以 `owned_ready_dispatch` 指派；`mutates_canonical=false`、`helper_kind=acceptance_packet`。

### Repo baseline (origin/dev @ 63d2ba58, verified in worktree)

- E2E artifact **尚未存在**：`tests/e2e/E2E-012-tenant-business-operations.sh` 不在 repo（現有 E2E 為 `E2E-001`…`E2E-010`）。這是 parent owner 的待辦，不在本 sidecar 範圍。
- `BE-TENBIZ-001` 的 API surfaces **已經在 dev 樹中**，由 umbrella 整合 PR #534（`63d2ba58`）帶入，落在：
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` / `.service.ts` / `.module.ts`
  - `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` / `.service.ts` / `.repository.ts`
  - 對應 unit tests：`apps/api/tests/unit/tenant-partner.service.test.ts`、`apps/api/tests/unit/billing-settlement.service.test.ts`
- 前端對應頁面在 `apps/tenant-portal-web/app/` 已存在：`page.tsx`（dashboard landing）、`booking-list/`（orders/trips）、`billing/`（payables/invoices）、`reports/`（report export）。

### Dependency-status nuance（給 owner 注意，不是 blocker）

| 觀察 | 證據 |
| --- | --- |
| `BE-TENBIZ-001` machine truth 記為 `integration_status=branch_pushed`，commit `4095752d` 在 `codex2/be-tenbiz-001` | `scripts/ai-status.sh show BE-TENBIZ-001` |
| 但該 commit **不是** `origin/dev` 的 ancestor（`git merge-base --is-ancestor 4095752d origin/dev` → 非祖先） | git 驗證 |
| 然而等效 API code **已經透過 #534 進入 `origin/dev`**（routes + shapes + unit tests 全在 dev 樹） | 本 worktree `apps/api/...controller.ts` 直接讀取 |

→ 結論：對 `E2E-TENBIZ-012` 而言，**dependency 的程式碼層面在 dev 上已可用**；`BE-TENBIZ-001` 自身的 `integration_status` 字串較保守（停在 `branch_pushed`），與 dev tree 實況有落差。E2E owner 不需等 `BE-TENBIZ-001` 重新 merge；直接以 `origin/dev` 為 base 即可。

---

## 3) Authoritative Inputs & Traceability Risk

`E2E-TENBIZ-012` 的 `current-work.md` planning row 指定的權威來源是：

> `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` —— SD §9（建 E2E）、SD §11（Acceptance Criteria 1–12）

**Traceability risk（請 parent owner 留意）：** 此 SD 檔目前 **未進 git canonical truth**。`git ls-files` 找不到它；它只散落在多個 `.artifacts/worktrees/auto/*/docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` 工作樹副本，canonical root 與 `origin/dev` 樹皆無此檔。

- 影響：E2E-012 script 若照現有 E2E 慣例在檔頭 `Authoritative inputs:` 引用該 SD 路徑，該引用在 canonical repo 上會是 dangling reference。
- 建議（非本 sidecar 可決）：parent owner / 整合者在寫 E2E 前，先把該 SD 正式 commit 進 `docs/02-architecture/`，或改引用已 committed 的等效規格；否則 E2E header 的權威引用無法被 reviewer 在 canonical tree 驗證。
- 本 packet 為求準確，以下 §3/§4 的 shape 與 criteria 內容皆「**從 worktree SD 副本逐字讀出 + 與 dev 程式碼交叉驗證**」，避免單靠未 committed 文件。

### Existing E2E header convention（給 owner 參考）

現有 script 的權威引用格式（`tests/e2e/E2E-010-governance-aware-billing-reporting.sh:7-13`）：

```bash
# Authoritative inputs:
#   - docs/02-architecture/<spec>.md (<SPEC-ID>)
#   - docs/04-uat/<uat>.md (<UAT-ID>, sub-cases <...>)
#   - docs/00-context/<directive>.md §<n>
```

`E2E-001` 等則用 `# Cross-ref: docs/04-uat/phase1-uat-scenarios.md §5 E2E-001, UAT TP-001, ...`。E2E-012 建議沿用其一，但須先解決上面的 traceability risk。

---

## 4) Parent Acceptance Framing

`E2E-TENBIZ-012` machine-truth 的 `acceptance[]` 只有一句「E2E-012 passes at least in staging」。下面把 SD §9 flow 與 SD §11 criteria 展開成 reviewer-facing checklist，**不新增新的產品真相**——每一條都對應已在 dev 驗證到的 endpoint/shape。

### SD §9 required flow（E2E-012 必走鏈）

```text
tenant login
→ create booking
→ trip completed
→ tenant dashboard shows counts
→ payable summary updates
→ statement generated
→ report export includes order / user / cost center / service product
```

### SD §11 acceptance criteria 直接命中 E2E-012 的子項

- Criterion 1 — Tenant 能看到 payable total 與 completed trips。
- Criterion 2 — Tenant 能看到「哪個 user 建了哪個 order」。
- Criterion 3 — Tenant 能 export payable / invoice / cost center / service product 報表。
- Criterion 12 — E2E-012 / 013 / 014 至少在 staging 通過。

### Acceptance checklist（每條附 dev 已驗證的支撐 endpoint）

**AC-1 — Dashboard counts 反映完成 trip 後的狀態（criterion 1）**

- [ ] `GET /api/tenant/dashboard`（`x-tenant-id` header；`tenant-partner.controller.ts` `getTenantDashboard`）回傳 `TenantDashboardSummary`，含 `bookingCount` / `completedTripCount` / `cancelledTripCount` / `noShowTripCount` / `estimatedPayableAmountMinor` / `issuedInvoiceAmountMinor` / `unpaidInvoiceAmountMinor`。
- [ ] E2E 在「trip completed」前後各打一次 dashboard，斷言 `completedTripCount` 與 payable 金額有遞增（dashboard 內部委派 `billingSettlementService` 取得 payable 數字）。

**AC-2 — Order/trip 與建立者可追溯（criterion 2）**

- [ ] `GET /api/tenant/orders` / `GET /api/tenant/orders/{orderId}` / `GET /api/tenant/trips`（支援 `TenantOrderListQuery` filter：`from/to/serviceProduct/status/costCenterCode/tenantServiceProgramId/riderId/sourcePlatform/invoiceStatus`）。
- [ ] E2E 斷言剛建立並完成的 order 出現在列表，且能讀回建立者 / costCenter / serviceProduct 等欄位（criterion 2 的「which users created which orders」）。

**AC-3 — Payable summary 與 statement（criterion 1 + flow 後段）**

- [ ] `GET /api/tenant/payables/summary`（`TenantPayableSummary`：`totalTrips/completedTrips/grossAmountMinor/payableAmountMinor/invoiceStatus`）在 trip 完成後更新。
- [ ] `GET /api/tenant/payables/line-items`（`TenantPayableLineItem`，每筆綁 `orderId/tripId/serviceProduct/costCenterCode/tenantServiceProgramId/payableAmountMinor`）含剛完成的 order。
- [ ] `GET /api/tenant/statements`（回 `DriverStatementRecord[]`）證明 statement 已生成。

**AC-4 — Report export 含 order/user/cost center/service product（criterion 3）**

- [ ] 透過 `POST /api/tenant/reports/jobs` 建 export job，`GET /api/tenant/reports/jobs` / `GET /api/tenant/reports/{jobId}` 取回（`reporting-filing.controller.ts`）。
- [ ] 斷言 export 輸出含 order / user / cost-center / service-product 欄位（criterion 3）。

**AC-5 — Service program 對照（支撐 criterion 2/3 的 serviceProduct 維度）**

- [ ] `GET /api/tenant/service-programs` / `GET /api/tenant/service-programs/{programId}` 回 `TenantServiceProgramRecord`（含 `programType`、`billingMode`、`allowedServiceProducts`），供 E2E 對照 order 的 `tenantServiceProgramId` / `serviceProduct`。

**AC-6 — Tenant scope 不可外溢**

- [ ] 上述所有 read endpoint 都靠 `x-tenant-id` header（`requireTenantId`）做租戶隔離。E2E 應加一個跨租戶 negative probe：用別的 tenant id 讀本租戶 order/invoice 應被拒（沿用 E2E-010 FG-09 的 cross-tenant hard-fail 風格）。

---

## 5) Endpoint ↔ Surface Inventory（dev-verified）

| SD §3 endpoint | Module / file (origin/dev @ 63d2ba58) | Response shape | Unit-test 證據 (dev) |
| --- | --- | --- | --- |
| `GET /api/tenant/dashboard` | `tenant-partner.controller.ts` `getTenantDashboard` | `TenantDashboardSummary` | `tenant-partner.service.test.ts` — "builds dashboard metrics, tenant order filters, and service programs" |
| `GET /api/tenant/orders`, `/orders/{id}`, `/trips` | `tenant-partner.controller.ts` (`listTenantOrders` / `getTenantOrder` / `listTenantTrips`) | order/trip list + `TenantOrderListQuery` filters | 同上（order filters 斷言） |
| `GET /api/tenant/service-programs`, `/{programId}` | `tenant-partner.controller.ts` | `TenantServiceProgramRecord` | 同上（service programs 斷言） |
| `GET /api/tenant/payables/summary` | `billing-settlement.controller.ts` `getTenantPayablesSummary` | `TenantPayableSummary` | `billing-settlement.service.test.ts` — "builds tenant payable summaries, line items, and tenant-visible statements" |
| `GET /api/tenant/payables/line-items` | `billing-settlement.controller.ts` | `TenantPayableLineItem[]` | 同上 |
| `GET /api/tenant/statements` | `billing-settlement.controller.ts` | `DriverStatementRecord[]` | 同上 |
| `GET /api/tenant/invoices` | `billing-settlement.controller.ts` | runtime invoice list | (既有 billing 測試) |
| `POST/GET /api/tenant/reports/jobs`, `/reports/{jobId}` | `reporting-filing.controller.ts` | report job | (既有 reporting 測試) |

所有新 endpoint 走全域 prefix `api`（`apps/api/src/main.ts:12` `setGlobalPrefix("api")`）、用 `toApiSuccessEnvelope` / `toApiListData` 包裝、`x-tenant-id` 做租戶 scope。

---

## 6) Hard-fail / Skip Discipline（建議給 E2E owner）

沿用 `E2E-010` 的紀律分層：

- **HARD FAIL（契約迴歸）：**
  - dashboard `completedTripCount` / payable 金額在 trip 完成後沒有變化。
  - 完成的 order 不出現在 `/api/tenant/orders` 或 `/api/tenant/payables/line-items`。
  - report export 缺 order / user / cost-center / service-product 任一維度欄位。
  - 跨租戶讀本租戶 order/invoice 回 2xx（scope 外溢）。
- **SKIP（環境無法執行，非迴歸）：** seed tenant 無可用 tenant_admin / booking 無法建立 / report job endpoint 在該環境不可達。應顯式記錄為 skip，不可靜默略過。
- **STAGING 門檻：** acceptance 明文要求「at least in staging」；在純 mock/in-memory 環境綠燈只能算 scaffold pass，正式 PASS 需 staging evidence。

---

## 7) Worktree / Branch Note（machine-truth honesty）

- 本 sidecar 在指派的 worker worktree `/.artifacts/worktrees/auto/claude2-e2e-tenbiz-012-sidecar-acceptance` 上完成，branch `claude2/e2e-tenbiz-012-sidecar-acceptance`，base = `63d2ba58`（current `origin/dev` tip，#534）。worktree 乾淨，dependency code 直接在此 checkout 中驗證（見 §5）。
- 本 sidecar 只新增 `support/sidecars/E2E-TENBIZ-012/E2E-TENBIZ-012-SIDECAR-ACCEPTANCE.md` 一個 support 檔；commit 時只 stage 此檔，未碰任何 canonical truth 或 runtime code。
- Integration level 以 `branch_pushed` 記錄；是否吸收進 `E2E-TENBIZ-012` 主線由 parent owner 決定。

---

## 8) Reviewer Handoff Checklist（→ `Gemini`）

請 reviewer 以下列項目驗收本 **packet**（非驗收 parent E2E 本體）：

1. §2 dependency nuance 是否與 machine truth 一致：`BE-TENBIZ-001` = `branch_pushed` 但 API 已在 `origin/dev`（#534）— 可用 `grep tenant/dashboard apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` 在本 worktree 複驗。
2. §3 traceability risk 是否成立：`git ls-files | grep phase1_final_sd_for_dev_team_20260604` 應為空（SD 未進 canonical）。
3. §4 acceptance checklist 是否完整覆蓋 SD §11 criteria 1/2/3/12，且每條都對應到 §5 dev-verified endpoint。
4. §5 inventory 的 endpoint/shape 是否與 dev 程式碼一致（抽查 1–2 條）。
5. 本 sidecar 是否守住 scope：只新增 support 檔、未改 canonical truth、未代寫 E2E。

通過 → `AI_NAME=Claude2 scripts/ai-status.sh approve E2E-TENBIZ-012-SIDECAR-ACCEPTANCE "<結論>"`。
不通過 → `reopen`（自動建立 reviewer→owner handoff）或 `blocker`。

---

## 9) Owner Closeout Note（→ parent owner `Gemini`，吸收用）

本 packet 為 support 材料，最終是否吸收進 `E2E-TENBIZ-012` 主線由 parent owner 決定。撰寫 E2E 時最少要處理：

1. 先解決 §3 SD traceability（把 SD commit 進 canonical 或改引用已 committed 規格）。
2. 以 `origin/dev` 為 base（dependency 已可用，見 §2）。
3. 依 §4 checklist 與 §6 紀律寫 `tests/e2e/E2E-012-tenant-business-operations.sh`，並取得 **staging** evidence 才宣告 PASS（acceptance 明文要求）。
