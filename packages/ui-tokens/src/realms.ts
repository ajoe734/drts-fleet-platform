import type { TokenMode, ToneRamp } from "./colors";
import type { LocalizedDisplayString } from "./status";

/**
 * Actor realm colors — cross-actor audit chips (design canvas mgmt-tokens.jsx
 * `REALM_COLORS`, authority-doc Q-TEN13). These badge tones identify which
 * realm an actor belongs to in cross-actor audit timelines and identity chips,
 * and are shared across the ops / admin / tenant / partner / fleet consoles.
 */
export type RealmName = "tenant" | "ops" | "platform" | "system" | "driver";

export const REALM_COLORS = {
  tenant: {
    light: { fg: "#0F766E", bg: "#F0FDFA", border: "#99F6E4" },
    dark: { fg: "#5EEAD4", bg: "#0F2A28", border: "#134E48" },
  },
  ops: {
    light: { fg: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
    dark: { fg: "#FCA5A5", bg: "#3F1212", border: "#5C1A1A" },
  },
  platform: {
    light: { fg: "#4F46E5", bg: "#EEF2FF", border: "#C7D2FE" },
    dark: { fg: "#A5B4FC", bg: "#1E1B4B", border: "#312E81" },
  },
  system: {
    light: { fg: "#6B7280", bg: "#F1F4F8", border: "#CBD5E1" },
    dark: { fg: "#94A3B8", bg: "#1A2230", border: "#2A3445" },
  },
  driver: {
    light: { fg: "#A8590B", bg: "#FCEED6", border: "#F0CC95" },
    dark: { fg: "#FCD34D", bg: "#3A2A0A", border: "#5C4218" },
  },
} as const satisfies Record<RealmName, Record<TokenMode, ToneRamp>>;

export const REALM_NAMES = [
  "tenant",
  "ops",
  "platform",
  "system",
  "driver",
] as const satisfies readonly RealmName[];

export const REALM_DISPLAY_STRINGS = {
  tenant: { en: "Tenant", zhTW: "租戶" },
  ops: { en: "Ops", zhTW: "營運" },
  platform: { en: "Platform", zhTW: "平台" },
  system: { en: "System", zhTW: "系統" },
  driver: { en: "Driver", zhTW: "司機" },
} as const satisfies Record<RealmName, LocalizedDisplayString>;

export function isRealmName(value: string): value is RealmName {
  return (REALM_NAMES as readonly string[]).includes(value);
}
