/**
 * ROC Console copy catalogue. Bilingual (en / zh-TW) like the Ops Console; the
 * scaffold ships shell + navigation strings only — screen copy lands with the
 * visual-team canvas, not here.
 */

export type Locale = "en" | "zh";

type Dictionary = Record<string, string>;

const en: Dictionary = {
  "app.name": "ROC Console",
  "app.sub": "Regulatory Operations Centre",
  "app.avatarLabel": "Duty Operator",
  "app.versionLabel": "Phase 2 · scaffold",
  "app.environment.production": "Production",
  "app.metadata.title": "DRTS ROC Console",
  "app.metadata.description":
    "Regulatory operations centre — live AV fleet monitoring, takeover and evidence control plane.",
  "common.search": "Search vehicles, trips, incidents…",

  "nav.group.monitoring": "Monitoring",
  "nav.group.fleet": "Fleet",
  "nav.group.response": "Response",
  "nav.group.regulatory": "Regulatory",
  "nav.overview": "Overview",
  "nav.liveboard": "Live Board",
  "nav.trips": "Trips",
  "nav.vehicles": "Vehicles",
  "nav.takeover": "Takeover Queue",
  "nav.alerts": "Alerts",
  "nav.incidents": "Incidents",
  "nav.evidence": "Evidence",
  "nav.providerHealth": "Provider Health",
  "nav.reports": "Reports",
  "nav.handover": "Shift Handover",

  "rocShell.health.checking": "Checking…",
  "rocShell.health.healthy": "API Healthy",
  "rocShell.health.degraded": "API Degraded",
  "rocShell.health.down": "API Down",
  "rocShell.health.lastChecked": "Checked",
  "rocShell.health.notChecked": "—",
  "rocShell.locale.zh": "中文",
  "rocShell.locale.en": "English",
  "rocShell.locale.ariaZh": "Switch to Chinese",
  "rocShell.locale.ariaEn": "Switch to English",

  "scaffold.eyebrow": "Design-system scaffold",
  "scaffold.title": "ROC Console shell",
  "scaffold.subtitle":
    "Ops Console shell + @drts/ui-web primitives + roc semantic tokens. Screens are owned by the visual team canvas and are intentionally not built here.",
  "scaffold.banner.title": "No bespoke screens yet",
  "scaffold.banner.body":
    "Per decision packet §C2 the ROC screens await the visual-team canvas. This scaffold wires the shell, roc semantic tokens, and the availableActions → ActionReceipt contract only.",
  "scaffold.actions.title": "availableActions → ActionReceipt wiring",
  "scaffold.actions.hint":
    "Backend-driven CTAs: every control action is rendered from the resource's availableActions; every write returns an ActionReceipt with a tracking number. Demonstration list below — real resources bind once screens exist.",
  "scaffold.actions.receiptTracking": "Tracking",
  "scaffold.actions.receiptAudit": "Audit",
  "scaffold.actions.invoke": "Invoke",
  "scaffold.actions.pending": "Submitting…",
  "scaffold.actions.disabledReason": "Unavailable",
  "scaffold.demo.ackAlert": "Acknowledge alert",
  "scaffold.demo.operationalHold": "Apply operational hold",
  "scaffold.demo.openIncident": "Open incident",
  "scaffold.demo.evidenceFreeze": "Start evidence freeze",
};

const zh: Dictionary = {
  "app.name": "監理運營中心",
  "app.sub": "ROC Console",
  "app.avatarLabel": "值勤人員",
  "app.versionLabel": "Phase 2 · 骨架",
  "app.environment.production": "正式環境",
  "app.metadata.title": "DRTS 監理運營中心",
  "app.metadata.description": "監理運營中心 — 自駕車隊即時監控、接管與證據控制平面。",
  "common.search": "搜尋車輛、行程、事故…",

  "nav.group.monitoring": "監控",
  "nav.group.fleet": "車輛",
  "nav.group.response": "處置",
  "nav.group.regulatory": "監理",
  "nav.overview": "總覽",
  "nav.liveboard": "即時看板",
  "nav.trips": "行程",
  "nav.vehicles": "車輛",
  "nav.takeover": "接管佇列",
  "nav.alerts": "警示",
  "nav.incidents": "事故",
  "nav.evidence": "證據",
  "nav.providerHealth": "供應商健康",
  "nav.reports": "監理報表",
  "nav.handover": "交班",

  "rocShell.health.checking": "檢查中…",
  "rocShell.health.healthy": "API 正常",
  "rocShell.health.degraded": "API 降級",
  "rocShell.health.down": "API 中斷",
  "rocShell.health.lastChecked": "檢查於",
  "rocShell.health.notChecked": "—",
  "rocShell.locale.zh": "中文",
  "rocShell.locale.en": "English",
  "rocShell.locale.ariaZh": "切換為中文",
  "rocShell.locale.ariaEn": "切換為英文",

  "scaffold.eyebrow": "設計系統骨架",
  "scaffold.title": "ROC Console 外殼",
  "scaffold.subtitle":
    "Ops Console 外殼 + @drts/ui-web primitives + roc 語意 token。螢幕由視覺團隊 canvas 負責，骨架刻意不實作畫面。",
  "scaffold.banner.title": "尚未建立任何畫面",
  "scaffold.banner.body":
    "依裁決 §C2，ROC 螢幕待視覺團隊 canvas。本骨架僅接線外殼、roc 語意 token，以及 availableActions → ActionReceipt 契約。",
  "scaffold.actions.title": "availableActions → ActionReceipt 接線",
  "scaffold.actions.hint":
    "後端驅動 CTA：每個控制操作由資源的 availableActions 渲染；每個 write 回傳含追蹤編號的 ActionReceipt。下方為示意清單 — 待螢幕建立後綁定真實資源。",
  "scaffold.actions.receiptTracking": "追蹤編號",
  "scaffold.actions.receiptAudit": "稽核",
  "scaffold.actions.invoke": "執行",
  "scaffold.actions.pending": "送出中…",
  "scaffold.actions.disabledReason": "無法使用",
  "scaffold.demo.ackAlert": "確認警示",
  "scaffold.demo.operationalHold": "套用營運保留",
  "scaffold.demo.openIncident": "開立事故",
  "scaffold.demo.evidenceFreeze": "啟動證據保全",
};

export const translations: Record<Locale, Dictionary> = { en, zh };

export function t(
  key: string,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const template = translations[locale]?.[key] ?? translations.en[key] ?? key;
  if (!params) {
    return template;
  }
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    template,
  );
}
