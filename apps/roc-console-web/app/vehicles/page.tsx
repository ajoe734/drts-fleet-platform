import Link from "next/link";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { rocTheme } from "@/lib/roc-theme";
import {
  getRocVehiclesPageData,
  type RocAlertViewModel,
  resolveVehicleStateKey,
  resolveVehicleStateTone,
} from "@/lib/roc-page-data";
import {
  RocRefreshBanner,
  RocStatePill,
} from "@/components/roc-screen-primitives";
import {
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  type CanvasTableColumn,
} from "@drts/ui-web";

function resolveIntegrationStatus(
  vehicleId: string,
  alerts: RocAlertViewModel[],
) {
  const vehicleAlerts = alerts.filter((alert) => alert.vehicleId === vehicleId);
  if (vehicleAlerts.some((alert) => alert.severity === "critical")) {
    return { label: "down", tone: "danger" as const };
  }
  if (vehicleAlerts.length > 0) {
    return { label: "degraded", tone: "warn" as const };
  }
  return { label: "connected", tone: "success" as const };
}

export default async function VehiclesPage() {
  const locale = await getServerLocale();
  const data = await getRocVehiclesPageData();

  const columns: CanvasTableColumn<(typeof data.vehicles)[number]>[] = [
    {
      h: t("vehicles.columns.vehicle", locale),
      k: "vehicleId",
      w: 100,
      mono: true,
      r: (row) => (
        <span style={{ color: rocTheme.accent, fontWeight: 700 }}>
          {row.vehicleId}
        </span>
      ),
    },
    { h: t("vehicles.columns.model", locale), k: "model", w: 96 },
    {
      h: t("vehicles.columns.state", locale),
      w: 110,
      r: (row) => (
        <RocStatePill
          stateKey={resolveVehicleStateKey(row)}
          tone={resolveVehicleStateTone(row)}
          locale={locale}
        />
      ),
    },
    {
      h: t("vehicles.columns.integration", locale),
      w: 156,
      r: (row) => {
        const integration = resolveIntegrationStatus(row.vehicleId, data.alerts);
        return (
          <Pill theme={rocTheme} tone={integration.tone} dot>
            {t(`providerStatus.${integration.label}`, locale)}
          </Pill>
        );
      },
    },
    {
      h: t("vehicles.columns.telemetry", locale),
      w: 92,
      r: (row) => (
        <span style={{ color: rocTheme[resolveVehicleStateTone(row)], fontWeight: 600 }}>
          {t(`freshness.${row.telemetryFreshness.dataFreshness}`, locale)}
        </span>
      ),
    },
    {
      h: t("vehicles.columns.regulatory", locale),
      w: 96,
      r: (row) => (
        <span style={{ color: rocTheme.warn, fontWeight: 600 }}>
          {t(`freshness.${row.regulatoryFreshness.dataFreshness}`, locale)}
        </span>
      ),
    },
    {
      h: t("vehicles.columns.operator", locale),
      k: "safetyOperatorLabel",
      w: 110,
    },
    {
      h: "",
      w: 84,
      r: (row) => (
        <Link href={`/vehicles/${row.vehicleId}`} style={{ textDecoration: "none" }}>
          <Btn theme={rocTheme} size="xs" variant="ghost" icon="arrow-right">
            {t("common.detail", locale)}
          </Btn>
        </Link>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        theme={rocTheme}
        title={t("vehicles.title", locale)}
        subtitle={t("vehicles.subtitle", locale)}
      />
      <RocRefreshBanner
        refresh={data.refresh}
        usingFallback={data.usingFallback}
        locale={locale}
      />
      <Card theme={rocTheme} padding={0}>
        <Table theme={rocTheme} columns={columns} rows={data.vehicles} />
      </Card>
    </div>
  );
}
