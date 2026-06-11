import { getProgramThemeForSlug } from "@/lib/program-theme";
import { EmbedIdentityFlow, resolveEmbedState } from "@/lib/embed-states";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ host?: string | string[] }>;
};

// Default embed entry: the signed-in hand-off (B1) happy path. The entry is
// still host-resolved — an unauthorized origin is forced to the blocked
// `unsupported` (B3) state so the index route cannot bypass the host guard.
export default async function EmbedIdentityIndexPage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug } = await params;
  const { host } = await searchParams;
  const originHost = Array.isArray(host) ? host[0] : host;

  const theme = getProgramThemeForSlug(tenantSlug);
  const resolved = resolveEmbedState(theme, "handoff", originHost);

  return (
    <EmbedIdentityFlow
      theme={theme}
      state={resolved}
      basePath={`/${tenantSlug}`}
      originHost={resolved === "unsupported" ? originHost : undefined}
    />
  );
}
