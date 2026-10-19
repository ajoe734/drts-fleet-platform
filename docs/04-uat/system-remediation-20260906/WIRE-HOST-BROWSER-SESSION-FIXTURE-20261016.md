# WIRE：各車主瀏覽器使用實際已建立的 session

同版獨立 WIRE run 38910408520 的 full AppModule／PostgreSQL 五例通過；瀏覽器四例通過、一例失敗。Host B 頁面缺少 UAT-B001，原圖顯示 UAT-A001／UAT-A002。

原瀏覽器前置只送 `x-host-partner-id`。目前產品 Host client 使用登入 session，忽略該舊選擇標頭，因此兩個瀏覽器都落到此隔離 runner 的固定 Host A fallback。既有 `createWireApp` 已透過實際 JwtAuthService／durable session 產生 Host A、B token，卻未交給瀏覽器。

本次將同一個已執行中的 Wire app 所產生的兩個 session 交給各自瀏覽器的既有 `drts_session` cookie。暫存檔位於 runner 的 tmpdir，關閉時移除，不在既有 evidence artifact 目錄中；不新增測試 token endpoint。原各車主車輛、他人車牌不存在、受限導覽、詳情與錯誤斷言、等待上限及所有測試案例保持。

產品程式、登入／角色／session 政策、原 API 五例不變。真正驗收須在此候選的既有 GitHub hosted WIRE workflow 重新執行並核對五 API／五 browser、零跳過；舊失敗不算通過。VM 不啟動產品、資料庫或瀏覽器測試服務。
