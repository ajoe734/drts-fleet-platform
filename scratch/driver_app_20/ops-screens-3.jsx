// ops-screens-3.jsx — Attendance / Maintenance / Drivers / Vehicles / Contracts / Feature Flags

// ─────────────────────────────────────────────────────────────────────────────
// 12. /attendance — shift + attendance monitoring
// ─────────────────────────────────────────────────────────────────────────────
function OC_Attendance({ theme: th }) {
  const drvs = [...FX_DRIVERS, ...FX_DRIVERS.slice(0, 4)];
  return (
    <Shell theme={th} nav={OPS_NAV} active="attendance"
      breadcrumb={['營運監控', '出勤']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="班次與出勤"
        subtitle="2026-05-25 (週一)"
        tabs={[{ id: 'today', label: '今日' }, { id: 'week', label: '本週' }, { id: 'anomaly', label: '異常', badge: '3', tone: 'danger' }]}
        activeTab="today"
        actions={<Btn theme={th} icon="export">匯出</Btn>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="排班司機" en="scheduled" value="884" />
          <Kpi theme={th} label="活躍班次" en="active" value="612" sub="69%" />
          <Kpi theme={th} label="完成班次" en="completed" value="194" />
          <Kpi theme={th} label="異常 / 遲到" en="anomalies" value="11" delta="3 未到" deltaTone="down" />
        </div>
        <Card theme={th} title="當班甘特 · 0–24h">
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', fontSize: 11, gap: '0 8px' }}>
            <div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', color: th.textDim, paddingBottom: 4, borderBottom: '1px solid ' + th.border, fontFamily: SHELL_MONO }}>
              {Array.from({ length: 24 }, (_, i) => <span key={i} style={{ textAlign: 'center' }}>{i.toString().padStart(2, '0')}</span>)}
            </div>
            {drvs.slice(0, 8).map((d, i) => {
              const start = [7, 6, 13, 8, 8, 9, 7, 14][i % 8];
              const end = [19, 18, 25, 20, 20, 21, 19, 26][i % 8];
              const anom = i === 2 || i === 5;
              return (
                <React.Fragment key={i}>
                  <div style={{ padding: '6px 0', borderBottom: '1px dashed ' + th.border, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {anom && <Pill theme={th} tone="warn" dot>異常</Pill>}
                    <span style={{ flex: 1 }}>{d.name}</span>
                  </div>
                  <div style={{ position: 'relative', height: 28, borderBottom: '1px dashed ' + th.border }}>
                    <div style={{
                      position: 'absolute', top: 6, left: (start / 24 * 100) + '%',
                      width: ((Math.min(end, 24) - start) / 24 * 100) + '%', height: 16,
                      background: anom ? th.warnBg : th.accentBg, border: '1px solid ' + (anom ? th.warn : th.accent),
                      borderRadius: 4, color: anom ? th.warn : th.accent, fontSize: 10, paddingLeft: 6, lineHeight: '14px', fontFamily: SHELL_MONO,
                    }}>
                      {start.toString().padStart(2, '0')}–{end.toString().padStart(2, '0')}
                    </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// 13. /maintenance
// ─────────────────────────────────────────────────────────────────────────────
function OC_Maintenance({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="maintenance"
      breadcrumb={['營運監控', '維修保養']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="車輛保修"
        subtitle="工單 · 排程 · 技師 · 影響派遣"
        tabs={[
          { id: 'all', label: '全部', badge: '5' },
          { id: 'scheduled', label: '排程中', badge: '2' },
          { id: 'progress', label: '進行中', badge: '1' },
          { id: 'overdue', label: '逾期', badge: '1', tone: 'danger' },
        ]}
        activeTab="all"
        actions={<ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="開立工單" en="create" />} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'WO', k: 'id', w: 90, mono: true },
            { h: '車輛', k: 'vehicle', w: 120, mono: true },
            { h: '類別', k: 'kind', w: 200 },
            { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={r.overdue ? 'danger' : r.status === 'completed' ? 'success' : r.status === 'in_progress' ? 'info' : 'warn'} dot>{r.status}</Pill> },
            { h: '排定', k: 'sched', mono: true, w: 150 },
            { h: '技師', k: 'tech', w: 90 },
            { h: '費用', k: 'cost', mono: true, align: 'right' },
            { h: 'ACTIONS', w: 160, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'edit', enabled: r.status !== 'completed', disabledReasonCode: 'completed', riskLevel: 'medium' }} label="編輯" en="edit" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'complete', enabled: r.status === 'in_progress', disabledReasonCode: 'not_in_progress', riskLevel: 'medium' }} label="完成" en="complete" />
              </div>
            )},
          ]} rows={FX_MAINT} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. /drivers — registry
// ─────────────────────────────────────────────────────────────────────────────
function OC_Drivers({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="drivers"
      breadcrumb={['主資料', '司機']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="司機"
        subtitle="總表 · 班別 · license · 評分 · earnings drill-down"
        tabs={[
          { id: 'all', label: '全部', badge: '884' },
          { id: 'available', label: '可派', badge: '146', tone: 'accent' },
          { id: 'on_trip', label: '行程中', badge: '432' },
          { id: 'offline', label: '下班', badge: '306' },
          { id: 'license_warn', label: 'License 30 天到期', badge: '42', tone: 'warn' },
          { id: 'suppression', label: 'matching suppression', badge: '1', tone: 'danger' },
        ]}
        activeTab="all"
        actions={<Btn theme={th} icon="filter">篩選</Btn>} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'DRIVER', w: 200, r: r => <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontWeight: 600 }}>{r.name}</span><span style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id} · {r.phone}</span></div> },
            { h: 'VEHICLE', k: 'vehicle', w: 130, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'available' ? 'success' : r.status === 'on_trip' ? 'info' : r.status === 'break' ? 'warn' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'PLATFORMS · 上線', w: 200, r: () => (
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Pill theme={th} tone="success" dot>DRTS</Pill>
                <Pill theme={th} tone="success" dot>SRX</Pill>
                <Pill theme={th} tone="warn" dot>gocab reauth</Pill>
              </div>
            )},
            { h: 'SHIFT', k: 'shift', w: 130, mono: true },
            { h: 'LICENSE', w: 130, r: r => r.license === 'valid' ? <Pill theme={th} tone="success">valid</Pill> : <Pill theme={th} tone="warn" dot>{r.license}</Pill> },
            { h: 'EXCL.', w: 130, r: r => <Pill theme={th} tone={r.exclusivity === 'declared' ? 'success' : 'warn'} dot>{r.exclusivity}</Pill> },
            { h: '評分', k: 'rating', mono: true, align: 'right' },
          ]} rows={FX_DRIVERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. /drivers/[driverId] — driver detail with SOS banner state
// ─────────────────────────────────────────────────────────────────────────────
function OC_DriverDetail({ theme: th, sosActive = true }) {
  const d = FX_DRIVERS[1]; // d_8843 陳俊宏 — currently on the inc_0214 SOS
  return (
    <Shell theme={th} nav={OPS_NAV} active="drivers"
      breadcrumb={['司機', d.id]} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh"
      healthBanner={sosActive ? (
        <div style={{ padding: '12px 24px 0' }}>
          <Banner theme={th} tone="danger" icon="warn"
            title="此司機目前處於 SOS in_response · matching suppression active"
            body="inc_0214 · 24h TTL (until 2026-05-26 14:42) · ops_manager 可延長。此頁所有 dispatch action 已停用。"
            actions={<Btn theme={th} variant="primary" icon="ext">前往 inc_0214</Btn>} />
        </div>
      ) : null}>
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{d.name}<span style={{ fontFamily: SHELL_MONO, fontSize: 12, color: th.textMuted, fontWeight: 500 }}>{d.id}</span></span>}
        subtitle={`${d.phone} · ${d.vehicle} · 班次 ${d.shift}`}
        tabs={[{ id: 'overview', label: 'Overview' }, { id: 'platforms', label: 'Platform bindings' }, { id: 'tasks', label: 'Active tasks' }, { id: 'earnings', label: 'Earnings' }, { id: 'shifts', label: 'Shifts' }, { id: 'incidents', label: 'Incidents', badge: '1', tone: 'danger' }]}
        activeTab="overview"
        actions={<>
          <ActionButton theme={th} descriptor={{ action: 'force_offline', enabled: !sosActive, disabledReasonCode: 'sos_in_response', riskLevel: 'high', requiresReason: true }} label="強制下線 (per platform)" en="force_offline" />
          <ActionButton theme={th} descriptor={{ action: 'request_reauth', enabled: true, riskLevel: 'medium' }} icon="key" label="請司機 re-auth" en="reauth" />
          <ActionButton theme={th} descriptor={{ action: 'suppress', enabled: false, disabledReasonCode: 'already_active', riskLevel: 'high', requiresReason: true }} label="suppress matching" en="suppress" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Platform binding · 3 platforms" padding={0}>
            <Table theme={th} columns={[
              { h: 'PLATFORM', w: 150, mono: true, r: r => r.platform },
              { h: 'ACCOUNT', w: 200, mono: true, r: r => r.account },
              { h: 'STATUS', w: 150, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : r.status === 'reauth_required' ? 'warn' : 'danger'} dot>{r.status}</Pill> },
              { h: 'LAST REAUTH', w: 140, mono: true, r: r => r.last },
              { h: 'CAPABILITY', w: 200, r: r => <span style={{ fontSize: 10.5, color: th.textMuted, fontFamily: SHELL_MONO }}>{r.cap}</span> },
            ]} rows={[
              { platform: 'DRTS (owned)', account: '—', status: 'active', last: 'n/a', cap: 'accept · reject · n/a' },
              { platform: 'SmartRides X', account: 'driver_8821@srx', status: 'active', last: '2026-05-23', cap: 'canRelayAccept · canRelayReject' },
              { platform: 'GoCab', account: 'd_8843@gocab', status: 'reauth_required', last: '2026-04-18', cap: 'canRelayAccept · !canRelayReject' },
            ]} />
          </Card>
          <Card theme={th} title="Active tasks · 1">
            <Table theme={th} dense columns={[
              { h: 'TASK', w: 110, mono: true, r: () => 'ord_8232' },
              { h: 'DOMAIN', w: 110, r: () => <Pill theme={th} tone="accent">owned</Pill> },
              { h: 'STATE', w: 110, r: () => <Pill theme={th} tone="danger" dot>SOS in_response</Pill> },
              { h: 'PICKUP', w: 200, r: () => '台北信義 松仁路 100 號' },
              { h: 'AGE', w: 80, mono: true, r: () => 'sos+2h13m' },
            ]} rows={[{}]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Manual override 紀錄">
            <Timeline theme={th} events={[
              { at: '14:42', tone: 'danger', t: 'SOS triggered', actor: 'd_8843', actorRealm: 'driver', body: '自報，建立 inc_0214。' },
              { at: '14:43', tone: 'warn', t: 'matching suppression', actor: 'system.incident', actorRealm: 'system', body: 'TTL = 24h，由 ops_manager 可延長。' },
            ]} />
          </Card>
          <Card theme={th} title="Failed relay attempts · 0 (24h)">
            <EmptyState theme={th} reason="no_data" compact />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. /vehicles — registry
// ─────────────────────────────────────────────────────────────────────────────
function OC_Vehicles({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="vehicles"
      breadcrumb={['主資料', '車輛']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="車輛"
        subtitle="dispatchable · 合約 · 保險 · debrand"
        tabs={[
          { id: 'all', label: '全部', badge: '5' },
          { id: 'dispatchable', label: '可派', badge: '4' },
          { id: 'offboarding', label: 'Offboarding', badge: '1', tone: 'warn' },
        ]}
        activeTab="all"
        actions={<Btn theme={th} icon="filter">篩選</Btn>} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'PLATE', k: 'plate', w: 130, mono: true, r: r => <span style={{ fontWeight: 600 }}>{r.plate}</span> },
            { h: 'MODEL', k: 'model', w: 200 },
            { h: 'YEAR', k: 'year', w: 80, mono: true, align: 'right' },
            { h: 'DISPATCHABLE', w: 140, r: r => <Pill theme={th} tone={r.dispatchable ? 'success' : 'danger'} dot>{r.dispatchable ? 'yes' : 'no'}</Pill> },
            { h: 'CURRENT DRIVER', w: 130, mono: true, r: () => '—' },
            { h: 'CONTRACT', k: 'contract', mono: true, w: 110 },
            { h: 'INSURANCE', k: 'insurance', mono: true, w: 130 },
            { h: 'DEBRAND DUE', k: 'debrand', mono: true, w: 130 },
          ]} rows={FX_VEHICLES} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. /vehicles/[vehicleId] — NEW per Q-OPS02
// ─────────────────────────────────────────────────────────────────────────────
function OC_VehicleDetail({ theme: th }) {
  const v = FX_VEHICLES[3]; // ARJ-3308 not dispatchable, offboarding scheduled
  return (
    <Shell theme={th} nav={OPS_NAV} active="vehicles"
      breadcrumb={['車輛', v.plate]} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{v.plate}<Pill theme={th} tone="danger" dot>not_dispatchable</Pill><Pill theme={th} tone="warn">offboarding</Pill></span>}
        subtitle={`${v.model} · ${v.year} · contract ${v.contract}`} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Banner theme={th} tone="warn" icon="warn"
            title="此車輛已進入 offboarding state machine"
            body="dispatch_disabled · debranding_pending. 預定 debrand 完成日 2026-06-15。"
            actions={<Btn theme={th} icon="ext">跨 app 至 Platform Admin /fleet · Offboarding</Btn>} />
          <Card theme={th} title="Regulatory profile">
            <DL theme={th} cols={2} items={[
              { k: 'PLATE', v: v.plate, mono: true },
              { k: 'MODEL', v: v.model },
              { k: 'YEAR', v: v.year, mono: true },
              { k: 'DISPATCHABLE', v: 'no (offboarding)', mono: true },
              { k: 'INSURANCE EXPIRY', v: v.insurance, mono: true },
              { k: 'DEBRAND DUE', v: v.debrand, mono: true },
              { k: 'OFFBOARDING STATE', v: 'debranding_pending', mono: true },
              { k: 'CONTRACT', v: v.contract, mono: true },
            ]} />
          </Card>
          <Card theme={th} title="Maintenance records · 近 5 筆" padding={0}>
            <Table theme={th} dense columns={[
              { h: 'WO', k: 'id', w: 90, mono: true },
              { h: '類別', k: 'kind', w: 200 },
              { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={r.overdue ? 'danger' : r.status === 'completed' ? 'success' : 'warn'} dot>{r.status}</Pill> },
              { h: '排定', k: 'sched', mono: true },
            ]} rows={FX_MAINT.slice(0, 5)} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Current driver binding">
            <EmptyState theme={th} reason="not_provisioned" compact messageOverride="此車已 dispatch_disabled，目前無 driver binding。" />
          </Card>
          <Card theme={th} title="Linked incidents · 0 (90 天)">
            <EmptyState theme={th} reason="no_data" compact />
          </Card>
          <Card theme={th} title="Audit subset · vehicle scope">
            <Timeline theme={th} events={[
              { at: '2026-05-08', tone: 'warn', t: 'dispatchable=false', actor: 'fleet_admin', actorRealm: 'platform', body: 'pa_fleet_gov 將車輛標記為 not_dispatchable，進入 offboarding。' },
              { at: '2026-05-09', tone: 'accent', t: 'WO_017 開立', actor: 'system', actorRealm: 'system', body: '年度檢驗工單已建立。' },
              { at: '2026-04-30', tone: 'danger', t: 'WO_017 overdue', actor: 'system.maint', actorRealm: 'system' },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 18. /contracts — registry
// ─────────────────────────────────────────────────────────────────────────────
const FX_CONTRACTS = [
  { id: 'CTR-204', cp: '台北車隊 — 林志偉群組', kind: 'fleet_lease', term: '2025-01-01 → 2026-12-31', rs: '70 / 30', s: 'active' },
  { id: 'CTR-219', cp: '桃園車隊 — 黃文豪群組', kind: 'fleet_lease', term: '2025-04-01 → 2027-03-31', rs: '70 / 30', s: 'active' },
  { id: 'CTR-201', cp: '中部車隊 — 退場中', kind: 'fleet_lease', term: '2024-01-01 → 2026-06-30', rs: '70 / 30', s: 'expiring' },
  { id: 'CTR-310', cp: 'CTBC 中信銀行 partner', kind: 'partner_program', term: '2025-07-01 → 2027-06-30', rs: 'sponsor settle', s: 'active' },
  { id: 'CTR-322', cp: 'CATHAY 國泰世華 partner', kind: 'partner_program', term: '2026-01-01 → 2027-12-31', rs: 'sponsor settle', s: 'active' },
  { id: 'CTR-330', cp: 'SmartRides X forwarder', kind: 'forwarder', term: '2025-09-01 → ongoing', rs: '85 / 15', s: 'active' },
  { id: 'CTR-341', cp: 'GoCab forwarder', kind: 'forwarder', term: '2025-11-01 → ongoing', rs: '85 / 15', s: 'active' },
];

function OC_Contracts({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="contracts"
      breadcrumb={['主資料', '合約']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="合約"
        subtitle="ops 只讀；mutation 走 Platform Admin / Tenant Governance" />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'CONTRACT', k: 'id', w: 110, mono: true },
            { h: 'COUNTERPARTY', k: 'cp', w: 240 },
            { h: 'KIND', k: 'kind', w: 130, mono: true },
            { h: 'TERM', k: 'term', mono: true, w: 220 },
            { h: 'REVENUE SHARE', k: 'rs', mono: true, w: 140 },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.s === 'active' ? 'success' : r.s === 'expiring' ? 'warn' : 'neutral'} dot>{r.s}</Pill> },
          ]} rows={FX_CONTRACTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 19. /contracts/[contractId] — NEW per Q-OPS03 (ops read-only)
// ─────────────────────────────────────────────────────────────────────────────
function OC_ContractDetail({ theme: th }) {
  const c = FX_CONTRACTS[3]; // CTBC partner
  return (
    <Shell theme={th} nav={OPS_NAV} active="contracts"
      breadcrumb={['合約', c.id]} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{c.id}<Pill theme={th} tone="success" dot>active</Pill><Pill theme={th} tone="info">read-only · ops scope</Pill></span>}
        subtitle={`${c.cp} · ${c.kind} · ${c.term}`} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card theme={th} title="Operational terms · ops scope">
          <DL theme={th} cols={2} items={[
            { k: 'MODIFIABLE WINDOW', v: '出車前 30 min', mono: true },
            { k: 'PROOF REQUIREMENTS', v: '取車照片 + 送達簽收照' },
            { k: 'WAITING RULE', v: '免費等候 5 min；之後 NT$ 5 / 分鐘' },
            { k: 'NO-SHOW RULE', v: '15 min 後可宣告 no_show，車資 NT$ 100', mono: true },
            { k: 'SLA PROFILE', v: 'tenant SLA · CTBC_BIZ' },
            { k: 'CURRENT EFFECTIVE VERSION', v: 'v23.4', mono: true },
            { k: 'PARTNER PROGRAM', v: 'CTBC World Elite + Infinite' },
            { k: 'AUTH MODE', v: 'oauth · card_bin eligibility', mono: true },
          ]} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Authority redirect">
            <Banner theme={th} tone="info" icon="info"
              title="Mutation 在 Platform Admin · 跨 app"
              body="合約條款編輯、版本升級、終止流程，請至 Platform Admin /partners。"
              actions={<Btn theme={th} variant="primary" icon="ext">在新分頁開啟 →</Btn>} />
          </Card>
          <Card theme={th} title="Linked tenant / partner">
            <DL theme={th} cols={1} items={[
              { k: 'TENANT', v: 'CTBC_BIZ · 中信銀行 商務尊榮', mono: true },
              { k: 'PARTNER ENTRY', v: '/partner/ctbc-elite', mono: true },
              { k: 'PROGRAM ID', v: 'pe_001', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="Version history · v20–v23.4">
            <Timeline theme={th} events={[
              { at: 'v23.4 · 2026-04-12', tone: 'success', t: 'published', actor: 'pa_partner_mgr', actorRealm: 'platform', body: '新增 World Card subtype eligibility。' },
              { at: 'v23.3 · 2026-03-01', tone: 'accent', t: 'retired', actor: 'pa_partner_mgr', actorRealm: 'platform' },
              { at: 'v23.2 · 2026-01-15', tone: 'accent', t: 'retired', actor: 'pa_partner_mgr', actorRealm: 'platform' },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 20. /feature-flags — ops read-only (Q-X16 per-realm)
// ─────────────────────────────────────────────────────────────────────────────
function OC_FeatureFlags({ theme: th }) {
  return (
    <Shell theme={th} nav={OPS_NAV} active="flags"
      breadcrumb={['功能旗標']} env="production" actor={OPS_ACTOR} health={OPS_HEALTH}
      refreshTier="medium" dataFreshness="fresh">
      <PageHeader theme={th}
        title="功能旗標 · read only"
        subtitle="ops 只看 operational flags · 完整治理在 Platform Admin · 完整列表 endpoint = GET /api/ops/feature-flags"
        actions={<Btn theme={th} icon="ext">前往 Platform Admin /feature-flags</Btn>} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'KEY', k: 'key', w: 400, mono: true, r: r => <span style={{ color: th.text, fontFamily: SHELL_MONO, fontSize: 11.5 }}>{r.key}</span> },
            { h: 'SCOPE', k: 'scope', w: 160, mono: true },
            { h: 'STATE', w: 100, r: r => <Pill theme={th} tone={r.enabled ? 'success' : 'neutral'} dot>{r.enabled ? 'enabled' : 'disabled'}</Pill> },
            { h: 'UPDATED BY', k: 'updatedBy', w: 200 },
            { h: 'AT', k: 'updatedAt', mono: true },
          ]} rows={FX_FLAGS.filter(f => f.scope === 'platform' || f.key.startsWith('dispatch') || f.key.startsWith('forwarder'))} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  FX_CONTRACTS,
  OC_Attendance, OC_Maintenance, OC_Drivers, OC_DriverDetail,
  OC_Vehicles, OC_VehicleDetail, OC_Contracts, OC_ContractDetail, OC_FeatureFlags,
});
