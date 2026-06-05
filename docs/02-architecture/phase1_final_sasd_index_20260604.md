# Phase 1 SA / SD 文件總索引 — 2026-06-04

> 歸檔說明：本批文件由使用者於 2026-06-04 提供之 Phase 1 最終 SA/SD 正式文件，
> 重新以正確 UTF-8（zh-TW）編碼歸檔；結構、表格、型別定義、API 路徑、任務代號、
> 驗收條件均忠實保留。對應執行波次見 `scripts/dispatch-phase1-svc-fleet-tenantops.py`。

本批文件分成兩份：

1. `phase1_final_sa_for_dev_team_20260604.md`
   - 完整系統分析文件
   - 定義服務對象、商業模式、服務產品、車行合作、Tenant 管理履約、前端產品面、business flows

2. `phase1_final_sd_for_dev_team_20260604.md`
   - 完整系統設計文件
   - 定義 modules、types、API、frontends、workflow gates、E2E、implementation worklist

## 核心補強項

本輪正式將以下三項補為 Phase 1 P0：

1. Tenant Business Operations Portal
2. Service Product / Vehicle Eligibility Matrix
3. Fleet Partner / 車行合作及分潤與責任管理

## 給開發團隊的執行原則

- 不得只做訂車頁；tenant 必須有管理履約與 payable / report / statement。
- 不得把所有服務塞上同一 booking type；必須用 service product + vehicle eligibility matrix。
- 不得只管司機個人；必須支援車行/車隊合作夥伴、分潤與責任管理。
- Driver App 必須 service-aware、platform-aware、fleet-partner-aware。
- Ops Console 必須 eligibility-aware。
- Platform Admin 必須能管理 service products、eligibility matrix、fleet partners、revenue share rules。
