import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "./tokens";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
}: PageHeaderProps) {
  return (
    <View style={styles.container}>
      {leftAction ? <View style={styles.leftAction}>{leftAction}</View> : null}
      <View
        style={[
          styles.titleContainer,
          leftAction ? styles.titleWithLeftAction : null,
          rightAction ? styles.titleWithRightAction : null,
        ]}
      >
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightAction ? (
        <View style={styles.rightAction}>{rightAction}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: tokens.spacing[20],
    backgroundColor: tokens.colors.appBg,
    paddingHorizontal: tokens.spacing[16], // Added horizontal padding for better spacing
  },
  titleContainer: {
    flex: 1,
  },
  titleWithLeftAction: {
    marginLeft: tokens.spacing[12],
  },
  titleWithRightAction: {
    marginRight: tokens.spacing[12],
  },
  title: {
    ...tokens.type.screenTitle,
    color: tokens.colors.textStrong,
  },
  subtitle: {
    ...tokens.type.label,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing[4],
  },
  leftAction: {
    marginRight: tokens.spacing[12],
  },
  rightAction: {
    marginLeft: tokens.spacing[12],
  },
});
