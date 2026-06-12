import { buildCanvasTheme } from "@drts/ui-web";

export const enterpriseTheme = buildCanvasTheme({
  surface: "ops",
  density: "compact",
});

export const enterprisePageStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
} as const;

export const enterpriseCardGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
} as const;
