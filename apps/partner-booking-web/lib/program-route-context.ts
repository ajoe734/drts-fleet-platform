import {
  getPartnerRouteContext,
  type PartnerRouteContext,
} from "@/lib/api-client";
import {
  getProgramThemeForTenantSlug,
  type PartnerProgramTheme,
} from "@/lib/program-theme";

export type TenantProgramRouteContext = PartnerRouteContext & {
  theme: PartnerProgramTheme;
};

export async function getTenantProgramRouteContext(
  tenantSlug: string,
): Promise<TenantProgramRouteContext> {
  const routeContext = await getPartnerRouteContext(tenantSlug, {
    allowInactive: true,
    allowMissing: true,
  });

  return {
    ...routeContext,
    theme: getProgramThemeForTenantSlug(tenantSlug, routeContext.brand),
  };
}

export async function getTenantProgramTheme(
  tenantSlug: string,
): Promise<PartnerProgramTheme> {
  const { theme } = await getTenantProgramRouteContext(tenantSlug);
  return theme;
}
