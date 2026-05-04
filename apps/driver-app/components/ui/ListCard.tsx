import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "./tokens";

interface ListCardProps {
  title: string;
  subtitle?: string;
  statusArea?: React.ReactNode;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function ListCard({
  title,
  subtitle,
  statusArea,
  onPress,
  icon,
}: ListCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={styles.content}>
        {icon ? (
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={20} color={tokens.colors.primary} />
          </View>
        ) : null}
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {statusArea ? (
          <View style={styles.statusArea}>{statusArea}</View>
        ) : null}
        {onPress ? (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={tokens.colors.textMuted}
            style={styles.chevron}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing[16],
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    marginBottom: tokens.spacing[12],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  pressed: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    marginRight: tokens.spacing[12],
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...tokens.type.bodyBold,
    color: tokens.colors.textStrong,
  },
  subtitle: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[2],
  },
  statusArea: {
    marginLeft: tokens.spacing[12],
  },
  chevron: {
    marginLeft: tokens.spacing[8],
  },
});
