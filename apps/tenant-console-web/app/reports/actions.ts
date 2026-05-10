"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  REPORT_OUTPUT_FORMATS,
  type ReportOutputFormat,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

const REPORT_KIND_OPTIONS = [
  "monthly_trip_report",
  "revenue_summary",
  "trip_summary",
] as const;

function isReportKind(
  value: string,
): value is (typeof REPORT_KIND_OPTIONS)[number] {
  return REPORT_KIND_OPTIONS.includes(
    value as (typeof REPORT_KIND_OPTIONS)[number],
  );
}

function isReportFormat(value: string): value is ReportOutputFormat {
  return REPORT_OUTPUT_FORMATS.includes(value as ReportOutputFormat);
}

function readTrimmedString(
  formData: FormData,
  key: string,
): string | undefined {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string") {
    return undefined;
  }

  const normalizedValue = rawValue.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function toUtcRangeBoundary(
  value: string | undefined,
  edge: "start" | "end",
): string | undefined {
  if (!value) {
    return undefined;
  }

  const suffix = edge === "start" ? "T00:00:00Z" : "T23:59:59Z";
  return `${value}${suffix}`;
}

export async function createTenantReportJobAction(formData: FormData) {
  const rawJobType = formData.get("jobType");
  const rawFormat = formData.get("format");

  const jobType = typeof rawJobType === "string" ? rawJobType : "";
  const format = typeof rawFormat === "string" ? rawFormat : "";
  const from = toUtcRangeBoundary(readTrimmedString(formData, "from"), "start");
  const to = toUtcRangeBoundary(readTrimmedString(formData, "to"), "end");
  const costCenter = readTrimmedString(formData, "cost_center");
  const filters = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(costCenter ? { cost_center: costCenter } : {}),
  };

  if (!isReportKind(jobType)) {
    redirect("/reports?error=Unsupported%20report%20kind.");
  }

  if (!isReportFormat(format)) {
    redirect("/reports?error=Unsupported%20report%20format.");
  }

  try {
    const client = getTenantClient();
    const accepted = await client.createTenantReportJob({
      jobType,
      format,
      filters,
    });

    revalidatePath("/reports");
    redirect(`/reports?created=${encodeURIComponent(accepted.jobId)}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create report job.";
    redirect(`/reports?error=${encodeURIComponent(message)}`);
  }
}
