"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";

export async function revokeTenantSessionAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const client = await getTenantClient();
  await client.revokeTenantSession(sessionId, {
    reason: reason || "tenant_admin_revocation",
  });
  revalidatePath("/sessions");
}
