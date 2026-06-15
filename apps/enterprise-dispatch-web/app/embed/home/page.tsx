import { EmbedHome } from "@/components/ent-embed-screens";
import { getServerLocale } from "@/lib/server-locale";

export default async function EmbedHomePage() {
  const locale = await getServerLocale();
  return <EmbedHome locale={locale} />;
}
