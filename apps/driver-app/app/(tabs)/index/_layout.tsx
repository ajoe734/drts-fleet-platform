import { Stack } from "expo-router";

import { driverStackScreenOptions } from "@/lib/theme";
import { driverRouteTitles } from "@/lib/strings";

export const unstable_settings = {
  initialRouteName: "onboarding",
};

export default function WorkspaceStackLayout() {
  return (
    <Stack screenOptions={driverStackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="onboarding"
        options={{ title: driverRouteTitles.onboarding }}
      />
      <Stack.Screen name="sos" options={{ title: driverRouteTitles.sos }} />
      <Stack.Screen
        name="earnings"
        options={{ title: driverRouteTitles.earnings }}
      />
      <Stack.Screen name="shift" options={{ title: driverRouteTitles.shift }} />
    </Stack>
  );
}
