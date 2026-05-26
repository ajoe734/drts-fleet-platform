// tenant-screens-3.jsx — Tenant Console (3/3): Billing / Invoices / Cost Centers / Rules / Reports / Audit / Feature Flags / Settings

// ── 13. /billing — overview NEW per Q-TEN02
function TN_Billing({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="billing"
      breadcrumb={['財務', '帳務概覽']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th} title="帳務概覽" subtitle="billing profile · 當期使用 · 近期 invoice" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Kpi theme={th} label="本月累計" en="mtd" value="NT$ 1.22M" delta="↑ 8%" deltaTone="up" sub="vs 上月同期" />
          <Kpi theme={th} label="預估 close" en="projected" value="NT$ 1.40M" sub="2026-05 close" />
          <Kpi theme={th} label="本月趟次" en="trips" value="3,820" sub="76% of 5,000 配額" />
          <Kpi theme={th} label="平均單筆" en="avg" value="NT$ 320" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
          <Card theme={th} title="Billing profile">
            <DL theme={th} cols={1} items={[
              { k: '統一編號', v: '22099131', mono: true },
              { k: '計費聯絡人', v: '王副總 · finance@yamato.tw' },
              { k: '付款方式', v: 'invoice (NET 30)', mono: true },
              { k: 'billing address', v: '台北市信義區松仁路 100 號' },
              { k: '幣別', v: 'TWD', mono: true },
              { k: 'next close', v: '2026-05-31 23:59', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="近 6 期 invoice" padding={0}
            actions={<Btn theme={th} size="xs" icon="chevR">前往發票 →</Btn>}>
            <Table theme={th} dense columns={[
              { h: 'INVOICE', k: 'id', w: 200, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
              { h: 'PERIOD', k: 'period', w: 110, mono: true },
              { h: 'AMOUNT', k: 'amount', w: 160, mono: true, align: 'right' },
              { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'paid' ? 'success' : r.status === 'published' ? 'info' : 'neutral'} dot>{r.status}</Pill> },
              { h: 'DUE', k: 'due', w: 130, mono: true },
            ]} rows={FX_INVOICES} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── 14. /invoices
function TN_Invoices({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="invoices"
      breadcrumb={['財務', '發票']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th} title="發票 · Invoices"
        subtitle="status 由後端決定 (Q-TEN05 不從 client 推斷)" />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'INVOICE', k: 'id', w: 220, mono: true, r: r => <span style={{ color: th.accent, fontWeight: 600 }}>{r.id}</span> },
            { h: 'PERIOD', k: 'period', w: 110, mono: true },
            { h: 'AMOUNT', k: 'amount', w: 180, mono: true, align: 'right' },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'paid' ? 'success' : r.status === 'published' ? 'info' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'DUE', k: 'due', w: 130, mono: true },
            { h: 'ISSUED', k: 'issued', w: 160, mono: true },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'download', enabled: r.status !== 'draft', disabledReasonCode: 'still_draft', riskLevel: 'low' }} icon="download" label="下載 PDF" en="dl" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'dispute', enabled: r.status !== 'paid', disabledReasonCode: 'already_paid', riskLevel: 'medium' }} label="爭議" en="dispute" />
              </div>
            )},
          ]} rows={FX_INVOICES} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 15. /cost-centers — Q-TEN11
function TN_CostCenters({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="cc"
      breadcrumb={['財務', '成本中心']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="成本中心 · Cost Centers"
        subtitle="部門 · 月配額 · 預設審批規則 (Q-TEN11)"
        actions={<ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="新增" en="new" />} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'CODE', k: 'code', w: 130, mono: true },
            { h: 'NAME', k: 'name', w: 200 },
            { h: 'OWNER', k: 'owner', w: 130 },
            { h: '月配額', k: 'quota', w: 130, mono: true, align: 'right' },
            { h: '本月使用', w: 180, r: r => {
              const used = parseInt((r.used || '0').replace(/[^\d]/g, ''));
              const quota = parseInt((r.quota || '0').replace(/[^\d]/g, ''));
              const pct = quota && used ? Math.min(100, Math.round(used / quota * 100)) : 0;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: SHELL_MONO, fontSize: 11.5, minWidth: 60 }}>{r.used}</span>
                  <div style={{ flex: 1, height: 6, background: th.surfaceLo, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: pct > 90 ? th.danger : pct > 80 ? th.warn : th.success }} />
                  </div>
                </div>
              );
            }},
            { h: '審批', k: 'approval', mono: true },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'edit', enabled: true, riskLevel: 'medium' }} label="編輯" en="edit" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'disable', enabled: true, riskLevel: 'high', requiresReason: true }} label="停用" en="disable" />
              </div>
            )},
          ]} rows={[
            { code: 'CC-FIN-04', name: '財務處',    owner: '王副總', quota: '300 趟', used: '218 趟', approval: '主管預核免簽' },
            { code: 'CC-RD-12',  name: 'R&D Fab18', owner: '陳處長', quota: '800 趟', used: '614 趟', approval: '機場 / 跨夜需核准' },
            { code: 'CC-OPS-02', name: '營運處',    owner: '林經理', quota: '500 趟', used: '380 趟', approval: '主管預核免簽' },
            { code: 'CC-BD-09',  name: '業務開發',  owner: '黃協理', quota: '1,200 趟', used: '892 趟', approval: '> NT$ 3,000 需核准' },
            { code: 'CC-EXEC-01', name: '高階主管', owner: 'CEO Office', quota: '∞', used: '142 趟', approval: '免審' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 16. /rules — Q-TEN12
function TN_Rules({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="rules"
      breadcrumb={['財務', '審批規則']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="審批規則 · Approval Rules"
        subtitle="條件 → 動作 · precedence · dry-run (Q-TEN12)"
        actions={<ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="新增規則" en="new" />} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'PRI', w: 60, mono: true, align: 'right', r: (_, i) => i + 1 },
            { h: '條件 · condition', k: 'cond', w: 380 },
            { h: '動作 · action', k: 'act', w: 220 },
            { h: '審批者 · approver', k: 'approver', w: 180 },
            { h: 'STATE', w: 110, r: r => <Pill theme={th} tone={r.active ? 'success' : 'neutral'} dot>{r.active ? 'active' : 'paused'}</Pill> },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'dryrun', enabled: true, riskLevel: 'low' }} icon="check" label="dry-run" en="test" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'disable', enabled: r.active, disabledReasonCode: 'already_paused', riskLevel: 'high', requiresReason: true }} label="停用" en="disable" />
              </div>
            )},
          ]} rows={[
            { cond: 'service_type = airport_pickup AND fare > NT$ 3,000', act: '需審批 · single approver', approver: 'cost_center.owner', active: true },
            { cond: 'pickup_time ∈ [22:00, 06:00]', act: '需審批 + 雙簽 · parallel', approver: 'cc.owner + finance', active: true },
            { cond: 'cost_center = CC-EXEC-01', act: '免審', approver: '—', active: true },
            { cond: 'monthly_quota_remaining < 10%', act: '通知 owner', approver: '—', active: true },
            { cond: 'passenger.role = visitor', act: '需主管登記事由', approver: 'cc.owner', active: false },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 17. /reports — NEW per Q-TEN02
function TN_Reports({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="reports"
      breadcrumb={['報表與稽核', '報表']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="manual">
      <PageHeader theme={th}
        title="報表 · Reports"
        subtitle="月用量 · cost center 拆分 · SLA 摘要 · 簽名 artifact 短效"
        actions={<ActionButton theme={th} descriptor={{ action: 'create', enabled: true, riskLevel: 'low' }} variant="primary" icon="plus" label="建立工作" en="new" />} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'JOB', k: 'id', w: 110, mono: true },
            { h: 'KIND', k: 'kind', w: 180, mono: true },
            { h: 'PERIOD', k: 'period', w: 110, mono: true },
            { h: 'FORMAT', k: 'format', w: 90, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'ready' ? 'success' : r.status === 'running' ? 'info' : r.status === 'expired' ? 'neutral' : 'warn'} dot>{r.status}</Pill> },
            { h: 'EXPIRES', k: 'expires', mono: true, w: 130 },
            { h: 'CREATED', k: 'created', mono: true },
            { h: 'ACTIONS', w: 160, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'download', enabled: r.status === 'ready', disabledReasonCode: r.status === 'running' ? 'still_running' : 'expired', riskLevel: 'low' }} icon="download" label="下載" en="dl" />
              </div>
            )},
          ]} rows={FX_REPORTS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 18. /audit — cross-actor visibility (Q-TEN13)
function TN_Audit({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="audit"
      breadcrumb={['報表與稽核', '稽核']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="manual">
      <PageHeader theme={th}
        title="稽核 · cross-actor"
        subtitle="不可變 · 7 年保存 · 含所有 actor realm 對 tenant 資源的動作 (Q-TEN13)"
        actions={<Btn theme={th} icon="export">匯出 (簽名 artifact)</Btn>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="info"
          title="跨 actor 可見性 · Q-TEN13"
          body="本租戶可看到：(a) 自家使用者對自家資源的動作；(b) ops 對自家 booking / complaint 的動作；(c) platform admin 影響自家 config 的動作；(d) system 對自家資源的動作。敏感欄位由 policy 自動 mask。" />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'WHEN', k: 'at', w: 170, mono: true },
            { h: 'ACTOR', w: 280, r: r => <ActorRealmChip theme={th} realm={r.realm} actor={r.actor} /> },
            { h: 'MODULE', k: 'module', w: 140, mono: true },
            { h: 'ACTION', k: 'action', w: 200, mono: true, r: r => <span style={{ color: th.accent, fontFamily: SHELL_MONO, fontSize: 11 }}>{r.action}</span> },
            { h: 'RESOURCE', k: 'resource', w: 200, mono: true },
            { h: 'REQUEST', k: 'req', mono: true },
          ]} rows={[
            { at: '2026-05-25 14:30:11', realm: 'tenant',   actor: 'eva.wang@yamato.tw', module: 'booking', action: 'create',  resource: 'bk_5513', req: 'req_FXa881' },
            { at: '2026-05-25 14:42:00', realm: 'driver',   actor: 'd_8843 (司機端)',     module: 'incident', action: 'sos.raise', resource: 'inc_0214 · 影響 YAMATO ord_8232', req: 'req_FXa899' },
            { at: '2026-05-25 14:42:11', realm: 'ops',      actor: '王芳 (ops_manager)',  module: 'incident', action: 'create_from_sos', resource: 'inc_0214', req: 'req_FXa900' },
            { at: '2026-05-25 15:00:32', realm: 'ops',      actor: '林經理 (safety_lead)', module: 'booking', action: 'mark_fare_zero', resource: 'ord_8232 · 免收費', req: 'req_FXa901' },
            { at: '2026-05-25 11:00:02', realm: 'system',   actor: 'system.invoice-generator', module: 'billing', action: 'invoice.publish', resource: 'inv_2026_05_001', req: 'req_FXa701' },
            { at: '2026-05-24 16:14:55', realm: 'platform', actor: '李俊 (pa_tenant_mgr)', module: 'tenant', action: 'flag.disable', resource: 'tenant.ntu_hosp.wheelchair_priority (override)', req: 'req_FXa620' },
            { at: '2026-05-24 09:30:12', realm: 'platform', actor: '張薇 (pa_finance_gov)', module: 'billing',  action: 'invoice.publish', resource: 'inv_2026_04_001', req: 'req_FXa520' },
            { at: '2026-05-22 14:31:09', realm: 'system',   actor: 'system.sla',           module: 'complaint', action: 'sla.breach',  resource: 'cmp_0908 · driver_conduct · masked', req: 'req_FXa401' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 19. /feature-flags — NEW per Q-TEN02 (Q-X16 read-scoped)
function TN_Flags({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="flags"
      breadcrumb={['系統', '功能旗標']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="功能旗標 · read-only"
        subtitle="本租戶可見的 flags · 完整治理在 Platform Admin · endpoint = GET /api/tenant/feature-flags"
        meta={<Pill theme={th} tone="neutral" dot>read-only · per Q-X16</Pill>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'KEY', k: 'key', w: 380, mono: true },
            { h: 'CURRENT', w: 100, r: r => <Pill theme={th} tone={r.enabled ? 'success' : 'neutral'} dot>{r.enabled ? 'enabled' : 'disabled'}</Pill> },
            { h: 'SCOPE', w: 180, r: r => <Pill theme={th} tone={r.scope === 'tenant_override' ? 'accent' : 'neutral'}>{r.scope}</Pill> },
            { h: 'LAST CHANGED BY', k: 'updatedBy', w: 200 },
            { h: 'AT', k: 'updatedAt', mono: true },
          ]} rows={FX_FLAGS.filter(f => f.key.startsWith('tenant') || f.scope === 'tenant_override' || f.key.includes('tenant'))} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 20. /settings
function TN_Settings({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="settings"
      breadcrumb={['系統', '設定']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="租戶設定"
        subtitle="一般 · 通知預設 · 隱私 · 整合預設"
        tabs={[{ id: 'g', label: '一般' }, { id: 'n', label: '通知' }, { id: 'p', label: '隱私' }, { id: 'i', label: '整合' }]}
        activeTab="g" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card theme={th} title="一般">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field theme={th} label="租戶代碼 · tenant_code"><Input theme={th} value="YAMATO" mono /></Field>
            <Field theme={th} label="顯示名稱 · display_name"><Input theme={th} value="大和商務集團" /></Field>
            <Field theme={th} label="統一編號 · tax_id"><Input theme={th} value="22099131" mono /></Field>
            <Field theme={th} label="計費聯絡人"><Input theme={th} value="王副總 · finance@yamato.tw" /></Field>
            <Field theme={th} label="預設語系 · default_locale"><Select theme={th} value="zh-Hant" /></Field>
            <Field theme={th} label="預設時區 · timezone"><Select theme={th} value="Asia/Taipei" /></Field>
          </div>
        </Card>
        <Card theme={th} title="當期狀態">
          <DL theme={th} cols={1} items={[
            { k: 'STAGE', v: 'production', mono: true },
            { k: '啟用模組', v: '8 / 13', mono: true },
            { k: '配額', v: '5,000 趟 / 月', mono: true },
            { k: 'webhook 簽章', v: 'sha256-hmac', mono: true },
            { k: '隱私', v: '電話遮罩 · 中介轉接' },
            { k: '同意書版本', v: 'pp_v12 · 2026-01-01', mono: true },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  TN_Billing, TN_Invoices, TN_CostCenters, TN_Rules,
  TN_Reports, TN_Audit, TN_Flags, TN_Settings,
});
