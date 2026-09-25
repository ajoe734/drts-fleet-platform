// roc-data.jsx — A1 ROC Console (FSD 沙盒遠端監控中心) shared data + nav.
// Hard rules baked into components: NO steering-angle / perception / RSU health; telemetry-freshness
// and regulatory-event-freshness are SEPARATE; Tesla事件 / 安全員回報 / ROC處置 three columns NOT merged;
// CTAs come from availableActions; NO remote-driving controls; every datum labelled with evidence source.

const ROC_ACTOR = { name: 'RC', display: '徐文凱', role: 'roc_operator' };
const ROC_HEALTH = { status: 'healthy', lastCheckedAt: '4s' };

const ROC_NAV = [
  { divider: '監控 · Monitoring' },
  { key: 'overview',   icon: 'dashboard', label: '總覽 · Overview' },
  { key: 'liveboard',  icon: 'tracking',  label: '即時看板 · Live Board', badge: '7', badgeTone: 'accent' },
  { key: 'trips',      icon: 'reports',   label: '行程 · Trips' },
  { divider: '車輛 · Fleet' },
  { key: 'vehicles',   icon: 'vehicles',  label: '車輛 · Vehicles' },
  { divider: '處置 · Response' },
  { key: 'takeover',   icon: 'governance',label: '接管佇列 · Takeover', badge: '3', badgeTone: 'warn' },
  { key: 'alerts',     icon: 'incidents', label: '警示 · Alerts', badge: '5', badgeTone: 'warn' },
  { key: 'incidents',  icon: 'complaints',label: '事故 · Incidents', badge: '1', badgeTone: 'danger' },
  { key: 'evidence',   icon: 'audit',     label: '證據 · Evidence' },
  { divider: '監理 · Regulatory' },
  { key: 'provider',   icon: 'health',    label: '供應商健康 · Provider Health' },
  { key: 'reports',    icon: 'billing',   label: '監理報表 · Reports' },
  { key: 'handover',   icon: 'users',     label: '交班 · Shift Handover' },
];

// evidence source provenance — every Tesla/sandbox datum is tagged
const ROC_EVIDENCE = {
  tesla_provided:          { zh: 'Tesla 提供', tone: 'info' },
  operator_reported:       { zh: '安全員回報', tone: 'accent' },
  device_recorded:         { zh: '車載錄製', tone: 'neutral' },
  roc_assessed:            { zh: 'ROC 研判', tone: 'success' },
  not_exposed_by_provider: { zh: '原廠未提供', tone: 'warn' },
};

const FX_ROC_VEHICLES = [
  { id: 'AV-7720', model: 'Model Y', state: 'autonomous', trip: 'trip_88231', area: '信義', so: '陳柏宇', teleFresh: 'fresh', teleAge: '2s', regFresh: 'stale', regAge: '48s', integ: 'connected', speed: 38 },
  { id: 'AV-7732', model: 'Model 3', state: 'takeover', trip: 'trip_88240', area: '南港', so: '吳明翰', teleFresh: 'fresh', teleAge: '1s', regFresh: 'fresh', regAge: '6s', integ: 'connected', speed: 0 },
  { id: 'AV-7715', model: 'Model Y', state: 'autonomous', trip: 'trip_88228', area: '信義', so: '林佳蓉', teleFresh: 'stale', teleAge: '12s', regFresh: 'stale', regAge: '95s', integ: 'degraded', speed: 24 },
  { id: 'AV-7708', model: 'Model Y', state: 'idle', trip: '—', area: '南港場站', so: '—', teleFresh: 'missing', teleAge: '—', regFresh: 'missing', regAge: '—', integ: 'provider_unreachable', speed: 0 },
  { id: 'AV-7741', model: 'Model 3', state: 'autonomous', trip: 'trip_88251', area: '信義', so: '黃志明', teleFresh: 'fresh', teleAge: '3s', regFresh: 'fresh', regAge: '8s', integ: 'connected', speed: 41 },
];
function rocStateMeta(s) {
  return { autonomous: { zh: '自駕中', tone: 'success', en: 'autonomous' }, takeover: { zh: '已接管', tone: 'warn', en: 'safety_takeover' },
    idle: { zh: '待命', tone: 'neutral', en: 'idle' }, fallback: { zh: '轉人駕', tone: 'danger', en: 'fallback' } }[s] || { zh: s, tone: 'neutral' };
}
function freshMeta(f) {
  return { fresh: { tone: 'success', zh: 'fresh' }, stale: { tone: 'warn', zh: 'stale' }, low_accuracy: { tone: 'warn', zh: 'low-acc' }, missing: { tone: 'danger', zh: 'missing' } }[f] || { tone: 'neutral', zh: f };
}

// takeover queue — THREE separate truth columns, never merged
const FX_TAKEOVERS = [
  { id: 'tko_0214', vehicle: 'AV-7720', at: '14:32:08', area: '信義 松仁路口',
    tesla: { label: 'FSD 主動退出', detail: 'disengagement · 黃燈路口', src: 'tesla_provided', conf: 'reason: yellow_light_hesitation' },
    operator: { label: '安全員實體接管', detail: '通過後恢復 FSD', src: 'operator_reported', conf: 'severity: 中' },
    roc: { label: 'ROC 已確認', detail: '正常路口判斷 · 無需建案', src: 'roc_assessed', status: 'reviewed' } },
  { id: 'tko_0215', vehicle: 'AV-7732', at: '14:48:51', area: '南港 經貿二路',
    tesla: { label: '原廠未提供原因', detail: 'reason not exposed', src: 'not_exposed_by_provider', conf: '—' },
    operator: { label: '安全員回報：行人', detail: '行人闖入 · 緊急煞停接管', src: 'operator_reported', conf: 'severity: 高' },
    roc: { label: 'ROC 處置中', detail: '要求補證據 · 待研判', src: 'roc_assessed', status: 'in_review' } },
  { id: 'tko_0216', vehicle: 'AV-7715', at: '15:02:33', area: '信義 松高路',
    tesla: { label: 'FSD 主動退出', detail: 'construction zone', src: 'tesla_provided', conf: 'reason: construction' },
    operator: { label: '尚未回報', detail: '等待安全員回報', src: 'operator_reported', conf: 'pending' },
    roc: { label: '待處置', detail: 'awaiting operator report', src: 'roc_assessed', status: 'pending' } },
];

const FX_ROC_ALERTS = [
  { id: 'al_91', sev: 'warn', t: '監理事件鮮度過期', detail: 'AV-7715 regulatory-event 95s 未更新', at: '15:03', src: 'not_exposed_by_provider' },
  { id: 'al_90', sev: 'danger', t: 'Tesla 整合失聯', detail: 'AV-7708 provider_unreachable 6 分鐘', at: '14:58', src: 'roc_assessed' },
  { id: 'al_89', sev: 'warn', t: '離開核准區域邊界', detail: 'AV-7741 接近信義沙盒邊界 120m', at: '14:55', src: 'roc_assessed' },
  { id: 'al_88', sev: 'warn', t: 'telemetry 鮮度降級', detail: 'AV-7715 telemetry 12s', at: '14:52', src: 'device_recorded' },
  { id: 'al_87', sev: 'info', t: '接管頻率偏高', detail: 'AV-7732 本班 3 次接管', at: '14:49', src: 'roc_assessed' },
];

Object.assign(window, {
  ROC_ACTOR, ROC_HEALTH, ROC_NAV, ROC_EVIDENCE, FX_ROC_VEHICLES, rocStateMeta, freshMeta,
  FX_TAKEOVERS, FX_ROC_ALERTS,
});
