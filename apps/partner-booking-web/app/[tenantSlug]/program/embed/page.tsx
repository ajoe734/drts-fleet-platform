import { notFound } from "next/navigation";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import { ProgramBookingFlow } from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    eligibilityVerificationId?: string | string[];
  }>;
};

function readFirst(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProgramEmbedFlowPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug, {
    requireActiveEntry: true,
  });
  const eligibilityVerificationId = readFirst(
    resolvedSearchParams.eligibilityVerificationId,
  );
  const persistentQuery = eligibilityVerificationId
    ? new URLSearchParams({ eligibilityVerificationId }).toString()
    : null;

  if (theme.kind !== "card") {
    notFound();
  }

  return (
    <ProgramBookingFlow
      theme={theme}
      screen="embed_handoff"
      basePath={`/${tenantSlug}/program/embed`}
      locale={locale}
      {...(persistentQuery ? { persistentQuery } : {})}
      surface="embed"
    />
  );
}
