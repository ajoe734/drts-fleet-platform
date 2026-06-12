export type Locale = "en" | "zh";

const en = {
  "app.title": "Tenant Console",
  "app.description": "Tenant administration workspace for DRTS Phase 1.",
  "shell.breadcrumb.home": "Home",
  "shell.search": "Search bookings, passengers, statements, reports...",
  "shell.brand.sub": "TENANT CONSOLE",
  "shell.context": "YAMATO Business Group",
  "shell.env": "production",
  "shell.identity.actor": "Yamato",
  "shell.language.en": "English",
  "shell.language.zh": "繁體中文",
  "shell.language.switch": "Switch language",
  "shell.health.notChecked": "not checked",
  "shell.health.checking": "API checking",
  "shell.health.healthy": "API healthy",
  "shell.health.degraded": "API degraded",
  "shell.health.down": "API down",
  "shell.health.lastChecked": "last checked",
  "shell.nav.aria": "Tenant Console navigation",
  "shell.nav.workspace": "Workspace",
  "shell.nav.directory": "Directory",
  "shell.nav.access": "Access",
  "shell.nav.notifications": "Notifications & SLA",
  "shell.nav.finance": "Finance & governance",
  "shell.nav.integration": "Integration",
  "shell.nav.system": "System",

  "nav.home": "Home",
  "nav.bookings": "Bookings",
  "nav.newBooking": "New booking",
  "nav.passengers": "Passengers",
  "nav.addresses": "Address book",
  "nav.costCenters": "Cost centers",
  "nav.rules": "Approval & quota",
  "nav.users": "People & roles",
  "nav.notifications": "Notifications",
  "nav.sla": "SLA",
  "nav.billing": "Billing overview",
  "nav.invoices": "Invoices",
  "nav.reports": "Reports",
  "nav.apiKeys": "API keys",
  "nav.webhooks": "Webhooks",
  "nav.integrationGovernance": "Integration governance",
  "nav.featureFlags": "Feature flags",
  "nav.settings": "Tenant settings",
  "nav.audit": "Audit",

  "dashboard.hero.eyebrow": "Workspace",
  "dashboard.hero.title":
    "Tenant operations, billing, and readiness in one workspace",
  "dashboard.hero.description":
    "The home route now matches the handoff packet: KPI cards, active-booking queue, finance snapshot, statement visibility, and integration reminders from backend-owned read models.",
  "dashboard.kpi.inProgress": "In progress",
  "dashboard.kpi.todayCompleted": "Completed today",
  "dashboard.kpi.mtdUsage": "Month-to-date usage",
  "dashboard.kpi.currentInvoice": "Current invoice",
  "dashboard.section.activeBookings": "Active bookings",
  "dashboard.section.activeBookingsSub":
    "Current fulfillment queue, not a launcher-only summary.",
  "dashboard.section.finance": "Finance snapshot",
  "dashboard.section.financeSub":
    "Invoice, statement, and notification posture stay visible on the home lane.",
  "dashboard.section.integration": "Integration reminders",
  "dashboard.section.integrationSub":
    "Checklist and governance signals stay backend-owned.",
  "dashboard.col.booking": "Booking",
  "dashboard.col.passenger": "Passenger",
  "dashboard.col.window": "Window",
  "dashboard.col.status": "Status",
  "dashboard.col.amount": "Amount",
  "dashboard.col.period": "Period",
  "dashboard.col.driver": "Driver",
  "dashboard.empty.activeBookings":
    "No active bookings are currently in progress.",
  "dashboard.empty.statements":
    "No tenant-visible statements are available in the current snapshot.",
  "dashboard.link.openBookings": "Open bookings",
  "dashboard.link.newBooking": "Create booking",
  "dashboard.link.openBilling": "Open billing overview",
  "dashboard.link.openGovernance": "Open integration governance",

  "bookingDetail.tab.overview": "Overview",
  "bookingDetail.tab.timeline": "Timeline",
  "bookingDetail.tab.billing": "Billing",
  "bookingDetail.tab.audit": "Audit links",
  "bookingDetail.section.trip": "Trip summary",
  "bookingDetail.section.tripSub":
    "Service, passenger, route, cost center, and editability remain together.",
  "bookingDetail.section.timeline": "Cross-actor timeline",
  "bookingDetail.section.timelineSub":
    "Tenant, ops, platform, and system actions remain visible on the same screen.",
  "bookingDetail.section.billing": "Billing and statements",
  "bookingDetail.section.billingSub":
    "Related invoices and tenant-visible statements render without inventing settlement truth.",
  "bookingDetail.section.audit": "Deep links and audit scope",
  "bookingDetail.section.auditSub":
    "Open the tenant audit subset or rule lane when follow-up is needed.",
  "bookingDetail.empty.relatedInvoices":
    "No related invoices were returned for this booking.",
  "bookingDetail.empty.relatedStatements":
    "No tenant statements reference this booking period yet.",
  "bookingDetail.label.relatedInvoices": "Related invoices",
  "bookingDetail.label.relatedStatements": "Tenant-visible statements",
  "bookingDetail.label.readOnlyReason": "Read-only reason",
  "bookingDetail.label.editableUntil": "Editable until",
  "bookingDetail.label.approval": "Approval posture",

  "newBooking.program.creditCard": "Credit-card airport transfer",
  "newBooking.program.enterprise": "Enterprise dispatch",
  "newBooking.programSection.title": "Program-specific fields",
  "newBooking.programSection.creditCardSub":
    "Card / insurance programs need benefit linkage and airport-trip metadata.",
  "newBooking.programSection.enterpriseSub":
    "Enterprise dispatch keeps cost center, approval, and onsite handoff fields primary.",
  "newBooking.programField.benefitReference": "Benefit reference",
  "newBooking.programField.direction": "Airport direction",
  "newBooking.programField.flightNo": "Flight number",
  "newBooking.programField.terminal": "Terminal",
  "newBooking.programField.luggageCount": "Luggage count",
  "newBooking.programField.vehiclePreference": "Vehicle preference",
  "newBooking.programField.costCenter": "Cost center",
  "newBooking.programField.bookedByName": "Booked by name",
  "newBooking.programField.bookedByEmail": "Booked by email",
  "newBooking.programField.onsiteContact": "Onsite contact",
  "newBooking.programField.onsitePhone": "Onsite phone",
  "newBooking.programHint.creditCard":
    "Use this mode when the booking must retain issuer / sponsor references for downstream finance and audit.",
  "newBooking.programHint.enterprise":
    "Use this mode when the booking must carry tenant cost-center and approval metadata through billing and reporting.",

  "billing.title": "Billing overview",
  "billing.subtitle":
    "Billing profile, current usage, invoices, and statements",
  "billing.section.profile": "Billing profile",
  "billing.section.invoices": "Recent invoices",
  "billing.section.statements": "Tenant-visible statements",
  "billing.section.statementsSub":
    "Statements render from `/api/tenant/statements` and stay read-only.",
  "billing.empty.statements": "No statements are available for this period.",
  "billing.col.statement": "Statement",
  "billing.col.gross": "Gross",
  "billing.col.serviceFee": "Service fee",
  "billing.col.subsidy": "Subsidy",
  "billing.col.net": "Net",
  "billing.col.payoutStatus": "Payout",
} as const;

const zh: Record<keyof typeof en, string> = {
  "app.title": "租戶後台",
  "app.description": "DRTS Phase 1 租戶管理工作台。",
  "shell.breadcrumb.home": "首頁",
  "shell.search": "搜尋叫車、乘客、對帳單、報表…",
  "shell.brand.sub": "租戶後台",
  "shell.context": "YAMATO 大和商務集團",
  "shell.env": "production",
  "shell.identity.actor": "大和",
  "shell.language.en": "English",
  "shell.language.zh": "繁體中文",
  "shell.language.switch": "切換語系",
  "shell.health.notChecked": "尚未檢查",
  "shell.health.checking": "API 檢查中",
  "shell.health.healthy": "API 正常",
  "shell.health.degraded": "API 降級",
  "shell.health.down": "API 中斷",
  "shell.health.lastChecked": "最近檢查",
  "shell.nav.aria": "租戶後台導覽",
  "shell.nav.workspace": "工作面",
  "shell.nav.directory": "資料維護",
  "shell.nav.access": "帳號與權限",
  "shell.nav.notifications": "通知與 SLA",
  "shell.nav.finance": "帳務與治理",
  "shell.nav.integration": "整合",
  "shell.nav.system": "系統",

  "nav.home": "首頁",
  "nav.bookings": "訂單",
  "nav.newBooking": "新增訂單",
  "nav.passengers": "乘客",
  "nav.addresses": "地址簿",
  "nav.costCenters": "成本中心",
  "nav.rules": "審批與配額",
  "nav.users": "人員與角色",
  "nav.notifications": "通知",
  "nav.sla": "SLA",
  "nav.billing": "帳務概覽",
  "nav.invoices": "發票",
  "nav.reports": "報表",
  "nav.apiKeys": "API 金鑰",
  "nav.webhooks": "Webhook",
  "nav.integrationGovernance": "整合就緒度",
  "nav.featureFlags": "功能旗標",
  "nav.settings": "租戶設定",
  "nav.audit": "稽核",

  "dashboard.hero.eyebrow": "工作面",
  "dashboard.hero.title": "把租戶營運、帳務與整合狀態收斂到同一個工作面",
  "dashboard.hero.description":
    "首頁現在對齊 handoff packet：KPI 卡片、進行中訂單、帳務快照、statement 可見性，以及來自後端讀模型的整合提醒。",
  "dashboard.kpi.inProgress": "進行中",
  "dashboard.kpi.todayCompleted": "今日完成",
  "dashboard.kpi.mtdUsage": "本月用量",
  "dashboard.kpi.currentInvoice": "當期帳單",
  "dashboard.section.activeBookings": "進行中訂單",
  "dashboard.section.activeBookingsSub":
    "這裡是執行中的履約佇列，不是只有入口卡片。",
  "dashboard.section.finance": "財務快照",
  "dashboard.section.financeSub":
    "發票、statement 與通知狀態留在首頁即可看到。",
  "dashboard.section.integration": "整合提醒",
  "dashboard.section.integrationSub":
    "checklist 與 readiness 狀態都保持後端權威。",
  "dashboard.col.booking": "訂單",
  "dashboard.col.passenger": "乘客",
  "dashboard.col.window": "時窗",
  "dashboard.col.status": "狀態",
  "dashboard.col.amount": "金額",
  "dashboard.col.period": "期別",
  "dashboard.col.driver": "司機",
  "dashboard.empty.activeBookings": "目前沒有進行中的訂單。",
  "dashboard.empty.statements": "目前快照沒有 tenant 可見的 statements。",
  "dashboard.link.openBookings": "查看訂單",
  "dashboard.link.newBooking": "建立叫車",
  "dashboard.link.openBilling": "前往帳務概覽",
  "dashboard.link.openGovernance": "前往整合就緒度",

  "bookingDetail.tab.overview": "總覽",
  "bookingDetail.tab.timeline": "活動",
  "bookingDetail.tab.billing": "帳務",
  "bookingDetail.tab.audit": "稽核連結",
  "bookingDetail.section.trip": "行程摘要",
  "bookingDetail.section.tripSub":
    "服務類型、乘客、路線、成本中心與可編輯性放在同一區。",
  "bookingDetail.section.timeline": "跨 actor 時間線",
  "bookingDetail.section.timelineSub":
    "同一頁看 tenant、ops、platform 與 system 的事件。",
  "bookingDetail.section.billing": "帳務與 statements",
  "bookingDetail.section.billingSub":
    "相關 invoice 與 tenant 可見 statement 同頁呈現，不在 client 假算結算真相。",
  "bookingDetail.section.audit": "深連結與稽核範圍",
  "bookingDetail.section.auditSub":
    "需要追查時可直接跳 audit subset 或 approval rules。",
  "bookingDetail.empty.relatedInvoices": "這筆訂單目前沒有對應的發票資料。",
  "bookingDetail.empty.relatedStatements":
    "這筆訂單所在期別目前沒有對應的 tenant statements。",
  "bookingDetail.label.relatedInvoices": "相關發票",
  "bookingDetail.label.relatedStatements": "租戶可見 statements",
  "bookingDetail.label.readOnlyReason": "唯讀原因",
  "bookingDetail.label.editableUntil": "可編輯截止",
  "bookingDetail.label.approval": "審批狀態",

  "newBooking.program.creditCard": "信用卡／保險機場接送",
  "newBooking.program.enterprise": "企業派車",
  "newBooking.programSection.title": "方案專屬欄位",
  "newBooking.programSection.creditCardSub":
    "卡友／保險方案需要 benefit linkage 與機場旅程欄位。",
  "newBooking.programSection.enterpriseSub":
    "企業派車以成本中心、審批與現場交接欄位為主。",
  "newBooking.programField.benefitReference": "方案參考碼",
  "newBooking.programField.direction": "機場方向",
  "newBooking.programField.flightNo": "航班號碼",
  "newBooking.programField.terminal": "航廈",
  "newBooking.programField.luggageCount": "行李件數",
  "newBooking.programField.vehiclePreference": "車型偏好",
  "newBooking.programField.costCenter": "成本中心",
  "newBooking.programField.bookedByName": "代訂人姓名",
  "newBooking.programField.bookedByEmail": "代訂人 Email",
  "newBooking.programField.onsiteContact": "現場聯絡人",
  "newBooking.programField.onsitePhone": "現場電話",
  "newBooking.programHint.creditCard":
    "當訂單需要保留 issuer / sponsor 參考以供後續財務與 audit 追蹤時，請使用這個模式。",
  "newBooking.programHint.enterprise":
    "當訂單需要把成本中心與審批 metadata 帶入 billing / reporting 時，請使用這個模式。",

  "billing.title": "帳務概覽",
  "billing.subtitle": "計費檔案、當期用量、發票與 statements",
  "billing.section.profile": "Billing profile",
  "billing.section.invoices": "近期發票",
  "billing.section.statements": "租戶可見 statements",
  "billing.section.statementsSub":
    "由 `/api/tenant/statements` 讀取，畫面僅做只讀呈現。",
  "billing.empty.statements": "這個期別目前沒有 statements。",
  "billing.col.statement": "Statement",
  "billing.col.gross": "毛額",
  "billing.col.serviceFee": "服務費",
  "billing.col.subsidy": "補貼",
  "billing.col.net": "淨額",
  "billing.col.payoutStatus": "撥付狀態",
};

export const translations = { en, zh } as const;
export type TranslationKey = keyof typeof en;

export function t(
  key: TranslationKey | string,
  locale: Locale = "zh",
  params?: Record<string, string | number>,
): string {
  const scoped = translations[locale] as Record<string, string>;
  const fallback = en as Record<string, string>;
  const template = scoped[key] ?? fallback[key] ?? key;
  if (!params) {
    return template;
  }

  return Object.entries(params).reduce((result, [name, value]) => {
    return result.replaceAll(`{${name}}`, String(value));
  }, template);
}
