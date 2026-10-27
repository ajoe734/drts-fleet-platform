"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { passengerFetch } from "../../lib/runtime-fetch";
import { AuthAlert, P5, P5Btn } from "../auth/ui";
import { useTrialMode } from "../review-demo/review-context";
import { trialT } from "./translations";

type TrialAction = "assign" | "heartbeat" | "arrive" | "board" | "complete";

const DISPATCHABLE = new Set([
  "created",
  "ready_for_dispatch",
  "redispatch_required",
]);
const APPROACHING = new Set(["assigned", "driver_accepted", "enroute_pickup"]);
const RIDING = new Set(["on_trip", "proof_pending"]);
// While a test driver serves the ride, its simulated app reports in like a
// real one: position for live tracking, arrival, and the end at the
// destination. The server releases a stale trial driver after 20 minutes.
const HEARTBEAT_MS = 10_000;

/**
 * The trial's stand-in for the Ops and Driver windows: buttons drive the
 * passenger's own ride through the normal dispatch and driver steps with a
 * synthetic test driver (API: review-demo/rides/:id/trial/*).
 */
export function TrialRideControls({ orderId }: { orderId: string }) {
  const trial = useTrialMode();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A tap is never dropped because a background heartbeat is in flight; a
  // heartbeat simply skips while anything else is. Each read is numbered and
  // only a newer one may set the status, so a slow heartbeat that started
  // before a tap cannot roll the card back.
  const actionInFlight = useRef(false);
  const heartbeatInFlight = useRef(false);
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const ride = encodeURIComponent(orderId);
  const apply = useCallback((seq: number, value: unknown) => {
    if (typeof value !== "string" || seq < appliedSeq.current) return;
    appliedSeq.current = seq;
    setStatus(value);
  }, []);

  const read = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const response = await passengerFetch(
        `/api/passenger-app/rides/${ride}`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) return;
      const body = await response.json().catch(() => null);
      apply(seq, body?.data?.ride?.order?.status);
    } catch {
      /* The ride page shows its own connection state. */
    }
  }, [ride, apply]);

  const act = useCallback(
    async (action: TrialAction, quiet = false) => {
      if (quiet) {
        if (actionInFlight.current || heartbeatInFlight.current) return;
        heartbeatInFlight.current = true;
      } else {
        if (actionInFlight.current) return;
        actionInFlight.current = true;
        setBusy(true);
        setError("");
      }
      const seq = ++requestSeq.current;
      try {
        const response = await passengerFetch(
          `/api/passenger-app/review-demo/rides/${ride}/trial/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const code = String(body?.error?.code ?? "");
          if (!quiet)
            setError(
              code.endsWith("SUPPLY_BUSY")
                ? trialT.supplyBusy
                : trialT.actionFailed,
            );
          await read();
          return;
        }
        apply(seq, body?.data?.status);
      } catch {
        if (!quiet) setError(trialT.actionFailed);
      } finally {
        if (quiet) heartbeatInFlight.current = false;
        else {
          actionInFlight.current = false;
          setBusy(false);
        }
      }
    },
    [ride, read, apply],
  );

  useEffect(() => {
    if (trial) void read();
  }, [trial, read]);

  const serving =
    status !== null &&
    (APPROACHING.has(status) ||
      status === "arrived_pickup" ||
      RIDING.has(status));
  useEffect(() => {
    if (!trial || !serving) return;
    void act("heartbeat", true);
    const timer = setInterval(() => void act("heartbeat", true), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [trial, serving, act]);

  if (!trial) return null;

  let message: string | null = null;
  let button: { label: string; action: TrialAction } | null = null;
  if (status === null) message = trialT.waiting;
  else if (DISPATCHABLE.has(status))
    button = {
      label: busy ? trialT.assigning : trialT.assign,
      action: "assign",
    };
  else if (APPROACHING.has(status)) {
    message = trialT.enroute;
    button = { label: trialT.arrive, action: "arrive" };
  } else if (status === "arrived_pickup") {
    message = trialT.arrived;
    button = { label: trialT.board, action: "board" };
  } else if (RIDING.has(status)) {
    message = trialT.onTrip;
    button = { label: trialT.complete, action: "complete" };
  } else if (status === "completed") message = trialT.completed;
  else if (status === "cancelled") message = trialT.cancelled;

  return (
    <section
      aria-label={trialT.driverTitle}
      style={{
        maxWidth: 430,
        margin: "12px auto 0",
        padding: "12px 14px",
        border: `1px solid ${P5.line}`,
        borderRadius: 14,
        background: P5.surface,
        display: "grid",
        gap: 8,
        fontSize: 14,
      }}
    >
      <strong style={{ fontSize: 15 }}>{trialT.driverTitle}</strong>
      <span style={{ color: P5.mut, fontSize: 13 }}>{trialT.driverIntro}</span>
      {message && <p style={{ margin: 0 }}>{message}</p>}
      {button && (
        <P5Btn
          kind="primary"
          disabled={busy}
          onClick={() => void act(button.action)}
        >
          {button.label}
        </P5Btn>
      )}
      {error && <AuthAlert>{error}</AuthAlert>}
    </section>
  );
}
