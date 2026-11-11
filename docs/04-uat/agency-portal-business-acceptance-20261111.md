# 機關網站登入後業務流程驗收

機關網站原有公開入口檢查只開啟首頁、登入與邀請頁，不能證明登入後的趟次、報表及匯出下載可用。此案例接在既有 `ui-bureau-acceptance-e2e` 的乘客驗收之後，讀取該流程正常完程後留在同一個 PostgreSQL 資料庫的趟次，再從機關網站完成查詢與下載。

## 執行環境與資料來源

- 使用既有 `ci-integ.yml` 的 GitHub-hosted runner、PostGIS 服務與 `drts_bureau_acceptance` 資料庫。原本的 migration、seed 與乘客案例照原順序執行；機關案例之前不清除或重建資料庫。
- 原乘客案例完成一般叫車、派車、司機行程與完程，正式趟次紀錄由原應用程式寫入。機關案例要求至少一筆保留期限內的真趟次，再依該紀錄的 ID 查明細與匯出。
- API 使用原編譯結果，機關網站沿用現有路由驗收的 Next development server 方式；兩者只在 GitHub runner 啟動。完整 workspace 的正式 build 仍由既有 CI build job 驗證。
- 這台開發 VM 不執行本瀏覽器案例、產品伺服器或 PostgreSQL。VM 上只可做必要型別、lint、格式與靜態查核。

## 服務情境

1. 測試管理員透過原 token API 取得本測試環境的管理 session，使用正常機關目錄與邀請 API 建立本次測試機關及匯出角色邀請。
2. 原郵件服務把邀請寄到明示 SIM 的 loopback SMTP 收件端。測試從該封郵件取得邀請連結，不新增回傳原始邀請 token 的 API。
3. 瀏覽器開啟邀請頁，沿原 BFF 取得 API 發出的 state；只有 Google authorization redirect 與既有離線 code exchange 是 SIM。Callback 仍由真 API 綁定邀請及發出機關 session，BFF 寫入原 cookies。
4. 以原 `/api/auth/session` 確認 active、agency realm、機關 ID 與匯出角色，再檢查機關首頁及既有受保護頁面。
5. 查詢趟次清單並要求非空，開啟同一筆真趟次的明細，核對 record／order／trip；查詢司機、車輛資格及 R09／R10／R12 報表的原 API 與頁面。
6. 在原匯出畫面指定這一筆趟次，預覽應為一筆；填寫用途，建立真匯出工作，更新狀態到完成，再取得原受控下載連結。
7. 透過機關網站的原 `/downloads` rewrite／proxy 下載真 CSV bytes，核對非空內容、既有欄位及該筆趟次 ID。前置資料不存在、API 失敗或下載空檔，均保留失敗結果。

## 真實與 SIM 分界

機關邀請、API-issued state／session、機關頁面、趟次與報表查詢、匯出工作及 CSV 下載均使用原應用程式。測試不攔截或替換內部 API 回覆，也不直接填入機關 JWT 或偽造趟次資料。

郵件外部送達與 Google 身分提供者使用 SIM；原乘客案例中的簡訊、支付供應商、GPS、車輛設備資格及計程表數值依該案例標示為 SIM。此驗收不代表已對接真 Google 帳號、郵件已寄到真人信箱、已真實收單或已在實體車輛執行。

## 證據與目前狀態

既有 job 會依序執行：

```bash
pnpm exec playwright test -c playwright.pax-bureau-acceptance.config.ts
pnpm exec playwright test -c playwright.agency-portal-business.config.ts
```

機關結果上傳為 `agency-portal-business-<run_id>`，來源目錄為 `.artifacts/agency-portal-business`。結果需保留實際 checkout SHA、正常前置趟次、機關、匯出 job 及檔案大小等關聯事實，並與該固定版本 CI 對應。

這是新增驗收來源，尚未以其最終提交完成 hosted browser 執行；不沿用較早版本的 CI 成功當作本案例通過。主控仍需協調採用後的同版本 Cloud Run、正式發布與實際外部服務驗收。
