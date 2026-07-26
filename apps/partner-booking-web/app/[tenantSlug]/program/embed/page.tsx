import { notFound } from "next/navigation";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import { ProgramBookingFlow } from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<{
    eligibilityVerificationId?: string | string[];
  }>;
};

export default async function ProgramEmbedFlowPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const eligibilityVerificationId = Array.isArray(
    resolvedSearchParams?.eligibilityVerificationId,
  )
    ? resolvedSearchParams.eligibilityVerificationId[0]
    : resolvedSearchParams?.eligibilityVerificationId;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug);

  if (theme.kind !== "card") {
    notFound();
  }

  return (
    <ProgramBookingFlow
      theme={theme}
      screen="embed_handoff"
      basePath={`/${tenantSlug}/program/embed`}
      locale={locale}
      surface="embed"
      eligibilityVerificationId={eligibilityVerificationId ?? null}
    />
  );
}
