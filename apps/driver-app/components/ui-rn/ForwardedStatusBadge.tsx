import React from "react";
import { type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import type { ForwardedStatus } from "@drts/ui-tokens";

import { Badge } from "./Badge";
import type { DriverLocale } from "./theme";

type ForwardedStatusBadgeProps = {
  status: ForwardedStatus;
  locale?: DriverLocale;
  strong?: boolean;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function ForwardedStatusBadge({
  status,
  locale = "zhTW",
  ...props
}: ForwardedStatusBadgeProps) {
  return <Badge forwardedStatus={status} locale={locale} {...props} />;
}
