import { EmbedDetail } from "@/components/ent-embed-screens";
import { getServerLocale } from "@/lib/server-locale";

export default async function EmbedDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const locale = await getServerLocale();
  return <EmbedDetail locale={locale} bookingId={bookingId} />;
}
