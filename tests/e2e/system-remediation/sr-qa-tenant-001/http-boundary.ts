import type { APIRequestContext } from "@playwright/test";

/** The canonical HTTP contract uses snake_case; SQL domain records use camelCase.
 * Decode only received keys. Values and missing fields remain untouched, and
 * unexpected camelCase wire keys fail rather than being silently accepted. */
export function decodeTenantWire<T>(wire: T): T {
  const decode = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(decode);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => {
          if (/[A-Z]/.test(key))
            throw new Error(`Noncanonical HTTP key: ${key}`);
          return [
            key.replace(/_([a-z])/g, (_match, letter: string) =>
              letter.toUpperCase(),
            ),
            decode(nested),
          ];
        }),
      );
    }
    return value;
  };
  return decode(wire) as T;
}

export function requiresTenantStepUp(method: string, apiPath: string): boolean {
  return (
    method === "POST" &&
    (/^tenant\/users(?:$|\/[^/]+\/role$)/.test(apiPath) ||
      /^tenant\/approval-requests\/[^/]+\/(?:approve|reject|escalate)$/.test(
        apiPath,
      ))
  );
}

/** Obtain an actual action/session-bound proof from the unmodified HTTP API. */
export async function tenantStepUpHeaders(options: {
  client: APIRequestContext;
  origin: string;
  token: string;
  tenant: string;
  method: string;
  apiPath: string;
  record?: (url: string, status: number, durationMs: number) => void;
}): Promise<Record<string, string>> {
  if (!requiresTenantStepUp(options.method, options.apiPath)) return {};
  const url = `${options.origin}/api/identity/step-up-proofs`;
  const started = Date.now();
  const response = await options.client.post(url, {
    headers: {
      Authorization: `Bearer ${options.token}`,
      "x-tenant-id": options.tenant,
    },
    data: { method: options.method, path: `/api/${options.apiPath}` },
    maxRedirects: 0,
  });
  options.record?.(url, response.status(), Date.now() - started);
  const envelope = decodeTenantWire(await response.json()) as {
    data?: { required: boolean; stepUpReference?: string };
    error?: { code?: string };
  };
  if (
    response.status() !== 201 ||
    !envelope.data?.required ||
    typeof envelope.data.stepUpReference !== "string"
  ) {
    throw new Error(
      `Real step-up proof failed: HTTP ${response.status()} code=${envelope.error?.code ?? "missing_proof"}`,
    );
  }
  return { "x-drts-step-up-reference": envelope.data.stepUpReference };
}
