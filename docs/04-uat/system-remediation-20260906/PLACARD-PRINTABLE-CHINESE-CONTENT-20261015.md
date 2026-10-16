# PLACARD-PRINTABLE-CHINESE-CONTENT-20261015 UAT & Remediation Evidence

- **Task ID**: `PLACARD-PRINTABLE-CHINESE-CONTENT-20261015`
- **Parent / Related Tasks**: `SR-PLACARD-001`, `SR-ARTIFACT-001`, `SR-QA-REPORTS-001` (`C097` / `C097-F1`)
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/placard-printable-chinese-content-20261015-clean` (superseding `gemini/placard-printable-chinese-content-20261015` `f184fe8ca90f8999f917949b19f8900ddd0709af`, which remains preserved on remote)
- **Base SHA (`origin/dev`)**: `dc2775838f2d058dc1edaea7b21ba65dbe27414a` (initial reproduction against `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`)
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

| Finding／驗收項                                                          | 原始碼依據與修改位置                                                                                                                                                | 舊版重現 → 修正版結果                                                                                                                                                                                                                            | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                                                                                                                     | 未驗項與具體限制                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `C097-F1` / `placard-printable_actual-original-Chinese-content-readable` | `apps/api/src/modules/platform-admin/platform-admin.service.ts:77` & `apps/api/src/modules/platform-admin/placard-pdf.renderer.ts:234-267` (`buildPlacardPdfRows`)  | 舊版（`6dfff99fc`）：`pdfjs-dist` 自 `ControlledDownloadController` 抽出 `Public Info Source: 2026 Q2 ?????`、`Call Rate: ????`、`Fare Rule: ??????????`、`Payment Methods: ???????????`（Exit `1`，4 failed） → 修正版：完整抽出中文 `2026 Q2 公開資訊版`、`依表計費`、`夜間與偏遠加成依公告`、`現金、信用卡、企業簽單` 與新發布花蓮公告，無 `????`（Exit `0`，7 passed） | `pnpm exec vitest run tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts tests/unit/system-remediation/sr-placard-001/placard-pdf-content.test.ts` → Exit `0`（7 passed, 0 failed, 0 skipped）；證據見本文件 §4–§5                                                                       | 已由 socket-free `ControlledDownloadController` + `pdfjs-dist` 完整覆蓋；雲端部署環境另由原任務追蹤 |
| `placard-printable_real-bytes-font-and-encoding-consistency`             | `apps/api/src/modules/platform-admin/placard-pdf.renderer.ts:35-219` (`buildMinimalPdf`, `buildToUnicodeCMapStream`, `buildPdfPageContentStream`)                   | 舊版（`6dfff99fc`）：僅單一 `/Type1 /BaseFont /Helvetica` 無 `/ToUnicode` CMap，多行 `fareText` 未展開導致 `pageCount=1`（Exit `1`） → 修正版：雙字型 `/F1` Helvetica + `/F2` `/Type0 /MSung-Light /Identity-H` + `/CIDFontType0 /DW 400` + `/ToUnicode` CMap，全部 `xref` offset、`trailer`、`%%EOF`、`(` / `)` / `\` 跳脫與跨頁分頁（`pageCount=2`）驗證通過（Exit `0`） | `pnpm exec vitest run tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts` → Exit `0`（4 passed, 0 failed, 0 skipped）；證據見 `tests/unit/placard-printable-chinese-content-20261015/placard-printable-chinese-content.test.ts:104-189,333-427`                                         | 無（本機 `pdfjs-dist` 與獨立 PDF xref/CMap parser 均已驗證）                                     |
| `placard-printable_original-refresh-version-auth-expiry-regressions`     | `apps/api/src/modules/platform-admin/platform-admin.service.ts:81-84,3030-3165` & `tests/unit/system-remediation/sr-placard-001/placard-download-lifecycle.test.ts` | 舊版（`6dfff99fc`）：ASCII lifecycle 通過但中文真 PDF 退化為 `?` → 修正版：15 分鐘 TTL 到期續簽維持相同 `artifactManifestHash`/bytes 並重簽新 URL、`publishPlacardVersion` 重新渲染與備份、以及 `410`/`403`/`404`/`409`/`401` 負向拒絕全數維持且中文可讀（Exit `0`） | `pnpm exec vitest run tests/unit/system-remediation/sr-placard-001/placard-download-lifecycle.test.ts tests/unit/system-remediation/sr-qa-reports-001/c097-placard-printable-download.test.ts tests/unit/system-remediation/sr-qa-reports-001/c094-c096-public-info-placards-governance.test.ts tests/unit/audit-artifact-durability-20261002.test.ts` → Exit `0`（106 passed across 6 suites） | 無（全部 socket-free 生命週期與負向授權回歸均已執行通過）                                         |
| `placard-printable_exact-candidate-validation`                           | `apps/api/src/modules/platform-admin/placard-pdf.renderer.ts`, `apps/api/src/modules/platform-admin/platform-admin.service.ts`, `tests/unit/**`, `docs/04-uat/**`   | 舊候選 `f184fe8ca90f` 於 PR #2692 CI Job `Commit trailers`（`116584325352`）因 commit subject `fix(platform-admin): ...` 未以 `<TASK-ID>: ` 開頭而失敗（Exit `1`） → 新候選保留原分支不 force-push，於乾淨分支 `gemini/placard-printable-chinese-content-20261015-clean` 以 `PLACARD-PRINTABLE-CHINESE-CONTENT-20261015: ...` subject 與完整 trailers 提交，通過 `check_commit_trailers.py` 與全部本地檢查（Exit `0`） | `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD && pnpm --filter @drts/api typecheck && pnpm lint:root && git diff --check` → Exit `0`（0 errors）                                                                                                                                                         | Hosted GitHub Actions `ci.yml` 於新候選 PR 觸發並由 GitHub bus 回收                              |

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
