"use server";

import { redirect } from "next/navigation";
import {
  createTenantPortalSession,
  TENANT_PORTAL_LOGIN_PATH,
} from "@/lib/api-client";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";

function fail(message: string) {
  redirect(`${TENANT_PORTAL_LOGIN_PATH}?error=${encodeURIComponent(message)}`);
}

export async function signInTenantPortal(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const tenantId = String(formData.get("tenantId") ?? "").trim();

  if (!email) {
    fail("電子郵件為必填。");
  }

  try {
    await createTenantPortalSession({
      email,
      ...(tenantId ? { tenantId } : {}),
    });
  } catch (error) {
    fail(
      formatPortalUiError(
        toPortalErrorMessage(error, "租戶登入失敗。"),
        "登入失敗",
      ),
    );
  }

  redirect("/");
}
