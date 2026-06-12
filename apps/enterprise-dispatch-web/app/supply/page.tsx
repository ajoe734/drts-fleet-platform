import {
  CanvasEmptyState,
  CanvasPageHeader,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  density: "compact",
});

export default function SupplyPage() {
  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <CanvasPageHeader
        theme={theme}
        title="Supply Watch"
        subtitle="Minimal route stub for future operator supply monitoring."
      />
      <CanvasEmptyState
        theme={theme}
        tone="neutral"
        title="Supply panels pending design"
        body="No design-canvas screen exists yet for live supply watchlists, outage surfaces, or detail drawers."
      />
    </div>
  );
}
