import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Tokens } from "./tokens";

export interface PlatformBadgeProps {
  code?: string;
  name: string;
  forwarded?: boolean;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}

export function PlatformBadge({
  code = "DR",
  name,
  forwarded = false,
  size = "md",
  style,
}: PlatformBadgeProps) {
  const tone = forwarded ? forwardedTone : ownedTone;
  const compact = size === "sm";

  return (
    <View
      style={[
        styles.container,
        compact ? styles.containerSmall : null,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.mark,
          compact ? styles.markSmall : null,
          { backgroundColor: tone.textColor },
        ]}
      >
        <Text style={[styles.markText, compact ? styles.markTextSmall : null]}>
          {code.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <Text
        style={[
          styles.label,
          compact ? styles.labelSmall : null,
          { color: tone.textColor },
        ]}
      >
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 3,
    borderRadius: Tokens.radius.pill,
    borderWidth: 1,
  },
  containerSmall: {
    paddingRight: 7,
    paddingVertical: 2,
  },
  mark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  markSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  markText: {
    ...Tokens.type.code,
    color: Tokens.colors.textInverse,
    fontSize: 10,
    lineHeight: 12,
  },
  markTextSmall: {
    fontSize: 9,
    lineHeight: 11,
  },
  label: {
    ...Tokens.type.label,
    fontWeight: "600",
  },
  labelSmall: {
    fontSize: 11,
    lineHeight: 14,
  },
});

const ownedTone = {
  backgroundColor: Tokens.colors.ownedBg,
  borderColor: Tokens.colors.ownedBorder,
  textColor: Tokens.colors.owned,
};

const forwardedTone = {
  backgroundColor: Tokens.colors.forwardedBg,
  borderColor: Tokens.colors.forwardedBorder,
  textColor: Tokens.colors.forwarded,
};
