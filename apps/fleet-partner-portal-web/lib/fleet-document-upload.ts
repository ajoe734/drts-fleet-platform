export interface FleetDocumentUploadIntent {
  uploadUrl: string;
  method: string;
  headers: Record<string, string>;
}

export function fleetDocumentProxyPath(path: string) {
  if (!/^\/api\/fleet-partner\/(cases|supply-submissions)\//.test(path)) {
    throw new Error("無效的文件傳輸路徑");
  }
  return path.replace(/^\/api\//, "/control-plane-proxy/");
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        camelize(item),
      ]),
    );
  return value;
}

export async function fleetDocumentRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(fleetDocumentProxyPath(path), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const payload = camelize(await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || payload.data === undefined)
    throw new Error(
      payload.error?.message || `文件操作失敗 (${response.status})`,
    );
  return payload.data;
}

/** A confirmation is legal only after the PUT and server scan both succeed. */
export async function putFleetDocument(
  intent: FleetDocumentUploadIntent,
  file: File,
) {
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("檔案大小須介於 1 byte 與 10 MiB 之間");
  if (intent.method !== "PUT") throw new Error("無效的上傳方式");
  const response = await fetch(fleetDocumentProxyPath(intent.uploadUrl), {
    method: "PUT",
    headers: intent.headers,
    body: file,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error?.message || `檔案上傳或掃描失敗 (${response.status})`,
    );
  }
}
