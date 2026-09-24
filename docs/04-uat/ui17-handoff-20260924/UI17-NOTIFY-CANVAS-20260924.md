# Handoff: UI17-NOTIFY-CANVAS-20260924

## Acceptance / Finding Matrix

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| ui17-notify-canvas-20260924_source_and_state_coverage | `platform-partner-notify.jsx` | 舊版 `webhook:manage` 與 `resume` label 等缺口已對照正式契約修正 | N/A (純設計/文件變更，靜態核對) | 不適用 (純畫板) |
| ui17-notify-canvas-20260924_scoped_verification_and_preservation | `platform-partner-notify.jsx`, `partner-notification-screen-contract-20260924.md` | 同上，已保留既有畫板並補齊目標欄位 `未知／尚未建立派送目標`，且確認 `ack` 成功文案為 `端點已接受，但裝置未知` | N/A (純設計/文件變更，靜態核對) | 不適用 (純畫板) |
| D1: 管理權限名稱仍寫錯 | `platform-partner-notify.jsx` L156 | 舊版顯示 `需 webhook:manage` → 新版改為 `需 tenant:webhooks:write` | N/A | 不適用 |
| D2: 恢復進行中仍可重複按 | `platform-partner-notify.jsx` L64 | 舊版 `resume` `enabled` 未鎖定進行中 → 確認已鎖定 `enabled: !isPending` | N/A | 不適用 |
| D3: 保留映射註記，但把按鈕改回使用者能理解的名稱 | `platform-partner-notify.jsx` L64 | 舊版 `恢復（需重測）` → 新版 `恢復通知（恢復後需重新測試，通過後才能啟用）` | N/A | 不適用 |
| D4: 目標欄位的未知值要忠實呈現 | `platform-partner-notify.jsx` L112 | 舊版 `未知` fallback → 新版 `未知／尚未建立派送目標` | N/A | 不適用 |
