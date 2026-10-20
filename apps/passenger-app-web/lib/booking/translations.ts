import type { FareVersion } from "@drts/contracts";
export const BOOK_T = {
  realmName: "乘客叫車",
  pickup: "上車地點",
  reviewAddressMode: "演練選址方式",
  reviewFixedAddresses: "固定演練點（模擬）",
  reviewStandardAddresses: "一般地址搜尋與目前位置",
  reviewAddressNotice:
    "一般選址使用瀏覽器定位與既有地址查詢，圖資來源依本環境設定；切換方式會清除起訖地點，請重新確認。簡訊、車司資格、司機定位、支付與通知仍依演練設定。",
  currentLocation: "使用目前位置",
  locating: "正在取得目前位置…",
  locationUnsupported: "此瀏覽器無法取得目前位置，請搜尋或手動選擇上車地點。",
  locationDenied: "未允許使用目前位置，您仍可搜尋或手動選擇上車地點。",
  locationUnavailable: "目前無法取得位置，請重試或搜尋上車地點。",
  locationTimeout: "取得位置逾時，請重試或搜尋上車地點。",
  locationAddressError: "無法解析目前位置的地址，請重試或搜尋上車地點。",
  dropoff: "下車地點",
  time: "預約時間",
  book: "建立乘車需求",
  confirm: "確認叫車",
  quote: "試算車資",
  quoting: "正在試算車資...",
  retrySettings: "重試取得設定",
  loadingSettings: "正在取得叫車設定...",
  missingSettings: "叫車設定尚未就緒",
  settingsError: "無法取得叫車設定，請重試。",
  acknowledgementError: "無法更新費用確認紀錄，請重試。",
  acknowledge: "我已閱讀並同意",
  disclosureFooter: "下單前將再次顯示費用摘要供您確認",
  unverifiedPhone:
    "聯絡手機尚未驗證；此驗證與登入手機號碼驗證各自獨立，請前往帳號管理完成聯絡手機驗證。",
  account: "前往帳號管理",
  disclosure: "費用與優惠說明",
  rules: "費用規則",
  fullFees: "查看完整費用與優惠說明",
  payment: "支付方式",
  estimatedFare: "預估車資",
  paymentPending: "請使用付款方式選擇介面選卡；尚未選擇時不會送出叫車。",
  checkbox: "我已確認費用與優惠說明",
  modify: "返回修改",
  confirmationFooter: "系統將記錄您的確認時間，作為爭議處理依據",
  support: "聯絡客服",
  refreshSettings: "重新載入費用與設定",
  retryQuote: "重新取得報價",
  retrySame: "重試同一筆叫車請求",
  expired: "費率試算已過期，請重新試算。",
  notServiceable: "您選擇的地點超出目前服務範圍",
  changedFare: "費率版本已更新，請重新載入費用與設定。",
  shortLead: "預約時間不符合最短前置時間規定",
  noQuote: "目前無法取得正式報價，請稍後重試或聯絡客服。",
  noCreate: "無法送出叫車，請確認帳號與付款方式後重試。",
  unknownCreate: "尚未確認叫車結果；重試會使用同一筆請求，請勿另建行程。",
  publicFares: "公開計費說明",
  tariffAuthority: "依臺北市政府公告計程車運價",
  currentRegulation: "本頁依主管機關公告之現行運價揭露",
  publicError: "目前無法取得公開費率，請稍後重試。",
  publicRetry: "重試公開費率",
  publicLoading: "正在取得公開費率...",
  home: "返回叫車首頁",
  lead: (minutes: number) =>
    `本服務僅提供預約叫車，至少提早 ${minutes} 分鐘預約。`,
  phone: (verified: boolean) =>
    `請先在帳號管理填寫${verified ? "已驗證" : "聯絡"}手機號碼。`,
  quoteVersion: (version: string, expiry: string) =>
    `費率版本 ${version} · 試算有效至 ${expiry}`,
  timeValue: (value: string) => `預約時間 ${value.replace("T", " ")}`,
  fareStamp: (version: string, effective: string) => {
    const versionStamp = `版本 ${version} · 生效日 ${effective}`;
    if (
      typeof effective !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(effective)
    )
      return versionStamp;
    const instant = new Date(effective);
    const calendarDate = new Date(`${effective.slice(0, 10)}T00:00:00Z`);
    // Date parsing normalizes invalid days; those cannot become an announcement.
    if (
      !Number.isFinite(instant.getTime()) ||
      !Number.isFinite(calendarDate.getTime()) ||
      calendarDate.toISOString().slice(0, 10) !== effective.slice(0, 10)
    )
      return versionStamp;
    const parts = new Intl.DateTimeFormat("zh-TW-u-ca-roc", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const date = ["year", "month", "day"]
      .map((type) => parts.find((part) => part.type === type)?.value)
      .join("/");
    return `依臺北市政府公告計程車運價（${date}起實施） · ${versionStamp}`;
  },
  supportPhone: (phone: string) => `客服 ${phone}`,
  base: (fare: FareVersion) =>
    `起程 ${fare.baseDistanceMeters / 1000} 公里：NT$ ${fare.baseFare}`,
  distance: (fare: FareVersion) =>
    `續程每 ${fare.distanceIncrementMeters} 公尺：NT$ ${fare.distanceRate}`,
  delay: (fare: FareVersion) =>
    `延滯計時每 ${fare.delayIncrementSeconds} 秒：NT$ ${fare.delayRate}`,
  night: (fare: FareVersion) =>
    `夜間 ${fare.nightSurchargeWindowStart}–${fare.nightSurchargeWindowEnd} 每趟加收 NT$ ${fare.nightSurcharge}`,
  additional: (name: string, amount: number) => `${name}：NT$ ${amount}`,
  picker: {
    searchLabel: "搜尋地址",
    searchPlaceholder: "請輸入街道、地點或地標",
    searchButton: "搜尋",
    searching: "搜尋中...",
    candidatesTitle: "相符地址",
    noMatchTitle: "找不到相符的地址",
    noMatchBody: "請調整搜尋文字，或在地圖上選擇位置。",
    manualToggle: "手動輸入座標",
    manualTitle: "手動位置",
    manualLatLabel: "緯度",
    manualLngLabel: "經度",
    manualReasonLabel: "手動選點原因",
    manualReasonPlaceholder: "請說明手動選點原因",
    manualApply: "使用此位置",
    manualInvalid: "請輸入有效的經緯度。",
    providerOutageTitle: "目前無法搜尋地址",
    providerOutageBody: "地址服務無法連線，請稍後重新搜尋。",
    degradedNote: "目前地址結果可能受限。",
    confidenceLabel: "地址精確度",
    provenanceLabel: "位置來源",
    coordinatesLabel: "座標",
    mapEmpty: "選擇地址後可在此調整位置。",
    mapHint: "拖曳圖釘或使用方向鍵調整位置。",
    pinAdjustHint: "已手動調整圖釘。",
    clearSelection: "清除選點",
    serviceableTitle: "位於服務範圍內",
    manualReviewTitle: "派車前需要人工確認",
    notServiceableTitle: "您選擇的地點超出目前服務範圍",
    serviceabilityPending: "確認服務範圍中...",
  },
} as const;
