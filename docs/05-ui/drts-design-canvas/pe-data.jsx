// pe-data.jsx — Passenger Embed (community-app referral channel) · brands + fixtures.
// Resident taps "叫車" inside their community property-management app → embedded webview.
// Brand comes from partner entry themeAccent / brandingMetadata (NEVER hardcoded in screens).
// zh-TW (copy goes through t() in production). PII masked per existing receipt rules.

// ── partner entries (referral_channel) — branding source of truth ────────────
const PE_PARTNERS = {
  yuhe: {
    entrySlug: 'yuhe-residence', partnerType: 'referral_channel',
    displayName: '御和物業', appName: '御和生活', mark: '御',
    themeAccent: '#0F766E',                 // brandingMetadata.themeAccent
    entryHost: 'app.yuhe-living.com.tw',    // entryHost whitelist (embed CSP)
    community: '御和?峰 · A 棟', operator: '智慧運輸科技 DRTS',
    support: '0800-911-200',
  },
  cambridge: {
    entrySlug: 'cambridge-community', partnerType: 'referral_channel',
    displayName: '康橋社區', appName: '康橋管家', mark: '康',
    themeAccent: '#3B4BA8',
    entryHost: 'home.cambridge-living.tw',
    community: '康橋花園 · 3 期', operator: '智慧運輸科技 DRTS',
    support: '0800-911-330',
  },
};

// ── resident identity (handed off from host app) ─────────────────────────────
const PE_RESIDENT = { name: '李采縈', en: 'T.Y. Lee', unit: 'A 棟 12F-3', maskedPhone: '0912-***-820', ref: 'res_••••_4A2' };

// owned-mobility service vehicle types (sync with passenger-web)
const PE_VEHICLES = [
  { id: 'standard', name: '標準車', sub: '1–4 人', en: 'standard' },
  { id: 'comfort', name: '舒適車', sub: '1–4 人 · 大空間', en: 'comfort' },
  { id: 'xl', name: '六人座', sub: '5–6 人 · 行李多', en: 'xl' },
];

const PE_SAVED = [
  { label: '社區大廳', addr: '御和?峰 A 棟 1F 大廳', tag: '住家' },
  { label: '台北車站', addr: '台北市中正區忠孝西路一段', tag: '常用' },
  { label: '榮總醫院', addr: '台北市北投區石牌路二段201號', tag: '就醫' },
];

// ── trips (read-side; persistent — re-openable after host app restart) ───────
const PE_ACTIVE = {
  id: 'PT-9F20K7', order: 'ord_77310', state: 'enroute',
  from: '御和?峰 A 棟 1F 大廳', to: '台北榮民總醫院 · 門診大樓',
  win: '今日 09:20', vehicle: '舒適車', driver: '吳明翰', plate: 'BKR-2208', rating: 4.9,
  etaMin: 6, cancelWindowMin: 2,
};

const PE_TRIPS = [
  { id: 'PT-9F20K7', date: '06-14 09:20', from: '社區大廳', to: '台北榮總', state: 'enroute', fare: '—' },
  { id: 'PT-9E11A3', date: '06-12 14:05', from: '台北車站', to: '社區大廳', state: 'completed', fare: 'NT$ 285' },
  { id: 'PT-9D08F1', date: '06-09 08:30', from: '社區大廳', to: '內湖科技園區', state: 'completed', fare: 'NT$ 410' },
  { id: 'PT-9C77B9', date: '06-05 19:40', from: '信義威秀', to: '社區大廳', state: 'cancelled', fare: 'NT$ 0' },
];

const PE_STATE = {
  matching:   { zh: '媒合中', tone: 'warn', en: 'matching' },
  assigned:   { zh: '已派車', tone: 'primary', en: 'assigned' },
  enroute:    { zh: '前往上車', tone: 'info', en: 'en_route' },
  inprogress: { zh: '行程中', tone: 'info', en: 'in_progress' },
  completed:  { zh: '已完成', tone: 'success', en: 'completed' },
  cancelled:  { zh: '已取消', tone: 'neutral', en: 'cancelled' },
};
function peState(s) { return PE_STATE[s] || PE_STATE.matching; }

// receipt (PII masked)
const PE_RECEIPT = {
  id: 'PT-9E11A3', order: 'ord_77120', date: '2026-06-12 14:05', completedAt: '14:41',
  from: '台北車站 · 東三門', to: '御和?峰 A 棟 1F 大廳',
  vehicle: '標準車', driver: '吳明翰', plate: 'BKR-2208',
  passenger: '李采縈', maskedPhone: '0912-***-820',
  fareBase: 'NT$ 85', fareDistance: 'NT$ 168', fareTime: 'NT$ 32', total: 'NT$ 285',
  pay: '社區月結 · 綁定住戶帳號', channel: '御和生活 App',
};

Object.assign(window, {
  PE_PARTNERS, PE_RESIDENT, PE_VEHICLES, PE_SAVED,
  PE_ACTIVE, PE_TRIPS, PE_STATE, peState, PE_RECEIPT,
});
