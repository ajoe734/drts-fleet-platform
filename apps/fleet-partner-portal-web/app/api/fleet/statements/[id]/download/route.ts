// BFF route: GET /api/fleet/statements/[id]/download
//
// Fetches the fleet-partner statement list through the server-side client,
// locates the requested statement by ID and streams back a JSON export as a
// browser-downloadable attachment. The content-disposition header makes the
// browser prompt "Save as …" rather than rendering the JSON inline.
//
// Stage 1 does not expose a dedicated PDF/signed-URL generation endpoint for
// fleet-partner statements, so this BFF route is the statement download seam.
// When a signed PDF endpoint ships (Stage 1.5+) this route can be updated to
// redirect to the upstream URL without changing the client-side download link.

import { NextResponse } from "next/server";
import { getServerFleetPartnerClient } from "@/lib/api-client.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let client: Awaited<ReturnType<typeof getServerFleetPartnerClient>>["client"];
  try {
    ({ client } = await getServerFleetPartnerClient());
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  let records: Awaited<ReturnType<typeof client.listFleetPortalStatements>>;
  try {
    records = await client.listFleetPortalStatements();
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const statement = records.find((r) => r.statementId === id);
  if (!statement) {
    return NextResponse.json(
      { status: "not_found", error: `Statement ${id} not found` },
      { status: 404 },
    );
  }

  // Serialize the statement record as a JSON artifact.
  // The filename includes the statement ID and period so the partner can
  // identify the file without opening it.
  const filename = `statement-${statement.statementId}-${statement.periodMonth}.json`;
  const body = JSON.stringify(statement, null, 2);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
