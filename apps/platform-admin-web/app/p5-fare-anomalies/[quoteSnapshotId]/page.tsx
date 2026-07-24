import { FareAnomalyDetailScreen } from "../fare-anomaly-screen";

export default async function FareAnomalyDetailPage({
  params,
}: {
  params: Promise<{ quoteSnapshotId: string }>;
}) {
  const { quoteSnapshotId } = await params;
  return <FareAnomalyDetailScreen quoteSnapshotId={quoteSnapshotId} />;
}
