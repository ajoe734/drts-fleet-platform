import { AirportTransferSite } from "@/components/airport-transfer-site";
import { getAirportBank } from "@/lib/airport-site-data";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import { ProgramBookingFlow } from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function ProgramSiteFlowPage({ params }: PageProps) {
  const { tenantSlug } = await params;

  // Card-airport issuer banks render the faithful standalone airport-transfer
  // website (per docs/05-ui/drts-design-canvas/bank-sites). Non-card programs
  // (insurance / travel) keep the shared themed funnel.
  const bank = getAirportBank(tenantSlug);
  if (bank) {
    return <AirportTransferSite bank={bank} mode="site" />;
  }

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
