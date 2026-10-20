# 電子乘車證明：Web 檔案分享與遮名一致性

依使用者送審截圖（蔡○○、F\*\*\*4280）的既有確認單，本次為既有乘車證明
Web/PDF/HTML 顯示補上兩項有界修正：

1. 既有乘車證明 PDF 新增瀏覽器檔案分享（`navigator.share`），不新增上傳
   服務、公開物件或複製連結路徑。
2. PDF／HTML／Web／native 四個駕駛姓氏顯示位置統一為固定長度遮名
   `姓氏○○`，已遮名字串不重複遮罩；儲存端原始姓氏與既有
   `driverRegistrationMasked` 遮罩完全不變。

正式 E04 開立／付款與 WebRide 既有 blocked 條件、角色與驗收準則維持不動；
本次不宣告正式發證、結算或實際收件人送達。

## 獨立審查退修（同一候選內修復，未產生新 candidate）

獨立 reviewer（Codex）於送審前讀取實際 WIP 原始碼，指出兩項原 r2
sharing contract 必須修復項，已於同一元件／測試內修復並以 before/fixed
方式重現：

1. **分享描述子的 origin 防護**：原版只在 `fetch` 設定
   `redirect:"error"`／`credentials:"same-origin"`，未在送出請求前核對
   `pdfUrl` 本身是否同源；若上游描述子遭竄改或異常，元件會對任意主機
   送出請求。修復後先以 `new URL(pdfUrl, location.origin)` 解析並比較
   `origin`，不同源或無法解析一律視為失敗並**完全不送出請求**。新增
   `rejects an off-origin receipt descriptor before sending any request`
   測試，斷言 `fetch` 從未被呼叫。
2. **分享中的重複送出與過期結果覆寫**：原版 `share()` 點擊後狀態仍停留
   在 `ready`、按鈕未停用，且其 `.then/.catch` 沒有核對請求世代號，第二
   次點擊可重複呼叫 `navigator.share`，換單後延遲落地的分享結果也會
   覆寫新收據畫面。修復後點擊即轉入 `sharing` 狀態停用按鈕，且回呼比對
   `requestIdRef` 世代號。新增
   `disables the share button while a share is pending so a second click
cannot start a duplicate share` 與
   `ignores a late share settlement after the receipt identity has already
changed` 兩項測試。

## 第五輪：canonical-consistency CI 路徑修復與 hooks bootstrap 真實性回報（本輪，無新 Source 變更）

獨立 reviewer 已核准 `2479ad1e9`（第四輪內容，見下節）；該候選被
`tools/ci/git/check_canonical_consistency.py` 的 `cited-paths` 檢查擋下：
本文件先前以縮寫形式引用兩個路徑（以「…」省略中段目錄的
certificate-artifact.renderer.ts 與 native-presentation.ts 完整路徑），
該檢查逐字解析反引號內的引用路徑、不展開省略號，判定找不到檔案。修復：僅將這
兩處展開為完整真實路徑（`apps/api/src/modules/certificate-support/
certificate-artifact.renderer.ts`、`packages/passenger-client/src/ride/
native-presentation.ts`），不改動任何 Source／測試檔；與 `2479ad1e9`
相比，九個既有 write-scope 原始碼／測試檔案逐位元組相同（`git diff
2479ad1e9 HEAD -- <nine files>` 為空），僅本文件改動。此修復即
`3f45fdeed`。

**本輪（在 `3f45fdeed` 之後）實際環境缺口回報**：開始本輪工作時，本
worktree `core.hooksPath` 為既有值 `.husky/_`（追蹤設定本身未變動），
但該目錄是 husky v9 的既有 `.gitignore` 產物（`.husky/_/`，由既有
`package.json` `"prepare": "husky"` 腳本產生，非本任務新增或客製檔案），
於此刻觀察到缺漏（git 在 hooksPath 目錄下找不到對應可執行檔會靜默
略過，無錯誤、也無真實 hook 痕跡）。此為本輪開始時的單次觀察結果，
無法回溯證明 `b3c76c192`／`70cc25778`／`2479ad1e9`／`3f45fdeed` 當時
各自 commit／push 時是否已處於同一缺漏狀態（worktree 可能在其中某次
commit 之後才被 rematerialize 而出現此缺口，那幾次 commit 當時很可能
仍有正常觸發 Prettier／ESLint 既有 hooks）；因此不宣稱這幾次 commit
當時未觸發 `.husky/commit-msg`／`.husky/pre-commit`，僅宣稱本輪發現
缺漏並已修復。已以既有
`node_modules/.bin/husky`（既有 husky 套件本身，未新增/更換套件、未
改動 `.husky/commit-msg`／`.husky/pre-commit` 內容、`core.hooksPath`
值不變）還原 `.husky/_`；還原後重新執行
`python3 tools/ci/git/check_canonical_consistency.py --ci --base
origin/dev --head HEAD`，真實輸出：

```
[consistency] l1-edit-authority: 0 finding(s)
[consistency] cited-paths: 0 finding(s)
[consistency] cited-decisions: 0 finding(s)
[consistency] task-claims: 0 finding(s)
[consistency] OK
```

本輪僅改動本文件一處章節新增；九個既有 write-scope 原始碼／測試檔案
相對 `2479ad1e9` 仍逐位元組相同，故未重跑 unit／type 檢查（第四輪的
171／22／193 通過數字、`tsc`/`eslint` 結果，以及第五輪 commit message
中額外核對的 109/109（`web-share.test.tsx`／`receipt-download.test.ts`／
`native-ride-presentation.test.ts` 三檔測試數加總，本身只是對171/193
既有數字的子集加總，非額外獨立驗證）均維持原樣，非本輪重新產生——
這些數字本身源自第四輪執行時的終端輸出觀察，未如本輪
canonical-consistency 檢查或第五輪 `tsc` 修正般另以落地檔案方式逐一
核對真實 exit code；本輪未重跑，故不補強其驗證層級，僅原樣沿用。本
文件中唯一有明確以落地檔案核對 `EXIT:0` 的數字是第三輪 23:37:46Z 的
163（見下節）。本次 commit 經由還原後的 husky `commit-msg`／
`pre-commit` 正常觸發，非以 `--no-verify` 跳過。

## 第四輪獨立審查退修：已遮名輸入的星號後綴雙重遮罩（已修復）

獨立 reviewer 以實際 production 公開呼叫路徑（Web mapper／native
mapper／API renderer 三者，皆為真實模組、無 DB／裝置層宣稱）重現：
輸入已是可辨識遮名字串但以星號結尾的 `蔡**`／`蔡＊＊`，三個消費者皆
輸出 `蔡**○○`／`蔡＊＊○○`，等於對已遮名字串再疊一層 `○○`，違反原
r2「已遮名公開呈現（如 蔡○○／既有遮罩樣式）維持不變、不重複遮罩」
條款；一般姓氏、複姓、`蔡○○` 本身與全空白四類控制案例皆仍通過。

第二輪退修第 2 點曾以「系統中沒有任何既有路徑會讓 `driverSurname`
欄位出現星號」為理由不採納星號偵測；該推論本身仍成立（目前程式碼
確實不會*生成*星號遮名），但原 r2 條款保護的是**輸入端已經是遮名字串
的情形**，不限定該字串必須由本系統既有邏輯產生。實際核對既有資料
路徑：`driver-profile.service.ts` 的 `driverSurname` 僅要求非空字串
（上限 40 字，無字元類別限制），經 `regulatory-registry.service.ts`
（寫入時標記 `driverSurnameSource: "driver_profile_declared"`）存入既有
registry，再由 `certificate-support.service.ts`／`certificate-artifact.
renderer.ts` 讀出呈現——這是一條**既存、可寫入**的
profile→registry→certificate 真實路徑，駕駛今天即可透過既有自填欄位
直接輸入 `蔡**`／`蔡＊＊` 等已遮名慣例字串，並非僅憑使用者截圖推測、
也非仰賴未來才存在的假設來源。因此第二輪「不採納」的結論對本條款
過窄，本輪依既有真實輸入路徑修正之；本次不宣告任何新的 PII 遮罩
政策或新增 live DB 星號資料來源，僅修正既有格式器對既有輸入路徑上
既有遮名慣例的處理。

修復：三個檔案（`passenger-live.ts`／`native-presentation.ts`／
`certificate-artifact.renderer.ts`）內各自既有、刻意保持重複的
`formatMaskedSurname` 小函式，由單一 `trimmed.endsWith("○○")` 判斷
改為對照一個新增的本地常數陣列 `["○○", "**", "＊＊"]`（半形／全形
星號與既有圓圈樣式皆視為「已遮名」，命中任一後綴即原樣回傳，不再
補 `○○`）；未新增驗證器、API、schema 或任何新的全域遮罩框架，三個
格式器之間仍不共用程式碼，符合既有「刻意重複小函式」設計。原第二輪
空白姓氏修復、第三輪 caller-context 比對與第一輪 origin／重複送出
防護完全未變動。

新增測試（各矩陣追加 `蔡**→蔡**`／`蔡＊＊→蔡＊＊` 兩列，不移除既有
列）：`tests/unit/pax-receipt-complaint-20261009/receipt-download.test.ts`
兩個既有 `it.each` 矩陣（e04Snapshot 擷取姓氏、自填姓氏）、
`tests/unit/pax-native-app-20261009/native-ride-presentation.test.ts`
既有 native mapper 矩陣，以及
`tests/unit/pax-bureau-receipt-share-masked-name-20261019/web-share.test.tsx`
新增一個 `it.each`（透過真實 `buildP5_10Fixture`／`mapPassengerRideAuthorityToFixture`
掛載取得的 Web mapper 輸出）。修復前以同一輸入重現：四個消費者皆得到
多一層 `○○` 的錯誤輸出；修復後四處皆回傳未變動的原始已遮名字串。

## 第三輪獨立審查退修：窄化後的 caller-context 比對（已實作）

獨立 reviewer 將第一輪「依 authMode/token 自行推導 PDF 目標」的要求窄化為
更精確、可驗證的版本：不重新推導授權，只在送出請求前比對既有
`pdfUrl` 是否與目前**已知**定址 context（`authMode` + 父層既有 `token`
prop，實際上在 id 模式即 `orderId`，token 模式即 `accessToken`——已追蹤
`PassengerRidePage`／`fetchPassengerRideAuthority`／
`passengerClient.getRide` 確認）所對應的既有正式路由完全相符：

- account／id 模式：`/api/passenger-app/rides/{orderId}/receipt/artifacts/pdf`
  （`apps/api/src/modules/multi-taxi/multi-taxi.service.ts`
  `getTrustedPassengerReceiptDownloads`）
- token 模式：`/api/passenger-rides/{accessToken}/receipt/artifacts/pdf`
  （同檔 `getPassengerReceiptDownloads`）

兩個路由樣式都在實際原始碼中逐字核對存在。實作：`receipt-share-
actions.tsx` 新增必填 `token: string` 與既有 `authMode` prop（由
`passenger-ride-page.tsx` 掛載處原樣轉傳，不新增任何路由／認證／JWT
邏輯），送出請求前先以字串完全相等比對 `pdfUrl` 與
`resolveExpectedArtifactPath(authMode, token, "pdf")`；不符即視為失敗、
**完全不送出請求**，與既有 origin 防護疊加。`useEffect` 重置世代的依賴
陣列也加入 `token`／`authMode`，換單／換認證模式即便字串恰好重複仍會
重置，不沿用舊 File。

新增測試：合法 token 模式描述子成功準備、描述子指向別的訂單被拒、
描述子套用錯誤模式的路由樣式（id 模式卻給 token 路由樣式）被拒，皆
斷言 `fetch` 從未被呼叫。既有以假測試 URL 字串建的 fixture（`PDF_URL`／
`HTML_URL`）已換成由上列真實路由樣式產生，不再是任意字串。

## 第二輪獨立審查退修：一項修復、一項以證據駁回

獨立 reviewer 再送回兩項 finding；逐項核對實際原始碼與資料路徑後：

1. **空白姓氏被渲染成憑空的 `○○`（已修復）**：`certificate-artifact.
renderer.ts` 的 `formatMaskedSurname` 原先只檢查 `trimmed.endsWith
("○○")`，對全空白輸入會回傳單純 `"○○"`，等於無姓氏卻生出遮名字串，
   違反原 r2「trim 後空白／缺值維持不可用」規則。Web／native 兩個 mapper
   的既有寫法本就會在 trim 後為空時回傳空字串（列直接省略），僅渲染器
   有這個落差。修復：trim 後為空直接回傳空字串，並把「駕駛自填姓氏」列
   的顯示條件由原始字串真值改為 trim 後真值（避免全空白字串仍判定為
   有值而渲染該列）。新增兩項測試
   （`tests/unit/pax-receipt-complaint-20261009/receipt-download.test.ts`）：
   全空白 declared 姓氏整列省略、全空白 captured e04Snapshot 姓氏不產生
   `○○`；修復前以同一輸入重現會得到含 `○○` 的錯誤輸出。
2. **ASCII／全角星號遮罩（查無根據，不採納）**：對 repo 全文 grep
   `driverSurname`／`e04Snapshot.driverSurname` 相關程式碼及既有
   `maskName()`（`apps/api/src/common/sensitive-data-policy.ts`）
   實際使用處，確認系統中沒有任何路徑會讓這個欄位出現 `**`／`＊＊`
   遮罩；`maskName()` 只套用於 `fullName`／`displayName`／
   `accountName`／`emergencyContact.name` 等完全不同欄位，原 r2
   maskedNameContract 的「existing mask pattern」指的就是使用者截圖的
   `○○`，不是這組星號慣例。對這個欄位硬塞一套「已知星號遮罩」判斷，
   等於為不存在的資料形狀加功能，不處理。

另一項「依 authMode／token/order 自行推導正確 PDF 目標、不信任既有
pdfUrl」的要求未採納：實際讀取
`apps/api/src/modules/passenger-app/receipt/passenger-receipt.controller.ts`
確認每次請求都由伺服器依當時 `@CurrentIdentity()` 的真實 session／token
與路徑中的 `orderId` 重新授權（`bookingService.getRide(passengerId,
orderId)`），與用戶端持有哪個 URL 字串無關；用戶端「獨立推導」授權目標
不會增加安全性，反而要求用戶端重建伺服器路由／授權邏輯，直接牴觸原 r2
sharing contract 本身的「Do not add endpoint, principal, public URL or
auth exception」。既有 origin 防護（見上節）已覆蓋唯一真實可行的客戶端
防線；未進一步變更。

## 變更範圍（十個既有 write scope）

- `apps/passenger-app-web/components/ride/receipt-share-actions.tsx`（新檔）
  — 獨立分享元件：第一次點擊先把 `pdfUrl` 解析為 `URL`，`origin` 與目前
  頁面不同或無法解析就直接判定失敗、不送出任何請求；通過後才
  `fetch(resolvedUrl, {cache:"no-store", credentials:"same-origin",
redirect:"error"})` 取得既有授權 PDF，驗證 HTTP 狀態、
  `Content-Type: application/pdf` 與 `%PDF-` 簽章後才建構 `File`；
  `canShare({files:[file]})` 判定支援度；第二次明確點擊才同步呼叫
  `navigator.share({files:[file], title})`，不等待任何網路動作。點擊後立即
  進入 `sharing` 狀態並停用分享按鈕，避免同一 File 被重複送出；回呼以
  既有 `requestIdRef` 世代號核對，收據／訂單換單或元件卸載後延遲落地的
  分享結果會被忽略，不會覆寫新收據的畫面狀態。誠實呈現 fulfilled／
  cancelled（AbortError）／unsupported／failed 四種結果，原有 PDF／HTML
  下載連結保留為後備。
- `apps/passenger-app-web/components/ride/passenger-ride-page.tsx` — 僅新增
  一行 import 與 P5-10 區塊內一處 `<ReceiptShareActions pdfUrl={...}
receiptNo={...} />` 掛載，未更動 ETA（Journey 300–400）或評分（1374）。
- `apps/passenger-app-web/components/ride/translations.ts` — 只附加九個
  分享狀態文案鍵（準備中／就緒／分享中／完成／取消／不支援／失敗／
  重試），不覆寫既有鍵。
- `apps/passenger-app-web/lib/ride/passenger-live.ts`、
  `packages/passenger-client/src/ride/native-presentation.ts`、
  `apps/api/src/modules/certificate-support/certificate-artifact.renderer.ts`
  — 各自新增一個本地 `formatMaskedSurname`（`姓氏.trim()`、已以 `○○`
  結尾則不變，否則補 `○○`），套用於既有「駕駛」／
  「駕駛（姓氏＋執登證號遮碼）」／「駕駛自填姓氏（非身分核驗）」顯示列；
  三份格式器為刻意重複的小函式，不建立新共用套件或 API 匯入。

## 驗證

本機無 VM product/browser/E2E/PG/Compose；以下皆為 socket-free 單元／型別／
lint 檢查，未啟動任何伺服器。

### 遮名一致性（PAX-BUREAU-RECEIPT-MASKED-NAME-CONSISTENCY-SOURCE）

| 來源                                                                        | 案例                                                                                                                                                                               | 結果                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `apps/api/src/modules/certificate-support/certificate-artifact.renderer.ts` | 真實 `renderCertificateArtifact` 直接呼叫，`蔡→蔡○○`、`歐陽→歐陽○○`（複姓保留）、`蔡○○→蔡○○`／`蔡**→蔡**`／`蔡＊＊→蔡＊＊`（三種已遮名樣式皆不重複遮罩）、兩姓氏欄位皆缺時整列省略 | HTML／PDF 位元組皆通過 |
| `packages/passenger-client/src/ride/native-presentation.ts`                 | `mapNativePassengerCertificate` 同一矩陣（蔡/歐陽/蔡○○/蔡\*\*/蔡＊＊），另保留既有 `Captured surname○○` 精確列值與遮罩執登號不變斷言                                               | 通過                   |
| `apps/passenger-app-web/lib/ride/passenger-live.ts`                         | `mapPassengerCertificate`／`mapPassengerRideAuthorityToFixture` 經真實 Web mapper 得到 `駕駛: 蔡○○`，另以 `蔡**`／`蔡＊＊` 輸入核對不重複遮罩（於 `web-share.test.tsx` 內斷言）    | 通過                   |

修正前基準：三個檔案改動前，上列欄位顯示未遮名原始姓氏（渲染器兩處、
Web／native 各一處），已於 `tests/unit/pax-receipt-complaint-20261009/
receipt-download.test.ts` 新增矩陣與 `tests/unit/pax-native-app-20261009/
native-ride-presentation.test.ts` 更新既有斷言重現「修正前失敗、修正後
通過」。

### Web 檔案分享（PAX-BUREAU-RECEIPT-WEB-FILE-SHARE-SOURCE）

`tests/unit/pax-bureau-receipt-share-masked-name-20261019/web-share.test.tsx`
以真實 `Actions`（P5-10）掛載，只在 `fetch`／`navigator.share`／
`navigator.canShare` 邊界替身：

- 真實授權 PDF fetch 選項（`no-store`／`same-origin`／`redirect:"error"`）。
- 分享 payload 僅含 `{files,title}`，以 SHA-256 核對 `File` 位元組與原始
  回應位元組完全相同；payload JSON 不含 `token`／`bearer`／`/api/` 字樣。
- fulfilled／cancelled（AbortError）／unsupported（無 `canShare`）／
  failed（403、404、錯誤 MIME、空位元組、非 PDF 位元組）五類結果皆各自
  斷言對應文案，且 failed／unsupported 不進入 ready、不呼叫
  `navigator.share`。
- 兩次點擊的手勢分離：第二次點擊不再呼叫 `fetch`，直接同步呼叫
  `navigator.share`。
- 元件換單（`pdfUrl` 變更）後，前一筆仍在途的 fetch 回應不得落地為
  `ready`；卸載後延遲落地的 fetch 不丟錯誤。
- 離源描述子直接失敗、從未送出請求；分享中重複點擊被停用、過期分享
  結果換單後不覆寫新畫面（見上節兩項退修）。
- 原有 `t.DownloadPdf`／`t.DownloadHtml` 連結與新分享按鈕同時存在，未被
  取代。

## 執行結果

```
vitest run \
  tests/unit/pax-bureau-receipt-share-masked-name-20261019/web-share.test.tsx \
  tests/unit/pax-native-app-20261009/native-ride-presentation.test.ts \
  tests/unit/pax-receipt-complaint-20261009/receipt-download.test.ts \
  tests/unit/pax-receipt-complaint-20261009/receipt-auth.test.ts \
  tests/unit/pax-bureau-journey-coverage-20261018/receipt-pending-screen.test.tsx \
  tests/unit/pax-native-app-20261009/native-stream-and-receipt-adapters.test.ts \
  tests/unit/system-remediation/sr-qa-reports-001/c098-electronic-ride-certificate.test.ts
  → 7 files, 171 passed, EXIT:0 (2026-10-20T00:07:29Z, after the already-masked
    `**`／`＊＊` suffix fix; a prior 163-passed/EXIT:0 run at 23:37:46Z covered
    the same seven files before this round's 8 additional masked-surname-matrix
    cases)

(apps/passenger-app) vitest run tests/unit/native-p5-screen.test.ts --config vitest.config.ts
  → 1 file, 22 passed, EXIT:0 (separate vitest config/project; not part of the 171 above)
```

Combined: 193 passed／0 failed／0 skipped across the eight regression files listed
in the original r2 verification plan (171 + 22; the four-figure 109/109 subtotal
in the fifth-round commit message is an arithmetic subset of this 171, not an
additional independent run). These 171／22／193 figures are carried forward
unchanged from the fourth round's terminal-output observation and have not been
re-confirmed via a redirected-to-file exit code the way this doc's
canonical-consistency check and the fifth round's `tsc` fix were; the only
figure in this document backed by a file-captured `EXIT:0` is the third round's
163 at 23:37:46Z noted above. `web-share.test.tsx` grew from the initial
13 cases to 16 (origin-rejection, duplicate-share-disabled, stale-settlement-
ignored) in the second round, to 19 (legitimate token-mode descriptor,
wrong-order rejection, wrong-mode-shape rejection) in the third round, and to 21
(already-masked `**`／`＊＊` surname matrix) in this fourth round;
`receipt-download.test.ts` gained 2 more (whitespace-only surname, both call
sites) in the second round and 4 more (already-masked `**`／`＊＊`, both
matrices) in this fourth round; `native-ride-presentation.test.ts` gained 2
more (already-masked `**`／`＊＊`) in this fourth round. All are included in
the 171/193 above, not stacked on top of it.

型別檢查（`tsc --noEmit --incremental false`，捕捉真實 compiler exit code，
不透過 `tail` pipeline）：

- `apps/passenger-app-web` 原 tsconfig：exit 2，僅剩 3 個
  `@drts/control-plane-auth/review-driver-web` 模組找不到的錯誤；本次四個
  改動檔（含 `receipt-share-actions.tsx` 的 Navigator 修正後）零錯誤。
- `apps/api` 原 tsconfig：exit 2（4 個 `@drts/control-plane-auth` 模組找不到
  的錯誤；先前以 `tail` 檢視誤判為 exit 0，本次已用檔案落地重新核對 exit
  code）；`certificate-artifact.renderer.ts` 本身零錯誤。
- 上列殘留錯誤皆來自 fast-forward `origin/dev` 帶入、尚未建置 dist 的既有
  `@drts/control-plane-auth` 套件，與本次十個 write scope 無關。為取得
  排除該既有缺口後的真實訊號，另於 `.local/pax-bureau-receipt-share-
masked-name-20261019-verify/{api,web}.tsconfig.json`（未追蹤、
  gitignore 覆蓋，僅本機暫時驗證用、不提交）各自 `extends` 原
  tsconfig，只將 `@drts/control-plane-auth`（與其 `review-driver-web`
  子路徑）的 `paths` 指到既有原始碼入口（`packages/control-plane-auth/
src/index.ts`／`src/review-driver-web.ts`），不改動任何追蹤的
  tsconfig／package.json／exports，不新增 stub、不排除既有來源：兩者
  皆 **exit 0**。
- `packages/passenger-client`：原 tsconfig `tsc --noEmit --incremental
false` 零錯誤（未受既有缺口影響）。
- `eslint --max-warnings=0`：`receipt-share-actions.tsx`、
  `passenger-ride-page.tsx`、`translations.ts`、`passenger-live.ts`、
  `certificate-artifact.renderer.ts`、`native-presentation.ts` 及三個
  測試檔，全部零錯誤零警告。

## 未驗項與限制

- 實際瀏覽器／OS 分享面板、使用者真實手勢與裝置層級結果，仍待既有共享
  dev／實機驗收；本機不啟動瀏覽器或 product server。
- 正式 E04 開立／付款、WebRide 既有 blocked 條件與角色、`PAX-RECEIPT-
COMPLAINT-20261009` 既有歷史與 worktree 完全未變動，本次不宣告它們的
  完成或解除。
- `@drts/control-plane-auth` dist 缺失為既有環境缺口，非本次十個 write
  scope 之內，留給既有建置／部署流程處理。
- 候選 CI、review 與兩個 Source key 的 `record-acceptance` 證據，依既有
  candidate lifecycle 於 handoff 後由 GitHub bus 與 reviewer 另行提供。
