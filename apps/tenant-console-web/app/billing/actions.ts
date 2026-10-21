"use server";

import { revalidatePath } from "next/cache";
import type {
  TenantBillingProfile,
  UpdateTenantBillingProfileCommand,
} from "@drts/contracts";
import { getTenantClient } from "../../lib/api-client";
import { getServerLocale } from "../../lib/server-locale";
import { t } from "../../lib/translations";

export type BillingProfileResult =
  | { ok: true; message: string; profile: TenantBillingProfile }
  | { ok: false; message: string };

export async function saveBillingProfile(
  formData: FormData,
): Promise<BillingProfileResult> {
  const locale = await getServerLocale();
  const client = await getTenantClient();
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const command: UpdateTenantBillingProfileCommand = {
    invoiceTitle: text("invoiceTitle"),
    taxId: text("taxId"),
    address: text("address"),
    contactName: text("contactName"),
    email: text("email"),
  };
  if (!command.invoiceTitle || !command.email) {
    return { ok: false, message: t("billing.form.required", locale) };
  }

  try {
    const profile = await client.post<TenantBillingProfile>(
      "/api/tenant/billing/profile",
      { body: command },
    );
    revalidatePath("/billing");
    revalidatePath("/settings");
    return { ok: true, profile, message: t("billing.form.saved", locale) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return {
      ok: false,
      message: `${t("billing.form.failed", locale)}${detail ? ` ${detail}` : ""}`,
    };
  }
}
