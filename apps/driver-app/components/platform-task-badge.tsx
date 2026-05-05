import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { StatusChip, Tokens } from "@/components/ui";

const PLATFORM_LABELS: Record<string, string> = {
  direct: "自營派單",
  owned: "自營派單",
  uber: "Uber",
  lyft: "Lyft",
  grab: "Grab",
  gojek: "Gojek",
  bolt: "Bolt",
  didi: "DiDi",
};

function humanizePlatformCode(platformCode: string) {
  return platformCode
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function PlatformTaskBadge({
  platformCode,
}: {
  platformCode: string | null;
}) {
  const code = (platformCode ?? "owned").toLowerCase();
  const label = PLATFORM_LABELS[code] ?? humanizePlatformCode(code);

  if (code === "owned" || code === "direct") {
    return <StatusChip label={label} variant="success" />;
  }

  return (
    <View style={styles.externalBadge}>
      <Text style={styles.externalBadgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  externalBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    backgroundColor: "#E6F7FA",
  },
  externalBadgeText: {
    ...Tokens.type.micro,
    color: "#0B7285",
    fontWeight: "600",
  },
});

export default PlatformTaskBadge;
