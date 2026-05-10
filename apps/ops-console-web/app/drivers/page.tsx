import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  DriverEligibilityBlockReason,
  DriverLocationSnapshot,
  DriverRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
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

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;

const detailLinkStyle: CSSProperties = {
  color: "#d9485f",
  fontWeight: 700,
  textDecoration: "none",
};

const pageLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.65fr) minmax(280px, 0.95fr)",
  gap: "16px",
  alignItems: "start",
};

const attentionListStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const attentionItemStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "12px 14px",
  border: "1px solid #dbe2ea",
  borderRadius: "14px",
  background: "#f8fafc",
};

function summarizeBlockedReasons(
  reasons: DriverEligibilityBlockReason[],
  locale: "en" | "zh",
): string {
  if (!reasons || reasons.length === 0) {
    return t("drivers.list.eligibilityClear", locale);
  }
  return reasons.map((reason) => formatOpsCodeLabel(locale, reason)).join("、");
}

function isLocationStale(
  snapshot: DriverLocationSnapshot | undefined,
): boolean {
  if (!snapshot) {
    return true;
  }
  const recorded = new Date(snapshot.recordedAt).getTime();
  if (!Number.isFinite(recorded)) {
    return true;
  }
  return Date.now() - recorded > STALE_LOCATION_THRESHOLD_MS;
}

function workStateTone(workState: DriverRegistryRecord["workState"]) {
  if (workState === "available") return "success" as const;
  if (workState === "incident_hold" || workState === "suspended") {
    return "danger" as const;
  }
  if (workState === "offline") return "neutral" as const;
  return "info" as const;
}

function locationTone(state: "live" | "stale" | "missing" | "unknown") {
  if (state === "live") return "success" as const;
  if (state === "unknown") return "neutral" as const;
  return "warning" as const;
}

function getLocationState(
  snapshot: DriverLocationSnapshot | undefined,
  locationsError: string | null,
) {
  if (locationsError) return "unknown" as const;
  if (!snapshot) return "missing" as const;
  if (isLocationStale(snapshot)) return "stale" as const;
  return "live" as const;
}

export default async function DriversPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  let drivers: DriverRegistryRecord[] = [];
  let locations: DriverLocationSnapshot[] = [];
  let registryError: string | null = null;
  let locationsError: string | null = null;

  try {
    drivers = await client.listDrivers();
  } catch (error) {
    registryError =
      error instanceof Error ? error.message : t("common.unknown", locale);
  }

  try {
    locations = await client.listDriverLocations();
  } catch (error) {
    locationsError =
      error instanceof Error ? error.message : t("common.unknown", locale);
  }

  const locationByDriver = new Map<string, DriverLocationSnapshot>();
  for (const snapshot of locations) {
    locationByDriver.set(snapshot.driverId, snapshot);
  }

  const dispatchEligibleCount = drivers.filter(
    (driver) => driver.dispatchEligible,
  ).length;
  const blockedCount = drivers.filter(
    (driver) => driver.eligibilityBlockedReasons.length > 0,
  ).length;
  const liveLocationCount = drivers.filter((driver) => {
    const snapshot = locationByDriver.get(driver.driverId);
    return snapshot && !isLocationStale(snapshot);
  }).length;
  const staleLocationCount = drivers.filter((driver) => {
    const snapshot = locationByDriver.get(driver.driverId);
    return snapshot ? isLocationStale(snapshot) : false;
  }).length;
  const onShiftCount = drivers.filter(
    (driver) => driver.workState !== "offline",
  ).length;
  const attentionDrivers = drivers.filter((driver) => {
    const snapshot = locationByDriver.get(driver.driverId);
    const state = getLocationState(snapshot, locationsError);
    return (
      !driver.dispatchEligible ||
      !driver.licensesValid ||
      state === "stale" ||
      state === "missing"
    );
  });

  return (
    <div style={pageLayoutStyle}>
      <PageHeader
        eyebrow={locale === "en" ? "Master data" : "主資料"}
        title={t("drivers.title", locale)}
        subtitle={
          locale === "en"
            ? "Roster, shift state, dispatch eligibility, and location freshness in one view."
            : "將名冊、班次狀態、派遣資格與定位新鮮度集中在同一個總覽。"
        }
        meta={[
          {
            label: locale === "en" ? "Drivers" : "司機數",
            value: drivers.length,
          },
          {
            label: locale === "en" ? "Eligible" : "可派",
            value: dispatchEligibleCount,
            tone: "success",
          },
          {
            label: locale === "en" ? "Attention" : "待關注",
            value: attentionDrivers.length,
            tone: attentionDrivers.length > 0 ? "warning" : "success",
          },
        ]}
      />

      <KpiRow minWidth="170px">
        <KpiCard
          label={locale === "en" ? "Dispatch eligible" : "可派司機"}
          value={dispatchEligibleCount}
          detail={
            locale === "en"
              ? `${drivers.length - dispatchEligibleCount} blocked by gates`
              : `${drivers.length - dispatchEligibleCount} 位仍受 gate 限制`
          }
          tone="success"
        />
        <KpiCard
          label={locale === "en" ? "On shift" : "在班司機"}
          value={onShiftCount}
          detail={
            locale === "en"
              ? `${drivers.length - onShiftCount} offline or paused`
              : `${drivers.length - onShiftCount} 位離線或暫停`
          }
          tone="ops"
        />
        <KpiCard
          label={locale === "en" ? "Live location" : "定位正常"}
          value={liveLocationCount}
          detail={
            locale === "en"
              ? `${staleLocationCount} stale snapshots`
              : `${staleLocationCount} 筆定位已逾時`
          }
          tone={staleLocationCount > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={locale === "en" ? "Blocked reasons" : "資格阻擋"}
          value={blockedCount}
          detail={
            locale === "en"
              ? "Dispatch gates requiring manual follow-up"
              : "需要人工跟進的派遣 gate"
          }
          tone={blockedCount > 0 ? "warning" : "neutral"}
        />
      </KpiRow>

      {registryError ? (
        <CalloutBanner
          tone="danger"
          title={t("drivers.list.registryUnavailable", locale)}
          description={registryError}
        />
      ) : null}

      {locationsError ? (
        <CalloutBanner
          tone="warning"
          title={t("drivers.list.locationsUnavailable", locale)}
          description={locationsError}
        />
      ) : staleLocationCount > 0 ? (
        <CalloutBanner
          tone="warning"
          title={
            locale === "en"
              ? `${staleLocationCount} drivers have stale location telemetry`
              : `${staleLocationCount} 位司機的定位 telemetry 已逾時`
          }
          description={
            locale === "en"
              ? "Dispatch can continue, but ETA confidence and incident trace quality are reduced until devices report again."
              : "仍可繼續派遣，但在裝置重新回報前，ETA 信心與 incident trace 品質都會下降。"
          }
        />
      ) : null}

      <div style={splitGridStyle}>
        <DataViewCard
          title={t("drivers.title", locale)}
          subtitle={t("drivers.subtitle", locale, { count: drivers.length })}
          tone="ops"
          density="compact"
          summary={t("drivers.registrySummary", locale, {
            eligible: dispatchEligibleCount,
            blocked: blockedCount,
            live: liveLocationCount,
            stale: staleLocationCount,
          })}
          filters={
            <DataFilterBar
              ariaLabel={locale === "en" ? "Driver views" : "司機檢視"}
              value="all"
              filters={[
                {
                  value: "all",
                  label: locale === "en" ? "All" : "全部",
                  count: drivers.length,
                  tone: "ops",
                },
                {
                  value: "eligible",
                  label: locale === "en" ? "Eligible" : "可派",
                  count: dispatchEligibleCount,
                  tone: "success",
                },
                {
                  value: "shift",
                  label: locale === "en" ? "On shift" : "在班",
                  count: onShiftCount,
                  tone: "info",
                },
                {
                  value: "attention",
                  label: locale === "en" ? "Attention" : "待關注",
                  count: attentionDrivers.length,
                  tone: attentionDrivers.length > 0 ? "warning" : "neutral",
                },
              ]}
            />
          }
          footer={t("drivers.registryFooter", locale)}
        >
          <DataTable
            density="compact"
            tone="ops"
            columns={[
              { label: t("drivers.col.driverId", locale), width: "220px" },
              { label: t("drivers.col.shift", locale), width: "150px" },
              {
                label: t("drivers.col.dispatchEligible", locale),
                width: "130px",
              },
              { label: t("drivers.col.eligibilityBlocked", locale) },
              { label: t("drivers.col.location", locale), width: "130px" },
              { label: t("common.actions", locale), width: "110px" },
            ]}
            empty={t("drivers.empty", locale)}
          >
            {drivers.map((driver) => {
              const snapshot = locationByDriver.get(driver.driverId);
              const locationState = getLocationState(snapshot, locationsError);
              const locationLabel =
                locationState === "unknown"
                  ? t("drivers.list.locationUnknown", locale)
                  : locationState === "missing"
                    ? t("drivers.list.locationMissing", locale)
                    : locationState === "stale"
                      ? t("drivers.list.locationStale", locale)
                      : t("drivers.list.locationLive", locale);

              return (
                <Tr key={driver.driverId}>
                  <Td density="compact">
                    <DataCellStack
                      primary={<strong>{driver.driverId}</strong>}
                      secondary={driver.name}
                      tertiary={driver.supportedServiceBuckets.join(" · ")}
                    />
                  </Td>
                  <Td density="compact">
                    <StatusChip
                      tone={workStateTone(driver.workState)}
                      authorityLabel={locale === "zh" ? "班次" : "shift"}
                      label={formatOpsCodeLabel(locale, driver.workState)}
                    />
                  </Td>
                  <Td density="compact">
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      <StatusChip
                        tone={driver.dispatchEligible ? "success" : "danger"}
                        authorityLabel={locale === "zh" ? "派遣" : "dispatch"}
                        label={
                          driver.dispatchEligible
                            ? t("common.yes", locale)
                            : t("common.no", locale)
                        }
                      />
                      <StatusChip
                        tone={driver.licensesValid ? "success" : "warning"}
                        authorityLabel={locale === "zh" ? "證照" : "license"}
                        label={
                          driver.licensesValid
                            ? t("common.valid", locale)
                            : t("common.invalid", locale)
                        }
                      />
                    </div>
                  </Td>
                  <Td
                    density="compact"
                    muted={driver.eligibilityBlockedReasons.length === 0}
                  >
                    <DataCellStack
                      primary={summarizeBlockedReasons(
                        driver.eligibilityBlockedReasons,
                        locale,
                      )}
                      secondary={
                        snapshot?.recordedAt
                          ? t(
                              "driverDetail.summary.locationRecordedAt",
                              locale,
                              {
                                recordedAt: snapshot.recordedAt,
                              },
                            )
                          : undefined
                      }
                    />
                  </Td>
                  <Td density="compact">
                    <StatusChip
                      tone={locationTone(locationState)}
                      authorityLabel={locale === "zh" ? "定位" : "location"}
                      label={locationLabel}
                    />
                  </Td>
                  <Td density="compact">
                    <Link
                      href={`/drivers/${encodeURIComponent(driver.driverId)}`}
                      style={detailLinkStyle}
                      aria-label={getOpsLabel(locale, "openDriverDetail", {
                        driverId: driver.driverId,
                      })}
                    >
                      {locale === "en" ? "Open" : "查看"}
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        </DataViewCard>

        <DataViewCard
          title={locale === "en" ? "Dispatch attention" : "派遣注意事項"}
          subtitle={
            locale === "en"
              ? "Drivers blocked by eligibility, licensing, or stale telemetry."
              : "彙整因資格、證照或定位逾時而需要追蹤的司機。"
          }
          tone="warning"
          density="compact"
          summary={
            locale === "en"
              ? "Highest-risk rows are surfaced here before the full registry scan."
              : "先集中顯示最高風險列，再往下檢視完整名冊。"
          }
        >
          <div style={attentionListStyle}>
            {attentionDrivers.slice(0, 5).map((driver) => {
              const snapshot = locationByDriver.get(driver.driverId);
              const locationState = getLocationState(snapshot, locationsError);

              return (
                <div key={driver.driverId} style={attentionItemStyle}>
                  <DataCellStack
                    primary={<strong>{driver.name}</strong>}
                    secondary={driver.driverId}
                    tertiary={
                      locale === "en"
                        ? `Shift ${formatOpsCodeLabel(locale, driver.workState)}`
                        : `班次 ${formatOpsCodeLabel(locale, driver.workState)}`
                    }
                  />
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                  >
                    {!driver.dispatchEligible ? (
                      <StatusChip
                        tone="warning"
                        authorityLabel={locale === "zh" ? "派遣" : "dispatch"}
                        label={locale === "en" ? "Blocked" : "受阻"}
                      />
                    ) : null}
                    {!driver.licensesValid ? (
                      <StatusChip
                        tone="warning"
                        authorityLabel={locale === "zh" ? "證照" : "license"}
                        label={locale === "en" ? "Review" : "需複核"}
                      />
                    ) : null}
                    <StatusChip
                      tone={locationTone(locationState)}
                      authorityLabel={locale === "zh" ? "定位" : "location"}
                      label={
                        locationState === "live"
                          ? locale === "en"
                            ? "Live"
                            : "正常"
                          : locationState === "stale"
                            ? locale === "en"
                              ? "Stale"
                              : "逾時"
                            : locationState === "missing"
                              ? locale === "en"
                                ? "Missing"
                                : "缺失"
                              : locale === "en"
                                ? "Unknown"
                                : "未知"
                      }
                    />
                  </div>
                  <span style={{ color: "#64748b", fontSize: "12px" }}>
                    {summarizeBlockedReasons(
                      driver.eligibilityBlockedReasons,
                      locale,
                    )}
                  </span>
                </div>
              );
            })}
            {attentionDrivers.length === 0 ? (
              <CalloutBanner
                tone="success"
                title={
                  locale === "en"
                    ? "No attention items right now"
                    : "目前沒有待關注項目"
                }
                description={
                  locale === "en"
                    ? "All visible drivers are dispatchable, licensed, and reporting fresh telemetry."
                    : "目前列表中的司機皆可派遣、證照有效，且定位 telemetry 新鮮。"
                }
              />
            ) : null}
          </div>
        </DataViewCard>
      </div>
    </div>
  );
}
