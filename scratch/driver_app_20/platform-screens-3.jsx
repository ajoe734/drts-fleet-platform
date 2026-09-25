// platform-screens-3.jsx — Platform Admin (3/3): Payments / Reimbursements / Health / Notices / Audit (with hold + exception badges) / Feature Flags

// ─────────────────────────────────────────────────────────────────────────────
// 12. /payments — settlement + reconciliation (mutation here per Q-ADM13)
// ─────────────────────────────────────────────────────────────────────────────
function PA_Payments({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="payments"
      breadcrumb={['結算與帳務', '結算治理']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="結算治理"
        subtitle="invoice · driver statement · reconciliation · 對應 ops 為 read-only mirror"
        tabs={[
          { id: 'matrix', label: 'Settlement matrix' },
          { id: 'invoices', label: 'Tenant invoices' },
          { id: 'statements', label: 'Driver statements' },
          { id: 'reimburse', label: 'Reimbursements →', badge: '4', tone: 'accent' },
          { id: 'recon', label: 'Reconciliation issues', badge: '3', tone: 'warn' },
        ]}
        activeTab="recon"
        actions={<>
          <Btn theme={th} icon="export">匯出</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create_issue', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="開立 issue" en="create" />
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="outstanding" en="outstanding" value="3" sub="2 partner · 1 forwarded" />
          <Kpi theme={th} label="差額累計" en="diff_total" value="NT$ 2,232" delta="↑ 8.4%" deltaTone="down" sub="vs 上週" />
          <Kpi theme={th} label="平均處理" en="avg_handling" value="14h" delta="↓ 2h" deltaTone="up" sub="last 7 days" />
          <Kpi theme={th} label="reopen 率" en="reopen_rate" value="6.2%" delta="warn 閾值 5%" deltaTone="down" sub="last 30 days" />
        </div>

        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ISSUE', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'SOURCE', k: 'source', w: 130 },
            { h: 'TYPE', k: 'issue', w: 200, mono: true, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.issue}</span> },
            { h: 'TENANT', k: 'tenant', w: 120, mono: true },
            { h: 'EXTERNAL ORDER', k: 'external', w: 160, mono: true },
            { h: 'AMOUNT', k: 'amount', w: 180, mono: true },
            { h: 'OWNER', k: 'owner', w: 90 },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'resolved' ? 'success' : r.status === 'reopened' ? 'danger' : r.status === 'in_review' ? 'info' : 'warn'} dot>{r.status}</Pill> },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'assign', enabled: true, riskLevel: 'medium' }} label="指派" en="assign" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'resolve', enabled: r.status !== 'resolved', disabledReasonCode: 'already_resolved', riskLevel: 'high', requiresReason: true }} label="結案" en="resolve" />
              </div>
            )},
          ]} rows={FX_RECON} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. /payments/reimbursements — NEW per Q-ADM12
// ─────────────────────────────────────────────────────────────────────────────
const FX_REIMBURSE = [
  { id: 'rb_2026_05_001', scope: 'partner:CTBC', amount: 'NT$ 1,420,800', state: 'pending_approval', submitter: '張薇', submittedAt: '2026-05-24 11:00', updated: '2026-05-25 09:14' },
  { id: 'rb_2026_05_002', scope: 'partner:CATHAY', amount: 'NT$ 982,300', state: 'approved', submitter: '張薇', submittedAt: '2026-05-23 11:00', updated: '2026-05-24 16:42' },
  { id: 'rb_2026_05_003', scope: 'forwarded:SRX', amount: 'NT$ 612,000', state: 'exported', submitter: '張薇', submittedAt: '2026-05-22 11:00', updated: '2026-05-25 03:11' },
  { id: 'rb_2026_05_004', scope: 'partner:CTBC', amount: 'NT$ 1,820 diff', state: 'draft', submitter: '張薇', submittedAt: '2026-05-25 14:00', updated: '2026-05-25 14:00' },
  { id: 'rb_2026_04_007', scope: 'partner:CATHAY', amount: 'NT$ 854,210', state: 'paid', submitter: '張薇', submittedAt: '2026-05-08 11:00', updated: '2026-05-10 09:00' },
  { id: 'rb_2026_04_008', scope: 'forwarded:SRX', amount: 'NT$ 540,200', state: 'reconciled', submitter: '張薇', submittedAt: '2026-05-08 11:00', updated: '2026-05-15 16:00' },
];

function PA_Reimbursements({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="reimburse"
      breadcrumb={['結算與帳務', '代墊批次']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="代墊批次 · Reimbursement batches"
        subtitle="draft → pending_approval → approved → exported → paid → reconciled (Q-ADM12 6 狀態 state machine)"
        tabs={[
          { id: 'all', label: '全部', badge: '6' },
          { id: 'pending', label: 'Pending approval', badge: '1', tone: 'warn' },
          { id: 'exported', label: 'Exported', badge: '1' },
          { id: 'done', label: 'Done', badge: '2' },
        ]}
        activeTab="all" />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'BATCH', k: 'id', w: 200, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'SCOPE', k: 'scope', w: 180, mono: true },
            { h: 'AMOUNT', k: 'amount', w: 160, mono: true },
            { h: 'STATE', w: 170, r: r => <Pill theme={th} tone={r.state === 'paid' || r.state === 'reconciled' ? 'success' : r.state === 'pending_approval' ? 'warn' : r.state === 'draft' ? 'neutral' : 'info'} dot>{r.state}</Pill> },
            { h: 'SUBMITTER', k: 'submitter', w: 100 },
            { h: 'SUBMITTED', k: 'submittedAt', mono: true, w: 150 },
            { h: 'UPDATED', k: 'updated', mono: true, w: 160 },
          ]} rows={FX_REIMBURSE} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. /payments/reimbursements/[batchId] — detail with state machine
// ─────────────────────────────────────────────────────────────────────────────
function PA_ReimbursementDetail({ theme: th }) {
  const b = FX_REIMBURSE[0]; // rb_2026_05_001 · pending_approval
  const states = ['draft', 'pending_approval', 'approved', 'exported', 'paid', 'reconciled'];
  const currentIdx = states.indexOf(b.state);
  return (
    <Shell theme={th} nav={PA_NAV} active="reimburse"
      breadcrumb={['代墊批次', b.id]} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{b.id}<Pill theme={th} tone="warn" dot>{b.state}</Pill></span>}
        subtitle={`${b.scope} · ${b.amount} · ${states.length} 狀態 state machine`}
        actions={<>
          <Btn theme={th} icon="copy">複製評論</Btn>
          <ActionButton theme={th} descriptor={{ action: 'approve', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="check" label="核准" en="approve" />
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card theme={th} title="State machine · Q-ADM12">
          <Stepper theme={th} current={currentIdx} steps={states.map(s => ({ t: s }))} />
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <Card theme={th} title="Header">
            <DL theme={th} cols={2} items={[
              { k: 'BATCH ID', v: b.id, mono: true },
              { k: 'SCOPE', v: b.scope, mono: true },
              { k: 'TOTAL AMOUNT', v: b.amount, mono: true },
              { k: 'STATE', v: b.state, mono: true },
              { k: 'SUBMITTER', v: b.submitter + ' (pa_finance_gov)' },
              { k: 'SUBMITTED AT', v: b.submittedAt, mono: true },
              { k: 'PENDING APPROVER', v: '林宜君 (pa_super_admin)', mono: true },
              { k: 'LINKED RECON', v: 'rec_0089 →', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="State timeline · audit-derived">
            <Timeline theme={th} events={[
              { at: '2026-05-24 11:00', tone: 'accent', t: '建立', actor: b.submitter, actorRealm: 'platform', body: '從 recon issue rec_0089 衍生。' },
              { at: '2026-05-24 11:02', tone: 'accent', t: 'submit for approval', actor: b.submitter, actorRealm: 'platform' },
              { at: '2026-05-25 09:14', tone: 'warn', t: 'waiting approval', actor: 'system', actorRealm: 'system', body: 'pa_super_admin 待簽。' },
            ]} />
          </Card>
        </div>
        <Card theme={th} title="Line items · 3 sources" padding={0}>
          <Table theme={th} dense columns={[
            { h: 'RECIPIENT', w: 240, r: r => r.recipient },
            { h: 'AMOUNT', w: 140, mono: true, align: 'right', r: r => r.amount },
            { h: 'SOURCE REFERENCE', w: 220, mono: true, r: r => r.ref },
            { h: 'NOTE', r: r => r.note },
          ]} rows={[
            { recipient: 'CTBC partner program — World Elite', amount: 'NT$ 994,560', ref: 'partner:ctbc-elite', note: 'sponsor reimbursement Q2-Apr' },
            { recipient: 'CTBC partner program — Infinite', amount: 'NT$ 246,240', ref: 'partner:ctbc-infinite', note: 'sponsor reimbursement Q2-Apr' },
            { recipient: 'CTBC reconciliation adjustment', amount: 'NT$ 180,000', ref: 'recon:rec_0089', note: '差額 NT$ 1,820 × 99 筆' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. /health
// ─────────────────────────────────────────────────────────────────────────────
function PA_Health({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="health"
      breadcrumb={['平台維運', '平台健康']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh"
      healthBanner={<HealthBanner theme={th} {...PA_HEALTH} />}>
      <PageHeader theme={th}
        title="Platform Health"
        subtitle="平台層告警 · dispatch lag · webhook queue · adapter health"
        tabs={[
          { id: 'alerts', label: 'Alerts', badge: '2', tone: 'warn' },
          { id: 'dispatch', label: 'Dispatch' },
          { id: 'webhook', label: 'Webhook' },
          { id: 'filing', label: 'Filing' },
          { id: 'adapters', label: 'Adapters' },
        ]}
        activeTab="alerts"
        actions={<Btn theme={th} icon="refresh">重整</Btn>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="dispatch lag p95" en="dispatch_lag_p95" value="2.4s" delta="ok < 5s" deltaTone="up" />
          <Kpi theme={th} label="webhook queue" en="webhook_queue" value="118" delta="↑ 22" deltaTone="down" sub="p95 410ms" />
          <Kpi theme={th} label="eligibility queue" en="eligibility" value="4" sub="2 卡 BIN 對照失敗" />
          <Kpi theme={th} label="reporting failures 24h" en="rpt_fail" value="0" delta="ok" deltaTone="up" />
        </div>
        <Card theme={th} title="Active alerts · 跨模組告警總覽">
          {FX_HEALTH.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid ' + th.border }}>
              <Pill theme={th} tone={a.tone} dot>{a.route}</Pill>
              <span style={{ flex: 1, fontSize: 12.5 }}>{a.text}</span>
              <span style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>x{a.count}</span>
              <Btn theme={th} variant="ghost" icon="ext" size="xs">查看</Btn>
            </div>
          ))}
        </Card>
        <Card theme={th} title="Adapter inventory · 6 entries" padding={0}>
          <Table theme={th} columns={[
            { h: 'ADAPTER', k: 'id', w: 140, mono: true },
            { h: 'SOURCE', k: 'source', w: 200 },
            { h: 'KIND', k: 'kind', w: 110, mono: true },
            { h: 'STATUS', w: 150, r: r => <Pill theme={th} tone={r.status === 'healthy' ? 'success' : r.status === 'degraded' ? 'warn' : 'danger'} dot>{r.status}</Pill> },
            { h: 'LATENCY', k: 'latency', mono: true, align: 'right', w: 110 },
            { h: 'LAST EVENT', k: 'last', mono: true, w: 130 },
            { h: 'orders 24h', k: 'orders24h', mono: true, align: 'right' },
          ]} rows={FX_ADAPTERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. /notices — multi-tab (Q-ADM03/15)
// ─────────────────────────────────────────────────────────────────────────────
function PA_Notices({ theme: th, tab = 'notices' }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="notices"
      breadcrumb={['平台維運', '公告與維護']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="Notices & Maintenance"
        subtitle="critical / maintenance severity 會推 cross-app banner 到 ops / tenant / driver (Q-ADM15)"
        tabs={[
          { id: 'notices', label: 'Notices', badge: '3' },
          { id: 'maint', label: 'Maintenance Mode' },
          { id: 'history', label: 'Broadcast History' },
        ]}
        activeTab={tab}
        actions={<ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: tab === 'maint' ? 'high' : 'medium', requiresReason: tab === 'maint' }} variant="primary" icon="plus" label={tab === 'maint' ? '進入維護' : '建立公告'} en={tab === 'maint' ? 'maintenance' : 'new'} />} />

      <div style={{ padding: 24 }}>
        {tab === 'notices' && (
          <Card theme={th} padding={0}>
            <Table theme={th} columns={[
              { h: 'ID', k: 'id', w: 90, mono: true },
              { h: '標題', k: 'title' },
              { h: 'SEV', w: 100, r: r => <Pill theme={th} tone={r.sev === 'high' ? 'danger' : r.sev === 'medium' ? 'warn' : 'neutral'} dot>{r.sev}</Pill> },
              { h: '對象', k: 'audience', w: 100, mono: true },
              { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : 'info'} dot>{r.status}</Pill> },
              { h: '更新', k: 'updated', mono: true },
            ]} rows={FX_NOTICES} />
          </Card>
        )}
        {tab === 'maint' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
            <Card theme={th} title="Maintenance mode · 目前狀態" subtitle="關閉中 · 上次啟用 2026-04-12">
              <div style={{ padding: 12, border: '1px solid ' + th.border, borderRadius: 8, background: th.surfaceLo, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>全平台維護模式</span>
                  <Toggle theme={th} on={false} />
                </div>
                <div style={{ fontSize: 11.5, color: th.textMuted, lineHeight: 1.45 }}>啟用後將停止 dispatch · webhook 投遞 · partner 入站。請務必先發佈 maintenance severity notice 以推送 cross-app banner。</div>
              </div>
              <Field theme={th} label="原因 · 內部紀錄"><Input theme={th} ph="例如 5/15 02:00–04:00 計畫性維護" /></Field>
              <Field theme={th} label="預定起始" hint="UTC+8"><Input theme={th} ph="2026-05-15 02:00" mono /></Field>
              <Field theme={th} label="預定結束"><Input theme={th} ph="2026-05-15 04:00" mono /></Field>
              <ActionButton theme={th} descriptor={{ action: 'set_maintenance', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" label="保存維護設定" en="save" />
            </Card>
            <Card theme={th} title="當前 maintenance notice (preview)">
              <Banner theme={th} tone="danger" icon="warn"
                title="2026-05-15 02:00–04:00 計畫性維護 · 派遣暫停"
                body="目標對象：ops · tenant · driver。將同時透過 cross-app banner 推送，並停用該時段所有 dispatch / webhook 投遞。" />
            </Card>
          </div>
        )}
        {tab === 'history' && (
          <Card theme={th} padding={0} title="Broadcast history · 跨 app 投遞結果">
            <Table theme={th} columns={[
              { h: 'NOTICE', w: 100, mono: true, r: r => r.id },
              { h: '標題', w: 280, r: r => r.title },
              { h: 'SEV', w: 100, r: r => <Pill theme={th} tone={r.sev === 'high' ? 'danger' : r.sev === 'medium' ? 'warn' : 'neutral'} dot>{r.sev}</Pill> },
              { h: 'TARGETS', w: 200, r: () => <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>ops · tenant · driver</span> },
              { h: 'DELIVERY', w: 200, r: () => <Pill theme={th} tone="success" dot>delivered 3 / 3</Pill> },
              { h: 'BROADCAST AT', w: 150, mono: true, r: r => r.updated },
            ]} rows={FX_NOTICES} />
          </Card>
        )}
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. /audit — with legal hold + deletion exception badges (Q-ADM16)
// ─────────────────────────────────────────────────────────────────────────────
const FX_AUDIT_HOLD_EXTRA = [
  { at: '2026-05-15 11:20:33', actor: '陳俊宏 (driver)', actorType: 'driver', module: 'incident', action: 'sos.raise', resource: 'inc_0214', req: 'req_FYa312', legalHold: { owner: '林宜君', expires: '2027-05-15' } },
  { at: '2026-05-10 09:14:55', actor: 'system.webhook-engine', actorType: 'system', module: 'webhook', action: 'delivery.fail', resource: 'wh_01·booking.cancelled', req: 'req_FYa288', deletionException: { owner: '王芳', reason: 'pending finance forensics' } },
];

function PA_Audit({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="audit"
      breadcrumb={['平台維運', '稽核與證據']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="manual">
      <PageHeader theme={th}
        title="Audit & Evidence Governance"
        subtitle="append-only · legal hold + deletion exception 透過 badge 顯示 (Q-ADM16)"
        tabs={[
          { id: 'log', label: 'Audit log' },
          { id: 'policy', label: 'Retention policies' },
          { id: 'hold', label: 'Active legal holds', badge: '1', tone: 'warn' },
          { id: 'except', label: 'Deletion exceptions', badge: '1', tone: 'warn' },
        ]}
        activeTab="log"
        actions={<><Btn theme={th} icon="filter">篩選</Btn><Btn theme={th} icon="export">匯出 csv</Btn></>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Pill theme={th} tone="accent" dot>全部 12,442</Pill>
          <Pill theme={th} tone="neutral" dot>reconciliation 31</Pill>
          <Pill theme={th} tone="neutral" dot>callcenter 88</Pill>
          <Pill theme={th} tone="neutral" dot>incident 4</Pill>
          <Pill theme={th} tone="neutral" dot>feature_flag 6</Pill>
          <Pill theme={th} tone="neutral" dot>billing 142</Pill>
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'WHEN', k: 'at', w: 170, mono: true },
            { h: 'ACTOR TYPE', w: 130, r: r => <Pill theme={th} tone={r.actorType === 'staff' ? 'platform' : r.actorType === 'driver' ? 'driver' : r.actorType === 'tenant_api' ? 'tenant' : 'system'} dot>{r.actorType}</Pill> },
            { h: 'ACTOR', k: 'actor', w: 240 },
            { h: 'MODULE', k: 'module', w: 130, mono: true },
            { h: 'ACTION', k: 'action', w: 200, mono: true, r: r => <span style={{ color: th.accent, fontFamily: SHELL_MONO, fontSize: 11 }}>{r.action}</span> },
            { h: 'RESOURCE', w: 220, r: r => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.resource}</span>
                {r.legalHold && (<span title={`legal hold · ${r.legalHold.owner} · expires ${r.legalHold.expires}`}><Pill theme={th} tone="danger"><MgmtIcon name="hold" size={10} style={{ marginRight: 3 }} />HOLD</Pill></span>)}
                {r.deletionException && (<span title={`deletion exception · ${r.deletionException.owner} · ${r.deletionException.reason}`}><Pill theme={th} tone="warn"><MgmtIcon name="lock" size={10} style={{ marginRight: 3 }} />EXEMPT</Pill></span>)}
              </div>
            )},
            { h: 'REQUEST', k: 'req', mono: true },
          ]} rows={[...FX_AUDIT_HOLD_EXTRA, ...FX_AUDIT]} />
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card theme={th} title="Active legal holds · 1">
            <DL theme={th} cols={1} items={[
              { k: 'RESOURCE', v: 'inc_0214 · 司機 SOS critical', mono: true },
              { k: 'OWNER', v: '林宜君 (pa_super_admin)' },
              { k: 'GRANTED AT', v: '2026-05-15 11:25', mono: true },
              { k: 'EXPIRES', v: '2027-05-15', mono: true },
              { k: 'REASON', v: '可能涉及刑事偵查，全資料保留 1 年。' },
            ]} />
          </Card>
          <Card theme={th} title="Deletion exceptions · 1">
            <DL theme={th} cols={1} items={[
              { k: 'RESOURCE', v: 'wh_01 · booking.cancelled deliveries', mono: true },
              { k: 'OWNER', v: '王芳 (pa_ops_risk_gov)' },
              { k: 'GRANTED AT', v: '2026-05-10 09:15', mono: true },
              { k: 'REASON', v: '財務鑑識中，暫不依 retention 自動刪除。' },
              { k: 'REASON CODE', v: 'finance_forensics', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 18. /feature-flags — WRITE authority (Q-X16 only here)
// ─────────────────────────────────────────────────────────────────────────────
function PA_Flags({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="flags"
      breadcrumb={['平台維運', '功能旗標']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="Feature Flags · WRITE authority"
        subtitle="僅此處可寫入 · ops / tenant / driver 走 GET /api/{realm}/feature-flags 唯讀過濾 (Q-X16)"
        meta={<Pill theme={th} tone="accent" dot>writable · only here</Pill>}
        actions={<ActionButton theme={th} descriptor={{ action: 'add_override', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="plus" label="新增 tenant override" en="override" />} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'KEY', k: 'key', w: 380, mono: true, r: r => <span style={{ color: th.text, fontFamily: SHELL_MONO, fontSize: 11.5 }}>{r.key}</span> },
            { h: 'SCOPE', k: 'scope', w: 160, mono: true },
            { h: 'STATE', w: 100, r: r => <Toggle theme={th} on={r.enabled} /> },
            { h: 'UPDATED BY', k: 'updatedBy', w: 200 },
            { h: 'AT', k: 'updatedAt', mono: true },
            { h: 'ACTIONS', w: 180, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'toggle', enabled: true, riskLevel: 'high', requiresReason: true }} label="切換" en="toggle" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'history', enabled: true, riskLevel: 'low' }} label="歷史" en="history" />
              </div>
            )},
          ]} rows={FX_FLAGS} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  FX_REIMBURSE, FX_AUDIT_HOLD_EXTRA,
  PA_Payments, PA_Reimbursements, PA_ReimbursementDetail,
  PA_Health, PA_Notices, PA_Audit, PA_Flags,
});
