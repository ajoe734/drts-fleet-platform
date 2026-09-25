// platform-screens-2.jsx — Platform Admin (2/3): Fleet / Switchboard / Pricing / Adapter Registry
// Fleet has 6 tabs; Pricing has 4 tabs; Switchboard with placard generation; Adapter registry with split authority (Q-ADM17).

// ─────────────────────────────────────────────────────────────────────────────
// 8. /fleet — multi-tab (Q-ADM08 exclusivity + Q-ADM09 offboarding state machine)
// ─────────────────────────────────────────────────────────────────────────────
const FX_EXCLUSIVITY = [
  { id: 'er_021', scope: 'driver:d_8862 王建民', submitter: 'fleet_admin', submitted: '2026-05-20', state: 'under_review' },
  { id: 'er_020', scope: 'vehicle:ARJ-3502',     submitter: 'fleet_admin', submitted: '2026-05-18', state: 'submitted' },
  { id: 'er_018', scope: 'driver:d_8881 吳鎮宇', submitter: 'fleet_admin', submitted: '2026-05-12', state: 'approved' },
  { id: 'er_017', scope: 'vehicle:ARJ-3308',     submitter: 'fleet_admin', submitted: '2026-05-10', state: 'rejected' },
];

const FX_OFFBOARD = [
  { id: 'off_004', vehicle: 'ARJ-3308', state: 'debranding_pending', initiated: '2026-05-09', evidence: 'photos pending', actor: '陳維 (pa_fleet_gov)' },
  { id: 'off_003', vehicle: 'ARJ-2710', state: 'dispatch_disabled',  initiated: '2026-05-15', evidence: '—', actor: '陳維' },
  { id: 'off_002', vehicle: 'ARJ-2891', state: 'completed',           initiated: '2026-04-12', evidence: 'verified · 2026-04-22', actor: '陳維' },
];

function PA_Fleet({ theme: th, tab = 'vehicles' }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="fleet"
      breadcrumb={['人員與車隊', '車隊與法遵']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="車隊與合規治理"
        subtitle="vehicles · drivers · contracts · device binding · exclusivity reviews · offboarding state machine"
        tabs={[
          { id: 'vehicles', label: 'Vehicles' },
          { id: 'drivers', label: 'Drivers' },
          { id: 'contracts', label: 'Contracts' },
          { id: 'device', label: 'Device Binding' },
          { id: 'exclusivity', label: 'Exclusivity Reviews', badge: '2', tone: 'warn' },
          { id: 'offboard', label: 'Offboarding', badge: '2', tone: 'accent' },
        ]}
        activeTab={tab}
        actions={<>
          <Btn theme={th} icon="filter">篩選</Btn>
          {tab === 'drivers' && <ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="新增司機" en="create" />}
          {tab === 'offboard' && <ActionButton theme={th} descriptor={{ action: 'initiate', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="plus" label="啟動 offboarding" en="initiate" />}
        </>} />

      <div style={{ padding: 24 }}>
        {tab === 'vehicles' && <PA_FleetVehicles theme={th} />}
        {tab === 'drivers' && <PA_FleetDrivers theme={th} />}
        {tab === 'contracts' && <PA_FleetContracts theme={th} />}
        {tab === 'device' && <PA_FleetDevice theme={th} />}
        {tab === 'exclusivity' && <PA_FleetExclusivity theme={th} />}
        {tab === 'offboard' && <PA_FleetOffboard theme={th} />}
      </div>
    </Shell>
  );
}

function PA_FleetVehicles({ theme: th }) {
  return (
    <Card theme={th} padding={0}>
      <Table theme={th} columns={[
        { h: 'PLATE', k: 'plate', w: 130, mono: true },
        { h: 'MODEL', k: 'model', w: 200 },
        { h: 'YEAR', k: 'year', w: 80, mono: true, align: 'right' },
        { h: 'DISPATCHABLE', w: 140, r: r => <Pill theme={th} tone={r.dispatchable ? 'success' : 'danger'} dot>{r.dispatchable ? 'yes' : 'no'}</Pill> },
        { h: 'CONTRACT', k: 'contract', mono: true, w: 110 },
        { h: 'INSURANCE', k: 'insurance', mono: true, w: 130 },
        { h: 'ACTIONS', w: 150, r: () => (
          <div style={{ display: 'flex', gap: 4 }}>
            <ActionButton theme={th} size="xs" descriptor={{ action: 'edit', enabled: true, riskLevel: 'medium' }} label="編輯" en="edit" />
            <Btn theme={th} size="xs" icon="ext">ops 操作面</Btn>
          </div>
        )},
      ]} rows={FX_VEHICLES} />
    </Card>
  );
}

function PA_FleetDrivers({ theme: th }) {
  return (
    <>
      <Banner theme={th} tone="warn" icon="warn"
        title="42 位司機 license 將於 30 天內到期"
        body="dispatch.compliance.license_warn_30d 已啟用 · ops 端會擋下不合規派遣"
        actions={<Btn theme={th} variant="secondary" icon="export">匯出名單</Btn>} />
      <div style={{ height: 12 }} />
      <Card theme={th} padding={0}>
        <Table theme={th} columns={[
          { h: 'DRIVER', w: 200, r: r => <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id}</div></div> },
          { h: 'VEHICLE', k: 'vehicle', w: 130, mono: true },
          { h: 'LICENSE', w: 130, r: r => r.license === 'valid' ? <Pill theme={th} tone="success">valid</Pill> : <Pill theme={th} tone="warn" dot>{r.license}</Pill> },
          { h: 'EXCLUSIVITY', w: 150, r: r => <Pill theme={th} tone={r.exclusivity === 'declared' ? 'success' : 'warn'} dot>{r.exclusivity}</Pill> },
          { h: 'LIFECYCLE', w: 130, r: () => <Pill theme={th} tone="success">active</Pill> },
          { h: 'ACTIONS', w: 180, r: r => (
            <div style={{ display: 'flex', gap: 4 }}>
              <ActionButton theme={th} size="xs" descriptor={{ action: 'lifecycle', enabled: true, riskLevel: 'medium' }} label="更新生命週期" en="lifecycle" />
              <ActionButton theme={th} size="xs" descriptor={{ action: 'suspend', enabled: r.license === 'valid', disabledReasonCode: 'license_invalid', riskLevel: 'high', requiresReason: true }} label="暫停" en="suspend" />
            </div>
          )},
        ]} rows={FX_DRIVERS} />
      </Card>
    </>
  );
}

function PA_FleetContracts({ theme: th }) {
  return (
    <Card theme={th} padding={0}>
      <Table theme={th} columns={[
        { h: 'CONTRACT', k: 'id', w: 110, mono: true },
        { h: 'COUNTERPARTY', k: 'cp', w: 260 },
        { h: 'KIND', k: 'kind', w: 140, mono: true },
        { h: 'TERM', k: 'term', mono: true, w: 220 },
        { h: 'REVENUE SHARE', k: 'rs', mono: true, w: 140 },
        { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.s === 'active' ? 'success' : r.s === 'expiring' ? 'warn' : 'neutral'} dot>{r.s}</Pill> },
      ]} rows={FX_CONTRACTS} />
    </Card>
  );
}

function PA_FleetDevice({ theme: th }) {
  return (
    <Card theme={th} padding={0}>
      <Table theme={th} columns={[
        { h: 'DRIVER', w: 200, r: r => <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id}</div></div> },
        { h: 'DEVICE ID', w: 220, mono: true, r: () => 'dev_' + Math.random().toString(36).slice(2, 11) },
        { h: 'OS', w: 110, mono: true, r: (_, i) => i % 2 === 0 ? 'iOS 17.4' : 'Android 14' },
        { h: 'BOUND AT', w: 130, mono: true, r: () => '2026-01-15' },
        { h: 'LAST SEEN', w: 130, mono: true, r: () => '剛剛' },
        { h: 'ACTIONS', w: 140, r: () => <ActionButton theme={th} size="xs" descriptor={{ action: 'revoke', enabled: true, riskLevel: 'high', requiresReason: true }} label="撤銷綁定" en="revoke" /> },
      ]} rows={FX_DRIVERS} />
    </Card>
  );
}

function PA_FleetExclusivity({ theme: th }) {
  return (
    <>
      <Banner theme={th} tone="info" icon="info"
        title="Exclusivity 治理 · Q-ADM08"
        body="vehicle / driver 的 dispatchable 不可能在 exclusivity 通過前變為 true。這是 hard rule，不可被前端覆蓋。" />
      <div style={{ height: 12 }} />
      <Card theme={th} padding={0}>
        <Table theme={th} columns={[
          { h: 'REVIEW', k: 'id', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
          { h: 'SCOPE', k: 'scope', w: 220, mono: true },
          { h: 'SUBMITTER', k: 'submitter', w: 130 },
          { h: 'SUBMITTED', k: 'submitted', mono: true, w: 130 },
          { h: 'STATE', w: 150, r: r => <Pill theme={th} tone={r.state === 'approved' ? 'success' : r.state === 'rejected' ? 'danger' : r.state === 'under_review' ? 'info' : 'warn'} dot>{r.state}</Pill> },
          { h: 'ACTIONS', w: 220, r: r => (
            <div style={{ display: 'flex', gap: 4 }}>
              <ActionButton theme={th} size="xs" descriptor={{ action: 'approve', enabled: ['submitted', 'under_review'].includes(r.state), disabledReasonCode: 'terminal', riskLevel: 'high', requiresReason: true }} label="核准" en="approve" />
              <ActionButton theme={th} size="xs" descriptor={{ action: 'reject', enabled: ['submitted', 'under_review'].includes(r.state), disabledReasonCode: 'terminal', riskLevel: 'high', requiresReason: true }} label="退回" en="reject" />
            </div>
          )},
        ]} rows={FX_EXCLUSIVITY} />
      </Card>
    </>
  );
}

function PA_FleetOffboard({ theme: th }) {
  const states = ['initiated', 'dispatch_disabled', 'debranding_pending', 'debranding_verified', 'completed'];
  return (
    <>
      <Card theme={th} title="Offboarding state machine · Q-ADM09" subtitle="每一步轉換需 timestamp · actor · evidence · audit">
        <div style={{ display: 'flex', gap: 0, alignItems: 'center', padding: '10px 0' }}>
          {states.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{
                padding: '6px 12px', borderRadius: 999,
                background: i === 0 ? th.successBg : i === 1 ? th.successBg : i === 2 ? th.warnBg : i === 3 ? th.surfaceLo : th.surfaceLo,
                color: i <= 2 ? th.text : th.textDim,
                border: '1px solid ' + (i <= 1 ? th.successBorder : i === 2 ? th.warnBorder : th.border),
                fontSize: 11.5, fontFamily: SHELL_MONO, fontWeight: 600,
              }}>{i + 1}. {s}</div>
              {i < states.length - 1 && <div style={{ flex: 1, height: 2, background: i < 2 ? th.success : th.border, margin: '0 4px' }} />}
            </React.Fragment>
          ))}
        </div>
      </Card>
      <div style={{ height: 12 }} />
      <Card theme={th} padding={0} title="活躍 offboarding 流程">
        <Table theme={th} columns={[
          { h: 'OFFBOARDING', k: 'id', w: 110, mono: true },
          { h: 'VEHICLE', k: 'vehicle', w: 120, mono: true },
          { h: 'CURRENT STATE', w: 180, r: r => <Pill theme={th} tone={r.state === 'completed' ? 'success' : r.state === 'debranding_pending' ? 'warn' : 'info'} dot>{r.state}</Pill> },
          { h: 'INITIATED', k: 'initiated', mono: true, w: 130 },
          { h: 'EVIDENCE', k: 'evidence', w: 220 },
          { h: 'ACTOR', k: 'actor', w: 200 },
          { h: 'ACTIONS', w: 200, r: r => (
            <div style={{ display: 'flex', gap: 4 }}>
              <ActionButton theme={th} size="xs" descriptor={{ action: 'advance', enabled: r.state !== 'completed', disabledReasonCode: 'terminal', riskLevel: 'medium' }} label="推進" en="advance" />
              <ActionButton theme={th} size="xs" descriptor={{ action: 'attach_evidence', enabled: r.state === 'debranding_pending', disabledReasonCode: 'wrong_state', riskLevel: 'medium' }} label="附證據" en="evidence" />
            </div>
          )},
        ]} rows={FX_OFFBOARD} />
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. /switchboard — Public Info & Placards (Q-ADM04/14)
// ─────────────────────────────────────────────────────────────────────────────
function PA_Switchboard({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="switchboard"
      breadcrumb={['平台與商務', '公開資訊與車牌']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="Public Info & Placards"
        subtitle="route name 保留為 /switchboard · 1 個公開資訊版本可產生多個車牌貼 (Q-ADM14)"
        tabs={[{ id: 'versions', label: '版本' }, { id: 'placards', label: '牌貼' }, { id: 'history', label: '歷史' }]}
        activeTab="versions"
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'create_version', enabled: true, riskLevel: 'medium' }} icon="plus" label="建立草稿" en="draft" />
          <ActionButton theme={th} descriptor={{ action: 'publish', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="check" label="發佈版本" en="publish" />
        </>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <Card theme={th} padding={0} title="Public info versions" subtitle="effective from / to · 公開電話 · 狀態">
          <Table theme={th} columns={[
            { h: 'VERSION', k: 'v', w: 100, mono: true },
            { h: 'EFFECTIVE FROM', k: 'from', mono: true, w: 130 },
            { h: 'EFFECTIVE TO', k: 'to', mono: true, w: 130 },
            { h: '叫車電話', k: 'call', mono: true, w: 130 },
            { h: '客訴電話', k: 'complaint', mono: true, w: 130 },
            { h: 'STATUS', w: 100, r: r => <Pill theme={th} tone={r.status === 'published' ? 'success' : r.status === 'draft' ? 'warn' : 'neutral'} dot>{r.status}</Pill> },
            { h: '更新', k: 'updated', mono: true },
          ]} rows={FX_PUBLIC_INFO} />
        </Card>
        <Card theme={th} title="目前發行牌貼 · placard_v9 (source pi_v18)">
          <div style={{ background: '#FCFAF2', border: '1px solid ' + th.border, borderRadius: 8, padding: 14, fontSize: 11.5, lineHeight: 1.55, color: '#1a1a1a' }}>
            <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>大威多元計程車</div>
            <div style={{ borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a', padding: '6px 0', textAlign: 'center', marginBottom: 8, fontWeight: 600 }}>叫車 02-2543-9988 · 客訴 0800-088-122</div>
            <div style={{ fontSize: 10.5 }}>
              <div>車輛編號 ARJ-2891 · 駕駛 林志偉</div>
              <div>計費：起跳 NT$85 · 續跳 NT$5/250m</div>
              <div>支付：現金 / 台灣 Pay / 街口 / 信用卡</div>
              <div style={{ marginTop: 4, color: '#666' }}>placard_v9 · source pi_v18 (2026-04-01 ~ 09-30)</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn theme={th} size="sm" icon="download">下載 PDF</Btn>
            <ActionButton theme={th} size="sm" descriptor={{ action: 'gen_placard', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="產生新 placard" en="generate" />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. /pricing — multi-tab (Q-ADM10/11)
// ─────────────────────────────────────────────────────────────────────────────
const FX_FEE_PLANS = [
  { v: 'fp_v12', name: '2026 Q2 商務車駕酬', status: 'published', scope: 'business', from: '2026-04-01', to: '2026-06-30' },
  { v: 'fp_v13', name: '2026 Q2 標準車駕酬', status: 'published', scope: 'standard', from: '2026-04-01', to: '2026-06-30' },
  { v: 'fp_v14', name: '2026 Q3 草稿',       status: 'draft',     scope: 'business', from: '2026-07-01', to: '2026-09-30' },
];
const FX_SUBSIDY = [
  { v: 'sb_v04', name: '輪椅服務補助',     status: 'published', trigger: 'service=wheelchair', from: '2026-01-01', to: 'open' },
  { v: 'sb_v05', name: '夜間機場接送補助', status: 'published', trigger: 'service=airport && hour∈[22,5]', from: '2026-04-01', to: '2026-06-30' },
];

function PA_Pricing({ theme: th, tab = 'passenger' }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="pricing"
      breadcrumb={['平台與商務', '費率治理']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="Pricing"
        subtitle="draft → published → retired · 發佈為 atomic replace (Q-ADM10)"
        tabs={[
          { id: 'passenger', label: 'Passenger Pricing' },
          { id: 'driver', label: 'Driver Fee Plans' },
          { id: 'subsidy', label: 'Subsidy / Reimbursement' },
          { id: 'history', label: 'Published Versions' },
        ]}
        activeTab={tab}
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'draft', enabled: true, riskLevel: 'medium' }} icon="plus" label="建立草稿" en="draft" />
          <ActionButton theme={th} descriptor={{ action: 'publish', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="check" label="發佈" en="publish" />
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="info"
          title="canonical quoted fare authority"
          body="後端為唯一計價真值；前端任何 manual override 必須走 override governance 並保留 actor type 與必填欄位。" />

        {tab === 'passenger' && (
          <>
            <Card theme={th} padding={0}>
              <Table theme={th} columns={[
                { h: 'VERSION', k: 'v', w: 110, mono: true },
                { h: '名稱', k: 'name', w: 220 },
                { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'published' ? 'success' : 'warn'} dot>{r.status}</Pill> },
                { h: 'SERVICE FEE bps', k: 'serviceFeeBps', mono: true, align: 'right', w: 140 },
                { h: 'REIMBURSE', k: 'reimburse', mono: true, w: 200 },
                { h: 'SCOPE', k: 'scope', mono: true, w: 180 },
                { h: 'EFFECTIVE', w: 220, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.from} → {r.to}</span> },
              ]} rows={FX_PRICING} />
            </Card>
            <Card theme={th} title="服務 bucket fee 拆解 · pr_v23">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { t: 'standard', base: 'NT$ 85 / 起', cont: 'NT$ 5 / 250m', svc: '180 bps' },
                  { t: 'business', base: 'NT$ 120 / 起', cont: 'NT$ 6 / 200m', svc: '220 bps' },
                  { t: 'airport',  base: 'NT$ 180 / 起', cont: 'flat by zone', svc: '250 bps' },
                  { t: 'wheelchair', base: 'NT$ 95 / 起', cont: 'NT$ 5 / 250m', svc: '90 bps · subsidy' },
                ].map(b => (
                  <div key={b.t} style={{ border: '1px solid ' + th.border, borderRadius: 8, padding: 10, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: SHELL_MONO }}>{b.t}</div>
                    <div style={{ color: th.textMuted, lineHeight: 1.55 }}>{b.base}<br />{b.cont}<br /><span style={{ color: th.accent }}>{b.svc}</span></div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {tab === 'driver' && (
          <Card theme={th} padding={0}>
            <Table theme={th} columns={[
              { h: 'VERSION', k: 'v', w: 110, mono: true },
              { h: '名稱', k: 'name', w: 240 },
              { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'published' ? 'success' : 'warn'} dot>{r.status}</Pill> },
              { h: 'SCOPE', k: 'scope', mono: true, w: 160 },
              { h: 'EFFECTIVE', w: 220, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.from} → {r.to}</span> },
            ]} rows={FX_FEE_PLANS} />
          </Card>
        )}

        {tab === 'subsidy' && (
          <Card theme={th} padding={0}>
            <Table theme={th} columns={[
              { h: 'VERSION', k: 'v', w: 110, mono: true },
              { h: '名稱', k: 'name', w: 240 },
              { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'published' ? 'success' : 'warn'} dot>{r.status}</Pill> },
              { h: 'TRIGGER', k: 'trigger', mono: true, w: 300 },
              { h: 'EFFECTIVE', w: 220, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.from} → {r.to}</span> },
            ]} rows={FX_SUBSIDY} />
          </Card>
        )}

        {tab === 'history' && (
          <Card theme={th} padding={0} title="所有已發佈版本 · 跨 tab 歷史">
            <Table theme={th} columns={[
              { h: 'VERSION', w: 110, mono: true, r: r => r.v },
              { h: 'TYPE', w: 140, mono: true, r: r => r.type },
              { h: 'NAME', w: 240, r: r => r.name },
              { h: 'PUBLISHED AT', w: 160, mono: true, r: r => r.publishedAt },
              { h: 'PUBLISHED BY', w: 180, r: r => r.publishedBy },
              { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.s === 'published' ? 'success' : 'neutral'} dot>{r.s}</Pill> },
            ]} rows={[
              { v: 'pr_v24', type: 'passenger', name: '2026 Q2 機場高峰附加', publishedAt: '2026-04-01 09:00', publishedBy: '張薇 (pa_finance_gov)', s: 'published' },
              { v: 'pr_v23', type: 'passenger', name: '2026 Q2 標準商務',     publishedAt: '2026-04-01 09:00', publishedBy: '張薇',  s: 'published' },
              { v: 'fp_v13', type: 'driver_fee',  name: '2026 Q2 標準車駕酬', publishedAt: '2026-04-01 09:30', publishedBy: '張薇', s: 'published' },
              { v: 'fp_v12', type: 'driver_fee',  name: '2026 Q2 商務車駕酬', publishedAt: '2026-04-01 09:30', publishedBy: '張薇', s: 'published' },
              { v: 'pr_v22', type: 'passenger',   name: '2026 Q1 標準商務',   publishedAt: '2026-01-01 00:00', publishedBy: '張薇', s: 'retired' },
              { v: 'sb_v04', type: 'subsidy',     name: '輪椅服務補助',       publishedAt: '2026-01-01 00:00', publishedBy: '張薇', s: 'published' },
            ]} />
          </Card>
        )}
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. /adapter-registry — split authority (Q-ADM17)
// ─────────────────────────────────────────────────────────────────────────────
function PA_AdapterRegistry({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="adapters"
      breadcrumb={['平台與商務', '介接登錄']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="External Platform Adapter Registry"
        subtitle="config / credential 治理在 platform-admin · operational pause / retry 在 ops (Q-ADM17 split)"
        actions={<ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="plus" label="註冊 adapter" en="create" />} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="danger" icon="warn"
          title="mof-bgmt · token 距到期 6 天"
          body="BGMT 派遣回報 token 必須於 2026-05-31 前輪替；否則無法回報今日完成單。"
          actions={<ActionButton theme={th} descriptor={{ action: 'rotate', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="refresh" label="立即輪替" en="rotate" />} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {FX_ADAPTERS.map(a => (
            <Card key={a.id} theme={th}
              title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{a.source}<Pill theme={th} tone={a.kind === 'forwarder' ? 'info' : a.kind === 'auth' ? 'accent' : 'neutral'}>{a.kind}</Pill></span>}
              subtitle={a.id}
              actions={<Pill theme={th} tone={a.status === 'healthy' ? 'success' : a.status === 'degraded' ? 'warn' : 'danger'} dot>{a.status}</Pill>}>
              <DL theme={th} cols={3} items={[
                { k: 'LATENCY', v: a.latency, mono: true },
                { k: 'LAST EVENT', v: a.last, mono: true },
                { k: 'ORDERS 24H', v: a.orders24h, mono: true },
              ]} />
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + th.border, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'edit_credential', enabled: true, riskLevel: 'high', requiresReason: true }} icon="key" label="編輯 credential" en="cred" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'rotate', enabled: true, riskLevel: 'high', requiresReason: true }} icon="refresh" label="輪替" en="rotate" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'disable', enabled: a.status === 'healthy', disabledReasonCode: 'already_degraded', riskLevel: 'high', requiresReason: true }} label="停用" en="disable" />
                {a.kind === 'forwarder' && (
                  <ActionButton theme={th} size="xs" descriptor={{ action: 'ops_pause', enabled: true, riskLevel: 'medium' }} label="ops pause (TTL)" en="pause" />
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  FX_EXCLUSIVITY, FX_OFFBOARD, FX_FEE_PLANS, FX_SUBSIDY,
  PA_Fleet, PA_FleetVehicles, PA_FleetDrivers, PA_FleetContracts,
  PA_FleetDevice, PA_FleetExclusivity, PA_FleetOffboard,
  PA_Switchboard, PA_Pricing, PA_AdapterRegistry,
});
