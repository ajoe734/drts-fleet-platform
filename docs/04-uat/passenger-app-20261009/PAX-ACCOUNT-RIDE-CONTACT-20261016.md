# 帳號乘客的同單聯絡功能

原帳號模式下，「聯絡司機」直接由前端回傳固定客服電話，沒有送出聯絡請求。原BFF已允許同單contact路徑，但帳號API controller與SDK缺少接線。這是內部功能缺漏；外部電話服務未提供不能取代這段實作。

本次沿既有booking owner檢查，新增帳號乘客contact controller入口；帳號與原token入口共用既有MultiTaxi聯絡服務及MaskedCallPort。SDK與實際乘客頁現在送出同單POST並讀取後端option。外部服務不可用時先顯示無法聯絡司機、重試及明確客服連結，不自動把「聯絡司機」變成客服撥號。

原BFF路徑、身份傳遞、realm與owner政策、token scopes、不可聯絡的行程狀態、外部port不可用預設及既有客服替代規則均沿用；沒有新增權限機制或電話provider。原P5-CALL-001的blocked_ext／真實供應商驗收不因此結案。

## 驗證

- 原ec24的真facade回歸：預期送同單contact命令，實際fetch為0次，1例失敗。
- 修補後15例通過：真SDK／facade回應解析、token原路徑、real controller與MultiTaxi服務、既有owner／終態結果、外部port成功／缺席／失敗，以及掛載乘客頁的替代畫面與重試。只在儲存／HTTP／外部電話邊界注入資料，不啟動VM產品或資料庫。
- 受影響的網頁／流程回歸189例通過（包含這15例），原後端masked-call／passenger authority另15例通過；root及workspace型別檢查34工作成功（29個cache），最後root再驗通過，lint／format通過。這些本機結果不代替候選自己的完整CI或共享瀏覽器。
- 既有additional旅程加入D接單後的真帳號contact POST201、原缺席理由、明確客服與重試按鈕、同單狀態不變及一張原圖；不點擊電話連結。原ABC48、D/E/F其餘39階段、6筆不同訂單、原生確認取消、報價與實際等待保留。新預期為追加40階段／12張PNG；這些預期須由本候選自己的CI與共享部署各自實測。

真masked-call port的正向結果只由外部邊界測試示意，不代表已撥真人或取得真供應商資格。完整真機、電話、道路、production及全系統驗收仍保留原要求。
