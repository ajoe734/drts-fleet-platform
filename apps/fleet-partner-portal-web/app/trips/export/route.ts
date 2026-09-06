import { NextRequest, NextResponse } from "next/server";
import {
  loadDashboard,
  loadTrips,
} from "../../../lib/fleet-portal-data.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const exportType = searchParams.get("type");
  const period = searchParams.get("period") || undefined;
  const svcFilter = searchParams.get("svc") || undefined;
  const statusFilter = searchParams.get("status") || undefined;

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
        ["Metric", "Value", "Period", "Timestamp"].join(","),
        [
          "Active Drivers",
          dashboard.driverCount,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].join(","),
        [
          "Online Drivers",
          dashboard.driverStatusSummary.online,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].join(","),
        [
          "Offline Drivers",
          dashboard.driverStatusSummary.offline,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].join(","),
        [
          "Dispatchable Drivers",
          dashboard.dispatchable,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].join(","),
        [
          "Completed Trips",
          dashboard.completedTrips,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].join(","),
        [
          `"Fleet Share"`,
          `"${dashboard.share}"`,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].join(","),
        [
          `"Gross Revenue"`,
          `"${dashboard.grossRevenue}"`,
          dashboard.periodMonth,
          dashboard.dataTimestamp,
        ].join(","),
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
      ].join(","),
      ...filteredRows.map((t) =>
        [
          t.id,
          t.svc,
          `"${(t.driver || "").replace(/"/g, '""')}"`,
          `"${(t.tenant || "").replace(/"/g, '""')}"`,
          `"${(t.pickup || "").replace(/"/g, '""')}"`,
          `"${(t.fare || "").replace(/"/g, '""')}"`,
          `"${(t.commission || "").replace(/"/g, '""')}"`,
          `"${(t.reimbursement || "").replace(/"/g, '""')}"`,
          t.status,
          `"${t.date}"`,
        ].join(","),
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
