import { notFound } from "next/navigation";
import { getProgramThemeForSlug } from "@/lib/program-theme";
import {
  EmbedIdentityFlow,
  resolveEmbedState,
  resolveEmbedStateSegment,
} from "@/lib/embed-states";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string; state: string }>;
  searchParams: Promise<{ host?: string | string[] }>;
};

export default async function EmbedIdentityStatePage({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug, state } = await params;
  const requested = resolveEmbedStateSegment(state);
  if (!requested) {
    notFound();
  }

  const { host } = await searchParams;
  const originHost = Array.isArray(host) ? host[0] : host;

  const theme = getProgramThemeForSlug(tenantSlug);
  // Host-resolved entry: an unauthorized origin is forced to the blocked state.
  const resolved = resolveEmbedState(theme, requested, originHost);

  return (
    <EmbedIdentityFlow
      theme={theme}
      state={resolved}
      basePath={`/${tenantSlug}`}
      originHost={resolved === "unsupported" ? originHost : undefined}
    />
  );
}
