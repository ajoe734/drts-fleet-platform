// ent-shell.jsx — Enterprise Dispatch · shells + device frames.
// WebShell = top-nav workspace (S1). EmbedShell = compact host-app chrome (S2).
// BrowserFrame / PhoneFrame = canvas presentation wrappers.

// ── tenant identity (fictional enterprise) ───────────────────────────────────
const ENT_TENANT = { name: '鴻碩科技', en: 'Hongshuo Technology', mark: '鴻', host: 'go.hongshuo.com.tw',
  appHost: 'hongshuo-workspace', operator: '智慧運輸科技 DRTS' };

// ── browser window frame (desktop web S1) ────────────────────────────────────
function BrowserFrame({ t, route = '/', width, height, children }) {
  return (
    <div style={{ width, height, borderRadius: 14, overflow: 'hidden', background: t.surface,
      border: '1px solid ' + (t.dark ? '#000' : '#D8DEE9'),
      boxShadow: '0 1px 0 rgba(255,255,255,.4) inset, 0 30px 60px -30px rgba(20,30,60,.5)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 40, flexShrink: 0, background: t.dark ? '#0B0F1A' : '#EDEFF4', borderBottom: '1px solid ' + t.line,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <span key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />)}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: t.dark ? '#161C2B' : '#FFFFFF',
            border: '1px solid ' + t.line, borderRadius: 8, padding: '5px 14px', maxWidth: 420, width: '70%', justifyContent: 'center' }}>
            <span style={{ color: t.success, display: 'flex' }}><EIcon name="lock" size={11} /></span>
            <span style={{ fontFamily: t.mono, fontSize: 11.5, color: t.muted }}>{ENT_TENANT.host}<span style={{ color: t.faint }}>{route}</span></span>
          </div>
        </div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: t.bg }}>{children}</div>
    </div>
  );
}

// ── phone frame (embed S2) ───────────────────────────────────────────────────
function PhoneFrame({ t, children, width = 380, height }) {
  return (
    <div style={{ width, height, background: '#05070C', borderRadius: 46, padding: 11, flexShrink: 0,
      boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 116, height: 26, background: '#05070C', borderRadius: 14, zIndex: 30 }} />
      <div style={{ borderRadius: 36, overflow: 'hidden', background: t.bg, height: height ? height - 22 : '100%', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

// ── workspace top nav (S1) ───────────────────────────────────────────────────
function EntWebShell({ t, route = '/', active, user, quota, degraded, children, maxw = 1180 }) {
  const nav = [
    { key: 'home', label: '首頁', href: '/' },
    { key: 'bookings', label: '我的預約', href: '/bookings' },
    { key: 'trip', label: '行程', href: '/trip' },
    { key: 'help', label: '說明', href: '/help' },
  ];
  return (
    <div style={{ flex: 1, overflow: 'auto', background: t.bg, fontFamily: t.sans, color: t.ink }}>
      {/* top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: t.dark ? 'rgba(14,19,32,.86)' : 'rgba(255,255,255,.86)',
        backdropFilter: 'blur(12px)', borderBottom: '1px solid ' + t.line }}>
        <div style={{ maxWidth: maxw, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', gap: 26, padding: '0 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(150deg,' + t.primary + ',' + t.primaryHi + ')',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{ENT_TENANT.mark}</span>
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{ENT_TENANT.name}</div>
              <div style={{ fontSize: 10.5, color: t.muted }}>企業派車 · Dispatch</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
            {nav.map(n => (
              <span key={n.key} style={{ fontSize: 13.5, fontWeight: active === n.key ? 700 : 500,
                color: active === n.key ? t.primary : t.ink2, background: active === n.key ? t.primaryBg : 'transparent',
                padding: '7px 13px', borderRadius: 9 }}>{n.label}</span>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            {quota && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: t.ink2,
              background: t.surface, border: '1px solid ' + t.line, padding: '6px 12px', borderRadius: 999 }}>
              <EIcon name="bolt" size={13} style={{ color: t.primary }} />本月額度 <b style={{ fontFamily: t.mono }}>{quota}</b></span>}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <EAvatar t={t} name={user?.name} size={30} />
              <span style={{ lineHeight: 1.15 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{user?.name}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: t.muted }}>{user?.roleZh}</span>
              </span>
            </span>
          </div>
        </div>
      </div>
      {degraded && (
        <div style={{ maxWidth: maxw, margin: '0 auto', padding: '12px 26px 0' }}>
          <EBanner t={t} tone="warn" icon="alert" title="部分服務暫時不穩定 · service degraded"
            body="目前下游派車服務回應較慢，您仍可建立預約，系統會在恢復後自動確認。" />
        </div>
      )}
      <div style={{ maxWidth: maxw, margin: '0 auto', padding: '26px' }}>{children}</div>
      <div style={{ maxWidth: maxw, margin: '0 auto', padding: '8px 26px 40px', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: t.faint }}>© 2026 {ENT_TENANT.name} · 企業派車前台</span>
        <span style={{ fontSize: 11, color: t.faint }}>接送服務由 {ENT_TENANT.operator} 營運</span>
      </div>
    </div>
  );
}

// page header inside a web shell
function EntPageHead({ t, title, sub, back, actions, meta }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
      <div style={{ flex: 1 }}>
        {back && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: t.muted, marginBottom: 8 }}>
          <EIcon name="chevR" size={13} style={{ transform: 'rotate(180deg)' }} />{back}</div>}
        <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.5, margin: 0, color: t.ink }}>{title}</h1>
        {sub && <p style={{ fontSize: 14, color: t.muted, margin: '6px 0 0', lineHeight: 1.5 }}>{sub}</p>}
        {meta && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{meta}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

// ── compact embed shell (S2) ────────────────────────────────────────────────
function EntEmbedShell({ t, title = '企業派車', host, badgeTone = 'live', children, footer }) {
  const dotC = badgeTone === 'live' ? t.success : badgeTone === 'warn' ? t.warn : badgeTone === 'err' ? t.danger : t.faint;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: t.bg, fontFamily: t.sans, color: t.ink }}>
      {/* host app status bar */}
      <div style={{ height: 44, flexShrink: 0, background: t.dark ? '#0B0F1A' : t.primaryHi, color: '#fff',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 22px 6px', fontSize: 12.5, fontWeight: 600 }}>
        <span>9:41</span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', opacity: 0.9 }}>
          <EIcon name="bolt" size={12} /><EIcon name="shield" size={12} />
        </span>
      </div>
      {/* host app chrome */}
      <div style={{ flexShrink: 0, background: t.dark ? '#0B0F1A' : t.primaryHi, color: '#fff', padding: '4px 12px 12px',
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={{ width: 30, height: 30, borderRadius: 15, background: 'rgba(255,255,255,.16)', border: 'none', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><EIcon name="chevR" size={16} style={{ transform: 'rotate(180deg)' }} /></button>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 10, opacity: 0.74 }}>{ENT_TENANT.name} · 企業 App</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontFamily: t.mono, opacity: 0.75,
          background: 'rgba(255,255,255,.12)', padding: '4px 8px', borderRadius: 999 }}>
          <EIcon name="lock" size={10} />{host || ENT_TENANT.appHost}</span>
      </div>
      {/* webview surface badge */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: t.surface,
        borderBottom: '1px solid ' + t.line, fontSize: 10.5, color: t.muted }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: dotC }} />
        <span style={{ fontFamily: t.mono }}>webview</span>
        <span style={{ color: t.faint }}>· embedded in {ENT_TENANT.name} app</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
      {footer && <div style={{ flexShrink: 0, borderTop: '1px solid ' + t.line, background: t.surface, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>{footer}</div>}
    </div>
  );
}

Object.assign(window, { ENT_TENANT, BrowserFrame, PhoneFrame, EntWebShell, EntPageHead, EntEmbedShell });
