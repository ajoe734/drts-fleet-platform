// ent-states.jsx — Enterprise Dispatch (3/3): negative/gate states + embed identity states.
// VQ-5: gate states share ONE support-safe template — enterprise-branded, calm, reason + next step + support.

// ── unified gate template (web) ──────────────────────────────────────────────
const ENT_GATES = {
  'auth-required': {
    icon: 'lock', tone: 'primary', route: '/auth-required',
    title: '請先登入企業帳號', posture: '需要登入 · auth_required',
    body: '您的登入狀態已失效或尚未登入。請使用企業 SSO 重新登入後繼續預約。',
    rows: [['通道', '企業內部網站版'], ['身分來源', '企業 SSO / tenant session'], ['目前狀態', '工作階段缺失']],
    primary: '以企業 SSO 登入', ghost: '聯絡 IT 支援',
  },
  'suspended': {
    icon: 'ban', tone: 'danger', route: '/suspended',
    title: '帳號目前無法使用', posture: '無使用權限 · no_access',
    body: '您的帳號或所屬租戶目前無法使用企業派車，可能因權限調整或合約狀態變更。請聯絡企業管理員協助。',
    rows: [['帳號', '林冠廷 · #2204'], ['租戶', '鴻碩科技'], ['原因碼', 'TENANT_SUSPENDED']],
    primary: '聯絡企業管理員', ghost: '返回登入',
  },
  'approval-pending': {
    icon: 'shield', tone: 'warn', route: '/approval-pending',
    title: '預約已送出 · 等待審批', posture: '待審批 · approval_pending',
    body: '預約已成功建立，正在等待 高志遠（產品部主管）審批。核准後系統會自動派車並通知您。',
    rows: [['預約編號', 'EB-7K2C44'], ['審批人', '高志遠 · 產品部主管'], ['送出時間', '06-13 09:02'], ['目前狀態', '等待核准']],
    primary: '查看預約詳情', ghost: '返回首頁',
  },
  'approval-rejected': {
    icon: 'x', tone: 'danger', route: '/approval-rejected',
    title: '審批未通過', posture: '已拒絕 · approval_rejected',
    body: '此預約未獲核准。您可調整成本中心或金額後重新建立，或與審批人確認。',
    rows: [['預約編號', 'EB-7K2C44'], ['審批人', '高志遠 · 產品部主管'], ['拒絕原因', '超出客戶接待當月預算'], ['建議', '改用其他成本中心']],
    primary: '調整後重新建立', ghost: '聯絡審批人',
  },
  'quota-blocked': {
    icon: 'bolt', tone: 'warn', route: '/quota-blocked',
    title: '本月額度已用罄', posture: '額度受限 · quota_blocked',
    body: '產品部本月派車額度（40 趟）已用完，暫時無法建立新的預約。可改用其他成本中心，或等下月額度重置。',
    rows: [['成本中心', 'CC-PRD-01 · 產品部'], ['本月額度', '40 / 40 趟（已用罄）'], ['重置時間', '2026-07-01'], ['替代', '可選其他有效成本中心']],
    primary: '改用其他成本中心', ghost: '查看額度',
  },
  'no-supply': {
    icon: 'car', tone: 'danger', route: '/no-supply',
    title: '目前無法派車', posture: '暫無可派車輛 · no_supply',
    body: '您的請求已受理，但此時段與地點暫無可調度車輛。建議更改用車時間或稍後重試，系統也會嘗試自動補派。',
    rows: [['時段', '06-14 04:00 · 凌晨'], ['地點', '新竹科學園區'], ['指令狀態', '已受理 accepted'], ['補派', '系統重試中']],
    primary: '更改用車時間', ghost: '聯絡企業客服',
  },
  'degraded': {
    icon: 'alert', tone: 'warn', route: '/degraded',
    title: '服務暫時不穩定', posture: '服務降級 · degraded',
    body: '派車服務目前回應較慢。您仍可瀏覽與建立預約，送出後系統會在恢復後自動確認，無需重複送出。',
    rows: [['受影響', '即時派車 / 狀態更新'], ['可用', '建立預約 · 瀏覽歷史'], ['預計恢復', '評估中'], ['緊急用車', '請改撥客服專線']],
    primary: '重試', ghost: '查看服務狀態',
  },
};

function ENT_Gate({ t, kind = 'auth-required' }) {
  const g = ENT_GATES[kind];
  const u = ENT_USERS.requester;
  const toneFg = g.tone === 'danger' ? t.danger : g.tone === 'warn' ? t.warn : t.primary;
  const toneBg = g.tone === 'danger' ? t.dangerBg : g.tone === 'warn' ? t.warnBg : t.primaryBg;
  return (
    <EntWebShell t={t} active={null} user={u} quota={ENT_QUOTA.label}>
      <div style={{ maxWidth: 540, margin: '20px auto' }}>
        <ECard t={t} accent={toneFg}>
          <div style={{ textAlign: 'center', padding: '12px 6px 4px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, margin: '0 auto 15px', background: toneBg, color: toneFg,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EIcon name={g.icon} size={29} /></div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>{g.title}</h1>
            <EPill t={t} tone={g.tone} dot>{g.posture}</EPill>
            <p style={{ fontSize: 13.5, color: t.muted, lineHeight: 1.65, maxWidth: 420, margin: '12px auto 0' }}>{g.body}</p>
          </div>
          <div style={{ marginTop: 16, background: t.surfaceLo, border: '1px solid ' + t.line, borderRadius: 12, padding: '4px 16px' }}>
            {g.rows.map((r, i) => <ERow t={t} key={i} k={r[0]} v={r[1]} mono={i === 0} last={i === g.rows.length - 1} />)}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <EBtn t={t} variant={g.tone === 'danger' ? 'default' : 'primary'} block>{g.primary}</EBtn>
            <EBtn t={t} variant="default" block>{g.ghost}</EBtn>
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + t.lineSoft, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <EIcon name="phone" size={13} style={{ color: t.muted }} />
            <span style={{ fontSize: 12, color: t.muted }}>需要協助？企業客服 0800-200-118 · 24h</span>
          </div>
        </ECard>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 11, color: t.faint, fontFamily: t.mono }}>{g.route}</span>
        </div>
      </div>
    </EntWebShell>
  );
}

// ── embed identity states (compact app webview) ──────────────────────────────
function EntEmbedTokenRow({ t, ok, k, en, v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid ' + t.lineSoft }}>
      <span style={{ width: 19, height: 19, borderRadius: 10, background: ok ? t.successBg : t.dangerBg, color: ok ? t.success : t.danger,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <EIcon name={ok ? 'check' : 'x'} size={11} stroke={3} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: t.ink, fontWeight: 500 }}>{k}</div>
        {en && <div style={{ fontFamily: t.mono, fontSize: 9.5, color: t.faint }}>{en}</div>}
      </div>
      <span style={{ fontSize: 12, fontFamily: t.mono, color: ok ? t.ink : t.danger }}>{v}</span>
    </div>
  );
}
function EntEmbedHero({ t, icon, tone, title, posture }) {
  const fg = tone === 'danger' ? t.danger : tone === 'warn' ? t.warn : tone === 'success' ? t.success : t.primary;
  const bg = tone === 'danger' ? t.dangerBg : tone === 'warn' ? t.warnBg : tone === 'success' ? t.successBg : t.primaryBg;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '12px 0 4px' }}>
      <div style={{ width: 56, height: 56, borderRadius: 28, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EIcon name={icon} size={27} /></div>
      <div style={{ fontSize: 16.5, fontWeight: 800 }}>{title}</div>
      <EPill t={t} tone={tone} dot>{posture}</EPill>
    </div>
  );
}

function ENT_EmbedHandoff({ t }) {
  return (
    <EntEmbedShell t={t} badgeTone="live"
      footer={<EBtn t={t} variant="primary" block iconR="arrow">開始預約用車</EBtn>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <EntEmbedHero t={t} icon="shield" tone="success" title="已透過企業 App 登入" posture="handoff_ok · 自動帶入" />
        <ECard t={t} pad={15} title="身分由企業 App 帶入" sub="signed hand-off token">
          <EntEmbedTokenRow t={t} ok k="企業簽章有效" en="tenant_signature" v="valid" />
          <EntEmbedTokenRow t={t} ok k="員工身分已解析" en="employee_resolved" v="林冠廷" />
          <EntEmbedTokenRow t={t} ok k="租戶 scope" en="tenant_scope" v="鴻碩科技" />
          <div style={{ marginTop: 4 }}><ERow t={t} k="部門" v="產品部 · #2204" last /></div>
        </ECard>
        <EBanner t={t} tone="primary" icon="bolt" body="免再登入 · 略過獨立登入，直接進入預約流程。內嵌頁不會要求輸入管理型憑證。" />
      </div>
    </EntEmbedShell>
  );
}

function ENT_EmbedReauth({ t }) {
  return (
    <EntEmbedShell t={t} badgeTone="warn"
      footer={<><EBtn t={t} variant="primary" block>回企業 App 重新驗證</EBtn><EBtn t={t} variant="ghost" block size="sm">稍後再試</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <EntEmbedHero t={t} icon="clock" tone="warn" title="登入狀態已逾時" posture="reauth_required" />
        <ECard t={t} pad={15} title="連線狀態">
          <EntEmbedTokenRow t={t} ok={false} k="企業工作階段已過期" en="tenant_session" v="expired" />
          <EntEmbedTokenRow t={t} ok={false} k="交付權杖逾時" en="handoff_token" v="stale" />
        </ECard>
        <EBanner t={t} tone="warn" icon="shield" body={<span>為保護企業帳戶安全，請回到 <b>鴻碩科技 App</b> 重新驗證身分。此頁不會要求輸入帳號或密碼。</span>} />
      </div>
    </EntEmbedShell>
  );
}

function ENT_EmbedUnsupported({ t }) {
  return (
    <EntEmbedShell t={t} host="unknown-host" badgeTone="err"
      footer={<EBtn t={t} variant="primary" block iconR="ext">前往企業內部網站</EBtn>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <EntEmbedHero t={t} icon="ban" tone="danger" title="無法在此環境開啟" posture="unsupported_host · 已封鎖" />
        <ECard t={t} pad={15} title="原因">
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>此功能僅能於授權的企業 App 內開啟。目前來源並非已授權的租戶環境，基於安全考量已封鎖載入。</div>
        </ECard>
        <ECard t={t} pad={15} title="偵測結果">
          <EntEmbedTokenRow t={t} ok={false} k="來源主機未授權" en="origin_host" v="未授權" />
          <EntEmbedTokenRow t={t} ok={false} k="租戶 realm 不符" en="tenant_realm" v="mismatch" />
        </ECard>
        <div style={{ fontSize: 11.5, color: t.muted, lineHeight: 1.55, padding: '0 2px' }}>請改由 鴻碩科技 企業 App 內的「企業派車」入口開啟，或前往內部網站。</div>
      </div>
    </EntEmbedShell>
  );
}

function ENT_EmbedConsent({ t }) {
  const scopes = [
    ['讀取員工身分與部門', '解析交付權杖以建立預約', 'identity.read'],
    ['共享派車必要資訊', '與 DRTS 共享派車所需的行程資訊', 'trip.share'],
    ['記入成本中心', '用車費用記入所選成本中心並月結對帳', 'billing.costcenter'],
  ];
  return (
    <EntEmbedShell t={t} badgeTone="live"
      footer={<><EBtn t={t} variant="primary" block>同意並繼續</EBtn><EBtn t={t} variant="ghost" block size="sm">暫不使用</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ padding: '6px 0 2px' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>授權使用企業派車</div>
          <div style={{ fontSize: 12.5, color: t.muted, marginTop: 4 }}>首次使用 · 請確認以下授權範圍 · consent_required</div>
        </div>
        <ECard t={t} pad={15}>
          {scopes.map((c, i, a) => (
            <div key={i} style={{ display: 'flex', gap: 11, padding: '11px 0', borderBottom: i < a.length - 1 ? '1px solid ' + t.lineSoft : 'none' }}>
              <span style={{ width: 20, height: 20, borderRadius: 5, background: t.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><EIcon name="check" size={12} stroke={3} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontSize: 13, fontWeight: 700 }}>{c[0]}</span><span style={{ fontFamily: t.mono, fontSize: 9.5, color: t.faint }}>{c[2]}</span></div>
                <div style={{ fontSize: 11.5, color: t.muted, marginTop: 2, lineHeight: 1.45 }}>{c[1]}</div>
              </div>
            </div>
          ))}
        </ECard>
        <EBanner t={t} tone="primary" icon="lock" body="不會讀取帳號或密碼 · 身分由企業 App 安全帶入。可於企業 App 設定隨時撤回授權。" />
      </div>
    </EntEmbedShell>
  );
}

function ENT_EmbedFallback({ t }) {
  return (
    <EntEmbedShell t={t} badgeTone="neutral"
      footer={<><EBtn t={t} variant="primary" block iconR="ext">前往企業內部網站</EBtn><EBtn t={t} variant="ghost" block size="sm">回企業 App 登入</EBtn></>}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <EntEmbedHero t={t} icon="ext" tone="neutral" title="未偵測到企業登入" posture="fallback_to_web · 改用網站" />
        <ECard t={t} pad={15} title="接下來">
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>此頁未取得有效的企業內嵌身分。您可改用 <b>企業內部網站版</b>，以企業 SSO 登入後繼續建立預約。</div>
        </ECard>
        <ECard t={t} pad={15}>
          <ERow t={t} k="內部網站" v="go.hongshuo.com.tw" mono />
          <ERow t={t} k="登入方式" v="企業 SSO" />
          <ERow t={t} k="安全性" v="不在此頁輸入憑證" last />
        </ECard>
      </div>
    </EntEmbedShell>
  );
}

Object.assign(window, {
  ENT_GATES, ENT_Gate, EntEmbedTokenRow, EntEmbedHero,
  ENT_EmbedHandoff, ENT_EmbedReauth, ENT_EmbedUnsupported, ENT_EmbedConsent, ENT_EmbedFallback,
});
