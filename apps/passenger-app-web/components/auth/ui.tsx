import React, { ReactNode } from "react";
import { P5Icon, P5Card } from "../p5-ui";
import {
  REALM_COLORS,
  STATUS_TONES,
  CORE_SURFACES,
  CORE_FOREGROUNDS,
} from "@drts/ui-tokens";

const pTokens = REALM_COLORS.passenger.light;

export const P5 = {
  bg: STATUS_TONES.neutral.light.bg,
  surface: CORE_SURFACES.surface,
  ink: STATUS_TONES.neutral.dark.bg,
  mut: STATUS_TONES.neutral.light.fg,
  dim: STATUS_TONES.neutral.dark.fg,
  line: STATUS_TONES.neutral.light.border,
  lineSoft: STATUS_TONES.neutral.light.bg,
  brand: pTokens.fg,
  brandDark: pTokens.headerBg,
  brandBg: pTokens.bg,
  ok: STATUS_TONES.success.light.fg,
  okBg: STATUS_TONES.success.light.bg,
  okBd: STATUS_TONES.success.light.border,
  warn: STATUS_TONES.warning.light.fg,
  warnBg: STATUS_TONES.warning.light.bg,
  warnBd: STATUS_TONES.warning.light.border,
  danger: STATUS_TONES.danger.light.fg,
  dangerBg: STATUS_TONES.danger.light.bg,
  dangerBd: STATUS_TONES.danger.light.border,
  mono: '"JetBrains Mono",ui-monospace,monospace',
};

export function P5Btn({
  kind = "secondary",
  icon,
  children,
  danger,
  disabled,
  onClick,
}: {
  kind?: "primary" | "secondary" | "ghost";
  icon?: string;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: (() => void) | undefined;
}) {
  // Same P5Btn presentation, with native disabled semantics in the auth scope.
  // The shared shell button's API is owned by the shell lane.
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        width: "100%",
        minHeight: 46,
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        opacity: disabled ? 0.6 : 1,
        border: "1px solid transparent",
        background:
          kind === "primary"
            ? danger
              ? P5.danger
              : P5.brand
            : kind === "ghost"
              ? "transparent"
              : P5.surface,
        color:
          kind === "primary"
            ? CORE_FOREGROUNDS.foregroundInvert
            : danger
              ? P5.danger
              : kind === "ghost"
                ? P5.mut
                : P5.ink,
        borderColor:
          kind === "secondary"
            ? danger
              ? P5.dangerBd
              : P5.line
            : "transparent",
      }}
    >
      {icon && <P5Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export { P5Card };
