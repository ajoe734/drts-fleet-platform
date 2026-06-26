import { buildCanvasTheme, CanvasEmptyState } from "@drts/ui-web";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

const theme = buildCanvasTheme({
  surface: "roc",
  dark: true,
  density: "compact",
});

/**
 * Scaffold landing — intentionally NOT a ROC screen. Per decision packet §C2 the
 * ROC screens are owned by the visual-team canvas and are not designed here; the
 * home route renders the shared `CanvasEmptyState` primitive so the shell, roc
 * semantic tokens and navigation are exercised without inventing any bespoke
 * screen UI. The availableActions → ActionReceipt wiring lives in
 * `components/roc-action-rail.tsx` + `lib/action-runtime.ts`, ready for real
 * resources to bind once the canvas defines the screens.
 */
export default async function HomePage() {
  const locale = await getServerLocale();

  return (
    <div style={{ padding: 20, height: "100%", overflow: "auto" }}>
      <CanvasEmptyState
        theme={theme}
        tone="info"
        title={t("scaffold.banner.title", locale)}
        body={t("scaffold.banner.body", locale)}
      />
    </div>
  );
}
