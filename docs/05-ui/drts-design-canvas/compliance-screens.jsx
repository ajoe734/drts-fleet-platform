// compliance-screens.jsx — A5 Compliance & Investigation + A6 Regulator Viewer.
// §C1 ruling: housed in a DEDICATED new Compliance Console (compliance slate realm).
// Reuses mgmt Shell/primitives. A5: Compliance Dashboard · Trip Compliance · Takeover Review ·
// Accident Case · Synchronized Timeline (video+telemetry player) · Evidence Manifest ·
// Controlled Export · Regulatory Report Jobs · Legal Hold.  A6: scoped read-only Regulator Portal w/ masking.

const CMP_ACTOR = { name: 'IZ', display: '葉宛臻', role: 'compliance_investigator' };
const CMP_HEALTH = { status: 'healthy', lastCheckedAt: '9s' };
const CMP_NAV = [
  { divider: '調查 · Investigation' },
  { key: 'dashboard',  icon: 'dashboard', label: '合規總覽 · Dashboard' },
  { key: 'trips',      icon: 'reports',   label: '行程合規 · Trip Compliance' },
  { key: 'takeover',   icon: 'governance',label: '接管審查 · Takeover Review', badge: '2', badgeTone: 'warn' },
  { key: 'accident',   icon: 'incidents', label: '事故案件 · Accident Cases', badge: '1', badgeTone: 'danger' },
  { divider: '證據 · Evidence' },
  { key: 'timeline',   icon: 'tracking',  label: '同步時間軸 · Timeline' },
  { key: 'manifest',   icon: 'audit',     label: '證據清單 · Manifest' },
  { key: 'export',     icon: 'billing',   label: '受控匯出 · Controlled Export' },
  { key: 'legalhold',  icon: 'governance',label: '法律保留 · Legal Hold', badge: '1', badgeTone: 'warn' },
  { divider: '監理 · Regulatory' },
  { key: 'reportjobs', icon: 'reports',   label: '報表作業 · Report Jobs' },
  { key: 'regulator',  icon: 'health',    label: '主管機關檢視 · Regulator', badge: 'RO', badgeTone: 'neutral' },
];
const CMP_EVID = {
  tesla_provided: { zh: 'Tesla 提供', tone: 'info' }, operator_reported: { zh: '安全員回報', tone: 'accent' },
  device_recorded: { zh: '車載錄製', tone: 'neutral' }, not_exposed_by_provider: { zh: '原廠未提供', tone: 'warn' },
};
function CmpEv({ theme: th, src }) { const m = CMP_EVID[src] || CMP_EVID.device_recorded; return <Pill theme={th} tone={m.tone}>{m.zh}<span style={{ marginLeft: 3, opacity: .55, fontFamily: SHELL_MONO, fontSize: 9 }}>{src}</span></Pill>; }

function CmpShell({ theme: th, active, breadcrumb, children, actor = CMP_ACTOR, env = 'production' }) {
  return <Shell theme={th} nav={CMP_NAV} active={active} breadcrumb={breadcrumb} env={env} tenant="FSD_SANDBOX" actor={actor} health={CMP_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">{children}</Shell>;
}

// ── A5.1 Compliance Dashboard ────────────────────────────────────────────────
function CMP_Dashboard({ theme: th }) {
  return (
    <CmpShell theme={th} active="dashboard" breadcrumb={['合規總覽']}>
      <PageHeader theme={th} title="實驗合規總覽" subtitle="exp_fsd_taipei_01 · 合規率 / 接管 / 事故 / 證據完整度"
        meta={<Pill theme={th} tone="compliance" dot>調查 · Investigation</Pill>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <Kpi theme={th} label="合規率" en="compliance_rate" value="98.2%" delta="目標 98%" deltaTone="up" />
          <Kpi theme={th} label="接管待審" en="takeover_review" value="2" sub="超出常規" tone="warn" />
          <Kpi theme={th} label="事故案件" en="accident_cases" value="1" sub="L2 調查中" tone="danger" />
          <Kpi theme={th} label="證據完整度" en="evidence_coverage" value="92%" sub="原廠影像缺口" tone="warn" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card theme={th} title="合規違規旗標" subtitle="compliance flags" padding={0}>
            <Table theme={th} columns={[
              { h: '類型', w: 160, r: r => r.t }, { h: '行程', w: 120, mono: true, r: r => r.trip },
              { h: '嚴重', w: 80, r: r => <Pill theme={th} tone={r.tone} dot>{r.sev}</Pill> },
            ]} rows={[
              { t: '逾核准時段 2 分', trip: 'trip_88210', sev: 'warn', tone: 'warn' },
              { t: '接管未即時回報', trip: 'trip_88240', sev: 'warn', tone: 'warn' },
              { t: '事故影像缺口', trip: 'trip_88240', sev: 'high', tone: 'danger' },
            ]} />
          </Card>
          <Card theme={th} title="調查中案件" subtitle="open investigations">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['acc_0214', 'L2 行人緊急煞停', 'danger'], ['tko_0215', '接管原因原廠未提供', 'warn']].map(([id, t, tone], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid ' + th.border, borderRadius: 9 }}>
                  <MgmtIcon name="incidents" size={15} style={{ color: th[tone] }} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 10.5, color: th.textDim, fontFamily: SHELL_MONO }}>{id}</div></div>
                  <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">調查</Btn>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </CmpShell>
  );
}

// ── A5.2 Trip Compliance Detail ──────────────────────────────────────────────
function CMP_TripDetail({ theme: th }) {
  return (
    <CmpShell theme={th} active="trips" breadcrumb={['行程合規', 'trip_88240']}>
      <PageHeader theme={th} title="行程合規 · trip_88240" subtitle="AV-7732 · 南港 → 內湖 · 1 接管 · 合規檢核"
        actions={<Btn theme={th} variant="primary" icon="tracking">開啟同步時間軸</Btn>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="合規檢核項" subtitle="compliance checks">
          {[['核准區域內', true, '全程於信義/南港沙盒區'], ['核准時段內', true, '14:40 在 08–18 窗口'], ['安全員在崗', true, '吳明翰 全程隨車'], ['接管即時回報', false, '接管後 42 秒才回報（>30s）'], ['事故影像完整', false, '原廠事故影像未提供']].map(([t, ok, d], i) => (
            <div key={i} style={{ display: 'flex', gap: 11, padding: '10px 0', borderBottom: '1px solid ' + th.borderSoft }}>
              <MgmtIcon name={ok ? 'check' : 'warn'} size={15} style={{ color: ok ? th.success : th.warn, flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 11.5, color: th.textMuted }}>{d}</div></div>
              <Pill theme={th} tone={ok ? 'success' : 'warn'}>{ok ? '通過' : '違規'}</Pill>
            </div>
          ))}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="行程摘要">
            <DL theme={th} cols={2} items={[
              { k: '車輛', v: 'AV-7732', mono: true }, { k: '安全員', v: '吳明翰' },
              { k: '里程', v: '3.1 km', mono: true }, { k: '接管', v: '1', mono: true },
              { k: '合規', v: <Pill theme={th} tone="warn" dot>2 違規</Pill> },
            ]} />
          </Card>
          <Card theme={th} title="證據來源">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <CmpEv theme={th} src="device_recorded" /><CmpEv theme={th} src="operator_reported" /><CmpEv theme={th} src="not_exposed_by_provider" />
            </div>
          </Card>
        </div>
      </div>
    </CmpShell>
  );
}

// ── A5.5 Synchronized Timeline — video + telemetry player (signature) ─────────
function CMP_Timeline({ theme: th }) {
  const T = 142, cur = 88; // seconds
  const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const events = [
    { at: 18, t: 'FSD 啟動', tone: 'info' }, { at: 64, t: '進入路口', tone: 'neutral' },
    { at: 88, t: '安全員接管', tone: 'danger' }, { at: 96, t: '緊急煞停', tone: 'danger' }, { at: 120, t: '恢復 FSD', tone: 'success' },
  ];
  const tracks = [
    { name: '前鏡頭 · front', src: 'device_recorded', kind: 'video' },
    { name: '車內 · cabin', src: 'device_recorded', kind: 'video' },
    { name: '原廠事件 · tesla', src: 'not_exposed_by_provider', kind: 'gap' },
    { name: '車速 · speed', src: 'device_recorded', kind: 'tele' },
    { name: '安全員標記 · operator', src: 'operator_reported', kind: 'marks' },
  ];
  return (
    <CmpShell theme={th} active="timeline" breadcrumb={['同步時間軸', 'trip_88240']}>
      <PageHeader theme={th} title="同步時間軸 · Synchronized Timeline" subtitle="影像 + telemetry 對齊播放 · 多源同步 scrub · 原廠缺口明示"
        actions={<Btn theme={th} icon="download">匯出片段</Btn>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {['前鏡頭 · front_cam', '車內 · cabin_cam'].map((l, i) => (
              <div key={i} style={{ aspectRatio: '16/10', borderRadius: 10, background: '#0a0d12', border: '1px solid ' + th.border, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MgmtIcon name="tracking" size={26} style={{ color: '#33415c' }} />
                <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontFamily: SHELL_MONO, color: '#8fa3bf', background: 'rgba(0,0,0,.5)', padding: '2px 6px', borderRadius: 4 }}>{l}</span>
                <span style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 10, fontFamily: SHELL_MONO, color: '#cdd8e8', background: 'rgba(0,0,0,.55)', padding: '2px 6px', borderRadius: 4 }}>{fmt(cur)} / {fmt(T)}</span>
              </div>
            ))}
          </div>
          <div style={{ aspectRatio: '32/6', borderRadius: 10, background: th.warnBg, border: '1px dashed ' + th.warn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <MgmtIcon name="warn" size={16} style={{ color: th.warn }} />
            <span style={{ fontSize: 12, color: th.warn, fontWeight: 600 }}>原廠事件影像未提供 · not_exposed_by_provider — 此時段無 Tesla 來源可對齊</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: th.surface, border: '1px solid ' + th.border, borderRadius: 10 }}>
            <MgmtIcon name="dispatch" size={18} style={{ color: th.accent }} />
            <span style={{ fontFamily: SHELL_MONO, fontSize: 12, color: th.text }}>{fmt(cur)}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: th.surfaceLo, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: (cur / T * 100) + '%', background: th.accent, borderRadius: 3 }} />
              {events.map((e, i) => <span key={i} style={{ position: 'absolute', left: (e.at / T * 100) + '%', top: -3, width: 2, height: 12, background: th[e.tone] || th.textDim }} />)}
              <span style={{ position: 'absolute', left: (cur / T * 100) + '%', top: -4, width: 14, height: 14, borderRadius: 7, background: th.accent, border: '2px solid ' + th.surface, transform: 'translateX(-7px)' }} />
            </div>
            <span style={{ fontFamily: SHELL_MONO, fontSize: 12, color: th.textMuted }}>{fmt(T)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="同步軌道 · tracks" subtitle="多源對齊 · 含原廠缺口" padding={0}>
            <div>
              {tracks.map((tr, i) => (
                <div key={i} style={{ padding: '9px 14px', borderTop: i ? '1px solid ' + th.borderSoft : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{tr.name}</span>
                    <CmpEv theme={th} src={tr.src} />
                  </div>
                  <div style={{ height: 14, borderRadius: 4, position: 'relative', overflow: 'hidden', background: tr.kind === 'gap' ? th.warnBg : th.surfaceLo, border: tr.kind === 'gap' ? '1px dashed ' + th.warn : '1px solid ' + th.border }}>
                    {tr.kind === 'video' && <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(90deg,' + th.accent + '44 0,' + th.accent + '44 3px,transparent 3px,transparent 7px)' }} />}
                    {tr.kind === 'tele' && <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}><polyline points="0,10 30,6 60,11 90,3 120,9 160,13 200,5 260,8" fill="none" stroke={th.accent} strokeWidth="1.5" /></svg>}
                    {tr.kind === 'marks' && <span style={{ position: 'absolute', left: '62%', top: 1, bottom: 1, width: 3, background: th.accent }} />}
                    {tr.kind === 'gap' && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: th.warn }}>無來源</span>}
                    <span style={{ position: 'absolute', left: (cur / T * 100) + '%', top: -1, bottom: -1, width: 1.5, background: th.text }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card theme={th} title="事件標記 · events" padding={0}>
            <div>
              {events.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px', borderTop: i ? '1px solid ' + th.borderSoft : 'none', background: e.at === cur ? th.accentBg : 'transparent' }}>
                  <span style={{ fontFamily: SHELL_MONO, fontSize: 11, color: th.textMuted, width: 40 }}>{fmt(e.at)}</span>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: th[e.tone] || th.textDim }} />
                  <span style={{ fontSize: 12.5, flex: 1 }}>{e.t}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </CmpShell>
  );
}

// ── A5.4 Accident Case ───────────────────────────────────────────────────────
function CMP_Accident({ theme: th }) {
  return (
    <CmpShell theme={th} active="accident" breadcrumb={['事故案件', 'acc_0214']}>
      <PageHeader theme={th} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>acc_0214 · 行人緊急煞停<Pill theme={th} tone="danger">L2</Pill></span>}
        subtitle="AV-7732 · 2026-06-25 14:48 · 調查中"
        actions={<><Btn theme={th} icon="tracking">同步時間軸</Btn><Btn theme={th} variant="primary" icon="audit">產生監理報告</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="案件時間軸 · cross-actor">
          <Timeline theme={th} events={[
            { at: '14:48:51', tone: 'danger', t: '安全員緊急煞停接管', body: 'operator_reported · 行人闖入' },
            { at: '14:48:53', tone: 'warn', t: '原廠未提供退出原因', body: 'not_exposed_by_provider' },
            { at: '14:50:10', tone: 'info', t: '建立事故案件', body: '由 ROC 升級 · L2' },
            { at: '14:52:00', tone: 'accent', t: '證據封存', body: '3 件 · 1 原廠缺口' },
            { tone: 'compliance', t: '合規調查中', body: '葉宛臻 investigating', current: true },
          ]} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="案件資訊">
            <DL theme={th} cols={1} items={[
              { k: '等級', v: 'L2 · 需通報', mono: false }, { k: '初報時限', v: '≤ 1 小時 (policy)', mono: true },
              { k: '通報對象', v: '交通局', mono: false }, { k: '法律保留', v: <Pill theme={th} tone="warn" dot>已啟動</Pill> },
            ]} />
          </Card>
          <Card theme={th} title="處置動作" subtitle="availableActions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionButton theme={th} descriptor={{ action: 'file_report', enabled: true, riskLevel: 'high', requiresReason: true }} label="提交監理通報" en="file_report" />
              <ActionButton theme={th} descriptor={{ action: 'request_provider_data', enabled: true, riskLevel: 'medium' }} label="要求原廠補件" en="req_provider" />
            </div>
          </Card>
        </div>
      </div>
    </CmpShell>
  );
}

// ── A5.3 Takeover Review ─────────────────────────────────────────────────────
function CMP_TakeoverReview({ theme: th }) {
  return (
    <CmpShell theme={th} active="takeover" breadcrumb={['接管審查']}>
      <PageHeader theme={th} title="接管審查 · Takeover Review" subtitle="逐筆審查接管事件 · 三源對照 · 判定合規/異常" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ID', k: 'id', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '車輛', k: 'v', w: 90, mono: true },
            { h: '原廠原因', w: 150, r: r => <CmpEv theme={th} src={r.src} /> },
            { h: '安全員嚴重度', w: 110, r: r => <Pill theme={th} tone={r.sev === '高' ? 'danger' : 'warn'}>{r.sev}</Pill> },
            { h: '審查', w: 120, r: r => <Pill theme={th} tone={r.rev === '合規' ? 'success' : r.rev === '異常' ? 'danger' : 'neutral'} dot>{r.rev}</Pill> },
            { h: '', w: 80, r: () => <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">審查</Btn> },
          ]} rows={[
            { id: 'tko_0215', v: 'AV-7732', src: 'not_exposed_by_provider', sev: '高', rev: '異常' },
            { id: 'tko_0216', v: 'AV-7715', src: 'tesla_provided', sev: '中', rev: '待審' },
            { id: 'tko_0214', v: 'AV-7720', src: 'tesla_provided', sev: '低', rev: '合規' },
          ]} />
        </Card>
      </div>
    </CmpShell>
  );
}

// ── A5.6 Evidence Manifest ───────────────────────────────────────────────────
function CMP_Manifest({ theme: th }) {
  return (
    <CmpShell theme={th} active="manifest" breadcrumb={['證據清單', 'acc_0214']}>
      <PageHeader theme={th} title="證據清單 · Evidence Manifest" subtitle="acc_0214 · append-only · 雜湊鏈 · 來源標記"
        actions={<Btn theme={th} variant="primary" icon="download">受控匯出</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '#', w: 40, mono: true, align: 'center', r: (r, i) => i + 1 },
            { h: '檔案', k: 'name', w: 190, mono: true },
            { h: '來源', w: 160, r: r => <CmpEv theme={th} src={r.src} /> },
            { h: 'SHA-256', k: 'hash', w: 110, mono: true },
            { h: '封存時間', k: 'at', w: 130, mono: true },
            { h: '狀態', w: 110, r: r => <Pill theme={th} tone={r.state === 'sealed' ? 'success' : r.state === 'missing' ? 'warn' : 'info'} dot>{r.state}</Pill> },
          ]} rows={[
            { name: 'front_cam_1448.mp4', src: 'device_recorded', hash: '9f2a…7c41', at: '14:52:01', state: 'sealed' },
            { name: 'cabin_cam_1448.mp4', src: 'device_recorded', hash: '3b81…22aa', at: '14:52:03', state: 'sealed' },
            { name: 'so_report_0215.pdf', src: 'operator_reported', hash: '7c0d…91ef', at: '14:55:18', state: 'sealed' },
            { name: 'tesla_event_log.json', src: 'not_exposed_by_provider', hash: '—', at: '—', state: 'missing' },
          ]} />
        </Card>
        <div style={{ marginTop: 14 }}><Banner theme={th} tone="warn" icon="warn" body="原廠事件記錄缺口已在清單中明確標記為 missing / not_exposed_by_provider，不以其他來源臆補。" /></div>
      </div>
    </CmpShell>
  );
}

// ── A5.7 Controlled Export ───────────────────────────────────────────────────
function CMP_Export({ theme: th }) {
  return (
    <CmpShell theme={th} active="export" breadcrumb={['受控匯出']}>
      <PageHeader theme={th} title="受控匯出 · Controlled Export" subtitle="證據外送主管機關 · 雙人覆核 · 浮水印 · 全程 audit" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="匯出申請">
          <DL theme={th} cols={1} items={[
            { k: '案件', v: 'acc_0214', mono: true }, { k: '收件對象', v: '台北市交通局', mono: false },
            { k: '範圍', v: '3 件證據 + 監理報告', mono: false }, { k: '格式', v: 'sealed bundle (.zip + manifest)', mono: true },
            { k: '浮水印', v: '收件單位 + 時戳', mono: false },
          ]} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <ActionButton theme={th} descriptor={{ action: 'request_export', enabled: true, riskLevel: 'high', requiresReason: true }} label="送出匯出申請" en="export" />
          </div>
        </Card>
        <Card theme={th} title="覆核與稽核" subtitle="dual control">
          <Banner theme={th} tone="neutral" icon="lock" body="受控匯出需第二位 compliance 主管覆核；匯出動作、收件對象、雜湊清單全程寫入 append-only audit。" />
          <div style={{ marginTop: 12 }}>
            <DL theme={th} cols={1} items={[
              { k: '申請人', v: '葉宛臻', mono: false }, { k: '覆核人', v: '待指派 · pending', mono: false },
              { k: 'audit', v: 'cmp_exp_0091', mono: true },
            ]} />
          </div>
        </Card>
      </div>
    </CmpShell>
  );
}

// ── A5.8 Regulatory Report Jobs ──────────────────────────────────────────────
function CMP_ReportJobs({ theme: th }) {
  return (
    <CmpShell theme={th} active="reportjobs" breadcrumb={['報表作業']}>
      <PageHeader theme={th} title="監理報表作業 · Report Jobs" subtitle="非同步產生 · 狀態追蹤 · 重算"
        actions={<Btn theme={th} variant="primary" icon="plus">新作業</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'JOB', k: 'id', w: 150, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '類型', k: 'type', w: 180 },
            { h: '期間', k: 'period', w: 120, mono: true },
            { h: '進度', w: 140, r: r => r.state === 'running'
              ? <div style={{ height: 6, borderRadius: 3, background: th.surfaceLo, overflow: 'hidden' }}><div style={{ width: r.pct + '%', height: '100%', background: th.accent }} /></div>
              : <Pill theme={th} tone={r.state === 'done' ? 'success' : r.state === 'failed' ? 'danger' : 'neutral'} dot>{r.state}</Pill> },
            { h: '', w: 90, r: r => <Btn theme={th} size="xs" variant="ghost" icon={r.state === 'done' ? 'download' : 'refresh'}>{r.state === 'done' ? '下載' : '重算'}</Btn> },
          ]} rows={[
            { id: 'job_2026w25', type: '週監理報表', period: '2026-W25', state: 'running', pct: 64 },
            { id: 'job_acc0214', type: '事故監理報告', period: 'acc_0214', state: 'done', pct: 100 },
            { id: 'job_2026w24', type: '週監理報表', period: '2026-W24', state: 'done', pct: 100 },
            { id: 'job_2026m05', type: '月運行摘要', period: '2026-05', state: 'failed', pct: 0 },
          ]} />
        </Card>
      </div>
    </CmpShell>
  );
}

// ── A5.9 Legal Hold ──────────────────────────────────────────────────────────
function CMP_LegalHold({ theme: th }) {
  return (
    <CmpShell theme={th} active="legalhold" breadcrumb={['法律保留']}>
      <PageHeader theme={th} title="法律保留 · Legal Hold" subtitle="凍結刪除 · 優先於保存政策 · 衝突明示處理"
        actions={<Btn theme={th} variant="primary" icon="lock">建立保留</Btn>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Banner theme={th} tone="warn" icon="lock" title="法律保留優先於保存政策"
          body="當案件處於 legal hold，相關證據即使超過一般保存年限（如 30 天）也不刪除；保存政策與 legal hold 衝突時，以 legal hold 為準並記錄衝突解決。" />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ID', k: 'id', w: 120, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '關聯案件', k: 'case', w: 120, mono: true },
            { h: '範圍', k: 'scope', w: 180 },
            { h: '建立', k: 'at', w: 110, mono: true },
            { h: '保存政策衝突', w: 130, r: r => r.conflict ? <Pill theme={th} tone="warn" dot>已覆寫保存</Pill> : <Pill theme={th} tone="neutral">無</Pill> },
            { h: '狀態', w: 100, r: r => <Pill theme={th} tone="warn" dot>active</Pill> },
          ]} rows={[
            { id: 'hold_0214', case: 'acc_0214', scope: '3 件證據 + 行程', at: '2026-06-25', conflict: true },
          ]} />
        </Card>
      </div>
    </CmpShell>
  );
}

// ── A6 Regulator Viewer Portal — scoped read-only + masking ───────────────────
function CMP_Regulator({ theme: th }) {
  const ro = { name: 'GV', display: '主管機關 · 交通局', role: 'regulator_viewer' };
  return (
    <CmpShell theme={th} active="regulator" breadcrumb={['主管機關檢視']} actor={ro} env="regulator">
      <PageHeader theme={th} title="主管機關檢視 · Regulator Portal" subtitle="受控唯讀 · scoped access · PII 遮罩 · A6"
        meta={<><Pill theme={th} tone="neutral" dot>read-only</Pill><Pill theme={th} tone="warn">PII 遮罩</Pill></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="neutral" icon="lock" body="主管機關僅檢視核准範圍內的去識別資訊：實驗概況、核准路線/時段/車輛/安全員、進行中行程、事故/接管摘要、監理報表、證據包請求。乘客個資與商業細節遮罩。" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <Kpi theme={th} label="核准車輛" en="approved_vehicles" value="5" sub="enrolled" />
          <Kpi theme={th} label="進行中行程" en="active_trips" value="3" sub="去識別" />
          <Kpi theme={th} label="本週接管" en="takeovers" value="41" sub="W25" />
          <Kpi theme={th} label="事故" en="incidents" value="1" sub="L2" tone="warn" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card theme={th} title="進行中行程（去識別）" subtitle="active trips · masked" padding={0}>
            <Table theme={th} columns={[
              { h: '行程', w: 120, mono: true, r: r => r.id },
              { h: '車輛', k: 'v', w: 90, mono: true },
              { h: '路線', k: 'route', w: 130 },
              { h: '乘客', w: 90, r: () => <span style={{ color: th.textMuted, fontFamily: SHELL_MONO }}>••••</span> },
            ]} rows={[
              { id: 'trip_882••', v: 'AV-7720', route: '信義 → 南港' },
              { id: 'trip_882••', v: 'AV-7715', route: '信義 → 信義' },
            ]} />
          </Card>
          <Card theme={th} title="可請求項目" subtitle="evidence bundle request">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[['監理報表 W25', 'download'], ['事故 acc_0214 摘要', 'arrow-right'], ['證據包請求', 'lock']].map(([l, ic], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid ' + th.border, borderRadius: 9 }}>
                  <MgmtIcon name={ic} size={15} style={{ color: th.accent }} />
                  <span style={{ flex: 1, fontSize: 12.5 }}>{l}</span>
                  <Btn theme={th} size="xs" variant="ghost">{ic === 'lock' ? '申請' : '取得'}</Btn>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: th.textDim }}>證據包請求須經 compliance 受控匯出流程核發。</div>
          </Card>
        </div>
      </div>
    </CmpShell>
  );
}

Object.assign(window, {
  CMP_ACTOR, CMP_HEALTH, CMP_NAV, CmpEv, CmpShell,
  CMP_Dashboard, CMP_TripDetail, CMP_Timeline, CMP_Accident, CMP_TakeoverReview,
  CMP_Manifest, CMP_Export, CMP_ReportJobs, CMP_LegalHold, CMP_Regulator,
});
