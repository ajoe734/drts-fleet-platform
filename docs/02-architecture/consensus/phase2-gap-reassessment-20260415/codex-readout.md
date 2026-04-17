# Codex Readout — Phase 2 Gap Reassessment

## 結論摘要

這次盤點後，最重要的結論不是「Wave A–E 還沒做完」，而是：

1. core repo 已完成一大段原本 final gap analysis 判定為缺口的工作
2. 真正還沒關上的缺口，集中在 **Platform Admin authority**、**Ops breadth**、**rollout evidence**、以及 **tenant-commute-hub 外部 annex**
3. 舊 `phase2-planning` starter 已過時，如果不重開 planning session，會繼續把已完成項目誤當 backlog

## 已驗證的 repo 真相

### 已完成 / 已落 baseline

- `apps/api/src/modules/platform-presence/` 已存在
- `apps/api/src/modules/platform-earnings/` 已存在
- `apps/driver-app/` 已有 multi-platform jobs / presence / binding / earnings surfaces
- `apps/tenant-portal-web/` 已有 booking / passengers / addresses / reports / api-keys / webhooks / billing / notifications / sla / users / audit
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` 已覆蓋大部分 `/api/tenant/*` consumer path
- `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` 已提供 candidate、ETA、assign、redispatch
- `docs/03-runbooks/phase1-rollout.md`、`docs/04-uat/*` 已存在

### 仍不足 / 不可視為完成

- Platform Admin backend 只明顯覆蓋 `tenants`、`public-info`、`placards`
- Platform Admin 多個頁面仍借 shared endpoint 或模擬資料
- rollout / UAT / staging 是 pack drafted，不是 sign-off completed
- `tenant-commute-hub` 真正 code-level authority 移除仍未在本 workspace 內被驗證

## 對 final gap analysis 的判讀

這份文件的方向仍然是對的，但它比現在 repo 真相落後。

不該再照單全收的說法：

- Driver App 仍是 generic runtime
- `/api/tenant/*` 缺口仍大面積未補
- dispatch board 還只是列表頁
- Wave E 仍接近未完成

仍然有效且必須保留的說法：

- dual truth 是目前最大外部風險
- Driver App 產品責任必須維持多平台工作台
- Platform Admin / Ops Console 仍需補成真 control plane
- 不能把 repo B 的 authority 問題誤認為已因 repo A 完工而自動消失

## 建議 supervisor 產出

- 將本輪 planning 輸出轉成 `P2R-001` 到 `P2R-008`
- 將舊 `phase2-planning` 標記為 superseded baseline
- 將 `tenant-commute-hub` annex audit 明確標成 `blocked_external`
- 將 Platform Admin / Ops / rollout evidence 視為本 repo 的下一波主線
