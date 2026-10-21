"use client";
import { useEffect, useRef, useState } from "react";
import type { ReferralPassengerTripSnapshot } from "@drts/contracts";

export function useReferralLiveTrip(
  initial: ReferralPassengerTripSnapshot | null | undefined,
  scope: string,
) {
  const orderId = initial?.orderId ?? null;
  const snapshotTime = (
    trip: ReferralPassengerTripSnapshot | null | undefined,
  ) => Date.parse(trip?.cancellationWindow?.asOf ?? "");
  const initialTime = snapshotTime(initial);
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
    const refresh = async () => {
      if (!live || pending || document.visibilityState === "hidden") return;
      pending = true;
      controller = new AbortController();
      try {
        const response = await fetch("/api/referral/active", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
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
        if (!live) return;
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
        if (live) setSnapshot((s) => ({ ...s, error: true }));
      } finally {
        pending = false;
      }
    };
    refreshRef.current = () => {
      void refresh();
    };
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    const visible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
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
  return { ...current, refresh: () => refreshRef.current?.() };
}
