// tokens.jsx — Design tokens for DRTS driver app
// Modern fintech-ish: cool neutral surfaces, restrained accents, soft cards.
// Two themes: light and dark. Hue-shared accents via OKLCH.

const T = {
  // Brand seed (DRTS owned dispatch)
  brand: {
    light: '#0F4C75',   // deep teal-blue
    lightHi: '#1E6BA8',
    dark: '#7BC0FF',
    darkHi: '#A9D6FF',
  },

  // Semantic accent ramp (hue-shared, oklch lightness ~0.7, chroma ~0.14)
  // Used to color external platform chips and authority banners.
  // SmartRides X (forwarded) — warm amber
  forwarded: {
    light: '#B45309',
    lightBg: '#FEF3E2',
    lightBorder: '#F4D9A6',
    dark: '#FBBF24',
    darkBg: '#3A2A0A',
    darkBorder: '#5C4218',
  },
  // Owned (DRTS)
  owned: {
    light: '#0F4C75',
    lightBg: '#E6F0F8',
    lightBorder: '#BBD3E6',
    dark: '#7BC0FF',
    darkBg: '#0F2236',
    darkBorder: '#1B3A5A',
  },

  // Status
  success: { light: '#0F7B5A', lightBg: '#E5F4ED', dark: '#34D399', darkBg: '#0E2A1F' },
  warn:    { light: '#A8590B', lightBg: '#FCEED6', dark: '#FBBF24', darkBg: '#2D1F08' },
  danger:  { light: '#B42318', lightBg: '#FEE4E2', dark: '#F87171', darkBg: '#2C100E' },
  info:    { light: '#1F5DB8', lightBg: '#E4EDFB', dark: '#93C5FD', darkBg: '#0F1F36' },
  neutral: { light: '#475569', lightBg: '#F1F4F8', dark: '#94A3B8', darkBg: '#1A2230' },
};

// Theme builder — returns full token object for given mode.
function buildTheme(dark = false) {
  if (dark) {
    return {
      mode: 'dark',
      bg:        '#0B1018',
      bgRaised:  '#121823',
      surface:   '#19212E',
      surfaceHi: '#1F2937',
      surfaceLo: '#0F151E',
      border:    '#2A3445',
      borderStrong: '#3A475C',
      text:      '#E6EAF2',
      textMuted: '#94A3B8',
      textDim:   '#64748B',
      brand:     T.brand.dark,
      brandHi:   T.brand.darkHi,
      brandBg:   '#0F2236',

      forwardedFg: T.forwarded.dark,
      forwardedBg: T.forwarded.darkBg,
      forwardedBorder: T.forwarded.darkBorder,
      ownedFg:    T.owned.dark,
      ownedBg:    T.owned.darkBg,
      ownedBorder: T.owned.darkBorder,

      success: T.success.dark,    successBg: T.success.darkBg,
      warn:    T.warn.dark,       warnBg:    T.warn.darkBg,
      danger:  T.danger.dark,     dangerBg:  T.danger.darkBg,
      info:    T.info.dark,       infoBg:    T.info.darkBg,
      neutral: T.neutral.dark,    neutralBg: T.neutral.darkBg,

      shadow: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)',
      shadowSm: '0 1px 2px rgba(0,0,0,0.4)',
    };
  }
  return {
    mode: 'light',
    bg:        '#F6F8FB',
    bgRaised:  '#FFFFFF',
    surface:   '#FFFFFF',
    surfaceHi: '#FFFFFF',
    surfaceLo: '#F1F4F8',
    border:    '#E3E8EF',
    borderStrong: '#CBD5E1',
    text:      '#0F172A',
    textMuted: '#475569',
    textDim:   '#64748B',
    brand:     T.brand.light,
    brandHi:   T.brand.lightHi,
    brandBg:   '#E6F0F8',

    forwardedFg: T.forwarded.light,
    forwardedBg: T.forwarded.lightBg,
    forwardedBorder: T.forwarded.lightBorder,
    ownedFg:    T.owned.light,
    ownedBg:    T.owned.lightBg,
    ownedBorder: T.owned.lightBorder,

    success: T.success.light,   successBg: T.success.lightBg,
    warn:    T.warn.light,      warnBg:    T.warn.lightBg,
    danger:  T.danger.light,    dangerBg:  T.danger.lightBg,
    info:    T.info.light,      infoBg:    T.info.lightBg,
    neutral: T.neutral.light,   neutralBg: T.neutral.lightBg,

    shadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.06)',
    shadowSm: '0 1px 2px rgba(15,23,42,0.05)',
  };
}

// Type system — Inter for UI, JetBrains Mono for codes/IDs.
// (Fintech conventions; we'll load via Google Fonts in main HTML.)
const TYPE = {
  family: '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono:   '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  display: { size: 28, weight: 700, lh: 1.15, ls: -0.5 },
  h1:      { size: 22, weight: 700, lh: 1.2,  ls: -0.3 },
  h2:      { size: 18, weight: 650, lh: 1.25, ls: -0.2 },
  h3:      { size: 16, weight: 600, lh: 1.3,  ls: -0.1 },
  body:    { size: 15, weight: 450, lh: 1.45, ls: 0 },
  small:   { size: 13, weight: 450, lh: 1.4,  ls: 0 },
  micro:   { size: 11, weight: 600, lh: 1.3,  ls: 0.4 },  // chips, ALL-CAPS labels
};

const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32, '4xl': 48 };
const RADIUS = { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 };

Object.assign(window, { buildTheme, TYPE, SPACE, RADIUS });
