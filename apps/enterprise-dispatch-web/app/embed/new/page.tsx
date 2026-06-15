import { EmbedNew } from "@/components/ent-embed-screens";
import { getServerLocale } from "@/lib/server-locale";

export default async function EmbedNewPage() {
  const locale = await getServerLocale();
  return <EmbedNew locale={locale} />;
}
