"use server";

import type { TenantInvoiceMailView } from "@drts/contracts";
import { ApiClientError } from "@drts/api-client";
import { getTenantClient } from "@/lib/api-client";

export type InvoiceMailActionResult =
  | { ok: true; view: TenantInvoiceMailView }
  | { ok: false; definitive?: boolean };

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
  operationKey: string,
): Promise<InvoiceMailActionResult> {
  const client = await getTenantClient();
  try {
    return {
      ok: true,
      view: await client.sendInvoiceMail(invoiceId, operationKey),
    };
  } catch (error) {
    return {
      ok: false,
      definitive:
        error instanceof ApiClientError &&
        [400, 401, 403, 404, 409].includes(error.statusCode),
    };
  }
}
