import {
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import {
  FX_FLEET_VEHICLES,
  type FleetVehicle,
} from "@/lib/fleet-portal-fixtures";
import { SvcChips } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetVehiclesPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();

  const columns: CanvasTableColumn<FleetVehicle>[] = [
    {
      h: "PLATE",
      w: 120,
      mono: true,
      r: (r) => <span style={{ fontWeight: 600 }}>{r.plate}</span>,
    },
    { h: "MODEL", k: "model", w: 160 },
    { h: "YEAR", k: "year", w: 70, mono: true, align: "right" },
    { h: "DRIVER", k: "driver", w: 100 },
    {
      h: "可接服務 · vehicle eligibility",
      w: 260,
      r: (r) => <SvcChips theme={theme} list={r.svc} />,
    },
    { h: "INSURANCE", k: "insurance", w: 120, mono: true },
    {
      h: "INSPECTION",
      w: 120,
      r: (r) =>
        r.inspection === "ok" ? (
          <CanvasPill theme={theme} tone="success">
            ok
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="warn" dot>
            {r.inspection}
          </CanvasPill>
        ),
    },
    {
      h: "STATUS",
      w: 120,
      r: (r) => (
        <CanvasPill
          theme={theme}
          tone={r.status === "active" ? "success" : "warn"}
          dot
        >
          {r.status}
        </CanvasPill>
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("vehicles.title", locale)}
        subtitle={t("vehicles.subtitle", locale)}
        actions={
          <>
            <CanvasBtn theme={theme} icon="filter">
              {t("common.filter", locale)}
            </CanvasBtn>
            <CanvasBtn theme={theme} variant="primary" icon="plus">
              {t("vehicles.add", locale)}
            </CanvasBtn>
          </>
        }
      />
      <div style={{ padding: 24 }}>
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable
            theme={theme}
            columns={columns}
            rows={FX_FLEET_VEHICLES}
          />
        </CanvasCard>
      </div>
    </>
  );
}
