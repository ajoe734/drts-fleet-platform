// bank-screens-1.jsx — Bank Console (1/3): Home / Bookings / Users
// Accepted design bundle backfill for bank-console-web. zh-TW primary.

const BK_NAV = [
  { divider: '工作面 · Workspace' },
  { key: 'home', icon: 'home', label: '總覽 · Overview' },
  { key: 'bookings', icon: 'bookings', label: '卡友訂單 · Bookings' },
  { divider: '合約與帳務 · Contracts & Settlement' },
  { key: 'contracts', icon: 'sla', label: '合約與 SLA · Contracts' },
  { key: 'statements', icon: 'billing', label: '結算對帳 · Statements' },
  { key: 'programs', icon: 'reports', label: '方案與配額 · Programs' },
  { divider: '治理 · Governance' },
  { key: 'users', icon: 'users', label: '使用者與角色 · Users' },
  { key: 'audit', icon: 'audit', label: '稽核 · Audit' },
];

const BK_ACTOR = { name: '林宜君', display: '林宜君', role: 'bank_program_admin' };
const BK_HEALTH = { status: 'healthy', lastCheckedAt: '14s', degradedServices: [] };

const BK_USER_ROWS = [
  { n: '林宜君', e: 'yl.lin@ctbc-bank.tw', r: 'bank_program_admin', s: 'active', a: '2026-06-11 10:32' },
  { n: '王若涵', e: 'jo.han@ctbc-bank.tw', r: 'bank_program_admin', s: 'active', a: '2026-06-11 09:44' },
  { n: '陳思穎', e: 'sy.chen@ctbc-bank.tw', r: 'bank_ops_viewer', s: 'active', a: '2026-06-11 09:18' },
  { n: '張維真', e: 'wj.chang@ctbc-bank.tw', r: 'bank_finance', s: 'active', a: '2026-06-11 08:52' },
  { n: '李紹安', e: 'sa.li@ctbc-bank.tw', r: 'bank_ops_viewer', s: 'invited', a: '2026-06-10 18:24' },
  { n: '黃佳恩', e: 'je.huang@ctbc-bank.tw', r: 'bank_finance', s: 'suspended', a: '2026-06-08 16:12' },
];

function BK_Users({ theme: th }) {
  return (
    <Shell theme={th} nav={BK_NAV} active="users"
      breadcrumb={['治理', '使用者與角色']} env="production" tenant="CTBC_BIZ" actor={BK_ACTOR} health={BK_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="使用者與角色"
        subtitle="issuer tenant scoped · bank_program_admin / bank_ops_viewer / bank_finance · 全程稽核"
        actions={<ActionButton theme={th} descriptor={{ action: 'invite', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="邀請使用者" en="invite" />} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          <Card theme={th} title="權限規則">
            <Banner theme={th} tone="info" icon="info"
              title="只有 bank_program_admin 可異動"
              body="邀請、改角色、停用、復用都必須寫入 issuer tenant 的 audit trail；viewer / finance 在本頁一律唯讀。" />
            <div style={{ height: 12 }} />
            <DL theme={th} cols={1} items={[
              { k: 'TENANT', v: 'CTBC_BIZ · 中信發卡行後台', mono: true },
              { k: 'CURRENT ACTOR', v: '林宜君 · bank_program_admin', mono: true },
              { k: 'LAST ACTIVITY', v: '2026-06-11 10:32', mono: true },
            ]} />
          </Card>
          <Card theme={th} title="角色">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Pill theme={th} tone="accent">bank_program_admin · 方案管理員 · 可操作</Pill>
              <Pill theme={th} tone="info">bank_ops_viewer · 客服／營運檢視 · 唯讀</Pill>
              <Pill theme={th} tone="info">bank_finance · 財務 · 唯讀</Pill>
            </div>
          </Card>
        </div>

        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'USER', w: 220, r: r => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: 12, background: th.accentBg, color: th.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10 }}>{r.n.slice(0, 2)}</span>
                <span style={{ fontWeight: 600 }}>{r.n}</span>
              </div>
            )},
            { h: 'EMAIL', k: 'e', w: 220, mono: true },
            { h: 'ROLE', w: 180, r: r => <Pill theme={th} tone={r.r === 'bank_program_admin' ? 'accent' : 'info'}>{r.r}</Pill> },
            { h: 'STATUS', w: 120, r: r => <Pill theme={th} tone={r.s === 'active' ? 'success' : r.s === 'invited' ? 'warn' : 'danger'} dot>{r.s}</Pill> },
            { h: 'LAST ACTIVITY', k: 'a', w: 160, mono: true },
            { h: 'ACTIONS', w: 220, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'role', enabled: true, riskLevel: 'medium' }} label="改角色" en="role" />
                <ActionButton theme={th} size="xs" descriptor={{ action: r.s === 'suspended' ? 'reactivate' : 'suspend', enabled: r.s !== 'invited', disabledReasonCode: r.s === 'invited' ? 'invite_pending' : undefined, riskLevel: 'high', requiresReason: true }} label={r.s === 'suspended' ? '復用' : '停用'} en={r.s === 'suspended' ? 'reactivate' : 'suspend'} />
              </div>
            )},
          ]} rows={BK_USER_ROWS} />
        </Card>

        <Card theme={th} title="近期稽核事件" padding={0}>
          <Table theme={th} dense columns={[
            { h: 'AT', k: 'at', w: 160, mono: true },
            { h: 'EVENT', k: 'event', w: 140, mono: true },
            { h: 'ACTOR', k: 'actor', w: 120 },
            { h: 'TARGET', k: 'target', w: 120 },
            { h: 'REQUEST', k: 'req', mono: true },
          ]} rows={[
            { at: '2026-06-11 09:44', event: 'role_changed', actor: '林宜君', target: '張維真', req: 'req_usr_10321' },
            { at: '2026-06-11 08:15', event: 'invite_issued', actor: '王若涵', target: '李紹安', req: 'req_usr_10308' },
            { at: '2026-06-10 17:52', event: 'reactivated', actor: '林宜君', target: '黃佳恩', req: 'req_usr_10284' },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  BK_NAV,
  BK_ACTOR,
  BK_HEALTH,
  BK_Users,
});
