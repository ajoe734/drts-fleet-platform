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
  Badge,
  Card,
  CardBody,
  DataTable,
  PageHeader,
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

      <Card>
        <CardBody>
          <DataTable
            columns={[
              { label: t("drivers.col.driverId", locale) },
              { label: t("drivers.col.name", locale) },
              { label: t("drivers.col.shift", locale) },
              { label: t("drivers.col.dispatchEligible", locale) },
              { label: t("drivers.col.eligibilityBlocked", locale) },
              { label: t("drivers.col.licenseValid", locale) },
              { label: t("drivers.col.location", locale) },
              { label: t("common.actions", locale) },
            ]}
            empty={t("drivers.empty", locale)}
          >
            {drivers.map((driver) => {
              const snapshot = locationByDriver.get(driver.driverId);
              const stale = isLocationStale(snapshot);
              return (
                <Tr key={driver.driverId}>
                  <Td mono>{driver.driverId}</Td>
                  <Td>{driver.name}</Td>
                  <Td>
                    <Badge
                      variant={
                        driver.workState === "available"
                          ? "green"
                          : driver.workState === "incident_hold" ||
                              driver.workState === "suspended"
                            ? "red"
                            : driver.workState === "offline"
                              ? "gray"
                              : "blue"
                      }
                    >
                      {formatOpsCodeLabel(locale, driver.workState)}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={driver.dispatchEligible ? "green" : "red"}>
                      {driver.dispatchEligible
                        ? t("common.yes", locale)
                        : t("common.no", locale)}
                    </Badge>
                  </Td>
                  <Td muted={driver.eligibilityBlockedReasons.length === 0}>
                    {summarizeBlockedReasons(
                      driver.eligibilityBlockedReasons,
                      locale,
                    )}
                  </Td>
                  <Td>
                    <Badge variant={driver.licensesValid ? "green" : "red"}>
                      {driver.licensesValid
                        ? t("common.valid", locale)
                        : t("common.invalid", locale)}
                    </Badge>
                  </Td>
                  <Td>
                    {locationsError ? (
                      <Badge variant="gray">
                        {t("drivers.list.locationUnknown", locale)}
                      </Badge>
                    ) : !snapshot ? (
                      <Badge variant="orange">
                        {t("drivers.list.locationMissing", locale)}
                      </Badge>
                    ) : stale ? (
                      <Badge variant="orange">
                        {t("drivers.list.locationStale", locale)}
                      </Badge>
                    ) : (
                      <Badge variant="green">
                        {t("drivers.list.locationLive", locale)}
                      </Badge>
                    )}
                  </Td>
                  <Td>
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
        </CardBody>
      </Card>
    </>
  );
}
