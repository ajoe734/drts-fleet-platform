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
