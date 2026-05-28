// tenant-screens-2.jsx — Tenant Console (2/3): Users / API Keys / Webhooks / Notifications / SLA / Integration Governance

// ── 7. /users — tc_admin only
function TN_Users({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="users"
      breadcrumb={['帳號與權限', '使用者']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="使用者"
        subtitle="只有 tc_admin 可操作 · tenant_admin / operator / finance / integration_mgr / viewer"
        actions={<ActionButton theme={th} descriptor={{ action: 'invite', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="邀請" en="invite" />} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', k: 'name', w: 180, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: 'EMAIL', k: 'email', mono: true },
            { h: 'ROLE', k: 'role', w: 200, r: r => <Pill theme={th} tone={r.role === 'tenant_admin' ? 'accent' : 'info'}>{r.role}</Pill> },
            { h: 'STATE', w: 130, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : r.status === 'pending_invite' ? 'warn' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'UPDATED', k: 'updated', mono: true },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'role', enabled: r.status === 'active', disabledReasonCode: 'not_active', riskLevel: 'medium' }} label="更新角色" en="role" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'suspend', enabled: r.status === 'active', disabledReasonCode: 'not_active', riskLevel: 'high', requiresReason: true }} label="停用" en="suspend" />
              </div>
            )},
          ]} rows={FX_TUSERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 8. /api-keys — plaintext-once modal (Q-TEN09)
function TN_ApiKeys({ theme: th, showSecret = false }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="apikeys"
      breadcrumb={['整合', 'API 金鑰']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="API 金鑰"
        subtitle="Live / sandbox · scope · last seen · 撤銷後永久不可復原"
        actions={<>
          <Btn theme={th} icon="ext">API 文件</Btn>
          <ActionButton theme={th} descriptor={{ action: 'issue', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" icon="key" label="建立金鑰" en="issue" />
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="info"
          title="只在建立當下顯示完整金鑰 · Q-TEN09 plaintext-once"
          body="關閉視窗後僅顯示 mask；遺失須重新建立。請務必妥善保存。" />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'NAME', k: 'name', w: 260, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: 'PREFIX', k: 'prefix', w: 110, mono: true },
            { h: 'MASK', k: 'mask', w: 120, mono: true },
            { h: 'SCOPE', k: 'scope', mono: true },
            { h: 'LAST', k: 'last', w: 130, mono: true },
            { h: 'EXPIRES', k: 'expires', w: 130, mono: true },
            { h: 'STATE', w: 110, r: r => <Pill theme={th} tone={r.revoked ? 'danger' : 'success'} dot>{r.revoked ? 'revoked' : 'active'}</Pill> },
            { h: 'ACTIONS', w: 200, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'rotate', enabled: !r.revoked, disabledReasonCode: 'already_revoked', riskLevel: 'high', requiresReason: true }} icon="refresh" label="輪替" en="rotate" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'revoke', enabled: !r.revoked, disabledReasonCode: 'already_revoked', riskLevel: 'high', requiresReason: true }} label="撤銷" en="revoke" />
              </div>
            )},
          ]} rows={FX_KEYS} />
        </Card>
      </div>

      {showSecret && <SecretRevealModal theme={th}
        secretType="API key"
        name="production · ride-portal-v2"
        secret="drts_live_8AB2k1Mvqp_aE32xQ19LzPnT8B2kK1yQ4z"
        scope="bookings:write · bookings:read · invoices:read"
        expiresAt="2027-05-25"
        acknowledged={false} />}
    </Shell>
  );
}

// ── 9. /webhooks — real engine (Q-TEN08); not_provisioned distinct
function TN_Webhooks({ theme: th, engineActive = true }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="webhooks"
      breadcrumb={['整合', 'Webhook']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="Webhook"
        subtitle="端點 · 事件訂閱 · 投遞紀錄 · 重試政策 — 後端 engine 是否啟用直接決定畫面 (Q-TEN08)"
        tabs={[
          { id: 'endpoints', label: 'Endpoints', badge: '3' },
          { id: 'deliveries', label: 'Deliveries' },
          { id: 'replay', label: 'Replay' },
        ]}
        activeTab="endpoints"
        actions={<>
          <Btn theme={th} icon="ext">payload schema</Btn>
          <ActionButton theme={th} descriptor={{ action: 'create_endpoint', enabled: engineActive, disabledReasonCode: 'engine_not_provisioned', riskLevel: 'medium' }} variant="primary" icon="plus" label="新增端點" en="new" />
        </>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!engineActive ? (
          <EmptyState theme={th} reason="not_provisioned"
            messageOverride="此租戶尚未開通 webhook delivery engine。需先啟用方可建立端點。系統不會回填假資料。"
            nextAction={{ label: '連絡支援開通', icon: 'phone' }} />
        ) : (
          <>
            <Card theme={th} padding={0} title="端點 · 3 entries">
              <Table theme={th} columns={[
                { h: 'URL', k: 'url', mono: true, r: r => <span style={{ fontWeight: 600 }}>{r.url}</span> },
                { h: 'EVENTS', w: 320, r: r => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{r.events.map((e, i) => <Pill key={i} theme={th} tone="info">{e}</Pill>)}</div> },
                { h: 'STATE', w: 110, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : 'warn'} dot>{r.status}</Pill> },
                { h: 'LAST', k: 'last', w: 200, mono: true },
              ]} rows={FX_WEBHOOKS} />
            </Card>
            <Card theme={th} title="近 24h 投遞" padding={0}>
              <Table theme={th} dense columns={[
                { h: 'DLV', k: 'id', w: 100, mono: true },
                { h: 'WH', k: 'wh', w: 90, mono: true },
                { h: 'EVENT', k: 'event', w: 200, mono: true },
                { h: 'CODE', k: 'code', w: 90, mono: true, align: 'right', r: r => <Pill theme={th} tone={r.code >= 200 && r.code < 300 ? 'success' : 'danger'}>{r.code}</Pill> },
                { h: 'TRIES', k: 'attempts', w: 80, mono: true, align: 'right' },
                { h: 'AT', k: 'at', mono: true },
                { h: 'DUR', k: 'dur', w: 90, mono: true },
              ]} rows={FX_WEBHOOK_DELIVERIES} />
            </Card>
          </>
        )}
      </div>
    </Shell>
  );
}

// ── 10. /notifications — NEW per Q-TEN02 (event × channel matrix)
function TN_Notifications({ theme: th }) {
  const events = [
    { e: 'booking.created', desc: '新訂單建立後立即發出' },
    { e: 'booking.confirmed', desc: '司機接單並抵達取車點之前' },
    { e: 'booking.cancelled', desc: '訂單取消 (含 tenant / ops / driver 取消)' },
    { e: 'booking.approval_required', desc: '達到 approval rule 條件，需 tenant 主管簽核' },
    { e: 'invoice.ready', desc: '月結 invoice 完成' },
    { e: 'webhook.delivery_failed', desc: '某個 webhook endpoint 連續失敗 3 次' },
    { e: 'quota.threshold_warning', desc: '配額用量 > 80%' },
  ];
  const channels = ['email', 'webhook', 'tenant_console'];
  const matrix = {
    'booking.created': { email: false, webhook: true, tenant_console: true },
    'booking.confirmed': { email: false, webhook: true, tenant_console: false },
    'booking.cancelled': { email: true, webhook: true, tenant_console: true },
    'booking.approval_required': { email: true, webhook: true, tenant_console: true },
    'invoice.ready': { email: true, webhook: true, tenant_console: true },
    'webhook.delivery_failed': { email: true, webhook: false, tenant_console: true, channelDisabled: 'webhook' },
    'quota.threshold_warning': { email: true, webhook: false, tenant_console: true },
  };
  return (
    <Shell theme={th} nav={TN_NAV} active="notifs"
      breadcrumb={['整合', '通知']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="通知偏好"
        subtitle="決定哪些 event 經由哪些 channel 送出 · per-event × per-channel 矩陣"
        actions={<ActionButton theme={th} descriptor={{ action: 'save', enabled: true, riskLevel: 'medium' }} variant="primary" label="儲存設定" en="save" />} />

      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'EVENT TYPE', w: 220, r: r => <span style={{ fontFamily: SHELL_MONO, fontWeight: 600, fontSize: 12 }}>{r.e}</span> },
            { h: 'WHEN', w: 320, r: r => <span style={{ color: th.textMuted, fontSize: 12 }}>{r.desc}</span> },
            ...channels.map(ch => ({
              h: ch.toUpperCase(),
              w: 140,
              r: r => {
                const v = matrix[r.e][ch];
                const disabled = matrix[r.e].channelDisabled === ch;
                return disabled
                  ? <Pill theme={th} tone="neutral"><MgmtIcon name="lock" size={9} style={{ marginRight: 3 }} />not_provisioned</Pill>
                  : <Toggle theme={th} on={v} />;
              },
            })),
          ]} rows={events} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 11. /sla — NEW per Q-TEN02 (Q-TEN07 unit = minutes)
function TN_SLA({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="sla"
      breadcrumb={['服務水準', 'SLA']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="SLA Profile"
        subtitle="wait · arrival · completion 三個門檻 · 單位 = 分鐘 (Q-TEN07)" />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card theme={th} title="當前門檻 · waitThresholdMin / arrivalThresholdMin / completionThresholdMin">
          <Banner theme={th} tone="info" icon="info"
            title="變更影響範圍 · Q-TEN07"
            body="變更只影響新建立的訂單，及之後計算的 SLA event。既有訂單會保留建立時的 SLA snapshot，除非管理員執行 recalculate 命令。" />
          <div style={{ height: 14 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field theme={th} label="waitThresholdMin · 等候門檻" hint="超過此分鐘數標記為 wait 違規"><Input theme={th} value="5" suffix="min" mono /></Field>
            <Field theme={th} label="arrivalThresholdMin · 抵達門檻" hint="ETA 與實際抵達差異上限"><Input theme={th} value="8" suffix="min" mono /></Field>
            <Field theme={th} label="completionThresholdMin · 完成門檻" hint="預估 vs 實際行車時間差異上限"><Input theme={th} value="15" suffix="min" mono /></Field>
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <ActionButton theme={th} descriptor={{ action: 'recalculate', enabled: true, riskLevel: 'high', requiresReason: true }} label="重算既有訂單" en="recalculate" />
            <ActionButton theme={th} descriptor={{ action: 'save', enabled: true, riskLevel: 'high', requiresReason: true }} variant="primary" label="儲存設定" en="save" />
          </div>
        </Card>
        <Card theme={th} title="效益 · 上月 SLA 達成率">
          <DL theme={th} cols={1} items={[
            { k: '總 SLA 評估趟次', v: '3,754', mono: true },
            { k: '達標', v: '3,732 (99.4%)', mono: true },
            { k: 'wait 違規', v: '12', mono: true },
            { k: 'arrival 違規', v: '8', mono: true },
            { k: 'completion 違規', v: '2', mono: true },
            { k: 'updatedAt', v: '2026-05-25 09:00 · 林宜君 (pa_super_admin)', mono: true },
          ]} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 12. /integration-governance — NEW per Q-TEN02 + Q-TEN10 aggregated endpoint
function TN_Integration({ theme: th }) {
  return (
    <Shell theme={th} nav={TN_NAV} active="integration"
      breadcrumb={['整合', '整合就緒度']} env="production" tenant="YAMATO" actor={TN_ACTOR} health={TN_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th}
        title="Integration Governance"
        subtitle="aggregated readiness · 來自 GET /api/tenant/integration-governance/readiness (Q-TEN10 · 單一聚合 endpoint，非 6+ 個查詢)"
        meta={<Pill theme={th} tone="success" dot>5 of 7 ready</Pill>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="info"
          title="本頁透過 1 個 aggregated endpoint 拉資料 · 不是 6+ 個並行查詢"
          body="UI 不應 orchestrate 多個無關 query — 後端統一回 readiness summary，前端只負責 render。" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { t: 'API keys', en: 'api_keys', state: 'ready', detail: '2 active · 0 expiring · scope 涵蓋' },
            { t: 'Webhooks', en: 'webhooks', state: 'ready', detail: '2 endpoints · failure 0% (24h)' },
            { t: 'Notifications routing', en: 'notifications', state: 'partial', detail: '2 / 3 channel 啟用 · webhook 待設定' },
            { t: 'SLA profile', en: 'sla_profile', state: 'ready', detail: '3 thresholds 已設定' },
            { t: 'Reports availability', en: 'reports', state: 'ready', detail: 'monthly_usage / sla_breach 可用' },
            { t: 'Module enablement', en: 'modules', state: 'partial', detail: '11 / 13 modules 啟用' },
            { t: 'Partner entries', en: 'partner_entries', state: 'not_provisioned', detail: '本租戶 (YAMATO) 無 partner entry' },
          ].map(c => (
            <Card key={c.en} theme={th}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 13,
                  background: c.state === 'ready' ? th.successBg : c.state === 'partial' ? th.warnBg : th.surfaceLo,
                  color: c.state === 'ready' ? th.success : c.state === 'partial' ? th.warn : th.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><MgmtIcon name={c.state === 'ready' ? 'check' : c.state === 'partial' ? 'warn' : 'info'} size={13} stroke={2.2} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.t}</div>
                  <div style={{ fontSize: 10.5, color: th.textDim, fontFamily: SHELL_MONO }}>{c.en}</div>
                </div>
                <Pill theme={th} tone={c.state === 'ready' ? 'success' : c.state === 'partial' ? 'warn' : 'neutral'} dot>{c.state}</Pill>
              </div>
              <div style={{ fontSize: 12, color: th.textMuted, marginTop: 8, lineHeight: 1.5 }}>{c.detail}</div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                <Btn theme={th} size="xs" icon="chevR">設定 →</Btn>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, {
  TN_Users, TN_ApiKeys, TN_Webhooks, TN_Notifications, TN_SLA, TN_Integration,
});
