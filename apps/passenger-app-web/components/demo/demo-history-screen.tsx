"use client";

import { RIDE_T as T } from "./translations";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthScreen, AuthAlert, P5Btn, P5Card } from "../auth/ui";
import {
  DEMO_RIDE_LABELS,
  RideNavigation,
  liveRideStatus,
  liveRideSummary,
  readLiveRideData,
  rideTime,
  useDemoSnapshot,
  usePassengerMode,
  type LiveRideSummary,
} from "./demo-ride-screen";

export function HistoryScreen() {
  const mode = usePassengerMode();
  if (mode === "loading")
    return (
      <AuthScreen title={T.message013}>
        <p role="status">{T.message016}</p>
      </AuthScreen>
    );
  return mode === "demo" ? <DemoHistoryScreen /> : <LiveHistoryScreen />;
}

export function DemoHistoryScreen() {
  const state = useDemoSnapshot();
  const [filter, setFilter] = useState("all");
  const rides = [...(state?.rides ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter(
      (ride) =>
        filter === "all" ||
        (filter === "active"
          ? !["completed", "cancelled"].includes(ride.status)
          : ride.status === filter),
    );
  return (
    <AuthScreen title={T.message112} account>
      <AuthAlert kind="info">{T.message113}</AuthAlert>
      {!state ? (
        <p role="status">{T.message019}</p>
      ) : !state.loggedIn ? (
        <>
          <p>{T.message114}</p>
          <Link href="/login">{T.message021}</Link>
        </>
      ) : (
        <>
          <label style={{ margin: "0 28px" }}>
            {T.message115}
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">{T.message116}</option>
              <option value="active">{T.message117}</option>
              <option value="completed">{T.message095}</option>
              <option value="cancelled">{T.message096}</option>
            </select>
          </label>
          {!rides.length && (
            <P5Card title={T.message118}>
              <p>{T.message119}</p>
              <Link href="/">{T.message012}</Link>
            </P5Card>
          )}
          {rides.map((ride) => (
            <P5Card key={ride.id} title={DEMO_RIDE_LABELS[ride.status]}>
              <p>{ride.orderNo}</p>
              <p>
                {ride.origin.address} → {ride.destination.address}
              </p>
              <p>
                {rideTime(ride.scheduledAt)}
                {T.message120}
              </p>
              {ride.status === "completed" && (
                <p>
                  {T.message121}
                  {ride.amount} ·{" "}
                  {ride.paymentStatus === "paid" ? T.message122 : T.message123}
                </p>
              )}
              {ride.rating !== null && (
                <p>
                  {T.message124}
                  {ride.rating} {T.message067}
                </p>
              )}
              <Link href={`/ride?rideId=${encodeURIComponent(ride.id)}`}>
                {T.message125} {ride.orderNo}
              </Link>
            </P5Card>
          ))}
        </>
      )}
      <RideNavigation />
    </AuthScreen>
  );
}

function LiveHistoryScreen() {
  const [rides, setRides] = useState<LiveRideSummary[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    setRides(null);
    void readLiveRideData("rides?limit=50")
      .then((data) => {
        if (!Array.isArray(data.rides)) throw new Error(T.message126);
        const items = data.rides.map(liveRideSummary);
        if (active) setRides(items);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : T.message126);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  return (
    <AuthScreen title={T.message013} account>
      {error ? (
        <>
          <AuthAlert>{error}</AuthAlert>
          <Link href="/login">{T.message021}</Link>
          <P5Btn onClick={() => setRefresh((value) => value + 1)}>
            {T.message104}
          </P5Btn>
        </>
      ) : !rides ? (
        <p role="status">{T.message016}</p>
      ) : !rides.length ? (
        <P5Card title={T.message118}>
          <Link href="/">{T.message012}</Link>
        </P5Card>
      ) : (
        rides.map((ride) => (
          <P5Card key={ride.id} title={liveRideStatus(ride.status)}>
            <p>
              {ride.pickup} → {ride.dropoff}
            </p>
            <p>
              {rideTime(ride.scheduledAt)}
              {T.message120}
            </p>
            <Link href={`/ride?rideId=${encodeURIComponent(ride.id)}`}>
              {T.message125} {ride.orderNo}
            </Link>
          </P5Card>
        ))
      )}
      <RideNavigation />
    </AuthScreen>
  );
}
