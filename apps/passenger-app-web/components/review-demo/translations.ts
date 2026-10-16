/** zh-TW review copy follows the Passenger app's existing translation resources. */
export const t = {
  operationFailed:
    "操作未完成，請檢查演練配置或稍後重試；沒有切換至本機假訂單。",
  entryTitle: "交通局同單審查演練",
  sharedOrderIntro:
    "乘客、調度、司機共用 API 與資料庫中的同一張訂單。每一輪新建三筆獨立訂單，畫面上的 UUID 是跨視窗核對依據。",
  simulationNotice:
    "簡訊、圖資、車司資格、GPS、PSP、通知均為明示模擬；不出車、不扣款、不通知真人，下載非正式憑證。",
  disabled: "此環境尚未啟用共享演練，或目前仍在本機 demo。",
  enterShared: "進入共享後端演練（保留本機 demo 資料）",
  passengerAccount: "乘客演練帳戶",
  signedIn: "已登入乘客",
  bindStep: "1. 綁定演練付款方式",
  bookStep: "2. 選新北起訖與未來預約時間，試算並確認叫車",
  historyStep: "3. 歷史與取消紀錄",
  logout: "登出／換乘客",
  phoneRange: "演練手機（0900000000–0900000099）",
  phoneLabel: "演練手機",
  smsInboxNotice:
    "這是合成 SMS 收件匣，驗證碼不會發給真人。驗證後建立真正演練帳戶與 session。",
  consent: "我了解本次模擬範圍，並同意",
  termsLink: "演練條款與隱私說明",
  requestSms: "取得模擬簡訊",
  smsCode: "模擬簡訊驗證碼：",
  codeExpiry: "（5 分鐘有效）",
  login: "驗證並登入演練帳戶",
  requestAgain: "重新取得",
  stepsTitle: "三視窗操作順序",
  driverWindow: "開啟真 Driver 演練視窗",
  opsWindow: "開啟已授權 Ops 操作視窗",
  copyOrderStep: "乘客確認叫車後，複製行程網址中的 UUID。",
  dispatchStep:
    "在已登入的 Ops「派遣」找到此 UUID，建立派遣並指派合格演練車司；改派與無車沿現有操作。",
  driverStep:
    "司機用有效裝置註冊碼登入 Driver Web，任務確認同 UUID，依序接單、出發、抵達、開始、完成。模擬位置須開啟並推進，才能累積 tracker 里程。",
  updatesStep:
    "乘客保持行程頁，觀察即時狀態；暫停位置可觀察過期，停網後恢復可觀察重連。",
  journeysStep:
    "第一單正常付款與五星；第二單先選失敗付款方式、完程後依政策補繳與低分案件；第三單取消後回歷史讀回。",
  localDemo: "原本機功能示範",
  termsTitle: "共享演練條款與隱私說明",
  termsVersion:
    "版本 review-terms-v1 / review-privacy-v1。本入口供審查演練，不提供實際運輸服務。",
  termsPersistence:
    "僅使用合成聯絡資料。演練帳戶、預約、派遣、司機任務、模擬付款、評價及內部案件寫入共享開發資料庫，由授權演練人員操作與讀取；重新整理不會刪除。",
  termsSimulation:
    "簡訊、圖資、車司資格、定位、支付及通知為模擬，無實際派車、收款或真人通知。請勿輸入真卡號、證件、電話或真實乘車個資。下載文件不供正式報帳，不代表已取得營運許可。",
  backToReview: "回演練入口",
  recordFailed: "無法讀取本人同單演練紀錄，請重新登入後重試。",
  recordTitle: "演練紀錄・非正式憑證",
  recordOrderId: "訂單 UUID：",
  recordStatus: "狀態：",
  recordPayment: "；付款：",
  notCharged: "未扣款",
  recordAttempts: "；扣款次數：",
  downloadHtml: "下載演練紀錄 HTML",
  backToRide: "回同單行程",
  bannerLabel: "同單審查演練",
  bannerTitle: "同單審查演練・真實後端資料",
  bannerSimulation:
    "簡訊、圖資、車司資格、定位、付款與通知為模擬，不出車、不扣真款、不通知真人。下載資料非正式憑證。",
  leadTimeNotice:
    "演練預約前置時間為 1 分鐘；請依畫面設定未來時間，實際等到預約時間才開始。車資依當下日夜間費率計算。",
  reviewNav: "演練操作",
  bookingNav: "預約",
  historyNav: "歷史",
  paymentNav: "演練付款方式",
  rideLabel: "演練同單核對",
  realOrderId: "真實訂單 UUID：",
  rideNotice:
    "調度與司機視窗必須核對同一 UUID。付款結果由模擬 PSP 寫入真實演練付款紀錄。",
  retryQueued:
    "已交由原付款程序處理；未到重試時間不會提早扣款。請等待行程付款狀態更新。",
  retryFailed: "補繳未完成，請確認登入與付款配置後重試。",
  retryPayment: "依既有政策重試演練付款",
  downloadRecord: "下載同單演練紀錄（非正式憑證）",
  pspScenario: "模擬 PSP 結果（新綁的付款方式）",
  pspLabel: "模擬 PSP 結果",
  captureSuccess: "完程扣款成功",
  captureRetry: "首次完程扣款失敗，依政策補繳成功",
  captureNotice:
    "結果隨本次演練 token 保存；每張訂單各自重試，不修改已建立訂單。",
} as const;
