import React from "react";
import {
  StyleSheet,
  View,
  ViewStyle,
  SafeAreaView,
  Text,
  type DimensionValue,
} from "react-native";
import { ActionButton, type ActionButtonVariant } from "./ActionButton";
import { Tokens } from "./tokens";

interface StickyActionConfig {
  title: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  icon?: React.ComponentProps<typeof ActionButton>["icon"];
  loading?: boolean;
  disabled?: boolean;
  width?: DimensionValue;
}

interface BottomActionBarProps {
  children?: React.ReactNode;
  style?: ViewStyle;
  notice?: string;
  primaryAction?: StickyActionConfig;
  secondaryAction?: StickyActionConfig;
}

export const BottomActionBar: React.FC<BottomActionBarProps> = ({
  children,
  style,
  notice,
  primaryAction,
  secondaryAction,
}) => {
  const hasConfiguredActions = Boolean(primaryAction || secondaryAction);
  const secondaryActionStyle: ViewStyle | undefined = secondaryAction?.width
    ? { flex: 0, width: secondaryAction.width }
    : undefined;
  const primaryActionStyle: ViewStyle | undefined = primaryAction?.width
    ? { flex: 0, width: primaryAction.width }
    : undefined;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.container, style]}>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {hasConfiguredActions ? (
          <View style={styles.actionRow}>
            {secondaryAction ? (
              <ActionButton
                title={secondaryAction.title}
                onPress={secondaryAction.onPress}
                variant={secondaryAction.variant ?? "secondary"}
                icon={secondaryAction.icon}
                loading={secondaryAction.loading}
                disabled={secondaryAction.disabled}
                style={[styles.actionButton, secondaryActionStyle]}
              />
            ) : null}
            {primaryAction ? (
              <ActionButton
                title={primaryAction.title}
                onPress={primaryAction.onPress}
                variant={primaryAction.variant ?? "primary"}
                icon={primaryAction.icon}
                loading={primaryAction.loading}
                disabled={primaryAction.disabled}
                style={[styles.actionButton, primaryActionStyle]}
              />
            ) : null}
          </View>
        ) : null}

        {children ? <View style={styles.childrenRow}>{children}</View> : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
  },
  container: {
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  notice: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  childrenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
