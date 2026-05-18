// ops-screens.jsx — Ops Console: 14 route screens.

const OPS_NAV = [
  { divider: '工作面' },
  { key: 'dashboard',  icon: 'dashboard',  label: '營運總覽', badge: '4', badgeTone: 'warn' },
  { divider: '即時派遣' },
  { key: 'dispatch',   icon: 'dispatch',   label: '派遣', badge: '23', badgeTone: 'accent' },
  { key: 'callcenter', icon: 'callcenter', label: '客服中心', badge: '5', badgeTone: 'info' },
  { divider: '案件處理' },
  { key: 'complaints', icon: 'complaints', label: '客訴', badge: '3', badgeTone: 'danger' },
  { key: 'incidents',  icon: 'incidents',  label: '事故', badge: '1', badgeTone: 'danger' },
  { divider: '營運監控' },
  { key: 'reports',    icon: 'reports',    label: '報表' },
  { key: 'revenue',    icon: 'revenue',    label: '收益審視' },
  { key: 'attendance', icon: 'attendance', label: '班次出勤' },
  { key: 'maintenance',icon: 'maintenance',label: '車輛保修' },
  { divider: '主資料' },
  { key: 'drivers',    icon: 'fleet',      label: '司機' },
  { key: 'vehicles',   icon: 'vehicles',   label: '車輛' },
  { key: 'contracts',  icon: 'contracts',  label: '合約' },
  { key: 'flags',      icon: 'flags',      label: '功能旗標' },
];

// 1. Dashboard
function OC_Dashboard({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="dashboard" breadcrumb={['營運總覽']}>
      <PageHeader theme={th} title="營運總覽" subtitle="2026-05-08 (週五) · 晚班 14:00–22:00 · 早晚交接 17:30" actions={<><Btn theme={th} icon="ext">值班手冊</Btn><Btn theme={th} variant="primary" icon="phone">開新 call session</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          <Kpi theme={th} label="進行中訂單" value="217" delta="↑ 18" deltaTone="up" />
          <Kpi theme={th} label="dispatch queue" value="23" delta="3 broadcasting" deltaTone="neutral" />
          <Kpi theme={th} label="可派司機" value="146" sub="884 在班" />
          <Kpi theme={th} label="位置失聯" value="4" delta=">5 min" deltaTone="down" />
          <Kpi theme={th} label="客訴未結" value="3" delta="2 SLA breach" deltaTone="down" />
          <Kpi theme={th} label="事故 in_response" value="2" delta="1 critical" deltaTone="down" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <Card theme={th} title="今日待處理" subtitle="排序：critical → SLA breach → blocking" actions={<Btn theme={th} variant="ghost">展開所有</Btn>}>
            <Banner theme={th} tone="danger" icon="warn" title="inc_0214 · 司機 SOS · critical" body="d_8843 在台北信義區忠孝東路五段，乘客醉酒衝突。已派遣支援。" actions={<Btn theme={th} variant="primary">前往事故</Btn>} />
            <div style={{ height: 8 }} />
            <Banner theme={th} tone="warn" icon="warn" title="ord_8234 · 陽明山 · 連續 12 分鐘無供給" body="台北山區晚間 standard 派遣覆蓋率不足。建議改派 business 或人工協調。" actions={<Btn theme={th} variant="secondary">處理 no-supply</Btn>} />
            <div style={{ height: 8 }} />
            <Banner theme={th} tone="warn" icon="warn" title="GoCab forwarded · sync_failed 4.2%" body="adapter latency 780ms。建議檢查 adapter 狀態並轉 manual fallback。" actions={<Btn theme={th} variant="secondary">查看 forwarded board</Btn>} />
          </Card>
          <Card theme={th} title="健康訊號">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { t: 'dispatch lag p95', v: '2.4s', tone: 'success' },
                { t: 'webhook 投遞 p95', v: '410ms', tone: 'warn' },
                { t: 'forwarder srx-v3', v: 'healthy', tone: 'success' },
                { t: 'forwarder gocab-v1', v: 'degraded', tone: 'warn' },
                { t: 'BGMT 派遣回報', v: 'pending_renewal', tone: 'danger' },
              ].map((x, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: th.surfaceLo }}>
                  <Pill theme={th} tone={x.tone} dot>{x.v}</Pill>
                  <span style={{ fontSize: 12, flex: 1 }}>{x.t}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card theme={th} title="當前 dispatch 隊列" padding={0} actions={<Btn theme={th} variant="ghost">前往派遣</Btn>}>
          <Table theme={th} columns={[
            { h: 'ORDER', k: 'id', w: 110, mono: true },
            { h: 'TENANT', k: 'tenant', w: 130, mono: true },
            { h: 'PICKUP', k: 'pickup' },
            { h: 'WIN', k: 'win', w: 130, mono: true },
            { h: 'STATE', w: 130, r: r => <Pill theme={th} tone={r.state === 'assigned' ? 'success' : r.state === 'no_supply' ? 'danger' : r.state === 'override_pending' ? 'warn' : 'info'} dot>{r.state}</Pill> },
            { h: 'DRIVER', k: 'driver', w: 110, mono: true },
            { h: 'ETA', k: 'eta', w: 90, mono: true },
          ]} rows={FX_DISPATCH_OWNED.slice(0, 5)} />
        </Card>
      </div>
    </Shell>
  );
}

// 2. Dispatch (owned + forwarded sub-tabs)
function OC_DispatchOwned({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch" breadcrumb={['派遣', 'Owned']}>
      <PageHeader theme={th} title="派遣" subtitle="即時派車工作流 · queue · candidates · ETA · override" tabs={['Owned 自營','Forwarded 外部','Override governance','No-supply']} activeTab="Owned 自營"
        actions={<><Btn theme={th} icon="filter">服務 bucket</Btn><Btn theme={th} icon="refresh">重整</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['全部 23','queued 6','broadcasting 3','assigned 11','no_supply 1','override_pending 1','exception_hold 1'].map((s, i) => (
            <Pill key={i} theme={th} tone={i === 0 ? 'accent' : i === 4 || i === 5 ? 'warn' : 'neutral'} dot>{s}</Pill>
          ))}
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ORDER', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'TENANT', k: 'tenant', w: 140, mono: true },
            { h: 'PICKUP → DROP', w: 380, r: r => (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 1 }}>
                <span>{r.pickup}</span>
                <span style={{ color: th.textDim, fontSize: 11 }}>↓ {r.drop}</span>
              </div>
            )},
            { h: 'WIN', k: 'win', w: 130, mono: true },
            { h: 'SVC', k: 'service', w: 100, mono: true },
            { h: 'STATE', w: 140, r: r => <Pill theme={th} tone={r.state === 'assigned' ? 'success' : r.state === 'no_supply' ? 'danger' : r.state === 'override_pending' ? 'warn' : 'info'} dot>{r.state}</Pill> },
            { h: 'DRIVER', k: 'driver', w: 100, mono: true },
            { h: 'ETA', k: 'eta', w: 90, mono: true },
            { h: 'CAND', k: 'candidates', w: 60, mono: true, align: 'right' },
            { h: 'GATE', w: 130, r: r => r.gates === 'ok' ? <Pill theme={th} tone="success">ok</Pill> : <Pill theme={th} tone="warn" dot>{r.gates}</Pill> },
          ]} rows={FX_DISPATCH_OWNED} />
        </Card>
      </div>
    </Shell>
  );
}

function OC_DispatchForwarded({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch" breadcrumb={['派遣', 'Forwarded']}>
      <PageHeader theme={th} title="派遣" subtitle="forwarded mirror · 不可假裝為 owned · 發生問題時建立 reconciliation issue" tabs={['Owned 自營','Forwarded 外部','Override governance','No-supply']} activeTab="Forwarded 外部"
        actions={<><Btn theme={th} icon="filter">來源</Btn><Btn theme={th} variant="primary" icon="warn">建立 reconciliation</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Banner theme={th} tone="warn" icon="warn" title="GoCab adapter degraded" body="近 24h sync_failed 4.2%。已開啟 dispatch.compliance.license_warn_30d 觀察 manual fallback 量。" actions={<Btn theme={th} variant="secondary">查看 adapter</Btn>} />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'MIRROR ID', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'SOURCE', k: 'source', w: 140 },
            { h: 'EXTERNAL', k: 'external', w: 150, mono: true },
            { h: 'PICKUP → DROP', w: 360, r: r => (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 1 }}>
                <span>{r.pickup}</span>
                <span style={{ color: th.textDim, fontSize: 11 }}>↓ {r.drop}</span>
              </div>
            )},
            { h: 'WIN', k: 'win', w: 90, mono: true },
            { h: 'STATE', w: 200, r: r => <Pill theme={th} tone={r.state === 'sync_failed' || r.state === 'manual_fallback_required' ? 'danger' : r.state === 'lost_race' ? 'warn' : 'info'} dot>{r.state}</Pill> },
            { h: 'ADAPTER', k: 'adapter', w: 100, mono: true },
            { h: 'MISMATCH', k: 'mismatch', mono: true },
          ]} rows={FX_DISPATCH_FORWARDED} />
        </Card>
      </div>
    </Shell>
  );
}

// Owned dispatch detail (drawer-style flow)
function OC_DispatchDetail({ theme: th }) {
  const o = FX_DISPATCH_OWNED[2]; // ord_8233
  return (
    <Shell theme={th} nav={OPS_NAV} active="dispatch" breadcrumb={['派遣', 'Owned', o.id]}>
      <PageHeader theme={th} title={o.id + ' · ' + o.tenant} subtitle={o.pickup + '  →  ' + o.drop + '  ·  ' + o.win}
        actions={<><Btn theme={th} icon="phone">聯絡乘客</Btn><Btn theme={th} icon="warn">request override</Btn><Btn theme={th} variant="primary" icon="check">指派候選 #1</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="候選 driver (3)">
            <Table theme={th} columns={[
              { h: 'RANK', w: 50, r: (_, i) => <span style={{ fontWeight: 700, color: th.accent, fontFamily: '"JetBrains Mono", monospace' }}>#{i + 1}</span> },
              { h: 'DRIVER', w: 160, r: r => (<div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: '"JetBrains Mono", monospace' }}>{r.id}</div></div>) },
              { h: 'VEHICLE', k: 'vehicle', w: 130, mono: true },
              { h: 'ETA', w: 80, r: () => <Pill theme={th} tone="success">8m</Pill> },
              { h: 'GATE', w: 160, r: () => <Pill theme={th} tone="warn" dot>license_expiring</Pill> },
              { h: 'SCORE', w: 60, r: () => <span style={{ fontFamily: '"JetBrains Mono", monospace', color: th.text }}>0.94</span> },
            ]} rows={FX_DRIVERS.slice(2, 5)} />
          </Card>
          <Card theme={th} title="Compliance gates">
            <DL theme={th} cols={2} items={[
              { k: 'license valid', v: '2/3 候選通過', mono: true },
              { k: 'service bucket', v: 'business · ok', mono: true },
              { k: 'exclusivity', v: 'ok', mono: true },
              { k: 'device binding', v: '3/3 ok', mono: true },
              { k: 'fare quoted', v: 'NT$ 3,420 · pr_v23', mono: true },
              { k: 'override allowed', v: 'reviewer required', mono: true },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="訂單狀態">
            <Stepper theme={th} steps={[{ t: '建立' },{ t: 'queued' },{ t: 'broadcasting' },{ t: 'assigned' },{ t: 'on_trip' },{ t: 'completed' }]} current={1} />
          </Card>
          <Card theme={th} title="活動">
            <Timeline theme={th} events={[
              { at: '15:42', tone: 'accent', t: '進入 queue', actor: 'tenant.api', body: 'CATHAY_LIFE 透過 API 建立。' },
              { at: '15:43', tone: 'accent', t: '計價', actor: 'pricing.engine', body: '套用 pr_v23 商務規則：NT$ 3,420。' },
              { at: '15:45', tone: 'warn', t: 'gate warning', actor: 'compliance', body: '候選 #2 license 距到期 < 30 天，已標記。' },
              { at: '15:46', tone: 'accent', t: '評估', actor: 'dispatch.scorer', body: '3 名候選，最高 0.94。' },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// 3. Callcenter
function OC_Callcenter({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="callcenter" breadcrumb={['客服中心']}>
      <PageHeader theme={th} title="客服中心" subtitle="call sessions · phone booking · callbacks · recordings · complaint handoff" tabs={['Sessions','Callback queue','Recordings']} activeTab="Sessions"
        actions={<><Btn theme={th} icon="phone">開新 session</Btn><Btn theme={th} variant="primary" icon="plus">建立電話訂單</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
        <Card theme={th} title="進行中 sessions" padding={0}>
          <Table theme={th} dense columns={[
            { h: 'ID', k: 'id', w: 90, mono: true },
            { h: 'CALLER', k: 'caller', w: 130, mono: true },
            { h: 'TYPE', k: 'type', w: 130, mono: true },
            { h: 'STATE', w: 100, r: r => <Pill theme={th} tone={r.state === 'open' ? 'success' : r.state === 'pending' ? 'warn' : r.state === 'transferred' ? 'info' : 'neutral'} dot>{r.state}</Pill> },
            { h: 'DUR', k: 'dur', w: 60, mono: true },
            { h: 'AGENT', k: 'agent', w: 60, mono: true },
          ]} rows={FX_CALLS} />
        </Card>
        <Card theme={th} title="call_2031 · 進行中" actions={<><Pill theme={th} tone="success" dot>open</Pill><Btn theme={th} variant="ghost" icon="ext">轉客訴</Btn></>}>
          <DL theme={th} cols={2} items={[
            { k: 'CALLER', v: '0912-555-401', mono: true },
            { k: 'TENANT', v: '— (公開電話)' },
            { k: 'AGENT', v: 'YL.linchen' },
            { k: 'OPENED', v: '2026-05-08 14:53', mono: true },
            { k: 'RECORDING', v: 'attached · rec_88914.m4a', mono: true },
            { k: 'TYPE', v: 'phone_booking', mono: true },
          ]} />
          <div style={{ height: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field theme={th} label="pickup"><Input theme={th} value="台北市中山區民生東路二段 167 號" /></Field>
            <Field theme={th} label="drop"><Input theme={th} value="桃園機場 第一航廈 出境大廳" /></Field>
            <Field theme={th} label="reservation window"><Input theme={th} value="2026-05-08 17:30 (now+90m)" mono /></Field>
            <Field theme={th} label="passenger"><Input theme={th} value="王 (簡稱) · 0912-555-401" /></Field>
            <Field theme={th} label="service bucket"><Select theme={th} value="airport_pickup" /></Field>
            <Field theme={th} label="quoted fare" hint="pr_v24"><Input theme={th} value="NT$ 1,580" mono /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Btn theme={th}>取消</Btn>
            <Btn theme={th} icon="phone">建立 callback</Btn>
            <span style={{ flex: 1 }} />
            <Btn theme={th} variant="primary" icon="check">建立 phone order</Btn>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// 4. Complaints
function OC_Complaints({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="complaints" breadcrumb={['客訴']}>
      <PageHeader theme={th} title="客訴中心" subtitle="案件全流程 · SLA · 升級 · reopen 不得覆蓋紀錄" tabs={['全部','我負責','SLA breach','已升級事故']} activeTab="全部"
        actions={<><Btn theme={th} icon="filter">類別</Btn><Btn theme={th} icon="export">匯出</Btn><Btn theme={th} variant="primary" icon="plus">建立客訴</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="未結客訴" value="3" delta="2 SLA breach" deltaTone="down" />
          <Kpi theme={th} label="平均處理" value="22h" delta="↓ 4h" deltaTone="up" />
          <Kpi theme={th} label="升級事故" value="1" sub="cmp_0894 → inc_0212" />
          <Kpi theme={th} label="reopen 率" value="9%" delta="↑ 1%" deltaTone="down" />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'CASE', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'CATEGORY', k: 'cat', w: 150, mono: true },
            { h: 'SEV', w: 90, r: r => <Pill theme={th} tone={r.severity === 'critical' ? 'danger' : r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warn' : 'neutral'} dot>{r.severity}</Pill> },
            { h: 'DESC', k: 'desc' },
            { h: 'ORDER', k: 'order', w: 110, mono: true },
            { h: 'SLA', w: 110, r: r => <Pill theme={th} tone={r.sla === 'breached' ? 'danger' : 'success'} dot>{r.sla}</Pill> },
            { h: 'OWNER', k: 'assignee', w: 80, mono: true },
            { h: 'STATUS', w: 160, r: r => <Pill theme={th} tone={r.status === 'resolved' ? 'success' : r.status === 'escalated_to_incident' ? 'danger' : 'info'} dot>{r.status}</Pill> },
          ]} rows={FX_COMPLAINTS} />
        </Card>
      </div>
    </Shell>
  );
}

// 5. Incidents
function OC_Incidents({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="incidents" breadcrumb={['事故']}>
      <PageHeader theme={th} title="事故中心" subtitle="safety · collision · property · service recovery" tabs={['Active 4','Resolved','Closed']} activeTab="Active 4"
        actions={<><Btn theme={th} icon="filter">類別</Btn><Btn theme={th} variant="primary" icon="plus">建立事故</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="danger" icon="warn" title="inc_0214 · 司機 SOS · critical · in_response" body="d_8843 在台北信義區忠孝東路五段觸發 SOS，已派遣支援。安全主管 林經理 接手。" actions={<Btn theme={th} variant="primary">前往事件</Btn>} />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'INC', k: 'id', w: 100, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'TITLE', k: 'title', w: 280 },
            { h: 'CAT', k: 'cat', w: 120, mono: true },
            { h: 'SEV', w: 100, r: r => <Pill theme={th} tone={r.severity === 'critical' ? 'danger' : r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warn' : 'neutral'} dot>{r.severity}</Pill> },
            { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={r.status === 'closed' ? 'neutral' : r.status === 'in_response' ? 'danger' : 'warn'} dot>{r.status}</Pill> },
            { h: 'DRIVER', k: 'driver', w: 90, mono: true },
            { h: 'OCCURRED', k: 'occurred', mono: true, w: 150 },
            { h: 'RECOVERY', w: 100, r: r => <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{r.recovery} actions</span> },
          ]} rows={FX_INCIDENTS} />
        </Card>
      </div>
    </Shell>
  );
}

// 6. Incident detail (SOS flow)
function OC_IncidentDetail({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="incidents" breadcrumb={['事故', 'inc_0214']}>
      <PageHeader theme={th} title="inc_0214 · 司機 SOS · 乘客醉酒衝突" subtitle="critical · safety · in_response · 14:42 開啟"
        actions={<><Btn theme={th} icon="phone">通知警方</Btn><Btn theme={th} icon="copy">通報租戶</Btn><Btn theme={th} variant="primary" icon="check">標記受控</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="事件摘要">
            <DL theme={th} cols={3} items={[
              { k: 'OCCURRED', v: '2026-05-08 14:42:11', mono: true },
              { k: 'LOCATION', v: '台北市信義區忠孝東路五段 68 號' },
              { k: 'DRIVER', v: 'd_8843 陳俊宏', mono: true },
              { k: 'VEHICLE', v: 'ARJ-3120', mono: true },
              { k: 'ORDER', v: 'ord_8232', mono: true },
              { k: 'TENANT', v: 'YAMATO', mono: true },
              { k: 'REPORTED BY', v: 'driver app · SOS button' },
              { k: 'COMPLAINT', v: '— (driver 自報)' },
              { k: 'SEVERITY', v: 'critical', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="Timeline">
            <Timeline theme={th} events={[
              { at: '14:42', tone: 'danger', t: 'SOS 觸發', actor: 'driver d_8843', body: '司機按下 SOS。系統自動撥通安全主管熱線並對乘客端靜音。' },
              { at: '14:42', tone: 'accent', t: '安全主管接通', actor: 'system → 林經理', body: '7 秒內接通；持續監聽中。' },
              { at: '14:43', tone: 'accent', t: '提報事件', actor: '林經理 (safety_lead)', body: '建立 inc_0214；severity=critical。' },
              { at: '14:45', tone: 'accent', t: '租戶通報', actor: '林經理', body: 'YAMATO 商務窗口已通知。' },
              { at: '14:48', tone: 'warn', t: '派遣支援車', actor: 'dispatch', body: '已派 d_8870 至現場協助。' },
              { at: '14:52', tone: 'accent', t: '記錄評論', actor: '林經理', body: '乘客已下車，現場由 d_8870 接手。' },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Service recovery actions">
            <DL theme={th} cols={1} items={[
              { k: '14:48 · 派遣支援車', v: '✓ d_8870 已抵達' },
              { k: '15:00 · 訂單免收費', v: '✓ ord_8232 fare = 0' },
              { k: '排程 · 司機 EAP 介入', v: '— pending' },
            ]} />
            <Btn theme={th} variant="primary" icon="plus">新增 recovery</Btn>
          </Card>
          <Card theme={th} title="關聯">
            <DL theme={th} cols={1} items={[
              { k: 'COMPLAINT', v: '—' },
              { k: 'ORDER', v: 'ord_8232', mono: true },
              { k: 'TENANT', v: 'YAMATO', mono: true },
              { k: 'AUDIT', v: 'audit log · req_FXa899', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// 7. Reporting
function OC_Reports({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="reports" breadcrumb={['報表']}>
      <PageHeader theme={th} title="報表" subtitle="report jobs · filing packages · signed artifact 短效 URL" tabs={['Report jobs','Filing packages','Schedules']} activeTab="Report jobs"
        actions={<><Btn theme={th} variant="primary" icon="plus">建立工作</Btn></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'JOB', k: 'id', w: 110, mono: true },
            { h: 'KIND', k: 'kind', w: 180, mono: true },
            { h: 'PERIOD', k: 'period', w: 100, mono: true },
            { h: 'FORMAT', k: 'format', w: 90, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'ready' ? 'success' : r.status === 'running' ? 'info' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'EXPIRES', k: 'expires', mono: true, w: 130 },
            { h: 'CREATED', k: 'created', mono: true },
          ]} rows={FX_REPORTS} />
        </Card>
      </div>
    </Shell>
  );
}

// 8. Revenue
function OC_Revenue({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="revenue" breadcrumb={['收益審視']}>
      <PageHeader theme={th} title="收益審視" subtitle="period · service bucket · vehicle · channel mix · settlement matrix" tabs={['Insight','Channel mix','Settlement matrix','Mismatch review']} activeTab="Settlement matrix"
        actions={<><Btn theme={th} icon="filter">期別</Btn><Btn theme={th} icon="export">匯出</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="當期 billed (MTD)" value="NT$ 11.5M" delta="↑ 6.2%" deltaTone="up" />
          <Kpi theme={th} label="自營佔比" value="71%" delta="↓ 1.4 pp" deltaTone="neutral" />
          <Kpi theme={th} label="forwarded sync_failed" value="4.2%" delta="warn" deltaTone="down" />
          <Kpi theme={th} label="未結 reconciliation" value="3" sub="2 partner · 1 forwarded" />
        </div>
        <Card theme={th} title="結算矩陣 (2026-04)" padding={0}>
          <Table theme={th} columns={[
            { h: '渠道', k: 'row', w: 200 },
            { h: 'BILLED', k: 'billed', mono: true, align: 'right' },
            { h: 'DRIVER FEE', k: 'drvFee', mono: true, align: 'right' },
            { h: 'SERVICE FEE', k: 'svcFee', mono: true, align: 'right' },
            { h: 'RECON OPEN', k: 'recon', mono: true, align: 'right', w: 100 },
            { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={r.status === 'reconciled' ? 'success' : r.status === 'pending' ? 'warn' : 'info'} dot>{r.status}</Pill> },
          ]} rows={FX_SETTLEMENT} />
        </Card>
      </div>
    </Shell>
  );
}

// 9. Attendance
function OC_Attendance({ theme: th }) {
  const drvs = [...FX_DRIVERS, ...FX_DRIVERS.slice(0, 4)];
  return (
    <Shell theme={th} nav={OPS_NAV} active="attendance" breadcrumb={['班次出勤']}>
      <PageHeader theme={th} title="班次與出勤" subtitle="2026-05-08 (週五)" tabs={['今日','本週','異常']} activeTab="今日" actions={<Btn theme={th} icon="export">匯出</Btn>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="排班司機" value="884" />
          <Kpi theme={th} label="活躍班次" value="612" sub="69%" />
          <Kpi theme={th} label="完成班次" value="194" />
          <Kpi theme={th} label="異常 / 遲到" value="11" delta="3 未到" deltaTone="down" />
        </div>
        <Card theme={th} title="當班甘特" padding={16}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', fontSize: 11, gap: '0 8px' }}>
            <div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', color: th.textDim, paddingBottom: 4, borderBottom: '1px solid ' + th.border, fontFamily: '"JetBrains Mono", monospace' }}>
              {Array.from({ length: 24 }, (_, i) => <span key={i} style={{ textAlign: 'center' }}>{i.toString().padStart(2, '0')}</span>)}
            </div>
            {drvs.slice(0, 8).map((d, i) => {
              const start = [7, 6, 13, 8, 8, 9, 7, 14][i % 8];
              const end = [19, 18, 25, 20, 20, 21, 19, 26][i % 8];
              return (
                <React.Fragment key={i}>
                  <div style={{ padding: '6px 0', borderBottom: '1px dashed ' + th.border, fontSize: 12 }}>{d.name}</div>
                  <div style={{ position: 'relative', height: 28, borderBottom: '1px dashed ' + th.border }}>
                    <div style={{ position: 'absolute', top: 6, left: (start / 24 * 100) + '%', width: ((Math.min(end, 24) - start) / 24 * 100) + '%', height: 16, background: th.accentBg, border: '1px solid ' + th.accent, borderRadius: 4, color: th.accent, fontSize: 10, paddingLeft: 6, lineHeight: '14px', fontFamily: '"JetBrains Mono", monospace' }}>{start.toString().padStart(2, '0')}–{end.toString().padStart(2, '0')}</div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// 10. Maintenance
function OC_Maintenance({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="maintenance" breadcrumb={['車輛保修']}>
      <PageHeader theme={th} title="車輛保修" subtitle="工單 · 排程 · 技師 · 影響派遣" tabs={['全部','排程中','進行中','已完成','逾期']} activeTab="全部"
        actions={<><Btn theme={th} variant="primary" icon="plus">開立工單</Btn></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'WO', k: 'id', w: 90, mono: true },
            { h: '車輛', k: 'vehicle', w: 110, mono: true },
            { h: '類別', k: 'kind', w: 200 },
            { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={r.overdue ? 'danger' : r.status === 'completed' ? 'success' : r.status === 'in_progress' ? 'info' : 'warn'} dot>{r.status}</Pill> },
            { h: '排定', k: 'sched', mono: true, w: 150 },
            { h: '技師', k: 'tech', w: 90 },
            { h: '費用', k: 'cost', mono: true, align: 'right' },
          ]} rows={FX_MAINT} />
        </Card>
      </div>
    </Shell>
  );
}

// 11. Drivers
function OC_Drivers({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="drivers" breadcrumb={['主資料', '司機']}>
      <PageHeader theme={th} title="司機" subtitle="總表 · 班別 · license · 評分 · earnings drill-down" tabs={['全部','可派','在班','下班']} activeTab="全部" actions={<Btn theme={th} icon="filter">篩選</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'DRIVER', w: 200, r: r => <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 600 }}>{r.name}</span><span style={{ fontSize: 11, color: th.textDim, fontFamily: '"JetBrains Mono", monospace' }}>{r.id} · {r.phone}</span></div> },
            { h: '車輛', k: 'vehicle', w: 130, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'available' ? 'success' : r.status === 'on_trip' ? 'info' : r.status === 'break' ? 'warn' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'SHIFT', k: 'shift', w: 130, mono: true },
            { h: 'LICENSE', w: 130, r: r => r.license === 'valid' ? <Pill theme={th} tone="success">valid</Pill> : <Pill theme={th} tone="warn" dot>{r.license}</Pill> },
            { h: 'EXCL.', w: 140, r: r => <Pill theme={th} tone={r.exclusivity === 'declared' ? 'success' : 'warn'} dot>{r.exclusivity}</Pill> },
            { h: '評分', k: 'rating', mono: true, align: 'right' },
          ]} rows={FX_DRIVERS} />
        </Card>
      </div>
    </Shell>
  );
}

// 12. Vehicles
function OC_Vehicles({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="vehicles" breadcrumb={['主資料', '車輛']}>
      <PageHeader theme={th} title="車輛" subtitle="dispatchable · 合約 · 保險 · debrand" actions={<Btn theme={th} icon="filter">篩選</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'PLATE', k: 'plate', w: 130, mono: true, r: r => <span style={{ fontWeight: 600 }}>{r.plate}</span> },
            { h: 'MODEL', k: 'model', w: 200 },
            { h: 'YEAR', k: 'year', w: 80, mono: true, align: 'right' },
            { h: 'DISPATCHABLE', w: 140, r: r => <Pill theme={th} tone={r.dispatchable ? 'success' : 'danger'} dot>{r.dispatchable ? 'yes' : 'no'}</Pill> },
            { h: 'CONTRACT', k: 'contract', mono: true, w: 130 },
            { h: 'INSURANCE', k: 'insurance', mono: true, w: 130 },
            { h: 'DEBRAND DUE', k: 'debrand', mono: true, w: 140 },
          ]} rows={FX_VEHICLES} />
        </Card>
      </div>
    </Shell>
  );
}

// 13. Contracts
function OC_Contracts({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="contracts" breadcrumb={['主資料', '合約']}>
      <PageHeader theme={th} title="合約" subtitle="車隊合約 · partner relation · revenue share" actions={<Btn theme={th} variant="primary" icon="plus">建立合約</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'CONTRACT', k: 'id', w: 110, mono: true },
            { h: 'COUNTERPARTY', k: 'cp', w: 220 },
            { h: 'KIND', k: 'kind', w: 130, mono: true },
            { h: 'TERM', k: 'term', mono: true, w: 200 },
            { h: 'REVENUE SHARE', k: 'rs', mono: true, w: 140 },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.s === 'active' ? 'success' : r.s === 'expiring' ? 'warn' : 'neutral'} dot>{r.s}</Pill> },
          ]} rows={[
            { id: 'CTR-204', cp: '台北車隊 — 林志偉群組', kind: 'fleet_lease', term: '2025-01-01 → 2026-12-31', rs: '70/30', s: 'active' },
            { id: 'CTR-219', cp: '桃園車隊 — 黃文豪群組', kind: 'fleet_lease', term: '2025-04-01 → 2027-03-31', rs: '70/30', s: 'active' },
            { id: 'CTR-201', cp: '中部車隊 — 退場中', kind: 'fleet_lease', term: '2024-01-01 → 2026-06-30', rs: '70/30', s: 'expiring' },
            { id: 'CTR-310', cp: 'CTBC 中信銀行 partner', kind: 'partner_program', term: '2025-07-01 → 2027-06-30', rs: 'sponsor settle', s: 'active' },
            { id: 'CTR-322', cp: 'CATHAY 國泰世華 partner', kind: 'partner_program', term: '2026-01-01 → 2027-12-31', rs: 'sponsor settle', s: 'active' },
            { id: 'CTR-330', cp: 'SmartRides X forwarder', kind: 'forwarder', term: '2025-09-01 → ongoing', rs: '85/15', s: 'active' },
            { id: 'CTR-341', cp: 'GoCab forwarder', kind: 'forwarder', term: '2025-11-01 → ongoing', rs: '85/15', s: 'active' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// 14. Feature flags (ops-visible)
function OC_Flags({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="flags" breadcrumb={['功能旗標']}>
      <PageHeader theme={th} title="功能旗標" subtitle="只讀 · 由平台治理發佈" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'KEY', k: 'key', w: 380, mono: true },
            { h: 'SCOPE', k: 'scope', w: 160, mono: true },
            { h: 'STATE', w: 100, r: r => <Pill theme={th} tone={r.enabled ? 'success' : 'neutral'} dot>{r.enabled ? 'enabled' : 'disabled'}</Pill> },
            { h: 'UPDATED BY', k: 'updatedBy', w: 200 },
            { h: 'AT', k: 'updatedAt', mono: true },
          ]} rows={FX_FLAGS} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  OPS_NAV,
  OC_Dashboard, OC_DispatchOwned, OC_DispatchForwarded, OC_DispatchDetail,
  OC_Callcenter, OC_Complaints, OC_Incidents, OC_IncidentDetail,
  OC_Reports, OC_Revenue, OC_Attendance, OC_Maintenance,
  OC_Drivers, OC_Vehicles, OC_Contracts, OC_Flags,
});
