// platform-screens.jsx — Platform Admin: 13 route screens.
// Each screen is a 1440×900 page rendered inside a Shell.
// Imports: mgmt-tokens, mgmt-shell, mgmt-data.

const PLATFORM_NAV = [
  { divider: '工作面' },
  { key: 'home',         icon: 'home',        label: '工作首頁' },
  { key: 'health',       icon: 'health',      label: '平台健康', badge: '2', badgeTone: 'warn' },
  { divider: '租戶治理' },
  { key: 'tenants',      icon: 'tenants',     label: '租戶' },
  { key: 'partners',     icon: 'partners',    label: '合作夥伴 entry' },
  { key: 'users',        icon: 'users',       label: '平台人員' },
  { divider: '車隊與法遵' },
  { key: 'fleet',        icon: 'fleet',       label: '車隊與合規' },
  { key: 'switchboard',  icon: 'switchboard', label: '法定資訊與牌貼' },
  { divider: '計價與結算' },
  { key: 'pricing',      icon: 'pricing',     label: '計價' },
  { key: 'payments',     icon: 'payments',    label: '結算治理', badge: '3', badgeTone: 'danger' },
  { divider: '平台層' },
  { key: 'notices',      icon: 'notices',     label: '公告與維護' },
  { key: 'audit',        icon: 'audit',       label: '稽核與證據' },
  { key: 'flags',        icon: 'flags',       label: '功能旗標' },
  { key: 'adapters',     icon: 'adapters',    label: '介接登錄' },
];

// ── 1. Home ─────────────────────────────────────────────────────────────────
function PA_Home({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="home" breadcrumb={['工作首頁']} env="production">
      <PageHeader theme={th} title="平台治理工作首頁" subtitle="DRTS 平台控制平面 · 您今日有 3 件需審視事項" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="活躍租戶" value="142" delta="+3 月" deltaTone="up" sub="8 在 pilot · 12 在 sandbox" />
          <Kpi theme={th} label="合作夥伴 entry" value="38" delta="2 待 readiness" deltaTone="neutral" sub="5 銀行 · 33 飯店 / 企業" />
          <Kpi theme={th} label="活躍司機" value="884" delta="−12 d/d" deltaTone="down" sub="42 license 30 天內到期" />
          <Kpi theme={th} label="待結算對帳" value="3" delta="2 partner · 1 forwarded" deltaTone="neutral" hint="rec_0091, rec_0090, rec_0089" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
          <Card theme={th} title="今日治理待辦" subtitle="跨模組需要平台治理人介入的事項" actions={<Btn theme={th} variant="ghost" icon="ext">展開所有</Btn>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Banner theme={th} tone="danger" icon="warn" title="BGMT 派遣回報 token 將於 6 天內到期" body="需於 5/14 前提交新的 client credential，否則無法回報今日完成單。" actions={<Btn theme={th} variant="primary">前往介接</Btn>} />
              <Banner theme={th} tone="warn" icon="warn" title="GoCab forwarded 介接 24h sync_failed 比率 4.2%" body="超過 3% 警戒值。建議檢查 adapter 健康並啟動 manual fallback 觀察。" actions={<Btn theme={th} variant="secondary">查看 adapter</Btn>} />
              <Banner theme={th} tone="info" icon="warn" title="台大醫院 病患接送 (NTU_HOSP) 處於 rollback_hold" body="客訴 cmp_0894 升級為 inc_0212 後，rollout 已暫停。需平台與營運共識下一步。" actions={<Btn theme={th} variant="secondary">查看租戶</Btn>} />
            </div>
          </Card>
          <Card theme={th} title="模組捷徑" subtitle="跳轉至治理面">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { i: 'tenants', t: '租戶' },
                { i: 'partners', t: '合作夥伴' },
                { i: 'pricing', t: '計價' },
                { i: 'payments', t: '結算治理' },
                { i: 'fleet', t: '車隊與合規' },
                { i: 'audit', t: '稽核' },
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
        <Card theme={th} title="近期高敏感操作" subtitle="平台層審計足跡 · 最近 24h" actions={<Btn theme={th} variant="ghost">前往稽核</Btn>}>
          <Table theme={th} columns={[
            { h: '時間', k: 'at', mono: true, w: 160 },
            { h: '模組', k: 'module', w: 120 },
            { h: '動作', k: 'action', mono: true, w: 180 },
            { h: '操作者', k: 'actor' },
            { h: 'request', k: 'req', mono: true, w: 140 },
          ]} rows={FX_AUDIT.slice(0, 5)} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 2. Tenants ──────────────────────────────────────────────────────────────
function PA_Tenants({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="tenants" breadcrumb={['租戶治理', '租戶']}>
      <PageHeader theme={th} title="租戶" subtitle="管理 tenant 從建立到 production rollout 的完整生命週期"
        actions={<><Btn theme={th} icon="filter">篩選</Btn><Btn theme={th} icon="export">匯出</Btn><Btn theme={th} variant="primary" icon="plus">建立租戶</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['全部 142','sandbox 12','pilot 8','production 119','rollback_hold 3'].map((s, i) => (
            <Pill key={i} theme={th} tone={i === 0 ? 'accent' : i === 4 ? 'danger' : 'neutral'} dot>{s}</Pill>
          ))}
          <span style={{ flex: 1 }} />
          <Pill theme={th} tone="neutral">last 30 days</Pill>
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'TENANT', w: 240, r: r => (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, color: th.text }}>{r.name}</span>
                <span style={{ fontSize: 11, color: th.textDim, fontFamily: '"JetBrains Mono", monospace' }}>{r.code} · {r.id}</span>
              </div>
            )},
            { h: 'STAGE', k: 'stage', w: 120, r: r => <Pill theme={th} tone={r.stage === 'production' ? 'success' : r.stage === 'pilot' ? 'info' : r.stage === 'sandbox' ? 'warn' : 'danger'} dot>{r.stage}</Pill> },
            { h: 'MODULES', k: 'modules', w: 100, mono: true, r: r => <span>{r.modules}/13</span> },
            { h: '配額/月', k: 'quota', w: 120, mono: true },
            { h: '介接', k: 'integ', w: 160, r: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, color: th.textMuted }}>{r.integ}</span> },
            { h: '更新', k: 'updated', w: 120, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.updated}</span> },
            { h: '', w: 28, r: () => <MgmtIcon name="more" size={14} style={{ color: th.textDim }} /> },
          ]} rows={FX_TENANTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 3. Tenant detail / rollout (FLOW screen) ────────────────────────────────
function PA_TenantDetail({ theme: th }) {
  const t = FX_TENANTS[3]; // TSMC_FAB18 production
  const steps = [
    { t: '建立', s: 'Y. Lin · 04-12' },
    { t: 'Sandbox', s: 'gate · approved' },
    { t: 'Pilot', s: 'gate · approved' },
    { t: 'Production', s: '已 cutover' },
    { t: 'Rollback ready', s: 'owner: K. Liao' },
  ];
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="tenants" breadcrumb={['租戶治理', '租戶', t.name]}>
      <PageHeader theme={th} title={t.name} subtitle={t.code + ' · ' + t.id} tabs={['Overview','Modules','Onboarding','Rollout','Roles','Webhook baseline','Billing baseline','Audit']} activeTab="Rollout"
        actions={<><Btn theme={th} icon="ext">在 Tenant Console 開啟</Btn><Btn theme={th} variant="primary" icon="check">推進至 production</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card theme={th} title="Rollout 進度" subtitle="sandbox → pilot → production · cutover owner: 林宜君 (Yi-Chun Lin) · rollback owner: Ken Liao">
          <div style={{ padding: '6px 0 16px' }}><Stepper theme={th} steps={steps} current={3} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Banner theme={th} tone="success" icon="ok" title="rollbackPrepared" body="租戶滿足 production gate 條件。" />
            <Banner theme={th} tone="success" icon="ok" title="role acknowledgements" body="6/6 角色已邀請並確認。" />
            <Banner theme={th} tone="info" icon="warn" title="cutover note" body="本次 cutover 於 04-29 22:00 完成，無重大 SLO 觸發。" />
          </div>
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <Card theme={th} title="Onboarding package">
            <DL theme={th} cols={2} items={[
              { k: 'INTEGRATION MODE', v: 'webhook + api', mono: true },
              { k: 'BOOTSTRAP ADMIN', v: 'lh.chang@yamato.tw' },
              { k: 'SANDBOX BASE URL', v: 'https://sbx.drts.io/t/tsmc_fab18', mono: true },
              { k: 'PRODUCTION BASE URL', v: 'https://api.drts.io/t/tsmc_fab18', mono: true },
              { k: 'BILLING BASELINE', v: 'monthly · NT$ unit · 25 due' },
              { k: 'WEBHOOK BASELINE', v: 'booking.* · invoice.* · audit.high', mono: true },
              { k: 'QUOTA / 月', v: '12,000 bookings' },
              { k: 'REGION', v: 'TW' },
            ]} />
          </Card>
          <Card theme={th} title="Roles & invites">
            <Table theme={th} dense columns={[
              { h: 'EMAIL', k: 'e', w: 200 },
              { h: 'ROLE', k: 'r', w: 140 },
              { h: 'STATE', w: 90, r: r => <Pill theme={th} tone={r.s === 'ack' ? 'success' : 'warn'} dot>{r.s === 'ack' ? '已確認' : '邀請中'}</Pill> },
            ]} rows={[
              { e: 'lh.chang@yamato.tw', r: 'tenant_admin', s: 'ack' },
              { e: 'eva.wang@yamato.tw', r: 'tenant_operator', s: 'ack' },
              { e: 'md.tsai@yamato.tw', r: 'tenant_finance', s: 'ack' },
              { e: 'ken.liao@yamato.tw', r: 'integration_manager', s: 'pending' },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── 4. Partners ─────────────────────────────────────────────────────────────
function PA_Partners({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="partners" breadcrumb={['租戶治理', '合作夥伴 entry']}>
      <PageHeader theme={th} title="合作夥伴 entry" subtitle="銀行 / 飯店 / 企業 partner 入口、auth 模式、eligibility、品牌"
        actions={<><Btn theme={th} icon="filter">篩選</Btn><Btn theme={th} variant="primary" icon="plus">建立 entry</Btn></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ENTRY', w: 220, r: r => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 28, height: 28, borderRadius: 6, background: r.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{r.code.slice(0, 2)}</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{r.bank}</span>
                  <span style={{ fontSize: 11, color: th.textDim, fontFamily: '"JetBrains Mono", monospace' }}>/{r.slug}</span>
                </div>
              </div>
            )},
            { h: 'PROGRAM', k: 'program', w: 140 },
            { h: 'SUBTYPE', k: 'subtype', w: 140, r: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{r.subtype}</span> },
            { h: 'AUTH', k: 'auth', w: 110, mono: true },
            { h: 'ELIGIBILITY', k: 'eligibility', w: 110, mono: true },
            { h: 'STATUS', w: 100, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : r.status === 'pending' ? 'warn' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'READINESS', w: 160, r: r => r.readiness === 'ok' ? <Pill theme={th} tone="success">ok</Pill> : <Pill theme={th} tone="warn" dot>{r.readiness}</Pill> },
            { h: '', w: 28, r: () => <MgmtIcon name="more" size={14} style={{ color: th.textDim }} /> },
          ]} rows={FX_PARTNERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 5. Partner detail (FLOW screen) ─────────────────────────────────────────
function PA_PartnerDetail({ theme: th }) {
  const p = FX_PARTNERS[0];
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="partners" breadcrumb={['合作夥伴 entry', p.bank, p.program]}>
      <PageHeader theme={th} title={p.bank + ' · ' + p.program} subtitle={'/' + p.slug + ' · partner_id ' + p.id} tabs={['Overview','Branding','Auth','Eligibility','Credentials','Audit']} activeTab="Overview"
        actions={<><Btn theme={th} icon="ext">預覽 entry</Btn><Btn theme={th} icon="copy">issue credential</Btn><Btn theme={th} variant="primary" icon="check">啟用</Btn></>} />
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
            { k: 'SUPPORT CONTACT', v: 'biz-card@ctbcbank.com' },
          ]} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Readiness 檢查">
            {[
              { t: 'Branding 已上傳 (logo / accent / 法務文)', ok: true },
              { t: 'Auth 已綁定 (中信 OAuth · ctbc-oauth)', ok: true },
              { t: 'Eligibility verifier 已綁定 (card_bin)', ok: true },
              { t: 'Ingress credential 在期內 · 到期 2026-12-30', ok: true },
              { t: '訂單 audit 路徑可追溯 partner_id / program_id', ok: true },
            ].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < 4 ? '1px solid ' + th.border : 'none' }}>
                <MgmtIcon name="check" size={14} style={{ color: th.success }} />
                <span style={{ fontSize: 12.5, flex: 1 }}>{c.t}</span>
                <span style={{ fontSize: 11, color: th.success, fontWeight: 600 }}>OK</span>
              </div>
            ))}
          </Card>
          <Card theme={th} title="Active credentials">
            <Table theme={th} dense columns={[
              { h: 'kind', k: 'k', w: 90, mono: true },
              { h: 'masked', k: 'm', w: 130, mono: true },
              { h: 'rotated', k: 'r', mono: true },
              { h: '', w: 24, r: () => <MgmtIcon name="more" size={12} style={{ color: th.textDim }} /> },
            ]} rows={[
              { k: 'oauth_secret', m: '••••••aE32', r: '04-12' },
              { k: 'webhook_secret', m: '••••••8B2k', r: '04-12' },
              { k: 'ingress_token', m: '••••••K1yQ', r: '03-01' },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── 6. Platform users ───────────────────────────────────────────────────────
function PA_Users({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="users" breadcrumb={['租戶治理', '平台人員']}>
      <PageHeader theme={th} title="平台人員" subtitle="平台內部使用者與角色 · RBAC 守門以後端為準"
        actions={<><Btn theme={th} variant="primary" icon="plus">邀請</Btn></>} />
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
            { h: 'ROLE', k: 'r', w: 200, mono: true },
            { h: 'STATUS', w: 100, r: r => <Pill theme={th} tone={r.s === 'active' ? 'success' : 'warn'} dot>{r.s}</Pill> },
            { h: '更新', k: 'u', mono: true },
          ]} rows={[
            { n: '林宜君', e: 'yc.lin@drts.io', r: 'platform_super_admin', s: 'active', u: '2026-05-08' },
            { n: '王芳', e: 'fang.wang@drts.io', r: 'ops_lead', s: 'active', u: '2026-05-08' },
            { n: '張薇', e: 'wei.chang@drts.io', r: 'finance_governance', s: 'active', u: '2026-05-08' },
            { n: '李俊', e: 'jun.li@drts.io', r: 'tenant_onboarding', s: 'active', u: '2026-05-07' },
            { n: '陳維', e: 'wei.chen@drts.io', r: 'sre', s: 'active', u: '2026-05-04' },
            { n: '游雅琪', e: 'yc.yu@drts.io', r: 'compliance_governance', s: 'active', u: '2026-05-02' },
            { n: 'Ken Liao', e: 'ken.liao@drts.io', r: 'partner_governance', s: 'active', u: '2026-04-30' },
            { n: '黃啟賢', e: 'cs.huang@drts.io', r: 'support_lead', s: 'suspended', u: '2026-04-21' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 7. Fleet ────────────────────────────────────────────────────────────────
function PA_Fleet({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="fleet" breadcrumb={['車隊與法遵', '車隊與合規']}>
      <PageHeader theme={th} title="車隊與合規" subtitle="vehicles · drivers · contracts · device binding · exclusivity · offboarding" tabs={['Drivers','Vehicles','Contracts','Exclusivity','Offboarding']} activeTab="Drivers"
        actions={<><Btn theme={th} icon="filter">篩選</Btn><Btn theme={th} variant="primary" icon="plus">新增司機</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="warn" icon="warn" title="42 位司機 license 將於 30 天內到期" body="dispatch.compliance.license_warn_30d 已啟用 · ops 端會擋下不合規派遣。" actions={<Btn theme={th} variant="secondary">匯出名單</Btn>} />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'DRIVER', w: 180, r: r => (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                <span style={{ fontSize: 11, color: th.textDim, fontFamily: '"JetBrains Mono", monospace' }}>{r.id}</span>
              </div>
            )},
            { h: 'VEHICLE', k: 'vehicle', w: 140, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'available' ? 'success' : r.status === 'on_trip' ? 'info' : r.status === 'break' ? 'warn' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'SHIFT', k: 'shift', w: 130, mono: true },
            { h: 'LICENSE', w: 130, r: r => r.license === 'valid' ? <Pill theme={th} tone="success">valid</Pill> : <Pill theme={th} tone="warn" dot>{r.license}</Pill> },
            { h: 'EXCLUSIVITY', w: 140, r: r => <Pill theme={th} tone={r.exclusivity === 'declared' ? 'success' : 'warn'} dot>{r.exclusivity}</Pill> },
            { h: '評分', k: 'rating', mono: true, align: 'right' },
            { h: '', w: 28, r: () => <MgmtIcon name="more" size={14} style={{ color: th.textDim }} /> },
          ]} rows={FX_DRIVERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 8. Public info / placard ────────────────────────────────────────────────
function PA_Switchboard({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="switchboard" breadcrumb={['法定資訊', '版本管理']}>
      <PageHeader theme={th} title="法定資訊與牌貼" subtitle="public info versioning · placard generation · publish" tabs={['版本','牌貼','公開聯絡','歷史']} activeTab="版本"
        actions={<><Btn theme={th} icon="plus">建立草稿</Btn><Btn theme={th} variant="primary" icon="check">發佈版本</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <Card theme={th} padding={0} title="Public info versions" subtitle="版本 · effective 區間 · 公開聯絡 · 狀態">
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
        <Card theme={th} title="目前發行牌貼 (placard v9)">
          <div style={{ background: '#FCFAF2', border: '1px solid ' + th.border, borderRadius: 8, padding: 14, fontSize: 11.5, lineHeight: 1.55, color: '#1a1a1a' }}>
            <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>大威多元計程車</div>
            <div style={{ borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a', padding: '6px 0', textAlign: 'center', marginBottom: 8, fontWeight: 600 }}>叫車：02-2543-9988　客訴：0800-088-122</div>
            <div style={{ fontSize: 10.5 }}>
              <div>車輛編號 ARJ-2891 / 駕駛 林志偉</div>
              <div>計費方式：起跳 NT$85，續跳 NT$5/250m</div>
              <div>支付：現金、台灣 Pay、街口、信用卡</div>
              <div style={{ marginTop: 4, color: '#666' }}>本牌貼依 pi_v18 (2026-04-01 ~ 2026-09-30) 生成</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn theme={th} icon="copy">下載 PDF</Btn>
            <Btn theme={th} variant="primary" icon="plus">產生新版本</Btn>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// ── 9. Pricing ──────────────────────────────────────────────────────────────
function PA_Pricing({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="pricing" breadcrumb={['計價與結算', '計價']}>
      <PageHeader theme={th} title="計價" subtitle="pricing rules · driver fee plans · publish windows" tabs={['Pricing rules','Driver fee plans','Override governance']} activeTab="Pricing rules"
        actions={<><Btn theme={th} icon="plus">建立草稿</Btn><Btn theme={th} variant="primary" icon="check">發佈規則</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="warn" title="canonical quoted fare authority" body="後端為唯一計價真值；前端任何 manual override 必須走 override governance 並保留 actor type 與必填欄位。" />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'VERSION', k: 'v', w: 110, mono: true },
            { h: '名稱', k: 'name', w: 220 },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'published' ? 'success' : 'warn'} dot>{r.status}</Pill> },
            { h: 'SERVICE FEE bps', k: 'serviceFeeBps', mono: true, align: 'right', w: 140 },
            { h: 'REIMBURSE', k: 'reimburse', mono: true, w: 200 },
            { h: 'SCOPE', k: 'scope', mono: true, w: 160 },
            { h: 'EFFECTIVE', w: 200, r: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{r.from} → {r.to}</span> },
          ]} rows={FX_PRICING} />
        </Card>
        <Card theme={th} title="服務 bucket fee 拆解 (pr_v23)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { t: 'standard', base: 'NT$ 85 / 起', cont: 'NT$ 5 / 250m', svc: '180 bps' },
              { t: 'business', base: 'NT$ 120 / 起', cont: 'NT$ 6 / 200m', svc: '220 bps' },
              { t: 'airport', base: 'NT$ 180 / 起', cont: 'flat by zone', svc: '250 bps' },
              { t: 'wheelchair', base: 'NT$ 95 / 起', cont: 'NT$ 5 / 250m', svc: '90 bps · subsidy' },
            ].map(b => (
              <div key={b.t} style={{ border: '1px solid ' + th.border, borderRadius: 8, padding: 10, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{b.t}</div>
                <div style={{ color: th.textMuted, lineHeight: 1.5 }}>{b.base}<br />{b.cont}<br /><span style={{ color: th.accent }}>{b.svc}</span></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Shell>
  );
}

// ── 10. Settlement / Reconciliation (FLOW screen) ───────────────────────────
function PA_Payments({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="payments" breadcrumb={['計價與結算', '結算治理']}>
      <PageHeader theme={th} title="結算治理" subtitle="invoices · driver statements · reimbursement batches · settlement matrix · reconciliation issues" tabs={['Settlement matrix','Tenant invoices','Driver statements','Reimbursements','Reconciliation issues']} activeTab="Reconciliation issues"
        actions={<><Btn theme={th} icon="export">匯出</Btn><Btn theme={th} variant="primary" icon="plus">開立 issue</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="當期 outstanding" value="3" sub="2 partner · 1 forwarded" />
          <Kpi theme={th} label="差額累計" value="NT$ 2,232" delta="↑ 8.4%" deltaTone="up" sub="vs 上週" />
          <Kpi theme={th} label="平均處理時間" value="14h" delta="↓ 2h" deltaTone="up" sub="last 7 days" />
          <Kpi theme={th} label="reopen 率" value="6.2%" delta="warn 閾值 5%" deltaTone="down" sub="last 30 days" />
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'ISSUE', w: 110, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'SOURCE', k: 'source', w: 130 },
            { h: 'TYPE', k: 'issue', w: 200, mono: true, r: r => <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{r.issue}</span> },
            { h: 'TENANT', k: 'tenant', w: 120, mono: true },
            { h: 'EXTERNAL ORDER', k: 'external', w: 150, mono: true },
            { h: 'AMOUNT', k: 'amount', w: 180, mono: true },
            { h: 'OWNER', k: 'owner', w: 90 },
            { h: 'STATUS', w: 100, r: r => <Pill theme={th} tone={r.status === 'resolved' ? 'success' : r.status === 'reopened' ? 'danger' : r.status === 'in_review' ? 'info' : 'warn'} dot>{r.status}</Pill> },
            { h: 'UPDATED', k: 'updated', mono: true, w: 150 },
          ]} rows={FX_RECON} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 11. Recon issue detail (drawer-based FLOW screen) ───────────────────────
function PA_ReconDetail({ theme: th }) {
  const r = FX_RECON[0]; // rec_0091
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="payments" breadcrumb={['結算治理', 'Reconciliation issues', r.id]}>
      <PageHeader theme={th} title={r.id + ' · ' + r.issue} subtitle={r.source + ' · ' + r.external + ' · mirror ' + r.mirror}
        actions={<><Btn theme={th} icon="copy">指派</Btn><Btn theme={th} icon="plus">補 evidence</Btn><Btn theme={th} variant="primary" icon="check">標記 resolved</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Issue summary">
            <DL theme={th} cols={3} items={[
              { k: 'TYPE', v: 'fare_diff_>5%', mono: true },
              { k: 'AMOUNT DIFF', v: 'NT$ 412', mono: true },
              { k: 'OWNER', v: '張薇 Finance' },
              { k: 'EXTERNAL ORDER', v: 'SRX-9921098', mono: true },
              { k: 'MIRROR ORDER', v: 'fwd_4476', mono: true },
              { k: 'TENANT', v: '—' },
              { k: 'PARTNER PROGRAM', v: '—' },
              { k: 'OPENED', v: '2026-05-08 14:55', mono: true },
              { k: 'EVIDENCE', v: '3 (artifact ids)' },
            ]} />
          </Card>
          <Card theme={th} title="Timeline">
            <Timeline theme={th} events={[
              { at: '14:55', tone: 'warn', t: '建立 issue', actor: 'system.recon-detector', body: 'forwarder mirror fare 與 external SRX 回報差額 NT$ 412 (5.7%)。' },
              { at: '14:58', tone: 'accent', t: '指派', actor: '王芳 → 張薇', body: 'finance reconciliation owner 接手。' },
              { at: '15:12', tone: 'accent', t: '附 evidence', actor: '張薇', body: 'art_882 (SRX raw payload)、art_883 (本地計價 trace)。' },
              { at: '15:30', tone: 'accent', t: '評論', actor: '張薇', body: 'SRX 在 14:42 將 fare 由 NT$ 7,180 修正為 NT$ 7,592；本地 mirror 未更新。需求 SRX 重送 webhook 並等待對方確認。' },
            ]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="Linked references">
            <DL theme={th} cols={1} items={[
              { k: 'TENANT ID', v: '—' },
              { k: 'PARTNER ID', v: '—' },
              { k: 'PARTNER PROGRAM ID', v: '—' },
              { k: 'SPONSOR REFERENCE', v: '—' },
              { k: 'MIRROR ORDER ID', v: 'fwd_4476', mono: true },
              { k: 'EXTERNAL ORDER ID', v: 'SRX-9921098', mono: true },
              { k: 'LINKED RECON JOB', v: 'recon_job_2026_05_08_03', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="Resolution">
            <Field theme={th} label="resolution code"><Select theme={th} ph="選擇..." value="external_corrected" /></Field>
            <Field theme={th} label="summary"><Input theme={th} value="SRX 重送 webhook，差額已歸零，本地 mirror 已重新對齊。" /></Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Btn theme={th} variant="secondary">儲存草稿</Btn>
              <Btn theme={th} variant="primary" icon="check">resolve</Btn>
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── 12. Health ──────────────────────────────────────────────────────────────
function PA_Health({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="health" breadcrumb={['平台健康']}>
      <PageHeader theme={th} title="平台健康" subtitle="alert list · dispatch lag · webhook queue · eligibility queue · reporting · adapters" tabs={['Alerts','Dispatch','Webhook','Filing','Adapters']} activeTab="Alerts"
        actions={<><Btn theme={th} icon="refresh">重整</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="dispatch lag p95" value="2.4s" delta="ok < 5s" deltaTone="up" />
          <Kpi theme={th} label="webhook queue" value="118" delta="↑ 22" deltaTone="down" sub="p95 410ms" />
          <Kpi theme={th} label="eligibility queue" value="4" sub="2 卡 BIN 對照失敗" />
          <Kpi theme={th} label="reporting failures 24h" value="0" delta="ok" deltaTone="up" />
        </div>
        <Card theme={th} title="Active alerts" subtitle="跨模組告警總覽">
          {FX_HEALTH.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid ' + th.border }}>
              <Pill theme={th} tone={a.tone} dot>{a.route}</Pill>
              <span style={{ flex: 1, fontSize: 12.5 }}>{a.text}</span>
              <span style={{ fontSize: 11, color: th.textDim, fontFamily: '"JetBrains Mono", monospace' }}>x{a.count}</span>
              <Btn theme={th} variant="ghost" icon="ext" size="xs">查看</Btn>
            </div>
          ))}
        </Card>
        <Card theme={th} title="Adapter inventory" padding={0}>
          <Table theme={th} columns={[
            { h: 'ADAPTER', k: 'id', w: 140, mono: true },
            { h: 'SOURCE', k: 'source', w: 180 },
            { h: 'KIND', k: 'kind', w: 110, mono: true },
            { h: 'STATUS', w: 140, r: r => <Pill theme={th} tone={r.status === 'healthy' ? 'success' : r.status === 'degraded' ? 'warn' : 'danger'} dot>{r.status}</Pill> },
            { h: 'LATENCY', k: 'latency', mono: true, align: 'right', w: 110 },
            { h: 'LAST EVENT', k: 'last', mono: true, w: 130 },
            { h: 'orders 24h', k: 'orders24h', mono: true, align: 'right' },
          ]} rows={FX_ADAPTERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 13. Notices & Maintenance ───────────────────────────────────────────────
function PA_Notices({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="notices" breadcrumb={['平台層', '公告與維護']}>
      <PageHeader theme={th} title="公告與維護" subtitle="platform notices · global maintenance mode" tabs={['公告','維護模式']} activeTab="公告"
        actions={<><Btn theme={th} variant="primary" icon="plus">建立公告</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card theme={th} padding={0} title="現行公告">
          <Table theme={th} columns={[
            { h: 'ID', k: 'id', w: 90, mono: true },
            { h: '標題', k: 'title' },
            { h: 'SEV', w: 80, r: r => <Pill theme={th} tone={r.sev === 'high' ? 'danger' : r.sev === 'medium' ? 'warn' : 'neutral'} dot>{r.sev}</Pill> },
            { h: '對象', k: 'audience', w: 100, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : 'info'} dot>{r.status}</Pill> },
            { h: '更新', k: 'updated', mono: true },
          ]} rows={FX_NOTICES} />
        </Card>
        <Card theme={th} title="Maintenance mode">
          <div style={{ padding: 12, border: '1px solid ' + th.border, borderRadius: 8, background: th.surfaceLo, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>全平台維護</span>
              <Toggle theme={th} on={false} />
            </div>
            <div style={{ fontSize: 11.5, color: th.textMuted, lineHeight: 1.4 }}>啟用後將停止 dispatch、webhook 投遞與 partner 入站。請務必先發佈公告。</div>
          </div>
          <Field theme={th} label="原因 (內部紀錄)"><Input theme={th} ph="例如 5/15 02:00–04:00 計畫性維護" /></Field>
          <Field theme={th} label="預定起始" hint="UTC+8"><Input theme={th} ph="2026-05-15 02:00" mono /></Field>
          <Field theme={th} label="預定結束"><Input theme={th} ph="2026-05-15 04:00" mono /></Field>
          <Btn theme={th} variant="secondary">儲存設定</Btn>
        </Card>
      </div>
    </Shell>
  );
}

// ── 14. Audit & Evidence ────────────────────────────────────────────────────
function PA_Audit({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="audit" breadcrumb={['平台層', '稽核與證據']}>
      <PageHeader theme={th} title="稽核與證據" subtitle="append-only · 觀察面 · 不可被前端竄改" tabs={['Audit log','Retention policies','Legal holds','Deletion exceptions']} activeTab="Audit log"
        actions={<><Btn theme={th} icon="filter">篩選</Btn><Btn theme={th} icon="export">匯出 csv</Btn></>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['全部 12,442','reconciliation 31','callcenter 88','incident 4','feature_flag 6','billing 142'].map((s, i) => (
            <Pill key={i} theme={th} tone={i === 0 ? 'accent' : 'neutral'} dot>{s}</Pill>
          ))}
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'WHEN', k: 'at', w: 170, mono: true },
            { h: 'ACTOR TYPE', k: 'actorType', w: 110, mono: true },
            { h: 'ACTOR', k: 'actor', w: 220 },
            { h: 'MODULE', k: 'module', w: 140, mono: true },
            { h: 'ACTION', k: 'action', w: 180, mono: true, r: r => <span style={{ color: th.accent, fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>{r.action}</span> },
            { h: 'RESOURCE', k: 'resource', w: 200, mono: true },
            { h: 'REQUEST', k: 'req', mono: true },
          ]} rows={FX_AUDIT} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 15. Feature flags ───────────────────────────────────────────────────────
function PA_Flags({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="flags" breadcrumb={['平台層', '功能旗標']}>
      <PageHeader theme={th} title="功能旗標" subtitle="global / tenant override switch governance" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'KEY', k: 'key', w: 380, mono: true, r: r => <span style={{ color: th.text, fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5 }}>{r.key}</span> },
            { h: 'SCOPE', k: 'scope', w: 160, mono: true },
            { h: 'STATE', w: 80, r: r => <Toggle theme={th} on={r.enabled} /> },
            { h: 'UPDATED BY', k: 'updatedBy', w: 200 },
            { h: 'AT', k: 'updatedAt', mono: true },
          ]} rows={FX_FLAGS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 16. Adapter registry ────────────────────────────────────────────────────
function PA_Adapters({ theme: th }) {
  return (
    <Shell theme={th} nav={PLATFORM_NAV} active="adapters" breadcrumb={['平台層', '介接登錄']}>
      <PageHeader theme={th} title="介接登錄" subtitle="平台 adapter inventory · auth / forwarder / filing"
        actions={<><Btn theme={th} icon="plus">註冊 adapter</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {FX_ADAPTERS.map(a => (
          <Card key={a.id} theme={th} title={a.source} subtitle={a.id + ' · ' + a.kind} actions={<Pill theme={th} tone={a.status === 'healthy' ? 'success' : a.status === 'degraded' ? 'warn' : 'danger'} dot>{a.status}</Pill>}>
            <DL theme={th} cols={3} items={[
              { k: 'LATENCY', v: a.latency, mono: true },
              { k: 'LAST EVENT', v: a.last, mono: true },
              { k: 'ORDERS 24H', v: a.orders24h, mono: true },
            ]} />
          </Card>
        ))}
      </div>
    </Shell>
  );
}

Object.assign(window, {
  PLATFORM_NAV,
  PA_Home, PA_Tenants, PA_TenantDetail, PA_Partners, PA_PartnerDetail, PA_Users,
  PA_Fleet, PA_Switchboard, PA_Pricing, PA_Payments, PA_ReconDetail, PA_Health,
  PA_Notices, PA_Audit, PA_Flags, PA_Adapters,
});
