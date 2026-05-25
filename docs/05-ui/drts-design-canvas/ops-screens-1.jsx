// ops-screens.jsx — Ops Console: 20 routes per packet § 4.1
// Authority-aware: availableActions drives CTAs; bilingual labels; refresh tier per page; multi-board dispatch.

// ── Nav per packet § 4.1 ────────────────────────────────────────────────────
const OPS_NAV = [
  { divider: '工作面 · Workspace' },
  { key: 'dashboard',  icon: 'dashboard',   label: '儀表板 · Dashboard' },
  { divider: '即時派遣 · Live Ops' },
  { key: 'dispatch',   icon: 'dispatch',    label: '派車調度 · Dispatch', badge: '23', badgeTone: 'accent' },
  { key: 'callcenter', icon: 'callcenter',  label: '客服中心 · Callcenter' },
  { divider: '案件處理 · Casework' },
  { key: 'complaints', icon: 'complaints',  label: '客訴 · Complaints', badge: '3', badgeTone: 'danger' },
  { key: 'incidents',  icon: 'incidents',   label: '事故 · Incidents', badge: '2', badgeTone: 'danger' },
  { key: 'approvals',  icon: 'approval',    label: '審批佇列 · Approval Requests', badge: '5', badgeTone: 'warn' },
  { divider: '營運監控 · Monitoring' },
  { key: 'reports',    icon: 'reports',     label: '報表 · Reports' },
  { key: 'revenue',    icon: 'revenue',     label: '收益 · Revenue Review' },
  { key: 'attendance', icon: 'attendance',  label: '出勤 · Attendance' },
  { key: 'maintenance',icon: 'maintenance', label: '維修保養 · Maintenance' },
  { divider: '主資料 · Registry' },
  { key: 'drivers',    icon: 'fleet',       label: '司機 · Drivers' },
  { key: 'vehicles',   icon: 'vehicles',    label: '車輛 · Vehicles' },
  { key: 'contracts',  icon: 'contracts',   label: '合約 · Contracts' },
  { key: 'flags',      icon: 'flags',       label: '功能旗標 · Feature Flags' },
];

const OPS_HEALTH = {
  status: 'degraded', lastCheckedAt: '4s',
  degradedServices: [{ service: 'gocab-v1', impact: 'forwarded webhook delivery', severity: 'warning' }],
};
const OPS_ACTOR = { name: 'WF', display: '王芳', role: 'ops_manager' };

// ─────────────────────────────────────────────────────────────────────────────
// 1. /dashboard — Operations Dashboard (T3 medium)
// ─────────────────────────────────────────────────────────────────────────────
function OC_Dashboard({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="dashboard"
      breadcrumb={['儀表板']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh"
      healthBanner={<HealthBanner theme={th} {...OPS_HEALTH} />}>
      <PageHeader theme={th}
        title="營運總覽"
        subtitle="2026-05-25 (週一) · 晚班 14:00–22:00 · 早晚交接 17:30"
        meta={<BiLabel theme={th} zh="即時派遣" en="dispatch" size={11} />}
        actions={<>
          <Btn theme={th} icon="ext">值班手冊</Btn>
          <Btn theme={th} variant="primary" icon="phone">開新 call session</Btn>
        </>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          <Kpi theme={th} label="進行中訂單"     en="in_progress" value="217" delta="↑ 18" deltaTone="up" />
          <Kpi theme={th} label="派遣佇列"       en="dispatch_queue" value="23" delta="3 broadcasting" deltaTone="neutral" />
          <Kpi theme={th} label="可派司機"       en="available_drivers" value="146" sub="884 在班" />
          <Kpi theme={th} label="位置失聯"       en="stale_location" value="4" delta="> 5 min" deltaTone="down" />
          <Kpi theme={th} label="客訴未結"       en="open_complaints" value="3" delta="2 SLA breach" deltaTone="down" />
          <Kpi theme={th} label="事故進行中"     en="in_response" value="2" delta="1 critical" deltaTone="down" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <Card theme={th} title="今日待處理" subtitle="critical → SLA breach → blocking"
            actions={<Btn theme={th} variant="ghost">展開所有</Btn>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Banner theme={th} tone="danger" icon="warn"
                title={<>inc_0214 · 司機 SOS · <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>critical</span></>}
                body="d_8843 在台北信義區忠孝東路五段，乘客醉酒衝突。安全主管已接通。"
                actions={<Btn theme={th} variant="primary">前往事故</Btn>} />
              <Banner theme={th} tone="warn" icon="warn"
                title={<>ord_8234 · 陽明山 · 連續 12 分鐘無供給 <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>no_supply</span></>}
                body="台北山區晚間 standard 派遣覆蓋率不足。建議改派 business 或人工協調。"
                actions={<Btn theme={th} variant="secondary">處理 no_supply</Btn>} />
              <Banner theme={th} tone="warn" icon="warn"
                title={<>gocab-v1 forwarded · sync_failed 4.2%</>}
                body="adapter latency 780 ms。建議檢查 adapter 狀態並轉 manual fallback。"
                actions={<Btn theme={th} variant="secondary" icon="ext">查看 forwarded board</Btn>} />
            </div>
          </Card>

          <Card theme={th} title="健康訊號" subtitle="UiHealthEnvelope · cross-app deps">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { t: 'dispatch lag p95', v: '2.4 s', tone: 'success' },
                { t: 'webhook delivery p95', v: '410 ms', tone: 'warn' },
                { t: 'forwarder · srx-v3', v: 'healthy', tone: 'success' },
                { t: 'forwarder · gocab-v1', v: 'degraded', tone: 'warn' },
                { t: 'BGMT 派遣回報', v: 'pending_renewal', tone: 'danger' },
              ].map((x, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: th.surfaceLo }}>
                  <Pill theme={th} tone={x.tone} dot>{x.v}</Pill>
                  <span style={{ fontSize: 12, flex: 1, color: th.text }}>{x.t}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card theme={th} title="當前 dispatch 隊列 · top 5" actions={<Btn theme={th} variant="ghost">前往派遣</Btn>} padding={0}>
          <Table theme={th} columns={[
            { h: 'ORDER', k: 'id', w: 100, mono: true },
            { h: 'TENANT', k: 'tenant', w: 130, mono: true },
            { h: 'PICKUP', k: 'pickup' },
            { h: 'WIN', k: 'win', w: 110, mono: true },
            { h: 'STATE', w: 140, r: r => <Pill theme={th} tone={r.state === 'assigned' ? 'success' : r.state === 'no_supply' ? 'danger' : r.state === 'override_pending' ? 'warn' : 'info'} dot>{r.state}</Pill> },
            { h: 'DRIVER', k: 'driver', w: 100, mono: true },
            { h: 'ETA', k: 'eta', w: 80, mono: true },
          ]} rows={FX_DISPATCH_OWNED.slice(0, 5)} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. /dispatch — multi-board landing (Q-OPS06): 6 sub-boards as peers
// ─────────────────────────────────────────────────────────────────────────────
const OPS_BOARDS = [
  { id: 'ready',         label: 'Ready queue',         zh: '待派遣',         count: 6,  tone: 'accent' },
  { id: 'assigned',      label: 'Assigned',             zh: '已指派',         count: 11, tone: 'success' },
  { id: 'exception',     label: 'Exception hold',       zh: '例外保留',       count: 1,  tone: 'warn' },
  { id: 'no_supply',     label: 'No eligible supply',   zh: '無可用司機',     count: 1,  tone: 'danger' },
  { id: 'governance',    label: 'Governance blocked',   zh: '需審批',         count: 1,  tone: 'warn' },
  { id: 'forwarded',     label: 'Forwarded mirror',     zh: '外部鏡像',       count: 4,  tone: 'info' },
];

function OC_Dispatch({ theme: th, board = 'ready' }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch"
      breadcrumb={['即時派遣', '派車調度']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th}
        title="派車調度"
        subtitle="即時派車工作流 · 6 個子看板 · queue / candidates / ETA / override"
        actions={<>
          <Btn theme={th} icon="filter">服務 bucket</Btn>
          <Btn theme={th} icon="refresh">重整</Btn>
        </>} />

      {/* Multi-board sub-nav (peer pills, not chips) */}
      <div style={{ padding: '14px 24px 0', borderBottom: '1px solid ' + th.border, background: th.bg, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {OPS_BOARDS.map(b => {
          const on = b.id === board;
          return (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 11px 8px',
              borderBottom: '2px solid ' + (on ? th.accent : 'transparent'),
              marginBottom: -1, cursor: 'default',
              color: on ? th.text : th.textMuted, fontWeight: on ? 600 : 500, fontSize: 12.5,
            }}>
              <Pill theme={th} tone={b.tone} dot={on}>{b.count}</Pill>
              <BiLabel theme={th} zh={b.zh} en={b.label} size={12.5} />
            </div>
          );
        })}
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Banner theme={th} tone="warn" icon="warn"
          title="gocab-v1 adapter degraded · forwarded mirror 影響中"
          body="近 24h sync_failed 4.2%。已開啟 dispatch.compliance.license_warn_30d 觀察 manual fallback 量。"
          actions={<Btn theme={th} variant="secondary" icon="ext">查看 adapter (new tab)</Btn>} />

        {board === 'ready' && <OPS_BoardReady theme={th} />}
        {board === 'assigned' && <OPS_BoardAssigned theme={th} />}
        {board === 'exception' && <OPS_BoardException theme={th} />}
        {board === 'no_supply' && <OPS_BoardNoSupply theme={th} />}
        {board === 'governance' && <OPS_BoardGovernance theme={th} />}
        {board === 'forwarded' && <OPS_BoardForwarded theme={th} />}
      </div>
    </Shell>
  );
}

function OPS_BoardReady({ theme: th }) {
  const ready = FX_DISPATCH_OWNED.filter(o => ['broadcasting', 'queued'].includes(o.state));
  return (
    <Card theme={th} title={<><BiLabel theme={th} zh="待派遣" en="Ready queue" size={13} /> · {ready.length} 筆</>} padding={0}>
      <Table theme={th} columns={[
        { h: 'ORDER', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
        { h: 'TENANT', k: 'tenant', w: 140, mono: true },
        { h: 'PICKUP → DROP', w: 360, r: r => (
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 1 }}>
            <span>{r.pickup}</span>
            <span style={{ color: th.textDim, fontSize: 11 }}>↓ {r.drop}</span>
          </div>
        )},
        { h: 'WIN', k: 'win', w: 120, mono: true },
        { h: 'SERVICE', k: 'service', w: 100, mono: true },
        { h: 'STATE', w: 130, r: r => <Pill theme={th} tone={r.state === 'broadcasting' ? 'info' : 'neutral'} dot>{r.state}</Pill> },
        { h: 'ETA', k: 'eta', w: 80, mono: true },
        { h: 'CAND', k: 'candidates', w: 60, mono: true, align: 'right' },
        { h: 'GATE', w: 140, r: r => r.gates === 'ok' ? <Pill theme={th} tone="success">ok</Pill> : <Pill theme={th} tone="warn" dot>{r.gates}</Pill> },
        { h: 'ACTIONS', w: 170, r: r => (
          <div style={{ display: 'flex', gap: 4 }}>
            <ActionButton theme={th} size="xs" descriptor={{ action: 'assign', enabled: true, riskLevel: 'medium' }} label="指派" en="assign" />
            <ActionButton theme={th} size="xs" descriptor={{ action: 'redispatch', enabled: true, riskLevel: 'medium' }} label="改派" en="redispatch" />
          </div>
        )},
      ]} rows={ready} />
    </Card>
  );
}

function OPS_BoardAssigned({ theme: th }) {
  const assigned = FX_DISPATCH_OWNED.filter(o => o.state === 'assigned');
  return (
    <Card theme={th} title={<><BiLabel theme={th} zh="已指派" en="Assigned" size={13} /> · {assigned.length} 筆</>} padding={0}>
      <Table theme={th} columns={[
        { h: 'ORDER', k: 'id', w: 110, mono: true },
        { h: 'TENANT', k: 'tenant', w: 140, mono: true },
        { h: 'DRIVER / VEHICLE', w: 180, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11.5 }}>{r.driver} / ARJ-{r.id.slice(-3)}</span> },
        { h: 'DRIVER TASK STATE', w: 160, r: () => <Pill theme={th} tone="success" dot>on_trip</Pill> },
        { h: 'ETA', k: 'eta', w: 90, mono: true },
        { h: 'GATE', w: 100, r: () => <Pill theme={th} tone="success">ok</Pill> },
        { h: 'ACTIONS', w: 220, r: () => (
          <div style={{ display: 'flex', gap: 4 }}>
            <ActionButton theme={th} size="xs" descriptor={{ action: 'release', enabled: true, riskLevel: 'medium' }} label="放開" en="release" />
            <ActionButton theme={th} size="xs" descriptor={{ action: 'redispatch', enabled: false, disabledReasonCode: 'on_trip', riskLevel: 'medium' }} label="改派" en="redispatch" />
            <ActionButton theme={th} size="xs" descriptor={{ action: 'cancel', enabled: true, riskLevel: 'high', requiresReason: true }} label="取消" en="cancel" />
          </div>
        )},
      ]} rows={assigned} />
    </Card>
  );
}

function OPS_BoardException({ theme: th }) {
  return (
    <Card theme={th} title={<><BiLabel theme={th} zh="例外保留" en="Exception hold" size={13} /> · 1 筆</>}
      subtitle="必須清除 hold 才能重新進入隊列" padding={0}>
      <Table theme={th} columns={[
        { h: 'ORDER', w: 110, mono: true, r: () => 'ord_8198' },
        { h: 'TENANT', w: 140, mono: true, r: () => 'YAMATO' },
        { h: 'HOLD REASON', w: 220, r: () => <Pill theme={th} tone="warn" dot>passenger_no_show</Pill> },
        { h: 'HOLD OWNER', w: 120, r: () => '王芳 (ops_manager)' },
        { h: 'AGE', w: 80, mono: true, r: () => '8 min' },
        { h: 'RELATED', w: 180, r: () => <a style={{ color: th.accent }}>cmp_0912 →</a> },
        { h: 'ACTIONS', w: 200, r: () => (
          <div style={{ display: 'flex', gap: 4 }}>
            <ActionButton theme={th} size="xs" descriptor={{ action: 'resolve_hold', enabled: true, riskLevel: 'medium' }} label="解除" en="resolve" />
            <ActionButton theme={th} size="xs" descriptor={{ action: 'escalate', enabled: true, riskLevel: 'high', requiresReason: true }} label="升級事故" en="escalate" />
          </div>
        )},
      ]} rows={[{}]} />
    </Card>
  );
}

function OPS_BoardNoSupply({ theme: th }) {
  const ord = FX_DISPATCH_OWNED.find(o => o.state === 'no_supply');
  return (
    <>
      <Banner theme={th} tone="danger" icon="warn"
        title="陽明山國家公園 · 山區晚間覆蓋不足"
        body="本訂單已嘗試 9 名候選 0 通過 gate；建議擴大搜尋半徑、改派 business 車型或啟動人工協調。" />
      <Card theme={th} title={<><BiLabel theme={th} zh="無可用司機" en="No eligible supply" size={13} /> · 1 筆</>} padding={0}>
        <Table theme={th} columns={[
          { h: 'ORDER', k: 'id', w: 110, mono: true },
          { h: 'TENANT', k: 'tenant', w: 140, mono: true },
          { h: 'PICKUP', k: 'pickup', w: 220 },
          { h: 'WIN', k: 'win', w: 120, mono: true },
          { h: 'ATTEMPTS', w: 90, mono: true, r: () => '9 trials' },
          { h: 'REASON CODE', w: 160, r: () => <Pill theme={th} tone="danger" dot>radius_exceeded</Pill> },
          { h: 'AGE', w: 80, mono: true, r: () => '12 min' },
          { h: 'ACTIONS', w: 240, r: () => (
            <div style={{ display: 'flex', gap: 4 }}>
              <ActionButton theme={th} size="xs" descriptor={{ action: 'extend', enabled: true, riskLevel: 'medium' }} label="擴大半徑" en="extend" />
              <ActionButton theme={th} size="xs" descriptor={{ action: 'manual', enabled: true, riskLevel: 'medium' }} label="人工協調" en="manual" />
              <ActionButton theme={th} size="xs" descriptor={{ action: 'cancel', enabled: true, riskLevel: 'high', requiresReason: true }} label="取消" en="cancel" />
            </div>
          )},
        ]} rows={[ord]} />
      </Card>
    </>
  );
}

function OPS_BoardGovernance({ theme: th }) {
  return (
    <>
      <Banner theme={th} tone="warn" icon="warn"
        title="需平台審批 · /approval-requests"
        body="此訂單已暫停派遣，等候 ops_approval_triage 處理 fare override 請求。" />
      <Card theme={th} title={<><BiLabel theme={th} zh="需審批" en="Governance blocked" size={13} /> · 1 筆</>} padding={0}>
        <Table theme={th} columns={[
          { h: 'ORDER', w: 110, mono: true, r: () => 'ord_8245' },
          { h: 'TENANT', w: 140, mono: true, r: () => 'CTBC_BIZ' },
          { h: 'OVERRIDE TYPE', w: 180, r: () => <Pill theme={th} tone="warn" dot>fare_override</Pill> },
          { h: 'REQUESTER', w: 130, r: () => '林志偉 (driver)' },
          { h: 'AGE', w: 80, mono: true, r: () => '4 min' },
          { h: 'LINK', w: 240, r: () => <a style={{ color: th.accent, display: 'inline-flex', alignItems: 'center', gap: 4 }}>→ approval_request ar_0091<MgmtIcon name="ext" size={11} /></a> },
        ]} rows={[{}]} />
      </Card>
    </>
  );
}

function OPS_BoardForwarded({ theme: th }) {
  return (
    <Card theme={th} title={<><BiLabel theme={th} zh="外部鏡像" en="Forwarded mirror" size={13} /> · {FX_DISPATCH_FORWARDED.length} 筆</>}
      subtitle="不可假裝為 owned；發生問題時建立 reconciliation issue" padding={0}>
      <Table theme={th} columns={[
        { h: 'MIRROR ID', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
        { h: 'SOURCE', k: 'source', w: 140 },
        { h: 'EXTERNAL', k: 'external', w: 160, mono: true },
        { h: 'PICKUP → DROP', w: 340, r: r => (
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 1 }}>
            <span>{r.pickup}</span>
            <span style={{ color: th.textDim, fontSize: 11 }}>↓ {r.drop}</span>
          </div>
        )},
        { h: 'STATE', w: 200, r: r => <Pill theme={th} tone={['sync_failed', 'manual_fallback_required'].includes(r.state) ? 'danger' : r.state === 'lost_race' ? 'warn' : 'info'} dot>{r.state}</Pill> },
        { h: 'ADAPTER', k: 'adapter', w: 110, mono: true, r: r => <Pill theme={th} tone={r.adapter === 'gocab-v1' ? 'warn' : 'success'}>{r.adapter}</Pill> },
        { h: 'MISMATCH', k: 'mismatch', mono: true },
      ]} rows={FX_DISPATCH_FORWARDED} />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. /dispatch/[workItemId] — per-work-item workspace (owned + forwarded)
// ─────────────────────────────────────────────────────────────────────────────
function OC_DispatchDetail({ theme: th, domain = 'owned' }) {
  const o = domain === 'owned' ? FX_DISPATCH_OWNED[2] : FX_DISPATCH_FORWARDED[2];
  const wid = domain === 'owned' ? o.id : o.id;
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch"
      breadcrumb={['派車調度', wid]} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span>{wid}</span>
            <Pill theme={th} tone={domain === 'forwarded' ? 'info' : 'accent'}>{domain === 'forwarded' ? 'FORWARDED' : 'OWNED'}</Pill>
          </span>
        }
        subtitle={
          domain === 'owned'
            ? `${o.tenant} · ${o.pickup}  →  ${o.drop}  ·  ${o.win}`
            : `${o.source} · ${o.external} · ${o.pickup}  →  ${o.drop}  ·  ${o.win}`
        }
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'phone', enabled: true, riskLevel: 'low' }} icon="phone" label="聯絡乘客" en="call" />
          <ActionButton theme={th} descriptor={{ action: 'fare_override', enabled: true, riskLevel: 'high', requiresReason: true }} icon="warn" label="fare override" en="request" />
          <ActionButton theme={th} descriptor={{ action: 'assign', enabled: true, riskLevel: 'medium' }} icon="check" label="指派候選 #1" en="assign" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {domain === 'forwarded' && (
            <Banner theme={th} tone="info" icon="info"
              title="此訂單為 forwarded mirror · 不可假裝為 owned"
              body="所有 mutation 必須透過 reconciliation issue 走平台 finance owner。本地僅 sync external state。" />
          )}
          <Card theme={th} title="候選 driver · ranked (3)">
            <Table theme={th} columns={[
              { h: '#', w: 36, r: (_, i) => <span style={{ fontWeight: 700, color: th.accent, fontFamily: SHELL_MONO }}>{i + 1}</span> },
              { h: 'DRIVER', w: 160, r: r => (<div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id}</div></div>) },
              { h: 'VEHICLE', k: 'vehicle', w: 130, mono: true },
              { h: 'ETA', w: 80, r: () => <Pill theme={th} tone="success">8m</Pill> },
              { h: 'GATE', w: 180, r: (_, i) => i === 1
                ? <Pill theme={th} tone="warn" dot>license_expiring</Pill>
                : <Pill theme={th} tone="success">ok</Pill> },
              { h: 'SCORE', w: 70, r: (_, i) => <span style={{ fontFamily: SHELL_MONO }}>{[0.94, 0.87, 0.82][i] || '—'}</span> },
            ]} rows={FX_DRIVERS.slice(2, 5)} />
          </Card>

          <Card theme={th} title="Compliance gates · authority chain">
            <DL theme={th} cols={2} items={[
              { k: 'license valid', v: <Pill theme={th} tone="warn">2 / 3 候選通過</Pill> },
              { k: 'service bucket', v: 'business · ok', mono: true },
              { k: 'exclusivity', v: 'ok', mono: true },
              { k: 'device binding', v: '3 / 3 ok', mono: true },
              { k: 'fare quoted', v: 'NT$ 3,420 · pr_v23', mono: true },
              { k: 'override allowed', v: 'reviewer required', mono: true },
            ]} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="State machine">
            <Stepper theme={th} steps={[{ t: '建立' }, { t: 'queued' }, { t: 'broadcasting' }, { t: 'assigned' }, { t: 'on_trip' }, { t: 'completed' }]} current={domain === 'owned' ? 1 : 2} />
          </Card>
          <Card theme={th} title="活動 · Timeline">
            <Timeline theme={th} events={[
              { at: '15:42', tone: 'accent', t: '進入 queue', actor: 'tenant.api', actorRealm: 'tenant', body: 'CATHAY_LIFE 透過 API 建立。' },
              { at: '15:43', tone: 'accent', t: '計價', actor: 'pricing.engine', actorRealm: 'system', body: '套用 pr_v23 商務規則：NT$ 3,420。' },
              { at: '15:45', tone: 'warn', t: 'gate warning', actor: 'compliance', actorRealm: 'system', body: '候選 #2 license 距到期 < 30 天，已標記。' },
              { at: '15:46', tone: 'accent', t: '評估', actor: 'dispatch.scorer', actorRealm: 'system', body: '3 名候選，最高 0.94。' },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. /callcenter — one active session per agent (Q-OPS04)
// ─────────────────────────────────────────────────────────────────────────────
function OC_Callcenter({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="callcenter"
      breadcrumb={['客服中心']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="dispatch" dataFreshness="fresh">
      <PageHeader theme={th}
        title="客服中心"
        subtitle="agent 同一時段只能有一個 active session · 等待 / 回呼 / 錄音匹配獨立佇列"
        tabs={[{ id: 'sessions', label: 'Sessions · 當前', badge: '1', tone: 'accent' }, { id: 'callback', label: 'Callback queue', badge: '3' }, { id: 'recording', label: 'Recordings', badge: '2' }]}
        activeTab="sessions"
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'new_session', enabled: false, disabledReasonCode: 'active_session_exists', riskLevel: 'medium' }} icon="phone" label="開新 session" en="new" />
          <ActionButton theme={th} descriptor={{ action: 'close_session', enabled: true, riskLevel: 'low' }} icon="x" label="結束目前" en="close" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '320px 1fr 280px', gap: 16 }}>
        {/* Waiting list */}
        <Card theme={th} title="Waiting · 等待中 (2)" padding={0}>
          <div style={{ padding: 12 }}>
            <EmptyState theme={th} reason="no_data" compact messageOverride="無等待中來電。" />
          </div>
        </Card>

        {/* Active session */}
        <Card theme={th}
          title={<>call_2031 · 進行中 · <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>active</span></>}
          actions={<>
            <Pill theme={th} tone="success" dot>open</Pill>
            <Btn theme={th} variant="ghost" icon="ext">轉客訴 · transfer</Btn>
          </>}>
          <DL theme={th} cols={2} items={[
            { k: 'CALLER', v: '0912-555-401', mono: true },
            { k: 'TENANT', v: '— (公開電話)' },
            { k: 'AGENT', v: '王芳 (ops_manager)' },
            { k: 'OPENED', v: '2026-05-25 14:53', mono: true },
            { k: 'RECORDING', v: 'rec_88914.m4a · 已附加', mono: true },
            { k: 'TYPE', v: 'phone_booking', mono: true },
          ]} />
          <div style={{ height: 14 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field theme={th} label="pickup"><Input theme={th} value="台北市中山區民生東路二段 167 號" /></Field>
            <Field theme={th} label="drop"><Input theme={th} value="桃園機場 第一航廈 出境大廳" /></Field>
            <Field theme={th} label="reservation window"><Input theme={th} value="2026-05-25 17:30" mono /></Field>
            <Field theme={th} label="passenger"><Input theme={th} value="王 (簡稱) · 0912-555-401" /></Field>
            <Field theme={th} label="service bucket"><Select theme={th} value="airport_pickup" /></Field>
            <Field theme={th} label="quoted fare" hint="pricing engine 算出 (pr_v24)"><Input theme={th} value="NT$ 1,580" mono /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Btn theme={th}>取消</Btn>
            <ActionButton theme={th} descriptor={{ action: 'create_callback', enabled: true, riskLevel: 'low' }} icon="clock" label="建立 callback" en="callback" />
            <span style={{ flex: 1 }} />
            <ActionButton theme={th} descriptor={{ action: 'create_booking', enabled: true, riskLevel: 'medium' }} icon="check" label="建立 phone order" en="booking" />
          </div>
        </Card>

        {/* Right sidebar — callback + recording */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card theme={th} title="Callback queue · 3">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              {FX_CALLS.filter(c => c.state === 'pending').slice(0, 3).map(c => (
                <div key={c.id} style={{ padding: 8, borderRadius: 6, border: '1px solid ' + th.border, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pill theme={th} tone="warn" dot>待回呼</Pill>
                  <span style={{ flex: 1, fontFamily: SHELL_MONO, fontSize: 11 }}>{c.caller}</span>
                </div>
              ))}
              {FX_CALLS.filter(c => c.state === 'pending').length === 0 &&
                <EmptyState theme={th} reason="no_data" compact />}
            </div>
          </Card>
          <Card theme={th} title="Recording attach queue">
            <EmptyState theme={th} reason="external_unavailable" compact messageOverride="錄音 ingest service 暫時降級，2 筆等候自動匹配。" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  OPS_NAV, OPS_HEALTH, OPS_ACTOR, OPS_BOARDS,
  OC_Dashboard, OC_Dispatch, OC_DispatchDetail, OC_Callcenter,
});
