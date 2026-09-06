import type { CSSProperties, ReactNode } from "react";
import type { StatusToneName, ToneRamp } from "@drts/ui-tokens";

export type RuntimeEnvironment =
  | "production"
  | "staging"
  | "preview"
  | "sandbox"
  | "dev"
  | "mock"
  | "unknown";

export type RuntimeHealthStatus =
  | "healthy"
  | "degraded"
  | "down"
  | "checking"
  | "unknown";

export type EnvironmentBadgeDensity = "comfortable" | "compact";
export type EnvironmentBadgeMode = "light" | "dark";

export interface EnvironmentResolutionInput {
  env?: string | null | undefined;
  nodeEnv?: string | null | undefined;
  appEnv?: string | null | undefined;
  isFixture?: boolean | undefined;
  isMock?: boolean | undefined;
}

export interface HealthResolutionInput {
  status?: unknown;
  responseOk?: boolean | undefined;
}

export interface EnvironmentBadgeProps {
  env?: string | null | undefined;
  health?: RuntimeHealthStatus | string | null | undefined;
  isFixture?: boolean | undefined;
  isMock?: boolean | undefined;
  locale?: "zh-TW" | "zh" | "en" | undefined;
  mode?: EnvironmentBadgeMode | undefined;
  density?: EnvironmentBadgeDensity | undefined;
  showHealth?: boolean | undefined;
  showVersion?: boolean | undefined;
  versionLabel?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  children?: ReactNode;
}
