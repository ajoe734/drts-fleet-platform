import { getProgramThemeForSlug } from "@/lib/program-theme";
import { EmbedIdentityFlow } from "@/lib/embed-states";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

// Default embed entry: the signed-in hand-off (B1) happy path.
export default async function EmbedIdentityIndexPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const theme = getProgramThemeForSlug(tenantSlug);
  return (
    <EmbedIdentityFlow
      theme={theme}
      state="handoff"
      basePath={`/${tenantSlug}`}
    />
  );
}
