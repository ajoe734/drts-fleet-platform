import React from "react";
import { StyleSheet, View, Text, ViewStyle } from "react-native";
import { Tokens } from "./tokens";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  style?: ViewStyle;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  rightElement,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightElement ? (
        <View style={styles.rightElement}>{rightElement}</View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: Tokens.layout.headerHeight,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: Tokens.layout.pagePadding,
    paddingBottom: Tokens.spacing.md,
    paddingTop: Tokens.spacing.lg,
    backgroundColor: Tokens.colors.bgRaised,
    borderBottomWidth: 1,
    borderBottomColor: Tokens.colors.border,
  },
  titleContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    ...Tokens.type.screenTitle,
    color: Tokens.colors.text,
    fontSize: 22,
  },
  subtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  rightElement: {
    marginLeft: Tokens.spacing.md,
  },
});
