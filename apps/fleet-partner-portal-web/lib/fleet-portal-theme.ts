import { buildCanvasTheme, type CanvasTheme } from "@drts/ui-web";

// The Fleet Partner Portal is a partner-facing self-service surface, so it
// uses the shared "partner" canvas surface (dark, compact) rather than the
// internal ops/admin accents. Colours come from the design system — the
// portal never hardcodes its own palette.
export function buildFleetTheme(): CanvasTheme {
  return buildCanvasTheme({
    surface: "partner",
    dark: true,
    density: "compact",
  });
}
