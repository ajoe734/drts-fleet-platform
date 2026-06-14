"use server";

import { redirect } from "next/navigation";
import {
  createTenantPortalSession,
  TENANT_PORTAL_LOGIN_PATH,
} from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

function fail(message: string) {
  redirect(`${TENANT_PORTAL_LOGIN_PATH}?error=${encodeURIComponent(message)}`);
}

export async function signInTenantPortal(formData: FormData): Promise<void> {
  const locale = await getServerLocale();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const tenantId = String(formData.get("tenantId") ?? "").trim();

  if (!email) {
    fail(t("login.error.emailRequired", locale));
  }

  try {
    await createTenantPortalSession({
      email,
      ...(tenantId ? { tenantId } : {}),
    });
  } catch (error) {
    fail(
      error instanceof Error
        ? error.message
        : t("login.error.signInFailed", locale),
    );
  }

  redirect("/");
}
