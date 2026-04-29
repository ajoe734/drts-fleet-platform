import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import {
  initializeDriverLocationHeartbeat,
  syncDriverLocationHeartbeat,
} from "@/lib/driver-location-heartbeat";
import { getDriverClient, initializeDriverIdentity } from "@/lib/api-client";

export const unstable_settings = {
  initialRouteName: "onboarding",
};

function DriverHeartbeatBootstrap() {
  useEffect(() => {
    initializeDriverLocationHeartbeat();

    let cancelled = false;

    const syncWithActiveTrip = async () => {
      try {
        await initializeDriverIdentity();
        const tasks = await getDriverClient().listDriverTasks();
        const activeTask =
          tasks.find((task) => task.status === "on_trip") ?? null;

        if (cancelled) {
          return;
        }

        await syncDriverLocationHeartbeat(
          activeTask
            ? {
                taskId: activeTask.taskId,
                driverId: activeTask.driverId,
              }
            : null,
        );
      } catch (error) {
        console.warn("Driver heartbeat bootstrap sync failed", error);
      }
    };

    void syncWithActiveTrip();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void syncWithActiveTrip();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

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
