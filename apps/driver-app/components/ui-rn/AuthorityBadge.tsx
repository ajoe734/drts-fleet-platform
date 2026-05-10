import React from "react";
import { type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import type { AuthorityKind } from "@drts/ui-tokens";

import { Badge } from "./Badge";
import { resolveAuthorityLabel, type DriverLocale } from "./theme";

type AuthorityBadgeProps = {
  authority: AuthorityKind;
  locale?: DriverLocale;
  strong?: boolean;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function AuthorityBadge({
  authority,
  locale = "zhTW",
  ...props
}: AuthorityBadgeProps) {
  return (
    <Badge
      label={resolveAuthorityLabel(authority, locale)}
      tone={authority}
      {...props}
    />
  );
}
