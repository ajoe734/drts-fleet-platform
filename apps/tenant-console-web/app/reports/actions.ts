"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  REPORT_OUTPUT_FORMATS,
  type CreateReportJobCommand,
  type ReportOutputFormat,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

const REPORTS_PATH = "/reports";

function getFieldValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeReturnTo(raw: string) {
  if (!raw.startsWith(REPORTS_PATH)) {
    return REPORTS_PATH;
  }

  try {
    const url = new URL(raw, "http://localhost");
    if (url.pathname !== REPORTS_PATH) {
      return REPORTS_PATH;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return REPORTS_PATH;
  }
}

function redirectWithFlash(
  returnTo: string,
  params: Record<string, string | undefined>,
) {
  const url = new URL(sanitizeReturnTo(returnTo), "http://localhost");
  url.searchParams.delete("flash");
  url.searchParams.delete("flashMessage");
  url.searchParams.delete("flashJobId");

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function normalizeOutputFormat(value: string): ReportOutputFormat {
  if (
    REPORT_OUTPUT_FORMATS.includes(
      value as (typeof REPORT_OUTPUT_FORMATS)[number],
    )
  ) {
    return value as ReportOutputFormat;
  }

  return "csv";
}

function buildCreateFilters(formData: FormData) {
  const filters: Record<string, unknown> = {};
  const period = getFieldValue(formData, "period");
  const scope = getFieldValue(formData, "scope");
  const scopeValue = getFieldValue(formData, "scopeValue");

  if (period) {
    filters.period = period;
  }

  if (scope === "cost_center" && scopeValue) {
    filters.costCenterCode = scopeValue;
  }

  if (scope === "passenger" && scopeValue) {
    filters.passengerId = scopeValue;
  }

  return filters;
}

function parseFiltersJson(value: string) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 180)
    : "Unable to complete report action.";
}

async function submitReportJob(
  command: CreateReportJobCommand,
  returnTo: string,
  flash: "created" | "rerun",
) {
  try {
    const client = getTenantClient();
    const accepted = await client.createTenantReportJob(command);
    revalidatePath(REPORTS_PATH);
    redirectWithFlash(returnTo, {
      flash,
      flashJobId: accepted.jobId,
    });
  } catch (error) {
    redirectWithFlash(returnTo, {
      flash: "error",
      flashMessage: toErrorMessage(error),
    });
  }
}

export async function createReportJobAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(getFieldValue(formData, "returnTo"));
  const jobType = getFieldValue(formData, "jobType") || "monthly_trip_report";
  const format = normalizeOutputFormat(getFieldValue(formData, "format"));
  const filters = buildCreateFilters(formData);

  await submitReportJob(
    {
      jobType,
      format,
      ...(Object.keys(filters).length > 0 ? { filters } : {}),
    },
    returnTo,
    "created",
  );
}

export async function rerunReportJobAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(getFieldValue(formData, "returnTo"));
  const jobType = getFieldValue(formData, "jobType") || "monthly_trip_report";
  const format = normalizeOutputFormat(getFieldValue(formData, "format"));
  const filters = parseFiltersJson(getFieldValue(formData, "filtersJson"));

  await submitReportJob(
    {
      jobType,
      format,
      ...(filters ? { filters } : {}),
    },
    returnTo,
    "rerun",
  );
}

export async function refreshReportsAction(formData: FormData) {
  revalidatePath(REPORTS_PATH);
  redirectWithFlash(sanitizeReturnTo(getFieldValue(formData, "returnTo")), {
    flash: "refreshed",
  });
}
