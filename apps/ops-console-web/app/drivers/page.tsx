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
  DataCellStack,
  DataTable,
  DataViewCard,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;

const detailLinkStyle: CSSProperties = {
  color: "#1d4ed8",
  fontWeight: 600,
  textDecoration: "none",
};

const errorBannerStyle: CSSProperties = {
  background: "#fee2e2",
  border: "1px solid #fca5a5",
  borderRadius: "8px",
  padding: "12px 16px",
  color: "#b91c1c",
  fontSize: "13.5px",
  marginBottom: "20px",
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

  return (
    <>
      <PageHeader
        title={t("drivers.title", locale)}
        subtitle={t("drivers.subtitle", locale, { count: drivers.length })}
      />

      {registryError && (
        <div style={errorBannerStyle}>
          <strong>{t("drivers.list.registryUnavailable", locale)}</strong>{" "}
          {registryError}
        </div>
      )}

      {locationsError && (
        <div style={errorBannerStyle}>
          <strong>{t("drivers.list.locationsUnavailable", locale)}</strong>{" "}
          {locationsError}
        </div>
      )}

      <DataViewCard
        title={t("drivers.title", locale)}
        subtitle={t("drivers.subtitle", locale, { count: drivers.length })}
        tone="info"
        density="compact"
        summary={t("drivers.registrySummary", locale, {
          eligible: dispatchEligibleCount,
          blocked: blockedCount,
          live: liveLocationCount,
          stale: staleLocationCount,
        })}
        footer={t("drivers.registryFooter", locale)}
      >
        <DataTable
          density="compact"
          tone="info"
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
            const locationState = locationsError
              ? "unknown"
              : !snapshot
                ? "missing"
                : isLocationStale(snapshot)
                  ? "stale"
                  : "live";

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
                        ? t("driverDetail.summary.locationRecordedAt", locale, {
                            recordedAt: snapshot.recordedAt,
                          })
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
                    {t("drivers.list.openDetail", locale)}
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </DataViewCard>
    </>
  );
}
