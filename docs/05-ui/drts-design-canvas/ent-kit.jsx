// ent-kit.jsx — Enterprise Dispatch frontend · design kit (theme + primitives).
// Frontstage employee self-service. Tenant-branded (NOT issuer/card white-label).
// zh-TW primary · en secondary. Self-contained — no console DNA.

const ENT_SANS = '"Inter","Noto Sans TC",-apple-system,system-ui,sans-serif';
const ENT_MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';

function buildEnt({ dark = false, density = 'comfy', accent = '#2457D6' } = {}) {
  const D = density === 'compact';
  const base = dark ? {
    bg: '#0E1320', surface: '#161C2B', surfaceLo: '#1B2233', surfaceHi: '#1E2638',
    ink: '#EDF0F6', ink2: '#C2C9D6', muted: '#8C96A8', faint: '#697388',
    line: '#283145', lineSoft: '#222A3B',
    primary: accent, primaryHi: '#5B86E8', primaryBg: '#16213C', primaryBd: '#27375C',
    success: '#5BD08A', successBg: '#10271C', successBd: '#1C4733',
    warn: '#F0B429', warnBg: '#2A2110', warnBd: '#4A3A12',
    danger: '#F38B82', dangerBg: '#2A1614', dangerBd: '#50221E',
    info: '#7FA8F0', infoBg: '#15213B', infoBd: '#27375C',
    shadow: '0 10px 30px -12px rgba(0,0,0,.6)', shadowSm: '0 1px 2px rgba(0,0,0,.4)',
  } : {
    bg: '#F4F6FA', surface: '#FFFFFF', surfaceLo: '#F7F9FC', surfaceHi: '#FFFFFF',
    ink: '#19223A', ink2: '#43506B', muted: '#6B7689', faint: '#9AA3B4',
    line: '#E5E9F1', lineSoft: '#EEF1F7',
    primary: accent, primaryHi: '#1A45AD', primaryBg: '#EBF1FE', primaryBd: '#C7D9FB',
    success: '#15803D', successBg: '#ECFDF3', successBd: '#ABEFC6',
    warn: '#B54708', warnBg: '#FFFAEB', warnBd: '#FEDF89',
    danger: '#B42318', dangerBg: '#FEF3F2', dangerBd: '#FECDCA',
    info: '#175CD3', infoBg: '#EFF4FF', infoBd: '#B2CCFF',
    shadow: '0 10px 34px -16px rgba(20,30,60,.28), 0 2px 6px -3px rgba(20,30,60,.08)',
    shadowSm: '0 1px 2px rgba(16,24,40,.06)',
  };
  return Object.assign({ dark, density, pad: D ? 16 : 22, gap: D ? 12 : 16, radius: 16, radiusSm: 11,
    sans: ENT_SANS, mono: ENT_MONO }, base);
}

// ── icon set ────────────────────────────────────────────────────────────────
const ENT_ICONS = {
  car: 'M3 13l2-5.5A2 2 0 017 6h10a2 2 0 011.9 1.5L21 13M5 13h14v4H5zM7 17v2M17 17v2',
  cal: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  pin: 'M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 21c0-4 3.2-6 7-6s7 2 7 6',
  users: 'M9 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.4 2.7-5 6.5-5s6.5 1.6 6.5 5M16 11a3 3 0 100-6M21.5 20c0-3-1.8-4.6-4.5-4.9',
  building: 'M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16M15 21V9h4a1 1 0 011 1v11M7 8h2M7 12h2M7 16h2M19 13h-1M19 17h-1',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 3l9.5 17H2.5zM12 10v4M12 17.5v.5',
  info: 'M12 11v5M12 7.5v.5M12 21a9 9 0 100-18 9 9 0 000 18z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
  download: 'M12 3v12M7 11l5 5 5-5M5 21h14',
  phone: 'M4 5h4l2 5-2.5 1.5a11 11 0 005 5L20 14l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 011-1z',
  refresh: 'M21 12a9 9 0 11-3-6.7M21 4v4h-4',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 018 0v3',
  shield: 'M12 3l8 3.5V12c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6.5z',
  brief: 'M4 8h16v12H4zM9 8V6a2 2 0 012-2h2a2 2 0 012 2v2',
  receipt: 'M5 3h14v18l-3-2-3 2-3-2-3 2zM8 8h8M8 12h8M8 16h5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  route: 'M6 4a2 2 0 100 4 2 2 0 000-4zM18 16a2 2 0 100 4 2 2 0 000-4zM6 8v6a4 4 0 004 4h6',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  edit: 'M4 20h4L18 10l-4-4L4 16zM14 6l4 4',
  ban: 'M5 5l14 14M12 21a9 9 0 100-18 9 9 0 000 18z',
  spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  ext: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  hand: 'M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v4a6 6 0 01-6 6h-1a6 6 0 01-5.2-3l-2.3-4a1.5 1.5 0 012.6-1.5L9 13',
};
function EIcon({ name, size = 18, stroke = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={ENT_ICONS[name] || ENT_ICONS.info} />
    </svg>
  );
}

// ── buttons ───────────────────────────────────────────────────────────────
function EBtn({ t, children, variant = 'default', size = 'md', icon, iconR, block, disabled, onClick, style }) {
  const pad = size === 'lg' ? '13px 24px' : size === 'sm' ? '7px 13px' : size === 'xs' ? '5px 10px' : '10px 18px';
  const fs = size === 'lg' ? 15 : size === 'sm' ? 13 : size === 'xs' ? 12 : 14;
  const V = {
    primary: { background: t.primary, color: '#fff', border: '1px solid ' + t.primary, boxShadow: t.dark ? 'none' : '0 6px 16px -8px ' + t.primary },
    default: { background: t.surface, color: t.ink, border: '1px solid ' + t.line },
    soft: { background: t.primaryBg, color: t.primary, border: '1px solid ' + t.primaryBd },
    ghost: { background: 'transparent', color: t.primary, border: '1px solid transparent' },
    danger: { background: t.surface, color: t.danger, border: '1px solid ' + t.dangerBd },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontFamily: t.sans, fontSize: fs, fontWeight: 600, padding: pad, borderRadius: t.radiusSm,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      width: block ? '100%' : undefined, whiteSpace: 'nowrap', transition: 'all .15s', ...V, ...style,
    }}>
      {icon && <EIcon name={icon} size={fs + 2} stroke={2.1} />}
      {children}
      {iconR && <EIcon name={iconR} size={fs + 2} stroke={2.1} />}
    </button>
  );
}

// ── pill / tag ──────────────────────────────────────────────────────────────
function EPill({ t, children, tone = 'neutral', dot, en, style }) {
  const M = {
    neutral: { fg: t.muted, bg: t.surfaceLo, bd: t.line },
    primary: { fg: t.primary, bg: t.primaryBg, bd: t.primaryBd },
    success: { fg: t.success, bg: t.successBg, bd: t.successBd },
    warn: { fg: t.warn, bg: t.warnBg, bd: t.warnBd },
    danger: { fg: t.danger, bg: t.dangerBg, bd: t.dangerBd },
    info: { fg: t.info, bg: t.infoBg, bd: t.infoBd },
  }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
      color: M.fg, background: M.bg, border: '1px solid ' + M.bd, padding: '3px 9px', borderRadius: 999, ...style }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: M.fg }} />}
      {children}
      {en && <span style={{ fontFamily: t.mono, fontSize: 9.5, opacity: 0.7 }}>{en}</span>}
    </span>
  );
}

// ── card ──────────────────────────────────────────────────────────────────
function ECard({ t, title, sub, actions, children, pad, accent, style, onClick }) {
  const p = pad != null ? pad : t.pad;
  return (
    <div onClick={onClick} style={{ background: t.surface, border: '1px solid ' + t.line, borderRadius: t.radius,
      boxShadow: t.shadowSm, overflow: 'hidden', cursor: onClick ? 'pointer' : undefined,
      borderTop: accent ? '2px solid ' + accent : ('1px solid ' + t.line), ...style }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: (typeof p === 'number' ? p : 18) + 'px ' + (typeof p === 'number' ? p : 18) + 'px',
          paddingBottom: 0 }}>
          <div style={{ flex: 1 }}>
            {title && <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, letterSpacing: -0.1 }}>{title}</div>}
            {sub && <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{sub}</div>}
          </div>
          {actions}
        </div>
      )}
      <div style={{ padding: p }}>{children}</div>
    </div>
  );
}

// ── key/value row ────────────────────────────────────────────────────────────
function ERow({ t, k, v, mono, strong, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16,
      padding: '9px 0', borderBottom: last ? 'none' : '1px solid ' + t.lineSoft }}>
      <span style={{ fontSize: 12.5, color: t.muted, flexShrink: 0 }}>{k}</span>
      <span style={{ fontSize: 13.5, fontWeight: strong ? 700 : 500, color: strong ? t.primary : t.ink,
        textAlign: 'right', fontFamily: mono ? t.mono : t.sans }}>{v}</span>
    </div>
  );
}

// ── field ──────────────────────────────────────────────────────────────────
function EField({ t, label, req, hint, error, children, full }) {
  return (
    <div style={{ marginBottom: 0, gridColumn: full ? '1 / -1' : undefined }}>
      {label && <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: t.ink2, marginBottom: 6 }}>
        {label}{req && <span style={{ color: t.danger }}> *</span>}</label>}
      {children}
      {error && <div style={{ fontSize: 11.5, color: t.danger, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}><EIcon name="alert" size={12} />{error}</div>}
      {hint && !error && <div style={{ fontSize: 11.5, color: t.muted, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}
function EInput({ t, value, placeholder, icon, invalid, mono }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', background: t.surface,
      border: '1px solid ' + (invalid ? t.danger : t.line), borderRadius: t.radiusSm }}>
      {icon && <span style={{ color: t.faint, display: 'flex' }}><EIcon name={icon} size={16} /></span>}
      <span style={{ flex: 1, fontSize: 14, color: value ? t.ink : t.faint, fontFamily: mono ? t.mono : t.sans }}>{value || placeholder}</span>
    </div>
  );
}

// ── segmented control ────────────────────────────────────────────────────────
function ESeg({ t, options, value, full }) {
  return (
    <div style={{ display: 'inline-flex', background: t.surfaceLo, border: '1px solid ' + t.line,
      borderRadius: t.radiusSm, padding: 3, gap: 2, width: full ? '100%' : undefined }}>
      {options.map(o => {
        const on = o.value === value;
        return <button key={o.value} style={{ flex: full ? 1 : undefined, border: 'none', cursor: 'pointer',
          background: on ? t.surface : 'transparent', color: on ? t.primary : t.muted, fontWeight: 600, fontSize: 13,
          padding: '8px 14px', borderRadius: t.radiusSm - 3, boxShadow: on ? t.shadowSm : 'none', fontFamily: t.sans,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {o.icon && <EIcon name={o.icon} size={14} />}{o.label}</button>;
      })}
    </div>
  );
}

// ── avatar ──────────────────────────────────────────────────────────────────
function EAvatar({ t, name, size = 34, tone = 'primary' }) {
  const c = tone === 'primary' ? { bg: t.primaryBg, fg: t.primary, bd: t.primaryBd }
    : { bg: t.surfaceLo, fg: t.muted, bd: t.line };
  return <span style={{ width: size, height: size, borderRadius: size / 2.6, background: c.bg, color: c.fg,
    border: '1px solid ' + c.bd, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>{(name || '?').slice(0, 1)}</span>;
}

// ── KPI ──────────────────────────────────────────────────────────────────
function EKpi({ t, label, en, value, sub, tone }) {
  const c = tone === 'warn' ? t.warn : tone === 'danger' ? t.danger : tone === 'success' ? t.success : t.ink;
  return (
    <div style={{ background: t.surface, border: '1px solid ' + t.line, borderRadius: t.radius, padding: 16 }}>
      <div style={{ fontSize: 11.5, color: t.muted, fontWeight: 600 }}>{label}{en && <span style={{ fontFamily: t.mono, fontSize: 9.5, marginLeft: 5, opacity: 0.7 }}>{en}</span>}</div>
      <div style={{ fontSize: 25, fontWeight: 800, color: c, letterSpacing: -0.6, margin: '5px 0 2px', fontFamily: t.mono }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: t.muted }}>{sub}</div>}
    </div>
  );
}

// ── banner ──────────────────────────────────────────────────────────────────
function EBanner({ t, tone = 'info', icon, title, body, actions, style }) {
  const M = {
    neutral: { fg: t.muted, bg: t.surfaceLo, bd: t.line },
    primary: { fg: t.primary, bg: t.primaryBg, bd: t.primaryBd },
    success: { fg: t.success, bg: t.successBg, bd: t.successBd },
    warn: { fg: t.warn, bg: t.warnBg, bd: t.warnBd },
    danger: { fg: t.danger, bg: t.dangerBg, bd: t.dangerBd },
    info: { fg: t.info, bg: t.infoBg, bd: t.infoBd },
  }[tone];
  return (
    <div style={{ display: 'flex', gap: 11, padding: '12px 14px', background: M.bg, border: '1px solid ' + M.bd, borderRadius: t.radiusSm, ...style }}>
      <span style={{ color: M.fg, flexShrink: 0, marginTop: 1 }}><EIcon name={icon || (tone === 'danger' || tone === 'warn' ? 'alert' : 'info')} size={17} /></span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{title}</div>}
        {body && <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.55, marginTop: title ? 3 : 0 }}>{body}</div>}
        {actions && <div style={{ marginTop: 9, display: 'flex', gap: 8 }}>{actions}</div>}
      </div>
    </div>
  );
}

// ── stepper (booking funnel header) ──────────────────────────────────────────
function EStepper({ t, steps, active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < active, on = i === active;
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                background: done ? t.primary : on ? t.primaryBg : t.surfaceLo,
                border: '1px solid ' + (on ? t.primary : done ? t.primary : t.line),
                color: done ? '#fff' : on ? t.primary : t.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, fontFamily: t.mono }}>
                {done ? <EIcon name="check" size={14} stroke={3} /> : i + 1}</span>
              <span style={{ fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? t.ink : t.muted, whiteSpace: 'nowrap' }}>{s}</span>
            </div>
            {i < steps.length - 1 && <span style={{ flex: 1, height: 1.5, background: done ? t.primary : t.line, margin: '0 12px', minWidth: 16 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── timeline ──────────────────────────────────────────────────────────────
function ETimeline({ t, events }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((e, i, a) => {
        const tone = e.tone || 'neutral';
        const c = tone === 'success' ? t.success : tone === 'primary' ? t.primary : tone === 'warn' ? t.warn : tone === 'danger' ? t.danger : t.faint;
        const cur = e.current;
        return (
          <div key={i} style={{ display: 'flex', gap: 13 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: cur ? 14 : 11, height: cur ? 14 : 11, borderRadius: 7, background: cur ? c : (i <= a.findIndex(x => x.current) || a.every(x => !x.current) ? c : t.line),
                border: cur ? '3px solid ' + (t.dark ? t.surface : '#fff') : 'none', boxShadow: cur ? '0 0 0 3px ' + c : 'none', marginTop: 3 }} />
              {i < a.length - 1 && <span style={{ flex: 1, width: 2, background: t.line, margin: '3px 0' }} />}
            </div>
            <div style={{ paddingBottom: i < a.length - 1 ? 16 : 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: cur ? 700 : 600, color: cur ? t.ink : t.ink2 }}>{e.t}</span>
                {e.at && <span style={{ fontSize: 11, color: t.faint, fontFamily: t.mono }}>{e.at}</span>}
              </div>
              {e.body && <div style={{ fontSize: 12, color: t.muted, marginTop: 2, lineHeight: 1.5 }}>{e.body}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── empty state ──────────────────────────────────────────────────────────────
function EEmpty({ t, icon = 'spark', title, body, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '34px 20px' }}>
      <div style={{ width: 54, height: 54, borderRadius: 16, background: t.surfaceLo, border: '1px solid ' + t.line,
        color: t.faint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <EIcon name={icon} size={24} /></div>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, marginBottom: 5 }}>{title}</div>
      {body && <div style={{ fontSize: 12.5, color: t.muted, maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>{body}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

Object.assign(window, {
  ENT_SANS, ENT_MONO, buildEnt, EIcon, EBtn, EPill, ECard, ERow,
  EField, EInput, ESeg, EAvatar, EKpi, EBanner, EStepper, ETimeline, EEmpty,
});
