/** zh-TW copy for the bureau-review reference page follows the Passenger app's existing translation resources. */
export const t = {
  title: "新北市交通局審查入口",
  statusIntroPrefix:
    "本頁本身唯讀，不提供建立訂單、取消、派遣或司機端操作；下方連結導向的",
  statusIntroAnd: " 與 ",
  statusIntroSuffix: "才是乘客可實際操作的既有入口，沿乘客本人身分登入與操作。",
  accessHeading: "存取方式與範圍",
  accessAvailableIntro:
    "本服務目前可直接用一般瀏覽器開啟，不需要任何 Google 帳號登入、技術權杖或憑證檔案：",
  loginLinkDesc:
    "— 乘客本人登入（手機號碼或既有帳號，依既有驗證方式），非交通局專屬帳號。",
  reviewLinkDesc: "— 既有共享演練操作頁（需負責單位先行啟用）。",
  noPublicUrlPrefix:
    "本環境尚未開放對外的公開網址，一般瀏覽器暫時無法經由本服務的公開網址到達",
  noPublicUrlMid: "。負責單位需先完成網域、DNS 與憑證設定（詳見",
  noPublicUrlSuffix:
    "），本頁才會顯示實際可開啟的網址；在那之前，不應把本頁本身當作已解除 403 的證據。",
  driverScopeNote:
    "司機端的上線演練與調度派遣控制畫面不在這個對外入口的範圍內：即使以上網址已經公開，一般使用者與交通局承辦同仁都無法透過這個入口看到或操作司機端功能，只能使用乘客本人既有的登入、預約與行程頁面。",
  fullConfigPrefix: "完整的部署設定、權限細節與操作指令留在",
  fullConfigSuffix: "，本頁只呈現一般使用者需要知道的存取方式與範圍。",
  verifiedCasesHeading: "已驗證案例摘要",
  sourceSnapshotLabel: "來源快照：",
  sourceSnapshotSeparator: "），檢查時間",
  stageGroupHeader: "階段群組",
  stepCountHeader: "步驟數",
  resultHeader: "結果",
  totalLabel: "合計",
  caseListHeading: "案例清單（UC01–UC16）",
  caseListIntro:
    "每一案例可展開查看前提、步驟、預期結果、實際驗證內容與尚未覆蓋的部分；狀態文字逐案各自撰寫，不套用單一通過／不通過標籤，避免掩蓋個別案例的實際缺口。",
  scenarioLabel: "情境：",
  preconditionLabel: "前提：",
  stepsLabel: "步驟：",
  expectedLabel: "預期結果：",
  verifiedLabel: "實際驗證：",
  missingLabel: "尚未覆蓋：",
  archiveHeading: "完整原圖與離線封存",
  archivePrefix:
    "本頁上方已逐案列出詳細步驟與驗證內容；若需要原始畫面截圖，另有雜湊驗證之離線示範包（",
  archiveMid: "個檔案，SHA-256",
  archiveSuffix:
    "）作為補充，可向負責單位索取；本頁的案例清單本身已是可直接閱讀的完整紀錄，不是離線包的替代摘要。",
} as const;
