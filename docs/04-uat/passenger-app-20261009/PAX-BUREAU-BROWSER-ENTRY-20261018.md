# 交通局可實際開啟的乘客審查入口

原先提供給交通局的入口是帶 CLI identity token 的 Cloud Run 直連網址，一般瀏覽器
開啟一律得到 403；單一具名身分的 `roles/run.invoker` 授權本身也不能解決這件事，
因為 Cloud Run 的 IAM 檢查沒有瀏覽器登入流程。

本次在既有 `passenger-app-web` 之前新增 Cloud Load Balancer + Cloud IAP 公開前門
（`operations/deployment/passenger-bureau-entry/`），讓一般乘客 `/login`、預約、
行程等既有完整頁面可由一般瀏覽器經由新 host 到達，沿用乘客本人既有登入與操作
流程；同時把 `/review-driver` 與 `/api/review-driver-api/*`（司機端演練上線與
調度控制）路由到另一個刻意不給任何 IAP 存取權的 backend service，因此即使其餘
路徑公開，這兩個路徑仍不可由此公開入口到達。Cloud Run 服務本身保持
`--no-allow-unauthenticated` 不變，只新增對 Cloud IAP service agent 本身的
`run.invoker` 授權。

`apps/passenger-app-web/app/bureau-review/` 提供一個唯讀參考頁，說明此存取邊界、
列出 UC01–UC16 共 16 案的前提／步驟／預期／已驗／未驗（逐案各自描述，不套用
單一通過／不通過標籤），並在 `PAX_BUREAU_ENTRY_HOST` 已由部署設定時顯示實際可用
的 `/login`、`/review` 網址；未設定時明確顯示「尚未設定」，不會把本頁本身當成
已解除 403 的證據。

`.github/workflows/deploy-dev.yml` 與 `.github/workflows/domain-mappings-dev.yml`
的新步驟都是 opt-in（只在 repo variable `DEV_PAX_BUREAU_ENTRY_HOST` 設定後才會
執行），對既有部署與 domain-mapping 行為沒有副作用。

本機元件測試（`tests/unit/pax-bureau-browser-entry-20261018/`，共 22 項）涵蓋：
`grant-passenger-app-iap-invoker.sh` 在授權前先以冪等呼叫確保 Cloud IAP
service agent 本身存在、若該建立呼叫失敗則不嘗試授權（回歸
`entry-R6-first-activation-review/findings.json` 的
`ENTRY-R6-FIRST-IAP-IDENTITY-BOOTSTRAP`）、只授權給計算出的
Cloud IAP service agent、從不授權 `allUsers`／`allAuthenticatedUsers`；
`setup-passenger-public-entry.sh` 在 guard backend 的 IAP policy
讀取失敗或回傳無法解析的 JSON 時 fail closed、在 guard backend
已有公開授權時拒絕繼續、產生的 URL map 頂層 default 一定指向
guard backend（回歸 `entry-R3-routing-review/findings.json` 的
`ENTRY-R3-UNMATCHED-HOST-DEFAULT` 與 `ENTRY-R3-UNKNOWN-GUARD-POLICY`）；兩個
workflow 的新步驟有正確接線；`BureauReviewPage` 不渲染任何互動式預約/登入控制、
不連結 `/review-driver` 相關路徑，並正確依 `PAX_BUREAU_ENTRY_HOST` 顯示或隱藏
實際網址，且主頁內容面向一般讀者，已把 Cloud Run／IAM／workflow
設定細節移到本 runbook（回歸
`entry-R4-runtime-page-review/findings.json` 的
`ENTRY-R5-READER-FACING-INSTRUCTIONS`）。這些測試全部使用 stub 的 `gcloud`
與記憶體內 DOM，不呼叫任何真實 GCP API，也不啟動瀏覽器或伺服器。

另以實際 `pnpm --filter @drts/passenger-app-web build`（`next build
--webpack`）確認路由分類而非比對原始碼字串：`/bureau-review` 顯示為
`ƒ`（Dynamic，隨請求算繪），不是 `○`（Static），解決
`PAX_BUREAU_ENTRY_HOST` 只在 Cloud Run 執行期注入、Docker build
階段看不到而可能被凍結成空值的問題（`entry-R4-runtime-page-review/findings.json`
的 `ENTRY-R4-RUNTIME-HOST-PRERENDER`，詳見本 runbook §7）。`next typegen &&
tsc --noEmit` 與 `eslint app/bureau-review components/bureau-review
--max-warnings=0` 皆通過。

**尚待 Root 統一部署才能完成的驗收二：** 本機 VM 禁止啟動產品伺服器、瀏覽器或
Docker，也沒有雲端身分可執行 `domain-mappings-dev.yml`／`deploy-dev.yml`。
實際的 `https://<host>/login` 一般瀏覽器可達性、憑證生效、以及
`/review-driver` 經由此公開入口確實不可達，需由具權限 operator 依
`docs/03-runbooks/passenger-bureau-browser-entry-20261018.md` §4、§5 執行後
補上真實 host、憑證狀態與 curl/瀏覽器結果；在那之前本文件不宣稱瀏覽器層級的
403 已解除，只記錄原始碼、配置與本機驗證範圍。
