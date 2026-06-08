// mgmt-shell.jsx — App chrome (Sidebar / Topbar / PageHeader) per authority docs.
// Identity chip: realm / env / tenant / actor (Q-X11)
// Sidebar footer: UiHealthEnvelope status + lastCheckedAt (Q-X11/X12)
// Page header: refresh tier badge + stale affordance (Q-X01/X02)
// Cross-app deep link awareness (Q-X03)

const SHELL_FONT = '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const SHELL_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

// ── Shell layout ────────────────────────────────────────────────────────────
function Shell({ theme: th, nav, active, breadcrumb = [], topRight, env = 'production',
                 tenant, actor = { name: 'YL', display: '林宜君', role: 'pa_super_admin' },
                 health = { status: 'healthy', lastCheckedAt: '2s' },
                 refreshTier = 'medium_slow', dataFreshness = 'fresh',
                 children, footer, healthBanner }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'grid',
      gridTemplateColumns: '224px 1fr', gridTemplateRows: '46px 1fr',
      background: th.bg, color: th.text, fontFamily: SHELL_FONT, fontSize: th.fz,
      overflow: 'hidden',
    }}>
      <Sidebar theme={th} nav={nav} active={active} health={health} />
      <Topbar theme={th} breadcrumb={breadcrumb} topRight={topRight}
              env={env} tenant={tenant} actor={actor}
              refreshTier={refreshTier} dataFreshness={dataFreshness} />
      <main style={{ gridColumn: 2, gridRow: 2, overflow: 'auto', background: th.bg, color: th.text }}>
        {healthBanner}
        {children}
        {footer}
      </main>
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ theme: th, nav = [], active, health }) {
  return (
    <aside style={{
      gridRow: '1 / 3', background: th.surface, borderRight: '1px solid ' + th.border,
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
      {/* Health footer — UiHealthEnvelope (Q-X11/X12) */}
      <HealthFooter theme={th} health={health} />
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
          fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 6, lineHeight: 1.3,
          background: item.badgeTone === 'danger' ? th.dangerBg : item.badgeTone === 'warn' ? th.warnBg : item.badgeTone === 'accent' ? th.accentBg : th.neutralBg,
          color: item.badgeTone === 'danger' ? th.danger : item.badgeTone === 'warn' ? th.warn : item.badgeTone === 'accent' ? th.accent : th.textMuted,
        }}>{item.badge}</span>
      )}
    </div>
  );
}

function HealthFooter({ theme: th, health = { status: 'healthy', lastCheckedAt: '2s' } }) {
  const tones = {
    healthy:  { fg: th.success, bg: th.successBg, label: 'API healthy', en: 'healthy' },
    degraded: { fg: th.warn,    bg: th.warnBg,    label: 'API 降級',     en: 'degraded' },
    down:     { fg: th.danger,  bg: th.dangerBg,  label: 'API down',     en: 'down' },
  };
  const t = tones[health.status] || tones.healthy;
  return (
    <div style={{
      padding: '8px 10px 10px', borderTop: '1px solid ' + th.border,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', borderRadius: 6, background: t.bg,
        fontSize: 11, fontWeight: 600, color: t.fg,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: t.fg, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{t.label}</span>
        <span style={{ fontFamily: SHELL_MONO, opacity: 0.7 }}>{t.en}</span>
      </div>
      <div style={{ fontSize: 10, color: th.textDim, display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
        <span>last checked</span>
        <span style={{ fontFamily: SHELL_MONO }}>{health.lastCheckedAt} ago</span>
      </div>
      {health.degradedServices && health.degradedServices.length > 0 && (
        <div style={{ fontSize: 10, color: th.warn, padding: '0 2px' }}>
          {health.degradedServices.length} 個依賴降級
        </div>
      )}
    </div>
  );
}

// ── Topbar ──────────────────────────────────────────────────────────────────
function Topbar({ theme: th, breadcrumb = [], topRight, env, tenant, actor, refreshTier, dataFreshness }) {
  return (
    <header style={{
      gridColumn: 2, gridRow: 1,
      borderBottom: '1px solid ' + th.border, background: th.surface,
      display: 'flex', alignItems: 'center', padding: '0 12px',
      gap: 10, height: 46, boxSizing: 'border-box',
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
        {breadcrumb.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <MgmtIcon name="chevR" size={11} style={{ color: th.textDim }} />}
            <span style={{
              fontSize: 12.5, fontWeight: i === breadcrumb.length - 1 ? 600 : 450,
              color: i === breadcrumb.length - 1 ? th.text : th.textMuted,
              whiteSpace: 'nowrap',
            }}>{c}</span>
          </React.Fragment>
        ))}
      </div>

      <RefreshTierBadge theme={th} tier={refreshTier} freshness={dataFreshness} />
      <SearchBox theme={th} />
      <Kbd theme={th}>⌘K</Kbd>
      <button style={iconBtnStyle(th)} title="通知">
        <MgmtIcon name="bell" size={15} />
      </button>
      <IdentityChip theme={th} env={env} tenant={tenant} actor={actor} />
      {topRight}
    </header>
  );
}

// ── Identity chip — realm / env / tenant / actor (Q-X11) ────────────────────
function IdentityChip({ theme: th, env = 'production', tenant, actor = {} }) {
  // realm color comes from console accent — already set by theme
  const envColor = env === 'production' ? th.success
    : env === 'sandbox' ? th.warn
    : env === 'staging' ? th.info
    : th.textMuted;
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 1,
      background: th.surfaceLo, border: '1px solid ' + th.border, borderRadius: 7,
      overflow: 'hidden', height: 28,
    }}>
      {/* realm chip */}
      <div style={{
        padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
        background: th.accentBg, color: th.accent, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
        textTransform: 'uppercase',
      }}>
        <span style={{ width: 4, height: 4, borderRadius: 2, background: th.accent }} />
        {th.surface === 'platform' ? 'PLATFORM' : th.surface === 'ops' ? 'OPS' : th.surface === 'tenant' ? 'TENANT' : th.surface.toUpperCase()}
      </div>
      {/* env chip */}
      <div style={{
        padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
        color: envColor, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
        fontFamily: SHELL_MONO,
      }}>
        <span style={{ width: 4, height: 4, borderRadius: 2, background: envColor }} />
        {env}
      </div>
      {/* tenant chip (only when present) */}
      {tenant && (
        <div style={{
          padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4,
          borderLeft: '1px solid ' + th.border, color: th.textMuted, fontSize: 11, fontWeight: 600,
          fontFamily: SHELL_MONO,
        }}>{tenant}</div>
      )}
      {/* actor avatar */}
      <div style={{
        padding: '0 8px 0 6px', display: 'flex', alignItems: 'center', gap: 6,
        borderLeft: '1px solid ' + th.border,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 9,
          background: th.accentBg, color: th.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9.5, fontWeight: 700, border: '1px solid ' + th.accentBorder,
        }}>{actor.name || 'YL'}</div>
        <span style={{ fontSize: 11.5, color: th.text, fontWeight: 500, whiteSpace: 'nowrap' }}>{actor.display || '林宜君'}</span>
      </div>
    </div>
  );
}

// ── Refresh tier badge (Q-X01/X02) ──────────────────────────────────────────
function RefreshTierBadge({ theme: th, tier = 'medium_slow', freshness = 'fresh' }) {
  const t = REFRESH_TIERS[tier];
  if (!t) return null;
  const tones = {
    fresh:    { fg: th.success, bg: th.successBg, bd: th.successBorder, label: '即時' },
    stale:    { fg: th.warn,    bg: th.warnBg,    bd: th.warnBorder,    label: '已過時' },
    degraded: { fg: th.danger,  bg: th.dangerBg,  bd: th.dangerBorder,  label: '降級' },
    unknown:  { fg: th.textMuted, bg: th.neutralBg, bd: th.neutralBorder, label: '未知' },
  };
  const fState = tones[freshness] || tones.fresh;
  const isPolling = t.ms !== null;
  return (
    <div title={`${t.label} · ${t.note}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 8px', borderRadius: 6,
      background: fState.bg, border: '1px solid ' + fState.bd,
      fontSize: 10.5, fontWeight: 600, color: fState.fg, fontFamily: SHELL_MONO,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 2.5, background: fState.fg, flexShrink: 0,
        animation: freshness === 'fresh' && isPolling ? 'pulse 2s infinite' : 'none' }} />
      <span style={{ letterSpacing: 0.4 }}>{t.code}</span>
      {isPolling && <span>{t.ms / 1000}s</span>}
      {!isPolling && <span>MANUAL</span>}
      {freshness !== 'fresh' && <span>· {fState.label}</span>}
    </div>
  );
}

function SearchBox({ theme: th, w = 200, ph = '搜尋訂單、租戶、司機… · search' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '5px 10px', borderRadius: 7,
      background: th.surfaceLo, border: '1px solid ' + th.border,
      width: w, color: th.textMuted,
    }}>
      <MgmtIcon name="search" size={13} />
      <span style={{ fontSize: 11.5, color: th.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ph}</span>
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

// ── Page header (inside main) ───────────────────────────────────────────────
function PageHeader({ theme: th, title, subtitle, actions, tabs, activeTab, meta }) {
  return (
    <div style={{
      padding: '16px 24px 0', borderBottom: '1px solid ' + th.border,
      background: th.bg, position: 'sticky', top: 0, zIndex: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: th.h1, fontWeight: 700, letterSpacing: -0.3, color: th.text, lineHeight: 1.1 }}>{title}</h1>
          {subtitle && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: th.textMuted, lineHeight: 1.4 }}>{subtitle}</p>}
          {meta && <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{meta}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
      {tabs && (
        <div style={{ display: 'flex', gap: 0, marginTop: 14, marginLeft: -4, flexWrap: 'wrap' }}>
          {tabs.map(t => {
            const label = typeof t === 'string' ? t : t.label;
            const id = typeof t === 'string' ? t : t.id;
            const badge = typeof t === 'object' ? t.badge : null;
            const tone = typeof t === 'object' ? t.tone : null;
            const on = id === activeTab;
            return (
              <div key={id} style={{
                padding: '8px 12px', fontSize: 12.5, fontWeight: 500,
                color: on ? th.text : th.textMuted,
                borderBottom: '2px solid ' + (on ? th.accent : 'transparent'),
                marginBottom: -1, cursor: 'default',
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                {label}
                {badge != null && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '0 6px', borderRadius: 10, lineHeight: '16px',
                    background: tone === 'danger' ? th.dangerBg : tone === 'warn' ? th.warnBg : tone === 'accent' ? th.accentBg : th.neutralBg,
                    color: tone === 'danger' ? th.danger : tone === 'warn' ? th.warn : tone === 'accent' ? th.accent : th.textMuted,
                  }}>{badge}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  Shell, Sidebar, Topbar, NavItem, HealthFooter, IdentityChip,
  RefreshTierBadge, SearchBox, Kbd, iconBtnStyle, PageHeader,
  SHELL_FONT, SHELL_MONO,
});
