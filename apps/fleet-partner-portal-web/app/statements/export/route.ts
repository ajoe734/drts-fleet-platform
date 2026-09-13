import { NextRequest, NextResponse } from "next/server";
import {
  loadStatementDetail,
  loadStatements,
} from "../../../lib/fleet-portal-data.server";

// Mirrors the pattern already shipped in `app/trips/export/route.ts`: a real
// Route Handler that re-reads the same fleet-partner-scoped loaders the list
// and detail pages render from, so the downloaded file matches whatever the
// UI is currently showing (SR-FLEET-SETTLE-001 acceptance: 同一statement
// period/list/detail/download一致). There is no separate "generate export"
// backend call and no client-side fabricated content — this is a live export
// of the same authoritative statement records.

export const dynamic = "force-dynamic";

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return "";
  }
  const str = String(val);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export async function GET(request: NextRequest) {
  const statementId = request.nextUrl.searchParams.get("statementId") ?? undefined;

  if (statementId) {
    const { statement } = await loadStatementDetail(statementId);
    if (!statement) {
      // Same not-found/cross-fleet-denial rule as the detail page: an id
      // outside the caller's scoped statement list never resolves.
      return NextResponse.json(
        { ok: false, error: { message: "STATEMENT_NOT_FOUND" } },
        { status: 404 },
      );
    }
    const csv = toCsv([
      [
        "LineID",
        "Formula",
        "OrderID",
        "DriverID",
        "GrossEarning",
        "DriverNet",
        "FleetShare",
        "SponsorFunded",
        "CompletedAt",
      ],
      ...statement.lines.map((line) => [
        line.lineId,
        line.formula,
        line.orderId ?? "",
        line.driverId ?? "",
        line.grossEarning ?? "",
        line.driverNetAmount ?? "",
        line.shareAmount,
        line.sponsorFunded ? "yes" : "no",
        line.completedAt ?? "",
      ]),
    ]);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${statement.id}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const { rows } = await loadStatements();
  const csv = toCsv([
    ["StatementID", "Period", "Trips", "Payable", "Reimbursement", "Status", "Issued"],
    ...rows.map((row) => [
      row.id,
      row.period,
      String(row.trips),
      row.payable,
      row.reimbursement ?? "",
      row.status,
      row.issued,
    ]),
  ]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="statements.csv"',
      "Cache-Control": "no-store",
    },
  });
}
