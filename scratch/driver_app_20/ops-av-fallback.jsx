// ops-av-fallback.jsx — A4 · Ops Console AV fallback / passenger recovery / sandbox exceptions.
// EXTENDS Ops Console (red realm). SD §2.2/§10, flows §5. Reuses OPS_NAV/OPS_ACTOR + mgmt primitives.
// AV→human-driver fallback trigger & tracking · passenger ETA/service-status recovery · sandbox exception list.

// ── AV fallback monitor ──────────────────────────────────────────────────────
const FX_AV_FALLBACK = [
  { id: 'fb_0091', order: 'ord_88240', vehicle: 'AV-7732', stage: 'reassigning', reason: 'safety_takeover_persisted', since: '14:49', pax: '林小姐', eta: '8 分', sub: '安全員接管逾時，轉派人駕' },
  { id: 'fb_0090', order: 'ord_88228', vehicle: 'AV-7715', stage: 'human_enroute', reason: 'provider_degraded', since: '14:41', pax: '陳先生', eta: '5 分', sub: '人駕已接手前往' },
  { id: 'fb_0089', order: 'ord_88201', vehicle: 'AV-7708', stage: 'completed', reason: 'provider_unreachable', since: '14:10', pax: '王先生', eta: '—', sub: '人駕已完成接送' },
];
const fbStage = {
  triggered:     { zh: '已觸發', tone: 'danger', en: 'triggered' },
  reassigning:   { zh: '轉派中', tone: 'warn', en: 'reassigning' },
  human_enroute: { zh: '人駕前往', tone: 'info', en: 'human_enroute' },
  completed:     { zh: '已完成', tone: 'success', en: 'completed' },
};

function OC_AvFallback({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="av-fallback" breadcrumb={['AV Fallback', '轉人駕監控']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="AV → 人駕 Fallback" subtitle="自駕異常轉人駕觸發與追蹤 · 沙盒例外 · flows §5"
        tabs={[{ id: 'active', label: '進行中', badge: '2', tone: 'warn' }, { id: 'all', label: '全部', badge: '3' }]} activeTab="active"
        meta={<Pill theme={th} tone="danger" dot>2 件處理中</Pill>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Banner theme={th} tone="warn" icon="warn" title="AV fallback 為自動觸發 + 人工監看"
          body="當自駕車安全員接管逾時、供應商失聯或退出沙盒邊界，系統觸發 fallback 轉派人駕；Ops 監看轉派進度並安撫乘客，不直接控制 AV。" />
        {FX_AV_FALLBACK.map(f => (
          <Card theme={th} key={f.id} padding={0}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid ' + th.border }}>
              <span style={{ color: th.accent, fontWeight: 700, fontFamily: SHELL_MONO }}>{f.id}</span>
              <Pill theme={th} tone="neutral">{f.vehicle}</Pill>
              <span style={{ fontSize: 12, color: th.textMuted, fontFamily: SHELL_MONO }}>{f.order}</span>
              <span style={{ flex: 1 }} />
              <Pill theme={th} tone={fbStage[f.stage].tone} dot>{fbStage[f.stage].zh}</Pill>
            </div>
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
              <div>
                {/* fallback progress */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                  {['triggered', 'reassigning', 'human_enroute', 'completed'].map((s, i, a) => {
                    const order = ['triggered', 'reassigning', 'human_enroute', 'completed'];
                    const cur = order.indexOf(f.stage);
                    const done = i <= cur;
                    return (
                      <React.Fragment key={s}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 22, height: 22, borderRadius: 11, background: done ? th.accent : th.surfaceLo, color: done ? '#fff' : th.textDim, border: '1px solid ' + (done ? th.accent : th.border), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                          <span style={{ fontSize: 9.5, color: i === cur ? th.text : th.textDim, fontWeight: i === cur ? 700 : 500 }}>{fbStage[s].zh}</span>
                        </div>
                        {i < a.length - 1 && <span style={{ flex: 1, height: 2, background: i < cur ? th.accent : th.border, margin: '0 4px', marginBottom: 14 }} />}
                      </React.Fragment>
                    );
                  })}
                </div>
                <DL theme={th} cols={2} items={[
                  { k: '觸發原因', v: f.reason, mono: true }, { k: '觸發時間', v: f.since, mono: true },
                  { k: '乘客', v: f.pax, mono: false }, { k: '人駕 ETA', v: f.eta, mono: true },
                ]} />
                <div style={{ fontSize: 12, color: th.textMuted, marginTop: 6 }}>{f.sub}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ActionButton theme={th} descriptor={{ action: 'expedite_reassign', enabled: f.stage === 'reassigning', riskLevel: 'medium' }} label="加速轉派" en="expedite" />
                <ActionButton theme={th} descriptor={{ action: 'notify_passenger', enabled: f.stage !== 'completed', riskLevel: 'low' }} label="通知乘客" en="notify_pax" />
                <ActionButton theme={th} descriptor={{ action: 'open_incident', enabled: true, riskLevel: 'medium' }} label="關聯事故案件" en="incident" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

// ── Passenger recovery (ETA / service status updates) ────────────────────────
function OC_PassengerRecovery({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="av-fallback" breadcrumb={['AV Fallback', '乘客安撫']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="乘客安撫 · Passenger Recovery" subtitle="fallback 期間的 ETA / 服務狀態更新 · 乘客僅收服務狀態，不見 AV 內部" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="進行中安撫" subtitle="fb_0091 · 林小姐">
          <DL theme={th} cols={2} items={[
            { k: '訂單', v: 'ord_88240', mono: true }, { k: '狀態', v: <Pill theme={th} tone="warn" dot>轉派中</Pill> },
            { k: '原車', v: 'AV-7732', mono: true }, { k: '新 ETA', v: '8 分', mono: true },
          ]} />
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: th.textMuted, marginBottom: 8 }}>推送乘客的訊息（服務狀態 only）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['您的車輛正在重新安排，預計 8 分鐘內為您派新車。', true], ['造成不便敬請見諒，本趟車資將自動折抵。', false]].map(([m, sent], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 9, background: th.surfaceLo, border: '1px solid ' + th.border }}>
                  <MgmtIcon name="info" size={14} style={{ color: th.accent }} />
                  <span style={{ flex: 1, fontSize: 12.5 }}>{m}</span>
                  {sent ? <Pill theme={th} tone="success">已送</Pill> : <Btn theme={th} size="xs" variant="primary">推送</Btn>}
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card theme={th} title="乘客可見度" subtitle="passenger visibility">
          <Banner theme={th} tone="neutral" icon="lock" body="乘客端（passenger-web / 租戶 App）僅顯示『重新安排中 / 新 ETA / 折抵』等服務狀態文案，不顯示 AV 自駕、接管、供應商失聯等內部細節。" />
          <div style={{ marginTop: 12 }}>
            <DL theme={th} cols={1} items={[
              { k: '乘客看到', v: '重新安排中 · ETA 8 分', mono: false },
              { k: '不顯示', v: 'AV / 接管 / 供應商狀態', mono: false },
              { k: '折抵', v: '自動 · 本趟全額', mono: false },
            ]} />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// ── Sandbox exceptions list ──────────────────────────────────────────────────
function OC_SandboxExceptions({ theme: th }) {
  const rows = [
    { id: 'ex_212', type: 'boundary_exit', vehicle: 'AV-7741', t: '接近沙盒邊界', sev: 'warn', at: '14:55', state: 'open' },
    { id: 'ex_211', type: 'provider_unreachable', vehicle: 'AV-7708', t: 'Tesla 整合失聯', sev: 'danger', at: '14:52', state: 'fallback_triggered' },
    { id: 'ex_210', type: 'takeover_timeout', vehicle: 'AV-7732', t: '安全員接管逾時', sev: 'danger', at: '14:49', state: 'fallback_triggered' },
    { id: 'ex_209', type: 'reg_event_stale', vehicle: 'AV-7715', t: '監理事件鮮度過期', sev: 'warn', at: '14:41', state: 'monitoring' },
    { id: 'ex_208', type: 'schedule_window', vehicle: 'AV-7720', t: '接近核准時段結束', sev: 'info', at: '14:30', state: 'ack' },
  ];
  const stTone = { open: 'warn', fallback_triggered: 'danger', monitoring: 'info', ack: 'neutral' };
  return (
    <Shell theme={th} nav={OPS_NAV} active="av-fallback" breadcrumb={['AV Fallback', '沙盒例外']}
      env="production" actor={OPS_ACTOR} health={OPS_HEALTH} refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th} title="沙盒例外 · Sandbox Exceptions" subtitle="邊界 / 失聯 / 接管逾時 / 鮮度 / 時段 · 與既有派遣畫面整合"
        actions={<Btn theme={th} icon="filter">類型</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ID', k: 'id', w: 90, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '類型', k: 'type', w: 180, mono: true },
            { h: '車輛', k: 'vehicle', w: 96, mono: true },
            { h: '說明', k: 't', w: 170 },
            { h: '嚴重', w: 80, r: r => <Pill theme={th} tone={r.sev === 'danger' ? 'danger' : r.sev === 'warn' ? 'warn' : 'info'} dot>{r.sev}</Pill> },
            { h: '時間', k: 'at', w: 80, mono: true },
            { h: '狀態', w: 150, r: r => <Pill theme={th} tone={stTone[r.state]} dot>{r.state}</Pill> },
            { h: '', w: 90, r: r => r.state === 'fallback_triggered'
              ? <Btn theme={th} size="xs" variant="primary" icon="arrow-right">Fallback</Btn>
              : <Btn theme={th} size="xs" variant="ghost" icon="arrow-right">處理</Btn> },
          ]} rows={rows} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  FX_AV_FALLBACK, fbStage, OC_AvFallback, OC_PassengerRecovery, OC_SandboxExceptions,
});
