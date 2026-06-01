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

type ActionResult = {
  ok: boolean;
  message: string;
  receipt?: ActionReceipt | undefined;
};

function isActionReceipt(value: unknown): value is ActionReceipt {
  return Boolean(
    value &&
    typeof value === "object" &&
    "actionId" in value &&
    "auditId" in value &&
    "resourceId" in value &&
    "status" in value,
  );
}

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

export async function updateTenantSlaProfileAction(
  payload: UpdateSlaPayload,
): Promise<ActionResult> {
  const client = getTenantClient();

  const response = await client.updateSlaProfile({
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
  });

  const receipt = isActionReceipt(response) ? response : undefined;
  const responseMessage =
    response && typeof response === "object" && "message" in response
      ? String(response.message)
      : response && typeof response === "object" && "status" in response
        ? `SLA profile ${String(response.status)}.`
        : "SLA profile updated.";

  revalidatePath("/sla");
  revalidatePath("/settings");
  revalidatePath("/audit");

  return {
    ok: true,
    message: receipt?.message ?? responseMessage,
    ...(receipt ? { receipt } : {}),
  };
}

export async function recalculateTenantSlaBookingsAction(
  reason: string,
): Promise<ActionResult> {
  const client = getTenantClient();

  const receipt = (await client.recalculateSlaBookings({
    reason: normalizeReason(reason),
  })) as ActionReceipt;

  revalidatePath("/sla");
  revalidatePath("/audit");

  return {
    ok: true,
    message: receipt.message,
    receipt,
  };
}
