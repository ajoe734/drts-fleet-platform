import { CanvasCard, CanvasKPI, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { FX_FLEET_QUALITY } from "@/lib/fleet-portal-fixtures";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetQualityPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("quality.title", locale)}
        subtitle={t("quality.subtitle", locale)}
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {FX_FLEET_QUALITY.map((q) => (
            <CanvasKPI
              key={q.en}
              theme={theme}
              label={q.zh}
              value={q.v}
              delta={q.delta}
              deltaTone={
                q.tone === "success"
                  ? "up"
                  : q.tone === "warn"
                    ? "down"
                    : "neutral"
              }
            />
          ))}
        </div>
        <CanvasCard theme={theme} title={t("quality.responsibility", locale)}>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: theme.text,
              lineHeight: 1.7,
            }}
          >
            <li>車行整體品質分數影響每月績效獎金與合作評等。</li>
            <li>
              司機行為類申訴若責任歸屬車行，計入車行品質指標並可能觸發罰則。
            </li>
            <li>準點率與完成率以後端計算為準，車行端為唯讀檢視。</li>
            <li>品質指標連續低於門檻將進入合作檢討流程。</li>
          </ol>
        </CanvasCard>
      </div>
    </>
  );
}
