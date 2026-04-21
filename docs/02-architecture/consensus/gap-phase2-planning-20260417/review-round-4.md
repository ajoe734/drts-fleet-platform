# Review Round 4 — Copilot

**Reviewer：** Copilot
**焦點：** 風險盤點、UAT 阻斷檢查、遺漏發現、範圍風險
**接棒時間：** 2026-04-17T13:50:00Z

---

## G-2 確認：sendTestWebhook 真實回傳（已解決）

**程式碼確認 — `tenant-partner.service.ts:1072-1334`：**

GAP-P2S1-013 完成後，`sendTestWebhook` 確實發出 HTTP request，並回傳：

```typescript
{
  deliveryId: string;
  httpStatus: number | null; // 真實 HTTP status
}
```

`delivery.httpStatus = result.httpStatus` 在 line 1291。

**✅ G-2 問題已解決：** 前端 `WebhookManagement.tsx` 的 toast 會自動顯示真實 httpStatus。
**不需要 Sprint 2 任何修改。**

---

## UAT 阻斷分析（Phase 2 Sprint 2 功能）

### DA-007 / DA-009 — Trip completion with photo proof

**UAT scenarios 存在：**

- `DA-007`: min_photo_count=1 → 沒有照片不能完成
- `DA-009`: expense proof required → 沒有 expense proof 不能完成

**現況：** Driver App `trip.tsx` hardcoded `proof: undefined`（空），所有 enterprise 訂單（`minPhotoCount: 1`）實際上會被後端 reject（或 bypass if 後端沒有 enforce）。

**嚴重性：** 若後端有 enforce minPhotoCount，企業 dispatch E2E 目前是失敗的。

**建議：** Sprint 2 的 A-1 proof bundle 是 UAT 前的**阻斷任務**，不是加分項。

---

## 風險旗標

### Risk-1：Expo 套件安裝影響 Expo Go 開發環境

`expo-location` 和 `expo-image-picker` 需要：

1. Native module — Expo Go 支援（✅ 不需要 custom build）
2. `app.json` 要加 permissions plugin — 需要先測試不同平台行為

**建議：** Sprint 2 開始前先驗證這兩個套件在現有 Expo 版本（54.0.33）的相容性。

### Risk-2：base64 照片在 PostgreSQL row size

Gemini R3 建議每張限 512KB 壓縮。

**補充確認：** PostgreSQL 的 `jsonb` 欄位存大量 base64 對查詢效能有影響（task list 每次都要讀大 payload）。

**建議：** `DriverCompleteTaskCommand.proof.photos` 欄位加 server-side 驗證：

```typescript
// 每張 base64 < 600KB，最多 5 張
if (photo.length > 600 * 1024 * 1.33) throw new BadRequestException(...)
```

### Risk-3：tenant-commute-hub vite alias 的 Lovable Cloud Preview

Gemini R3 正確指出：Lovable 的線上 preview 功能使用 StackBlitz/雲端環境，無法存取 `../drts-fleet-platform/` 相對路徑。

**實際影響：** Lovable 線上編輯後的 preview 永遠失敗（build error）。這讓 Lovable 工作流程（AI 改前端 → 立即 preview）完全失效。

**G-3 必要性升級：** 從「建議」改為**阻斷性問題**。Lovable 用戶體驗的核心工作流受阻。

**最快解法（不需要 publish npm）：**
在 `tenant-commute-hub` 的 `src/lib/` 中放一份精簡版 `@drts/api-client` stub（只包含 tenant portal 用到的 methods 的 type stub），讓 Lovable cloud build 可以通過。
真實邏輯仍從 vite alias 取得（本機 + CI 環境）。

**規模：** S（~100 LOC type stub + vite conditional alias）

### Risk-4：Qwen 401 問題影響 Sprint 2 派工

Sprint 2 大量任務（A-1、A-2、A-4、A-5、C-1、C-2、G-3-008）都標記給 Qwen。

若 Qwen token 未更新，Sprint 2 派工會繼續失敗並觸發大量 reassign。

**建議：**

1. 確認 Qwen token 是否已更新，若未更新則在 Sprint 2 開始前全部重新分配
2. Sprint 2 的 Driver App 任務（A-1/A-2/A-5）改分配給 Codex2
3. SSE 任務（C-1/C-2）改分配給 Codex 或 Codex2

### Risk-5：GAP-P2S3-001 Cloud IAP 人工依賴

Gemini R3 正確指出。補充：

**這個任務無法在 Sprint 3 自動執行，必須明確告知使用者：**

- 啟用 Cloud IAP 需要在 GCP Console 操作
- 需要設定 OAuth consent screen
- 需要授權每個 client surface 的 IAP client ID
- 預計人工操作時間：1-2 小時（不算程式碼）

---

## 遺漏發現：missing gaps not in starter draft

### MISS-001：ops-console incidents 頁面有 severityFilter，但沒有 "critical first" 排序

**程式碼確認：** `ops-console-web/app/incidents/page.tsx` 有 `severityFilter` 下拉，但記錄顯示順序是按 `created_at` desc，沒有把 `severity=critical` 的浮到最頂端。

**GAP-P2S3-002 範圍確認：** 加「critical first 排序」+ 顯示醒目 badge，規模 S 正確。

### MISS-002：driver app 無離線支援

行程進行中如果失去連線，`completeTask` 會失敗，司機無法完成行程。目前沒有任何 offline queue 機制。

**評估：** Phase 2 範圍不適合加（複雜度高）。建議標記為 Phase 3 backlog。

### MISS-003：tenant-commute-hub AdminPanel.tsx 邊界問題未解決

`AdminPanel.tsx` 包含 tenant user management（OK），但頁面 route 是 `/admin`，而 `DashboardLayout.tsx` 的 nav item 顯示 "Admin Panel"（中文 "後台管理"）。

確認：這只是 tenant user 管理（`createTenantUser`、`updateTenantRole`），**不是平台級 admin**，邊界正確。

**✅ 不是問題，無需修改。**

---

## 最終風險摘要

| 風險                                 | 嚴重度 | 建議             |
| ------------------------------------ | ------ | ---------------- |
| A-1 proof bundle 阻斷 enterprise E2E | 高     | Sprint 2 P0      |
| G-3 Lovable cloud build 失敗         | 高     | Sprint 2 修正    |
| Qwen 401 影響 Sprint 2 派工          | 高     | 重新分配         |
| base64 PostgreSQL row size           | 中     | server-side 限制 |
| Cloud IAP 需人工操作                 | 中     | 預告使用者       |
| Expo 套件相容性                      | 低     | 先 validate      |

**傳棒給 Claude 進行最終仲裁。**
