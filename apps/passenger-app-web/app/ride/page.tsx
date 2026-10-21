"use client";

import { RIDE_T as T } from "../../components/demo/translations";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  RideScreen,
  usePassengerMode,
} from "../../components/demo/demo-ride-screen";
import { PassengerRidePage } from "../../components/ride/passenger-ride-page";

function RideContent() {
  const params = useSearchParams();
  const rideId = params.get("rideId") ?? "";
  const mode = usePassengerMode();

  if (mode === "live" && rideId) {
    return (
      <PassengerRidePage
        token={rideId}
        authMode="id"
        kind="ride"
        searchParams={{ mode: "live" }}
      />
    );
  }

  return <RideScreen rideId={rideId} />;
}

export default function Ride() {
  return (
    <Suspense fallback={<p role="status">{T.message016}</p>}>
      <RideContent />
    </Suspense>
  );
}
