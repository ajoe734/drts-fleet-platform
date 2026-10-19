"use client";
import { useEffect, useState } from "react";
import type { FareVersion } from "@drts/contracts";
import { PASSENGER_SUPPORT_PHONE } from "@drts/passenger-client";
import { createBookingClient } from "../../components/booking/booking-screen";
import { FeeDisclosure } from "../../components/booking/disclosure";
import { AuthAlert, AuthScreen, P5Btn, P5Card } from "../../components/auth/ui";
import { BOOK_T as T } from "../../lib/booking/translations";

export default function FaresPage() {
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
  return (
    <AuthScreen title={T.publicFares}>
      {failed ? (
        <>
          <AuthAlert>{T.publicError}</AuthAlert>
          <P5Btn onClick={() => setAttempt((value) => value + 1)}>
            {T.publicRetry}
          </P5Btn>
        </>
      ) : fare ? (
        <>
          <FeeDisclosure fare={fare} />
          <P5Card title={T.tariffAuthority}>
            <p>{T.base(fare)}</p>
            <p>{T.distance(fare)}</p>
            <p>{T.delay(fare)}</p>
            <p>{T.night(fare)}</p>
            {Object.entries(fare.additionalFees).map(([name, amount]) => (
              <p key={name}>{T.additional(name, amount)}</p>
            ))}
          </P5Card>
        </>
      ) : (
        <p>{T.publicLoading}</p>
      )}
      <p>{T.currentRegulation}</p>
      <a href="/">{T.home}</a>
      <a href={`tel:${PASSENGER_SUPPORT_PHONE}`}>
        {T.supportPhone(PASSENGER_SUPPORT_PHONE)}
      </a>
    </AuthScreen>
  );
}
