# SR-LIVE-GLOBAL-UX-20261007 — C120/C121 同 release 驗收

Owner Codex2；獨立 reviewer Claude2。狀態：實作中，未取得 live／人工驗收。

## 固定來源與邊界

- 起始 `origin/dev`：`2467f88a2e64ccc2204bb99f1356fdeb997bda13`（2026-10-07 fetch）。
- 已讀 dispatch task spec，以及 canonical root 的 `docs/04-uat/full-system-inventory-20261007/REPORT.md` 和 134 項 capability matrix。該報告當時尚未存在於本分支；它是 V15 需求依據，不是 runtime source。
- 部署權威：`.github/workflows/deploy-dev.yml` 的八個 web services 與 API。2026-10-07 GitHub variables 讀回 `drts-dev-devcc-20260825 / us-central1`；執行 workflow 時須再次使用當時變數及 deployment readback。
- 舊 `sr-qa-ux-001` 的 C120 viewport／焦點與部分 C121 格式測試為模擬資料，不能作為 live 結果。本任務不重做 producer，不修改產品 UI／中央套件設定。
- VM 只允許 unit／static checks；browser 僅在 GitHub hosted runner 對 authorized shared dev。Worker 不 dispatch 雲端 workflow。
- `partner-booking-web` paused；`passenger-web`、`concierge-portal-web`、`assisted-entry-web` retired；依 deploy workflow 及 custom-domain runbook 排除。Driver native／raw Passenger、driver17/18/20/21 設計不是本次已採用畫面證據，也不重新納入第一方乘客登入／預約。

## Finding／驗收追蹤

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| reviewed_same_sha_global_ux_harness | 新 task 專屬 harness、workflow、offline gates | 原版本沒有本 live harness；實作中 | 待本輪檢查及 exact-SHA review／CI | 不把 checkpoint 當 candidate |
| same_release_role_screen_state_coverage | deploy-dev active inventory、各 app 正式 page、IAM catalog | 舊 synthetic suite 不驗證 runtime；實作中 | 待 source manifest、browser evidence | 合法具名角色／隔離 fixture、同 release runtime 尚未提供 |
| accessibility_keyboard_focus_responsive_evidence | 正式 DOM、鍵盤事件、computed style 與 viewport | 舊模擬焦點不算實測；實作中 | 待 hosted browser／人工證據 | 真讀屏、視覺對比及人工鍵盤程序未執行 |
| zh_tw_en_locale_content_and_design_mapping | 正式 locale cookie、translation catalogs、頁面來源 mapping | 舊 dictionary pass 不代表 live 語言正確；實作中 | 待 locale／formatting／source map evidence | raw designs adoption 未核實；保留 unverified |
