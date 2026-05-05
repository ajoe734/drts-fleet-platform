import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
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

import { tokens } from "@/components/ui/tokens";

const DRIVER_SESSION_REVALIDATE_INTERVAL_MS = 10 * 60 * 1000;

export const unstable_settings = {
  initialRouteName: "onboarding",
};

function allowUnprovisionedRoute(segments: string[]): boolean {
  const topLevelRoute = segments[0];
  return (
    topLevelRoute == null ||
    topLevelRoute === "index" ||
    topLevelRoute === "onboarding"
  );
}

function DriverHeartbeatBootstrap() {
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef<string[]>(segments);

  useEffect(() => {
    segmentsRef.current = [...segments];
  }, [segments]);

  useEffect(() => {
    initializeDriverLocationHeartbeat();

    let cancelled = false;

    const syncWithActiveTrip = async () => {
      await syncDriverIdentityBootstrap({
        allowUnprovisionedRoute: allowUnprovisionedRoute(segmentsRef.current),
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
          headerShown: false,
          headerStyle: {
            backgroundColor: tokens.colors.surface,
          },
          headerTitleStyle: {
            ...tokens.type.sectionTitle,
            color: tokens.colors.textStrong,
          },
          headerTintColor: tokens.colors.primary,
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: tokens.colors.appBg,
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ title: "工作台" }} />
        <Stack.Screen name="jobs" options={{ title: "任務收件匣" }} />
        <Stack.Screen name="trip" options={{ title: "行程作業" }} />
        <Stack.Screen name="incident" options={{ title: "SOS 緊急通報" }} />
        <Stack.Screen name="earnings" options={{ title: "收益儀表板" }} />
        <Stack.Screen
          name="platform-presence"
          options={{ title: "平台上線狀態" }}
        />
        <Stack.Screen name="shift" options={{ title: "班次與出勤" }} />
        <Stack.Screen name="settings" options={{ title: "設定" }} />
      </Stack>
    </>
  );
}
