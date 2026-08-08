"use client";

import { CanvasBtn, type CanvasIconName } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";

export interface FleetActionButtonDescriptor {
  action: string;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel?: "low" | "medium" | "high";
}

export function FleetActionButton({
  descriptor,
  label,
  en,
  icon,
  size = "sm",
  variant,
  pending = false,
  onClick,
}: {
  descriptor: FleetActionButtonDescriptor;
  label: string;
  en?: string;
  icon?: CanvasIconName;
  size?: "xs" | "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  pending?: boolean;
  onClick?: () => void;
}) {
  const theme = buildFleetTheme();
  const resolvedVariant =
    variant ??
    (descriptor.riskLevel === "medium" ? "primary" : "secondary");
  const disabled = pending || !descriptor.enabled;
  const isHighRisk = descriptor.riskLevel === "high";

  return (
    <CanvasBtn
      theme={theme}
      size={size}
      variant={resolvedVariant}
      danger={isHighRisk}
      disabled={disabled}
      {...(descriptor.enabled && !pending && onClick ? { onClick } : {})}
      {...(icon ? { icon } : {})}
    >
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
        <span>{label}</span>
        {en ? (
          <span
            style={{
              fontSize: Math.max(size === "xs" ? 9 : 10, 9),
              opacity: 0.72,
              fontFamily: theme.monoFamily,
            }}
          >
            · {en}
          </span>
        ) : null}
      </span>
      {descriptor.requiresReason && descriptor.enabled ? (
        <span
          title="requires reason"
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: "currentColor",
            opacity: 0.6,
            marginLeft: 2,
          }}
        />
      ) : null}
      {!descriptor.enabled && descriptor.disabledReasonCode ? (
        <span
          style={{
            fontSize: size === "xs" ? 9 : 10,
            color: theme.textDim,
            marginLeft: 2,
          }}
        >
          ({descriptor.disabledReasonCode})
        </span>
      ) : null}
    </CanvasBtn>
  );
}
