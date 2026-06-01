"use server";

import type { ActionReceipt } from "@drts/contracts";
import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";

type UpdateSlaPayload = {
  waitThresholdMin: number;
  arrivalThresholdMin: number;
  completionThresholdMin: number;
  reason: string;
};

function normalizePositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value;
}

function normalizeReason(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("reason is required.");
  }
  return normalized;
}

function isActionReceipt(value: unknown): value is ActionReceipt {
  return Boolean(
    value &&
    typeof value === "object" &&
    "actionId" in value &&
    "auditId" in value &&
    "resourceId" in value &&
    "resourceType" in value &&
    "status" in value &&
    "message" in value,
  );
}

function assertActionReceipt(
  value: unknown,
  operation: "update_sla_profile" | "recalculate_sla_bookings",
): ActionReceipt {
  if (!isActionReceipt(value)) {
    throw new Error(
      `Expected ActionReceipt from tenant SLA ${operation}, but received an incompatible response.`,
    );
  }
  return value;
}

export async function updateTenantSlaProfileAction(
  payload: UpdateSlaPayload,
): Promise<ActionReceipt> {
  const client = getTenantClient();

  const receipt = assertActionReceipt(
    await client.updateSlaProfile({
      waitThresholdMin: normalizePositiveInteger(
        payload.waitThresholdMin,
        "waitThresholdMin",
      ),
      arrivalThresholdMin: normalizePositiveInteger(
        payload.arrivalThresholdMin,
        "arrivalThresholdMin",
      ),
      completionThresholdMin: normalizePositiveInteger(
        payload.completionThresholdMin,
        "completionThresholdMin",
      ),
      reason: normalizeReason(payload.reason),
    }),
    "update_sla_profile",
  );

  revalidatePath("/sla");
  revalidatePath("/settings");
  revalidatePath("/audit");

  return receipt;
}

export async function recalculateTenantSlaBookingsAction(
  reason: string,
): Promise<ActionReceipt> {
  const client = getTenantClient();

  const receipt = assertActionReceipt(
    await client.recalculateSlaBookings({
      reason: normalizeReason(reason),
    }),
    "recalculate_sla_bookings",
  );

  revalidatePath("/sla");
  revalidatePath("/audit");

  return receipt;
}
