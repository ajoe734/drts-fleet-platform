"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiClientError } from "@drts/api-client";
import type {
  GenerateTenantInvoiceCommand,
  TenantBillingProfile,
  UpdateTenantBillingProfileCommand,
} from "@drts/contracts";
import {
  createTenantBearerClientFromSession,
  getTenantClient,
  getTenantSession,
} from "../../lib/api-client";
import { TENANT_LOGIN_PATH } from "../../lib/auth/constants";
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

export type InvoiceGenerationResult =
  | { ok: true; message: string; invoiceId: string; href: string }
  | { ok: false; message: string };

function tenantPeriodInput(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  // Tenant billing uses Asia/Taipei. Interpret this wall-clock control with
  // its explicit offset, then send canonical UTC to the existing API. Neither
  // the browser's nor the server's ambient timezone determines the period.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(input))
    return null;
  const time = Date.parse(`${input}+08:00`);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export async function generateInvoiceFromBilling(
  formData: FormData,
): Promise<InvoiceGenerationResult> {
  const locale = await getServerLocale();
  const session = await getTenantSession();
  if (!session) redirect(TENANT_LOGIN_PATH);
  const periodStart = tenantPeriodInput(formData.get("periodStart"));
  const periodEnd = tenantPeriodInput(formData.get("periodEnd"));
  if (!periodStart || !periodEnd) {
    return { ok: false, message: t("billing.generate.required", locale) };
  }
  const command: GenerateTenantInvoiceCommand = {
    tenantId: session.tenantId,
    periodStart,
    periodEnd,
  };
  const client = createTenantBearerClientFromSession(session);
  try {
    // generateInvoice intentionally returns unknown in the existing SDK.
    const issued = await client.generateInvoice(command);
    if (
      !issued ||
      typeof issued !== "object" ||
      !("invoiceId" in issued) ||
      typeof issued.invoiceId !== "string" ||
      !issued.invoiceId.trim()
    ) {
      return { ok: false, message: t("billing.generate.unconfirmed", locale) };
    }
    revalidatePath("/billing");
    revalidatePath("/invoices");
    return {
      ok: true,
      invoiceId: issued.invoiceId,
      href: `/invoices?invoiceId=${encodeURIComponent(issued.invoiceId)}`,
      message: t("billing.generate.created", locale),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ApiClientError
          ? `${t("billing.generate.failed", locale)} ${error.apiMessage}`
          : t("billing.generate.failed", locale),
    };
  }
}
