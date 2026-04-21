# Review Round 3 — Gemini

**Reviewer：** Gemini
**焦點：** Infra / DB migration / Cloud Run 限制 / Auth 可行性評估
**接棒時間：** 2026-04-17T13:40:00Z

---

## Q1：DB Migration 編號確認

**程式碼確認 — `infra/migrations/`：**

```
V0015__ops_driver_domains.sql
V0016__driver_attendance_settings.sql
V0017__platform_presence.sql
V0018__platform_earnings.sql
V0018A__driver_profiles.sql   ← GAP-P2S1-004-CONTRACTS 新增的
```

**V0018A 存在！** 表示 GAP-P2S1-004-CONTRACTS 已建了 driver_profiles 表。

**修正：**

- 下一個 migration 應為 `V0019__driver_locations.sql`（Flyway 對 `V0018A` 的排序是在 V0018 之後）
- `V0020__settlement_driver_index.sql` 維持原計劃

**✅ 確認：** Starter draft 的 migration 編號正確。

---

## Q2：Cloud Run SSE 可行性

**架構確認：**

NestJS 11.x 原生支援 `@Sse()` decorator（無需額外套件）。

**Cloud Run SSE 注意事項：**

1. **Request timeout**：Cloud Run 預設 request timeout 為 60 分鐘（可配置），SSE 長連接不需要特殊設定
2. **Instance scaling**：多個 Cloud Run instance 下，不同客戶端可能連到不同 instance
   - 司機 GPS event 從 regulatory-registry 更新，需要 broadcast 給所有 ops-console 連接
   - **解法：** 使用 NestJS `EventEmitter2` + 記憶體內 broadcast（Phase 2 可接受，單 instance 足夠 staging）
   - Production 需要 Redis pub-sub（Phase 3 議題）

3. **Internal Key 限制**：SSE endpoint 需要跳過 `x-drts-internal-key` middleware（長連接中不能每次重新驗證）
   - 或在連接建立時一次性驗證，之後維持連接

**建議：** C-1 和 C-2 實作時加上 `// TODO: Phase 3 — replace with Redis pub-sub for multi-instance` 注釋。

---

## Q3：媒體上傳方案（回應 Qwen R2）

**GCS SDK 確認：** `apps/api/package.json` 沒有 `@google-cloud/storage`。

**建議最小可行方案（避免引入 GCS SDK）：**

Phase 2 Sprint 2 用「本地暫存 + UUID 引用」：

```typescript
// POST /api/media/upload
// body: multipart/form-data { file }
// response: { photoId: uuid }
// 存儲：/tmp/<photoId>.<ext> 或 inline base64 存入 media_store Map（內存，不跨 instance）
```

**這個方案的限制：** Cloud Run 重啟後 `/tmp` 清空 → 照片消失。

**更好的方案（不需要 GCS）：** 照片直接 base64 存在 task record 的 `proof.photos[]`（每張限制 < 512KB，client 端先壓縮）

- 一張壓縮後的 JPEG < 200KB → base64 ~270KB → 3 張 ~810KB
- Cloud SQL row size 上限 1GB（PostgreSQL），810KB 完全可行
- 唯一缺點：query 時 record 大

**最終建議：** Starter draft 的 base64 方案重新評估 OK（每張限 512KB client 壓縮）。不需要新增 GAP-P2S2-009。

**→ 建議 Codex R1 加入的 GAP-P2S2-009 改為：**

- 不是獨立任務，而是 A-1 proof bundle 的一部分
- Driver App 端：壓縮 + base64 → 直接放入 `proof.photos: string[]`（contract 微調）

**需要 contracts 微調：**

```typescript
// 原本
export interface CompletionProofBundle {
  photoIds: string[]; // ← 改為
  photos: string[]; // base64 encoded, max 512KB each
  signatureId?: string | null;
}
```

或保留 `photoIds` 但允許傳入 base64 data URL（`data:image/jpeg;base64,...`）。

**→ 這是 A-1 的 contracts 變更，規模仍為 S。**

---

## Q4：Cloud IAP / Auth（GAP-P2S3-001）現況

**deploy-staging.yml 確認：**

三個 deploy steps 全部有 `--allow-unauthenticated`（lines 317, 342, 不知道哪行）。

但 deploy workflow 已有：

- Service Account 設定（`--service-account ${{ steps.runtime_sa.outputs.email }}`）
- Secrets 注入（`--set-secrets "DATABASE_URL=...,DRTS_INTERNAL_KEY=..."`）

**Cloud IAP 實作步驟（給 Gemini Sprint 3 時參考）：**

1. GCP Console：啟用 Cloud IAP for Cloud Run → 需要人工操作，非 AI 可自動執行
2. 移除 `--allow-unauthenticated`
3. GitHub Actions 加入 `google-github-actions/auth` → OIDC token → 加入 `Authorization: Bearer` header
4. NestJS 加 `JwtModule` + `JwtAuthGuard` 驗 OIDC token

**嚴重警告：**

- Cloud IAP 需要 GCP Console 人工設定（OAuth consent screen + IAP app）
- AI agent 無法自動完成 GCP Console 操作
- **這個任務必須有人工配合，AI 只能做程式碼部分**

**建議：** GAP-P2S3-001 標記為「需要人工 + AI 協作」，在 Sprint 3 開始前先讓使用者確認 GCP 設定意願。

---

## Q5：tenant-commute-hub CI/CD vite alias 問題

**發現問題（Starter draft 開放問題 #5）：**

`vite.config.ts` 的 alias 指向：

```
"@drts/api-client": path.resolve(__dirname, "../drts-fleet-platform/packages/api-client/src/index.ts")
```

這個**相對路徑只在本機 monorepo 並排時可用**。CI/CD 環境（如 Lovable 的線上 preview）會失敗。

**建議修正方案：**

1. 短期：tenant-commute-hub 的 CI/CD 全部在有 drts-fleet-platform 的機器上執行（本機 + GitHub Actions checkout 兩個 repo）
2. 長期：publish `@drts/api-client` 和 `@drts/contracts` 到 npm registry（private）或用 git submodule

**建議加入 Sprint 2 as G-3（tenant-commute-hub CI/CD 建置修正）：**

- 規模：S（GitHub Actions workflow 設定 multi-repo checkout）
- 低優先，但若要讓 Lovable preview 功能正常必須修

---

## 範圍修正摘要

| 項目                         | 修正                                | 說明                                        |
| ---------------------------- | ----------------------------------- | ------------------------------------------- |
| GAP-P2S2-009（media upload） | 取消獨立任務                        | 改為 A-1 proof bundle 內嵌，base64 限 512KB |
| A-1 proof bundle contracts   | 小改 `CompletionProofBundle`        | photoIds → photos: string[]                 |
| GAP-P2S3-001 Cloud IAP       | 標記「需人工配合」                  | GCP Console 設定無法自動化                  |
| 新增 G-3                     | tenant-commute-hub CI/CD multi-repo | Lovable preview 環境修正                    |
| SSE C-1/C-2                  | 加 Phase 3 Redis pub-sub TODO 注釋  |                                             |

**傳棒給 Copilot 進行 Round 4。**
