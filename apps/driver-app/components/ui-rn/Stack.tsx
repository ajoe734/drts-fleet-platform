import React from "react";
import {
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { driverTheme } from "./theme";

interface StackProps extends ViewProps {
  direction?: ViewStyle["flexDirection"];
  gap?: number;
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  wrap?: ViewStyle["flexWrap"];
  style?: StyleProp<ViewStyle>;
}

export function Stack({
  direction = "column",
  gap = driverTheme.layout.contentGap,
  align,
  justify,
  wrap,
  style,
  children,
  ...props
}: StackProps) {
  return (
    <View
      style={[
        {
          flexDirection: direction,
          gap,
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

export function Inline(props: Omit<StackProps, "direction">) {
  return <Stack direction="row" align="center" {...props} />;
}
