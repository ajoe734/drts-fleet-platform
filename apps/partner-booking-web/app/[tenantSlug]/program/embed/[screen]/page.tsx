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
  searchParams: Promise<{
    eligibilityVerificationId?: string | string[];
  }>;
};

function resolveEmbedScreen(segment: string) {
  return (
    resolveProgramScreenSegment(segment) ??
    resolveProgramScreenSegment(`embed-${segment}`)
  );
}

function readFirst(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProgramEmbedScreenPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug, screen: screenSegment } = await params;
  const resolvedSearchParams = await searchParams;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug, {
    requireActiveEntry: true,
  });
  const screen = resolveEmbedScreen(screenSegment);
  const eligibilityVerificationId = readFirst(
    resolvedSearchParams.eligibilityVerificationId,
  );
  const persistentQuery = eligibilityVerificationId
    ? new URLSearchParams({ eligibilityVerificationId }).toString()
    : null;

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
      {...(persistentQuery ? { persistentQuery } : {})}
      surface="embed"
    />
  );
}
