import Link from "next/link";
import type { CSSProperties } from "react";
import type { VehicleRegistryRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  DataCellStack,
  DataTable,
  DataViewCard,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

function lifecycleTone(status: string) {
  if (status === "active") return "success" as const;
  if (
    status === "expired" ||
    status === "terminated" ||
    status === "revoked" ||
    status === "rejected" ||
    status === "completed"
  ) {
    return "danger" as const;
  }
  return "warning" as const;
}

const detailLinkStyle: CSSProperties = {
  color: "#1d4ed8",
  fontWeight: 600,
  textDecoration: "none",
};

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

  const warningVehicles = vehicles.filter(
    (vehicle) => vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
  );
  const dispatchableCount = vehicles.filter(
    (vehicle) => vehicle.dispatchableFlag,
  ).length;
  const offboardingCount = vehicles.filter(
    (vehicle) => vehicle.supplyLifecycle.offboarding.status !== "none",
  ).length;
  const debrandingPendingCount = vehicles.filter(
    (vehicle) =>
      vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending",
  ).length;

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

      <DataViewCard
        title={t("vehicles.title", locale)}
        subtitle={t("vehicles.subtitle", locale, { count: vehicles.length })}
        tone="info"
        density="compact"
        summary={t("vehicles.registrySummary", locale, {
          dispatchable: dispatchableCount,
          blocked: warningVehicles.length,
          offboarding: offboardingCount,
          debranding: debrandingPendingCount,
        })}
      >
        <DataTable
          density="compact"
          tone="info"
          columns={[
            { label: t("vehicles.col.vehicleId", locale), width: "220px" },
            { label: t("vehicles.col.operatingArea", locale), width: "160px" },
            { label: t("vehicles.lifecycle", locale), width: "280px" },
            { label: t("vehicles.col.dispatchable", locale), width: "220px" },
            { label: t("vehicles.col.lastChange", locale) },
          ]}
          empty={t("vehicles.empty", locale)}
        >
          {vehicles.map((vehicle) => (
            <Tr key={vehicle.vehicleId}>
              <Td density="compact">
                <DataCellStack
                  primary={
                    <Link
                      href={`/vehicles/${encodeURIComponent(vehicle.vehicleId)}`}
                      style={detailLinkStyle}
                    >
                      {vehicle.vehicleId}
                    </Link>
                  }
                  secondary={vehicle.plateNo}
                  tertiary={vehicle.supportedServiceBuckets.join(" · ")}
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={vehicle.operatingArea}
                  secondary={
                    vehicle.exclusivityApproved
                      ? t("vehicles.exclusivityApproved", locale)
                      : t("vehicles.exclusivityPending", locale)
                  }
                />
              </Td>
              <Td density="compact">
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <StatusChip
                    tone={lifecycleTone(
                      vehicle.supplyLifecycle.contract.lifecycleStatus,
                    )}
                    authorityLabel={locale === "zh" ? "合約" : "contract"}
                    label={formatOpsCodeLabel(
                      locale,
                      vehicle.supplyLifecycle.contract.lifecycleStatus,
                    )}
                  />
                  <StatusChip
                    tone={lifecycleTone(
                      vehicle.supplyLifecycle.insurance.lifecycleStatus,
                    )}
                    authorityLabel={locale === "zh" ? "保險" : "insurance"}
                    label={formatOpsCodeLabel(
                      locale,
                      vehicle.supplyLifecycle.insurance.lifecycleStatus,
                    )}
                  />
                  <StatusChip
                    tone={lifecycleTone(
                      vehicle.supplyLifecycle.offboarding.status,
                    )}
                    authorityLabel={locale === "zh" ? "退場" : "offboarding"}
                    label={formatOpsCodeLabel(
                      locale,
                      vehicle.supplyLifecycle.offboarding.status,
                    )}
                  />
                </div>
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={
                    <StatusChip
                      tone={vehicle.dispatchableFlag ? "success" : "warning"}
                      authorityLabel={locale === "zh" ? "派遣" : "dispatch"}
                      label={
                        vehicle.dispatchableFlag
                          ? t("common.yes", locale)
                          : t("common.no", locale)
                      }
                    />
                  }
                  secondary={
                    vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
                      ? vehicle.supplyLifecycle.dispatch.blockedReasons
                          .map((reason) => formatOpsCodeLabel(locale, reason))
                          .join(" / ")
                      : t("vehicles.noneBlocked", locale)
                  }
                  tertiary={
                    vehicle.supplyLifecycle.offboarding.debrandingStatus ===
                    "pending"
                      ? t("vehicles.debrandingPending", locale)
                      : undefined
                  }
                />
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={
                    vehicle.supplyLifecycle.lastTrace
                      ? vehicle.supplyLifecycle.lastTrace.message
                      : t("vehicles.lastChangeNone", locale)
                  }
                  secondary={
                    vehicle.supplyLifecycle.lastTrace
                      ? new Date(
                          vehicle.supplyLifecycle.lastTrace.occurredAt,
                        ).toLocaleString(locale === "zh" ? "zh-TW" : "en-US")
                      : undefined
                  }
                />
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>
    </>
  );
}
