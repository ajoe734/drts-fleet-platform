import type { FareVersion } from "@drts/contracts";

/** Taipei calendar day of a genuine ISO API value; invalid days never pass. */
export function effectiveDay(
  effective: unknown,
): { roc: string; gregorian: string; instant: Date } | null {
  if (
    typeof effective !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(effective)
  )
    return null;
  const instant = new Date(effective);
  const calendarDate = new Date(`${effective.slice(0, 10)}T00:00:00Z`);
  // Date parsing normalizes invalid days; those cannot become an announcement.
  if (
    !Number.isFinite(instant.getTime()) ||
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== effective.slice(0, 10)
  )
    return null;
  const day = (calendar: string) => {
    const parts = new Intl.DateTimeFormat(`zh-TW-u-ca-${calendar}`, {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    return ["year", "month", "day"]
      .map((type) => parts.find((part) => part.type === type)?.value)
      .join("/");
  };
  return { roc: day("roc"), gregorian: day("gregory"), instant };
}
function rawStamp(version: string, effective: unknown) {
  return typeof effective === "string" && effective.trim()
    ? `版本 ${version} · 生效日 ${effective}`
    : `版本 ${version}`;
}
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
  serviceRequirements: "乘車需求",
  wheelchairRequirement: "輪椅需求",
  serviceRequirementsNotice: "需求將隨預約送出，實際供應以派車結果為準。",
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
  timeRefreshed: "原預約時間已過，已為您更新時間，請重新試算車資。",
  noQuote: "目前無法取得正式報價，請稍後重試或聯絡客服。",
  noCreate: "無法送出叫車，請確認帳號與付款方式後重試。",
  unknownCreate: "尚未確認叫車結果；重試會使用同一筆請求，請勿另建行程。",
  publicFares: "計費說明",
  publicInfo: "公開資訊",
  currentRegulation: "本頁依主管機關公告之現行運價揭露",
  publicError: "目前無法取得公開費率，請稍後重試。",
  publicRetry: "重試公開費率",
  publicLoading: "正在取得公開費率...",
  home: "返回叫車首頁",
  currentTariff: "現行計費表",
  tariffEffective: "已生效",
  fareChangeTitle: "車資變更規則",
  fareChangeRule:
    "若乘客要求變更目的地、增加停靠點，或因依法需支付通行費，實際車資可能調整。固定報價行程以確認時之應付金額為準。",
  viewTariff: "查看現行計費表",
  feesIntro: "下單前請確認以下收費規則",
  noPromotion: "目前無",
  sheetPickup: "上車",
  sheetDropoff: "下車",
  paymentNone: "尚未選擇",
  testCard: "測試卡",
  changePayment: (label: string) => `變更支付方式：${label}`,
  checkFirst: "請先勾選「我已確認費用與優惠說明」",
  choosePaymentFirst: "請先選擇支付方式",
  today: "今日",
  tomorrow: "明日",
  authorityComplaint: "主管機關申訴 1999",
  reservationOnly: "本服務僅提供預約叫車",
  lead: (minutes: number) => `至少提早 ${minutes} 分鐘預約。`,
  phone: (verified: boolean) =>
    `請先在帳號管理填寫${verified ? "已驗證" : "聯絡"}手機號碼。`,
  /** Short local clock for the quote validity, never the ISO wire value. */
  quoteValidUntil: (clock: string) => `試算有效至 ${clock}`,
  timeValue: (value: string) => `預約時間 ${value.replace("T", " ")}`,
  /** E-05: version first, then the announcement day derived from the API. */
  tariffStamp: (version: string, effective: unknown) => {
    const day = effectiveDay(effective);
    return day
      ? `版本 ${version} · 依臺北市政府公告計程車運價（${day.roc}起實施）`
      : rawStamp(version, effective);
  },
  /** E-19a stamp; a malformed API value is shown as-is, never re-dated. */
  feeStamp: (version: string, effective: unknown) => {
    const day = effectiveDay(effective);
    return day
      ? `版本 ${version} · 生效日 ${day.gregorian} · 依主管機關核定運價及備查優惠辦理`
      : rawStamp(version, effective);
  },
  supportPhone: (phone: string) => `客服 ${phone}`,
  tariffRows: (fare: FareVersion): [string, string][] => [
    [
      `起程運價（${fare.baseDistanceMeters / 1000} 公里）`,
      `NT$ ${fare.baseFare}`,
    ],
    [
      `續程運價（每 ${fare.distanceIncrementMeters} 公尺）`,
      `NT$ ${fare.distanceRate}`,
    ],
    [
      `延滯計時（每 ${fare.delayIncrementSeconds} 秒）`,
      `NT$ ${fare.delayRate}`,
    ],
    [
      `夜間加成（${fare.nightSurchargeWindowStart}–${fare.nightSurchargeWindowEnd}）`,
      `每趟 +NT$ ${fare.nightSurcharge}`,
    ],
    ...Object.entries(fare.additionalFees ?? {}).map(
      ([name, amount]): [string, string] => [name, `NT$ ${amount}`],
    ),
  ],
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
