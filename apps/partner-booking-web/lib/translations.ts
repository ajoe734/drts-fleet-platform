export type Locale = "en" | "zh";

type Params = Record<string, string | number>;

const en = {
  "book.title": "Program booking form",
  "book.subtitle":
    "Shared trip details stay consistent while each partner program enforces its own intake rules.",
  "book.program.badge": "Program",
  "book.eligibility.badge": "Eligibility",
  "book.eligibility.ready": "Ready",
  "book.eligibility.blocked": "Verification required",
  "book.eligibility.inline": "Reference required",
  "book.eligibility.airport.message":
    "This airport-transfer program requires a verified eligibility record before booking can proceed.",
  "book.eligibility.airport.action": "Open eligibility check",
  "book.eligibility.insurance.message":
    "Insurance intake stays blocked until claim and policy references are complete.",
  "book.eligibility.travel.message":
    "Agency transfer intake needs a group or order reference before booking can be prepared.",
  "book.eligibility.referenceId": "Eligibility verification ID",
  "book.section.trip": "Trip details",
  "book.section.passenger": "Passenger",
  "book.section.program": "Program-specific intake",
  "book.section.review": "Submission readiness",
  "book.ready":
    "Program gate clear. Form can be submitted once all required fields are valid.",
  "book.notReady": "Resolve the highlighted fields before submission.",
  "book.submit": "Validate booking form",
  "book.success": "Form validation passed",
  "book.success.detail":
    "This partner flow is ready to hand a typed payload to the authenticated booking transport.",
  "book.summary.direction": "Airport direction",
  "book.summary.coverage": "Program coverage",
  "book.summary.window": "Reservation window",
  "book.program.credit_card_airport_transfer": "Credit-card airport transfer",
  "book.program.insurance_replacement_vehicle": "Insurance replacement vehicle",
  "book.program.travel_agency_transfer": "Travel agency transfer",
  "book.program.enterprise_dispatch": "Enterprise dispatch",
  "book.coverage.credit_card_airport_transfer":
    "Card tier, flight context, terminal, direction",
  "book.coverage.insurance_replacement_vehicle":
    "Claim, policy, rental period, medical facility",
  "book.coverage.travel_agency_transfer":
    "Group/order reference, group seats, itinerary, roster",
  "book.coverage.enterprise_dispatch":
    "Shared trip intake without partner-specific gating",
  "field.pickupAddress": "Pickup address",
  "field.dropoffAddress": "Drop-off address",
  "field.reservationWindowStart": "Reservation window start",
  "field.reservationWindowEnd": "Reservation window end",
  "field.passengerName": "Passenger name",
  "field.passengerPhone": "Passenger phone",
  "field.notes": "Notes",
  "field.cardTier": "Card tier",
  "field.flightNo": "Flight number",
  "field.terminal": "Terminal",
  "field.direction": "Pickup / drop-off",
  "field.claimNumber": "Claim number",
  "field.policyNumber": "Policy number",
  "field.replacementStart": "Replacement period start",
  "field.replacementEnd": "Replacement period end",
  "field.medicalFacility": "Medical facility",
  "field.groupCode": "Group / order reference",
  "field.groupSize": "Group seats",
  "field.itineraryLink": "Itinerary link",
  "field.rosterPassengers": "Passenger roster",
  "field.luggageCount": "Luggage count",
  "field.meetingPoint": "Meeting point",
  "field.direction.pickup": "Pickup",
  "field.direction.dropoff": "Drop-off",
  "hint.flightNo": "Required for airport programs, especially pickup rides.",
  "hint.policyWindow":
    "The reservation end must be after the start. Program-specific periods can be narrower.",
  "hint.replacementPeriod":
    "Capture the insurer-approved replacement period for downstream case tracking.",
  "hint.groupSize":
    "Use the allocated group seats so dispatch can match vehicle capacity and batching.",
  "hint.itineraryLink":
    "Paste the operator itinerary URL so roster and pickup batching can be cross-checked.",
  "hint.rosterPassengers":
    "List travellers or seat notes line by line, for example guide, wheelchair, child seat, or batch tags.",
  "error.required": "{label} is required.",
  "error.datetime": "{label} must be a valid date-time.",
  "error.windowOrder":
    "Reservation window end must be after reservation window start.",
  "error.periodOrder":
    "Replacement period end must be after replacement period start.",
  "error.nonNegativeInteger": "{label} must be a whole number of 0 or more.",
  "error.positiveInteger": "{label} must be a whole number greater than 0.",
  "error.url": "{label} must be a valid http(s) URL.",
} as const;

const zh = {
  "book.title": "專案下單表單",
  "book.subtitle":
    "共用行程欄位保持一致，但每個 partner program 仍套用自己的收單規則。",
  "book.program.badge": "方案",
  "book.eligibility.badge": "資格閘門",
  "book.eligibility.ready": "可建立",
  "book.eligibility.blocked": "需先驗證",
  "book.eligibility.inline": "需補參考資料",
  "book.eligibility.airport.message":
    "此機場接送方案必須先取得有效的 eligibility verification，才能進入下單。",
  "book.eligibility.airport.action": "前往資格驗證",
  "book.eligibility.insurance.message":
    "保險代步方案在理賠案號與保單號完整前，不可送出下單。",
  "book.eligibility.travel.message":
    "旅行社接送方案需先具備團體或訂單參照，才能完成下單準備。",
  "book.eligibility.referenceId": "Eligibility 驗證編號",
  "book.section.trip": "行程資料",
  "book.section.passenger": "乘客資料",
  "book.section.program": "方案專屬欄位",
  "book.section.review": "送單檢查",
  "book.ready": "方案閘門已通過；只要必填欄位合法，就可提交。",
  "book.notReady": "請先修正標示欄位，再進行提交。",
  "book.submit": "驗證下單表單",
  "book.success": "表單驗證通過",
  "book.success.detail":
    "此 partner flow 已可把型別安全的 payload 交給已驗證的 booking transport。",
  "book.summary.direction": "接送方向",
  "book.summary.coverage": "方案欄位覆蓋",
  "book.summary.window": "預約時段",
  "book.program.credit_card_airport_transfer": "信用卡機場接送",
  "book.program.insurance_replacement_vehicle": "保險理賠代步",
  "book.program.travel_agency_transfer": "旅行社團體接送",
  "book.program.enterprise_dispatch": "企業派車",
  "book.coverage.credit_card_airport_transfer": "卡別、航班、航廈、接送方向",
  "book.coverage.insurance_replacement_vehicle":
    "理賠案號、保單、代步期間、醫療院所",
  "book.coverage.travel_agency_transfer":
    "團體/訂單參照、團體席次、行程連結、roster",
  "book.coverage.enterprise_dispatch": "共用行程欄位，無 partner 專屬閘門",
  "field.pickupAddress": "上車地點",
  "field.dropoffAddress": "下車地點",
  "field.reservationWindowStart": "預約開始時間",
  "field.reservationWindowEnd": "預約結束時間",
  "field.passengerName": "乘客姓名",
  "field.passengerPhone": "乘客電話",
  "field.notes": "備註",
  "field.cardTier": "卡別",
  "field.flightNo": "航班號碼",
  "field.terminal": "航廈",
  "field.direction": "接送方向",
  "field.claimNumber": "理賠案號",
  "field.policyNumber": "保單號碼",
  "field.replacementStart": "代步開始",
  "field.replacementEnd": "代步結束",
  "field.medicalFacility": "醫療院所",
  "field.groupCode": "團體 / 訂單參照",
  "field.groupSize": "團體席次",
  "field.itineraryLink": "行程連結",
  "field.rosterPassengers": "乘客名單 / roster",
  "field.luggageCount": "行李件數",
  "field.meetingPoint": "集合點",
  "field.direction.pickup": "接機",
  "field.direction.dropoff": "送機",
  "hint.flightNo": "機場方案需帶入航班資訊，尤其接機必填。",
  "hint.policyWindow":
    "預約結束時間必須晚於開始時間；各方案可再套更細的期間規則。",
  "hint.replacementPeriod": "請輸入保險核准的代步期間，供後續案件追蹤使用。",
  "hint.groupSize":
    "填寫本團分配的團體席次，讓 dispatch 可對齊車型容量與分批。",
  "hint.itineraryLink": "貼上旅行社行程連結，供 roster 與接送段次比對。",
  "hint.rosterPassengers":
    "請逐行填寫旅客或席次備註，例如領隊、輪椅、兒童座椅、分批標記。",
  "error.required": "{label}為必填。",
  "error.datetime": "{label}必須是有效日期時間。",
  "error.windowOrder": "預約結束時間必須晚於預約開始時間。",
  "error.periodOrder": "代步結束時間必須晚於代步開始時間。",
  "error.nonNegativeInteger": "{label}必須是 0 以上整數。",
  "error.positiveInteger": "{label}必須是大於 0 的整數。",
  "error.url": "{label}必須是有效的 http(s) 網址。",
} as const;

export const translations = { en, zh } as const;

export type TranslationKey = keyof typeof en;

export function t(
  key: TranslationKey,
  params?: Params,
  locale: Locale = "zh",
): string {
  const template = String(translations[locale][key] ?? translations.zh[key]);
  if (!params) {
    return template;
  }
  let result = template;
  for (const [name, value] of Object.entries(params)) {
    result = result.replaceAll(`{${name}}`, String(value));
  }
  return result;
}
