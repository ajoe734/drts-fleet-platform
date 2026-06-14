// bank-screens-3.jsx — Bank Console (3/3): 方案與配額 · 人員與角色 · 稽核
// Quota = bank's #1 metric (unambiguous). Users scoped to issuer tenant. Audit cross-actor, masked refs.

// ── 6. /programs — 方案與配額 ─────────────────────────────────────────────────
function BK_Programs({ theme: th }) {
  return (
    <Shell theme={th} nav={BK_NAV} active="programs"
      breadcrumb={['方案與配額']} env="production" tenant="CTBC" actor={BK_ACTORS.admin} health={BK_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="方案與配額"
        subtitle="每方案 / 期別 · 配額為發卡行頭號指標 · 清楚無歧義"
        meta={<Pill theme={th} tone="info" dot>GET /api/tenant/program-usage · tenant/service-programs</Pill>}
        actions={<Btn theme={th} icon="export">匯出</Btn>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {FX_BK_PROGRAMS.map((p, i) => {
            const pct = Math.round(p.quotaUsed / p.quotaTotal * 100);
            return (
              <Card key={i} theme={th} style={{ borderTop: '2px solid ' + BK_GOLD }}
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{p.name}<Pill theme={th} tone="issuer">{p.tier}</Pill></span>}
                subtitle={p.code + ' · 期別 2026-06'}
                actions={<Btn theme={th} size="xs" variant="ghost" icon="arrow">鑽入</Btn>}>
                {/* 配額 — 強調 */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>禮遇趟次 · benefit quota</div>
                  <BkQuotaBar theme={th} used={p.quotaUsed} total={p.quotaTotal} />
                </div>
                <DL theme={th} cols={2} items={[
                  { k: '服務卡友數', v: p.cardholders.toLocaleString() + ' 人', mono: true },
                  { k: '用量趨勢', v: <span style={{ color: th.success }}>{p.trend} MoM</span> },
                  { k: '覆蓋', v: p.coverage },
                  { k: '權益條款', v: p.perks },
                  { k: '主要例外', v: <Pill theme={th} tone={p.exceptions > 2 ? 'warn' : 'neutral'}>{p.exceptions} 筆</Pill> },
                  { k: '資格政策', v: '末四碼 / 網銀身分' },
                ]} />
                <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                  <ActionButton theme={th} size="xs" descriptor={{ action: 'edit_policy', enabled: true, riskLevel: 'medium' }} icon="rules" label="編輯資格政策" en="policy" />
                  <Btn theme={th} size="xs" icon="export">匯出用量</Btn>
                </div>
              </Card>
            );
          })}
        </div>
        <Card theme={th} title="配額彙總 · 全方案" subtitle="本年度權益池 · 已用 / 配額（剩餘）" padding={0}>
          <Table theme={th} columns={[
            { h: '方案', k: 'name', w: 200, r: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
            { h: '碼', k: 'code', w: 120, mono: true },
            { h: '卡友', w: 90, mono: true, align: 'right', r: r => r.cardholders.toLocaleString() },
            { h: '已用', w: 90, mono: true, align: 'right', r: r => <span style={{ color: BK_GOLD }}>{r.quotaUsed.toLocaleString()}</span> },
            { h: '配額', w: 90, mono: true, align: 'right', r: r => r.quotaTotal.toLocaleString() },
            { h: '剩餘', w: 90, mono: true, align: 'right', r: r => <span style={{ fontWeight: 600 }}>{(r.quotaTotal - r.quotaUsed).toLocaleString()}</span> },
            { h: '使用率', w: 150, r: r => {
              const pct = Math.round(r.quotaUsed / r.quotaTotal * 100);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: th.surfaceLo, overflow: 'hidden', border: '1px solid ' + th.border }}>
                    <div style={{ width: pct + '%', height: '100%', background: BK_GOLD }} />
                  </div>
                  <span style={{ fontFamily: SHELL_MONO, fontSize: 11, color: th.textMuted, width: 32, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            }},
          ]} rows={FX_BK_PROGRAMS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 7. /users — 人員與角色 ────────────────────────────────────────────────────
function BK_Users({ theme: th }) {
  const roleTone = { bank_program_admin: 'accent', bank_ops_viewer: 'info', bank_finance: 'issuer' };
  return (
    <Shell theme={th} nav={BK_NAV} active="users"
      breadcrumb={['人員與角色']} env="production" tenant="CTBC" actor={BK_ACTORS.admin} health={BK_HEALTH}
      refreshTier="slow" dataFreshness="fresh">
      <PageHeader theme={th} title="人員與角色"
        subtitle="三種銀行人物（+管理員）· scoped to issuer tenant · 全程稽核"
        tabs={[
          { id: 'all', label: '全部', badge: '5' },
          { id: 'active', label: '啟用', badge: '3', tone: 'accent' },
          { id: 'invited', label: '已邀請', badge: '1', tone: 'info' },
          { id: 'suspended', label: '停用', badge: '1' },
        ]}
        activeTab="all"
        actions={<ActionButton theme={th} descriptor={{ action: 'invite_user', enabled: true, riskLevel: 'medium' }} variant="primary" icon="plus" label="邀請成員" en="invite" />} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <Card theme={th} padding={14}>
            <BiLabel theme={th} zh="方案管理員" en="program_admin" size={12} />
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 6, lineHeight: 1.5 }}>方案、配額、合約、人員、稽核全可見；可編資格政策與管理成員。</div>
          </Card>
          <Card theme={th} padding={14}>
            <BiLabel theme={th} zh="營運檢視" en="ops_viewer" size={12} />
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 6, lineHeight: 1.5 }}>訂單清單與詳情、例外；唯讀，無結算金額、不可動派遣。</div>
          </Card>
          <Card theme={th} padding={14}>
            <BiLabel theme={th} zh="財務" en="finance" size={12} />
            <div style={{ fontSize: 12, color: th.textMuted, marginTop: 6, lineHeight: 1.5 }}>對帳單與逐趟明細、簽名檔下載；可對銀行自有帳。</div>
          </Card>
        </div>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '姓名', w: 130, r: r => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 26, height: 26, borderRadius: 13, background: th.accentBg, color: th.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: '1px solid ' + th.accentBorder }}>{r.name.slice(0, 1)}</span>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
              </div>
            )},
            { h: 'EMAIL', k: 'email', mono: true },
            { h: '角色', w: 180, r: r => <Pill theme={th} tone={roleTone[r.role]}>{BK_ROLE_LABEL[r.role].zh}<span style={{ marginLeft: 4, opacity: 0.7, fontFamily: SHELL_MONO, fontSize: 9.5 }}>{BK_ROLE_LABEL[r.role].en}</span></Pill> },
            { h: '狀態', w: 96, r: r => <Pill theme={th} tone={bkUserTone(r.status)} dot>{r.status}</Pill> },
            { h: '最後活動', k: 'last', w: 130, r: r => <span style={{ fontSize: 11.5, color: th.textMuted }}>{r.last}</span> },
            { h: '操作', w: 210, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'change_role', enabled: r.status !== 'suspended', disabledReasonCode: 'user_suspended', riskLevel: 'medium' }} label="改角色" en="role" />
                <ActionButton theme={th} size="xs" descriptor={{ action: r.status === 'suspended' ? 'reactivate' : 'suspend', enabled: r.status !== 'invited', disabledReasonCode: 'pending_invite', riskLevel: 'high', requiresReason: true }} label={r.status === 'suspended' ? '復用' : '停用'} en={r.status === 'suspended' ? 'reactivate' : 'suspend'} />
              </div>
            )},
          ]} rows={FX_BK_USERS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── 8. /audit — 稽核 ──────────────────────────────────────────────────────────
function BK_Audit({ theme: th }) {
  return (
    <Shell theme={th} nav={BK_NAV} active="audit"
      breadcrumb={['稽核']} env="production" tenant="CTBC" actor={BK_ACTORS.admin} health={BK_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="稽核"
        subtitle="方案管理員（+法遵）· cross-actor · 唯讀 · 自我稽核感知"
        meta={<>
          <Select theme={th} value="類型：全部" />
          <Select theme={th} value="操作者：全部" />
          <Select theme={th} value="期別：2026-06" />
        </>}
        actions={<Btn theme={th} icon="export">匯出</Btn>} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="neutral" icon="eye"
          title="自我稽核感知 · self-audit aware"
          body="發卡 / 權益參照保留但遮罩。本頁的「列稽核」動作本身也是一筆被稽核事件。" />
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: '時間', k: 'at', w: 160, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.at}</span> },
            { h: '操作者', w: 200, r: r => <ActorRealmChip theme={th} realm={r.realm} actor={r.actor} /> },
            { h: '事件類型', w: 150, r: r => <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}><Pill theme={th} tone={bkAuditTypeTone(r.type)}>{r.type}</Pill></span> },
            { h: '主體 (遮罩)', r: r => <span style={{ fontFamily: SHELL_MONO, fontSize: 11.5, color: th.text }}>{r.subject}</span> },
            { h: '結果', w: 150, r: r => <span style={{ fontSize: 12, color: r.result.includes('denied') ? th.danger : th.text }}>{r.result}</span> },
            { h: '原因碼', k: 'reason', w: 130, mono: true, r: r => <span style={{ color: th.textDim, fontSize: 11 }}>{r.reason}</span> },
            { h: '連結實體', w: 120, r: r => <Btn theme={th} size="xs" variant="ghost" icon="arrow">{r.entity}</Btn> },
          ]} rows={FX_BK_AUDIT} />
        </Card>
        <div style={{ fontSize: 11, color: th.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MgmtIcon name="lock" size={12} /> 事件類型：資格決策 · 派遣動作 · 結算關帳 · 存取。跨來源（系統 / 營運 / 平台 / 發卡行）統一呈現。
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, { BK_Programs, BK_Users, BK_Audit });
