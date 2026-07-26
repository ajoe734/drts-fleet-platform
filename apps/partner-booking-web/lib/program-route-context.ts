import { getPartnerRouteContext } from "@/lib/api-client";
import {
  getProgramThemeForTenantSlug,
  type PartnerProgramTheme,
} from "@/lib/program-theme";

export async function getTenantProgramTheme(
  tenantSlug: string,
  options?: {
    requireActiveEntry?: boolean;
  },
): Promise<PartnerProgramTheme> {
  const { brand } = await getPartnerRouteContext(
    tenantSlug,
    options?.requireActiveEntry
      ? undefined
      : {
          allowInactive: true,
          allowMissing: true,
        },
  );
  return getProgramThemeForTenantSlug(tenantSlug, brand);
}
