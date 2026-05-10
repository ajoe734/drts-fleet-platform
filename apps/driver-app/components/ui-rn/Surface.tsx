import React from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { driverTheme, resolveDriverTone, type DriverThemeTone } from "./theme";

interface SurfaceProps extends ViewProps {
  tone?: DriverThemeTone;
  elevated?: boolean;
  padding?: number;
  emphasizeEdge?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Surface({
  tone,
  elevated = true,
  padding = driverTheme.layout.cardPadding,
  emphasizeEdge = false,
  style,
  children,
  ...props
}: SurfaceProps) {
  const resolvedTone = tone
    ? resolveDriverTone(tone, driverTheme.mode)
    : undefined;

  return (
    <View
      style={[
        styles.base,
        elevated ? driverTheme.shadows.sm : styles.flat,
        {
          backgroundColor:
            resolvedTone?.backgroundColor ?? driverTheme.colors.surface,
          borderColor: resolvedTone?.borderColor ?? driverTheme.colors.border,
          borderLeftColor: emphasizeEdge
            ? (resolvedTone?.foregroundColor ?? driverTheme.colors.border)
            : (resolvedTone?.borderColor ?? driverTheme.colors.border),
          borderLeftWidth: emphasizeEdge ? 3 : 1,
          padding,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: driverTheme.radius.lg,
    borderWidth: 1,
  },
  flat: {
    elevation: 0,
    shadowOpacity: 0,
  },
});
