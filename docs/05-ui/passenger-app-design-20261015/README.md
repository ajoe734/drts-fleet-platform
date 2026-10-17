# 乘客 App 設計稿 v2（2026-10-15）

這是使用者在互動 session 以 Claude Design 重畫、於 2026-10-15 交付的 28 張乘客畫板，依 2026-10-10 設計規格整併。來源為 canonical machine root 下的 `.local/passenger-app-20261009/claude-design-20261015/project/`；`canvas.json` 與全部 `.dc.html` 逐位元組保留，包括原始檔名、時間 metadata、畫板尺寸與分頁。`Main.dc.html` 即 **AU-01**。

[線上畫布](https://claude.ai/artifact/MwuW2r8LLfna7iCcYmYu2A) **只有使用者能開**。`.dc.html` 需要 Claude Design 的執行環境（含 `support.js`／`x-dc`）才能顯示；repo 內的檔案是存檔與對照用，不是可獨立預覽的網頁。本次不補寫執行環境，也不在 VM 啟動預覽。

自 2026-10-15 起，登入、帳號、叫車表單、行程紀錄與付款以本目錄 AU／AC／BK／TR／PM 畫板為準。舊 A／B 畫板已取代、保留追溯；詳見[舊新對照](../drts-design-canvas/passenger-account-screen-contract-20261010.md)。既有 P5-01～12、P5-A03／A04、E-04、E-18／18b、E-19a／19b 繼續適用，費率與取消文案依 2026-10-10 使用者決定修正。

視覺沿用 P5 canvas 與 `packages/ui-tokens/src/realms.ts` 的 passenger 品牌；本次沒有重新設計。API 依[SA／SD §3](../../02-architecture/passenger-app-20261009/01_system_sa_sd.md)，表列 API 是後端路徑，瀏覽器仍須經 BFF，不表示畫板或全部操作已實作。

## 畫面、狀態與實作對照

狀態逐字取自每個手機框上方的「｜」標籤；同一畫板可能並排多個狀態。實作欄是對應 task，不代表該 task 已完成。

| 畫面 ID | 檔名                           | 畫面名稱               | 狀態清單（原標籤）                                                                     | 對應 API／契約                                                                                                                                     | 對應實作 task               |
| ------- | ------------------------------ | ---------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| AU-01   | [Main.dc.html](Main.dc.html)   | 登入入口               | 五種方式都可用；手機尚未開通（不顯示手機入口）；全部暫停                               | GET /api/passenger-app/auth/providers                                                                                                              | PAX-WEB-AUTH-UI-20261009    |
| AU-02   | [AU-02.dc.html](AU-02.dc.html) | 輸入手機號碼           | 空白；格式錯誤；傳送中；傳送太頻繁                                                     | POST /api/passenger-app/auth/otp/request                                                                                                           | PAX-WEB-AUTH-UI-20261009    |
| AU-03   | [AU-03.dc.html](AU-03.dc.html) | 輸入驗證碼             | 輸入中；驗證中；錯誤（顯示剩餘次數）；已過期；次數用完；可重新傳送                     | POST /api/passenger-app/auth/otp/verify；POST /api/passenger-app/auth/otp/request（重送）                                                          | PAX-WEB-AUTH-UI-20261009    |
| AU-04   | [AU-04.dc.html](AU-04.dc.html) | 輸入 Email             | 已填寫；格式錯誤                                                                       | POST /api/passenger-app/auth/otp/request                                                                                                           | PAX-WEB-AUTH-UI-20261009    |
| AU-05   | [AU-05.dc.html](AU-05.dc.html) | 第三方登入處理中       | 導向中；返回處理中；等待過久                                                           | POST /api/passenger-app/auth/oauth/:provider/start；POST /api/passenger-app/auth/oauth/:provider/callback                                          | PAX-WEB-AUTH-UI-20261009    |
| AU-06   | [AU-06.dc.html](AU-06.dc.html) | 第三方登入失敗或取消   | 使用者取消；提供者錯誤；連結過期                                                       | OAuth start／callback 的錯誤或取消呈現（同 AU-05）                                                                                                 | PAX-WEB-AUTH-UI-20261009    |
| AU-07   | [AU-07.dc.html](AU-07.dc.html) | 登入方式已屬於其他帳號 | 綁定衝突                                                                               | OAuth callback／OTP verify 的綁定衝突呈現（不自動合併）                                                                                            | PAX-WEB-AUTH-UI-20261009    |
| AU-08   | [AU-08.dc.html](AU-08.dc.html) | 同意服務條款與隱私權   | 未勾選（按鈕停用）；已勾選                                                             | PATCH /api/passenger-app/me（條款／隱私版本）                                                                                                      | PAX-WEB-AUTH-UI-20261009    |
| AC-01   | [AC-01.dc.html](AC-01.dc.html) | 帳號首頁               | 完整資料；未填聯絡手機（提醒後才能叫車）；手機未驗證                                   | GET /api/passenger-app/me                                                                                                                          | PAX-WEB-AUTH-UI-20261009    |
| AC-02   | [AC-02.dc.html](AC-02.dc.html) | 編輯個人資料           | 編輯中；格式錯誤；儲存成功                                                             | PATCH /api/passenger-app/me                                                                                                                        | PAX-WEB-AUTH-UI-20261009    |
| AC-03   | [AC-03.dc.html](AC-03.dc.html) | 驗證聯絡手機           | 輸入驗證碼；驗證成功；簡訊尚未開通（可叫車）                                           | POST /api/passenger-app/auth/otp/request；POST /api/passenger-app/auth/otp/verify（purpose=verify_contact_phone）；GET /api/passenger-app/settings | PAX-WEB-AUTH-UI-20261009    |
| AC-04   | [AC-04.dc.html](AC-04.dc.html) | 登入方式管理           | 多種方式；只剩一種（解除停用）；解除確認；綁定衝突                                     | GET /api/passenger-app/me/identities；DELETE /api/passenger-app/me/identities/:id；綁定沿用 OTP／OAuth（purpose=link）                             | PAX-WEB-AUTH-UI-20261009    |
| AC-05   | [AC-05.dc.html](AC-05.dc.html) | 登出確認               | 確認視窗                                                                               | POST /api/passenger-app/auth/logout                                                                                                                | PAX-WEB-AUTH-UI-20261009    |
| AC-06   | [AC-06.dc.html](AC-06.dc.html) | 刪除帳號               | 說明；確認；完成；有未付款（導向 PM-04）；有進行中行程                                 | DELETE /api/passenger-app/me                                                                                                                       | PAX-WEB-AUTH-UI-20261009    |
| BK-01   | [BK-01.dc.html](BK-01.dc.html) | 叫車表單               | 空白；全部填好；未登入（導向 AU-01）；缺聯絡手機（導向 AC-02）；有未付款（導向 PM-04） | GET /api/passenger-app/settings；POST /api/passenger-app/quotes；POST /api/passenger-app/rides（經 E-19b 確認後）                                  | PAX-WEB-BOOKING-UI-20261009 |
| BK-02   | [BK-02.dc.html](BK-02.dc.html) | 地址搜尋               | 輸入中；搜尋中；候選清單（同名地點）；查無結果；超出服務範圍；地址服務暫時無法使用     | GET /api/geo/search；GET /api/geo/resolve（SD §3 尚未列 geo 的乘客 BFF 邊界）                                                                      | PAX-WEB-BOOKING-UI-20261009 |
| BK-03   | [BK-03.dc.html](BK-03.dc.html) | 地圖選點               | 可用；超出服務範圍（確認停用）；地圖載入失敗                                           | GET /api/geo/reverse；POST /api/passenger-app/quotes（服務範圍；geo 同 BK-02 邊界待核對）                                                          | PAX-WEB-BOOKING-UI-20261009 |
| BK-04   | [BK-04.dc.html](BK-04.dc.html) | 預約時間               | 可選；選到太近的時間；超出可預約範圍                                                   | GET /api/passenger-app/settings（minLeadTimeMinutes；日期／時間本地選擇）                                                                          | PAX-WEB-BOOKING-UI-20261009 |
| BK-05   | [BK-05.dc.html](BK-05.dc.html) | 試算結果               | 試算中；試算結果（明細展開）；試算已過期（重新試算）；無法試算（接 P5-A04）            | POST /api/passenger-app/quotes；GET /api/passenger-app/fares                                                                                       | PAX-WEB-BOOKING-UI-20261009 |
| TR-01   | [TR-01.dc.html](TR-01.dc.html) | 行程紀錄               | 清單（進行中、可評價、付款失敗、已取消）；載入更多（載入中骨架）；登入已過期           | GET /api/passenger-app/rides；GET /api/passenger-app/rides/active；詳情／ratings／receipt 沿用既有畫面                                             | PAX-WEB-RIDE-UI-20261009    |
| TR-02   | [TR-02.dc.html](TR-02.dc.html) | 行程紀錄空狀態         | 還沒有行程                                                                             | GET /api/passenger-app/rides（空清單）                                                                                                             | PAX-WEB-RIDE-UI-20261009    |
| TR-03   | [TR-03.dc.html](TR-03.dc.html) | 客訴與遺失物           | 未填寫；選遺失物；字數超過；送出中                                                     | POST /api/passenger-app/rides/:id/complaints                                                                                                       | PAX-WEB-RIDE-UI-20261009    |
| TR-04   | [TR-04.dc.html](TR-04.dc.html) | 申訴已送出             | 完成                                                                                   | POST /api/passenger-app/rides/:id/complaints（結果 complaintId）                                                                                   | PAX-WEB-RIDE-UI-20261009    |
| PM-01   | [PM-01.dc.html](PM-01.dc.html) | 付款方式               | 有卡；卡片已過期／已失效；空狀態                                                       | GET /api/passenger-app/payment-methods；PUT /api/passenger-app/payment-methods/:id/default                                                         | PAX-WEB-PAYMENT-UI-20261009 |
| PM-02   | [PM-02.dc.html](PM-02.dc.html) | 新增信用卡             | 輸入中；處理中；需要 3D 驗證；成功；卡片被拒；金流暫時無法使用                         | POST /api/passenger-app/payment-methods（PSP hosted fields；可能 action_required）                                                                 | PAX-WEB-PAYMENT-UI-20261009 |
| PM-03   | [PM-03.dc.html](PM-03.dc.html) | 叫車時選卡             | 有預設卡；沒有卡（確認停用）；更換卡片清單                                             | GET /api/passenger-app/payment-methods；本地選卡 → POST /api/passenger-app/rides（paymentMethodId，經 E-19b）                                      | PAX-WEB-PAYMENT-UI-20261009 |
| PM-04   | [PM-04.dc.html](PM-04.dc.html) | 扣款失敗／有未付款     | 扣款失敗通知；叫車前的阻擋提示；重新扣款成功                                           | GET /api/passenger-app/rides/:id；POST /api/passenger-app/payment-methods（更新卡片）；SD §3 未定義乘客重新扣款 API，畫板補救操作待契約補齊        | PAX-WEB-PAYMENT-UI-20261009 |
| PM-05   | [PM-05.dc.html](PM-05.dc.html) | 刪除卡片               | 一般卡；預設卡（先指定其他預設）；唯一一張且有進行中行程（不可刪除）                   | DELETE /api/passenger-app/payment-methods/:id；PUT /api/passenger-app/payment-methods/:id/default（先變更預設）                                    | PAX-WEB-PAYMENT-UI-20261009 |

## 示意值與待補契約

- **前置 30 分鐘**：BK-04 的示意值。正式值取 `GET /api/passenger-app/settings` 的 `minLeadTimeMinutes`，不得寫死。
- **可預約 7 天**：BK-04 示意上限；SA／SD 尚未提供正式上限欄位，不視為產品決策。
- **客訴 500 字**：TR-03 示意上限；不是 E-18 評價的 200 字規則，也不代替正式 API 驗證限制。
- **案件編號格式**：TR-04 顯示值為示意，正式顯示 API 回傳 `complaintId`，不保證圖中的前綴與編碼。
- **第三方與卡別標誌**：Google／Facebook／LINE 圖示及卡別標誌為佔位；上線時依品牌資產與 PSP 回傳卡別呈現，不代表已串接。
- 金額、姓名、地址、車牌、卡片末四碼與行程資料皆為示意。條款與隱私權政策的全文／正式網址待公司提供，檔案內 anchor 不是已發布的政策頁。
- **PM-04 補救缺口**：畫板含「更新卡片並重新扣款／重新扣款成功」，SA／SD §3 未提供乘客重扣 command；保留設計，實作前須補契約，不能挪用平台退款 API。
- **Geo 邊界**：BK-02／03 對應既有 geo API，但 SA／SD §3 尚未明訂乘客 BFF 存取契約；沿用舊 contract 的未決註記，不據此新增授權。

## 與設計規格的核對與缺口

來源規格為 canonical machine root 的 `.local/passenger-app-20261009/claude-design-20261015/design-spec-20261010.md`。28 個 ID 全部齊全；表中的狀態忠實反映來源，不能把規格要求當成已繪製狀態。

- **AU-04（未解設計缺口）**：規格要求同 AU-02 的空白、格式錯誤、傳送中、傳送太頻繁；來源實際只有「已填寫、格式錯誤」。缺空白、傳送中、傳送太頻繁，需原設計來源補稿後再匯入；本次禁止重畫或改動匯入檔。
- PM-01 將卡片已過期與已失效合併為同一框；TR-01 在同一清單框呈現進行中、可評價、付款失敗與已取消，另有載入更多及登入已過期框，並非每個行程狀態獨立一框。
- AC-03 多畫輸入驗證碼；AU-05 多畫等待過久以呈現返回選項；這些是來源既有內容，照原樣保留。

匯入 hash、逐項文字差異、靜態檢查與未驗項目見 [UAT 紀錄](../../04-uat/passenger-app-20261009/PAX-DESIGN-V2-20261015.md)。完整設計狀態符合性仍受上述 AU-04 缺口限制。
