// fleet-data.jsx — fixtures for Fleet Partner Portal (大都會車隊 example).
// Mirrors the public-site fleet dashboard numbers so the story is consistent.

const FLEET_SELF = { id: 'flp_002', name: '大都會車隊', code: 'METRO_FLEET', drivers: 128, dispatchable: 96, qualityScore: 4.86 };

// Affiliated drivers (subset shown)
const FX_FLEET_DRIVERS = [
  { id: 'd_8821', name: '林志偉', plate: 'ARJ-2891', status: 'available',  license: 'valid',       docs: 'complete', training: 'complete', trips30: 412, rating: 4.91, svc: ['realtime','business','airport'] },
  { id: 'd_8843', name: '陳俊宏', plate: 'ARJ-3120', status: 'on_trip',    license: 'valid',       docs: 'complete', training: 'complete', trips30: 386, rating: 4.86, svc: ['realtime','business','airport','insurance'] },
  { id: 'd_8851', name: '黃文豪', plate: 'ARJ-3308', status: 'break',      license: 'expires_30d', docs: 'missing_1', training: 'complete', trips30: 298, rating: 4.78, svc: ['realtime','business'] },
  { id: 'd_8862', name: '王建民', plate: 'ARJ-2710', status: 'offline',    license: 'valid',       docs: 'complete', training: 'pending',  trips30: 0,   rating: 4.92, svc: ['realtime'] },
  { id: 'd_8870', name: '張育成', plate: 'ARJ-3401', status: 'available',  license: 'valid',       docs: 'complete', training: 'complete', trips30: 351, rating: 4.83, svc: ['realtime','business','travel'] },
  { id: 'd_8881', name: '吳鎮宇', plate: 'ARJ-3502', status: 'available',  license: 'valid',       docs: 'missing_2', training: 'complete', trips30: 274, rating: 4.95, svc: ['realtime','airport'] },
];

const FX_FLEET_VEHICLES = [
  { plate: 'ARJ-2891', model: 'Toyota Prius α', year: 2023, driver: '林志偉', svc: ['realtime','business','airport'], insurance: '2026-08-14', inspection: 'ok', status: 'active' },
  { plate: 'ARJ-3120', model: 'Hyundai Custo', year: 2024, driver: '陳俊宏', svc: ['realtime','business','airport','insurance'], insurance: '2027-01-05', inspection: 'ok', status: 'active' },
  { plate: 'ARJ-3308', model: 'Toyota Sienta', year: 2022, driver: '黃文豪', svc: ['realtime','business'], insurance: '2026-05-22', inspection: 'due_30d', status: 'active' },
  { plate: 'ARJ-2710', model: 'Toyota Prius α', year: 2023, driver: '王建民', svc: ['realtime'], insurance: '2026-12-30', inspection: 'ok', status: 'maintenance' },
  { plate: 'ARJ-3401', model: 'Hyundai Custo', year: 2024, driver: '張育成', svc: ['realtime','business','travel'], insurance: '2027-02-11', inspection: 'ok', status: 'active' },
];

const FX_FLEET_TRIPS = [
  { id: 'ord_8232', svc: 'airport',  driver: '陳俊宏', tenant: 'YAMATO', pickup: '台北信義 松仁路 100 號', fare: 'NT$ 1,580', commission: 'NT$ 474', status: 'completed', date: '06-04 14:30' },
  { id: 'ord_8231', svc: 'business', driver: '林志偉', tenant: 'TSMC_FAB18', pickup: '新竹科學園區 力行六路', fare: 'NT$ 3,420', commission: 'NT$ 1,026', status: 'completed', date: '06-04 15:30' },
  { id: 'ord_8245', svc: 'realtime', driver: '張育成', tenant: '—', pickup: '台北中山 民生東路', fare: 'NT$ 285', commission: 'NT$ 86', status: 'completed', date: '06-04 16:02' },
  { id: 'ord_8211', svc: 'insurance', driver: '陳俊宏', tenant: 'CATHAY_LIFE', pickup: '台大醫院 西址', fare: 'NT$ 640', commission: 'NT$ 192', status: 'completed', date: '06-04 11:20' },
  { id: 'ord_8260', svc: 'travel',   driver: '張育成', tenant: 'TPE_HOTEL_GRP', pickup: '凱撒飯店 台北館', fare: 'NT$ 2,100', commission: 'NT$ 630', status: 'in_progress', date: '06-05 09:15' },
  { id: 'ord_8198', svc: 'business', driver: '黃文豪', tenant: 'YAMATO', pickup: '台北信義 松仁路', fare: '—', commission: '—', status: 'cancelled', date: '06-04 10:05' },
];

// Revenue share statement lines (current month)
const FX_FLEET_STATEMENT = {
  period: '2026-05', status: 'pending_confirm', payable: 'NT$ 642,000',
  lines: [
    { k: '逐趟分潤 · per-trip commission', en: 'per_trip', v: 'NT$ 598,400', sign: '+' },
    { k: '招募獎金 · recruitment bonus', en: 'recruitment', v: 'NT$ 24,000', sign: '+' },
    { k: '管理費 · monthly management fee', en: 'mgmt_fee', v: 'NT$ 36,000', sign: '+' },
    { k: '績效獎金 · performance bonus', en: 'performance', v: 'NT$ 12,000', sign: '+' },
    { k: '罰則 / 追回 · penalty / clawback', en: 'clawback', v: 'NT$ 28,400', sign: '−' },
  ],
};
const FX_FLEET_STATEMENTS = [
  { id: 'fst_2026_05', period: '2026-05', trips: 14280, payable: 'NT$ 642,000', status: 'pending_confirm', issued: '2026-06-01' },
  { id: 'fst_2026_04', period: '2026-04', trips: 13120, payable: 'NT$ 588,400', status: 'paid', issued: '2026-05-01' },
  { id: 'fst_2026_03', period: '2026-03', trips: 12740, payable: 'NT$ 561,200', status: 'paid', issued: '2026-04-01' },
];

// Documents needing attention
const FX_FLEET_DOCS = [
  { driver: '黃文豪', id: 'd_8851', doc: '職業駕照', en: 'pro_license', status: 'expires_30d', due: '2026-07-04', owner: 'fleet' },
  { driver: '吳鎮宇', id: 'd_8881', doc: '機場接送資格證', en: 'airport_permit', status: 'missing', due: '—', owner: 'fleet' },
  { driver: '吳鎮宇', id: 'd_8881', doc: '車輛保險', en: 'vehicle_insurance', status: 'expires_60d', due: '2026-08-02', owner: 'fleet' },
  { driver: '陳俊宏', id: 'd_8843', doc: '保險代步服務同意書', en: 'insurance_consent', status: 'pending_signature', due: '2026-06-10', owner: 'driver' },
];

// Training
const FX_FLEET_TRAINING = [
  { course: '平台合作基礎', en: 'platform_basics', completed: 126, total: 128, pct: 98 },
  { course: '商務派車服務', en: 'business_service', completed: 92, total: 110, pct: 84 },
  { course: '機場接送 SOP', en: 'airport_sop', completed: 48, total: 60, pct: 80 },
  { course: '保險代步流程', en: 'insurance_flow', completed: 22, total: 40, pct: 55 },
  { course: '安全與事故處理', en: 'safety_incident', completed: 121, total: 128, pct: 95 },
];

// Incidents / complaints (fleet responsibility view)
const FX_FLEET_CASES = [
  { id: 'cmp_0908', type: 'complaint', cat: 'driver_conduct', driver: '黃文豪', severity: 'high', responsibility: 'fleet', status: 'in_review', sla: 'breached', date: '2026-05-20' },
  { id: 'inc_0213', type: 'incident', cat: 'collision', driver: '張育成', severity: 'medium', responsibility: 'shared', status: 'open', sla: 'on_track', date: '2026-05-08' },
  { id: 'cmp_0912', type: 'complaint', cat: 'pricing_dispute', driver: '林志偉', severity: 'low', responsibility: 'platform', status: 'pending', sla: 'on_track', date: '2026-05-18' },
];

// Quality metrics
const FX_FLEET_QUALITY = [
  { k: '平均評分', en: 'avg_rating', v: '4.86', tone: 'success', delta: '↑ 0.02' },
  { k: '完成率', en: 'completion_rate', v: '97.4%', tone: 'success', delta: '↑ 0.6pp' },
  { k: '取消率', en: 'cancel_rate', v: '1.8%', tone: 'neutral', delta: '↓ 0.2pp' },
  { k: 'no-show 率', en: 'no_show_rate', v: '0.8%', tone: 'neutral', delta: '—' },
  { k: '申訴率', en: 'complaint_rate', v: '0.12%', tone: 'warn', delta: '↑ 0.01pp' },
  { k: '準點率', en: 'on_time_rate', v: '94.2%', tone: 'success', delta: '↑ 1.1pp' },
];

const SVC_LABELS = {
  realtime:  { zh: '即時叫車', tone: 'success' },
  business:  { zh: '商務派車', tone: 'accent' },
  airport:   { zh: '機場接送', tone: 'info' },
  insurance: { zh: '保險代步', tone: 'warn' },
  travel:    { zh: '旅行社接送', tone: 'platform' },
};

Object.assign(window, {
  FLEET_SELF, FX_FLEET_DRIVERS, FX_FLEET_VEHICLES, FX_FLEET_TRIPS,
  FX_FLEET_STATEMENT, FX_FLEET_STATEMENTS, FX_FLEET_DOCS, FX_FLEET_TRAINING,
  FX_FLEET_CASES, FX_FLEET_QUALITY, SVC_LABELS,
});
