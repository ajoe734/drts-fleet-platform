import type { ReactNode } from "react";
import {
  MANAGEMENT_SPACING,
  densityValue,
  type ManagementDensity,
} from "./management-theme";
import type { PageMetaItem, SectionHeaderProps } from "./management-primitives";
import { SectionHeader } from "./management-primitives";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  meta?: PageMetaItem[];
  density?: ManagementDensity;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  meta,
  density = "comfortable",
}: PageHeaderProps) {
  const headerProps = {
    title,
    ...(eyebrow !== undefined ? { eyebrow } : {}),
    ...(subtitle !== undefined ? { subtitle } : {}),
    ...(actions !== undefined ? { actions } : {}),
    ...(meta !== undefined ? { meta } : {}),
  } satisfies SectionHeaderProps;

  return (
    <div
      style={{
        marginBottom: densityValue(
          density,
          MANAGEMENT_SPACING.pageHeaderMarginBottom,
        ),
      }}
    >
      <SectionHeader {...headerProps} />
    </div>
  );
}
