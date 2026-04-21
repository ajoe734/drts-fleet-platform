# Review Round 2 — Qwen

**Reviewer：** Qwen
**焦點：** API 實作可行性、前端串接設計、Expo 套件確認
**接棒時間：** 2026-04-17T13:30:00Z

---

## Q1：Proof Bundle — base64 vs upload 決策

**Codex Round 1 提出的問題：** photoIds 需要媒體上傳服務，建議用 base64 內嵌。

**現況確認：**

- Driver App 的 `package.json` **沒有** `expo-image-picker`、`expo-camera`、`expo-location`
- 需要安裝：`expo-image-picker`、`expo-location`（兩個 Expo SDK 套件）

**Base64 方案評估：**

- 優點：無需新 API endpoint、無 GCS SDK
- 缺點：照片 base64 嵌在 task record，一張手機照片約 1-3MB，task record 可能達 5-10MB
- **不建議：** 這會讓 task record 變得過重，database row size 超標風險

**建議改用 presigned upload 方案（輕量）：**

1. `POST /api/media/upload-url` → 回傳 `{ uploadUrl, photoId }` （GCS presigned URL，或 Phase 2 暫用本地 base64 存到 GCS bucket）
2. Driver App 用 `fetch(uploadUrl, { method: 'PUT', body: imageBlob })`
3. 完成後把 `photoId` 放進 `CompletionProofBundle.photoIds`

**Phase 2 Sprint 2 最小可行方案：**
如果 GCS 設定麻煩，先做「本地 staging 方案」：

- `POST /api/media/upload` 接收 `{ base64, mimeType }` → 存到本地 `/tmp` 或 GCS → 回傳 `photoId`（UUID）
- Task record 只存 `photoId`（UUID），不存原始 base64
- 這樣 record 大小正常，照片存 GCS

**結論：加入 GAP-P2S2-009：`api: media upload endpoint (POST /api/media/upload)`**

規模：S（~60 LOC，GCS 或 local presigned）

---

## Q2：Driver App Expo 套件需求

以下套件需要安裝（尚未在 package.json）：

| 套件                | 用途                | 任務             |
| ------------------- | ------------------- | ---------------- |
| `expo-image-picker` | 拍照取得 base64/URI | A-1 proof bundle |
| `expo-location`     | GPS 座標、距離追蹤  | A-2 + A-5        |

**安裝方式：** `npx expo install expo-image-picker expo-location`

**Android/iOS permissions 需要加到 `app.json`：**

```json
{
  "expo": {
    "plugins": [
      ["expo-location", { "locationAlwaysAndWhenInUsePermission": "..." }],
      ["expo-image-picker", { "photosPermission": "..." }]
    ]
  }
}
```

**建議：** 這是 A-1、A-2、A-5 的前置動作，加為 Sprint 2 第一步。

---

## Q3：driver-profile settings 串接確認

**api-client 確認：**

```typescript
async getDriverProfile(): Promise<DriverProfileRecord>   // GET /api/driver/profile
async createDriverProfile(cmd): Promise<DriverProfileRecord>  // POST
async updateDriverProfile(cmd): Promise<DriverProfileRecord>  // PUT
```

**api-client 已有完整方法** ✅（GAP-P2S1-004-CONTRACTS 完成後已加入）

**settings.tsx 改動範圍：**

1. 在現有 Preferences 區塊下方加「個人資料」區塊
2. `useEffect` 加 `client.getDriverProfile()` 呼叫
3. 加 form 欄位：姓名、電話、緊急聯絡人
4. Save 按鈕改為同時呼叫 `updateDriverSettings` + `updateDriverProfile`

規模確認 S（~80 LOC）。

---

## Q4：SSE 前端設計

**ops-console 改動（C-2）：**

```typescript
// ops-console-web/app/dispatch/page.tsx 增加
const eventSource = new EventSource('/api/ops/dispatch-events', {
  headers: { 'x-drts-internal-key': process.env.DRTS_INTERNAL_KEY }
})
eventSource.addEventListener('order_created', (e) => { ... })
eventSource.addEventListener('driver_location_update', (e) => { ... })
```

**注意：** Cloud Run 的 SSE timeout 預設 5 分鐘，需要客戶端自動 reconnect。

**tenant-commute-hub 通知串接（不在本次範圍）：**
G-2 Webhook Management 頁面只需確認後端回傳格式，不需要 SSE。

---

## Q5：G-2 Webhook Management 後端回傳確認

**需要 Codex 在 Sprint 1 完成後確認：**

`tenant-partner.service.ts` 的 `sendTestWebhook()` 方法在 GAP-P2S1-013 完成後應：

- 真正發出 HTTP request
- 回傳 `{ httpStatus: <actual>, deliveryId: <uuid>, status: "delivered" | "failed" }`

如果 `httpStatus` 已是真實值，前端 `WebhookManagement.tsx:233` 的 toast 會自動顯示正確狀態。
若後端仍回傳 `202` hardcoded，需要後端修正。

**建議：** 歸入 Sprint 1 尾聲驗查，不算 Sprint 2 新任務。

---

## 範圍修正摘要

| 項目                        | 修正                                  | 說明                   |
| --------------------------- | ------------------------------------- | ---------------------- |
| 新增 GAP-P2S2-009           | media upload endpoint                 | proof bundle 需要      |
| 新增 expo packages 前置步驟 | app.json + package install            | A-1/A-2/A-5 前置       |
| G-2 歸類                    | Sprint 1 尾聲驗查，非 Sprint 2 新任務 |                        |
| SSE reconnect               | C-1/C-2 需加自動 reconnect            | Cloud Run 5min timeout |

**傳棒給 Gemini 進行 Round 3。**
