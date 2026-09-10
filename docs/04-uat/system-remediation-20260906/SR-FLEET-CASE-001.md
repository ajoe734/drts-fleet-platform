# SR-FLEET-CASE-001 — 車行案件回覆與 Ops timeline 閉環

- Status: `ready_for_review`
- Owner: `Gemini2`
- Reviewer: `Gemini`
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json` (`C067`)
- Source Finding: `docs/04-uat/system-remediation-20260906/source/findings.json` (`R12`)
- Canonical Canvas: PR #1890 (`SR-FLEET-CASE-001-CANVAS`, commit `8ee0afcce52f4fdbe50bc936c10b04b1d49c8b91`)
- Base Commit: `8ee0afcce52f4fdbe50bc936c10b04b1d49c8b91`
- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-fleet-case-001`
- Branch: `gemini2/sr-fleet-case-001`

---

## 1. 問題背景與修復目標

### 問題概述 (Finding R12)
- **問題陳述**：「事故申訴要求回覆卻未提供流程」— 車行端在 `/cases` 只有案件清單，點選或需要回覆處置時無案件詳情、回覆表單、附件上傳及歷程檢視頁面；車行回覆亦未與 Ops 案件管理歷程雙向閉環。
- **Capability C067**：補齊車行案件詳情、回覆、附件及歷程，並與 Ops Console 申訴案件歷程同步。

### 核心能力與驗收標準
1. **`fleet_case_reply_ops_timeline_remote`**：
   - 車行送出回覆後寫入案件歷程，actor 標示外部身分（`actorRealm: 'tenant'`），Ops 端可即時回讀。
   - 歷程與 Ops Console 申訴歷程即時雙向連動（經由 `complaintService.addComplaintCaseNote`），且 **Ops owner (`assignee: '陳維 (ops_compliance)'`) 嚴格保留不變**。
   - 回覆附帶之檔案作為 attachments 關聯於歷程事件中。
2. **`fleet_case_attachment_authorized_readback`**：
   - 上傳流程提供預簽發 URL 與上傳確認（confirm）。
   - 結案（`closed`）案件附件唯讀，禁止新上傳與重試（409 `CASE_CLOSED_NO_REPLY`）。
   - 提供真實 HMAC-SHA256 簽名之授權回讀（download URL）機制，簽名具有效期限與防竄改驗證；即使案件已 closed，已上傳附件仍可授權回讀下載。
   - 不使用假簽章或假送達替代。
3. **`fleet_case_cross_fleet_closed_dedup`**：
   - 嚴格租戶隔離：非本車行案件依 API 授權隱藏，嘗試存取回傳 403 `CASE_NOT_FLEET_SCOPED`。
   - 平台責任（`platform`）案件在前端維持可見但唯讀，嘗試回覆回傳 409 `CASE_PLATFORM_OWNED`。
   - 已結案（`closed`）案件嘗試回覆回傳 409 `CASE_CLOSED_NO_REPLY`。
   - 重送去重：以 `idempotencyKey` 保證冪等性，重複送出同一操作回傳原始收據（`deduplicated: true`），且不重複新增歷程事件。
   - SLA 狀態由資料庫之 `slaBreachedAt` 真值驅動（`breached` / `on_track`），不以 client 端假計算或假欄位代替。

---

## 2. 交付成果與變更檔案 (Write Scopes Traceability)

所有修改嚴格限制於任務授權之 `write_scopes`，無更動任何範疇外檔案：

| 檔案路徑 | 變更說明 |
|---|---|
| `apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts` | 實作 `FleetPartnerCaseService`：案件列表、詳情、歷程讀取；回覆提交與冪等去重；同步至 `ComplaintService` 案件筆記；HMAC-SHA256 附件簽名與下載驗證；租戶隔離與邊界狀態判定。 |
| `apps/api/src/modules/fleet-partner/fleet-partner.controller.ts` | 實作車行案件管理端點：`listPortalCases`、`getPortalCaseDetail`、`getPortalCaseTimeline`、`submitPortalCaseReply`、`createPortalCaseAttachmentUploadUrl`、`confirmPortalCaseAttachmentUpload`、`getPortalCaseAttachmentReadUrl`、`downloadPortalCaseAttachment`；建構子置於第 6 參數並標記 `@Optional()` 確保既有單元測試相容性。 |
| `apps/api/src/modules/fleet-partner/fleet-partner.module.ts` | 裝配 `ComplaintModule`、`AuditNotificationModule` 並註冊 `FleetPartnerCaseService`。 |
| `apps/fleet-partner-portal-web/lib/fleet-portal-data.server.ts` | 擴充 Portal 資料層：實作 `loadCaseDetail`、`submitCaseReply`、`createCaseAttachmentUploadUrl`、`confirmCaseAttachmentUpload`、`getCaseAttachmentReadUrl` 與規範 fixture。 |
| `apps/fleet-partner-portal-web/app/cases/page.tsx` | 事故/申訴清單頁：補齊 tab 狀態過濾（全部、車行責任、共同責任、已結案）、詳情快捷入口及錯誤指引/存取狀態連結。 |
| `apps/fleet-partner-portal-web/app/cases/[caseId]/page.tsx` | 實作 `FLP_CaseDetail` 畫面：PageHeader、案件摘要 DL、歷程 Timeline、Linked entities、邊界狀態處理。 |
| `apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer.tsx` | 實作 `CaseReplyComposer` 用戶端元件：回覆草稿、送出狀態機（idle / submitting / sent / failed）、附件清單（done / uploading / fail）、授權下載與重試按鈕。 |
| `apps/fleet-partner-portal-web/app/cases/errors/page.tsx` | 實作 `FLP_CaseErrors` 畫面：7 種寫入/指令錯誤卡片（`CASE_NOT_FLEET_SCOPED`, `CASE_PLATFORM_OWNED`, `CASE_CLOSED_NO_REPLY`, `CASE_REPLY_SUBMIT_FAILED`, `CASE_REPLY_DUPLICATE`, `CASE_ATTACHMENT_UPLOAD_FAILED`, `CASE_ATTACHMENT_TOO_LARGE`）。 |
| `apps/fleet-partner-portal-web/app/cases/access-states/page.tsx` | 實作 `FLP_CaseAccessStates` 畫面：利用 `CanvasEmptyState` 展現 5 種 GET/讀取失敗與空狀態（附件無權限、附件不存在、附件讀取失敗、歷程空狀態、歷程讀取失敗）。 |
| `tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts` | 撰寫 19 項單元與整合測試，覆蓋三項 Capabilities、Controller 端點與 Web Data Layer。 |
| `docs/04-uat/system-remediation-20260906/SR-FLEET-CASE-001.md` | 本 UAT 交付證據文件。 |

---

## 3. 自動化驗證紀錄 (Verification Evidence)

所有驗證均在工作目錄 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-fleet-case-001` 下執行，均 exit 0 通過：

### 3.1 格式與語法檢查 (`git diff --check`)
```sh
git diff --check
# Exit code: 0 (無任何 trailing whitespace 或格式錯誤)
```

### 3.2 API 模組型別檢查 (`pnpm --filter @drts/api typecheck`)
```sh
pnpm --filter @drts/api typecheck
# > @drts/api@0.1.0 typecheck
# > tsc -p tsconfig.json --noEmit
# Exit code: 0
```

### 3.3 Web 前端型別檢查 (`pnpm --filter @drts/fleet-partner-portal-web typecheck`)
```sh
pnpm --filter @drts/fleet-partner-portal-web typecheck
# > @drts/fleet-partner-portal-web@0.1.0 typecheck
# > next typegen && tsc --noEmit
# Generating route types...
# ✓ Types generated successfully
# Exit code: 0
```

### 3.4 單元測試套件執行 (`vitest`)
```sh
pnpm exec vitest run tests/unit/system-remediation/sr-fleet-case-001/
```
執行結果輸出：
```
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-fleet-case-001

 ✓ tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts (19 tests) 33ms

 Test Files  1 passed (1)
      Tests  19 passed (19)
   Start at  11:26:37
   Duration  9.44s (transform 6.52s, setup 0ms, import 8.90s, tests 33ms, environment 1ms)
```

### 3.5 測試案例覆蓋對照表

| 測試群組 | 測試名稱 | 驗證能力 |
|---|---|---|
| `Capability 1` | `should submit reply to case cmp_0908 and write to authoritative timeline with actorRealm: 'tenant'` | 車行回覆寫入共享歷程、標記 tenant、附件關聯 |
| `Capability 1` | `should synchronize reply to Ops complaint timeline via addComplaintCaseNote and preserve Ops owner (assignee)` | Ops 歷程即時同步、**Ops assignee 嚴格保留** |
| `Capability 2` | `should generate pre-signed upload URL for open case` | 預簽發上傳 URL 生成 |
| `Capability 2` | `should confirm uploaded attachment and register it in case attachments` | 上傳確認與案件附件關聯 |
| `Capability 2` | `should reject attachment upload for closed case with CASE_CLOSED_NO_REPLY (409)` | 結案禁止上傳新附件 |
| `Capability 2` | `should allow authorized readback of uploaded attachments even for closed case` | **結案附件仍允許授權回讀** |
| `Capability 2` | `should reject tampered HMAC token or expired readback token with 403` | HMAC 簽章防竄改與過期攔截 |
| `Capability 2` | `should reject cross-fleet download request with 403` | 跨車行下載攔截 |
| `Capability 3` | `should throw 403 CASE_NOT_FLEET_SCOPED when accessing other fleet case` | 跨車行案件存取拒絕 |
| `Capability 3` | `should allow viewing platform-owned case cmp_0912 but reject reply with 409 CASE_PLATFORM_OWNED` | 平台責任案件唯讀且回覆拒絕 |
| `Capability 3` | `should reject reply on closed case cmp_closed_001 with 409 CASE_CLOSED_NO_REPLY` | 結案案件回覆拒絕 |
| `Capability 3` | `should deduplicate resubmitted reply using idempotency-key and return original receipt without duplicate timeline entries` | **冪等重送去重、歷程不重複** |
| `Capability 3` | `should drive SLA display directly by slaBreachedAt truthiness` | **SLA 依 slaBreachedAt 真值判定** |
| `Controller` | `GET /api/fleet-partner/cases should return scoped cases list` | 車行案件列表 API |
| `Controller` | `GET /api/fleet-partner/cases/:caseId should return case detail and attachments` | 案件詳情 API |
| `Controller` | `POST /api/fleet-partner/cases/:caseId/reply should return reply receipt in standard envelope` | 回覆送出 API |
| `Controller` | `GET /api/fleet-partner/cases/:caseId/attachments/:attachmentId/download should serve binary content with headers` | 授權下載 API 與 Content-Disposition |
| `Web Loader` | `loadCases should load and map cases with SLA breach derivation` | 前端清單 loader 與 SLA 映射 |
| `Web Loader` | `loadCaseDetail should return full case detail, timeline, and attachments` | 前端詳情 loader (open / platform / closed) |

### 3.6 既有 Controller 與全模組單元測試回歸驗證
```sh
pnpm --filter @drts/api test tests/unit/fleet-partner.controller.test.ts
# > @drts/api@0.1.0 test
# Test Files  1 passed (1)
#      Tests  10 passed (10)
# Exit code: 0

pnpm --filter @drts/api test tests/unit
# Test Files  118 passed (118)
#      Tests  1123 passed (1123)
# Exit code: 0
```

---

## 4. 邊界約束與環境隔離 (Live VM Boundaries)

- **無常駐服務進程**：未執行任何 `playwright`、`pnpm dev`、`docker compose` 或後台守護行程，嚴格符合環境約束。
- **無虛假替代**：
  - 授權回讀採用真實 `crypto.createHmac("sha256", secret)` 簽名驗證與時間戳比對，非固定字串或 mock 假簽章。
  - SLA 判定依據 `slaBreachedAt` 時間戳存在性，未在前端或服務端硬編碼百分比或假狀態。
- **無跨租戶外洩**：所有端點強制校驗 `x-fleet-partner-id`，非所屬案件一律阻擋。

---

## 5. 結論與審查移交 (Handoff)

- 本次修改完整修復 R12/C067 缺口，對齊 PR #1890 規範畫布與螢幕合約。
- 所有型別檢查與單元測試 100% 通過。
- 移交審查者：`Gemini`。
