// platform-sandbox.jsx — A3 · Platform Admin Sandbox Governance pages (platform realm, extends Platform Admin).
// PRD §2.1. Reuses PA_NAV/PA_ACTOR + mgmt primitives + SecretRevealModal. Map editor for PostGIS polygons/routes.
// Pages: Experiments · Jurisdiction Profiles · Approval Documents · Operating Areas/Routes ·
// Vehicle Enrollments · Safety Operator Qualifications · Tesla Integrations · Regulatory Capabilities ·
// Evidence & Retention Policies · Reporting Policies · Suspension/Resume.

const PSB_ACTOR = { name: 'SX', display: '駱思賢', role: 'platform_sandbox_admin' };

const FX_EXPERIMENTS = [
  { id: 'exp_fsd_taipei_01', name: '台北 FSD 監理沙盒一期', jurisdiction: '台北市', status: 'active', vehicles: 5, operators: 8, area: '信義 / 南港', window: '2026-06 ~ 2026-12' },
  { id: 'exp_fsd_taipei_02', name: '台北 FSD 夜間延伸', jurisdiction: '台北市', status: 'draft', vehicles: 0, operators: 0, area: '信義', window: '—' },
  { id: 'exp_fsd_taoyuan_01', name: '桃園機場接駁沙盒', jurisdiction: '桃園市', status: 'suspended', vehicles: 3, operators: 4, area: '航廈周邊', window: '2026-05 ~ 2026-11' },
];
function expTone(s) { return s === 'active' ? 'success' : s === 'draft' ? 'neutral' : s === 'suspended' ? 'danger' : 'warn'; }

// ── Experiments list ─────────────────────────────────────────────────────────
function PA_Experiments({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="sandbox" breadcrumb={['沙盒治理', 'Experiments']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="沙盒實驗 · Experiments" subtitle="FSD 監理沙盒 · jurisdiction-scoped · policy snapshot 隔離缺值"
        tabs={[{ id: 'all', label: '全部', badge: '3' }, { id: 'active', label: '進行中', badge: '1', tone: 'accent' }]} activeTab="all"
        actions={<Btn theme={th} variant="primary" icon="plus">建立實驗</Btn>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ID', k: 'id', w: 180, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: '名稱', k: 'name', w: 200 },
            { h: '主管轄區', k: 'jurisdiction', w: 90 },
            { h: '區域', k: 'area', w: 110 },
            { h: '車輛', k: 'vehicles', w: 60, mono: true, align: 'center' },
            { h: '安全員', k: 'operators', w: 64, mono: true, align: 'center' },
            { h: '期間', k: 'window', w: 150, mono: true },
            { h: '狀態', w: 100, r: r => <Pill theme={th} tone={expTone(r.status)} dot>{r.status}</Pill> },
          ]} rows={FX_EXPERIMENTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── Experiment detail (tabs across the governance objects) ───────────────────
function PA_ExperimentDetail({ theme: th, tab = 'areas' }) {
  const tabs = [
    { id: 'areas', label: '營運區域 / 路線' }, { id: 'vehicles', label: '車輛登錄' },
    { id: 'operators', label: '安全員資格' }, { id: 'tesla', label: 'Tesla 整合' },
    { id: 'capabilities', label: '監理能力' }, { id: 'policies', label: '證據 / 通報政策' },
  ];
  return (
    <Shell theme={th} nav={PA_NAV} active="sandbox" breadcrumb={['沙盒治理', 'exp_fsd_taipei_01']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>exp_fsd_taipei_01<Pill theme={th} tone="success" dot>active</Pill></span>}
        subtitle="台北 FSD 監理沙盒一期 · 台北市 · 信義 / 南港"
        tabs={tabs} activeTab={tab}
        actions={<><Btn theme={th} icon="audit">核准文件</Btn><Btn theme={th} variant="secondary" danger icon="lock">暫停實驗</Btn></>} />
      <div style={{ padding: 24 }}>
        {tab === 'areas' && <PSB_AreasEditor theme={th} />}
        {tab === 'vehicles' && <PSB_VehicleEnroll theme={th} />}
        {tab === 'operators' && <PSB_OperatorQual theme={th} />}
        {tab === 'tesla' && <PSB_TeslaIntegration theme={th} />}
        {tab === 'capabilities' && <PSB_Capabilities theme={th} />}
        {tab === 'policies' && <PSB_Policies theme={th} />}
      </div>
    </Shell>
  );
}

// ── Operating Areas / Routes — map editor (PostGIS polygon / linestring) ──────
function PSB_AreasEditor({ theme: th }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
      <Card theme={th} title="營運區域 / 路線編輯" subtitle="PostGIS polygon / linestring · 畫多邊形 · 畫路線 · 上下客點" padding={0}>
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderBottom: '1px solid ' + th.border, background: th.surfaceLo }}>
          {[['polygon', '畫區域'], ['route', '畫路線'], ['point', '上下客點'], ['edit', '編輯節點']].map(([ic, l], i) => (
            <button key={ic} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: '1px solid ' + (i === 0 ? th.accent : th.border), background: i === 0 ? th.accentBg : th.surface, color: i === 0 ? th.accent : th.textMuted }}>
              <MgmtIcon name={i === 0 ? 'governance' : i === 1 ? 'tracking' : i === 2 ? 'pin' : 'edit'} size={13} />{l}</button>
          ))}
        </div>
        <div style={{ height: 380, background: 'linear-gradient(135deg,' + th.accentBg + ',' + th.surfaceLo + ')', position: 'relative', overflow: 'hidden' }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <polygon points="80,80 320,60 380,200 260,300 100,260" fill={th.accent + '22'} stroke={th.accent} strokeWidth="2" strokeDasharray="6 4" />
            <polyline points="120,180 220,150 300,210 360,180" fill="none" stroke={th.accentHi || th.accent} strokeWidth="3" />
            {[[120, 180], [360, 180]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="6" fill={th.accent} stroke={th.surface} strokeWidth="2" />)}
            {[[80, 80], [320, 60], [380, 200], [260, 300], [100, 260]].map(([x, y], i) => <rect key={i} x={x - 4} y={y - 4} width="8" height="8" fill={th.surface} stroke={th.accent} strokeWidth="2" />)}
          </svg>
          <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 10.5, color: th.textMuted, background: th.surface, padding: '4px 9px', borderRadius: 6 }}>信義沙盒區 · 5 節點 polygon · 1 條核准路線</div>
        </div>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card theme={th} title="區域屬性">
          <DL theme={th} cols={1} items={[
            { k: '名稱', v: '信義沙盒區', mono: false }, { k: 'geometry', v: 'POLYGON · 5 pts', mono: true },
            { k: '核准時段', v: '08:00–18:00', mono: true }, { k: '面積', v: '4.2 km²', mono: true },
          ]} />
        </Card>
        <Card theme={th} title="路線 / 停靠點">
          <Table theme={th} columns={[
            { h: '名稱', w: 110, r: r => r.n }, { h: '型', w: 80, r: r => <Pill theme={th} tone="neutral">{r.t}</Pill> },
            { h: '', w: 50, r: () => <MgmtIcon name="edit" size={13} style={{ color: th.textDim }} /> },
          ]} rows={[{ n: 'R-信義-01', t: 'route' }, { n: '松仁路上客', t: 'pickup' }, { n: '南港下客', t: 'dropoff' }]} />
        </Card>
        <Btn theme={th} variant="primary" icon="check" block>儲存並送審核准</Btn>
      </div>
    </div>
  );
}

function PSB_VehicleEnroll({ theme: th }) {
  return (
    <Card theme={th} title="車輛登錄 · Vehicle Enrollments" subtitle="enroll Tesla FSD 車輛至本實驗" padding={0}
      actions={<Btn theme={th} size="sm" variant="primary" icon="plus">登錄車輛</Btn>}>
      <Table theme={th} columns={[
        { h: '車輛', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
        { h: '車型', k: 'model', w: 100 }, { h: 'VIN', k: 'vin', w: 130, mono: true },
        { h: 'Tesla 整合', w: 130, r: r => <Pill theme={th} tone={r.integ === 'connected' ? 'success' : 'warn'} dot>{r.integ}</Pill> },
        { h: '保險', w: 90, r: r => <Pill theme={th} tone={r.ins ? 'success' : 'danger'}>{r.ins ? '有效' : '缺'}</Pill> },
        { h: '登錄狀態', w: 110, r: r => <Pill theme={th} tone={r.enrolled ? 'success' : 'neutral'} dot>{r.enrolled ? 'enrolled' : 'pending'}</Pill> },
      ]} rows={[
        { id: 'AV-7720', model: 'Model Y', vin: '5YJ•••••220', integ: 'connected', ins: true, enrolled: true },
        { id: 'AV-7732', model: 'Model 3', vin: '5YJ•••••732', integ: 'connected', ins: true, enrolled: true },
        { id: 'AV-7708', model: 'Model Y', vin: '5YJ•••••708', integ: 'provider_unreachable', ins: true, enrolled: false },
      ]} />
    </Card>
  );
}

function PSB_OperatorQual({ theme: th }) {
  return (
    <Card theme={th} title="安全員資格 · Safety Operator Qualifications" subtitle="核定可上線安全員" padding={0}
      actions={<Btn theme={th} size="sm" variant="primary" icon="plus">核定資格</Btn>}>
      <Table theme={th} columns={[
        { h: '安全員', w: 130, r: r => <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 10.5, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id}</div></div> },
        { h: '訓練', w: 90, r: r => <Pill theme={th} tone={r.train ? 'success' : 'warn'}>{r.train ? '完成' : '待補'}</Pill> },
        { h: '接管演練', w: 100, r: r => <Pill theme={th} tone={r.drill ? 'success' : 'warn'}>{r.drill ? '通過' : '待測'}</Pill> },
        { h: '背景審查', w: 100, r: r => <Pill theme={th} tone={r.bg ? 'success' : 'neutral'}>{r.bg ? '通過' : '審核中'}</Pill> },
        { h: '資格', w: 110, r: r => <Pill theme={th} tone={r.qualified ? 'success' : 'warn'} dot>{r.qualified ? 'qualified' : 'pending'}</Pill> },
      ]} rows={[
        { name: '陳柏宇', id: 'SO-2024-0118', train: true, drill: true, bg: false, qualified: false },
        { name: '吳明翰', id: 'SO-2024-0120', train: true, drill: true, bg: true, qualified: true },
        { name: '林佳蓉', id: 'SO-2024-0122', train: true, drill: true, bg: true, qualified: true },
      ]} />
    </Card>
  );
}

function PSB_TeslaIntegration({ theme: th }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <Card theme={th} title="Tesla 整合 · Regulatory Data Interface" subtitle="adapter + capability profile">
        <DL theme={th} cols={1} items={[
          { k: 'endpoint', v: 'gated · 待契約', mono: true }, { k: 'auth', v: 'gated · 待契約', mono: true },
          { k: 'schema 版本', v: 'v1.2 (capability)', mono: true }, { k: 'reason-code 字典', v: '部分 · capability', mono: false },
          { k: '事故影像', v: 'not_exposed (fail-closed)', mono: true }, { k: 'data residency', v: '待裁定', mono: false },
        ]} />
        <div style={{ marginTop: 10 }}><Banner theme={th} tone="warn" icon="warn" body="真實 endpoint / auth / SLA 缺值，以 capability profile gated；缺值期間相關能力 fail-closed。" /></div>
      </Card>
      <Card theme={th} title="能力旗標 · capability flags">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[['telemetry_stream', true], ['regulatory_event_feed', true], ['incident_video', false], ['disengagement_reason', true], ['sla_metrics', false]].map(([k, on], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
              <MgmtIcon name={on ? 'check' : 'x'} size={14} style={{ color: on ? th.success : th.textDim }} />
              <span style={{ flex: 1, fontFamily: SHELL_MONO, fontSize: 11.5 }}>{k}</span>
              <Pill theme={th} tone={on ? 'success' : 'neutral'}>{on ? 'enabled' : 'gated'}</Pill>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PSB_Capabilities({ theme: th }) {
  return (
    <Card theme={th} title="監理能力 · Regulatory Capabilities" subtitle="jurisdiction profile 對應的能力與限制">
      <DL theme={th} cols={2} items={[
        { k: '管轄區', v: '台北市', mono: false }, { k: 'jurisdiction profile', v: 'jp_taipei_fsd', mono: true },
        { k: '最大車輛數', v: '10', mono: true }, { k: '最大趟次/日', v: '200 (policy)', mono: true },
        { k: '最大里程/日', v: '1,500 km (policy)', mono: true }, { k: '允許時段', v: '08:00–18:00', mono: true },
        { k: '保險最低額', v: 'NT$ 30M (policy)', mono: true }, { k: '安全員必備', v: '是 · 隨車', mono: false },
      ]} />
      <div style={{ marginTop: 10 }}><Banner theme={th} tone="neutral" icon="info" body="數值為 policy snapshot 佔位，實際核准條件待主管機關核准函確認後寫入。" /></div>
    </Card>
  );
}

function PSB_Policies({ theme: th }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <Card theme={th} title="證據與保存政策" subtitle="Evidence & Retention">
        <DL theme={th} cols={1} items={[
          { k: '一般影像保存', v: '30 天 (policy)', mono: true }, { k: '事故影像保存', v: '3 年 (policy)', mono: true },
          { k: '封存雜湊', v: 'SHA-256 · append-only', mono: true }, { k: 'legal hold', v: '支援 · 凍結刪除', mono: false },
        ]} />
      </Card>
      <Card theme={th} title="通報政策" subtitle="Reporting Policies">
        <DL theme={th} cols={1} items={[
          { k: '事故初報', v: '≤ 1 小時 (policy)', mono: true }, { k: '事故結報', v: '≤ 10 日 (policy)', mono: true },
          { k: '週報', v: '每週一 09:00', mono: false }, { k: '通報對象', v: '交通局 / 公路局', mono: false },
        ]} />
      </Card>
    </div>
  );
}

// ── Suspension / Resume ──────────────────────────────────────────────────────
function PA_SandboxSuspend({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="sandbox" breadcrumb={['沙盒治理', '暫停 / 恢復']}
      env="production" actor={PSB_ACTOR} health={PA_HEALTH} refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="暫停 / 恢復 · Suspension / Resume" subtitle="實驗層級緊急控制 · 寫 audit · 連動 readiness" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card theme={th} title="實驗狀態控制">
          {FX_EXPERIMENTS.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: i < FX_EXPERIMENTS.length - 1 ? '1px solid ' + th.borderSoft : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                <div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{e.id}</div>
              </div>
              <Pill theme={th} tone={expTone(e.status)} dot>{e.status}</Pill>
              {e.status === 'active'
                ? <ActionButton theme={th} size="xs" descriptor={{ action: 'suspend', enabled: true, riskLevel: 'high', requiresReason: true }} label="暫停" en="suspend" />
                : e.status === 'suspended'
                  ? <ActionButton theme={th} size="xs" descriptor={{ action: 'resume', enabled: true, riskLevel: 'medium', requiresReason: true }} label="恢復" en="resume" />
                  : <span style={{ width: 60 }} />}
            </div>
          ))}
        </Card>
        <Card theme={th} title="暫停影響" subtitle="suspend effects">
          <Banner theme={th} tone="danger" icon="warn" title="暫停將立即生效"
            body="暫停實驗會使所屬車輛 readiness 轉 suspended、停止新派遣、要求進行中行程安全收尾。動作寫入 audit 並通知 ROC 與安全員。" />
          <div style={{ marginTop: 12 }}>
            <DL theme={th} cols={1} items={[
              { k: '受影響車輛', v: '5', mono: true }, { k: '進行中行程', v: '3 · 需收尾', mono: false },
              { k: '通知對象', v: 'ROC / 安全員 / 主管機關', mono: false },
            ]} />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  PSB_ACTOR, FX_EXPERIMENTS, expTone,
  PA_Experiments, PA_ExperimentDetail, PSB_AreasEditor, PSB_VehicleEnroll, PSB_OperatorQual,
  PSB_TeslaIntegration, PSB_Capabilities, PSB_Policies, PA_SandboxSuspend,
});
