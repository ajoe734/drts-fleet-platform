// mgmt-tokens.jsx — Shared design tokens for the four management consoles.
// Authority-doc aligned: identity chip needs actor/realm/tenant/env,
// EmptyReason has 6 values, refresh has 7 tiers, audit cross-actor needs 4 actor types.
// Linear/Stripe density; color-coded accent per console; zh-TW primary with bilingual labels.

// ── Accents per console ──────────────────────────────────────────────────────
const MGMT_ACCENTS = {
  platform: {
    light: '#4F46E5', lightHi: '#6366F1', lightBg: '#EEF2FF', lightBorder: '#C7D2FE',
    dark:  '#A5B4FC', darkHi:  '#C7D2FE', darkBg:  '#1E1B4B', darkBorder:  '#312E81',
    name: 'Platform Admin', tagline: '平台治理控制平面',
  },
  ops: {
    light: '#DC2626', lightHi: '#EF4444', lightBg: '#FEF2F2', lightBorder: '#FECACA',
    dark:  '#FCA5A5', darkHi:  '#FECACA', darkBg:  '#3F1212', darkBorder:  '#5C1A1A',
    name: 'Ops Console', tagline: '即時營運工作台',
  },
  tenant: {
    light: '#0F766E', lightHi: '#14B8A6', lightBg: '#F0FDFA', lightBorder: '#99F6E4',
    dark:  '#5EEAD4', darkHi:  '#99F6E4', darkBg:  '#0F2A28', darkBorder:  '#134E48',
    name: 'Tenant Console', tagline: '租戶自助與整合管理',
  },
  // Reserved for future apps/partner-booking-web (Q-TEN03 cutover)
  partner: {
    light: '#B45309', lightHi: '#D97706', lightBg: '#FFFBEB', lightBorder: '#FDE68A',
    dark:  '#FCD34D', darkHi:  '#FDE68A', darkBg:  '#3A2A0A', darkBorder:  '#5C4218',
    name: 'Partner Booking', tagline: '合作夥伴叫車入口',
  },
};

// ── Actor realm colors — for cross-actor audit chips (Q-TEN13) ──────────────
const REALM_COLORS = {
  light: {
    tenant:   { fg: '#0F766E', bg: '#F0FDFA', bd: '#99F6E4' },
    ops:      { fg: '#DC2626', bg: '#FEF2F2', bd: '#FECACA' },
    platform: { fg: '#4F46E5', bg: '#EEF2FF', bd: '#C7D2FE' },
    system:   { fg: '#6B7280', bg: '#F1F4F8', bd: '#CBD5E1' },
    driver:   { fg: '#A8590B', bg: '#FCEED6', bd: '#F0CC95' },
  },
  dark: {
    tenant:   { fg: '#5EEAD4', bg: '#0F2A28', bd: '#134E48' },
    ops:      { fg: '#FCA5A5', bg: '#3F1212', bd: '#5C1A1A' },
    platform: { fg: '#A5B4FC', bg: '#1E1B4B', bd: '#312E81' },
    system:   { fg: '#94A3B8', bg: '#1A2230', bd: '#2A3445' },
    driver:   { fg: '#FCD34D', bg: '#3A2A0A', bd: '#5C4218' },
  },
};

// ── Refresh tier — per Q-X02 ────────────────────────────────────────────────
const REFRESH_TIERS = {
  urgent:      { code: 'T0', label: '即時', ms: 5000,    note: 'push + 5s 補' },
  fast:        { code: 'T1', label: '快速', ms: 3000,    note: '行程進行中' },
  dispatch:    { code: 'T2', label: '派遣', ms: 5000,    note: '派遣 / 客服 / 審批' },
  medium:      { code: 'T3', label: '中等', ms: 15000,   note: '案件 / 監看' },
  medium_slow: { code: 'T4', label: '中慢', ms: 30000,   note: '治理 / 結算' },
  slow:        { code: 'T5', label: '慢速', ms: 30000,   note: '租戶面' },
  manual:      { code: 'T6', label: '手動', ms: null,    note: '報核型' },
};

// ── EmptyReason — per Q-X15 ─────────────────────────────────────────────────
const EMPTY_REASONS = {
  no_data:              { label: '尚無資料', en: 'No data',              hint: '目前沒有任何項目，這是合法的空狀態。' },
  not_provisioned:      { label: '尚未設定', en: 'Not provisioned',      hint: '此功能尚未為您所在的範圍開通。' },
  fetch_failed:         { label: '讀取失敗', en: 'Fetch failed',         hint: '後端服務無法回應，請稍後再試或聯絡支援。' },
  permission_denied:    { label: '無權限',   en: 'Permission denied',    hint: '您目前的角色無權檢視此區段。' },
  external_unavailable: { label: '外部失聯', en: 'External unavailable', hint: '依賴的外部介接服務目前不可用。' },
  filtered_empty:       { label: '篩選過嚴', en: 'Filtered empty',       hint: '套用的篩選沒有符合的結果，請放寬條件。' },
  driver_not_eligible:  { label: '司機不合資格', en: 'Driver not eligible', hint: '司機目前不符合任一平台的派工資格。' },
};

// ── Risk levels — per Q-X09 ─────────────────────────────────────────────────
const RISK_LEVELS = {
  low:    { label: '低風險', icon: 'check',   tone: 'success', pattern: '直接執行 + toast 收據' },
  medium: { label: '中風險', icon: 'warn',    tone: 'warn',    pattern: 'modal 確認 + toast 收據' },
  high:   { label: '高風險', icon: 'danger',  tone: 'danger',  pattern: 'modal + 必填原因 + toast 收據' },
};

// ── Theme builder ───────────────────────────────────────────────────────────
function buildMgmtTheme({ console: surface = 'platform', dark = false, density = 'compact' } = {}) {
  const a = MGMT_ACCENTS[surface] || MGMT_ACCENTS.platform;
  const accent       = dark ? a.dark : a.light;
  const accentHi     = dark ? a.darkHi : a.lightHi;
  const accentBg     = dark ? a.darkBg : a.lightBg;
  const accentBorder = dark ? a.darkBorder : a.lightBorder;

  const palette = dark ? {
    bg:        '#0A0E16',
    bgRaised:  '#0F1421',
    surface:   '#141B2B',
    surfaceHi: '#1A2235',
    surfaceLo: '#0B1220',
    border:    '#22304A',
    borderStrong: '#324A6E',
    rowHover:  '#162038',
    rowSelect: '#172747',
    text:      '#E5EAF3',
    textMuted: '#94A3B8',
    textDim:   '#64748B',
    invert:    '#0A0E16',
    success:   '#34D399', successBg: '#0E2A1F', successBorder: '#1F4D38',
    warn:      '#FBBF24', warnBg:    '#2D1F08', warnBorder:    '#5C4218',
    danger:    '#F87171', dangerBg:  '#2C100E', dangerBorder:  '#5C1F1A',
    info:      '#93C5FD', infoBg:    '#0F1F36', infoBorder:    '#1E3A5F',
    neutral:   '#94A3B8', neutralBg: '#1A2230', neutralBorder: '#2A3445',
    shadow:    '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3)',
    shadowSm:  '0 1px 2px rgba(0,0,0,.4)',
    realm:     REALM_COLORS.dark,
  } : {
    bg:        '#F7F8FB',
    bgRaised:  '#FFFFFF',
    surface:   '#FFFFFF',
    surfaceHi: '#FFFFFF',
    surfaceLo: '#F1F4F8',
    border:    '#E5E8EE',
    borderStrong: '#C9D2DD',
    rowHover:  '#F8FAFC',
    rowSelect: accentBg,
    text:      '#0B1220',
    textMuted: '#475569',
    textDim:   '#6B7280',
    invert:    '#FFFFFF',
    success:   '#0F7B5A', successBg: '#E5F4ED', successBorder: '#A7D7C2',
    warn:      '#A8590B', warnBg:    '#FCEED6', warnBorder:    '#F0CC95',
    danger:    '#B42318', dangerBg:  '#FEE4E2', dangerBorder:  '#F8B3AC',
    info:      '#1F5DB8', infoBg:    '#E4EDFB', infoBorder:    '#B6CBEC',
    neutral:   '#475569', neutralBg: '#F1F4F8', neutralBorder: '#CBD5E1',
    shadow:    '0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)',
    shadowSm:  '0 1px 2px rgba(15,23,42,.05)',
    realm:     REALM_COLORS.light,
  };

  const D = density === 'comfy' ? {
    rowH: 44, cellY: 10, cellX: 14, sectGap: 18, cardPad: 18, fz: 14,
    h1: 22, h2: 17, h3: 15, micro: 11.5,
  } : {
    rowH: 34, cellY: 7, cellX: 12, sectGap: 14, cardPad: 14, fz: 13,
    h1: 20, h2: 15, h3: 13.5, micro: 11,
  };

  return {
    mode: dark ? 'dark' : 'light', surface, density,
    accent, accentHi, accentBg, accentBorder,
    surfaceName: a.name, surfaceTagline: a.tagline,
    ...palette, ...D,
  };
}

const MGMT_TYPE = {
  family: '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono:   '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

// ── i18n dictionary — every state code needs a translation map (Q-X17) ──────
// Keep narrow per-domain dictionaries colocated with screens; this is the
// shared cross-app vocabulary.
const MGMT_STRINGS = {
  // chrome
  search:   { zh: '搜尋…', en: 'Search…' },
  cmdk:     { zh: '指令', en: 'Command' },
  refresh:  { zh: '重新整理', en: 'Refresh' },
  save:     { zh: '儲存', en: 'Save' },
  cancel:   { zh: '取消', en: 'Cancel' },
  apply:    { zh: '套用', en: 'Apply' },
  newBtn:   { zh: '新增', en: 'New' },
  filter:   { zh: '篩選', en: 'Filter' },
  export:   { zh: '匯出', en: 'Export' },
  // common verbs
  approve:  { zh: '核准', en: 'Approve' },
  reject:   { zh: '退回', en: 'Reject' },
  resolve:  { zh: '結案', en: 'Resolve' },
  reopen:   { zh: '重啟', en: 'Reopen' },
  escalate: { zh: '升級', en: 'Escalate' },
  assign:   { zh: '指派', en: 'Assign' },
  retry:    { zh: '重試', en: 'Retry' },
  publish:  { zh: '發佈', en: 'Publish' },
  revoke:   { zh: '撤銷', en: 'Revoke' },
  rotate:   { zh: '輪替', en: 'Rotate' },
  disable:  { zh: '停用', en: 'Disable' },
  enable:   { zh: '啟用', en: 'Enable' },
  // freshness
  fresh:    { zh: '即時', en: 'Fresh' },
  stale:    { zh: '已過時', en: 'Stale' },
  degraded: { zh: '降級', en: 'Degraded' },
  // identity realms
  platform: { zh: '平台', en: 'Platform' },
  ops:      { zh: '營運', en: 'Ops' },
  tenant:   { zh: '租戶', en: 'Tenant' },
  driver:   { zh: '司機', en: 'Driver' },
  system:   { zh: '系統', en: 'System' },
};
function tt(key, lang = 'zh') { return (MGMT_STRINGS[key] || {})[lang] ?? key; }

// ── Icons (24px viewBox, currentColor stroke) ────────────────────────────────
const MGMT_ICONS = {
  // nav · platform admin
  home:        'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  tenants:     'M3 21V8l9-5 9 5v13M9 21v-8h6v8',
  governance:  'M12 3l9 5v6c0 5-4 8-9 8s-9-3-9-8V8z',
  partners:    'M16 8a4 4 0 10-8 0 4 4 0 008 0zM2 21a8 8 0 0116 0M19 11l2 2-2 2',
  users:       'M16 14a4 4 0 10-8 0 4 4 0 008 0zM2 21a8 8 0 0116 0',
  fleet:       'M3 13l2-7h14l2 7M3 13v5h2M21 13v5h-2M3 13h18M7 17h2m6 0h2',
  switchboard: 'M4 6h16M4 12h16M4 18h10',
  pricing:     'M3 10l9-7 9 7v11H3zM9 21v-7h6v7M12 7v.01',
  payments:    'M3 7h18v10H3zM3 11h18M7 15h2',
  reimburse:   'M4 11h16M4 7h16v10H4zM8 15h3',
  health:      'M3 12h4l3-8 4 16 3-8h4',
  notices:     'M4 19V5l16 7z',
  audit:       'M9 12l2 2 4-4M3 6h18v14H3zM3 6V3h18v3',
  hold:        'M10 5v14M14 5v14M5 9a3 3 0 016 0v6a3 3 0 01-6 0zM13 9a3 3 0 016 0v6a3 3 0 01-6 0z',
  flags:       'M5 21V4h12l-2 4 2 4H5',
  adapters:    'M9 5v6H5l7 8V13h4z',
  // nav · ops
  dashboard:   'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z',
  dispatch:    'M3 12h6l2-3 4 6 2-3h4M5 7h14M5 17h14',
  callcenter:  'M3 5c0 9 7 16 16 16v-4l-4-2-2 2a12 12 0 01-6-6l2-2-2-4z',
  complaints:  'M21 12c0 4-4 7-9 7-1.5 0-3-.3-4-.8L3 20l1-4c-.6-1-1-2.4-1-4 0-4 4-7 9-7s9 3 9 7z',
  incidents:   'M12 3l10 18H2zM12 10v5M12 17v.01',
  approval:    'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  reports:     'M5 3h11l4 4v14H5zM14 3v5h6M9 13h6M9 17h4',
  revenue:     'M3 17l5-5 4 4 7-9M14 7h6v6',
  attendance:  'M5 7h14v13H5zM5 7V3h14v4M9 13h2M13 13h2M9 17h2M13 17h2',
  maintenance: 'M14.7 6.3a4 4 0 105.4 5.4L21 12V3l-9 .1-.1.1zM4 20l8-8',
  vehicles:    'M3 17h18M5 17l2-7h10l2 7M7 17v2H5v-2M19 17v2h-2v-2M9 13h6',
  contracts:   'M7 3h10l3 3v15H7zM7 3v18M11 9h6M11 13h6M11 17h4',
  // nav · tenant
  bookings:    'M5 5h14v14H5zM5 9h14M9 5v14M9 13h4',
  passengers:  'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  addresses:   'M12 21s-7-7-7-12a7 7 0 0114 0c0 5-7 12-7 12zM12 11a2 2 0 100-4 2 2 0 000 4z',
  notifs:      'M6 8a6 6 0 1112 0v5l2 3H4l2-3zM10 19a2 2 0 004 0',
  sla:         'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  webhooks:    'M9 12a3 3 0 116 0M6 16l3-5M18 16l-3-5M6 19a2 2 0 100-4 2 2 0 000 4zM18 19a2 2 0 100-4 2 2 0 000 4zM12 4a2 2 0 100 4 2 2 0 000-4z',
  apiKeys:     'M14 8a4 4 0 11-1.1 7.9L10 19H7v-3l5-5A4 4 0 0114 8zM15 11h.01',
  billing:     'M5 5h14v14H5zM5 9h14M9 13h6M9 17h3',
  integration: 'M4 7l4-3 4 3 4-3 4 3M4 17l4 3 4-3 4 3 4-3M4 7v10M20 7v10',
  costCenter:  'M3 3h18v18H3zM3 9h18M9 3v18',
  rules:       'M4 6h4l2 2h10v10H4zM8 12h8',
  // utility
  search:      'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  bell:        'M6 8a6 6 0 1112 0v5l2 3H4l2-3zM10 19a2 2 0 004 0',
  chevR:       'M9 6l6 6-6 6',
  chevD:       'M6 9l6 6 6-6',
  chevU:       'M6 15l6-6 6 6',
  chevL:       'M15 6l-6 6 6 6',
  ext:         'M14 4h6v6M10 14L20 4M19 13v6H5V5h6',
  copy:        'M9 3h11v14H9zM5 7h11v14H5z',
  download:    'M12 3v14M5 12l7 7 7-7M5 21h14',
  more:        'M5 12h.01M12 12h.01M19 12h.01',
  filter:      'M3 5h18l-7 9v6l-4-2v-4z',
  plus:        'M12 5v14M5 12h14',
  check:       'M5 13l4 4L19 7',
  x:           'M6 6l12 12M18 6L6 18',
  warn:        'M12 3l10 18H2zM12 10v5M12 17v.01',
  info:        'M12 8h.01M11 12h1v5h1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  danger:      'M12 3v9M12 17v.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  ok:          'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  pin:         'M12 21l-5-5 5-9 5 9zM12 12v.01',
  arrow:       'M5 12h14M13 6l6 6-6 6',
  car:         'M3 17h18M5 17l2-7h10l2 7M7 17v2H5v-2M19 17v2h-2v-2',
  phone:       'M3 5c0 9 7 16 16 16v-4l-4-2-2 2a12 12 0 01-6-6l2-2-2-4z',
  clock:       'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  refresh:     'M3 12a9 9 0 0115-6.4L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.4L3 16M3 21v-5h5',
  key:         'M14 8a4 4 0 11-1.1 7.9L10 19H7v-3l5-5A4 4 0 0114 8zM15 11h.01',
  lock:        'M8 11V8a4 4 0 018 0v3M6 11h12v10H6z',
  eye:         'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z',
  eyeOff:      'M3 3l18 18M10 6a8 8 0 0111 6 8 8 0 01-3 4M6 8a8 8 0 003 11M14 14a3 3 0 11-4-4',
  sos:         'M12 2l10 18H2L12 2zM12 9v5M12 17v.01',
};

function MgmtIcon({ name, size = 16, stroke = 1.6, style = {} }) {
  const d = MGMT_ICONS[name] || MGMT_ICONS.more;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: '0 0 auto', display: 'block', ...style }}>
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

Object.assign(window, {
  MGMT_ACCENTS, REALM_COLORS, REFRESH_TIERS, EMPTY_REASONS, RISK_LEVELS,
  MGMT_TYPE, MGMT_STRINGS, MGMT_ICONS, buildMgmtTheme, tt, MgmtIcon,
});
