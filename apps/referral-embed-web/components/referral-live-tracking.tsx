"use client";
import type { ReferralPassengerTripSnapshot } from "@drts/contracts";
import { useTranslation } from "../lib/i18n";
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
}: {
  trip: ReferralPassengerTripSnapshot;
  error: boolean;
  refresh: () => void;
}) {
  const { t } = useTranslation();
  const tracking = trip.liveTracking;
  const location = tracking?.location;
  return (
    <section
      aria-label={t("referralLive.section")}
      style={{
        padding: 16,
        border: "1px solid #d4d4d4",
        borderRadius: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <h3 style={{ margin: 0 }}>{t("referralLive.title")}</h3>
      {error ? <div role="status">{t("referralLive.error")}</div> : null}
      <div>
        {trip.status === "arrived_pickup"
          ? t("referralLive.arrived")
          : trip.status === "on_trip"
            ? t("referralLive.toDestination")
            : t("referralLive.toPickup")}
      </div>
      <div>
        {t("referralLive.location", {
          location: location
            ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
            : t("referralLive.pending"),
        })}
      </div>
      {location ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.lat},${location.lng}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          {t("referralLive.openMap")}
        </a>
      ) : null}
      <div>
        {t("referralLive.freshness", {
          status:
            tracking?.locationFreshness === "fresh"
              ? t("referralLive.fresh")
              : tracking?.locationFreshness === "stale"
                ? t("referralLive.stale")
                : tracking?.locationFreshness === "low_accuracy"
                  ? t("referralLive.lowAccuracy")
                  : t("referralLive.missing"),
        })}
      </div>
      <div>
        {t("referralLive.locationAt", {
          time: time(location?.recordedAt, t("referralLive.pending")),
        })}
      </div>
      {trip.status === "on_trip" ? (
        <div>
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
      <div>
        {t("referralLive.observedAt", {
          time: time(tracking?.observedAt, t("referralLive.pending")),
        })}
      </div>
      <small>{t("referralLive.estimateNote")}</small>
      <button type="button" onClick={refresh}>
        {t("referralLive.refresh")}
      </button>
    </section>
  );
}
