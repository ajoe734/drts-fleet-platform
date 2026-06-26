import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  getRocLiveBoardPageData,
  resolveVehicleStateKey,
  resolveVehicleStateTone,
} from "@/lib/roc-page-data";
import {
  RocDualFreshness,
  RocLiveOverlay,
  RocRefreshBanner,
  RocStatePill,
} from "@/components/roc-screen-primitives";
import {
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
} from "@drts/ui-web";

export default async function LiveBoardPage() {
  const locale = await getServerLocale();
  const data = await getRocLiveBoardPageData();

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={t("liveboard.title", locale)}
        subtitle={t("liveboard.subtitle", locale)}
        actions={
          <>
            <Btn theme={rocTheme} icon="filter">
              {t("common.area", locale)}
            </Btn>
            <Btn theme={rocTheme} icon="refresh">
              {t("common.live", locale)}
            </Btn>
          </>
        }
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card
          theme={rocTheme}
          title={t("liveboard.overlay", locale)}
          padding={0}
        >
          <RocLiveOverlay vehicles={data.vehicles} />
          <div
            style={{
              padding: "10px 14px",
              fontSize: 10.5,
              color: rocTheme.textMuted,
              fontFamily: rocTheme.monoFamily,
              borderTop: `1px solid ${rocTheme.border}`,
            }}
          >
            {t("liveboard.overlayNote", locale)}
          </div>
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.vehicles
            .filter(
              (vehicle) => vehicle.currentOrderId || vehicle.autonomyState,
            )
            .map((vehicle) => (
              <Card theme={rocTheme} key={vehicle.vehicleId} padding={14}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      color: rocTheme.accent,
                      fontWeight: 700,
                      fontFamily: rocTheme.monoFamily,
                    }}
                  >
                    {vehicle.vehicleId}
                  </span>
                  <RocStatePill
                    stateKey={resolveVehicleStateKey(vehicle)}
                    tone={resolveVehicleStateTone(vehicle)}
                    locale={locale}
                  />
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      fontSize: 11,
                      color: rocTheme.textMuted,
                      fontFamily: rocTheme.monoFamily,
                    }}
                  >
                    {vehicle.speedKmh} km/h
                  </span>
                </div>
                <RocDualFreshness
                  telemetry={vehicle.telemetryFreshness}
                  regulatory={vehicle.regulatoryFreshness}
                  locale={locale}
                />
              </Card>
            ))}
        </div>
      </div>
    </div>
  );
}
