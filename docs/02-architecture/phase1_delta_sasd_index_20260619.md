# Phase 1 修正 SA / SD 文件總索引 — 2026-06-19

> 歸檔說明：本批文件由使用者於 2026-06-19 提供之 Phase 1「修正」SA/SD 正式文件，
> 重新以正確 UTF-8（zh-TW）編碼歸檔；結構、表格、型別定義、SQL DDL、API 路徑、
> 任務代號、驗收條件均忠實保留。對應執行波次見
> `scripts/dispatch-phase1-delta-supply-eligibility-mobile-reporting-20260619.py`，
> 對應 UI 補充見 `docs/05-ui/*-20260619.md`（screen-requirements 交付，非 LLM 視覺設計）。

**日期**：2026-06-19
**基準**：`ajoe734/drts-fleet-platform` `dev` branch

本批文件範圍只涵蓋：

1. 車行端供給（司機／車輛／保險／契約）自主提交與平台審核
2. 精確 Service Product Eligibility 串入實際派車
3. Driver App Android／iOS 實機位置與狀態驗證
4. 每日派遣紀錄與半年營運摘要

CTI 尚未選定，明確不在本文件群範圍；後續以獨立 SA / SD addendum 處理。

## 文件

- `phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md` — 系統分析（SA）
- `phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md` — 系統設計（SD）
- 本索引

## UI 補充（design hand-off，無 LLM 視覺設計）

依 `feedback_no_llm_ui_design` / `feedback_must_check_design_canvas`：以下新介面在
`drts-design-canvas` 無對應稿，僅產出 screen-requirements 交付人工視覺設計團隊，
不由 LLM 自創 UI：

- `docs/05-ui/fleet-partner-portal-supply-onboarding-screen-requirements-20260619.md`
- `docs/05-ui/platform-admin-supply-review-screen-requirements-20260619.md`
- `docs/05-ui/ops-console-eligibility-and-operational-reports-screen-requirements-20260619.md`
- `docs/05-ui/driver-app-tracking-and-permission-screen-requirements-20260619.md`

## 使用順序

1. 產品、營運、QA 先讀 SA。
2. Backend、Frontend、Mobile、DevOps 依 SD 拆 task。
3. 以 `WF-SUPPLY-001`、`WF-ELIG-001`、`WF-MOBILE-001`、`WF-OPS-REPORT-001` 作為 workflow gates。
4. 不得用 UI done 或 contract done 取代完整 workflow 驗收。

## 與既有建置的關係（2026-06-19 對照 `dev`）

- Platform Admin 的 `service-products`、`vehicle-eligibility`、`fleet-partners` 路由與
  後端模組**已存在**（前一波 `phase1-svc-fleet-tenantops-20260604`）。本波是**延伸**：
  exact product 全鏈傳遞、runtime evaluator、assignment recheck，非重建。
- Fleet Partner Portal 目前僅有 read 路由（dashboard…statements），**無 `/supply/*` 寫入流程** → 本波新增。
- Reporting/Filing 模組已存在，本波新增 `daily_dispatch_record` 與 `six_month_operations_summary` 兩種 job type 與排程聚合。
