# 共享開發乘客入口簡化

Task: PAX-BUREAU-DEV-ENTRY-SIMPLIFICATION-20261018。
Owner: Codex；獨立 reviewer: Claude2。

使用者要求直接可測功能的開發入口，並要求 Root 自行處理設定。
這次沿既有 Cloud Run Passenger 公開開關與原 App 登入，
移除 IAP／負載平衡器／新 DNS 作為開發驗收前置。
其他功能、原 16 案與六項缺口並未因此完成。

| 問題與原行為                                   | 修正與實際驗證                                                                                                                         | 限制                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 舊服務直接公開時會一併開放 Driver 演練路徑     | 公開 Passenger 模式在讀 Driver HTML／取得 proxy upstream authority 前回 404；Next Proxy 同時阻擋其 filesystem 靜態檔                   | 原私人 hosted Driver consumer 保持；尚待部署後普通 HTTP／browser 驗證 |
| 公開開關與關閉控制面的應用模式沒有接線         | 執行原 Passenger deploy step 的真 Bash，僅以 stub 取代最後部署命令，確認公開與私人兩種設定分別傳 true／false，Passenger 演練仍保持啟用 | 沒有在單元測試呼叫 gcloud 或變更 IAM                                  |
| 操作頁連到尚未建立的自訂網域                   | 公開 Passenger 模式使用目前 origin 的相對 /login 與 /review 連結；原 16 案、唯讀說明與私人自訂網域行為保持                             | 不是把參考頁誤稱為完整旅程；仍須登入真實乘客流程                      |
| 既有 Passenger BFF／私人 Driver 授權可能受影響 | 一併跑既有 BFF 與 Driver BFF 回歸，保留原資料／角色／上游身份處理                                                                      | API 的實際身份與資料拒絕仍須同版 hosted／共享驗收                     |

新增測試在 accepted 4db295df5129b57b66a27950348f6a1fbb2ae049
未修改產品程式時，三檔實際 5 failed／7 passed，底層 exit 1：
Driver HTML／proxy 仍回 200，部署未設定新模式，操作頁仍連舊 host。
沒有把這個預期失敗稱作通過。

修正後執行：

```bash
pnpm exec vitest run tests/unit/pax-bureau-browser-entry-20261018/ \
  tests/unit/pax-web-shell-20261009/bff.test.ts \
  tests/unit/pax-review-shared-order-demo-20261015/driver-bff.test.ts
```

實際 9 檔／93 項通過，底層 exit 0。包含 proxy 原路徑、子路徑、
靜態檔、百分比編碼、重複斜線／反斜線與瀏覽器偽造 mode／host／Bearer，
及原 Passenger 連結和私人 Driver 正向。
既有斷言保留，沒有啟動產品／HTTP／browser／Postgres／Compose 服務。
格式化後同一組 93 項再次通過，exit 0。ESLint 初次因測試內 literal
regex spaces 規則 exit 1，改為等價的 ` {6}` 後，限定八個 TS／TSX
檔案 lint exit 0；該真 Bash 部署測試再跑 2 項，exit 0。
`pnpm --filter @drts/passenger-app-web typecheck` 實際完成
Next route typegen 與 tsc，exit 0。

`pnpm --filter @drts/passenger-app-web... build` 在本機完成依賴、
Next 最佳化編譯、TypeScript 與 14 頁產生，但最終複製 standalone
相依套件時因工作磁碟 ENOSPC 而 exit 1；不記為整體建置通過。
只刪除本 task 自己可重建的 .next 快取／部分 standalone，保留原碼、
依賴來源、既有證據與所有使用者資料。完整封裝結果待同候選 hosted CI，
不在本機啟動任何產品或 browser server 作為替代。

兩個 Source keys 仍需完整候選的獨立審查、必要 CI 與正常合併。
Root 才能設定單一 Passenger 開關、正常發布部署並交付實測 HTTPS URL。
原入口 public key、普通瀏覽器登入、同單全 16 案與正式外部服務驗收
在本次 Source 單元測試後仍未宣稱完成。

2026-10-19 補齊原私人 Driver 生產與消費端：

初版正常 checkpoint `e88a7d91ddbac9e8634336a8d9add76913bf8dbf` 已由
owner 自行撤回交審，保留原 PR #2809；這不是獨立 reviewer 的採認。
靜態追查確認 accepted 4db／e88 沒有另外的 Cloud Driver 服務，
原 core B、additional、真預約接單逾時與 Ops 拒絕復原仍連 Passenger mount。
只關閉該 mount 會使上述原驗收中斷。

同 task 正常擴充精確 scopes 後，在既有私有 Ops Docker 映像產生同一
Driver export，兩個新 Ops routes 直接 re-export 原 handlers，
沒有複製司機業務邏輯或改用 ops_user。原 handler 的裝置 JWT 透傳與
metadata runtime identity 分別保持；原上游 API 仍負責 session／task ownership。
Ops 的 Driver mount 保留原 SQLite isolation／Blob worker headers。
部署只替 Ops 補原 rehearsal enablement 與明確 private mode，沒有新增服務。

原五支 deployed Passenger 腳本在 public mode 不附 Cloud Run credential。
四支有 Driver 的腳本使用實際 Ops origin 及同 audience edge token；
core A／B 皆已接線，沒有刪除原案例、同單證據、真時限或正向斷言。
source CI 保留原 standalone Driver 與 Passenger private mount。

新增測試呼叫實際 Ops routes；僅 mock 檔案內容、metadata 與遠端 API transport，
沒有 mock 被測 handler 或 upstream-auth。檢查裝置 Bearer、runtime identity
分離、匿名原 API 401 透傳、其他角色 route 拒絕及真 Next headers。
原回歸加新案例共 10 檔／99 項，底層 exit 0；Ops route typegen／tsc exit 0，
初次七檔 scoped lint exit 0。

原 e88 自身 CI `39179052619` 的 typecheck job `117828076027`
實際因本 task deploy 測試字串替換的可能 undefined 而失敗；已修正為明確檢查值。
後續本機 root typecheck 亦抓到新增測試的三處可空 mock-call 索引，以及
直接匯入 Next config 造成的全域 ProcessEnv 型別污染；已移除該污染，
headers 測試仍於執行時載入真正 config。原失敗 log 保留，修後結果續記。

修後 `pnpm typecheck:root` 實際 exit 0；最終相同 10 檔／99 項回歸
再次 exit 0，包含直接載入實際 config 的 headers 測試。Ops config/routes、
五支原 browser specs 與兩個 unit 共十檔 scoped ESLint
實際 exit 0。此處並非宣稱整個 monorepo typecheck 或 hosted browser 已通過。

因 core B 換到私有 Driver origin，另跑原 hosted booking／dispatch caller
與 Driver failure-evidence 三檔，共 40 項通過，底層 exit 0。
這些原斷言未修改，core callback 的設定保留於 callback 內，原 sandbox
仍可執行實際 caller；沒有為新入口刪掉失敗取證、清理或 B 路徑檢查。

另以 TypeScript AST 抽出五支實際 spec 的 browser-context factory 執行，
僅替換 Playwright 建立 context 的外部邊界；檢查 public Passenger 無雲端
header、原 private Passenger 正向、Driver 專用 audience token，以及缺
Driver token 不借用其他角色憑證。相同 18 項在原 e88 Source 實際
13 failed／5 passed、exit 1；修正版 18 passed、exit 0。
這是實際腳本的路由／憑證回歸，不宣稱已啟動 browser 或完成訂單。

最終合跑原回歸及新 factory 測試，11 檔／117 項通過，exit 0；
包含新增 factory 測試的根目錄 typecheck 再次 exit 0。
新增測試的初次 lint 因未使用的 mock 參數 exit 1，明確標記 discard 後
該檔 lint exit 0，其他十個受影響 TS 檔的既有 scoped lint 仍保留為 exit 0。

Docker 內 Expo export／封裝及完整原 browser 腳本尚待新完整候選自己的
hosted CI／正常共享部署，不把上述單元、型別或 Source 接線當成已部署驗收。

後續 fee5f4db68f81bdebead2652f41dfea436e2772b／gen6c69 已由 owner
正常撤回：自己的 CI 39180785177／job117833009515 在既有 cross-app
import guard 實際 exit 1，拒絕兩個 Ops routes 直接相對匯入 Passenger。
這是本 task 漏檢及實作缺陷，沒有削弱 guard 或把失敗歸給外部環境。

同一 task 正常追加六個精確路徑，19→25 scopes；原九 requirements、
兩 Source keys、owner／reviewer 與 spec hash 保持。將原 Driver SPA／
狹義 transport 及 metadata upstream helper 移入既有 Node server 專用的
`@drts/control-plane-auth`，原角色簽章與政策程式沒有行為變更。
兩 App 各自保留薄 route adapters，Passenger upstream 模組 re-export
同一函式；Ops Docker 不再複製 sibling App。Passenger 的 dependency、
Docker build 與 lock importer 同步，沒有新增 package 或服務。
原單元 mock 仍只替換 fs／metadata／遠端 API 邊界與個別 app adapter 的
upstream transport，不替換被測共用 handler。

原 fee guard 本機實跑 exit 1；修後同一 CLI 掃描 1,908 檔 exit 0。
套件直接 build exit 0；原入口／BFF／browser factory 與原三檔 caller／
失敗取證合跑 14 檔／157 項 exit 0，既有斷言不變。七個共用套件及
兩 App adapters 相關 TS 檔 scoped lint exit 0。
鎖定檔僅新增三行既有 workspace link，原 pinned dependency graph 保持；
一般全圖重解的暫存結果已捨棄，frozen-lockfile 隔離安裝實際 exit 0。
這些結果不冒領之前整體 build 的 ENOSPC 失敗或尚未執行的雲端 browser。
共用套件移動後，Passenger、Ops 的 Next route typegen／tsc 及根目錄
`pnpm typecheck:root` 均重新實跑，三者底層 exit 0。
