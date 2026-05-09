"use server";

import { redirect } from "next/navigation";
import {
  createTenantPortalSession,
  TENANT_PORTAL_LOGIN_PATH,
} from "@/lib/api-client";

function fail(message: string) {
  redirect(`${TENANT_PORTAL_LOGIN_PATH}?error=${encodeURIComponent(message)}`);
}

export async function signInTenantPortal(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const tenantId = String(formData.get("tenantId") ?? "").trim();

  if (!email) {
    fail("Email is required.");
  }

  try {
    await createTenantPortalSession({
      email,
      ...(tenantId ? { tenantId } : {}),
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Tenant sign-in failed.");
  }

  redirect("/");
}
