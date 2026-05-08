import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type {
  DriverEligibilityBlockReason,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  DriverStatementRecord,
  ForwardedOrderRecord,
  PlatformPresenceAdapterStatusRecord,
  PlatformPresenceRecord,
  PlatformPresenceSummary,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import {
  DriverPlatformActions,
  DriverPlatformRowActions,
} from "@/components/driver-platform-actions";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { Badge, DataTable, PageHeader, Td, Tr } from "@drts/ui-web";
import { formatMinorCurrency } from "@/lib/ops-analytics";

type DriverDetailPageProps = {
  params: Promise<{
    driverId: string;
  }>;
};

const STALE_LOCATION_THRESHOLD_MS = 5 * 60 * 1000;
const REAUTH_THRESHOLD_MS = 72 * 60 * 60 * 1000;

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

async function loadWithError<T>(
  loader: () => Promise<T>,
  locale: "en" | "zh",
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : t("common.unknown", locale),
    };
  }
}

const errorBannerStyle: CSSProperties = {
  marginBottom: "1rem",
  padding: "0.75rem 1rem",
  borderRadius: "0.75rem",
  background: "#fef2f2",
  color: "#b91c1c",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  marginBottom: "1rem",
};

const cardStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: "1rem",
  border: "1px solid #e2e8f0",
  background: "#fff",
};

const identityCardStyle: CSSProperties = {
  ...cardStyle,
  background: "#f8fafc",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  marginBottom: "1rem",
};

const summaryCardStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: "0.35rem",
  background: "#f8fafc",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 0.25rem",
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

const metaListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginTop: "0.5rem",
};

const metaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.35rem 0.75rem",
  borderRadius: "999px",
  background: "#e2e8f0",
  color: "#0f172a",
  fontSize: "0.85rem",
};

const sectionStyle: CSSProperties = {
  ...cardStyle,
  marginBottom: "1rem",
};

const noteStyle: CSSProperties = {
  margin: "0.25rem 0 0",
  color: "#475569",
  fontSize: "0.85rem",
};

const footerLinksStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginTop: "1rem",
};

function presenceStatusVariant(
  presence: PlatformPresenceRecord | undefined,
): "green" | "gray" | "red" | "orange" {
  if (!presence) return "gray";
  if (presence.eligibility !== "eligible") return "red";
  if (presence.reauthRequired) return "orange";
  if (presence.status === "online") return "green";
  return "gray";
}

function adapterStatusVariant(
  adapter: PlatformPresenceAdapterStatusRecord | undefined,
): "green" | "yellow" | "red" | "gray" {
  if (!adapter || adapter.status === "unknown") return "gray";
  if (adapter.status === "healthy") return "green";
  if (adapter.status === "degraded") return "yellow";
  return "red";
}

function isLocationStale(
  snapshot: DriverLocationSnapshot | undefined,
): boolean {
  if (!snapshot) return true;
  const recorded = new Date(snapshot.recordedAt).getTime();
  if (!Number.isFinite(recorded)) return true;
  return Date.now() - recorded > STALE_LOCATION_THRESHOLD_MS;
}

function summarizeBlockedReasons(
  reasons: DriverEligibilityBlockReason[],
  locale: "en" | "zh",
): string {
  if (!reasons || reasons.length === 0) {
    return t("drivers.list.eligibilityClear", locale);
  }
  return reasons.map((reason) => formatOpsCodeLabel(locale, reason)).join("、");
}

function tokenExpirySoon(presence: PlatformPresenceRecord): boolean {
  if (!presence.tokenExpiresAt) return false;
  const expires = new Date(presence.tokenExpiresAt).getTime();
  if (!Number.isFinite(expires)) return false;
  return expires <= Date.now() + REAUTH_THRESHOLD_MS;
}

export default async function DriverDetailPage({
  params,
}: DriverDetailPageProps) {
  const { driverId } = await params;
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const [
    driversResult,
    locationsResult,
    presenceResult,
    forwardedOrdersResult,
    statementsResult,
  ] = await Promise.all([
    loadWithError<DriverRegistryRecord[]>(() => client.listDrivers(), locale),
    loadWithError<DriverLocationSnapshot[]>(
      () => client.listDriverLocations(),
      locale,
    ),
    loadWithError<PlatformPresenceSummary>(
      () => client.getPlatformPresence({ driverId }),
      locale,
    ),
    loadWithError<ForwardedOrderRecord[]>(
      () => client.listForwarderOrders(),
      locale,
    ),
    loadWithError<DriverStatementRecord[]>(
      () => client.listDriverStatements(),
      locale,
    ),
  ]);

  if (driversResult.error) {
    return (
      <>
        <PageHeader
          title={t("driverDetail.title", locale)}
          subtitle={getOpsLabel(locale, "driverRegistryUnavailableSubtitle", {
            driverId,
          })}
        />
        <div style={errorBannerStyle}>
          <strong>{t("drivers.list.registryUnavailable", locale)}</strong>{" "}
          {driversResult.error}
        </div>
        <Link href="/drivers">
          <strong>{t("driverDetail.backToList", locale)}</strong>
        </Link>
      </>
    );
  }

  const driver = (driversResult.data ?? []).find(
    (candidate) => candidate.driverId === driverId,
  );
  if (!driver) {
    notFound();
  }

  const locationSnapshot = (locationsResult.data ?? []).find(
    (snapshot) => snapshot.driverId === driverId,
  );
  const stale = isLocationStale(locationSnapshot);

  const presences = presenceResult.data?.presences ?? [];
  const adapterStatusByPlatform = new Map(
    (presenceResult.data?.adapterStatuses ?? []).map((adapter) => [
      adapter.platformCode,
      adapter,
    ]),
  );

  const forwardedOrders = forwardedOrdersResult.data ?? [];
  const driverForwardedOrders = forwardedOrders.filter(
    (order) =>
      order.acceptedDriverId === driverId ||
      order.candidateDriverIds.includes(driverId),
  );
  const relayFailures = driverForwardedOrders.filter(
    (order) =>
      order.lastSyncError !== null || order.manualFallback.required === true,
  );
  const ACTIVE_FORWARDED_STATUSES: ReadonlyArray<
    ForwardedOrderRecord["status"]
  > = ["received", "broadcasted", "accept_pending", "confirmed_by_platform"];
  const activeForwardedOrder = driverForwardedOrders.find(
    (order) =>
      order.acceptedDriverId === driverId &&
      ACTIVE_FORWARDED_STATUSES.includes(order.status),
  );

  const driverStatements = (statementsResult.data ?? [])
    .filter((statement) => statement.driverId === driver.driverId)
    .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth));
  const latestStatement = driverStatements[0] ?? null;

  const onlinePlatforms = presences.filter(
    (presence) => presence.status === "online",
  );
  const reauthPlatforms = presences.filter(
    (presence) => presence.reauthRequired,
  );
  const ineligiblePlatforms = presences.filter(
    (presence) => presence.eligibility !== "eligible",
  );

  const firstPlatformAction = presences.find(
    (presence) => presence.status === "online",
  );

  return (
    <>
      <PageHeader
        title={t("driverDetail.title", locale)}
        subtitle={t("driverDetail.subtitle", locale, {
          name: driver.name,
          driverId: driver.driverId,
        })}
      />

      {presenceResult.error && (
        <div style={errorBannerStyle}>
          <strong>{t("driverDetail.presenceError", locale)}</strong>{" "}
          {presenceResult.error}
        </div>
      )}
      {locationsResult.error && (
        <div style={errorBannerStyle}>
          <strong>{t("driverDetail.locationsError", locale)}</strong>{" "}
          {locationsResult.error}
        </div>
      )}
      {forwardedOrdersResult.error && (
        <div style={errorBannerStyle}>
          <strong>{t("driverDetail.relayError", locale)}</strong>{" "}
          {forwardedOrdersResult.error}
        </div>
      )}

      <section style={heroGridStyle}>
        <div style={identityCardStyle}>
          <p style={eyebrowStyle}>{t("driverDetail.identityLabel", locale)}</p>
          <h2 style={{ margin: 0 }}>{driver.name}</h2>
          <div style={metaListStyle}>
            <span style={metaPillStyle}>{driver.driverId}</span>
            <span style={metaPillStyle}>
              {t("driverDetail.shiftPill", locale, {
                state: formatOpsCodeLabel(locale, driver.workState),
              })}
            </span>
            <span style={metaPillStyle}>
              {driver.licensesValid
                ? t("driverDetail.licensesValid", locale)
                : t("driverDetail.licensesReview", locale)}
            </span>
            <span style={metaPillStyle}>
              {driver.dispatchEligible
                ? t("driverDetail.dispatchEligibleYes", locale)
                : t("driverDetail.dispatchEligibleNo", locale)}
            </span>
          </div>
          {driver.eligibilityBlockedReasons.length > 0 && (
            <p style={noteStyle}>
              <strong>{t("driverDetail.blockedReasons", locale)}:</strong>{" "}
              {summarizeBlockedReasons(
                driver.eligibilityBlockedReasons,
                locale,
              )}
            </p>
          )}
        </div>
        <div style={identityCardStyle}>
          <p style={eyebrowStyle}>{t("driverDetail.actionsLabel", locale)}</p>
          <DriverPlatformActions
            driverId={driver.driverId}
            workState={driver.workState}
            platformCode={firstPlatformAction?.platformCode}
            platformStatus={firstPlatformAction?.status}
          />
          <p style={noteStyle}>{t("driverDetail.actionsNote", locale)}</p>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <div style={summaryCardStyle}>
          <span>{t("driverDetail.summary.platformsBound", locale)}</span>
          <strong style={{ fontSize: "1.4rem" }}>{presences.length}</strong>
          <small>
            {t("driverDetail.summary.platformsBoundSub", locale, {
              online: onlinePlatforms.length,
            })}
          </small>
        </div>
        <div style={summaryCardStyle}>
          <span>{t("driverDetail.summary.reauthRequired", locale)}</span>
          <strong style={{ fontSize: "1.4rem" }}>
            {reauthPlatforms.length}
          </strong>
          <small>{t("driverDetail.summary.reauthRequiredSub", locale)}</small>
        </div>
        <div style={summaryCardStyle}>
          <span>{t("driverDetail.summary.ineligible", locale)}</span>
          <strong style={{ fontSize: "1.4rem" }}>
            {ineligiblePlatforms.length}
          </strong>
          <small>{t("driverDetail.summary.ineligibleSub", locale)}</small>
        </div>
        <div style={summaryCardStyle}>
          <span>{t("driverDetail.summary.relayFailures", locale)}</span>
          <strong style={{ fontSize: "1.4rem" }}>{relayFailures.length}</strong>
          <small>{t("driverDetail.summary.relayFailuresSub", locale)}</small>
        </div>
        <div style={summaryCardStyle}>
          <span>{t("driverDetail.summary.location", locale)}</span>
          <strong style={{ fontSize: "1.4rem" }}>
            {locationsResult.error
              ? t("drivers.list.locationUnknown", locale)
              : !locationSnapshot
                ? t("drivers.list.locationMissing", locale)
                : stale
                  ? t("drivers.list.locationStale", locale)
                  : t("drivers.list.locationLive", locale)}
          </strong>
          <small>
            {locationSnapshot
              ? t("driverDetail.summary.locationRecordedAt", locale, {
                  recordedAt: locationSnapshot.recordedAt,
                })
              : t("driverDetail.summary.locationNoSample", locale)}
          </small>
        </div>
      </section>

      <section style={sectionStyle}>
        <p style={eyebrowStyle}>{t("driverDetail.platforms.title", locale)}</p>
        <h3 style={{ margin: 0 }}>
          {t("driverDetail.platforms.heading", locale)}
        </h3>
        <p style={noteStyle}>{t("driverDetail.platforms.note", locale)}</p>
        <DataTable
          columns={[
            { label: t("driverDetail.platforms.col.platform", locale) },
            { label: t("driverDetail.platforms.col.binding", locale) },
            { label: t("driverDetail.platforms.col.presence", locale) },
            { label: t("driverDetail.platforms.col.eligibility", locale) },
            { label: t("driverDetail.platforms.col.token", locale) },
            { label: t("driverDetail.platforms.col.adapter", locale) },
            { label: t("common.actions", locale) },
          ]}
          empty={t("driverDetail.platforms.empty", locale)}
        >
          {presences.map((presence) => {
            const adapter = adapterStatusByPlatform.get(presence.platformCode);
            const expirySoon = tokenExpirySoon(presence);
            const presenceVariant = presenceStatusVariant(presence);
            const adapterVariant = adapterStatusVariant(adapter);
            const platformDisplayName =
              PLATFORM_CODE_REGISTRY[presence.platformCode]?.displayName ??
              presence.platformCode;
            return (
              <Tr key={presence.platformCode}>
                <Td>
                  <strong>{platformDisplayName}</strong>
                </Td>
                <Td>
                  {presence.accountId ? (
                    <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {presence.accountId}
                    </span>
                  ) : (
                    <Badge variant="orange">
                      {t("driverDetail.platforms.unbound", locale)}
                    </Badge>
                  )}
                </Td>
                <Td>
                  <Badge variant={presenceVariant}>
                    {formatOpsCodeLabel(locale, presence.status)}
                  </Badge>
                  {presence.reauthRequired && (
                    <div style={{ marginTop: "0.25rem" }}>
                      <Badge variant="orange">
                        {t("driverDetail.platforms.reauthRequired", locale)}
                      </Badge>
                    </div>
                  )}
                </Td>
                <Td>
                  <Badge
                    variant={
                      presence.eligibility === "eligible"
                        ? "green"
                        : presence.eligibility === "pending"
                          ? "yellow"
                          : "red"
                    }
                  >
                    {formatOpsCodeLabel(locale, presence.eligibility)}
                  </Badge>
                </Td>
                <Td>
                  {presence.tokenExpiresAt ? (
                    <>
                      <div>{presence.tokenExpiresAt}</div>
                      {expirySoon && (
                        <Badge variant="orange">
                          {t(
                            "driverDetail.platforms.tokenExpiringSoon",
                            locale,
                          )}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "#64748b" }}>
                      {t("common.dash", locale)}
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge variant={adapterVariant}>
                    {formatOpsCodeLabel(
                      locale,
                      adapter ? adapter.status : "unknown",
                    )}
                  </Badge>
                  {adapter?.blockingReason && (
                    <div style={{ marginTop: "0.25rem", color: "#475569" }}>
                      {adapter.blockingReason}
                    </div>
                  )}
                </Td>
                <Td>
                  <DriverPlatformRowActions
                    driverId={driver.driverId}
                    platformCode={presence.platformCode}
                    platformStatus={presence.status}
                  />
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </section>

      <section style={sectionStyle}>
        <p style={eyebrowStyle}>
          {t("driverDetail.activeOrder.title", locale)}
        </p>
        <h3 style={{ margin: 0 }}>
          {t("driverDetail.activeOrder.heading", locale)}
        </h3>
        {activeForwardedOrder ? (
          <div style={{ marginTop: "0.75rem" }}>
            <p style={{ margin: 0 }}>
              <strong>
                {PLATFORM_CODE_REGISTRY[activeForwardedOrder.platformCode]
                  ?.displayName ?? activeForwardedOrder.platformCode}
              </strong>{" "}
              · {activeForwardedOrder.externalOrderId}
            </p>
            <div style={metaListStyle}>
              <span style={metaPillStyle}>
                {t("driverDetail.activeOrder.statusPill", locale, {
                  status: formatOpsCodeLabel(
                    locale,
                    activeForwardedOrder.status,
                  ),
                })}
              </span>
              {activeForwardedOrder.lastNativeStatus && (
                <span style={metaPillStyle}>
                  {t("driverDetail.activeOrder.nativeStatusPill", locale, {
                    status: activeForwardedOrder.lastNativeStatus,
                  })}
                </span>
              )}
              <span style={metaPillStyle}>
                {t("driverDetail.activeOrder.mirrorPill", locale, {
                  mirror: activeForwardedOrder.mirrorOrderId,
                })}
              </span>
            </div>
          </div>
        ) : (
          <p style={noteStyle}>{t("driverDetail.activeOrder.none", locale)}</p>
        )}
      </section>

      <section style={sectionStyle}>
        <p style={eyebrowStyle}>{t("driverDetail.relay.title", locale)}</p>
        <h3 style={{ margin: 0 }}>{t("driverDetail.relay.heading", locale)}</h3>
        <p style={noteStyle}>{t("driverDetail.relay.note", locale)}</p>
        <DataTable
          columns={[
            { label: t("driverDetail.relay.col.platform", locale) },
            { label: t("driverDetail.relay.col.mirror", locale) },
            { label: t("driverDetail.relay.col.error", locale) },
            { label: t("driverDetail.relay.col.fallback", locale) },
            { label: t("driverDetail.relay.col.failedAt", locale) },
          ]}
          empty={t("driverDetail.relay.empty", locale)}
        >
          {relayFailures.map((order) => {
            const platformDisplayName =
              PLATFORM_CODE_REGISTRY[order.platformCode]?.displayName ??
              order.platformCode;
            return (
              <Tr key={order.mirrorOrderId}>
                <Td>{platformDisplayName}</Td>
                <Td mono>{order.mirrorOrderId}</Td>
                <Td>
                  {order.lastSyncError ? (
                    <>
                      <strong>{order.lastSyncError.code}</strong>
                      <div style={{ color: "#475569" }}>
                        {order.lastSyncError.message}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: "#64748b" }}>
                      {t("common.dash", locale)}
                    </span>
                  )}
                </Td>
                <Td>
                  {order.manualFallback.required ? (
                    <Badge variant="orange">
                      {order.manualFallback.reason ??
                        t("driverDetail.relay.manualFallback", locale)}
                    </Badge>
                  ) : (
                    <span style={{ color: "#64748b" }}>
                      {t("common.dash", locale)}
                    </span>
                  )}
                </Td>
                <Td>
                  {order.lastSyncError?.failedAt ??
                    order.manualFallback.requestedAt ??
                    order.updatedAt}
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      </section>

      <section style={sectionStyle}>
        <p style={eyebrowStyle}>{t("driverDetail.earnings.title", locale)}</p>
        <h3 style={{ margin: 0 }}>
          {t("driverDetail.earnings.heading", locale)}
        </h3>
        {statementsResult.error ? (
          <p style={noteStyle}>{statementsResult.error}</p>
        ) : latestStatement ? (
          <div style={{ marginTop: "0.5rem" }}>
            <p style={{ margin: 0 }}>
              <strong>{latestStatement.periodMonth}</strong> ·{" "}
              {formatOpsCodeLabel(locale, latestStatement.payoutStatus)} ·{" "}
              {formatMinorCurrency(latestStatement.netAmount.amountMinor)}
            </p>
            <p style={noteStyle}>{latestStatement.receiptNo}</p>
          </div>
        ) : (
          <p style={noteStyle}>{t("driverDetail.earnings.none", locale)}</p>
        )}
      </section>

      <div style={footerLinksStyle}>
        <Link href="/drivers">
          <strong>{t("driverDetail.backToList", locale)}</strong>
        </Link>
        <Link href="/dispatch">
          <strong>{t("driverDetail.openDispatch", locale)}</strong>
        </Link>
      </div>
    </>
  );
}
