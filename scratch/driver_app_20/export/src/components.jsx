// components.jsx — Shared UI atoms for driver app + management.
// All components accept `theme` prop (from buildTheme).

// ─── Icons (inline SVG, stroke-based) ───────────────────────────
const Icon = ({ d, size = 16, stroke = 'currentColor', fill = 'none', sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);

const ICONS = {
  home:    'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  list:    'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  car:     'M5 17h14M5 17l1.5-5.5a2 2 0 012-1.5h7a2 2 0 012 1.5L19 17M5 17v3M19 17v3M7 14h.01M17 14h.01',
  layers:  'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5',
  user:    'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  bell:    'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  arrow:   'M5 12h14M13 6l6 6-6 6',
  arrowL:  'M19 12H5M11 18l-6-6 6-6',
  check:   'M5 12l5 5L20 7',
  x:       'M18 6L6 18M6 6l12 12',
  alert:   'M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.39 0z',
  info:    'M12 16v-4M12 8h.01M12 22a10 10 0 100-20 10 10 0 000 20z',
  shield:  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  pin:     'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0zM12 13a3 3 0 100-6 3 3 0 000 6z',
  clock:   'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  refresh: 'M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5',
  power:   'M18.36 6.64a9 9 0 11-12.73 0M12 2v10',
  wallet:  'M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-1M16 12h5v4h-5a2 2 0 010-4z',
  wifi:    'M5 12.55a11 11 0 0114 0M2 8.82a16 16 0 0120 0M8.5 16.43a6 6 0 017 0M12 20h.01',
  wifiOff: 'M2 2l20 20M8.5 16.4a6 6 0 017 0M5 12.55a11 11 0 015.17-2.39M16.72 11.06A11 11 0 0119 12.55M12 20h.01',
  lock:    'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
  unlock:  'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 019.9-1',
  camera:  'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z',
  filter:  'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  search:  'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  more:    'M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z',
  plus:    'M12 5v14M5 12h14',
  minus:   'M5 12h14',
  settings:'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  sos:     'M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.39 0z',
  link:    'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.72M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  download:'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  doc:     'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  trend:   'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  device:  'M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM12 18h.01',
  phone:   'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2',
  star:    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
};

// ─── Status chip ────────────────────────────────────────────────
function Chip({ theme: t, tone = 'neutral', children, icon, dot, size = 'sm', strong, style = {} }) {
  const tones = {
    neutral:   { bg: t.neutralBg,    fg: t.textMuted, border: t.border },
    info:      { bg: t.infoBg,       fg: t.info,      border: t.info + '40' },
    success:   { bg: t.successBg,    fg: t.success,   border: t.success + '40' },
    warn:      { bg: t.warnBg,       fg: t.warn,      border: t.warn + '40' },
    danger:    { bg: t.dangerBg,     fg: t.danger,    border: t.danger + '40' },
    owned:     { bg: t.ownedBg,      fg: t.ownedFg,   border: t.ownedBorder },
    forwarded: { bg: t.forwardedBg,  fg: t.forwardedFg, border: t.forwardedBorder },
    brand:     { bg: t.brandBg,      fg: t.brand,     border: t.brand + '40' },
  };
  const c = tones[tone] || tones.neutral;
  const padY = size === 'md' ? 4 : 2;
  const padX = size === 'md' ? 10 : 8;
  const fs = size === 'md' ? 12 : 11;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: `${padY}px ${padX}px`,
      background: strong ? c.fg : c.bg,
      color: strong ? '#fff' : c.fg,
      border: strong ? 'none' : `1px solid ${c.border}`,
      borderRadius: 999,
      fontSize: fs, fontWeight: 600, letterSpacing: 0.2,
      lineHeight: 1, whiteSpace: 'nowrap',
      ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: strong ? '#fff' : c.fg }} />}
      {icon && <Icon d={icon} size={fs + 1} sw={2} />}
      {children}
    </span>
  );
}

// ─── Platform badge — pill with platform mark + label ──────────
function PlatformBadge({ theme: t, code = 'DRTS', name = '自營派單', forwarded = false, size = 'md' }) {
  const fg = forwarded ? t.forwardedFg : t.ownedFg;
  const bg = forwarded ? t.forwardedBg : t.ownedBg;
  const border = forwarded ? t.forwardedBorder : t.ownedBorder;
  const fs = size === 'sm' ? 11 : 12;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 8px 3px 4px',
      background: bg, color: fg,
      border: `1px solid ${border}`,
      borderRadius: 999,
      fontSize: fs, fontWeight: 600, lineHeight: 1.2,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 9,
        background: fg, color: bg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 800, letterSpacing: 0,
        fontFamily: TYPE.mono,
      }}>{code.slice(0, 2).toUpperCase()}</span>
      {name}
    </span>
  );
}

// ─── Authority banner (owned vs forwarded) ──────────────────────
function AuthorityBanner({ theme: t, forwarded = false, platform = '自營派單', subtitle, action }) {
  const fg = forwarded ? t.forwardedFg : t.ownedFg;
  const bg = forwarded ? t.forwardedBg : t.ownedBg;
  const border = forwarded ? t.forwardedBorder : t.ownedBorder;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      background: bg,
      borderLeft: `3px solid ${fg}`,
      borderRadius: 8,
      border: `1px solid ${border}`,
      borderLeftWidth: 3,
    }}>
      <Icon d={forwarded ? ICONS.layers : ICONS.shield} size={18} stroke={fg} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: fg, letterSpacing: 0.1 }}>
          {forwarded ? `平台主導 · ${platform}` : `自營派單 · ${platform}`}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

// ─── Card surface ───────────────────────────────────────────────
function Card({ theme: t, children, padding = 16, style = {}, onClick, raised, interactive }) {
  return (
    <div onClick={onClick} style={{
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: 14,
      padding,
      boxShadow: raised ? t.shadow : t.shadowSm,
      cursor: onClick || interactive ? 'pointer' : 'default',
      ...style,
    }}>{children}</div>
  );
}

// ─── Button ─────────────────────────────────────────────────────
function Button({ theme: t, kind = 'primary', size = 'md', children, icon, full, danger, disabled, style = {}, onClick }) {
  const sizes = {
    sm: { h: 32, px: 12, fs: 13 },
    md: { h: 44, px: 16, fs: 15 },
    lg: { h: 56, px: 20, fs: 17 },
  };
  const s = sizes[size];
  const tones = {
    primary: { bg: danger ? t.danger : t.brand, fg: '#fff', border: 'transparent' },
    secondary: { bg: t.surfaceLo, fg: t.text, border: t.border },
    ghost: { bg: 'transparent', fg: danger ? t.danger : t.brand, border: 'transparent' },
    outline: { bg: 'transparent', fg: danger ? t.danger : t.text, border: danger ? t.danger : t.borderStrong },
  };
  const tone = tones[kind];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      height: s.h, padding: `0 ${s.px}px`,
      background: tone.bg, color: tone.fg,
      border: `1px solid ${tone.border}`,
      borderRadius: kind === 'primary' || kind === 'outline' ? 12 : 10,
      fontSize: s.fs, fontWeight: 650, letterSpacing: -0.1,
      fontFamily: TYPE.family,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      width: full ? '100%' : 'auto',
      opacity: disabled ? 0.5 : 1,
      transition: 'background .12s, transform .08s',
      boxShadow: kind === 'primary' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
      ...style,
    }}>
      {icon && <Icon d={icon} size={s.fs + 2} sw={2} />}
      {children}
    </button>
  );
}

// ─── Section header inside a screen ─────────────────────────────
function Section({ theme: t, title, subtitle, action, children, dense }) {
  return (
    <div style={{ marginBottom: dense ? 16 : 24 }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px', marginBottom: 10 }}>
          <div>
            {title && <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 13, color: t.textDim, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Bottom tab bar (driver app) ────────────────────────────────
function BottomTabs({ theme: t, active = 'home' }) {
  const items = [
    { id: 'home', label: '工作台', icon: ICONS.home },
    { id: 'jobs', label: '任務', icon: ICONS.list, badge: 3 },
    { id: 'trip', label: '行程', icon: ICONS.car },
    { id: 'platform', label: '平台', icon: ICONS.layers, dot: true },
    { id: 'settings', label: '設定', icon: ICONS.user },
  ];
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around',
      background: t.bgRaised,
      borderTop: `1px solid ${t.border}`,
      padding: '6px 4px 8px',
    }}>
      {items.map(it => {
        const on = it.id === active;
        return (
          <div key={it.id} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 2px', position: 'relative',
            color: on ? t.brand : t.textDim,
          }}>
            <div style={{ position: 'relative' }}>
              <Icon d={it.icon} size={22} sw={on ? 2.2 : 1.8} />
              {it.badge && (
                <span style={{
                  position: 'absolute', top: -4, right: -8,
                  background: t.danger, color: '#fff',
                  fontSize: 10, fontWeight: 700, lineHeight: 1,
                  padding: '2px 5px', borderRadius: 8, minWidth: 16, textAlign: 'center',
                }}>{it.badge}</span>
              )}
              {it.dot && (
                <span style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 7, height: 7, borderRadius: 4, background: t.success,
                  border: `1.5px solid ${t.bgRaised}`,
                }} />
              )}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500, letterSpacing: 0.2 }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── App bar (in-app top header for sub-screens) ────────────────
function TopBar({ theme: t, title, subtitle, back, right, sticky, scrollHint }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px',
      background: t.bgRaised,
      borderBottom: `1px solid ${scrollHint ? t.border : 'transparent'}`,
      position: sticky ? 'sticky' : 'static',
      top: 0, zIndex: 5,
    }}>
      {back && (
        <button style={{
          width: 36, height: 36, borderRadius: 10, border: 'none',
          background: t.surfaceLo, color: t.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon d={ICONS.arrowL} size={18} sw={2} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: t.text, letterSpacing: -0.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

// ─── KPI tile ───────────────────────────────────────────────────
function Kpi({ theme: t, label, value, unit, tone = 'neutral', delta, icon }) {
  const tones = {
    neutral: t.text, brand: t.brand, success: t.success, warn: t.warn, danger: t.danger,
  };
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '12px 14px',
      background: t.surfaceLo,
      border: `1px solid ${t.border}`,
      borderRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: t.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {icon && <Icon d={icon} size={12} sw={2} />}
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: tones[tone], letterSpacing: -0.5, fontFamily: TYPE.mono }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: t.textDim, fontWeight: 500 }}>{unit}</span>}
        {delta && <span style={{ fontSize: 11, color: t.success, fontWeight: 600, marginLeft: 4 }}>{delta}</span>}
      </div>
    </div>
  );
}

// ─── Toggle switch ──────────────────────────────────────────────
function Switch({ theme: t, on, disabled }) {
  return (
    <span style={{
      width: 38, height: 22, borderRadius: 11,
      background: on ? t.success : t.borderStrong,
      position: 'relative', display: 'inline-block',
      opacity: disabled ? 0.4 : 1, transition: 'background .15s',
      flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 18, height: 18, borderRadius: 9, background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left .15s',
      }} />
    </span>
  );
}

// ─── Row (form/setting row) ─────────────────────────────────────
function Row({ theme: t, label, sub, value, right, onClick, last, danger }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', minHeight: 52,
      borderBottom: last ? 'none' : `1px solid ${t.border}`,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: danger ? t.danger : t.text, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{sub}</div>}
      </div>
      {value && <div style={{ fontSize: 13, color: t.textMuted, fontFamily: typeof value === 'string' && /^[\w\d.-]+$/.test(value) ? TYPE.mono : 'inherit' }}>{value}</div>}
      {right}
    </div>
  );
}

// ─── Map placeholder (subtly striped) ───────────────────────────
function MapPlaceholder({ theme: t, height = 180, label = '路線地圖', children }) {
  const dark = t.mode === 'dark';
  const c1 = dark ? '#1A2334' : '#E8EEF6';
  const c2 = dark ? '#1F2A3D' : '#DEE6F0';
  return (
    <div style={{
      position: 'relative', height, borderRadius: 12, overflow: 'hidden',
      background: `repeating-linear-gradient(135deg, ${c1} 0 8px, ${c2} 8px 16px)`,
      border: `1px solid ${t.border}`,
    }}>
      {/* fake route line */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} viewBox="0 0 300 180" preserveAspectRatio="none">
        <path d="M30 140 Q 90 80 150 100 T 270 40" fill="none" stroke={t.brand} strokeWidth="3" strokeLinecap="round" strokeDasharray="0" />
        <circle cx="30" cy="140" r="6" fill={t.success} stroke="#fff" strokeWidth="2" />
        <circle cx="270" cy="40" r="6" fill={t.danger} stroke="#fff" strokeWidth="2" />
      </svg>
      <div style={{
        position: 'absolute', top: 8, left: 10,
        fontSize: 10, fontWeight: 600, color: t.textDim, letterSpacing: 0.4, textTransform: 'uppercase',
        fontFamily: TYPE.mono,
      }}>{label}</div>
      {children}
    </div>
  );
}

// ─── Status dot ─────────────────────────────────────────────────
function StatusDot({ theme: t, tone = 'success', pulse }) {
  const c = { success: t.success, warn: t.warn, danger: t.danger, neutral: t.neutral, info: t.info }[tone];
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: 4,
      background: c,
      boxShadow: pulse ? `0 0 0 3px ${c}33` : 'none',
    }} />
  );
}

Object.assign(window, {
  Icon, ICONS, Chip, PlatformBadge, AuthorityBanner, Card, Button,
  Section, BottomTabs, TopBar, Kpi, Switch, Row, MapPlaceholder, StatusDot,
});
