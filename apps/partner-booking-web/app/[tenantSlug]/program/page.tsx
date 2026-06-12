import { getProgramThemeForSlug } from "@/lib/program-theme";
import { ProgramBookingFlow } from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function ProgramFlowPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const locale = await getServerLocale();
  const theme = getProgramThemeForSlug(tenantSlug);
  return (
    <ProgramBookingFlow
      theme={theme}
      screen="landing"
      basePath={`/${tenantSlug}/program`}
      locale={locale}
    />
  );
}
