import type { VehicleRegistryRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { PageHeader } from "@drts/ui-web";
import { Card } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

function lifecycleBadgeVariant(status: string) {
  if (status === "active") return "green" as const;
  if (
    status === "expired" ||
    status === "terminated" ||
    status === "revoked" ||
    status === "rejected"
  ) {
    return "red" as const;
  }
  return "yellow" as const;
}

export default async function VehiclesPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  let vehicles: VehicleRegistryRecord[] = [];
  let error: string | null = null;

  try {
    vehicles = await client.listVehicles();
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  return (
    <>
      <PageHeader
        title={t("vehicles.title", locale)}
        subtitle={t("vehicles.subtitle", locale, { count: vehicles.length })}
      />

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "8px",
            padding: "12px 16px",
            color: "#b91c1c",
            fontSize: "13.5px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      <Card>
        <DataTable
          columns={[
            { label: t("vehicles.col.vehicleId", locale) },
            { label: t("vehicles.col.plate", locale) },
            { label: t("vehicles.col.operatingArea", locale) },
            { label: t("vehicles.col.contract", locale) },
            { label: t("vehicles.col.insurance", locale) },
            { label: t("vehicles.col.exclusivity", locale) },
            { label: t("vehicles.col.dispatchable", locale) },
            { label: t("vehicles.col.blockedBy", locale) },
            { label: t("vehicles.col.lastChange", locale) },
          ]}
          empty={t("vehicles.empty", locale)}
        >
          {vehicles.map((v) => (
            <Tr key={v.vehicleId}>
              <Td mono>{v.vehicleId}</Td>
              <Td>{v.plateNo}</Td>
              <Td>{v.operatingArea}</Td>
              <Td>
                <Badge
                  variant={lifecycleBadgeVariant(
                    v.supplyLifecycle.contract.lifecycleStatus,
                  )}
                >
                  {formatOpsCodeLabel(
                    locale,
                    v.supplyLifecycle.contract.lifecycleStatus,
                  )}
                </Badge>
              </Td>
              <Td>
                <Badge
                  variant={lifecycleBadgeVariant(
                    v.supplyLifecycle.insurance.lifecycleStatus,
                  )}
                >
                  {formatOpsCodeLabel(
                    locale,
                    v.supplyLifecycle.insurance.lifecycleStatus,
                  )}
                </Badge>
              </Td>
              <Td>
                <Badge
                  variant={lifecycleBadgeVariant(
                    v.supplyLifecycle.exclusivity.lifecycleStatus,
                  )}
                >
                  {formatOpsCodeLabel(
                    locale,
                    v.supplyLifecycle.exclusivity.lifecycleStatus,
                  )}
                </Badge>
              </Td>
              <Td>
                <Badge variant={v.dispatchableFlag ? "green" : "gray"}>
                  {v.dispatchableFlag
                    ? t("common.yes", locale)
                    : t("common.no", locale)}
                </Badge>
              </Td>
              <Td>
                {v.supplyLifecycle.dispatch.blockedReasons.length > 0
                  ? v.supplyLifecycle.dispatch.blockedReasons
                      .map((reason) => formatOpsCodeLabel(locale, reason))
                      .join(" / ")
                  : t("vehicles.noneBlocked", locale)}
              </Td>
              <Td>
                {v.supplyLifecycle.lastTrace
                  ? `${v.supplyLifecycle.lastTrace.message} (${new Date(
                      v.supplyLifecycle.lastTrace.occurredAt,
                    ).toLocaleString()})`
                  : t("vehicles.lastChangeNone", locale)}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
