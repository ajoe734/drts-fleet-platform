# 調度演練設定入口修補

乘客、調度、司機必須操作同一筆持久化後端訂單。三角色流程尚未在共享
Cloud Run 完整通過，不能將來源測試通過視為現場展示已完成。

## 已觀察的失敗

`publish/v2026.10.16.2`（`a1dcfded7c5af92e13b5d24c5d955f112557b7f4`）
已部署服務，但 [Deploy Dev 38872199323](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38872199323)
的三角色測試停在調度準備車司之前。調度頁向
`/control-plane-proxy/passenger-app/review-demo/config` 發出 GET，收到 401，
因此沒有顯示準備按鈕；該次測試未進入建單步驟。

## 修補

調度頁改查詢 `/api/ops/review-demo/config`，由既有 Ops BFF 與
`ReviewDemoOpsController` 處理，與原有 `prepare` 使用相同的調度角色。
乘客設定入口繼續供乘客頁使用。

`ops-prepare-route.test.tsx` 以真實頁面、BFF、guard 及 controller，分別驗證
來源 CI 與共享 dev 的設定差異。共享 dev 案例設定 `AUTH_MODE=explicit`
與合成 internal key，重現舊查詢遭拒、按鈕消失的行為，再驗證修補後
設定讀取及準備操作均成功。測試不啟動伺服器，供給準備使用測試替身；
實際資料庫與完整行程驗收仍由既有 hosted lane 執行。

## 驗收

1. 跑相關單元回歸、型別與 lint，並取得此候選自己的完整 CI。
2. 沿原發布流程部署固定版本至共享 dev，再跑既有三角色 ABC。
3. 每單核對乘客建單、調度指派、司機任務及完程、付款、評價／案件與
   歷史讀回的同一 `orderId`；保留畫面及後端讀回。
4. SMS、車司資格、GPS 與 PSP 保持明示模擬。三角色訂單與狀態必須走
   真實後端；完整共享流程通過後，才交付交通局現場操作材料。

## 共享環境實測與乘客登入續修

`publish/v2026.10.16.3`（正常合併 `90e37f802`）的
[Deploy Dev 38884103030](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38884103030)
已實際更新十個服務並通過健康檢查，常規 operational 16 例全部通過。
三角色演練中，調度設定 GET 200、準備 POST 201、司機邀請及裝置註冊
POST 201，證實前述調度入口修補在共享環境生效。

本次演練接著停在乘客 `POST /api/passenger-app/review-demo/otp`，收到
403 `CSRF_CHECK_FAILED`，尚未登入或建立新訂單。原 BFF 將 Next standalone
的內部 HTTP listener 網址當成瀏覽器來源；Cloud Run 終結 TLS 後，兩者
不相同。續修以請求 Host 還原瀏覽器 authority，production 對外使用
HTTPS；本機來源 lane 保留精確的 HTTP loopback host 與 port。

`hosted-passenger-origin.test.ts` 以真 NextRequest 與 BFF，重現內部
`http://0.0.0.0:3009`、對外 HTTPS Host／Origin 的組合；只替換上游
HTTP，驗證 OTP 正常轉送，並保留缺少來源、不同主機／協定／port
遭拒的斷言。Forwarded Host 不參與判定。本機不啟動產品伺服器。

本續修仍須自己的完整 CI、正常發布及新的共享三角色 ABC；前述
operational 16 例與來源 CI 不能代替共享新訂單、付款、評價及 E04 驗收。

本地續修驗證：新增的對外 origin 回歸修補前 4 例失敗、修補後 16 例
全通過；乘客登入、訂位、付款與三角色入口等相關回歸共 572 例通過、
0 失敗。原有 3 例 hosted PostgreSQL 案例由既有條件排除，留給雲端 CI
實跑。Passenger 型別、lint、格式及測試路徑檢查通過。
