export type Locale = "en" | "zh";

type Params = Record<string, string | number>;

const en = {
  "app.title": "Partner Booking",
  "app.description":
    "White-label partner booking surface. Tenant identity is selected via the tenant slug route segment.",
  "root.eyebrow": "Partner Booking · White Label",
  "root.title": "Pick a tenant slug to enter the partner booking funnel.",
  "root.description":
    "This app is white-label by construction. Every functional surface lives under /[tenantSlug]/...; the root path only exists to direct internal traffic to a tenant entry point during bring-up.",
  "root.knownTenants": "Known reference tenants",
  "root.openTenant": "Open /{slug}",
  "shell.brand": "Partner Booking",
  "shell.hotline": "Hotline",
  "shell.language.en": "English",
  "shell.language.zh": "繁體中文",
  "shell.language.switch": "Switch language",
  "shell.health.checking": "API checking",
  "shell.health.healthy": "API healthy",
  "shell.health.degraded": "API degraded",
  "shell.health.down": "API down",
  "shell.health.lastChecked": "last checked",
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
    "Insurance intake stays blocked until claim, policy, and replacement-vehicle eligibility references are complete.",
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
  "book.travel.cardTitle": "Group seats and batching",
  "book.travel.badge": "Group seats",
  "book.travel.summary.groupCode": "Group / booking ref",
  "book.travel.summary.itinerary": "Itinerary link",
  "book.travel.summary.transferLegs": "Transfer legs",
  "book.travel.summary.transferLegsValue": "4 legs · leg 1",
  "book.travel.roster.title": "Passenger roster preview",
  "book.travel.roster.tag": "roster",
  "book.travel.roster.empty":
    "Passenger roster preview appears here after filling travellers line by line.",
  "book.travel.batch.title": "Pickup batching preview",
  "book.travel.batch.primary": "Leg 1 · airport pickup",
  "book.travel.batch.secondary": "Leg 2 · hotel shuttle",
  "book.travel.batch.vehicle": "Vehicle plan",
  "book.travel.batch.seats": "Seat allocation",
  "book.program.credit_card_airport_transfer": "Credit-card airport transfer",
  "book.program.insurance_replacement_vehicle": "Insurance replacement vehicle",
  "book.program.travel_agency_transfer": "Travel agency transfer",
  "book.program.enterprise_dispatch": "Enterprise dispatch",
  "book.coverage.credit_card_airport_transfer":
    "Card tier, flight context, terminal, direction",
  "book.coverage.insurance_replacement_vehicle":
    "Claim, policy, claimant, replacement-vehicle class, coverage window",
  "book.coverage.travel_agency_transfer":
    "Group/order reference, group seats, itinerary, roster",
  "book.coverage.enterprise_dispatch":
    "Shared trip intake without partner-specific gating",
  "program.screen.embed_handoff.label": "Embed hand-off",
  "program.screen.embed_handoff.summary":
    "Signed-in hand-off from the banking app with a resolved reference token.",
  "program.screen.embed_reauth.label": "Embed re-auth",
  "program.screen.embed_reauth.summary":
    "Banking-app session expired and requires the user to return for re-authentication.",
  "program.screen.embed_unsupported.label": "Embed blocked",
  "program.screen.embed_unsupported.summary":
    "The embedded surface is blocked because the host or issuer signature is not trusted.",
  "program.screen.embed_consent.label": "Embed consent",
  "program.screen.embed_consent.summary":
    "First-time embedded consent for identity, trip sharing, and billing scope.",
  "program.screen.embed_fallback.label": "Embed fallback",
  "program.screen.embed_fallback.summary":
    "No banking-app identity was detected, so the flow falls back to the standalone site.",
  "program.embed.chrome.title": "Airport transfer",
  "program.embed.chrome.subtitle": "{issuer} · mobile banking",
  "program.embed.chrome.webview": "webview",
  "program.embed.chrome.embeddedIn": "embedded in {issuer} app",
  "program.embed.handoff.title": "Signed in via the banking app",
  "program.embed.handoff.badge": "session_resolved · auto-filled",
  "program.embed.handoff.cardTitle":
    "Identity provided by the banking app · reference token",
  "program.embed.handoff.signature": "Issuer signature valid",
  "program.embed.handoff.identity": "Cardholder identity resolved",
  "program.embed.handoff.token": "Reference token",
  "program.embed.handoff.benefit": "Benefit program",
  "program.embed.handoff.benefitValue": "World Elite airport transfer",
  "program.embed.handoff.note":
    "No separate login needed. Skip account activation and move straight to eligibility and booking.",
  "program.embed.handoff.cta": "Start booking",
  "program.embed.reauth.title": "Sign-in state expired",
  "program.embed.reauth.badge": "token_expired · re-auth required",
  "program.embed.reauth.cardTitle": "Connection status",
  "program.embed.reauth.session": "Issuer session expired",
  "program.embed.reauth.token": "Reference token expired",
  "program.embed.reauth.message":
    "For account security, return to {issuer} to re-authenticate before opening airport transfer again. This page will not ask for your card number or password.",
  "program.embed.reauth.primary": "Return to banking app to re-authenticate",
  "program.embed.reauth.secondary": "Try again later",
  "program.embed.unsupported.title": "Cannot open in this environment",
  "program.embed.unsupported.badge": "unsupported_host · blocked",
  "program.embed.unsupported.reasonTitle": "Reason",
  "program.embed.unsupported.reason":
    "This airport-transfer service can only be opened inside an authorized banking app. The current source is not an approved issuer environment, so loading has been blocked for security reasons.",
  "program.embed.unsupported.detectTitle": "Detection result",
  "program.embed.unsupported.host": "Origin host not authorized",
  "program.embed.unsupported.signature": "Issuer signature",
  "program.embed.unsupported.note":
    "Open airport transfer from the {issuer} mobile banking app, or continue on the official site.",
  "program.embed.unsupported.primary": "Open official site",
  "program.embed.consent.title": "Authorize airport transfer service",
  "program.embed.consent.subtitle":
    "First-time use · confirm the following access scopes",
  "program.embed.consent.scope.identity.title":
    "Read cardholder identity and benefits",
  "program.embed.consent.scope.identity.body":
    "Resolve the reference token to confirm airport-transfer eligibility.",
  "program.embed.consent.scope.trip.title": "Share trip booking details",
  "program.embed.consent.scope.trip.body":
    "Share only the information required for dispatch with DRTS.",
  "program.embed.consent.scope.billing.title":
    "Link extra fees to the issuer bill",
  "program.embed.consent.scope.billing.body":
    "Any amount beyond the included benefit will be charged to this card account.",
  "program.embed.consent.note":
    "No card number or password will be read. Identity is securely provided by {issuer}, and consent can be revoked in banking-app settings.",
  "program.embed.consent.primary": "Agree and continue",
  "program.embed.consent.secondary": "Not now",
  "program.embed.fallback.title": "No banking sign-in detected",
  "program.embed.fallback.badge": "no_embed_session · use official site",
  "program.embed.fallback.nextTitle": "Next step",
  "program.embed.fallback.nextBody":
    "This page did not receive a valid embedded banking identity. Continue on the official airport-transfer site and verify eligibility with the last four card digits or your online-banking account.",
  "program.embed.fallback.site": "Official site",
  "program.embed.fallback.method": "Verification method",
  "program.embed.fallback.methodValue":
    "Last four digits / online-banking account",
  "program.embed.fallback.security": "Security",
  "program.embed.fallback.securityValue":
    "Do not enter raw card data on this page",
  "program.embed.fallback.primary": "Open official site to book",
  "program.embed.fallback.secondary": "Return to banking app sign-in",
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
  "field.claimReference": "Claim reference",
  "field.claimantName": "Claimant",
  "field.replacementStart": "Replacement period start",
  "field.replacementEnd": "Replacement period end",
  "field.replacementVehicleClass": "Replacement-vehicle class",
  "field.caseHandler": "Case handler",
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
    "Capture the insurer-approved replacement-vehicle coverage window for downstream case tracking.",
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
  "app.title": "合作入口叫車",
  "app.description": "白牌合作叫車入口。租戶身分由 tenant slug 路由決定。",
  "root.eyebrow": "合作入口叫車 · White Label",
  "root.title": "選擇租戶 slug 進入合作叫車流程。",
  "root.description":
    "此 app 以白牌架構建立。所有功能頁都位於 /[tenantSlug]/...；根路徑只用於 bring-up 期間導向內部驗收入口。",
  "root.knownTenants": "已知參考租戶",
  "root.openTenant": "開啟 /{slug}",
  "shell.brand": "合作入口叫車",
  "shell.hotline": "客服專線",
  "shell.language.en": "English",
  "shell.language.zh": "繁體中文",
  "shell.language.switch": "切換語系",
  "shell.health.checking": "API 檢查中",
  "shell.health.healthy": "API 正常",
  "shell.health.degraded": "API 降級",
  "shell.health.down": "API 中斷",
  "shell.health.lastChecked": "最近檢查",
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
    "保險代步方案在理賠、保單與代步車資格資料完整前，不可送出下單。",
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
  "book.travel.cardTitle": "團體席次與分批",
  "book.travel.badge": "團體席次",
  "book.travel.summary.groupCode": "團號 · booking ref",
  "book.travel.summary.itinerary": "行程連結 · itinerary",
  "book.travel.summary.transferLegs": "接送段數 · transfer legs",
  "book.travel.summary.transferLegsValue": "4 段 · 第 1 段",
  "book.travel.roster.title": "乘客名單 · roster 摘要",
  "book.travel.roster.tag": "roster",
  "book.travel.roster.empty":
    "逐行填寫旅客與席次備註後，這裡會顯示 roster 摘要。",
  "book.travel.batch.title": "分批接送 · pickup batching",
  "book.travel.batch.primary": "第 1 批 · 入境接機",
  "book.travel.batch.secondary": "第 2 批 · 飯店接駁",
  "book.travel.batch.vehicle": "車型規劃",
  "book.travel.batch.seats": "席次配置",
  "book.program.credit_card_airport_transfer": "信用卡機場接送",
  "book.program.insurance_replacement_vehicle": "保險理賠代步",
  "book.program.travel_agency_transfer": "旅行社團體接送",
  "book.program.enterprise_dispatch": "企業派車",
  "book.coverage.credit_card_airport_transfer": "卡別、航班、航廈、接送方向",
  "book.coverage.insurance_replacement_vehicle":
    "理賠案號、保單、理賠參照、申請人、代步車型、代步期間",
  "book.coverage.travel_agency_transfer":
    "團體/訂單參照、團體席次、行程連結、roster",
  "book.coverage.enterprise_dispatch": "共用行程欄位，無 partner 專屬閘門",
  "program.screen.embed_handoff.label": "內嵌帶入",
  "program.screen.embed_handoff.summary":
    "行動銀行已完成登入交接，並帶入可解析的 reference token。",
  "program.screen.embed_reauth.label": "內嵌重驗",
  "program.screen.embed_reauth.summary":
    "銀行 App session 已逾時，需回到發卡行 App 重新驗證。",
  "program.screen.embed_unsupported.label": "內嵌封鎖",
  "program.screen.embed_unsupported.summary":
    "來源 host 或 issuer signature 不受信任，因此封鎖載入。",
  "program.screen.embed_consent.label": "內嵌授權",
  "program.screen.embed_consent.summary":
    "首次使用需確認身分、行程共享與帳務 scope 授權。",
  "program.screen.embed_fallback.label": "內嵌回退",
  "program.screen.embed_fallback.summary":
    "未取得有效網銀身分，改導向 standalone 官方站點。",
  "program.embed.chrome.title": "機場接送",
  "program.embed.chrome.subtitle": "{issuer} · 行動銀行",
  "program.embed.chrome.webview": "webview",
  "program.embed.chrome.embeddedIn": "· embedded in {issuer} app",
  "program.embed.handoff.title": "已透過行動銀行登入",
  "program.embed.handoff.badge": "session_resolved · 自動帶入",
  "program.embed.handoff.cardTitle": "身分由銀行 App 帶入 · reference token",
  "program.embed.handoff.signature": "發卡行簽章有效",
  "program.embed.handoff.identity": "卡友身分已解析",
  "program.embed.handoff.token": "參照權杖 · reference token",
  "program.embed.handoff.benefit": "權益方案",
  "program.embed.handoff.benefitValue": "World Elite 機場接送",
  "program.embed.handoff.note":
    "免再登入，略過獨立啟用，直接進入資格確認與預約。",
  "program.embed.handoff.cta": "開始預約接送",
  "program.embed.reauth.title": "登入狀態已逾時",
  "program.embed.reauth.badge": "token_expired · 需重新驗證",
  "program.embed.reauth.cardTitle": "連線狀態",
  "program.embed.reauth.session": "發卡行 session 已過期",
  "program.embed.reauth.token": "參照權杖逾時",
  "program.embed.reauth.message":
    "為保護您的帳戶安全，請回到 {issuer} App 重新驗證身分後再進入接送服務。此頁不會要求您輸入卡號或密碼。",
  "program.embed.reauth.primary": "回行動銀行重新驗證",
  "program.embed.reauth.secondary": "稍後再試",
  "program.embed.unsupported.title": "無法在此環境開啟",
  "program.embed.unsupported.badge": "unsupported_host · 已封鎖",
  "program.embed.unsupported.reasonTitle": "原因",
  "program.embed.unsupported.reason":
    "此接送服務僅能於授權的銀行 App 內開啟。目前來源並非已授權的發卡行環境，基於安全考量已封鎖載入。",
  "program.embed.unsupported.detectTitle": "偵測結果",
  "program.embed.unsupported.host": "來源主機未授權",
  "program.embed.unsupported.signature": "發卡行簽章",
  "program.embed.unsupported.note":
    "請改由 {issuer} 行動銀行 App 內的「機場接送」入口開啟，或前往官方網站。",
  "program.embed.unsupported.primary": "前往官方網站",
  "program.embed.consent.title": "授權使用接送服務",
  "program.embed.consent.subtitle": "首次使用 · 請確認以下授權範圍",
  "program.embed.consent.scope.identity.title": "讀取卡友身分與權益",
  "program.embed.consent.scope.identity.body": "解析參照權杖以確認接送資格。",
  "program.embed.consent.scope.trip.title": "共享接送行程資訊",
  "program.embed.consent.scope.trip.body": "與智慧運輸科技共享派車必要資訊。",
  "program.embed.consent.scope.billing.title": "費用合併入帳",
  "program.embed.consent.scope.billing.body": "超出權益之費用合併至本卡帳單。",
  "program.embed.consent.note":
    "不會讀取卡號或密碼，身分由 {issuer} 安全帶入；可於行動銀行設定隨時撤回授權。",
  "program.embed.consent.primary": "同意並繼續",
  "program.embed.consent.secondary": "暫不使用",
  "program.embed.fallback.title": "未偵測到銀行登入",
  "program.embed.fallback.badge": "no_embed_session · 改用官網",
  "program.embed.fallback.nextTitle": "接下來",
  "program.embed.fallback.nextBody":
    "此頁未取得有效的銀行內嵌身分。您可改用官方機場接送網站，以卡號末四碼或網銀帳號自行驗證資格。",
  "program.embed.fallback.site": "官方網站",
  "program.embed.fallback.method": "驗證方式",
  "program.embed.fallback.methodValue": "末四碼 / 網銀帳號",
  "program.embed.fallback.security": "安全性",
  "program.embed.fallback.securityValue": "不在此頁輸入原始卡資料",
  "program.embed.fallback.primary": "前往官方網站預約",
  "program.embed.fallback.secondary": "回行動銀行登入",
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
  "field.claimReference": "理賠參照",
  "field.claimantName": "理賠申請人",
  "field.replacementStart": "代步開始",
  "field.replacementEnd": "代步結束",
  "field.replacementVehicleClass": "代步車輛資格",
  "field.caseHandler": "承辦人",
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
  "hint.replacementPeriod":
    "請輸入保險核准的代步車資格期間，供後續案件追蹤使用。",
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
  key: TranslationKey | string,
  params?: Params,
  locale: Locale = "zh",
): string {
  const scoped = translations[locale] as Record<string, string>;
  const fallback = translations.zh as Record<string, string>;
  const template = String(scoped[key] ?? fallback[key] ?? key);
  if (!params) {
    return template;
  }
  let result = template;
  for (const [name, value] of Object.entries(params)) {
    result = result.replaceAll(`{${name}}`, String(value));
  }
  return result;
}
