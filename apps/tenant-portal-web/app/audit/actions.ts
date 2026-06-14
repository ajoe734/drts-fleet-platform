"use server";

import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { AuditLogRecord } from "@drts/contracts";

export async function getAuditLogs(): Promise<{
  logs: AuditLogRecord[];
  error: string | null;
}> {
  const locale = await getServerLocale();
  const client = await getTenantClient();
  try {
    const logs = (await client.listTenantAuditLogs()) as AuditLogRecord[];
    return { logs, error: null };
  } catch (e) {
    return {
      logs: [],
      error: e instanceof Error ? e.message : t("audit.error.unknown", locale),
    };
  }
}
