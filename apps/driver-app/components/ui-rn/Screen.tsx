import React from "react";
import {
  SafeAreaView,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { driverTheme } from "./theme";
import {
  KeyboardAvoidingContainer,
  type KeyboardAvoidingBehavior,
} from "../ui/KeyboardAvoidingContainer";

export interface ScreenProps {
  children?: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  keyboardVerticalOffset?: number;
  behavior?: KeyboardAvoidingBehavior;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  extraBottomSpacing?: number;
}

export function Screen({
  children,
  footer,
  scrollable = true,
  style,
  contentContainerStyle,
  backgroundColor = driverTheme.colors.appBackground,
  keyboardVerticalOffset,
  behavior,
  keyboardShouldPersistTaps = "handled",
  extraBottomSpacing,
}: ScreenProps) {
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor }]}>
      <KeyboardAvoidingContainer
        scrollable={scrollable}
        style={style}
        contentContainerStyle={[
          {
            paddingHorizontal: driverTheme.layout.pagePadding,
            paddingTop: driverTheme.spacing.sm,
            paddingBottom: driverTheme.spacing["3xl"],
            gap: driverTheme.layout.contentGap,
          },
          contentContainerStyle,
        ]}
        keyboardVerticalOffset={keyboardVerticalOffset}
        behavior={behavior}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        extraBottomSpacing={extraBottomSpacing}
        footer={footer}
      >
        {children}
      </KeyboardAvoidingContainer>
    </SafeAreaView>
  );
}
