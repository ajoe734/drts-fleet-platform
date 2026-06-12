import { getTenantProgramTheme } from "@/lib/program-route-context";
import { ProgramBookingFlow } from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function ProgramSiteFlowPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug);
  return (
    <ProgramBookingFlow
      theme={theme}
      screen="landing"
      basePath={`/${tenantSlug}/program/site`}
      locale={locale}
      surface="site"
    />
  );
}
