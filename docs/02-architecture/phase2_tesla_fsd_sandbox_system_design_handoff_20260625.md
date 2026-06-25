# Phase 2 Tesla FSD 監理沙盒 — 系統設計團隊交付文件（待裁定 + 規格實值缺口）

> 文件基準日：2026-06-25
> 規格來源：[`phase2-tesla-fsd-sandbox/`](./phase2-tesla-fsd-sandbox/)
> 執行計畫：[`phase2_tesla_fsd_sandbox_execution_plan_20260625.md`](./phase2_tesla_fsd_sandbox_execution_plan_20260625.md)
> 配套（視覺設計）：[`phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md`](./phase2_tesla_fsd_sandbox_visual_design_handoff_20260625.md)
>
> 用途：後端／契約／測試 wave 已派工（Gate B）。下列項目**需系統設計裁定，或缺規格實值/外部契約**，
> 不可由工程或 LLM 臆測。工程側已用 adapter + capability profile + JSONB policy snapshot 隔離，缺值期間相關
> capability 維持 **gated / fail-closed**，不影響 repo build。

---

## C. 待系統設計裁定（decision packets）

> C1–C3 直接**卡住視覺團隊 UI 第二波**（見配套文件標 🔒 的頁面），請優先裁定。

| # | 裁定項 | 影響 | 阻擋對象 |
|---|---|---|---|
| **C1** | Compliance & Investigation 頁的歸屬 app（併入 ROC Console / platform-admin / 新 console） | landing zone、routing、`packages/ui-web` 範圍 | 視覺 A5、A6（🔒） |
| **C2** | ROC Console 的 design system 來源（沿用哪個 shell / 色系 / 或新色票） | `apps/roc-console-web` shell、共用 primitive | 視覺 A1（🔒） |
| **C3** | Passenger / Tenant / Partner 端在 AV／fallback 時的可見度與文案（passenger-facing copy/state spec） | passenger-web / tenant-console 顯示 | 視覺（既有 app 文案）、FBK 流程 |
| C4 | Billing 維度：AV 趟 vs fallback 人駕趟的費率/分潤是否不同（billing decision packet） | `billing-settlement` 模組、報表 | 後端 REG/FBK（非 UI） |
| C5 | Phase 2 audit event 目錄（command/report/evidence access taxonomy，比照 Phase 1） | 各模組 audit emit | 後端全模組（非 UI） |
| C6 | 資料保存與 legal hold 衝突的具體處理流程（`04_spec §6` 提及未定義） | evidence retention、legal hold | 後端 EVD（非 UI） |

裁定建議用一頁 decision packet 落在 `docs/02-architecture/`，工程依其更新 config / routing，不另行臆測。

### C1–C3 細節

- **C1 歸屬**：Investigation 頁含同步時間線、證據 manifest、controlled export、legal hold，與 ROC 即時營運性質不同（偏事後調查/法遵）。
  併入 platform-admin 較貼合治理屬性，但若調查員與 ROC 同一組人，併 ROC 較順。請裁定。
- **C2 design system**：ROC 是即時監看面，建議與 ops-console（coral）同調或自成一色系以利值班辨識；影響是否新增 `packages/ui-web` primitive。
- **C3 passenger 可見度**：規格只說「乘客僅接收服務狀態，不決定是否用 FSD／派哪台 AV」，但 AV→人駕 fallback 時
  passenger-web / tenant-console 要顯示什麼（改派中？ETA 變更？是否揭露原為 AV？）未定義，需一份 copy/state spec。

---

## B. 缺「規格實值 / 外部契約」（系統設計協調，法遵／營運／Tesla 窗口補資料）

規格刻意 policy-driven、不硬編，下列**實際數值/契約**需補；工程用 config 佔位，**不得捏造**：

| # | 項目 | 補資料 owner | 阻擋 gate |
|---|---|---|---|
| **B1** | Tesla Regulatory Data Interface 契約：真實 endpoint、auth、reason-code dictionary、incident 影像是否提供、SLA 實值、schema 版本流程、data residency | Tesla + legal + 系統設計 | takeover/session authority、Gate C |
| **B2** | 沙盒核准條件實值：通報時限（示意 1 小時 / 10 日）、保存年限（示意 30 天一般影像／3 年事故影像）、允許路線/區域/時段/車輛/安全員、最大趟次/里程、保險與許可 | 主管機關 / 專案 owner | 所有 policy 實值、Gate E |
| **B3** | 在地通報矩陣實值：警/消/EMS/醫院/拖吊/保險/資安窗口、各事件級別的對象/時限/方式/必填欄位/核准人 | 在地營運 | jurisdiction/notification 實值 |
| **B4** | Evidence recorder 廠商協定：device API、health 欄位、segment/上傳協定、影像保存 | 採購 / 整合 | 事故影像實證、Gate D |
| **B5** | Tesla Fleet 真帳號/車輛或官方 sandbox | Tesla / business team | public integration evidence、Gate C/D |

> 這些是**外部 contract gate**，不是交工程自行討論（見決策台帳 `15_..._decision_ledger.md` §Open Contracts）。
> 系統設計已用 adapter / capability profile / policy snapshot 解掉架構面；缺的是**值與簽約**。

---

## D. 交付建議順序

1. **先裁定 C1 / C2 / C3** — 解鎖視覺團隊 A1 / A5 / A6 與 passenger 文案，這是 UI 第二波的前置。
2. **並行補 C4 / C5 / C6** — 偏後端/法遵，不卡 UI，但 land 前要定（影響 billing、audit、retention）。
3. **法遵／營運／Tesla 窗口推進 B1–B5** — 外部契約，到位即可把 Gate B → C/D/E（見執行計畫 §4 Gate 對照）。

裁定回來後，工程依此更新 config / routing / policy snapshot，並回執行計畫追加對應 build task。
