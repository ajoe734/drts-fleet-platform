# SR-REPORT-001 — 接手實作與阻塞證據

## 2026-09-08 18:01 UTC history-repair resume（最新）

- Owner Codex2 / reviewer Codex。`git fetch origin` 與 `git rebase origin/dev` exit 0；base `fa0fd8257950764526a522d091be9d97effa82b9`，受驗 implementation HEAD `5017b7bcc09e1e5f9c6489b5e51555417a0b4827`。本輪只補證據，candidate 尚未鎖定，未 handoff。
- `git diff --check origin/dev...HEAD`、`pnpm --filter @drts/api typecheck`、`pnpm --filter @drts/ops-console-web typecheck` 均 exit 0。
- `pnpm exec vitest run tests/unit/system-remediation/sr-report-001/` exit 0，9 passed。
- `SR_REPORT_EVIDENCE_DIR=/tmp/sr-report-001-resume-1800 pnpm exec vitest run tests/unit/system-remediation/sr-report-001/ tests/unit/reporting-filing.test.ts` exit 1：35 passed / 4 failed / 2 unhandled rejections。中央測試仍同步讀 async download、同步斷言 rejection，並要求 PDF/XLSX 拒絕；本輪未越 scope 修改。
- `/tmp/sr-report-001-dispatch-venv/bin/python tests/unit/system-remediation/sr-report-001/verify-artifacts.py /tmp/sr-report-001-resume-1800` exit 0；filtered PDF 1 頁 / 1 筆、wide PDF 35 頁 / 55 筆，CSV 與來源一致；XLSX 由 Vitest ExcelJS 解析。另一次嘗試讀取 manifest.json exit 1（檔名不存在），資源資料以 parser 實際輸出為準。
- 本輪 in-memory 資源：CSV `JOB-ad300e52-06c9-435c-8083-d356cdce0e1f` / `ART-0fd77a6a-a02a-4e98-8a74-05f2b9f8dec6`；XLSX `JOB-1debc4c8-9efb-41ac-9bab-e692a92340a1` / `ART-e29f8db4-c8de-4d78-8c34-f703a28c41c8`；PDF `JOB-2794c02a-4e89-48b3-99f7-c13853e194e5` / `ART-d166b740-cd99-4ae2-818b-841124522254`。共同篩選 2026-09-01 至 2026-09-30，皆一筆 general row。
- 已讀合併的 history repair 與 planning decision：前者提供普通 push 到 codex2/sr-report-001-rebased 的 continuation rail，後者明示它不授權共用檔案。保持 assigned cwd / task branch，將本輪 anchor 推到該 continuation remote branch，保留原遠端歷史；push 結果與 SHA 寫 machine truth。
- **仍需 supervisor 處理**：把 packages/contracts/src/index.ts 的格式常數及 tests/unit/reporting-filing.test.ts 的相關 assertions 納入 reviewed write scopes 並加入 writer dependencies，或安排已登錄的共用 producer。本輪 task slice 仍沒有此授權。共享宣告仍 CSV-only，UI 仍引用該常數；history repair 不能解決此 acceptance blocker。
- 未執行 Unicode 字型部署、live HTTP、DB、瀏覽器、真機、CI 或 merge/deploy 驗收，不宣稱已完成。

## 2026-09-08 17:49 UTC dispatch 重驗（最新）

- 本輪 owner Codex2 / reviewer **Codex**，取代下方歷史 reviewer；依賴 SR-ARTIFACT-001、SR-DEPS-001 machine status 均為 done。
- `git fetch origin`、`git rebase origin/dev` 均 exit 0。本輪 base：`2a093872d05a7d0344adf9bb58f9e5c4c99861d1`；重驗 implementation head：`a419c814b`。candidate 尚未鎖定，沒有 handoff。
- `pnpm --filter @drts/api typecheck`、`pnpm --filter @drts/ops-console-web typecheck`、`git diff --check` 均 exit 0。
- `pnpm exec vitest run tests/unit/system-remediation/sr-report-001/` exit 0，9 passed。
- `SR_REPORT_EVIDENCE_DIR=/tmp/sr-report-001-dispatch-1749 pnpm exec vitest run tests/unit/system-remediation/sr-report-001/ tests/unit/reporting-filing.test.ts` exit 1，35 passed / 4 failed / 2 unhandled rejections。仍是共用測試的同步下載斷言及 PDF/XLSX 必須拒絕的舊預期。
- 舊暫存 parser venv 不存在（exit 127），系統也無 pypdf（exit 1）；重新執行 `python3 -m venv /tmp/sr-report-001-dispatch-venv && /tmp/sr-report-001-dispatch-venv/bin/pip -q install pypdf==6.17.0 && /tmp/sr-report-001-dispatch-venv/bin/python tests/unit/system-remediation/sr-report-001/verify-artifacts.py /tmp/sr-report-001-dispatch-1749` exit 0：filtered PDF 1 頁 / 1 筆、wide PDF 35 頁 / 55 筆，empty PDF 可解析；CSV 與 manifest 一致。XLSX 由本輪 Vitest 解析。
- 本輪 in-memory 資源：CSV `JOB-7e66aed2-9dda-425f-8db5-b786f93bc914` / `ART-772121eb-1e7a-48a2-a608-f30225acfc1b`；XLSX `JOB-2bcdef3f-a7b2-4d5d-8444-967d7553283a` / `ART-18cbc0af-0ec0-485a-a583-dbae203fd925`；PDF `JOB-09e32d13-3c7a-4dc6-8e35-3c0dbea9b52d` / `ART-99747165-8b4c-4f84-8537-b09f2d1ed4ef`。共同篩選 2026-09-01 至 2026-09-30，三者同一筆 general row。
- 本輪未修改產品程式。`packages/contracts/src/index.ts:5525` 仍只宣告 CSV，Ops picker 仍引用它；需 supervisor 授權該常數與 `tests/unit/reporting-filing.test.ts` 的 scope 並協調 SR-CONTRACT-001 相依，才可完成宣告與既有回歸。中文字型部署仍未交付；本輪未跑 Unicode、live HTTP、DB、瀏覽器、真機、CI 或部署驗收。
- 遠端 task branch 為 `f95532988616389fc40ee794f9eef23d05ea14c0`，不是 rebase 後 HEAD 的 ancestor（`git merge-base --is-ancestor origin/codex2/sr-report-001 HEAD` exit 1）。普通 push 結果另寫 machine progress/blocker；不得 force push 或把 WIP 當 candidate。

下方為前輪歷史紀錄，SHA、資源與結果不代表本輪執行。

- Owner：Codex2；Reviewer：Claude。
- 起點／本次 `origin/dev` base：`69c519702047862212bc0e4890350e6b58917062`。
- 分支：`codex2/sr-report-001`；沿用 supervisor 指定 isolated worktree。
- 舊 candidate：`f26dc70a6dc27084f073483a1601976fac74f153`，PR [#1697](https://github.com/ajoe734/drts-fleet-platform/pull/1697)。舊 candidate 未合入本次 base。
- 本次已驗證的 implementation anchor：`73b91900d3617ccabebea12f76590c10e8f4755c`，已普通 push 到 origin。
- 新 candidate SHA：**尚未鎖定**。本次是可恢復的 WIP，未 handoff，不能當作完成或已部署。

## 2026-09-08 rebase 與重驗證

- 已對最新 `origin/dev` rebase；本輪 base 為 `70355aba97c23dd1cd592b71f1d3dfe6315d91ff`，rebase 後本地 WIP head 為 `d62e0a50bbd0a50c74213730b945b63ea482431f`。它尚未 push 或 handoff，故不是 candidate。
- `pnpm --filter @drts/api typecheck`、`pnpm --filter @drts/ops-console-web typecheck`、task Vitest（9 passed）和 task-owned ESLint 都是 exit 0；`git diff --check` 也為 exit 0。
- `pnpm exec vitest run tests/unit/reporting-filing.test.ts` 為 exit 1（26 passed、4 failed、2 unhandled rejections）。失敗的共用測試仍假設 `renderReportArtifact` 同步、XLSX/PDF 必須拒絕，與本 task 的 async renderer 行為衝突；它不在 write scope，未被修改或掩蓋。
- task test 在 `/tmp/sr-report-001-evidence-20260908` 產生的 in-memory IDs：CSV `JOB-e9e36deb-5a2d-41c2-8529-538dfdf20720` / `ART-23143f53-0c56-4e78-aee1-fc66b6aef893`，XLSX `JOB-a2e3f2cf-a1d2-4732-bb37-eff9f570723e` / `ART-f76c00f4-ee51-4559-8061-8d2169d2fe5d`，PDF `JOB-381b49d5-b4bf-428a-a5c2-4eeb6fee1c7f` / `ART-ad520b71-764b-4bf1-a79d-eb63527c848e`。三者 filters 均為 `{from:"2026-09-01",to:"2026-09-30"}`，相同一筆 `general` row。
- 外部暫存 venv 的 `pypdf` 解析（exit 0）讀回 filtered.pdf 1 page / 1 record 與 wide.pdf 35 pages / 55 records；CSV 亦逐欄讀回。XLSX 則由 task Vitest 的 ExcelJS load 逐欄驗證。這些都是本機 in-memory 證據，不是 live HTTP、資料庫或瀏覽器驗收。

## 來源與起點重現

依 `docs/03-runbooks/system-remediation-execution-tasks-20260906.md` 及其 SR-REPORT-001 leaf task 執行。追溯 `source/capabilities.json` C091、`source/new-gaps.json` N05。產品依據是 `phase1_prd_detailed_v1.md` §9.5.6（CSV/XLSX/PDF）與 §9.10.2（filing 只保留中繼資料，明確不產生 PDF/ZIP）。

`git fetch origin; git rev-parse HEAD origin/dev` 在接手時兩者均為上述 base（exit 0）。base 的 service renderer map 仍為 `xlsx: null`、`pdf: null`、`zip: null`，contracts 格式宣告仍只有 CSV。這是本次 base 的程式碼檢查，沒有把 9/6 audit 當作當前版本，也沒有宣称在 base 跑過 live 重現。

`gh run view 34043296647 --log-failed`（exit 0）確認舊候選失敗原因：Product smoke acceptance 的 ESLint 拒絕 `report-formats.test.ts:15` 未使用的 `beforeEach`。見 [CI run](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34043296647)。舊測試僅檢查多數格式 magic bytes，不能證明完整資料一致。

## 範圍內的實作

- 從舊候選恢復 service/controller 的 async PDF/XLSX 下載及 ExcelJS renderer，只取本 task 可寫檔案；未帶入其越界 contracts 修改。
- 保留九項 regulatory row builders 與既有 CSV writer。三種格式均讀既有 job.rows；ZIP 仍拒絕；沒有新增 filing bytes 產生路徑。
- XLSX 以字串儲存欄位，保留中文、JSON、引號、逗號、換行及 null；公式字串不變成 executable cell formula。
- PDF 改為逐筆、逐欄完整列印，使用 PDFKit 換行與分頁，移除舊版固定高度的 ellipsis 截斷。55 筆 × 22 欄的長文字測試產生 35 頁並由獨立 parser 核對全部值。
- 非 ASCII PDF 資料需要 `REPORT_PDF_FONT_PATH`；TTC collection 可另設 `REPORT_PDF_FONT_FAMILY`。未設定字型時明確回 `503 REPORT_PDF_FONT_REQUIRED`，避免 Helvetica 產生亂碼。這是未完成的部署前置，不能宣稱中文 PDF 已在服務環境可用。
- 未修改 UI。已讀 `packages/ui-tokens/src/realms.ts` 和 `docs/05-ui/drts-design-canvas/ops-screens-2.jsx` 的 OC_Reports；沒有另創畫面或調色。

## 實際檢查

下列是本地 in-memory 測試與檔案解析，不是 live API／資料庫／瀏覽器驗收。

| 命令                                                                                                                                                                                                                                                                                                    | exit | 結果                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| `CI=true pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                | 0    | 本工作區安裝 1312 packages；未修改 manifest/lockfile                          |
| `pnpm --filter @drts/control-plane-auth build`                                                                                                                                                                                                                                                          | 0    | 產生 typecheck 所需本地宣告                                                   |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                                                                                                                     | 0    | 修正 renderer font overload 後通過                                            |
| `pnpm --filter @drts/ops-console-web typecheck`                                                                                                                                                                                                                                                         | 0    | Next typegen 與 TypeScript 通過                                               |
| `pnpm exec eslint apps/api/src/modules/reporting-filing/report-renderers.ts apps/api/src/modules/reporting-filing/reporting-filing.service.ts apps/api/src/modules/reporting-filing/reporting-filing.controller.ts tests/unit/system-remediation/sr-report-001/report-formats.test.ts --max-warnings=0` | 0    | 沒有舊候選的 unused import 錯誤                                               |
| `SR_REPORT_EVIDENCE_DIR=/tmp/sr-report-001-evidence pnpm exec vitest run tests/unit/system-remediation/sr-report-001/`                                                                                                                                                                                  | 0    | 1 file、9 tests passed；含 ExcelJS workbook 讀回、篩選一致與存取拒絕          |
| `git diff --check`                                                                                                                                                                                                                                                                                      | 0    | 無 whitespace error                                                           |
| `pnpm exec vitest run tests/unit/reporting-filing.test.ts`                                                                                                                                                                                                                                              | 1    | 26 passed、4 failed、2 unhandled rejections；下述 scope blocker，並非宣稱通過 |

首次檢查發現共用 node_modules 的 symlink 指向已失效的其他 worker worktree；當時 prettier/vitest 為 MODULE_NOT_FOUND（exit 1），pnpm install 非 TTY purge 也 exit 1。只解除**本 isolated worktree** 的 node_modules symlink，再 frozen install，未改 canonical root。首次 typecheck 的 control-plane-auth 宣告缺失已用 build 解決；renderer overload 與 ESLint control-regex 錯誤已修。測試初次失敗的時鐘差異與 ApiRequestError message 比對亦已修正，以上表格是最後結果。

### 獨立 PDF／CSV parser

外部暫存 venv 安裝 `pypdf==6.17.0`，未改 repo dependencies：

```bash
python3 -m venv /tmp/sr-report-001-verify-venv
/tmp/sr-report-001-verify-venv/bin/pip -q install pypdf
REPORT_PDF_FONT_PATH=/usr/share/fonts/truetype/fonts-japanese-gothic.ttf pnpm --filter @drts/api exec tsx -e 'import { recordsToPdf } from "./src/modules/reporting-filing/report-renderers"; import { writeFileSync } from "node:fs"; recordsToPdf([{name:"台北車隊",note:"長文字測試"}]).then(bytes => writeFileSync("/tmp/sr-report-001-evidence/unicode.pdf",bytes));'
/tmp/sr-report-001-verify-venv/bin/python tests/unit/system-remediation/sr-report-001/verify-artifacts.py /tmp/sr-report-001-evidence
```

以上命令 exit 0。parser 實際結果：filtered.pdf 1 page／1 record；wide.pdf 35 pages／55 records，所有欄位尾端值均存在；unicode.pdf 1 page／1 record，讀回「台北車隊」「長文字測試」；empty.pdf 可解析。CSV 以 Python csv reader 讀回後逐欄與 job.rows 比對。XLSX 已在 Vitest 由 ExcelJS 讀回逐欄比對。

中文字型為本 worker 的系統字型，只證明指定字型時可解析；沒有把該主機的字型當成部署映像已存在的檔案。

本次程式產生的資源 ID（in-memory，非 live 資源）：

| Format | jobId                                    | artifactId                               |
| ------ | ---------------------------------------- | ---------------------------------------- |
| CSV    | JOB-f65b338c-6f11-4c1d-860a-913617738c3d | ART-5cce47c0-8d29-47db-ae7a-2051e95cb7ca |
| XLSX   | JOB-7d4b84c5-1ab5-4cdf-8de4-92264f3fe4bb | ART-8ea841e3-6dc1-4ed7-8ca7-322e405cb7b3 |
| PDF    | JOB-a77bd452-49fa-4fcf-97f6-a0cc4ed40440 | ART-676592d1-8989-42c3-b012-652b0a0112cb |

三筆工作 filters 都是 `{from:"2026-09-01",to:"2026-09-30"}`。輸入兩筆測試 order 中，9 月 completed order 被纳入，8 月 cancelled order 被排除；三者回傳相同 `general`、totalOrders=1、completedTrips=1。這是測試輸入及實際 builder 計算，並非 live 訂單，也不是取代生產資料來源的 fixture。

## 阻塞與下一步（未完成）

1. **Supervisor 必須擴 scope 並協調相依**：`packages/contracts/src/index.ts` 的 `IMPLEMENTED_REPORT_OUTPUT_FORMATS` 仍只有 CSV；它的唯一 writer 是 SR-CONTRACT-001，本 task 不可擅改。Ops picker 使用該宣告，目前仍只提供 CSV。需 supervisor 授予該常數的修改範圍並與 SR-CONTRACT-001 序列化，或由其 owner 整合。
2. **既有測試也需 scope**：`tests/unit/reporting-filing.test.ts` 的 4 個失敗都在 report export：CSV download 未 await、硬編 XLSX/PDF 必須拒絕、未完成 job 的同步 throw 斷言、tenant 邊界的同步 throw 斷言。新 async service 的拒絕在新測試已驗證，但不能在未授權下更改該共用測試。需 supervisor 擴 scope 後改為 await/rejects，並保留 ZIP 拒絕測試。
3. **中文字型交付**：部署映像尚未有可用 Unicode 字型及設定證據。需安排可授權字型的供應、部署路徑與覆蓋驗證；目前非 ASCII 未設字型會明確失敗。
4. 尚未執行 live HTTP／受控下載／資料庫持久化／真機／瀏覽器流程，沒有新的 candidate CI、獨立 reviewer approval、merge 或 deploy 證據。不得拿本地檢查取代。

完成上述事項後再 commit＋普通 push，以當時 HEAD/branch handoff 給 Claude；本次不呼叫 done 或 handoff。
