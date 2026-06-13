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

function resolveEmbedScreen(segment: string) {
  return (
    resolveProgramScreenSegment(segment) ??
    resolveProgramScreenSegment(`embed-${segment}`)
  );
}

export default async function ProgramEmbedScreenPage({ params }: PageProps) {
  const { tenantSlug, screen: screenSegment } = await params;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug);
  const screen = resolveEmbedScreen(screenSegment);

  if (
    theme.kind !== "card" ||
    !screen ||
    !listProgramScreensForTheme(theme, "embed").some(
      (visibleScreen) => visibleScreen.id === screen,
    )
  ) {
    notFound();
  }

  return (
    <ProgramBookingFlow
      theme={theme}
      screen={screen}
      basePath={`/${tenantSlug}/program/embed`}
      locale={locale}
      surface="embed"
    />
  );
}
