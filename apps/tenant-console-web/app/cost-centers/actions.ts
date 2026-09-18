"use server";

import { revalidatePath } from "next/cache";
import type { UpsertTenantCostCenterCommand } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
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
  const locale = await getServerLocale();
  const translate = (key: string, params?: Record<string, string | number>) =>
    t(key, locale, params);

  try {
    const mode = readTrimmedString(formData, "mode") ?? "create";
    const code = readTrimmedString(formData, "code");
    const name = readTrimmedString(formData, "name");

    if (!code) {
      throw new Error(translate("costCenters.flash.validation.codeRequired"));
    }
    if (!name) {
      throw new Error(translate("costCenters.flash.validation.nameRequired"));
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

    const client = await getTenantClient();
    const saved = await client.upsertCostCenter(command);
    payload = {
      tone: "default",
      title:
        mode === "reactivate"
          ? translate("costCenters.flash.reactivate.title")
          : mode === "update"
            ? translate("costCenters.flash.update.title")
            : translate("costCenters.flash.create.title"),
      description: translate("costCenters.flash.upsert.description", {
        code: saved.code,
        name: saved.name,
      }),
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: translate("costCenters.flash.upsert.failureTitle"),
      description:
        error instanceof Error
          ? error.message
          : translate("costCenters.flash.upsert.failureDescription"),
    };
  }

  revalidatePath("/cost-centers");
  return payload;
}

export async function disableCostCenterAction(
  formData: FormData,
): Promise<CostCenterFlashPayload> {
  let payload: CostCenterFlashPayload;
  const locale = await getServerLocale();
  const translate = (key: string, params?: Record<string, string | number>) =>
    t(key, locale, params);

  try {
    const code = readTrimmedString(formData, "code");
    const reason = readTrimmedString(formData, "reason");

    if (!code) {
      throw new Error(translate("costCenters.flash.validation.selectDisable"));
    }
    if (!reason) {
      throw new Error(translate("costCenters.flash.validation.reasonRequired"));
    }

    const client = await getTenantClient();
    const saved = await client.disableCostCenter({
      code,
      reason,
    });
    payload = {
      tone: "default",
      title: translate("costCenters.flash.disable.title"),
      description: translate("costCenters.flash.disable.description", {
        code: saved.code,
      }),
    };
  } catch (error) {
    payload = {
      tone: "warning",
      title: translate("costCenters.flash.disable.failureTitle"),
      description:
        error instanceof Error
          ? error.message
          : translate("costCenters.flash.disable.failureDescription"),
    };
  }

  revalidatePath("/cost-centers");
  return payload;
}
