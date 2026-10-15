# PLACARD-PRINTABLE-CHINESE-CONTENT-20261015 UAT & Remediation Evidence

- **Task ID**: `PLACARD-PRINTABLE-CHINESE-CONTENT-20261015`
- **Parent / Related Tasks**: `SR-PLACARD-001`, `SR-ARTIFACT-001`, `SR-QA-REPORTS-001` (`C097` / `C097-F1`)
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/placard-printable-chinese-content-20261015`
- **Base SHA (`origin/dev`)**: `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`
- **Date**: `2026-10-15`

---

## 1. Problem Statement & Root Cause (`C097-F1`)

Per `docs/04-uat/system-remediation-20260906/SR-QA-REPORTS-001.md` (`C097-F1`) and `.local/goal-continuation-20261015T1114-internal-functional-root/C097-C098-current-accepted-placard-certificate-dataflow-readonly-audit.json`:

1. `PlatformAdminService` in `apps/api/src/modules/platform-admin/platform-admin.service.ts` previously rendered vehicle placards via a local `toPdfAsciiText(value)` helper (`value.replace(/[^\x20-\x7e]/g, "?")`) inside both `buildPlacardPdfRows` and `buildPdfPageContentStream`, using only a single `/Type1 /BaseFont /Helvetica` font (`/F1`).
2. Consequently, every Traditional Chinese character in canonical `PUBLIC_INFO_SEED` (`title: "2026 Q2 公開資訊版"`, `callRateText: "依表計費"`, `fareText: "夜間與偏遠加成依公告"`, `paymentMethodText: "現金、信用卡、企業簽單"`) and in newly created/published Chinese `PublicInfoVersionRecord` disclosures was replaced with literal `?` characters in the actual printable PDF bytes returned by `ControlledDownloadController.resolve("placard", ...)`.
3. Meanwhile, `tests/unit/system-remediation/sr-placard-001/placard-pdf-content.test.ts` previously documented `// Non-ASCII characters are replaced with '?' rather than corrupting PDF literal strings` and only asserted ASCII lines (`Version Code`, `Booking / Dispatch Phone`, `Customer Complaint Hotline`, `Effective Period`) on the CJK test case.

---

## 2. Remediation Summary & Write Scope

All changes are strictly confined to the assigned `write_scopes`:

1. `apps/api/src/modules/platform-admin/placard-pdf.renderer.ts` (New module):
   - Extracted and upgraded the dependency-free PDF-1.4 placard renderer (`buildPlacardPdfRows`, `buildMinimalPdf`, `buildPdfPageContentStream`, `chunkPdfLines`, `escapePdfLiteralText`, `sanitizePdfLineText`, `isPdfPrintableAscii`).
   - Preserves `/F1` (`/Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding`) and literal `(...) Tj` strings (with `\`, `(`, `)` escaping) for pure printable ASCII lines, maintaining full byte-stream compatibility with existing ASCII/lifecycle assertions.
   - Adds `/F2` (`/Type /Font /Subtype /Type0 /BaseFont /MSung-Light /Encoding /Identity-H /DescendantFonts [...] /ToUnicode ...`) backed by `/CIDFontType0` (`/Registry (Adobe) /Ordering (CNS1) /Supplement 7 /DW 400`) and a deterministic `/ToUnicode` CMap stream (`beginbfchar ... endbfchar`) for lines containing Chinese / Unicode characters, rendered as `<...> Tj` big-endian hex glyph codes.
   - Expands multi-line disclosure text (`\r?\n`) across `PLACARD_PDF_LINES_PER_PAGE = 40` page chunks while keeping all PDF object streams 7-bit ASCII so `xref` offsets, `startxref`, `trailer`, `%%EOF`, and SHA-256 `artifactManifestHash` remain deterministic and exact.
2. `apps/api/src/modules/platform-admin/platform-admin.service.ts`:
   - Replaced the local `toPdfAsciiText`-based PDF helper functions with `import { buildMinimalPdf, buildPlacardPdfRows } from "./placard-pdf.renderer"`, without touching any `createPlatformPricingRule` / `publishPlatformPricingRule` or `updatePlatformAdapter` logic.
3. `tests/unit/system-remediation/sr-placard-001/placard-pdf-content.test.ts`:
   - Updated `extractPdfTextLines` to decode both `(...) Tj` literal strings and `<...> Tj` hex strings via the embedded `/ToUnicode` CMap, and updated the CJK and seed tests to assert that real Chinese `title`, `callRateText`, `fareText`, and `paymentMethodText` strings are preserved without `????` replacement.
4. `tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts`:
   - Added socket-free unit and real PDF parser (`pdfjs-dist` `getDocument` -> `getPage` -> `getTextContent` + structural PDF-1.4 `xref`/`trailer`/`/ToUnicode` CMap validator) tests covering:
     - Canonical seed `placard-demo-001` (`public-info-demo-001`) end-to-end download via `ControlledDownloadController`.
     - Newly created & published Chinese `PublicInfoVersionRecord` (`createPublicInfoVersion` -> `publishPublicInfoVersion` -> `generatePlacardVersion` -> `publishPlacardVersion` -> `ControlledDownloadController.resolve`).
     - Escaped parentheses/backslashes (`(`, `)`, `\`) and >40-line multi-page Chinese content pagination across multiple PDF pages.
     - Link expiry renewal (same `artifactManifestHash`/bytes, new `signedAt`/`expiresAt`/`sig`), `publishPlacardVersion` re-render (`Published At: Draft` -> timestamp with new hash), and honest negative denials (expired URL `410`, tampered `sig` `403`, wrong `manifest_hash` `403`, wrong resource kind `403`, missing artifact `404`, unpublished/retired source `409`, duplicate `versionCode` `409`, unauthenticated `publishPlacardVersion` `401`).

---

## 3. §0.7 Item-by-Item Remediation & Acceptance Matrix

| 缺陷/驗收項 ID                                                           | 根因定位（檔案:行號 / 模組）                                                                                                                                        | 修改摘要                                                                                                                                                                                                                                                                                                 | 重現/驗證命令                                                                                                                                                                                                                                                                                                                                          | 修正前輸出與 Exit Code                                                                                                                                                         | 修正後輸出與 Exit Code                                                                                                                                                                  | 結論（PASS/BLOCKED） |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `C097-F1` / `placard-printable_actual-original-Chinese-content-readable` | `apps/api/src/modules/platform-admin/platform-admin.service.ts:101-130,181-210` (`toPdfAsciiText`, `buildPlacardPdfRows`, `buildPdfPageContentStream`)              | 移除 `toPdfAsciiText` 的 `?` 替換邏輯，改由 `placard-pdf.renderer.ts` 保留原始中文公開資訊（`PUBLIC_INFO_SEED` 與新建立/發布之 `PublicInfoVersionRecord` 的 `title`、`callRateText`、`fareText`、`paymentMethodText`、中文標點、數字與電話）並透過 `/F2` `<...> Tj` + `/ToUnicode` CMap 寫入真 PDF bytes | `pnpm exec vitest run tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts tests/unit/system-remediation/sr-placard-001/placard-pdf-content.test.ts`                                                                                                                                                        | Exit `1`: `pdfjs-dist` 抽出 `Public Info Source: 2026 Q2 ????? (public-info-demo-001)`, `Call Rate: ????`, `Fare Rule: ??????????`, `Payment Methods: ???????????`（4 failed） | Exit `0`: `pdfjs-dist` 與 `/ToUnicode` CMap 抽出完整中文 `2026 Q2 公開資訊版`、`依表計費`、`夜間與偏遠加成依公告`、`現金、信用卡、企業簽單` 及新發布花蓮中文公告，無 `????`（7 passed） | `PASS`               |
| `placard-printable_real-bytes-font-and-encoding-consistency`             | `apps/api/src/modules/platform-admin/placard-pdf.renderer.ts:35-210` (`buildMinimalPdf`, `buildToUnicodeCMapStream`, `buildPdfPageContentStream`)                   | 實作雙字型 PDF-1.4 writer（`/F1` Helvetica `/WinAnsiEncoding` + `/F2` `/Type0` `/MSung-Light` `/Identity-H` + `/CIDFontType0` `/DW 400` + `/ToUnicode` CMap），支援 `(` / `)` / `\` 跳脫與 `>40` 行跨頁分頁，且維持精確 `xref` byte offsets、trailer、`%%EOF` 與 SHA-256 `artifactManifestHash`          | `pnpm exec vitest run tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts`                                                                                                                                                                                                                                 | Exit `1`: 舊 PDF 僅含單一 `/Type1 /BaseFont /Helvetica` 無 `/ToUnicode` CMap，且 `buildPlacardPdfRows` 未展開多行 `fareText`（pageCount 為 `1` 而非 `2`）                      | Exit `0`: 驗證全部 `xref` offset 精確指向 `<id> 0 obj`、`/ToUnicode` CMap 完整映射所有非 ASCII 字元、`pdfjs-dist` 跨 2 頁完整抽出第 1–45 區段中文費率與 `(A\B)` 跳脫字元（4 passed）    | `PASS`               |
| `placard-printable_original-refresh-version-auth-expiry-regressions`     | `apps/api/src/modules/platform-admin/platform-admin.service.ts:81-84,3151-3164` & `tests/unit/system-remediation/sr-placard-001/placard-download-lifecycle.test.ts` | 保持 `DocumentArtifactStore`、15 分鐘 TTL 到期續簽（同 bytes/hash 重簽新 URL）、`publishPlacardVersion` 重新渲染與備份、以及過期/竄改/錯誤 resource/未發布或 retired source/重複版本/未授權等拒絕契約完全不變                                                                                            | `pnpm exec vitest run tests/unit/system-remediation/sr-placard-001/placard-download-lifecycle.test.ts tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts tests/unit/audit-artifact-durability-20261002.test.ts` | 修正前既有 ASCII lifecycle 測試通過，但中文內容在真 PDF 中退化為 `?`                                                                                                           | Exit `0`: 全部既有 lifecycle、controlled-download、governance 與 durability 測試（106 tests across 6 suites + `@drts/api` unit tests）全數通過，且續簽與發布後中文內容保持可讀          | `PASS`               |
| `placard-printable_exact-candidate-validation`                           | `apps/api/src/modules/platform-admin/placard-pdf.renderer.ts`, `apps/api/src/modules/platform-admin/platform-admin.service.ts`, `tests/unit/**`, `docs/04-uat/**`   | 在專屬 worktree `gemini/placard-printable-chinese-content-20261015` 完成最小邊界修復、typecheck、lint、socket-free PDF 測試與 UAT 證據記錄，無啟動任何 VM server                                                                                                                                         | `pnpm --filter @drts/api typecheck && pnpm lint:root && git diff --check`                                                                                                                                                                                                                                                                              | N/A（新增驗證）                                                                                                                                                                | Exit `0`: `@drts/api` typecheck、root lint 與 `git diff --check` 全部 0 errors                                                                                                          | `PASS`               |

---

## 4. Exact Before-Repair Reproduction Evidence (Base SHA `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`)

Executed against unmodified `apps/api/src/modules/platform-admin/platform-admin.service.ts` at Base SHA `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`:

- **Command**:
  ```bash
  pnpm exec vitest run tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts
  ```
- **Exit Code**: `1` (`4 failed (4)`)
- **Key Failure Output**:

  ```text
  FAIL tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts > PLACARD-PRINTABLE-CHINESE-CONTENT-20261015: printable placard PDF preserves readable Chinese public-info content > preserves readable Chinese title, call rate, fare rule, and payment methods in the canonical seed placard PDF via ControlledDownloadController
  AssertionError: expected 'Vehicle Service Placard\n============…' to contain 'Public Info Source: 2026 Q2 公開資訊版 (pu…'

  - Expected:
    Public Info Source: 2026 Q2 公開資訊版 (public-info-demo-001)
  + Received (extracted via pdfjs-dist from ControlledDownloadController stream):
    Vehicle Service Placard
    ========================================
    Version Code: placard-2026-q2
    Placard ID: placard-demo-001
    Template: seatback-default
    Public Info Source: 2026 Q2 ????? (public-info-demo-001)
    Source Status: published
    Booking / Dispatch Phone: 0800-000-123
    Customer Complaint Hotline: 0800-000-456
    Call Rate: ????
    Fare Rule: ??????????
    Payment Methods: ???????????
    Effective Period: 2026-04-01T00:00:00.000Z to indefinite
    Published At: 2026-04-01T00:00:00.000Z
    Generated At: 2026-04-01T00:00:00.000Z
    ========================================
  ```

---

## 5. Exact After-Repair Verification Evidence

### 5.1 Socket-Free Printable PDF & Lifecycle Regression Suites

- **Command**:
  ```bash
  pnpm exec vitest run \
    tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts \
    tests/unit/system-remediation/sr-placard-001/placard-pdf-content.test.ts \
    tests/unit/system-remediation/sr-placard-001/placard-download-lifecycle.test.ts \
    tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts \
    tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts \
    tests/unit/audit-artifact-durability-20261002.test.ts
  ```
- **Exit Code**: `0`
- **Output Summary**:

  ```text
  ✓ tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts (5 tests)
  ✓ tests/unit/system-remediation/sr-placard-001/placard-pdf-content.test.ts (3 tests)
  ✓ tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts (6 tests)
  ✓ tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts (4 tests)
  ✓ tests/unit/system-remediation/sr-placard-001/placard-download-lifecycle.test.ts (7 tests)
  ✓ tests/unit/audit-artifact-durability-20261002.test.ts (81 tests)

  Test Files  6 passed (6)
       Tests  106 passed (106)
  ```

### 5.2 Package Unit Test, Typecheck, and Lint Verification

- **Commands & Exit Codes**:
  - `pnpm --filter @drts/api typecheck` -> Exit `0`
  - `pnpm --filter @drts/api test -- platform-admin.service.test.ts` -> Exit `0`
  - `pnpm lint:root` -> Exit `0`
  - `git diff --check` -> Exit `0`

---

## 6. Scope & Boundary Declaration

- **Modified / Added Files**:
  - `apps/api/src/modules/platform-admin/placard-pdf.renderer.ts`
  - `apps/api/src/modules/platform-admin/platform-admin.service.ts`
  - `tests/unit/system-remediation/sr-placard-001/placard-pdf-content.test.ts`
  - `tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts`
  - `docs/04-uat/system-remediation-20260906/PLACARD-PRINTABLE-CHINESE-CONTENT-20261015.md`
- **Non-Goals / Preserved Boundaries**:
  - No VM dev/preview/browser/Docker server was started (`AGENTS.md` VM restriction strictly respected).
  - No changes were made to shared `DocumentArtifactStore`, HMAC signature policy, guards/authorization, pricing rules (`PRICING-DRAFT-AND-PUBLISH-REASON-20261015`), or adapter registry logic (`ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015`).
  - Deployed cloud runtime verification and broader `C098` / full-134 acceptance remain governed by their own respective tasks.
