/**
 * Shared API client hook for Platform Admin pages.
 * Creates a platform admin client and exposes helpers for common patterns.
 */

"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { createPlatformAdminClient, ApiClient } from "@drts/api-client";
import { getRuntimeApiBaseUrl } from "./runtime-config";

const ACTOR_ID = "platform-admin-web-bootstrap";

function createControlPlanePathTransform(baseUrl: string) {
  if (!baseUrl.startsWith("/control-plane-proxy")) {
    return undefined;
  }

  return (path: string) => path.replace(/^\/api(?=\/|$)/, "") || "/";
}

export function usePlatformAdminClient() {
  const apiBaseUrl = getRuntimeApiBaseUrl();
  const pathTransform = createControlPlanePathTransform(apiBaseUrl);
  const client = useMemo(
    () =>
      pathTransform
        ? createPlatformAdminClient(apiBaseUrl, ACTOR_ID, { pathTransform })
        : createPlatformAdminClient(apiBaseUrl, ACTOR_ID),
    [apiBaseUrl, pathTransform],
  );
  return client;
}

export function useAsyncData<T>(
  fetchFn: (client: ApiClient, signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
) {
  const client = usePlatformAdminClient();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const result = await fetchFn(client, controller.signal);
      setData(result);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client, ...deps]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function truncate(str: string, max = 20): string {
  if (!str) return "—";
  return str.length > max ? `${str.slice(0, max)}…` : str;
}
