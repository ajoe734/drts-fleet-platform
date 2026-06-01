"use server";

import type { ActionReceipt } from "@drts/contracts";
import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";
import {
  normalizeNonNegativeInteger,
  normalizeRequiredReason,
} from "./sla-action-validation";

type UpdateSlaPayload = {
  waitThresholdMin: number;
  arrivalThresholdMin: number;
  completionThresholdMin: number;
  reason: string;
};

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
      waitThresholdMin: normalizeNonNegativeInteger(
        payload.waitThresholdMin,
        "waitThresholdMin",
      ),
      arrivalThresholdMin: normalizeNonNegativeInteger(
        payload.arrivalThresholdMin,
        "arrivalThresholdMin",
      ),
      completionThresholdMin: normalizeNonNegativeInteger(
        payload.completionThresholdMin,
        "completionThresholdMin",
      ),
      reason: normalizeRequiredReason(payload.reason),
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
      reason: normalizeRequiredReason(reason),
    }),
    "recalculate_sla_bookings",
  );

  revalidatePath("/sla");
  revalidatePath("/audit");

  return receipt;
}
