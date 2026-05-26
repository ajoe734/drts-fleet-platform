import { NextResponse } from "next/server";
import { getServerOpsClient } from "@/lib/api-client.server";

type ComplaintArtifactRouteProps = {
  params: Promise<{
    caseNo: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: ComplaintArtifactRouteProps,
) {
  const [{ caseNo }, client] = await Promise.all([
    params,
    getServerOpsClient(),
  ]);

  const exportView = await client.getComplaintExportView(caseNo);
  const fileName = `complaint-${caseNo}-artifact.json`;

  return new NextResponse(JSON.stringify(exportView, null, 2), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
    },
  });
}
