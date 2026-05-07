import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AuthorityBanner, StatusChip, Tokens } from "@/components/ui";

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
  const normalizedCode = platformCode?.trim().toLowerCase() ?? "owned";
  const code = normalizedCode.length > 0 ? normalizedCode : "owned";
  const label = PLATFORM_LABELS[code] ?? humanizePlatformCode(code);

  if (code === "owned" || code === "direct") {
    return <StatusChip label={label} variant="success" />;
  }

  return (
    <View style={styles.externalBadge}>
      <Text style={styles.externalBadgePrefix}>來源平台</Text>
      <Text style={styles.externalBadgeText}>{label}</Text>
    </View>
  );
}

export function PlatformAuthorityBanner({
  platformCode,
  description,
}: {
  platformCode: string | null;
  description: string;
}) {
  const normalizedCode = platformCode?.trim().toLowerCase() ?? "owned";
  const code = normalizedCode.length > 0 ? normalizedCode : "owned";
  const label = PLATFORM_LABELS[code] ?? humanizePlatformCode(code);

  if (code === "owned" || code === "direct") {
    return (
      <AuthorityBanner
        title="DRTS 自營任務"
        authorityLabel="本地可操作"
        description={description}
        tone="owned"
        icon="shield-checkmark"
      />
    );
  }

  return (
    <AuthorityBanner
      title={`${label} 平台任務`}
      authorityLabel="平台主導"
      description={description}
      tone="platform"
      icon="swap-horizontal"
    />
  );
}

const styles = StyleSheet.create({
  externalBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    backgroundColor: "#E6F7FA",
    borderWidth: 1,
    borderColor: "#B6E3EA",
    gap: 4,
  },
  externalBadgePrefix: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  externalBadgeText: {
    ...Tokens.type.micro,
    color: "#0B7285",
    fontWeight: "600",
  },
});

export default PlatformTaskBadge;
