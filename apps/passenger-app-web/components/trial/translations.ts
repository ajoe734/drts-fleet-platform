/** zh-TW copy for the self-serve trial (/trial). */
export const trialT = {
  title: "智行叫車 線上試用",
  intro:
    "這是測試環境，不會派出真實車輛，也不會向您收費。按下開始後，系統會為您建立一個測試帳號並綁定測試付款卡。",
  stepsTitle: "可以完整體驗",
  steps: [
    "預約叫車並確認車資",
    "派車後查看司機與車輛資訊、即時位置",
    "完成行程並取得電子乘車證明",
    "為行程評分，或提出客訴",
  ],
  start: "開始試用",
  starting: "正在建立測試帳號…",
  binding: "正在綁定測試付款卡…",
  failed: "無法開始試用，請稍後再試。",
  retry: "重試",
  termsLink: "測試環境使用說明",
  bannerLabel: "線上試用",
  bannerTitle: "線上試用・測試環境",
  bannerBody: "不會派出真實車輛，也不會實際扣款。",
  bookingNav: "叫車",
  historyNav: "我的行程",
  paymentNav: "付款方式",
  restart: "重新開始試用",
  consentNotice:
    "這是測試環境的使用說明，僅供體驗叫車流程，不提供實際乘車服務。",
  paymentNotice: "試用帳號使用測試付款卡，不會實際扣款。",
  addressMode: "選擇上下車地點",
  fixedAddresses: "示範地點",
  standardAddresses: "一般地址搜尋與目前位置",
  addressNotice: "切換方式會清除已選的上下車地點，請重新選擇。",
  termsTitle: "測試環境使用說明",
  termsBody: [
    "本網址為智行叫車的測試環境，供體驗叫車流程使用，不提供實際乘車服務。",
    "試用時建立的帳號、預約、行程、付款與評價都是測試資料：不會派出真實車輛、不會實際扣款，也不會發送簡訊或通知給真人。",
    "司機、車輛與付款卡皆為測試資料。請勿輸入真實的信用卡號、證件號碼或個人資料。",
    "電子乘車證明僅供展示，不能作為報帳或其他正式用途。",
  ],
  backToTrial: "回到試用",
  driverTitle: "測試司機",
  driverIntro: "測試環境沒有真實司機，請用下面的按鈕模擬司機的動作。",
  assign: "派一台測試車",
  assigning: "派車中…",
  enroute: "測試司機已出發，約 3 分鐘抵達上車地點。",
  arrive: "讓司機立即抵達",
  arrived: "司機已抵達上車地點。",
  board: "我已上車",
  onTrip: "行程進行中，抵達目的地後會自動結束。",
  complete: "立即抵達目的地",
  completed: "行程已完成。可以查看電子乘車證明、為這趟行程評分，或提出客訴。",
  cancelled: "這趟行程已取消。",
  waiting: "請稍候…",
  actionFailed: "操作沒有完成，請稍後再試。",
  supplyBusy: "測試車輛都在服務其他試用行程，請稍後再試。",
} as const;

/** Meeting points for the trial selector: illustrative locations, not
 * geocoder results, all inside the shared-dev TAIPEI_CORE service area
 * (lat 25.0005–25.125, lng 121.4505–121.625). Labels avoid rehearsal wording
 * because the address text is stored on the order and printed on the ride
 * certificate. 西門站 gives a ride long enough to watch live tracking. */
export const TRIAL_STOPS = [
  {
    addressId: "trial-banqiao-station",
    address: "新北市板橋區 板橋車站（示範地點）",
    lat: 25.0142,
    lng: 121.4636,
  },
  {
    addressId: "trial-new-taipei-city-hall",
    address: "新北市板橋區 新北市政府（示範地點）",
    lat: 25.012,
    lng: 121.4654,
  },
  {
    addressId: "trial-fuzhong-station",
    address: "新北市板橋區 府中站（示範地點）",
    lat: 25.0086,
    lng: 121.4593,
  },
  {
    addressId: "trial-jiangzicui-station",
    address: "新北市板橋區 江子翠站（示範地點）",
    lat: 25.0302,
    lng: 121.4722,
  },
  {
    addressId: "trial-ximen-station",
    address: "臺北市萬華區 西門站（示範地點）",
    lat: 25.0421,
    lng: 121.5082,
  },
] as const;
