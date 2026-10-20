# Ops Shell 真 API 接線與原始產物驗收

c53／c7 的獨立 Ops Shell 工作流顯示成功，但原五項 UI 案例執行後，原 recorder 分別記錄 failed／exit1 與 BFF health、incidents、dispatch-events 的500。原工作流只啟動兩個前端，沒有真正的 API 與資料庫；單一 evidence.json 也由完全平行的測試共同寫入。這些原窄 UI 案例信用保留，不能代替完整遠端驗收。

本修補只調整既有 GitHub hosted 驗收接線：使用與原 route／PAX 套件相同的測試 API 契約，建立工作流專用 Postgres，執行原 migrations／seeds、build／start 真 API，再啟動原兩個前端。沿原60秒等待確認 API、兩個既有 BFF及原頁可讀，保存原有程序輸出供失敗診斷。產品 auth／IAP／realm／資料存取政策均未修改。

原五個 viewport、鍵盤與跨站導覽案例及全部原斷言、timeout、零重試保留。五例共用一個 recorder 的既有設計改採同一測試序列，避免互相覆寫產物；儲存後呼叫 recorder 原有 assertSuccess，讓工作流反映它已記錄的失敗，不改寫成功狀態或忽略500。

只有實際 hosted 五例、原始 recorder、API與兩 BFF 回讀全部通過，才可登錄本次限定範圍的正向證據。此工作仍只證既有 Shell UI 與真 API 接線，不表示全部業務流程、真人 Operator、正式上線或其他原始 acceptance keys 已完成。不在工作 VM 啟動任何產品、preview、browser 或 Postgres。
