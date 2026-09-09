import { REALM_COLORS } from "@drts/ui-tokens";
import { buildEnt, type EntTheme } from "../../lib/enterprise-theme";

/**
 * Tenant-scoped enterprise theme consuming canonical tenant REALM_COLORS from @drts/ui-tokens.
 * Per UI Design Contract (canonical):
 * The visual design source of truth is packages/ui-tokens (realm colors) plus the design canvas.
 * Colors must come from @drts/ui-tokens realm tokens (tenant realm: fg #0F766E, bg #F0FDFA, border #99F6E4).
 */
export function buildTenantEnterpriseTheme({
  dark = false,
  density = "comfy",
}: {
  dark?: boolean;
  density?: "comfy" | "compact";
} = {}): EntTheme {
  const realm = dark ? REALM_COLORS.tenant.dark : REALM_COLORS.tenant.light;
  const base = buildEnt({ dark, density, accent: realm.fg });
  return {
    ...base,
    primary: realm.fg,
    primaryBg: realm.bg,
    primaryBd: realm.border,
  };
}

export const tenantEnterpriseTheme: EntTheme = buildTenantEnterpriseTheme();
