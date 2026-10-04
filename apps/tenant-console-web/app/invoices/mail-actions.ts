"use server";

import type { TenantInvoiceMailView } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

export type InvoiceMailActionResult =
  | { ok: true; view: TenantInvoiceMailView }
  | { ok: false };

export async function readInvoiceMail(
  invoiceId: string,
): Promise<InvoiceMailActionResult> {
  const client = await getTenantClient();
  try {
    return { ok: true, view: await client.getInvoiceMail(invoiceId) };
  } catch {
    return { ok: false };
  }
}

export async function sendInvoiceMail(
  invoiceId: string,
): Promise<InvoiceMailActionResult> {
  const client = await getTenantClient();
  try {
    return { ok: true, view: await client.sendInvoiceMail(invoiceId) };
  } catch {
    return { ok: false };
  }
}
