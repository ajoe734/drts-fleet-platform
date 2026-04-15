"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";
import type {
  CreateReportJobCommand,
  ReportOutputFormat,
} from "@drts/contracts";

export async function createReportJob(formData: FormData): Promise<void> {
  const client = getTenantClient();

  const jobType =
    (formData.get("jobType") as string) || "dispatch_recording_index";
  const format = (formData.get("format") as ReportOutputFormat) || "csv";

  const command: CreateReportJobCommand = {
    jobType,
    format,
  };

  await client.createTenantReportJob(command);
  revalidatePath("/reports");
}

export async function refreshReports(): Promise<void> {
  revalidatePath("/reports");
}
