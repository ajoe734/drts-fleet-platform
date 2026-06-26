import { notFound } from "next/navigation";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  buildSupportedAlertActionItems,
  getRocVehicleDetailPageData,
  resolveVehicleStateKey,
  resolveVehicleStateTone,
} from "@/lib/roc-page-data";
import {
  RocDualFreshness,
  RocEvidenceTag,
  RocRefreshBanner,
  RocStatePill,
} from "@/components/roc-screen-primitives";
import { RocActionRail } from "@/components/roc-action-rail";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const locale = await getServerLocale();
  const data = await getRocVehicleDetailPageData(vehicleId);

  if (!data.vehicle) {
    notFound();
  }
  const vehicle = data.vehicle;

  const actionItems = buildSupportedAlertActionItems(data.alerts, locale);
  const evidenceColumns: CanvasTableColumn<
    (typeof data.evidenceFiles)[number]
  >[] = [
    {
      h: t("vehicleDetail.evidence.file", locale),
      k: "name",
      w: 184,
      mono: true,
    },
    {
      h: t("vehicleDetail.evidence.source", locale),
      w: 180,
      r: (row) => <RocEvidenceTag source={row.source} locale={locale} />,
    },
    {
      h: t("vehicleDetail.evidence.duration", locale),
      k: "durationLabel",
      w: 90,
      mono: true,
    },
    {
      h: t("vehicleDetail.evidence.sha", locale),
      k: "shaLabel",
      w: 110,
      mono: true,
    },
    {
      h: t("vehicleDetail.evidence.status", locale),
      w: 110,
      r: (row) => (
        <Pill
          theme={rocTheme}
          tone={
            row.status === "sealed"
              ? "success"
              : row.status === "uploading"
                ? "info"
                : "neutral"
          }
          dot
        >
          {t(`evidenceStatus.${row.status}`, locale)}
        </Pill>
      ),
    },
  ];
  const providerDown = data.providerHealth.items.some(
    (item) =>
      item.affectedVehicleIds.includes(vehicle.vehicleId) &&
      (item.status === "degraded" || item.status === "down"),
  );

  return (
    <div
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}
    >
      <PageHeader
        theme={rocTheme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {vehicle.vehicleId} · {vehicle.model}
            <RocStatePill
              stateKey={resolveVehicleStateKey(vehicle)}
              tone={resolveVehicleStateTone(vehicle)}
              locale={locale}
            />
          </span>
        }
        subtitle={t("vehicleDetail.subtitle", locale, {
          area: vehicle.areaLabel,
          operator: vehicle.safetyOperatorLabel,
        })}
      />
      <div style={{ display: "flex", gap: 8, padding: "0 24px" }}>
        <Pill theme={rocTheme} tone="accent" dot>
          {t("vehicleDetail.meta", locale)}
        </Pill>
      </div>
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card
            theme={rocTheme}
            title={t("vehicleDetail.freshnessTitle", locale)}
          >
            <RocDualFreshness
              telemetry={vehicle.telemetryFreshness}
              regulatory={vehicle.regulatoryFreshness}
              locale={locale}
            />
            <div style={{ marginTop: 12 }}>
              <Banner
                theme={rocTheme}
                tone="warn"
                icon="warn"
                body={t("vehicleDetail.freshnessWarn", locale)}
              />
            </div>
          </Card>
          <Card
            theme={rocTheme}
            title={t("vehicleDetail.allowedTitle", locale)}
          >
            <DL
              theme={rocTheme}
              cols={2}
              items={[
                {
                  k: t("vehicleDetail.allowed.area", locale),
                  v: vehicle.areaLabel,
                },
                {
                  k: t("vehicleDetail.allowed.route", locale),
                  v: vehicle.approvedRouteLabel,
                  mono: true,
                },
                {
                  k: t("vehicleDetail.allowed.state", locale),
                  v: t(`state.${resolveVehicleStateKey(vehicle)}`, locale),
                },
                {
                  k: t("vehicleDetail.allowed.speed", locale),
                  v: `${vehicle.speedKmh} km/h`,
                  mono: true,
                },
              ]}
            />
            <div style={{ marginTop: 10 }}>
              <Banner
                theme={rocTheme}
                tone="info"
                icon="lock"
                body={t("vehicleDetail.allowedBody", locale)}
              />
            </div>
          </Card>
          <Card
            theme={rocTheme}
            title={t("vehicleDetail.evidenceTitle", locale)}
            subtitle={t("vehicleDetail.evidenceSubtitle", locale)}
            padding={0}
          >
            <Table
              theme={rocTheme}
              columns={evidenceColumns}
              rows={data.evidenceFiles}
            />
          </Card>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card
            theme={rocTheme}
            title={t("vehicleDetail.integrationTitle", locale)}
            subtitle={t("vehicleDetail.integrationSubtitle", locale)}
          >
            <DL
              theme={rocTheme}
              cols={1}
              items={[
                {
                  k: t("vehicleDetail.integration.status", locale),
                  v: (
                    <Pill
                      theme={rocTheme}
                      tone={providerDown ? "warn" : "success"}
                      dot
                    >
                      {providerDown
                        ? t("providerStatus.degraded", locale)
                        : t("providerStatus.connected", locale)}
                    </Pill>
                  ),
                },
                {
                  k: t("vehicleDetail.integration.schema", locale),
                  v: "v1.2 (capability)",
                  mono: true,
                },
                {
                  k: t("vehicleDetail.integration.footage", locale),
                  v: t("vehicleDetail.integration.footageValue", locale),
                },
              ]}
            />
            <div style={{ marginTop: 8 }}>
              <RocEvidenceTag
                source={
                  providerDown ? "not_exposed_by_provider" : "tesla_provided"
                }
                locale={locale}
              />
            </div>
          </Card>
          <Card
            theme={rocTheme}
            title={t("vehicleDetail.actionsTitle", locale)}
            subtitle={t("vehicleDetail.actionsSubtitle", locale)}
          >
            {actionItems.length > 0 ? (
              <RocActionRail
                items={actionItems}
                labels={{
                  invoke: t("actions.invoke", locale),
                  pending: t("actions.pending", locale),
                  tracking: t("actions.tracking", locale),
                  audit: t("actions.audit", locale),
                  disabled: t("actions.disabled", locale),
                  failed: t("actions.failed", locale),
                }}
              />
            ) : (
              <Banner
                theme={rocTheme}
                tone="info"
                icon="info"
                body={t("vehicleDetail.noActions", locale)}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
