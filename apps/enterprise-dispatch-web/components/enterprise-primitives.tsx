import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasEmptyState,
  CanvasField,
  CanvasInput,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasSelect,
  CanvasStaleBanner,
  type CanvasBannerProps,
  type CanvasBtnProps,
  type CanvasCardProps,
  type CanvasDLProps,
  type CanvasEmptyStateProps,
  type CanvasFieldProps,
  type CanvasInputProps,
  type CanvasKPIProps,
  type CanvasPageHeaderProps,
  type CanvasPillProps,
  type CanvasSelectProps,
  type CanvasStaleBannerProps,
} from "@drts/ui-web";
import type { CSSProperties, ReactNode } from "react";
import { enterpriseTheme } from "@/lib/enterprise-theme";

export function EnterprisePageHeader(props: CanvasPageHeaderProps) {
  return <CanvasPageHeader theme={enterpriseTheme} {...props} />;
}

export function EnterpriseCard(props: CanvasCardProps) {
  return <CanvasCard theme={enterpriseTheme} {...props} />;
}

export function EnterprisePill(props: CanvasPillProps) {
  return <CanvasPill theme={enterpriseTheme} {...props} />;
}

export function EnterpriseBanner(props: CanvasBannerProps) {
  return <CanvasBanner theme={enterpriseTheme} {...props} />;
}

export function EnterpriseStaleBanner(props: CanvasStaleBannerProps) {
  return <CanvasStaleBanner theme={enterpriseTheme} {...props} />;
}

export function EnterpriseBtn(props: CanvasBtnProps) {
  return <CanvasBtn theme={enterpriseTheme} {...props} />;
}

export function EnterpriseEmptyState(props: CanvasEmptyStateProps) {
  return <CanvasEmptyState theme={enterpriseTheme} {...props} />;
}

export function EnterpriseKpi(props: CanvasKPIProps) {
  return <CanvasKPI theme={enterpriseTheme} {...props} />;
}

export function EnterpriseDl(props: CanvasDLProps) {
  return <CanvasDL theme={enterpriseTheme} {...props} />;
}

export function EnterpriseField(props: CanvasFieldProps) {
  return <CanvasField theme={enterpriseTheme} {...props} />;
}

export function EnterpriseInput(props: CanvasInputProps) {
  return <CanvasInput theme={enterpriseTheme} {...props} />;
}

export function EnterpriseSelect(props: CanvasSelectProps) {
  return <CanvasSelect theme={enterpriseTheme} {...props} />;
}

export function EnterpriseKpiGrid({
  children,
  minWidth = 220,
}: {
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

export function EnterpriseSection({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0, ...style }}>
      {children}
    </div>
  );
}
