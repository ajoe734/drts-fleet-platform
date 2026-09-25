// driver-screens-1.jsx — Driver App (1/3): Provisioning / Workspace / Jobs

// Mock fixtures aligned with packet § 5 + spec §5
const DRV_FX = {
  driver: { id: 'd_8843', name: '陳俊宏', phone: '0937-114-208', vehicle: 'ARJ-3120' },
  shift:  { state: 'on', startedAt: '06:42', vehicle: 'ARJ-3120', odo: 84230 },
  platforms: [
    { code: 'DRTS', name: '自營派單',     en: 'owned',     online: true,  ok: true,  lastSync: '剛剛',     forwarded: false, eligible: ['standard', 'business', 'airport'] },
    { code: 'SRX',  name: 'SmartRides X', en: 'forwarded', online: true,  ok: true,  lastSync: '1 分鐘前', forwarded: true,  eligible: ['standard'], canRelayAccept: true, canRelayReject: true, authMech: 'external_browser_oauth' },
    { code: 'METR', name: 'Metro Hail',   en: 'forwarded', online: false, reauth: true, lastSync: '12 分鐘前', forwarded: true, eligible: [], canRelayAccept: false, canRelayReject: false, relayUnavailableReasonCode: 'reauth_required', authMech: 'manual_credential' },
    { code: 'GOCAB', name: 'GoCab',       en: 'forwarded', online: true,  ok: false, lastSync: '32 秒前',   forwarded: true,  eligible: ['standard'], canRelayAccept: true, canRelayReject: false, relayUnavailableReasonCode: 'gocab_no_reject', authMech: 'native_app_deeplink' },
  ],
};

// ── 1. /onboarding — unprovisioned device
function DRV_Onboarding({ theme: t }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', background: t.bg }}>
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, letterSpacing: 0.5 }}>D</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 18, letterSpacing: -0.4, color: t.text }}>裝置啟用</div>
        <div style={{ fontSize: 11, fontFamily: DRV_MONO, color: t.textDim, marginTop: 2 }}>device provisioning · Q-X15: not_provisioned</div>
        <div style={{ fontSize: 14, color: t.textMuted, marginTop: 6, lineHeight: 1.55 }}>
          連線車隊管理系統，啟用後此裝置可接收派單與平台訂單。
        </div>
      </div>
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { zh: '裝置註冊', en: 'device.register',  s: '產生車隊識別碼', state: 'active' },
            { zh: '駕駛身份驗證', en: 'driver.verify', s: '綁定駕駛 d_8843', state: 'pending' },
            { zh: '平台帳號連線', en: 'platform.bind', s: '3 個外部平台待綁定', state: 'pending' },
          ].map((step, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i === arr.length - 1 ? 0 : 16, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: step.state === 'active' ? t.brand : t.surfaceLo,
                  border: '1.5px solid ' + (step.state === 'active' ? t.brand : t.border),
                  color: step.state === 'active' ? '#fff' : t.textDim,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, fontFamily: DRV_MONO,
                }}>{i + 1}</div>
                {i < arr.length - 1 && <div style={{ flex: 1, width: 1.5, background: t.border, marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, paddingTop: 3 }}>
                <DrvBi zh={step.zh} en={step.en} theme={t} size={14} />
                <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>{step.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: 20, marginTop: 4 }}>
        <DrvCard theme={t}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 5 }}>註冊代碼 · registration_code</div>
              <div style={{ height: 42, padding: '0 12px', display: 'flex', alignItems: 'center', background: t.surfaceLo, border: '1px solid ' + t.border, borderRadius: 10, fontSize: 15, color: t.text, fontFamily: DRV_MONO }}>driver-demo-001</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 5 }}>裝置名稱 · device_name</div>
              <div style={{ height: 42, padding: '0 12px', display: 'flex', alignItems: 'center', background: t.surfaceLo, border: '1px solid ' + t.border, borderRadius: 10, fontSize: 15, color: t.text }}>Driver Pixel 01</div>
            </div>
          </div>
        </DrvCard>
        <div style={{ marginTop: 14 }}>
          <DrvBigBtn theme={t} kind="primary" icon="shield">註冊此裝置 · register</DrvBigBtn>
        </div>
        <div style={{ marginTop: 12, padding: '10px 12px', background: t.warnBg, color: t.warn, border: '1px solid ' + t.warn + '50', borderRadius: 10, fontSize: 11.5, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <DrvIcon name="lock" size={14} stroke={2} />
          <span>未啟用裝置無法接收派單。請使用車隊發放的代碼，避免使用個人帳號註冊 · prevented_unprovisioned_access</span>
        </div>
      </div>
    </div>
  );
}

// ── 2. / — Workspace cockpit (per spec §5.3)
// One next-best-action dominant per state
function DRV_Workspace({ theme: t, state = 'on_shift_with_trip', sosActive = false }) {
  const STATES = {
    off_shift: {
      eyebrow: '尚未上班', en: 'off_shift',
      title: '開始今天的班次', sub: '打卡後可接收派單',
      cta: { zh: '前往打卡', en: 'start_shift', icon: 'power' },
    },
    on_shift_no_platform: {
      eyebrow: '上班中 · 平台離線', en: 'on_shift_no_platform',
      title: '請上線至少一個平台', sub: '目前 0 / 3 平台可接單',
      cta: { zh: '前往平台連線', en: 'go_online', icon: 'layers' },
    },
    on_shift_reauth: {
      eyebrow: '上班中 · 需重新授權', en: 'platform_reauth',
      title: 'Metro Hail token 已過期', sub: '12 分鐘前 · 完整接單需此平台',
      cta: { zh: '處理重新授權', en: 'reauth', icon: 'key' },
    },
    on_shift_with_trip: {
      eyebrow: '進行中行程', en: 'in_trip',
      title: '繼續行程 · 松山機場 第二航廈', sub: 'T-8821 · 自營派單 · 8 分鐘內出發',
      cta: { zh: '回到行程', en: 'return_to_trip', icon: 'car' },
    },
    on_shift_urgent_task: {
      eyebrow: '待處理任務', en: 'urgent_task',
      title: 'SmartRides X · 信義 ATT 4 FUN', sub: '12 秒內可接 · forwarded',
      cta: { zh: '審視任務', en: 'review', icon: 'list' },
    },
  };
  const s = STATES[state] || STATES.on_shift_with_trip;

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {sosActive && <DrvSosBanner theme={t} />}

      {/* Hero next-best-action */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          background: state === 'on_shift_with_trip' ? `linear-gradient(135deg, ${t.brand}, ${t.brandHi})` : t.surface,
          border: state === 'on_shift_with_trip' ? 'none' : '1px solid ' + t.border,
          color: state === 'on_shift_with_trip' ? '#fff' : t.text,
          borderRadius: 18, padding: '18px 18px 18px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, opacity: 0.85, textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: state === 'on_shift_with_trip' ? '#fff' : t.brand }} />
            {s.eyebrow} <span style={{ fontFamily: DRV_MONO, opacity: 0.7, fontSize: 9.5 }}>· {s.en}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, letterSpacing: -0.3, lineHeight: 1.25 }}>{s.title}</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{s.sub}</div>
          <div style={{ marginTop: 14 }}>
            <DrvBigBtn theme={t} kind={state === 'on_shift_with_trip' ? 'secondary' : 'primary'} icon={s.cta.icon} style={state === 'on_shift_with_trip' ? { background: '#fff', color: t.brand, borderColor: '#fff' } : {}}>
              {s.cta.zh} · {s.cta.en}
            </DrvBigBtn>
          </div>
        </div>
      </div>

      {/* Today summary */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
        {[
          { label: '待處理', en: 'pending', value: '3', tone: 'brand' },
          { label: '已上線', en: 'platforms_online', value: '2', sub: '/ 3' },
          { label: '今日淨收', en: 'net_today', value: '1,840', sub: 'NT$' },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, padding: '12px 14px', background: t.surfaceLo, border: '1px solid ' + t.border, borderRadius: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase', display: 'flex', alignItems: 'baseline', gap: 4 }}>
              {k.label}
              <span style={{ fontFamily: DRV_MONO, opacity: 0.6, fontSize: 8.5 }}>{k.en}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
              <span style={{ fontSize: 21, fontWeight: 700, color: k.tone === 'brand' ? t.brand : t.text, fontFamily: DRV_MONO, letterSpacing: -0.4 }}>{k.value}</span>
              {k.sub && <span style={{ fontSize: 11, color: t.textDim, fontWeight: 500 }}>{k.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Multi-platform health summary */}
      <div style={{ padding: '14px 16px 0' }}>
        <DrvSection theme={t} zh="平台健康" en="platform_presence" dense>
          <DrvCard theme={t} padding={0}>
            {DRV_FX.platforms.map((p, i, a) => (
              <div key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < a.length - 1 ? '1px solid ' + t.border : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: p.ok ? t.success : p.reauth ? t.warn : !p.online ? t.textDim : t.warn }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DrvBi zh={p.name} en={p.code} theme={t} size={13} />
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
                    {p.reauth ? '需重新授權 · reauth_required' : p.online && p.ok ? `上線 · ${p.lastSync}` : !p.online ? `離線 · ${p.lastSync}` : `降級 · ${p.lastSync}`}
                  </div>
                </div>
                {p.forwarded && <DrvPill theme={t} tone="forwarded">外部</DrvPill>}
              </div>
            ))}
          </DrvCard>
        </DrvSection>
      </div>

      <div style={{ padding: '0 16px 24px' }} />
    </div>
  );
}

// ── 3. /jobs — unified task inbox (spec §5.4)
const DRV_TASKS = [
  { id: 'T-8821', plat: 'DRTS', name: '自營派單', en: 'owned',  forwarded: false, status: 'in_progress',    text: '前往松山機場 第二航廈', sub: '台北車站 · 距離 6.2 km',     fare: 'NT$ 420', deadline: '8 分鐘內出發',     ctaZh: '繼續行程', ctaEn: 'continue',     urgent: true,  cap: 'owned', },
  { id: 'T-8822', plat: 'SRX',  name: 'SmartRides X', en: 'forwarded', forwarded: true,  status: 'offered',         text: '信義區 ATT 4 FUN',          sub: '預估 3.8 km · NT$ 245',      fare: 'NT$ 245', deadline: '12 秒可接單',     ctaZh: '接受',     ctaEn: 'relay_accept', urgent: true,  cap: { canRelayAccept: true, canRelayReject: true } },
  { id: 'T-8823', plat: 'SRX',  name: 'SmartRides X', en: 'forwarded', forwarded: true,  status: 'accept_pending',  text: '南港展覽館 1 館',           sub: '已送出 4 秒 · acceptDeadlineAt 26s', fare: 'NT$ 310', deadline: '26 秒等候平台確認', ctaZh: '等候中', ctaEn: 'awaiting',  pending: true, cap: { canRelayAccept: true, canRelayReject: true } },
  { id: 'T-8819', plat: 'DRTS', name: '自營派單',     en: 'owned',     forwarded: false, status: 'completed',       text: '內湖科技園區 · 已完成',    sub: '收車 09:14 · 收據已上傳',   fare: 'NT$ 380' },
  { id: 'T-8815', plat: 'METR', name: 'Metro Hail',   en: 'forwarded', forwarded: true,  status: 'lost_race',       text: '師大夜市',                  sub: '其他司機已接走 · 平台未確認此單',          fare: '—',       cap: 'mirror_only' },
  { id: 'T-8812', plat: 'GOCAB', name: 'GoCab',       en: 'forwarded', forwarded: true,  status: 'cancelled_by_platform', text: '高雄美術館站',         sub: '乘客取消 · 補償 NT$ 60 已入帳',          fare: 'NT$ 60' },
  { id: 'T-8810', plat: 'METR', name: 'Metro Hail',   en: 'forwarded', forwarded: true,  status: 'sync_failed',     text: '中山國中站',                sub: '需派車台處理 · 請等候 ops 指示',         fare: '—' },
];

function DRV_Jobs({ theme: t, filter = 'all' }) {
  const filters = [
    { id: 'all', zh: '全部', en: 'all' },
    { id: 'pending', zh: '待處理', en: 'needs_action', badge: 3 },
    { id: 'progress', zh: '進行中', en: 'in_progress' },
    { id: 'closed', zh: '平台結案', en: 'closed_by_platform' },
    { id: 'sync', zh: '需同步', en: 'sync_failed', badge: 1 },
  ];
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
          <DrvBi zh="任務" en="jobs" theme={t} size={22} />
          <div style={{ fontSize: 11.5, color: t.textDim, fontFamily: DRV_MONO }}>{DRV_TASKS.length} tasks · T3 15s</div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 10, color: t.textMuted }}>
          <span>總計 <b style={{ color: t.text, fontFamily: DRV_MONO }}>{DRV_TASKS.length}</b></span>
          <span>需動作 <b style={{ color: t.warn, fontFamily: DRV_MONO }}>3</b></span>
          <span>外部平台 <b style={{ color: t.forwardedFg, fontFamily: DRV_MONO }}>4</b></span>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {filters.map(f => {
            const on = f.id === filter;
            return (
              <span key={f.id} style={{
                padding: '6px 12px', background: on ? t.text : t.surface, color: on ? t.bg : t.textMuted,
                border: '1px solid ' + (on ? t.text : t.border), borderRadius: 999,
                fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span>{f.zh}</span>
                <span style={{ fontFamily: DRV_MONO, fontSize: 9.5, opacity: 0.65 }}>{f.en}</span>
                {f.badge && <span style={{ marginLeft: 2, padding: '1px 5px', borderRadius: 8, background: on ? '#fff' : t.danger, color: on ? t.text : '#fff', fontSize: 9.5 }}>{f.badge}</span>}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '8px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DRV_TASKS.map(task => <DRV_TaskCard key={task.id} theme={t} task={task} />)}
      </div>
    </div>
  );
}

function DRV_TaskCard({ theme: t, task }) {
  const statusMap = {
    in_progress: { zh: '進行中', en: 'in_progress', tone: 'success' },
    offered: { zh: '可接單', en: 'offered', tone: 'forwarded' },
    accept_pending: { zh: '等待平台確認', en: 'accept_pending', tone: 'warn' },
    confirmed_by_platform: { zh: '平台已確認', en: 'confirmed', tone: 'success' },
    completed: { zh: '已完成', en: 'completed', tone: 'neutral' },
    lost_race: { zh: '其他司機已接', en: 'lost_race', tone: 'neutral' },
    cancelled_by_platform: { zh: '平台取消', en: 'cancelled_by_platform', tone: 'neutral' },
    sync_failed: { zh: '同步異常', en: 'sync_failed', tone: 'danger' },
  };
  const status = statusMap[task.status];
  const dim = ['completed', 'lost_race', 'cancelled_by_platform'].includes(task.status);
  const isExternal = task.forwarded;
  const isMirrorOnly = task.cap === 'mirror_only';
  // capability check for offered/accept_pending
  const capObj = typeof task.cap === 'object' ? task.cap : null;
  const canAccept = capObj ? capObj.canRelayAccept : (task.status === 'in_progress');
  const canReject = capObj ? capObj.canRelayReject : true;

  return (
    <div style={{
      background: t.surface, border: '1px solid ' + (isExternal && !dim ? t.forwardedBorder : t.border),
      borderLeft: isExternal && !dim ? '3px solid ' + t.forwardedFg : '1px solid ' + t.border,
      borderRadius: 14, overflow: 'hidden', opacity: dim ? 0.7 : 1,
    }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <DrvPill theme={t} tone={isExternal ? 'forwarded' : 'owned'}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: isExternal ? t.forwardedFg : t.ownedFg, color: isExternal ? t.forwardedBg : t.ownedBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, fontFamily: DRV_MONO, marginLeft: -2, marginRight: 2 }}>{task.plat.slice(0, 2)}</span>
            {task.name}
          </DrvPill>
          <DrvPill theme={t} tone={status.tone} dot en={status.en}>{status.zh}</DrvPill>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: t.textDim, fontFamily: DRV_MONO }}>{task.id}</span>
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 650, color: t.text, letterSpacing: -0.1, lineHeight: 1.3 }}>{task.text}</div>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3 }}>{task.sub}</div>

        {/* Capability flag explanation when missing */}
        {isMirrorOnly && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: t.neutralBg, borderRadius: 6, fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DrvIcon name="lock" size={11} />
            <span>mirror-only · 此平台不支援駕駛端 accept/reject (Q-DRV01)</span>
          </div>
        )}

        {task.status === 'sync_failed' && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: t.danger, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DrvIcon name="warn" size={12} stroke={2} />
            需派車台處理 · 安全的 fallback 文案 (per spec §5.4)
          </div>
        )}

        {(task.deadline || (task.fare && task.fare !== '—')) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 10, borderTop: '1px dashed ' + t.border }}>
            {task.fare && task.fare !== '—' && <span style={{ fontSize: 13, fontWeight: 700, color: t.text, fontFamily: DRV_MONO }}>{task.fare}</span>}
            {task.deadline && (
              <span style={{ fontSize: 11.5, color: task.urgent ? t.danger : task.pending ? t.warn : t.textMuted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <DrvIcon name="clock" size={11} stroke={2} />
                {task.deadline}
              </span>
            )}
            {task.ctaZh && (
              <span style={{ flex: 1, textAlign: 'right' }}>
                {task.status === 'offered' && (
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    {canReject && <button style={{ padding: '6px 12px', borderRadius: 8, background: 'transparent', color: t.danger, border: '1px solid ' + t.danger + '50', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: DRV_FONT }}>拒絕 · reject</button>}
                    <button disabled={!canAccept} style={{ padding: '6px 12px', borderRadius: 8, background: t.forwardedFg, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: canAccept ? 'pointer' : 'not-allowed', opacity: canAccept ? 1 : 0.5, fontFamily: DRV_FONT }}>{task.ctaZh} · {task.ctaEn}</button>
                  </div>
                )}
                {task.status === 'in_progress' && (
                  <button style={{ padding: '6px 12px', borderRadius: 8, background: t.brand, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: DRV_FONT }}>{task.ctaZh} · {task.ctaEn}</button>
                )}
                {task.pending && (
                  <span style={{ fontSize: 11.5, color: t.warn, fontFamily: DRV_MONO, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: t.warn, animation: 'pulse 1.5s infinite' }} />
                    {task.ctaEn}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DRV_FX, DRV_TASKS, DRV_Onboarding, DRV_Workspace, DRV_Jobs, DRV_TaskCard });
