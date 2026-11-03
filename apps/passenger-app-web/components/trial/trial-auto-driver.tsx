"use client";

import { useEffect } from "react";
import { passengerFetch } from "../../lib/runtime-fetch";
import { useTrialMode } from "../review-demo/review-context";

type TrialAction = "assign" | "heartbeat" | "board";

const DISPATCHABLE = new Set([
  "created",
  "ready_for_dispatch",
  "redispatch_required",
]);
const SERVING = new Set([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);
const FINISHED = new Set(["completed", "cancelled"]);
// The ride is read every tick; the test driver takes the order once it has
// waited for dispatch this long, and the passenger boards this long after the
// driver arrived. Meanwhile the simulated driver app reports its position like
// a real one, which also reports arrival and the end of the ride at the
// destination (DemoTripEngine.heartbeat). The server releases a stale trial
// driver after 20 minutes.
const TICK_MS = 5_000;
const ASSIGN_AFTER_MS = 5_000;
const BOARD_AFTER_MS = 8_000;
const HEARTBEAT_MS = 10_000;

/**
 * The trial's stand-in for the Ops and Driver windows, without any controls of
 * its own: a synthetic test driver serves the passenger's own ride through the
 * normal dispatch and driver steps (API: review-demo/rides/:id/trial/*) while
 * the ride page is open, so the passenger sees the ride as the plan's screens
 * show it.
 */
export function TrialAutoDriver({ orderId }: { orderId: string }) {
  const trial = useTrialMode();

  useEffect(() => {
    if (!trial) return;
    const ride = encodeURIComponent(orderId);
    let stopped = false;
    let busy = false;
    let status: string | null = null;
    let statusSince = 0;
    let lastHeartbeat = 0;

    const readStatus = async () => {
      const response = await passengerFetch(
        `/api/passenger-app/rides/${ride}`,
        { cache: "no-store" },
      );
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      const value = body?.data?.ride?.order?.status;
      return typeof value === "string" ? value : null;
    };
    const post = (action: TrialAction) =>
      passengerFetch(
        `/api/passenger-app/review-demo/rides/${ride}/trial/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );

    const stop = () => {
      stopped = true;
      clearInterval(timer);
    };
    const tick = async () => {
      if (stopped || busy) return;
      busy = true;
      try {
        const current = await readStatus();
        if (current === null) return;
        const now = Date.now();
        if (current !== status) {
          status = current;
          statusSince = now;
        }
        if (FINISHED.has(current)) {
          stop();
          return;
        }
        if (DISPATCHABLE.has(current)) {
          if (now - statusSince < ASSIGN_AFTER_MS) return;
          // A busy test fleet is retried after another wait.
          if (!(await post("assign")).ok) statusSince = Date.now();
        } else if (
          current === "arrived_pickup" &&
          now - statusSince >= BOARD_AFTER_MS
        ) {
          await post("board");
        } else if (
          SERVING.has(current) &&
          now - lastHeartbeat >= HEARTBEAT_MS
        ) {
          lastHeartbeat = now;
          await post("heartbeat");
        }
      } catch {
        /* The ride page shows its own connection state; retry next tick. */
      } finally {
        busy = false;
      }
    };

    const timer = setInterval(() => void tick(), TICK_MS);
    void tick();
    return stop;
  }, [trial, orderId]);

  return null;
}
