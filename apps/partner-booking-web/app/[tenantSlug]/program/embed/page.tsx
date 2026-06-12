import { notFound } from "next/navigation";
import { AirportTransferSite } from "@/components/airport-transfer-site";
import { getAirportBank } from "@/lib/airport-site-data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function ProgramEmbedFlowPage({ params }: PageProps) {
  const { tenantSlug } = await params;

  // The online-banking app embed is the same airport-transfer website rendered
  // inside the bank's app webview (per docs/05-ui/drts-design-canvas/bank-sites).
  const bank = getAirportBank(tenantSlug);
  if (!bank) {
    notFound();
  }

  return <AirportTransferSite bank={bank} mode="embed" />;
}
