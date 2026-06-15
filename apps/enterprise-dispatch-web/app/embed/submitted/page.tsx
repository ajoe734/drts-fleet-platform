import { EmbedSubmitted } from "@/components/ent-embed-screens";
import { getServerLocale } from "@/lib/server-locale";

export default async function EmbedSubmittedPage() {
  const locale = await getServerLocale();
  return <EmbedSubmitted locale={locale} />;
}
