import { notFound } from "next/navigation";
import ComplaintDetailClientPage from "./complaint-detail-client";
import { getServerOpsClient } from "@/lib/api-client.server";

type ComplaintDetailPageProps = {
  params: Promise<{
    caseNo: string;
  }>;
  searchParams?: Promise<{
    emptyReason?: string;
  }>;
};

async function assertComplaintExists(caseNo: string) {
  try {
    const client = await getServerOpsClient();
    await client.getComplaint(caseNo);
  } catch (error) {
    if (error instanceof Error && /^API error 404:/.test(error.message)) {
      notFound();
    }
    throw error;
  }
}

export default async function ComplaintDetailPage({
  params,
  searchParams,
}: ComplaintDetailPageProps) {
  const [{ caseNo }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({
        emptyReason: undefined,
      }),
  ]);

  await assertComplaintExists(caseNo);

  return (
    <ComplaintDetailClientPage
      caseNo={caseNo}
      emptyReason={resolvedSearchParams.emptyReason}
    />
  );
}
