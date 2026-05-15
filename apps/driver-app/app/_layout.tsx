import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "@react-navigation/native";
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

import { driverNavigationTheme, driverTheme } from "@/lib/theme";
import { driverRouteTitles } from "@/lib/strings";

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
    <ThemeProvider value={driverNavigationTheme}>
      <DriverHeartbeatBootstrap />
      <StatusBar style={driverTheme.mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: {
            backgroundColor: driverTheme.colors.bgRaised,
          },
          headerTitleStyle: {
            ...driverTheme.typography.sectionTitle,
            color: driverTheme.colors.textStrong,
          },
          headerTintColor: driverTheme.colors.primary,
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: driverTheme.colors.appBackground,
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="onboarding"
          options={{ title: driverRouteTitles.onboarding }}
        />
        <Stack.Screen name="jobs" options={{ title: driverRouteTitles.jobs }} />
        <Stack.Screen name="trip" options={{ title: driverRouteTitles.trip }} />
        <Stack.Screen
          name="incident"
          options={{ title: driverRouteTitles.incident }}
        />
        <Stack.Screen
          name="earnings"
          options={{ title: driverRouteTitles.earnings }}
        />
        <Stack.Screen
          name="platform-presence"
          options={{ title: driverRouteTitles.platformPresence }}
        />
        <Stack.Screen
          name="shift"
          options={{ title: driverRouteTitles.shift }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: driverRouteTitles.settings }}
        />
      </Stack>
    </ThemeProvider>
  );
}
