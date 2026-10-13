"use client";

import { RIDE_T as T } from "../../components/demo/translations";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RideScreen } from "../../components/demo/demo-ride-screen";

function RideContent() {
  const params = useSearchParams();
  return <RideScreen rideId={params.get("rideId") ?? ""} />;
}

export default function Ride() {
  return (
    <Suspense fallback={<p role="status">{T.message016}</p>}>
      <RideContent />
    </Suspense>
  );
}
