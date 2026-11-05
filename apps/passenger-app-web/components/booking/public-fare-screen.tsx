"use client";
import { useEffect, useState } from "react";
import type { FareVersion } from "@drts/contracts";
import { createBookingClient } from "./booking-screen";
import { FareTariff, FeeDisclosure } from "./disclosure";
import {
  FARES_PATH,
  FEES_PATH,
  PLAN,
  PlanLink,
  PlanScreen,
} from "./plan-screen";
import { AuthAlert, P5, P5Btn } from "../auth/ui";
import { BOOK_T as T } from "../../lib/booking/translations";

/**
 * Public 費用與優惠說明 (E-19a, /fees) and 計費說明 (E-05, /fares). Both read
 * only the public tariff API; neither needs or touches a passenger account.
 */
export function PublicFareScreen({ kind }: { kind: "fees" | "fares" }) {
  const [client] = useState(createBookingClient);
  const [fare, setFare] = useState<FareVersion>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setFailed(false);
    void client
      .getFares()
      .then(({ currentVersion }) => {
        if (!currentVersion?.version) throw new Error("invalid_fares");
        if (current) setFare(currentVersion);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [client, attempt]);
  const fees = kind === "fees";
  return (
    <PlanScreen
      title={fees ? T.disclosure : T.publicFares}
      right={T.publicInfo}
      url={`ride.smarttransport.tw${fees ? FEES_PATH : FARES_PATH}`}
    >
      {failed ? (
        <div style={PLAN.inset}>
          <AuthAlert>{T.publicError}</AuthAlert>
          <div style={{ marginTop: 12 }}>
            <P5Btn onClick={() => setAttempt((value) => value + 1)}>
              {T.publicRetry}
            </P5Btn>
          </div>
        </div>
      ) : fare ? (
        fees ? (
          <FeeDisclosure fare={fare} />
        ) : (
          <FareTariff fare={fare} />
        )
      ) : (
        <p role="status" style={{ ...PLAN.muted, margin: "0 16px 12px" }}>
          {T.publicLoading}
        </p>
      )}
      {!fees && (
        <p style={{ ...PLAN.stamp, textAlign: "center" }}>
          {T.currentRegulation}
        </p>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          margin: "6px 14px 12px",
        }}
      >
        {fees ? (
          <PlanLink href={FARES_PATH}>{T.viewTariff}</PlanLink>
        ) : (
          <PlanLink href={FEES_PATH}>{T.fullFees}</PlanLink>
        )}
        <a href="/" style={{ ...PLAN.link, color: P5.mut, fontWeight: 600 }}>
          {T.home}
        </a>
      </div>
    </PlanScreen>
  );
}
