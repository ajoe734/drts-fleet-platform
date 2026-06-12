import { notFound } from "next/navigation";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import {
  listProgramScreensForTheme,
  ProgramBookingFlow,
  resolveProgramScreenSegment,
} from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string; screen: string }>;
};

export default async function ProgramSiteScreenPage({ params }: PageProps) {
  const { tenantSlug, screen } = await params;
  const locale = await getServerLocale();
  const screenId = resolveProgramScreenSegment(screen);
  if (!screenId) {
    notFound();
  }

  const theme = await getTenantProgramTheme(tenantSlug);
  if (
    !listProgramScreensForTheme(theme, "site").some(
      (meta) => meta.id === screenId,
    )
  ) {
    notFound();
  }

  return (
    <ProgramBookingFlow
      theme={theme}
      screen={screenId}
      basePath={`/${tenantSlug}/program/site`}
      locale={locale}
      surface="site"
    />
  );
}
