import React from "react";
import {
  Text,
  StyleSheet,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from "react-native";

import {
  driverTheme,
  resolveDriverTextColor,
  type DriverTextTone,
} from "./theme";

export type AppTextVariant = keyof typeof driverTheme.typography;

interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  tone?: DriverTextTone;
  style?: StyleProp<TextStyle>;
}

export function AppText({
  variant = "body",
  tone = "default",
  style,
  children,
  ...props
}: AppTextProps) {
  return (
    <Text
      style={[
        styles.base,
        driverTheme.typography[variant],
        { color: resolveDriverTextColor(tone, driverTheme.mode) },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: driverTheme.fonts.sans,
  },
});
