import { notFound } from "next/navigation";
import { getProgramThemeForSlug } from "@/lib/program-theme";
import {
  listProgramScreensForTheme,
  ProgramBookingFlow,
  resolveProgramScreenSegment,
} from "@/lib/program-screens";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string; screen: string }>;
};

export default async function ProgramScreenPage({ params }: PageProps) {
  const { tenantSlug, screen } = await params;
  const screenId = resolveProgramScreenSegment(screen);
  if (!screenId) {
    notFound();
  }

  const theme = getProgramThemeForSlug(tenantSlug);
  if (!listProgramScreensForTheme(theme).some((meta) => meta.id === screenId)) {
    notFound();
  }
  const resolvedScreen = screenId;
  return (
    <ProgramBookingFlow
      theme={theme}
      screen={resolvedScreen}
      basePath={`/${tenantSlug}/program`}
    />
  );
}
