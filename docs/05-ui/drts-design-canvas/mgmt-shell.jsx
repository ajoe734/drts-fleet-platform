// mgmt-shell.jsx — App chrome shared by the 4 mgmt consoles.
// Sidebar (icon + label), topbar (breadcrumb, search, env, user), shell layout.
// All sized to fit inside <DCArtboard> at 1440×900.

const SHELL_FONT = '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const SHELL_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

// ── Shell layout ────────────────────────────────────────────────────────────
// <Shell theme nav active title topRight env children/>
function Shell({ theme: th, nav, active, title, breadcrumb = [], topRight, env = 'production', children, footer, hideEnv = false }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'grid',
      gridTemplateColumns: '224px 1fr', gridTemplateRows: '46px 1fr',
      background: th.bg, color: th.text, fontFamily: SHELL_FONT, fontSize: th.fz,
      overflow: 'hidden',
    }}>
      {/* Sidebar */}
      <Sidebar theme={th} nav={nav} active={active} env={env} hideEnv={hideEnv} />
      {/* Topbar spans col 2 */}
      <Topbar theme={th} title={title} breadcrumb={breadcrumb} topRight={topRight} />
      {/* Main content */}
      <main style={{
        gridColumn: 2, gridRow: 2, overflow: 'auto',
        background: th.bg, color: th.text,
      }}>
        {children}
        {footer}
      </main>
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ theme: th, nav = [], active, env, hideEnv }) {
  return (
    <aside style={{
      gridRow: '1 / 3',
      background: th.surface,
      borderRight: '1px solid ' + th.border,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Brand */}
      <div style={{
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid ' + th.border, height: 46, boxSizing: 'border-box',
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 7,
          background: 'linear-gradient(135deg, ' + th.accent + ', ' + th.accentHi + ')',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: -0.4,
        }}>D</div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: th.text, lineHeight: 1.1, letterSpacing: -0.2 }}>DRTS</div>
          <div style={{ fontSize: 10, color: th.textMuted, letterSpacing: 0.3, lineHeight: 1.1, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{th.surfaceName}</div>
        </div>
      </div>
      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 6px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {nav.map((item, i) => item.divider ? (
          <div key={i} style={{
            margin: '8px 8px 4px', fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
            color: th.textDim, textTransform: 'uppercase',
          }}>{item.divider}</div>
        ) : (
          <NavItem key={item.key} theme={th} item={item} active={active === item.key} />
        ))}
      </nav>
      {/* Env indicator */}
      {!hideEnv && (
        <div style={{
          padding: '8px 12px 10px', borderTop: '1px solid ' + th.border,
          display: 'flex', alignItems: 'center', gap: 8, color: th.textMuted, fontSize: 11,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: env === 'production' ? th.success : env === 'sandbox' ? th.warn : th.info,
          }} />
          <span style={{ fontFamily: SHELL_MONO, textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 10 }}>{env}</span>
          <span style={{ marginLeft: 'auto', color: th.textDim }}>v2.14.3</span>
        </div>
      )}
    </aside>
  );
}

function NavItem({ theme: th, item, active }) {
  const bg = active ? th.accentBg : 'transparent';
  const fg = active ? th.accent : th.text;
  return (
    <div title={item.label} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '6px 9px', borderRadius: 7,
      color: fg, background: bg, fontSize: 12.5, fontWeight: active ? 600 : 450,
      position: 'relative', cursor: 'default',
    }}>
      <MgmtIcon name={item.icon} size={15} stroke={active ? 1.8 : 1.5} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
      {item.badge && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 6,
          background: item.badgeTone === 'danger' ? th.dangerBg : item.badgeTone === 'warn' ? th.warnBg : th.neutralBg,
          color: item.badgeTone === 'danger' ? th.danger : item.badgeTone === 'warn' ? th.warn : th.textMuted,
        }}>{item.badge}</span>
      )}
    </div>
  );
}

// ── Topbar ──────────────────────────────────────────────────────────────────
function Topbar({ theme: th, title, breadcrumb = [], topRight }) {
  return (
    <header style={{
      gridColumn: 2, gridRow: 1,
      borderBottom: '1px solid ' + th.border, background: th.surface,
      display: 'flex', alignItems: 'center', padding: '0 16px',
      gap: 12, height: 46, boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
        {breadcrumb.length > 0 ? breadcrumb.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <MgmtIcon name="chevR" size={12} style={{ color: th.textDim }} />}
            <span style={{
              fontSize: 12.5, fontWeight: i === breadcrumb.length - 1 ? 600 : 450,
              color: i === breadcrumb.length - 1 ? th.text : th.textMuted,
              whiteSpace: 'nowrap',
            }}>{c}</span>
          </React.Fragment>
        )) : <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SearchBox theme={th} />
        <Kbd theme={th}>⌘K</Kbd>
        <button style={iconBtnStyle(th)}><MgmtIcon name="bell" size={15} /></button>
        <div style={{
          width: 26, height: 26, borderRadius: 13,
          background: th.accentBg, color: th.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, border: '1px solid ' + th.accentBorder,
        }}>YL</div>
        {topRight}
      </div>
    </header>
  );
}

function SearchBox({ theme: th, w = 220, ph = '搜尋訂單、租戶、司機…' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '5px 10px', borderRadius: 7,
      background: th.surfaceLo, border: '1px solid ' + th.border,
      width: w, color: th.textMuted,
    }}>
      <MgmtIcon name="search" size={13} />
      <span style={{ fontSize: 12, color: th.textDim }}>{ph}</span>
    </div>
  );
}

function Kbd({ theme: th, children }) {
  return (
    <span style={{
      fontFamily: SHELL_MONO, fontSize: 10.5, padding: '2px 6px',
      borderRadius: 5, border: '1px solid ' + th.border,
      background: th.surfaceLo, color: th.textMuted, fontWeight: 600,
    }}>{children}</span>
  );
}

function iconBtnStyle(th) {
  return {
    width: 28, height: 28, borderRadius: 7,
    background: 'transparent', border: '1px solid transparent',
    color: th.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: 0,
  };
}

// ── Page header (inside main) ──────────────────────────────────────────────
function PageHeader({ theme: th, title, subtitle, actions, tabs, activeTab }) {
  return (
    <div style={{
      padding: '18px 24px 0', borderBottom: '1px solid ' + th.border,
      background: th.bg, position: 'sticky', top: 0, zIndex: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: th.h1, fontWeight: 700, letterSpacing: -0.3, color: th.text, lineHeight: 1.1 }}>{title}</h1>
          {subtitle && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: th.textMuted, lineHeight: 1.4 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
      {tabs && (
        <div style={{ display: 'flex', gap: 0, marginTop: 14, marginLeft: -4 }}>
          {tabs.map(t => (
            <div key={t} style={{
              padding: '8px 12px', fontSize: 12.5, fontWeight: 500,
              color: t === activeTab ? th.text : th.textMuted,
              borderBottom: '2px solid ' + (t === activeTab ? th.accent : 'transparent'),
              marginBottom: -1, cursor: 'default',
            }}>{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────
function Btn({ theme: th, variant = 'secondary', size = 'sm', icon, children, danger, style = {} }) {
  const sz = size === 'xs'
    ? { p: '4px 8px', fz: 11.5, h: 24, ic: 12 }
    : size === 'md' ? { p: '8px 14px', fz: 13, h: 34, ic: 14 }
    : { p: '5px 10px', fz: 12, h: 28, ic: 13 };
  const styles = {
    primary: { bg: th.accent, fg: '#fff', bd: th.accent, sh: '0 1px 0 rgba(0,0,0,.06)' },
    secondary: { bg: th.surface, fg: th.text, bd: th.border, sh: 'none' },
    ghost: { bg: 'transparent', fg: th.textMuted, bd: 'transparent', sh: 'none' },
    danger: { bg: th.danger, fg: '#fff', bd: th.danger, sh: 'none' },
  };
  const s = danger ? styles.danger : (styles[variant] || styles.secondary);
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: sz.p, fontSize: sz.fz, height: sz.h, fontWeight: 500,
      background: s.bg, color: s.fg, border: '1px solid ' + s.bd,
      borderRadius: 7, cursor: 'pointer', boxShadow: s.sh,
      lineHeight: 1, fontFamily: SHELL_FONT, ...style,
    }}>
      {icon && <MgmtIcon name={icon} size={sz.ic} />}
      {children}
    </button>
  );
}

// ── Status pills ────────────────────────────────────────────────────────────
function Pill({ theme: th, tone = 'neutral', children, dot, style = {} }) {
  const map = {
    success: { fg: th.success, bg: th.successBg, bd: th.successBorder },
    warn:    { fg: th.warn,    bg: th.warnBg,    bd: th.warnBorder },
    danger:  { fg: th.danger,  bg: th.dangerBg,  bd: th.dangerBorder },
    info:    { fg: th.info,    bg: th.infoBg,    bd: th.infoBorder },
    accent:  { fg: th.accent,  bg: th.accentBg,  bd: th.accentBorder },
    neutral: { fg: th.textMuted, bg: th.neutralBg, bd: th.neutralBorder },
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
    </span>
  );
}

// ── Cards / Sections ────────────────────────────────────────────────────────
function Card({ theme: th, title, subtitle, actions, children, padding = 16, style = {} }) {
  return (
    <section style={{
      background: th.surface, border: '1px solid ' + th.border,
      borderRadius: 10, overflow: 'hidden', ...style,
    }}>
      {(title || actions) && (
        <header style={{
          padding: '12px 14px', borderBottom: '1px solid ' + th.border,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
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

// ── Tables ──────────────────────────────────────────────────────────────────
function Table({ theme: th, columns, rows, dense = true, onRowSelect }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: 12.5,
        fontFamily: SHELL_FONT,
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
                  fontFamily: c.mono ? SHELL_MONO : SHELL_FONT,
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

// ── Banners ─────────────────────────────────────────────────────────────────
function Banner({ theme: th, tone = 'info', icon = 'warn', title, body, actions }) {
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
        {body && <div style={{ color: th.text, lineHeight: 1.4, fontWeight: 450 }}>{body}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start' }}>{actions}</div>}
    </div>
  );
}

// ── KPI tile ────────────────────────────────────────────────────────────────
function Kpi({ theme: th, label, value, delta, deltaTone = 'neutral', sub, hint }) {
  const tones = { up: th.success, down: th.danger, neutral: th.textMuted };
  return (
    <div style={{
      background: th.surface, border: '1px solid ' + th.border, borderRadius: 10,
      padding: 14, minWidth: 0,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: th.text, letterSpacing: -0.4, lineHeight: 1.05, fontFamily: SHELL_MONO }}>{value}</span>
        {delta && <span style={{ fontSize: 11.5, fontWeight: 600, color: tones[deltaTone] || th.textMuted }}>{delta}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4 }}>{sub}</div>}
      {hint && <div style={{ fontSize: 10.5, color: th.textDim, marginTop: 6, fontFamily: SHELL_MONO }}>{hint}</div>}
    </div>
  );
}

// ── Detail rows / DL ────────────────────────────────────────────────────────
function DL({ theme: th, items, cols = 2, monoVal }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)',
      gap: '10px 16px', fontSize: 12.5,
    }}>
      {items.map((it, i) => (
        <div key={i} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: th.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{it.k}</div>
          <div style={{ color: th.text, fontFamily: monoVal || it.mono ? SHELL_MONO : SHELL_FONT, fontSize: it.mono ? 11.5 : 12.5, overflowWrap: 'anywhere' }}>{it.v}</div>
        </div>
      ))}
    </div>
  );
}

// ── Code block / curl ───────────────────────────────────────────────────────
function Code({ theme: th, children, lang = 'bash' }) {
  return (
    <pre style={{
      margin: 0, padding: '10px 12px', borderRadius: 8,
      background: th.surfaceLo, border: '1px solid ' + th.border,
      color: th.text, fontFamily: SHELL_MONO, fontSize: 11.5, lineHeight: 1.5,
      overflowX: 'auto', whiteSpace: 'pre',
    }}>{children}</pre>
  );
}

// ── Drawer (slides from right) ──────────────────────────────────────────────
function Drawer({ theme: th, title, subtitle, footer, w = 480, children }) {
  return (
    <div style={{
      position: 'absolute', right: 0, top: 46, bottom: 0, width: w,
      background: th.surface, borderLeft: '1px solid ' + th.border,
      boxShadow: '-12px 0 30px rgba(0,0,0,.08)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
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
function Modal({ theme: th, title, subtitle, footer, w = 480, children }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(8,12,22,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        width: w, background: th.surface, borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        maxHeight: '85%',
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

// ── Form row helpers ────────────────────────────────────────────────────────
function Field({ theme: th, label, hint, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: th.text, marginBottom: 5 }}>
        {label}
        {required && <span style={{ color: th.danger }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: th.textMuted, marginTop: 4, lineHeight: 1.35 }}>{hint}</div>}
    </div>
  );
}
function Input({ theme: th, value, ph, mono, suffix, prefix }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: th.bgRaised, border: '1px solid ' + th.border, borderRadius: 7,
      padding: '7px 10px', fontSize: 12.5, color: th.text,
      fontFamily: mono ? SHELL_MONO : SHELL_FONT,
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

// ── Stepper (rollout / multi-step setup) ────────────────────────────────────
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
              <span style={{ fontSize: 10.5, color: th.textDim, fontFamily: SHELL_MONO, whiteSpace: 'nowrap' }}>{e.at}</span>
            </div>
            {e.actor && <div style={{ fontSize: 11, color: th.textMuted, marginTop: 1 }}>{e.actor}</div>}
            {e.body && <div style={{ fontSize: 12, color: th.text, marginTop: 4, lineHeight: 1.4 }}>{e.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

Object.assign(window, {
  Shell, Sidebar, Topbar, NavItem, SearchBox, Kbd,
  PageHeader, Btn, Pill, Card, Table, Banner, Kpi, DL, Code,
  Drawer, Modal, Field, Input, Select, Toggle, Checkbox,
  Stepper, Timeline,
});
