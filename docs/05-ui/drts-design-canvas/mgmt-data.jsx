// mgmt-data.jsx — Shared Taiwan-realistic fixtures for the four mgmt consoles.

// Tenants
const FX_TENANTS = [
  { id: 'tnt_001', code: 'YAMATO', name: '大和商務集團', stage: 'production', modules: 8, quota: '5,000/mo', integ: 'webhook+api', region: 'TW', updated: '2026-05-06' },
  { id: 'tnt_002', code: 'TPE_HOTEL_GRP', name: '台北飯店聯盟', stage: 'pilot', modules: 6, quota: '1,200/mo', integ: 'api', region: 'TW', updated: '2026-05-04' },
  { id: 'tnt_003', code: 'CTBC_BIZ', name: '中信銀行 商務尊榮', stage: 'production', modules: 7, quota: '8,000/mo', integ: 'partner+webhook', region: 'TW', updated: '2026-05-07' },
  { id: 'tnt_004', code: 'TSMC_FAB18', name: '台積電 18 廠', stage: 'production', modules: 9, quota: '12,000/mo', integ: 'sftp+webhook', region: 'TW', updated: '2026-05-08' },
  { id: 'tnt_005', code: 'KHH_AIRPORT', name: '高雄機場接送', stage: 'sandbox', modules: 4, quota: '500/mo', integ: 'api', region: 'TW', updated: '2026-04-29' },
  { id: 'tnt_006', code: 'NTU_HOSP', name: '台大醫院 病患接送', stage: 'rollback_hold', modules: 5, quota: '600/mo', integ: 'partner', region: 'TW', updated: '2026-05-08' },
  { id: 'tnt_007', code: 'CATHAY_LIFE', name: '國泰人壽 業務員專車', stage: 'pilot', modules: 6, quota: '2,400/mo', integ: 'webhook+api', region: 'TW', updated: '2026-05-05' },
  { id: 'tnt_008', code: 'EVA_CREW', name: '長榮航空 機組接送', stage: 'production', modules: 7, quota: '3,200/mo', integ: 'sftp', region: 'TW', updated: '2026-05-03' },
];

// Partner entries (banks, programs)
const FX_PARTNERS = [
  { id: 'pe_001', tenantId: 'tnt_003', code: 'CTBC', bank: '中信銀行', program: 'World Elite', subtype: 'priority_pickup', auth: 'oauth', eligibility: 'card_bin', slug: 'ctbc-elite', status: 'active', host: 'ride.ctbc.com.tw', accent: '#003D7A', readiness: 'ok' },
  { id: 'pe_002', tenantId: 'tnt_003', code: 'CTBC', bank: '中信銀行', program: 'Infinite', subtype: 'standard', auth: 'oauth', eligibility: 'card_bin', slug: 'ctbc-infinite', status: 'active', host: 'ride.ctbc.com.tw', accent: '#003D7A', readiness: 'ok' },
  { id: 'pe_003', tenantId: 'tnt_007', code: 'CATHAY', bank: '國泰世華', program: '尊榮旅遊', subtype: 'standard', auth: 'magic_link', eligibility: 'roster', slug: 'cathay-travel', status: 'active', host: 'taxi.cathaybk.com.tw', accent: '#0F5132', readiness: 'ok' },
  { id: 'pe_004', tenantId: 'tnt_002', code: 'GRAND', bank: '凱撒飯店', program: 'concierge', subtype: 'concierge', auth: 'concierge_token', eligibility: 'none', slug: 'grand-concierge', status: 'pending', host: 'ride.grand-hotels.tw', accent: '#7C2D12', readiness: 'missing_credential' },
  { id: 'pe_005', tenantId: 'tnt_007', code: 'CATHAY', bank: '國泰世華', program: 'World Card', subtype: 'standard', auth: 'oauth', eligibility: 'card_bin', slug: 'cathay-world', status: 'inactive', host: 'taxi.cathaybk.com.tw', accent: '#0F5132', readiness: 'theme_missing' },
];

// Drivers
const FX_DRIVERS = [
  { id: 'd_8821', name: '林志偉', phone: '0912-883-271', vehicle: '台北 ARJ-2891', status: 'available', shift: '07:00–19:00', license: 'valid', exclusivity: 'declared', rating: 4.91 },
  { id: 'd_8843', name: '陳俊宏', phone: '0937-114-208', vehicle: '台北 ARJ-3120', status: 'on_trip', shift: '06:00–18:00', license: 'valid', exclusivity: 'declared', rating: 4.86 },
  { id: 'd_8851', name: '黃文豪', phone: '0922-554-901', vehicle: '台北 ARJ-3308', status: 'break', shift: '13:00–01:00', license: 'expires_30d', exclusivity: 'declared', rating: 4.78 },
  { id: 'd_8862', name: '王建民', phone: '0918-721-553', vehicle: '台北 ARJ-2710', status: 'offline', shift: '–', license: 'valid', exclusivity: 'pending_review', rating: 4.92 },
  { id: 'd_8870', name: '張育成', phone: '0905-291-887', vehicle: '台北 ARJ-3401', status: 'available', shift: '08:00–20:00', license: 'valid', exclusivity: 'declared', rating: 4.83 },
  { id: 'd_8881', name: '吳鎮宇', phone: '0931-008-714', vehicle: '台北 ARJ-3502', status: 'available', shift: '09:00–21:00', license: 'valid', exclusivity: 'declared', rating: 4.95 },
];

// Vehicles
const FX_VEHICLES = [
  { id: 'v_271', plate: 'ARJ-2710', model: 'Toyota Prius α', year: 2023, dispatchable: true, contract: 'CTR-204', insurance: '2026-12-30', debrand: '–' },
  { id: 'v_289', plate: 'ARJ-2891', model: 'Toyota Prius α', year: 2023, dispatchable: true, contract: 'CTR-204', insurance: '2026-08-14', debrand: '–' },
  { id: 'v_312', plate: 'ARJ-3120', model: 'Hyundai Custo', year: 2024, dispatchable: true, contract: 'CTR-219', insurance: '2027-01-05', debrand: '–' },
  { id: 'v_330', plate: 'ARJ-3308', model: 'Toyota Sienta',  year: 2022, dispatchable: false, contract: 'CTR-201', insurance: '2026-05-22', debrand: '2026-06-15' },
  { id: 'v_340', plate: 'ARJ-3401', model: 'Hyundai Custo', year: 2024, dispatchable: true, contract: 'CTR-219', insurance: '2027-02-11', debrand: '–' },
];

// Dispatch queue
const FX_DISPATCH_OWNED = [
  { id: 'ord_8231', tenant: 'TSMC_FAB18', pickup: '新竹科學園區 力行六路 8 號', drop: '新竹高鐵站 5 號出口', win: '15:30–15:45', service: 'business', state: 'broadcasting', driver: '–', eta: '8 min', candidates: 3, gates: 'ok' },
  { id: 'ord_8232', tenant: 'YAMATO',     pickup: '台北市信義區松仁路 100 號', drop: '桃園機場 第二航廈',           win: 'now',        service: 'airport',  state: 'assigned',     driver: 'd_8843', eta: 'on trip', candidates: 1, gates: 'ok' },
  { id: 'ord_8233', tenant: 'CATHAY_LIFE', pickup: '台北市大安區仁愛路四段 99 號', drop: '台中市西屯區市政路 77 號', win: '16:10–16:30', service: 'business', state: 'queued',      driver: '–', eta: '12 min', candidates: 2, gates: 'license_expiring' },
  { id: 'ord_8234', tenant: 'TPE_HOTEL_GRP', pickup: '凱撒飯店 台北館', drop: '陽明山國家公園 遊客中心', win: '17:00–17:15', service: 'standard', state: 'no_supply', driver: '–', eta: '–', candidates: 0, gates: 'ok' },
  { id: 'ord_8235', tenant: 'NTU_HOSP', pickup: '台大醫院 西址 醫療大樓', drop: '台北市文山區興隆路三段 50 號', win: '15:50', service: 'wheelchair', state: 'override_pending', driver: 'd_8881', eta: '6 min', candidates: 1, gates: 'override_required' },
  { id: 'ord_8236', tenant: 'EVA_CREW', pickup: '長榮航勤大樓 桃園', drop: '凱悅酒店 台北', win: '16:00–16:15', service: 'business', state: 'assigned', driver: 'd_8870', eta: '14 min', candidates: 1, gates: 'ok' },
];
const FX_DISPATCH_FORWARDED = [
  { id: 'fwd_4471', source: 'SmartRides X', external: 'SRX-9921023', pickup: '台北車站 東三門', drop: '南港展覽館 7 號出口', win: '15:35', state: 'received', adapter: 'srx-v3', mismatch: '–' },
  { id: 'fwd_4472', source: 'SmartRides X', external: 'SRX-9921044', pickup: '101 大樓 信義路五段', drop: '松山機場 1 航廈', win: 'now', state: 'broadcasted', adapter: 'srx-v3', mismatch: '–' },
  { id: 'fwd_4473', source: 'SmartRides X', external: 'SRX-9921071', pickup: '台中高鐵站', drop: '逢甲夜市', win: '16:00', state: 'accept_pending', adapter: 'srx-v3', mismatch: '–' },
  { id: 'fwd_4474', source: 'GoCab',         external: 'GC-AA8821',  pickup: '高雄美術館站', drop: '高雄火車站', win: '15:45', state: 'sync_failed', adapter: 'gocab-v1', mismatch: 'driver_id mismatch' },
  { id: 'fwd_4475', source: 'GoCab',         external: 'GC-AA8842',  pickup: '夢時代購物中心', drop: '高雄左營高鐵', win: '16:20', state: 'lost_race', adapter: 'gocab-v1', mismatch: '–' },
  { id: 'fwd_4476', source: 'SmartRides X', external: 'SRX-9921098', pickup: '台北市中正區忠孝西路一段 49 號', drop: '基隆港 西岸碼頭', win: '17:10', state: 'manual_fallback_required', adapter: 'srx-v3', mismatch: 'fare_diff_>5%' },
];

// Calls
const FX_CALLS = [
  { id: 'call_2031', caller: '0912-555-401', tenant: '–', type: 'phone_booking', state: 'open', agent: 'YL', linked: '–', dur: '02:14', recording: 'attached' },
  { id: 'call_2030', caller: '0937-220-118', tenant: 'CATHAY_LIFE', type: 'callback', state: 'pending', agent: 'YC', linked: 'ord_8233', dur: '–', recording: '–' },
  { id: 'call_2029', caller: '0905-883-441', tenant: 'YAMATO', type: 'inquiry', state: 'closed', agent: 'YL', linked: 'ord_8232', dur: '04:31', recording: 'attached' },
  { id: 'call_2028', caller: '0918-001-220', tenant: '–', type: 'complaint_intake', state: 'transferred', agent: 'WC', linked: 'cmp_0915', dur: '06:20', recording: 'attached' },
  { id: 'call_2027', caller: '0931-117-803', tenant: 'NTU_HOSP', type: 'inquiry', state: 'closed', agent: 'YL', linked: 'ord_8235', dur: '01:55', recording: 'attached' },
];

// Complaints
const FX_COMPLAINTS = [
  { id: 'cmp_0915', cat: 'service_quality', severity: 'medium', desc: '司機未依預定時間到達，乘客錯過飛機', order: 'ord_8201', call: 'call_2028', assignee: 'WC', sla: 'breached', reopen: 0, status: 'in_review' },
  { id: 'cmp_0912', cat: 'pricing_dispute', severity: 'low', desc: '計費高於預估 38%', order: 'ord_8190', call: '–', assignee: 'YL', sla: 'on_track', reopen: 0, status: 'pending' },
  { id: 'cmp_0908', cat: 'driver_conduct', severity: 'high', desc: '司機言語不當，乘客已錄影上傳', order: 'ord_8175', call: 'call_2014', assignee: 'WC', sla: 'breached', reopen: 1, status: 'in_review' },
  { id: 'cmp_0901', cat: 'lost_item',      severity: 'low', desc: '乘客遺失公事包於後車廂', order: 'ord_8160', call: 'call_2003', assignee: 'YC', sla: 'on_track', reopen: 0, status: 'resolved' },
  { id: 'cmp_0894', cat: 'safety_concern', severity: 'critical', desc: '行駛過程急煞，乘客受輕傷', order: 'ord_8141', call: 'call_1992', assignee: 'WC', sla: 'breached', reopen: 0, status: 'escalated_to_incident' },
];

// Incidents
const FX_INCIDENTS = [
  { id: 'inc_0214', title: '司機 SOS — 乘客醉酒衝突', cat: 'safety', severity: 'critical', status: 'in_response', driver: 'd_8843', vehicle: 'ARJ-3120', complaint: '–', occurred: '2026-05-08 14:42', loc: '台北市信義區忠孝東路五段', recovery: 1 },
  { id: 'inc_0213', title: '車輛擦撞 — 後保險桿凹陷', cat: 'collision', severity: 'medium', status: 'open', driver: 'd_8870', vehicle: 'ARJ-3401', complaint: '–', occurred: '2026-05-08 09:15', loc: '台北市中山區民權東路', recovery: 0 },
  { id: 'inc_0212', title: '客訴升級 — 急煞致傷', cat: 'safety', severity: 'high', status: 'in_response', driver: 'd_8851', vehicle: 'ARJ-3308', complaint: 'cmp_0894', occurred: '2026-05-07 18:33', loc: '台北市文山區羅斯福路六段', recovery: 2 },
  { id: 'inc_0211', title: '乘客遺失物 — 高價筆電', cat: 'lost_property', severity: 'low', status: 'closed', driver: 'd_8881', vehicle: 'ARJ-3502', complaint: 'cmp_0901', occurred: '2026-05-06 22:10', loc: '桃園機場 第一航廈', recovery: 1 },
];

// Feature flags
const FX_FLAGS = [
  { key: 'partner.cathay.world_card', enabled: true, scope: 'tenant_override', updatedBy: '李俊 PM', updatedAt: '2026-05-07 10:14' },
  { key: 'forwarder.gocab.fallback_mode', enabled: false, scope: 'platform', updatedBy: '王芳 Ops Lead', updatedAt: '2026-05-08 09:02' },
  { key: 'dispatch.compliance.license_warn_30d', enabled: true, scope: 'platform', updatedBy: '陳維 SRE', updatedAt: '2026-05-01 16:48' },
  { key: 'tenant.ntu_hosp.wheelchair_priority', enabled: true, scope: 'tenant_override', updatedBy: '李俊 PM', updatedAt: '2026-05-04 11:20' },
  { key: 'billing.statement.draft_review_required', enabled: true, scope: 'platform', updatedBy: '張薇 Finance', updatedAt: '2026-04-29 14:35' },
];

// Adapters
const FX_ADAPTERS = [
  { id: 'srx-v3', source: 'SmartRides X', kind: 'forwarder', status: 'healthy', latency: '142ms', last: '2s ago', orders24h: 1421 },
  { id: 'gocab-v1', source: 'GoCab', kind: 'forwarder', status: 'degraded', latency: '780ms', last: '8s ago', orders24h: 220 },
  { id: 'ctbc-oauth', source: '中信 OAuth', kind: 'auth', status: 'healthy', latency: '88ms', last: '1s ago', orders24h: '–' },
  { id: 'cathay-magic', source: '國泰 Magic Link', kind: 'auth', status: 'healthy', latency: '110ms', last: '3s ago', orders24h: '–' },
  { id: 'mof-einv', source: '財政部電子發票', kind: 'filing', status: 'healthy', latency: '320ms', last: '12m ago', orders24h: '–' },
  { id: 'mof-bgmt', source: 'BGMT 派遣回報', kind: 'filing', status: 'pending_renewal', latency: '–', last: '4h ago', orders24h: '–' },
];

// Pricing rules
const FX_PRICING = [
  { v: 'pr_v23', name: '2026 Q2 標準商務', status: 'published', serviceFeeBps: 220, reimburse: 'gross_then_settle', scope: 'business+airport', from: '2026-04-01', to: '2026-06-30' },
  { v: 'pr_v24', name: '2026 Q2 機場高峰附加', status: 'published', serviceFeeBps: 250, reimburse: 'gross_then_settle', scope: 'airport_peak', from: '2026-04-01', to: '2026-06-30' },
  { v: 'pr_v25', name: '2026 Q3 草稿', status: 'draft', serviceFeeBps: 230, reimburse: 'gross_then_settle', scope: 'business', from: '2026-07-01', to: '2026-09-30' },
];

// Reconciliation issues
const FX_RECON = [
  { id: 'rec_0091', source: 'SmartRides X', mirror: 'fwd_4476', external: 'SRX-9921098', tenant: '–', issue: 'fare_diff_>5%', amount: 'NT$ 412 diff', owner: '張薇', status: 'open', updated: '2026-05-08 14:55' },
  { id: 'rec_0090', source: 'GoCab',         mirror: 'fwd_4474', external: 'GC-AA8821',  tenant: '–', issue: 'driver_id mismatch',     amount: '—',           owner: '王芳', status: 'in_review', updated: '2026-05-08 13:21' },
  { id: 'rec_0089', source: '中信銀行',       mirror: '—',         external: 'CTBC-77231',  tenant: 'CTBC_BIZ', issue: 'sponsor_amount_mismatch', amount: 'NT$ 1,820 diff', owner: '張薇', status: 'open', updated: '2026-05-08 11:09' },
  { id: 'rec_0088', source: '國泰世華',       mirror: '—',         external: 'CATHAY-552',  tenant: 'CATHAY_LIFE', issue: 'duplicate_booking',  amount: '—',           owner: '張薇', status: 'resolved', updated: '2026-05-07 17:45' },
  { id: 'rec_0087', source: 'SmartRides X', mirror: 'fwd_4399', external: 'SRX-9920771', tenant: '—', issue: 'cancelled_after_complete', amount: 'NT$ 660 refund pending', owner: '王芳', status: 'reopened', updated: '2026-05-07 09:50' },
];

// Bookings (tenant view)
const FX_BOOKINGS = [
  { id: 'bk_5512', orderId: 'ord_8232', subtype: 'airport_pickup', state: 'completed', pickup: '台北市信義區松仁路 100 號', drop: '桃園機場 第二航廈', win: '2026-05-08 14:30', passenger: '林士群', flight: 'BR-198' },
  { id: 'bk_5513', orderId: 'ord_8231', subtype: 'business', state: 'broadcasting', pickup: '新竹科學園區 力行六路 8 號', drop: '新竹高鐵站', win: '2026-05-08 15:30–15:45', passenger: '劉怡君', flight: '–' },
  { id: 'bk_5514', orderId: 'ord_8233', subtype: 'business', state: 'queued', pickup: '台北市大安區仁愛路四段 99 號', drop: '台中市西屯區市政路 77 號', win: '2026-05-08 16:10–16:30', passenger: '鄭心怡', flight: '–' },
  { id: 'bk_5515', orderId: '–', subtype: 'standard', state: 'draft', pickup: '台北市中正區忠孝西路一段 49 號', drop: '士林夜市 慈諴宮', win: '2026-05-09 19:00', passenger: '林士群', flight: '–' },
  { id: 'bk_5510', orderId: 'ord_8220', subtype: 'wheelchair', state: 'completed', pickup: '台大醫院 西址 醫療大樓', drop: '新北市新莊區中正路 88 號', win: '2026-05-07 11:20', passenger: '陳秀英', flight: '–' },
  { id: 'bk_5509', orderId: 'ord_8219', subtype: 'business', state: 'cancelled', pickup: '凱撒飯店 台北館', drop: '台北 101', win: '2026-05-07 09:45', passenger: 'Maria Tan', flight: '–' },
];

// Tenant passengers
const FX_PASSENGERS = [
  { id: 'p_0021', name: '林士群', emp: 'Y2103', dept: '財務處', mobile: '0912-883-201', email: 'sl.lin@yamato.tw', active: true },
  { id: 'p_0022', name: '劉怡君', emp: 'T8842', dept: 'R&D Fab18', mobile: '0937-220-115', email: 'yc.liu@tsmc.com.tw', active: true },
  { id: 'p_0023', name: '鄭心怡', emp: 'C0331', dept: '業務一處', mobile: '0905-441-882', email: 'hy.cheng@cathaylife.tw', active: true },
  { id: 'p_0024', name: '陳秀英', emp: '–', dept: '–', mobile: '0918-220-771', email: '–', active: true },
  { id: 'p_0025', name: 'Maria Tan', emp: 'G-0021', dept: 'Concierge', mobile: '+65-9112-4823', email: 'maria@grand-hotels.tw', active: true },
  { id: 'p_0026', name: '吳承翰', emp: 'Y2210', dept: '法務處', mobile: '0931-008-552', email: 'ch.wu@yamato.tw', active: false },
];

// Tenant addresses
const FX_ADDRESSES = [
  { id: 'a_001', name: '總部', text: '台北市信義區松仁路 100 號', tags: ['HQ'], owner: '–', active: true },
  { id: 'a_002', name: '桃園機場 T2 接送點', text: '桃園機場 第二航廈 抵境大廳 7 號門', tags: ['airport'], owner: '–', active: true },
  { id: 'a_003', name: '台中分公司', text: '台中市西屯區市政路 77 號 14F', tags: ['branch'], owner: '–', active: true },
  { id: 'a_004', name: '新竹研發中心', text: '新竹科學園區 力行六路 8 號 B 棟', tags: ['HQ', 'tsmc'], owner: '劉怡君', active: true },
  { id: 'a_005', name: '凱撒飯店 台北館', text: '台北市中正區忠孝西路一段 38 號', tags: ['hotel'], owner: '–', active: true },
];

// Tenant users
const FX_TUSERS = [
  { id: 'u_01', name: '張俐萱', email: 'lh.chang@yamato.tw', role: 'tenant_admin', status: 'active', updated: '2026-05-06' },
  { id: 'u_02', name: 'Eva Wang', email: 'eva.wang@yamato.tw', role: 'tenant_operator', status: 'active', updated: '2026-05-04' },
  { id: 'u_03', name: '蔡明達', email: 'md.tsai@yamato.tw', role: 'tenant_finance', status: 'active', updated: '2026-04-28' },
  { id: 'u_04', name: 'Ken Liao', email: 'ken.liao@yamato.tw', role: 'integration_manager', status: 'pending_invite', updated: '2026-05-08' },
  { id: 'u_05', name: '黃啟賢', email: 'cs.huang@yamato.tw', role: 'viewer', status: 'suspended', updated: '2026-05-01' },
];

// Tenant API keys
const FX_KEYS = [
  { id: 'k_01', name: 'production · ride-portal', prefix: 'drts_live_', mask: '••••8B2k', scope: 'bookings:write,bookings:read', last: '2 min ago', expires: '2027-01-15', revoked: false },
  { id: 'k_02', name: 'production · finance-sync', prefix: 'drts_live_', mask: '••••91Lq', scope: 'invoices:read,reports:read', last: '4h ago', expires: '2026-12-30', revoked: false },
  { id: 'k_03', name: 'sandbox · qa-bot', prefix: 'drts_test_', mask: '••••QQ4z', scope: 'bookings:write,passengers:write', last: '12d ago', expires: '–', revoked: false },
  { id: 'k_04', name: 'old · ride-portal v1', prefix: 'drts_live_', mask: '••••V0ka', scope: 'bookings:write', last: '90d ago', expires: '–', revoked: true },
];

// Webhooks
const FX_WEBHOOKS = [
  { id: 'wh_01', url: 'https://erp.yamato.tw/hook/drts', events: ['booking.created','booking.completed','booking.cancelled'], status: 'active', last: 'OK · 12s ago' },
  { id: 'wh_02', url: 'https://finance.yamato.tw/api/drts/invoice', events: ['invoice.published','invoice.paid'], status: 'active', last: 'OK · 4h ago' },
  { id: 'wh_03', url: 'https://staging.yamato.tw/hook/drts', events: ['*'], status: 'paused', last: 'paused · 2d ago' },
];
const FX_WEBHOOK_DELIVERIES = [
  { id: 'dlv_991', wh: 'wh_01', event: 'booking.completed', code: 200, attempts: 1, at: '2026-05-08 14:48:21', dur: '142ms' },
  { id: 'dlv_990', wh: 'wh_01', event: 'booking.created', code: 200, attempts: 1, at: '2026-05-08 14:30:11', dur: '98ms' },
  { id: 'dlv_989', wh: 'wh_02', event: 'invoice.published', code: 200, attempts: 1, at: '2026-05-08 11:00:02', dur: '210ms' },
  { id: 'dlv_988', wh: 'wh_01', event: 'booking.cancelled', code: 502, attempts: 3, at: '2026-05-08 09:14:55', dur: 'timeout' },
  { id: 'dlv_987', wh: 'wh_01', event: 'booking.created', code: 200, attempts: 1, at: '2026-05-08 08:55:11', dur: '120ms' },
];

// Audit log
const FX_AUDIT = [
  { at: '2026-05-08 14:55:01', actor: '張薇 (張薇 Finance)', actorType: 'staff', module: 'reconciliation', action: 'issue.assign', resource: 'rec_0091', req: 'req_FXa912' },
  { at: '2026-05-08 14:53:21', actor: 'YL.linchen', actorType: 'staff', module: 'callcenter', action: 'session.open', resource: 'call_2031', req: 'req_FXa911' },
  { at: '2026-05-08 14:42:00', actor: 'd_8843 (司機端)', actorType: 'driver', module: 'incident', action: 'sos.raise', resource: 'inc_0214', req: 'req_FXa899' },
  { at: '2026-05-08 14:30:11', actor: 'YAMATO/api-key-k_01', actorType: 'tenant_api', module: 'booking', action: 'create', resource: 'bk_5513', req: 'req_FXa881' },
  { at: '2026-05-08 13:21:09', actor: '王芳 Ops Lead', actorType: 'staff', module: 'reconciliation', action: 'issue.assign', resource: 'rec_0090', req: 'req_FXa802' },
  { at: '2026-05-08 11:00:02', actor: 'system.invoice-generator', actorType: 'system', module: 'billing', action: 'invoice.publish', resource: 'inv_2026_05_001', req: 'req_FXa701' },
  { at: '2026-05-08 09:02:14', actor: '王芳 Ops Lead', actorType: 'staff', module: 'feature_flag', action: 'flag.disable', resource: 'forwarder.gocab.fallback_mode', req: 'req_FXa620' },
];

// Tenant invoices
const FX_INVOICES = [
  { id: 'inv_2026_05_001', period: '2026-04', amount: 'NT$ 1,224,800', status: 'published', due: '2026-05-25', tenant: 'YAMATO', issued: '2026-05-08 11:00' },
  { id: 'inv_2026_04_001', period: '2026-03', amount: 'NT$ 1,038,500', status: 'paid', due: '2026-04-25', tenant: 'YAMATO', issued: '2026-04-08 11:00' },
  { id: 'inv_2026_03_001', period: '2026-02', amount: 'NT$ 982,200', status: 'paid', due: '2026-03-25', tenant: 'YAMATO', issued: '2026-03-08 11:00' },
];

// Reports
const FX_REPORTS = [
  { id: 'rpt_3201', kind: 'monthly_usage', period: '2026-04', format: 'xlsx', status: 'ready', expires: '2026-05-29', created: '2026-05-08 09:11' },
  { id: 'rpt_3200', kind: 'sla_breach', period: '2026-04', format: 'csv', status: 'running', expires: '–', created: '2026-05-08 09:08' },
  { id: 'rpt_3198', kind: 'driver_settlement', period: '2026-04', format: 'pdf', status: 'ready', expires: '2026-05-21', created: '2026-05-08 08:45' },
  { id: 'rpt_3170', kind: 'monthly_usage', period: '2026-03', format: 'xlsx', status: 'expired', expires: '2026-04-29', created: '2026-04-08 09:10' },
];

// Maintenance
const FX_MAINT = [
  { id: 'mt_021', vehicle: 'ARJ-3308', kind: '5,000km 保養',  status: 'scheduled', sched: '2026-05-12 09:00', tech: '林技師', cost: 'NT$ 4,200', overdue: false },
  { id: 'mt_022', vehicle: 'ARJ-2710', kind: '輪胎更換',        status: 'in_progress', sched: '2026-05-08 14:00', tech: '陳技師', cost: 'NT$ 16,800', overdue: false },
  { id: 'mt_023', vehicle: 'ARJ-3401', kind: '前保桿凹陷修復', status: 'scheduled', sched: '2026-05-09 10:30', tech: '黃技師', cost: 'NT$ 8,400', overdue: false },
  { id: 'mt_019', vehicle: 'ARJ-2891', kind: '冷氣濾網清潔',   status: 'completed', sched: '2026-05-05 11:00', tech: '林技師', cost: 'NT$ 1,200', overdue: false },
  { id: 'mt_017', vehicle: 'ARJ-3502', kind: '年度檢驗',       status: 'overdue', sched: '2026-04-30 09:00', tech: '–', cost: '–', overdue: true },
];

// Public info versions
const FX_PUBLIC_INFO = [
  { v: 'pi_v18', from: '2026-04-01', to: '2026-09-30', call: '02-2543-9988', complaint: '0800-088-122', status: 'published', updated: '2026-03-25' },
  { v: 'pi_v17', from: '2025-10-01', to: '2026-03-31', call: '02-2543-9988', complaint: '0800-088-122', status: 'retired', updated: '2025-09-15' },
  { v: 'pi_v19', from: '2026-10-01', to: '2027-03-31', call: '02-2543-9988', complaint: '0800-088-122', status: 'draft', updated: '2026-05-04' },
];

// Health alerts
const FX_HEALTH = [
  { id: 'al_01', tone: 'warn', text: 'GoCab 介接 sync_failed 比率 > 4% (24h)', count: 12, route: 'forwarder' },
  { id: 'al_02', tone: 'danger', text: 'BGMT 派遣回報 token 距到期 < 7 天', count: 1, route: 'filing' },
  { id: 'al_03', tone: 'info', text: 'Webhook delivery p95 上升至 410ms', count: 3, route: 'webhook' },
  { id: 'al_04', tone: 'success', text: '所有 dispatch 介接健康', count: 0, route: 'dispatch' },
];

// Settlement matrix
const FX_SETTLEMENT = [
  { row: '自營 owned',     billed: 'NT$ 8,221,500', drvFee: 'NT$ 5,754,050', svcFee: 'NT$ 2,467,450', recon: 0, status: 'reconciled' },
  { row: 'CTBC partner',   billed: 'NT$ 1,420,800', drvFee: 'NT$ 994,560',   svcFee: 'NT$ 426,240',   recon: 1, status: 'partial' },
  { row: 'CATHAY partner', billed: 'NT$ 982,300',   drvFee: 'NT$ 687,610',   svcFee: 'NT$ 294,690',   recon: 0, status: 'reconciled' },
  { row: 'SRX forwarded',  billed: 'NT$ 612,000',   drvFee: 'NT$ 428,400',   svcFee: 'NT$ 122,400',   recon: 2, status: 'pending' },
  { row: 'GoCab forwarded',billed: 'NT$ 88,200',    drvFee: 'NT$ 61,740',    svcFee: 'NT$ 17,640',    recon: 1, status: 'pending' },
  { row: 'phone direct',   billed: 'NT$ 218,400',   drvFee: 'NT$ 152,880',   svcFee: 'NT$ 65,520',    recon: 0, status: 'reconciled' },
];

// Notices
const FX_NOTICES = [
  { id: 'no_021', title: '2026-05-15 02:00–04:00 計畫性維護 — 派遣服務暫停', sev: 'high', audience: 'all', status: 'scheduled', updated: '2026-05-07' },
  { id: 'no_020', title: 'GoCab 介接降級中，部分 forwarded 訂單需手動 fallback', sev: 'medium', audience: 'ops', status: 'active', updated: '2026-05-08' },
  { id: 'no_019', title: '司機端 v3.4.2 已釋出 — 需自動更新', sev: 'low', audience: 'driver', status: 'active', updated: '2026-05-06' },
];

Object.assign(window, {
  FX_TENANTS, FX_PARTNERS, FX_DRIVERS, FX_VEHICLES,
  FX_DISPATCH_OWNED, FX_DISPATCH_FORWARDED, FX_CALLS, FX_COMPLAINTS, FX_INCIDENTS,
  FX_FLAGS, FX_ADAPTERS, FX_PRICING, FX_RECON,
  FX_BOOKINGS, FX_PASSENGERS, FX_ADDRESSES, FX_TUSERS, FX_KEYS,
  FX_WEBHOOKS, FX_WEBHOOK_DELIVERIES, FX_AUDIT, FX_INVOICES, FX_REPORTS,
  FX_MAINT, FX_PUBLIC_INFO, FX_HEALTH, FX_SETTLEMENT, FX_NOTICES,
});
