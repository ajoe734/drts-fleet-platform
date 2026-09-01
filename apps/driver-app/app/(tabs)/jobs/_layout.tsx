import { Stack } from "expo-router";

import { driverStackScreenOptions } from "@/lib/theme";
import { driverRouteTitles } from "@/lib/strings";

export default function JobsStackLayout() {
  return (
    <Stack screenOptions={driverStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: driverRouteTitles.jobs }} />
    </Stack>
  );
}
