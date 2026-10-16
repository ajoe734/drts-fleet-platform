"use client";
import { useCallback, useEffect, useRef } from "react";
import type { ApiClient } from "@drts/api-client";
import type { StepUpProof } from "@drts/contracts";
import type {
  FeatureFlag,
  PlatformNoticeRecord,
  CreatePlatformNoticeCommand,
} from "@drts/contracts";

export type NoticeSeverity = PlatformNoticeRecord["severity"] | "maintenance";
export type NoticeCommand = Omit<CreatePlatformNoticeCommand, "severity"> & {
  severity: NoticeSeverity;
  expiresAt: string | null;
  reason?: string;
  confirmed?: boolean;
};
export type NoticeRecord = Omit<PlatformNoticeRecord, "severity"> & {
  severity: NoticeSeverity;
  expiresAt: string | null;
  storageMode: "process_memory";
  downlistedReason: "expired" | "manual" | null;
  outcomes: {
    outcomeId: string;
    audience: string;
    state: string;
    notificationId: string | null;
    recipientId: string | null;
    readAt: string | null;
  }[];
};

/** Only the newest, still-mounted request may publish. Polls do not overlap. */
export function createCanonicalRefresh<T>(
  read: (signal: AbortSignal) => Promise<T>,
  publish: (value: T) => void,
  fail: (error: unknown) => void,
  settled: () => void = () => {},
) {
  let disposed = false;
  let generation = 0;
  let active: AbortController | null = null;
  async function refresh() {
    if (disposed) return;
    active?.abort();
    const request = new AbortController();
    active = request;
    const current = ++generation;
    try {
      const value = await read(request.signal);
      if (!disposed && !request.signal.aborted && generation === current)
        publish(value);
    } catch (error) {
      if (!disposed && !request.signal.aborted && generation === current)
        fail(error);
    } finally {
      if (!disposed && generation === current) {
        active = null;
        settled();
      }
    }
  }
  const timer = setInterval(() => {
    if (!active) void refresh();
  }, 30_000);
  return {
    refresh,
    dispose() {
      disposed = true;
      generation++;
      active?.abort();
      clearInterval(timer);
    },
  };
}

export function useCanonicalRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
  publish: (value: T) => void,
  fail: (error: unknown) => void,
  settled: () => void,
) {
  const callbacks = useRef({ publish, fail, settled });
  const observer = useRef<ReturnType<typeof createCanonicalRefresh<T>> | null>(
    null,
  );
  useEffect(() => {
    callbacks.current = { publish, fail, settled };
  });
  useEffect(() => {
    const current = createCanonicalRefresh(
      read,
      (v) => callbacks.current.publish(v),
      (e) => callbacks.current.fail(e),
      () => callbacks.current.settled(),
    );
    observer.current = current;
    void current.refresh();
    return () => {
      current.dispose();
      if (observer.current === current) observer.current = null;
    };
  }, [read]);
  return useCallback(async () => {
    await observer.current?.refresh();
  }, []);
}

export function localNoticeTime(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error("Invalid date / 日期無效");
  return parsed.toISOString();
}

export function requireFlagAck(
  row: FeatureFlag | undefined,
  key: string,
  enabled: boolean,
  tenantId?: string,
) {
  if (
    !row ||
    row.key !== key ||
    row.enabled !== enabled ||
    (row.tenantId ?? undefined) !== tenantId ||
    !row.updatedAt
  ) {
    throw new Error(
      "Feature flag write was not acknowledged / 旗標寫入未獲確認",
    );
  }
  return row;
}

export async function postNoticeFlagsWithStepUp<T>(
  client: Pick<ApiClient, "post">,
  path: string,
  body: unknown,
): Promise<T> {
  const proof = await client.post<StepUpProof>("/api/identity/step-up-proofs", {
    body: { method: "POST", path },
  });
  if (proof.required && !proof.stepUpReference)
    throw new Error("Step-up verification is required");
  return client.post<T>(path, {
    body,
    ...(proof.stepUpReference
      ? { headers: { "x-drts-step-up-reference": proof.stepUpReference } }
      : {}),
  });
}
