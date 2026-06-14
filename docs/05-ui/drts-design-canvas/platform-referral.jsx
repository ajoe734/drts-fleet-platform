// platform-referral.jsx — Group C · platform-admin referral 渠道管理 (DRTS 內部營運方).
// EXTENDS Platform Admin (same `platform` realm + mgmt primitives). Reuses Shell/PageHeader/Card/DL/Field/Input/Toggle/Pill/Table/Btn/ActionButton/SecretRevealModal.
// Backend API exists: platform-admin/partner-entries CRUD + activate/deactivate/revoke + credential issue/revoke.
// partnerType = referral_channel. Adds: entryHost whitelist (embed CSP), themeAccent/brandingMetadata, rate config, ingress credential.

const FX_REF_CHANNELS = [
  { id: 'pe_201', name: '御和物業', slug: 'yuhe-residence', host: 'app.yuhe-living.com.tw', accent: '#0F766E', rate: '10% GMV', status: 'active', users: 268 },
  { id: 'pe_202', name: '康橋社區', slug: 'cambridge-community', host: 'home.cambridge-living.tw', accent: '#3B4BA8', rate: 'NT$ 25 / 趟', status: 'active', users: 156 },
  { id: 'pe_203', name: '長虹天璽', slug: 'changhong-prime', host: 'life.changhong-prime.tw', accent: '#9A3412', rate: '8% GMV', status: 'inactive', users: 0 },
];
function refChannelTone(s) { return s === 'active' ? 'success' : s === 'inactive' ? 'warn' : 'neutral'; }

// ── C1a. /partners?type=referral — list ──────────────────────────────────────
function PA_RefChannels({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="partners"
      breadcrumb={['合作夥伴治理', '合作夥伴', 'Referral Channels']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="Referral 渠道夥伴"
        subtitle="partnerType=referral_channel · 社區物業 App 內嵌叫車渠道 · entryHost 白名單 / 品牌 / 費率"
        tabs={[
          { id: 'referral', label: 'Referral Channels', badge: '3', tone: 'accent' },
          { id: 'card', label: '信用卡 / 機場' },
          { id: 'enterprise', label: '企業 / 飯店' },
        ]}
        activeTab="referral"
        actions={<><Btn theme={th} icon="filter">篩選</Btn><Btn theme={th} variant="primary" icon="plus">建立 referral 渠道</Btn></>} />
      <div style={{ padding: 24 }}>
        <Card theme={th} padding={0}>
          <Table theme={th} columns={[
            { h: 'CHANNEL', w: 200, r: r => <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id} · /{r.slug}</div></div> },
            { h: 'TYPE', w: 150, r: () => <Pill theme={th} tone="accent">referral_channel</Pill> },
            { h: 'ENTRY HOST · 白名單', k: 'host', w: 220, mono: true },
            { h: 'THEME', w: 110, r: r => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: r.accent, border: '1px solid ' + th.border }} /><span style={{ fontFamily: SHELL_MONO, fontSize: 11 }}>{r.accent}</span></span> },
            { h: '分潤費率', k: 'rate', w: 120, mono: true },
            { h: '活躍用戶', k: 'users', w: 100, mono: true, align: 'right' },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={refChannelTone(r.status)} dot>{r.status}</Pill> },
            { h: '', w: 28, r: () => <MgmtIcon name="more" size={14} style={{ color: th.textDim }} /> },
          ]} rows={FX_REF_CHANNELS} />
        </Card>
      </div>
    </Shell>
  );
}

// ── C1b. /partners/new?type=referral — create / edit form ────────────────────
function PA_RefChannelEdit({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="partners"
      breadcrumb={['合作夥伴', '建立 referral 渠道']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="建立 / 編輯 referral 渠道"
        subtitle="partnerType=referral_channel · 設定品牌、entryHost 白名單與狀態"
        actions={<><Btn theme={th}>取消</Btn><Btn theme={th} variant="primary" icon="check">儲存並啟用</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="基本資料" subtitle="identity">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field theme={th} label="displayName · 顯示名稱"><Input theme={th} value="御和物業" /></Field>
              <Field theme={th} label="entrySlug · 入口代碼"><Input theme={th} value="yuhe-residence" mono /></Field>
              <Field theme={th} label="partnerType">
                <div style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 12px', border: '1px solid ' + th.border, borderRadius: 8, background: th.surfaceLo }}>
                  <Pill theme={th} tone="accent">referral_channel</Pill>
                </div>
              </Field>
              <Field theme={th} label="狀態 · status">
                <div style={{ display: 'flex', gap: 6 }}>
                  {['active', 'inactive', 'revoked'].map((s, i) => (
                    <span key={s} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid ' + (i === 0 ? th.accent : th.border), background: i === 0 ? th.accentBg : th.surface, color: i === 0 ? th.accent : th.textMuted }}>{s}</span>
                  ))}
                </div>
              </Field>
            </div>
          </Card>

          <Card theme={th} title="entryHost 白名單" subtitle="embed CSP · 僅這些 host 可內嵌此渠道（frame-ancestors）">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['app.yuhe-living.com.tw', 'app-stg.yuhe-living.com.tw'].map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid ' + th.border, borderRadius: 8, background: th.surface }}>
                  <MgmtIcon name="lock" size={14} style={{ color: th.success }} />
                  <span style={{ flex: 1, fontFamily: SHELL_MONO, fontSize: 12.5 }}>{h}</span>
                  <Pill theme={th} tone={i === 0 ? 'success' : 'neutral'}>{i === 0 ? 'production' : 'staging'}</Pill>
                  <MgmtIcon name="x" size={14} style={{ color: th.textDim, cursor: 'pointer' }} />
                </div>
              ))}
              <Btn theme={th} size="sm" variant="secondary" icon="plus">新增 host</Btn>
            </div>
            <div style={{ marginTop: 10 }}>
              <Banner theme={th} tone="info" icon="info" body="非白名單 host 內嵌將被 unsupported_host 狀態擋下（對應 Passenger Embed A1.3）。" />
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="品牌 · brandingMetadata" subtitle="themeAccent / logo">
            <Field theme={th} label="themeAccent · 主色">
              <div style={{ display: 'flex', gap: 8 }}>
                {['#0F766E', '#3B4BA8', '#9A3412', '#B0335F'].map((c, i) => (
                  <span key={c} style={{ width: 34, height: 34, borderRadius: 8, background: c, cursor: 'pointer',
                    border: '2px solid ' + (i === 0 ? th.text : 'transparent'), boxShadow: i === 0 ? '0 0 0 2px ' + th.bg + ' inset' : 'none' }} />
                ))}
              </div>
            </Field>
            <div style={{ height: 12 }} />
            <Field theme={th} label="logo · 品牌標記"><Input theme={th} value="yuhe-mark.svg" mono /></Field>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 10, border: '1px solid ' + th.border, background: th.surfaceLo }}>
              <div style={{ fontSize: 11, color: th.textMuted, marginBottom: 8 }}>內嵌預覽 · embed preview</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#0F766E' }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>御</span>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>社區叫車</span>
              </div>
            </div>
          </Card>
          <Card theme={th} title="後端對應" subtitle="API">
            <DL theme={th} cols={1} items={[
              { k: 'CREATE', v: 'POST partner-entries', mono: true },
              { k: 'UPDATE', v: 'PATCH partner-entries/:id', mono: true },
              { k: 'ACTIVATE', v: 'activate / deactivate', mono: true },
              { k: 'REVOKE', v: 'revoke', mono: true },
            ]} />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── C2. /partners/[slug]/rates — 分潤費率設定 ────────────────────────────────
function PA_RefRates({ theme: th }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="partners"
      breadcrumb={['合作夥伴', '御和物業', '分潤費率']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="分潤費率設定 · Revenue Share Rate"
        subtitle="御和物業 · /yuhe-residence · rateType / value / 生效期間 · 變更寫 audit"
        actions={<><Btn theme={th}>取消</Btn><Btn theme={th} variant="primary" icon="check">發佈費率</Btn></>} />
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="當前費率" subtitle="effective rate">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field theme={th} label="rateType · 計費方式">
                <div style={{ display: 'flex', gap: 6 }}>
                  {['百分比', '每趟固定'].map((s, i) => (
                    <span key={s} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid ' + (i === 0 ? th.accent : th.border), background: i === 0 ? th.accentBg : th.surface, color: i === 0 ? th.accent : th.textMuted }}>{s}</span>
                  ))}
                </div>
              </Field>
              <Field theme={th} label="value · 比例 / 金額"><Input theme={th} value="10" mono /></Field>
              <Field theme={th} label="currency"><Input theme={th} value="TWD" mono /></Field>
              <Field theme={th} label="基準 · base"><Input theme={th} value="GMV (完成行程車資)" /></Field>
              <Field theme={th} label="生效起 · effectiveFrom"><Input theme={th} value="2026-07-01" mono /></Field>
              <Field theme={th} label="生效迄 · effectiveTo"><Input theme={th} value="— 無期限" mono /></Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Banner theme={th} tone="warn" icon="warn" title="變更費率將套用於下一期對帳"
                body="費率調整不影響已產生的對帳單；自 effectiveFrom 起的完成行程適用新費率。" />
            </div>
          </Card>
          <Card theme={th} title="費率變更紀錄 · audit" subtitle="所有變更已寫入稽核" padding={0}>
            <Table theme={th} columns={[
              { h: 'AT', w: 150, mono: true, r: () => '2026-06-01 10:22' },
              { h: 'ACTOR', w: 120, r: () => '林俊 · pa_partner_mgr' },
              { h: '變更', w: 240, r: () => <span>8% → <b style={{ color: th.accent }}>10%</b> GMV</span> },
              { h: 'REASON', w: 160, r: () => '續約調整' },
            ]} rows={[{}]} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card theme={th} title="試算" subtitle="本期預估">
            <DL theme={th} cols={1} items={[
              { k: 'GMV (2026-05)', v: 'NT$ 264,300', mono: true },
              { k: '費率', v: '10% of GMV', mono: true },
              { k: '應付分潤', v: 'NT$ 26,430', mono: true },
              { k: '金流方向', v: 'DRTS → 御和物業' },
            ]} />
          </Card>
          <Card theme={th} title="費率規則說明">
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: th.text, lineHeight: 1.7 }}>
              <li>百分比型以 GMV 為基準計算應付分潤。</li>
              <li>每趟固定型以完成行程數 × value 計算。</li>
              <li>費率變更需具備 pa_partner_mgr 權限並寫入 audit。</li>
            </ol>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

// ── C3. /partners/[slug]/credentials — Ingress 憑證管理 ──────────────────────
function PA_RefCredentials({ theme: th, showSecretModal = false }) {
  return (
    <Shell theme={th} nav={PA_NAV} active="partners"
      breadcrumb={['合作夥伴', '御和物業', 'Ingress 憑證']} env="production" actor={PA_ACTOR} health={PA_HEALTH}
      refreshTier="medium_slow" dataFreshness="fresh">
      <PageHeader theme={th} title="Ingress 憑證管理 · s2s Credentials"
        subtitle="供物業 App 後端換取 hand-off token · 簽發 / 撤銷 · 明文僅顯示一次"
        actions={<Btn theme={th} variant="primary" icon="plus">簽發新憑證</Btn>} />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner theme={th} tone="info" icon="info" title="憑證用途 · server-to-server"
          body="物業 App 後端以此 ingress 憑證向 DRTS 換取住戶 hand-off token，再帶入內嵌 webview。憑證明文僅於簽發當下顯示一次，之後一律遮罩。" />
        <Card theme={th} title="已簽發憑證" subtitle="issued credentials" padding={0}>
          <Table theme={th} columns={[
            { h: 'CREDENTIAL', w: 200, r: r => <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: th.textDim, fontFamily: SHELL_MONO }}>{r.id}</div></div> },
            { h: 'SECRET', w: 200, mono: true, r: r => <span style={{ color: th.textMuted }}>{r.masked}</span> },
            { h: 'SCOPE', w: 220, mono: true, r: r => <span style={{ fontSize: 11 }}>{r.scope}</span> },
            { h: 'EXPIRES', k: 'expires', w: 130, mono: true },
            { h: 'STATUS', w: 110, r: r => <Pill theme={th} tone={r.status === 'active' ? 'success' : 'neutral'} dot>{r.status}</Pill> },
            { h: 'ACTIONS', w: 130, r: r => (
              <div style={{ display: 'flex', gap: 4 }}>
                <ActionButton theme={th} size="xs" descriptor={{ action: 'rotate', enabled: r.status === 'active', riskLevel: 'medium' }} label="輪替" en="rotate" />
                <ActionButton theme={th} size="xs" descriptor={{ action: 'revoke', enabled: r.status === 'active', riskLevel: 'high', requiresReason: true }} label="撤銷" en="revoke" />
              </div>
            )},
          ]} rows={[
            { id: 'cred_77a1', name: 'yuhe · production', masked: 'drts_ingress_live_••••_7c41', scope: 'referral.ingress:write', expires: '2026-12-31', status: 'active' },
            { id: 'cred_77a0', name: 'yuhe · staging', masked: 'drts_ingress_stg_••••_2b08', scope: 'referral.ingress:write', expires: '2026-09-30', status: 'active' },
            { id: 'cred_7680', name: 'yuhe · production (old)', masked: 'drts_ingress_live_••••_9d12', scope: 'referral.ingress:write', expires: '2026-03-31', status: 'revoked' },
          ]} />
        </Card>
      </div>
      {showSecretModal && (
        <SecretRevealModal theme={th} secretType="ingress credential"
          name="御和物業 · referral · production"
          secret="drts_ingress_live_9Kd2mLpqRsT4uVwX1yZ_aB3cD5eF7gH9_88102"
          scope="referral.ingress:write · resident.handoff:issue"
          expiresAt="2026-12-31"
          acknowledged={false} />
      )}
    </Shell>
  );
}

Object.assign(window, {
  FX_REF_CHANNELS, refChannelTone,
  PA_RefChannels, PA_RefChannelEdit, PA_RefRates, PA_RefCredentials,
});
