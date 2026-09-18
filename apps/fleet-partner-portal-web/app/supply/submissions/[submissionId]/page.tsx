import { notFound } from "next/navigation";
import { SupplySubmissionDetailView } from "@/components/fleet-supply-workspace";
import { loadSupplySubmissionDetail } from "@/lib/fleet-portal-supply.server";

export const dynamic = "force-dynamic";

export default async function FleetSupplySubmissionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const result = await loadSupplySubmissionDetail(submissionId);

  if (!result) {
    notFound();
  }

  return (
    <SupplySubmissionDetailView
      initialDetail={result.detail}
      source={result.source}
    />
  );
}
