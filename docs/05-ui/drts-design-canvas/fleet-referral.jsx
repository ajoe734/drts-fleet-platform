// fleet-referral.jsx — Group B · Channel Partner Portal (referral 渠道夥伴看自家數字).
// EXTENDS Fleet Partner Portal (same `fleet` realm + mgmt primitives). Reuses Shell/PageHeader/Kpi/Card/Table/Pill/DL/BiLabel/ActionButton.
// 渠道夥伴 = 物業 App。金額方向 = DRTS 付給夥伴（應收分潤），與信用卡線相反。
// Actor here is the channel partner (御和物業), NOT the metro fleet — separate shell config.

const REF_NAV = [
  { divider: '渠道 · Referral Channel' },
  { key: 'ref-dashboard',  icon: 'dashboard', label: '渠道總覽 · Dashboard' },
  { key: 'ref-usage',      icon: 'reports',   label: '用量明細 · Usage' },
  { divider: '分潤 · Revenue Share' },
  { key: 'ref-statements', icon: 'billing',   label: '分潤對帳單 · Statements', badge: '1', badgeTone: 'warn' },
];

const REF_ACTOR = { name: '御', display: '林庭萱', role: 'channel_partner_admin' };
const REF_HEALTH = { status: 'healthy', lastCheckedAt: '12s' };
const REF_PARTNER = { name: '御和物業', slug: 'yuhe-residence', accent: '#0F766E' };

function RefShell({ theme: th, active, breadcrumb, children, refreshTier = 'medium_slow' }) {
  return (
    <Shell theme={th} nav={REF_NAV} active={active} breadcrumb={breadcrumb}
      env="production" tenant="YUHE_RESIDENCE" actor={REF_ACTOR} health={REF_HEALTH}
      refreshTier={refreshTier} dataFreshness="fresh">
      {children}
    </Shell>
  );
}

// period switcher (month)
function RefPeriod({ theme: th, value = '2026-05' }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid ' + th.border, borderRadius: 8, padding: '5px 6px 5px 11px', background: th.surface }}>
      <MgmtIcon name="calendar" size={13} style={{ color: th.textMuted }} />
      <span style={{ fontFamily: SHELL_MONO, fontSize: 12.5, fontWeight: 600 }}>{value}</span>
      <MgmtIcon name="chevron-down" size={13} style={{ color: th.textDim }} />
    </div>
  );
}

// referral usage trend fixture
const FX_REF_TREND = [
  { m: '01', users: 142, trips: 410 }, { m: '02', users: 168, trips: 503 },
  { m: '03', users: 201, trips: 624 }, { m: '04', users: 236, trips: 742 },
  { m: '05', users: 268, trips: 884 },
];
const FX_REF_USAGE = [
  { day: '2026-05-31', users: 41, trips: 58, gmv: 'NT$ 16,820' },
  { day: '2026-05-30', users: 38, trips: 49, gmv: 'NT$ 14,210' },
  { day: '2026-05-29', users: 33, trips: 44, gmv: 'NT$ 12,960' },
  { day: '2026-05-28', users: 45, trips: 61, gmv: 'NT$ 18,340' },
  { day: '2026-05-27', users: 29, trips: 37, gmv: 'NT$ 10,580' },
];
const FX_REF_STATEMENTS = [
  { id: 'rcs_2026_05', period: '2026-05', trips: 884, gmv: 'NT$ 264,300', share: 'NT$ 26,430', status: 'due',       issued: '2026-06-01' },
  { id: 'rcs_2026_04', period: '2026-04', trips: 742, gmv: 'NT$ 221,800', share: 'NT$ 22,180', status: 'paid',      issued: '2026-05-01' },
  { id: 'rcs_2026_03', period: '2026-03', trips: 624, gmv: 'NT$ 186,400', share: 'NT$ 18,640', status: 'paid',      issued: '2026-04-01' },
  { id: 'rcs_2026_02', period: '2026-02', trips: 503, gmv: 'NT$ 150,200', share: 'NT$ 15,020', status: 'published', issued: '2026-03-01' },
];
// de-identified trip-level rows for statement detail (masked passenger)
const FX_REF_LINES = [
  { trip: 'PT-9E11A3', date: '05-31 14:05', route: '台北車站 → 社區', fare: 'NT$ 285', share: 'NT$ 28.5', rider: '住戶 ••••2A2' },
  { trip: 'PT-9E0F77', date: '05-31 09:20', route: '社區 → 內湖科技園區', fare: 'NT$ 410', share: 'NT$ 41.0', rider: '住戶 ••••8B1' },
  { trip: 'PT-9DF120', date: '05-30 18:42', route: '信義威秀 → 社區', fare: 'NT$ 268', share: 'NT$ 26.8', rider: '住戶 ••••4C9' },
  { trip: 'PT-9DA088', date: '05-30 08:05', route: '社區 → 台北榮總', fare: 'NT$ 320', share: 'NT$ 32.0', rider: '住戶 ••••2A2' },
  { trip: 'PT-9D6610', date: '05-29 21:10', route: '松山機場 → 社區', fare: 'NT$ 246', share: 'NT$ 24.6', rider: '住戶 ••••7F3' },
];
function refStmtTone(s) { return s === 'paid' ? 'success' : s === 'due' ? 'warn' : s === 'published' ? 'info' : 'neutral'; }

// ── B1. /referral/dashboard ──────────────────────────────────────────────────
function FLP_RefDashboard({ theme: th }) {
  const max = Math.max(...FX_REF_TREND.map(d => d.trips));
  return (
    <RefShell theme={th} active="ref-dashboard" breadcrumb={['渠道', '渠道總覽']}>
      <PageHeader theme={th} title="渠道總覽 · Channel Dashboard"
        subtitle="御和物業 · 社區叫車渠道 · referral_channel · 本期重點數字"
        meta={<><Pill theme={th} tone="issuer" dot>渠道夥伴 · YUHE</Pill><Pill theme={th} tone="accent">應收分潤 · DRTS → 夥伴</Pill></>}
        actions={<><RefPeriod theme={th} /><Btn theme={th} icon="export">匯出</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="去重活躍用戶" en="active_users_dedup" value="268" delta="↑ 13.6%" deltaTone="up" sub="本期曾叫車住戶數" />
          <Kpi theme={th} label="完成行程" en="completed_trips" value="884" delta="↑ 19.1%" deltaTone="up" sub="vs 上期 742" />
          <Kpi theme={th} label="GMV" en="gmv" value="NT$ 264K" delta="↑ 19.2%" deltaTone="up" sub="完成行程車資總額" />
          <Kpi theme={th} label="預估分潤" en="est_share" value="NT$ 26,430" delta="待對帳確認" deltaTone="neutral" sub="應收 · 10% of GMV" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <Card theme={th} title="活躍用戶 / 行程趨勢" subtitle="近 5 期 · 月">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 180, padding: '8px 4px 0' }}>
              {FX_REF_TREND.map(d => (
                <div key={d.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 5, height: 140 }}>
                    <div title={'行程 ' + d.trips} style={{ width: 18, height: (d.trips / max * 130) + 'px', background: th.accent, borderRadius: '4px 4px 0 0' }} />
                    <div title={'用戶 ' + d.users} style={{ width: 18, height: (d.users / max * 130) + 'px', background: th.accentBg, border: '1px solid ' + th.accentBorder, borderRadius: '4px 4px 0 0' }} />
                  </div>
                  <span style={{ fontFamily: SHELL_MONO, fontSize: 11, color: th.textMuted }}>{d.m}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + th.border }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: th.textMuted }}><span style={{ width: 11, height: 11, borderRadius: 3, background: th.accent }} />完成行程</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: th.textMuted }}><span style={{ width: 11, height: 11, borderRadius: 3, background: th.accentBg, border: '1px solid ' + th.accentBorder }} />去重活躍用戶</span>
            </div>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card theme={th} title="分潤方向" subtitle="settlement direction">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 0 14px' }}>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 13, fontWeight: 700 }}>DRTS</div><div style={{ fontSize: 11, color: th.textDim }}>平台</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: th.accent }}>
                  <span style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>應收分潤</span>
                  <MgmtIcon name="arrow-right" size={20} />
                </div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 13, fontWeight: 700 }}>御和物業</div><div style={{ fontSize: 11, color: th.textDim }}>渠道夥伴</div></div>
              </div>
              <Banner theme={th} tone="info" icon="info" body="此渠道金流方向與信用卡發卡線相反：由 DRTS 支付分潤給渠道夥伴。" />
            </Card>
            <Card theme={th} title="本期對帳單">
              <DL theme={th} cols={2} items={[
                { k: '期別', v: '2026-05', mono: true },
                { k: '狀態', v: <Pill theme={th} tone="warn" dot>due</Pill> },
                { k: '行程數', v: '884', mono: true },
                { k: '應收分潤', v: 'NT$ 26,430', mono: true },
              ]} />
            </Card>
          </div>
        </div>
      </div>
    </RefShell>
  );
}

// ── B2. /referral/usage ──────────────────────────────────────────────────────
function FLP_RefUsage({ theme: th }) {
  return (
    <RefShell theme={th} active="ref-usage" breadcrumb={['渠道', '用量明細']}>
      <PageHeader theme={th} title="用量明細 · Usage"
        subtitle="依期間 · 活躍用戶 / 行程趨勢 · 可下探行程層級（去識別後）"
        actions={<><RefPeriod theme={th} /><Btn theme={th} icon="export">匯出</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="期間去重用戶" en="period_users" value="268" sub="2026-05" />
          <Kpi theme={th} label="期間完成行程" en="period_trips" value="884" sub="日均 28.5 趟" />
          <Kpi theme={th} label="人均行程" en="trips_per_user" value="3.3" sub="活躍度指標" />
        </div>
        <Card theme={th} title="每日用量" subtitle="近 5 日 · 可下探" padding={0}
          actions={<Pill theme={th} tone="neutral">去識別 · de-identified</Pill>}>
          <Table theme={th} columns={[
            { h: 'DATE', k: 'day', w: 150, mono: true },
            { h: '去重用戶', k: 'users', w: 130, mono: true, align: 'right' },
            { h: '完成行程', k: 'trips', w: 130, mono: true, align: 'right' },
            { h: 'GMV', k: 'gmv', w: 160, mono: true, align: 'right' },
            { h: '', w: 120, r: () => <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">行程層級</Btn> },
          ]} rows={FX_REF_USAGE} />
        </Card>
        <Card theme={th} title="行程層級（去識別）" subtitle="trip-level · 乘客以遮罩參照顯示，不含個資" padding={0}>
          <Table theme={th} columns={[
            { h: 'TRIP', k: 'trip', w: 120, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.trip}</span> },
            { h: 'DATE', k: 'date', w: 120, mono: true },
            { h: 'ROUTE', k: 'route', w: 240 },
            { h: '乘客參照', k: 'rider', w: 130, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.rider}</span> },
            { h: 'FARE', k: 'fare', w: 110, mono: true, align: 'right' },
          ]} rows={FX_REF_LINES} />
        </Card>
      </div>
    </RefShell>
  );
}

// ── B3a. /referral/statements — list ─────────────────────────────────────────
function FLP_RefStatements({ theme: th }) {
  return (
    <RefShell theme={th} active="ref-statements" breadcrumb={['分潤', '分潤對帳單']} refreshTier="manual">
      <PageHeader theme={th} title="分潤對帳單 · Statements"
        subtitle="每期一張 · 金額方向＝DRTS 付給夥伴（應收分潤）· 可下載簽名 artifact"
        meta={<Pill theme={th} tone="accent">應收分潤 · receivable</Pill>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'STATEMENT', k: 'id', w: 170, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'PERIOD', k: 'period', w: 110, mono: true },
            { h: 'TRIPS', k: 'trips', w: 90, mono: true, align: 'right' },
            { h: 'GMV', k: 'gmv', w: 150, mono: true, align: 'right' },
            { h: '應收分潤 · share', k: 'share', w: 150, mono: true, align: 'right', r: r => <span style={{ fontWeight: 700, color: th.accent }}>{r.share}</span> },
            { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={refStmtTone(r.status)} dot>{r.status}</Pill> },
            { h: 'ISSUED', k: 'issued', w: 120, mono: true },
            { h: 'ACTIONS', w: 110, r: r => <ActionButton theme={th} size="xs" descriptor={{ action: 'download', enabled: true, riskLevel: 'low' }} icon="download" label="下載" en="dl" /> },
          ]} rows={FX_REF_STATEMENTS} />
        </Card>
      </div>
    </RefShell>
  );
}

// ── B3b. /referral/statements/[period] — detail ──────────────────────────────
function FLP_RefStatementDetail({ theme: th }) {
  const s = FX_REF_STATEMENTS[0];
  return (
    <RefShell theme={th} active="ref-statements" breadcrumb={['分潤對帳單', s.id]} refreshTier="manual">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{s.id}<Pill theme={th} tone={refStmtTone(s.status)} dot>{s.status}</Pill></span>}
        subtitle={`期別 ${s.period} · ${s.trips} 趟 · 應收分潤 ${s.share}`}
        actions={<><Btn theme={th} icon="download">下載 artifact</Btn><Btn theme={th} variant="primary" icon="check">確認收訖</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="對帳單行 · 完成行程" subtitle="trip / fare / 分潤額 · 去識別乘客參照" padding={0}>
          <Table theme={th} columns={[
            { h: 'TRIP', k: 'trip', w: 120, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.trip}</span> },
            { h: 'DATE', k: 'date', w: 110, mono: true },
            { h: 'ROUTE', k: 'route', w: 210 },
            { h: 'FARE', k: 'fare', w: 100, mono: true, align: 'right' },
            { h: '分潤', k: 'share', w: 100, mono: true, align: 'right', r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.share}</span> },
          ]} rows={FX_REF_LINES} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="期別總計" subtitle="period totals">
            <DL theme={th} cols={1} items={[
              { k: '完成行程 · trips', v: s.trips, mono: true },
              { k: 'GMV', v: s.gmv, mono: true },
              { k: '分潤費率 · rate', v: '10% of GMV', mono: true },
              { k: '應收分潤 · payable', v: s.share, mono: true },
              { k: '金流方向', v: 'DRTS → 御和物業' },
              { k: '狀態 · status', v: <Pill theme={th} tone={refStmtTone(s.status)} dot>{s.status}</Pill> },
            ]} />
          </Card>
          <Card theme={th} title="簽名 artifact" subtitle="statement integrity">
            <DL theme={th} cols={1} items={[
              { k: 'ARTIFACT', v: 'rcs_2026_05.pdf', mono: true },
              { k: 'SHA-256', v: '9f2a…7c41', mono: true },
              { k: 'SIGNED AT', v: '2026-06-01 02:14', mono: true },
            ]} />
            <div style={{ marginTop: 12 }}>
              <Banner theme={th} tone="success" icon="check" body="簽名雜湊與後端一致 · 可作為對帳憑證。" />
            </div>
          </Card>
          <Card theme={th} title="單筆爭議">
            <Banner theme={th} tone="neutral" icon="info" body="如對某趟分潤金額有疑義，可於行項提報 DRTS 對帳爭議。" />
            <div style={{ marginTop: 10 }}>
              <ActionButton theme={th} descriptor={{ action: 'dispute', enabled: true, riskLevel: 'medium', requiresReason: true }} label="提報對帳爭議" en="dispute" />
            </div>
          </Card>
        </div>
      </div>
    </RefShell>
  );
}

Object.assign(window, {
  REF_NAV, REF_ACTOR, REF_HEALTH, REF_PARTNER, RefShell, RefPeriod,
  FX_REF_TREND, FX_REF_USAGE, FX_REF_STATEMENTS, FX_REF_LINES, refStmtTone,
  FLP_RefDashboard, FLP_RefUsage, FLP_RefStatements, FLP_RefStatementDetail,
});
