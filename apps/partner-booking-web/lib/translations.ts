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
    "Agency transfer intake needs a group reference before booking can be prepared.",
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
    "Group, headcount, luggage, meeting point",
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
  "field.groupCode": "Group code",
  "field.groupSize": "Passenger count",
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
    "Use the expected travelling headcount so dispatch can match vehicle capacity.",
  "error.required": "{label} is required.",
  "error.datetime": "{label} must be a valid date-time.",
  "error.windowOrder":
    "Reservation window end must be after reservation window start.",
  "error.periodOrder":
    "Replacement period end must be after replacement period start.",
  "error.nonNegativeInteger": "{label} must be a whole number of 0 or more.",
  "error.positiveInteger": "{label} must be a whole number greater than 0.",

  // Online-banking-app embed identity states (B1–B5). Identity arrives from the
  // host bank session as a signed issuer reference token; the embed never
  // captures raw card data. zh-TW is primary; these en strings are the mirror.
  "embed.chrome.service": "Airport transfer",
  "embed.chrome.host": "{brand} · mobile banking",
  "embed.chrome.webviewNote": "· embedded in {brand} app",
  "embed.flow.eyebrow": "Bank-app embed identity",
  "embed.flow.summary":
    "Host-resolved entry · identity via issuer reference token · never captures raw card data.",
  "embed.state.handoff.label": "Signed-in hand-off",
  "embed.state.reauth.label": "Re-auth required",
  "embed.state.unsupported.label": "Unsupported host",
  "embed.state.consent.label": "Consent scope",
  "embed.state.fallback.label": "Standalone fallback",
  "embed.handoff.title": "Signed in via mobile banking",
  "embed.handoff.chip": "session_resolved · auto-filled",
  "embed.handoff.cardTitle":
    "Identity passed in by the bank app · reference token",
  "embed.handoff.row.signature": "Issuer signature valid",
  "embed.handoff.row.cardholder": "Cardholder identity resolved",
  "embed.handoff.row.refToken": "Reference token",
  "embed.handoff.row.benefit": "Entitlement program",
  "embed.handoff.benefitValue": "World Elite airport transfer",
  "embed.handoff.note":
    "No second login · skips standalone activation and goes straight to eligibility and booking.",
  "embed.handoff.cta": "Start booking a transfer",
  "embed.reauth.title": "Your sign-in has timed out",
  "embed.reauth.chip": "token_expired · re-auth needed",
  "embed.reauth.cardTitle": "Connection state",
  "embed.reauth.row.session": "Issuer session expired",
  "embed.reauth.row.refToken": "Reference token stale",
  "embed.reauth.body":
    "To protect your account, please return to the {brand} app to re-verify before entering the transfer service.",
  "embed.reauth.bodyStrong":
    "The transfer page will never ask for your card number or password.",
  "embed.reauth.cta": "Re-verify in mobile banking",
  "embed.reauth.secondary": "Try again later",
  "embed.unsupported.title": "Cannot open in this environment",
  "embed.unsupported.chip": "unsupported_host · blocked",
  "embed.unsupported.reasonTitle": "Reason",
  "embed.unsupported.reason":
    "This transfer service can only open inside an authorized bank app. The current origin is not an authorized issuer environment, so loading was blocked for security.",
  "embed.unsupported.detectTitle": "Detection",
  "embed.unsupported.row.origin": "Origin host not authorized",
  "embed.unsupported.row.originValue": "unauthorized",
  "embed.unsupported.row.signature": "Issuer signature",
  "embed.unsupported.row.signatureValue": "missing",
  "embed.unsupported.hint":
    "Please open it from the “Airport transfer” entry inside the {brand} mobile banking app, or go to the official website.",
  "embed.unsupported.cta": "Go to official website",
  "embed.consent.title": "Authorize the transfer service",
  "embed.consent.subtitle": "First use · please confirm the scopes below",
  "embed.consent.scope.identity.title":
    "Read cardholder identity and entitlement",
  "embed.consent.scope.identity.desc":
    "Resolve the reference token to confirm transfer eligibility",
  "embed.consent.scope.trip.title": "Share transfer trip details",
  "embed.consent.scope.trip.desc":
    "Share the dispatch details required with Smart Transport Tech",
  "embed.consent.scope.billing.title": "Consolidated billing",
  "embed.consent.scope.billing.desc":
    "Charges beyond the entitlement are billed to this card statement",
  "embed.consent.note":
    "Never reads your card number or password · identity is passed in securely by {brand}. You can revoke authorization anytime in mobile banking settings.",
  "embed.consent.cta": "Agree and continue",
  "embed.consent.secondary": "Not now",
  "embed.fallback.title": "No bank sign-in detected",
  "embed.fallback.chip": "no_embed_session · use website",
  "embed.fallback.nextTitle": "Next",
  "embed.fallback.bodyPre":
    "This page did not receive a valid embedded bank identity. You can switch to the {brand} airport-transfer ",
  "embed.fallback.bodyStrong": "official website",
  "embed.fallback.bodyPost":
    " and verify your own eligibility with the last 4 digits or your online-banking account.",
  "embed.fallback.row.site": "Official website",
  "embed.fallback.row.verify": "Verification",
  "embed.fallback.row.verifyValue": "Last 4 digits / online-banking account",
  "embed.fallback.row.security": "Security",
  "embed.fallback.row.securityValue": "Never enter card data on this page",
  "embed.fallback.cta": "Book on the official website",
  "embed.fallback.secondary": "Back to mobile-banking sign-in",
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
    "旅行社接送方案需先具備團號，才能完成下單準備。",
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
  "book.coverage.travel_agency_transfer": "團號、人數、行李、集合點",
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
  "field.groupCode": "團號",
  "field.groupSize": "人數",
  "field.luggageCount": "行李件數",
  "field.meetingPoint": "集合點",
  "field.direction.pickup": "接機",
  "field.direction.dropoff": "送機",
  "hint.flightNo": "機場方案需帶入航班資訊，尤其接機必填。",
  "hint.policyWindow":
    "預約結束時間必須晚於開始時間；各方案可再套更細的期間規則。",
  "hint.replacementPeriod": "請輸入保險核准的代步期間，供後續案件追蹤使用。",
  "hint.groupSize": "填寫實際團體人數，讓 dispatch 可對齊車型容量。",
  "error.required": "{label}為必填。",
  "error.datetime": "{label}必須是有效日期時間。",
  "error.windowOrder": "預約結束時間必須晚於預約開始時間。",
  "error.periodOrder": "代步結束時間必須晚於代步開始時間。",
  "error.nonNegativeInteger": "{label}必須是 0 以上整數。",
  "error.positiveInteger": "{label}必須是大於 0 的整數。",

  // 網銀 App 內嵌身分狀態（B1–B5）。身分由 host 銀行 session 以發卡行簽章
  // reference token 帶入，內嵌頁絕不擷取原始卡資料。zh-TW 為主要語系。
  "embed.chrome.service": "機場接送",
  "embed.chrome.host": "{brand} · 行動銀行",
  "embed.chrome.webviewNote": "· 內嵌於 {brand} App",
  "embed.flow.eyebrow": "網銀 App 內嵌身分",
  "embed.flow.summary":
    "host-resolved 入口 · 身分用發卡行 reference token · 絕不擷取原始卡資料。",
  "embed.state.handoff.label": "登入交接",
  "embed.state.reauth.label": "逾時重認",
  "embed.state.unsupported.label": "非授權環境",
  "embed.state.consent.label": "授權範圍",
  "embed.state.fallback.label": "改用官網",
  "embed.handoff.title": "已透過行動銀行登入",
  "embed.handoff.chip": "session_resolved · 自動帶入",
  "embed.handoff.cardTitle": "身分由銀行 App 帶入 · reference token",
  "embed.handoff.row.signature": "發卡行簽章有效",
  "embed.handoff.row.cardholder": "卡友身分已解析",
  "embed.handoff.row.refToken": "參照權杖 · reference token",
  "embed.handoff.row.benefit": "權益方案",
  "embed.handoff.benefitValue": "World Elite 機場接送",
  "embed.handoff.note": "免再登入 · 略過獨立啟用，直接進入資格確認與預約。",
  "embed.handoff.cta": "開始預約接送",
  "embed.reauth.title": "登入狀態已逾時",
  "embed.reauth.chip": "token_expired · 需重新驗證",
  "embed.reauth.cardTitle": "連線狀態",
  "embed.reauth.row.session": "發卡行 session 已過期",
  "embed.reauth.row.refToken": "參照權杖逾時",
  "embed.reauth.body":
    "為保護您的帳戶安全，請回到 {brand} App 重新驗證身分後再進入接送服務。",
  "embed.reauth.bodyStrong": "接送頁不會要求您輸入卡號或密碼。",
  "embed.reauth.cta": "回行動銀行重新驗證",
  "embed.reauth.secondary": "稍後再試",
  "embed.unsupported.title": "無法在此環境開啟",
  "embed.unsupported.chip": "unsupported_host · 已封鎖",
  "embed.unsupported.reasonTitle": "原因",
  "embed.unsupported.reason":
    "此接送服務僅能於授權的銀行 App 內開啟。目前來源並非已授權的發卡行環境，基於安全考量已封鎖載入。",
  "embed.unsupported.detectTitle": "偵測結果",
  "embed.unsupported.row.origin": "來源主機未授權",
  "embed.unsupported.row.originValue": "未授權",
  "embed.unsupported.row.signature": "發卡行簽章",
  "embed.unsupported.row.signatureValue": "缺少",
  "embed.unsupported.hint":
    "請改由 {brand} 行動銀行 App 內的「機場接送」入口開啟，或前往官方網站。",
  "embed.unsupported.cta": "前往官方網站",
  "embed.consent.title": "授權使用接送服務",
  "embed.consent.subtitle": "首次使用 · 請確認以下授權範圍 (scope)",
  "embed.consent.scope.identity.title": "讀取卡友身分與權益",
  "embed.consent.scope.identity.desc": "解析參照權杖以確認接送資格",
  "embed.consent.scope.trip.title": "共享接送行程資訊",
  "embed.consent.scope.trip.desc": "與智慧運輸科技共享派車必要資訊",
  "embed.consent.scope.billing.title": "費用合併入帳",
  "embed.consent.scope.billing.desc": "超出權益之費用合併至本卡帳單",
  "embed.consent.note":
    "不會讀取卡號或密碼 · 身分由 {brand} 安全帶入。可於行動銀行設定隨時撤回授權。",
  "embed.consent.cta": "同意並繼續",
  "embed.consent.secondary": "暫不使用",
  "embed.fallback.title": "未偵測到銀行登入",
  "embed.fallback.chip": "no_embed_session · 改用官網",
  "embed.fallback.nextTitle": "接下來",
  "embed.fallback.bodyPre":
    "此頁未取得有效的銀行內嵌身分。您可改用 {brand} 機場接送 ",
  "embed.fallback.bodyStrong": "官方網站",
  "embed.fallback.bodyPost": "，以卡號末四碼或網銀帳號自行驗證資格。",
  "embed.fallback.row.site": "官方網站",
  "embed.fallback.row.verify": "驗證方式",
  "embed.fallback.row.verifyValue": "末四碼 / 網銀帳號",
  "embed.fallback.row.security": "安全性",
  "embed.fallback.row.securityValue": "不在此頁輸入卡片資料",
  "embed.fallback.cta": "前往官方網站預約",
  "embed.fallback.secondary": "回行動銀行登入",
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
