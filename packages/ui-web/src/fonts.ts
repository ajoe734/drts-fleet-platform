/**
 * Canonical font stacks for the DRTS Driver App design handoff.
 *
 * The handoff specifies (`/tmp/driver-app-handoff/driver-app/project/tokens.jsx`,
 * `mgmt-tokens.jsx`):
 * - UI / display: Inter
 * - zh-TW glyphs: Noto Sans TC
 * - IDs / codes / numbers: JetBrains Mono
 *
 * This module exposes the canonical CSS `font-family` strings and the
 * `next/font/google` config objects, so each app's `app/layout.tsx` can
 * initialize fonts identically without duplicating the configuration.
 */

/**
 * Body / display font-family. Pull-up Inter, fallback to Noto Sans TC for
 * Chinese glyphs, then system fonts.
 */
export const CANONICAL_FONT_FAMILY =
  '"Inter", "Noto Sans TC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

/**
 * Monospace font-family for IDs, codes, fares, timestamps.
 */
export const CANONICAL_MONO_FAMILY =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * CSS variable names that apps wire up via `next/font/google({ variable })`.
 * Keep names stable across apps so any shared component can rely on
 * `var(--font-sans)` etc.
 */
export const FONT_CSS_VARIABLES = {
  sans: "--font-sans",
  tc: "--font-tc",
  mono: "--font-mono",
} as const;

/**
 * Recommended configuration to pass into Next.js' `next/font/google` family
 * loaders. Apps consume like:
 *
 * ```ts
 * import { Inter, Noto_Sans_TC, JetBrains_Mono } from "next/font/google";
 * import { NEXT_FONT_CONFIG } from "@drts/ui-web";
 *
 * const sans = Inter(NEXT_FONT_CONFIG.sans);
 * const tc   = Noto_Sans_TC(NEXT_FONT_CONFIG.tc);
 * const mono = JetBrains_Mono(NEXT_FONT_CONFIG.mono);
 * ```
 *
 * Then in the `<html>` tag, set
 * `className={`${sans.variable} ${tc.variable} ${mono.variable}`}`.
 */
export const NEXT_FONT_CONFIG = {
  sans: {
    subsets: ["latin"] as const,
    variable: FONT_CSS_VARIABLES.sans,
    display: "swap" as const,
    weight: ["400", "500", "600", "700"] as const,
  },
  tc: {
    subsets: ["latin"] as const,
    variable: FONT_CSS_VARIABLES.tc,
    display: "swap" as const,
    weight: ["400", "500", "600", "700"] as const,
  },
  mono: {
    subsets: ["latin"] as const,
    variable: FONT_CSS_VARIABLES.mono,
    display: "swap" as const,
    weight: ["400", "500", "600", "700"] as const,
  },
} as const;
