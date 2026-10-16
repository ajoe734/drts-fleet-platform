import { NextResponse } from "next/server";
import { getServerOpsClient } from "../../../lib/api-client.server";
import {
  buildAttendanceCanonicalView,
  buildAttendanceExportCsv,
  resolveAttendanceFilters,
} from "../../../lib/ops-analytics";

export const dynamic = "force-dynamic";

function extractSearchParams(
  url: URL,
): Record<string, string | string[] | undefined> {
  const params: Record<string, string | string[] | undefined> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  return params;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "all";
}

function classifyExportError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "Failed to export canonical attendance records.";
  const normalized = message.toLowerCase();
  const statusProp =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;

  if (
    statusProp === 401 ||
    normalized.includes("401") ||
    normalized.includes("unauthenticated") ||
    normalized.includes("unauthorized")
  ) {
    return {
      status: 401,
      code: "unauthenticated",
      message,
    };
  }

  if (
    statusProp === 403 ||
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission_denied") ||
    normalized.includes("permission denied")
  ) {
    return {
      status: 403,
      code: "permission_denied",
      message,
    };
  }

  return {
    status: 502,
    code: "fetch_failed",
    message,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url, "http://localhost");
    const rawParams = extractSearchParams(url);
    const filters = resolveAttendanceFilters(rawParams);
    const client = await getServerOpsClient();
    const driverQuery =
      filters.driverId !== "all" ? filters.driverId : undefined;

    const [shifts, attendanceRecords, drivers] = await Promise.all([
      driverQuery ? client.listShifts(driverQuery) : client.listShifts(),
      driverQuery
        ? client.listAttendance(driverQuery)
        : client.listAttendance(),
      client.listDrivers(),
    ]);

    const canonicalView = buildAttendanceCanonicalView({
      shifts,
      attendanceRecords,
      drivers,
      filters,
      ok: true,
    });

    const csv = buildAttendanceExportCsv(canonicalView.filteredRows);
    const driverSuffix =
      filters.driverId !== "all"
        ? `-${sanitizeFilenamePart(filters.driverId)}`
        : "";
    const anomalySuffix =
      filters.anomaly !== "all"
        ? `-${sanitizeFilenamePart(filters.anomaly)}`
        : "";
    const filename = `attendance-${filters.view}-${filters.effectiveDate}${driverSuffix}${anomalySuffix}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-attendance-row-count": String(canonicalView.filteredRows.length),
      },
    });
  } catch (error) {
    const classified = classifyExportError(error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: classified.code,
          message: classified.message,
        },
      },
      {
        status: classified.status,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }
}
