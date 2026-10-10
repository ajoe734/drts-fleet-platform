import React, { ReactNode } from "react";
import { P5Btn as BaseP5Btn, P5Card } from "../../components/p5-ui";
import { REALM_COLORS, STATUS_TONES, CORE_SURFACES } from "@drts/ui-tokens";

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
  return (
    <div
      style={{
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? "none" : "auto",
        width: "100%",
      }}
    >
      <BaseP5Btn
        {...(kind !== undefined && { kind })}
        {...(icon !== undefined && { icon })}
        {...(danger !== undefined && { danger })}
        {...(!disabled && onClick && { onClick })}
      >
        {children}
      </BaseP5Btn>
    </div>
  );
}

export { P5Card };
