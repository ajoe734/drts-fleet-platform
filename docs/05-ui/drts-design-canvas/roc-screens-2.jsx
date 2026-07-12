// roc-screens-2.jsx — A1 ROC Console part 2: Trips · Vehicles · Vehicle Detail · Alerts ·
// Incidents · Evidence · Provider Health · Regulatory Reports · Shift Handover.

const FX_ROC_TRIPS = [
  { id: 'trip_88231', vehicle: 'AV-7720', route: '信義 → 南港', start: '14:05', state: 'on_trip', tko: 1, dist: '8.4km', so: '陳柏宇' },
  { id: 'trip_88240', vehicle: 'AV-7732', route: '南港 → 內湖', start: '14:40', state: 'takeover', tko: 1, dist: '3.1km', so: '吳明翰' },
  { id: 'trip_88228', vehicle: 'AV-7715', route: '信義 → 信義', start: '13:50', state: 'on_trip', tko: 0, dist: '5.0km', so: '林佳蓉' },
  { id: 'trip_88210', vehicle: 'AV-7741', route: '信義 → 南港', start: '13:20', state: 'completed', tko: 2, dist: '9.2km', so: '黃志明' },
];
const FX_ROC_INCIDENTS = [
  { id: 'inc_0214', vehicle: 'AV-7732', level: 'L2', t: '行人緊急煞停接管', at: '14:48', state: '待通報', tko: 'tko_0215' },
];
const FX_ROC_EVIDENCE = [
  { name: 'front_cam_1432.mp4', vehicle: 'AV-7720', src: 'device_recorded', dur: '02:14', state: 'sealed', hash: '9f2a…7c41' },
  { name: 'tesla_event_log.json', vehicle: 'AV-7732', src: 'not_exposed_by_provider', dur: '—', state: 'unavailable', hash: '—' },
  { name: 'cabin_cam_1448.mp4', vehicle: 'AV-7732', src: 'device_recorded', dur: '01:50', state: 'uploading', hash: 'pending' },
  { name: 'so_report_0215.pdf', vehicle: 'AV-7732', src: 'operator_reported', dur: '—', state: 'sealed', hash: '3b81…22aa' },
];
const FX_PROVIDER = [
  { k: 'Tesla Regulatory Data Interface', v: 'degraded', detail: 'AV-7708 provider_unreachable · 6m', tone: 'warn' },
  { k: 'Telemetry stream', v: 'healthy', detail: '4 / 5 車輛 fresh', tone: 'success' },
  { k: 'Evidence recorder uplink', v: 'healthy', detail: '上傳佇列 1', tone: 'success' },
  { k: 'Regulatory-event feed', v: 'degraded', detail: '2 車 stale > 60s', tone: 'warn' },
];

// ── 3 · Trips ────────────────────────────────────────────────────────────────
function ROC_Trips({ theme: th }) {
  return (
    <RocShell theme={th} active="trips" breadcrumb={['行程']}>
      <PageHeader theme={th} title="行程 · Trips" subtitle="沙盒行程 · 含接管次數" actions={<Btn theme={th} icon="export">匯出</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'TRIP', k: 'id', w: 130, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '車輛', k: 'vehicle', w: 96, mono: true },
            { h: '路線', k: 'route', w: 160 },
            { h: '起', k: 'start', w: 70, mono: true },
            { h: '里程', k: 'dist', w: 80, mono: true },
            { h: '接管', w: 70, align: 'center', r: r => <Pill theme={th} tone={r.tko ? 'warn' : 'neutral'}>{r.tko}</Pill> },
            { h: '安全員', k: 'so', w: 90 },
            { h: '狀態', w: 100, r: r => <Pill theme={th} tone={rocStateMeta(r.state).tone} dot>{r.state === 'completed' ? '已完成' : rocStateMeta(r.state).zh}</Pill> },
          ]} rows={FX_ROC_TRIPS} />
        </Card>
      </div>
    </RocShell>
  );
}

// ── 4 · Vehicles ─────────────────────────────────────────────────────────────
function ROC_Vehicles({ theme: th }) {
  return (
    <RocShell theme={th} active="vehicles" breadcrumb={['車輛']}>
      <PageHeader theme={th} title="車輛 · Vehicles" subtitle="沙盒登錄車輛 · Tesla 整合狀態 · 雙鮮度" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '車輛', k: 'id', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '車型', k: 'model', w: 90 },
            { h: '狀態', w: 96, r: r => <Pill theme={th} tone={rocStateMeta(r.state).tone} dot>{rocStateMeta(r.state).zh}</Pill> },
            { h: 'Tesla 整合', w: 150, r: r => <Pill theme={th} tone={r.integ === 'connected' ? 'success' : r.integ === 'degraded' ? 'warn' : 'danger'} dot>{r.integ}</Pill> },
            { h: 'telemetry', w: 96, r: r => <span style={{ fontSize: 11, fontWeight: 600, color: th[freshMeta(r.teleFresh).tone] }}>{freshMeta(r.teleFresh).zh}</span> },
            { h: '監理事件', w: 96, r: r => <span style={{ fontSize: 11, fontWeight: 600, color: th[freshMeta(r.regFresh).tone] }}>{freshMeta(r.regFresh).zh}</span> },
            { h: '安全員', k: 'so', w: 80 },
            { h: '', w: 70, r: () => <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">詳情</Btn> },
          ]} rows={FX_ROC_VEHICLES} />
        </Card>
      </div>
    </RocShell>
  );
}

// ── 5 · Vehicle Detail ───────────────────────────────────────────────────────
function ROC_VehicleDetail({ theme: th }) {
  const v = FX_ROC_VEHICLES[0];
  return (
    <RocShell theme={th} active="vehicles" breadcrumb={['車輛', v.id]}>
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{v.id} · {v.model}<Pill theme={th} tone={rocStateMeta(v.state).tone} dot>{rocStateMeta(v.state).zh}</Pill></span>}
        subtitle={'sandbox vehicle · ' + v.area + ' · 安全員 ' + v.so}
        meta={<Pill theme={th} tone="roc" dot>監看唯讀</Pill>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="鮮度 · freshness（分離指標）">
            <DualFresh theme={th} tele={v.teleFresh} teleAge={v.teleAge} reg={v.regFresh} regAge={v.regAge} />
            <div style={{ marginTop: 12 }}><Banner theme={th} tone="warn" icon="warn" body="監理事件鮮度 stale 48s — 原廠事件饋送延遲，不可用 telemetry 推估監理事件。" /></div>
          </Card>
          <Card theme={th} title="允許顯示範圍" subtitle="approved overlay only">
            <DL theme={th} cols={2} items={[
              { k: '核准區域', v: '信義沙盒區', mono: false },
              { k: '核准路線', v: 'R-信義-01', mono: true },
              { k: '當前狀態', v: '自駕中 autonomous' },
              { k: '時速', v: v.speed + ' km/h', mono: true },
            ]} />
            <div style={{ marginTop: 10 }}><Banner theme={th} tone="neutral" icon="lock" body="不顯示：方向盤角度、加減速踏板、FSD 感知物件、路側設備 (RSU) 健康。" /></div>
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Tesla 整合" subtitle="regulatory data interface">
            <DL theme={th} cols={1} items={[
              { k: '整合狀態', v: <Pill theme={th} tone="success" dot>connected</Pill> },
              { k: 'schema 版本', v: 'v1.2 (capability)', mono: true },
              { k: '事故影像', v: '原廠未提供 · gated', mono: false },
            ]} />
            <div style={{ marginTop: 8 }}><EvTag theme={th} src="tesla_provided" /></div>
          </Card>
          <Card theme={th} title="可用操作" subtitle="availableActions · 無遠端駕駛">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionButton theme={th} descriptor={{ action: 'flag_for_review', enabled: true, riskLevel: 'low' }} label="標記待查" en="flag" />
              <ActionButton theme={th} descriptor={{ action: 'request_fallback', enabled: true, riskLevel: 'high', requiresReason: true }} label="要求轉人駕 fallback" en="fallback" />
              <ActionButton theme={th} descriptor={{ action: 'remote_drive', enabled: false, disabledReasonCode: 'no_remote_driving_in_sandbox', riskLevel: 'high' }} label="遠端駕駛" en="remote_drive" />
            </div>
            <div style={{ fontSize: 10.5, color: th.textDim, marginTop: 9 }}>遠端駕駛永遠停用：沙盒不提供遠端駕駛控制。</div>
          </Card>
        </div>
      </div>
    </RocShell>
  );
}

// ── 7 · Alerts ───────────────────────────────────────────────────────────────
function ROC_Alerts({ theme: th }) {
  return (
    <RocShell theme={th} active="alerts" breadcrumb={['警示']}>
      <PageHeader theme={th} title="警示 · Alerts" subtitle="鮮度過期 / 整合失聯 / 邊界 / 接管頻率" actions={<Btn theme={th} icon="filter">等級</Btn>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FX_ROC_ALERTS.map(a => (
          <Card theme={th} key={a.id} padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: a.sev === 'danger' ? th.dangerBg : a.sev === 'warn' ? th.warnBg : th.infoBg, color: a.sev === 'danger' ? th.danger : a.sev === 'warn' ? th.warn : th.info, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MgmtIcon name={a.sev === 'danger' ? 'incidents' : 'warn'} size={17} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.t}</div>
                <div style={{ fontSize: 12, color: th.textMuted }}>{a.detail}</div>
              </div>
              <EvTag theme={th} src={a.src} />
              <span style={{ fontSize: 12, fontFamily: SHELL_MONO, color: th.textDim }}>{a.at}</span>
              <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">處理</Btn>
            </div>
          </Card>
        ))}
      </div>
    </RocShell>
  );
}

// ── 8 · Incidents ────────────────────────────────────────────────────────────
function ROC_Incidents({ theme: th }) {
  return (
    <RocShell theme={th} active="incidents" breadcrumb={['事故']}>
      <PageHeader theme={th} title="事故 · Incidents" subtitle="沙盒事故案件 · 通報時限由核准條件決定（policy-driven）"
        actions={<Btn theme={th} variant="primary" icon="plus">建立案件</Btn>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Banner theme={th} tone="warn" icon="warn" title="1 件待通報 · L2"
          body="通報時限為 policy 佔位（示意 1 小時內初報 / 10 日內結報），實際時限待主管機關核准函確認。" />
        {FX_ROC_INCIDENTS.map(inc => (
          <Card theme={th} key={inc.id} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{inc.id} · {inc.t}<Pill theme={th} tone="danger">{inc.level}</Pill></span>}
            subtitle={inc.vehicle + ' · ' + inc.at + ' · 來源接管 ' + inc.tko}
            actions={<Pill theme={th} tone="warn" dot>{inc.state}</Pill>}>
            <DL theme={th} cols={3} items={[
              { k: '車輛', v: inc.vehicle, mono: true }, { k: '等級', v: inc.level }, { k: '關聯接管', v: inc.tko, mono: true },
              { k: '初報時限', v: '≤ 1 小時 (policy)', mono: false }, { k: '結報時限', v: '≤ 10 日 (policy)', mono: false }, { k: '證據', v: '3 件 · 1 原廠未提供' },
            ]} />
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <Btn theme={th} size="sm" variant="primary" icon="ext">前往調查 (Compliance)</Btn>
              <Btn theme={th} size="sm" icon="audit">證據清單</Btn>
            </div>
          </Card>
        ))}
      </div>
    </RocShell>
  );
}

// ── 9 · Evidence ─────────────────────────────────────────────────────────────
function ROC_Evidence({ theme: th }) {
  const stTone = { sealed: 'success', uploading: 'info', unavailable: 'neutral' };
  const stZh = { sealed: '已封存', uploading: '上傳中', unavailable: '原廠未提供' };
  return (
    <RocShell theme={th} active="evidence" breadcrumb={['證據']}>
      <PageHeader theme={th} title="證據 · Evidence" subtitle="每筆標記來源 · 封存雜湊 · 原廠未提供明確標示" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '檔案', k: 'name', w: 200, mono: true },
            { h: '車輛', k: 'vehicle', w: 90, mono: true },
            { h: '來源', w: 170, r: r => <EvTag theme={th} src={r.src} /> },
            { h: '時長', k: 'dur', w: 80, mono: true },
            { h: 'SHA', k: 'hash', w: 100, mono: true },
            { h: '狀態', w: 120, r: r => <Pill theme={th} tone={stTone[r.state]} dot>{stZh[r.state]}</Pill> },
            { h: '', w: 80, r: r => r.state === 'unavailable' ? <span style={{ fontSize: 11, color: th.textDim }}>—</span> : <Btn theme={th} size="xs" variant="ghost" icon="eye">檢視</Btn> },
          ]} rows={FX_ROC_EVIDENCE} />
        </Card>
      </div>
    </RocShell>
  );
}

// ── 10 · Provider Health ─────────────────────────────────────────────────────
function ROC_Provider({ theme: th }) {
  return (
    <RocShell theme={th} active="provider" breadcrumb={['供應商健康']}>
      <PageHeader theme={th} title="供應商健康 · Provider Health" subtitle="Tesla 整合 / telemetry / 監理事件饋送 / 證據上傳" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {FX_PROVIDER.map((p, i) => (
          <Card theme={th} key={i} padding={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: th[p.tone] }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.k}</div>
                <div style={{ fontSize: 11.5, color: th.textMuted }}>{p.detail}</div>
              </div>
              <Pill theme={th} tone={p.tone} dot>{p.v}</Pill>
            </div>
          </Card>
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <Banner theme={th} tone="neutral" icon="info" body="缺值能力（事故影像、SLA 實值、schema 版本流程）以 capability profile gated / fail-closed 處理，待 Tesla 契約到位。" />
        </div>
      </div>
    </RocShell>
  );
}

// ── 11 · Regulatory Reports ──────────────────────────────────────────────────
function ROC_Reports({ theme: th }) {
  const reports = [
    { id: 'reg_2026w25', t: '週監理報表', period: '2026-W25', status: 'due', trips: 284, tko: 41, inc: 2 },
    { id: 'reg_2026w24', t: '週監理報表', period: '2026-W24', status: 'submitted', trips: 261, tko: 38, inc: 1 },
    { id: 'reg_2026m05', t: '月運行摘要', period: '2026-05', status: 'submitted', trips: 1102, tko: 168, inc: 5 },
  ];
  const stTone = { due: 'warn', submitted: 'success', draft: 'neutral' };
  return (
    <RocShell theme={th} active="reports" breadcrumb={['監理報表']} refreshTier="manual">
      <PageHeader theme={th} title="監理報表 · Regulatory Reports" subtitle="向主管機關提交 · 趟次 / 接管 / 事故口徑固定"
        actions={<Btn theme={th} variant="primary" icon="export">產生報表</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ID', k: 'id', w: 150, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '報表', k: 't', w: 130 },
            { h: '期間', k: 'period', w: 110, mono: true },
            { h: '趟次', k: 'trips', w: 80, mono: true, align: 'right' },
            { h: '接管', k: 'tko', w: 70, mono: true, align: 'right' },
            { h: '事故', k: 'inc', w: 70, mono: true, align: 'right' },
            { h: '狀態', w: 110, r: r => <Pill theme={th} tone={stTone[r.status]} dot>{r.status}</Pill> },
            { h: '', w: 100, r: () => <Btn theme={th} size="xs" variant="ghost" icon="download">下載</Btn> },
          ]} rows={reports} />
        </Card>
      </div>
    </RocShell>
  );
}

// ── 12 · Shift Handover ──────────────────────────────────────────────────────
function ROC_Handover({ theme: th }) {
  return (
    <RocShell theme={th} active="handover" breadcrumb={['交班']}>
      <PageHeader theme={th} title="交班 · Shift Handover" subtitle="ROC 值班交接 · 未結處置移交"
        actions={<Btn theme={th} variant="primary" icon="check">確認交班</Btn>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="未結處置 · open items" padding={0}>
          <Table theme={th} columns={[
            { h: '項目', w: 200, r: r => r.t },
            { h: '車輛', k: 'v', w: 90, mono: true },
            { h: '狀態', w: 120, r: r => <Pill theme={th} tone={r.tone} dot>{r.s}</Pill> },
          ]} rows={[
            { t: '接管 tko_0216 待研判', v: 'AV-7715', s: 'pending', tone: 'warn' },
            { t: '事故 inc_0214 待通報', v: 'AV-7732', s: 'L2', tone: 'danger' },
            { t: 'AV-7708 整合失聯追蹤', v: 'AV-7708', s: 'tracking', tone: 'warn' },
            { t: '證據 cabin_cam 上傳中', v: 'AV-7732', s: 'uploading', tone: 'info' },
          ]} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="本班摘要">
            <DL theme={th} cols={2} items={[
              { k: '值班', v: '徐文凱', mono: false }, { k: '時長', v: '8h', mono: true },
              { k: '監控車輛', v: '5', mono: true }, { k: '接管處置', v: '3', mono: true },
              { k: '警示', v: '5', mono: true }, { k: '事故', v: '1', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="交班對象">
            <DL theme={th} cols={1} items={[{ k: '接班', v: '葉俊賢 · roc_operator' }, { k: '生效', v: '18:00', mono: true }]} />
            <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid ' + th.border, borderRadius: 8, minHeight: 44, fontSize: 12.5, color: th.textDim }}>交班備註：AV-7708 整合持續異常，請優先追蹤…</div>
          </Card>
        </div>
      </div>
    </RocShell>
  );
}

Object.assign(window, {
  ROC_Trips, ROC_Vehicles, ROC_VehicleDetail, ROC_Alerts, ROC_Incidents,
  ROC_Evidence, ROC_Provider, ROC_Reports, ROC_Handover,
});
