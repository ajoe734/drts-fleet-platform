import { NextRequest, NextResponse } from "next/server";
import {
  loadDashboard,
  loadTrips,
} from "../../../lib/fleet-portal-data.server";

export const dynamic = "force-dynamic";

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '\"\"')}"` : value;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const exportType = searchParams.get("type");
  const period = searchParams.get("period") || undefined;
  const svcFilter = searchParams.get("svc") || undefined;
  const statusFilter = searchParams.get("status") || undefined;
  const qFilter = searchParams.get("q")?.toLowerCase() || undefined;

  if (exportType === "summary" || exportType === "overview") {
    try {
      const dashboard = await loadDashboard(period);
      if (dashboard.error) {
        return NextResponse.json(
          { ok: false, error: { message: dashboard.error } },
          { status: 500 },
        );
      }
      const csvRows = [
        ["Metric", "Value", "Period", "Timestamp"].map(csvCell).join(","),
        [
          "Active Drivers",
          dashboard.driverCount,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].map(csvCell).join(","),
        [
          "Online Drivers",
          dashboard.driverStatusSummary.online,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].map(csvCell).join(","),
        [
          "Offline Drivers",
          dashboard.driverStatusSummary.offline,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].map(csvCell).join(","),
        [
          "Dispatchable Drivers",
          dashboard.dispatchable,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].map(csvCell).join(","),
        [
          "Completed Trips",
          dashboard.completedTrips,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].map(csvCell).join(","),
        [
          "Fleet Share",
          dashboard.share,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].map(csvCell).join(","),
        [
          "Gross Revenue",
          dashboard.grossRevenue,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].map(csvCell).join(","),
      ];

      return new NextResponse(csvRows.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="fleet-overview-${dashboard.periodMonth}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Overview export failed";
      return NextResponse.json(
        { ok: false, error: { message } },
        { status: 500 },
      );
    }
  }

  // Default: trips list export with exact matching filters
  try {
    const { rows, error } = await loadTrips(period);
    if (error) {
      return NextResponse.json(
        { ok: false, error: { message: error } },
        { status: 500 },
      );
    }
    const filteredRows = rows.filter((r) => {
      if (svcFilter && svcFilter !== "all" && r.svc !== svcFilter) {
        return false;
      }
      if (statusFilter && statusFilter !== "all" && r.status !== statusFilter) {
        return false;
      }
      if (qFilter) {
        const match =
          r.id.toLowerCase().includes(qFilter) ||
          (r.driver || "").toLowerCase().includes(qFilter) ||
          (r.pickup || "").toLowerCase().includes(qFilter);
        if (!match) {
          return false;
        }
      }
      return true;
    });

    const csvRows = [
      [
        "TripID",
        "Service",
        "Driver",
        "Tenant",
        "PickupAddress",
        "GrossFare",
        "Commission",
        "Reimbursement",
        "Status",
        "CompletedAt",
      ].map(csvCell).join(","),
      ...filteredRows.map((t) =>
        [
          t.id,
          t.svc,
          t.driver || "",
          t.tenant || "",
          t.pickup || "",
          t.fare || "",
          t.commission || "",
          t.reimbursement || "",
          t.status,
          t.date,
        ].map(csvCell).join(","),
      ),
    ];

    const filename =
      svcFilter && svcFilter !== "all"
        ? `trips-${svcFilter}.csv`
        : "trips-all.csv";

    return new NextResponse(csvRows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trip export failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 500 },
    );
  }
}
