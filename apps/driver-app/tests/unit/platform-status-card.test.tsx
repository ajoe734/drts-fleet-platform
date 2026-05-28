import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";

vi.mock("react-native", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  View: "View",
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) =>
    React.createElement("Ionicons", props),
}));

vi.mock("@/components/ui", () => ({
  PlatformHealthCard: (props: Record<string, unknown>) =>
    React.createElement("PlatformHealthCard", props),
  PlatformBadge: (props: Record<string, unknown>) =>
    React.createElement("PlatformBadge", props),
  StatusChip: (props: Record<string, unknown>) =>
    React.createElement("StatusChip", props),
  Tokens: {
    colors: {
      primary: "#1d4ed8",
      warning: "#b45309",
      danger: "#b91c1c",
      success: "#15803d",
      surfaceWarning: "#fef3c7",
      surfaceDanger: "#fee2e2",
      surfaceMuted: "#f3f4f6",
      border: "#d1d5db",
      borderStrong: "#9ca3af",
      textBody: "#111827",
      textMuted: "#6b7280",
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
    },
    type: {
      label: {},
      small: {},
    },
    radius: {
      full: 999,
      sm: 8,
    },
  },
}));

import { PlatformStatusActionButton } from "../../components/platform-status-card";

describe("PlatformStatusActionButton", () => {
  it("does not fire the native action when the descriptor disables it", () => {
    const onPress = vi.fn();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        React.createElement(PlatformStatusActionButton, {
          descriptor: { availability: "disabled" },
          action: {
            key: "reauth",
            icon: "refresh",
            label: "重新驗證",
            onPress,
          },
        }),
      );
    });

    const button = renderer!.root.findByProps({
      accessibilityLabel: "重新驗證",
    });

    expect(button.props.disabled).toBe(true);

    button.props.onPress();

    expect(onPress).not.toHaveBeenCalled();
  });
});
