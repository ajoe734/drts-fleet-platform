"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient, DEMO_TENANT_ID } from "@/lib/api-client";

export type SlaFlashPayload = {
  tone: "default" | "warning";
  title: string;
  description: string;
};

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

function readPositiveInteger(formData: FormData, key: string): number {
  const rawValue = readTrimmedString(formData, key);
  if (!rawValue) {
    throw new Error(`${key} is required.`);
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer in minutes.`);
  }

  return parsed;
}

function readReason(formData: FormData): string {
  const reason = readTrimmedString(formData, "reason");
  if (!reason) {
    throw new Error("reason is required for this high-risk action.");
  }

  return reason;
}

export async function updateTenantSlaProfileAction(
  formData: FormData,
): Promise<SlaFlashPayload> {
  try {
    const waitThresholdMin = readPositiveInteger(formData, "waitThresholdMin");
    const arrivalThresholdMin = readPositiveInteger(
      formData,
      "arrivalThresholdMin",
    );
    const completionThresholdMin = readPositiveInteger(
      formData,
      "completionThresholdMin",
    );
    const reason = readReason(formData);

    const client = getTenantClient();
    await client.updateSlaProfile({
      waitThresholdMin,
      arrivalThresholdMin,
      completionThresholdMin,
    });

    revalidatePath("/sla");

    return {
      tone: "default",
      title: "SLA profile updated",
      description: `${DEMO_TENANT_ID} threshold change was saved. Reason recorded for follow-up: ${reason}`,
    };
  } catch (error) {
    return {
      tone: "warning",
      title: "SLA profile could not be updated",
      description:
        error instanceof Error ? error.message : "Unknown SLA update error.",
    };
  }
}

export async function recalculateTenantSlaBookingsAction(
  formData: FormData,
): Promise<SlaFlashPayload> {
  try {
    readReason(formData);
    return {
      tone: "warning",
      title: "Recalculate command unavailable",
      description:
        "Current tenant API contract does not expose a recalculate-existing-bookings command yet. The CTA is rendered with its authority metadata, but execution stays blocked until backend parity lands.",
    };
  } catch (error) {
    return {
      tone: "warning",
      title: "Recalculate command unavailable",
      description:
        error instanceof Error
          ? error.message
          : "Unknown recalculate command error.",
    };
  }
}
