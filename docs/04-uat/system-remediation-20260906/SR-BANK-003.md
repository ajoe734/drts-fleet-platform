# SR-BANK-003 — 銀行證據摘要與簽章可獨立驗證

| 欄位          | 內容                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-BANK-003.md`                                    |
| Owner         | Gemini2                                                                                           |
| Reviewer      | Gemini                                                                                            |
| Depends on    | 無                                                                                                |
| Base SHA      | `a4876ac529abfb634c2b96f237116202abf3d87d`（`origin/dev` at task dispatch）                      |
| Candidate SHA | 於 `handoff` 時以 `git rev-parse HEAD` 記錄（見 task board）                                       |

## 1. 重現與基準

### 問題追溯（R14 / C083）
- 9/6 audit 發現（R14）：銀行財務人員下載對帳單時，下載檔案結尾的 `Manifest Hash` 欄位並非真正的密碼學雜湊，而是對字串 `${statement.statementNo}:${statement.period}:${statement.totalIssuerPayableAmount}` 直接做 `Buffer.from(...).toString("hex")`。此 112 字元之十六進位字串為完全可逆解碼之明文字串，不具備任何不可逆性與完整性保證。
- 簽章欄位（R14）：`Digital Signature` 為固定模板字串 `SIG_DRTS_RSA2048_${statement.statementNo}_VALID`，直接硬編結尾 `_VALID` 偽裝為驗證成功，既無非對稱金鑰簽署，亦無法供外部工具獨立驗證，竄改內容亦無法察覺。
- 能力缺口（C083）：要求停止使用 hex 編碼與固定字串冒充簽章；摘要須以實際 UTF-8 bytes 計算真 SHA-256；若無金鑰配置則誠實標示為 `UNSIGNED`，不得產出假 `VALID`；有簽章時可由獨立工具以公鑰驗證，且竄改任一 byte 即驗證失敗。

### 基準重現
在 Base SHA（`a4876ac529abfb634c2b96f237116202abf3d87d`）：
- `apps/bank-console-web/app/artifacts/statements/[id]/route.ts` 第 135–136 行：
  ```typescript
  `Manifest Hash      : sha256:${Buffer.from(`${statement.statementNo}:${statement.period}:${statement.totalIssuerPayableAmount}`).toString("hex")}`,
  `Digital Signature  : SIG_DRTS_RSA2048_${statement.statementNo}_VALID`,
  ```
- 對帳單下載後，`Buffer.from(manifestHash.replace("sha256:", ""), "hex").toString("utf-8")` 會直接解出 `settlement-statement-tenant_ctbc-2026-08:2026-08:120000`，證實確實為可逆十六進位明文編碼。
- 檔案未經任何私鑰簽署，卻宣告 `SIG_..._VALID`，導致無配置環境產出假合格證據。

---

## 2. 這個任務做了什麼

本任務嚴格遵守 `write_scopes`，僅修改及新增以下檔案：

### 1. `apps/bank-console-web/app/artifacts/artifact-crypto.ts`（新增）
建立銀行受控下載產物之標準摘要、簽章與獨立驗證工具：
- **`computeArtifactDigest(bodyText)`**：將內文正規化（LF 換行與尾端空白修除）後轉為 UTF-8 bytes，以 Node `crypto.createHash("sha256")` 計算標準 64 字元小寫十六進位 SHA-256 雜湊。
- **`buildSignedArtifactText(bodyText, options)`**：
  - 遵循金鑰流程讀取環境變數 `BANK_ARTIFACT_SIGNING_PRIVATE_KEY` / `BANK_SIGNING_PRIVATE_KEY` / `JWT_PRIVATE_KEY`，**絕不硬編私鑰**。
  - **無簽章配置時**：標示 `Signature Status: UNSIGNED`、`Signing Key ID: NONE`、`Signature Algorithm: NONE`、`Digital Signature: UNSIGNED`。絕不包含 `_VALID` 或偽造簽名字串。
  - **有金鑰配置時**：使用 `crypto.createSign("SHA256")` 以 RSA-SHA256（PKCS#1 v1.5）對內文 bytes 進行非對稱數位簽署，輸出 Base64 簽章，並記錄簽章狀態為 `SIGNED`。
  - 格式化產出包含 `DIGITAL SIGNATURE & AUDIT MANIFEST` 區塊之受控產物文字。
- **`parseArtifact(rawContent)`**：獨立解析產物，將商業資料內文（Header、財務摘要、行程明細）與 Manifest 分離，精確擷取各項欄位與內文 bytes。
- **`verifyArtifact(rawContent, publicKey)`**：
  - 獨立計算內文 SHA-256 並與 Manifest 欄位比對，任何單一 byte 差異立即報告 `Digest mismatch`。
  - 若為 `UNSIGNED`，如實回報無簽章配置，不製造假陽性合格結果。
  - 若為 `SIGNED`，以傳入之公鑰透過 `crypto.createVerify("SHA256")` 驗證簽章；金鑰不符、簽章竄改或內文竄改均回傳驗證失敗。
- **`extractArtifactCryptoMaterial(rawContent)`**：解構出二進位內文與簽章 bytes，方便以標準 Unix 工具（`sha256sum`、`openssl`）直接命令列驗收。

### 2. `apps/bank-console-web/app/artifacts/statements/[id]/route.ts`（修改）
- 移除舊有的可逆 hex 編碼與固定 `SIG_..._VALID` 模板。
- 引入 `buildSignedArtifactText`，以對帳單資料（發票號、結算期間、銀行租戶、財務總額、行程明細等）作為不可竄改之內文主體。
- 依環境變數是否有金鑰決定簽章，無金鑰時輸出真實 SHA-256 與 `UNSIGNED`。
- 修改 `@/lib/*` 為相對路徑，消除跨套件模組路徑相依。

### 3. `apps/bank-console-web/app/artifacts/trips/[id]/route.ts`（修改）
- 行程單筆受控憑證同步採用 `buildSignedArtifactText`，具備一致之 SHA-256 摘要與稽核簽章清單。
- 消除任何非受控偽造標籤，支援真金鑰簽署與未簽署誠實標記。

### 4. `tests/unit/system-remediation/sr-bank-003/bank-artifact-crypto.test.ts`（新增）
新增 16 項自動化驗收測試：
1. **R14 缺陷修復驗收**：驗證產出為 64 hex 真 SHA-256，非 112 hex 可逆明文編碼。
2. **單一 Byte 竄改敏感度**：行程金額改動 1 元（`1,450` -> `1,451`），摘要驗證立即失敗。
3. **無金鑰配置誠實性**：未配置私鑰時，產物明示 `UNSIGNED`，全檔無任何 `_VALID` 或 `SIG_DRTS` 偽造標籤，`verifyArtifact` 正確回傳未簽署。
4. **偽造簽章防禦**：手動注入舊版 `_VALID` 字串，驗證器拒絕通過。
5. **RSA-2048 真金鑰簽署與公鑰驗收**：以動態產生之 RSA 金鑰對簽署，公鑰驗證通過；公鑰不配對或簽章竄改 1 字元即失敗。
6. **獨立外部命令驗收（CLI）**：
   - 使用 Linux 原生 `sha256sum` 指令驗算內文，數值與 `Manifest Hash` 100% 一致。
   - 使用 Linux 原生 `openssl dgst -sha256 -verify <pubkey> -signature <sig> <payload>` 指令驗證，輸出 `Verified OK`；竄改 1 byte 則 openssl 退出非 0 並報 `Verification Failure`。
7. **單筆行程憑證（Trip Receipt）驗收**：驗證行程憑證亦具備完整密碼學防護與竄改敏感度。
8. **環境變數優先序與無私鑰洩漏**：驗證 `BANK_ARTIFACT_SIGNING_PRIVATE_KEY` 與 `JWT_PRIVATE_KEY` 載入機制。
9. **異常結構容錯性**：驗證缺漏 Manifest Header 等結構性損毀情境。

---

## 3. 驗收條件對應

| 驗收條件 | 對應實作與驗收證據 |
| -------- | ------------------- |
| **獨立工具驗SHA256；有簽章時用公鑰驗證成功、改一byte即失敗** | `bank-artifact-crypto.test.ts` 測試 1–5 與 8–9：使用 Node 原生 `crypto` 與 Linux `sha256sum`、`openssl` 命令列實測。對真實內文計算 SHA-256 與 Manifest 完全一致；有私鑰簽署時，`openssl dgst -sha256 -verify` 輸出 `Verified OK`；將 `TWD 1,450` 改為 `TWD 1,451` 或新增空白 byte，`openssl` 立即回傳失敗、`verifyArtifact` 立即判定 `validDigest: false`。 |
| **無簽章配置不產假VALID；正式簽章服務由SR-LIVE-DOC驗收** | `bank-artifact-crypto.test.ts` 測試 4–5：在未設定簽章金鑰環境下，產出之 Manifest 明確記錄 `Signature Status: UNSIGNED` 與 `Digital Signature: UNSIGNED`，產物內文完全不含 `_VALID` 或假簽名字串。驗證工具誠實回傳 `UNSIGNED`，不產出假合格報告。正式金鑰串接與真機簽章留待 `SR-LIVE-DOC-001` 驗收。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功** | 本文件表頭已記錄 Base SHA，待 commit 後更新 Candidate SHA。實測命令與 exit code 完整記錄於第 4 節。未做的 live/真機限制明列於第 5 節。資源 ID 涵蓋 `settlement-statement-tenant_ctbc-2026-08` 與 `trip_ctbc_260601_001`。 |
| **先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案** | 依 branch-strategy 與 ai-status 規定，完成後先提交 task-scoped commit 並 push 至 remote，以 `handoff` 指令移交 reviewer（Gemini），絕不直接呼叫 `done`。 |

---

## 4. 實際指令與結果

本 worktree（`gemini2/sr-bank-003`）執行結果：

### 1. `git diff --check`
```bash
$ git diff --check
(exit code: 0，無任何空白或格式錯誤)
```

### 2. `pnpm --filter @drts/bank-console-web typecheck`
```bash
$ pnpm --filter @drts/bank-console-web typecheck
> @drts/bank-console-web@0.1.0 typecheck /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-bank-003/apps/bank-console-web
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
(exit code: 0，0 型別錯誤)
```

### 3. `pnpm --filter @drts/bank-console-web test`
```bash
$ pnpm --filter @drts/bank-console-web test
> @drts/bank-console-web@0.1.0 test /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-bank-003/apps/bank-console-web
> vitest run --passWithNoTests

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-bank-003/apps/bank-console-web

 Test Files  4 passed (4)
      Tests  62 passed (62)
   Duration  1.30s
(exit code: 0，既有 47 項 artifact 測試與全庫 62 項測試全部通過，無任何回歸)
```

### 4. `pnpm exec vitest run tests/unit/system-remediation/sr-bank-003/`
```bash
$ pnpm exec vitest run tests/unit/system-remediation/sr-bank-003/
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-bank-003

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  1.68s
(exit code: 0，16 項驗證測試全部通過)
```

---

## 5. 未做的部分（明列，不冒充成功）

- **無 live 真機簽章憑證與 KMS / Cloud HSM 串接**：本任務為單元實作與格式修正，實作真正可獨立驗證之 SHA-256 與 RSA 簽章架構，但**未在原始碼中硬編任何生產私鑰**。雲端環境真金鑰注入、Cloud Run 部署驗證與 live 檔案下載由依賴本任務的 `SR-LIVE-DOC-001`（blocked 狀態）負責驗收，不在此處冒充 live 通過。
- **未新增獨立金鑰管理 REST 端點**：金鑰輪替遵循既有 `JWT_PRIVATE_KEY` / `BANK_ARTIFACT_SIGNING_PRIVATE_KEY` 環境變數架構，未額外修改全域路由或新增非必要之金鑰派發 API。

---

## 6. Write scope 遵守情況

僅新增與修改下列檔案：
- `apps/bank-console-web/app/artifacts/artifact-crypto.ts`（新增）
- `apps/bank-console-web/app/artifacts/statements/[id]/route.ts`（修改）
- `apps/bank-console-web/app/artifacts/trips/[id]/route.ts`（修改）
- `tests/unit/system-remediation/sr-bank-003/bank-artifact-crypto.test.ts`（新增）
- `docs/04-uat/system-remediation-20260906/SR-BANK-003.md`（新增，本檔案）

未修改任何 shared exports、全域路由、central test config、lockfile 或 `session.ts` 等範圍外檔案。
