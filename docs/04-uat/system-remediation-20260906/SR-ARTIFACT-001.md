# SR-ARTIFACT-001 — 共用文件儲存與受控下載真正回傳 bytes

| 欄位          | 內容                                                                 |
| ------------- | -------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-ARTIFACT-001.md`     |
| Owner         | Claude                                                                |
| Reviewer      | Claude2                                                               |
| Base SHA      | `afefd55d3d23dd361d2dd81fd5f80eedb6671002` (= `origin/dev` tip at task start) |
| Candidate SHA | recorded at `handoff` via `git rev-parse HEAD` (see task board)       |

## 1. 重現與基準

`origin/dev` 在任務開始時已含 P5/fleet envelope 修復（`FIX-P5-RECORDS-001`），未含任何 controlled-download 產物實作。9/6 audit 提到的舊 SHA（`08b7a32…`）不是本次基準；本任務直接從 `afefd55d3d` 出發，沒有回退或重做既有已修復的行為。

重現：在 base SHA，`ControlledDownloadController.resolve()` 對任一 kind/subjectId，只要簽章與到期通過，一律丟出 `HttpStatus.NOT_IMPLEMENTED` / `ARTIFACT_NOT_MATERIALISED`——因為沒有任何檔案儲存層存在。這與 `docs/03-runbooks/system-remediation-20260906/SR-ARTIFACT-001.md` 描述的缺口一致：連結驗證是誠實的，但從未真的能回傳 bytes。

## 2. 這個任務做了什麼

新增 `apps/api/src/common/document-artifacts/`（本 task 的可寫範圍）：

- `document-artifact-kinds.ts` — 本期唯一支援的三個 family：`tenant-invoice`、`placard`、`report`（對應 brief 的「tenant invoice／placard／report families」）。其餘 kind（`filing-pdf`/`filing-zip`、`accident-investigation-bundle`、regulator-realm report 等）維持排除範圍不變，繼續走既有 501 路徑。
- `document-artifact.types.ts` — `DocumentArtifactStore` port（`put`/`get`，皆為同步）、`DocumentArtifactRecord`、DI token `DOCUMENT_ARTIFACT_STORE`。
- `in-memory-document-artifact-store.ts` — 本期唯一提供的 adapter：process-local Map，key 為 `(kind, subjectId)` 複合鍵；`put`/`get` 皆做 defensive copy，避免呼叫端或內部緩衝互相污染；`sha256` 在 `put` 時對實際 bytes 計算並持久保存在 record 上。
- `document-artifact-reader.ts` — `resolveDocumentArtifact()`：controller 呼叫的讀取埠，回傳 `not_found | content_mismatch | ok` 三態。`content_mismatch` 是新行為：即使簽章與到期都合法，若連結攜帶的 `manifest_hash` 與目前儲存內容的 sha256 不一致，一律拒絕，不把「簽章有效」直接當成「這個 subjectId 現在的內容授權」。

修改 `apps/api/src/modules/controlled-download/`（可寫範圍）：

- `controlled-download.controller.ts` — 在既有簽章 → 到期檢查之後、501 之前，插入 store 查詢：`ok` 回傳 `StreamableFile`（正確 bytes + 正確 `Content-Type`）；`content_mismatch` 丟新錯誤碼 `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`（409）；`not_found`（含所有本來就不支援的 kind）維持原本 `ARTIFACT_NOT_MATERIALISED`（501）行為完全不變，*不*改變既有測試觀察到的行為。Constructor 用 `@Optional() @Inject(DOCUMENT_ARTIFACT_STORE)` 搭配預設值 `new InMemoryDocumentArtifactStore()`，保留舊測試 `new ControlledDownloadController()`（零參數）可用。
- `controlled-download.module.ts` — 以 `useClass: InMemoryDocumentArtifactStore` 提供並 `export` 該 token，讓未來的下游任務（SR-INVOICE-001／SR-PLACARD-001／SR-REPORT-001／SR-PROOF-001）在真的產生 PDF/XLSX bytes 時可以注入同一個 store singleton 呼叫 `put(...)`——這件事本身不在本任務 write_scope 內，未做。

## 3. 驗收條件對應

| 驗收條件                                       | 對應實作與證據                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已存在檔案回正確 MIME/bytes 並可計算 SHA256     | `document-artifact-store.test.ts`：`put`→`get` 位元組相等、`sha256` 與 `createHash("sha256")` 重算一致。`controlled-download-artifact-bytes.test.ts`：`StreamableFile` 串流出的 bytes 與原始一致，`getHeaders().type` 為 `put` 時的 mimeType。 |
| 不存在明確失敗                                  | `controlled-download-artifact-bytes.test.ts` "still fails explicitly for a kind/subjectId that was never materialised" → `ARTIFACT_NOT_MATERIALISED`（501，行為與 base SHA 一致，非新造）。 |
| 拒絕過期／篡改／跨 scope 下載                   | 過期：既有 `CONTROLLED_DOWNLOAD_EXPIRED` 測試延用；篡改：新增 `CONTROLLED_DOWNLOAD_CONTENT_MISMATCH`（409）測試（manifest_hash 與目前 bytes 的 sha256 不符）；跨 scope：`(kind, subjectId)` 複合鍵測試 + controller 層「同 subjectId、不同 kind」測試，證明拿不到別的 kind 的檔案。 |
| 不讓任意 subjectId 穿透授權，不把 signature 等同資源授權 | 簽章通過＋未過期只是必要條件；仍須 store 內確實存在對應 `(kind, subjectId)` 記錄且 `manifestHash` 與目前內容 sha256 相符才回傳 bytes。測試涵蓋：subjectId 被換掉（既有簽章不變）→ 簽章驗證失敗；簽章合法但內容已變更（`content_mismatch`）→ 拒絕。 |
| 換發 URL 不改文件內容                           | "reissuing a URL for the same artifact does not change the bytes served" 測試：兩個不同 `signedAt`/`expiresAt` 的連結，指向同一筆 store 記錄，回傳位元組相同。                     |
| 證據包含 base/candidate SHA、實際指令結果與資源 ID | 見本文件第 1、4 節；資源 ID 為測試中使用的 `subjectId`（如 `invoice-42`、`placard-7`），非正式資料庫真實資料（因無下游 producer，見第 5 節「未做的部分」）。                     |

## 4. 實際指令與結果

```bash
$ pnpm --filter @drts/control-plane-auth build
> tsc -p tsconfig.json
(exit 0 — 前置：此 workspace package 的 dist/ 在此獨立 worktree 未建置，
 屬既有環境缺口而非本任務造成；dist/ 已在 .gitignore，未提交任何來源變更)

$ pnpm --filter @drts/api typecheck
> tsc -p tsconfig.json --noEmit
(exit 0，無錯誤)

$ pnpm exec vitest run tests/unit/system-remediation/sr-artifact-001/
 Test Files  2 passed (2)
      Tests  20 passed (20)
(exit 0)

$ pnpm exec vitest run tests/unit/controlled-download-route.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
(exit 0 — 既有 controlled-download 測試檔案，未修改，全數維持通過，證明無回歸)

$ git diff --check
(exit 0，無空白字元錯誤)
```

### 環境備註（非本任務程式碼問題）

此 worktree 的根目錄 `node_modules` 是指向 canonical root 的 symlink（共用資源）。任務執行期間偵測到該共用 `node_modules` 缺少完整的 workspace 連結（例如根層級不存在任何 `node_modules/@drts/*`），且 `apps/api/node_modules/@drts/contracts` 當下被另一個並行任務（`claude-sr-deps-001` worktree，對應 SR-DEPS-001）的安裝過程指向其自身 worktree ——這是 SR-DEPS-001 正在進行中的共用依賴／lockfile 工作留下的暫態，本任務未介入、未修改任何共用 `node_modules` 內容。

為了讓 `packages/contracts/src` 底下 vitest 需要的 `zod` 可解析，僅在**本 worktree 本地**、`packages/contracts/` 底下新增了一個先前不存在的 `node_modules/zod` symlink，指向共用 pnpm store 內既有的 `zod@3.25.76`（唯讀參照，非安裝／非移除任何套件，未觸碰共用 canonical root 的 `node_modules` 內容，也未修改 `package.json`／`pnpm-lock.yaml`）。這個 symlink 不在本任務的 write_scopes 內、也不會被此 commit 提交（`node_modules/` 全域 gitignore），只是讓本地驗證指令可執行；正式的共用依賴安裝狀態由 SR-DEPS-001 負責。

## 5. 未做的部分（明列，不冒充成功）

- **沒有任何下游 producer 呼叫 `store.put()`。** `billing-settlement`、`platform-admin`、`reporting-filing` 等服務仍各自呼叫 `createControlledDownloadMetadata()` 產生連結，但從未寫入任何 `DocumentArtifactStore`——這些服務檔案不在本任務 write_scopes 內，接線是 SR-INVOICE-001／SR-PLACARD-001／SR-REPORT-001／SR-PROOF-001 的工作。因此**目前正式環境行為不變**：所有 kind 在拿到連結後仍會得到 `ARTIFACT_NOT_MATERIALISED`（501），直到下游任務接上真正的檔案產生器為止。
- **沒有 S3／持久化後端。** `InMemoryDocumentArtifactStore` 是 process-local、非持久化，重啟即遺失、多實例間不共享。這符合 brief「隔離測試可用 local adapter」，但「沿用既有 storage」的正式落地（例如比照 `driver-sos` 模組已有的 S3 adapter pattern）留給實際會寫入 bytes 的下游任務決定，因為只有那時才知道檔案大小／存取模式／是否需要跨副本共享。
- **沒有真機／live 驗收。** 本任務全部驗證皆為單元測試（`vitest`），未啟動實際 API server、未對真實 tenant/租戶資料操作，也未執行任何 live download。這類驗收屬於 `SR-LIVE-DOC-001`（blocked，待 `SR-READINESS-001`／`SR-RELEASE-001` 等前置）。
- **`manifestHash` 與實際 bytes sha256 的對齊仍是下游責任。** 目前 `billing-settlement.service.ts` 等呼叫端把 `manifestHash` 算成「結構化 metadata 的雜湊」（例如 `computeHash({invoiceId, tenantId, ...})`），而不是「檔案 bytes 的 sha256」。一旦下游任務改為呼叫 `store.put()` 存入真正的 PDF bytes，簽發連結時必須改用 `store.put()` 回傳的 `record.sha256` 作為 `manifestHash`，否則會被本任務新增的 `content_mismatch` 檢查擋下——這是設計上刻意的（見第 2 節），但需要下游任務知悉並對齊。

## 6. Write scope 遵守情況

僅新增/修改：

- `apps/api/src/common/document-artifacts/*`（新增）
- `apps/api/src/modules/controlled-download/controlled-download.controller.ts`（修改）
- `apps/api/src/modules/controlled-download/controlled-download.module.ts`（修改）
- `tests/unit/system-remediation/sr-artifact-001/*`（新增）
- `docs/04-uat/system-remediation-20260906/SR-ARTIFACT-001.md`（本檔案，新增）

未修改任何 `billing-settlement`、`platform-admin`、`reporting-filing`、`regulatory-reporting`、`accident-investigation`、`package.json`、lockfile，或任何其他共用檔案。
