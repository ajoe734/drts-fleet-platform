# SR-DEPS-001 — 共用依賴與 lockfile 單一寫入：完成證據

- Task: `SR-DEPS-001`
- Owner: `Claude`
- Reviewer: `Claude2`
- Base SHA (`origin/dev` at start): `afefd55d3d23dd361d2dd81fd5f80eedb6671002`
- Worktree: `.artifacts/worktrees/auto/claude-sr-deps-001`
- Branch: `claude/sr-deps-001`

## 1. 現況盤點（fix前）

在新增任何套件前，先確認 repo 內完全沒有可用的 PDF/XLSX 產生器：

- `grep -rniE '"(pdfkit|pdf-lib|puppeteer|jspdf|@react-pdf/renderer|exceljs|xlsx|node-xlsx|sheetjs)"' --include=package.json` — 全 repo 0 筆結果。
- `pnpm-lock.yaml` 內同樣搜尋 — 0 筆結果（不是「已解析但沒人用」的情況，是完全缺）。
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts` 第 303-333 行的 `reportArtifactRenderers` 明確記錄了這個缺口：

  ```ts
  /**
   * xlsx and zip would need a new dependency; pdf needs a generic table writer
   * rather than the certificate-shaped one in `certificate-support`. None of
   * them is hard, and none of them is done, so none of them is offered.
   */
  private readonly reportArtifactRenderers: Record<...> = {
    csv: { ... },
    xlsx: null,
    pdf: null,
    zip: null,
  };
  ```

  這與追溯來源 `N05`／`C091` 描述的缺口（一般報表沒有 PDF/Excel renderer，僅 CSV 已實作）完全對應。

- 消費方確認：`SR-REPORT-001`（一般報表 PDF/XLSX）、`SR-INVOICE-001`（帳單 PDF）、`SR-PLACARD-001`（牌貼可列印檔）都需要真 PDF 產生能力；三者都不在自己的 write scope 內碰 `package.json`／`pnpm-lock.yaml`，主執行規則第 4 條明訂「`package.json`／lockfile 由 SR-DEPS」單一負責。`SR-BANK-003` 只需要 Node 內建 `crypto`（SHA-256／簽章驗證），不需要新依賴。

結論：PDF/XLSX 產生能力**真的缺**，不是重複造輪子；本 task 是唯一被授權新增這兩類依賴的地方。

## 2. 選型與授權來源

| 套件            | 版本      | 授權 | 用途                                                                       | 依賴足跡                                                                                        |
| --------------- | --------- | ---- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pdfkit`        | `^0.20.2` | MIT  | 純 JS PDF 產生（文字/表格 writer），無 headless browser、無 native binding | `fflate`, `png-js`, `fontkit`, `linebreak`, `@noble/hashes`, `@noble/ciphers`                   |
| `@types/pdfkit` | `^0.17.6` | MIT  | `pdfkit` 型別宣告（pdfkit 本身不隨附型別）                                 | —                                                                                               |
| `exceljs`       | `^4.4.0`  | MIT  | 純 JS XLSX 讀寫（workbook/worksheet API），已附 `index.d.ts`               | `archiver`, `unzipper`, `fast-csv`, `dayjs`, `saxes`, `jszip`, `tmp`, `uuid`, `readable-stream` |

排除的替代方案：

- `puppeteer`／headless Chromium 轉 PDF：會引入完整瀏覽器二進位檔，違反 task 的「不重複增加大依賴」要求，且 `reporting-filing.service.ts` 的既有註解已明確指出只需要「generic table writer」，不需要 HTML 渲染引擎。
- `xlsx`（SheetJS）：近期版本把 npm registry 上的套件與其 CDN 上的「完整版」拆開，registry 版本更新滯後且曾有 prototype-pollution 類型的歷史安全公告；`exceljs` 是目前 registry 上維護中、無此顧慮的等價選擇。
- `@react-pdf/renderer`：會把 `react`／`react-reconciler` 拉進後端 `apps/api`（目前完全不含 React 依賴），對一個純後端 table/text PDF 需求來說過重。

## 3. 實際變更

僅碰觸本 task 的 write scope：

- `package.json`（根）：`devDependencies` 新增 `pdfkit`、`@types/pdfkit`、`exceljs`（沿用既有 `jsonwebtoken`／`@types/jsonwebtoken` 同時存在於根與 `apps/api` 的既有模式，讓 root-level 測試也能 resolve）。
- `apps/api/package.json`：`dependencies` 新增 `pdfkit`、`exceljs`；`devDependencies` 新增 `@types/pdfkit`。
- `pnpm-lock.yaml`：以 `pnpm install`（非 frozen）重新產生，再以 `pnpm exec prettier --write pnpm-lock.yaml` 還原 repo 既有的雙引號 quote-style（`.prettierrc` 的 `singleQuote: false`；lockfile 平常由 `lint-staged` 的 `prettier --write` 規則維持這個風格）。最終 diff 是**純新增、零刪除**：724 行新增，涵蓋 `pdfkit`／`exceljs` 及其遞移依賴，其餘既有套件版本未被牽動。
- 新增 `tests/unit/system-remediation/sr-deps-001/dependency-availability.test.ts`：對兩個新依賴各自做一次「產生真 bytes、可被解析」的迴歸測試（不是 fixture）。
- 新增本文件 `docs/04-uat/system-remediation-20260906/SR-DEPS-001.md`。

未修改 `apps/api/src/modules/reporting-filing/*`、`apps/tenant-console-web/*`、`apps/platform-admin-web/*` 等任何 renderer 或呼叫端程式 — 那些是 `SR-REPORT-001`／`SR-INVOICE-001`／`SR-PLACARD-001` 的 write scope，本 task 不越界。

## 4. 驗證指令與結果（在 worktree 內執行，逐一附 exit code）

```text
$ pnpm install --no-frozen-lockfile   # 新增依賴後首次刷新 lockfile
Done in 10.6s using pnpm v10.33.0
exit code: 0

$ pnpm exec prettier --write pnpm-lock.yaml   # 還原 repo quote-style，diff 從 14668 行變 724 行純新增
pnpm-lock.yaml 4801ms
exit code: 0

$ git diff --stat
 apps/api/package.json |   3 +
 package.json          |   3 +
 pnpm-lock.yaml        | 724 ++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 730 insertions(+)

$ pnpm install --frozen-lockfile   # 驗收條件：pnpm frozen-lockfile 能安裝
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 2.5s using pnpm v10.33.0
exit code: 0

$ pnpm --filter @drts/contracts build   # apps/api 的既有 prebuild 前置步驟（與本 task 無關的既有需求）
exit code: 0

$ pnpm --filter @drts/control-plane-auth build
exit code: 0

$ pnpm --filter @drts/api typecheck   # 驗收條件：API typecheck 通過
> tsc -p tsconfig.json --noEmit
exit code: 0

$ pnpm typecheck:root   # 根 tsconfig 也涵蓋新測試檔
> tsc -p tsconfig.json --noEmit
exit code: 0

$ pnpm lint:root   # 新測試檔通過既有 lint 規則（max-warnings=0）
exit code: 0

$ git diff --check   # 無空白錯誤
exit code: 0

$ pnpm exec vitest run tests/unit/system-remediation/sr-deps-001/
 Test Files  1 passed (1)
      Tests  2 passed (2)
exit code: 0
```

## 5. 未做/明列排除

- 沒有修改 `reporting-filing.service.ts` 的 `reportArtifactRenderers`（`xlsx`/`pdf` 仍是 `null`）— 實際把 renderer 接上是 `SR-REPORT-001`（已將 `SR-DEPS-001` 列為前置任務）的工作，本 task 只保證依賴「存在且真的能產生可解析 bytes」。
- 沒有做任何 live／真機驗證（本 task 性質上不涉及外部服務、真實憑證或雲端資源，無 live gate 適用）。
- 未新增 `zip` 格式所需依賴 — 目前沒有 task 引用 zip 輸出的具體需求；若後續 task 需要，應回到本 task 的 follow-up 補依賴，而不是由消費端自行加。

## 6. 資源 ID

- Registry 來源：`https://registry.npmjs.org/`（`pnpm config get registry` 確認）。
- 已解析版本：`pdfkit@0.20.2`、`@types/pdfkit@0.17.6`、`exceljs@4.4.0`（見 `pnpm-lock.yaml` diff 內對應的 `packages:` 條目與 `resolution.integrity` 雜湊）。
