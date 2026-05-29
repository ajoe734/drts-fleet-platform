"use server";

import { revalidatePath } from "next/cache";
import type { UpdateTenantSlaProfileCommand } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import type { SlaFlashPayload } from "./constants";

/**
 * Parse a threshold field as a positive integer count of minutes (Q-TEN07
 * fixes the unit at minutes). Returns the parsed value or throws with a
 * field-scoped message so the manager can surface it inline.
 */
function readThresholdMinutes(
  formData: FormData,
  key: string,
  label: string,
): number {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    throw new Error(`${label}不可空白。`);
  }

  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${label}必須是整數分鐘。`);
  }

  if (parsed <= 0) {
    throw new Error(`${label}必須大於 0 分鐘。`);
  }

  return parsed;
}

function readReason(formData: FormData): string {
  const rawValue = formData.get("reason");
  const reason = typeof rawValue === "string" ? rawValue.trim() : "";

  // Update SLA profile is high-risk per Q-X13 (affects all future bookings),
  // so Q-X09 requires a non-empty reason before the command is invoked.
  if (reason.length === 0) {
    throw new Error("變更 SLA 門檻屬高風險操作，請填寫變更原因。");
  }

  return reason;
}

export async function updateSlaProfileAction(
  formData: FormData,
): Promise<SlaFlashPayload> {
  let payload: SlaFlashPayload;

  try {
    const command: UpdateTenantSlaProfileCommand = {
      waitThresholdMin: readThresholdMinutes(
        formData,
        "waitThresholdMin",
        "等候門檻 (wait)",
      ),
      arrivalThresholdMin: readThresholdMinutes(
        formData,
        "arrivalThresholdMin",
        "抵達門檻 (arrival)",
      ),
      completionThresholdMin: readThresholdMinutes(
        formData,
        "completionThresholdMin",
        "完成門檻 (completion)",
      ),
    };

    // Reason is validated for presence (Q-X09 high-risk confirmation) even
    // though the current command contract does not yet persist it.
    readReason(formData);

    const client = getTenantClient();
    await client.updateSlaProfile(command);

    payload = {
      tone: "default",
      title: "SLA 門檻已更新",
      description:
        "新門檻已套用到新建立的訂單與之後計算的 SLA event。既有訂單保留建立時的 SLA snapshot。",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "無法更新 SLA profile。";
    payload = {
      tone: "warning",
      title: "SLA 門檻更新失敗",
      description: message,
    };
  }

  revalidatePath("/sla");
  return payload;
}
