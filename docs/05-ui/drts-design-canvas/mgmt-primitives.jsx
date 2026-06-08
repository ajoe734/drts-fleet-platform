// mgmt-primitives.jsx — Building blocks: Card / Table / Pill / Banner / Btn / DL / Code / Toggle / Field / Stepper / Timeline / Kpi / BiLabel
// Pure components — no authority awareness. (Auth-aware primitives in mgmt-auth.jsx.)

// ── Bilingual label — "已派車 · assigned" pattern (Q-X17) ───────────────────
function BiLabel({ theme: th, zh, en, mono = false, size = 12, opacity = 0.55, gap = 6 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap, fontSize: size, lineHeight: 1.3 }}>
      <span style={{ color: th ? th.text : 'inherit', fontWeight: 500 }}>{zh}</span>
      {en && <span style={{
        opacity, fontFamily: '"JetBrains Mono", monospace', fontSize: size - 1,
        color: th ? th.textMuted : 'inherit',
      }}>· {en}</span>}
    </span>
  );
}

// ── Status Pill ─────────────────────────────────────────────────────────────
function Pill({ theme: th, tone = 'neutral', children, dot, style = {}, en }) {
  const map = {
    success: { fg: th.success, bg: th.successBg, bd: th.successBorder },
    warn:    { fg: th.warn,    bg: th.warnBg,    bd: th.warnBorder },
    danger:  { fg: th.danger,  bg: th.dangerBg,  bd: th.dangerBorder },
    info:    { fg: th.info,    bg: th.infoBg,    bd: th.infoBorder },
    accent:  { fg: th.accent,  bg: th.accentBg,  bd: th.accentBorder },
    neutral: { fg: th.textMuted, bg: th.neutralBg, bd: th.neutralBorder },
    tenant:  { fg: th.realm.tenant.fg,   bg: th.realm.tenant.bg,   bd: th.realm.tenant.bd },
    ops:     { fg: th.realm.ops.fg,      bg: th.realm.ops.bg,      bd: th.realm.ops.bd },
    platform:{ fg: th.realm.platform.fg, bg: th.realm.platform.bg, bd: th.realm.platform.bd },
    system:  { fg: th.realm.system.fg,   bg: th.realm.system.bg,   bd: th.realm.system.bd },
    driver:  { fg: th.realm.driver.fg,   bg: th.realm.driver.bg,   bd: th.realm.driver.bd },
  };
  const c = map[tone] || map.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 7px', fontSize: 10.5, fontWeight: 600, lineHeight: 1.4,
      color: c.fg, background: c.bg, border: '1px solid ' + c.bd,
      borderRadius: 5, letterSpacing: 0.1, whiteSpace: 'nowrap', ...style,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: 3, background: c.fg, flexShrink: 0 }} />}
      {children}
      {en && <span style={{ fontFamily: '"JetBrains Mono", monospace', opacity: 0.65, fontSize: 9.5 }}>{en}</span>}
    </span>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────
function Btn({ theme: th, variant = 'secondary', size = 'sm', icon, children, danger, style = {}, disabled, title }) {
  const sz = size === 'xs'
    ? { p: '4px 8px', fz: 11.5, h: 24, ic: 12 }
    : size === 'md' ? { p: '8px 14px', fz: 13, h: 34, ic: 14 }
    : { p: '5px 10px', fz: 12, h: 28, ic: 13 };
  const styles = {
    primary:   { bg: th.accent, fg: '#fff', bd: th.accent, sh: '0 1px 0 rgba(0,0,0,.06)' },
    secondary: { bg: th.surface, fg: th.text, bd: th.border, sh: 'none' },
    ghost:     { bg: 'transparent', fg: th.textMuted, bd: 'transparent', sh: 'none' },
    danger:    { bg: th.danger, fg: '#fff', bd: th.danger, sh: 'none' },
    dangerOutline: { bg: 'transparent', fg: th.danger, bd: th.danger + '70', sh: 'none' },
  };
  const s = danger ? styles.danger : (styles[variant] || styles.secondary);
  return (
    <button title={title} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: sz.p, fontSize: sz.fz, height: sz.h, fontWeight: 500,
      background: s.bg, color: s.fg, border: '1px solid ' + s.bd,
      borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer', boxShadow: s.sh,
      lineHeight: 1, fontFamily: '"Inter", "Noto Sans TC", system-ui, sans-serif',
      opacity: disabled ? 0.55 : 1, ...style,
    }}>
      {icon && <MgmtIcon name={icon} size={sz.ic} />}
      {children}
    </button>
  );
}

// ── Card / Section ──────────────────────────────────────────────────────────
function Card({ theme: th, title, subtitle, actions, children, padding = 16, style = {} }) {
  return (
    <section style={{
      background: th.surface, border: '1px solid ' + th.border,
      borderRadius: 10, overflow: 'hidden', ...style,
    }}>
      {(title || actions) && (
        <header style={{
          padding: '12px 14px', borderBottom: '1px solid ' + th.border,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            {title && <div style={{ fontSize: 13, fontWeight: 600, color: th.text, lineHeight: 1.2 }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 11.5, color: th.textMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 6 }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding }}>{children}</div>
    </section>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────
function Table({ theme: th, columns, rows, dense = true, onRowSelect }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: 12.5,
        fontFamily: '"Inter", "Noto Sans TC", system-ui, sans-serif',
      }}>
        <thead>
          <tr style={{ borderBottom: '1px solid ' + th.border }}>
            {columns.map((c, i) => (
              <th key={i} style={{
                textAlign: c.align || 'left', padding: dense ? '7px 12px' : '10px 12px',
                fontSize: 10.5, fontWeight: 600, color: th.textMuted,
                textTransform: 'uppercase', letterSpacing: 0.4,
                background: th.surfaceLo, whiteSpace: 'nowrap',
                width: c.w, position: 'sticky', top: 0,
              }}>{c.h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{
              borderBottom: '1px solid ' + th.border,
              background: r._selected ? th.rowSelect : 'transparent',
            }}>
              {columns.map((c, j) => (
                <td key={j} style={{
                  padding: dense ? '7px 12px' : '10px 12px',
                  textAlign: c.align || 'left',
                  fontSize: c.mono ? 11.5 : 12.5,
                  fontFamily: c.mono ? '"JetBrains Mono", monospace' : '"Inter", "Noto Sans TC", system-ui, sans-serif',
                  color: th.text, verticalAlign: 'middle', whiteSpace: 'nowrap',
                }}>{c.r ? c.r(r, i) : r[c.k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Banner ──────────────────────────────────────────────────────────────────
function Banner({ theme: th, tone = 'info', icon = 'warn', title, body, actions, dismissible }) {
  const map = {
    success: { fg: th.success, bg: th.successBg, bd: th.successBorder },
    warn:    { fg: th.warn,    bg: th.warnBg,    bd: th.warnBorder },
    danger:  { fg: th.danger,  bg: th.dangerBg,  bd: th.dangerBorder },
    info:    { fg: th.info,    bg: th.infoBg,    bd: th.infoBorder },
    accent:  { fg: th.accent,  bg: th.accentBg,  bd: th.accentBorder },
  };
  const c = map[tone];
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 12px',
      background: c.bg, border: '1px solid ' + c.bd, borderRadius: 8,
      color: c.fg, fontSize: 12.5,
    }}>
      <MgmtIcon name={icon} size={15} style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: body ? 2 : 0 }}>{title}</div>}
        {body && <div style={{ color: th.text, lineHeight: 1.45, fontWeight: 450 }}>{body}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start' }}>{actions}</div>}
      {dismissible && <MgmtIcon name="x" size={14} style={{ color: c.fg, opacity: 0.6, cursor: 'pointer', marginLeft: 2 }} />}
    </div>
  );
}

// ── KPI ─────────────────────────────────────────────────────────────────────
function Kpi({ theme: th, label, value, delta, deltaTone = 'neutral', sub, hint, en }) {
  const tones = { up: th.success, down: th.danger, neutral: th.textMuted, warn: th.warn };
  return (
    <div style={{
      background: th.surface, border: '1px solid ' + th.border, borderRadius: 10,
      padding: 14, minWidth: 0,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{label}</span>
        {en && <span style={{ fontFamily: '"JetBrains Mono", monospace', opacity: 0.6, fontSize: 9.5, textTransform: 'none' }}>{en}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: th.text, letterSpacing: -0.4, lineHeight: 1.05, fontFamily: '"JetBrains Mono", monospace' }}>{value}</span>
        {delta && <span style={{ fontSize: 11.5, fontWeight: 600, color: tones[deltaTone] || th.textMuted }}>{delta}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4 }}>{sub}</div>}
      {hint && <div style={{ fontSize: 10.5, color: th.textDim, marginTop: 6, fontFamily: '"JetBrains Mono", monospace' }}>{hint}</div>}
    </div>
  );
}

// ── Detail rows / Definition list ───────────────────────────────────────────
function DL({ theme: th, items, cols = 2, monoVal }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)',
      gap: '10px 16px', fontSize: 12.5,
    }}>
      {items.map((it, i) => (
        <div key={i} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{it.k}</div>
          <div style={{ color: th.text, fontFamily: monoVal || it.mono ? '"JetBrains Mono", monospace' : '"Inter", "Noto Sans TC", system-ui, sans-serif', fontSize: it.mono ? 11.5 : 12.5, overflowWrap: 'anywhere' }}>{it.v}</div>
        </div>
      ))}
    </div>
  );
}

// ── Code block ──────────────────────────────────────────────────────────────
function Code({ theme: th, children }) {
  return (
    <pre style={{
      margin: 0, padding: '10px 12px', borderRadius: 8,
      background: th.surfaceLo, border: '1px solid ' + th.border,
      color: th.text, fontFamily: '"JetBrains Mono", monospace', fontSize: 11.5, lineHeight: 1.55,
      overflowX: 'auto', whiteSpace: 'pre',
    }}>{children}</pre>
  );
}

// ── Form helpers ────────────────────────────────────────────────────────────
function Field({ theme: th, label, hint, children, required, error }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: th.text, marginBottom: 5 }}>
        {label}
        {required && <span style={{ color: th.danger }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 11, color: th.danger, marginTop: 4, lineHeight: 1.35 }}>{error}</div>}
      {hint && !error && <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4, lineHeight: 1.35 }}>{hint}</div>}
    </div>
  );
}

function Input({ theme: th, value, ph, mono, suffix, prefix, error }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: th.bgRaised, border: '1px solid ' + (error ? th.danger : th.border), borderRadius: 7,
      padding: '7px 10px', fontSize: 12.5, color: th.text,
      fontFamily: mono ? '"JetBrains Mono", monospace' : '"Inter", "Noto Sans TC", system-ui, sans-serif',
    }}>
      {prefix && <span style={{ color: th.textDim, fontSize: 11.5 }}>{prefix}</span>}
      <span style={{ flex: 1, color: value ? th.text : th.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || ph}</span>
      {suffix && <span style={{ color: th.textDim, fontSize: 11 }}>{suffix}</span>}
    </div>
  );
}

function Select({ theme: th, value, ph }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: th.bgRaised, border: '1px solid ' + th.border, borderRadius: 7,
      padding: '7px 10px', fontSize: 12.5, color: th.text,
    }}>
      <span style={{ flex: 1, color: value ? th.text : th.textDim }}>{value || ph}</span>
      <MgmtIcon name="chevD" size={12} style={{ color: th.textDim }} />
    </div>
  );
}

function Toggle({ theme: th, on, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 28, height: 16, borderRadius: 8, position: 'relative',
        background: on ? th.accent : th.borderStrong, transition: 'background .12s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 14 : 2, width: 12, height: 12,
          borderRadius: 6, background: '#fff', transition: 'left .12s',
          boxShadow: '0 1px 2px rgba(0,0,0,.2)',
        }} />
      </span>
      {label && <span style={{ fontSize: 12, color: th.text }}>{label}</span>}
    </div>
  );
}

function Checkbox({ theme: th, on, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
        background: on ? th.accent : th.bgRaised,
        border: '1px solid ' + (on ? th.accent : th.borderStrong),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {on && <MgmtIcon name="check" size={10} style={{ color: '#fff', strokeWidth: 3 }} />}
      </span>
      {label && <span style={{ fontSize: 12, color: th.text }}>{label}</span>}
    </span>
  );
}

// ── Stepper ─────────────────────────────────────────────────────────────────
function Stepper({ theme: th, steps, current = 0 }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < current, active = i === current;
        const fg = done ? th.success : active ? th.accent : th.textDim;
        const bg = done ? th.successBg : active ? th.accentBg : th.surfaceLo;
        return (
          <li key={i} style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
            <span style={{
              width: 22, height: 22, borderRadius: 11,
              background: bg, color: fg, border: '1px solid ' + (active ? th.accent : done ? th.successBorder : th.border),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>{done ? <MgmtIcon name="check" size={11} /> : i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: active ? 600 : 500, color: active || done ? th.text : th.textMuted, lineHeight: 1.2 }}>{s.t}</div>
              {s.s && <div style={{ fontSize: 10.5, color: th.textDim, marginTop: 1 }}>{s.s}</div>}
            </div>
            {i < steps.length - 1 && (
              <div style={{ position: 'absolute', right: -3, top: 11, width: 14, height: 1, background: th.border }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────
function Timeline({ theme: th, events }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {events.map((e, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, position: 'relative', padding: '6px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <span style={{
              width: 9, height: 9, borderRadius: 5, marginTop: 4,
              background: e.tone === 'success' ? th.success : e.tone === 'danger' ? th.danger : e.tone === 'warn' ? th.warn : th.accent,
              boxShadow: '0 0 0 3px ' + (e.tone === 'success' ? th.successBg : e.tone === 'danger' ? th.dangerBg : e.tone === 'warn' ? th.warnBg : th.accentBg),
            }} />
            {i < events.length - 1 && <span style={{ flex: 1, width: 1, background: th.border, margin: '4px 0' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: th.text }}>{e.t}</span>
              <span style={{ fontSize: 10.5, color: th.textDim, fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap' }}>{e.at}</span>
            </div>
            {e.actor && <div style={{ fontSize: 11, color: th.textMuted, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {e.actorRealm && <Pill theme={th} tone={e.actorRealm}>{e.actorRealm}</Pill>}
              {e.actor}
            </div>}
            {e.body && <div style={{ fontSize: 12, color: th.text, marginTop: 4, lineHeight: 1.45 }}>{e.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Drawer (slides from right; non-interactive placeholder) ────────────────
function Drawer({ theme: th, title, subtitle, footer, w = 480, children }) {
  return (
    <div style={{
      position: 'absolute', right: 0, top: 46, bottom: 0, width: w,
      background: th.surface, borderLeft: '1px solid ' + th.border,
      boxShadow: '-12px 0 30px rgba(0,0,0,.08)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 5,
    }}>
      <header style={{ padding: '14px 16px', borderBottom: '1px solid ' + th.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: th.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: th.textMuted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button style={iconBtnStyle(th)}><MgmtIcon name="x" size={14} /></button>
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>{children}</div>
      {footer && <footer style={{ padding: '12px 16px', borderTop: '1px solid ' + th.border, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</footer>}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
function Modal({ theme: th, title, subtitle, footer, w = 480, children, accent }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(8,12,22,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)', zIndex: 10,
    }}>
      <div style={{
        width: w, background: th.surface, borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: '85%',
        borderTop: accent ? '3px solid ' + accent : 'none',
      }}>
        <header style={{ padding: '14px 16px', borderBottom: '1px solid ' + th.border }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: th.textMuted, marginTop: 2 }}>{subtitle}</div>}
        </header>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>{children}</div>
        {footer && <footer style={{ padding: '12px 16px', borderTop: '1px solid ' + th.border, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</footer>}
      </div>
    </div>
  );
}

Object.assign(window, {
  BiLabel, Pill, Btn, Card, Table, Banner, Kpi, DL, Code,
  Field, Input, Select, Toggle, Checkbox, Stepper, Timeline,
  Drawer, Modal,
});
