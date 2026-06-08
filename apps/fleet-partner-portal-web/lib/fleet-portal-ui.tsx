import type { CanvasTheme } from "@drts/ui-web";
import { CanvasBanner, CanvasPill } from "@drts/ui-web";
import { SVC_LABELS, type ServiceKey } from "./fleet-portal-fixtures";

// Shows the "design data" notice only when a view is rendering fixtures
// because the live `/api/fleet-partner/*` endpoint was unavailable or empty.
export function DataSourceNotice({
  theme,
  source,
  body,
}: {
  theme: CanvasTheme;
  source: "live" | "fallback";
  body: string;
}) {
  if (source === "live") {
    return null;
  }
  return <CanvasBanner theme={theme} tone="info" icon="warn" body={body} />;
}

export function SvcChip({
  theme,
  svc,
}: {
  theme: CanvasTheme;
  svc: ServiceKey;
}) {
  const s = SVC_LABELS[svc] ?? { zh: svc, tone: "neutral" as const };
  return (
    <CanvasPill theme={theme} tone={s.tone}>
      {s.zh}
    </CanvasPill>
  );
}

export function SvcChips({
  theme,
  list,
}: {
  theme: CanvasTheme;
  list: ServiceKey[];
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {list.map((s) => (
        <SvcChip key={s} theme={theme} svc={s} />
      ))}
    </div>
  );
}

// Bilingual stacked label (zh primary, en secondary) — the design's BiLabel.
export function BiLabel({
  theme,
  zh,
  en,
}: {
  theme: CanvasTheme;
  zh: string;
  en: string;
}) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column" }}>
      <span style={{ fontSize: 13, color: theme.text }}>{zh}</span>
      <span
        style={{
          fontSize: 11,
          color: theme.textDim,
          fontFamily: theme.monoFamily,
        }}
      >
        {en}
      </span>
    </span>
  );
}
