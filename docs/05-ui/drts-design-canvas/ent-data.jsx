// ent-data.jsx — Enterprise Dispatch · fixtures. zh-TW. Command-pattern aware.
// Behaviour/data authority: /api/tenant/*. Numbers are design placeholders.

const ENT_USERS = {
  requester: { name: '林冠廷', en: 'K.T. Lin', role: 'employee_requester', roleZh: '一般員工', dept: '產品部', ext: '#2204' },
  delegate:  { name: '周敏', en: 'M. Chou', role: 'delegate_booker', roleZh: '行政祕書', dept: '營運支援', ext: '#1180' },
  approver:  { name: '高志遠', en: 'C.Y. Kao', role: 'approver_viewer', roleZh: '部門主管', dept: '產品部', ext: '#2200' },
};

const ENT_PASSENGERS = [
  { name: '林冠廷', dept: '產品部', ext: '#2204', tag: '本人' },
  { name: '陳思妤', dept: '產品部 · 設計', ext: '#2231', tag: '常用' },
  { name: '黃柏睿', dept: '業務一部', ext: '#3310', tag: '' },
  { name: '訪客 · Sato Kenji', dept: '外賓 · 日本客戶', ext: '—', tag: '外賓' },
];

const ENT_COST_CENTERS = [
  { code: 'CC-PRD-01', name: '產品部 · 一般差旅', valid: true, remain: 'NT$ 84,200 / 120,000' },
  { code: 'CC-PRD-07', name: '產品部 · 客戶接待', valid: true, remain: 'NT$ 31,000 / 60,000' },
  { code: 'CC-OPS-03', name: '營運支援 · 行政', valid: true, remain: 'NT$ 12,400 / 40,000' },
  { code: 'CC-SAL-02', name: '業務部 · 客戶拜訪', valid: false, remain: '已停用' },
];

const ENT_ADDRESSES = [
  { label: '台北總部', addr: '台北市信義區松高路 19 號', tag: '辦公室' },
  { label: '南港研發中心', addr: '台北市南港區三重路 19-2 號', tag: '辦公室' },
  { label: '桃園機場 T2', addr: '桃園市大園區航站南路 9 號', tag: '機場' },
  { label: '君悅酒店', addr: '台北市信義區松壽路 2 號', tag: '接待' },
];

const ENT_QUOTA = { used: 23, total: 40, label: '23 / 40 趟', amount: 'NT$ 84,200 / 120,000' };

// booking list (read-side projection). state: reserved/approval/assigned/enroute/inprogress/completed/cancelled/nosupply
const ENT_BOOKINGS = [
  { id: 'EB-7K2F90', order: 'ord_55120', passenger: '林冠廷', bookedBy: '林冠廷', self: true,
    from: '台北總部', to: '桃園機場 T2', win: '06/14 07:30', state: 'assigned', cc: 'CC-PRD-01',
    airport: { dir: '出境去程', flight: 'BR198', terminal: 'T2', luggage: '2 件' }, approval: 'auto', vehicle: '商務車' },
  { id: 'EB-7K2E1D', order: 'ord_55098', passenger: '訪客 · Sato Kenji', bookedBy: '周敏', self: false,
    from: '桃園機場 T1', to: '君悅酒店', win: '06/13 15:20', state: 'enroute', cc: 'CC-PRD-07',
    airport: { dir: '入境接機', flight: 'JL809', terminal: 'T1', luggage: '3 件' }, approval: 'approved', vehicle: '商務車', greet: true },
  { id: 'EB-7K2C44', order: 'ord_54980', passenger: '陳思妤', bookedBy: '周敏', self: false,
    from: '南港研發中心', to: '台北總部', win: '06/13 09:00', state: 'approval', cc: 'CC-PRD-01',
    airport: null, approval: 'pending', vehicle: '一般轎車' },
  { id: 'EB-7K2A08', order: 'ord_54871', passenger: '林冠廷', bookedBy: '林冠廷', self: true,
    from: '台北總部', to: '台北101辦公大樓', win: '06/12 13:00', state: 'completed', cc: 'CC-PRD-01',
    airport: null, approval: 'auto', vehicle: '一般轎車', fare: 'NT$ 420' },
  { id: 'EB-7K28Z2', order: 'ord_54720', passenger: '黃柏睿', bookedBy: '周敏', self: false,
    from: '台北總部', to: '新竹科學園區', win: '06/11 08:00', state: 'completed', cc: 'CC-PRD-07',
    airport: null, approval: 'approved', vehicle: '商務車', fare: 'NT$ 2,180' },
  { id: 'EB-7K2701', order: 'ord_54610', passenger: '陳思妤', bookedBy: '陳思妤', self: true,
    from: '君悅酒店', to: '桃園機場 T2', win: '06/10 05:00', state: 'cancelled', cc: 'CC-PRD-01',
    airport: { dir: '出境去程', flight: 'CI103', terminal: 'T2', luggage: '1 件' }, approval: 'auto', vehicle: '一般轎車' },
];

const ENT_STATE_META = {
  reserved:   { zh: '已預約', tone: 'warn',    en: 'reserved' },
  approval:   { zh: '待審批', tone: 'warn',    en: 'approval_pending' },
  assigned:   { zh: '已派車', tone: 'primary', en: 'assigned' },
  enroute:    { zh: '前往上車', tone: 'info',  en: 'en_route' },
  inprogress: { zh: '行程中', tone: 'info',    en: 'in_progress' },
  completed:  { zh: '已完成', tone: 'success', en: 'completed' },
  cancelled:  { zh: '已取消', tone: 'neutral', en: 'cancelled' },
  nosupply:   { zh: '無法派車', tone: 'danger',en: 'no_supply' },
};
function entStateMeta(s) { return ENT_STATE_META[s] || ENT_STATE_META.reserved; }

const ENT_VEHICLES = [
  { id: 'sedan', name: '一般轎車', sub: '1–3 人 · 市區', en: 'sedan' },
  { id: 'business', name: '商務車', sub: '1–4 人 · 接待', en: 'business' },
  { id: 'van', name: '七人座', sub: '4–6 人 · 團體', en: 'van' },
];

Object.assign(window, {
  ENT_USERS, ENT_PASSENGERS, ENT_COST_CENTERS, ENT_ADDRESSES, ENT_QUOTA,
  ENT_BOOKINGS, ENT_STATE_META, entStateMeta, ENT_VEHICLES,
});
