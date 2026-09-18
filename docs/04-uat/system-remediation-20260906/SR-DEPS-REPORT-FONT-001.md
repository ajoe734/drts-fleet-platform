# SR-DEPS-REPORT-FONT-001 — 報表字型與獨立解析依賴

## 交付範圍

提供 SR-REPORT-001 可使用的字型與測試 parser；不修改 renderer、產品 API 或既有 dependency 版本。

- 字型：未修改的 Noto Sans CJK TC Regular，Sans2.004。
- 固定 upstream commit：`523d033d6cb47f4a80c58a35753646f5c3608a78`。
- [原始字型](https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf)。SHA256：`dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4`。
- [原始完整 OFL-1.1 授權](https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/LICENSE)。SHA256：`6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`。
- 原始字型內的 copyright metadata 保持完整，授權逐位元組保存為 `apps/api/assets/fonts/LICENSE`。OFL 允許隨軟體散布；字型不單獨販售，散布時保留此授權與原始 metadata。
- `provenance.json` 保存來源 URL、commit、release、授權及兩個檔案的 hash。
- Docker runtime 明確 COPY 字型、LICENSE 與 provenance 到 `/app/assets/fonts/`；沒有 host font 或啟動時下載要求。檔案均不受根 `.dockerignore` 的 Markdown 排除規則影響。

## Parent 使用方式

Runtime 固定絕對路徑：`/app/assets/fonts/NotoSansCJKtc-Regular.otf`。

若 API 以 repo 的 `apps/api` 為 cwd（本機）或 `/app` 為 cwd（runtime），可使用：

```ts
import path from "node:path";
const fontPath = path.resolve(
  process.cwd(),
  "assets/fonts/NotoSansCJKtc-Regular.otf",
);
doc.font(fontPath);
```

若測試從 repo 根目錄執行，使用 `path.resolve("apps/api/assets/fonts/NotoSansCJKtc-Regular.otf")`。Parent 必須明確選用此字型；本 dependency task 不代表目前 renderer 已完成接線。

測試 parser 是根 devDependency `pdfjs-dist`，固定 `6.3.289`，其 Node engine 為 `>=22.13.0 || >=24`。標準 Node ESM import：

```ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const task = getDocument({
  data: new Uint8Array(pdfBuffer),
  useSystemFonts: false,
  disableFontFace: true,
  isEvalSupported: false,
});
try {
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  // Read text items' str; iterate every page for complete report verification.
} finally {
  await task.destroy();
}
```

PDF.js 的必要 optional canvas 平台套件隨 lockfile 新增；既有套件版本、完整 resolution 與 snapshot 均不變。parser 只用於開發測試，API production dependency 不新增 parser。

## 本機驗證（2026-09-09）

環境：Node `v22.23.2`、pnpm `10.33.0`、Vitest `4.1.4`。先移除本 isolated worktree 中指向 canonical 的 node_modules symlink，使用 worktree 自己的 node_modules 安裝；未透過 symlink 修改 canonical 依賴。

- `pnpm exec vitest run tests/unit/system-remediation/sr-deps-report-font-001/ --no-file-parallelism --maxConcurrency=1`：4/4 通過。
- 測試以既有 PDFKit 產生 372 行多頁 PDF；PDF.js 抽出每一行後與全部來源嚴格相等，末頁含 `長尾驗證末筆龜山區臺灣繁體中文王小明END-0371`。
- 負向測試使用 Helvetica，同一 parser 無法還原王小明中文與 sentinel，避免自製 hex 猜字掩蓋問題。
- 字型與完整授權 hash、固定來源及 runtime COPY 路徑檢查通過。
- ESLint（此測試檔）、frozen-lockfile install、`git diff --check` 通過。
- 結構比對 origin/dev 的 package.json 與 lockfile：所有原有 manifest 欄位、importer、package resolution、snapshot 不變。

## 整合與驗收界線

本 VM 不執行 Docker、Compose、API 或 browser server。上述 COPY 驗證是靜態測試，並非 Alpine image 執行證據；映像執行證據須由 GitHub CI 提供。

提交後以 final candidate SHA 普通 push、開 PR 並交給 Codex2。只有同 SHA review、CI 與 merge evidence 齊備後，candidate lifecycle 才可向 SR-REPORT-001 提供依賴完成證據；此文件不宣告 parent 或本任務已 done。
