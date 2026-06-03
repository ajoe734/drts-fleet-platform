import { notFound } from "next/navigation";
import type {
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { ComplaintDetailClient } from "./complaint-detail-client";

type ComplaintCaseUiRecord = ComplaintCaseRecord & {
  slaStatus?: "within_sla" | "warning" | "breached";
  slaBreachedAt?: string | null;
};

type ComplaintDetailPageProps = {
  params: Promise<{
    caseNo: string;
  }>;
};

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

export default async function ComplaintDetailPage({
  params,
}: ComplaintDetailPageProps) {
  const [{ caseNo }, locale, client] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const complaint = await resolveOrFallback(
    () => client.getComplaint(caseNo) as Promise<ComplaintCaseUiRecord | null>,
    null,
  );

  if (!complaint) {
    notFound();
  }

  const [timeline, exportView] = await Promise.all([
    resolveOrFallback(
      () => client.getComplaintTimeline(caseNo),
      [] as ComplaintTimelineEntry[],
    ),
    resolveOrFallback(
      () => client.getComplaintExportView(caseNo),
      null as ComplaintExportViewRecord | null,
    ),
  ]);

  return (
    <ComplaintDetailClient
      locale={locale}
      initialComplaint={complaint}
      initialTimeline={timeline}
      initialExportView={exportView}
    />
  );
}
