import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import {
  initializeDriverLocationHeartbeat,
  syncDriverLocationHeartbeat,
} from "@/lib/driver-location-heartbeat";
import { syncDriverIdentityBootstrap } from "@/lib/driver-identity-bootstrap";
import { resetDriverAppToOnboarding } from "@/lib/driver-identity-routing";
import {
  getDriverClient,
  getDriverIdentityIssue,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";

const DRIVER_SESSION_REVALIDATE_INTERVAL_MS = 10 * 60 * 1000;

export const unstable_settings = {
  initialRouteName: "onboarding",
};

function DriverHeartbeatBootstrap() {
  const router = useRouter();

  useEffect(() => {
    initializeDriverLocationHeartbeat();

    let cancelled = false;

    const syncWithActiveTrip = async () => {
      await syncDriverIdentityBootstrap({
        cancelled: () => cancelled,
        getDriverIdentityIssue,
        initializeDriverIdentity,
        isDriverIdentityProvisioned,
        listDriverTasks: () => getDriverClient().listDriverTasks(),
        onWarning: (error) => {
          console.warn("Driver heartbeat bootstrap sync failed", error);
        },
        resetDriverAppToOnboarding,
        router,
        syncDriverLocationHeartbeat,
      });
    };

    void syncWithActiveTrip();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void syncWithActiveTrip();
      }
    });
    const refreshInterval = setInterval(() => {
      void syncWithActiveTrip();
    }, DRIVER_SESSION_REVALIDATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(refreshInterval);
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <>
      <DriverHeartbeatBootstrap />
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: "#f8fafc",
          },
          headerTintColor: "#0f172a",
          contentStyle: {
            backgroundColor: "#f4f7fb",
          },
        }}
      />
    </>
  );
}
