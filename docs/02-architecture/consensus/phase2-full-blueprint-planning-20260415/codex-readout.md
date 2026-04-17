# Codex Readout — Full Blueprint Planning

## 核心結論

上一輪 planning 的問題不是判斷錯，而是範圍太窄。

如果目標是「把完整藍圖實作完」，那 planning 不能只聚焦當前 repo 剩餘 gap，
而必須一次盤進：

- blueprint 所有 domain
- blueprint 所有 client / operator surfaces
- cross-repo topology
- rollout / evidence gates
- future-gated scope

## 我確認到的現況

### 1. backend domain landing zones 很完整

`apps/api/src/modules/` 已覆蓋大量 blueprint domain，這說明 repo 並不是只做了 UI，
而是已有完整 backend shape。

### 2. 四大既有 surface 也都已存在

- tenant portal
- platform admin
- ops console
- driver app

### 3. 真正的 full-scope 問題在於 coverage parity，而不是只有有沒有檔案

目前更大的問題是：

- 某些 surface 有 UI 但 authority 不夠厚
- 某些 domain 有 module 但完成度未驗證
- 某些 blueprint surface 根本沒有 landing zone
- 某些 cross-repo scope 只有 boundary，沒有 annex execution truth

### 4. 必須把 absent scope 也放進 planning

只要 blueprint 有定義、但 repo 沒有落點，就不能因為目前 repo 沒檔案而在 planning 中消失。

這特別適用於：

- Passenger App / Web
- Call Point / Concierge Portal
- hotline-specific operator topology

### 5. Tenant Portal topology 現在已有明確人類決策

隱藏問題不是只有 `tenant-commute-hub` 要不要切 API，而是 repo 內同時已有
`apps/tenant-portal-web/`。

本輪的人類決策已經把這件事定掉：

- `tenant-commute-hub` 保留為唯一 tenant portal UI
- `drts-fleet-platform` 保留 tenant authority / contracts / BFF
- `apps/tenant-portal-web` 不再繼續長成正式產品線，而是進 retire / decommission 路線

所以 tenant portal 這條線的 planning 已經不能再寫成「雙 portal 並存待決」，
而必須改寫成：

1. 補齊 / 確認 `drts-fleet-platform` BFF authority
2. 推 `tenant-commute-hub` cutover
3. 刪掉 repo B 中的 Supabase/backend authority
4. 退役 `apps/tenant-portal-web`

## 建議

- 用 `scope-matrix.md` 做 full-scope inventory
- 用 `FBP-*` family 做 master plan
- 先做 `FBP-001` / `FBP-002` / `FBP-004`，再直接進 tenant portal convergence 系列，因為 portal topology 已有人類決策
- 再把 execution 切成 control-plane completion、finance-compliance completion、rollout evidence、cross-repo convergence 四大波
