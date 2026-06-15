import { EmbedReview } from "@/components/ent-embed-screens";
import { getServerLocale } from "@/lib/server-locale";

export default async function EmbedReviewPage() {
  const locale = await getServerLocale();
  return <EmbedReview locale={locale} />;
}
