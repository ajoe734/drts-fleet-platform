// fleet-screens.jsx — Fleet Partner Portal: 10 routes per spec § E2.
// Reuses mgmt shell/primitives/auth. Emerald accent. service-product aware.

const FLP_NAV = [
  { divider: '工作面 · Workspace' },
  { key: 'dashboard',  icon: 'dashboard',   label: '營運總覽 · Dashboard' },
  { divider: '供給管理 · Supply' },
  { key: 'supply',     icon: 'dashboard',   label: '送件總覽 · Supply', badge: '5', badgeTone: 'accent' },
  { key: 'submissions',icon: 'audit',       label: '送件紀錄 · Submissions' },
  { key: 'drivers',    icon: 'users',       label: '司機 · Drivers', badge: '128', badgeTone: 'accent' },
  { key: 'vehicles',   icon: 'vehicles',    label: '車輛 · Vehicles' },
  { key: 'trips',      icon: 'dispatch',    label: '趟次 · Trips' },
  { divider: '分潤 · Revenue' },
  { key: 'revenue',    icon: 'revenue',     label: '分潤 · Revenue Share' },
  { key: 'statements', icon: 'billing',     label: '對帳單 · Statements' },
  { divider: '品質與責任 · Quality & Responsibility' },
  { key: 'documents',  icon: 'audit',       label: '文件 · Documents', badge: '4', badgeTone: 'warn' },
  { key: 'training',   icon: 'reports',     label: '訓練 · Training' },
  { key: 'cases',      icon: 'incidents',   label: '事故 / 申訴 · Incidents', badge: '3', badgeTone: 'danger' },
  { key: 'quality',    icon: 'health',      label: '品質指標 · Quality Metrics' },
];

const FLP_HEALTH = { status: 'healthy', lastCheckedAt: '9s' };
const FLP_ACTOR  = { name: 'CH', display: '陳家豪', role: 'flp_admin' };

// Service-product chip
function SvcChip({ theme: th, svc }) {
  const s = SVC_LABELS[svc] || { zh: svc, tone: 'neutral' };
  return <Pill theme={th} tone={s.tone}>{s.zh}</Pill>;
}
function SvcChips({ theme: th, list }) {
  return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{(list || []).map(s => <SvcChip key={s} theme={th} svc={s} />)}</div>;
}

function FlpShell({ theme: th, active, breadcrumb, children, refreshTier = 'medium', dataFreshness = 'fresh', healthBanner }) {
  return (
    <Shell theme={th} nav={FLP_NAV} active={active} breadcrumb={breadcrumb}
      env="production" tenant="METRO_FLEET" actor={FLP_ACTOR} health={FLP_HEALTH}
      refreshTier={refreshTier} dataFreshness={dataFreshness} healthBanner={healthBanner}>
      {children}
    </Shell>
  );
}

// ── 1. /dashboard ───────────────────────────────────────────────────────────
function FLP_Dashboard({ theme: th }) {
  return (
    <FlpShell theme={th} active="dashboard" breadcrumb={['營運總覽']}>
      <PageHeader theme={th} title="車行營運總覽" subtitle="大都會車隊 · 2026 年 6 月 · METRO_FLEET"
        actions={<><Btn theme={th} icon="export">匯出</Btn><Btn theme={th} variant="primary" icon="users">招募司機</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="旗下司機數" en="affiliated" value="128" sub="active 96 · offline 32" />
          <Kpi theme={th} label="可接單司機" en="dispatchable" value="96" delta="↑ 4" deltaTone="up" />
          <Kpi theme={th} label="本月完成趟次" en="trips_mtd" value="14,280" delta="↑ 8.8%" deltaTone="up" />
          <Kpi theme={th} label="本月車行分潤" en="commission_mtd" value="NT$ 642K" delta="待確認" deltaTone="neutral" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="缺件司機" en="missing_docs" value="7" deltaTone="warn" delta="證照 / 保險" />
          <Kpi theme={th} label="事故 / 申訴" en="cases" value="3" deltaTone="down" delta="需處理 1" />
          <Kpi theme={th} label="訓練完成率" en="training_rate" value="92%" />
          <Kpi theme={th} label="本月總營收" en="gross_mtd" value="NT$ 2.14M" sub="分潤前" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
          <Card theme={th} title="需要您處理" subtitle="文件缺件 → 品質責任 → 訓練落後">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Banner theme={th} tone="warn" icon="warn" title="吳鎮宇 缺機場接送資格證 · airport_permit missing"
                body="缺件期間無法接機場接送任務。請協助補件。" actions={<Btn theme={th} variant="secondary">前往文件</Btn>} />
              <Banner theme={th} tone="danger" icon="warn" title="cmp_0908 · 司機行為申訴 · 車行責任 · SLA breached"
                body="黃文豪 言語不當申訴升級，責任歸屬車行。需於 24h 內回覆處理方案。" actions={<Btn theme={th} variant="primary">前往案件</Btn>} />
              <Banner theme={th} tone="warn" icon="warn" title="保險代步流程訓練完成率 55%"
                body="22 / 40 司機完成。未完成者無法接保險代步任務。" actions={<Btn theme={th} variant="secondary">前往訓練</Btn>} />
            </div>
          </Card>
          <Card theme={th} title="服務別供給" subtitle="可接各 service product 的司機數">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { svc: 'realtime', n: 96, pct: 100 },
                { svc: 'business', n: 64, pct: 67 },
                { svc: 'airport', n: 38, pct: 40 },
                { svc: 'insurance', n: 22, pct: 23 },
                { svc: 'travel', n: 18, pct: 19 },
              ].map(r => (
                <div key={r.svc} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 84 }}><SvcChip theme={th} svc={r.svc} /></div>
                  <div style={{ flex: 1, height: 7, background: th.surfaceLo, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: r.pct + '%', height: '100%', background: th.accent }} />
                  </div>
                  <span style={{ fontFamily: SHELL_MONO, fontSize: 12, width: 34, textAlign: 'right' }}>{r.n}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card theme={th} title="近期趟次 · top 5" padding={0} actions={<Btn theme={th} variant="ghost">前往趟次</Btn>}>
          <Table theme={th} columns={[
            { h: 'ORDER', k: 'id', w: 110, mono: true },
            { h: 'SERVICE', w: 120, r: r => <SvcChip theme={th} svc={r.svc} /> },
            { h: 'DRIVER', k: 'driver', w: 100 },
            { h: 'TENANT', k: 'tenant', w: 130, mono: true },
            { h: 'FARE', k: 'fare', w: 110, mono: true, align: 'right' },
            { h: '車行分潤', k: 'commission', w: 110, mono: true, align: 'right' },
            { h: 'STATUS', w: 120, r: r => <Pill theme={th} tone={r.status === 'completed' ? 'success' : r.status === 'cancelled' ? 'danger' : 'info'} dot>{r.status}</Pill> },
          ]} rows={FX_FLEET_TRIPS.slice(0, 5)} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 2. /drivers ─────────────────────────────────────────────────────────────
function FLP_Drivers({ theme: th }) {
  return (
    <FlpShell theme={th} active="drivers" breadcrumb={['供給管理', '司機']}>
      <PageHeader theme={th} title="司機" subtitle="旗下司機歸屬 · 服務資格 · 文件 / 訓練狀態"
        tabs={[
          { id: 'all', label: '全部', badge: '128' },
          { id: 'dispatchable', label: '可接單', badge: '96', tone: 'accent' },
          { id: 'missing', label: '缺件', badge: '7', tone: 'warn' },
          { id: 'training', label: '訓練未完成', badge: '12', tone: 'warn' },
        ]}
        activeTab="all"
        actions={<><Btn theme={th} icon="filter">服務資格</Btn><Btn theme={th} variant="primary" icon="users">招募司機</Btn></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'DRIVER', w: 170, r: r => <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id} · {r.plate}</div></div> },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'available' ? 'success' : r.status === 'on_trip' ? 'info' : r.status === 'break' ? 'warn' : 'neutral'} dot>{r.status}</Pill> },
            { h: '可接服務 · service eligibility', w: 280, r: r => <SvcChips theme={th} list={r.svc} /> },
            { h: 'LICENSE', w: 120, r: r => r.license === 'valid' ? <Pill theme={th} tone="success">valid</Pill> : <Pill theme={th} tone="warn" dot>{r.license}</Pill> },
            { h: 'DOCS', w: 110, r: r => r.docs === 'complete' ? <Pill theme={th} tone="success">complete</Pill> : <Pill theme={th} tone="warn" dot>{r.docs}</Pill> },
            { h: 'TRAINING', w: 110, r: r => r.training === 'complete' ? <Pill theme={th} tone="success">complete</Pill> : <Pill theme={th} tone="warn" dot>{r.training}</Pill> },
            { h: '30天趟次', k: 'trips30', w: 90, mono: true, align: 'right' },
            { h: '評分', k: 'rating', w: 70, mono: true, align: 'right' },
          ]} rows={FX_FLEET_DRIVERS} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 3. /vehicles ────────────────────────────────────────────────────────────
function FLP_Vehicles({ theme: th }) {
  return (
    <FlpShell theme={th} active="vehicles" breadcrumb={['供給管理', '車輛']}>
      <PageHeader theme={th} title="車輛" subtitle="車輛狀態 · 服務資格 · 保險與檢驗"
        actions={<><Btn theme={th} icon="filter">篩選</Btn><Btn theme={th} variant="primary" icon="plus">新增車輛</Btn></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'PLATE', k: 'plate', w: 120, mono: true, r: r => <span style={{ fontWeight: 600 }}>{r.plate}</span> },
            { h: 'MODEL', k: 'model', w: 160 },
            { h: 'YEAR', k: 'year', w: 70, mono: true, align: 'right' },
            { h: 'DRIVER', k: 'driver', w: 100 },
            { h: '可接服務 · vehicle eligibility', w: 260, r: r => <SvcChips theme={th} list={r.svc} /> },
            { h: 'INSURANCE', k: 'insurance', w: 120, mono: true },
            { h: 'INSPECTION', w: 120, r: r => r.inspection === 'ok' ? <Pill theme={th} tone="success">ok</Pill> : <Pill theme={th} tone="warn" dot>{r.inspection}</Pill> },
            { h: 'STATUS', w: 120, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : 'warn'} dot>{r.status}</Pill> },
          ]} rows={FX_FLEET_VEHICLES} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 4. /trips ───────────────────────────────────────────────────────────────
function FLP_Trips({ theme: th }) {
  return (
    <FlpShell theme={th} active="trips" breadcrumb={['供給管理', '趟次']}>
      <PageHeader theme={th} title="趟次" subtitle="旗下司機所有趟次 · 含分潤金額 · service product"
        tabs={[
          { id: 'all', label: '全部' },
          { id: 'realtime', label: '即時叫車' },
          { id: 'business', label: '商務派車' },
          { id: 'airport', label: '機場接送' },
          { id: 'insurance', label: '保險代步' },
          { id: 'travel', label: '旅行社接送' },
        ]}
        activeTab="all"
        actions={<><Btn theme={th} icon="filter">期別</Btn><Btn theme={th} icon="export">匯出</Btn></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ORDER', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'SERVICE', w: 120, r: r => <SvcChip theme={th} svc={r.svc} /> },
            { h: 'DRIVER', k: 'driver', w: 100 },
            { h: 'TENANT', k: 'tenant', w: 130, mono: true },
            { h: 'PICKUP', k: 'pickup', w: 220 },
            { h: 'FARE', k: 'fare', w: 110, mono: true, align: 'right' },
            { h: '車行分潤', k: 'commission', w: 110, mono: true, align: 'right' },
            { h: 'STATUS', w: 120, r: r => <Pill theme={th} tone={r.status === 'completed' ? 'success' : r.status === 'cancelled' ? 'danger' : 'info'} dot>{r.status}</Pill> },
            { h: 'DATE', k: 'date', w: 110, mono: true },
          ]} rows={FX_FLEET_TRIPS} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 5. /revenue ─────────────────────────────────────────────────────────────
function FLP_Revenue({ theme: th }) {
  const s = FX_FLEET_STATEMENT;
  return (
    <FlpShell theme={th} active="revenue" breadcrumb={['分潤', '分潤總覽']} refreshTier="medium_slow">
      <PageHeader theme={th} title="分潤 · Revenue Share" subtitle="當期分潤組成 · 逐趟 / 獎金 / 管理費 / 罰則"
        actions={<><Btn theme={th} icon="filter">期別</Btn><Btn theme={th} icon="export">匯出明細</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <Card theme={th} title={`當期分潤 · ${s.period}`} subtitle="組成明細 · 後端計算為準">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {s.lines.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + th.border, fontSize: 13 }}>
                <BiLabel theme={th} zh={l.k.split(' · ')[0]} en={l.en} size={13} />
                <span style={{ fontFamily: SHELL_MONO, fontWeight: 600, color: l.sign === '−' ? th.danger : th.text }}>{l.sign === '−' ? '− ' : '+ '}{l.v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 2px' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>應付金額 · payable</span>
              <span style={{ fontFamily: SHELL_MONO, fontWeight: 700, fontSize: 20, color: th.accent }}>{s.payable}</span>
            </div>
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="分潤規則 · revenue share rules">
            <DL theme={th} cols={1} items={[
              { k: '逐趟分潤比例', v: '70 / 30 (車行 / 平台)', mono: true },
              { k: '機場接送加成', v: '+ 5% commission', mono: true },
              { k: '管理費', v: 'NT$ 36,000 / 月固定', mono: true },
              { k: '招募獎金', v: 'NT$ 3,000 / 新司機 (滿 30 趟)', mono: true },
              { k: '罰則觸發', v: 'SLA breach · 重大申訴', mono: true },
              { k: '規則版本', v: 'rsr_v8 · 平台治理發佈', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="動作">
            <Banner theme={th} tone="warn" icon="warn" title="當期對帳單待確認"
              body="2026-05 分潤對帳單已產生，請於 6/10 前確認。" />
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <ActionButton theme={th} descriptor={{ action: 'dispute', enabled: true, riskLevel: 'medium' }} label="提出異議" en="dispute" />
              <ActionButton theme={th} descriptor={{ action: 'confirm', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="check" label="確認對帳單" en="confirm" />
            </div>
          </Card>
        </div>
      </div>
    </FlpShell>
  );
}

// ── 6. /statements ──────────────────────────────────────────────────────────
function FLP_Statements({ theme: th }) {
  return (
    <FlpShell theme={th} active="statements" breadcrumb={['分潤', '對帳單']} refreshTier="manual">
      <PageHeader theme={th} title="對帳單 · Statements" subtitle="月結分潤對帳單 · 可下載簽名 artifact" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'STATEMENT', k: 'id', w: 180, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'PERIOD', k: 'period', w: 120, mono: true },
            { h: 'TRIPS', k: 'trips', w: 110, mono: true, align: 'right' },
            { h: 'PAYABLE', k: 'payable', w: 160, mono: true, align: 'right' },
            { h: 'STATUS', w: 150, r: r => <Pill theme={th} tone={r.status === 'paid' ? 'success' : 'warn'} dot>{r.status}</Pill> },
            { h: 'ISSUED', k: 'issued', w: 130, mono: true },
            { h: 'ACTIONS', w: 160, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'download', enabled: true, riskLevel: 'low' }} icon="download" label="下載" en="dl" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'confirm', enabled: r.status !== 'paid', disabledReasonCode: 'already_paid', riskLevel: 'high', requiresReason: true }} label="確認" en="confirm" />
              </div>
            )},
          ]} rows={FX_FLEET_STATEMENTS} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 7. /documents ───────────────────────────────────────────────────────────
function FLP_Documents({ theme: th }) {
  return (
    <FlpShell theme={th} active="documents" breadcrumb={['品質與責任', '文件']}>
      <PageHeader theme={th} title="文件 · Documents" subtitle="缺件追蹤 · 證照 / 保險 / 服務資格 · owner 區分車行與司機"
        tabs={[
          { id: 'attention', label: '需處理', badge: '4', tone: 'warn' },
          { id: 'all', label: '全部' },
          { id: 'fleet', label: '車行責任', badge: '3' },
          { id: 'driver', label: '司機責任', badge: '1' },
        ]}
        activeTab="attention" />
      <div style={{ padding: 24 }}>
        <Banner theme={th} tone="warn" icon="warn" title="缺件期間影響派工"
          body="缺件或過期文件會使司機 / 車輛無法接對應的 service product 任務。請優先處理機場接送與保險代步相關資格。" />
        <div style={{ height: 12 }} />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'DRIVER', w: 150, r: r => <div><div style={{ fontWeight: 600 }}>{r.driver}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id}</div></div> },
            { h: 'DOCUMENT', w: 220, r: r => <BiLabel theme={th} zh={r.doc} en={r.en} size={13} /> },
            { h: 'STATUS', w: 160, r: r => <Pill theme={th} tone={r.status === 'missing' ? 'danger' : r.status === 'pending_signature' ? 'info' : 'warn'} dot>{r.status}</Pill> },
            { h: 'DUE', k: 'due', w: 130, mono: true },
            { h: 'OWNER', w: 110, r: r => <Pill theme={th} tone={r.owner === 'fleet' ? 'accent' : 'neutral'}>{r.owner}</Pill> },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'remind', enabled: true, riskLevel: 'low' }} label="提醒司機" en="remind" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'upload', enabled: r.owner === 'fleet', disabledReasonCode: 'driver_owned', riskLevel: 'medium' }} label="上傳" en="upload" />
              </div>
            )},
          ]} rows={FX_FLEET_DOCS} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 8. /training ────────────────────────────────────────────────────────────
function FLP_Training({ theme: th }) {
  return (
    <FlpShell theme={th} active="training" breadcrumb={['品質與責任', '訓練']}>
      <PageHeader theme={th} title="訓練 · Training" subtitle="服務訓練完成率 · 未完成者無法接對應 service product" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="整體完成率" en="overall" value="92%" delta="↑ 3pp" deltaTone="up" />
          <Kpi theme={th} label="待完成人次" en="pending" value="48" />
          <Kpi theme={th} label="逾期未完成" en="overdue" value="6" deltaTone="warn" delta="影響派工" />
        </div>
        <Card theme={th} title="課程完成度">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {FX_FLEET_TRAINING.map((c, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <BiLabel theme={th} zh={c.course} en={c.en} size={13} />
                  <span style={{ fontFamily: SHELL_MONO, fontSize: 12, color: th.textMuted }}>{c.completed} / {c.total} · {c.pct}%</span>
                </div>
                <div style={{ height: 8, background: th.surfaceLo, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: c.pct + '%', height: '100%', background: c.pct >= 90 ? th.success : c.pct >= 70 ? th.accent : th.warn }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 9. /cases — incidents / complaints (responsibility view) ────────────────
function FLP_Cases({ theme: th }) {
  return (
    <FlpShell theme={th} active="cases" breadcrumb={['品質與責任', '事故 / 申訴']}>
      <PageHeader theme={th} title="事故 / 申訴" subtitle="責任歸屬車行 / 共同 / 平台 · 車行需處理屬於車行責任的案件"
        tabs={[
          { id: 'all', label: '全部', badge: '3' },
          { id: 'fleet', label: '車行責任', badge: '1', tone: 'danger' },
          { id: 'shared', label: '共同責任', badge: '1' },
          { id: 'closed', label: '已結案' },
        ]}
        activeTab="all" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'CASE', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'TYPE', w: 110, r: r => <Pill theme={th} tone={r.type === 'incident' ? 'danger' : 'warn'}>{r.type}</Pill> },
            { h: 'CATEGORY', k: 'cat', w: 150, mono: true },
            { h: 'DRIVER', k: 'driver', w: 100 },
            { h: 'SEV', w: 90, r: r => <Pill theme={th} tone={r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warn' : 'neutral'} dot>{r.severity}</Pill> },
            { h: '責任歸屬 · responsibility', w: 150, r: r => <Pill theme={th} tone={r.responsibility === 'fleet' ? 'danger' : r.responsibility === 'shared' ? 'warn' : 'neutral'} dot>{r.responsibility}</Pill> },
            { h: 'SLA', w: 110, r: r => <Pill theme={th} tone={r.sla === 'breached' ? 'danger' : 'success'} dot>{r.sla}</Pill> },
            { h: 'STATUS', w: 120, r: r => <Pill theme={th} tone={r.status === 'in_review' ? 'info' : 'warn'} dot>{r.status}</Pill> },
            { h: 'ACTIONS', w: 160, r: r => (
              <ActionButton theme={th} size="xs" descriptor={{ action: 'respond', enabled: r.responsibility !== 'platform', disabledReasonCode: 'platform_owned', riskLevel: 'medium' }} label="回覆處理" en="respond" />
            )},
          ]} rows={FX_FLEET_CASES} />
        </Card>
      </div>
    </FlpShell>
  );
}

// ── 10. /quality ────────────────────────────────────────────────────────────
function FLP_Quality({ theme: th }) {
  return (
    <FlpShell theme={th} active="quality" breadcrumb={['品質與責任', '品質指標']}>
      <PageHeader theme={th} title="品質指標 · Quality Metrics" subtitle="車行整體品質 · 影響分潤績效獎金與合作評等" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {FX_FLEET_QUALITY.map((q, i) => (
            <Kpi key={i} theme={th} label={q.k} en={q.en} value={q.v} delta={q.delta} deltaTone={q.tone === 'success' ? 'up' : q.tone === 'warn' ? 'down' : 'neutral'} />
          ))}
        </div>
        <Card theme={th} title="品質責任說明">
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: th.text, lineHeight: 1.7 }}>
            <li>車行整體品質分數影響每月績效獎金與合作評等。</li>
            <li>司機行為類申訴若責任歸屬車行，計入車行品質指標並可能觸發罰則。</li>
            <li>準點率與完成率以後端計算為準，車行端為唯讀檢視。</li>
            <li>品質指標連續低於門檻將進入合作檢討流程。</li>
          </ol>
        </Card>
      </div>
    </FlpShell>
  );
}

Object.assign(window, {
  FLP_NAV, FLP_HEALTH, FLP_ACTOR, SvcChip, SvcChips, FlpShell,
  FLP_Dashboard, FLP_Drivers, FLP_Vehicles, FLP_Trips, FLP_Revenue,
  FLP_Statements, FLP_Documents, FLP_Training, FLP_Cases, FLP_Quality,
});
