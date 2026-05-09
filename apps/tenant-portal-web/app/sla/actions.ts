"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import type {
  UpdateTenantSlaProfileCommand,
  TenantSlaProfile,
} from "@drts/contracts";

export async function getSlaProfile(): Promise<{
  profile: TenantSlaProfile | null;
  error: string | null;
}> {
  const client = await getTenantClient();
  try {
    const profile = (await client.getSlaProfile()) as TenantSlaProfile;
    return { profile, error: null };
  } catch (e) {
    return {
      profile: null,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function updateSlaProfile(formData: FormData): Promise<void> {
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteSla,
    "Tenant SLA write authority required.",
  );
  const client = await getTenantClient();

  const waitThresholdMin = parseInt(
    formData.get("waitThresholdMin") as string,
    10,
  );
  const arrivalThresholdMin = parseInt(
    formData.get("arrivalThresholdMin") as string,
    10,
  );
  const completionThresholdMin = parseInt(
    formData.get("completionThresholdMin") as string,
    10,
  );

  const command: UpdateTenantSlaProfileCommand = {};
  if (!isNaN(waitThresholdMin)) {
    command.waitThresholdMin = waitThresholdMin;
  }
  if (!isNaN(arrivalThresholdMin)) {
    command.arrivalThresholdMin = arrivalThresholdMin;
  }
  if (!isNaN(completionThresholdMin)) {
    command.completionThresholdMin = completionThresholdMin;
  }

  await client.updateSlaProfile(command);
  revalidatePath("/sla");
}
