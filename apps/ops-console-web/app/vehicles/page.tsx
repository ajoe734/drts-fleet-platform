import type { CSSProperties } from "react";
import type { VehicleRegistryRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

const pageLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
  gap: "16px",
  alignItems: "start",
};

const attentionItemStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "12px 14px",
  border: "1px solid #dbe2ea",
  borderRadius: "14px",
  background: "#f8fafc",
};

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
  const offboardingVehicles = vehicles.filter(
    (vehicle) => vehicle.supplyLifecycle.offboarding.status !== "none",
  );
  const offboardingCount = offboardingVehicles.length;
  const debrandingPendingVehicles = vehicles.filter(
    (vehicle) =>
      vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending",
  );
  const debrandingPendingCount = debrandingPendingVehicles.length;
  const attentionVehicles = vehicles.filter(
    (vehicle) =>
      !vehicle.dispatchableFlag ||
      vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0 ||
      vehicle.supplyLifecycle.offboarding.status !== "none" ||
      vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending",
  );

  return (
    <div style={pageLayoutStyle}>
      <PageHeader
        eyebrow={locale === "en" ? "Master data" : "主資料"}
        title={t("vehicles.title", locale)}
        subtitle={
          locale === "en"
            ? "Dispatchability, contract coverage, insurance state, and offboarding debt in one registry."
            : "把派遣可用性、合約覆蓋、保險狀態與退場債務放在同一份車輛名冊。"
        }
        meta={[
          {
            label: locale === "en" ? "Vehicles" : "車輛數",
            value: vehicles.length,
          },
          {
            label: locale === "en" ? "Dispatchable" : "可派",
            value: dispatchableCount,
            tone: "success",
          },
          {
            label: locale === "en" ? "Offboarding" : "退場中",
            value: offboardingCount,
            tone: offboardingCount > 0 ? "warning" : "neutral",
          },
        ]}
      />

      <KpiRow minWidth="170px">
        <KpiCard
          label={locale === "en" ? "Dispatchable" : "可派車輛"}
          value={dispatchableCount}
          detail={
            locale === "en"
              ? `${vehicles.length - dispatchableCount} still blocked`
              : `${vehicles.length - dispatchableCount} 台仍被 gate 擋住`
          }
          tone="success"
        />
        <KpiCard
          label={locale === "en" ? "Blocked reasons" : "阻擋原因"}
          value={warningVehicles.length}
          detail={
            locale === "en"
              ? "Missing readiness across dispatch gates"
              : "派遣 gate 尚未準備好的車輛"
          }
          tone={warningVehicles.length > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={locale === "en" ? "Offboarding" : "退場處理"}
          value={offboardingCount}
          detail={
            locale === "en"
              ? `${debrandingPendingCount} with debrand pending`
              : `${debrandingPendingCount} 台仍待去識別`
          }
          tone={offboardingCount > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={locale === "en" ? "Attention queue" : "關注清單"}
          value={attentionVehicles.length}
          detail={
            locale === "en"
              ? "Rows needing manual supply follow-up"
              : "需要人工追蹤供給狀態的列"
          }
          tone={attentionVehicles.length > 0 ? "danger" : "success"}
        />
      </KpiRow>

      {error ? (
        <CalloutBanner
          tone="danger"
          title={t("vehicles.title", locale)}
          description={error}
        />
      ) : debrandingPendingCount > 0 ? (
        <CalloutBanner
          tone="warning"
          title={
            locale === "en"
              ? `${debrandingPendingCount} vehicles still need debranding`
              : `${debrandingPendingCount} 台車輛仍待去識別`
          }
          description={
            locale === "en"
              ? "These units are already on the offboarding path. Confirm asset removal and partner handback before the contract closes."
              : "這些車輛已進入退場流程，需在合約關閉前確認資產拆除與 partner 交接。"
          }
        />
      ) : null}

      <div style={splitGridStyle}>
        <DataViewCard
          title={t("vehicles.title", locale)}
          subtitle={t("vehicles.subtitle", locale, { count: vehicles.length })}
          tone="ops"
          density="compact"
          summary={t("vehicles.registrySummary", locale, {
            dispatchable: dispatchableCount,
            blocked: warningVehicles.length,
            offboarding: offboardingCount,
            debranding: debrandingPendingCount,
          })}
          filters={
            <DataFilterBar
              ariaLabel={locale === "en" ? "Vehicle views" : "車輛檢視"}
              value="all"
              filters={[
                {
                  value: "all",
                  label: locale === "en" ? "All" : "全部",
                  count: vehicles.length,
                  tone: "ops",
                },
                {
                  value: "dispatchable",
                  label: locale === "en" ? "Dispatchable" : "可派",
                  count: dispatchableCount,
                  tone: "success",
                },
                {
                  value: "blocked",
                  label: locale === "en" ? "Blocked" : "受阻",
                  count: warningVehicles.length,
                  tone: "warning",
                },
                {
                  value: "offboarding",
                  label: locale === "en" ? "Offboarding" : "退場中",
                  count: offboardingCount,
                  tone: offboardingCount > 0 ? "warning" : "neutral",
                },
              ]}
            />
          }
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: t("vehicles.col.vehicleId", locale), width: "220px" },
              {
                label: t("vehicles.col.operatingArea", locale),
                width: "160px",
              },
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
                    primary={<strong>{vehicle.vehicleId}</strong>}
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

        <DataViewCard
          title={locale === "en" ? "Supply follow-up" : "供給追蹤"}
          subtitle={
            locale === "en"
              ? "Vehicles with offboarding, debranding, or dispatch gate debt."
              : "集中顯示退場、去識別或 dispatch gate 有債務的車輛。"
          }
          tone="warning"
          density="compact"
          summary={
            locale === "en"
              ? "Use this short queue before scanning the full registry."
              : "先從這份短清單處理，再往下查看完整名冊。"
          }
        >
          <div style={{ display: "grid", gap: "10px" }}>
            {attentionVehicles.slice(0, 5).map((vehicle) => (
              <div key={vehicle.vehicleId} style={attentionItemStyle}>
                <DataCellStack
                  primary={<strong>{vehicle.plateNo}</strong>}
                  secondary={vehicle.vehicleId}
                  tertiary={vehicle.operatingArea}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <StatusChip
                    tone={vehicle.dispatchableFlag ? "success" : "warning"}
                    authorityLabel={locale === "zh" ? "派遣" : "dispatch"}
                    label={
                      vehicle.dispatchableFlag
                        ? t("common.yes", locale)
                        : t("common.no", locale)
                    }
                  />
                  {vehicle.supplyLifecycle.offboarding.status !== "none" ? (
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
                  ) : null}
                  {vehicle.supplyLifecycle.offboarding.debrandingStatus ===
                  "pending" ? (
                    <StatusChip
                      tone="warning"
                      authorityLabel={locale === "zh" ? "去識別" : "debrand"}
                      label={locale === "en" ? "Pending" : "待處理"}
                    />
                  ) : null}
                </div>
                <span style={{ color: "#64748b", fontSize: "12px" }}>
                  {vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
                    ? vehicle.supplyLifecycle.dispatch.blockedReasons
                        .map((reason) => formatOpsCodeLabel(locale, reason))
                        .join(" / ")
                    : locale === "en"
                      ? "Primary attention comes from the offboarding track."
                      : "主要注意點來自退場流程。"}
                </span>
              </div>
            ))}
            {attentionVehicles.length === 0 ? (
              <CalloutBanner
                tone="success"
                title={
                  locale === "en"
                    ? "Vehicle supply board is clear"
                    : "車輛供給板目前乾淨"
                }
                description={
                  locale === "en"
                    ? "No vehicles are blocked, offboarding, or waiting on debranding."
                    : "目前沒有車輛處於受阻、退場中或等待去識別的狀態。"
                }
              />
            ) : null}
          </div>
        </DataViewCard>
      </div>
    </div>
  );
}
