"use server";

import { revalidatePath } from "next/cache";
import type { UpsertTenantCostCenterCommand } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import type { CostCenterFlashPayload } from "./constants";

function readTrimmedString(
  formData: FormData,
  key: string,
): string | undefined {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string") {
    return undefined;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readNullableString(
  formData: FormData,
  key: string,
): string | null | undefined {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string") {
    return undefined;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function upsertCostCenterAction(
  formData: FormData,
): Promise<CostCenterFlashPayload> {
  let payload: CostCenterFlashPayload;

  try {
    const mode = readTrimmedString(formData, "mode") ?? "create";
    const code = readTrimmedString(formData, "code");
    const name = readTrimmedString(formData, "name");

    if (!code) {
      throw new Error("成本中心代碼不可為空。");
    }
    if (!name) {
      throw new Error("成本中心名稱不可為空。");
    }

    const description = readNullableString(formData, "description");
    const ownerUserId = readNullableString(formData, "ownerUserId");
    const ownerName = readNullableString(formData, "ownerName");

    const command: UpsertTenantCostCenterCommand = {
      code,
      name,
      activeFlag: formData.get("activeFlag") === "on",
    };
    if (description !== undefined) {
      command.description = description;
    }
    if (ownerUserId !== undefined) {
      command.ownerUserId = ownerUserId;
    }
    if (ownerName !== undefined) {
      command.ownerName = ownerName;
    }

    const saved = await getTenantClient().upsertCostCenter(command);
    payload = {
      tone: "default",
      title:
        mode === "reactivate"
          ? "Cost center reactivated"
          : mode === "update"
            ? "Cost center updated"
            : "Cost center created",
      description: `${saved.code} · ${saved.name} 已同步到租戶成本中心目錄。`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Cost center could not be saved",
      description:
        error instanceof Error
          ? error.message
          : "Unable to save tenant cost center.",
    };
  }

  revalidatePath("/cost-centers");
  return payload;
}

export async function disableCostCenterAction(
  formData: FormData,
): Promise<CostCenterFlashPayload> {
  let payload: CostCenterFlashPayload;

  try {
    const code = readTrimmedString(formData, "code");
    const reason = readTrimmedString(formData, "reason");

    if (!code) {
      throw new Error("請先選擇要停用的成本中心。");
    }
    if (!reason) {
      throw new Error("停用成本中心需要填寫原因。");
    }

    const saved = await getTenantClient().disableCostCenter({
      code,
      reason,
    });
    payload = {
      tone: "default",
      title: "Cost center disabled",
      description: `${saved.code} 已停用，後續建立叫車時不再接受此成本中心。`,
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: "Cost center could not be disabled",
      description:
        error instanceof Error
          ? error.message
          : "Unable to disable tenant cost center.",
    };
  }

  revalidatePath("/cost-centers");
  return payload;
}
