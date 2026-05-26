// driver-tokens.jsx — Tokens for the driver app (mobile React Native style).
// Independent of @drts/ui-web per Q-X04 (driver-app cannot import web tokens).
// Fintech-ish palette aligned with the web consoles but native-mobile sized.

const DRV_T = {
  // ── Brand seed ────────────────────────────────────────────────────────────
  brand: {
    light: '#0F4C75', lightHi: '#1E6BA8',
    dark:  '#7BC0FF', darkHi:  '#A9D6FF',
  },
  // ── Authority signal ──────────────────────────────────────────────────────
  // owned = DRTS-originated; forwarded = external-platform mirror (Q-DRV01)
  owned: {
    light: '#0F4C75', lightBg: '#E6F0F8', lightBorder: '#BBD3E6',
    dark:  '#7BC0FF', darkBg:  '#0F2236', darkBorder:  '#1B3A5A',
  },
  forwarded: {
    light: '#B45309', lightBg: '#FEF3E2', lightBorder: '#F4D9A6',
    dark:  '#FBBF24', darkBg:  '#3A2A0A', darkBorder:  '#5C4218',
  },
  // ── Semantic status ───────────────────────────────────────────────────────
  success: { light: '#0F7B5A', lightBg: '#E5F4ED', dark: '#34D399', darkBg: '#0E2A1F' },
  warn:    { light: '#A8590B', lightBg: '#FCEED6', dark: '#FBBF24', darkBg: '#2D1F08' },
  danger:  { light: '#B42318', lightBg: '#FEE4E2', dark: '#F87171', darkBg: '#2C100E' },
  info:    { light: '#1F5DB8', lightBg: '#E4EDFB', dark: '#93C5FD', darkBg: '#0F1F36' },
  neutral: { light: '#475569', lightBg: '#F1F4F8', dark: '#94A3B8', darkBg: '#1A2230' },
};

function buildDrvTheme(dark = false) {
  const p = dark ? {
    bg: '#0B1018', bgRaised: '#121823', surface: '#19212E', surfaceLo: '#0F151E',
    border: '#2A3445', borderStrong: '#3A475C',
    text: '#E6EAF2', textMuted: '#94A3B8', textDim: '#64748B',
    brand: DRV_T.brand.dark, brandHi: DRV_T.brand.darkHi, brandBg: '#0F2236',
    ownedFg: DRV_T.owned.dark, ownedBg: DRV_T.owned.darkBg, ownedBorder: DRV_T.owned.darkBorder,
    forwardedFg: DRV_T.forwarded.dark, forwardedBg: DRV_T.forwarded.darkBg, forwardedBorder: DRV_T.forwarded.darkBorder,
    success: DRV_T.success.dark, successBg: DRV_T.success.darkBg,
    warn: DRV_T.warn.dark, warnBg: DRV_T.warn.darkBg,
    danger: DRV_T.danger.dark, dangerBg: DRV_T.danger.darkBg,
    info: DRV_T.info.dark, infoBg: DRV_T.info.darkBg,
    neutral: DRV_T.neutral.dark, neutralBg: DRV_T.neutral.darkBg,
    shadow: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3)',
  } : {
    bg: '#F6F8FB', bgRaised: '#FFFFFF', surface: '#FFFFFF', surfaceLo: '#F1F4F8',
    border: '#E3E8EF', borderStrong: '#CBD5E1',
    text: '#0F172A', textMuted: '#475569', textDim: '#64748B',
    brand: DRV_T.brand.light, brandHi: DRV_T.brand.lightHi, brandBg: '#E6F0F8',
    ownedFg: DRV_T.owned.light, ownedBg: DRV_T.owned.lightBg, ownedBorder: DRV_T.owned.lightBorder,
    forwardedFg: DRV_T.forwarded.light, forwardedBg: DRV_T.forwarded.lightBg, forwardedBorder: DRV_T.forwarded.lightBorder,
    success: DRV_T.success.light, successBg: DRV_T.success.lightBg,
    warn: DRV_T.warn.light, warnBg: DRV_T.warn.lightBg,
    danger: DRV_T.danger.light, dangerBg: DRV_T.danger.lightBg,
    info: DRV_T.info.light, infoBg: DRV_T.info.lightBg,
    neutral: DRV_T.neutral.light, neutralBg: DRV_T.neutral.lightBg,
    shadow: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)',
  };
  return { mode: dark ? 'dark' : 'light', ...p };
}

const DRV_FONT = '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const DRV_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

// Bilingual label helper "已派車 · assigned"
function DrvBi({ zh, en, theme: t, size = 12, mono = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontSize: size }}>
      <span style={{ fontWeight: 500, color: t ? t.text : 'inherit' }}>{zh}</span>
      {en && <span style={{ fontFamily: DRV_MONO, fontSize: size - 1, opacity: 0.55 }}>· {en}</span>}
    </span>
  );
}

// Icons (subset; 24×24 viewBox)
const DRV_ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  list: 'M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01',
  car: 'M3 17h18M5 17l2-7h10l2 7M7 17v2H5v-2M19 17v2h-2v-2',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 18l9 5 9-5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowL: 'M19 12H5M11 6l-6 6 6 6',
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  bell: 'M6 8a6 6 0 1112 0v5l2 3H4l2-3zM10 19a2 2 0 004 0',
  pin: 'M12 21l-5-5 5-9 5 9zM12 12v.01',
  clock: 'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  refresh: 'M3 12a9 9 0 0115-6.4L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.4L3 16M3 21v-5h5',
  power: 'M18 6a9 9 0 11-12 0M12 2v10',
  shield: 'M12 3l9 4v6c0 5-4 8-9 9-5-1-9-4-9-9V7l9-4z',
  warn: 'M12 3l10 18H2zM12 10v5M12 17v.01',
  ext: 'M14 4h6v6M10 14L20 4M19 13v6H5V5h6',
  download: 'M12 3v14M5 12l7 7 7-7M5 21h14',
  sos: 'M12 2l10 18H2L12 2zM12 9v5M12 17v.01',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 100-8 4 4 0 000 8z',
  lock: 'M8 11V8a4 4 0 018 0v3M6 11h12v10H6z',
  link: 'M10 13a5 5 0 008 0l3-3a5 5 0 00-8-8l-1 1M14 11a5 5 0 00-8 0l-3 3a5 5 0 008 8l1-1',
  star: 'M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  phone: 'M3 5c0 9 7 16 16 16v-4l-4-2-2 2a12 12 0 01-6-6l2-2-2-4z',
  wifi: 'M5 12.5a11 11 0 0114 0M2 9a16 16 0 0120 0M8.5 16a6 6 0 017 0M12 19v.01',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  key: 'M14 8a4 4 0 11-1.1 7.9L10 19H7v-3l5-5A4 4 0 0114 8zM15 11h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  briefcase: 'M3 7h18v13H3zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2',
};

function DrvIcon({ name, size = 18, stroke = 1.8, style = {} }) {
  const d = DRV_ICONS[name] || DRV_ICONS.arrow;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: '0 0 auto', display: 'block', ...style }}>
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

Object.assign(window, { DRV_T, DRV_FONT, DRV_MONO, DRV_ICONS, buildDrvTheme, DrvIcon, DrvBi });
