"use client";
import { useEffect, useMemo, useState } from "react";
import type { ReferralPassengerTripSnapshot } from "@drts/contracts";
import type { buildEmbedTheme } from "../lib/embed-presentation";
import {
  googleMapsAuthFailed,
  onGoogleMapsAuthFailure,
} from "../lib/google-maps-loader";
import { useTranslation } from "../lib/i18n";
import type { ReferralMapConfig } from "./referral-place-field";
import { ReferralTripMap } from "./referral-trip-map";
export function referralLiveArrival(
  trip: ReferralPassengerTripSnapshot,
  pending: string,
): string {
  const tracking = trip.liveTracking;
  const at =
    trip.status === "on_trip"
      ? tracking?.dropoffRoute?.estimatedArrivalAt
      : tracking?.pickupEta?.estimatedArrivalAt;
  if (!at || !Number.isFinite(Date.parse(at))) return pending;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}
export function referralLiveMinutes(
  trip: ReferralPassengerTripSnapshot,
): number | null {
  const tracking = trip.liveTracking;
  if (!tracking || tracking.locationFreshness !== "fresh") return null;
  return trip.status === "on_trip"
    ? tracking.dropoffRoute
      ? Math.ceil(tracking.dropoffRoute.remainingDurationSeconds / 60)
      : null
    : (tracking.pickupEta?.minutes ?? null);
}
function time(at: string | undefined, pending = "待更新") {
  return at && Number.isFinite(Date.parse(at))
    ? new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(new Date(at))
    : pending;
}
export function ReferralLiveTrackingPanel({
  trip,
  error,
  refresh,
  theme,
  mapConfig,
}: {
  trip: ReferralPassengerTripSnapshot;
  error: boolean;
  refresh: () => void;
  theme: ReturnType<typeof buildEmbedTheme>;
  mapConfig?: ReferralMapConfig | null | undefined;
}) {
  const { t } = useTranslation();
  const [mapFailed, setMapFailed] = useState(googleMapsAuthFailed());
  useEffect(() => onGoogleMapsAuthFailure(() => setMapFailed(true)), []);
  const tracking = trip.liveTracking;
  const location = tracking?.location;
  const onTrip = trip.status === "on_trip";
  // Plain points with stable identity, so the map only moves on new data and
  // not on every countdown render of the trip screen.
  const lat = location?.lat;
  const lng = location?.lng;
  const vehicle = useMemo(
    () => (lat != null && lng != null ? { lat, lng } : null),
    [lat, lng],
  );
  const targetPoint = onTrip ? tracking?.dropoffPoint : tracking?.pickupPoint;
  const targetLat = targetPoint?.lat;
  const targetLng = targetPoint?.lng;
  const target = useMemo(
    () =>
      targetLat != null && targetLng != null
        ? { lat: targetLat, lng: targetLng }
        : null,
    [targetLat, targetLng],
  );
  const minutes = referralLiveMinutes(trip);
  const arrival = referralLiveArrival(trip, "");
  const fresh = tracking?.locationFreshness === "fresh";
  const ageSeconds =
    location && tracking
      ? Math.max(
          0,
          Math.round(
            (Date.parse(tracking.observedAt) -
              Date.parse(location.recordedAt)) /
              1000,
          ),
        )
      : null;
  const showMap = Boolean(
    mapConfig?.enabled &&
    mapConfig.browserKey &&
    !mapFailed &&
    (vehicle || target),
  );
  const targetName = onTrip
    ? t("referralLive.legendDestination")
    : t("referralLive.legendPickup");
  const legendDot = (color: string) => ({
    width: 10,
    height: 10,
    borderRadius: 999,
    background: color,
    border: "2px solid #FFFFFF",
    boxShadow: `0 0 0 1px ${theme.line}`,
    flexShrink: 0,
  });
  return (
    <section
      aria-label={t("referralLive.section")}
      style={{
        display: "grid",
        gap: 10,
        padding: 15,
        borderRadius: 16,
        background: theme.surface,
        border: `1px solid ${theme.line}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <h3
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: theme.ink }}
        >
          {t("referralLive.title")}
        </h3>
        <span style={{ fontSize: 11, color: theme.muted }}>
          {t("referralLive.autoUpdate")}
        </span>
      </div>
      {error ? (
        <div role="status" style={{ fontSize: 12, color: theme.dangerFg }}>
          {t("referralLive.error")}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 3 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.muted }}>
          {trip.status === "arrived_pickup"
            ? t("referralLive.arrived")
            : onTrip
              ? t("referralLive.toDestination")
              : t("referralLive.toPickup")}
        </div>
        {minutes != null ? (
          <div style={{ fontSize: 20, fontWeight: 800, color: theme.ink }}>
            {t(
              onTrip ? "referralLive.etaDestination" : "referralLive.etaPickup",
              {
                minutes,
              },
            )}
          </div>
        ) : null}
        {arrival ? (
          <div style={{ fontSize: 12.5, color: theme.ink2 }}>
            {t("referralLive.arriveAt", { time: arrival })}
          </div>
        ) : null}
        {onTrip ? (
          <div style={{ fontSize: 12.5, color: theme.ink2 }}>
            {t("referralLive.distance", {
              distance: tracking?.dropoffRoute
                ? t("referralLive.kilometers", {
                    distance: (
                      tracking.dropoffRoute.remainingDistanceMeters / 1000
                    ).toFixed(1),
                  })
                : t("referralLive.pending"),
            })}
          </div>
        ) : null}
      </div>
      {showMap && mapConfig?.browserKey ? (
        <>
          <ReferralTripMap
            browserKey={mapConfig.browserKey}
            vehicle={vehicle}
            target={target}
            vehicleLabel={t("referralLive.markerVehicle")}
            targetLabel={
              onTrip
                ? t("referralLive.markerDestination")
                : t("referralLive.markerPickup")
            }
            vehicleColor={theme.primary}
            label={t("referralLive.mapLabel", { target: targetName })}
            onUnavailable={() => setMapFailed(true)}
          />
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 11.5,
              color: theme.ink2,
            }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span style={legendDot(theme.primary)} />
              {t("referralLive.legendVehicle")}
            </span>
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span style={legendDot("#EA4335")} />
              {targetName}
            </span>
          </div>
        </>
      ) : null}
      <div style={{ fontSize: 11.5, color: theme.muted, lineHeight: 1.6 }}>
        {location && fresh
          ? t("referralLive.locationUpdated", {
              time: time(location.recordedAt, t("referralLive.pending")),
              seconds: ageSeconds ?? 0,
            })
          : t("referralLive.freshness", {
              status:
                tracking?.locationFreshness === "stale"
                  ? t("referralLive.stale")
                  : tracking?.locationFreshness === "low_accuracy"
                    ? t("referralLive.lowAccuracy")
                    : t("referralLive.missing"),
            })}
      </div>
      {location ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.lat},${location.lng}`)}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, fontWeight: 600, color: theme.primary }}
        >
          {t("referralLive.openMap")}
        </a>
      ) : null}
      <small style={{ fontSize: 11, color: theme.muted, lineHeight: 1.6 }}>
        {t("referralLive.estimateNote")}
      </small>
      <button
        type="button"
        onClick={refresh}
        style={{
          minHeight: 40,
          borderRadius: 12,
          border: `1px solid ${theme.line}`,
          background: theme.surface,
          color: theme.primary,
          fontFamily: theme.sans,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {t("referralLive.refresh")}
      </button>
    </section>
  );
}
