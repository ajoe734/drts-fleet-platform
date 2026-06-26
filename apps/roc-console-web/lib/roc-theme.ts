import type { CSSProperties } from "react";
import { buildCanvasTheme } from "@drts/ui-web";

export const rocTheme = buildCanvasTheme({
  surface: "roc",
  dark: true,
  density: "compact",
});

export function getRocBodyStyleVars(): CSSProperties {
  return {
    "--roc-canvas-bg": rocTheme.bg,
    "--roc-canvas-text": rocTheme.text,
    "--roc-canvas-font": rocTheme.fontFamily,
  } as CSSProperties;
}
