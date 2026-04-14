"use server";

import { getTenantClient } from "@/lib/api-client";
import type { AuditLogRecord } from "@drts/contracts";

export async function getAuditLogs(): Promise<{
  logs: AuditLogRecord[];
  error: string | null;
}> {
  const client = getTenantClient();
  try {
    const logs = (await client.listAuditLogs()) as AuditLogRecord[];
    return { logs, error: null };
  } catch (e) {
    return {
      logs: [],
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
