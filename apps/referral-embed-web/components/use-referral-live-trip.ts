"use client";
import { useEffect, useRef, useState } from "react";
import type { ReferralPassengerTripSnapshot } from "@drts/contracts";

type LiveTripDisplay = ReferralPassengerTripSnapshot & {
  /** Local elapsed display only; never replaces the server observation time. */
  localLocationAgeSeconds?: number | null;
};

function trackingServerTime(
  trip: ReferralPassengerTripSnapshot | null | undefined,
  cancellationNow: number,
) {
  const observedAt = Date.parse(trip?.liveTracking?.observedAt ?? "");
  return Number.isFinite(cancellationNow)
    ? Math.max(
        cancellationNow,
        Number.isFinite(observedAt) ? observedAt : cancellationNow,
      )
    : observedAt;
}

function displayTrip(
  trip: ReferralPassengerTripSnapshot | null,
  serverNow: number,
): LiveTripDisplay | null {
  if (!trip?.liveTracking?.location) return trip;
  const tracking = trip.liveTracking;
  const ageMs = serverNow - Date.parse(tracking.location!.recordedAt);
  const inWindow = (at: string) => {
    const age = serverNow - Date.parse(at);
    return Number.isFinite(age) && age >= -5_000 && age < 60_000;
  };
  const current = inWindow(tracking.location!.recordedAt);
  const usable = tracking.locationFreshness === "fresh" && current;
  const pickupEta =
    usable && tracking.pickupEta && inWindow(tracking.pickupEta.calculatedAt)
      ? tracking.pickupEta
      : null;
  const dropoffRoute =
    usable &&
    tracking.dropoffRoute &&
    inWindow(tracking.dropoffRoute.generatedAt)
      ? tracking.dropoffRoute
      : null;
  return {
    ...trip,
    localLocationAgeSeconds: Number.isFinite(ageMs)
      ? Math.max(0, Math.round(ageMs / 1000))
      : null,
    liveTracking:
      (tracking.locationFreshness === "fresh" && !current) ||
      pickupEta !== tracking.pickupEta ||
      dropoffRoute !== tracking.dropoffRoute
        ? {
            ...tracking,
            locationFreshness:
              tracking.locationFreshness === "fresh" && !current
                ? "stale"
                : tracking.locationFreshness,
            pickupEta,
            dropoffRoute,
          }
        : tracking,
  };
}

export function useReferralLiveTrip(
  initial: ReferralPassengerTripSnapshot | null | undefined,
  scope: string,
) {
  const orderId = initial?.orderId ?? null;
  const snapshotTime = (
    trip: ReferralPassengerTripSnapshot | null | undefined,
  ) => Date.parse(trip?.cancellationWindow?.asOf ?? "");
  const initialTime = snapshotTime(initial);
  const [, setPollClock] = useState(0);
  const trackingObservation = useRef({
    scope,
    orderId,
    trip: initial ?? null,
    serverNow: trackingServerTime(initial, initialTime),
    monotonicAt: performance.now(),
  });
  const observation = useRef({
    scope,
    orderId,
    serverNow: initialTime,
    monotonicAt: performance.now(),
  });
  const [snapshot, setSnapshot] = useState({
    scope,
    orderId,
    initial,
    trip: initial ?? null,
    error: false,
    ended: false,
    cancellationServerNow: initialTime,
  });
  const refreshRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const observe = (
      trip: ReferralPassengerTripSnapshot | null | undefined,
    ) => {
      const now = performance.now(),
        serverTime = snapshotTime(trip),
        old = observation.current;
      // A live read must not rewind this order's established server-time clock.
      // Keep the actual server policy/metadata untouched; this local floor only
      // carries monotonic elapsed time across successive snapshots.
      const previous =
        old.scope === scope &&
        old.orderId === orderId &&
        Number.isFinite(old.serverNow)
          ? old.serverNow + Math.max(0, now - old.monotonicAt)
          : serverTime;
      const serverNow = Number.isFinite(serverTime)
        ? Math.max(
            serverTime,
            Number.isFinite(previous) ? previous : serverTime,
          )
        : Number.NaN;
      trackingObservation.current = {
        scope,
        orderId,
        trip: trip ?? null,
        serverNow: trackingServerTime(
          trip,
          Number.isFinite(serverNow) ? serverNow : previous,
        ),
        monotonicAt: now,
      };
      // Unknown metadata stays unknown in the UI, but cannot erase an already
      // established clock floor for a later valid read of this same order.
      observation.current = {
        scope,
        orderId,
        serverNow: Number.isFinite(serverNow) ? serverNow : previous,
        monotonicAt: now,
      };
      return serverNow;
    };
    setSnapshot({
      scope,
      orderId,
      initial,
      trip: initial ?? null,
      error: false,
      ended: false,
      cancellationServerNow: observe(initial),
    });
    if (!orderId) {
      refreshRef.current = null;
      return;
    }
    let live = true,
      pending = false;
    let controller: AbortController | null = null;
    let generation = 0;
    const refresh = async (replacePending = false) => {
      if (
        !live ||
        (pending && !replacePending) ||
        document.visibilityState === "hidden"
      )
        return;
      if (replacePending) controller?.abort();
      const requestGeneration = ++generation;
      pending = true;
      const requestController = new AbortController();
      controller = requestController;
      try {
        const response = await fetch("/api/referral/active", {
          cache: "no-store",
          credentials: "same-origin",
          signal: requestController.signal,
        });
        const body = await response.json();
        if (!response.ok || !body?.ok || typeof body.data?.active !== "boolean")
          throw new Error("Active trip is unavailable");
        const trip = body.data.active ? body.data.trip : null;
        if (
          body.data.active &&
          (!trip ||
            typeof trip.orderId !== "string" ||
            typeof trip.status !== "string")
        )
          throw new Error("Active trip is unavailable");
        if (!live || requestGeneration !== generation) return;
        const ended =
          !trip ||
          trip.orderId !== orderId ||
          [
            "completed",
            "cancelled",
            "dispatch_failed",
            "dispatch_timeout",
            "no_supply",
          ].includes(trip.status);
        setSnapshot({
          scope,
          orderId,
          initial,
          trip: ended ? null : trip,
          error: false,
          ended,
          cancellationServerNow: observe(ended ? null : trip),
        });
        if (ended) clearInterval(timer);
      } catch {
        if (live && requestGeneration === generation)
          setSnapshot((s) => ({ ...s, error: true }));
      } finally {
        if (requestGeneration === generation) {
          pending = false;
          controller = null;
        }
      }
    };
    refreshRef.current = () => {
      // Explicit refresh replaces only this read, not a command or identity.
      void refresh(true);
    };
    const timer = setInterval(() => {
      // Age retained observations even while a previous read is unsettled.
      setPollClock((clock) => clock + 1);
      void refresh();
    }, 5000);
    const visible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      generation += 1;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      refreshRef.current = null;
    };
    // The server's initial snapshot belongs to this scope/order. Revalidations
    // update this hook's state without restarting or overlapping its poll loop.
  }, [scope, orderId, initial]);
  // New server props are authoritative on this render, including updates to
  // the same order. Do not wait for the poll effect to replace an old policy.
  // Carry its established monotonic floor across this synchronous handoff too.
  const previous = observation.current;
  const authoritativeServerNow =
    Number.isFinite(initialTime) &&
    previous.scope === scope &&
    previous.orderId === orderId &&
    Number.isFinite(previous.serverNow)
      ? Math.max(
          initialTime,
          previous.serverNow +
            Math.max(0, performance.now() - previous.monotonicAt),
        )
      : initialTime;
  const current =
    snapshot.scope === scope &&
    snapshot.orderId === orderId &&
    snapshot.initial === initial
      ? snapshot
      : {
          scope,
          orderId,
          trip: initial ?? null,
          error: false,
          ended: false,
          cancellationServerNow: authoritativeServerNow,
        };
  const trackingClock = trackingObservation.current;
  const displayServerNow =
    trackingClock.scope === scope &&
    trackingClock.orderId === orderId &&
    trackingClock.trip === current.trip
      ? trackingClock.serverNow +
        Math.max(0, performance.now() - trackingClock.monotonicAt)
      : trackingServerTime(current.trip, current.cancellationServerNow);
  return {
    ...current,
    trip: displayTrip(current.trip, displayServerNow),
    refresh: () => refreshRef.current?.(),
  };
}
