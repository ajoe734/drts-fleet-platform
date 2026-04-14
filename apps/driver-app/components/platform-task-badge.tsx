import React from "react";
import { View, Text, StyleSheet } from "react-native";

/**
 * PlatformTaskBadge
 * Renders a small pill badge with the human-readable platform name.
 * When platformCode is null, shows the owned/direct label.
 */
export function PlatformTaskBadge({
  platformCode,
}: {
  platformCode: string | null;
}) {
  const { label, bgColor, textColor } = getBadgeStyle(platformCode);
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function getBadgeStyle(platformCode: string | null) {
  const code = (platformCode ?? "direct").toLowerCase();
  const label = PLATFORM_LABELS[code] ?? code;
  // Owned/direct vs external colors
  const isExternal = code !== "direct" && code !== "owned";
  return {
    label,
    bgColor: isExternal ? "rgb(224, 247, 250)" : "rgb(232, 245, 233)",
    textColor: isExternal ? "rgb(0, 96, 100)" : "rgb(27, 94, 32)",
  };
}

const PLATFORM_LABELS: Record<string, string> = {
  direct: "Direct",
  owned: "Direct",
  // Common 3P platforms
  uber: "Uber",
  lyft: "Lyft",
  grab: "Grab",
  gojek: "Gojek",
  bolt: "Bolt",
  didi: "DiDi",
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
});

export default PlatformTaskBadge;
