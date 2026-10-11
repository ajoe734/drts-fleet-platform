import type { CSSProperties, ReactNode } from "react";
import { P5Icon, P5Header, P5Card } from "../p5-ui";
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
  disabled = false,
  onClick,
}: {
  kind?: "primary" | "secondary" | "ghost";
  icon?: string | undefined;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: (() => void) | undefined;
}) {
  // Canonical P5 button appearance with genuine HTML disabled support in the owned surface.
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: "100%",
    minHeight: 46,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "inherit",
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
      kind === "secondary" ? (danger ? P5.dangerBd : P5.line) : "transparent",
    cursor: disabled ? "not-allowed" : "pointer",
  };
  if (disabled) {
    style.background = P5.line;
    style.color = P5.mut;
  }
  return (
    <button
      type="button"
      style={style}
      disabled={disabled}
      aria-disabled={disabled}
      onClick={onClick}
    >
      {icon && <P5Icon name={icon} size={15} />}
      {children}
    </button>
  );
}
export function AuthScreen({
  title,
  children,
  entry = false,
  account = false,
}: {
  title: string;
  children: ReactNode;
  entry?: boolean;
  account?: boolean;
}) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: P5.bg,
        color: P5.ink,
        fontFamily: '"Inter","Noto Sans TC",system-ui,sans-serif',
        display: "flex",
        flexDirection: "column",
      }}
    >
      <P5Header status={title} order="" />
      <div
        style={{
          padding: account ? "16px 0" : entry ? "32px 14px" : "24px 14px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: entry ? 12 : 16,
        }}
      >
        {children}
      </div>
    </main>
  );
}
export function AuthAlert({
  children,
  kind = "danger",
}: {
  children: ReactNode;
  kind?: "danger" | "warn" | "info";
}) {
  const colors =
    kind === "warn"
      ? [P5.warnBg, P5.warnBd, P5.warn]
      : kind === "info"
        ? [P5.brandBg, P5.brandBg, P5.brand]
        : [P5.dangerBg, P5.dangerBd, P5.danger];
  return (
    <div
      role="alert"
      style={{
        padding: "12px 16px",
        background: colors[0],
        border: `1px solid ${colors[1]}`,
        borderRadius: 12,
        color: colors[2],
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}
export const inputStyle: CSSProperties = {
  width: "100%",
  background: P5.surface,
  border: `1px solid ${P5.line}`,
  padding: "12px 16px",
  borderRadius: 12,
  fontSize: 18,
  boxSizing: "border-box",
};
export { P5Card, P5Icon };
