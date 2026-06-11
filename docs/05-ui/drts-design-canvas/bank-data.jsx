// bank-data.jsx — Bank Console (發卡行方案監管台) fixtures + shared chrome.
// Issuer: 中國信託 CTBC. All cardholder/benefit/issuer-auth refs MASKED (Q: 遮罩一律 **** 4821).
// zh-TW primary · en secondary. Read-only surface; DRTS holds dispatch/contract authority.

// 中信品牌金色（benefit / quota 強調用；不進 shared theme，screen-local）
const BK_GOLD     = '#A8771B';
const BK_GOLD_BG  = '#FBF3DF';
const BK_GOLD_BD  = '#ECD9A6';

const BK_HEALTH = { status: 'healthy', lastCheckedAt: '18s' };

// 三種銀行人物 + 角色顯示
const BK_ACTORS = {
  admin:   { name: 'CW', display: '周敬文', role: 'bank_program_admin' },
  ops:     { name: 'HY', display: '黃怡安', role: 'bank_ops_viewer' },
  finance: { name: 'TL', display: '湯立群', role: 'bank_finance' },
};
const BK_ROLE_LABEL = {
  bank_program_admin: { zh: '方案管理員', en: 'program_admin' },
  bank_ops_viewer:    { zh: '營運檢視',   en: 'ops_viewer' },
  bank_finance:       { zh: '財務',       en: 'finance' },
};

// ── Navigation — role-scoped (badge counts reflect open exceptions) ──────────
const BK_NAV = [
  { divider: '總覽 · Overview' },
  { key: 'home',       icon: 'home',       label: '首頁總覽 · Home' },
  { divider: '訂單 · Bookings' },
  { key: 'bookings',   icon: 'bookings',   label: '訂單 · Bookings', badge: '6', badgeTone: 'accent' },
  { divider: '方案治理 · Programs' },
  { key: 'programs',   icon: 'governance', label: '方案與配額 · Programs' },
  { key: 'contracts',  icon: 'contracts',  label: '合約與 SLA · Contracts', badge: '1', badgeTone: 'warn' },
  { divider: '財務 · Finance' },
  { key: 'statements', icon: 'billing',    label: '對帳單 · Statements', badge: '1', badgeTone: 'warn' },
  { divider: '帳號與稽核 · Access' },
  { key: 'users',      icon: 'users',      label: '人員與角色 · Users' },
  { key: 'audit',      icon: 'audit',      label: '稽核 · Audit' },
];

// ── 1. Orders（訂單）— masked cardholder/benefit refs ────────────────────────
const FX_BK_ORDERS = [
  { id: 'BK-2K7F31', orderId: 'ord_88412', program: '世界卡機場', programCode: 'CTB-AIR-WE',
    dir: '出境去程', dirEn: 'outbound', flight: 'BR198', terminal: '桃園 T2',
    pickup: '台北市信義區松仁路 100 號', drop: '桃園機場 第二航廈',
    win: '06/18 05:30', state: '已指派', cardholderRef: '**** 4821', benefitRef: 'BNF-••••-7A2' },
  { id: 'BK-2K7F2D', orderId: 'ord_88398', program: '世界卡機場', programCode: 'CTB-AIR-WE',
    dir: '入境回程', dirEn: 'inbound', flight: 'JL809', terminal: '桃園 T1',
    pickup: '桃園機場 第一航廈 入境', drop: '台北市大安區敦化南路二段',
    win: '06/17 21:40', state: '進行中', cardholderRef: '**** 6310', benefitRef: 'BNF-••••-3F8' },
  { id: 'BK-2K7EX9', orderId: 'ord_88301', program: '商旅御璽卡機場', programCode: 'CTB-AIR-SG',
    dir: '出境去程', dirEn: 'outbound', flight: 'CI103', terminal: '松山 TSA',
    pickup: '新北市板橋區文化路一段', drop: '松山機場 國內線',
    win: '06/18 09:15', state: '預約', cardholderRef: '**** 2204', benefitRef: 'BNF-••••-9C1' },
  { id: 'BK-2K7EM4', orderId: 'ord_88277', program: '世界卡機場', programCode: 'CTB-AIR-WE',
    dir: '出境去程', dirEn: 'outbound', flight: 'BR226', terminal: '桃園 T1',
    pickup: '台中市西屯區台灣大道三段', drop: '桃園機場 第一航廈',
    win: '06/16 04:00', state: '已完成', cardholderRef: '**** 8842', benefitRef: 'BNF-••••-5D6' },
  { id: 'BK-2K7DZ8', orderId: 'ord_88150', program: '商旅御璽卡機場', programCode: 'CTB-AIR-SG',
    dir: '入境回程', dirEn: 'inbound', flight: 'NH853', terminal: '桃園 T2',
    pickup: '桃園機場 第二航廈 入境', drop: '新竹市東區光復路二段',
    win: '06/15 23:10', state: '已完成', cardholderRef: '**** 1075', benefitRef: 'BNF-••••-2B4' },
  { id: 'BK-2K7DA1', orderId: 'ord_88002', program: '世界卡機場', programCode: 'CTB-AIR-WE',
    dir: '出境去程', dirEn: 'outbound', flight: 'BR852', terminal: '桃園 T2',
    pickup: '台北市中山區南京東路三段', drop: '桃園機場 第二航廈',
    win: '06/14 13:25', state: '取消', cardholderRef: '**** 7788', benefitRef: 'BNF-••••-8E0' },
];
function bkStateTone(s) {
  return s === '已完成' ? 'success' : s === '取消' ? 'danger' : s === '進行中' ? 'info'
    : s === '已指派' ? 'accent' : 'warn';
}

// ── 2. Contracts（合約與 SLA）─────────────────────────────────────────────────
const FX_BK_CONTRACTS = [
  { no: 'CTR-CTB-2026', program: '中信機場接送 · 全方案', period: '2026-01-01 ~ 2026-12-31',
    status: '健康', onTime: 98.7, onTimeTgt: 95, complete: 99.6, completeTgt: 99, resp: 42, respTgt: 60, exceptions: 2 },
  { no: 'CTR-CTB-WE-2026', program: '世界卡機場接送', period: '2026-01-01 ~ 2026-12-31',
    status: '警示', onTime: 94.2, onTimeTgt: 95, complete: 99.1, completeTgt: 99, resp: 58, respTgt: 60, exceptions: 4 },
];
function bkContractTone(s) { return s === '健康' ? 'success' : s === '警示' ? 'warn' : 'danger'; }

// ── 3. Statements（對帳單）— 逐趟對帳；金流 = 發卡行付 DRTS ─────────────────
const FX_BK_STATEMENTS = [
  { period: '2026-05', total: 'NT$ 1,284,600', trips: 812, status: 'due',       issued: '2026-06-01', due: '2026-06-15', sig: '簽名檔就緒' },
  { period: '2026-04', total: 'NT$ 1,196,400', trips: 758, status: 'paid',      issued: '2026-05-01', due: '2026-05-15', sig: '簽名檔就緒' },
  { period: '2026-03', total: 'NT$ 1,071,200', trips: 691, status: 'paid',      issued: '2026-04-01', due: '2026-04-15', sig: '簽名檔就緒' },
  { period: '2026-02', total: 'NT$ 998,800',   trips: 642, status: 'paid',      issued: '2026-03-01', due: '2026-03-15', sig: '已過期 · 重出' },
];
function bkStmtTone(s) { return s === 'paid' ? 'success' : s === 'due' ? 'warn' : s === 'published' ? 'info' : 'neutral'; }
const FX_BK_STMT_LINES = [
  { trip: 'BK-2K7EM4', date: '06/16', fare: 'NT$ 1,580', subsidy: 'NT$ 1,580', oop: 'NT$ 0',   benefitRef: 'BNF-••••-5D6', cardholderRef: '**** 8842', note: '權益全額' },
  { trip: 'BK-2K7DZ8', date: '06/15', fare: 'NT$ 2,280', subsidy: 'NT$ 1,580', oop: 'NT$ 700', benefitRef: 'BNF-••••-2B4', cardholderRef: '**** 1075', note: '商務升等自付差額' },
  { trip: 'BK-2K7CC2', date: '06/15', fare: 'NT$ 1,580', subsidy: 'NT$ 1,580', oop: 'NT$ 0',   benefitRef: 'BNF-••••-1A7', cardholderRef: '**** 5560', note: '權益全額' },
  { trip: 'BK-2K7BB9', date: '06/14', fare: 'NT$ 1,680', subsidy: 'NT$ 1,580', oop: 'NT$ 100', benefitRef: 'BNF-••••-4K3', cardholderRef: '**** 9931', note: '夜間加成自付' },
  { trip: 'BK-2K7AA0', date: '06/14', fare: 'NT$ 2,680', subsidy: 'NT$ 1,580', oop: 'NT$ 1,100', benefitRef: 'BNF-••••-6P5', cardholderRef: '**** 3308', note: '七人座自付差額 · 爭議中' },
];

// ── 4. Programs（方案與配額）— 配額為銀行頭號指標 ────────────────────────────
const FX_BK_PROGRAMS = [
  { name: '世界卡機場接送', code: 'CTB-AIR-WE', tier: 'WORLD ELITE', coverage: '北北基桃 · 竹苗 · 中彰 · 南高',
    cardholders: 18420, quotaUsed: 9840, quotaTotal: 14400, perks: '全年 12 趟 · 商務升等 2 趟', exceptions: 3, trend: '+6.2%' },
  { name: '商旅御璽卡機場接送', code: 'CTB-AIR-SG', tier: 'SIGNATURE', coverage: '北北基桃 · 中彰 · 南高',
    cardholders: 9260, quotaUsed: 3110, quotaTotal: 5400, perks: '全年 6 趟 · 夜間免等候', exceptions: 1, trend: '+3.8%' },
];

// ── 5. Users（人員與角色）— scoped to issuer tenant ──────────────────────────
const FX_BK_USERS = [
  { name: '周敬文', email: 'cw.chou@ctbcbank.com', role: 'bank_program_admin', status: 'active',    last: '2 分鐘前' },
  { name: '黃怡安', email: 'hy.huang@ctbcbank.com', role: 'bank_ops_viewer',    status: 'active',    last: '14 分鐘前' },
  { name: '湯立群', email: 'tl.tang@ctbcbank.com',  role: 'bank_finance',        status: 'active',    last: '1 小時前' },
  { name: '郭旻潔', email: 'mj.kuo@ctbcbank.com',   role: 'bank_ops_viewer',     status: 'invited',   last: '— 待接受邀請' },
  { name: '葉承勳', email: 'cs.yeh@ctbcbank.com',   role: 'bank_finance',        status: 'suspended', last: '2026-05-20' },
];
function bkUserTone(s) { return s === 'active' ? 'success' : s === 'invited' ? 'info' : 'neutral'; }

// ── 6. Audit（稽核）— cross-actor；發卡/權益參照保留但遮罩 ────────────────────
const FX_BK_AUDIT = [
  { at: '2026-06-17 14:22:08', actor: 'system.eligibility', realm: 'system',   type: '資格決策', typeEn: 'eligibility_decision',
    subject: '**** 6310 · BNF-••••-3F8', result: 'eligible', reason: 'WE_QUOTA_OK', entity: 'BK-2K7F2D' },
  { at: '2026-06-17 14:24:51', actor: 'dispatch.engine', realm: 'ops',         type: '派遣動作', typeEn: 'dispatch_action',
    subject: 'BK-2K7F2D', result: 'assigned d_8843', reason: '—', entity: 'BK-2K7F2D' },
  { at: '2026-06-17 09:02:11', actor: '黃怡安', realm: 'issuer',                 type: '存取',     typeEn: 'access',
    subject: '訂單清單 · programCode=CTB-AIR-WE', result: 'viewed', reason: 'role:ops_viewer', entity: '/bookings' },
  { at: '2026-06-16 23:58:40', actor: 'billing.settlement', realm: 'platform', type: '結算關帳', typeEn: 'settlement_close',
    subject: '對帳單 2026-05 · 812 趟', result: 'published', reason: 'PERIOD_CLOSED', entity: '2026-05' },
  { at: '2026-06-16 18:30:02', actor: 'system.eligibility', realm: 'system',   type: '資格決策', typeEn: 'eligibility_decision',
    subject: '**** 7788 · BNF-••••-8E0', result: 'denied', reason: 'QUOTA_EXHAUSTED', entity: 'BK-2K7DA1' },
  { at: '2026-06-16 11:15:33', actor: '湯立群', realm: 'issuer',                 type: '存取',     typeEn: 'access',
    subject: '對帳單 2026-04 · 簽名檔下載', result: 'downloaded', reason: 'role:finance', entity: '2026-04' },
];
function bkAuditTypeTone(t) {
  return t === '資格決策' ? 'info' : t === '派遣動作' ? 'accent' : t === '結算關帳' ? 'warn' : 'neutral';
}

Object.assign(window, {
  BK_GOLD, BK_GOLD_BG, BK_GOLD_BD, BK_HEALTH, BK_ACTORS, BK_ROLE_LABEL, BK_NAV,
  FX_BK_ORDERS, bkStateTone, FX_BK_CONTRACTS, bkContractTone,
  FX_BK_STATEMENTS, bkStmtTone, FX_BK_STMT_LINES, FX_BK_PROGRAMS,
  FX_BK_USERS, bkUserTone, FX_BK_AUDIT, bkAuditTypeTone,
});
