import { getPartnerRouteContext } from "@/lib/api-client";
import {
  getProgramThemeForTenantSlug,
  type PartnerProgramTheme,
} from "@/lib/program-theme";

export async function getTenantProgramTheme(
  tenantSlug: string,
): Promise<PartnerProgramTheme> {
  const { brand } = await getPartnerRouteContext(tenantSlug, {
    allowInactive: true,
    allowMissing: true,
  });
  return getProgramThemeForTenantSlug(tenantSlug, brand);
}
