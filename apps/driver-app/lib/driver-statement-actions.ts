import type { DriverStatementRecord } from "@drts/contracts";

type DriverStatementReader = {
  get<T>(path: string): Promise<T>;
  getList<T>(path: string): Promise<T[]>;
};

/** The driver's earnings read surface uses the existing driver session scope.
 * The legacy operational SDK routes remain available to their own callers. */
export function listDriverEarningsStatements(
  client: Pick<DriverStatementReader, "getList">,
  periodMonth?: string,
): Promise<DriverStatementRecord[]> {
  const query = periodMonth
    ? `?periodMonth=${encodeURIComponent(periodMonth)}`
    : "";
  return client.getList<DriverStatementRecord>(
    `/api/driver/profile/statements${query}`,
  );
}

export function getDriverEarningsStatement(
  client: Pick<DriverStatementReader, "get">,
  statementId: string,
): Promise<DriverStatementRecord> {
  return client.get<DriverStatementRecord>(
    `/api/driver/profile/statements/${encodeURIComponent(statementId)}`,
  );
}

export type DriverStatementDownload =
  | { state: "ready"; url: string }
  | { state: "missing" | "expired" | "unavailable"; url: null };

/** Use the current server-issued artifact; the server refreshes signed links
 * on statement reads. This does not generate a receipt or download result. */
export function resolveDriverStatementDownload(
  statement: Pick<
    DriverStatementRecord,
    "artifactUrl" | "artifactDownloadMetadata"
  >,
  now = Date.now(),
): DriverStatementDownload {
  const metadata = statement.artifactDownloadMetadata;
  const url = metadata?.downloadUrl?.trim() || statement.artifactUrl?.trim();
  if (!url) return { state: "missing", url: null };
  if (metadata?.expiresAt) {
    const expiry = Date.parse(metadata.expiresAt);
    if (!Number.isFinite(expiry)) return { state: "unavailable", url: null };
    if (expiry <= now) return { state: "expired", url: null };
  }
  return { state: "ready", url };
}
