export type Locale = "en" | "zh";

const en = {
  // ===== app / shell / metadata =====
  "app.title": "Tenant Portal",
  "app.description":
    "Tenant workspace for formal tenant roles, operational settings, and authority-driven governance surfaces.",
  "shell.brand": "Tenant Portal",
  "shell.brandSub": "Authority-backed workspace",
  "shell.signOut": "Sign out",
  "shell.locale.en": "English",
  "shell.locale.zh": "繁體中文",
  "shell.locale.switch": "Switch language",
  "shell.locale.ariaEn": "Switch to English",
  "shell.locale.ariaZh": "切換為繁體中文",

  // ===== navigation =====
  "nav.home": "Home",
  "nav.bookings": "Bookings",
  "nav.passengers": "Passengers",
  "nav.addresses": "Addresses",
  "nav.notifications": "Notifications",
  "nav.settings": "Settings",
  "nav.newBooking": "New Booking",
  "nav.billing": "Billing",
  "nav.reports": "Reports",
  "nav.webhooks": "Webhooks",
  "nav.apiKeys": "API Keys",
  "nav.users": "Users",
  "nav.audit": "Audit",

  // ===== roles (rbac) =====
  "role.tenant_admin.label": "Tenant admin",
  "role.tenant_admin.summary":
    "Owns tenant-wide administration across users, booking policy, billing, reports, and integration governance.",
  "role.operator.label": "Operator",
  "role.operator.summary":
    "Runs booking, passenger, address, and day-to-day operational workflows.",
  "role.finance_analyst.label": "Finance / analyst",
  "role.finance_analyst.summary":
    "Reviews invoice, reporting, and audit follow-up authority for the tenant.",
  "role.integration_manager.label": "Integration manager",
  "role.integration_manager.summary":
    "Current backend authority still carries API key issuance under tenant admin until a dedicated integration role code ships.",
  "role.viewer.label": "Viewer",
  "role.viewer.summary":
    "Read-only access to tenant-visible surfaces without mutation authority.",
  "role.code.tenant_admin": "Tenant Admin",
  "role.code.tenant_ops_admin": "Tenant Ops Admin",
  "role.code.tenant_finance_admin": "Tenant Finance Admin",
  "role.code.tenant_viewer": "Tenant Viewer",
  "role.unavailable": "Role context unavailable",
};

const zh: Record<keyof typeof en, string> = {
  // ===== app / shell / metadata =====
  "app.title": "租戶入口",
  "app.description":
    "為正式租戶角色、營運設定與授權驅動的治理頁面提供的租戶工作區。",
  "shell.brand": "租戶入口",
  "shell.brandSub": "授權支援的工作區",
  "shell.signOut": "登出",
  "shell.locale.en": "English",
  "shell.locale.zh": "繁體中文",
  "shell.locale.switch": "切換語言",
  "shell.locale.ariaEn": "Switch to English",
  "shell.locale.ariaZh": "切換為繁體中文",

  // ===== navigation =====
  "nav.home": "首頁",
  "nav.bookings": "訂單",
  "nav.passengers": "乘客",
  "nav.addresses": "地址簿",
  "nav.notifications": "通知",
  "nav.settings": "設定",
  "nav.newBooking": "建立訂單",
  "nav.billing": "帳務",
  "nav.reports": "報表",
  "nav.webhooks": "Webhook",
  "nav.apiKeys": "API 金鑰",
  "nav.users": "使用者",
  "nav.audit": "稽核",

  // ===== roles (rbac) =====
  "role.tenant_admin.label": "租戶管理員",
  "role.tenant_admin.summary":
    "負責跨租戶的管理，涵蓋使用者、訂單政策、帳務、報表與整合治理。",
  "role.operator.label": "操作員",
  "role.operator.summary": "處理訂單、乘客、地址與日常營運流程。",
  "role.finance_analyst.label": "財務 / 分析",
  "role.finance_analyst.summary": "審視租戶的發票、報表與稽核後續權限。",
  "role.integration_manager.label": "整合管理員",
  "role.integration_manager.summary":
    "在專屬整合角色代碼推出前，後端目前仍將 API 金鑰簽發歸於租戶管理員權限之下。",
  "role.viewer.label": "唯讀者",
  "role.viewer.summary": "對租戶可見頁面的唯讀存取，沒有變更權限。",
  "role.code.tenant_admin": "租戶管理員",
  "role.code.tenant_ops_admin": "租戶營運管理員",
  "role.code.tenant_finance_admin": "租戶財務管理員",
  "role.code.tenant_viewer": "租戶唯讀者",
  "role.unavailable": "角色情境無法取得",
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
