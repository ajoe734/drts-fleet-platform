# 設計交接單：Platform Admin 「服務區治理 / service-area governance」螢幕

**收件：** DRTS 視覺／設計團隊（canonical canvas 擁有者）
**日期：** 2026-07-07
**狀態：** 等你們發佈 canvas（工程端一切就緒）

---

## 一句話請求

請在 **Platform Admin canvas** 新增一條 route **`/service-area-governance`** 的螢幕族，讓車隊管理員能對「一般計程車服務區」做**畫界線 → 送審 → 發佈 → 退場**的完整治理，**不用碰 SQL**。工程端的後端 API、GeometryEditor 元件、行為規格都已完成，**只差視覺 canvas**。

> 依專案規則，工程不自行設計此 UI；螢幕一律來自 canvas。這份單把「要畫什麼、界線在哪」講清楚，你們一發佈，工程立刻接手實作（任務 `MAP-FE-ADM-002` 已排隊）。

---

## 背景：為什麼需要你們

- 目前 canvas（`Platform Admin.html` + `platform-screens-*.jsx`）**沒有**一般計程車服務區治理的螢幕，只有租戶治理 / 合作夥伴治理。
- canvas 有 `platform-sandbox.jsx`（**Phase 2 沙盒**的 ODD/operating-area），但那是**不同的權責邊界，不可複用**當作這個 taxi 螢幕。
- 後端權威（服務區 boundary + stop policy 的 draft/review/publish/retire 生命週期）與共用的 `GeometryEditor` 元件都已上線 —— 缺的純粹是這個螢幕的視覺設計。

---

## 要畫的螢幕：一條 route `/service-area-governance`

（如你們視覺上需要，可再拆子 route；工程只需要一條 canonical 入口。）

### ✅ 七個必備頁面區塊（checklist）

- [ ] **5.1 標題／route 識別** — 命名要跟「沙盒治理」區隔；副標點明範圍（服務區界線、stop policy、發佈生命週期、後端評估）。高風險的發佈/退場動作沿用 Platform Admin 既有確認模式：**必填理由 + audit 收據**。
- [ ] **5.2 記錄類型切換器** — 在兩者間切換，且語意差異要一眼可辨：
  - **服務區界線 boundary** → 回答「這區可服務嗎？」
  - **停靠政策 stop policy** → 回答「上/下車 允許、拒絕、還是轉人工複核？」
- [ ] **5.3 地圖／幾何工作區** — 用共用 `GeometryEditor`：多邊形/圓形服務區、多邊形/圓形 stop-policy 區。要顯示既有已發佈 overlay + 當前 draft/review 目標。**沙盒的路廊(route-corridor)編輯在此 taxi 螢幕要視覺區隔或不出現。**
- [ ] **5.4 記錄清單／版本堆疊** — 每筆至少：名稱、狀態(`draft/review/active/retired`)、版本 ref、生效起、生效迄或開放式、更新時間/人。stop policy 另需：方向(`pickup/dropoff/both`)、效果(`allow/deny/manual_review`)。
- [ ] **5.5 審核／發佈面板** — 發佈需明示：生效起、生效迄、**必填發佈理由**、會被取代或並存的現行紀錄。退場需：退場生效日、**必填退場理由**、對 evaluator 的即時影響。
- [ ] **5.6 受影響樣本預覽** — 用樣本上/下車座標打後端預覽，至少涵蓋：可服務／不可服務／no-pickup／no-dropoff／manual review。**須明示「後端評估才是權威，本頁只呈現結果」**。範圍僅限操作員輸入樣本，不隱含批次訂單預覽。
- [ ] **5.7 Audit 可見性** — 呈現 audit 衍生資訊：actor、request/audit id、版本、方向、效果、生效日、發佈/退場理由。可獨立面板或整合在詳情區，但要在 route 上清楚可讀。

### 三條必須支援的主流程

1. **發佈禁上車區**：開治理 → 切 stop policy → 建 draft(`direction=pickup, effect=deny`) → 畫幾何 → 送審 → 帶生效日+理由發佈 → 看到 audit 收據與更新後 overlay。
2. **發佈前驗證後端影響**：開樣本預覽 → 在新區內跑一個上車樣本 → 確認被擋、政策符合 → 在區外跑對照樣本 → 確認仍可服務。
3. **安全退場/替換現行政策**：開現行紀錄 → 檢視生效窗口與下游影響 → 帶理由+截止日退場，或發佈替換 draft → 確認 audit 欄位與 active-history 轉換。

### 必含的 空/錯誤/降級 狀態

載入中、尚無界線/政策、權限不足、抓取失敗、幾何驗證失敗、生命週期/生效窗口無效導致發佈受阻、預覽失敗、資料新鮮度降級。

---

## 🚧 Scope 護欄（務必遵守）

**要做**
- 只做**一般計程車**服務區 boundary + stop policy 治理。
- 幾何編輯**共用** `GeometryEditor` primitive（與沙盒共用元件、但視覺/權責分離）。

**不要做**
- ❌ 不可視覺上讓「沙盒」與「taxi 服務區」看起來是同一套 workflow（權責不同）。
- ❌ 不納入 Phase 2 沙盒的 ODD operating-area、approved routes、experiment 管轄、suspend/resume（那些在沙盒螢幕）。
- ❌ 不改任何已定案的 service-area 契約語意。
- ❌ 不把 SQL/後台直改當成一級 UX。
- ❌ 本單不含 driver / ops 地圖設計。

---

## 留給你們的視覺決策（歡迎你們定）

- 這條 route 在 Platform Admin IA 裡與 `fleet` / `pricing` / `audit` / `sandbox` 的相對位置？
- taxi 地理圍欄治理 vs Phase 2 沙盒幾何治理，最清楚的視覺切分（又不重複 shell 隱喻）？
- 地圖優先＋側邊詳情面板，還是治理清單優先＋內嵌幾何 drilldown？
- 新版本帶未來生效日發佈、取代現行紀錄時，最好的視覺處理？
- 預覽結果如何區分「區域層級可服務性」與「stop-policy 拒絕/人工複核」邏輯？

---

## 你們的交付 = 完成定義

`Platform Admin.html` + `platform-screens-*.jsx` 發佈 `/service-area-governance` route 族，涵蓋上述 7 區塊與 3 流程，**與 `platform-sandbox.jsx` 視覺上明確區隔**。

## 完整權威規格（要更細節看這份）

- 行為/資料/API 權威：`docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`（本單即其設計視角摘要）
- 後端契約：`apps/api/src/modules/service-area/service-area.controller.ts`（13 endpoints，含 `/api/service-area/admin/*`、`/definitions`、`/admin/geojson`、`/evaluate`）
- 共用元件：`packages/ui-web` 的 `GeometryEditor`（`MAP-UI-002`）
- 後續實作任務：`.orchestrator/task-briefs/MAP-FE-ADM-002.md`（canvas 一到即可派）

## canvas 落地後 → 通知工程

canvas 發佈後請回拋一句，工程即解鎖並派 **`MAP-FE-ADM-002`** 實作 route，收掉 **Gate B（治理安全發佈）** 的 UI 端。
