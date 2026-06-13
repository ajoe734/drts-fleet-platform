import { notFound } from "next/navigation";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import { ProgramBookingFlow } from "@/lib/program-screens";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function ProgramEmbedFlowPage({ params }: PageProps) {
  const { tenantSlug } = await params;
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
    />
  );
}
