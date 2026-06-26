// platform-screens-1.jsx — Platform Admin (1/3): Home / Tenants / Tenant Governance / Partners / Users
// Authority-aware. zh-TW · raw code bilingual.

// ── Nav per packet § 4.1 ────────────────────────────────────────────────────
const PA_NAV = [
  { divider: '工作面 · Workspace' },
  { key: 'home',         icon: 'home',        label: '平台首頁 · Home' },
  { divider: '租戶治理 · Tenant Governance' },
  { key: 'tenants',      icon: 'tenants',     label: '租戶 · Tenants' },
  { key: 'tenant-gov',   icon: 'governance',  label: '跨租戶治理 · Tenant Governance' },
  { divider: '合作夥伴治理 · Partner Governance' },
  { key: 'partners',     icon: 'partners',    label: '合作夥伴 · Partner Entries' },
  { divider: '人員與車隊 · People & Fleet' },
  { key: 'users',        icon: 'users',       label: '平台人員 · Users' },
  { key: 'fleet',        icon: 'fleet',       label: '車隊與法遵 · Fleet & Compliance' },
  { divider: '平台與商務 · Platform & Commerce' },
  { key: 'switchboard',  icon: 'switchboard', label: '公開資訊 · Public Info & Placards' },
  { key: 'pricing',      icon: 'pricing',     label: '費率治理 · Pricing' },
  { key: 'payments',     icon: 'payments',    label: '結算與帳務 · Payments', badge: '3', badgeTone: 'warn' },
  { key: 'reimburse',    icon: 'reimburse',   label: '代墊批次 · Reimbursements', badge: '4', badgeTone: 'accent' },
  { key: 'adapters',     icon: 'adapters',    label: '平台 Adapter · Registry', badge: '!', badgeTone: 'danger' },
  { divider: '平台維運 · Platform Ops & Risk' },
  { key: 'health',       icon: 'health',      label: '平台健康 · Health', badge: '2', badgeTone: 'warn' },
  { key: 'notices',      icon: 'notices',     label: '公告與維護 · Notices' },
  { key: 'audit',        icon: 'audit',       label: '稽核與證據 · Audit' },
  { key: 'flags',        icon: 'flags',       label: '功能旗標 · Feature Flags · WRITE' },
];

const PA_HEALTH = {
  status: 'degraded', lastCheckedAt: '8s',
  degradedServices: [
    { service: 'mof-bgmt · BGMT 派遣回報', impact: 'token expiring in 6 days', severity: 'critical' },
    { service: 'gocab-v1 forwarder', impact: 'sync_failed 4.2%', severity: 'warning' },
  ],
};
const PA_ACTOR = { name: 'YL', display: '林宜君', role: 'pa_super_admin' };

// ─────────────────────────────────────────────────────────────────────────────
// 1. / — Platform Home
// ─────────────────────────────────────────────────────────────────────────────
function PA_Home({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="home"
      breadcrumb={['平台首頁']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="平台治理工作首頁"
        subtitle="DRTS 平台控制平面 · 您今日有 3 件需治理事項" />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="活躍租戶" en="active_tenants" value="142" delta="+3 月" deltaTone="up" sub="8 pilot · 12 sandbox" />
          <Kpi theme={th} label="合作夥伴 entry" en="partner_entries" value="38" delta="2 待 readiness" deltaTone="neutral" sub="5 銀行 · 33 飯店 / 企業" />
          <Kpi theme={th} label="活躍司機" en="active_drivers" value="884" delta="−12 d/d" deltaTone="down" sub="42 license 30 天到期" />
          <Kpi theme={th} label="待結算對帳" en="open_recon" value="3" delta="2 partner · 1 forwarded" deltaTone="neutral" hint="rec_0091, rec_0090, rec_0089" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
          <Card theme={th} title="今日治理待辦" subtitle="跨模組需要平台治理人介入" actions={<Btn theme={th} variant="ghost" icon="ext">展開所有</Btn>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Banner theme={th} tone="danger" icon="warn"
                title="BGMT 派遣回報 token 將於 6 天內到期"
                body="需於 5/14 前提交新的 client credential，否則無法回報今日完成單。"
                actions={<Btn theme={th} variant="primary">前往 adapter-registry</Btn>} />
              <Banner theme={th} tone="warn" icon="warn"
                title="GoCab forwarded · 24h sync_failed 4.2%"
                body="超過 3% 警戒值。建議檢查 adapter 健康並啟動 manual fallback 觀察。"
                actions={<Btn theme={th} variant="secondary">查看 adapter</Btn>} />
              <Banner theme={th} tone="info" icon="info"
                title="NTU_HOSP 處於 rollback_hold"
                body="客訴 cmp_0894 升級為 inc_0212 後，rollout 已暫停。需平台與營運共識下一步。"
                actions={<Btn theme={th} variant="secondary">查看租戶</Btn>} />
            </div>
          </Card>
          <Card theme={th} title="模組捷徑">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { i: 'tenants', t: '租戶 · Tenants' },
                { i: 'partners', t: '合作夥伴 · Partners' },
                { i: 'pricing', t: '費率 · Pricing' },
                { i: 'payments', t: '結算 · Payments' },
                { i: 'fleet', t: '車隊 · Fleet' },
                { i: 'audit', t: '稽核 · Audit' },
              ].map(c => (
                <div key={c.i} style={{ padding: 10, border: '1px solid ' + th.border, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 7, background: th.accentBg, color: th.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MgmtIcon name={c.i} size={14} /></span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{c.t}</span>
                  <MgmtIcon name="chevR" size={12} style={{ color: th.textDim }} />
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card theme={th} title="近期高敏感操作 · 平台層審計足跡 (24h)" actions={<Btn theme={th} variant="ghost">前往稽核</Btn>}>
          <Table theme={th} columns={[
            { h: '時間', k: 'at', mono: true, w: 170 },
            { h: 'ACTOR TYPE', w: 130, r: r => <Pill theme={th} tone={r.actorType === 'staff' ? 'platform' : r.actorType === 'driver' ? 'driver' : r.actorType === 'tenant_api' ? 'tenant' : 'system'} dot>{r.actorType}</Pill> },
            { h: '模組', k: 'module', w: 130, mono: true },
            { h: '動作', k: 'action', w: 180, mono: true },
            { h: '操作者', k: 'actor' },
            { h: 'request', k: 'req', mono: true, w: 140 },
          ]} rows={FX_AUDIT.slice(0, 5)} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. /tenants — list
// ─────────────────────────────────────────────────────────────────────────────
function PA_Tenants({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="tenants"
      breadcrumb={['租戶治理', '租戶']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="租戶"
        subtitle="管理 tenant 從建立到 production rollout 的完整生命週期"
        tabs={[
          { id: 'all', label: '全部', badge: '142' },
          { id: 'production', label: 'Production', badge: '119', tone: 'accent' },
          { id: 'pilot', label: 'Pilot', badge: '8' },
          { id: 'sandbox', label: 'Sandbox', badge: '12' },
          { id: 'hold', label: 'Rollback hold', badge: '3', tone: 'danger' },
        ]}
        activeTab="all"
        actions={<>
          <Btn theme={th} icon="filter">篩選</Btn>
          <Btn theme={th} icon="export">匯出</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="建立租戶" en="create" />
        </>} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'TENANT', w: 240, r: r => (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                <span style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.code} · {r.id}</span>
              </div>
            )},
            { h: 'STAGE', k: 'stage', w: 130, r: r => <Pill theme={th} tone={r.stage === 'production' ? 'success' : r.stage === 'pilot' ? 'info' : r.stage === 'sandbox' ? 'warn' : 'danger'} dot>{r.stage}</Pill> },
            { h: 'GATE', w: 130, r: r => <Pill theme={th} tone={r.stage === 'production' ? 'success' : r.stage === 'rollback_hold' ? 'danger' : 'warn'}>{r.stage === 'production' ? 'ready' : r.stage === 'rollback_hold' ? 'blocked' : 'pending'}</Pill> },
            { h: 'MODULES', w: 100, mono: true, r: r => `${r.modules}/13` },
            { h: '配額/月', k: 'quota', w: 120, mono: true },
            { h: '介接', k: 'integ', w: 160, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11.5, color: th.textMuted }}>{r.integ}</span> },
            { h: '更新', k: 'updated', w: 120, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.updated}</span> },
          ]} rows={FX_TENANTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. /tenants/[tenantId] — rollout workspace (Q-ADM05/06)
// ─────────────────────────────────────────────────────────────────────────────
function PA_TenantDetail({ theme: th }) {
  const t = FX_TENANTS[3];
  const steps = [
    { t: 'sandbox', s: '建立 · 04-12' },
    { t: 'pilot',   s: 'gate approved' },
    { t: 'production', s: 'cutover 完成' },
    { t: 'rollback_hold ready', s: 'owner: Ken Liao' },
  ];
  return (
    <Shell theme={th} nav={PA_NAV} active="tenants"
      breadcrumb={['租戶', t.name]} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{t.name}<Pill theme={th} tone="success" dot>{t.stage}</Pill></span>}
        subtitle={`${t.code} · ${t.id}`}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'modules', label: 'Modules' },
          { id: 'onboarding', label: 'Onboarding' },
          { id: 'rollout', label: 'Rollout' },
          { id: 'roles', label: 'Roles' },
          { id: 'webhook', label: 'Webhook baseline' },
          { id: 'billing', label: 'Billing baseline' },
          { id: 'audit', label: 'Audit' },
        ]}
        activeTab="rollout"
        actions={<>
          <Btn theme={th} icon="ext">在 Tenant Console 開啟</Btn>
          <ActionButton theme={th} descriptor={{ action: 'rollback_hold', enabled: true, riskLevel: 'high', requiresReason: true }} label="進入 rollback_hold" en="hold" />
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card theme={th} title="Rollout 進度 · state machine"
          subtitle="cutover owner: 林宜君 (Yi-Chun Lin) · rollback owner: Ken Liao (linked user records · Q-ADM06)">
          <div style={{ padding: '6px 0 16px' }}><Stepper theme={th} steps={steps} current={3} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Banner theme={th} tone="success" icon="ok" title="rollbackPrepared = true" body="租戶滿足 production gate 條件。" />
            <Banner theme={th} tone="success" icon="ok" title="role acknowledgements" body="6/6 角色已邀請並確認。" />
            <Banner theme={th} tone="info" icon="info" title="cutover note" body="本次 cutover 於 04-29 22:00 完成，無重大 SLO 觸發。" />
          </div>
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <Card theme={th} title="Onboarding package">
            <DL theme={th} cols={2} items={[
              { k: 'INTEGRATION MODE', v: 'webhook + api', mono: true },
              { k: 'BOOTSTRAP ADMIN', v: 'lh.chang@yamato.tw', mono: true },
              { k: 'SANDBOX BASE URL', v: 'https://sbx.drts.io/t/tsmc_fab18', mono: true },
              { k: 'PRODUCTION BASE URL', v: 'https://api.drts.io/t/tsmc_fab18', mono: true },
              { k: 'BILLING BASELINE', v: 'monthly · NT$ · 25 due', mono: true },
              { k: 'WEBHOOK BASELINE', v: 'booking.* · invoice.* · audit.high', mono: true },
              { k: 'QUOTA / 月', v: '12,000 bookings', mono: true },
              { k: 'REGION', v: 'TW' },
            ]} />
          </Card>
          <Card theme={th} title="Roles & invites · 6/6 acknowledged">
            <Table theme={th} dense columns={[
              { h: 'EMAIL', k: 'e', w: 200, mono: true },
              { h: 'ROLE', k: 'r', w: 150, mono: true },
              { h: 'STATE', w: 90, r: r => <Pill theme={th} tone={r.s === 'ack' ? 'success' : 'warn'} dot>{r.s === 'ack' ? '已確認' : '邀請中'}</Pill> },
            ]} rows={[
              { e: 'lh.chang@yamato.tw', r: 'tc_admin', s: 'ack' },
              { e: 'eva.wang@yamato.tw', r: 'tc_operator', s: 'ack' },
              { e: 'md.tsai@yamato.tw', r: 'tc_finance', s: 'ack' },
              { e: 'ken.liao@yamato.tw', r: 'tc_integration_mgr', s: 'pending' },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. /tenant-governance — NEW separate route per Q-ADM01
// ─────────────────────────────────────────────────────────────────────────────
function PA_TenantGovernance({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="tenant-gov"
      breadcrumb={['租戶治理', '跨租戶治理']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="跨租戶治理"
        subtitle="quota usage · approval backlog · cost-center health · governance risk — Q-ADM01" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="quota 警戒 (>80%)" en="quota_warn" value="14" deltaTone="warn" delta="跨 8 個租戶" sub="thresholdWarning" />
          <Kpi theme={th} label="跨租戶審批 backlog" en="approval_backlog" value="23" delta="ops_approval_triage 處理中" sub="平均 4 min" />
          <Kpi theme={th} label="cost-center 異常" en="cc_anomaly" value="5" sub="超過 month-end 預警" />
          <Kpi theme={th} label="治理風險訊號" en="risk_signals" value="11" sub="hold 3 · expired credential 4 · expiring contract 4" />
        </div>
        <Card theme={th} title="Quota 使用熱圖 · top 8 tenant · 本月">
          <Table theme={th} padding={0} columns={[
            { h: 'TENANT', w: 220, r: r => <span style={{ fontWeight: 600 }}>{r.t}</span> },
            { h: 'PLAN', w: 120, mono: true, r: r => r.plan },
            { h: 'USAGE (MTD)', w: 120, mono: true, align: 'right', r: r => r.used },
            { h: '%', w: 200, r: r => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 6, background: th.surfaceLo, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: r.pct + '%', height: '100%', background: r.pct > 90 ? th.danger : r.pct > 80 ? th.warn : th.success }} />
                </div>
                <span style={{ fontFamily: SHELL_MONO, fontSize: 11, minWidth: 36 }}>{r.pct}%</span>
              </div>
            )},
            { h: 'STATUS', w: 130, r: r => <Pill theme={th} tone={r.pct > 90 ? 'danger' : r.pct > 80 ? 'warn' : 'success'} dot>{r.pct > 90 ? 'over_threshold' : r.pct > 80 ? 'warning' : 'ok'}</Pill> },
          ]} rows={[
            { t: 'TSMC_FAB18',     plan: '12,000/mo',  used: '11,420', pct: 95 },
            { t: 'YAMATO',         plan: '5,000/mo',   used: '4,820',  pct: 96 },
            { t: 'CTBC_BIZ',       plan: '8,000/mo',   used: '7,180',  pct: 90 },
            { t: 'EVA_CREW',       plan: '3,200/mo',   used: '2,710',  pct: 85 },
            { t: 'CATHAY_LIFE',    plan: '2,400/mo',   used: '1,920',  pct: 80 },
            { t: 'NTU_HOSP',       plan: '600/mo',     used: '420',    pct: 70 },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. /partners — entry list
// ─────────────────────────────────────────────────────────────────────────────
function PA_Partners({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="partners"
      breadcrumb={['合作夥伴治理', '合作夥伴']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="合作夥伴 entry"
        subtitle="銀行 / 飯店 / 企業 partner 入口、auth 模式、eligibility、品牌"
        actions={<>
          <Btn theme={th} icon="filter">篩選</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="建立 entry" en="create" />
        </>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ENTRY', w: 220, r: r => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 28, height: 28, borderRadius: 6, background: r.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{r.code.slice(0, 2)}</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{r.bank}</span>
                  <span style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>/{r.slug}</span>
                </div>
              </div>
            )},
            { h: 'PROGRAM', k: 'program', w: 140 },
            { h: 'SUBTYPE', k: 'subtype', w: 150, r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.subtype}</span> },
            { h: 'AUTH', k: 'auth', w: 130, mono: true },
            { h: 'ELIGIBILITY', k: 'eligibility', w: 110, mono: true },
            { h: 'STATUS', w: 100, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : r.status === 'pending' ? 'warn' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'READINESS', w: 180, r: r => r.readiness === 'ok' ? <Pill theme={th} tone="success">ok</Pill> : <Pill theme={th} tone="warn" dot>{r.readiness}</Pill> },
          ]} rows={FX_PARTNERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. /partners/[entrySlug] — detail with plaintext-once secret modal
// ─────────────────────────────────────────────────────────────────────────────
function PA_PartnerDetail({ theme: th, showSecretModal = false }) {
  const p = FX_PARTNERS[0];
  return (
    <Shell theme={th} nav={PA_NAV} active="partners"
      breadcrumb={['合作夥伴', p.bank, p.program]} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{p.bank} · {p.program}<Pill theme={th} tone="success" dot>active</Pill></span>}
        subtitle={`/${p.slug} · partner_id ${p.id}`}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'branding', label: 'Branding' },
          { id: 'auth', label: 'Auth' },
          { id: 'eligibility', label: 'Eligibility' },
          { id: 'creds', label: 'Credentials' },
          { id: 'audit', label: 'Audit' },
        ]}
        activeTab="creds"
        actions={<>
          <Btn theme={th} icon="ext">預覽 entry</Btn>
          <ActionButton theme={th} descriptor={{ action: 'issue_cred', enabled: true, riskLevel: 'high', requiresReason: true }} icon="key" label="發行 credential" en="issue" />
          <ActionButton theme={th} descriptor={{ action: 'rotate', enabled: true, riskLevel: 'high', requiresReason: true }} icon="refresh" label="輪替 credential" en="rotate" />
        </>} />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card theme={th} title="Entry 基本資料">
          <DL theme={th} items={[
            { k: 'TENANT', v: 'CTBC_BIZ · tnt_003', mono: true },
            { k: 'BANK CODE', v: p.code, mono: true },
            { k: 'PROGRAM', v: p.program },
            { k: 'BUSINESS SUBTYPE', v: p.subtype, mono: true },
            { k: 'AUTH MODE', v: p.auth, mono: true },
            { k: 'ELIGIBILITY', v: p.eligibility, mono: true },
            { k: 'ENTRY HOST', v: p.host, mono: true },
            { k: 'ENTRY PATH', v: '/partner/' + p.slug, mono: true },
            { k: 'THEME ACCENT', v: p.accent, mono: true },
            { k: 'SUPPORT CONTACT', v: 'biz-card@ctbcbank.com', mono: true },
          ]} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Readiness · 5/5 ok">
            {[
              { t: 'Branding 已上傳 (logo / accent / 法務文)', ok: true },
              { t: 'Auth 已綁定 (ctbc-oauth)', ok: true },
              { t: 'Eligibility verifier 已綁定 (card_bin)', ok: true },
              { t: 'Ingress credential · 到期 2026-12-30', ok: true },
              { t: '訂單 audit 路徑可追溯', ok: true },
            ].map((c, i, a) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < a.length - 1 ? '1px solid ' + th.border : 'none' }}>
                <MgmtIcon name="check" size={14} stroke={2.2} style={{ color: th.success }} />
                <span style={{ fontSize: 12.5, flex: 1 }}>{c.t}</span>
                <span style={{ fontSize: 11, color: th.success, fontWeight: 600, fontFamily: SHELL_MONO }}>OK</span>
              </div>
            ))}
          </Card>
          <Card theme={th} title="Active credentials · masked only" padding={0}>
            <Table theme={th} dense columns={[
              { h: 'kind', k: 'k', w: 130, mono: true },
              { h: 'masked', k: 'm', w: 130, mono: true },
              { h: 'rotated', k: 'r', mono: true },
            ]} rows={[
              { k: 'oauth_secret', m: '••••••aE32', r: '04-12' },
              { k: 'webhook_secret', m: '••••••8B2k', r: '04-12' },
              { k: 'ingress_token', m: '••••••K1yQ', r: '03-01' },
            ]} />
          </Card>
        </div>
      </div>

      {/* Plaintext-once modal — Q-ADM07 */}
      {showSecretModal && (
        <SecretRevealModal theme={th} secretType="ingress credential"
          name="CTBC · World Elite · production"
          secret="drts_partner_live_8AB2k1Mvqp_aE32xQ19LzPnT8B2kK1yQ4z_77231"
          scope="partner.ingress:write · cardholder.eligibility:verify"
          expiresAt="2026-12-30"
          acknowledged={false} />
      )}
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. /users — platform users
// ─────────────────────────────────────────────────────────────────────────────
function PA_Users({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="users"
      breadcrumb={['平台人員']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="平台人員"
        subtitle="6 個角色 · RBAC 守門以後端為準"
        actions={<ActionButton theme={th} descriptor={{ action: 'invite', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="邀請" en="invite" />} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', w: 200, r: r => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, background: th.accentBg, color: th.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{r.n.slice(0, 2)}</span>
                <span style={{ fontWeight: 500 }}>{r.n}</span>
              </div>
            )},
            { h: 'EMAIL', k: 'e', w: 240, mono: true },
            { h: 'ROLE', k: 'r', w: 200, mono: true, r: r => <Pill theme={th} tone="accent">{r.r}</Pill> },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.s === 'active' ? 'success' : 'warn'} dot>{r.s}</Pill> },
            { h: '更新', k: 'u', mono: true },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'update', enabled: true, riskLevel: 'medium' }} label="更新角色" en="role" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'suspend', enabled: r.s === 'active', disabledReasonCode: 'already_suspended', riskLevel: 'high', requiresReason: true }} label="停用" en="suspend" />
              </div>
            )},
          ]} rows={[
            { n: '林宜君', e: 'yc.lin@drts.io', r: 'pa_super_admin', s: 'active', u: '2026-05-25' },
            { n: '王芳',   e: 'fang.wang@drts.io', r: 'pa_ops_risk_gov', s: 'active', u: '2026-05-25' },
            { n: '張薇',   e: 'wei.chang@drts.io', r: 'pa_finance_gov', s: 'active', u: '2026-05-25' },
            { n: '李俊',   e: 'jun.li@drts.io', r: 'pa_tenant_mgr', s: 'active', u: '2026-05-24' },
            { n: '陳維',   e: 'wei.chen@drts.io', r: 'pa_fleet_gov', s: 'active', u: '2026-05-21' },
            { n: 'Ken Liao', e: 'ken.liao@drts.io', r: 'pa_partner_mgr', s: 'active', u: '2026-05-19' },
            { n: '黃啟賢', e: 'cs.huang@drts.io', r: 'pa_support_lead', s: 'suspended', u: '2026-04-21' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  PA_NAV, PA_HEALTH, PA_ACTOR,
  PA_Home, PA_Tenants, PA_TenantDetail, PA_TenantGovernance,
  PA_Partners, PA_PartnerDetail, PA_Users,
});
