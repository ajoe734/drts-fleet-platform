import type { ExportTenantAuditCommand } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

function getStringEntry(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeActorScope(
  value: string | null,
): NonNullable<ExportTenantAuditCommand["actorScope"]> | null {
  switch (value) {
    case "tenant":
    case "ops":
    case "platform":
    case "system":
    case "partner":
      return value;
    default:
      return null;
  }
}

function buildAuditHref(formData: FormData, exportError?: string) {
  const params = new URLSearchParams();

  for (const key of [
    "actor",
    "module",
    "action",
    "from",
    "to",
    "auditId",
    "expanded",
  ]) {
    const value = getStringEntry(formData, key);
    if (value) {
      params.set(key, value);
    }
  }

  if (exportError) {
    params.set("exportError", exportError);
  }

  const query = params.toString();
  return query ? `/audit?${query}` : "/audit";
}

function buildExportCommand(formData: FormData): ExportTenantAuditCommand {
  return {
    actorScope: normalizeActorScope(getStringEntry(formData, "actor")),
    moduleName: getStringEntry(formData, "module"),
    actionName: getStringEntry(formData, "action"),
    from: getStringEntry(formData, "from"),
    to: getStringEntry(formData, "to"),
    auditId: getStringEntry(formData, "auditId"),
  };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const client = getTenantClient();

  try {
    const download = await client.exportTenantAudit(
      buildExportCommand(formData),
    );
    if (!download.downloadUrl) {
      return Response.redirect(
        new URL(
          buildAuditHref(
            formData,
            "Signed export did not return a download URL.",
          ),
          request.url,
        ),
        303,
      );
    }

    return Response.redirect(download.downloadUrl, 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.redirect(
      new URL(buildAuditHref(formData, message), request.url),
      303,
    );
  }
}
