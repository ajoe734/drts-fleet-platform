import { notFound } from "next/navigation";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import {
  ProgramBookingFlow,
  listProgramScreensForTheme,
  resolveProgramScreenSegment,
} from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string; screen: string }>;
};

export default async function ProgramSiteScreenPage({ params }: PageProps) {
  const { tenantSlug, screen: screenSegment } = await params;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug);
  const screen = resolveProgramScreenSegment(screenSegment);

  if (
    !screen ||
    !listProgramScreensForTheme(theme, "site").some(
      (visibleScreen) => visibleScreen.id === screen,
    )
  ) {
    notFound();
  }

  return (
    <ProgramBookingFlow
      theme={theme}
      screen={screen}
      basePath={`/${tenantSlug}/program/site`}
      locale={locale}
      surface="site"
    />
  );
}
