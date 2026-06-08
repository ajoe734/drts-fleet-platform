// driver-primitives.jsx — Mobile UI building blocks for the driver app.
// Phone bezel, status bar, sticky bottom action bar (per spec §5.1),
// list/card rows, pills, authority chips, refresh/stale, empty states,
// confirmation sheet helpers, press-and-hold (visual only).

// ── Phone bezel ─────────────────────────────────────────────────────────────
function PhoneBezel({ device = 'large', dark = false, children }) {
  const dims = device === 'narrow' ? { w: 360, h: 800 } : { w: 412, h: 915 };
  const bezel = dark ? '#0A0E14' : '#1A1F2A';
  return (
    <div style={{
      width: dims.w, height: dims.h,
      borderRadius: 38, overflow: 'hidden', position: 'relative',
      background: dark ? '#0B1018' : '#F6F8FB',
      border: `9px solid ${bezel}`,
      boxShadow: dark
        ? '0 30px 80px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.04)'
        : '0 30px 80px rgba(15,23,42,.18), inset 0 0 0 1px rgba(255,255,255,.6)',
      fontFamily: DRV_FONT,
    }}>
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        width: 22, height: 22, borderRadius: 11, background: '#0A0E14', zIndex: 10,
      }} />
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

// ── Status bar + bottom indicator ───────────────────────────────────────────
function DrvStatusBar({ theme: t }) {
  return (
    <div style={{
      height: 36, padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 13, fontWeight: 600, color: t.text, letterSpacing: 0.2, background: t.bg, flexShrink: 0,
    }}>
      <span style={{ fontFamily: DRV_MONO }}>9:30</span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: 0.85 }}>
        <DrvIcon name="wifi" size={13} />
        <span style={{ fontSize: 11, fontFamily: DRV_MONO }}>87%</span>
        <span style={{ width: 22, height: 11, border: '1.2px solid ' + t.text, borderRadius: 2.5, position: 'relative', display: 'inline-block' }}>
          <span style={{ position: 'absolute', inset: 1.5, right: 4, background: t.text, borderRadius: 1 }} />
        </span>
      </div>
    </div>
  );
}

function DrvHomeIndicator({ theme: t }) {
  return (
    <div style={{
      height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.bgRaised, flexShrink: 0,
    }}>
      <div style={{ width: 132, height: 4, background: t.text, opacity: 0.7, borderRadius: 2 }} />
    </div>
  );
}

// ── Identity / refresh chip in compact header (per spec §5.1) ──────────────
function DrvIdentityChip({ theme: t, shift = 'on', refreshTier = 'medium', dataFreshness = 'fresh' }) {
  const shiftTones = {
    on: { fg: t.success, bg: t.successBg, label: '上班', en: 'ON-SHIFT' },
    off: { fg: t.textMuted, bg: t.surfaceLo, label: '下班', en: 'OFF-SHIFT' },
    sos: { fg: t.danger, bg: t.dangerBg, label: 'SOS', en: 'SOS ACTIVE' },
  };
  const s = shiftTones[shift];
  const fresh = dataFreshness === 'fresh';
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 1, height: 22, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{
        padding: '0 7px', display: 'flex', alignItems: 'center', gap: 4,
        background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: 2.5, background: s.fg }} />
        {s.label} <span style={{ fontFamily: DRV_MONO, opacity: 0.7, fontSize: 9 }}>{s.en}</span>
      </div>
      <div style={{
        padding: '0 7px', display: 'flex', alignItems: 'center', gap: 4,
        background: t.surfaceLo, color: fresh ? t.success : t.warn, fontFamily: DRV_MONO,
        fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
      }}>
        {refreshTier === 'urgent' ? 'T0' : refreshTier === 'fast' ? 'T1' : refreshTier === 'medium' ? 'T3' : 'M'}
      </div>
    </div>
  );
}

// ── Compact mobile top app bar ──────────────────────────────────────────────
function DrvAppBar({ theme: t, title, zh, en, back, right, shift = 'on', refreshTier = 'medium', dataFreshness = 'fresh' }) {
  return (
    <div style={{
      flexShrink: 0, padding: '8px 14px 10px',
      background: t.bgRaised, borderBottom: '1px solid ' + t.border,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {back && (
        <button style={{ width: 32, height: 32, border: 'none', background: 'transparent', color: t.text, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DrvIcon name="arrowL" size={20} stroke={2} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? <div style={{ fontSize: 17, fontWeight: 700, color: t.text, lineHeight: 1.15 }}>{title}</div> : <DrvBi zh={zh} en={en} theme={t} size={17} />}
      </div>
      <DrvIdentityChip theme={t} shift={shift} refreshTier={refreshTier} dataFreshness={dataFreshness} />
      {right}
    </div>
  );
}

// ── Tab bar (5 tabs) ────────────────────────────────────────────────────────
function DrvTabBar({ theme: t, active = 'home', hidden = false, sosActive = false }) {
  if (hidden) return null;
  const items = [
    { id: 'home', zh: '工作台', en: 'home', icon: 'home' },
    { id: 'jobs', zh: '任務', en: 'jobs', icon: 'list', badge: 3 },
    { id: 'trip', zh: '行程', en: 'trip', icon: 'car' },
    { id: 'platform', zh: '平台', en: 'platforms', icon: 'layers', warn: true },
    { id: 'settings', zh: '設定', en: 'settings', icon: 'user' },
  ];
  return (
    <div style={{
      flexShrink: 0, padding: '8px 4px 6px',
      background: t.bgRaised, borderTop: '1px solid ' + t.border,
      display: 'flex', alignItems: 'flex-start',
    }}>
      {items.map(it => {
        const on = it.id === active;
        return (
          <div key={it.id} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '4px 0', color: on ? t.brand : t.textDim, position: 'relative',
          }}>
            <div style={{ position: 'relative' }}>
              <DrvIcon name={it.icon} size={22} stroke={on ? 2.2 : 1.6} />
              {it.badge && (
                <span style={{
                  position: 'absolute', top: -3, right: -6, background: t.danger, color: '#fff',
                  fontSize: 9.5, fontWeight: 700, lineHeight: 1, padding: '2px 4px',
                  borderRadius: 7, minWidth: 14, textAlign: 'center',
                }}>{it.badge}</span>
              )}
              {it.warn && (
                <span style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 4, background: t.warn, border: '1.5px solid ' + t.bgRaised }} />
              )}
            </div>
            <div style={{ fontSize: 10, fontWeight: on ? 700 : 500, letterSpacing: 0.2 }}>{it.zh}</div>
            <div style={{ fontSize: 8.5, opacity: 0.55, fontFamily: DRV_MONO }}>{it.en}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Persistent SOS ack banner (Q-DRV12) ─────────────────────────────────────
function DrvSosBanner({ theme: t, incidentId = 'inc_0214', ackTime = '14:42:18' }) {
  return (
    <div style={{
      padding: '10px 14px', background: t.dangerBg, borderBottom: '2px solid ' + t.danger,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 16, background: t.danger, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse 2s infinite' }}>
        <DrvIcon name="shield" size={18} stroke={2.2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.danger, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          SOS 已確認 · 安全主管監聽中
          <span style={{ fontFamily: DRV_MONO, fontSize: 10, opacity: 0.7 }}>{incidentId}</span>
        </div>
        <div style={{ fontSize: 11, color: t.text, marginTop: 1 }}>持續監聽至事件結束 (Q-DRV12)。林經理 已於 {ackTime} 接通。</div>
      </div>
      <button style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent', color: t.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DrvIcon name="x" size={16} stroke={2.2} />
      </button>
    </div>
  );
}

// ── Pill ────────────────────────────────────────────────────────────────────
function DrvPill({ theme: t, tone = 'neutral', children, dot, en, style = {} }) {
  const map = {
    success: { fg: t.success, bg: t.successBg },
    warn: { fg: t.warn, bg: t.warnBg },
    danger: { fg: t.danger, bg: t.dangerBg },
    info: { fg: t.info, bg: t.infoBg },
    brand: { fg: t.brand, bg: t.brandBg },
    owned: { fg: t.ownedFg, bg: t.ownedBg },
    forwarded: { fg: t.forwardedFg, bg: t.forwardedBg },
    neutral: { fg: t.textMuted, bg: t.surfaceLo },
  };
  const c = map[tone] || map.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', fontSize: 10.5, fontWeight: 600,
      color: c.fg, background: c.bg, borderRadius: 999, whiteSpace: 'nowrap', ...style,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: 3, background: c.fg }} />}
      {children}
      {en && <span style={{ fontFamily: DRV_MONO, fontSize: 9.5, opacity: 0.6 }}>{en}</span>}
    </span>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────
function DrvCard({ theme: t, children, padding = 14, style = {}, accent }) {
  return (
    <div style={{
      background: t.surface, border: '1px solid ' + t.border,
      borderRadius: 14, overflow: 'hidden', padding,
      borderLeft: accent ? `3px solid ${accent}` : `1px solid ${t.border}`,
      ...style,
    }}>{children}</div>
  );
}

// ── Section header inside a screen ─────────────────────────────────────────
function DrvSection({ theme: t, zh, en, action, dense, children }) {
  return (
    <div style={{ marginBottom: dense ? 14 : 20 }}>
      {(zh || action) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px', marginBottom: 8 }}>
          <DrvBi zh={zh} en={en} theme={t} size={11} />
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Authority banner — owned vs forwarded ──────────────────────────────────
function DrvAuthorityBanner({ theme: t, forwarded = false, platform, sub }) {
  const fg = forwarded ? t.forwardedFg : t.ownedFg;
  const bg = forwarded ? t.forwardedBg : t.ownedBg;
  const bd = forwarded ? t.forwardedBorder : t.ownedBorder;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      background: bg, border: '1px solid ' + bd, borderLeft: '3px solid ' + fg, borderRadius: 10,
    }}>
      <DrvIcon name={forwarded ? 'layers' : 'shield'} size={18} stroke={2} style={{ color: fg }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: fg, letterSpacing: 0.1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {forwarded ? '平台主導' : '自營派單'} · {platform}
          <span style={{ fontFamily: DRV_MONO, fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{forwarded ? '· forwarded' : '· owned'}</span>
        </div>
        {sub && <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Empty state (driver-specific reasons) ──────────────────────────────────
function DrvEmpty({ theme: t, reason = 'no_data', message, action }) {
  const map = {
    no_data:              { zh: '尚無資料',     en: 'no_data',              icon: 'check', tone: t.textMuted },
    not_provisioned:      { zh: '尚未設定',     en: 'not_provisioned',      icon: 'lock',  tone: t.info },
    fetch_failed:         { zh: '讀取失敗',     en: 'fetch_failed',         icon: 'warn',  tone: t.danger },
    permission_denied:    { zh: '無權限',       en: 'permission_denied',    icon: 'lock',  tone: t.warn },
    external_unavailable: { zh: '外部失聯',     en: 'external_unavailable', icon: 'warn',  tone: t.warn },
    driver_not_eligible:  { zh: '司機不合資格', en: 'driver_not_eligible',  icon: 'lock',  tone: t.warn },
    filtered_empty:       { zh: '篩選過嚴',     en: 'filtered_empty',       icon: 'check', tone: t.textMuted },
  };
  const m = map[reason];
  return (
    <div style={{ padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 52, height: 52, borderRadius: 26, background: t.surfaceLo, color: m.tone, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + t.border }}>
        <DrvIcon name={m.icon} size={26} stroke={1.6} />
      </div>
      <div>
        <DrvBi zh={m.zh} en={m.en} theme={t} size={14} />
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6, maxWidth: 280, lineHeight: 1.55 }}>{message}</div>
      </div>
      {action}
    </div>
  );
}

// ── Sticky bottom action bar (one primary action; per spec §5.5) ───────────
function DrvStickyAction({ theme: t, primary, secondary, info }) {
  return (
    <div style={{
      flexShrink: 0, padding: '12px 14px', background: t.bgRaised,
      borderTop: '1px solid ' + t.border, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {info && <div style={{ fontSize: 11, color: t.textMuted, textAlign: 'center' }}>{info}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {secondary}
        <div style={{ flex: 1 }}>{primary}</div>
      </div>
    </div>
  );
}

// ── Big mobile button ──────────────────────────────────────────────────────
function DrvBigBtn({ theme: t, kind = 'primary', icon, children, full = true, disabled, danger, onClick, style = {} }) {
  const styles = {
    primary: { bg: t.brand, fg: '#fff', bd: t.brand },
    danger: { bg: t.danger, fg: '#fff', bd: t.danger },
    success: { bg: t.success, fg: '#fff', bd: t.success },
    forwarded: { bg: t.forwardedFg, fg: '#fff', bd: t.forwardedFg },
    secondary: { bg: t.surface, fg: t.text, bd: t.borderStrong },
    outline: { bg: 'transparent', fg: t.text, bd: t.borderStrong },
  };
  const s = danger ? styles.danger : (styles[kind] || styles.secondary);
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: full ? '100%' : 'auto', height: 50, padding: '0 18px',
      background: s.bg, color: s.fg, border: '1.5px solid ' + s.bd, borderRadius: 12,
      fontSize: 16, fontWeight: 700, letterSpacing: -0.1,
      fontFamily: DRV_FONT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      ...style,
    }}>
      {icon && <DrvIcon name={icon} size={18} stroke={2.2} />}
      {children}
    </button>
  );
}

// ── Press-and-hold visual (Q-DRV11; static representation) ─────────────────
function DrvPressHoldButton({ theme: t, progress = 0.55, label = '長按 2 秒送出 · hold 2s to send', en = 'press_and_hold_2s' }) {
  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <div style={{
        width: '100%', height: 64, background: t.danger, color: '#fff',
        borderRadius: 14, position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 30px ' + t.danger + '60',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.18)', width: (progress * 100) + '%' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.1 }}>{label}</div>
          <div style={{ fontFamily: DRV_MONO, fontSize: 10, opacity: 0.85 }}>{en}</div>
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: t.textMuted, textAlign: 'center', fontFamily: DRV_MONO }}>
        {Math.round(progress * 100)}% · 須持續按壓 {(2 - progress * 2).toFixed(1)} 秒
      </div>
    </div>
  );
}

Object.assign(window, {
  PhoneBezel, DrvStatusBar, DrvHomeIndicator, DrvIdentityChip,
  DrvAppBar, DrvTabBar, DrvSosBanner, DrvPill, DrvCard, DrvSection,
  DrvAuthorityBanner, DrvEmpty, DrvStickyAction, DrvBigBtn, DrvPressHoldButton,
});
