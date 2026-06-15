import type { CanvasTheme } from "@drts/ui-web";
import { CanvasBanner, CanvasPill } from "@drts/ui-web";
import { SVC_TONES, type ServiceKey } from "./fleet-portal-fixtures";
import { t, type Locale } from "./translations";

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

function humanizeCode(value: string) {
  return value.replace(/_/g, " ");
}

export function formatFleetCodeLabel(
  locale: Locale,
  prefix: string,
  code: string,
  fallback?: string,
) {
  const key = `${prefix}.${code}`;
  const translated = t(key, locale);
  if (translated !== key) {
    return translated;
  }
  return fallback ?? humanizeCode(code);
}

export function SvcChip({
  theme,
  locale,
  svc,
}: {
  theme: CanvasTheme;
  locale: Locale;
  svc: ServiceKey;
}) {
  const tone = SVC_TONES[svc] ?? ("neutral" as const);
  return (
    <CanvasPill theme={theme} tone={tone}>
      {t(`svc.${svc}`, locale)}
    </CanvasPill>
  );
}

export function SvcChips({
  theme,
  locale,
  list,
}: {
  theme: CanvasTheme;
  locale: Locale;
  list: ServiceKey[];
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {list.map((s) => (
        <SvcChip key={s} theme={theme} locale={locale} svc={s} />
      ))}
    </div>
  );
}

// Render only the active locale. The portal shell already exposes a language
// switcher, so duplicated bilingual labels read like untranslated copy.
export function BiLabel({
  theme,
  locale,
  zh,
  en,
}: {
  theme: CanvasTheme;
  locale: Locale;
  zh: string;
  en: string;
}) {
  const primary = locale === "en" ? en : zh;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column" }}>
      <span style={{ fontSize: 13, color: theme.text }}>{primary}</span>
    </span>
  );
}
