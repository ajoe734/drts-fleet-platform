import type { AuditLogRecord } from "@drts/contracts";

export function downloadAuditCsv(records: AuditLogRecord[]): void {
  const rows = [
    [
      "AuditId",
      "CreatedAt",
      "ActorType",
      "ActorId",
      "Module",
      "Action",
      "ResourceType",
      "ResourceId",
      "RequestId",
    ],
    ...records.map((record) => [
      record.auditId,
      record.createdAt,
      record.actorType,
      record.actorId,
      record.moduleName,
      record.actionName,
      record.resourceType,
      record.resourceId,
      record.requestId,
    ]),
  ];
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Release the local handle after the browser has consumed the click.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
